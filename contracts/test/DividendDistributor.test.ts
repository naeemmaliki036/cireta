import { expect } from "chai";
import { ethers } from "hardhat";
import type { DividendDistributor, MockERC20 } from "../typechain-types";

describe("DividendDistributor", () => {
  let distributor: DividendDistributor;
  let token: MockERC20;
  let usdc: MockERC20;
  let owner: any;
  let holder1: any;
  let holder2: any;
  let holder3: any;

  const TOKEN_SUPPLY = ethers.parseUnits("1000000", 18); // 1M tokens
  const USDC_AMOUNT = ethers.parseUnits("10000", 6); // 10K USDC

  beforeEach(async () => {
    [owner, holder1, holder2, holder3] = await ethers.getSigners();

    // Deploy mock token (the security token)
    const MockERC20Factory = await ethers.getContractFactory("MockERC20");
    token = (await MockERC20Factory.deploy(
      "Cireta Gold",
      "CGLD",
      18
    )) as MockERC20;
    await token.waitForDeployment();

    // Deploy mock USDC
    usdc = (await MockERC20Factory.deploy(
      "USD Coin",
      "USDC",
      6
    )) as MockERC20;
    await usdc.waitForDeployment();

    // Deploy DividendDistributor
    const DistributorFactory = await ethers.getContractFactory(
      "DividendDistributor"
    );
    distributor = (await DistributorFactory.deploy(
      await token.getAddress(),
      await usdc.getAddress(),
      owner.address
    )) as DividendDistributor;
    await distributor.waitForDeployment();

    // Mint tokens to holder1 (50%)
    await token.mint(holder1.address, TOKEN_SUPPLY / 2n);

    // Mint tokens to holder2 (30%)
    await token.mint(holder2.address, (TOKEN_SUPPLY * 3n) / 10n);

    // Mint tokens to holder3 (20%)
    await token.mint(holder3.address, TOKEN_SUPPLY / 5n);

    // Mint USDC to owner for deposits
    await usdc.mint(owner.address, USDC_AMOUNT * 10n);

    // Approve distributor to spend USDC
    await usdc.approve(await distributor.getAddress(), USDC_AMOUNT * 10n);
  });

  // Test 1: depositEpoch emits event
  it("emits DividendDeposited event on deposit", async () => {
    await expect(distributor.deposit(USDC_AMOUNT))
      .to.emit(distributor, "DividendDeposited")
      .withArgs(0, USDC_AMOUNT, TOKEN_SUPPLY);
  });

  // Test 2: correct claim amount
  it("calculates correct claim amount for single holder", async () => {
    // Deposit 10K USDC
    await distributor.deposit(USDC_AMOUNT);

    // holder1 owns 50%, should get 5K USDC
    const expectedClaim = USDC_AMOUNT / 2n;
    const claimable = await distributor.claimable(holder1.address);
    expect(claimable).to.equal(expectedClaim);

    // Claim and verify balance
    const usdcBefore = await usdc.balanceOf(holder1.address);
    await distributor.connect(holder1).claim();
    const usdcAfter = await usdc.balanceOf(holder1.address);
    expect(usdcAfter - usdcBefore).to.equal(expectedClaim);
  });

  // Test 3: no double-claim
  it("prevents double-claiming for the same epoch", async () => {
    await distributor.deposit(USDC_AMOUNT);

    // First claim succeeds
    await distributor.connect(holder1).claim();

    // Second claim should revert with NothingToClaim
    await expect(
      distributor.connect(holder1).claim()
    ).to.be.revertedWithCustomError(distributor, "NothingToClaim");
  });

  // Test 4: pro-rata distribution with 2 holders
  it("distributes pro-rata to multiple holders", async () => {
    await distributor.deposit(USDC_AMOUNT);

    // holder1 (50%) claims
    const claimable1 = await distributor.claimable(holder1.address);
    expect(claimable1).to.equal(USDC_AMOUNT / 2n);

    // holder2 (30%) claims
    const claimable2 = await distributor.claimable(holder2.address);
    expect(claimable2).to.equal((USDC_AMOUNT * 3n) / 10n);

    // holder3 (20%) claims
    const claimable3 = await distributor.claimable(holder3.address);
    expect(claimable3).to.equal(USDC_AMOUNT / 5n);

    // All claim
    await distributor.connect(holder1).claim();
    await distributor.connect(holder2).claim();
    await distributor.connect(holder3).claim();

    // Verify final balances
    expect(await usdc.balanceOf(holder1.address)).to.equal(USDC_AMOUNT / 2n);
    expect(await usdc.balanceOf(holder2.address)).to.equal(
      (USDC_AMOUNT * 3n) / 10n
    );
    expect(await usdc.balanceOf(holder3.address)).to.equal(USDC_AMOUNT / 5n);
  });

  // Test 5: epoch totalAmount tracking
  it("tracks epoch totalAmount correctly", async () => {
    await distributor.deposit(USDC_AMOUNT);

    const epoch = await distributor.getEpoch(0);
    expect(epoch.totalAmount).to.equal(USDC_AMOUNT);
    expect(epoch.totalSupplySnapshot).to.equal(TOKEN_SUPPLY);
  });

  // Test 6: multi-epoch claim
  it("allows claiming from multiple epochs at once", async () => {
    // Deposit epoch 0
    await distributor.deposit(USDC_AMOUNT);

    // Deposit epoch 1
    await distributor.deposit(USDC_AMOUNT);

    // holder1 claims both epochs (50% of 20K = 10K)
    const expectedTotal = USDC_AMOUNT; // 50% * 2 epochs = 100% of single deposit
    const claimable = await distributor.claimable(holder1.address);
    expect(claimable).to.equal(expectedTotal);

    await distributor.connect(holder1).claim();
    expect(await usdc.balanceOf(holder1.address)).to.equal(expectedTotal);
  });

  // Test 7: revert when no balance to claim
  it("reverts when holder has no tokens", async () => {
    await distributor.deposit(USDC_AMOUNT);

    // holder with no tokens tries to claim
    const [, , , , noTokenHolder] = await ethers.getSigners();
    await expect(
      distributor.connect(noTokenHolder).claim()
    ).to.be.revertedWithCustomError(distributor, "NothingToClaim");
  });

  // Test 8: revert on zero deposit
  it("reverts on zero amount deposit", async () => {
    await expect(distributor.deposit(0)).to.be.revertedWithCustomError(
      distributor,
      "ZeroAmount"
    );
  });
});
