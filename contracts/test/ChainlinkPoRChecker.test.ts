import { expect } from "chai";
import { ethers, upgrades } from "hardhat";
import { time } from "@nomicfoundation/hardhat-network-helpers";
import type {
  ChainlinkPoRChecker,
  ModularCompliance,
} from "../typechain-types";

describe("ChainlinkPoRChecker", () => {
  let module: ChainlinkPoRChecker;
  let compliance: ModularCompliance;
  let mockFeed: any;
  let owner: any;
  let other: any;

  const VALID_RESERVE = ethers.parseUnits("1000000", 8); // 1M with 8 decimals
  const ONE_DAY = 24 * 60 * 60;

  beforeEach(async () => {
    [owner, other] = await ethers.getSigners();

    // Deploy ModularCompliance
    const MCFactory = await ethers.getContractFactory("ModularCompliance");
    compliance = (await upgrades.deployProxy(MCFactory, [
      owner.address,
    ])) as unknown as ModularCompliance;

    // Deploy ChainlinkPoRChecker
    const PoRFactory = await ethers.getContractFactory("ChainlinkPoRChecker");
    module = (await upgrades.deployProxy(PoRFactory, [
      owner.address,
    ])) as unknown as ChainlinkPoRChecker;

    // Deploy mock Chainlink feed with valid initial answer
    const MockFeedFactory = await ethers.getContractFactory("MockAggregatorV3");
    mockFeed = await MockFeedFactory.deploy(VALID_RESERVE);
    await mockFeed.waitForDeployment();

    // Bind compliance to module
    const complianceAddr = await compliance.getAddress();
    await module.bindCompliance(complianceAddr);
  });

  it("returns correct name", async () => {
    expect(await module.name()).to.equal("ChainlinkPoRChecker");
  });

  it("allows transfer with valid feed data", async () => {
    const complianceAddr = await compliance.getAddress();
    const feedAddr = await mockFeed.getAddress();

    // Set the feed
    await module.setFeed(complianceAddr, feedAddr);

    // Check should pass
    const result = await module.moduleCheck(
      owner.address,
      other.address,
      ethers.parseEther("100"),
      complianceAddr
    );
    expect(result).to.be.true;
  });

  it("reverts with stale data (>24 hours old)", async () => {
    const complianceAddr = await compliance.getAddress();
    const feedAddr = await mockFeed.getAddress();

    // Set the feed
    await module.setFeed(complianceAddr, feedAddr);

    // Set feed data to be stale (25 hours ago)
    const staleTime = (await time.latest()) - ONE_DAY - 3600;
    await mockFeed.setUpdatedAt(staleTime);

    // Check should revert with StaleData
    await expect(
      module.moduleCheck(
        owner.address,
        other.address,
        ethers.parseEther("100"),
        complianceAddr
      )
    ).to.be.revertedWithCustomError(module, "StaleData");
  });

  it("reverts with zero answer", async () => {
    const complianceAddr = await compliance.getAddress();
    const feedAddr = await mockFeed.getAddress();

    // Set the feed
    await module.setFeed(complianceAddr, feedAddr);

    // Set answer to zero
    await mockFeed.setAnswer(0);

    // Check should revert with InvalidReserve
    await expect(
      module.moduleCheck(
        owner.address,
        other.address,
        ethers.parseEther("100"),
        complianceAddr
      )
    ).to.be.revertedWithCustomError(module, "InvalidReserve");
  });

  it("only owner can setFeed", async () => {
    const complianceAddr = await compliance.getAddress();
    const feedAddr = await mockFeed.getAddress();

    // Non-owner should fail
    await expect(
      module.connect(other).setFeed(complianceAddr, feedAddr)
    ).to.be.revertedWithCustomError(module, "OwnableUnauthorizedAccount");

    // Owner should succeed
    await expect(module.setFeed(complianceAddr, feedAddr)).to.emit(
      module,
      "FeedSet"
    );
  });
});
