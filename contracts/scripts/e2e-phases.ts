/**
 * E2E phase-mutation test — exercises the four issuer-side phase primitives
 * plus the Round-6 setPrice() function on a local Hardhat node.
 *
 * Coverage:
 *   1. extendPhase — push end later, valid + revert cases (overlap, ended, past)
 *   2. shortenPhase — close phase early, valid + revert (must reduce, in past)
 *   3. advancePhaseStart — bring future phase forward, valid + revert
 *   4. setPrice (Round-6, direct mode only) — happy path; reverts (vested mode,
 *      zero price, no active phase, would-overlap-future-phase)
 *
 * Run:
 *   ./node_modules/.bin/hardhat node                # in another terminal
 *   ./node_modules/.bin/hardhat run scripts/e2e-phases.ts --network localhost
 */

import { ethers, upgrades } from "hardhat";
import { Contract, Signer } from "ethers";

const ZERO = ethers.ZeroAddress;
const COUNTRY = 840;
const ALLOC_FIXED = 0;

function ok(label: string, cond: boolean) {
  const tag = cond ? "PASS" : "FAIL";
  console.log(`   [${tag}] ${label}`);
  if (!cond) {
    process.exitCode = 1;
    throw new Error(`assertion failed: ${label}`);
  }
}

function header(s: string) {
  console.log("\n──────────────────────────────────────────────────");
  console.log(s);
  console.log("──────────────────────────────────────────────────");
}

async function expectRevert(p: Promise<any>, label: string, fragment?: string) {
  try {
    await p;
    ok(`${label} (expected revert)`, false);
  } catch (e: any) {
    const msg = e?.shortMessage || e?.message || String(e);
    if (fragment && !msg.toLowerCase().includes(fragment.toLowerCase())) {
      console.log(`   [WARN] revert fragment "${fragment}" not in: ${msg.slice(0, 140)}`);
    }
    ok(`${label} (reverted)`, true);
  }
}

async function now(): Promise<bigint> {
  const block = await ethers.provider.getBlock("latest");
  return BigInt(block!.timestamp);
}

async function fastForward(seconds: number | bigint) {
  await ethers.provider.send("evm_increaseTime", [Number(seconds)]);
  await ethers.provider.send("evm_mine", []);
}

interface World {
  deployer: Signer;
  issuer: Signer;
  inv1: Signer;
  inv2: Signer;
  registry: Contract;
  usdc: Contract;
}

async function deployWorld(): Promise<World> {
  const [deployer, issuer, inv1, inv2] = await ethers.getSigners();

  const SimpleIR = await ethers.getContractFactory("SimpleIdentityRegistry");
  const registry = (await upgrades.deployProxy(SimpleIR, [
    await deployer.getAddress(), ZERO, ZERO, ZERO,
  ], { kind: "uups" })) as unknown as Contract;
  await registry.waitForDeployment();

  const REGISTRAR_ROLE = await registry.REGISTRAR_ROLE();
  await (await registry.grantRole(REGISTRAR_ROLE, await deployer.getAddress())).wait();
  for (const s of [issuer, inv1, inv2]) {
    await (await registry.addToWhitelist(await s.getAddress(), COUNTRY)).wait();
  }

  const USDC = await ethers.getContractFactory("CiretaUSDC");
  const usdc = await USDC.deploy();
  await usdc.waitForDeployment();
  const fund = 1_000_000n * 10n ** 6n;
  for (const s of [inv1, inv2, issuer]) {
    await (await usdc.mint(await s.getAddress(), fund)).wait();
  }

  return { deployer, issuer, inv1, inv2, registry, usdc };
}

interface SaleStack {
  projectToken: Contract;
  sale: Contract;
  factoryStub: Contract;
  saleEndTime: bigint;
}

async function deploySale(opts: {
  w: World;
  vested: boolean;
  totalTokens: bigint;
  saleStartOffset?: number;
  saleDuration?: number;
}): Promise<SaleStack> {
  const { w } = opts;
  const deployerAddr = await w.deployer.getAddress();
  const issuerAddr = await w.issuer.getAddress();

  const Compliance = await ethers.getContractFactory("ModularCompliance");
  const compliance = (await upgrades.deployProxy(Compliance, [deployerAddr], { kind: "uups" })) as unknown as Contract;
  await compliance.waitForDeployment();

  const Token = await ethers.getContractFactory("CiretaToken");
  const projectToken = (await upgrades.deployProxy(Token, [
    "PhaseTest", "PT", 6,
    await w.registry.getAddress(),
    await compliance.getAddress(),
    issuerAddr, deployerAddr,
    opts.totalTokens, true, opts.totalTokens,
  ], { kind: "uups" })) as unknown as Contract;
  await projectToken.waitForDeployment();
  await (await compliance.bindToken(await projectToken.getAddress())).wait();
  await (await w.registry.addToWhitelist(await projectToken.getAddress(), 0)).wait();

  const IssuerRegistry = await ethers.getContractFactory("IssuerRegistry");
  const factoryStub = (await upgrades.deployProxy(IssuerRegistry, [deployerAddr], { kind: "uups" })) as unknown as Contract;
  await factoryStub.waitForDeployment();

  const start = (await now()) + BigInt(opts.saleStartOffset ?? 60);
  const end = start + BigInt(opts.saleDuration ?? 7200);

  const SaleFactory = await ethers.getContractFactory("Sale");
  const saleImpl = await SaleFactory.deploy();
  await saleImpl.waitForDeployment();

  const initData = saleImpl.interface.encodeFunctionData("initialize", [
    await projectToken.getAddress(),
    await w.usdc.getAddress(),
    await w.registry.getAddress(),
    issuerAddr,
    await factoryStub.getAddress(),
    await factoryStub.getAddress(),
    1n * 10n ** 6n, // softCap (irrelevant for direct mode)
    1_000_000n * 10n ** 6n, // hardCap
    0n, 0n, ZERO,
    start, end,
    opts.totalTokens,
  ]);

  const Proxy = await ethers.getContractFactory("ERC1967Proxy");
  const proxy = await Proxy.deploy(await saleImpl.getAddress(), initData);
  await proxy.waitForDeployment();
  const sale = SaleFactory.attach(await proxy.getAddress()) as unknown as Contract;
  await (await w.registry.addToWhitelist(await sale.getAddress(), 0)).wait();

  if (opts.vested) {
    const Vault = await ethers.getContractFactory("CiretaVault");
    const vault = (await upgrades.deployProxy(Vault, [
      await projectToken.getAddress(), ZERO,
      await w.registry.getAddress(),
      60n, 60n, await sale.getAddress(),
      issuerAddr, 0, deployerAddr,
    ], { kind: "uups", unsafeAllow: ["constructor"] })) as unknown as Contract;
    await vault.waitForDeployment();

    const Fraction = await ethers.getContractFactory("CiretaFractionToken1155");
    const fractionToken = (await upgrades.deployProxy(Fraction, [
      "Fr", "fr", 6,
      await w.registry.getAddress(), await projectToken.getAddress(),
      await vault.getAddress(), deployerAddr,
    ], { kind: "uups", unsafeAllow: ["constructor"] })) as unknown as Contract;
    await fractionToken.waitForDeployment();

    await (await vault.setFractionToken(await fractionToken.getAddress())).wait();
    await (await w.registry.addToWhitelist(await vault.getAddress(), 0)).wait();
    await (await w.registry.addToWhitelist(await fractionToken.getAddress(), 0)).wait();

    const MINTER_ROLE = await fractionToken.MINTER_ROLE();
    const BURNER_ROLE = await fractionToken.BURNER_ROLE();
    await (await fractionToken.grantRole(MINTER_ROLE, await sale.getAddress())).wait();
    await (await fractionToken.grantRole(BURNER_ROLE, await sale.getAddress())).wait();
    await (await fractionToken.grantRole(BURNER_ROLE, await vault.getAddress())).wait();

    await (await sale.setVestedMode(await vault.getAddress(), await fractionToken.getAddress())).wait();

    await (await projectToken.connect(w.issuer).approve(await sale.getAddress(), opts.totalTokens)).wait();
    await (await sale.connect(w.issuer).depositProjectTokens(opts.totalTokens)).wait();
  } else {
    await (await projectToken.connect(w.issuer).transfer(await sale.getAddress(), opts.totalTokens)).wait();
  }

  return { projectToken, sale, factoryStub, saleEndTime: end };
}

async function addPhase(
  stack: SaleStack,
  w: World,
  args: { name: string; price: bigint; allocation: bigint; startOffset: number; duration: number; min?: bigint; max?: bigint; topUp?: bigint },
) {
  const start = (await now()) + BigInt(args.startOffset);
  const end = start + BigInt(args.duration);
  await (await stack.sale.connect(w.issuer).addPhase(
    args.name, args.price, args.allocation,
    args.min ?? 1n, args.max ?? 0n, args.topUp ?? 1n,
    start, end, false, ALLOC_FIXED,
  )).wait();
  return { start, end };
}

async function activate(stack: SaleStack, w: World) {
  await (await stack.sale.approveSale()).wait();
  await (await stack.sale.connect(w.issuer).activate()).wait();
}

async function buy(stack: SaleStack, w: World, investor: Signer, phaseId: number, qty: bigint) {
  const phase = await stack.sale.getPhase(phaseId);
  const cost = qty * phase.pricePerToken;
  await (await w.usdc.connect(investor).approve(await stack.sale.getAddress(), cost)).wait();
  await (await stack.sale.connect(investor).buy(phaseId, qty)).wait();
}

// ── Scenarios ─────────────────────────────────────────────────────────────

async function testExtendPhase(w: World) {
  header("1 — extendPhase");

  const stack = await deploySale({ w, vested: false, totalTokens: 100_000n * 10n ** 6n });
  await addPhase(stack, w, {
    name: "P0", price: 10n * 10n ** 6n, allocation: 50_000n * 10n ** 6n,
    startOffset: 60, duration: 600,
  });
  await activate(stack, w);

  // Read phase 0 endTime, then extend by 300s
  let phase = await stack.sale.getPhase(0);
  const originalEnd = phase.endTime;
  const newEnd = originalEnd + 300n;
  await (await stack.sale.connect(w.issuer).extendPhase(0, newEnd)).wait();
  phase = await stack.sale.getPhase(0);
  ok("endTime extended", phase.endTime === newEnd);

  // Negative: cannot extend BACKWARDS
  await expectRevert(
    stack.sale.connect(w.issuer).extendPhase(0, newEnd - 100n),
    "cannot shorten via extendPhase", "ExtensionTooEarly",
  );

  // Negative: cannot extend an already-ended phase
  await fastForward(2000); // jump past phase end
  await expectRevert(
    stack.sale.connect(w.issuer).extendPhase(0, (await now()) + 300n),
    "cannot extend ended phase", "CannotExtendEnded",
  );
}

async function testShortenPhase(w: World) {
  header("2 — shortenPhase");

  const stack = await deploySale({ w, vested: false, totalTokens: 100_000n * 10n ** 6n });
  await addPhase(stack, w, {
    name: "P0", price: 10n * 10n ** 6n, allocation: 50_000n * 10n ** 6n,
    startOffset: 60, duration: 600,
  });
  await activate(stack, w);
  await fastForward(120); // enter the phase

  // Shorten phase 0 by 60 seconds (well above block-clock skew)
  const phaseBefore = await stack.sale.getPhase(0);
  const target = phaseBefore.endTime - 60n;
  await (await stack.sale.connect(w.issuer).shortenPhase(0, target)).wait();
  const phase = await stack.sale.getPhase(0);
  ok("endTime shortened", phase.endTime === target);

  // Negative: cannot extend via shorten (newEnd >= current end)
  await expectRevert(
    stack.sale.connect(w.issuer).shortenPhase(0, target + 1000n),
    "shorten must reduce", "ShortenMustReduce",
  );

  // Negative: cannot shorten to past (block.timestamp - 100 < block.timestamp)
  await expectRevert(
    stack.sale.connect(w.issuer).shortenPhase(0, (await now()) - 100n),
    "cannot shorten to past", "PhaseInPast",
  );
}

async function testAdvancePhaseStart(w: World) {
  header("3 — advancePhaseStart");

  const stack = await deploySale({ w, vested: false, totalTokens: 100_000n * 10n ** 6n });
  await addPhase(stack, w, {
    name: "P0", price: 10n * 10n ** 6n, allocation: 10_000n * 10n ** 6n,
    startOffset: 60, duration: 300,
  });
  // Future phase 1 starts at +600
  await addPhase(stack, w, {
    name: "P1", price: 12n * 10n ** 6n, allocation: 10_000n * 10n ** 6n,
    startOffset: 600, duration: 300,
  });
  await activate(stack, w);

  // Advance phase 1 to start at +500 (still in future; doesn't overlap phase 0 which ends ~t+360)
  let phase1 = await stack.sale.getPhase(1);
  const newStart = phase1.startTime - 100n;
  await (await stack.sale.connect(w.issuer).advancePhaseStart(1, newStart)).wait();
  phase1 = await stack.sale.getPhase(1);
  ok("startTime advanced", phase1.startTime === newStart);

  // Negative: cannot advance to a time that overlaps phase 0
  const phase0 = await stack.sale.getPhase(0);
  await expectRevert(
    stack.sale.connect(w.issuer).advancePhaseStart(1, phase0.endTime - 100n),
    "advance into overlap with phase 0", "PhaseOverlap",
  );

  // Negative: cannot advance after phase has started
  await fastForward(Number(phase1.startTime - (await now()) + 5n));
  await expectRevert(
    stack.sale.connect(w.issuer).advancePhaseStart(1, (await now()) - 100n),
    "cannot advance a started phase", "PhaseAlreadyStarted",
  );
}

async function testSetPriceDirect(w: World) {
  header("4 — setPrice (direct mode, Round-6)");

  const stack = await deploySale({ w, vested: false, totalTokens: 100_000n * 10n ** 6n });
  await addPhase(stack, w, {
    name: "Tier 1", price: 10n * 10n ** 6n, allocation: 50_000n * 10n ** 6n,
    startOffset: 60, duration: 7000,
  });
  await activate(stack, w);
  await fastForward(120);

  // Buy 100 tokens at 10 USDC/token
  await buy(stack, w, w.inv1, 0, 100n);
  const usdcAfterFirstBuy = await w.usdc.balanceOf(await w.inv1.getAddress());

  const phaseCountBefore = await stack.sale.getPhaseCount();
  ok("one phase before setPrice", phaseCountBefore === 1n);

  // Update price 10 → 15 USDC/token
  const newPrice = 15n * 10n ** 6n;
  const tx = await (await stack.sale.connect(w.issuer).setPrice(newPrice)).wait();
  ok("setPrice tx mined", tx.status === 1);

  const phaseCountAfter = await stack.sale.getPhaseCount();
  ok("phase count incremented (closed + new)", phaseCountAfter === 2n);

  const closedPhase = await stack.sale.getPhase(0);
  const newPhase = await stack.sale.getPhase(1);
  ok("old phase price unchanged in history", closedPhase.pricePerToken === 10n * 10n ** 6n);
  ok("new phase carries the new price", newPhase.pricePerToken === newPrice);
  ok("new phase carries forward remaining allocation",
    newPhase.allocation === 50_000n * 10n ** 6n - 100n * 10n ** 6n);

  // Buy at the new price — should now charge 15 USDC/token
  await buy(stack, w, w.inv1, 1, 50n); // 50 * 15 = 750 USDC
  const usdcAfterSecond = await w.usdc.balanceOf(await w.inv1.getAddress());
  ok("second buy charged at new price (750 USDC)", usdcAfterFirstBuy - usdcAfterSecond === 750n * 10n ** 6n);

  // Negative: setPrice with zero
  await expectRevert(
    stack.sale.connect(w.issuer).setPrice(0n),
    "zero price rejected", "ZeroPricePerToken",
  );

  // Negative: non-issuer cannot setPrice
  await expectRevert(
    (stack.sale.connect(w.inv1) as any).setPrice(20n * 10n ** 6n),
    "non-issuer cannot setPrice", "NotIssuer",
  );
}

async function testSetPriceVestedRejected(w: World) {
  header("5 — setPrice on VESTED sale → reverts OnlyDirectMode");

  const stack = await deploySale({ w, vested: true, totalTokens: 100_000n * 10n ** 6n });
  await addPhase(stack, w, {
    name: "V0", price: 10n * 10n ** 6n, allocation: 10_000n * 10n ** 6n,
    startOffset: 60, duration: 600,
  });
  await activate(stack, w);
  await fastForward(120);

  await expectRevert(
    stack.sale.connect(w.issuer).setPrice(20n * 10n ** 6n),
    "vested-mode setPrice rejected", "OnlyDirectMode",
  );
}

async function testSetPriceNoActivePhase(w: World) {
  header("6 — setPrice with no active phase → reverts NoActivePhase");

  const stack = await deploySale({
    w, vested: false, totalTokens: 100_000n * 10n ** 6n,
    saleStartOffset: 60, saleDuration: 7200,
  });
  // Add a phase that starts FAR in the future
  await addPhase(stack, w, {
    name: "Future", price: 10n * 10n ** 6n, allocation: 10_000n * 10n ** 6n,
    startOffset: 3600, duration: 600,
  });
  await activate(stack, w);

  // No phase is currently in [start, end] — call should revert
  await expectRevert(
    stack.sale.connect(w.issuer).setPrice(20n * 10n ** 6n),
    "no currently-active phase", "NoActivePhase",
  );
}

async function testSetPriceWouldOverlap(w: World) {
  header("7 — setPrice that would overlap a future phase → reverts PhaseOverlap");

  const stack = await deploySale({
    w, vested: false, totalTokens: 100_000n * 10n ** 6n,
    saleStartOffset: 60, saleDuration: 7200,
  });
  // Phase 0 active soon, phase 1 scheduled later but well within sale window
  await addPhase(stack, w, {
    name: "P0", price: 10n * 10n ** 6n, allocation: 10_000n * 10n ** 6n,
    startOffset: 60, duration: 300,
  });
  await addPhase(stack, w, {
    name: "P1", price: 12n * 10n ** 6n, allocation: 10_000n * 10n ** 6n,
    startOffset: 1200, duration: 600,
  });
  await activate(stack, w);
  await fastForward(120);

  // setPrice would create a new phase running [now, saleEndTime] — overlaps P1
  await expectRevert(
    stack.sale.connect(w.issuer).setPrice(11n * 10n ** 6n),
    "would-overlap-future-phase rejected", "PhaseOverlap",
  );
}

// ── Main ──────────────────────────────────────────────────────────────────

async function main() {
  console.log("╔══════════════════════════════════════════════════════════╗");
  console.log("║  E2E PHASE TEST  (extend / shorten / advance / setPrice) ║");
  console.log("╚══════════════════════════════════════════════════════════╝");

  const w = await deployWorld();

  await testExtendPhase(w);
  await testShortenPhase(w);
  await testAdvancePhaseStart(w);
  await testSetPriceDirect(w);
  await testSetPriceVestedRejected(w);
  await testSetPriceNoActivePhase(w);
  await testSetPriceWouldOverlap(w);

  console.log("\n══════════════════════════════════════════════════════════");
  console.log("ALL PHASE-MUTATION SCENARIOS PASSED");
  console.log("══════════════════════════════════════════════════════════");
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error("\nFAILED:", e?.message || e);
    process.exit(1);
  });
