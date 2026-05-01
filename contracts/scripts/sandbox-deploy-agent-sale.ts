/**
 * Phase 2 — sandbox AGENT sale on Base Sepolia.
 *
 * Same logic as scripts/e2e-agent-token.ts but against the deployed v2
 * platform from contracts/deployments/base-sepolia.v2.20260430.json. Uses
 * the four real wallets in .env.sandbox-e2e (admin / registrar / issuer /
 * investor). Time-travel is replaced by real-time waits.
 *
 *  Sale window: now+90s → now+5min (5-min sale, runs in real time).
 *  Lockup:      cliff = vesting = 300s post-finalize.
 *
 * Flow:
 *   1. Preflight: balances, role checks, idempotent existing-state checks
 *   2. Register issuer (admin), whitelist issuer + investor (registrar)
 *   3. Issuer deploys AGENT (1000 fixed supply)
 *   4. Issuer deploys Vested-mode Sale + adds Seed phase + deposits to vault
 *   5. Admin approveSale → wait for sale start → issuer activate
 *   6. Investor buys 100 + 200 + 50 = 350 AGENT (3 chunks)
 *   7. Wait for sale end → finalize → wait 5 min → claim
 *   8. Persist a manifest .json for the DB-seed step
 *
 * Run:
 *   poetry run dotenv-cli -f .env -f .env.sandbox-e2e -- bash -c '
 *     cd contracts && npx hardhat run scripts/sandbox-deploy-agent-sale.ts --network baseSepolia
 *   '
 *
 * Or simpler: source the env files manually then run hardhat directly.
 */

import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";
import type { Contract, ContractTransactionResponse, TransactionReceipt } from "ethers";

// ── Config ─────────────────────────────────────────────────────────────────

const SALE_START_DELAY_S = 90;       // sale starts 90s after script kick-off
const SALE_DURATION_S = 5 * 60;      // 5-minute sale window
const LOCKUP_S = 300;                // 5-min post-finalize lock (cliff = vesting)
const POLL_INTERVAL_MS = 5000;       // tick every 5s while waiting
const MANIFEST_PATH = path.join(__dirname, "..", "deployments", `agent-sale.${dateStamp()}.json`);

function dateStamp() {
  const d = new Date();
  return `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}${String(d.getUTCDate()).padStart(2, "0")}-${String(d.getUTCHours()).padStart(2, "0")}${String(d.getUTCMinutes()).padStart(2, "0")}`;
}

// ── Helpers ────────────────────────────────────────────────────────────────

interface Step { name: string; gas?: bigint; txHash?: string; status: "PASS" | "FAIL"; note?: string }
const steps: Step[] = [];

function pass(name: string, opts: { gas?: bigint; txHash?: string; note?: string } = {}) {
  steps.push({ name, ...opts, status: "PASS" });
  const g = opts.gas ? ` ${opts.gas.toLocaleString().padStart(10)} gas` : "".padStart(15);
  const tx = opts.txHash ? `\n         tx: https://sepolia.basescan.org/tx/${opts.txHash}` : "";
  console.log(`  [PASS] ${name.padEnd(56)} ${g}${opts.note ? "  — " + opts.note : ""}${tx}`);
}

function fail(name: string, err: unknown): never {
  const msg = err instanceof Error ? err.message : String(err);
  steps.push({ name, status: "FAIL", note: msg.slice(0, 300) });
  console.log(`  [FAIL] ${name}\n         ${msg.slice(0, 400)}`);
  throw err;
}

async function gasOf(tx: ContractTransactionResponse): Promise<{ gas: bigint; txHash: string }> {
  const r = (await tx.wait()) as TransactionReceipt;
  return { gas: r.gasUsed, txHash: r.hash };
}

async function sleep(ms: number) {
  await new Promise((r) => setTimeout(r, ms));
}

async function waitUntil(targetMs: number, label: string) {
  while (Date.now() < targetMs) {
    const remaining = Math.max(0, Math.ceil((targetMs - Date.now()) / 1000));
    process.stdout.write(`\r  ⏳ ${label} — ${remaining}s remaining   `);
    await sleep(POLL_INTERVAL_MS);
  }
  process.stdout.write("\r" + " ".repeat(80) + "\r");
}

async function getEthBalance(addr: string) {
  return await ethers.provider.getBalance(addr);
}

// ── Main ───────────────────────────────────────────────────────────────────

async function main() {
  // The hardhat config only loads ONE private key into network.accounts. We
  // need four signers connecting from the same provider, so we create the
  // wallets manually from .env.sandbox-e2e and connect them to the live
  // provider. (Hardhat's getSigners() would only yield the one configured
  // via IDENTITY_SIGNER_PRIVATE_KEY.)
  const provider = ethers.provider;
  const adminPk = process.env.ADMIN_PRIVATE_KEY ?? "";
  const registrarPk = process.env.REGISTRAR_PRIVATE_KEY ?? "";
  const issuerPk = process.env.ISSUER_PRIVATE_KEY ?? "";
  const investorPk = process.env.INVESTOR_PRIVATE_KEY ?? "";
  if (!adminPk || !registrarPk || !issuerPk || !investorPk) {
    throw new Error("Missing one of ADMIN/REGISTRAR/ISSUER/INVESTOR_PRIVATE_KEY in .env.sandbox-e2e");
  }

  const admin = new ethers.Wallet(adminPk, provider);
  const registrar = new ethers.Wallet(registrarPk, provider);
  const issuer = new ethers.Wallet(issuerPk, provider);
  const investor = new ethers.Wallet(investorPk, provider);

  console.log("\n╔══════════════════════════════════════════════════════════════════╗");
  console.log("║   SANDBOX AGENT SALE — Base Sepolia                              ║");
  console.log("╚══════════════════════════════════════════════════════════════════╝\n");
  console.log(`  admin     ${admin.address}`);
  console.log(`  registrar ${registrar.address}`);
  console.log(`  issuer    ${issuer.address}`);
  console.log(`  investor  ${investor.address}\n`);

  const network = await provider.getNetwork();
  if (network.chainId !== 84532n) {
    throw new Error(`Expected Base Sepolia (84532), got chainId ${network.chainId}. Use --network baseSepolia.`);
  }

  // Load v2 deployment manifest
  const manifestPath = path.join(__dirname, "..", "deployments", "base-sepolia.v2.20260430.json");
  if (!fs.existsSync(manifestPath)) throw new Error(`v2 manifest not found at ${manifestPath}`);
  const v2 = JSON.parse(fs.readFileSync(manifestPath, "utf-8")) as Record<string, string>;
  const required = ["simpleIdentityRegistry", "issuerRegistry", "tokenFactory", "saleFactory", "ciretaUSDC", "platformFeeManager"];
  for (const k of required) if (!v2[k]) throw new Error(`v2 manifest missing ${k}`);
  console.log(`  v2 manifest: tokenFactory=${v2.tokenFactory!.slice(0, 10)}… saleFactory=${v2.saleFactory!.slice(0, 10)}… USDC=${v2.ciretaUSDC!.slice(0, 10)}…\n`);

  // Function-scoped tx ref so all step branches share the same variable
  // even when an idempotent skip (EXISTING_TOKEN, already-whitelisted) means
  // some `tx = ...` assignments are skipped on retry.
  let tx: ContractTransactionResponse;

  // ── Step 1: Preflight ──────────────────────────────────────────────────
  console.log("─ Step 1: Preflight (balances + roles) ─");

  const balances = await Promise.all([
    getEthBalance(admin.address),
    getEthBalance(registrar.address),
    getEthBalance(issuer.address),
    getEthBalance(investor.address),
  ]);
  const labels = ["admin", "registrar", "issuer", "investor"];
  for (let i = 0; i < 4; i++) {
    const eth = ethers.formatEther(balances[i]!);
    console.log(`    ${labels[i]!.padEnd(9)} ETH: ${eth}`);
  }
  const MIN_GAS_ETH = ethers.parseEther("0.005");
  for (let i = 0; i < 4; i++) {
    if (balances[i]! < MIN_GAS_ETH) {
      throw new Error(`${labels[i]} has < 0.005 ETH (${ethers.formatEther(balances[i]!)}); fund before retry.`);
    }
  }
  pass("All four wallets have ETH ≥ 0.005");

  // Role check on SimpleIdentityRegistry
  const sir = await ethers.getContractAt("SimpleIdentityRegistry", v2.simpleIdentityRegistry!, admin);
  const REGISTRAR_ROLE = ethers.keccak256(ethers.toUtf8Bytes("REGISTRAR_ROLE"));
  const ADMIN_ROLE = await sir.DEFAULT_ADMIN_ROLE();
  const adminHasAdmin = await sir.hasRole(ADMIN_ROLE, admin.address);
  const registrarHasRegistrar = await sir.hasRole(REGISTRAR_ROLE, registrar.address);
  console.log(`    admin has DEFAULT_ADMIN_ROLE on SIR: ${adminHasAdmin}`);
  console.log(`    registrar has REGISTRAR_ROLE on SIR: ${registrarHasRegistrar}`);

  if (!registrarHasRegistrar) {
    if (!adminHasAdmin) throw new Error("registrar lacks REGISTRAR_ROLE and admin can't grant it (no DEFAULT_ADMIN_ROLE).");
    console.log("    Granting REGISTRAR_ROLE to registrar wallet…");
    const grantTx = await sir.connect(admin).grantRole(REGISTRAR_ROLE, registrar.address);
    const r = await gasOf(grantTx);
    pass("Granted REGISTRAR_ROLE to registrar wallet", { gas: r.gas, txHash: r.txHash });
  } else {
    pass("Registrar already holds REGISTRAR_ROLE");
  }

  // ── Step 2: Register issuer (idempotent) ───────────────────────────────
  console.log("\n─ Step 2: Register issuer ─");

  const ir = await ethers.getContractAt("IssuerRegistry", v2.issuerRegistry!, admin);
  const isActive = await ir.isActiveIssuer(issuer.address);
  if (isActive) {
    pass("Issuer already active in IssuerRegistry — skipping registerIssuer");
  } else {
    tx = await ir.connect(admin).registerIssuer(issuer.address, "AGENT Issuer", "GB");
    let r = await gasOf(tx);
    pass("IssuerRegistry.registerIssuer", { gas: r.gas, txHash: r.txHash });
    tx = await ir.connect(admin).activateIssuer(issuer.address);
    r = await gasOf(tx);
    pass("IssuerRegistry.activateIssuer", { gas: r.gas, txHash: r.txHash });
  }

  // Whitelist issuer on SIR (idempotent)
  const issuerVerified = await sir.isVerified(issuer.address);
  if (issuerVerified) {
    pass("Issuer already whitelisted on SIR — skipping");
  } else {
    const tx = await sir.connect(registrar).addToWhitelist(issuer.address, 826);
    const r = await gasOf(tx);
    pass("Whitelist issuer on SIR (country=826 GB)", { gas: r.gas, txHash: r.txHash });
  }

  // ── Step 3: Deploy AGENT token (or resume) ─────────────────────────────
  console.log("\n─ Step 3: Deploy AGENT token ─");

  const TOTAL_SUPPLY = ethers.parseUnits("1000", 6);
  const tokenFactory = await ethers.getContractAt("CiretaTokenFactory", v2.tokenFactory!, issuer);

  let tokenAddr = "";

  // Resume hint: if EXISTING_TOKEN is set, skip the deploy. Useful when an
  // earlier run got past step 3 but failed mid-flow.
  if (process.env.EXISTING_TOKEN && /^0x[a-fA-F0-9]{40}$/.test(process.env.EXISTING_TOKEN)) {
    tokenAddr = process.env.EXISTING_TOKEN;
    pass(`Resuming with EXISTING_TOKEN=${tokenAddr}`);
  } else {
    tx = await tokenFactory.connect(issuer).deployToken(
      "AGENT", "AGENT", 6, issuer.address, v2.simpleIdentityRegistry!,
      TOTAL_SUPPLY, true, TOTAL_SUPPLY
    );
    const tdReceipt = (await tx.wait()) as TransactionReceipt;
    const tokenFactoryIface = (await ethers.getContractFactory("CiretaTokenFactory")).interface;
    const topic = tokenFactoryIface.getEvent("TokenDeployed").topicHash;
    for (const log of tdReceipt.logs) {
      if (log.topics[0] === topic) {
        const parsed = tokenFactoryIface.parseLog({ topics: [...log.topics], data: log.data });
        tokenAddr = parsed!.args[0] as string;
        break;
      }
    }
    if (!tokenAddr) throw new Error("Could not parse TokenDeployed event");
    pass(`AGENT deployed @ ${tokenAddr}`, { gas: tdReceipt.gasUsed, txHash: tdReceipt.hash });
  }

  const agent = await ethers.getContractAt("CiretaToken", tokenAddr, issuer);

  // ── Step 4: Whitelist investor ─────────────────────────────────────────
  console.log("\n─ Step 4: Whitelist investor ─");

  const investorVerified = await sir.isVerified(investor.address);
  if (investorVerified) {
    pass("Investor already whitelisted on SIR — skipping");
  } else {
    const t = await sir.connect(registrar).addToWhitelist(investor.address, 826);
    const r = await gasOf(t);
    pass("Whitelist investor on SIR (country=826 GB)", { gas: r.gas, txHash: r.txHash });
  }

  // ── Step 5: Deploy Sale (Vested mode) ──────────────────────────────────
  console.log("\n─ Step 5: Deploy Sale (Vested, cliff=300s, vesting=300s) ─");

  const block = await provider.getBlock("latest");
  const chainNow = block!.timestamp;
  const SALE_START = chainNow + SALE_START_DELAY_S;
  const SALE_END = SALE_START + SALE_DURATION_S;

  const saleIface = new ethers.Interface([
    "function initialize(address,address,address,address,address,address,uint256,uint256,uint256,uint256,address,uint256,uint256,uint256)",
  ]);
  const initData = saleIface.encodeFunctionData("initialize", [
    tokenAddr,
    v2.ciretaUSDC!,
    v2.simpleIdentityRegistry!,
    issuer.address,
    v2.saleFactory!,
    v2.platformFeeManager!,
    ethers.parseUnits("1", 6),       // softCap = 1 USDC
    ethers.parseUnits("1000", 6),    // hardCap = 1000 USDC (= 1000 AGENT × $1)
    200n,                             // feeBps
    ethers.parseUnits("50000", 6),
    ethers.ZeroAddress,
    SALE_START,
    SALE_END,
    TOTAL_SUPPLY,
  ]);

  const saleFactory = await ethers.getContractAt("CiretaSaleFactory", v2.saleFactory!, issuer);

  tx = await saleFactory.connect(issuer).deploySaleVested(
    tokenAddr, initData,
    "frAGENT", "frAGENT", 6,
    v2.simpleIdentityRegistry!,
    300n, 300n,                       // cliff = vesting = 300 → lock-only
    0                                 // ExcessPolicy.Keep
  );
  const dsReceipt = (await tx.wait()) as TransactionReceipt;
  if (dsReceipt.status !== 1) {
    throw new Error(`deploySaleVested reverted (status=${dsReceipt.status}, tx=${dsReceipt.hash})`);
  }

  // Parse SaleDeployed(token, sale, issuer) from the receipt — more reliable
  // than getSalesForToken() under RPC eventual consistency.
  const saleFactoryIface = (await ethers.getContractFactory("CiretaSaleFactory")).interface;
  const saleDeployedTopic = saleFactoryIface.getEvent("SaleDeployed").topicHash;
  let saleAddr = "";
  for (const log of dsReceipt.logs) {
    if (log.topics[0] === saleDeployedTopic && log.address.toLowerCase() === v2.saleFactory!.toLowerCase()) {
      const parsed = saleFactoryIface.parseLog({ topics: [...log.topics], data: log.data });
      saleAddr = parsed!.args[1] as string;
      break;
    }
  }
  if (!saleAddr) throw new Error(`SaleDeployed event not in receipt ${dsReceipt.hash}`);

  const sale = await ethers.getContractAt("Sale", saleAddr, issuer);
  const vaultAddr = await sale.vault();
  const fractionAddr = await sale.fractionToken();
  if (!vaultAddr || vaultAddr === ethers.ZeroAddress) {
    throw new Error(`Sale has no vault (vaultAddr=${vaultAddr}); deploySaleVested may have skipped vault setup`);
  }
  pass(`Sale deployed (sale=${saleAddr.slice(0, 10)}…, vault=${vaultAddr.slice(0, 10)}…)`, {
    gas: dsReceipt.gasUsed, txHash: dsReceipt.hash,
  });

  // ── Step 6: Add Seed phase ─────────────────────────────────────────────
  console.log("\n─ Step 6: Add Seed phase ─");

  tx = await sale.connect(issuer).addPhase(
    "Seed",
    ethers.parseUnits("1", 6),
    TOTAL_SUPPLY,
    10n, 0n, 5n,
    SALE_START, SALE_END - 1,
    false, 0
  );
  let r = await gasOf(tx);
  pass("Sale.addPhase('Seed')", { gas: r.gas, txHash: r.txHash });

  // ── Step 7: Deposit project tokens to vault ────────────────────────────
  console.log("\n─ Step 7: Deposit 1000 AGENT into vault ─");

  tx = await agent.connect(issuer).transfer(vaultAddr, TOTAL_SUPPLY);
  r = await gasOf(tx);
  pass("AGENT.transfer(vault, 1000)", { gas: r.gas, txHash: r.txHash });

  // ── Step 8: Admin approves ─────────────────────────────────────────────
  console.log("\n─ Step 8: Admin approves sale ─");

  tx = await sale.connect(admin).approveSale();
  r = await gasOf(tx);
  pass("Sale.approveSale (admin)", { gas: r.gas, txHash: r.txHash });

  // ── Step 9: Wait for sale start, then activate ─────────────────────────
  console.log(`\n─ Step 9: Wait for sale start (chain time ≥ ${SALE_START}) ─`);

  const startTargetMs = (SALE_START + 5) * 1000; // small margin
  await waitUntil(startTargetMs, "waiting for sale start window");

  tx = await sale.connect(issuer).activate();
  r = await gasOf(tx);
  pass("Sale.activate (issuer)", { gas: r.gas, txHash: r.txHash });

  // ── Step 10: Investor buys 3 chunks ────────────────────────────────────
  console.log("\n─ Step 10: Investor buys 100 + 200 + 50 = 350 AGENT ─");

  // Investor needs 350 USDC of the sandbox mock. CiretaUSDC has open mint.
  const usdc = await ethers.getContractAt("CiretaUSDC", v2.ciretaUSDC!, investor);
  const usdcBal = await usdc.balanceOf(investor.address);
  const NEEDED = ethers.parseUnits("350", 6);
  if (usdcBal < NEEDED) {
    const mintAmount = NEEDED - usdcBal + ethers.parseUnits("50", 6); // +50 buffer
    const t = await usdc.connect(investor).mint(investor.address, mintAmount);
    const m = await gasOf(t);
    pass(`Mint ${ethers.formatUnits(mintAmount, 6)} USDC to investor`, { gas: m.gas, txHash: m.txHash });
  } else {
    pass(`Investor already holds ${ethers.formatUnits(usdcBal, 6)} USDC`);
  }

  const t1 = await usdc.connect(investor).approve(saleAddr, ethers.parseUnits("1000", 6));
  const ar = await gasOf(t1);
  pass("USDC.approve(sale, 1000)", { gas: ar.gas, txHash: ar.txHash });

  const buyTxHashes: string[] = [];
  for (const qty of [100n, 200n, 50n]) {
    const buy = await sale.connect(investor).buy(0, qty);
    const br = await gasOf(buy);
    buyTxHashes.push(br.txHash);
    pass(`Sale.buy(phase=0, qty=${qty})`, { gas: br.gas, txHash: br.txHash });
  }

  const fraction = await ethers.getContractAt("CiretaFractionToken1155", fractionAddr, investor);
  const FRACTION_ID_USDC = await fraction.ID_USDC();
  const fracBal = await fraction.balanceOf(investor.address, FRACTION_ID_USDC);
  if (fracBal !== ethers.parseUnits("350", 6)) {
    throw new Error(`Fraction balance mismatch: expected 350e6, got ${fracBal}`);
  }
  pass(`Investor holds 350 frAGENT (${fracBal} raw)`);

  // ── Step 11: Wait for sale end + finalize ──────────────────────────────
  console.log(`\n─ Step 11: Wait for sale end (chain time ≥ ${SALE_END}) ─`);

  const endTargetMs = (SALE_END + 10) * 1000;
  await waitUntil(endTargetMs, "waiting for sale end window");

  tx = await sale.connect(issuer).finalizeSale();
  r = await gasOf(tx);
  pass("Sale.finalizeSale", { gas: r.gas, txHash: r.txHash });

  // ── Step 12: Wait for lockup + claim ───────────────────────────────────
  console.log(`\n─ Step 12: Wait ${LOCKUP_S}s lockup before claim ─`);

  const claimTargetMs = Date.now() + (LOCKUP_S + 10) * 1000;
  await waitUntil(claimTargetMs, "waiting for vault lockup to expire");

  const vault = await ethers.getContractAt("CiretaVault", vaultAddr, investor);
  tx = await vault.connect(investor).claim();
  r = await gasOf(tx);
  pass("Vault.claim", { gas: r.gas, txHash: r.txHash });

  const finalAgentBal = await agent.balanceOf(investor.address);
  if (finalAgentBal !== ethers.parseUnits("350", 6)) {
    throw new Error(`Final balance mismatch: expected 350e6, got ${finalAgentBal}`);
  }
  pass(`Investor holds 350 AGENT on-chain (${finalAgentBal} raw)`);

  // ── Step 13: Persist manifest ──────────────────────────────────────────
  console.log("\n─ Step 13: Persist deployment manifest ─");

  const manifest = {
    network: "base-sepolia",
    chainId: 84532,
    deployedAt: new Date().toISOString(),
    token: { address: tokenAddr, name: "AGENT", symbol: "AGENT", decimals: 6, totalSupply: TOTAL_SUPPLY.toString() },
    sale: {
      address: saleAddr,
      vault: vaultAddr,
      fraction: fractionAddr,
      mode: "Vested",
      cliffSeconds: 300,
      vestingSeconds: 300,
      startTime: SALE_START,
      endTime: SALE_END,
      softCap: "1000000",
      hardCap: "1000000000",
      totalTokenSupply: TOTAL_SUPPLY.toString(),
    },
    phases: [{
      index: 0,
      name: "Seed",
      pricePerToken: "1000000",
      allocation: TOTAL_SUPPLY.toString(),
      minTokens: "10",
      maxTokens: "0",
      topUpMinTokens: "5",
      startTime: SALE_START,
      endTime: SALE_END - 1,
      whitelistOnly: false,
      allocationMode: "Fixed",
    }],
    issuer: { wallet: issuer.address, name: "AGENT Issuer", jurisdiction: "GB" },
    investor: { wallet: investor.address, contributedUsdc: "350000000", tokensHeld: "350000000", buyTxHashes },
    feeBps: 200,
  };
  fs.mkdirSync(path.dirname(MANIFEST_PATH), { recursive: true });
  fs.writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2));
  pass(`Manifest written to ${MANIFEST_PATH}`);

  // ── Summary ────────────────────────────────────────────────────────────
  console.log("\n══════════════════════════════════════════════════════════════════");
  const passes = steps.filter((s) => s.status === "PASS").length;
  console.log(`  ${passes} PASS / 0 FAIL\n`);
  console.log(`  Token:    ${tokenAddr}`);
  console.log(`  Sale:     ${saleAddr}`);
  console.log(`  Vault:    ${vaultAddr}`);
  console.log(`  Fraction: ${fractionAddr}`);
  console.log(`  Manifest: ${MANIFEST_PATH}`);
  console.log("\n  ✓ Sandbox AGENT flow complete on Base Sepolia. Run sandbox-seed-agent-db.ts next.\n");
}

main().catch((e) => {
  console.error("\nFatal:", e instanceof Error ? e.message : String(e));
  process.exit(1);
});
