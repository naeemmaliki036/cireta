/**
 * Sale.sol — round-5 native unit tests.
 *
 * Covers:
 * - initialize() validation (caps, fee bps, sale window, total supply, issuer KYC)
 * - Two-step activation (approveSale + activate + unapproveSale)
 * - addPhase() validation (price, contribution range, top-up floor, time, sale window, overlap, allocation mode)
 * - extendPhase()
 * - buy() — basic, decimals math, top-up minimum for repeat buyers, last-chunk exception
 * - buyOTC() — payment-only refund tracking
 * - finalizeSale() — defer-finalize on hardcap, requires finalizationPending
 * - closeSale() — issuer/admin path, anyone after safety floor / inactivity
 * - Refund flow — activateRefunds, claimRefund, NotPaymentContributor for OTC
 * - setWhitelist locked once phase starts
 *
 * Uses MockIdentityRegistry (always-verified) so we can test contract logic
 * without setting up the full identity stack.
 */
import { expect } from "chai";
import { ethers, upgrades } from "hardhat";
import { time } from "@nomicfoundation/hardhat-network-helpers";

const SOFT_CAP = ethers.parseUnits("500", 6); // small for testing
const HARD_CAP = ethers.parseUnits("10_000".replace(/_/g, ""), 6);
const FEE_BPS = 250n; // 2.5%
const FEE_CAP = ethers.parseUnits("50000", 6);
const TOTAL_SUPPLY = ethers.parseUnits("100000", 6); // 100k tokens (6-dec test token)

// Phase params (raw 6-dec USDC)
const PRICE_RAW = ethers.parseUnits("1", 6); // 1 USDC per token (6-dec token)
const ALLOCATION = ethers.parseUnits("10000", 6); // 10k tokens
const MIN_C = ethers.parseUnits("10", 6);
const MAX_C = ethers.parseUnits("5000", 6);
const TOP_UP_MIN = ethers.parseUnits("1000", 6); // contract floor

const SALE_DURATION = 30 * 24 * 3600;

// AllocationMode enum: 0 = Fixed, 1 = Remaining
const FIXED = 0;
const REMAINING = 1;

// SaleStatus enum: 0=Draft 1=Active 2=Paused 3=FinalizedSuccess 4=FinalizedFailed 5=Rejected
const STATUS_DRAFT = 0;
const STATUS_ACTIVE = 1;
const STATUS_PAUSED = 2;
const STATUS_SUCCESS = 3;
const STATUS_FAILED = 4;

async function deployBaseSale(opts: {
  owner: any;
  issuer: any;
  feeManager: any;
  saleEndTime?: number; // 0 = open-ended; default = now + SALE_DURATION
  totalTokenSupply?: bigint;
  hardCap?: bigint;
}) {
  const { owner, issuer, feeManager } = opts;

  const ERC20 = await ethers.getContractFactory("MockERC20");
  const mockUsdc = await ERC20.deploy("Mock USDC", "USDC", 6);
  const mockToken = await ERC20.deploy("Test Token", "TST", 6); // 6-dec for math simplicity

  const MockIR = await ethers.getContractFactory("MockIdentityRegistry");
  const mockIR = await MockIR.deploy();

  const MSF = await ethers.getContractFactory("MockSaleFactory");
  const mockFactory = await MSF.deploy(owner.address);

  const now = await time.latest();
  const start = now + 60;
  const end = opts.saleEndTime === 0 ? 0 : (opts.saleEndTime ?? (now + SALE_DURATION));

  const SaleFactory = await ethers.getContractFactory("Sale");
  const sale = await upgrades.deployProxy(
    SaleFactory,
    [
      await mockToken.getAddress(),
      await mockUsdc.getAddress(),
      await mockIR.getAddress(),
      issuer.address,
      await mockFactory.getAddress(),
      feeManager.address,
      SOFT_CAP,
      opts.hardCap ?? HARD_CAP,
      FEE_BPS,
      FEE_CAP,
      ethers.ZeroAddress, // no OTC token by default
      start,
      end,
      opts.totalTokenSupply ?? TOTAL_SUPPLY,
    ],
    { unsafeAllow: ["constructor"] },
  );

  // Direct mode: deposit project tokens into the sale contract for activation
  await mockToken.mint(await sale.getAddress(), ethers.parseUnits("50000", 6));

  return { sale, mockUsdc, mockToken, mockIR, mockFactory, saleStart: start, saleEnd: end };
}

async function approveAndActivate(sale: any, owner: any, issuer: any) {
  await sale.connect(owner).approveSale();
  await sale.connect(issuer).activate();
}

describe("Sale.sol — round 5", () => {
  let owner: any, issuer: any, feeManager: any, investor1: any, investor2: any, otherAdmin: any;

  before(async () => {
    [owner, issuer, feeManager, investor1, investor2, otherAdmin] = await ethers.getSigners();
  });

  // ──────────────────────────────────────────────────────────────────────
  // 1. Initialize validation
  // ──────────────────────────────────────────────────────────────────────
  describe("initialize", () => {
    it("deploys with correct fields", async () => {
      const { sale, saleStart, saleEnd } = await deployBaseSale({ owner, issuer, feeManager });
      expect(await sale.softCap()).to.equal(SOFT_CAP);
      expect(await sale.hardCap()).to.equal(HARD_CAP);
      expect(await sale.feeBasisPoints()).to.equal(FEE_BPS);
      expect(await sale.saleStartTime()).to.equal(saleStart);
      expect(await sale.saleEndTime()).to.equal(saleEnd);
      expect(await sale.totalTokenSupply()).to.equal(TOTAL_SUPPLY);
      expect(await sale.openEnded()).to.be.false;
      expect(await sale.tokenDecimals()).to.equal(6);
      expect(await sale.status()).to.equal(STATUS_DRAFT);
      expect(await sale.approved()).to.be.false;
    });

    it("supports open-ended sales (saleEndTime = 0)", async () => {
      const { sale } = await deployBaseSale({ owner, issuer, feeManager, saleEndTime: 0 });
      expect(await sale.openEnded()).to.be.true;
      expect(await sale.saleEndTime()).to.equal(0);
    });

    it("reverts on InvalidCaps when softCap = 0", async () => {
      // Construct manually since deployBaseSale always uses valid caps
      const ERC20 = await ethers.getContractFactory("MockERC20");
      const mockUsdc = await ERC20.deploy("USDC", "USDC", 6);
      const mockToken = await ERC20.deploy("TST", "TST", 6);
      const MockIR = await ethers.getContractFactory("MockIdentityRegistry");
      const mockIR = await MockIR.deploy();
      const MSF = await ethers.getContractFactory("MockSaleFactory");
      const mockFactory = await MSF.deploy(owner.address);
      const now = await time.latest();

      const SaleFactory = await ethers.getContractFactory("Sale");
      await expect(
        upgrades.deployProxy(
          SaleFactory,
          [
            await mockToken.getAddress(), await mockUsdc.getAddress(), await mockIR.getAddress(),
            issuer.address, await mockFactory.getAddress(), feeManager.address,
            0n, HARD_CAP, FEE_BPS, FEE_CAP, ethers.ZeroAddress,
            now + 60, now + SALE_DURATION, TOTAL_SUPPLY,
          ],
          { unsafeAllow: ["constructor"] },
        ),
      ).to.be.reverted; // upgrades.deployProxy wraps the revert
    });

    it("reverts on InvalidFeeBps when fee > 1000 bps", async () => {
      const ERC20 = await ethers.getContractFactory("MockERC20");
      const mockUsdc = await ERC20.deploy("USDC", "USDC", 6);
      const mockToken = await ERC20.deploy("TST", "TST", 6);
      const MockIR = await ethers.getContractFactory("MockIdentityRegistry");
      const mockIR = await MockIR.deploy();
      const MSF = await ethers.getContractFactory("MockSaleFactory");
      const mockFactory = await MSF.deploy(owner.address);
      const now = await time.latest();

      const SaleFactory = await ethers.getContractFactory("Sale");
      await expect(
        upgrades.deployProxy(
          SaleFactory,
          [
            await mockToken.getAddress(), await mockUsdc.getAddress(), await mockIR.getAddress(),
            issuer.address, await mockFactory.getAddress(), feeManager.address,
            SOFT_CAP, HARD_CAP, 1001n, FEE_CAP, ethers.ZeroAddress,
            now + 60, now + SALE_DURATION, TOTAL_SUPPLY,
          ],
          { unsafeAllow: ["constructor"] },
        ),
      ).to.be.reverted;
    });

    it("reverts on ZeroTokenSupply", async () => {
      const ERC20 = await ethers.getContractFactory("MockERC20");
      const mockUsdc = await ERC20.deploy("USDC", "USDC", 6);
      const mockToken = await ERC20.deploy("TST", "TST", 6);
      const MockIR = await ethers.getContractFactory("MockIdentityRegistry");
      const mockIR = await MockIR.deploy();
      const MSF = await ethers.getContractFactory("MockSaleFactory");
      const mockFactory = await MSF.deploy(owner.address);
      const now = await time.latest();

      const SaleFactory = await ethers.getContractFactory("Sale");
      await expect(
        upgrades.deployProxy(
          SaleFactory,
          [
            await mockToken.getAddress(), await mockUsdc.getAddress(), await mockIR.getAddress(),
            issuer.address, await mockFactory.getAddress(), feeManager.address,
            SOFT_CAP, HARD_CAP, FEE_BPS, FEE_CAP, ethers.ZeroAddress,
            now + 60, now + SALE_DURATION, 0n,
          ],
          { unsafeAllow: ["constructor"] },
        ),
      ).to.be.reverted;
    });
  });

  // ──────────────────────────────────────────────────────────────────────
  // 2. Two-step activation
  // ──────────────────────────────────────────────────────────────────────
  describe("two-step activation", () => {
    it("admin approves, issuer activates", async () => {
      const { sale } = await deployBaseSale({ owner, issuer, feeManager });
      // Add at least one phase before activation
      const start = (await sale.saleStartTime()).valueOf() as bigint;
      await sale.connect(issuer).addPhase(
        "Phase 1", PRICE_RAW, ALLOCATION, MIN_C, MAX_C, TOP_UP_MIN,
        Number(start), Number(start) + 86400, false, FIXED,
      );

      expect(await sale.approved()).to.be.false;
      await sale.connect(owner).approveSale();
      expect(await sale.approved()).to.be.true;

      // Issuer activates
      await sale.connect(issuer).activate();
      expect(await sale.status()).to.equal(STATUS_ACTIVE);
    });

    it("activate() reverts when not approved", async () => {
      const { sale } = await deployBaseSale({ owner, issuer, feeManager });
      const start = await sale.saleStartTime();
      await sale.connect(issuer).addPhase(
        "P1", PRICE_RAW, ALLOCATION, MIN_C, MAX_C, TOP_UP_MIN,
        Number(start), Number(start) + 86400, false, FIXED,
      );
      await expect(sale.connect(issuer).activate())
        .to.be.revertedWithCustomError(sale, "NotApproved");
    });

    it("activate() reverts when called by non-issuer", async () => {
      const { sale } = await deployBaseSale({ owner, issuer, feeManager });
      const start = await sale.saleStartTime();
      await sale.connect(issuer).addPhase(
        "P1", PRICE_RAW, ALLOCATION, MIN_C, MAX_C, TOP_UP_MIN,
        Number(start), Number(start) + 86400, false, FIXED,
      );
      await sale.connect(owner).approveSale();
      await expect(sale.connect(owner).activate())
        .to.be.revertedWithCustomError(sale, "NotIssuer");
    });

    it("approveSale() reverts when called twice", async () => {
      const { sale } = await deployBaseSale({ owner, issuer, feeManager });
      await sale.connect(owner).approveSale();
      await expect(sale.connect(owner).approveSale())
        .to.be.revertedWithCustomError(sale, "AlreadyApproved");
    });

    it("unapproveSale() revokes admin approval before issuer activates", async () => {
      const { sale } = await deployBaseSale({ owner, issuer, feeManager });
      const start = await sale.saleStartTime();
      await sale.connect(issuer).addPhase(
        "P1", PRICE_RAW, ALLOCATION, MIN_C, MAX_C, TOP_UP_MIN,
        Number(start), Number(start) + 86400, false, FIXED,
      );
      await sale.connect(owner).approveSale();
      await sale.connect(owner).unapproveSale();
      expect(await sale.approved()).to.be.false;
      await expect(sale.connect(issuer).activate())
        .to.be.revertedWithCustomError(sale, "NotApproved");
    });

    it("approveSale() reverts when caller is not admin", async () => {
      const { sale } = await deployBaseSale({ owner, issuer, feeManager });
      await expect(sale.connect(issuer).approveSale())
        .to.be.revertedWithCustomError(sale, "NotAdmin");
    });
  });

  // ──────────────────────────────────────────────────────────────────────
  // 3. addPhase validation
  // ──────────────────────────────────────────────────────────────────────
  describe("addPhase", () => {
    let sale: any;
    let saleStart: number;
    let saleEnd: number;

    beforeEach(async () => {
      const fixture = await deployBaseSale({ owner, issuer, feeManager });
      sale = fixture.sale;
      saleStart = fixture.saleStart;
      saleEnd = fixture.saleEnd;
    });

    it("adds a valid phase", async () => {
      await expect(
        sale.connect(issuer).addPhase(
          "Phase 1", PRICE_RAW, ALLOCATION, MIN_C, MAX_C, TOP_UP_MIN,
          saleStart, saleStart + 86400, false, FIXED,
        ),
      ).to.emit(sale, "PhaseAdded");
      expect(await sale.getPhaseCount()).to.equal(1);
    });

    it("reverts ZeroPricePerToken", async () => {
      await expect(
        sale.connect(issuer).addPhase(
          "P", 0, ALLOCATION, MIN_C, MAX_C, TOP_UP_MIN,
          saleStart, saleStart + 86400, false, FIXED,
        ),
      ).to.be.revertedWithCustomError(sale, "ZeroPricePerToken");
    });

    it("reverts ZeroMinContribution", async () => {
      await expect(
        sale.connect(issuer).addPhase(
          "P", PRICE_RAW, ALLOCATION, 0, MAX_C, TOP_UP_MIN,
          saleStart, saleStart + 86400, false, FIXED,
        ),
      ).to.be.revertedWithCustomError(sale, "ZeroMinContribution");
    });

    it("reverts InvalidContributionRange (max < min)", async () => {
      await expect(
        sale.connect(issuer).addPhase(
          "P", PRICE_RAW, ALLOCATION, MAX_C, MIN_C, TOP_UP_MIN, // swapped
          saleStart, saleStart + 86400, false, FIXED,
        ),
      ).to.be.revertedWithCustomError(sale, "InvalidContributionRange");
    });

    it("reverts TopUpBelowFloor when topUpMin < 1000 USDC", async () => {
      await expect(
        sale.connect(issuer).addPhase(
          "P", PRICE_RAW, ALLOCATION, MIN_C, MAX_C, ethers.parseUnits("999", 6),
          saleStart, saleStart + 86400, false, FIXED,
        ),
      ).to.be.revertedWithCustomError(sale, "TopUpBelowFloor");
    });

    it("reverts InvalidPhaseTimeRange", async () => {
      await expect(
        sale.connect(issuer).addPhase(
          "P", PRICE_RAW, ALLOCATION, MIN_C, MAX_C, TOP_UP_MIN,
          saleStart + 86400, saleStart, false, FIXED, // start > end
        ),
      ).to.be.revertedWithCustomError(sale, "InvalidPhaseTimeRange");
    });

    it("reverts PhaseInPast (end in past)", async () => {
      // Construct a sale that started a while ago so we can pass an end time
      // before block.timestamp without tripping the start-time check first.
      const now = await time.latest();
      // Use a fresh sale where saleStart is in the past
      const ERC20 = await ethers.getContractFactory("MockERC20");
      const usdc2 = await ERC20.deploy("U", "U", 6);
      const tok2 = await ERC20.deploy("T", "T", 6);
      const MIR = await ethers.getContractFactory("MockIdentityRegistry");
      const ir2 = await MIR.deploy();
      const MSF = await ethers.getContractFactory("MockSaleFactory");
      const f2 = await MSF.deploy(owner.address);
      const SaleFactory = await ethers.getContractFactory("Sale");
      const sale2 = await upgrades.deployProxy(SaleFactory, [
        await tok2.getAddress(), await usdc2.getAddress(), await ir2.getAddress(),
        issuer.address, await f2.getAddress(), feeManager.address,
        SOFT_CAP, HARD_CAP, FEE_BPS, FEE_CAP, ethers.ZeroAddress,
        now + 60, now + SALE_DURATION, TOTAL_SUPPLY,
      ], { unsafeAllow: ["constructor"] });
      await tok2.mint(await sale2.getAddress(), ethers.parseUnits("50000", 6));

      // Move time forward inside the sale window
      await time.increaseTo(now + 200);
      // Now try to add a phase whose end is BEFORE block.timestamp but after saleStart
      const earliestStart = now + 60;
      const inPastEnd = now + 100;
      // both inside [saleStart, saleEnd] but end is in past
      await expect(
        sale2.connect(issuer).addPhase(
          "P", PRICE_RAW, ALLOCATION, MIN_C, MAX_C, TOP_UP_MIN,
          earliestStart, inPastEnd, false, FIXED,
        ),
      ).to.be.revertedWithCustomError(sale2, "PhaseInPast");
    });

    it("reverts PhaseOutsideSaleWindow (start before sale start)", async () => {
      await expect(
        sale.connect(issuer).addPhase(
          "P", PRICE_RAW, ALLOCATION, MIN_C, MAX_C, TOP_UP_MIN,
          saleStart - 100, saleStart + 86400, false, FIXED,
        ),
      ).to.be.revertedWithCustomError(sale, "PhaseOutsideSaleWindow");
    });

    it("reverts PhaseOutsideSaleWindow (end after sale end, fixed-end sale)", async () => {
      await expect(
        sale.connect(issuer).addPhase(
          "P", PRICE_RAW, ALLOCATION, MIN_C, MAX_C, TOP_UP_MIN,
          saleStart, saleEnd + 1000, false, FIXED,
        ),
      ).to.be.revertedWithCustomError(sale, "PhaseOutsideSaleWindow");
    });

    it("reverts PhaseOverlap when adding an overlapping phase", async () => {
      await sale.connect(issuer).addPhase(
        "P1", PRICE_RAW, ALLOCATION, MIN_C, MAX_C, TOP_UP_MIN,
        saleStart, saleStart + 86400, false, FIXED,
      );
      // Overlapping window
      await expect(
        sale.connect(issuer).addPhase(
          "P2", PRICE_RAW, ALLOCATION, MIN_C, MAX_C, TOP_UP_MIN,
          saleStart + 1000, saleStart + 90000, false, FIXED,
        ),
      ).to.be.revertedWithCustomError(sale, "PhaseOverlap");
    });

    it("allows non-overlapping consecutive phases", async () => {
      await sale.connect(issuer).addPhase(
        "P1", PRICE_RAW, ALLOCATION, MIN_C, MAX_C, TOP_UP_MIN,
        saleStart, saleStart + 86400, false, FIXED,
      );
      await sale.connect(issuer).addPhase(
        "P2", PRICE_RAW, ALLOCATION, MIN_C, MAX_C, TOP_UP_MIN,
        saleStart + 86400, saleStart + 172800, false, FIXED,
      );
      expect(await sale.getPhaseCount()).to.equal(2);
    });

    it("reverts ZeroPhaseAllocation in Fixed mode", async () => {
      await expect(
        sale.connect(issuer).addPhase(
          "P", PRICE_RAW, 0, MIN_C, MAX_C, TOP_UP_MIN,
          saleStart, saleStart + 86400, false, FIXED,
        ),
      ).to.be.revertedWithCustomError(sale, "ZeroPhaseAllocation");
    });

    it("allows zero allocation in Remaining mode", async () => {
      await expect(
        sale.connect(issuer).addPhase(
          "P", PRICE_RAW, 0, MIN_C, MAX_C, TOP_UP_MIN,
          saleStart, saleStart + 86400, false, REMAINING,
        ),
      ).to.not.be.reverted;
    });

    it("reverts TokenSupplyExceeded when cumulative Fixed allocations > totalTokenSupply", async () => {
      await sale.connect(issuer).addPhase(
        "P1", PRICE_RAW, TOTAL_SUPPLY, MIN_C, MAX_C, TOP_UP_MIN,
        saleStart, saleStart + 86400, false, FIXED,
      );
      // Adding any more Fixed-mode allocation should overflow
      await expect(
        sale.connect(issuer).addPhase(
          "P2", PRICE_RAW, ethers.parseUnits("1", 6), MIN_C, MAX_C, TOP_UP_MIN,
          saleStart + 86400, saleStart + 172800, false, FIXED,
        ),
      ).to.be.revertedWithCustomError(sale, "TokenSupplyExceeded");
    });
  });

  // ──────────────────────────────────────────────────────────────────────
  // 4. extendPhase
  // ──────────────────────────────────────────────────────────────────────
  describe("extendPhase", () => {
    let sale: any;
    let saleStart: number;
    let saleEnd: number;

    beforeEach(async () => {
      const fixture = await deployBaseSale({ owner, issuer, feeManager });
      sale = fixture.sale;
      saleStart = fixture.saleStart;
      saleEnd = fixture.saleEnd;
      await sale.connect(issuer).addPhase(
        "P1", PRICE_RAW, ALLOCATION, MIN_C, MAX_C, TOP_UP_MIN,
        saleStart, saleStart + 86400, false, FIXED,
      );
    });

    it("extends a phase", async () => {
      const newEnd = saleStart + 172800;
      await expect(sale.connect(issuer).extendPhase(0, newEnd))
        .to.emit(sale, "PhaseExtended").withArgs(0, newEnd);
      const phase = await sale.getPhase(0);
      expect(phase.endTime).to.equal(newEnd);
    });

    it("reverts ExtensionTooEarly when newEndTime <= current endTime", async () => {
      await expect(sale.connect(issuer).extendPhase(0, saleStart + 86400))
        .to.be.revertedWithCustomError(sale, "ExtensionTooEarly");
    });

    it("reverts ExtensionOverlap when extending into next phase", async () => {
      await sale.connect(issuer).addPhase(
        "P2", PRICE_RAW, ALLOCATION, MIN_C, MAX_C, TOP_UP_MIN,
        saleStart + 90000, saleStart + 180000, false, FIXED,
      );
      await expect(sale.connect(issuer).extendPhase(0, saleStart + 100000))
        .to.be.revertedWithCustomError(sale, "ExtensionOverlap");
    });

    it("reverts CannotExtendEnded when phase already ended", async () => {
      // Approve+activate so we can let time advance through the phase
      await sale.connect(owner).approveSale();
      await sale.connect(issuer).activate();
      // Advance past the phase end
      await time.increaseTo(saleStart + 86400 + 100);
      await expect(sale.connect(issuer).extendPhase(0, saleStart + 200000))
        .to.be.revertedWithCustomError(sale, "CannotExtendEnded");
    });

    it("reverts when caller is not issuer", async () => {
      await expect(sale.connect(owner).extendPhase(0, saleStart + 172800))
        .to.be.revertedWithCustomError(sale, "NotIssuer");
    });
  });

  // ──────────────────────────────────────────────────────────────────────
  // 5. buy() — basic, decimals, top-up, last-chunk
  // ──────────────────────────────────────────────────────────────────────
  describe("buy", () => {
    let sale: any, mockUsdc: any, mockToken: any;
    let saleStart: number;

    beforeEach(async () => {
      const fixture = await deployBaseSale({ owner, issuer, feeManager });
      sale = fixture.sale;
      mockUsdc = fixture.mockUsdc;
      mockToken = fixture.mockToken;
      saleStart = fixture.saleStart;

      await sale.connect(issuer).addPhase(
        "P1", PRICE_RAW, ALLOCATION, MIN_C, MAX_C, TOP_UP_MIN,
        saleStart, saleStart + 86400, false, FIXED,
      );
      await approveAndActivate(sale, owner, issuer);
      await time.increaseTo(saleStart + 10);

      await mockUsdc.mint(investor1.address, ethers.parseUnits("50000", 6));
      await mockUsdc.mint(investor2.address, ethers.parseUnits("50000", 6));
    });

    it("buys with correct token math (1 USDC → 1 token, 6/6 decimals)", async () => {
      const amount = ethers.parseUnits("100", 6);
      await mockUsdc.connect(investor1).approve(await sale.getAddress(), amount);
      await sale.connect(investor1).buy(0, amount);
      // Direct mode: investor receives the project tokens directly
      expect(await mockToken.balanceOf(investor1.address)).to.equal(amount);
      expect(await sale.totalRaised()).to.equal(amount);
      expect(await sale.paymentContributed(investor1.address)).to.equal(amount);
    });

    it("reverts BelowMinContribution for first-time buyer below min", async () => {
      const amount = ethers.parseUnits("5", 6); // below MIN_C = 10
      await mockUsdc.connect(investor1).approve(await sale.getAddress(), amount);
      await expect(sale.connect(investor1).buy(0, amount))
        .to.be.revertedWithCustomError(sale, "BelowMinContribution");
    });

    it("repeat buyer must clear topUpMin (1000 USDC)", async () => {
      // First buy: 100 USDC (clears the 10-USDC minContribution)
      const first = ethers.parseUnits("100", 6);
      await mockUsdc.connect(investor1).approve(await sale.getAddress(), first);
      await sale.connect(investor1).buy(0, first);

      // Second buy: 500 USDC — clears minContribution but BELOW topUpMin (1000)
      const small = ethers.parseUnits("500", 6);
      await mockUsdc.connect(investor1).approve(await sale.getAddress(), small);
      await expect(sale.connect(investor1).buy(0, small))
        .to.be.revertedWithCustomError(sale, "TopUpBelowMin");

      // Third buy: 1000 USDC — clears topUpMin
      const ok = ethers.parseUnits("1000", 6);
      await mockUsdc.connect(investor1).approve(await sale.getAddress(), ok);
      await expect(sale.connect(investor1).buy(0, ok)).to.not.be.reverted;
    });

    it("auto-sets finalizationPending on hardcap (does NOT inline finalize)", async () => {
      // Drain the hardcap with multiple small buys
      // Hard cap is 10000, each investor capped at MAX_C = 5000
      const buyAmt = MAX_C;
      await mockUsdc.connect(investor1).approve(await sale.getAddress(), buyAmt);
      await sale.connect(investor1).buy(0, buyAmt);
      await mockUsdc.connect(investor2).approve(await sale.getAddress(), buyAmt);
      await sale.connect(investor2).buy(0, buyAmt);

      expect(await sale.totalRaised()).to.equal(HARD_CAP);
      // Round-5: status should still be Active, not finalized inline
      expect(await sale.status()).to.equal(STATUS_ACTIVE);
      expect(await sale.finalizationPending()).to.be.true;
    });
  });

  // ──────────────────────────────────────────────────────────────────────
  // 6. Last-chunk exception
  // ──────────────────────────────────────────────────────────────────────
  describe("last-chunk exception", () => {
    it("first-time buyer below min can buy if it consumes the remaining supply", async () => {
      // Set up a sale with a very small total supply so the "remaining" check is exercised
      const tinySupply = ethers.parseUnits("5", 6); // 5 tokens
      const { sale, mockUsdc, mockToken, saleStart } = await deployBaseSale({
        owner, issuer, feeManager, totalTokenSupply: tinySupply,
      });

      await sale.connect(issuer).addPhase(
        "P1", PRICE_RAW, tinySupply, MIN_C, MAX_C, TOP_UP_MIN,
        saleStart, saleStart + 86400, false, FIXED,
      );
      await approveAndActivate(sale, owner, issuer);
      await time.increaseTo(saleStart + 10);

      await mockUsdc.mint(investor1.address, ethers.parseUnits("50", 6));

      // Buyer wants to spend 5 USDC = below min (10 USDC) — but it would consume
      // all 5 remaining supply, so the last-chunk exception lets it through.
      const amount = ethers.parseUnits("5", 6);
      await mockUsdc.connect(investor1).approve(await sale.getAddress(), amount);
      await expect(sale.connect(investor1).buy(0, amount)).to.not.be.reverted;
      // Investor got the 5 tokens, supply is now exhausted
      expect(await mockToken.balanceOf(investor1.address)).to.equal(tinySupply);
    });
  });

  // ──────────────────────────────────────────────────────────────────────
  // 7. finalizeSale
  // ──────────────────────────────────────────────────────────────────────
  describe("finalizeSale", () => {
    it("reverts CannotFinalize when neither finalizationPending nor window expired", async () => {
      const { sale, mockUsdc, saleStart } = await deployBaseSale({ owner, issuer, feeManager });
      await sale.connect(issuer).addPhase(
        "P1", PRICE_RAW, ALLOCATION, MIN_C, MAX_C, TOP_UP_MIN,
        saleStart, saleStart + 86400, false, FIXED,
      );
      await approveAndActivate(sale, owner, issuer);
      await time.increaseTo(saleStart + 10);

      // Make a small buy that doesn't hit hardcap
      await mockUsdc.mint(investor1.address, ethers.parseUnits("50000", 6));
      await mockUsdc.connect(investor1).approve(await sale.getAddress(), ethers.parseUnits("100", 6));
      await sale.connect(investor1).buy(0, ethers.parseUnits("100", 6));

      await expect(sale.connect(issuer).finalizeSale())
        .to.be.revertedWithCustomError(sale, "CannotFinalize");
    });

    it("finalizes successfully after sale window expires", async () => {
      const { sale, mockUsdc, saleStart, saleEnd } = await deployBaseSale({ owner, issuer, feeManager });
      await sale.connect(issuer).addPhase(
        "P1", PRICE_RAW, ALLOCATION, MIN_C, MAX_C, TOP_UP_MIN,
        saleStart, saleStart + 86400, false, FIXED,
      );
      await approveAndActivate(sale, owner, issuer);
      await time.increaseTo(saleStart + 10);

      // Buy enough to clear soft cap
      await mockUsdc.mint(investor1.address, ethers.parseUnits("50000", 6));
      const amount = SOFT_CAP + ethers.parseUnits("10", 6);
      await mockUsdc.connect(investor1).approve(await sale.getAddress(), amount);
      await sale.connect(investor1).buy(0, amount);

      // Move past sale end
      await time.increaseTo(saleEnd + 100);

      await sale.connect(issuer).finalizeSale();
      expect(await sale.status()).to.equal(STATUS_SUCCESS);
    });

    it("finalizes failed when soft cap not met", async () => {
      const { sale, mockUsdc, saleStart, saleEnd } = await deployBaseSale({ owner, issuer, feeManager });
      await sale.connect(issuer).addPhase(
        "P1", PRICE_RAW, ALLOCATION, MIN_C, MAX_C, TOP_UP_MIN,
        saleStart, saleStart + 86400, false, FIXED,
      );
      await approveAndActivate(sale, owner, issuer);
      await time.increaseTo(saleStart + 10);

      await mockUsdc.mint(investor1.address, ethers.parseUnits("50000", 6));
      await mockUsdc.connect(investor1).approve(await sale.getAddress(), ethers.parseUnits("100", 6));
      await sale.connect(investor1).buy(0, ethers.parseUnits("100", 6));

      await time.increaseTo(saleEnd + 100);
      await sale.connect(issuer).finalizeSale();
      expect(await sale.status()).to.equal(STATUS_FAILED);
    });
  });

  // ──────────────────────────────────────────────────────────────────────
  // 8. Refund flow
  // ──────────────────────────────────────────────────────────────────────
  describe("refund flow", () => {
    let sale: any, mockUsdc: any;
    let saleStart: number, saleEnd: number;

    beforeEach(async () => {
      const fixture = await deployBaseSale({ owner, issuer, feeManager });
      sale = fixture.sale;
      mockUsdc = fixture.mockUsdc;
      saleStart = fixture.saleStart;
      saleEnd = fixture.saleEnd;

      await sale.connect(issuer).addPhase(
        "P1", PRICE_RAW, ALLOCATION, MIN_C, MAX_C, TOP_UP_MIN,
        saleStart, saleStart + 86400, false, FIXED,
      );
      await approveAndActivate(sale, owner, issuer);
      await time.increaseTo(saleStart + 10);

      await mockUsdc.mint(investor1.address, ethers.parseUnits("50000", 6));
      const amount = ethers.parseUnits("100", 6);
      await mockUsdc.connect(investor1).approve(await sale.getAddress(), amount);
      await sale.connect(investor1).buy(0, amount);

      // Force the sale into FinalizedFailed by expiring the window
      await time.increaseTo(saleEnd + 100);
      await sale.connect(issuer).finalizeSale();
      expect(await sale.status()).to.equal(STATUS_FAILED);
    });

    it("claimRefund reverts before activateRefunds", async () => {
      await expect(sale.connect(investor1).claimRefund())
        .to.be.revertedWithCustomError(sale, "RefundsNotActive");
    });

    it("activateRefunds opens the refund window (one-way)", async () => {
      await sale.connect(issuer).activateRefunds();
      expect(await sale.refundsActive()).to.be.true;
      // Calling again reverts
      await expect(sale.connect(issuer).activateRefunds())
        .to.be.revertedWithCustomError(sale, "AlreadyApproved");
    });

    it("USDC contributor can claimRefund and gets exact amount back", async () => {
      await sale.connect(issuer).activateRefunds();

      const amountBefore = await mockUsdc.balanceOf(investor1.address);
      await sale.connect(investor1).claimRefund();
      const amountAfter = await mockUsdc.balanceOf(investor1.address);
      expect(amountAfter - amountBefore).to.equal(ethers.parseUnits("100", 6));

      // paymentContributed zeroed out
      expect(await sale.paymentContributed(investor1.address)).to.equal(0);
    });

    it("non-payment contributor (no buy) gets NotPaymentContributor", async () => {
      await sale.connect(issuer).activateRefunds();
      await expect(sale.connect(investor2).claimRefund())
        .to.be.revertedWithCustomError(sale, "NotPaymentContributor");
    });

    it("cannot double-refund", async () => {
      await sale.connect(issuer).activateRefunds();
      await sale.connect(investor1).claimRefund();
      // Round-5: refunded flag is checked first, so the second call hits AlreadyClaimed
      await expect(sale.connect(investor1).claimRefund())
        .to.be.revertedWithCustomError(sale, "AlreadyClaimed");
    });
  });

  // ──────────────────────────────────────────────────────────────────────
  // 9. closeSale (open-ended)
  // ──────────────────────────────────────────────────────────────────────
  describe("closeSale", () => {
    let sale: any, mockUsdc: any;
    let saleStart: number;

    beforeEach(async () => {
      // Open-ended sale
      const fixture = await deployBaseSale({ owner, issuer, feeManager, saleEndTime: 0 });
      sale = fixture.sale;
      mockUsdc = fixture.mockUsdc;
      saleStart = fixture.saleStart;
    });

    it("reverts when no phase exists", async () => {
      // Need at least Active status — but activate requires phases
      await expect(sale.connect(issuer).closeSale(false))
        .to.be.revertedWithCustomError(sale, "InvalidStatus");
    });

    it("reverts PhaseStillActive when a phase is currently in its window", async () => {
      await sale.connect(issuer).addPhase(
        "P1", PRICE_RAW, ALLOCATION, MIN_C, MAX_C, TOP_UP_MIN,
        saleStart, saleStart + 86400, false, FIXED,
      );
      await approveAndActivate(sale, owner, issuer);
      await time.increaseTo(saleStart + 100); // inside phase window
      await expect(sale.connect(issuer).closeSale(false))
        .to.be.revertedWithCustomError(sale, "PhaseStillActive");
    });

    it("issuer closes the sale after the phase ends", async () => {
      await sale.connect(issuer).addPhase(
        "P1", PRICE_RAW, ALLOCATION, MIN_C, MAX_C, TOP_UP_MIN,
        saleStart, saleStart + 86400, false, FIXED,
      );
      await approveAndActivate(sale, owner, issuer);
      await time.increaseTo(saleStart + 10);

      // Buy enough to clear soft cap
      await mockUsdc.mint(investor1.address, ethers.parseUnits("50000", 6));
      const amount = SOFT_CAP + ethers.parseUnits("10", 6);
      await mockUsdc.connect(investor1).approve(await sale.getAddress(), amount);
      await sale.connect(investor1).buy(0, amount);

      // Move past phase end
      await time.increaseTo(saleStart + 86401);
      await sale.connect(issuer).closeSale(false);
      expect(await sale.status()).to.equal(STATUS_SUCCESS);
    });

    it("issuer can force-fail close even if soft cap met", async () => {
      await sale.connect(issuer).addPhase(
        "P1", PRICE_RAW, ALLOCATION, MIN_C, MAX_C, TOP_UP_MIN,
        saleStart, saleStart + 86400, false, FIXED,
      );
      await approveAndActivate(sale, owner, issuer);
      await time.increaseTo(saleStart + 10);

      await mockUsdc.mint(investor1.address, ethers.parseUnits("50000", 6));
      const amount = SOFT_CAP + ethers.parseUnits("10", 6);
      await mockUsdc.connect(investor1).approve(await sale.getAddress(), amount);
      await sale.connect(investor1).buy(0, amount);

      await time.increaseTo(saleStart + 86401);
      await sale.connect(issuer).closeSale(true); // force failed
      expect(await sale.status()).to.equal(STATUS_FAILED);
    });

    it("anyone can close after MAX_SALE_DURATION (730 days)", async () => {
      await sale.connect(issuer).addPhase(
        "P1", PRICE_RAW, ALLOCATION, MIN_C, MAX_C, TOP_UP_MIN,
        saleStart, saleStart + 86400, false, FIXED,
      );
      await approveAndActivate(sale, owner, issuer);
      // Advance past safety floor: saleStart + 730 days
      await time.increaseTo(saleStart + 730 * 24 * 3600 + 1);
      // Random investor (not issuer, not admin) can close
      await sale.connect(investor1).closeSale(false);
      expect(await sale.status()).to.equal(STATUS_FAILED); // soft cap not met
    });

    it("anyone can close after INACTIVITY_TIMEOUT (180 days, below soft cap)", async () => {
      await sale.connect(issuer).addPhase(
        "P1", PRICE_RAW, ALLOCATION, MIN_C, MAX_C, TOP_UP_MIN,
        saleStart, saleStart + 86400, false, FIXED,
      );
      await approveAndActivate(sale, owner, issuer);
      await time.increaseTo(saleStart + 86401 + 180 * 24 * 3600 + 1);
      // No new phase added, soft cap not met
      await sale.connect(investor1).closeSale(false);
      expect(await sale.status()).to.equal(STATUS_FAILED);
    });

    it("non-issuer cannot close before timeouts/floor", async () => {
      await sale.connect(issuer).addPhase(
        "P1", PRICE_RAW, ALLOCATION, MIN_C, MAX_C, TOP_UP_MIN,
        saleStart, saleStart + 86400, false, FIXED,
      );
      await approveAndActivate(sale, owner, issuer);
      await time.increaseTo(saleStart + 86401);
      await expect(sale.connect(investor1).closeSale(false))
        .to.be.revertedWithCustomError(sale, "NotIssuerOrAdmin");
    });
  });

  // ──────────────────────────────────────────────────────────────────────
  // 10. setWhitelist locked once phase starts
  // ──────────────────────────────────────────────────────────────────────
  describe("setWhitelist", () => {
    it("issuer can update whitelist before phase starts", async () => {
      const { sale, saleStart } = await deployBaseSale({ owner, issuer, feeManager });
      await sale.connect(issuer).addPhase(
        "P1", PRICE_RAW, ALLOCATION, MIN_C, MAX_C, TOP_UP_MIN,
        saleStart, saleStart + 86400, true, FIXED,
      );
      await sale.connect(issuer).setWhitelist(0, [investor1.address], true);
      expect(await sale.whitelisted(0, investor1.address)).to.be.true;
    });

    it("reverts PhaseStillActive once the phase has started", async () => {
      const { sale, saleStart } = await deployBaseSale({ owner, issuer, feeManager });
      await sale.connect(issuer).addPhase(
        "P1", PRICE_RAW, ALLOCATION, MIN_C, MAX_C, TOP_UP_MIN,
        saleStart, saleStart + 86400, true, FIXED,
      );
      await approveAndActivate(sale, owner, issuer);
      await time.increaseTo(saleStart + 100);
      await expect(sale.connect(issuer).setWhitelist(0, [investor1.address], true))
        .to.be.revertedWithCustomError(sale, "PhaseStillActive");
    });
  });
});
