/**
 * E2E: Last-chunk exception — buy remaining tokens below minimum.
 * Including hard-cap-constrained last-chunk scenarios.
 */
import { expect } from "chai";
import { ethers, upgrades } from "hardhat";
import { time } from "@nomicfoundation/hardhat-network-helpers";

async function deploySale(admin: any, issuer: any, feeManager: any, opts: {
  totalSupply: bigint; hardCap: bigint; price: bigint; minTokens: bigint; maxTokens: bigint; topUpMin: bigint;
}) {
  const ERC20 = await ethers.getContractFactory("MockERC20");
  const usdc = await ERC20.deploy("USDC", "USDC", 6);
  const token = await ERC20.deploy("GOLD", "GOLD", 6);
  const MockIR = await ethers.getContractFactory("MockIdentityRegistry");
  const ir = await MockIR.deploy();
  const MSF = await ethers.getContractFactory("MockSaleFactory");
  const factory = await MSF.deploy(admin.address);

  const now = await time.latest();
  const start = now + 60;
  const end = now + 30 * 86400;

  const Sale = await ethers.getContractFactory("Sale");
  const sale = await upgrades.deployProxy(Sale, [
    await token.getAddress(), await usdc.getAddress(), await ir.getAddress(),
    issuer.address, await factory.getAddress(), feeManager.address,
    ethers.parseUnits("1000", 6), opts.hardCap,
    0n, 0n, ethers.ZeroAddress, start, end, opts.totalSupply,
  ], { unsafeAllow: ["constructor"] });

  await token.mint(await sale.getAddress(), opts.totalSupply);
  await sale.connect(issuer).addPhase(
    "Phase1", opts.price, opts.totalSupply,
    opts.minTokens, opts.maxTokens, opts.topUpMin,
    BigInt(start), BigInt(end), false, 0,
  );
  await sale.connect(admin).approveSale();
  await sale.connect(issuer).activate();
  await time.increaseTo(start + 10);

  return { sale, usdc, token, start, end };
}

describe("E2E: Last-chunk purchase", () => {
  let admin: any, issuer: any, feeManager: any, buyerA: any, buyerB: any;

  before(async () => {
    [admin, issuer, feeManager, buyerA, buyerB] = await ethers.getSigners();
  });

  it("Case 1: last chunk fits within hard cap — no overshoot", async () => {
    const { sale, usdc } = await deploySale(admin, issuer, feeManager, {
      totalSupply: ethers.parseUnits("100", 6),
      hardCap: ethers.parseUnits("100000", 6),
      price: ethers.parseUnits("1000", 6),
      minTokens: 50n, maxTokens: 100n, topUpMin: 10n,
    });

    await usdc.mint(buyerA.address, ethers.parseUnits("200000", 6));
    await usdc.connect(buyerA).approve(await sale.getAddress(), ethers.parseUnits("200000", 6));
    await sale.connect(buyerA).buy(0, 97n);

    await usdc.mint(buyerB.address, ethers.parseUnits("10000", 6));
    await usdc.connect(buyerB).approve(await sale.getAddress(), ethers.parseUnits("10000", 6));
    await sale.connect(buyerB).buy(0, 3n);
    expect(await sale.getRemainingSupply()).to.equal(0);
  });

  it("Case 2: last chunk exceeds hard cap — small overshoot allowed", async () => {
    const { sale, usdc } = await deploySale(admin, issuer, feeManager, {
      totalSupply: ethers.parseUnits("100", 6),
      hardCap: ethers.parseUnits("97000", 6), // tight cap
      price: ethers.parseUnits("1000", 6),
      minTokens: 50n, maxTokens: 100n, topUpMin: 10n,
    });

    await usdc.mint(buyerA.address, ethers.parseUnits("200000", 6));
    await usdc.connect(buyerA).approve(await sale.getAddress(), ethers.parseUnits("200000", 6));
    await sale.connect(buyerA).buy(0, 97n); // $97k = hard cap

    await usdc.mint(buyerB.address, ethers.parseUnits("10000", 6));
    await usdc.connect(buyerB).approve(await sale.getAddress(), ethers.parseUnits("10000", 6));
    // 3 × $1000 = $3k overshoot
    await sale.connect(buyerB).buy(0, 3n);
    expect(await sale.getRemainingSupply()).to.equal(0);
    expect(await sale.totalRaised()).to.equal(ethers.parseUnits("100000", 6));
  });

  it("Case 3: 1 token remaining, exceeds hard cap — allowed", async () => {
    const { sale, usdc } = await deploySale(admin, issuer, feeManager, {
      totalSupply: ethers.parseUnits("100", 6),
      hardCap: ethers.parseUnits("99500", 6),
      price: ethers.parseUnits("1000", 6),
      minTokens: 50n, maxTokens: 100n, topUpMin: 10n,
    });

    await usdc.mint(buyerA.address, ethers.parseUnits("200000", 6));
    await usdc.connect(buyerA).approve(await sale.getAddress(), ethers.parseUnits("200000", 6));
    await sale.connect(buyerA).buy(0, 99n);

    await usdc.mint(buyerB.address, ethers.parseUnits("10000", 6));
    await usdc.connect(buyerB).approve(await sale.getAddress(), ethers.parseUnits("10000", 6));
    await sale.connect(buyerB).buy(0, 1n);
    expect(await sale.getRemainingSupply()).to.equal(0);
  });

  it("Case 4: remaining < min but still last-chunk with hard cap overshoot", async () => {
    const { sale, usdc } = await deploySale(admin, issuer, feeManager, {
      totalSupply: ethers.parseUnits("100", 6),
      hardCap: ethers.parseUnits("95000", 6),
      price: ethers.parseUnits("1000", 6),
      minTokens: 50n, maxTokens: 100n, topUpMin: 10n,
    });

    await usdc.mint(buyerA.address, ethers.parseUnits("200000", 6));
    await usdc.connect(buyerA).approve(await sale.getAddress(), ethers.parseUnits("200000", 6));
    await sale.connect(buyerA).buy(0, 90n); // $90k raised, 10 remaining < min 50

    await usdc.mint(buyerB.address, ethers.parseUnits("200000", 6));
    await usdc.connect(buyerB).approve(await sale.getAddress(), ethers.parseUnits("200000", 6));
    // 10 × $1000 = $10k → $100k > $95k cap. Last chunk allows overshoot.
    await sale.connect(buyerB).buy(0, 10n);
    expect(await sale.getRemainingSupply()).to.equal(0);
  });

  it("Case 5: hard-cap-constrained — buy max affordable tokens", async () => {
    const { sale, usdc } = await deploySale(admin, issuer, feeManager, {
      totalSupply: ethers.parseUnits("100", 6),
      hardCap: ethers.parseUnits("98000", 6),
      price: ethers.parseUnits("1000", 6),
      minTokens: 50n, maxTokens: 100n, topUpMin: 10n,
    });

    await usdc.mint(buyerA.address, ethers.parseUnits("200000", 6));
    await usdc.connect(buyerA).approve(await sale.getAddress(), ethers.parseUnits("200000", 6));
    await sale.connect(buyerA).buy(0, 95n); // $95k raised, 5 remaining

    await usdc.mint(buyerB.address, ethers.parseUnits("200000", 6));
    await usdc.connect(buyerB).approve(await sale.getAddress(), ethers.parseUnits("200000", 6));
    // Max affordable: floor($3000/$1000) = 3. Buy exactly 3.
    await sale.connect(buyerB).buy(0, 3n);
    expect(await sale.totalRaised()).to.equal(ethers.parseUnits("98000", 6));
    expect(await sale.getRemainingSupply()).to.equal(ethers.parseUnits("2", 6));
  });

  it("Case 6: top-up last chunk with hard cap overshoot", async () => {
    const { sale, usdc } = await deploySale(admin, issuer, feeManager, {
      totalSupply: ethers.parseUnits("100", 6),
      hardCap: ethers.parseUnits("97000", 6),
      price: ethers.parseUnits("1000", 6),
      minTokens: 50n, maxTokens: 100n, topUpMin: 10n,
    });

    await usdc.mint(buyerA.address, ethers.parseUnits("200000", 6));
    await usdc.connect(buyerA).approve(await sale.getAddress(), ethers.parseUnits("200000", 6));
    await sale.connect(buyerA).buy(0, 95n); // $95k, 5 remaining

    // Top-up 5 (below topUp min 10) — last chunk + exceeds cap
    await sale.connect(buyerA).buy(0, 5n);
    expect(await sale.getRemainingSupply()).to.equal(0);
  });

  it("Case 7: non-last-chunk normal buy still blocked by hard cap", async () => {
    const { sale, usdc } = await deploySale(admin, issuer, feeManager, {
      totalSupply: ethers.parseUnits("1000", 6),
      hardCap: ethers.parseUnits("50000", 6),
      price: ethers.parseUnits("1000", 6),
      minTokens: 50n, maxTokens: 1000n, topUpMin: 10n,
    });

    await usdc.mint(buyerA.address, ethers.parseUnits("200000", 6));
    await usdc.connect(buyerA).approve(await sale.getAddress(), ethers.parseUnits("200000", 6));
    await sale.connect(buyerA).buy(0, 50n); // $50k = hard cap

    await expect(sale.connect(buyerA).buy(0, 50n))
      .to.be.revertedWithCustomError(sale, "ExceedsHardCap");
  });

  it("Case 8: buying wrong amount when not exact remaining — fails", async () => {
    const { sale, usdc } = await deploySale(admin, issuer, feeManager, {
      totalSupply: ethers.parseUnits("100", 6),
      hardCap: ethers.parseUnits("100000", 6),
      price: ethers.parseUnits("1000", 6),
      minTokens: 50n, maxTokens: 100n, topUpMin: 10n,
    });

    await usdc.mint(buyerA.address, ethers.parseUnits("200000", 6));
    await usdc.connect(buyerA).approve(await sale.getAddress(), ethers.parseUnits("200000", 6));
    await sale.connect(buyerA).buy(0, 97n);

    await usdc.mint(buyerB.address, ethers.parseUnits("200000", 6));
    await usdc.connect(buyerB).approve(await sale.getAddress(), ethers.parseUnits("200000", 6));

    // 2 != 3 remaining, not max affordable
    await expect(sale.connect(buyerB).buy(0, 2n))
      .to.be.revertedWithCustomError(sale, "BelowMinContribution");
  });
});
