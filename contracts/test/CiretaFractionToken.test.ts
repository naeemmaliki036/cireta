import { expect } from "chai";
import { ethers, upgrades } from "hardhat";
import type { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";

describe("CiretaFractionToken", () => {
  let fractionToken: any;
  let mockRegistry: any;
  let mockProjectToken: any;
  let owner: SignerWithAddress;
  let minter: SignerWithAddress;
  let burner: SignerWithAddress;
  let alice: SignerWithAddress;
  let bob: SignerWithAddress;
  let unverified: SignerWithAddress;
  let vault: SignerWithAddress;

  const MINTER_ROLE = ethers.keccak256(ethers.toUtf8Bytes("MINTER_ROLE"));
  const BURNER_ROLE = ethers.keccak256(ethers.toUtf8Bytes("BURNER_ROLE"));

  beforeEach(async () => {
    [owner, minter, burner, alice, bob, unverified, vault] = await ethers.getSigners();

    // Deploy configurable identity registry (default: verified)
    const MockIR = await ethers.getContractFactory("MockIdentityRegistryConfigurable");
    mockRegistry = await MockIR.deploy(true);

    // Mark `unverified` as NOT verified
    await mockRegistry.setDefaultVerified(true);
    // We need a way to make unverified NOT verified.
    // Since default is true, we override by deploying a second mock or using a special approach.
    // Actually our mock returns true if _verified[user] || _defaultVerified
    // We need to set _defaultVerified=false, then explicitly set verified for alice, bob, minter, etc.
    await mockRegistry.setDefaultVerified(false);
    await mockRegistry.setVerified(alice.address, true);
    await mockRegistry.setVerified(bob.address, true);
    await mockRegistry.setVerified(minter.address, true);
    await mockRegistry.setVerified(owner.address, true);

    // Deploy mock project token
    const ERC20 = await ethers.getContractFactory("MockERC20");
    mockProjectToken = await ERC20.deploy("Wassa Gold", "WMAU", 18);

    // Deploy CiretaFractionToken via UUPS proxy
    const FractionToken = await ethers.getContractFactory("CiretaFractionToken");
    fractionToken = await upgrades.deployProxy(
      FractionToken,
      [
        "Wassa Gold Fraction (Seed)",
        "frWMAU",
        18,
        await mockRegistry.getAddress(),
        await mockProjectToken.getAddress(),
        vault.address,
        owner.address,
      ],
      { unsafeAllow: ["constructor"] },
    );

    // Grant roles
    await fractionToken.grantRole(MINTER_ROLE, minter.address);
    await fractionToken.grantRole(BURNER_ROLE, burner.address);
  });

  describe("Initialization", () => {
    it("sets name, symbol, and decimals", async () => {
      expect(await fractionToken.name()).to.equal("Wassa Gold Fraction (Seed)");
      expect(await fractionToken.symbol()).to.equal("frWMAU");
      expect(await fractionToken.decimals()).to.equal(18);
    });

    it("sets identity registry and project token", async () => {
      expect(await fractionToken.identityRegistry()).to.equal(await mockRegistry.getAddress());
      expect(await fractionToken.projectToken()).to.equal(await mockProjectToken.getAddress());
      expect(await fractionToken.vault()).to.equal(vault.address);
    });

    it("grants DEFAULT_ADMIN_ROLE to admin", async () => {
      const DEFAULT_ADMIN = ethers.ZeroHash;
      expect(await fractionToken.hasRole(DEFAULT_ADMIN, owner.address)).to.be.true;
    });

    it("reverts on zero identity registry", async () => {
      const FractionToken = await ethers.getContractFactory("CiretaFractionToken");
      await expect(
        upgrades.deployProxy(
          FractionToken,
          ["Test", "TST", 18, ethers.ZeroAddress, await mockProjectToken.getAddress(), vault.address, owner.address],
          { unsafeAllow: ["constructor"] },
        ),
      ).to.be.revertedWithCustomError(FractionToken, "ZeroAddress");
    });

    it("reverts on zero project token", async () => {
      const FractionToken = await ethers.getContractFactory("CiretaFractionToken");
      await expect(
        upgrades.deployProxy(
          FractionToken,
          ["Test", "TST", 18, await mockRegistry.getAddress(), ethers.ZeroAddress, vault.address, owner.address],
          { unsafeAllow: ["constructor"] },
        ),
      ).to.be.revertedWithCustomError(FractionToken, "ZeroAddress");
    });
  });

  describe("Minting", () => {
    it("minter can mint fractions", async () => {
      const amount = ethers.parseEther("100");
      await expect(fractionToken.connect(minter).mint(alice.address, amount))
        .to.emit(fractionToken, "FractionsMinted")
        .withArgs(alice.address, amount);
      expect(await fractionToken.balanceOf(alice.address)).to.equal(amount);
    });

    it("non-minter cannot mint", async () => {
      const amount = ethers.parseEther("100");
      await expect(fractionToken.connect(alice).mint(alice.address, amount)).to.be.reverted;
    });
  });

  describe("Burning", () => {
    beforeEach(async () => {
      await fractionToken.connect(minter).mint(alice.address, ethers.parseEther("100"));
    });

    it("burner can burn fractions via burnFrom", async () => {
      const amount = ethers.parseEther("50");
      await expect(fractionToken.connect(burner).burnFrom(alice.address, amount))
        .to.emit(fractionToken, "FractionsBurned")
        .withArgs(alice.address, amount);
      expect(await fractionToken.balanceOf(alice.address)).to.equal(ethers.parseEther("50"));
    });

    it("non-burner cannot burn", async () => {
      await expect(fractionToken.connect(alice).burnFrom(alice.address, ethers.parseEther("10"))).to.be.reverted;
    });
  });

  describe("Transfer Gating (KYC)", () => {
    beforeEach(async () => {
      await fractionToken.connect(minter).mint(alice.address, ethers.parseEther("100"));
    });

    it("allows transfer between verified wallets", async () => {
      const amount = ethers.parseEther("10");
      await expect(fractionToken.connect(alice).transfer(bob.address, amount)).to.not.be.reverted;
      expect(await fractionToken.balanceOf(bob.address)).to.equal(amount);
    });

    it("blocks transfer to non-verified wallet", async () => {
      const amount = ethers.parseEther("10");
      await expect(fractionToken.connect(alice).transfer(unverified.address, amount))
        .to.be.revertedWithCustomError(fractionToken, "RecipientNotVerified")
        .withArgs(unverified.address);
    });

    it("blocks transfer from non-verified wallet", async () => {
      // Mint to unverified (minting bypasses KYC check) then try transfer
      await fractionToken.connect(minter).mint(unverified.address, ethers.parseEther("10"));
      await expect(fractionToken.connect(unverified).transfer(alice.address, ethers.parseEther("5")))
        .to.be.revertedWithCustomError(fractionToken, "SenderNotVerified")
        .withArgs(unverified.address);
    });

    it("allows minting to any address (no KYC check on mint)", async () => {
      await expect(fractionToken.connect(minter).mint(unverified.address, ethers.parseEther("10"))).to.not.be
        .reverted;
    });

    it("allows burning from any address (no KYC check on burn)", async () => {
      await fractionToken.connect(minter).mint(unverified.address, ethers.parseEther("10"));
      await expect(fractionToken.connect(burner).burnFrom(unverified.address, ethers.parseEther("10"))).to.not.be
        .reverted;
    });
  });

  describe("Role Management", () => {
    it("admin can grant MINTER_ROLE", async () => {
      await fractionToken.grantRole(MINTER_ROLE, alice.address);
      expect(await fractionToken.hasRole(MINTER_ROLE, alice.address)).to.be.true;
    });

    it("admin can grant BURNER_ROLE", async () => {
      await fractionToken.grantRole(BURNER_ROLE, alice.address);
      expect(await fractionToken.hasRole(BURNER_ROLE, alice.address)).to.be.true;
    });

    it("non-admin cannot grant roles", async () => {
      await expect(fractionToken.connect(alice).grantRole(MINTER_ROLE, bob.address)).to.be.reverted;
    });
  });
});
