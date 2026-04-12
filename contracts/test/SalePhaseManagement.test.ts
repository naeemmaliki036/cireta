/**
 * Sale.sol — Phase management tests.
 *
 * Covers:
 * - shortenPhase() — end a phase early
 * - advancePhaseStart() — bring a future phase forward
 * - Unsold rollover — prior ended phases' unsold tokens flow into next phase
 * - getRemainingSupply() view
 * - Two-step "close and start next": shortenPhase + addPhase
 */
import { expect } from "chai";
import { ethers, upgrades } from "hardhat";
import { time } from "@nomicfoundation/hardhat-network-helpers";

const SOFT_CAP = ethers.parseUnits("100", 6);
const HARD_CAP = ethers.parseUnits("50000", 6);
const FEE_BPS = 0n;
const FEE_CAP = 0n;
const TOTAL_SUPPLY = ethers.parseUnits("10000", 6); // 10k tokens
const PRICE = ethers.parseUnits("1", 6); // 1 USDC per token
const SALE_DURATION = 90 * 86400;
const FIXED = 0;
const REMAINING = 1;

async function deploySale(owner: any, issuer: any, feeManager: any) {
  const ERC20 = await ethers.getContractFactory("MockERC20");
  const usdc = await ERC20.deploy("USDC", "USDC", 6);
  const token = await ERC20.deploy("TST", "TST", 6);
  const MockIR = await ethers.getContractFactory("MockIdentityRegistry");
  const ir = await MockIR.deploy();
  const MSF = await ethers.getContractFactory("MockSaleFactory");
  const factory = await MSF.deploy(owner.address);

  const now = await time.latest();
  const start = now + 60;
  const end = now + SALE_DURATION;

  const Sale = await ethers.getContractFactory("Sale");
  const sale = await upgrades.deployProxy(Sale, [
    await token.getAddress(), await usdc.getAddress(), await ir.getAddress(),
    issuer.address, await factory.getAddress(), feeManager.address,
    SOFT_CAP, HARD_CAP, FEE_BPS, FEE_CAP,
    ethers.ZeroAddress, start, end, TOTAL_SUPPLY,
  ], { unsafeAllow: ["constructor"] });

  await token.mint(await sale.getAddress(), TOTAL_SUPPLY);
  return { sale, usdc, token, ir, saleStart: start, saleEnd: end };
}

describe("Sale — Phase Management", () => {
  let owner: any, issuer: any, feeManager: any, investor: any;

  beforeEach(async () => {
    [owner, issuer, feeManager, investor] = await ethers.getSigners();
  });

  describe("shortenPhase", () => {
    it("issuer can shorten an active phase", async () => {
      const { sale, saleStart } = await deploySale(owner, issuer, feeManager);
      const phaseEnd = saleStart + 30 * 86400;
      await sale.connect(issuer).addPhase("Seed", PRICE, ethers.parseUnits("5000", 6), 1n, 5000n, 1n, saleStart, phaseEnd, false, FIXED);
      await sale.connect(owner).approveSale();
      await sale.connect(issuer).activate();
      await time.increaseTo(saleStart + 100);

      const newEnd = saleStart + 200;
      await expect(sale.connect(issuer).shortenPhase(0, newEnd))
        .to.emit(sale, "PhaseShortened").withArgs(0, newEnd);

      const phase = await sale.phases(0);
      expect(phase.endTime).to.equal(newEnd);
    });

    it("reverts if newEndTime >= current endTime", async () => {
      const { sale, saleStart } = await deploySale(owner, issuer, feeManager);
      const phaseEnd = saleStart + 30 * 86400;
      await sale.connect(issuer).addPhase("Seed", PRICE, ethers.parseUnits("5000", 6), 1n, 5000n, 1n, saleStart, phaseEnd, false, FIXED);

      await expect(sale.connect(issuer).shortenPhase(0, phaseEnd + 1))
        .to.be.revertedWithCustomError(sale, "ShortenMustReduce");
    });

    it("reverts if newEndTime < block.timestamp", async () => {
      const { sale, saleStart } = await deploySale(owner, issuer, feeManager);
      const phaseEnd = saleStart + 30 * 86400;
      await sale.connect(issuer).addPhase("Seed", PRICE, ethers.parseUnits("5000", 6), 1n, 5000n, 1n, saleStart, phaseEnd, false, FIXED);
      await sale.connect(owner).approveSale();
      await sale.connect(issuer).activate();
      await time.increaseTo(saleStart + 100);

      await expect(sale.connect(issuer).shortenPhase(0, saleStart - 1))
        .to.be.revertedWithCustomError(sale, "PhaseInPast");
    });

    it("non-issuer cannot shorten", async () => {
      const { sale, saleStart } = await deploySale(owner, issuer, feeManager);
      await sale.connect(issuer).addPhase("Seed", PRICE, ethers.parseUnits("5000", 6), 1n, 5000n, 1n, saleStart, saleStart + 86400, false, FIXED);
      await expect(sale.connect(investor).shortenPhase(0, saleStart + 100))
        .to.be.revertedWithCustomError(sale, "NotIssuer");
    });
  });

  describe("advancePhaseStart", () => {
    it("issuer can advance a future phase start time", async () => {
      const { sale, saleStart } = await deploySale(owner, issuer, feeManager);
      // Phase starts far in the future
      const phaseStart = saleStart + 30 * 86400;
      const phaseEnd = saleStart + 60 * 86400;
      await sale.connect(issuer).addPhase("Public", PRICE, ethers.parseUnits("5000", 6), 1n, 5000n, 1n, phaseStart, phaseEnd, false, FIXED);

      const newStart = saleStart + 100; // much earlier
      await expect(sale.connect(issuer).advancePhaseStart(0, newStart))
        .to.emit(sale, "PhaseAdvanced").withArgs(0, newStart);

      const phase = await sale.phases(0);
      expect(phase.startTime).to.equal(newStart);
    });

    it("reverts if phase already started", async () => {
      const { sale, saleStart } = await deploySale(owner, issuer, feeManager);
      await sale.connect(issuer).addPhase("Seed", PRICE, ethers.parseUnits("5000", 6), 1n, 5000n, 1n, saleStart, saleStart + 86400, false, FIXED);
      await sale.connect(owner).approveSale();
      await sale.connect(issuer).activate();
      await time.increaseTo(saleStart + 10);

      await expect(sale.connect(issuer).advancePhaseStart(0, saleStart - 10))
        .to.be.revertedWithCustomError(sale, "PhaseAlreadyStarted");
    });

    it("reverts if newStartTime >= current startTime", async () => {
      const { sale, saleStart } = await deploySale(owner, issuer, feeManager);
      const phaseStart = saleStart + 1000;
      await sale.connect(issuer).addPhase("Public", PRICE, ethers.parseUnits("5000", 6), 1n, 5000n, 1n, phaseStart, phaseStart + 86400, false, FIXED);

      await expect(sale.connect(issuer).advancePhaseStart(0, phaseStart + 1))
        .to.be.revertedWithCustomError(sale, "AdvanceMustReduce");
    });
  });

  describe("two-step: shortenPhase + addPhase", () => {
    it("close sold-out phase and immediately start next", async () => {
      const { sale, usdc, saleStart, saleEnd } = await deploySale(owner, issuer, feeManager);
      const phase1End = saleStart + 30 * 86400;
      await sale.connect(issuer).addPhase("Seed", PRICE, ethers.parseUnits("3000", 6), 1n, 5000n, 1n, saleStart, phase1End, false, FIXED);
      await sale.connect(owner).approveSale();
      await sale.connect(issuer).activate();
      await time.increaseTo(saleStart + 10);

      // Investor buys all 3000 tokens
      await usdc.mint(investor.address, ethers.parseUnits("3000", 6));
      await usdc.connect(investor).approve(await sale.getAddress(), ethers.parseUnits("3000", 6));
      await sale.connect(investor).buy(0, 3000n);

      // Phase sold out — shorten to now
      const now = await time.latest();
      await sale.connect(issuer).shortenPhase(0, now + 1);

      // Advance time past shortened end
      await time.increaseTo(now + 2);

      // Add next phase starting immediately
      const newNow = await time.latest();
      await sale.connect(issuer).addPhase("Public", PRICE, ethers.parseUnits("7000", 6), 1n, 7000n, 1n, newNow + 1, saleEnd, false, FIXED);

      // Verify both phases exist
      const p0 = await sale.phases(0);
      const p1 = await sale.phases(1);
      expect(p0.sold).to.equal(ethers.parseUnits("3000", 6));
      expect(p1.allocation).to.equal(ethers.parseUnits("7000", 6));
    });
  });

  describe("unsold rollover", () => {
    it("next phase can sell unsold tokens from prior ended phase", async () => {
      const { sale, usdc, saleStart, saleEnd } = await deploySale(owner, issuer, feeManager);

      // Phase 0: Fixed 6000 tokens, but only 1000 sold
      const p0End = saleStart + 1000;
      await sale.connect(issuer).addPhase("Seed", PRICE, ethers.parseUnits("6000", 6), 1n, 6000n, 1n, saleStart, p0End, false, FIXED);
      await sale.connect(owner).approveSale();
      await sale.connect(issuer).activate();
      await time.increaseTo(saleStart + 10);

      await usdc.mint(investor.address, ethers.parseUnits("10000", 6));
      await usdc.connect(investor).approve(await sale.getAddress(), ethers.parseUnits("10000", 6));
      await sale.connect(investor).buy(0, 1000n); // buy 1000 out of 6000

      // Phase 0 ends with 5000 unsold
      await time.increaseTo(p0End + 1);

      // Phase 1: Fixed 4000 tokens — but effective = 4000 + 5000 unsold = 9000
      const p1Start = p0End + 10;
      const p1End = saleEnd;
      await sale.connect(issuer).addPhase("Public", PRICE, ethers.parseUnits("4000", 6), 1n, 9000n, 1n, p1Start, p1End, false, FIXED);
      await time.increaseTo(p1Start + 1);

      // Investor buys 8000 — exceeds Phase 1's base allocation (4000) but within effective (9000)
      await sale.connect(investor).buy(1, 8000n);
      expect(await sale.totalTokenSold()).to.equal(ethers.parseUnits("9000", 6));
    });

    it("without rollover, phase 1 would reject the excess buy", async () => {
      // This test verifies the rollover is actually working by checking that
      // the effective allocation > base allocation
      const { sale, usdc, saleStart, saleEnd } = await deploySale(owner, issuer, feeManager);

      const p0End = saleStart + 1000;
      await sale.connect(issuer).addPhase("Seed", PRICE, ethers.parseUnits("6000", 6), 1n, 6000n, 1n, saleStart, p0End, false, FIXED);
      await sale.connect(owner).approveSale();
      await sale.connect(issuer).activate();
      await time.increaseTo(saleStart + 10);

      // Don't buy anything in Phase 0 — all 6000 unsold
      await time.increaseTo(p0End + 1);

      // Phase 1: Fixed only 1000 — but effective = 1000 + 6000 = 7000
      const p1Start = p0End + 10;
      await sale.connect(issuer).addPhase("Public", PRICE, ethers.parseUnits("1000", 6), 1n, 7000n, 1n, p1Start, saleEnd, false, FIXED);
      await time.increaseTo(p1Start + 1);

      await usdc.mint(investor.address, ethers.parseUnits("5000", 6));
      await usdc.connect(investor).approve(await sale.getAddress(), ethers.parseUnits("5000", 6));

      // Buy 5000 — would fail without rollover (base alloc = 1000)
      await expect(sale.connect(investor).buy(1, 5000n)).to.not.be.reverted;
      expect(await sale.totalTokenSold()).to.equal(ethers.parseUnits("5000", 6));
    });
  });

  describe("getRemainingSupply", () => {
    it("returns full supply before any buys", async () => {
      const { sale } = await deploySale(owner, issuer, feeManager);
      expect(await sale.getRemainingSupply()).to.equal(TOTAL_SUPPLY);
    });

    it("decreases after buys", async () => {
      const { sale, usdc, saleStart } = await deploySale(owner, issuer, feeManager);
      await sale.connect(issuer).addPhase("Seed", PRICE, ethers.parseUnits("5000", 6), 1n, 5000n, 1n, saleStart, saleStart + 86400, false, FIXED);
      await sale.connect(owner).approveSale();
      await sale.connect(issuer).activate();
      await time.increaseTo(saleStart + 10);

      await usdc.mint(investor.address, ethers.parseUnits("100", 6));
      await usdc.connect(investor).approve(await sale.getAddress(), ethers.parseUnits("100", 6));
      await sale.connect(investor).buy(0, 100n);

      expect(await sale.getRemainingSupply()).to.equal(TOTAL_SUPPLY - ethers.parseUnits("100", 6));
    });
  });
});
