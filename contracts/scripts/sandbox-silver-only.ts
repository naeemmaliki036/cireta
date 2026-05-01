/**
 * Tight SILVER-only sandbox flow — no TIN, no resume logic, fresh token.
 *
 * Deploys a NEW SILVER token (fresh 800-supply mint to issuer), new
 * Vested-linear sale (cliff=0, vesting=3600s), runs the buy flow + 4
 * partial vault claims at +15/+30/+45/+60 min.
 *
 * Total wall-clock: ~70 min.
 */

import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";
import type { TransactionReceipt } from "ethers";

const POLL_MS = 5000;

async function safeRead<T>(fn: () => Promise<T>, retries = 6): Promise<T> {
  for (let i = 0; i < retries; i++) {
    try { return await fn(); }
    catch (e: any) {
      if (i === retries - 1) throw e;
      const m = String(e?.message || e);
      if (!m.includes("decode") && !m.includes("BAD_DATA") && !m.includes("CALL_EXCEPTION")) throw e;
      await new Promise((r) => setTimeout(r, 4000));
    }
  }
  throw new Error("safeRead exhausted");
}

async function gasOf(tx: any) {
  const r = (await tx.wait()) as TransactionReceipt;
  if (r.status !== 1) throw new Error(`tx reverted ${r.hash}`);
  return { gas: r.gasUsed, txHash: r.hash };
}

async function chainTs() {
  const b = await ethers.provider.getBlock("latest");
  return b!.timestamp;
}

async function waitChain(target: number, label: string) {
  while (true) {
    const now = await chainTs();
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

  const v2 = JSON.parse(fs.readFileSync(
    path.join(__dirname, "..", "deployments", "base-sepolia.v2.20260430.json"), "utf-8"
  )) as Record<string, string>;

  const tokenFactory = await ethers.getContractAt("CiretaTokenFactory", v2.tokenFactory!, issuer);
  const saleFactory = await ethers.getContractAt("CiretaSaleFactory", v2.saleFactory!, issuer);
  const usdc = await ethers.getContractAt("CiretaUSDC", v2.ciretaUSDC!, investor);

  const tokenIface = (await ethers.getContractFactory("CiretaTokenFactory")).interface;
  const saleIface = (await ethers.getContractFactory("CiretaSaleFactory")).interface;
  const tdTopic = tokenIface.getEvent("TokenDeployed").topicHash;
  const sdTopic = saleIface.getEvent("SaleDeployed").topicHash;

  console.log("\n  SILVER-only — Vested linear (cliff=0, vesting=3600s, 800 supply)\n");

  const SUPPLY = ethers.parseUnits("800", 6);

  // 1. Deploy fresh SILVER token
  console.log("  Deploy SILVER token…");
  const t = await tokenFactory.connect(issuer).deployToken(
    "SILVER", "SILVER", 6, issuer.address, v2.simpleIdentityRegistry!,
    SUPPLY, true, SUPPLY
  );
  const tr = (await t.wait()) as TransactionReceipt;
  const log = tr.logs.find((l) => l.topics[0] === tdTopic)!;
  const silverAddr = tokenIface.parseLog({ topics: [...log.topics], data: log.data })!.args[0] as string;
  const silver = await ethers.getContractAt("CiretaToken", silverAddr, issuer);
  console.log(`  ✓ SILVER @ ${silverAddr}`);

  // 2. Deploy fresh SILVER sale
  const blk = await provider.getBlock("latest");
  const SS = blk!.timestamp + 90;
  const SE = SS + 10 * 60;  // 10-min window to absorb retry latency on flaky buy
  const initSig = new ethers.Interface([
    "function initialize(address,address,address,address,address,address,uint256,uint256,uint256,uint256,address,uint256,uint256,uint256)",
  ]);
  const init = initSig.encodeFunctionData("initialize", [
    silverAddr, v2.ciretaUSDC!, v2.simpleIdentityRegistry!,
    issuer.address, v2.saleFactory!, v2.platformFeeManager!,
    ethers.parseUnits("1", 6), ethers.parseUnits("1600", 6),
    200n, ethers.parseUnits("50000", 6),
    ethers.ZeroAddress, SS, SE, SUPPLY,
  ]);
  const ds = await saleFactory.connect(issuer).deploySaleVested(
    silverAddr, init, "frSILVER", "frSILVER", 6,
    v2.simpleIdentityRegistry!, 0n, 3600n, 0
  );
  const dsr = (await ds.wait()) as TransactionReceipt;
  const sLog = dsr.logs.find((l) => l.topics[0] === sdTopic && l.address.toLowerCase() === v2.saleFactory!.toLowerCase())!;
  const saleAddr = saleIface.parseLog({ topics: [...sLog.topics], data: sLog.data })!.args[1] as string;
  const sale = await ethers.getContractAt("Sale", saleAddr, issuer);
  const vaultAddr = await safeRead(() => sale.vault());
  const fracAddr = await safeRead(() => sale.fractionToken());
  console.log(`  ✓ Sale @ ${saleAddr}\n  ✓ Vault @ ${vaultAddr}`);

  // 3. Add phase, deposit, approve, activate
  console.log("  addPhase + deposit + approve + activate…");
  await gasOf(await sale.connect(issuer).addPhase(
    "Seed", ethers.parseUnits("2", 6), SUPPLY,
    10n, 0n, 5n, SS, SE - 1, false, 0
  ));
  await gasOf(await silver.connect(issuer).transfer(vaultAddr, SUPPLY));
  await gasOf(await sale.connect(admin).approveSale());
  await waitChain(SS + 5, "sale start");
  console.log();
  await gasOf(await sale.connect(issuer).activate());
  console.log("  ✓ SILVER sale Active");

  // 4. Buy 100 + 50 + 30 = 180
  const usdcBal = await usdc.balanceOf(investor.address);
  if (usdcBal < ethers.parseUnits("400", 6)) {
    await gasOf(await usdc.connect(investor).mint(investor.address, ethers.parseUnits("500", 6)));
  }
  await gasOf(await usdc.connect(investor).approve(saleAddr, ethers.parseUnits("500", 6)));
  const buyHashes: string[] = [];
  // Buy with retry — first buy after activate sometimes reverts in
  // gas estimation due to RPC propagation lag. Up to 5 retries × 15s.
  async function buyWithRetry(qty: bigint) {
    for (let attempt = 1; attempt <= 5; attempt++) {
      try {
        const r = await gasOf(await sale.connect(investor).buy(0, qty));
        buyHashes.push(r.txHash);
        console.log(`  ✓ buy(${qty}) → ${r.txHash}` + (attempt > 1 ? ` (attempt ${attempt})` : ""));
        return;
      } catch (e: any) {
        const msg = String(e?.message || e);
        if (attempt === 5 || !msg.includes("execution reverted")) throw e;
        console.log(`  buy(${qty}) attempt ${attempt} reverted, waiting 15s before retry…`);
        await new Promise((r) => setTimeout(r, 15000));
      }
    }
  }
  for (const qty of [100n, 50n, 30n]) await buyWithRetry(qty);

  // 5. Wait sale end + finalize
  await waitChain(SE + 5, "sale end");
  console.log();
  await gasOf(await sale.connect(issuer).finalizeSale());
  const finalizedAt = await chainTs();
  console.log("  ✓ finalized — vesting clock starts now\n");

  // 6. 4 partial claims
  const vault = await ethers.getContractAt("CiretaVault", vaultAddr, investor);
  const claimHashes: string[] = [];
  let cumulative = 0n;
  for (const cp of [
    { delay: 15 * 60 + 5, label: "+15min (~25%)" },
    { delay: 15 * 60, label: "+30min (~50%)" },
    { delay: 15 * 60, label: "+45min (~75%)" },
    { delay: 15 * 60 + 10, label: "+60min (full)" },
  ]) {
    await waitChain((await chainTs()) + cp.delay, `wait ${cp.label}`);
    console.log();
    const before = await silver.balanceOf(investor.address);
    const r = await gasOf(await vault.connect(investor).claim());
    claimHashes.push(r.txHash);
    await new Promise((res) => setTimeout(res, 6000));
    const after = await silver.balanceOf(investor.address);
    cumulative += (after - before);
    console.log(`  ✓ ${cp.label} +${ethers.formatUnits(after - before, 6)} (cum ${ethers.formatUnits(cumulative, 6)})`);
  }

  // 7. Persist manifest
  const manifestPath = path.join(__dirname, "..", "deployments", `silver-vested.${dateStamp()}.json`);
  fs.writeFileSync(manifestPath, JSON.stringify({
    network: "base-sepolia",
    chainId: 84532,
    deployedAt: new Date().toISOString(),
    finalizedAtUnix: finalizedAt,
    token: { address: silverAddr, name: "SILVER", symbol: "SILVER", decimals: 6, totalSupply: "800000000" },
    sale: {
      address: saleAddr, vault: vaultAddr, fraction: fracAddr,
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
  console.log(`\n  ✓ Manifest → ${path.basename(manifestPath)}`);
  console.log(`\n  SILVER ${silverAddr}\n  Sale  ${saleAddr}\n  Vault ${vaultAddr}\n`);
}

main().catch((e) => {
  console.error("\nFatal:", e instanceof Error ? e.message : String(e));
  process.exit(1);
});
