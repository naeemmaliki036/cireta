/**
 * Continuation: existing SILVER sale at 0x7F9B0763... is Active but the script
 * died on the buy. Sale window has ~minutes left. Drive buys + finalize +
 * 4 partial claims manually, persist manifest at end.
 */

import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";
import type { TransactionReceipt } from "ethers";

const SILVER = "0x79628a858dAb322b9e8D93133c57910391B4117c";
const SALE = "0x7F9B076310b7347bE8c5D6Dac29E5F714Bad2270";
const VAULT = "0xEA945f4e4BA69065F96A2d5aEd020c763C021cF4";
const FRACTION_LOOKUP_VIA_SALE = true;
const POLL_MS = 5000;

async function gasOf(tx: any) {
  const r = (await tx.wait()) as TransactionReceipt;
  if (r.status !== 1) throw new Error(`tx reverted ${r.hash}`);
  return { gas: r.gasUsed, txHash: r.hash };
}
async function chainTs() { return (await ethers.provider.getBlock("latest"))!.timestamp; }
async function waitChain(target: number, label: string) {
  while (true) {
    const now = await chainTs();
    if (now >= target) return;
    process.stdout.write(`\r  ⏳ ${label} — chain Δ${target - now}s    `);
    await new Promise((r) => setTimeout(r, POLL_MS));
  }
}

async function main() {
  const provider = ethers.provider;
  const issuer = new ethers.Wallet(process.env.ISSUER_PRIVATE_KEY!, provider);
  const investor = new ethers.Wallet(process.env.INVESTOR_PRIVATE_KEY!, provider);

  const sale = await ethers.getContractAt("Sale", SALE, issuer);
  const silver = await ethers.getContractAt("CiretaToken", SILVER, issuer);
  const vault = await ethers.getContractAt("CiretaVault", VAULT, investor);
  const fractionAddr = await sale.fractionToken();

  const phase = await sale.getPhase(0);
  const phaseEnd = Number(phase.endTime);
  const SS = Number(phase.startTime);
  const SE = Number(await sale.saleEndTime());

  console.log("Sale", SALE, "phaseEnd", phaseEnd, "saleEnd", SE);

  // Buy if not already
  const fraction = await ethers.getContractAt("CiretaFractionToken1155", fractionAddr, investor);
  const fid = await fraction.ID_USDC();
  const fracBal = await fraction.balanceOf(investor.address, fid);
  console.log(`Investor frSILVER: ${ethers.formatUnits(fracBal, 6)}`);

  const buyHashes: string[] = [];
  if (fracBal < ethers.parseUnits("180", 6)) {
    const usdc = await ethers.getContractAt("CiretaUSDC", "0x3Bfb6B62C015EE815e5Eb0A7e212F580446D9898", investor);
    const allowance = await usdc.allowance(investor.address, SALE);
    if (allowance < ethers.parseUnits("400", 6)) {
      const r = await gasOf(await usdc.connect(investor).approve(SALE, ethers.parseUnits("500", 6)));
      console.log("  ✓ USDC.approve");
    }
    for (const qty of [100n, 50n, 30n]) {
      const now = await chainTs();
      if (now >= phaseEnd) {
        console.log(`  ⚠ phase ended (${now} >= ${phaseEnd}); skipping remaining buys`);
        break;
      }
      const r = await gasOf(await sale.connect(investor).buy(0, qty));
      buyHashes.push(r.txHash);
      console.log(`  ✓ buy(${qty}) → ${r.txHash}`);
    }
  } else {
    console.log("  ✓ already holds 180 frSILVER");
  }

  // Wait for sale end + finalize
  await waitChain(SE + 5, "sale end");
  console.log();
  const status = await sale.status();
  if (status === 1n) {
    const r = await gasOf(await sale.connect(issuer).finalizeSale());
    console.log(`  ✓ finalizeSale → ${r.txHash}`);
  } else {
    console.log(`  ✓ already past Active (status=${status})`);
  }
  const finalizedAt = await chainTs();

  // 4 partial claims at +15/+30/+45/+60min
  const claimHashes: string[] = [];
  let cumulative = 0n;
  for (const cp of [
    { delay: 15 * 60 + 5, label: "+15min (~25%)" },
    { delay: 15 * 60, label: "+30min (~50%)" },
    { delay: 15 * 60, label: "+45min (~75%)" },
    { delay: 15 * 60 + 10, label: "+60min (full)" },
  ]) {
    await waitChain((await chainTs()) + cp.delay, cp.label);
    console.log();
    const before = await silver.balanceOf(investor.address);
    const r = await gasOf(await vault.connect(investor).claim());
    claimHashes.push(r.txHash);
    await new Promise((r) => setTimeout(r, 6000));
    const after = await silver.balanceOf(investor.address);
    cumulative += (after - before);
    console.log(`  ✓ ${cp.label} +${ethers.formatUnits(after - before, 6)} (cum ${ethers.formatUnits(cumulative, 6)})`);
  }

  // Persist
  const dateStamp = (() => {
    const d = new Date();
    return `${d.getUTCFullYear()}${String(d.getUTCMonth()+1).padStart(2,"0")}${String(d.getUTCDate()).padStart(2,"0")}-${String(d.getUTCHours()).padStart(2,"0")}${String(d.getUTCMinutes()).padStart(2,"0")}`;
  })();
  const p = path.join(__dirname, "..", "deployments", `silver-vested.${dateStamp}.json`);
  fs.writeFileSync(p, JSON.stringify({
    network: "base-sepolia",
    chainId: 84532,
    deployedAt: new Date().toISOString(),
    finalizedAtUnix: finalizedAt,
    token: { address: SILVER, name: "SILVER", symbol: "SILVER", decimals: 6, totalSupply: "800000000" },
    sale: {
      address: SALE, vault: VAULT, fraction: fractionAddr,
      mode: "Vested", cliffSeconds: 0, vestingSeconds: 3600,
      startTime: SS, endTime: SE,
      softCap: "1000000", hardCap: "1600000000", totalTokenSupply: "800000000",
    },
    phases: [{
      index: 0, name: "Seed", pricePerToken: "2000000", allocation: "800000000",
      minTokens: "10", maxTokens: "0", topUpMinTokens: "5",
      startTime: SS, endTime: SE - 1, whitelistOnly: false, allocationMode: "Fixed",
    }],
    issuer: { wallet: issuer.address, name: "AGENT Issuer", jurisdiction: "GB" },
    investor: {
      wallet: investor.address,
      contributedUsdc: "360000000",
      tokensHeld: "180000000",
      buyTxHashes: buyHashes,
      claimTxHashes: claimHashes,
    },
    feeBps: 200,
  }, null, 2));
  console.log(`\n  ✓ Manifest → ${path.basename(p)}`);
}

main().catch((e) => { console.error("\nFatal:", e instanceof Error ? e.message : String(e)); process.exit(1); });
