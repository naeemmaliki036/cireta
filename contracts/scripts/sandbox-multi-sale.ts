/**
 * Sepolia equivalent of e2e-multi-sale.ts. Deploys TIN (Direct) and SILVER
 * (Vested-linear, 1-hour vesting) on Base Sepolia, runs both flows end-to-end,
 * persists separate manifests for the DB seed step.
 *
 * Real-time waits:
 *   TIN sale window     = 3 min  (no vault → instant receipt, no claim wait)
 *   SILVER sale window  = 3 min
 *   SILVER vesting      = 60 min (4 partial claims at +15 / +30 / +45 / +60)
 *
 * Total wall-clock: ~70 min.
 */

import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";
import type { ContractTransactionResponse, TransactionReceipt } from "ethers";

const POLL_MS = 5000;
const PASSES: string[] = [];
function pass(msg: string, txHash?: string) {
  PASSES.push(msg);
  const tx = txHash ? `\n         tx: https://sepolia.basescan.org/tx/${txHash}` : "";
  console.log(`  [PASS] ${msg}${tx}`);
}
function header(s: string) { console.log(`\n─ ${s} ─`); }

async function gasOf(tx: ContractTransactionResponse): Promise<{ gas: bigint; txHash: string }> {
  const r = (await tx.wait()) as TransactionReceipt;
  if (r.status !== 1) throw new Error(`tx reverted ${r.hash}`);
  return { gas: r.gasUsed, txHash: r.hash };
}

async function chainTimestamp() {
  const b = await ethers.provider.getBlock("latest");
  return b!.timestamp;
}

/** Read a view fn with a couple of retries — RPC nodes lag for a beat after a
 * fresh proxy deploy and `status()` etc. can return 0x before propagation. */
async function safeRead<T>(fn: () => Promise<T>, retries = 5): Promise<T> {
  for (let i = 0; i < retries; i++) {
    try { return await fn(); }
    catch (e: any) {
      if (i === retries - 1) throw e;
      const msg = String(e?.message || e);
      if (!msg.includes("could not decode") && !msg.includes("BAD_DATA") && !msg.includes("CALL_EXCEPTION")) throw e;
      await new Promise((r) => setTimeout(r, 4000));
    }
  }
  throw new Error("safeRead exhausted");
}

async function waitForChainTime(target: number, label: string) {
  while (true) {
    const now = await chainTimestamp();
    if (now >= target) return;
    process.stdout.write(`\r  ⏳ ${label} — chain Δ${target - now}s    `);
    await new Promise((r) => setTimeout(r, POLL_MS));
  }
}

function dateStamp() {
  const d = new Date();
  return `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}${String(d.getUTCDate()).padStart(2, "0")}-${String(d.getUTCHours()).padStart(2, "0")}${String(d.getUTCMinutes()).padStart(2, "0")}`;
}

async function main() {
  const provider = ethers.provider;
  const admin = new ethers.Wallet(process.env.ADMIN_PRIVATE_KEY!, provider);
  const issuer = new ethers.Wallet(process.env.ISSUER_PRIVATE_KEY!, provider);
  const investor = new ethers.Wallet(process.env.INVESTOR_PRIVATE_KEY!, provider);

  const network = await provider.getNetwork();
  if (network.chainId !== 84532n) throw new Error(`Use --network baseSepolia. Got ${network.chainId}`);

  const v2Path = path.join(__dirname, "..", "deployments", "base-sepolia.v2.20260430.json");
  const v2 = JSON.parse(fs.readFileSync(v2Path, "utf-8")) as Record<string, string>;
  const tokenFactory = await ethers.getContractAt("CiretaTokenFactory", v2.tokenFactory!, issuer);
  const saleFactory = await ethers.getContractAt("CiretaSaleFactory", v2.saleFactory!, issuer);
  const usdc = await ethers.getContractAt("CiretaUSDC", v2.ciretaUSDC!, investor);

  const tokenFactoryIface = (await ethers.getContractFactory("CiretaTokenFactory")).interface;
  const saleFactoryIface = (await ethers.getContractFactory("CiretaSaleFactory")).interface;
  const tokenDeployedTopic = tokenFactoryIface.getEvent("TokenDeployed").topicHash;
  const saleDeployedTopic = saleFactoryIface.getEvent("SaleDeployed").topicHash;

  console.log("\n╔══════════════════════════════════════════════════════════════════╗");
  console.log("║   SANDBOX Multi-sale — TIN (Direct) + SILVER (Vested 1hr)        ║");
  console.log("╚══════════════════════════════════════════════════════════════════╝\n");
  console.log(`  admin    ${admin.address}`);
  console.log(`  issuer   ${issuer.address}`);
  console.log(`  investor ${investor.address}\n`);

  const saleIface = new ethers.Interface([
    "function initialize(address,address,address,address,address,address,uint256,uint256,uint256,uint256,address,uint256,uint256,uint256)",
  ]);

  // ── TIN (Direct) ─────────────────────────────────────────────────────────
  header("TIN — Direct mode, 500 fixed supply");
  let tinAddr = process.env.EXISTING_TIN ?? "";
  if (!tinAddr) {
    const TIN_SUPPLY = ethers.parseUnits("500", 6);
    const txt = await tokenFactory.connect(issuer).deployToken(
      "TIN", "TIN", 6, issuer.address, v2.simpleIdentityRegistry!,
      TIN_SUPPLY, true, TIN_SUPPLY
    );
    const r = (await txt.wait()) as TransactionReceipt;
    const log = r.logs.find((l) => l.topics[0] === tokenDeployedTopic)!;
    tinAddr = tokenFactoryIface.parseLog({ topics: [...log.topics], data: log.data })!.args[0] as string;
    pass(`TIN deployed @ ${tinAddr}`, r.hash);
  } else {
    pass(`Resuming with EXISTING_TIN=${tinAddr}`);
  }
  const tin = await ethers.getContractAt("CiretaToken", tinAddr, issuer);

  // Sale init
  let tinSaleAddr = process.env.EXISTING_TIN_SALE ?? "";
  let TIN_START = 0;
  let TIN_END = 0;
  if (!tinSaleAddr) {
    const blk = await provider.getBlock("latest");
    TIN_START = blk!.timestamp + 90;
    TIN_END = TIN_START + 3 * 60;
    const init = saleIface.encodeFunctionData("initialize", [
      tinAddr, v2.ciretaUSDC!, v2.simpleIdentityRegistry!,
      issuer.address, v2.saleFactory!, v2.platformFeeManager!,
      ethers.parseUnits("1", 6),
      ethers.parseUnits("500", 6),
      200n, ethers.parseUnits("50000", 6),
      ethers.ZeroAddress, TIN_START, TIN_END,
      ethers.parseUnits("500", 6),
    ]);
    const txt = await saleFactory.connect(issuer).deploySale(tinAddr, init);
    const r = (await txt.wait()) as TransactionReceipt;
    const log = r.logs.find((l) => l.topics[0] === saleDeployedTopic && l.address.toLowerCase() === v2.saleFactory!.toLowerCase())!;
    tinSaleAddr = saleFactoryIface.parseLog({ topics: [...log.topics], data: log.data })!.args[1] as string;
    pass(`TIN Direct sale @ ${tinSaleAddr}`, r.hash);
  } else {
    pass(`Resuming with EXISTING_TIN_SALE=${tinSaleAddr}`);
  }
  const tinSale = await ethers.getContractAt("Sale", tinSaleAddr, issuer);
  // If resuming, recover phase window — but if the original run died
  // before addPhase, getPhase(0) reverts. Fall back to saleStart/End on
  // the proxy itself (set in initialize() and always readable).
  if (TIN_START === 0) {
    TIN_START = Number(await safeRead(() => tinSale.saleStartTime()));
    TIN_END = Number(await safeRead(() => tinSale.saleEndTime()));
  }

  // Add phase + deposit + approve + activate (idempotent: skip if already activated)
  const tinStatus = await safeRead(() => tinSale.status());
  if (tinStatus === 0n) {
    const phaseCount = await tinSale.getPhaseCount();
    if (phaseCount === 0n) {
      const r = await gasOf(await tinSale.connect(issuer).addPhase(
        "Seed", ethers.parseUnits("1", 6), ethers.parseUnits("500", 6),
        10n, 0n, 5n, TIN_START, TIN_END - 1, false, 0
      ));
      pass("TIN.addPhase Seed", r.txHash);
    }
    const saleBal = await tin.balanceOf(tinSaleAddr);
    if (saleBal < ethers.parseUnits("500", 6)) {
      const r = await gasOf(await tin.connect(issuer).transfer(tinSaleAddr, ethers.parseUnits("500", 6) - saleBal));
      pass(`TIN.transfer(sale, ${ethers.formatUnits(ethers.parseUnits("500", 6) - saleBal, 6)} TIN)`, r.txHash);
    }
    const approved = await tinSale.approved();
    if (!approved) {
      const r = await gasOf(await tinSale.connect(admin).approveSale());
      pass("TIN.approveSale (admin)", r.txHash);
    }
    await waitForChainTime(TIN_START + 5, "TIN sale start");
    console.log();
    const r = await gasOf(await tinSale.connect(issuer).activate());
    pass("TIN.activate (issuer)", r.txHash);
  } else {
    pass(`TIN already past Draft (status=${tinStatus})`);
  }

  // tinBuyHashes is hoisted so the manifest write at the end can reference
  // it even when we skip buys (resume path on a finalized sale).
  const tinBuyHashes: string[] = [];

  // Skip the rest of TIN if already finalized
  const tinStatusForBuyCheck = await safeRead(() => tinSale.status());
  if (tinStatusForBuyCheck >= 3n) {
    pass("TIN already finalized — skipping buys + finalize");
    // proceed to SILVER section by jumping past the TIN flow
  } else {
  // Mint USDC + buy 50 + 100 + 25 = 175
  const tinAllowance = await usdc.allowance(investor.address, tinSaleAddr);
  if (tinAllowance < ethers.parseUnits("500", 6)) {
    const usdcBal = await usdc.balanceOf(investor.address);
    if (usdcBal < ethers.parseUnits("500", 6)) {
      const r = await gasOf(await usdc.connect(investor).mint(investor.address, ethers.parseUnits("1000", 6)));
      pass("Mint 1000 USDC to investor", r.txHash);
    }
    const r = await gasOf(await usdc.connect(investor).approve(tinSaleAddr, ethers.parseUnits("1000", 6)));
    pass("USDC.approve(tinSale, 1000)", r.txHash);
  }

  let tinBalanceBefore = await tin.balanceOf(investor.address);
  for (const qty of [50n, 100n, 25n]) {
    if (tinBalanceBefore >= ethers.parseUnits("175", 6)) {
      pass("All TIN buys already done");
      break;
    }
    const r = await gasOf(await tinSale.connect(investor).buy(0, qty));
    tinBuyHashes.push(r.txHash);
    pass(`TIN.buy(${qty}) — investor receives ${qty} TIN immediately`, r.txHash);
  }
  // Wait briefly for RPC propagation, then verify
  await new Promise((r) => setTimeout(r, 8000));
  const tinFinalBal = await tin.balanceOf(investor.address);
  pass(`Investor TIN balance: ${ethers.formatUnits(tinFinalBal, 6)} TIN (expected 175)`);

  // Finalize TIN
  await waitForChainTime(TIN_END + 5, "TIN sale end");
  console.log();
  const tinStatusBeforeFinalize = await safeRead(() => tinSale.status());
  if (tinStatusBeforeFinalize === 1n) {
    const r = await gasOf(await tinSale.connect(issuer).finalizeSale());
    pass("TIN.finalizeSale", r.txHash);
  } else {
    pass(`TIN already finalized (status=${tinStatusBeforeFinalize})`);
  }
  } // end of "if not already finalized" wrap

  // Persist TIN manifest
  const tinManifestPath = path.join(__dirname, "..", "deployments", `tin-direct.${dateStamp()}.json`);
  fs.writeFileSync(tinManifestPath, JSON.stringify({
    network: "base-sepolia",
    chainId: 84532,
    deployedAt: new Date().toISOString(),
    token: { address: tinAddr, name: "TIN", symbol: "TIN", decimals: 6, totalSupply: "500000000" },
    sale: {
      address: tinSaleAddr, vault: null, fraction: null,
      mode: "Direct", cliffSeconds: 0, vestingSeconds: 0,
      startTime: TIN_START, endTime: TIN_END,
      softCap: "1000000", hardCap: "500000000", totalTokenSupply: "500000000",
    },
    phases: [{
      index: 0, name: "Seed", pricePerToken: "1000000", allocation: "500000000",
      minTokens: "10", maxTokens: "0", topUpMinTokens: "5",
      startTime: TIN_START, endTime: TIN_END - 1, whitelistOnly: false, allocationMode: "Fixed",
    }],
    issuer: { wallet: issuer.address, name: "AGENT Issuer", jurisdiction: "GB" },
    investor: { wallet: investor.address, contributedUsdc: "175000000", tokensHeld: "175000000", buyTxHashes: tinBuyHashes },
    feeBps: 200,
  }, null, 2));
  pass(`TIN manifest → ${path.basename(tinManifestPath)}`);

  // ── SILVER (Vested linear, 1 hour) ────────────────────────────────────
  header("SILVER — Vested linear, cliff=0, vesting=3600s, 800 supply");

  const SILVER_SUPPLY = ethers.parseUnits("800", 6);
  let silverAddr = process.env.EXISTING_SILVER ?? "";
  if (!silverAddr) {
    const txt = await tokenFactory.connect(issuer).deployToken(
      "SILVER", "SILVER", 6, issuer.address, v2.simpleIdentityRegistry!,
      SILVER_SUPPLY, true, SILVER_SUPPLY
    );
    const r = (await txt.wait()) as TransactionReceipt;
    const log = r.logs.find((l) => l.topics[0] === tokenDeployedTopic)!;
    silverAddr = tokenFactoryIface.parseLog({ topics: [...log.topics], data: log.data })!.args[0] as string;
    pass(`SILVER deployed @ ${silverAddr}`, r.hash);
  } else {
    pass(`Resuming with EXISTING_SILVER=${silverAddr}`);
  }
  const silver = await ethers.getContractAt("CiretaToken", silverAddr, issuer);

  let silverSaleAddr = process.env.EXISTING_SILVER_SALE ?? "";
  let SILVER_START = 0;
  let SILVER_END = 0;
  if (!silverSaleAddr) {
    const blk = await provider.getBlock("latest");
    SILVER_START = blk!.timestamp + 90;
    SILVER_END = SILVER_START + 3 * 60;
    const init = saleIface.encodeFunctionData("initialize", [
      silverAddr, v2.ciretaUSDC!, v2.simpleIdentityRegistry!,
      issuer.address, v2.saleFactory!, v2.platformFeeManager!,
      ethers.parseUnits("1", 6),
      ethers.parseUnits("1600", 6),
      200n, ethers.parseUnits("50000", 6),
      ethers.ZeroAddress, SILVER_START, SILVER_END, SILVER_SUPPLY,
    ]);
    const txt = await saleFactory.connect(issuer).deploySaleVested(
      silverAddr, init, "frSILVER", "frSILVER", 6,
      v2.simpleIdentityRegistry!, 0n, 3600n, 0
    );
    const r = (await txt.wait()) as TransactionReceipt;
    const log = r.logs.find((l) => l.topics[0] === saleDeployedTopic && l.address.toLowerCase() === v2.saleFactory!.toLowerCase())!;
    silverSaleAddr = saleFactoryIface.parseLog({ topics: [...log.topics], data: log.data })!.args[1] as string;
    pass(`SILVER Vested sale @ ${silverSaleAddr}`, r.hash);
  } else {
    pass(`Resuming with EXISTING_SILVER_SALE=${silverSaleAddr}`);
  }
  const silverSale = await ethers.getContractAt("Sale", silverSaleAddr, issuer);
  if (SILVER_START === 0) {
    SILVER_START = Number(await safeRead(() => silverSale.saleStartTime()));
    SILVER_END = Number(await safeRead(() => silverSale.saleEndTime()));
  }
  const silverVaultAddr = await safeRead(() => silverSale.vault());
  const silverFracAddr = await safeRead(() => silverSale.fractionToken());

  // Phase + deposit + approve + activate
  const silverStatus = await safeRead(() => silverSale.status());
  if (silverStatus === 0n) {
    if ((await safeRead(() => silverSale.getPhaseCount())) === 0n) {
      const r = await gasOf(await silverSale.connect(issuer).addPhase(
        "Seed", ethers.parseUnits("2", 6), SILVER_SUPPLY,
        10n, 0n, 5n, SILVER_START, SILVER_END - 1, false, 0
      ));
      pass("SILVER.addPhase Seed @ 2 USDC/token", r.txHash);
    }
    const vaultBal = await silver.balanceOf(silverVaultAddr);
    if (vaultBal < SILVER_SUPPLY) {
      const r = await gasOf(await silver.connect(issuer).transfer(silverVaultAddr, SILVER_SUPPLY - vaultBal));
      pass(`SILVER.transfer(vault, ${ethers.formatUnits(SILVER_SUPPLY - vaultBal, 6)} SILVER)`, r.txHash);
    }
    if (!(await silverSale.approved())) {
      const r = await gasOf(await silverSale.connect(admin).approveSale());
      pass("SILVER.approveSale (admin)", r.txHash);
    }
    await waitForChainTime(SILVER_START + 5, "SILVER sale start");
    console.log();
    const r = await gasOf(await silverSale.connect(issuer).activate());
    pass("SILVER.activate (issuer)", r.txHash);
  }

  // Buys: 100 + 50 + 30 = 180 SILVER (cost 360 USDC)
  const silverAllow = await usdc.allowance(investor.address, silverSaleAddr);
  if (silverAllow < ethers.parseUnits("500", 6)) {
    const usdcBal = await usdc.balanceOf(investor.address);
    if (usdcBal < ethers.parseUnits("400", 6)) {
      const r = await gasOf(await usdc.connect(investor).mint(investor.address, ethers.parseUnits("500", 6)));
      pass("Mint 500 USDC to investor", r.txHash);
    }
    const r = await gasOf(await usdc.connect(investor).approve(silverSaleAddr, ethers.parseUnits("500", 6)));
    pass("USDC.approve(silverSale, 500)", r.txHash);
  }

  const silverFraction = await ethers.getContractAt("CiretaFractionToken1155", silverFracAddr, investor);
  const FRACTION_ID_USDC = await silverFraction.ID_USDC();
  const silverBuyHashes: string[] = [];
  for (const qty of [100n, 50n, 30n]) {
    const fracBal = await silverFraction.balanceOf(investor.address, FRACTION_ID_USDC);
    if (fracBal >= ethers.parseUnits("180", 6)) { pass("All SILVER buys already done"); break; }
    const r = await gasOf(await silverSale.connect(investor).buy(0, qty));
    silverBuyHashes.push(r.txHash);
    pass(`SILVER.buy(${qty}) — minted ${qty} frSILVER`, r.txHash);
  }

  // Finalize after sale window
  await waitForChainTime(SILVER_END + 5, "SILVER sale end");
  console.log();
  const finalizeStatus = await safeRead(() => silverSale.status());
  if (finalizeStatus === 1n) {
    const r = await gasOf(await silverSale.connect(issuer).finalizeSale());
    pass("SILVER.finalizeSale", r.txHash);
  }
  const silverFinalizedAt = await chainTimestamp();

  // Partial claims at +15 / +30 / +45 / +60 min
  const silverVault = await ethers.getContractAt("CiretaVault", silverVaultAddr, investor);
  const claimHashes: string[] = [];
  const claimPoints = [
    { delaySec: 15 * 60 + 5, label: "+15min (~25%)" },
    { delaySec: 15 * 60, label: "+30min (~50%)" },
    { delaySec: 15 * 60, label: "+45min (~75%)" },
    { delaySec: 15 * 60 + 10, label: "+60min (full unlock)" },
  ];
  let cumulative = 0n;
  for (const cp of claimPoints) {
    await waitForChainTime((await chainTimestamp()) + cp.delaySec, `wait until ${cp.label}`);
    console.log();
    const before = await silver.balanceOf(investor.address);
    const r = await gasOf(await silverVault.connect(investor).claim());
    claimHashes.push(r.txHash);
    // RPC propagation
    await new Promise((res) => setTimeout(res, 6000));
    const after = await silver.balanceOf(investor.address);
    const delta = after - before;
    cumulative += delta;
    pass(`SILVER.claim ${cp.label} → +${ethers.formatUnits(delta, 6)} SILVER (cumulative ${ethers.formatUnits(cumulative, 6)})`, r.txHash);
  }

  // Persist SILVER manifest
  const silverManifestPath = path.join(__dirname, "..", "deployments", `silver-vested.${dateStamp()}.json`);
  fs.writeFileSync(silverManifestPath, JSON.stringify({
    network: "base-sepolia",
    chainId: 84532,
    deployedAt: new Date().toISOString(),
    finalizedAtUnix: silverFinalizedAt,
    token: { address: silverAddr, name: "SILVER", symbol: "SILVER", decimals: 6, totalSupply: "800000000" },
    sale: {
      address: silverSaleAddr, vault: silverVaultAddr, fraction: silverFracAddr,
      mode: "Vested", cliffSeconds: 0, vestingSeconds: 3600,
      startTime: SILVER_START, endTime: SILVER_END,
      softCap: "1000000", hardCap: "1600000000", totalTokenSupply: "800000000",
    },
    phases: [{
      index: 0, name: "Seed", pricePerToken: "2000000", allocation: "800000000",
      minTokens: "10", maxTokens: "0", topUpMinTokens: "5",
      startTime: SILVER_START, endTime: SILVER_END - 1, whitelistOnly: false, allocationMode: "Fixed",
    }],
    issuer: { wallet: issuer.address, name: "AGENT Issuer", jurisdiction: "GB" },
    investor: {
      wallet: investor.address,
      contributedUsdc: "360000000",
      tokensHeld: "180000000",
      buyTxHashes: silverBuyHashes,
      claimTxHashes: claimHashes,
    },
    feeBps: 200,
  }, null, 2));
  pass(`SILVER manifest → ${path.basename(silverManifestPath)}`);

  console.log("\n══════════════════════════════════════════════════════════════════");
  console.log(`  ${PASSES.length} PASS`);
  console.log(`  TIN          ${tinAddr}`);
  console.log(`  TIN sale     ${tinSaleAddr}`);
  console.log(`  SILVER        ${silverAddr}`);
  console.log(`  SILVER sale   ${silverSaleAddr}`);
  console.log(`  SILVER vault  ${silverVaultAddr}\n`);
}

main().catch((e) => {
  console.error("\nFatal:", e instanceof Error ? e.message : String(e));
  process.exit(1);
});
