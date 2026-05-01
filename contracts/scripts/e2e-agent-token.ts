/**
 * Hardhat E2E — AGENT token, single-phase sale, 5-min post-finalization lock,
 * investor buys in 3 chunks, claim after lockup.
 *
 * Phase 1 of the sandbox flow. If this passes, we run the same logic against
 * Base Sepolia in scripts/sandbox-deploy-agent-sale.ts.
 *
 * Mirrors the contract semantics that are easy to get wrong:
 *   - Vested mode requires `vestingDuration > 0` AND `cliff <= vesting`
 *     so "5min lock then full unlock" = `cliff=300, vesting=300` (lock-only,
 *     no linear ramp).
 *   - Sale.buy() takes whole-token quantity; cost = qty × pricePerToken
 *     (pricePerToken in payment-token decimals).
 *   - In Vested mode, buyers receive ERC-1155 fractions immediately; the
 *     underlying project token is released by `vault.claim()` after lockup.
 *
 * Run:
 *   npx hardhat run contracts/scripts/e2e-agent-token.ts --network hardhat
 */

import { ethers, upgrades, network } from "hardhat";
import type { Contract, ContractTransactionResponse, TransactionReceipt } from "ethers";

interface Step { name: string; gas?: bigint; status: "PASS" | "FAIL"; note?: string }

const steps: Step[] = [];

function pass(name: string, gas?: bigint, note?: string) {
  steps.push({ name, gas, status: "PASS", note });
  const g = gas ? ` ${gas.toLocaleString().padStart(10)} gas` : "".padStart(15);
  console.log(`  [PASS] ${name.padEnd(50)} ${g}${note ? "  — " + note : ""}`);
}

function fail(name: string, err: unknown): never {
  const msg = err instanceof Error ? err.message : String(err);
  steps.push({ name, status: "FAIL", note: msg.slice(0, 200) });
  console.log(`  [FAIL] ${name}\n         ${msg.slice(0, 300)}`);
  throw err;
}

async function gasOf(tx: ContractTransactionResponse): Promise<bigint> {
  const r = (await tx.wait()) as TransactionReceipt;
  return r.gasUsed;
}

async function timeTravel(seconds: number) {
  await network.provider.send("evm_increaseTime", [seconds]);
  await network.provider.send("evm_mine", []);
}

async function setNextTimestamp(ts: number) {
  await network.provider.send("evm_setNextBlockTimestamp", [ts]);
  await network.provider.send("evm_mine", []);
}

async function main() {
  const [admin, registrar, issuer, investor] = await ethers.getSigners();

  console.log("\n╔══════════════════════════════════════════════════════════════════╗");
  console.log("║   E2E — AGENT token + single-phase sale + 5min lock + claim    ║");
  console.log("╚══════════════════════════════════════════════════════════════════╝\n");
  console.log(`  admin     ${admin.address}`);
  console.log(`  registrar ${registrar.address}`);
  console.log(`  issuer    ${issuer.address}`);
  console.log(`  investor  ${investor.address}\n`);

  // ── Step 1: Deploy v2 platform inline ──────────────────────────────────
  console.log("─ Step 1: Deploy v2 platform ─");

  let totalGas = 0n;

  // Registries
  const sirF = await ethers.getContractFactory("SimpleIdentityRegistry");
  const sir = await upgrades.deployProxy(
    sirF,
    [admin.address, ethers.ZeroAddress, ethers.ZeroAddress, ethers.ZeroAddress],
    { kind: "uups" }
  );
  await sir.waitForDeployment();

  const irF = await ethers.getContractFactory("IssuerRegistry");
  const ir = await upgrades.deployProxy(irF, [admin.address], { kind: "uups" });
  await ir.waitForDeployment();

  const pfmF = await ethers.getContractFactory("PlatformFeeManager");
  const pfm = await upgrades.deployProxy(pfmF, [admin.address, admin.address, 200], { kind: "uups" });
  await pfm.waitForDeployment();

  // Implementations
  const tokenImpl = await (await ethers.getContractFactory("CiretaToken")).deploy();
  const sirImpl = await (await ethers.getContractFactory("SimpleIdentityRegistry")).deploy();
  const compImpl = await (await ethers.getContractFactory("ModularCompliance")).deploy();
  const saleImpl = await (await ethers.getContractFactory("Sale")).deploy();
  const vaultImpl = await (await ethers.getContractFactory("CiretaVault")).deploy();
  const fractionImpl = await (await ethers.getContractFactory("CiretaFractionToken1155")).deploy();

  // Factories
  const tokenFactoryF = await ethers.getContractFactory("CiretaTokenFactory");
  const tokenFactory = await upgrades.deployProxy(
    tokenFactoryF,
    [
      admin.address,
      await tokenImpl.getAddress(),
      await sirImpl.getAddress(),
      await compImpl.getAddress(),
      ethers.ZeroAddress, ethers.ZeroAddress, ethers.ZeroAddress,
      await ir.getAddress(),
    ],
    { kind: "uups" }
  );
  await tokenFactory.waitForDeployment();

  const saleFactoryF = await ethers.getContractFactory("CiretaSaleFactory");
  const saleFactory = await upgrades.deployProxy(
    saleFactoryF,
    [admin.address, await saleImpl.getAddress()],
    { kind: "uups" }
  );
  await saleFactory.waitForDeployment();

  const fractionFactoryF = await ethers.getContractFactory("CiretaFractionFactory");
  const fractionFactory = await upgrades.deployProxy(
    fractionFactoryF,
    [admin.address, await fractionImpl.getAddress(), await vaultImpl.getAddress()],
    { kind: "uups", unsafeAllow: ["constructor"] }
  );
  await fractionFactory.waitForDeployment();

  // Wire
  const REGISTRAR_ROLE = ethers.keccak256(ethers.toUtf8Bytes("REGISTRAR_ROLE"));
  for (const f of [tokenFactory, saleFactory, fractionFactory]) {
    await (await sir.grantRole(REGISTRAR_ROLE, await f.getAddress())).wait();
  }
  // Grant the dedicated registrar wallet REGISTRAR_ROLE so it can directly
  // whitelist issuer + investor (mirrors the prod IAM split where admin is
  // separate from the registrar EOA).
  await (await sir.grantRole(REGISTRAR_ROLE, registrar.address)).wait();

  await (await tokenFactory.setSimpleIdentityMode(true)).wait();
  await (await saleFactory.setIssuerRegistry(await ir.getAddress())).wait();
  await (await saleFactory.setPlatformFeeManager(await pfm.getAddress())).wait();
  await (await saleFactory.setFractionFactory(await fractionFactory.getAddress())).wait();
  await (await fractionFactory.transferOwnership(await saleFactory.getAddress())).wait();

  // Mock USDC
  const usdc = await (await ethers.getContractFactory("CiretaUSDC")).deploy();
  await usdc.waitForDeployment();

  pass("v2 platform + factories + USDC mock deployed");

  // ── Step 2: Register issuer ────────────────────────────────────────────
  console.log("\n─ Step 2: Register issuer ─");

  let tx = await ir.registerIssuer(issuer.address, "AGENT Issuer", "GB");
  let g = await gasOf(tx); totalGas += g;
  pass("IssuerRegistry.registerIssuer", g);

  tx = await ir.activateIssuer(issuer.address);
  g = await gasOf(tx); totalGas += g;
  pass("IssuerRegistry.activateIssuer", g);

  tx = await sir.connect(registrar).addToWhitelist(issuer.address, 826);
  g = await gasOf(tx); totalGas += g;
  pass("Whitelist issuer on SIR (country=826 GB)", g);

  // ── Step 3: Deploy AGENT token ─────────────────────────────────────────
  console.log("\n─ Step 3: Deploy AGENT token (1000 fixed supply, 6 decimals) ─");

  const TOTAL_SUPPLY = ethers.parseUnits("1000", 6);

  tx = await tokenFactory.connect(issuer).deployToken(
    "AGENT", "AGENT", 6, issuer.address, await sir.getAddress(),
    TOTAL_SUPPLY, true, TOTAL_SUPPLY
  );
  const tdReceipt = (await tx.wait()) as TransactionReceipt;
  totalGas += tdReceipt.gasUsed;

  // Parse TokenDeployed event
  const tokenFactoryIface = (await ethers.getContractFactory("CiretaTokenFactory")).interface;
  const topic = tokenFactoryIface.getEvent("TokenDeployed").topicHash;
  let tokenAddr = "";
  for (const log of tdReceipt.logs) {
    if (log.topics[0] === topic) {
      const parsed = tokenFactoryIface.parseLog(log);
      tokenAddr = parsed!.args[0] as string;
      break;
    }
  }
  if (!tokenAddr) fail("Parse TokenDeployed event", new Error("event not found"));
  pass(`AGENT deployed @ ${tokenAddr.slice(0, 10)}…`, tdReceipt.gasUsed);

  const agent = await ethers.getContractAt("CiretaToken", tokenAddr);
  const issuerBal = await agent.balanceOf(issuer.address);
  if (issuerBal !== TOTAL_SUPPLY) {
    fail("Initial mint check", new Error(`expected ${TOTAL_SUPPLY}, got ${issuerBal}`));
  }
  pass(`Issuer holds 1000 AGENT (${issuerBal} raw)`);

  // ── Step 4: Whitelist investor ─────────────────────────────────────────
  console.log("\n─ Step 4: Whitelist investor ─");

  tx = await sir.connect(registrar).addToWhitelist(investor.address, 826);
  g = await gasOf(tx); totalGas += g;
  pass("Whitelist investor on SIR (country=826 GB)", g);

  // ── Step 5: Deploy Vested-mode Sale ────────────────────────────────────
  console.log("\n─ Step 5: Deploy Sale (Vested, cliff=300s, vesting=300s = lock-mode) ─");

  // Sale init data — factory verifies issuer + factory + fee match
  const saleIface = new ethers.Interface([
    "function initialize(address,address,address,address,address,address,uint256,uint256,uint256,uint256,address,uint256,uint256,uint256)",
  ]);
  const block = await ethers.provider.getBlock("latest");
  const chainNow = block!.timestamp;
  const SALE_START = chainNow + 60;
  const SALE_DURATION = 30 * 24 * 3600;
  const SALE_END = SALE_START + SALE_DURATION;

  const initData = saleIface.encodeFunctionData("initialize", [
    tokenAddr,
    await usdc.getAddress(),
    await sir.getAddress(),
    issuer.address,
    await saleFactory.getAddress(),
    await pfm.getAddress(),
    ethers.parseUnits("1", 6),       // softCap = 1 USDC (low — we'll exceed with the buys)
    ethers.parseUnits("1000", 6),    // hardCap = 1000 USDC (= 1000 AGENT × 1 USDC)
    200n,                             // feeBps = 2.00% (matches PFM default)
    ethers.parseUnits("50000", 6),   // feeCap (irrelevant at this scale)
    ethers.ZeroAddress,               // no OTC token
    SALE_START,
    SALE_END,
    TOTAL_SUPPLY,                     // totalTokenSupply = 1000 AGENT raw
  ]);

  // cliff = vesting = 300 → lock mode (0% until 300s, then 100%)
  const CLIFF = 300n;
  const VESTING = 300n;
  // ExcessPolicy.Keep = 0, BurnToMatch = 1
  tx = await saleFactory.connect(issuer).deploySaleVested(
    tokenAddr, initData,
    "frAGENT", "frAGENT", 6,
    await sir.getAddress(),
    CLIFF, VESTING,
    0
  );
  const dsReceipt = (await tx.wait()) as TransactionReceipt;
  totalGas += dsReceipt.gasUsed;

  const sales = (await saleFactory.getSalesForToken(tokenAddr)) as string[];
  const saleAddr = sales[0]!;
  const sale = await ethers.getContractAt("Sale", saleAddr);
  const vaultAddr = await sale.vault();
  const fractionAddr = await sale.fractionToken();
  pass(`Sale + Vault + Fraction deployed (sale=${saleAddr.slice(0, 10)}…, vault=${vaultAddr.slice(0, 10)}…)`, dsReceipt.gasUsed);

  // ── Step 6: Add Seed phase ─────────────────────────────────────────────
  console.log("\n─ Step 6: Add Seed phase (min 10 / max 0=unlimited / topup 5) ─");

  // AllocationMode: Fixed=0, Remaining=1. Fixed pins exact allocation to this phase.
  tx = await sale.connect(issuer).addPhase(
    "Seed",
    ethers.parseUnits("1", 6),       // pricePerToken: 1 USDC per whole AGENT
    TOTAL_SUPPLY,                     // allocation = full 1000 AGENT raw
    10n,                              // minTokens: 10 whole tokens (first-time buyer floor)
    0n,                               // maxTokens: 0 = unlimited per investor
    5n,                               // topUpMinTokens: 5 whole tokens for repeat buys
    SALE_START,
    SALE_END - 1,
    false,                            // not whitelist-only
    0                                 // AllocationMode.Fixed
  );
  g = await gasOf(tx); totalGas += g;
  pass("Sale.addPhase('Seed')", g);

  // ── Step 7: Deposit project tokens to vault ────────────────────────────
  console.log("\n─ Step 7: Issuer deposits 1000 AGENT into the vault ─");

  tx = await agent.connect(issuer).transfer(vaultAddr, TOTAL_SUPPLY);
  g = await gasOf(tx); totalGas += g;
  pass("AGENT.transfer(vault, 1000)", g);

  // ── Step 8: Admin approves → Issuer activates ──────────────────────────
  console.log("\n─ Step 8: Admin approves → Issuer activates ─");

  tx = await sale.connect(admin).approveSale();
  g = await gasOf(tx); totalGas += g;
  pass("Sale.approveSale (admin)", g);

  await setNextTimestamp(SALE_START + 1);

  tx = await sale.connect(issuer).activate();
  g = await gasOf(tx); totalGas += g;
  pass("Sale.activate (issuer)", g);

  // ── Step 9: Investor buys 3 chunks ─────────────────────────────────────
  console.log("\n─ Step 9: Investor buys 100 + 200 + 50 = 350 AGENT ─");

  // Mint USDC to investor
  await (await usdc.mint(investor.address, ethers.parseUnits("1000", 6))).wait();
  pass("Mint 1000 USDC to investor (mock)");

  await (await usdc.connect(investor).approve(saleAddr, ethers.parseUnits("1000", 6))).wait();

  for (const qty of [100n, 200n, 50n]) {
    tx = await sale.connect(investor).buy(0, qty);
    g = await gasOf(tx); totalGas += g;
    pass(`Sale.buy(phase=0, qty=${qty})`, g);
  }

  // Verify fraction balance
  const fraction = await ethers.getContractAt("CiretaFractionToken1155", fractionAddr);
  const FRACTION_ID_USDC = await fraction.ID_USDC();
  const fracBal = await fraction.balanceOf(investor.address, FRACTION_ID_USDC);
  if (fracBal !== ethers.parseUnits("350", 6)) {
    fail("Fraction balance check", new Error(`expected 350e6, got ${fracBal}`));
  }
  pass(`Investor holds 350 frAGENT (${fracBal} raw)`);

  // ── Step 10: Time-travel past sale end + finalize ──────────────────────
  console.log("\n─ Step 10: Time-travel to sale end + finalize ─");

  await setNextTimestamp(SALE_END + 1);

  tx = await sale.connect(issuer).finalizeSale();
  g = await gasOf(tx); totalGas += g;
  pass("Sale.finalizeSale (issuer)", g);

  // ── Step 11: Wait the 5min lockup ──────────────────────────────────────
  console.log("\n─ Step 11: Wait 5min lockup before claim ─");

  // Vault timer starts at finalize. Pre-lock: claim should revert.
  let preLockReverted = false;
  try {
    await (await ethers.getContractAt("CiretaVault", vaultAddr)).connect(investor).claim.staticCall();
  } catch {
    preLockReverted = true;
  }
  if (!preLockReverted) {
    fail("Pre-lock claim should revert", new Error("claim succeeded too early"));
  }
  pass("Pre-lock vault.claim() reverts (good)");

  await timeTravel(301);
  pass("Advanced 301s (past lockup)");

  // ── Step 12: Investor claims ───────────────────────────────────────────
  console.log("\n─ Step 12: Investor claims AGENT from vault ─");

  const vault = await ethers.getContractAt("CiretaVault", vaultAddr);
  tx = await vault.connect(investor).claim();
  g = await gasOf(tx); totalGas += g;
  pass("Vault.claim", g);

  const finalAgentBal = await agent.balanceOf(investor.address);
  if (finalAgentBal !== ethers.parseUnits("350", 6)) {
    fail("Final AGENT balance check", new Error(`expected 350e6, got ${finalAgentBal}`));
  }
  pass(`Investor holds 350 AGENT on-chain (${finalAgentBal} raw)`);

  // ── Summary ────────────────────────────────────────────────────────────
  console.log("\n══════════════════════════════════════════════════════════════════");
  const passes = steps.filter((s) => s.status === "PASS").length;
  const fails = steps.filter((s) => s.status === "FAIL").length;
  console.log(`  ${passes} PASS / ${fails} FAIL — total gas across tx steps: ${totalGas.toLocaleString()}`);
  console.log(`\n  Token:    ${tokenAddr}`);
  console.log(`  Sale:     ${saleAddr}`);
  console.log(`  Vault:    ${vaultAddr}`);
  console.log(`  Fraction: ${fractionAddr}`);
  console.log("\n  ✓ End-to-end AGENT flow passes on hardhat.\n");
}

main().catch((e) => {
  console.error("Fatal:", e instanceof Error ? e.message : String(e));
  process.exit(1);
});
