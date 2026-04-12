/**
 * E2E test suite: Direct Mode Sale + RedemptionManager flows
 *
 * Covers:
 * 1. Direct mode full lifecycle (buy -> immediate token transfer, no fractions)
 * 2. Direct mode with multiple buyers
 * 3. Redemption full flow (request -> fulfil -> burn)
 * 4. Redemption cancel flow (request -> cancel -> tokens returned)
 */
import { expect } from "chai";
import { ethers, upgrades } from "hardhat";
import { time } from "@nomicfoundation/hardhat-network-helpers";
import type { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";

// ── Sale constants ──────────────────────────────────────────────────────────
const SOFT_CAP = ethers.parseUnits("100", 6);
const HARD_CAP = ethers.parseUnits("10000", 6);
const FEE_BPS = 250n;
const FEE_CAP = ethers.parseUnits("50000", 6);
const TOTAL_SUPPLY = ethers.parseUnits("10000", 6); // 10k tokens (6-dec)
const SALE_DURATION = 30 * 24 * 3600;

const PRICE_RAW = ethers.parseUnits("1", 6); // 1 USDC per whole token
const ALLOCATION = ethers.parseUnits("5000", 6); // 5k tokens (raw)
const MIN_TOKENS = 1n;
const MAX_TOKENS = 5000n;
const TOP_UP_MIN_TOKENS = 1n;

const FIXED = 0;

// SaleStatus enum
const STATUS_DRAFT = 0;
const STATUS_ACTIVE = 1;
const STATUS_SUCCESS = 3;
const STATUS_FAILED = 4;

// RedemptionStatus enum
const REDEMPTION_PENDING = 0;
const REDEMPTION_FULFILLED = 2;
const REDEMPTION_CANCELLED = 3;

// FulfillmentMethod enum
const CASH = 0;
const PHYSICAL = 1;

describe("E2E: Direct Mode Sale + Redemption", () => {
  let admin: SignerWithAddress;
  let issuer: SignerWithAddress;
  let feeManager: SignerWithAddress;
  let buyerA: SignerWithAddress;
  let buyerB: SignerWithAddress;

  before(async () => {
    [admin, issuer, feeManager, buyerA, buyerB] = await ethers.getSigners();
  });

  // ── Helpers ─────────────────────────────────────────────────────────────
  async function deployDirectSale() {
    const ERC20 = await ethers.getContractFactory("MockERC20");
    const usdc = await ERC20.deploy("Mock USDC", "USDC", 6);
    const projectToken = await ERC20.deploy("Gold Token", "WMAU", 6);

    const MockIR = await ethers.getContractFactory("MockIdentityRegistry");
    const registry = await MockIR.deploy();

    const MSF = await ethers.getContractFactory("MockSaleFactory");
    const mockFactory = await MSF.deploy(admin.address);

    const now = await time.latest();
    const saleStart = now + 60;
    const saleEnd = now + SALE_DURATION;

    const SaleFactory = await ethers.getContractFactory("Sale");
    const sale = await upgrades.deployProxy(SaleFactory, [
      await projectToken.getAddress(),
      await usdc.getAddress(),
      await registry.getAddress(),
      issuer.address,
      await mockFactory.getAddress(),
      feeManager.address,
      SOFT_CAP,
      HARD_CAP,
      FEE_BPS,
      FEE_CAP,
      ethers.ZeroAddress, // no OTC
      saleStart,
      saleEnd,
      TOTAL_SUPPLY,
    ], { unsafeAllow: ["constructor"] });

    // Direct mode: deposit project tokens into the sale contract directly
    await projectToken.mint(await sale.getAddress(), TOTAL_SUPPLY);

    // Add a phase
    await sale.connect(issuer).addPhase(
      "Public Round",
      PRICE_RAW,
      ALLOCATION,
      MIN_TOKENS,
      MAX_TOKENS,
      TOP_UP_MIN_TOKENS,
      saleStart,
      saleEnd,
      false,
      FIXED,
    );

    // Approve + activate
    await sale.connect(admin).approveSale();
    await sale.connect(issuer).activate();

    // Advance to sale start
    await time.increaseTo(saleStart + 1);

    return { sale, usdc, projectToken, registry, saleStart, saleEnd };
  }

  async function fundBuyer(usdc: any, buyer: SignerWithAddress, sale: any, amount: bigint) {
    await usdc.mint(buyer.address, amount);
    await usdc.connect(buyer).approve(await sale.getAddress(), amount);
  }

  // ────────────────────────────────────────────────────────────────────────
  // Test 1: Direct mode full lifecycle
  // ────────────────────────────────────────────────────────────────────────
  describe("1. Direct mode full lifecycle", () => {
    it("buyer receives project tokens immediately, no fractions minted, sale finalizes", async () => {
      const { sale, usdc, projectToken, saleEnd } = await deployDirectSale();

      // Fund buyer
      const buyQty = 100n;
      const cost = buyQty * PRICE_RAW; // 100 USDC
      await fundBuyer(usdc, buyerA, sale, cost);

      // Confirm Direct mode (saleMode == 0)
      expect(await sale.saleMode()).to.equal(0);

      // Buy 100 whole tokens
      await sale.connect(buyerA).buy(0, buyQty);

      // Buyer should have project tokens immediately
      const rawTokens = buyQty * 10n ** 6n; // 100 tokens in raw 6-dec units
      expect(await projectToken.balanceOf(buyerA.address)).to.equal(rawTokens);

      // No fractions should exist — saleMode is Direct so fractionToken is address(0)
      // We verify by checking the sale's fractionToken is the zero address
      expect(await sale.fractionToken()).to.equal(ethers.ZeroAddress);

      // Verify contribution tracking
      const contrib = await sale.contributions(buyerA.address);
      expect(contrib.tokensAllocated).to.equal(rawTokens);
      expect(contrib.claimed).to.be.true; // Direct mode marks as claimed

      // Advance past phase end and close the sale
      await time.increaseTo(saleEnd + 1);
      await sale.connect(issuer).closeSale(false);

      // Verify finalized status (softCap met: 100 USDC >= 100 USDC softCap)
      expect(await sale.status()).to.equal(STATUS_SUCCESS);
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  // Test 2: Direct mode — multiple buyers
  // ────────────────────────────────────────────────────────────────────────
  describe("2. Direct mode — multiple buyers", () => {
    it("two buyers each receive correct token amounts, totalTokenSold matches", async () => {
      const { sale, usdc, projectToken, saleEnd } = await deployDirectSale();

      const qtyA = 200n;
      const qtyB = 350n;
      await fundBuyer(usdc, buyerA, sale, qtyA * PRICE_RAW);
      await fundBuyer(usdc, buyerB, sale, qtyB * PRICE_RAW);

      // Both buy
      await sale.connect(buyerA).buy(0, qtyA);
      await sale.connect(buyerB).buy(0, qtyB);

      const rawA = qtyA * 10n ** 6n;
      const rawB = qtyB * 10n ** 6n;

      // Verify both received correct amounts
      expect(await projectToken.balanceOf(buyerA.address)).to.equal(rawA);
      expect(await projectToken.balanceOf(buyerB.address)).to.equal(rawB);

      // Verify total sold
      expect(await sale.totalTokenSold()).to.equal(rawA + rawB);

      // Verify total raised (USDC)
      expect(await sale.totalRaised()).to.equal((qtyA + qtyB) * PRICE_RAW);

      // Close sale
      await time.increaseTo(saleEnd + 1);
      await sale.connect(issuer).closeSale(false);
      expect(await sale.status()).to.equal(STATUS_SUCCESS);
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  // Test 3: Redemption full flow
  // ────────────────────────────────────────────────────────────────────────
  describe("3. Redemption full flow (request -> fulfil -> burn)", () => {
    it("holder requests, issuer fulfils, tokens are burned", async () => {
      // Deploy CiretaToken + MockCompliance + MockIdentityRegistry
      const MockIR = await ethers.getContractFactory("MockIdentityRegistry");
      const registry = await MockIR.deploy();

      const MockCompliance = await ethers.getContractFactory("MockCompliance");
      const compliance = await MockCompliance.deploy();

      const CiretaToken = await ethers.getContractFactory("CiretaToken");
      const ciretaToken = await upgrades.deployProxy(CiretaToken, [
        "Gold Token",
        "WMAU",
        6,
        await registry.getAddress(),
        await compliance.getAddress(),
        issuer.address,  // owner
        admin.address,   // admin
      ], { unsafeAllow: ["constructor"] });

      // Mint tokens to holder (buyerA)
      const mintAmount = ethers.parseUnits("500", 6);
      await ciretaToken.connect(issuer).mint(buyerA.address, mintAmount);
      expect(await ciretaToken.balanceOf(buyerA.address)).to.equal(mintAmount);

      const supplyBefore = await ciretaToken.totalSupply();

      // Deploy RedemptionManager
      const RMFactory = await ethers.getContractFactory("RedemptionManager");
      const redemption = await upgrades.deployProxy(RMFactory, [
        await ciretaToken.getAddress(),
        issuer.address, // owner of RedemptionManager
      ], { unsafeAllow: ["constructor"] });

      // Grant SUPPLY_ROLE to RedemptionManager so it can burn tokens
      const SUPPLY_ROLE = await ciretaToken.SUPPLY_ROLE();
      await ciretaToken.connect(issuer).grantRole(SUPPLY_ROLE, await redemption.getAddress());

      // Holder approves redemption manager
      const redeemAmount = ethers.parseUnits("200", 6);
      await ciretaToken.connect(buyerA).approve(await redemption.getAddress(), redeemAmount);

      // Holder requests redemption (Cash method)
      await expect(
        redemption.connect(buyerA).requestRedemption(redeemAmount, CASH),
      ).to.emit(redemption, "RedemptionRequested").withArgs(0, buyerA.address, redeemAmount);

      // Tokens should be transferred from holder to RedemptionManager
      expect(await ciretaToken.balanceOf(buyerA.address)).to.equal(mintAmount - redeemAmount);
      expect(await ciretaToken.balanceOf(await redemption.getAddress())).to.equal(redeemAmount);

      // Verify request state
      const req = await redemption.requests(0);
      expect(req.investor).to.equal(buyerA.address);
      expect(req.amount).to.equal(redeemAmount);
      expect(req.status).to.equal(REDEMPTION_PENDING);

      // Issuer fulfils
      await expect(
        redemption.connect(issuer).fulfil(0),
      ).to.emit(redemption, "RedemptionFulfilled").withArgs(0, buyerA.address);

      // Tokens should be burned — total supply decreased
      const supplyAfter = await ciretaToken.totalSupply();
      expect(supplyAfter).to.equal(supplyBefore - redeemAmount);

      // RedemptionManager balance should be 0 (tokens were burned)
      expect(await ciretaToken.balanceOf(await redemption.getAddress())).to.equal(0n);

      // Request status should be Fulfilled
      const reqAfter = await redemption.requests(0);
      expect(reqAfter.status).to.equal(REDEMPTION_FULFILLED);
      expect(reqAfter.fulfilledAt).to.be.gt(0n);
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  // Test 4: Redemption — cancel flow
  // ────────────────────────────────────────────────────────────────────────
  describe("4. Redemption — cancel flow (tokens returned to holder)", () => {
    it("holder requests, issuer cancels, tokens returned", async () => {
      const MockIR = await ethers.getContractFactory("MockIdentityRegistry");
      const registry = await MockIR.deploy();

      const MockCompliance = await ethers.getContractFactory("MockCompliance");
      const compliance = await MockCompliance.deploy();

      const CiretaToken = await ethers.getContractFactory("CiretaToken");
      const ciretaToken = await upgrades.deployProxy(CiretaToken, [
        "Gold Token",
        "WMAU",
        6,
        await registry.getAddress(),
        await compliance.getAddress(),
        issuer.address,
        admin.address,
      ], { unsafeAllow: ["constructor"] });

      const mintAmount = ethers.parseUnits("500", 6);
      await ciretaToken.connect(issuer).mint(buyerA.address, mintAmount);

      const RMFactory = await ethers.getContractFactory("RedemptionManager");
      const redemption = await upgrades.deployProxy(RMFactory, [
        await ciretaToken.getAddress(),
        issuer.address,
      ], { unsafeAllow: ["constructor"] });

      // Grant SUPPLY_ROLE (needed for fulfil, but also set up for completeness)
      const SUPPLY_ROLE = await ciretaToken.SUPPLY_ROLE();
      await ciretaToken.connect(issuer).grantRole(SUPPLY_ROLE, await redemption.getAddress());

      // Approve and request redemption
      const redeemAmount = ethers.parseUnits("150", 6);
      await ciretaToken.connect(buyerA).approve(await redemption.getAddress(), redeemAmount);
      await redemption.connect(buyerA).requestRedemption(redeemAmount, PHYSICAL);

      // Confirm tokens left holder
      expect(await ciretaToken.balanceOf(buyerA.address)).to.equal(mintAmount - redeemAmount);
      expect(await ciretaToken.balanceOf(await redemption.getAddress())).to.equal(redeemAmount);

      const supplyBefore = await ciretaToken.totalSupply();

      // Issuer cancels the request
      await expect(
        redemption.connect(issuer).cancel(0),
      ).to.emit(redemption, "RedemptionCancelled").withArgs(0);

      // Tokens should be returned to holder
      expect(await ciretaToken.balanceOf(buyerA.address)).to.equal(mintAmount);
      expect(await ciretaToken.balanceOf(await redemption.getAddress())).to.equal(0n);

      // Total supply unchanged (no burn happened)
      expect(await ciretaToken.totalSupply()).to.equal(supplyBefore);

      // Request status should be Cancelled
      const req = await redemption.requests(0);
      expect(req.status).to.equal(REDEMPTION_CANCELLED);
    });

    it("holder can also cancel their own pending request", async () => {
      const MockIR = await ethers.getContractFactory("MockIdentityRegistry");
      const registry = await MockIR.deploy();

      const MockCompliance = await ethers.getContractFactory("MockCompliance");
      const compliance = await MockCompliance.deploy();

      const CiretaToken = await ethers.getContractFactory("CiretaToken");
      const ciretaToken = await upgrades.deployProxy(CiretaToken, [
        "Gold Token", "WMAU", 6,
        await registry.getAddress(),
        await compliance.getAddress(),
        issuer.address, admin.address,
      ], { unsafeAllow: ["constructor"] });

      const mintAmount = ethers.parseUnits("300", 6);
      await ciretaToken.connect(issuer).mint(buyerA.address, mintAmount);

      const RMFactory = await ethers.getContractFactory("RedemptionManager");
      const redemption = await upgrades.deployProxy(RMFactory, [
        await ciretaToken.getAddress(),
        issuer.address,
      ], { unsafeAllow: ["constructor"] });

      const SUPPLY_ROLE = await ciretaToken.SUPPLY_ROLE();
      await ciretaToken.connect(issuer).grantRole(SUPPLY_ROLE, await redemption.getAddress());

      const redeemAmount = ethers.parseUnits("100", 6);
      await ciretaToken.connect(buyerA).approve(await redemption.getAddress(), redeemAmount);
      await redemption.connect(buyerA).requestRedemption(redeemAmount, CASH);

      // Holder cancels their own request
      await redemption.connect(buyerA).cancel(0);

      expect(await ciretaToken.balanceOf(buyerA.address)).to.equal(mintAmount);
      const req = await redemption.requests(0);
      expect(req.status).to.equal(REDEMPTION_CANCELLED);
    });
  });
});
