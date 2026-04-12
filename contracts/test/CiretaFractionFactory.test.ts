import { expect } from "chai";
import { ethers, upgrades } from "hardhat";
import type { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";

describe("CiretaFractionFactory", () => {
  let factory: any;
  let fractionImpl: any;
  let vaultImpl: any;
  let mockToken: any;
  let mockRegistry: any;
  let owner: SignerWithAddress;
  let admin: SignerWithAddress;
  let saleAddress: SignerWithAddress;
  let other: SignerWithAddress;

  const MINTER_ROLE = ethers.keccak256(ethers.toUtf8Bytes("MINTER_ROLE"));
  const BURNER_ROLE = ethers.keccak256(ethers.toUtf8Bytes("BURNER_ROLE"));
  const RECOVERY_ROLE = ethers.keccak256(ethers.toUtf8Bytes("RECOVERY_ROLE"));
  const CLIFF = 90 * 24 * 3600;
  const VESTING = 180 * 24 * 3600;

  beforeEach(async () => {
    [owner, admin, saleAddress, other] = await ethers.getSigners();

    // Deploy mocks
    const MockIR = await ethers.getContractFactory("MockIdentityRegistry");
    mockRegistry = await MockIR.deploy();
    const ERC20 = await ethers.getContractFactory("MockERC20");
    mockToken = await ERC20.deploy("Wassa Gold", "WMAU", 18);

    // Deploy implementation contracts (not proxies — raw implementations)
    const FractionToken = await ethers.getContractFactory("CiretaFractionToken1155");
    fractionImpl = await FractionToken.deploy();

    const Vault = await ethers.getContractFactory("CiretaVault");
    vaultImpl = await Vault.deploy();

    // Deploy factory via proxy
    const FactoryContract = await ethers.getContractFactory("CiretaFractionFactory");
    factory = await upgrades.deployProxy(
      FactoryContract,
      [owner.address, await fractionImpl.getAddress(), await vaultImpl.getAddress()],
      { unsafeAllow: ["constructor"] },
    );
  });

  describe("Initialization", () => {
    it("sets implementation addresses", async () => {
      expect(await factory.fractionTokenImplementation()).to.equal(await fractionImpl.getAddress());
      expect(await factory.vaultImplementation()).to.equal(await vaultImpl.getAddress());
    });
  });

  describe("deployVaultAndFraction", () => {
    it("deploys vault + fraction pair and emits event", async () => {
      const tx = await factory.deployVaultAndFraction(
        "frWMAU", "frWMAU", 18,
        await mockToken.getAddress(),
        await mockRegistry.getAddress(),
        saleAddress.address,
        CLIFF, VESTING,
        0, // Keep
        admin.address,
      );

      const receipt = await tx.wait();
      const event = receipt.logs.find((l: any) => {
        try { return factory.interface.parseLog(l)?.name === "VaultDeployed"; } catch { return false; }
      });
      expect(event).to.not.be.undefined;

      const parsed = factory.interface.parseLog(event);
      expect(parsed.args.sale).to.equal(saleAddress.address);
      expect(parsed.args.projectToken).to.equal(await mockToken.getAddress());
    });

    it("tracks mappings correctly", async () => {
      await factory.deployVaultAndFraction(
        "frWMAU", "frWMAU", 18,
        await mockToken.getAddress(),
        await mockRegistry.getAddress(),
        saleAddress.address,
        CLIFF, VESTING, 0, admin.address,
      );

      const vaultAddr = await factory.saleToVault(saleAddress.address);
      const fractionAddr = await factory.saleToFraction(saleAddress.address);
      expect(vaultAddr).to.not.equal(ethers.ZeroAddress);
      expect(fractionAddr).to.not.equal(ethers.ZeroAddress);
      expect(await factory.getDeployedVaultsCount()).to.equal(1);
    });

    it("grants correct roles on fraction token", async () => {
      await factory.deployVaultAndFraction(
        "frWMAU", "frWMAU", 18,
        await mockToken.getAddress(),
        await mockRegistry.getAddress(),
        saleAddress.address,
        CLIFF, VESTING, 0, admin.address,
      );

      const fractionAddr = await factory.saleToFraction(saleAddress.address);
      const vaultAddr = await factory.saleToVault(saleAddress.address);
      const fraction = await ethers.getContractAt("CiretaFractionToken1155", fractionAddr);

      // Sale has MINTER_ROLE
      expect(await fraction.hasRole(MINTER_ROLE, saleAddress.address)).to.be.true;
      // Vault has BURNER_ROLE
      expect(await fraction.hasRole(BURNER_ROLE, vaultAddr)).to.be.true;
      // Sale has BURNER_ROLE (for refund)
      expect(await fraction.hasRole(BURNER_ROLE, saleAddress.address)).to.be.true;
      // Admin has RECOVERY_ROLE (for force-transfers)
      expect(await fraction.hasRole(RECOVERY_ROLE, admin.address)).to.be.true;
    });

    it("sets fraction token on vault", async () => {
      await factory.deployVaultAndFraction(
        "frWMAU", "frWMAU", 18,
        await mockToken.getAddress(),
        await mockRegistry.getAddress(),
        saleAddress.address,
        CLIFF, VESTING, 0, admin.address,
      );

      const vaultAddr = await factory.saleToVault(saleAddress.address);
      const fractionAddr = await factory.saleToFraction(saleAddress.address);
      const vault = await ethers.getContractAt("CiretaVault", vaultAddr);

      expect(await vault.fractionToken()).to.equal(fractionAddr);
    });

    it("reverts when called by non-owner", async () => {
      await expect(
        factory.connect(other).deployVaultAndFraction(
          "frWMAU", "frWMAU", 18,
          await mockToken.getAddress(),
          await mockRegistry.getAddress(),
          saleAddress.address,
          CLIFF, VESTING, 0, admin.address,
        ),
      ).to.be.reverted;
    });
  });

  describe("Implementation updates", () => {
    it("owner can update fraction implementation", async () => {
      const NewFT = await ethers.getContractFactory("CiretaFractionToken1155");
      const newImpl = await NewFT.deploy();
      await factory.setFractionTokenImplementation(await newImpl.getAddress());
      expect(await factory.fractionTokenImplementation()).to.equal(await newImpl.getAddress());
    });

    it("owner can update vault implementation", async () => {
      const NewV = await ethers.getContractFactory("CiretaVault");
      const newImpl = await NewV.deploy();
      await factory.setVaultImplementation(await newImpl.getAddress());
      expect(await factory.vaultImplementation()).to.equal(await newImpl.getAddress());
    });

    it("rejects zero address implementation", async () => {
      await expect(factory.setFractionTokenImplementation(ethers.ZeroAddress)).to.be.revertedWith("zero impl");
      await expect(factory.setVaultImplementation(ethers.ZeroAddress)).to.be.revertedWith("zero impl");
    });
  });
});
