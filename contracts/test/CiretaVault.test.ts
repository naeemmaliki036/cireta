import { expect } from "chai";
import { ethers, upgrades } from "hardhat";
import { time } from "@nomicfoundation/hardhat-network-helpers";
import type { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";

describe("CiretaVault", () => {
  let vault: any;
  let fractionToken: any;
  let projectToken: any;
  let mockRegistry: any;
  let owner: SignerWithAddress;
  let saleAccount: SignerWithAddress; // Simulates the Sale contract
  let issuerAccount: SignerWithAddress;
  let investor1: SignerWithAddress;
  let investor2: SignerWithAddress;
  let other: SignerWithAddress;

  const MINTER_ROLE = ethers.keccak256(ethers.toUtf8Bytes("MINTER_ROLE"));
  const BURNER_ROLE = ethers.keccak256(ethers.toUtf8Bytes("BURNER_ROLE"));

  const CLIFF = 90 * 24 * 3600; // 90 days
  const VESTING = 180 * 24 * 3600; // 180 days

  const TOKENS_LOCKED = ethers.parseEther("1000");

  beforeEach(async () => {
    [owner, saleAccount, issuerAccount, investor1, investor2, other] = await ethers.getSigners();

    // Deploy mock identity registry (always verified)
    const MockIR = await ethers.getContractFactory("MockIdentityRegistry");
    mockRegistry = await MockIR.deploy();

    // Deploy mock project token
    const ERC20 = await ethers.getContractFactory("MockERC20");
    projectToken = await ERC20.deploy("Wassa Gold", "WMAU", 18);

    // Deploy CiretaFractionToken
    const FractionToken = await ethers.getContractFactory("CiretaFractionToken");
    fractionToken = await upgrades.deployProxy(
      FractionToken,
      [
        "frWMAU", "frWMAU", 18,
        await mockRegistry.getAddress(),
        await projectToken.getAddress(),
        ethers.ZeroAddress, // vault not yet known
        owner.address,
      ],
      { unsafeAllow: ["constructor"] },
    );

    // Deploy CiretaVault
    const Vault = await ethers.getContractFactory("CiretaVault");
    vault = await upgrades.deployProxy(
      Vault,
      [
        await projectToken.getAddress(),
        await fractionToken.getAddress(),
        CLIFF,
        VESTING,
        saleAccount.address,
        issuerAccount.address,
        0, // ExcessPolicy.Keep
        owner.address,
      ],
      { unsafeAllow: ["constructor"] },
    );

    // Grant roles: sale = MINTER, vault = BURNER
    await fractionToken.grantRole(MINTER_ROLE, saleAccount.address);
    await fractionToken.grantRole(BURNER_ROLE, await vault.getAddress());

    // Mint project tokens to sale account (simulating issuer deposit)
    await projectToken.mint(saleAccount.address, TOKENS_LOCKED);
    // Approve vault to pull tokens
    await projectToken.connect(saleAccount).approve(await vault.getAddress(), TOKENS_LOCKED);
  });

  describe("Initialization", () => {
    it("sets config correctly", async () => {
      expect(await vault.sale()).to.equal(saleAccount.address);
      expect(await vault.issuer()).to.equal(issuerAccount.address);
      expect(await vault.finalized()).to.be.false;
      const config = await vault.vestingConfig();
      expect(config.cliffDuration).to.equal(CLIFF);
      expect(config.vestingDuration).to.equal(VESTING);
    });

    it("reverts on zero project token", async () => {
      const Vault = await ethers.getContractFactory("CiretaVault");
      await expect(
        upgrades.deployProxy(Vault, [
          ethers.ZeroAddress, await fractionToken.getAddress(),
          CLIFF, VESTING, saleAccount.address, issuerAccount.address, 0, owner.address,
        ], { unsafeAllow: ["constructor"] }),
      ).to.be.revertedWithCustomError(Vault, "ZeroAddress");
    });
  });

  describe("depositTokens", () => {
    it("locks project tokens from sale", async () => {
      await vault.connect(saleAccount).depositTokens(TOKENS_LOCKED);
      expect(await vault.totalLocked()).to.equal(TOKENS_LOCKED);
      expect(await projectToken.balanceOf(await vault.getAddress())).to.equal(TOKENS_LOCKED);
    });

    it("reverts if not called by sale", async () => {
      await expect(vault.connect(other).depositTokens(TOKENS_LOCKED))
        .to.be.revertedWithCustomError(vault, "OnlySale");
    });

    it("emits TokensLocked event", async () => {
      await expect(vault.connect(saleAccount).depositTokens(TOKENS_LOCKED))
        .to.emit(vault, "TokensLocked").withArgs(TOKENS_LOCKED);
    });
  });

  describe("recordAllocation", () => {
    it("tracks investor fractions", async () => {
      const amount = ethers.parseEther("100");
      await vault.connect(saleAccount).recordAllocation(investor1.address, amount);
      const vesting = await vault.investorVesting(investor1.address);
      expect(vesting.totalFractions).to.equal(amount);
    });

    it("accumulates multiple allocations", async () => {
      await vault.connect(saleAccount).recordAllocation(investor1.address, ethers.parseEther("50"));
      await vault.connect(saleAccount).recordAllocation(investor1.address, ethers.parseEther("30"));
      const vesting = await vault.investorVesting(investor1.address);
      expect(vesting.totalFractions).to.equal(ethers.parseEther("80"));
    });

    it("reverts if not sale", async () => {
      await expect(vault.connect(other).recordAllocation(investor1.address, 100))
        .to.be.revertedWithCustomError(vault, "OnlySale");
    });
  });

  describe("startVesting", () => {
    it("sets finalized and emits event", async () => {
      await expect(vault.connect(saleAccount).startVesting())
        .to.emit(vault, "VestingStarted");
      expect(await vault.finalized()).to.be.true;
      expect(await vault.vestingStartTime()).to.be.gt(0);
    });

    it("reverts if already finalized", async () => {
      await vault.connect(saleAccount).startVesting();
      await expect(vault.connect(saleAccount).startVesting())
        .to.be.revertedWithCustomError(vault, "AlreadyFinalized");
    });

    it("reverts if not sale", async () => {
      await expect(vault.connect(other).startVesting())
        .to.be.revertedWithCustomError(vault, "OnlySale");
    });
  });

  describe("claim", () => {
    const INVESTOR_AMOUNT = ethers.parseEther("100");

    beforeEach(async () => {
      // Deposit, allocate, mint fractions, start vesting
      await vault.connect(saleAccount).depositTokens(TOKENS_LOCKED);
      await vault.connect(saleAccount).recordAllocation(investor1.address, INVESTOR_AMOUNT);
      await fractionToken.connect(saleAccount).mint(investor1.address, INVESTOR_AMOUNT);
      await vault.connect(saleAccount).startVesting();
    });

    it("reverts before finalization", async () => {
      // Deploy a fresh vault that hasn't been finalized
      const Vault = await ethers.getContractFactory("CiretaVault");
      const freshVault = await upgrades.deployProxy(Vault, [
        await projectToken.getAddress(), await fractionToken.getAddress(),
        CLIFF, VESTING, saleAccount.address, issuerAccount.address, 0, owner.address,
      ], { unsafeAllow: ["constructor"] });
      await expect(freshVault.connect(investor1).claim())
        .to.be.revertedWithCustomError(freshVault, "NotFinalized");
    });

    it("reverts before cliff", async () => {
      // We're right after startVesting, cliff not reached
      await expect(vault.connect(investor1).claim())
        .to.be.revertedWithCustomError(vault, "NothingToClaim");
    });

    it("allows partial claim after cliff", async () => {
      // Move to cliff + half of remaining vesting
      const halfVesting = CLIFF + (VESTING - CLIFF) / 2;
      await time.increase(halfVesting);

      await vault.connect(investor1).claim();
      const claimed = await projectToken.balanceOf(investor1.address);
      // Should be roughly 75% vested (cliff at 50%, halfway through remaining)
      expect(claimed).to.be.gt(0);
      expect(claimed).to.be.lt(INVESTOR_AMOUNT);
      // Fraction balance reduced by what was claimed
      expect(await fractionToken.balanceOf(investor1.address)).to.equal(INVESTOR_AMOUNT - claimed);
    });

    it("allows full claim after vesting period", async () => {
      await time.increase(VESTING + 1);

      const claimable = await vault.getClaimable(investor1.address);
      expect(claimable).to.equal(INVESTOR_AMOUNT);

      await expect(vault.connect(investor1).claim())
        .to.emit(vault, "TokensClaimed")
        .withArgs(investor1.address, INVESTOR_AMOUNT, INVESTOR_AMOUNT);

      expect(await projectToken.balanceOf(investor1.address)).to.equal(INVESTOR_AMOUNT);
      expect(await fractionToken.balanceOf(investor1.address)).to.equal(0);
    });

    it("allows multiple partial claims", async () => {
      // Claim at cliff
      await time.increase(CLIFF + 1);
      await vault.connect(investor1).claim();
      const firstClaim = await projectToken.balanceOf(investor1.address);
      expect(firstClaim).to.be.gt(0);

      // Claim again later
      await time.increase((VESTING - CLIFF) / 2);
      await vault.connect(investor1).claim();
      const secondTotal = await projectToken.balanceOf(investor1.address);
      expect(secondTotal).to.be.gt(firstClaim);

      // Final claim
      await time.increase(VESTING);
      await vault.connect(investor1).claim();
      expect(await projectToken.balanceOf(investor1.address)).to.equal(INVESTOR_AMOUNT);
    });

    it("reverts when nothing to claim (no allocation)", async () => {
      await time.increase(VESTING + 1);
      await expect(vault.connect(other).claim())
        .to.be.revertedWithCustomError(vault, "NothingToClaim");
    });
  });

  describe("handlePhaseExcess", () => {
    beforeEach(async () => {
      await vault.connect(saleAccount).depositTokens(TOKENS_LOCKED);
    });

    it("BurnToMatch: returns excess to issuer", async () => {
      await vault.setExcessPolicy(1); // BurnToMatch
      const excess = ethers.parseEther("200");

      await expect(vault.connect(saleAccount).handlePhaseExcess(excess))
        .to.emit(vault, "ExcessReturned").withArgs(excess, 1);

      expect(await vault.totalLocked()).to.equal(TOKENS_LOCKED - excess);
      expect(await projectToken.balanceOf(issuerAccount.address)).to.equal(excess);
    });

    it("Keep: tokens stay in vault", async () => {
      // excessPolicy defaults to Keep (0)
      const excess = ethers.parseEther("200");

      await expect(vault.connect(saleAccount).handlePhaseExcess(excess))
        .to.emit(vault, "ExcessReturned").withArgs(excess, 0);

      // totalLocked unchanged
      expect(await vault.totalLocked()).to.equal(TOKENS_LOCKED);
    });

    it("does nothing on zero amount", async () => {
      await vault.connect(saleAccount).handlePhaseExcess(0);
      expect(await vault.totalLocked()).to.equal(TOKENS_LOCKED);
    });

    it("reverts if not sale", async () => {
      await expect(vault.connect(other).handlePhaseExcess(100))
        .to.be.revertedWithCustomError(vault, "OnlySale");
    });
  });

  describe("setExcessPolicy", () => {
    it("owner can change policy before finalization", async () => {
      await expect(vault.setExcessPolicy(1))
        .to.emit(vault, "ExcessPolicyUpdated").withArgs(0, 1);
      expect(await vault.excessPolicy()).to.equal(1);
    });

    it("reverts after finalization", async () => {
      await vault.connect(saleAccount).startVesting();
      await expect(vault.setExcessPolicy(1))
        .to.be.revertedWithCustomError(vault, "AlreadyFinalized");
    });

    it("reverts if not owner", async () => {
      await expect(vault.connect(other).setExcessPolicy(1)).to.be.reverted;
    });
  });

  describe("withdrawExcess", () => {
    const INVESTOR_AMOUNT = ethers.parseEther("100");

    beforeEach(async () => {
      await vault.connect(saleAccount).depositTokens(TOKENS_LOCKED);
      await vault.connect(saleAccount).recordAllocation(investor1.address, INVESTOR_AMOUNT);
      await fractionToken.connect(saleAccount).mint(investor1.address, INVESTOR_AMOUNT);
      await vault.connect(saleAccount).startVesting();
    });

    it("allows issuer to withdraw excess after finalization", async () => {
      // Vault has 1000 locked, 100 fractions outstanding → 900 excess
      await expect(vault.connect(issuerAccount).withdrawExcess())
        .to.emit(vault, "IssuerExcessWithdrawn")
        .withArgs(issuerAccount.address, ethers.parseEther("900"));

      expect(await projectToken.balanceOf(issuerAccount.address)).to.equal(ethers.parseEther("900"));
    });

    it("reverts if not finalized", async () => {
      const Vault = await ethers.getContractFactory("CiretaVault");
      const freshVault = await upgrades.deployProxy(Vault, [
        await projectToken.getAddress(), await fractionToken.getAddress(),
        CLIFF, VESTING, saleAccount.address, issuerAccount.address, 0, owner.address,
      ], { unsafeAllow: ["constructor"] });
      await expect(freshVault.connect(issuerAccount).withdrawExcess())
        .to.be.revertedWithCustomError(freshVault, "NotFinalized");
    });

    it("reverts if not issuer", async () => {
      await expect(vault.connect(other).withdrawExcess())
        .to.be.revertedWithCustomError(vault, "OnlyIssuer");
    });

    it("reverts when no excess (all tokens allocated)", async () => {
      // Allocate the remaining 900 to investor2
      const remaining = ethers.parseEther("900");
      await vault.connect(saleAccount).recordAllocation(investor2.address, remaining);
      await fractionToken.connect(saleAccount).mint(investor2.address, remaining);

      await expect(vault.connect(issuerAccount).withdrawExcess())
        .to.be.revertedWithCustomError(vault, "NothingToClaim");
    });
  });

  describe("setFractionToken", () => {
    it("sets fraction token when initially zero", async () => {
      const Vault = await ethers.getContractFactory("CiretaVault");
      const freshVault = await upgrades.deployProxy(Vault, [
        await projectToken.getAddress(), ethers.ZeroAddress,
        CLIFF, VESTING, saleAccount.address, issuerAccount.address, 0, owner.address,
      ], { unsafeAllow: ["constructor"] });

      await expect(freshVault.setFractionToken(await fractionToken.getAddress()))
        .to.emit(freshVault, "FractionTokenSet");
    });

    it("reverts if already set", async () => {
      await expect(vault.setFractionToken(await fractionToken.getAddress()))
        .to.be.revertedWithCustomError(vault, "FractionTokenAlreadySet");
    });

    it("reverts on zero address", async () => {
      const Vault = await ethers.getContractFactory("CiretaVault");
      const freshVault = await upgrades.deployProxy(Vault, [
        await projectToken.getAddress(), ethers.ZeroAddress,
        CLIFF, VESTING, saleAccount.address, issuerAccount.address, 0, owner.address,
      ], { unsafeAllow: ["constructor"] });
      await expect(freshVault.setFractionToken(ethers.ZeroAddress))
        .to.be.revertedWithCustomError(freshVault, "ZeroAddress");
    });
  });

  describe("getBackingRatio", () => {
    it("returns correct ratio", async () => {
      await vault.connect(saleAccount).depositTokens(TOKENS_LOCKED);
      const [locked, supply] = await vault.getBackingRatio();
      expect(locked).to.equal(TOKENS_LOCKED);
      expect(supply).to.equal(0); // No fractions minted yet
    });
  });

  describe("getVested", () => {
    it("returns 0 before finalization", async () => {
      await vault.connect(saleAccount).recordAllocation(investor1.address, ethers.parseEther("100"));
      expect(await vault.getVested(investor1.address)).to.equal(0);
    });
  });
});
