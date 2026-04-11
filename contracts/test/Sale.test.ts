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

// Phase params — whole-token buy model
const PRICE_RAW = ethers.parseUnits("1", 6); // 1 USDC per token (payment-token raw for 1 whole token)
const ALLOCATION = ethers.parseUnits("10000", 6); // 10k tokens (raw token units)
const MIN_TOKENS = 10n;       // whole tokens
const MAX_TOKENS = 5000n;     // whole tokens (cumulative per investor)
const TOP_UP_MIN_TOKENS = 5n; // whole tokens

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
        "Phase 1", PRICE_RAW, ALLOCATION, MIN_TOKENS, MAX_TOKENS, TOP_UP_MIN_TOKENS,
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
        "P1", PRICE_RAW, ALLOCATION, MIN_TOKENS, MAX_TOKENS, TOP_UP_MIN_TOKENS,
        Number(start), Number(start) + 86400, false, FIXED,
      );
      await expect(sale.connect(issuer).activate())
        .to.be.revertedWithCustomError(sale, "NotApproved");
    });

    it("activate() reverts when called by non-issuer", async () => {
      const { sale } = await deployBaseSale({ owner, issuer, feeManager });
      const start = await sale.saleStartTime();
      await sale.connect(issuer).addPhase(
        "P1", PRICE_RAW, ALLOCATION, MIN_TOKENS, MAX_TOKENS, TOP_UP_MIN_TOKENS,
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
        "P1", PRICE_RAW, ALLOCATION, MIN_TOKENS, MAX_TOKENS, TOP_UP_MIN_TOKENS,
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
          "Phase 1", PRICE_RAW, ALLOCATION, MIN_TOKENS, MAX_TOKENS, TOP_UP_MIN_TOKENS,
          saleStart, saleStart + 86400, false, FIXED,
        ),
      ).to.emit(sale, "PhaseAdded");
      expect(await sale.getPhaseCount()).to.equal(1);
    });

    it("reverts ZeroPricePerToken", async () => {
      await expect(
        sale.connect(issuer).addPhase(
          "P", 0, ALLOCATION, MIN_TOKENS, MAX_TOKENS, TOP_UP_MIN_TOKENS,
          saleStart, saleStart + 86400, false, FIXED,
        ),
      ).to.be.revertedWithCustomError(sale, "ZeroPricePerToken");
    });

    it("reverts ZeroMinContribution", async () => {
      await expect(
        sale.connect(issuer).addPhase(
          "P", PRICE_RAW, ALLOCATION, 0, MAX_TOKENS, TOP_UP_MIN_TOKENS,
          saleStart, saleStart + 86400, false, FIXED,
        ),
      ).to.be.revertedWithCustomError(sale, "ZeroMinContribution");
    });

    it("reverts InvalidContributionRange (max < min)", async () => {
      await expect(
        sale.connect(issuer).addPhase(
          "P", PRICE_RAW, ALLOCATION, MAX_TOKENS, MIN_TOKENS, TOP_UP_MIN_TOKENS, // swapped
          saleStart, saleStart + 86400, false, FIXED,
        ),
      ).to.be.revertedWithCustomError(sale, "InvalidContributionRange");
    });

    it("reverts ZeroMinContribution when topUpMinTokens = 0", async () => {
      await expect(
        sale.connect(issuer).addPhase(
          "P", PRICE_RAW, ALLOCATION, MIN_TOKENS, MAX_TOKENS, 0n,
          saleStart, saleStart + 86400, false, FIXED,
        ),
      ).to.be.revertedWithCustomError(sale, "ZeroMinContribution");
    });

    it("reverts InvalidPhaseTimeRange", async () => {
      await expect(
        sale.connect(issuer).addPhase(
          "P", PRICE_RAW, ALLOCATION, MIN_TOKENS, MAX_TOKENS, TOP_UP_MIN_TOKENS,
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
          "P", PRICE_RAW, ALLOCATION, MIN_TOKENS, MAX_TOKENS, TOP_UP_MIN_TOKENS,
          earliestStart, inPastEnd, false, FIXED,
        ),
      ).to.be.revertedWithCustomError(sale2, "PhaseInPast");
    });

    it("reverts PhaseOutsideSaleWindow (start before sale start)", async () => {
      await expect(
        sale.connect(issuer).addPhase(
          "P", PRICE_RAW, ALLOCATION, MIN_TOKENS, MAX_TOKENS, TOP_UP_MIN_TOKENS,
          saleStart - 100, saleStart + 86400, false, FIXED,
        ),
      ).to.be.revertedWithCustomError(sale, "PhaseOutsideSaleWindow");
    });

    it("reverts PhaseOutsideSaleWindow (end after sale end, fixed-end sale)", async () => {
      await expect(
        sale.connect(issuer).addPhase(
          "P", PRICE_RAW, ALLOCATION, MIN_TOKENS, MAX_TOKENS, TOP_UP_MIN_TOKENS,
          saleStart, saleEnd + 1000, false, FIXED,
        ),
      ).to.be.revertedWithCustomError(sale, "PhaseOutsideSaleWindow");
    });

    it("reverts PhaseOverlap when adding an overlapping phase", async () => {
      await sale.connect(issuer).addPhase(
        "P1", PRICE_RAW, ALLOCATION, MIN_TOKENS, MAX_TOKENS, TOP_UP_MIN_TOKENS,
        saleStart, saleStart + 86400, false, FIXED,
      );
      // Overlapping window
      await expect(
        sale.connect(issuer).addPhase(
          "P2", PRICE_RAW, ALLOCATION, MIN_TOKENS, MAX_TOKENS, TOP_UP_MIN_TOKENS,
          saleStart + 1000, saleStart + 90000, false, FIXED,
        ),
      ).to.be.revertedWithCustomError(sale, "PhaseOverlap");
    });

    it("allows non-overlapping consecutive phases", async () => {
      await sale.connect(issuer).addPhase(
        "P1", PRICE_RAW, ALLOCATION, MIN_TOKENS, MAX_TOKENS, TOP_UP_MIN_TOKENS,
        saleStart, saleStart + 86400, false, FIXED,
      );
      await sale.connect(issuer).addPhase(
        "P2", PRICE_RAW, ALLOCATION, MIN_TOKENS, MAX_TOKENS, TOP_UP_MIN_TOKENS,
        saleStart + 86400, saleStart + 172800, false, FIXED,
      );
      expect(await sale.getPhaseCount()).to.equal(2);
    });

    it("reverts ZeroPhaseAllocation in Fixed mode", async () => {
      await expect(
        sale.connect(issuer).addPhase(
          "P", PRICE_RAW, 0, MIN_TOKENS, MAX_TOKENS, TOP_UP_MIN_TOKENS,
          saleStart, saleStart + 86400, false, FIXED,
        ),
      ).to.be.revertedWithCustomError(sale, "ZeroPhaseAllocation");
    });

    it("allows zero allocation in Remaining mode", async () => {
      await expect(
        sale.connect(issuer).addPhase(
          "P", PRICE_RAW, 0, MIN_TOKENS, MAX_TOKENS, TOP_UP_MIN_TOKENS,
          saleStart, saleStart + 86400, false, REMAINING,
        ),
      ).to.not.be.reverted;
    });

    it("reverts TokenSupplyExceeded when cumulative Fixed allocations > totalTokenSupply", async () => {
      await sale.connect(issuer).addPhase(
        "P1", PRICE_RAW, TOTAL_SUPPLY, MIN_TOKENS, MAX_TOKENS, TOP_UP_MIN_TOKENS,
        saleStart, saleStart + 86400, false, FIXED,
      );
      // Adding any more Fixed-mode allocation should overflow
      await expect(
        sale.connect(issuer).addPhase(
          "P2", PRICE_RAW, ethers.parseUnits("1", 6), MIN_TOKENS, MAX_TOKENS, TOP_UP_MIN_TOKENS,
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
        "P1", PRICE_RAW, ALLOCATION, MIN_TOKENS, MAX_TOKENS, TOP_UP_MIN_TOKENS,
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
        "P2", PRICE_RAW, ALLOCATION, MIN_TOKENS, MAX_TOKENS, TOP_UP_MIN_TOKENS,
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
        "P1", PRICE_RAW, ALLOCATION, MIN_TOKENS, MAX_TOKENS, TOP_UP_MIN_TOKENS,
        saleStart, saleStart + 86400, false, FIXED,
      );
      await approveAndActivate(sale, owner, issuer);
      await time.increaseTo(saleStart + 10);

      await mockUsdc.mint(investor1.address, ethers.parseUnits("50000", 6));
      await mockUsdc.mint(investor2.address, ethers.parseUnits("50000", 6));
    });

    it("buys whole tokens (100 tokens at $1 each = $100 USDC)", async () => {
      const tokenQty = 100n; // whole tokens
      const expectedUsdc = tokenQty * PRICE_RAW; // 100 * 1e6 = 100 USDC
      const expectedTokensRaw = tokenQty * BigInt(1e6); // 100 * 1e6 raw
      await mockUsdc.connect(investor1).approve(await sale.getAddress(), expectedUsdc);
      await sale.connect(investor1).buy(0, tokenQty);
      expect(await mockToken.balanceOf(investor1.address)).to.equal(expectedTokensRaw);
      expect(await sale.totalRaised()).to.equal(expectedUsdc);
      expect(await sale.paymentContributed(investor1.address)).to.equal(expectedUsdc);
    });

    it("reverts BelowMinContribution for first-time buyer below minTokens", async () => {
      const tokenQty = 5n; // below MIN_TOKENS = 10
      const usdc = tokenQty * PRICE_RAW;
      await mockUsdc.connect(investor1).approve(await sale.getAddress(), usdc);
      await expect(sale.connect(investor1).buy(0, tokenQty))
        .to.be.revertedWithCustomError(sale, "BelowMinContribution");
    });

    it("repeat buyer must clear topUpMinTokens", async () => {
      // First buy: 10 tokens (meets MIN_TOKENS = 10)
      const first = 10n;
      await mockUsdc.connect(investor1).approve(await sale.getAddress(), first * PRICE_RAW);
      await sale.connect(investor1).buy(0, first);

      // Second buy: 3 tokens — below topUpMinTokens (5)
      const small = 3n;
      await mockUsdc.connect(investor1).approve(await sale.getAddress(), small * PRICE_RAW);
      await expect(sale.connect(investor1).buy(0, small))
        .to.be.revertedWithCustomError(sale, "TopUpBelowMin");

      // Third buy: 5 tokens — meets topUpMinTokens
      const ok = 5n;
      await mockUsdc.connect(investor1).approve(await sale.getAddress(), ok * PRICE_RAW);
      await expect(sale.connect(investor1).buy(0, ok)).to.not.be.reverted;
    });

    it("auto-sets finalizationPending on hardcap (does NOT inline finalize)", async () => {
      // Hard cap is 10000 USDC. At $1/token, that's 10000 tokens.
      // Each investor capped at MAX_TOKENS = 5000
      const buyQty = 5000n;
      await mockUsdc.connect(investor1).approve(await sale.getAddress(), buyQty * PRICE_RAW);
      await sale.connect(investor1).buy(0, buyQty);
      await mockUsdc.connect(investor2).approve(await sale.getAddress(), buyQty * PRICE_RAW);
      await sale.connect(investor2).buy(0, buyQty);

      expect(await sale.totalRaised()).to.equal(HARD_CAP);
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
        "P1", PRICE_RAW, tinySupply, MIN_TOKENS, MAX_TOKENS, TOP_UP_MIN_TOKENS,
        saleStart, saleStart + 86400, false, FIXED,
      );
      await approveAndActivate(sale, owner, issuer);
      await time.increaseTo(saleStart + 10);

      await mockUsdc.mint(investor1.address, ethers.parseUnits("50", 6));

      // Buyer wants 5 tokens — below minTokens (10) — but it's the entire
      // remaining supply, so the last-chunk exception lets it through.
      const tokenQty = 5n;
      await mockUsdc.connect(investor1).approve(await sale.getAddress(), tokenQty * PRICE_RAW);
      await expect(sale.connect(investor1).buy(0, tokenQty)).to.not.be.reverted;
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
        "P1", PRICE_RAW, ALLOCATION, MIN_TOKENS, MAX_TOKENS, TOP_UP_MIN_TOKENS,
        saleStart, saleStart + 86400, false, FIXED,
      );
      await approveAndActivate(sale, owner, issuer);
      await time.increaseTo(saleStart + 10);

      // Make a small buy that doesn't hit hardcap
      await mockUsdc.mint(investor1.address, ethers.parseUnits("50000", 6));
      await mockUsdc.connect(investor1).approve(await sale.getAddress(), ethers.parseUnits("100", 6));
      await sale.connect(investor1).buy(0, 100n);

      await expect(sale.connect(issuer).finalizeSale())
        .to.be.revertedWithCustomError(sale, "CannotFinalize");
    });

    it("finalizes successfully after sale window expires", async () => {
      const { sale, mockUsdc, saleStart, saleEnd } = await deployBaseSale({ owner, issuer, feeManager });
      await sale.connect(issuer).addPhase(
        "P1", PRICE_RAW, ALLOCATION, MIN_TOKENS, MAX_TOKENS, TOP_UP_MIN_TOKENS,
        saleStart, saleStart + 86400, false, FIXED,
      );
      await approveAndActivate(sale, owner, issuer);
      await time.increaseTo(saleStart + 10);

      // Buy enough to clear soft cap
      await mockUsdc.mint(investor1.address, ethers.parseUnits("50000", 6));
      const tokenQty = 510n; // enough to clear soft cap ($500) at $1/token
      await mockUsdc.connect(investor1).approve(await sale.getAddress(), tokenQty * PRICE_RAW);
      await sale.connect(investor1).buy(0, tokenQty);

      // Move past sale end
      await time.increaseTo(saleEnd + 100);

      await sale.connect(issuer).finalizeSale();
      expect(await sale.status()).to.equal(STATUS_SUCCESS);
    });

    it("finalizes failed when soft cap not met", async () => {
      const { sale, mockUsdc, saleStart, saleEnd } = await deployBaseSale({ owner, issuer, feeManager });
      await sale.connect(issuer).addPhase(
        "P1", PRICE_RAW, ALLOCATION, MIN_TOKENS, MAX_TOKENS, TOP_UP_MIN_TOKENS,
        saleStart, saleStart + 86400, false, FIXED,
      );
      await approveAndActivate(sale, owner, issuer);
      await time.increaseTo(saleStart + 10);

      await mockUsdc.mint(investor1.address, ethers.parseUnits("50000", 6));
      await mockUsdc.connect(investor1).approve(await sale.getAddress(), ethers.parseUnits("100", 6));
      await sale.connect(investor1).buy(0, 100n);

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
        "P1", PRICE_RAW, ALLOCATION, MIN_TOKENS, MAX_TOKENS, TOP_UP_MIN_TOKENS,
        saleStart, saleStart + 86400, false, FIXED,
      );
      await approveAndActivate(sale, owner, issuer);
      await time.increaseTo(saleStart + 10);

      await mockUsdc.mint(investor1.address, ethers.parseUnits("50000", 6));
      const buyTokens = 100n;
      await mockUsdc.connect(investor1).approve(await sale.getAddress(), buyTokens * PRICE_RAW);
      await sale.connect(investor1).buy(0, buyTokens);

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
        "P1", PRICE_RAW, ALLOCATION, MIN_TOKENS, MAX_TOKENS, TOP_UP_MIN_TOKENS,
        saleStart, saleStart + 86400, false, FIXED,
      );
      await approveAndActivate(sale, owner, issuer);
      await time.increaseTo(saleStart + 100); // inside phase window
      await expect(sale.connect(issuer).closeSale(false))
        .to.be.revertedWithCustomError(sale, "PhaseStillActive");
    });

    it("issuer closes the sale after the phase ends", async () => {
      await sale.connect(issuer).addPhase(
        "P1", PRICE_RAW, ALLOCATION, MIN_TOKENS, MAX_TOKENS, TOP_UP_MIN_TOKENS,
        saleStart, saleStart + 86400, false, FIXED,
      );
      await approveAndActivate(sale, owner, issuer);
      await time.increaseTo(saleStart + 10);

      // Buy enough to clear soft cap
      await mockUsdc.mint(investor1.address, ethers.parseUnits("50000", 6));
      const tokenQty = 510n; // enough to clear soft cap ($500) at $1/token
      await mockUsdc.connect(investor1).approve(await sale.getAddress(), tokenQty * PRICE_RAW);
      await sale.connect(investor1).buy(0, tokenQty);

      // Move past phase end
      await time.increaseTo(saleStart + 86401);
      await sale.connect(issuer).closeSale(false);
      expect(await sale.status()).to.equal(STATUS_SUCCESS);
    });

    it("issuer can force-fail close even if soft cap met", async () => {
      await sale.connect(issuer).addPhase(
        "P1", PRICE_RAW, ALLOCATION, MIN_TOKENS, MAX_TOKENS, TOP_UP_MIN_TOKENS,
        saleStart, saleStart + 86400, false, FIXED,
      );
      await approveAndActivate(sale, owner, issuer);
      await time.increaseTo(saleStart + 10);

      await mockUsdc.mint(investor1.address, ethers.parseUnits("50000", 6));
      const tokenQty = 510n; // enough to clear soft cap ($500) at $1/token
      await mockUsdc.connect(investor1).approve(await sale.getAddress(), tokenQty * PRICE_RAW);
      await sale.connect(investor1).buy(0, tokenQty);

      await time.increaseTo(saleStart + 86401);
      await sale.connect(issuer).closeSale(true); // force failed
      expect(await sale.status()).to.equal(STATUS_FAILED);
    });

    it("anyone can close after MAX_SALE_DURATION (730 days)", async () => {
      await sale.connect(issuer).addPhase(
        "P1", PRICE_RAW, ALLOCATION, MIN_TOKENS, MAX_TOKENS, TOP_UP_MIN_TOKENS,
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
        "P1", PRICE_RAW, ALLOCATION, MIN_TOKENS, MAX_TOKENS, TOP_UP_MIN_TOKENS,
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
        "P1", PRICE_RAW, ALLOCATION, MIN_TOKENS, MAX_TOKENS, TOP_UP_MIN_TOKENS,
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
        "P1", PRICE_RAW, ALLOCATION, MIN_TOKENS, MAX_TOKENS, TOP_UP_MIN_TOKENS,
        saleStart, saleStart + 86400, true, FIXED,
      );
      await sale.connect(issuer).setWhitelist(0, [investor1.address], true);
      expect(await sale.whitelisted(0, investor1.address)).to.be.true;
    });

    it("reverts PhaseStillActive once the phase has started", async () => {
      const { sale, saleStart } = await deployBaseSale({ owner, issuer, feeManager });
      await sale.connect(issuer).addPhase(
        "P1", PRICE_RAW, ALLOCATION, MIN_TOKENS, MAX_TOKENS, TOP_UP_MIN_TOKENS,
        saleStart, saleStart + 86400, true, FIXED,
      );
      await approveAndActivate(sale, owner, issuer);
      await time.increaseTo(saleStart + 100);
      await expect(sale.connect(issuer).setWhitelist(0, [investor1.address], true))
        .to.be.revertedWithCustomError(sale, "PhaseStillActive");
    });

    it("reverts NotWhitelisted when whitelistOnly phase and buyer not on list", async () => {
      const { sale, mockUsdc, saleStart } = await deployBaseSale({ owner, issuer, feeManager });
      await sale.connect(issuer).addPhase(
        "P1", PRICE_RAW, ALLOCATION, MIN_TOKENS, MAX_TOKENS, TOP_UP_MIN_TOKENS,
        saleStart, saleStart + 86400, true, FIXED, // whitelistOnly=true
      );
      await approveAndActivate(sale, owner, issuer);
      await time.increaseTo(saleStart + 100);

      await mockUsdc.mint(investor1.address, ethers.parseUnits("50000", 6));
      await mockUsdc.connect(investor1).approve(await sale.getAddress(), 100n * PRICE_RAW);

      await expect(sale.connect(investor1).buy(0, 100n))
        .to.be.revertedWithCustomError(sale, "NotWhitelisted");
    });

    it("whitelisted buyer can buy in whitelistOnly phase", async () => {
      const { sale, mockUsdc, saleStart } = await deployBaseSale({ owner, issuer, feeManager });
      await sale.connect(issuer).addPhase(
        "P1", PRICE_RAW, ALLOCATION, MIN_TOKENS, MAX_TOKENS, TOP_UP_MIN_TOKENS,
        saleStart, saleStart + 86400, true, FIXED,
      );
      await sale.connect(issuer).setWhitelist(0, [investor1.address], true);
      await approveAndActivate(sale, owner, issuer);
      await time.increaseTo(saleStart + 100);

      await mockUsdc.mint(investor1.address, ethers.parseUnits("50000", 6));
      await mockUsdc.connect(investor1).approve(await sale.getAddress(), 100n * PRICE_RAW);
      await expect(sale.connect(investor1).buy(0, 100n)).to.not.be.reverted;
    });
  });

  // ──────────────────────────────────────────────────────────────────────
  // 11. Phase boundary checks — PhaseNotStarted / PhaseEnded
  // ──────────────────────────────────────────────────────────────────────
  describe("phase boundaries", () => {
    it("reverts PhaseNotStarted when buying before phase.startTime", async () => {
      const { sale, mockUsdc, saleStart } = await deployBaseSale({ owner, issuer, feeManager });
      const phaseStart = saleStart + 3600; // starts 1h after sale start
      await sale.connect(issuer).addPhase(
        "P1", PRICE_RAW, ALLOCATION, MIN_TOKENS, MAX_TOKENS, TOP_UP_MIN_TOKENS,
        phaseStart, phaseStart + 86400, false, FIXED,
      );
      await approveAndActivate(sale, owner, issuer);
      await time.increaseTo(saleStart + 100); // before phase starts

      await mockUsdc.mint(investor1.address, ethers.parseUnits("50000", 6));
      await mockUsdc.connect(investor1).approve(await sale.getAddress(), 100n * PRICE_RAW);

      await expect(sale.connect(investor1).buy(0, 100n))
        .to.be.revertedWithCustomError(sale, "PhaseNotStarted");
    });

    it("reverts PhaseEnded when buying after phase.endTime", async () => {
      const { sale, mockUsdc, saleStart } = await deployBaseSale({ owner, issuer, feeManager });
      await sale.connect(issuer).addPhase(
        "P1", PRICE_RAW, ALLOCATION, MIN_TOKENS, MAX_TOKENS, TOP_UP_MIN_TOKENS,
        saleStart, saleStart + 3600, false, FIXED, // 1h phase
      );
      await approveAndActivate(sale, owner, issuer);
      await time.increaseTo(saleStart + 7200); // 2h after start — past end

      await mockUsdc.mint(investor1.address, ethers.parseUnits("50000", 6));
      await mockUsdc.connect(investor1).approve(await sale.getAddress(), 100n * PRICE_RAW);

      await expect(sale.connect(investor1).buy(0, 100n))
        .to.be.revertedWithCustomError(sale, "PhaseEnded");
    });
  });

  // ──────────────────────────────────────────────────────────────────────
  // 12. Boundary enforcement — ExceedsHardCap / ExceedsAllocation / ExceedsMaxContribution
  // ──────────────────────────────────────────────────────────────────────
  describe("buy boundary checks", () => {
    let sale: any, mockUsdc: any, saleStart: number;

    beforeEach(async () => {
      const fixture = await deployBaseSale({
        owner, issuer, feeManager,
        hardCap: ethers.parseUnits("1000", 6), // small hard cap: 1000 tokens @ $1
      });
      sale = fixture.sale;
      mockUsdc = fixture.mockUsdc;
      saleStart = fixture.saleStart;

      await sale.connect(issuer).addPhase(
        "P1", PRICE_RAW, ethers.parseUnits("500", 6), // allocation = 500 tokens
        MIN_TOKENS, MAX_TOKENS, TOP_UP_MIN_TOKENS,
        saleStart, saleStart + 86400, false, FIXED,
      );
      await approveAndActivate(sale, owner, issuer);
      await time.increaseTo(saleStart + 10);

      await mockUsdc.mint(investor1.address, ethers.parseUnits("100000", 6));
      await mockUsdc.mint(investor2.address, ethers.parseUnits("100000", 6));
    });

    it("reverts ExceedsHardCap when buy would exceed hardCap", async () => {
      // hardCap = 1000 USDC. Try to buy 1001 tokens = $1001
      await mockUsdc.connect(investor1).approve(await sale.getAddress(), 1001n * PRICE_RAW);
      await expect(sale.connect(investor1).buy(0, 1001n))
        .to.be.revertedWithCustomError(sale, "ExceedsHardCap");
    });

    it("reverts ExceedsAllocation when Fixed phase allocation exhausted", async () => {
      // Phase allocation = 500 tokens. Buy 490 first (above min 10).
      await mockUsdc.connect(investor1).approve(await sale.getAddress(), 490n * PRICE_RAW);
      await sale.connect(investor1).buy(0, 490n);

      // investor2 tries to buy 50 more → 490+50=540 > 500 allocation, but min=10 so phase-eligibility passes
      await mockUsdc.connect(investor2).approve(await sale.getAddress(), 50n * PRICE_RAW);
      await expect(sale.connect(investor2).buy(0, 50n))
        .to.be.revertedWithCustomError(sale, "ExceedsAllocation");
    });

    it("reverts ExceedsMaxContribution when per-investor maxTokens cap hit", async () => {
      // MAX_TOKENS = 5000 — set a smaller sale with a smaller cap
      const { sale: s2, mockUsdc: u2, saleStart: start2 } = await deployBaseSale({ owner, issuer, feeManager });
      await s2.connect(issuer).addPhase(
        "P1", PRICE_RAW, ALLOCATION,
        MIN_TOKENS, 50n, TOP_UP_MIN_TOKENS, // maxTokens = 50
        start2, start2 + 86400, false, FIXED,
      );
      await approveAndActivate(s2, owner, issuer);
      await time.increaseTo(start2 + 10);

      await u2.mint(investor1.address, ethers.parseUnits("50000", 6));
      await u2.connect(investor1).approve(await s2.getAddress(), 60n * PRICE_RAW);

      // Buy 40 — under cap, fine
      await s2.connect(investor1).buy(0, 40n);
      // Buy 20 more = 60 total > 50 cap
      await expect(s2.connect(investor1).buy(0, 20n))
        .to.be.revertedWithCustomError(s2, "ExceedsMaxContribution");
    });
  });

  // ──────────────────────────────────────────────────────────────────────
  // 13. buyOTC — full flow + OTC no-min regression
  // ──────────────────────────────────────────────────────────────────────
  describe("buyOTC", () => {
    async function deployOtcSale() {
      const ERC20 = await ethers.getContractFactory("MockERC20");
      const mockUsdc = await ERC20.deploy("Mock USDC", "USDC", 6);
      const mockToken = await ERC20.deploy("Test Token", "TST", 6);
      const mockOtc = await ERC20.deploy("OTC Voucher", "cOTC", 6);

      const MockIR = await ethers.getContractFactory("MockIdentityRegistry");
      const mockIR = await MockIR.deploy();
      const MSF = await ethers.getContractFactory("MockSaleFactory");
      const mockFactory = await MSF.deploy(owner.address);

      const now = await time.latest();
      const start = now + 60;
      const end = now + SALE_DURATION;

      const SaleFactory = await ethers.getContractFactory("Sale");
      const sale = await upgrades.deployProxy(SaleFactory, [
        await mockToken.getAddress(), await mockUsdc.getAddress(),
        await mockIR.getAddress(), issuer.address,
        await mockFactory.getAddress(), feeManager.address,
        SOFT_CAP, HARD_CAP, FEE_BPS, FEE_CAP,
        await mockOtc.getAddress(), // OTC enabled
        start, end, TOTAL_SUPPLY,
      ], { unsafeAllow: ["constructor"] });

      await mockToken.mint(await sale.getAddress(), ethers.parseUnits("50000", 6));

      return { sale, mockUsdc, mockToken, mockOtc, saleStart: start };
    }

    it("reverts OTCNotEnabled when buyOTC called on sale without OTC token", async () => {
      const { sale, saleStart } = await deployBaseSale({ owner, issuer, feeManager });
      await sale.connect(issuer).addPhase(
        "P1", PRICE_RAW, ALLOCATION, MIN_TOKENS, MAX_TOKENS, TOP_UP_MIN_TOKENS,
        saleStart, saleStart + 86400, false, FIXED,
      );
      await approveAndActivate(sale, owner, issuer);
      await time.increaseTo(saleStart + 10);

      await expect(sale.connect(investor1).buyOTC(0, 100n))
        .to.be.revertedWithCustomError(sale, "OTCNotEnabled");
    });

    it("reverts AmountTooSmall when tokenQty is 0", async () => {
      const { sale, saleStart } = await deployOtcSale();
      await sale.connect(issuer).addPhase(
        "P1", PRICE_RAW, ALLOCATION, MIN_TOKENS, MAX_TOKENS, TOP_UP_MIN_TOKENS,
        saleStart, saleStart + 86400, false, FIXED,
      );
      await approveAndActivate(sale, owner, issuer);
      await time.increaseTo(saleStart + 10);

      await expect(sale.connect(investor1).buyOTC(0, 0n))
        .to.be.revertedWithCustomError(sale, "AmountTooSmall");
    });

    it("reverts InsufficientOTCBalance when investor has no vouchers", async () => {
      const { sale, saleStart } = await deployOtcSale();
      await sale.connect(issuer).addPhase(
        "P1", PRICE_RAW, ALLOCATION, MIN_TOKENS, MAX_TOKENS, TOP_UP_MIN_TOKENS,
        saleStart, saleStart + 86400, false, FIXED,
      );
      await approveAndActivate(sale, owner, issuer);
      await time.increaseTo(saleStart + 10);

      await expect(sale.connect(investor1).buyOTC(0, 100n))
        .to.be.revertedWithCustomError(sale, "InsufficientOTCBalance");
    });

    it("reverts OTCNotApproved when balance exists but no allowance", async () => {
      const { sale, mockOtc, saleStart } = await deployOtcSale();
      await sale.connect(issuer).addPhase(
        "P1", PRICE_RAW, ALLOCATION, MIN_TOKENS, MAX_TOKENS, TOP_UP_MIN_TOKENS,
        saleStart, saleStart + 86400, false, FIXED,
      );
      await approveAndActivate(sale, owner, issuer);
      await time.increaseTo(saleStart + 10);

      await mockOtc.mint(investor1.address, 1000n * PRICE_RAW);
      // No approve
      await expect(sale.connect(investor1).buyOTC(0, 100n))
        .to.be.revertedWithCustomError(sale, "OTCNotApproved");
    });

    it("happy path — buyOTC burns vouchers, records otcContributed, and transfers tokens (Direct mode)", async () => {
      const { sale, mockOtc, mockToken, saleStart } = await deployOtcSale();
      await sale.connect(issuer).addPhase(
        "P1", PRICE_RAW, ALLOCATION, MIN_TOKENS, MAX_TOKENS, TOP_UP_MIN_TOKENS,
        saleStart, saleStart + 86400, false, FIXED,
      );
      await approveAndActivate(sale, owner, issuer);
      await time.increaseTo(saleStart + 10);

      const tokenQty = 100n;
      const otcRequired = tokenQty * PRICE_RAW;
      await mockOtc.mint(investor1.address, otcRequired);
      await mockOtc.connect(investor1).approve(await sale.getAddress(), otcRequired);

      await sale.connect(investor1).buyOTC(0, tokenQty);

      // OTC vouchers transferred out (burn() is public on mock ERC20 — sale keeps the balance)
      expect(await mockOtc.balanceOf(investor1.address)).to.equal(0n);
      // Direct mode: investor receives project tokens
      expect(await mockToken.balanceOf(investor1.address)).to.equal(tokenQty * BigInt(1e6));
      // otcContributed incremented; paymentContributed NOT incremented
      expect(await sale.otcContributed(investor1.address)).to.equal(otcRequired);
      expect(await sale.paymentContributed(investor1.address)).to.equal(0n);
      expect(await sale.totalRaised()).to.equal(otcRequired);
    });

    it("buyOTC bypasses minTokens (OTC no-min regression test)", async () => {
      // Phase min = 100 tokens. OTC buyer can buy 1 token.
      const { sale, mockOtc, saleStart } = await deployOtcSale();
      await sale.connect(issuer).addPhase(
        "P1", PRICE_RAW, ALLOCATION,
        100n, // minTokens = 100
        0n, // maxTokens
        10n, // topUpMinTokens = 10
        saleStart, saleStart + 86400, false, FIXED,
      );
      await approveAndActivate(sale, owner, issuer);
      await time.increaseTo(saleStart + 10);

      // Buy just 1 token via OTC — should succeed despite min being 100
      await mockOtc.mint(investor1.address, 1n * PRICE_RAW);
      await mockOtc.connect(investor1).approve(await sale.getAddress(), 1n * PRICE_RAW);
      await expect(sale.connect(investor1).buyOTC(0, 1n)).to.not.be.reverted;
      expect(await sale.otcContributed(investor1.address)).to.equal(1n * PRICE_RAW);
    });

    it("buyOTC bypasses topUpMinTokens for repeat buyer", async () => {
      const { sale, mockOtc, saleStart } = await deployOtcSale();
      await sale.connect(issuer).addPhase(
        "P1", PRICE_RAW, ALLOCATION,
        10n, 0n, 100n, // topUp min = 100
        saleStart, saleStart + 86400, false, FIXED,
      );
      await approveAndActivate(sale, owner, issuer);
      await time.increaseTo(saleStart + 10);

      // First OTC buy to make investor a "repeat" buyer
      await mockOtc.mint(investor1.address, 200n * PRICE_RAW);
      await mockOtc.connect(investor1).approve(await sale.getAddress(), 200n * PRICE_RAW);
      await sale.connect(investor1).buyOTC(0, 100n); // 100 tokens

      // Second top-up of just 1 token — below topUpMin (100), but OTC should bypass
      await expect(sale.connect(investor1).buyOTC(0, 1n)).to.not.be.reverted;
    });

    it("mixed buy + buyOTC accounting: paymentContributedTotal vs totalRaised", async () => {
      const { sale, mockUsdc, mockOtc, saleStart } = await deployOtcSale();
      await sale.connect(issuer).addPhase(
        "P1", PRICE_RAW, ALLOCATION, MIN_TOKENS, MAX_TOKENS, TOP_UP_MIN_TOKENS,
        saleStart, saleStart + 86400, false, FIXED,
      );
      await approveAndActivate(sale, owner, issuer);
      await time.increaseTo(saleStart + 10);

      // 100 USDC buy
      await mockUsdc.mint(investor1.address, 100n * PRICE_RAW);
      await mockUsdc.connect(investor1).approve(await sale.getAddress(), 100n * PRICE_RAW);
      await sale.connect(investor1).buy(0, 100n);

      // 50 OTC buy
      await mockOtc.mint(investor1.address, 50n * PRICE_RAW);
      await mockOtc.connect(investor1).approve(await sale.getAddress(), 50n * PRICE_RAW);
      await sale.connect(investor1).buyOTC(0, 50n);

      // totalRaised = 150 (both paths contribute)
      expect(await sale.totalRaised()).to.equal(150n * PRICE_RAW);
      // paymentContributedTotal = 100 (USDC only — used for fee calc)
      expect(await sale.paymentContributedTotal()).to.equal(100n * PRICE_RAW);
      // Per-investor splits
      expect(await sale.paymentContributed(investor1.address)).to.equal(100n * PRICE_RAW);
      expect(await sale.otcContributed(investor1.address)).to.equal(50n * PRICE_RAW);
      expect(await sale.totalContributed(investor1.address)).to.equal(150n * PRICE_RAW);
    });
  });

  // ──────────────────────────────────────────────────────────────────────
  // 14. claimTokens — Direct mode only
  // ──────────────────────────────────────────────────────────────────────
  describe("claimTokens (Direct mode)", () => {
    it("reverts InvalidStatus before finalization", async () => {
      const { sale } = await deployBaseSale({ owner, issuer, feeManager });
      await expect(sale.connect(investor1).claimTokens())
        .to.be.revertedWithCustomError(sale, "InvalidStatus");
    });

    it("tokens are released on buy (Direct mode delivers immediately)", async () => {
      // In direct mode the buy() itself transfers tokens. claimTokens is actually for
      // a scenario where tokens were NOT transferred at buy time — which our current
      // contract handles by setting claimed=true. So a second claim should revert.
      const { sale, mockUsdc, mockToken, saleStart } = await deployBaseSale({ owner, issuer, feeManager });
      await sale.connect(issuer).addPhase(
        "P1", PRICE_RAW, ALLOCATION, MIN_TOKENS, MAX_TOKENS, TOP_UP_MIN_TOKENS,
        saleStart, saleStart + 86400, false, FIXED,
      );
      await approveAndActivate(sale, owner, issuer);
      await time.increaseTo(saleStart + 10);

      await mockUsdc.mint(investor1.address, 100n * PRICE_RAW);
      await mockUsdc.connect(investor1).approve(await sale.getAddress(), 100n * PRICE_RAW);
      await sale.connect(investor1).buy(0, 100n);

      // Tokens already in investor's wallet
      expect(await mockToken.balanceOf(investor1.address)).to.equal(100n * BigInt(1e6));
      const contrib = await sale.getContribution(investor1.address);
      expect(contrib.claimed).to.be.true;
    });
  });

  // ──────────────────────────────────────────────────────────────────────
  // 15. withdrawFunds — issuer-only, post-finalize
  // ──────────────────────────────────────────────────────────────────────
  describe("withdrawFunds", () => {
    it("reverts SaleNotFinalized before finalization", async () => {
      const { sale } = await deployBaseSale({ owner, issuer, feeManager });
      await expect(sale.connect(issuer).withdrawFunds())
        .to.be.revertedWithCustomError(sale, "SaleNotFinalized");
    });

    it("reverts NotIssuer when admin tries to withdraw", async () => {
      const { sale } = await deployBaseSale({ owner, issuer, feeManager });
      await expect(sale.connect(owner).withdrawFunds())
        .to.be.revertedWithCustomError(sale, "NotIssuer");
    });

    it("issuer receives raised USDC after successful finalization (minus fee)", async () => {
      const { sale, mockUsdc, saleStart, saleEnd } = await deployBaseSale({ owner, issuer, feeManager });
      await sale.connect(issuer).addPhase(
        "P1", PRICE_RAW, ALLOCATION, MIN_TOKENS, MAX_TOKENS, TOP_UP_MIN_TOKENS,
        saleStart, saleStart + 86400, false, FIXED,
      );
      await approveAndActivate(sale, owner, issuer);
      await time.increaseTo(saleStart + 10);

      // Buy enough to clear soft cap
      await mockUsdc.mint(investor1.address, ethers.parseUnits("50000", 6));
      await mockUsdc.connect(investor1).approve(await sale.getAddress(), 1000n * PRICE_RAW);
      await sale.connect(investor1).buy(0, 1000n); // 1000 USDC

      // Finalize
      await time.increaseTo(saleEnd + 100);
      await sale.connect(issuer).finalizeSale();

      const issuerBalBefore = await mockUsdc.balanceOf(issuer.address);
      await sale.connect(issuer).withdrawFunds();
      const issuerBalAfter = await mockUsdc.balanceOf(issuer.address);

      // Issuer got all remaining USDC (hardCap amount minus fee already paid in _finalize)
      expect(issuerBalAfter).to.be.greaterThan(issuerBalBefore);
    });

    it("reverts NothingToWithdraw on second call after already withdrawn", async () => {
      const { sale, mockUsdc, saleStart, saleEnd } = await deployBaseSale({ owner, issuer, feeManager });
      await sale.connect(issuer).addPhase(
        "P1", PRICE_RAW, ALLOCATION, MIN_TOKENS, MAX_TOKENS, TOP_UP_MIN_TOKENS,
        saleStart, saleStart + 86400, false, FIXED,
      );
      await approveAndActivate(sale, owner, issuer);
      await time.increaseTo(saleStart + 10);

      await mockUsdc.mint(investor1.address, ethers.parseUnits("50000", 6));
      await mockUsdc.connect(investor1).approve(await sale.getAddress(), 1000n * PRICE_RAW);
      await sale.connect(investor1).buy(0, 1000n);

      await time.increaseTo(saleEnd + 100);
      await sale.connect(issuer).finalizeSale();
      await sale.connect(issuer).withdrawFunds();

      await expect(sale.connect(issuer).withdrawFunds())
        .to.be.revertedWithCustomError(sale, "NothingToWithdraw");
    });
  });

  // ──────────────────────────────────────────────────────────────────────
  // 16. withdrawTokens — reclaim deposit from Draft/Rejected
  // ──────────────────────────────────────────────────────────────────────
  describe("withdrawTokens", () => {
    it("issuer reclaims deposit from Draft state", async () => {
      const { sale, mockToken } = await deployBaseSale({ owner, issuer, feeManager });
      const saleAddr = await sale.getAddress();
      // deployBaseSale minted 50k tokens to sale already — withdrawTokens returns them to issuer
      const balBefore = await mockToken.balanceOf(issuer.address);
      await sale.connect(issuer).withdrawTokens();
      const balAfter = await mockToken.balanceOf(issuer.address);
      expect(balAfter - balBefore).to.equal(ethers.parseUnits("50000", 6));
      expect(await mockToken.balanceOf(saleAddr)).to.equal(0n);
    });

    it("reverts InvalidStatus when sale is Active", async () => {
      const { sale, saleStart } = await deployBaseSale({ owner, issuer, feeManager });
      await sale.connect(issuer).addPhase(
        "P1", PRICE_RAW, ALLOCATION, MIN_TOKENS, MAX_TOKENS, TOP_UP_MIN_TOKENS,
        saleStart, saleStart + 86400, false, FIXED,
      );
      await approveAndActivate(sale, owner, issuer);
      await expect(sale.connect(issuer).withdrawTokens())
        .to.be.revertedWithCustomError(sale, "InvalidStatus");
    });

    it("issuer can reclaim from Rejected state", async () => {
      const { sale, mockToken } = await deployBaseSale({ owner, issuer, feeManager });
      await sale.connect(owner).reject();
      // Tokens still in sale — issuer can withdraw
      const balBefore = await mockToken.balanceOf(issuer.address);
      await sale.connect(issuer).withdrawTokens();
      expect(await mockToken.balanceOf(issuer.address)).to.be.greaterThan(balBefore);
    });

    it("reverts NotIssuer when called by non-issuer", async () => {
      const { sale } = await deployBaseSale({ owner, issuer, feeManager });
      await expect(sale.connect(owner).withdrawTokens())
        .to.be.revertedWithCustomError(sale, "NotIssuer");
    });
  });

  // ──────────────────────────────────────────────────────────────────────
  // 17. pause / unpause
  // ──────────────────────────────────────────────────────────────────────
  describe("pause / unpause", () => {
    async function setupActiveSale() {
      const fixture = await deployBaseSale({ owner, issuer, feeManager });
      const { sale, saleStart } = fixture;
      await sale.connect(issuer).addPhase(
        "P1", PRICE_RAW, ALLOCATION, MIN_TOKENS, MAX_TOKENS, TOP_UP_MIN_TOKENS,
        saleStart, saleStart + 86400, false, FIXED,
      );
      await approveAndActivate(sale, owner, issuer);
      return fixture;
    }

    it("issuer can pause", async () => {
      const { sale } = await setupActiveSale();
      await sale.connect(issuer).pause();
      expect(await sale.status()).to.equal(STATUS_PAUSED);
    });

    it("admin can pause", async () => {
      const { sale } = await setupActiveSale();
      await sale.connect(owner).pause();
      expect(await sale.status()).to.equal(STATUS_PAUSED);
    });

    it("non-admin, non-issuer cannot pause", async () => {
      const { sale } = await setupActiveSale();
      await expect(sale.connect(investor1).pause())
        .to.be.revertedWithCustomError(sale, "NotIssuerOrAdmin");
    });

    it("admin can unpause", async () => {
      const { sale } = await setupActiveSale();
      await sale.connect(issuer).pause();
      await sale.connect(owner).unpause();
      expect(await sale.status()).to.equal(STATUS_ACTIVE);
    });

    it("issuer cannot unpause (admin-only)", async () => {
      const { sale } = await setupActiveSale();
      await sale.connect(issuer).pause();
      await expect(sale.connect(issuer).unpause())
        .to.be.revertedWithCustomError(sale, "NotAdmin");
    });

    it("buy reverts while paused", async () => {
      const { sale, mockUsdc, saleStart } = await setupActiveSale();
      await time.increaseTo(saleStart + 100);
      await sale.connect(issuer).pause();
      await mockUsdc.mint(investor1.address, ethers.parseUnits("50000", 6));
      await mockUsdc.connect(investor1).approve(await sale.getAddress(), 100n * PRICE_RAW);
      await expect(sale.connect(investor1).buy(0, 100n))
        .to.be.revertedWithCustomError(sale, "InvalidStatus");
    });
  });

  // ──────────────────────────────────────────────────────────────────────
  // 18. reject (admin → Rejected)
  // ──────────────────────────────────────────────────────────────────────
  describe("reject", () => {
    it("admin can reject a Draft sale", async () => {
      const { sale } = await deployBaseSale({ owner, issuer, feeManager });
      await sale.connect(owner).reject();
      expect(await sale.status()).to.equal(5); // Rejected
    });

    it("non-admin cannot reject", async () => {
      const { sale } = await deployBaseSale({ owner, issuer, feeManager });
      await expect(sale.connect(issuer).reject())
        .to.be.revertedWithCustomError(sale, "NotAdmin");
    });

    it("cannot reject after activation", async () => {
      const { sale, saleStart } = await deployBaseSale({ owner, issuer, feeManager });
      await sale.connect(issuer).addPhase(
        "P1", PRICE_RAW, ALLOCATION, MIN_TOKENS, MAX_TOKENS, TOP_UP_MIN_TOKENS,
        saleStart, saleStart + 86400, false, FIXED,
      );
      await approveAndActivate(sale, owner, issuer);
      await expect(sale.connect(owner).reject())
        .to.be.revertedWithCustomError(sale, "InvalidStatus");
    });
  });

  // ──────────────────────────────────────────────────────────────────────
  // 19. emergencyWithdraw — admin-only, 90-day delay
  // ──────────────────────────────────────────────────────────────────────
  describe("emergencyWithdraw", () => {
    async function finalized() {
      const fixture = await deployBaseSale({ owner, issuer, feeManager });
      const { sale, mockUsdc, saleStart, saleEnd } = fixture;
      await sale.connect(issuer).addPhase(
        "P1", PRICE_RAW, ALLOCATION, MIN_TOKENS, MAX_TOKENS, TOP_UP_MIN_TOKENS,
        saleStart, saleStart + 86400, false, FIXED,
      );
      await approveAndActivate(sale, owner, issuer);
      await time.increaseTo(saleStart + 10);
      await mockUsdc.mint(investor1.address, ethers.parseUnits("50000", 6));
      await mockUsdc.connect(investor1).approve(await sale.getAddress(), 1000n * PRICE_RAW);
      await sale.connect(investor1).buy(0, 1000n);
      await time.increaseTo(saleEnd + 100);
      await sale.connect(issuer).finalizeSale();
      return fixture;
    }

    it("reverts SaleNotFinalized when sale still active", async () => {
      const { sale } = await deployBaseSale({ owner, issuer, feeManager });
      await expect(sale.connect(owner).emergencyWithdraw(owner.address))
        .to.be.revertedWithCustomError(sale, "SaleNotFinalized");
    });

    it("reverts DelayNotElapsed before 90 days post-finalize", async () => {
      const { sale } = await finalized();
      await expect(sale.connect(owner).emergencyWithdraw(owner.address))
        .to.be.revertedWithCustomError(sale, "DelayNotElapsed");
    });

    it("reverts ZeroAddress when recipient is zero", async () => {
      const { sale } = await finalized();
      await time.increase(91 * 24 * 3600);
      await expect(sale.connect(owner).emergencyWithdraw(ethers.ZeroAddress))
        .to.be.revertedWithCustomError(sale, "ZeroAddress");
    });

    it("reverts NotAdmin when non-admin calls", async () => {
      const { sale } = await finalized();
      await time.increase(91 * 24 * 3600);
      await expect(sale.connect(investor1).emergencyWithdraw(investor1.address))
        .to.be.revertedWithCustomError(sale, "NotAdmin");
    });

    it("admin can withdraw remaining USDC after 90 days", async () => {
      const { sale, mockUsdc } = await finalized();
      await time.increase(91 * 24 * 3600);
      const recipient = otherAdmin.address;
      const balBefore = await mockUsdc.balanceOf(recipient);
      await sale.connect(owner).emergencyWithdraw(recipient);
      expect(await mockUsdc.balanceOf(recipient)).to.be.greaterThan(balBefore);
    });
  });

  // ──────────────────────────────────────────────────────────────────────
  // 20. Platform fee in _finalize
  // ──────────────────────────────────────────────────────────────────────
  describe("platform fee", () => {
    it("_finalize transfers exact fee to feeManager and records platformFeeCollected", async () => {
      const { sale, mockUsdc, saleStart, saleEnd } = await deployBaseSale({ owner, issuer, feeManager });
      await sale.connect(issuer).addPhase(
        "P1", PRICE_RAW, ALLOCATION, MIN_TOKENS, MAX_TOKENS, TOP_UP_MIN_TOKENS,
        saleStart, saleStart + 86400, false, FIXED,
      );
      await approveAndActivate(sale, owner, issuer);
      await time.increaseTo(saleStart + 10);

      // Buy 1000 tokens = $1000 USDC
      await mockUsdc.mint(investor1.address, ethers.parseUnits("50000", 6));
      await mockUsdc.connect(investor1).approve(await sale.getAddress(), 1000n * PRICE_RAW);
      await sale.connect(investor1).buy(0, 1000n);

      const fmBalBefore = await mockUsdc.balanceOf(feeManager.address);
      await time.increaseTo(saleEnd + 100);
      await sale.connect(issuer).finalizeSale();

      // Expected fee: 1000 USDC * 250 bps / 10000 = 25 USDC
      const expectedFee = (1000n * PRICE_RAW * FEE_BPS) / 10000n;
      expect(await mockUsdc.balanceOf(feeManager.address)).to.equal(fmBalBefore + expectedFee);
      expect(await sale.platformFeeCollected()).to.equal(expectedFee);
    });

    it("fee is capped by feeCapUsdc when calculated fee exceeds cap", async () => {
      // Use a tiny feeCap (e.g. 10 USDC) to force capping
      const ERC20 = await ethers.getContractFactory("MockERC20");
      const mockUsdc2 = await ERC20.deploy("Mock USDC", "USDC", 6);
      const mockToken2 = await ERC20.deploy("Test Token", "TST", 6);
      const MockIR = await ethers.getContractFactory("MockIdentityRegistry");
      const mockIR = await MockIR.deploy();
      const MSF = await ethers.getContractFactory("MockSaleFactory");
      const mockFactory = await MSF.deploy(owner.address);

      const now = await time.latest();
      const SaleFactory = await ethers.getContractFactory("Sale");
      const sale2 = await upgrades.deployProxy(SaleFactory, [
        await mockToken2.getAddress(), await mockUsdc2.getAddress(),
        await mockIR.getAddress(), issuer.address,
        await mockFactory.getAddress(), feeManager.address,
        SOFT_CAP, HARD_CAP, FEE_BPS,
        ethers.parseUnits("10", 6), // feeCapUsdc = 10 USDC (tiny)
        ethers.ZeroAddress,
        now + 60, now + SALE_DURATION, TOTAL_SUPPLY,
      ], { unsafeAllow: ["constructor"] });
      await mockToken2.mint(await sale2.getAddress(), ethers.parseUnits("50000", 6));

      const start2 = now + 60;
      await sale2.connect(issuer).addPhase(
        "P1", PRICE_RAW, ALLOCATION, MIN_TOKENS, MAX_TOKENS, TOP_UP_MIN_TOKENS,
        start2, start2 + 86400, false, FIXED,
      );
      await approveAndActivate(sale2, owner, issuer);
      await time.increaseTo(start2 + 10);

      await mockUsdc2.mint(investor1.address, ethers.parseUnits("50000", 6));
      await mockUsdc2.connect(investor1).approve(await sale2.getAddress(), 1000n * PRICE_RAW);
      await sale2.connect(investor1).buy(0, 1000n);

      const fmBalBefore = await mockUsdc2.balanceOf(feeManager.address);
      await time.increaseTo(now + SALE_DURATION + 100);
      await sale2.connect(issuer).finalizeSale();

      // Calculated fee = 25 USDC, capped at 10 USDC
      const cap = ethers.parseUnits("10", 6);
      expect(await mockUsdc2.balanceOf(feeManager.address)).to.equal(fmBalBefore + cap);
      expect(await sale2.platformFeeCollected()).to.equal(cap);
    });

    it("fee calc uses paymentContributedTotal only (OTC excluded)", async () => {
      // Deploy a sale with OTC enabled, do mixed buys, finalize, check fee
      const ERC20 = await ethers.getContractFactory("MockERC20");
      const mockUsdc = await ERC20.deploy("Mock USDC", "USDC", 6);
      const mockToken = await ERC20.deploy("Test Token", "TST", 6);
      const mockOtc = await ERC20.deploy("OTC", "OTC", 6);
      const MockIR = await ethers.getContractFactory("MockIdentityRegistry");
      const mockIR = await MockIR.deploy();
      const MSF = await ethers.getContractFactory("MockSaleFactory");
      const mockFactory = await MSF.deploy(owner.address);

      const now = await time.latest();
      const SaleFactory = await ethers.getContractFactory("Sale");
      const sale = await upgrades.deployProxy(SaleFactory, [
        await mockToken.getAddress(), await mockUsdc.getAddress(),
        await mockIR.getAddress(), issuer.address,
        await mockFactory.getAddress(), feeManager.address,
        SOFT_CAP, HARD_CAP, FEE_BPS, FEE_CAP,
        await mockOtc.getAddress(),
        now + 60, now + SALE_DURATION, TOTAL_SUPPLY,
      ], { unsafeAllow: ["constructor"] });
      await mockToken.mint(await sale.getAddress(), ethers.parseUnits("50000", 6));

      const start = now + 60;
      await sale.connect(issuer).addPhase(
        "P1", PRICE_RAW, ALLOCATION, MIN_TOKENS, MAX_TOKENS, TOP_UP_MIN_TOKENS,
        start, start + 86400, false, FIXED,
      );
      await approveAndActivate(sale, owner, issuer);
      await time.increaseTo(start + 10);

      // Buy 1000 USDC + 1000 OTC (enough to clear soft cap of 500 USDC)
      await mockUsdc.mint(investor1.address, 1000n * PRICE_RAW);
      await mockUsdc.connect(investor1).approve(await sale.getAddress(), 1000n * PRICE_RAW);
      await sale.connect(investor1).buy(0, 1000n);

      await mockOtc.mint(investor1.address, 1000n * PRICE_RAW);
      await mockOtc.connect(investor1).approve(await sale.getAddress(), 1000n * PRICE_RAW);
      await sale.connect(investor1).buyOTC(0, 1000n);

      await time.increaseTo(now + SALE_DURATION + 100);
      const fmBalBefore = await mockUsdc.balanceOf(feeManager.address);
      await sale.connect(issuer).finalizeSale();

      // Fee = 1000 USDC * 250bps / 10000 = 25 USDC (only from USDC buy, not OTC)
      const expectedFee = (1000n * PRICE_RAW * FEE_BPS) / 10000n;
      expect(await mockUsdc.balanceOf(feeManager.address)).to.equal(fmBalBefore + expectedFee);
    });
  });

  // ──────────────────────────────────────────────────────────────────────
  // 21. activateRefunds status gate
  // ──────────────────────────────────────────────────────────────────────
  describe("activateRefunds status gate", () => {
    it("reverts InvalidStatus when sale is Active", async () => {
      const { sale, saleStart } = await deployBaseSale({ owner, issuer, feeManager });
      await sale.connect(issuer).addPhase(
        "P1", PRICE_RAW, ALLOCATION, MIN_TOKENS, MAX_TOKENS, TOP_UP_MIN_TOKENS,
        saleStart, saleStart + 86400, false, FIXED,
      );
      await approveAndActivate(sale, owner, issuer);
      await expect(sale.connect(issuer).activateRefunds())
        .to.be.revertedWithCustomError(sale, "InvalidStatus");
    });

    it("reverts InvalidStatus when sale is FinalizedSuccess", async () => {
      const { sale, mockUsdc, saleStart, saleEnd } = await deployBaseSale({ owner, issuer, feeManager });
      await sale.connect(issuer).addPhase(
        "P1", PRICE_RAW, ALLOCATION, MIN_TOKENS, MAX_TOKENS, TOP_UP_MIN_TOKENS,
        saleStart, saleStart + 86400, false, FIXED,
      );
      await approveAndActivate(sale, owner, issuer);
      await time.increaseTo(saleStart + 10);
      await mockUsdc.mint(investor1.address, ethers.parseUnits("50000", 6));
      await mockUsdc.connect(investor1).approve(await sale.getAddress(), 1000n * PRICE_RAW);
      await sale.connect(investor1).buy(0, 1000n);
      await time.increaseTo(saleEnd + 100);
      await sale.connect(issuer).finalizeSale();

      await expect(sale.connect(issuer).activateRefunds())
        .to.be.revertedWithCustomError(sale, "InvalidStatus");
    });
  });

  // ──────────────────────────────────────────────────────────────────────
  // 22. Token decimals != 6 (18-decimal math validation)
  // ──────────────────────────────────────────────────────────────────────
  describe("18-decimal token math", () => {
    it("buy allocates correct raw tokens for 18-decimal project token", async () => {
      const ERC20 = await ethers.getContractFactory("MockERC20");
      const mockUsdc = await ERC20.deploy("Mock USDC", "USDC", 6);
      const mockToken18 = await ERC20.deploy("18 Test", "T18", 18); // 18 decimals
      const MockIR = await ethers.getContractFactory("MockIdentityRegistry");
      const mockIR = await MockIR.deploy();
      const MSF = await ethers.getContractFactory("MockSaleFactory");
      const mockFactory = await MSF.deploy(owner.address);

      const now = await time.latest();
      const SaleFactory = await ethers.getContractFactory("Sale");
      // totalTokenSupply in 18-dec raw
      const supply18 = ethers.parseUnits("100000", 18);
      const sale = await upgrades.deployProxy(SaleFactory, [
        await mockToken18.getAddress(), await mockUsdc.getAddress(),
        await mockIR.getAddress(), issuer.address,
        await mockFactory.getAddress(), feeManager.address,
        SOFT_CAP, HARD_CAP, FEE_BPS, FEE_CAP,
        ethers.ZeroAddress,
        now + 60, now + SALE_DURATION, supply18,
      ], { unsafeAllow: ["constructor"] });
      // Deposit plenty
      await mockToken18.mint(await sale.getAddress(), ethers.parseUnits("50000", 18));

      expect(await sale.tokenDecimals()).to.equal(18);

      const start = now + 60;
      await sale.connect(issuer).addPhase(
        "P1", PRICE_RAW, ethers.parseUnits("10000", 18),
        MIN_TOKENS, MAX_TOKENS, TOP_UP_MIN_TOKENS,
        start, start + 86400, false, FIXED,
      );
      await approveAndActivate(sale, owner, issuer);
      await time.increaseTo(start + 10);

      // Buy 100 whole tokens — should cost 100 * $1 = $100 USDC,
      // and transfer 100 * 1e18 raw to the investor
      await mockUsdc.mint(investor1.address, 100n * PRICE_RAW);
      await mockUsdc.connect(investor1).approve(await sale.getAddress(), 100n * PRICE_RAW);
      await sale.connect(investor1).buy(0, 100n);

      expect(await mockToken18.balanceOf(investor1.address)).to.equal(100n * BigInt(10) ** BigInt(18));
      expect(await sale.totalRaised()).to.equal(100n * PRICE_RAW);
      expect(await sale.totalTokenSold()).to.equal(100n * BigInt(10) ** BigInt(18));
    });
  });

  // ──────────────────────────────────────────────────────────────────────
  // 23. setOTCToken
  // ──────────────────────────────────────────────────────────────────────
  describe("setOTCToken", () => {
    it("issuer can set OTC token post-deploy", async () => {
      const ERC20 = await ethers.getContractFactory("MockERC20");
      const otc = await ERC20.deploy("OTC", "OTC", 6);
      const { sale } = await deployBaseSale({ owner, issuer, feeManager });
      await sale.connect(issuer).setOTCToken(await otc.getAddress());
      expect(await sale.otcToken()).to.equal(await otc.getAddress());
    });

    it("reverts when called by non-issuer", async () => {
      const { sale } = await deployBaseSale({ owner, issuer, feeManager });
      await expect(sale.connect(owner).setOTCToken(owner.address))
        .to.be.revertedWithCustomError(sale, "NotIssuer");
    });
  });

  // ──────────────────────────────────────────────────────────────────────
  // 24. Remaining mode — buy behavior
  // ──────────────────────────────────────────────────────────────────────
  describe("Remaining allocation mode", () => {
    it("Remaining-mode phase can sell up to totalTokenSupply", async () => {
      const { sale, mockUsdc, saleStart } = await deployBaseSale({
        owner, issuer, feeManager,
        totalTokenSupply: ethers.parseUnits("500", 6), // 500 tokens total
      });
      await sale.connect(issuer).addPhase(
        "P1", PRICE_RAW, 0n, // allocation=0 allowed in Remaining mode
        MIN_TOKENS, MAX_TOKENS, TOP_UP_MIN_TOKENS,
        saleStart, saleStart + 86400, false, REMAINING,
      );
      await approveAndActivate(sale, owner, issuer);
      await time.increaseTo(saleStart + 10);

      await mockUsdc.mint(investor1.address, ethers.parseUnits("50000", 6));
      await mockUsdc.connect(investor1).approve(await sale.getAddress(), 500n * PRICE_RAW);
      await sale.connect(investor1).buy(0, 500n); // consume all supply

      // Next buy by another investor reverts with TokenSupplyExceeded (Remaining mode)
      // Must be >= min (10) to pass the min check first
      await mockUsdc.mint(investor2.address, 20n * PRICE_RAW);
      await mockUsdc.connect(investor2).approve(await sale.getAddress(), 20n * PRICE_RAW);
      await expect(sale.connect(investor2).buy(0, 20n))
        .to.be.revertedWithCustomError(sale, "TokenSupplyExceeded");
    });
  });

  // ──────────────────────────────────────────────────────────────────────
  // 25. KYC gating + IssuerNotVerified (uses ConfigurableIdentityRegistry)
  // ──────────────────────────────────────────────────────────────────────
  describe("KYC & identity gating", () => {
    async function deploySaleWithConfigurableIR(defaultVerified: boolean) {
      const ERC20 = await ethers.getContractFactory("MockERC20");
      const mockUsdc = await ERC20.deploy("Mock USDC", "USDC", 6);
      const mockToken = await ERC20.deploy("Test Token", "TST", 6);

      const MockIR = await ethers.getContractFactory("MockIdentityRegistryConfigurable");
      const mockIR = await MockIR.deploy(defaultVerified);

      const MSF = await ethers.getContractFactory("MockSaleFactory");
      const mockFactory = await MSF.deploy(owner.address);

      const now = await time.latest();
      const start = now + 60;
      const end = now + SALE_DURATION;

      // Issuer must be verified for init to succeed
      if (!defaultVerified) {
        await mockIR.setVerified(issuer.address, true);
      }

      const SaleFactory = await ethers.getContractFactory("Sale");
      const sale = await upgrades.deployProxy(SaleFactory, [
        await mockToken.getAddress(), await mockUsdc.getAddress(),
        await mockIR.getAddress(), issuer.address,
        await mockFactory.getAddress(), feeManager.address,
        SOFT_CAP, HARD_CAP, FEE_BPS, FEE_CAP,
        ethers.ZeroAddress,
        start, end, TOTAL_SUPPLY,
      ], { unsafeAllow: ["constructor"] });
      await mockToken.mint(await sale.getAddress(), ethers.parseUnits("50000", 6));

      return { sale, mockUsdc, mockToken, mockIR, saleStart: start };
    }

    it("reverts IssuerNotVerified when issuer is not on identity registry at init", async () => {
      const ERC20 = await ethers.getContractFactory("MockERC20");
      const mockUsdc = await ERC20.deploy("Mock USDC", "USDC", 6);
      const mockToken = await ERC20.deploy("Test Token", "TST", 6);

      const MockIR = await ethers.getContractFactory("MockIdentityRegistryConfigurable");
      const mockIR = await MockIR.deploy(false); // default = NOT verified
      // Explicitly leave issuer unverified

      const MSF = await ethers.getContractFactory("MockSaleFactory");
      const mockFactory = await MSF.deploy(owner.address);

      const now = await time.latest();
      const SaleFactory = await ethers.getContractFactory("Sale");

      await expect(
        upgrades.deployProxy(SaleFactory, [
          await mockToken.getAddress(), await mockUsdc.getAddress(),
          await mockIR.getAddress(), issuer.address,
          await mockFactory.getAddress(), feeManager.address,
          SOFT_CAP, HARD_CAP, FEE_BPS, FEE_CAP,
          ethers.ZeroAddress,
          now + 60, now + SALE_DURATION, TOTAL_SUPPLY,
        ], { unsafeAllow: ["constructor"] }),
      ).to.be.revertedWithCustomError(SaleFactory, "IssuerNotVerified");
    });

    it("reverts KYCRequired when unverified investor tries to buy", async () => {
      const { sale, mockUsdc, mockIR, saleStart } = await deploySaleWithConfigurableIR(false);
      // Only issuer is verified; investor1 is NOT
      await sale.connect(issuer).addPhase(
        "P1", PRICE_RAW, ALLOCATION, MIN_TOKENS, MAX_TOKENS, TOP_UP_MIN_TOKENS,
        saleStart, saleStart + 86400, false, FIXED,
      );
      await approveAndActivate(sale, owner, issuer);
      await time.increaseTo(saleStart + 10);

      await mockUsdc.mint(investor1.address, 100n * PRICE_RAW);
      await mockUsdc.connect(investor1).approve(await sale.getAddress(), 100n * PRICE_RAW);

      await expect(sale.connect(investor1).buy(0, 100n))
        .to.be.revertedWithCustomError(sale, "KYCRequired");
    });

    it("verified investor can buy", async () => {
      const { sale, mockUsdc, mockIR, saleStart } = await deploySaleWithConfigurableIR(false);
      await mockIR.setVerified(investor1.address, true);
      await sale.connect(issuer).addPhase(
        "P1", PRICE_RAW, ALLOCATION, MIN_TOKENS, MAX_TOKENS, TOP_UP_MIN_TOKENS,
        saleStart, saleStart + 86400, false, FIXED,
      );
      await approveAndActivate(sale, owner, issuer);
      await time.increaseTo(saleStart + 10);

      await mockUsdc.mint(investor1.address, 100n * PRICE_RAW);
      await mockUsdc.connect(investor1).approve(await sale.getAddress(), 100n * PRICE_RAW);
      await expect(sale.connect(investor1).buy(0, 100n)).to.not.be.reverted;
    });
  });
});
