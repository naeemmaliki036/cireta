import { expect } from "chai";
import { ethers, upgrades } from "hardhat";

describe("RedemptionManager", () => {
  let redemption: any;
  let mockToken: any;
  let owner: any, investor: any;

  beforeEach(async () => {
    [owner, investor] = await ethers.getSigners();

    const ERC20 = await ethers.getContractFactory("MockERC20");
    mockToken = await ERC20.deploy("WAGR Token", "WAGR", 18);
    await mockToken.waitForDeployment();

    const Factory = await ethers.getContractFactory("RedemptionManager");
    redemption = await upgrades.deployProxy(Factory, [
      await mockToken.getAddress(),
      owner.address,
    ], { unsafeAllow: ["state-variable-immutable", "external-library-linking", "constructor"] });

    await mockToken.mint(investor.address, ethers.parseUnits("1000", 18));
    await mockToken.connect(investor).approve(
      await redemption.getAddress(),
      ethers.parseUnits("1000", 18),
    );
  });

  it("allows investor to request redemption", async () => {
    const amount = ethers.parseUnits("100", 18);
    await expect(redemption.connect(investor).requestRedemption(amount, 0))
      .to.emit(redemption, "RedemptionRequested");
    expect(await redemption.requestCount()).to.equal(1n);
  });

  it("owner can fulfil a pending request", async () => {
    await redemption.connect(investor).requestRedemption(ethers.parseUnits("100", 18), 0);
    await expect(redemption.connect(owner).fulfil(0)).to.not.be.reverted;
  });

  it("rejects zero-amount redemption", async () => {
    await expect(redemption.connect(investor).requestRedemption(0, 0))
      .to.be.revertedWith("zero amount");
  });

  it("owner can cancel a pending request", async () => {
    await redemption.connect(investor).requestRedemption(ethers.parseUnits("50", 18), 0);
    await expect(redemption.connect(owner).cancel(0))
      .to.emit(redemption, "RedemptionCancelled");
  });
});
