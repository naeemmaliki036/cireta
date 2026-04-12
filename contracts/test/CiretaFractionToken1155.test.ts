import { expect } from "chai";
import { ethers, upgrades } from "hardhat";
import type { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";

describe("CiretaFractionToken1155", () => {
  let fractionToken: any;
  let mockRegistry: any;
  let mockProjectToken: any;
  let owner: SignerWithAddress;
  let minter: SignerWithAddress;
  let burner: SignerWithAddress;
  let recoverer: SignerWithAddress;
  let alice: SignerWithAddress;
  let bob: SignerWithAddress;
  let unverified: SignerWithAddress;
  let vaultAddr: SignerWithAddress;

  const MINTER_ROLE = ethers.keccak256(ethers.toUtf8Bytes("MINTER_ROLE"));
  const BURNER_ROLE = ethers.keccak256(ethers.toUtf8Bytes("BURNER_ROLE"));
  const RECOVERY_ROLE = ethers.keccak256(ethers.toUtf8Bytes("RECOVERY_ROLE"));
  const ID_USDC = 1n;
  const ID_OTC = 2n;

  beforeEach(async () => {
    [owner, minter, burner, recoverer, alice, bob, unverified, vaultAddr] = await ethers.getSigners();

    const MockIR = await ethers.getContractFactory("MockIdentityRegistryConfigurable");
    mockRegistry = await MockIR.deploy(false);
    await mockRegistry.setVerified(alice.address, true);
    await mockRegistry.setVerified(bob.address, true);
    await mockRegistry.setVerified(minter.address, true);
    await mockRegistry.setVerified(owner.address, true);
    await mockRegistry.setVerified(recoverer.address, true);
    // unverified stays false

    const ERC20 = await ethers.getContractFactory("MockERC20");
    mockProjectToken = await ERC20.deploy("Wassa Gold", "WMAU", 18);

    const FractionToken = await ethers.getContractFactory("CiretaFractionToken1155");
    fractionToken = await upgrades.deployProxy(
      FractionToken,
      [
        "frWMAU", "frWMAU", 18,
        await mockRegistry.getAddress(),
        await mockProjectToken.getAddress(),
        vaultAddr.address,
        owner.address,
      ],
      { unsafeAllow: ["constructor"] },
    );

    await fractionToken.grantRole(MINTER_ROLE, minter.address);
    await fractionToken.grantRole(BURNER_ROLE, burner.address);
    await fractionToken.grantRole(RECOVERY_ROLE, recoverer.address);
  });

  describe("Minting", () => {
    it("minter mints ID=1 to verified wallet", async () => {
      await expect(fractionToken.connect(minter).mint(alice.address, ID_USDC, 100n, "0x"))
        .to.emit(fractionToken, "FractionsMinted")
        .withArgs(alice.address, ID_USDC, 100n);
      expect(await fractionToken.balanceOf(alice.address, ID_USDC)).to.equal(100n);
    });

    it("minter mints ID=2 to verified wallet", async () => {
      await fractionToken.connect(minter).mint(alice.address, ID_OTC, 200n, "0x");
      expect(await fractionToken.balanceOf(alice.address, ID_OTC)).to.equal(200n);
    });

    it("reverts mint to unverified wallet", async () => {
      await expect(fractionToken.connect(minter).mint(unverified.address, ID_USDC, 100n, "0x"))
        .to.be.revertedWithCustomError(fractionToken, "RecipientNotVerified");
    });

    it("reverts invalid token id", async () => {
      await expect(fractionToken.connect(minter).mint(alice.address, 3n, 100n, "0x"))
        .to.be.revertedWithCustomError(fractionToken, "InvalidId");
    });

    it("reverts zero amount", async () => {
      await expect(fractionToken.connect(minter).mint(alice.address, ID_USDC, 0n, "0x"))
        .to.be.revertedWithCustomError(fractionToken, "ZeroAmount");
    });

    it("non-minter cannot mint", async () => {
      await expect(fractionToken.connect(alice).mint(alice.address, ID_USDC, 100n, "0x")).to.be.reverted;
    });
  });

  describe("Burning", () => {
    beforeEach(async () => {
      await fractionToken.connect(minter).mint(alice.address, ID_USDC, 100n, "0x");
    });

    it("burner burns fractions", async () => {
      await expect(fractionToken.connect(burner).burn(alice.address, ID_USDC, 40n))
        .to.emit(fractionToken, "FractionsBurned")
        .withArgs(alice.address, ID_USDC, 40n);
      expect(await fractionToken.balanceOf(alice.address, ID_USDC)).to.equal(60n);
    });

    it("non-burner cannot burn", async () => {
      await expect(fractionToken.connect(alice).burn(alice.address, ID_USDC, 10n)).to.be.reverted;
    });
  });

  describe("Transfer Gating (KYC)", () => {
    beforeEach(async () => {
      await fractionToken.connect(minter).mint(alice.address, ID_USDC, 100n, "0x");
      await fractionToken.connect(minter).mint(alice.address, ID_OTC, 50n, "0x");
    });

    it("allows transfer ID=1 between verified wallets", async () => {
      await fractionToken.connect(alice).safeTransferFrom(alice.address, bob.address, ID_USDC, 30n, "0x");
      expect(await fractionToken.balanceOf(bob.address, ID_USDC)).to.equal(30n);
      expect(await fractionToken.balanceOf(alice.address, ID_USDC)).to.equal(70n);
    });

    it("allows transfer ID=2 between verified wallets", async () => {
      await fractionToken.connect(alice).safeTransferFrom(alice.address, bob.address, ID_OTC, 20n, "0x");
      expect(await fractionToken.balanceOf(bob.address, ID_OTC)).to.equal(20n);
    });

    it("blocks transfer to unverified wallet", async () => {
      await expect(
        fractionToken.connect(alice).safeTransferFrom(alice.address, unverified.address, ID_USDC, 10n, "0x"),
      ).to.be.revertedWithCustomError(fractionToken, "RecipientNotVerified");
    });

    it("allows batch transfer between verified wallets", async () => {
      await fractionToken.connect(alice).safeBatchTransferFrom(
        alice.address, bob.address, [ID_USDC, ID_OTC], [10n, 5n], "0x",
      );
      expect(await fractionToken.balanceOf(bob.address, ID_USDC)).to.equal(10n);
      expect(await fractionToken.balanceOf(bob.address, ID_OTC)).to.equal(5n);
    });
  });

  describe("Recovery (force-transfer)", () => {
    beforeEach(async () => {
      await fractionToken.connect(minter).mint(alice.address, ID_USDC, 100n, "0x");
      await fractionToken.connect(minter).mint(alice.address, ID_OTC, 50n, "0x");
    });

    it("recoverer can force-transfer ID=1 to verified wallet", async () => {
      const reason = ethers.toUtf8Bytes("court order #123");
      await expect(
        fractionToken.connect(recoverer).recoverFractions(alice.address, bob.address, ID_USDC, 60n, reason),
      )
        .to.emit(fractionToken, "FractionsRecovered")
        .withArgs(alice.address, bob.address, ID_USDC, 60n, ethers.hexlify(reason));

      expect(await fractionToken.balanceOf(alice.address, ID_USDC)).to.equal(40n);
      expect(await fractionToken.balanceOf(bob.address, ID_USDC)).to.equal(60n);
    });

    it("recoverer can force-transfer ID=2", async () => {
      const reason = ethers.toUtf8Bytes("inheritance");
      await fractionToken.connect(recoverer).recoverFractions(alice.address, bob.address, ID_OTC, 50n, reason);
      expect(await fractionToken.balanceOf(alice.address, ID_OTC)).to.equal(0n);
      expect(await fractionToken.balanceOf(bob.address, ID_OTC)).to.equal(50n);
    });

    it("recovery bypasses KYC on source (revoked wallet)", async () => {
      // Revoke alice AND bob so normal transfer would fail (recipient check)
      await mockRegistry.setVerified(alice.address, false);
      await mockRegistry.setVerified(bob.address, false);

      // Normal transfer fails (bob not verified)
      await expect(
        fractionToken.connect(alice).safeTransferFrom(alice.address, bob.address, ID_USDC, 10n, "0x"),
      ).to.be.revertedWithCustomError(fractionToken, "RecipientNotVerified");

      // Re-verify bob only (alice stays revoked)
      await mockRegistry.setVerified(bob.address, true);

      // Recovery still works even though alice is not verified
      const reason = ethers.toUtf8Bytes("wallet revoked");
      await fractionToken.connect(recoverer).recoverFractions(alice.address, bob.address, ID_USDC, 100n, reason);
      expect(await fractionToken.balanceOf(bob.address, ID_USDC)).to.equal(100n);
    });

    it("recovery reverts if recipient not verified", async () => {
      const reason = ethers.toUtf8Bytes("test");
      await expect(
        fractionToken.connect(recoverer).recoverFractions(alice.address, unverified.address, ID_USDC, 10n, reason),
      ).to.be.revertedWithCustomError(fractionToken, "RecipientNotVerified");
    });

    it("recovery reverts for invalid id", async () => {
      const reason = ethers.toUtf8Bytes("test");
      await expect(
        fractionToken.connect(recoverer).recoverFractions(alice.address, bob.address, 3n, 10n, reason),
      ).to.be.revertedWithCustomError(fractionToken, "InvalidId");
    });

    it("recovery reverts for zero amount", async () => {
      const reason = ethers.toUtf8Bytes("test");
      await expect(
        fractionToken.connect(recoverer).recoverFractions(alice.address, bob.address, ID_USDC, 0n, reason),
      ).to.be.revertedWithCustomError(fractionToken, "ZeroAmount");
    });

    it("non-recoverer cannot force-transfer", async () => {
      const reason = ethers.toUtf8Bytes("test");
      await expect(
        fractionToken.connect(alice).recoverFractions(alice.address, bob.address, ID_USDC, 10n, reason),
      ).to.be.reverted;
    });
  });

  describe("Version", () => {
    it("returns 5.1.0", async () => {
      expect(await fractionToken.version()).to.equal("5.1.0");
    });
  });
});
