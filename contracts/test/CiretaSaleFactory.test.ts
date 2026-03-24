import { expect } from "chai";
import { ethers, upgrades } from "hardhat";
import { time } from "@nomicfoundation/hardhat-network-helpers";
import type { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";

describe("CiretaSaleFactory", () => {
  let saleFactory: any;
  let fractionFactory: any;
  let saleImpl: any;
  let fractionImpl: any;
  let vaultImpl: any;
  let mockUsdc: any;
  let mockToken: any;
  let mockRegistry: any;
  let owner: SignerWithAddress;
  let issuer: SignerWithAddress;
  let feeManager: SignerWithAddress;
  let other: SignerWithAddress;

  const SOFT_CAP = ethers.parseUnits("500000", 6);
  const HARD_CAP = ethers.parseUnits("2000000", 6);

  function encodeSaleInit(
    token: string, paymentToken: string, registry: string,
    iss: string, fm: string, soft: bigint, hard: bigint,
  ) {
    const iface = new ethers.Interface([
      "function initialize(address,address,address,address,address,uint256,uint256,uint256,uint256)",
    ]);
    return iface.encodeFunctionData("initialize", [
      token, paymentToken, registry, iss, fm, soft, hard, 250n, ethers.parseUnits("50000", 6),
    ]);
  }

  beforeEach(async () => {
    [owner, issuer, feeManager, other] = await ethers.getSigners();

    // Deploy mocks
    const MockIR = await ethers.getContractFactory("MockIdentityRegistry");
    mockRegistry = await MockIR.deploy();
    const ERC20 = await ethers.getContractFactory("MockERC20");
    mockUsdc = await ERC20.deploy("USDC", "USDC", 6);
    mockToken = await ERC20.deploy("WMAU", "WMAU", 18);

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
      [owner.address, await fractionImpl.getAddress(), await vaultImpl.getAddress()],
      { unsafeAllow: ["constructor"] },
    );

    // Deploy CiretaSaleFactory
    const SFContract = await ethers.getContractFactory("CiretaSaleFactory");
    saleFactory = await upgrades.deployProxy(
      SFContract,
      [owner.address, await saleImpl.getAddress()],
      { unsafeAllow: ["constructor"] },
    );

    // Link fraction factory and transfer its ownership to saleFactory
    await saleFactory.setFractionFactory(await fractionFactory.getAddress());
    await fractionFactory.transferOwnership(await saleFactory.getAddress());
  });

  describe("deploySale (Direct mode — backward compatible)", () => {
    it("deploys a Direct mode sale", async () => {
      const initData = encodeSaleInit(
        await mockToken.getAddress(), await mockUsdc.getAddress(),
        await mockRegistry.getAddress(), issuer.address, feeManager.address,
        SOFT_CAP, HARD_CAP,
      );

      const tx = await saleFactory.deploySale(
        await mockToken.getAddress(), await mockUsdc.getAddress(),
        issuer.address, SOFT_CAP, HARD_CAP, initData,
      );
      const receipt = await tx.wait();

      expect(await saleFactory.totalSales()).to.equal(1);

      const sales = await saleFactory.getSalesForToken(await mockToken.getAddress());
      expect(sales.length).to.equal(1);

      // Verify it's Direct mode (default)
      const sale = await ethers.getContractAt("Sale", sales[0]);
      expect(await sale.saleMode()).to.equal(0); // Direct
    });

    it("emits SaleDeployed event", async () => {
      const initData = encodeSaleInit(
        await mockToken.getAddress(), await mockUsdc.getAddress(),
        await mockRegistry.getAddress(), issuer.address, feeManager.address,
        SOFT_CAP, HARD_CAP,
      );

      await expect(saleFactory.deploySale(
        await mockToken.getAddress(), await mockUsdc.getAddress(),
        issuer.address, SOFT_CAP, HARD_CAP, initData,
      )).to.emit(saleFactory, "SaleDeployed");
    });
  });

  describe("deploySaleVested", () => {
    it("deploys a Vested mode sale with vault and fraction token", async () => {
      const initData = encodeSaleInit(
        await mockToken.getAddress(), await mockUsdc.getAddress(),
        await mockRegistry.getAddress(), issuer.address, feeManager.address,
        SOFT_CAP, HARD_CAP,
      );

      const tx = await saleFactory.deploySaleVested(
        await mockToken.getAddress(), await mockUsdc.getAddress(),
        issuer.address, SOFT_CAP, HARD_CAP, initData,
        "frWMAU", "frWMAU", 18,
        await mockRegistry.getAddress(),
        90 * 86400, 180 * 86400,
        0, // Keep
      );
      const receipt = await tx.wait();

      expect(await saleFactory.totalSales()).to.equal(1);

      const sales = await saleFactory.getSalesForToken(await mockToken.getAddress());
      const sale = await ethers.getContractAt("Sale", sales[0]);
      expect(await sale.saleMode()).to.equal(1); // Vested

      // Vault and fraction token are set
      const vaultAddr = await sale.vault();
      const fractionAddr = await sale.fractionToken();
      expect(vaultAddr).to.not.equal(ethers.ZeroAddress);
      expect(fractionAddr).to.not.equal(ethers.ZeroAddress);

      // Fraction factory tracks the mapping
      expect(await fractionFactory.saleToVault(sales[0])).to.equal(vaultAddr);
      expect(await fractionFactory.saleToFraction(sales[0])).to.equal(fractionAddr);
    });

    it("reverts without fraction factory", async () => {
      const SFContract = await ethers.getContractFactory("CiretaSaleFactory");
      const sfNoFF = await upgrades.deployProxy(
        SFContract,
        [owner.address, await saleImpl.getAddress()],
        { unsafeAllow: ["constructor"] },
      );

      const initData = encodeSaleInit(
        await mockToken.getAddress(), await mockUsdc.getAddress(),
        await mockRegistry.getAddress(), issuer.address, feeManager.address,
        SOFT_CAP, HARD_CAP,
      );

      await expect(sfNoFF.deploySaleVested(
        await mockToken.getAddress(), await mockUsdc.getAddress(),
        issuer.address, SOFT_CAP, HARD_CAP, initData,
        "frWMAU", "frWMAU", 18,
        await mockRegistry.getAddress(),
        90 * 86400, 180 * 86400, 0,
      )).to.be.revertedWith("no fraction factory");
    });
  });

  describe("setFractionFactory", () => {
    it("owner can set fraction factory", async () => {
      expect(await saleFactory.fractionFactory()).to.equal(await fractionFactory.getAddress());
    });

    it("rejects zero address", async () => {
      await expect(saleFactory.setFractionFactory(ethers.ZeroAddress)).to.be.revertedWith("zero addr");
    });

    it("non-owner cannot set", async () => {
      await expect(saleFactory.connect(other).setFractionFactory(other.address)).to.be.reverted;
    });
  });
});
