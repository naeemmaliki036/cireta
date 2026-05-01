/**
 * Continuation script — picks up the AGENT sale that's already deployed and
 * activated on Base Sepolia and finishes the flow:
 *   - 3 investor buys (100 + 200 + 50)
 *   - wait for sale end (poll chain timestamp, not local)
 *   - finalize
 *   - wait 300s for lockup
 *   - claim
 *   - write manifest
 *
 * The first sandbox run got past activate but the buy reverted because my
 * local-time wait completed before the chain timestamp passed phase.startTime.
 * This script polls block.timestamp directly so that race can't happen again.
 */

import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";
import type { TransactionReceipt } from "ethers";

const TOKEN_ADDR = "0xAc55eBBefc0277eb217Bd6d5bAC89b59361b0337";
const SALE_FACTORY = "0xFfC765aB999CF3D718Aa81869DE3D32Ff3E0d2d9";
const POLL_MS = 4000;

async function chainTimestamp() {
  const b = await ethers.provider.getBlock("latest");
  return b!.timestamp;
}

async function waitForChainTime(target: number, label: string) {
  while (true) {
    const now = await chainTimestamp();
    if (now >= target) return;
    const remaining = target - now;
    process.stdout.write(`\r  ⏳ ${label} — chain Δ${remaining}s   `);
    await new Promise((r) => setTimeout(r, POLL_MS));
  }
}

async function gasOf(tx: any) {
  const r = (await tx.wait()) as TransactionReceipt;
  if (r.status !== 1) throw new Error(`tx reverted ${r.hash}`);
  return { gas: r.gasUsed, txHash: r.hash };
}

async function main() {
  const provider = ethers.provider;
  const investor = new ethers.Wallet(process.env.INVESTOR_PRIVATE_KEY!, provider);
  const issuer = new ethers.Wallet(process.env.ISSUER_PRIVATE_KEY!, provider);

  console.log("\n╔══════════════════════════════════════════════════════════════════╗");
  console.log("║   CONTINUE — AGENT sale buy/finalize/claim                       ║");
  console.log("╚══════════════════════════════════════════════════════════════════╝\n");

  // Resolve the sale via the factory (most recent for AGENT)
  const factory = await ethers.getContractAt("CiretaSaleFactory", SALE_FACTORY, investor);
  const sales = (await factory.getSalesForToken(TOKEN_ADDR)) as string[];
  const saleAddr = sales[sales.length - 1]!;
  const sale = await ethers.getContractAt("Sale", saleAddr, investor);
  const vaultAddr = await sale.vault();
  const fractionAddr = await sale.fractionToken();
  const vault = await ethers.getContractAt("CiretaVault", vaultAddr, investor);
  const agent = await ethers.getContractAt("CiretaToken", TOKEN_ADDR, investor);

  console.log(`  sale=${saleAddr}`);
  console.log(`  vault=${vaultAddr}`);
  console.log(`  fraction=${fractionAddr}\n`);

  const status = await sale.status();
  if (status !== 1n) {
    throw new Error(`Sale not Active (status=${status}); cannot continue`);
  }
  const phase0 = await sale.getPhase(0);
  const phaseStart = Number(phase0.startTime);
  const phaseEnd = Number(phase0.endTime);
  const saleEnd = Number(await sale.saleEndTime());
  console.log(`  phase 0: start=${phaseStart} end=${phaseEnd}  saleEnd=${saleEnd}`);
  const now = await chainTimestamp();
  console.log(`  chain time: ${now} (Δ from phaseStart: ${now - phaseStart}s)\n`);

  // ── Step A: ensure chain time has passed phase start ──
  if (now < phaseStart) {
    await waitForChainTime(phaseStart + 2, "waiting past phase.startTime");
  } else {
    console.log("  ✓ phase already started\n");
  }

  // ── Step B: 3 buys ──
  const usdc = await ethers.getContractAt("CiretaUSDC", "0x3Bfb6B62C015EE815e5Eb0A7e212F580446D9898", investor);
  const usdcAllowance = await usdc.allowance(investor.address, saleAddr);
  if (usdcAllowance < ethers.parseUnits("1000", 6)) {
    const r = await gasOf(await usdc.connect(investor).approve(saleAddr, ethers.parseUnits("1000", 6)));
    console.log(`  [PASS] USDC.approve(sale, 1000)  gas=${r.gas}`);
  } else {
    console.log("  ✓ USDC allowance already sufficient");
  }

  const buyTxHashes: string[] = [];
  for (const qty of [100n, 200n, 50n]) {
    // Skip if cumulative is already there (idempotency for retries)
    const fraction = await ethers.getContractAt("CiretaFractionToken1155", fractionAddr, investor);
    const ID_USDC = await fraction.ID_USDC();
    const fracBal = await fraction.balanceOf(investor.address, ID_USDC);
    const expectedAfter = (Number(fracBal) / 1e6) + Number(qty);
    if (Number(fracBal) >= 350e6) {
      console.log("  ✓ All buys already done (350+ frAGENT held)");
      break;
    }
    const r = await gasOf(await sale.connect(investor).buy(0, qty));
    buyTxHashes.push(r.txHash);
    console.log(`  [PASS] Sale.buy(0, ${qty})  gas=${r.gas}  → ${expectedAfter} frAGENT total`);
    console.log(`         tx: https://sepolia.basescan.org/tx/${r.txHash}`);
  }

  const fraction = await ethers.getContractAt("CiretaFractionToken1155", fractionAddr, investor);
  const ID_USDC = await fraction.ID_USDC();
  const fracBal = await fraction.balanceOf(investor.address, ID_USDC);
  console.log(`  ✓ frAGENT balance: ${fracBal} raw\n`);

  // ── Step C: wait for sale end + finalize ──
  await waitForChainTime(saleEnd + 5, "waiting for sale end");
  console.log();
  const r1 = await gasOf(await sale.connect(issuer).finalizeSale());
  console.log(`  [PASS] Sale.finalizeSale  gas=${r1.gas}`);
  console.log(`         tx: https://sepolia.basescan.org/tx/${r1.txHash}\n`);

  // ── Step D: wait 5min lockup ──
  const finalizeTime = await chainTimestamp();
  const lockupEnd = finalizeTime + 305;
  console.log(`  finalize time: ${finalizeTime}, lockup ends: ${lockupEnd}`);
  await waitForChainTime(lockupEnd, "waiting for vault lockup");
  console.log();

  // ── Step E: claim ──
  const r2 = await gasOf(await vault.connect(investor).claim());
  console.log(`  [PASS] Vault.claim  gas=${r2.gas}`);
  console.log(`         tx: https://sepolia.basescan.org/tx/${r2.txHash}\n`);

  const finalAgentBal = await agent.balanceOf(investor.address);
  console.log(`  ✓ Investor AGENT balance: ${finalAgentBal} raw (expected 350000000)`);
  if (finalAgentBal !== ethers.parseUnits("350", 6)) {
    throw new Error(`Final balance mismatch: ${finalAgentBal}`);
  }

  // ── Persist manifest ──
  const dateStamp = (() => {
    const d = new Date();
    return `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}${String(d.getUTCDate()).padStart(2, "0")}-${String(d.getUTCHours()).padStart(2, "0")}${String(d.getUTCMinutes()).padStart(2, "0")}`;
  })();
  const MANIFEST_PATH = path.join(__dirname, "..", "deployments", `agent-sale.${dateStamp}.json`);

  // Reconstruct issuer & fee data
  const ir = await ethers.getContractAt("IssuerRegistry", "0x601D0DC8025CEA6B89E922E38f2Af0CCC61bBEDa", issuer);
  const issuerInfo = await ir.getIssuer(issuer.address);

  const manifest = {
    network: "base-sepolia",
    chainId: 84532,
    deployedAt: new Date().toISOString(),
    token: { address: TOKEN_ADDR, name: "AGENT", symbol: "AGENT", decimals: 6, totalSupply: ethers.parseUnits("1000", 6).toString() },
    sale: {
      address: saleAddr,
      vault: vaultAddr,
      fraction: fractionAddr,
      mode: "Vested",
      cliffSeconds: 300,
      vestingSeconds: 300,
      startTime: phaseStart,
      endTime: phaseEnd + 1,  // sale end ≈ phase end
      softCap: "1000000",
      hardCap: "1000000000",
      totalTokenSupply: ethers.parseUnits("1000", 6).toString(),
    },
    phases: [{
      index: 0,
      name: phase0.name,
      pricePerToken: phase0.pricePerToken.toString(),
      allocation: phase0.allocation.toString(),
      minTokens: phase0.minTokens.toString(),
      maxTokens: phase0.maxTokens.toString(),
      topUpMinTokens: phase0.topUpMinTokens.toString(),
      startTime: phaseStart,
      endTime: phaseEnd,
      whitelistOnly: phase0.whitelistOnly,
      allocationMode: "Fixed",
    }],
    issuer: { wallet: issuer.address, name: issuerInfo.name, jurisdiction: issuerInfo.jurisdiction },
    investor: { wallet: investor.address, contributedUsdc: "350000000", tokensHeld: "350000000", buyTxHashes },
    feeBps: 200,
  };

  fs.mkdirSync(path.dirname(MANIFEST_PATH), { recursive: true });
  fs.writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2));
  console.log(`\n  ✓ Manifest written: ${MANIFEST_PATH}`);
  console.log("\n  All done — run sandbox-seed-agent-db.py next.\n");
}

main().catch((e) => {
  console.error("\nFatal:", e instanceof Error ? e.message : String(e));
  process.exit(1);
});
