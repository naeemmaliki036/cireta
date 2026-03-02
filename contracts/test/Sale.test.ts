import { expect } from "chai";
import { ethers, upgrades } from "hardhat";
import { time } from "@nomicfoundation/hardhat-network-helpers";

describe("Sale", () => {
  let sale: any;
  let mockUsdc: any, mockToken: any, mockIdentityRegistry: any;
  let owner: any, issuer: any, investor: any, feeManager: any;

  const SOFT_CAP = ethers.parseUnits("500000", 6);
  const HARD_CAP = ethers.parseUnits("2000000", 6);
  const PRICE    = ethers.parseUnits("65", 6);
  const MIN_C    = ethers.parseUnits("500", 6);
  const MAX_C    = ethers.parseUnits("100000", 6);

  beforeEach(async () => {
    [owner, issuer, investor, feeManager] = await ethers.getSigners();

    const ERC20 = await ethers.getContractFactory("MockERC20");
    mockUsdc = await ERC20.deploy("USD Coin", "USDC", 6);
    mockToken = await ERC20.deploy("Gold Token", "WAGR", 18);
    const MockIR = await ethers.getContractFactory("MockIdentityRegistry");
    mockIdentityRegistry = await MockIR.deploy();

    const SaleFactory = await ethers.getContractFactory("Sale");
    sale = await upgrades.deployProxy(SaleFactory, [
      await mockToken.getAddress(),
      await mockUsdc.getAddress(),
      await mockIdentityRegistry.getAddress(),
      issuer.address,
      feeManager.address,
      SOFT_CAP, HARD_CAP, 250n, ethers.parseUnits("50000", 6),
    ], { unsafeAllow: ["state-variable-immutable", "external-library-linking", "constructor"] });

    await mockUsdc.mint(investor.address, ethers.parseUnits("200000", 6));
    const now = await time.latest();
    await sale.addPhase("Public", PRICE, ethers.parseUnits("30000", 18), MIN_C, MAX_C, now + 10, now + 86400, false);
    await sale.activate();
    await time.increase(15);
  });

  it("deploys with correct caps", async () => {
    expect(await sale.softCap()).to.equal(SOFT_CAP);
    expect(await sale.hardCap()).to.equal(HARD_CAP);
  });

  it("allows valid contribution", async () => {
    const amount = ethers.parseUnits("1000", 6);
    await mockUsdc.connect(investor).approve(await sale.getAddress(), amount);
    await expect(sale.connect(investor).contribute(0, amount)).to.not.be.reverted;
    expect(await sale.totalRaised()).to.equal(amount);
  });

  it("reverts below minimum", async () => {
    const amount = ethers.parseUnits("100", 6);
    await mockUsdc.connect(investor).approve(await sale.getAddress(), amount);
    await expect(sale.connect(investor).contribute(0, amount)).to.be.revertedWith("below min");
  });

  it("reverts when paused", async () => {
    await sale.pause();
    const amount = ethers.parseUnits("1000", 6);
    await mockUsdc.connect(investor).approve(await sale.getAddress(), amount);
    await expect(sale.connect(investor).contribute(0, amount)).to.be.revertedWithCustomError(sale, "InvalidStatus");
  });

  it("reverts above max", async () => {
    const amount = ethers.parseUnits("150000", 6);
    await mockUsdc.connect(investor).approve(await sale.getAddress(), amount);
    await expect(sale.connect(investor).contribute(0, amount)).to.be.revertedWith("exceeds max");
  });

  it("emits Contributed event", async () => {
    const amount = ethers.parseUnits("1000", 6);
    await mockUsdc.connect(investor).approve(await sale.getAddress(), amount);
    await expect(sale.connect(investor).contribute(0, amount))
      .to.emit(sale, "ContributionMade");
  });
});
