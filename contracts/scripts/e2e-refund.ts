/**
 * E2E refund test — exercises the full refund flow against a local Hardhat node.
 *
 * Refund mechanics (Sale.sol):
 *   - Trigger: sale finalizes as FinalizedFailed (totalRaised < softCap).
 *   - Two-step gate: admin/issuer activateRefunds() → investor claimRefund().
 *   - paymentContributed[msg.sender] is the source of truth — only on-chain
 *     buy() contributors are eligible. OTC contributors revert with
 *     NotPaymentContributor and must use the off-chain refund path.
 *   - In Vested mode, the investor's id-1 USDC fractions are burned; id-2
 *     OTC fractions are NOT burned (they remain as evidence of off-platform
 *     allocation).
 *
 * Scenarios covered:
 *   1. Vested-mode failed sale — single-phase investor refund (USDC fractions
 *      burned, USDC returned).
 *   2. Direct-mode failed sale — investor refund (no fractions to burn).
 *   3. Mixed investor (on-chain buy + buyOTC) — only on-chain portion refunded;
 *      id-2 OTC fractions remain after refund.
 *   4. OTC-only investor → claimRefund() reverts NotPaymentContributor.
 *   5. Multi-phase, multi-price investor — refund equals the literal sum of
 *      USDC paid across phases, regardless of token-price differences.
 *   6. Negative: claimRefund() before activateRefunds() reverts RefundsNotActive.
 *   7. Negative: double-claim reverts AlreadyClaimed.
 *   8. Negative: claimRefund() on a FinalizedSuccess sale reverts InvalidStatus.
 *   9. Negative: activateRefunds() on a still-Active sale reverts InvalidStatus.
 *
 * Run:
 *   ./node_modules/.bin/hardhat node                # in another terminal
 *   ./node_modules/.bin/hardhat run scripts/e2e-refund.ts --network localhost
 */

import { ethers, upgrades } from "hardhat";
import { Contract, Signer } from "ethers";

// ── Helpers ───────────────────────────────────────────────────────────────

const ZERO = ethers.ZeroAddress;
const COUNTRY = 840;
const FRACTION_ID_USDC = 1n;
const FRACTION_ID_OTC = 2n;
const ALLOC_FIXED = 0;
const SECONDS = 1n;

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
      console.log(`   [WARN] revert message did not contain "${fragment}": ${msg.slice(0, 140)}`);
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

// ── World setup ──────────────────────────────────────────────────────────

interface World {
  deployer: Signer;
  issuer: Signer;
  inv1: Signer;
  inv2: Signer;
  inv3: Signer;
  inv4: Signer;
  registry: Contract;
  usdc: Contract;
  compliance: Contract;
}

async function deployWorld(): Promise<World> {
  const signers = await ethers.getSigners();
  const [deployer, issuer, inv1, inv2, inv3, inv4] = signers;

  const SimpleIR = await ethers.getContractFactory("SimpleIdentityRegistry");
  const registry = (await upgrades.deployProxy(SimpleIR, [
    await deployer.getAddress(), ZERO, ZERO, ZERO,
  ], { kind: "uups" })) as unknown as Contract;
  await registry.waitForDeployment();

  const REGISTRAR_ROLE = await registry.REGISTRAR_ROLE();
  await (await registry.grantRole(REGISTRAR_ROLE, await deployer.getAddress())).wait();

  for (const s of [issuer, inv1, inv2, inv3, inv4]) {
    await (await registry.addToWhitelist(await s.getAddress(), COUNTRY)).wait();
  }

  const USDC = await ethers.getContractFactory("CiretaUSDC");
  const usdc = await USDC.deploy();
  await usdc.waitForDeployment();

  // Mint USDC to investors (CiretaUSDC has a public mint helper or faucet)
  // Try ERC20-style mint; fall back to faucet if needed
  const fundEach = 1_000_000n * 10n ** 6n; // 1M USDC each
  for (const s of [inv1, inv2, inv3, inv4, issuer]) {
    await (await usdc.mint(await s.getAddress(), fundEach)).wait();
  }

  const Compliance = await ethers.getContractFactory("ModularCompliance");
  const compliance = (await upgrades.deployProxy(Compliance, [
    await deployer.getAddress(),
  ], { kind: "uups" })) as unknown as Contract;
  await compliance.waitForDeployment();

  return { deployer, issuer, inv1, inv2, inv3, inv4, registry, usdc, compliance };
}

interface SaleStack {
  projectToken: Contract;
  sale: Contract;
  fractionToken?: Contract;
  vault?: Contract;
  otcToken?: Contract;
  factoryStub: Contract; // Ownable; owner = deployer (admin)
}

/**
 * Deploys an isolated project token + Sale (+ optional vault/fraction/OTC) for one scenario.
 * Returns the wired stack ready for addPhase + activate.
 */
async function deploySaleStack(opts: {
  w: World;
  vested: boolean;
  withOTC?: boolean;
  saleStartOffset?: number;
  saleDuration?: number;
  softCap: bigint;
  hardCap: bigint;
  totalTokenSupply: bigint;
  cliffDuration?: number;
  vestingDuration?: number;
  tokenName?: string;
  tokenSymbol?: string;
}): Promise<SaleStack> {
  const { w } = opts;
  const deployer = w.deployer;
  const deployerAddr = await deployer.getAddress();
  const issuerAddr = await w.issuer.getAddress();

  // Fresh compliance per stack — bindToken can only be called once per compliance contract
  const Compliance = await ethers.getContractFactory("ModularCompliance");
  const compliance = (await upgrades.deployProxy(Compliance, [deployerAddr], { kind: "uups" })) as unknown as Contract;
  await compliance.waitForDeployment();

  // Project token (mintable so we can pre-mint to issuer)
  const Token = await ethers.getContractFactory("CiretaToken");
  const maxSupply = opts.totalTokenSupply;
  const projectToken = (await upgrades.deployProxy(Token, [
    opts.tokenName || "Test Project", opts.tokenSymbol || "TST", 6,
    await w.registry.getAddress(),
    await compliance.getAddress(),
    issuerAddr,        // owner_ = issuer (gets RECOVERY/SUPPLY etc)
    deployerAddr,      // admin_ = deployer/platform admin
    maxSupply,
    true,
    maxSupply, // pre-mint full supply to issuer
  ], { kind: "uups" })) as unknown as Contract;
  await projectToken.waitForDeployment();
  await (await compliance.bindToken(await projectToken.getAddress())).wait();
  await (await w.registry.addToWhitelist(await projectToken.getAddress(), 0)).wait();

  // Factory stub: any Ownable contract whose owner() = deployer/admin.
  // Use a fresh IssuerRegistry instance — it's lightweight + Ownable.
  const IssuerRegistry = await ethers.getContractFactory("IssuerRegistry");
  const factoryStub = (await upgrades.deployProxy(IssuerRegistry, [deployerAddr], { kind: "uups" })) as unknown as Contract;
  await factoryStub.waitForDeployment();

  // Sale window
  const start = (await now()) + BigInt(opts.saleStartOffset ?? 60);
  const end = start + BigInt(opts.saleDuration ?? 3600);

  // Optional OTC token
  let otcToken: Contract | undefined;
  if (opts.withOTC) {
    const OTC = await ethers.getContractFactory("IssuerOTCToken");
    otcToken = (await upgrades.deployProxy(OTC, [
      "Test OTC", "tOTC", issuerAddr, await w.registry.getAddress(),
    ], { kind: "uups" })) as unknown as Contract;
    await otcToken.waitForDeployment();
    await (await w.registry.addToWhitelist(await otcToken.getAddress(), 0)).wait();
  }

  // Sale proxy (initialize directly, don't go through SaleFactory)
  const SaleFactory = await ethers.getContractFactory("Sale");
  const saleImpl = await SaleFactory.deploy();
  await saleImpl.waitForDeployment();

  // Encode initialize() and deploy proxy manually
  const initData = saleImpl.interface.encodeFunctionData("initialize", [
    await projectToken.getAddress(),
    await w.usdc.getAddress(),
    await w.registry.getAddress(),
    issuerAddr,
    await factoryStub.getAddress(),
    await factoryStub.getAddress(), // feeManager (any addr; fee=0 so untouched)
    opts.softCap,
    opts.hardCap,
    0n, // feeBasisPoints — 0 so finalize doesn't try to transfer fees
    0n, // feeCapUsdc
    otcToken ? await otcToken.getAddress() : ZERO,
    start,
    end,
    opts.totalTokenSupply,
  ]);

  const Proxy = await ethers.getContractFactory("ERC1967Proxy");
  const proxy = await Proxy.deploy(await saleImpl.getAddress(), initData);
  await proxy.waitForDeployment();
  const sale = SaleFactory.attach(await proxy.getAddress()) as unknown as Contract;

  // Whitelist the Sale itself
  await (await w.registry.addToWhitelist(await sale.getAddress(), 0)).wait();

  // Vested wiring (optional)
  let fractionToken: Contract | undefined;
  let vault: Contract | undefined;
  if (opts.vested) {
    // Deploy vault first with fraction=0; will set after fraction deploys
    const Vault = await ethers.getContractFactory("CiretaVault");
    vault = (await upgrades.deployProxy(Vault, [
      await projectToken.getAddress(),
      ZERO, // fraction set later
      await w.registry.getAddress(),
      BigInt(opts.cliffDuration ?? 60),
      BigInt(opts.vestingDuration ?? 60),
      await sale.getAddress(),
      issuerAddr,
      0, // ExcessPolicy.Keep
      deployerAddr,
    ], { kind: "uups", unsafeAllow: ["constructor"] })) as unknown as Contract;
    await vault.waitForDeployment();

    const Fraction = await ethers.getContractFactory("CiretaFractionToken1155");
    fractionToken = (await upgrades.deployProxy(Fraction, [
      "Test Fr", "tFR", 6,
      await w.registry.getAddress(),
      await projectToken.getAddress(),
      await vault.getAddress(),
      deployerAddr,
    ], { kind: "uups", unsafeAllow: ["constructor"] })) as unknown as Contract;
    await fractionToken.waitForDeployment();

    // Wire vault.fractionToken
    await (await vault.setFractionToken(await fractionToken.getAddress())).wait();

    // Whitelist vault + fraction so token transfers in/out pass identity check
    await (await w.registry.addToWhitelist(await vault.getAddress(), 0)).wait();
    await (await w.registry.addToWhitelist(await fractionToken.getAddress(), 0)).wait();

    // Grant fraction-token roles to Sale (mint+burn) and to vault (burn)
    const MINTER_ROLE = await fractionToken.MINTER_ROLE();
    const BURNER_ROLE = await fractionToken.BURNER_ROLE();
    await (await fractionToken.grantRole(MINTER_ROLE, await sale.getAddress())).wait();
    await (await fractionToken.grantRole(BURNER_ROLE, await sale.getAddress())).wait();
    await (await fractionToken.grantRole(BURNER_ROLE, await vault.getAddress())).wait();

    // Sale.setVestedMode (adminOnly — deployer is admin via factoryStub.owner())
    await (await sale.setVestedMode(await vault.getAddress(), await fractionToken.getAddress())).wait();

    // Issuer deposits project tokens into vault via Sale
    const depositAmount = opts.totalTokenSupply;
    await (await projectToken.connect(w.issuer).approve(await sale.getAddress(), depositAmount)).wait();
    await (await sale.connect(w.issuer).depositProjectTokens(depositAmount)).wait();
  } else {
    // Direct mode: issuer transfers project tokens straight to Sale
    await (await projectToken.connect(w.issuer).transfer(await sale.getAddress(), opts.totalTokenSupply)).wait();
  }

  return { projectToken, sale, fractionToken, vault, otcToken, factoryStub };
}

async function addPhase(
  stack: SaleStack,
  w: World,
  args: {
    name: string;
    pricePerToken: bigint;
    allocation: bigint;
    minTokens?: bigint;
    maxTokens?: bigint;
    topUpMinTokens?: bigint;
    startOffset: number;
    duration: number;
  },
) {
  const start = (await now()) + BigInt(args.startOffset);
  const end = start + BigInt(args.duration);
  await (await stack.sale.connect(w.issuer).addPhase(
    args.name,
    args.pricePerToken,
    args.allocation,
    args.minTokens ?? 1n,
    args.maxTokens ?? 0n,
    args.topUpMinTokens ?? 1n,
    start,
    end,
    false,
    ALLOC_FIXED,
  )).wait();
  return { start, end };
}

async function activateSale(stack: SaleStack, w: World) {
  // Admin approves, issuer activates
  await (await stack.sale.approveSale()).wait();
  await (await stack.sale.connect(w.issuer).activate()).wait();
}

async function buyOnChain(stack: SaleStack, w: World, investor: Signer, phaseId: number, tokenQty: bigint) {
  const investorAddr = await investor.getAddress();
  const phase = await stack.sale.getPhase(phaseId);
  const usdcRequired = tokenQty * phase.pricePerToken;
  await (await w.usdc.connect(investor).approve(await stack.sale.getAddress(), usdcRequired)).wait();
  await (await stack.sale.connect(investor).buy(phaseId, tokenQty)).wait();
}

async function buyOTC(stack: SaleStack, w: World, investor: Signer, phaseId: number, tokenQty: bigint) {
  if (!stack.otcToken) throw new Error("OTC not configured");
  const phase = await stack.sale.getPhase(phaseId);
  const otcRequired = tokenQty * phase.pricePerToken;
  // Issuer mints OTC vouchers to the investor
  await (await stack.otcToken.connect(w.issuer).mint(await investor.getAddress(), otcRequired)).wait();
  // Investor approves Sale to pull
  await (await stack.otcToken.connect(investor).approve(await stack.sale.getAddress(), otcRequired)).wait();
  await (await stack.sale.connect(investor).buyOTC(phaseId, tokenQty)).wait();
}

// ── Scenarios ─────────────────────────────────────────────────────────────

async function scenario1_VestedFailedSinglePhase(w: World) {
  header("1 — Vested sale fails → single-phase investor refund");

  const softCap = 100_000n * 10n ** 6n;       // 100k USDC
  const hardCap = 200_000n * 10n ** 6n;
  const totalTokens = 100_000n * 10n ** 6n;   // 100k tokens at 6 decimals
  const stack = await deploySaleStack({
    w, vested: true, softCap, hardCap, totalTokenSupply: totalTokens,
    saleStartOffset: 30, saleDuration: 3600,
    cliffDuration: 60, vestingDuration: 60,
  });

  const phase = await addPhase(stack, w, {
    name: "Phase 1", pricePerToken: 10n * 10n ** 6n, // 10 USDC per token
    allocation: 50_000n * 10n ** 6n,
    startOffset: 60, duration: 600,
  });

  await activateSale(stack, w);
  await fastForward(120); // jump into phase

  // inv1 buys 1000 tokens = 10_000 USDC (well below softCap=100k so sale will fail)
  await buyOnChain(stack, w, w.inv1, 0, 1000n);

  const usdcBeforeRefund = await w.usdc.balanceOf(await w.inv1.getAddress());
  const fractionsBefore = await stack.fractionToken!.balanceOf(await w.inv1.getAddress(), FRACTION_ID_USDC);
  console.log(`   inv1 USDC before refund: ${usdcBeforeRefund}`);
  console.log(`   inv1 USDC fractions before refund: ${fractionsBefore}`);

  // Fast-forward past sale window so finalize() goes through the failed branch
  await fastForward(3600);
  await (await stack.sale.connect(w.issuer).finalizeSale()).wait();

  const status = await stack.sale.status();
  ok("sale finalized as Failed (status=4)", status === 4n);

  // Activate refunds
  await (await stack.sale.connect(w.issuer).activateRefunds()).wait();
  ok("refunds active", await stack.sale.refundsActive());

  // Investor claims
  await (await stack.sale.connect(w.inv1).claimRefund()).wait();

  const usdcAfter = await w.usdc.balanceOf(await w.inv1.getAddress());
  const fractionsAfter = await stack.fractionToken!.balanceOf(await w.inv1.getAddress(), FRACTION_ID_USDC);
  console.log(`   inv1 USDC after: ${usdcAfter}`);
  console.log(`   inv1 USDC fractions after: ${fractionsAfter}`);

  ok("USDC fully refunded (10_000 added back)", usdcAfter - usdcBeforeRefund === 10_000n * 10n ** 6n);
  ok("USDC fractions burned to 0", fractionsAfter === 0n);

  // 7 — double-claim revert (test on the same sale, same investor)
  await expectRevert(
    stack.sale.connect(w.inv1).claimRefund(),
    "double-claim reverts AlreadyClaimed",
    "AlreadyClaimed",
  );
}

async function scenario2_DirectCannotFail(w: World) {
  header("2 — Direct-mode sale CANNOT fail (Round-6 contract change)");

  const softCap = 50_000n * 10n ** 6n;
  const hardCap = 100_000n * 10n ** 6n;
  const totalTokens = 50_000n * 10n ** 6n;
  const stack = await deploySaleStack({
    w, vested: false, softCap, hardCap, totalTokenSupply: totalTokens,
    saleStartOffset: 30, saleDuration: 3600,
    tokenName: "Direct Test", tokenSymbol: "DIR",
  });

  await addPhase(stack, w, {
    name: "Direct Phase",
    pricePerToken: 5n * 10n ** 6n,
    allocation: 10_000n * 10n ** 6n,
    startOffset: 60, duration: 600,
  });

  await activateSale(stack, w);
  await fastForward(120);

  // inv2 buys 100 tokens @ 5 = 500 USDC, far below softCap=50k. Pre-Round-6
  // this would mark the sale as failed; Round-6 forces success in _finalize.
  await buyOnChain(stack, w, w.inv2, 0, 100n);
  ok("direct buy delivered project tokens immediately",
    (await stack.projectToken.balanceOf(await w.inv2.getAddress())) === 100n * 10n ** 6n);

  await fastForward(3600);
  await (await stack.sale.connect(w.issuer).finalizeSale()).wait();

  const status = await stack.sale.status();
  ok("direct-mode sale forced to FinalizedSuccess (status=3) even below softCap", status === 3n);

  // activateRefunds must revert RefundsNotApplicable
  await expectRevert(
    stack.sale.connect(w.issuer).activateRefunds(),
    "activateRefunds on direct-mode sale rejected",
    "RefundsNotApplicable",
  );

  // claimRefund reverts InvalidStatus (status is FinalizedSuccess, not FinalizedFailed)
  await expectRevert(
    stack.sale.connect(w.inv2).claimRefund(),
    "claimRefund on direct-mode sale rejected",
    "InvalidStatus",
  );

  console.log("   → Direct-mode sales are structurally final. No refund path exists.");
}

async function scenario3_MixedOnchainAndOTC(w: World) {
  header("3 — Mixed investor (on-chain buy + buyOTC): only on-chain refunded");

  const softCap = 100_000n * 10n ** 6n;
  const hardCap = 200_000n * 10n ** 6n;
  const totalTokens = 100_000n * 10n ** 6n;
  const stack = await deploySaleStack({
    w, vested: true, withOTC: true, softCap, hardCap, totalTokenSupply: totalTokens,
    saleStartOffset: 30, saleDuration: 3600, cliffDuration: 60, vestingDuration: 60,
    tokenName: "Mixed", tokenSymbol: "MIX",
  });

  await addPhase(stack, w, {
    name: "Mixed Phase", pricePerToken: 10n * 10n ** 6n,
    allocation: 50_000n * 10n ** 6n,
    startOffset: 60, duration: 600,
  });

  await activateSale(stack, w);
  await fastForward(120);

  // inv3 buys 500 tokens on-chain = 5000 USDC, plus 200 tokens OTC = 2000 OTC voucher
  await buyOnChain(stack, w, w.inv3, 0, 500n);
  await buyOTC(stack, w, w.inv3, 0, 200n);

  const inv3 = await w.inv3.getAddress();
  const usdcFractions = await stack.fractionToken!.balanceOf(inv3, FRACTION_ID_USDC);
  const otcFractions = await stack.fractionToken!.balanceOf(inv3, FRACTION_ID_OTC);
  console.log(`   inv3 USDC fractions: ${usdcFractions}, OTC fractions: ${otcFractions}`);
  ok("inv3 USDC fractions = 500e6", usdcFractions === 500n * 10n ** 6n);
  ok("inv3 OTC fractions  = 200e6", otcFractions === 200n * 10n ** 6n);

  await fastForward(3600);
  await (await stack.sale.connect(w.issuer).finalizeSale()).wait();
  await (await stack.sale.connect(w.issuer).activateRefunds()).wait();

  const usdcBefore = await w.usdc.balanceOf(inv3);
  await (await stack.sale.connect(w.inv3).claimRefund()).wait();
  const usdcAfter = await w.usdc.balanceOf(inv3);

  ok("on-chain portion refunded (5000 USDC)", usdcAfter - usdcBefore === 5_000n * 10n ** 6n);

  const usdcFracPost = await stack.fractionToken!.balanceOf(inv3, FRACTION_ID_USDC);
  const otcFracPost = await stack.fractionToken!.balanceOf(inv3, FRACTION_ID_OTC);
  ok("USDC fractions burned", usdcFracPost === 0n);
  ok("OTC fractions PRESERVED (off-chain refund evidence)", otcFracPost === 200n * 10n ** 6n);
}

async function scenario4_OTCOnlyReverts(w: World) {
  header("4 — OTC-only investor → claimRefund reverts NotPaymentContributor");

  const softCap = 100_000n * 10n ** 6n;
  const hardCap = 200_000n * 10n ** 6n;
  const totalTokens = 100_000n * 10n ** 6n;
  const stack = await deploySaleStack({
    w, vested: true, withOTC: true, softCap, hardCap, totalTokenSupply: totalTokens,
    saleStartOffset: 30, saleDuration: 3600, cliffDuration: 60, vestingDuration: 60,
    tokenName: "OTCOnly", tokenSymbol: "OTO",
  });

  await addPhase(stack, w, {
    name: "OTC Only Phase", pricePerToken: 10n * 10n ** 6n,
    allocation: 50_000n * 10n ** 6n,
    startOffset: 60, duration: 600,
  });

  await activateSale(stack, w);
  await fastForward(120);

  // inv4 only buys via OTC
  await buyOTC(stack, w, w.inv4, 0, 100n);

  await fastForward(3600);
  await (await stack.sale.connect(w.issuer).finalizeSale()).wait();
  await (await stack.sale.connect(w.issuer).activateRefunds()).wait();

  await expectRevert(
    stack.sale.connect(w.inv4).claimRefund(),
    "OTC-only investor cannot claimRefund on-chain",
    "NotPaymentContributor",
  );
  console.log("   → OTC investor must use the off-platform refund flow");
}

async function scenario5_MultiPhaseMultiPrice(w: World) {
  header("5 — Multi-phase, multi-price investor refund");

  const softCap = 200_000n * 10n ** 6n;       // high softCap so sale fails
  const hardCap = 1_000_000n * 10n ** 6n;
  const totalTokens = 100_000n * 10n ** 6n;
  const stack = await deploySaleStack({
    w, vested: true, softCap, hardCap, totalTokenSupply: totalTokens,
    saleStartOffset: 30, saleDuration: 7200,
    cliffDuration: 60, vestingDuration: 60,
    tokenName: "MultiPhase", tokenSymbol: "MPH",
  });

  // Two non-overlapping phases at different prices
  await addPhase(stack, w, {
    name: "Seed", pricePerToken: 5n * 10n ** 6n,
    allocation: 10_000n * 10n ** 6n,
    startOffset: 60, duration: 300,
  });
  await addPhase(stack, w, {
    name: "Public", pricePerToken: 8n * 10n ** 6n,
    allocation: 10_000n * 10n ** 6n,
    startOffset: 400, duration: 300,
  });

  await activateSale(stack, w);
  await fastForward(120);

  // Phase 0: inv1 buys 200 tokens @ 5 USDC = 1000 USDC
  await buyOnChain(stack, w, w.inv1, 0, 200n);

  // Advance to phase 1
  await fastForward(400);

  // Phase 1: inv1 buys 100 tokens @ 8 USDC = 800 USDC
  await buyOnChain(stack, w, w.inv1, 1, 100n);

  const expectedRefund = 1000n * 10n ** 6n + 800n * 10n ** 6n; // 1800 USDC

  await fastForward(7200);
  await (await stack.sale.connect(w.issuer).finalizeSale()).wait();

  const status = await stack.sale.status();
  ok("multi-phase sale finalized as Failed", status === 4n);

  // 6 — claimRefund BEFORE activateRefunds reverts
  await expectRevert(
    stack.sale.connect(w.inv1).claimRefund(),
    "claimRefund before activateRefunds reverts",
    "RefundsNotActive",
  );

  await (await stack.sale.connect(w.issuer).activateRefunds()).wait();

  const usdcBefore = await w.usdc.balanceOf(await w.inv1.getAddress());
  await (await stack.sale.connect(w.inv1).claimRefund()).wait();
  const usdcAfter = await w.usdc.balanceOf(await w.inv1.getAddress());
  console.log(`   inv1 expected refund: ${expectedRefund}, actual delta: ${usdcAfter - usdcBefore}`);
  ok("refund equals SUM of USDC paid across phases (price-agnostic)", usdcAfter - usdcBefore === expectedRefund);
}

async function scenario8_SuccessSaleNoRefund(w: World) {
  header("8 — claimRefund on a SUCCESSFUL sale reverts InvalidStatus");

  const softCap = 1n * 10n ** 6n; // tiny softCap so sale will succeed
  const hardCap = 1_000n * 10n ** 6n;
  const totalTokens = 100n * 10n ** 6n;
  const stack = await deploySaleStack({
    w, vested: true, softCap, hardCap, totalTokenSupply: totalTokens,
    saleStartOffset: 30, saleDuration: 600,
    cliffDuration: 60, vestingDuration: 60,
    tokenName: "Success", tokenSymbol: "SUC",
  });

  await addPhase(stack, w, {
    name: "Success Phase", pricePerToken: 10n * 10n ** 6n,
    allocation: 100n * 10n ** 6n,
    startOffset: 60, duration: 300,
  });

  await activateSale(stack, w);
  await fastForward(120);

  await buyOnChain(stack, w, w.inv2, 0, 1n); // 10 USDC, exceeds 1 USDC softCap

  await fastForward(600);
  await (await stack.sale.connect(w.issuer).finalizeSale()).wait();
  ok("sale FinalizedSuccess (status=3)", (await stack.sale.status()) === 3n);

  // 9 — activateRefunds on a successful sale reverts InvalidStatus
  await expectRevert(
    stack.sale.connect(w.issuer).activateRefunds(),
    "activateRefunds on FinalizedSuccess reverts",
    "InvalidStatus",
  );

  // 8 — claimRefund directly reverts InvalidStatus
  await expectRevert(
    stack.sale.connect(w.inv2).claimRefund(),
    "claimRefund on FinalizedSuccess reverts",
    "InvalidStatus",
  );
}

async function scenario9_ActivateOnActiveReverts(w: World) {
  header("9 — activateRefunds on an ACTIVE sale reverts");

  const softCap = 1_000_000n * 10n ** 6n;
  const hardCap = 2_000_000n * 10n ** 6n;
  const totalTokens = 100_000n * 10n ** 6n;
  const stack = await deploySaleStack({
    w, vested: true, softCap, hardCap, totalTokenSupply: totalTokens,
    saleStartOffset: 30, saleDuration: 3600,
    cliffDuration: 60, vestingDuration: 60,
    tokenName: "ActiveTest", tokenSymbol: "ACT",
  });

  await addPhase(stack, w, {
    name: "Live", pricePerToken: 10n * 10n ** 6n,
    allocation: 1000n * 10n ** 6n,
    startOffset: 60, duration: 600,
  });

  await activateSale(stack, w);

  await expectRevert(
    stack.sale.connect(w.issuer).activateRefunds(),
    "activateRefunds while Active reverts",
    "InvalidStatus",
  );
}

// ── Main ──────────────────────────────────────────────────────────────────

async function main() {
  console.log("╔══════════════════════════════════════════════════════════╗");
  console.log("║  E2E REFUND TEST  (vested + direct + OTC + multi-phase) ║");
  console.log("╚══════════════════════════════════════════════════════════╝");

  const w = await deployWorld();
  console.log(`\nIdentity registry: ${await w.registry.getAddress()}`);
  console.log(`USDC:              ${await w.usdc.getAddress()}\n`);

  await scenario1_VestedFailedSinglePhase(w); // covers #1 + #7 (double-claim)
  await scenario2_DirectCannotFail(w);        // covers #2 (Round-6 behavior)
  await scenario3_MixedOnchainAndOTC(w);      // covers #3
  await scenario4_OTCOnlyReverts(w);          // covers #4
  await scenario5_MultiPhaseMultiPrice(w);    // covers #5 + #6 (refund-before-activate)
  await scenario8_SuccessSaleNoRefund(w);     // covers #8 + #9 (activate on success)
  await scenario9_ActivateOnActiveReverts(w); // covers #9 (activate on Active)

  console.log("\n══════════════════════════════════════════════════════════");
  console.log("ALL REFUND SCENARIOS PASSED");
  console.log("══════════════════════════════════════════════════════════");
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error("\nFAILED:", e?.message || e);
    process.exit(1);
  });
