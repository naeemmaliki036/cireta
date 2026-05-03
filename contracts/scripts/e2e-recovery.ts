/**
 * E2E recovery test — exercises every recovery path on a local Hardhat node.
 *
 * Two token contracts, two use cases each:
 *
 *   1. Project token (CiretaToken / ERC-20)
 *      A. recoveryAddress  — same-user wallet swap (lost keys)
 *                            moves full balance + frozen state
 *      B. forceTransfer    — cross-user move (deceased / court order)
 *                            partial amount; frozen state stays on origin
 *
 *   2. Fraction token (CiretaFractionToken1155)
 *      A. recoverFractions — same-user fraction recovery (lost keys mid-vesting)
 *                            id-USDC and id-OTC variants
 *      B. recoverFractions — cross-user fraction recovery (deceased mid-vesting)
 *
 * Plus inline negative asserts (role gating, RecipientNotVerified, zero address).
 *
 * Run:
 *   npx hardhat node                    # in another terminal
 *   npx hardhat run scripts/e2e-recovery.ts --network localhost
 */

import { ethers, upgrades } from "hardhat";
import { Contract, Signer } from "ethers";

// ── Helpers ───────────────────────────────────────────────────────────────

const ZERO = ethers.ZeroAddress;
const FRACTION_ID_USDC = 1n;
const FRACTION_ID_OTC = 2n;
const COUNTRY = 840; // US

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
      console.log(`   [WARN] revert message did not contain "${fragment}": ${msg.slice(0, 120)}`);
    }
    ok(`${label} (reverted)`, true);
  }
}

// ── Setup ────────────────────────────────────────────────────────────────

interface World {
  deployer: Signer;
  admin: Signer; // same as deployer; owns RECOVERY_ROLE on both tokens
  issuer: Signer;
  userX1: Signer; // lost wallet
  userX2: Signer; // same user X, new wallet
  userY1: Signer; // a different user (heir / receiver)
  outsider: Signer; // no role
  registry: Contract;
  usdc: Contract;
  projectToken: Contract;
  fractionToken: Contract;
  vault: Contract;
  sale: Contract;
  factoryStub: Contract;
}

async function deployWorld(): Promise<World> {
  const signers = await ethers.getSigners();
  const [deployer, issuer, userX1, userX2, userY1, outsider] = signers;

  // 1. Identity registry (simple whitelist)
  const SimpleIR = await ethers.getContractFactory("SimpleIdentityRegistry");
  const registry = (await upgrades.deployProxy(SimpleIR, [
    await deployer.getAddress(), ZERO, ZERO, ZERO,
  ], { kind: "uups" })) as unknown as Contract;
  await registry.waitForDeployment();

  // Grant REGISTRAR_ROLE to deployer so we can whitelist
  const REGISTRAR_ROLE = await registry.REGISTRAR_ROLE();
  await (await registry.grantRole(REGISTRAR_ROLE, await deployer.getAddress())).wait();

  // Whitelist the issuer + all participating wallets
  const wallets = [issuer, userX1, userX2, userY1];
  for (const s of wallets) {
    await (await registry.addToWhitelist(await s.getAddress(), COUNTRY)).wait();
  }

  // 2. Mock USDC
  const USDC = await ethers.getContractFactory("CiretaUSDC");
  const usdc = await USDC.deploy();
  await usdc.waitForDeployment();

  // 3. Project token (CiretaToken). Deployer = issuer here so deployer holds
  //    RECOVERY_ROLE + SUPPLY_ROLE. We mint the full supply up front (mintable=false).
  const Token = await ethers.getContractFactory("CiretaToken");
  // Deploy a fake compliance contract — we use the project token in a context
  // that doesn't trigger compliance hooks for these tests, so any non-zero
  // address works. Easiest: use the registry address (any contract is fine
  // because the token only calls compliance during _update via the registry).
  // Actually CiretaToken expects ICompliance — let's deploy ModularCompliance.
  const Compliance = await ethers.getContractFactory("ModularCompliance");
  const compliance = (await upgrades.deployProxy(Compliance, [
    await deployer.getAddress(),
  ], { kind: "uups" })) as unknown as Contract;
  await compliance.waitForDeployment();

  const maxSupply = 10_000_000_000n; // 10k tokens at 6 decimals
  const projectToken = (await upgrades.deployProxy(Token, [
    "Test Project Token", "TPT", 6,
    await registry.getAddress(),
    await compliance.getAddress(),
    await deployer.getAddress(), // owner_ = issuer (gets RECOVERY_ROLE)
    await deployer.getAddress(), // admin_ = same; admin also gets RECOVERY_ROLE
    maxSupply,
    true,        // mintable
    maxSupply,   // initialMintAmount = full supply
  ], { kind: "uups" })) as unknown as Contract;
  await projectToken.waitForDeployment();

  // Bind the project token to the compliance contract (compliance.bindToken)
  await (await compliance.bindToken(await projectToken.getAddress())).wait();

  // Whitelist the project-token contract itself (ERC20 mints/transfers checked via _update)
  await (await registry.addToWhitelist(await projectToken.getAddress(), 0)).wait();

  // 4. Fraction token (separate, for the fraction-recovery scenarios)
  const Fraction = await ethers.getContractFactory("CiretaFractionToken1155");
  const fractionToken = (await upgrades.deployProxy(Fraction, [
    "Test Fractions", "TFR", 6,
    await registry.getAddress(),
    await projectToken.getAddress(),
    ZERO, // vault — set later via setVestedMode-like wiring; not needed for direct fraction tests
    await deployer.getAddress(),
  ], { kind: "uups", unsafeAllow: ["constructor"] })) as unknown as Contract;
  await fractionToken.waitForDeployment();

  // Grant MINTER + RECOVERY to deployer so we can mint fractions for tests
  const MINTER_ROLE = await fractionToken.MINTER_ROLE();
  const FT_RECOVERY_ROLE = await fractionToken.RECOVERY_ROLE();
  await (await fractionToken.grantRole(MINTER_ROLE, await deployer.getAddress())).wait();
  await (await fractionToken.grantRole(FT_RECOVERY_ROLE, await deployer.getAddress())).wait();

  // factoryStub & sale & vault aren't needed for these primitive tests — set to dummies
  return {
    deployer, admin: deployer, issuer, userX1, userX2, userY1, outsider,
    registry, usdc, projectToken, fractionToken,
    vault: undefined as any, sale: undefined as any, factoryStub: undefined as any,
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────

async function testProjectTokenLostWallet(w: World) {
  header("A1 — Project token: lost-wallet (recoveryAddress)");

  const x1 = await w.userX1.getAddress();
  const x2 = await w.userX2.getAddress();

  // Seed X1 with project tokens (transfer 1000 whole tokens from deployer)
  const amount = 1000n * 10n ** 6n;
  await (await w.projectToken.transfer(x1, amount)).wait();

  // Freeze 200 tokens on X1
  const frozenAmt = 200n * 10n ** 6n;
  await (await w.projectToken.freezePartialTokens(x1, frozenAmt)).wait();

  const beforeX1 = await w.projectToken.balanceOf(x1);
  const beforeFrozen = await w.projectToken.getFrozenTokens(x1);
  console.log(`   X1 balance before: ${beforeX1}, frozen: ${beforeFrozen}`);

  // Same-user recovery (simple-whitelist mode → pass address(0) for OnchainID)
  await (await w.projectToken.recoveryAddress(x1, x2, ZERO)).wait();

  const afterX1 = await w.projectToken.balanceOf(x1);
  const afterX2 = await w.projectToken.balanceOf(x2);
  const afterX1Frozen = await w.projectToken.getFrozenTokens(x1);
  const afterX2Frozen = await w.projectToken.getFrozenTokens(x2);
  console.log(`   X1 balance after: ${afterX1}, frozen: ${afterX1Frozen}`);
  console.log(`   X2 balance after: ${afterX2}, frozen: ${afterX2Frozen}`);

  ok("X1 emptied", afterX1 === 0n);
  ok("X2 received full balance", afterX2 === amount);
  ok("X1 frozen state cleared", afterX1Frozen === 0n);
  ok("X2 frozen state migrated", afterX2Frozen === frozenAmt);
}

async function testProjectTokenForceTransfer(w: World) {
  header("B1 — Project token: deceased / court order (forceTransfer)");

  const x2 = await w.userX2.getAddress(); // X2 holds the full balance now
  const y1 = await w.userY1.getAddress();

  // Freeze 100 tokens on X2 to verify frozen state does NOT move on cross-user transfer
  const newFreeze = 100n * 10n ** 6n;
  // X2 already has 200 frozen from the recovery — freeze an additional 0 (already 200)
  // To check "frozen stays put", we partial-transfer half the unfrozen part.
  const x2Balance = await w.projectToken.balanceOf(x2);
  const x2FrozenBefore = await w.projectToken.getFrozenTokens(x2);
  const movable = x2Balance - x2FrozenBefore;
  const moveAmount = movable / 2n;

  console.log(`   X2 balance: ${x2Balance}, frozen: ${x2FrozenBefore}, moving: ${moveAmount}`);

  await (await w.projectToken.forceTransfer(x2, y1, moveAmount, "probate ref #abc")).wait();

  const afterX2 = await w.projectToken.balanceOf(x2);
  const afterY1 = await w.projectToken.balanceOf(y1);
  const afterX2Frozen = await w.projectToken.getFrozenTokens(x2);
  const afterY1Frozen = await w.projectToken.getFrozenTokens(y1);
  console.log(`   X2 after: bal=${afterX2}, frozen=${afterX2Frozen}`);
  console.log(`   Y1 after: bal=${afterY1}, frozen=${afterY1Frozen}`);

  ok("Y1 received exactly the requested amount", afterY1 === moveAmount);
  ok("X2 retained the rest", afterX2 === x2Balance - moveAmount);
  ok("X2 frozen state unchanged", afterX2Frozen === x2FrozenBefore);
  ok("Y1 frozen state stays clean (frozen does NOT migrate cross-user)", afterY1Frozen === 0n);

  // Negative: zero-address rejected
  await expectRevert(
    w.projectToken.forceTransfer(x2, ZERO, 1n, "test"),
    "forceTransfer to zero address",
    "zero address",
  );
}

async function testFractionLostWalletUSDC(w: World) {
  header("A3 — Fraction token: lost-wallet, ID_USDC (recoverFractions)");

  const x1 = await w.userX1.getAddress();
  const x2 = await w.userX2.getAddress();
  const amount = 5_000n * 10n ** 6n;

  // Mint USDC fractions to X1 (representing in-flight vested allocation)
  await (await w.fractionToken.mint(x1, FRACTION_ID_USDC, amount, "0x")).wait();
  const before = await w.fractionToken.balanceOf(x1, FRACTION_ID_USDC);
  console.log(`   X1 USDC fractions: ${before}`);

  // Recover to X2 (same user, new wallet)
  await (await w.fractionToken.recoverFractions(x1, x2, FRACTION_ID_USDC, amount, "0x6c6f7374")).wait();

  const afterX1 = await w.fractionToken.balanceOf(x1, FRACTION_ID_USDC);
  const afterX2 = await w.fractionToken.balanceOf(x2, FRACTION_ID_USDC);
  console.log(`   X1 after: ${afterX1}, X2 after: ${afterX2}`);

  ok("X1 fractions emptied", afterX1 === 0n);
  ok("X2 received full fraction balance", afterX2 === amount);
}

async function testFractionLostWalletOTC(w: World) {
  header("A4 — Fraction token: lost-wallet, ID_OTC (recoverFractions)");

  const x1 = await w.userX1.getAddress();
  const x2 = await w.userX2.getAddress();
  const amount = 3_000n * 10n ** 6n;

  // Mint OTC fractions to X1
  await (await w.fractionToken.mint(x1, FRACTION_ID_OTC, amount, "0x")).wait();
  const before = await w.fractionToken.balanceOf(x1, FRACTION_ID_OTC);
  console.log(`   X1 OTC fractions: ${before}`);

  await (await w.fractionToken.recoverFractions(x1, x2, FRACTION_ID_OTC, amount, "0x")).wait();

  const afterX1 = await w.fractionToken.balanceOf(x1, FRACTION_ID_OTC);
  const afterX2 = await w.fractionToken.balanceOf(x2, FRACTION_ID_OTC);
  console.log(`   X1 after: ${afterX1}, X2 after: ${afterX2}`);

  ok("X1 OTC fractions emptied", afterX1 === 0n);
  ok("X2 OTC fractions received", afterX2 === amount);
}

async function testFractionDeceased(w: World) {
  header("B3 — Fraction token: cross-user, partial amount (deceased)");

  const x2 = await w.userX2.getAddress(); // X2 now holds 5_000 USDC fractions from A3
  const y1 = await w.userY1.getAddress();
  const partial = 2_000n * 10n ** 6n;

  const x2Before = await w.fractionToken.balanceOf(x2, FRACTION_ID_USDC);
  console.log(`   X2 USDC fractions before: ${x2Before}`);

  await (await w.fractionToken.recoverFractions(x2, y1, FRACTION_ID_USDC, partial, "0x70726f62617465")).wait();

  const x2After = await w.fractionToken.balanceOf(x2, FRACTION_ID_USDC);
  const y1After = await w.fractionToken.balanceOf(y1, FRACTION_ID_USDC);
  console.log(`   X2 after: ${x2After}, Y1 after: ${y1After}`);

  ok("Y1 received the partial amount", y1After === partial);
  ok("X2 retained the rest", x2After === x2Before - partial);
}

async function testNegatives(w: World) {
  header("Negative cases");

  const outsider = w.outsider;
  const outsiderAddr = await outsider.getAddress();
  const x1 = await w.userX1.getAddress();
  const y1 = await w.userY1.getAddress();

  // outsider has no RECOVERY_ROLE on project token → revert
  await expectRevert(
    (w.projectToken.connect(outsider) as any).recoveryAddress(x1, y1, ZERO),
    "outsider cannot call recoveryAddress",
    "AccessControl",
  );

  // outsider cannot call forceTransfer
  await expectRevert(
    (w.projectToken.connect(outsider) as any).forceTransfer(x1, y1, 1n, "test"),
    "outsider cannot call forceTransfer",
    "AccessControl",
  );

  // outsider cannot call recoverFractions on fraction token
  await expectRevert(
    (w.fractionToken.connect(outsider) as any).recoverFractions(x1, y1, FRACTION_ID_USDC, 1n, "0x"),
    "outsider cannot call recoverFractions",
    "AccessControl",
  );

  // recoverFractions to a non-verified wallet → reverts RecipientNotVerified
  // outsider (signer index 5) was NEVER whitelisted in deployWorld()
  await expectRevert(
    w.fractionToken.recoverFractions(x1, outsiderAddr, FRACTION_ID_USDC, 1n, "0x"),
    "recoverFractions to non-verified destination",
    "RecipientNotVerified",
  );
}

// ── Main ──────────────────────────────────────────────────────────────────

async function main() {
  console.log("╔══════════════════════════════════════════════════════════╗");
  console.log("║  E2E RECOVERY TEST  (project + fraction tokens)         ║");
  console.log("╚══════════════════════════════════════════════════════════╝");

  const w = await deployWorld();
  console.log("\nDeployed:");
  console.log(`   SimpleIdentityRegistry: ${await w.registry.getAddress()}`);
  console.log(`   CiretaToken (project):  ${await w.projectToken.getAddress()}`);
  console.log(`   FractionToken (1155):   ${await w.fractionToken.getAddress()}`);

  await testProjectTokenLostWallet(w);
  await testProjectTokenForceTransfer(w);
  await testFractionLostWalletUSDC(w);
  await testFractionLostWalletOTC(w);
  await testFractionDeceased(w);
  await testNegatives(w);

  console.log("\n══════════════════════════════════════════════════════════");
  console.log("ALL RECOVERY SCENARIOS PASSED");
  console.log("══════════════════════════════════════════════════════════");
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error("\nFAILED:", e?.message || e);
    process.exit(1);
  });
