/**
 * E2E test suite: Fraction Transfer + Recovery flows
 *
 * Covers the full lifecycle:
 * 1. USDC buy → transfer fractions → new holder claims
 * 2. OTC operator buy → transfer ID=2 to buyer → buyer claims
 * 3. Partial vesting: multi-claim after transfer
 * 4. Fraction recovery (RECOVERY_ROLE, both IDs, cross-user)
 * 5. ERC-3643 forceTransfer (cross-user)
 * 6. ERC-3643 recoveryAddress (simple mode, address(0))
 * 7. Transfer to unverified wallet reverts
 * 8. Claim burns fractions (prevents double-claim after transfer)
 */
import { expect } from "chai";
import { ethers, upgrades } from "hardhat";
import { time } from "@nomicfoundation/hardhat-network-helpers";
import type { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";

const CLIFF = 90 * 24 * 3600;
const VESTING = 365 * 24 * 3600;
const PRICE_RAW = ethers.parseUnits("1", 6); // 1 USDC per token
const SOFT_CAP = ethers.parseUnits("100", 6);
const HARD_CAP = ethers.parseUnits("10000", 6);
const FEE_BPS = 0n;
const FEE_CAP = 0n;
const TOTAL_SUPPLY = ethers.parseUnits("10000", 6);
const SALE_DURATION = 60 * 24 * 3600;

const MINTER_ROLE = ethers.keccak256(ethers.toUtf8Bytes("MINTER_ROLE"));
const BURNER_ROLE = ethers.keccak256(ethers.toUtf8Bytes("BURNER_ROLE"));
const RECOVERY_ROLE = ethers.keccak256(ethers.toUtf8Bytes("RECOVERY_ROLE"));

describe("E2E: Fraction Transfer + Recovery", () => {
  let sale: any;
  let vault: any;
  let fractionToken: any;
  let projectToken: any;
  let usdc: any;
  let otcToken: any;
  let registry: any;

  let admin: SignerWithAddress;
  let issuer: SignerWithAddress;
  let feeManager: SignerWithAddress;
  let operator: SignerWithAddress; // OTC operator
  let buyerA: SignerWithAddress;
  let buyerB: SignerWithAddress;
  let unverified: SignerWithAddress;
  let recoverer: SignerWithAddress;

  async function deployFullStack() {
    [admin, issuer, feeManager, operator, buyerA, buyerB, unverified, recoverer] =
      await ethers.getSigners();

    // Configurable identity registry
    const MockIR = await ethers.getContractFactory("MockIdentityRegistryConfigurable");
    registry = await MockIR.deploy(false);
    // Verify everyone except `unverified`
    for (const s of [admin, issuer, operator, buyerA, buyerB, recoverer]) {
      await registry.setVerified(s.address, true);
    }

    // Tokens
    const ERC20 = await ethers.getContractFactory("MockERC20");
    usdc = await ERC20.deploy("USDC", "USDC", 6);
    projectToken = await ERC20.deploy("Gold Token", "WMAU", 6);

    // OTC token
    const OTC = await ethers.getContractFactory("IssuerOTCToken");
    otcToken = await upgrades.deployProxy(OTC, [
      "OTC Voucher", "OTC",
      issuer.address,
      await registry.getAddress(),
    ], { unsafeAllow: ["constructor"] });

    // Sale factory mock
    const MSF = await ethers.getContractFactory("MockSaleFactory");
    const mockFactory = await MSF.deploy(admin.address);

    // Deploy Sale
    const now = await time.latest();
    const saleStart = now + 60;
    const saleEnd = now + SALE_DURATION;

    const SaleFactory = await ethers.getContractFactory("Sale");
    sale = await upgrades.deployProxy(SaleFactory, [
      await projectToken.getAddress(),
      await usdc.getAddress(),
      await registry.getAddress(),
      issuer.address,
      await mockFactory.getAddress(),
      feeManager.address,
      SOFT_CAP, HARD_CAP, FEE_BPS, FEE_CAP,
      await otcToken.getAddress(),
      saleStart, saleEnd,
      TOTAL_SUPPLY,
    ], { unsafeAllow: ["constructor"] });

    // Deploy Vault
    const VaultFactory = await ethers.getContractFactory("CiretaVault");
    vault = await upgrades.deployProxy(VaultFactory, [
      await projectToken.getAddress(),
      ethers.ZeroAddress, // fraction set later
      await registry.getAddress(),
      CLIFF, VESTING,
      await sale.getAddress(),
      issuer.address,
      0, // ExcessPolicy.Keep
      admin.address,
    ], { unsafeAllow: ["constructor"] });

    // Deploy Fraction Token
    const FractionFactory = await ethers.getContractFactory("CiretaFractionToken1155");
    fractionToken = await upgrades.deployProxy(FractionFactory, [
      "frWMAU", "frWMAU", 6,
      await registry.getAddress(),
      await projectToken.getAddress(),
      await vault.getAddress(),
      admin.address,
    ], { unsafeAllow: ["constructor"] });

    // Wire up
    await vault.setFractionToken(await fractionToken.getAddress());
    await sale.connect(admin).setVestedMode(
      await vault.getAddress(),
      await fractionToken.getAddress(),
    );

    // Grant roles on fraction token
    await fractionToken.grantRole(MINTER_ROLE, await sale.getAddress());
    await fractionToken.grantRole(BURNER_ROLE, await vault.getAddress());
    await fractionToken.grantRole(BURNER_ROLE, await sale.getAddress());
    await fractionToken.grantRole(RECOVERY_ROLE, recoverer.address);

    // Verify sale address in registry (needed for sale to work)
    await registry.setVerified(await sale.getAddress(), true);
    await registry.setVerified(await vault.getAddress(), true);

    // Mint project tokens to sale for deposit
    const depositAmount = ethers.parseUnits("5000", 6);
    await projectToken.mint(await sale.getAddress(), depositAmount);

    // Add a phase
    const phaseStart = saleStart;
    const phaseEnd = saleEnd;
    const allocation = ethers.parseUnits("5000", 6);
    await sale.connect(issuer).addPhase(
      "Seed Round",  // name
      PRICE_RAW,
      allocation,
      1n,     // minTokens (whole)
      5000n,  // maxTokens (whole)
      1n,     // topUpMinTokens
      phaseStart,
      phaseEnd,
      false,  // not whitelisted
      0,      // Fixed allocation
    );

    // Deposit project tokens into vault via sale
    await projectToken.mint(issuer.address, depositAmount);
    await projectToken.connect(issuer).approve(await sale.getAddress(), depositAmount);
    await sale.connect(issuer).depositProjectTokens(depositAmount);

    // Activate sale
    await sale.connect(admin).approveSale();
    await sale.connect(issuer).activate();

    // Advance to sale start
    await time.increaseTo(saleStart + 1);

    // Fund buyers
    await usdc.mint(buyerA.address, ethers.parseUnits("5000", 6));
    await usdc.connect(buyerA).approve(await sale.getAddress(), ethers.parseUnits("5000", 6));
    await usdc.mint(buyerB.address, ethers.parseUnits("5000", 6));
    await usdc.connect(buyerB).approve(await sale.getAddress(), ethers.parseUnits("5000", 6));

    // Mint OTC tokens to operator (issuer is admin of OTC token)
    const otcMinterRole = await otcToken.MINTER_ROLE();
    await otcToken.connect(issuer).grantRole(otcMinterRole, issuer.address);
    await otcToken.connect(issuer).mint(operator.address, ethers.parseUnits("2000", 6));
    await otcToken.connect(operator).approve(await sale.getAddress(), ethers.parseUnits("2000", 6));
  }

  beforeEach(async () => {
    await deployFullStack();
  });

  describe("1. USDC buy → transfer → new holder claims", () => {
    it("buyerA buys, transfers to buyerB, buyerB claims after full vesting", async () => {
      // buyerA buys 100 tokens via USDC
      await sale.connect(buyerA).buy(0, 100n);
      expect(await fractionToken.balanceOf(buyerA.address, 1n)).to.equal(ethers.parseUnits("100", 6));

      // Transfer all fractions to buyerB
      await fractionToken.connect(buyerA).safeTransferFrom(
        buyerA.address, buyerB.address, 1n, ethers.parseUnits("100", 6), "0x",
      );
      expect(await fractionToken.balanceOf(buyerA.address, 1n)).to.equal(0n);
      expect(await fractionToken.balanceOf(buyerB.address, 1n)).to.equal(ethers.parseUnits("100", 6));

      // Finalize sale and start vesting
      await time.increase(SALE_DURATION + 1);
      await sale.connect(issuer).closeSale(false);

      // Advance past full vesting
      await time.increase(VESTING + 1);

      // buyerB claims — gets project tokens
      await vault.connect(buyerB).claim();
      expect(await projectToken.balanceOf(buyerB.address)).to.equal(ethers.parseUnits("100", 6));
      expect(await fractionToken.balanceOf(buyerB.address, 1n)).to.equal(0n);

      // buyerA cannot claim (no fractions)
      await expect(vault.connect(buyerA).claim())
        .to.be.revertedWithCustomError(vault, "NothingToClaim");
    });
  });

  describe("2. OTC operator flow: buy → transfer ID=2 → buyer claims", () => {
    it("operator buys OTC, transfers ID=2 to buyer, buyer claims", async () => {
      // Operator buys 200 tokens via OTC
      await sale.connect(operator).buyOTC(0, 200n);
      expect(await fractionToken.balanceOf(operator.address, 2n)).to.equal(ethers.parseUnits("200", 6));

      // Operator transfers to buyerA
      await fractionToken.connect(operator).safeTransferFrom(
        operator.address, buyerA.address, 2n, ethers.parseUnits("200", 6), "0x",
      );
      expect(await fractionToken.balanceOf(buyerA.address, 2n)).to.equal(ethers.parseUnits("200", 6));
      expect(await fractionToken.balanceOf(operator.address, 2n)).to.equal(0n);

      // Finalize + vest
      await time.increase(SALE_DURATION + 1);
      await sale.connect(issuer).closeSale(false);
      await time.increase(VESTING + 1);

      // buyerA claims
      await vault.connect(buyerA).claim();
      expect(await projectToken.balanceOf(buyerA.address)).to.equal(ethers.parseUnits("200", 6));
    });
  });

  describe("3. Mixed IDs: holder with both ID=1 and ID=2 claims", () => {
    it("buyerA has USDC + OTC fractions, claims both", async () => {
      // buyerA buys 50 via USDC
      await sale.connect(buyerA).buy(0, 50n);
      // Operator buys 100 OTC, transfers to buyerA
      await sale.connect(operator).buyOTC(0, 100n);
      await fractionToken.connect(operator).safeTransferFrom(
        operator.address, buyerA.address, 2n, ethers.parseUnits("100", 6), "0x",
      );

      expect(await fractionToken.balanceOf(buyerA.address, 1n)).to.equal(ethers.parseUnits("50", 6));
      expect(await fractionToken.balanceOf(buyerA.address, 2n)).to.equal(ethers.parseUnits("100", 6));

      // Finalize + full vest
      await time.increase(SALE_DURATION + 1);
      await sale.connect(issuer).closeSale(false);
      await time.increase(VESTING + 1);

      await vault.connect(buyerA).claim();
      expect(await projectToken.balanceOf(buyerA.address)).to.equal(ethers.parseUnits("150", 6));
      expect(await fractionToken.balanceOf(buyerA.address, 1n)).to.equal(0n);
      expect(await fractionToken.balanceOf(buyerA.address, 2n)).to.equal(0n);
    });
  });

  describe("4. Partial vesting: multi-claim after transfer", () => {
    it("claim at 50%, transfer half, both claim at 100%", async () => {
      await sale.connect(buyerA).buy(0, 100n);
      const amount = ethers.parseUnits("100", 6);

      await time.increase(SALE_DURATION + 1);
      await sale.connect(issuer).closeSale(false);

      // Advance to ~50% vesting (past cliff)
      await time.increase(VESTING / 2);

      // buyerA claims at 50%
      await vault.connect(buyerA).claim();
      const firstClaim = await projectToken.balanceOf(buyerA.address);
      expect(firstClaim).to.be.gt(0n);
      expect(firstClaim).to.be.lt(amount);

      // buyerA transfers remaining fractions to buyerB
      const remaining = await fractionToken.balanceOf(buyerA.address, 1n);
      expect(remaining).to.be.gt(0n);
      const halfRemaining = remaining / 2n;
      await fractionToken.connect(buyerA).safeTransferFrom(
        buyerA.address, buyerB.address, 1n, halfRemaining, "0x",
      );

      // Advance to full vesting
      await time.increase(VESTING);

      // Both claim
      await vault.connect(buyerA).claim();
      await vault.connect(buyerB).claim();

      const aTotal = await projectToken.balanceOf(buyerA.address);
      const bTotal = await projectToken.balanceOf(buyerB.address);

      // Sum should equal the original amount (minus rounding)
      expect(aTotal + bTotal).to.be.closeTo(amount, 2n); // ±2 wei rounding
    });
  });

  describe("5. Fraction recovery (RECOVERY_ROLE)", () => {
    it("recoverer force-transfers ID=1 from buyerA to buyerB", async () => {
      await sale.connect(buyerA).buy(0, 100n);
      const amount = ethers.parseUnits("100", 6);

      const reason = ethers.toUtf8Bytes("court order #456");
      await fractionToken.connect(recoverer).recoverFractions(
        buyerA.address, buyerB.address, 1n, amount, reason,
      );

      expect(await fractionToken.balanceOf(buyerA.address, 1n)).to.equal(0n);
      expect(await fractionToken.balanceOf(buyerB.address, 1n)).to.equal(amount);
    });

    it("recoverer force-transfers ID=2 from unverified source", async () => {
      // Operator buys, we revoke operator's verification, then recover
      await sale.connect(operator).buyOTC(0, 50n);
      const amount = ethers.parseUnits("50", 6);

      // Revoke operator's verification
      await registry.setVerified(operator.address, false);

      // Recovery still works (bypasses source KYC)
      const reason = ethers.toUtf8Bytes("compliance seizure");
      await fractionToken.connect(recoverer).recoverFractions(
        operator.address, buyerA.address, 2n, amount, reason,
      );
      expect(await fractionToken.balanceOf(buyerA.address, 2n)).to.equal(amount);
    });

    it("recovery to unverified wallet reverts", async () => {
      await sale.connect(buyerA).buy(0, 10n);
      const reason = ethers.toUtf8Bytes("test");
      await expect(
        fractionToken.connect(recoverer).recoverFractions(
          buyerA.address, unverified.address, 1n, ethers.parseUnits("10", 6), reason,
        ),
      ).to.be.revertedWithCustomError(fractionToken, "RecipientNotVerified");
    });

    it("non-recoverer cannot force-transfer", async () => {
      await sale.connect(buyerA).buy(0, 10n);
      const reason = ethers.toUtf8Bytes("test");
      await expect(
        fractionToken.connect(buyerA).recoverFractions(
          buyerA.address, buyerB.address, 1n, ethers.parseUnits("10", 6), reason,
        ),
      ).to.be.reverted;
    });

    it("recovered fractions can be claimed by new holder", async () => {
      await sale.connect(buyerA).buy(0, 100n);
      const amount = ethers.parseUnits("100", 6);

      // Recover to buyerB
      const reason = ethers.toUtf8Bytes("inheritance");
      await fractionToken.connect(recoverer).recoverFractions(
        buyerA.address, buyerB.address, 1n, amount, reason,
      );

      // Finalize + full vest
      await time.increase(SALE_DURATION + 1);
      await sale.connect(issuer).closeSale(false);
      await time.increase(VESTING + 1);

      // buyerB claims
      await vault.connect(buyerB).claim();
      expect(await projectToken.balanceOf(buyerB.address)).to.equal(amount);
    });
  });

  describe("6. Transfer gating", () => {
    it("transfer to unverified wallet reverts", async () => {
      await sale.connect(buyerA).buy(0, 10n);
      await expect(
        fractionToken.connect(buyerA).safeTransferFrom(
          buyerA.address, unverified.address, 1n, ethers.parseUnits("10", 6), "0x",
        ),
      ).to.be.revertedWithCustomError(fractionToken, "RecipientNotVerified");
    });

    it("transfer between verified wallets succeeds", async () => {
      await sale.connect(buyerA).buy(0, 10n);
      await fractionToken.connect(buyerA).safeTransferFrom(
        buyerA.address, buyerB.address, 1n, ethers.parseUnits("5", 6), "0x",
      );
      expect(await fractionToken.balanceOf(buyerB.address, 1n)).to.equal(ethers.parseUnits("5", 6));
    });
  });

  describe("7. Claim burns fractions (no double-claim)", () => {
    it("after claim, transferring 0 fractions and re-claiming reverts", async () => {
      await sale.connect(buyerA).buy(0, 100n);
      await time.increase(SALE_DURATION + 1);
      await sale.connect(issuer).closeSale(false);
      await time.increase(VESTING + 1);

      // Full claim
      await vault.connect(buyerA).claim();
      expect(await fractionToken.balanceOf(buyerA.address, 1n)).to.equal(0n);

      // Try to claim again
      await expect(vault.connect(buyerA).claim())
        .to.be.revertedWithCustomError(vault, "NothingToClaim");
    });

    it("cannot claim fractions received after already claiming (no double-dip)", async () => {
      // buyerA and buyerB both buy
      await sale.connect(buyerA).buy(0, 100n);
      await sale.connect(buyerB).buy(0, 100n);

      await time.increase(SALE_DURATION + 1);
      await sale.connect(issuer).closeSale(false);
      await time.increase(VESTING + 1);

      // buyerA claims fully
      await vault.connect(buyerA).claim();
      expect(await projectToken.balanceOf(buyerA.address)).to.equal(ethers.parseUnits("100", 6));

      // buyerB transfers fractions to buyerA
      await fractionToken.connect(buyerB).safeTransferFrom(
        buyerB.address, buyerA.address, 1n, ethers.parseUnits("100", 6), "0x",
      );

      // buyerA can claim the newly received fractions
      await vault.connect(buyerA).claim();
      expect(await projectToken.balanceOf(buyerA.address)).to.equal(ethers.parseUnits("200", 6));

      // But cannot claim again (all burned)
      await expect(vault.connect(buyerA).claim())
        .to.be.revertedWithCustomError(vault, "NothingToClaim");
    });
  });

  describe("8. ERC-3643 forceTransfer (cross-user)", () => {
    it("forceTransfer moves tokens between different users", async () => {
      // Deploy a standalone CiretaToken for this test
      const MockCompliance = await ethers.getContractFactory("MockCompliance");
      const compliance = await MockCompliance.deploy();

      const MAX_SUPPLY_FT = 1_000_000_000n * 10n ** 6n;
      const CiretaToken = await ethers.getContractFactory("CiretaToken");
      const ciretaToken = await upgrades.deployProxy(CiretaToken, [
        "Gold Token", "WMAU", 6,
        await registry.getAddress(),
        await compliance.getAddress(),
        issuer.address,  // owner (issuer)
        admin.address,   // admin (platform)
        MAX_SUPPLY_FT,   // maxSupply_
        true,            // mintable_
        0n,              // initialMintAmount_
      ], { unsafeAllow: ["constructor"] });

      // Mint tokens to buyerA
      const supplyRole = await ciretaToken.SUPPLY_ROLE();
      await ciretaToken.connect(issuer).grantRole(supplyRole, issuer.address);
      await ciretaToken.connect(issuer).mint(buyerA.address, ethers.parseUnits("200", 6));

      // Grant RECOVERY_ROLE to recoverer
      const tokenRecoveryRole = await ciretaToken.RECOVERY_ROLE();
      await ciretaToken.connect(issuer).grantRole(tokenRecoveryRole, recoverer.address);

      const amount = ethers.parseUnits("200", 6);
      await ciretaToken.connect(recoverer).forceTransfer(
        buyerA.address, buyerB.address, amount, "inheritance",
      );

      expect(await ciretaToken.balanceOf(buyerA.address)).to.equal(0n);
      expect(await ciretaToken.balanceOf(buyerB.address)).to.equal(amount);
    });
  });

  describe("9. ERC-3643 recoveryAddress (simple mode)", () => {
    it("recoveryAddress with address(0) works in simple whitelist mode", async () => {
      const MockCompliance = await ethers.getContractFactory("MockCompliance");
      const compliance = await MockCompliance.deploy();

      const MAX_SUPPLY_RA = 1_000_000_000n * 10n ** 6n;
      const CiretaToken = await ethers.getContractFactory("CiretaToken");
      const ciretaToken = await upgrades.deployProxy(CiretaToken, [
        "Gold Token", "WMAU", 6,
        await registry.getAddress(),
        await compliance.getAddress(),
        issuer.address,
        admin.address,
        MAX_SUPPLY_RA, true, 0n,
      ], { unsafeAllow: ["constructor"] });

      const supplyRole = await ciretaToken.SUPPLY_ROLE();
      await ciretaToken.connect(issuer).grantRole(supplyRole, issuer.address);
      await ciretaToken.connect(issuer).mint(buyerA.address, ethers.parseUnits("200", 6));

      const tokenRecoveryRole = await ciretaToken.RECOVERY_ROLE();
      await ciretaToken.connect(issuer).grantRole(tokenRecoveryRole, recoverer.address);

      const balance = await ciretaToken.balanceOf(buyerA.address);
      await ciretaToken.connect(recoverer).recoveryAddress(
        buyerA.address,
        buyerB.address,
        ethers.ZeroAddress, // simple whitelist mode
      );

      expect(await ciretaToken.balanceOf(buyerA.address)).to.equal(0n);
      expect(await ciretaToken.balanceOf(buyerB.address)).to.equal(balance);
    });
  });
});
