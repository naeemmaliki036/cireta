import { expect } from "chai";
import { ethers, upgrades } from "hardhat";
import type { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";

describe("CiretaSaleFactory", () => {
  let saleFactory: any;
  let fractionFactory: any;
  let issuerRegistry: any;
  let platformFeeManager: any;
  let saleImpl: any;
  let fractionImpl: any;
  let vaultImpl: any;
  let mockUsdc: any;
  let mockToken: any;
  let mockRegistry: any;
  let admin: SignerWithAddress;   // platform admin (ciretaAdmin)
  let issuer: SignerWithAddress;  // active issuer
  let feeReceiver: SignerWithAddress;
  let other: SignerWithAddress;

  const SOFT_CAP = ethers.parseUnits("500000", 6);
  const HARD_CAP = ethers.parseUnits("2000000", 6);
  const FEE_BPS = 250n;
  const FEE_CAP = ethers.parseUnits("50000", 6);

  /**
   * Encode Sale.initialize() calldata.
   * New signature: (token, paymentToken, identityRegistry, issuer, admin, feeManager, softCap, hardCap, feeBps, feeCap)
   */
  /**
   * Encode Sale.initialize() calldata.
   * Signature: (token, paymentToken, identityRegistry, issuer, factory, feeManager, softCap, hardCap, feeBps, feeCap)
   */
  function encodeSaleInit(
    token: string, paymentToken: string, registry: string,
    iss: string, factoryAddr: string, fm: string,
    soft: bigint, hard: bigint, feeBps?: bigint,
  ) {
    const iface = new ethers.Interface([
      "function initialize(address,address,address,address,address,address,uint256,uint256,uint256,uint256)",
    ]);
    return iface.encodeFunctionData("initialize", [
      token, paymentToken, registry, iss, factoryAddr, fm, soft, hard, feeBps ?? FEE_BPS, FEE_CAP,
    ]);
  }

  beforeEach(async () => {
    [admin, issuer, feeReceiver, other] = await ethers.getSigners();

    // Deploy mocks
    const MockIR = await ethers.getContractFactory("MockIdentityRegistry");
    mockRegistry = await MockIR.deploy();
    const ERC20 = await ethers.getContractFactory("MockERC20");
    mockUsdc = await ERC20.deploy("USDC", "USDC", 6);
    mockToken = await ERC20.deploy("WMAU", "WMAU", 18);

    // Deploy IssuerRegistry and register issuer
    const IssuerRegistryContract = await ethers.getContractFactory("IssuerRegistry");
    issuerRegistry = await upgrades.deployProxy(
      IssuerRegistryContract,
      [admin.address],
      { kind: "uups" },
    );
    await issuerRegistry.registerIssuer(issuer.address, "Test Issuer", "US");
    await issuerRegistry.activateIssuer(issuer.address);

    // Deploy PlatformFeeManager
    const PFMContract = await ethers.getContractFactory("PlatformFeeManager");
    platformFeeManager = await upgrades.deployProxy(
      PFMContract,
      [admin.address, feeReceiver.address, 250], // 2.5% default
      { kind: "uups" },
    );

    // Deploy implementations
    const SaleContract = await ethers.getContractFactory("Sale");
    saleImpl = await SaleContract.deploy();
    const FT = await ethers.getContractFactory("CiretaFractionToken");
    fractionImpl = await FT.deploy();
    const V = await ethers.getContractFactory("CiretaVault");
    vaultImpl = await V.deploy();

    // Deploy CiretaFractionFactory
    const FFContract = await ethers.getContractFactory("CiretaFractionFactory");
    fractionFactory = await upgrades.deployProxy(
      FFContract,
      [admin.address, await fractionImpl.getAddress(), await vaultImpl.getAddress()],
      { unsafeAllow: ["constructor"] },
    );

    // Deploy CiretaSaleFactory
    const SFContract = await ethers.getContractFactory("CiretaSaleFactory");
    saleFactory = await upgrades.deployProxy(
      SFContract,
      [admin.address, await saleImpl.getAddress()],
      { unsafeAllow: ["constructor"] },
    );

    // Configure factory
    await saleFactory.setFractionFactory(await fractionFactory.getAddress());
    await saleFactory.setIssuerRegistry(await issuerRegistry.getAddress());
    await saleFactory.setPlatformFeeManager(await platformFeeManager.getAddress());
    await fractionFactory.transferOwnership(await saleFactory.getAddress());
  });

  describe("deploySale (Direct mode — issuer-initiated)", () => {
    it("active issuer deploys a Direct mode sale", async () => {
      const initData = encodeSaleInit(
        await mockToken.getAddress(), await mockUsdc.getAddress(),
        await mockRegistry.getAddress(), issuer.address, await saleFactory.getAddress(),
        feeReceiver.address, SOFT_CAP, HARD_CAP,
      );

      // Issuer calls deploySale (not admin)
      const tx = await saleFactory.connect(issuer).deploySale(
        await mockToken.getAddress(), initData,
      );
      await tx.wait();

      expect(await saleFactory.totalSales()).to.equal(1);

      const sales = await saleFactory.getSalesForToken(await mockToken.getAddress());
      expect(sales.length).to.equal(1);

      // Verify Direct mode
      const sale = await ethers.getContractAt("Sale", sales[0]);
      expect(await sale.saleMode()).to.equal(0);

      // Verify admin is platform admin, issuer is the issuer
      expect(await sale.admin()).to.equal(admin.address);
      expect(await sale.issuer()).to.equal(issuer.address);

      // Verify issuerSales tracking
      const issuerSales = await saleFactory.getSalesForIssuer(issuer.address);
      expect(issuerSales.length).to.equal(1);
      expect(issuerSales[0]).to.equal(sales[0]);
    });

    it("emits SaleDeployed event", async () => {
      const initData = encodeSaleInit(
        await mockToken.getAddress(), await mockUsdc.getAddress(),
        await mockRegistry.getAddress(), issuer.address, await saleFactory.getAddress(),
        feeReceiver.address, SOFT_CAP, HARD_CAP,
      );

      await expect(saleFactory.connect(issuer).deploySale(
        await mockToken.getAddress(), initData,
      )).to.emit(saleFactory, "SaleDeployed");
    });

    it("reverts when called by non-issuer", async () => {
      const initData = encodeSaleInit(
        await mockToken.getAddress(), await mockUsdc.getAddress(),
        await mockRegistry.getAddress(), other.address, await saleFactory.getAddress(),
        feeReceiver.address, SOFT_CAP, HARD_CAP,
      );

      await expect(saleFactory.connect(other).deploySale(
        await mockToken.getAddress(), initData,
      )).to.be.revertedWithCustomError(saleFactory, "NotActiveIssuer");
    });

    it("reverts when issuer mismatch in initData", async () => {
      // initData encodes other.address as issuer, but msg.sender is issuer
      const initData = encodeSaleInit(
        await mockToken.getAddress(), await mockUsdc.getAddress(),
        await mockRegistry.getAddress(), other.address, await saleFactory.getAddress(),
        feeReceiver.address, SOFT_CAP, HARD_CAP,
      );

      await expect(saleFactory.connect(issuer).deploySale(
        await mockToken.getAddress(), initData,
      )).to.be.revertedWithCustomError(saleFactory, "IssuerMismatch");
    });

    it("reverts when factory mismatch in initData", async () => {
      // initData encodes other.address as factory, but should be saleFactory address
      const initData = encodeSaleInit(
        await mockToken.getAddress(), await mockUsdc.getAddress(),
        await mockRegistry.getAddress(), issuer.address, other.address,
        feeReceiver.address, SOFT_CAP, HARD_CAP,
      );

      await expect(saleFactory.connect(issuer).deploySale(
        await mockToken.getAddress(), initData,
      )).to.be.revertedWithCustomError(saleFactory, "FactoryMismatch");
    });

    it("reverts when fee mismatch", async () => {
      // initData encodes 0 fee, but PlatformFeeManager says 250
      const initData = encodeSaleInit(
        await mockToken.getAddress(), await mockUsdc.getAddress(),
        await mockRegistry.getAddress(), issuer.address, await saleFactory.getAddress(),
        feeReceiver.address, SOFT_CAP, HARD_CAP, 0n,
      );

      await expect(saleFactory.connect(issuer).deploySale(
        await mockToken.getAddress(), initData,
      )).to.be.revertedWithCustomError(saleFactory, "FeeMismatch");
    });
  });

  describe("deploySaleVested (issuer-initiated)", () => {
    it("deploys a Vested mode sale with vault and fraction token", async () => {
      // For vested mode, factory must be admin in initData to call setVestedMode
      const initData = encodeSaleInit(
        await mockToken.getAddress(), await mockUsdc.getAddress(),
        await mockRegistry.getAddress(), issuer.address,
        await saleFactory.getAddress(), // factory as temporary admin
        feeReceiver.address, SOFT_CAP, HARD_CAP,
      );

      const tx = await saleFactory.connect(issuer).deploySaleVested(
        await mockToken.getAddress(), initData,
        "frWMAU", "frWMAU", 18,
        await mockRegistry.getAddress(),
        90 * 86400, 180 * 86400,
        0, // Keep
      );
      await tx.wait();

      expect(await saleFactory.totalSales()).to.equal(1);

      const sales = await saleFactory.getSalesForToken(await mockToken.getAddress());
      const sale = await ethers.getContractAt("Sale", sales[0]);
      expect(await sale.saleMode()).to.equal(1); // Vested

      // Vault and fraction token are set
      const vaultAddr = await sale.vault();
      const fractionAddr = await sale.fractionToken();
      expect(vaultAddr).to.not.equal(ethers.ZeroAddress);
      expect(fractionAddr).to.not.equal(ethers.ZeroAddress);

      // Sale admin transferred to platform admin (not factory, not issuer)
      expect(await sale.admin()).to.equal(admin.address);
      expect(await sale.issuer()).to.equal(issuer.address);

      // Fraction factory tracks the mapping
      expect(await fractionFactory.saleToVault(sales[0])).to.equal(vaultAddr);
      expect(await fractionFactory.saleToFraction(sales[0])).to.equal(fractionAddr);

      // Issuer sales tracking
      const issuerSales = await saleFactory.getSalesForIssuer(issuer.address);
      expect(issuerSales.length).to.equal(1);
    });

    it("reverts without fraction factory", async () => {
      const SFContract = await ethers.getContractFactory("CiretaSaleFactory");
      const sfNoFF = await upgrades.deployProxy(
        SFContract,
        [admin.address, await saleImpl.getAddress()],
        { unsafeAllow: ["constructor"] },
      );
      await sfNoFF.setIssuerRegistry(await issuerRegistry.getAddress());

      const initData = encodeSaleInit(
        await mockToken.getAddress(), await mockUsdc.getAddress(),
        await mockRegistry.getAddress(), issuer.address,
        await sfNoFF.getAddress(),
        feeReceiver.address, SOFT_CAP, HARD_CAP,
      );

      await expect(sfNoFF.connect(issuer).deploySaleVested(
        await mockToken.getAddress(), initData,
        "frWMAU", "frWMAU", 18,
        await mockRegistry.getAddress(),
        90 * 86400, 180 * 86400, 0,
      )).to.be.revertedWith("no fraction factory");
    });
  });

  describe("Sale access control", () => {
    let sale: any;

    beforeEach(async () => {
      const initData = encodeSaleInit(
        await mockToken.getAddress(), await mockUsdc.getAddress(),
        await mockRegistry.getAddress(), issuer.address, await saleFactory.getAddress(),
        feeReceiver.address, SOFT_CAP, HARD_CAP,
      );
      await saleFactory.connect(issuer).deploySale(await mockToken.getAddress(), initData);
      const sales = await saleFactory.getSalesForToken(await mockToken.getAddress());
      sale = await ethers.getContractAt("Sale", sales[0]);
    });

    it("admin can activate", async () => {
      await sale.connect(admin).activate();
      expect(await sale.status()).to.equal(1); // Active
    });

    it("issuer cannot activate", async () => {
      await expect(sale.connect(issuer).activate()).to.be.revertedWithCustomError(sale, "NotAdmin");
    });

    it("issuer can add phases", async () => {
      const now = Math.floor(Date.now() / 1000);
      await sale.connect(issuer).addPhase("Phase 1", ethers.parseUnits("1", 6), ethers.parseUnits("1000000", 18), 0, 0, now, now + 86400, false);
      expect(await sale.getPhaseCount()).to.equal(1);
    });

    it("admin cannot add phases", async () => {
      const now = Math.floor(Date.now() / 1000);
      await expect(sale.connect(admin).addPhase("Phase 1", ethers.parseUnits("1", 6), ethers.parseUnits("1000000", 18), 0, 0, now, now + 86400, false))
        .to.be.revertedWithCustomError(sale, "NotIssuer");
    });

    it("both can pause, only admin can unpause", async () => {
      await sale.connect(admin).activate();

      // Issuer can pause
      await sale.connect(issuer).pause();
      expect(await sale.status()).to.equal(2); // Paused

      // Issuer cannot unpause
      await expect(sale.connect(issuer).unpause()).to.be.revertedWithCustomError(sale, "NotAdmin");

      // Admin can unpause
      await sale.connect(admin).unpause();
      expect(await sale.status()).to.equal(1); // Active
    });

    it("only issuer can withdraw funds", async () => {
      // withdrawFunds requires FinalizedSuccess — just verify access control revert
      await expect(sale.connect(admin).withdrawFunds()).to.be.revertedWithCustomError(sale, "NotIssuer");
    });
  });

  describe("Dynamic admin lookup (Sale → Factory)", () => {
    let sale: any;

    beforeEach(async () => {
      const initData = encodeSaleInit(
        await mockToken.getAddress(), await mockUsdc.getAddress(),
        await mockRegistry.getAddress(), issuer.address, await saleFactory.getAddress(),
        feeReceiver.address, SOFT_CAP, HARD_CAP,
      );
      await saleFactory.connect(issuer).deploySale(await mockToken.getAddress(), initData);
      const sales = await saleFactory.getSalesForToken(await mockToken.getAddress());
      sale = await ethers.getContractAt("Sale", sales[0]);
    });

    it("sale.admin() returns factory owner", async () => {
      expect(await sale.admin()).to.equal(admin.address);
    });

    it("sale.factory() returns the CiretaSaleFactory address", async () => {
      expect(await sale.factory()).to.equal(await saleFactory.getAddress());
    });

    it("admin rotation on factory propagates to all sales instantly", async () => {
      // Before rotation
      expect(await sale.admin()).to.equal(admin.address);

      // Transfer factory ownership to other
      await saleFactory.connect(admin).transferOwnership(other.address);

      // Sale now reflects new admin — no migration needed
      expect(await sale.admin()).to.equal(other.address);

      // Old admin can no longer activate
      await expect(sale.connect(admin).activate()).to.be.revertedWithCustomError(sale, "NotAdmin");

      // New admin can activate
      await sale.connect(other).activate();
      expect(await sale.status()).to.equal(1); // Active
    });

    it("factory itself passes adminOnly checks", async () => {
      // Deploy a second sale via factory (vested) — factory calls setVestedMode which is adminOnly
      // This is already tested in deploySaleVested, but let's verify the factory address is recognized
      const saleFactory2 = saleFactory; // same factory
      const factoryAddr = await saleFactory2.getAddress();

      // The sale's _isAdmin() should return true for the factory address
      // We can't call adminOnly functions directly from factory in this test,
      // but the deploySaleVested test already proves it works (setVestedMode succeeds)
      // Just verify the factory address is stored correctly
      expect(await sale.factory()).to.equal(factoryAddr);
    });

    it("multiple sales share the same admin via factory", async () => {
      // Deploy a second sale
      const initData2 = encodeSaleInit(
        await mockToken.getAddress(), await mockUsdc.getAddress(),
        await mockRegistry.getAddress(), issuer.address, await saleFactory.getAddress(),
        feeReceiver.address, SOFT_CAP, HARD_CAP,
      );
      await saleFactory.connect(issuer).deploySale(await mockToken.getAddress(), initData2);
      const sales = await saleFactory.getSalesForToken(await mockToken.getAddress());
      const sale2 = await ethers.getContractAt("Sale", sales[1]);

      // Both sales have same admin
      expect(await sale.admin()).to.equal(admin.address);
      expect(await sale2.admin()).to.equal(admin.address);

      // Rotate admin once — both sales follow
      await saleFactory.connect(admin).transferOwnership(other.address);
      expect(await sale.admin()).to.equal(other.address);
      expect(await sale2.admin()).to.equal(other.address);
    });
  });

  describe("setFractionFactory", () => {
    it("admin can set fraction factory", async () => {
      expect(await saleFactory.fractionFactory()).to.equal(await fractionFactory.getAddress());
    });

    it("rejects zero address", async () => {
      await expect(saleFactory.setFractionFactory(ethers.ZeroAddress)).to.be.revertedWith("zero addr");
    });

    it("non-admin cannot set", async () => {
      await expect(saleFactory.connect(other).setFractionFactory(other.address)).to.be.reverted;
    });
  });
});
