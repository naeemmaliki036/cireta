/**
 * Deploys 3 vested sales on Base Sepolia for portfolio-claim UI testing.
 *
 * LOCK20  — cliff=20d  vesting=0  (100% unlocks 20 days post-finalize)
 * VEST5   — cliff=30m  vesting=5d (linear; full unlock 5 days post-finalize)
 * LOCK5   — cliff=5min vesting=0  (100% unlocks 5 min post-finalize)
 *
 * All: 1000-token supply, 1 USDC/token, 5-min sale window, single Seed phase.
 * Investor buys the full 1000 tokens. Script stops after finalize — NO claim.
 *
 * Resume support via env vars (set to skip re-deploy):
 *   EXISTING_LOCK20_TOKEN, EXISTING_LOCK20_SALE
 *   EXISTING_VEST5_TOKEN,  EXISTING_VEST5_SALE
 *   EXISTING_LOCK5_TOKEN,  EXISTING_LOCK5_SALE
 *
 * Total wall-clock: ~20 min (3 × ~7 min each).
 *
 * IMPORTANT: buy() takes whole tokens (not raw). 1000 whole tokens at 1 USDC each
 * = 1000 USDC cost. pricePerToken in addPhase is in USDC raw (6 dec).
 */

import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";
import type { TransactionReceipt } from "ethers";

// ── helpers ──────────────────────────────────────────────────────────────────

const POLL_MS = 5000;
const PASSES: string[] = [];

function pass(msg: string, txHash?: string) {
  PASSES.push(msg);
  const tx = txHash ? `\n         tx: https://sepolia.basescan.org/tx/${txHash}` : "";
  console.log(`  [PASS] ${msg}${tx}`);
}

function header(s: string) {
  console.log(`\n─ ${s} ─`);
}

async function gasOf(tx: any): Promise<{ gas: bigint; txHash: string }> {
  const r = (await tx.wait()) as TransactionReceipt;
  if (r.status !== 1) throw new Error(`tx reverted ${r.hash}`);
  return { gas: r.gasUsed, txHash: r.hash };
}

async function chainTimestamp(): Promise<number> {
  const b = await ethers.provider.getBlock("latest");
  return b!.timestamp;
}

async function safeRead<T>(fn: () => Promise<T>, retries = 8): Promise<T> {
  for (let i = 0; i < retries; i++) {
    try { return await fn(); }
    catch (e: any) {
      if (i === retries - 1) throw e;
      const msg = String(e?.message || e);
      if (
        !msg.includes("could not decode") &&
        !msg.includes("BAD_DATA") &&
        !msg.includes("CALL_EXCEPTION") &&
        !msg.includes("decode")
      ) throw e;
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
  return (
    `${d.getUTCFullYear()}` +
    `${String(d.getUTCMonth() + 1).padStart(2, "0")}` +
    `${String(d.getUTCDate()).padStart(2, "0")}` +
    `-${String(d.getUTCHours()).padStart(2, "0")}` +
    `${String(d.getUTCMinutes()).padStart(2, "0")}`
  );
}

// ── sale spec ─────────────────────────────────────────────────────────────────

interface SaleSpec {
  tokenName: string;
  tokenSymbol: string;
  supplyRaw: bigint;       // raw (6 decimals): 1000 tokens = 1000_000_000
  supplyWhole: bigint;     // whole tokens:     1000 tokens = 1000
  priceUsdcRaw: bigint;    // raw (6 decimals): 1 USDC = 1_000_000
  cliffSeconds: bigint;
  vestingSeconds: bigint;  // TOTAL vesting duration. 0 = cliff-only
  saleDurationSeconds: number;
  existingTokenEnv: string;
  existingSaleEnv: string;
}

const SPECS: SaleSpec[] = [
  {
    tokenName:          "Locked 20 Days Test",
    tokenSymbol:        "LOCK20",
    supplyRaw:          ethers.parseUnits("1000", 6),   // 1_000_000_000
    supplyWhole:        1000n,
    priceUsdcRaw:       ethers.parseUnits("1", 6),      // 1_000_000
    cliffSeconds:       BigInt(20 * 24 * 3600),          // 1_728_000
    vestingSeconds:     0n,                               // cliff-only
    saleDurationSeconds: 5 * 60,
    existingTokenEnv:   "EXISTING_LOCK20_TOKEN",
    existingSaleEnv:    "EXISTING_LOCK20_SALE",
  },
  {
    tokenName:          "Vested 5 Days Test",
    tokenSymbol:        "VEST5",
    supplyRaw:          ethers.parseUnits("1000", 6),
    supplyWhole:        1000n,
    priceUsdcRaw:       ethers.parseUnits("1", 6),
    cliffSeconds:       BigInt(30 * 60),                  // 1_800 s (30 min)
    vestingSeconds:     BigInt(5 * 24 * 3600),            // 432_000 s (5 days)
    saleDurationSeconds: 5 * 60,
    existingTokenEnv:   "EXISTING_VEST5_TOKEN",
    existingSaleEnv:    "EXISTING_VEST5_SALE",
  },
  {
    tokenName:          "Locked 5 Minutes Test",
    tokenSymbol:        "LOCK5",
    supplyRaw:          ethers.parseUnits("1000", 6),
    supplyWhole:        1000n,
    priceUsdcRaw:       ethers.parseUnits("1", 6),
    cliffSeconds:       BigInt(5 * 60),                   // 300 s
    vestingSeconds:     0n,                               // cliff-only
    saleDurationSeconds: 5 * 60,
    existingTokenEnv:   "EXISTING_LOCK5_TOKEN",
    existingSaleEnv:    "EXISTING_LOCK5_SALE",
  },
];

// ── per-sale deploy function ───────────────────────────────────────────────────

interface SaleResult {
  spec: SaleSpec;
  tokenAddr: string;
  saleAddr: string;
  vaultAddr: string;
  fracAddr: string;
  saleStart: number;
  saleEnd: number;
  finalizedAtUnix: number;
  buyTxHashes: string[];
  finalizeTxHash: string;
  contributedUsdcWhole: string;   // human readable, e.g. "1000.0"
}

async function deploySale(
  spec: SaleSpec,
  admin: ethers.Wallet,
  issuer: ethers.Wallet,
  investor: ethers.Wallet,
  v2: Record<string, string>,
  tokenFactory: ethers.Contract,
  saleFactory: ethers.Contract,
  usdc: ethers.Contract,
  tokenFactoryIface: ethers.Interface,
  saleFactoryIface: ethers.Interface,
): Promise<SaleResult> {
  const tokenDeployedTopic = tokenFactoryIface.getEvent("TokenDeployed").topicHash;
  const saleDeployedTopic  = saleFactoryIface.getEvent("SaleDeployed").topicHash;
  const saleInitIface = new ethers.Interface([
    "function initialize(address,address,address,address,address,address,uint256,uint256,uint256,uint256,address,uint256,uint256,uint256)",
  ]);

  header(`${spec.tokenSymbol} — ${spec.tokenName}`);
  console.log(`  cliff=${spec.cliffSeconds}s  vesting=${spec.vestingSeconds}s  supply=${spec.supplyWhole} whole tokens`);

  // ── 1. Deploy token (or resume) ────────────────────────────────────────
  let tokenAddr = process.env[spec.existingTokenEnv] ?? "";
  if (!tokenAddr) {
    const tt = await tokenFactory.connect(issuer).deployToken(
      spec.tokenSymbol, spec.tokenSymbol, 6,
      issuer.address, v2.simpleIdentityRegistry!,
      spec.supplyRaw, true, spec.supplyRaw,
    );
    const tr = (await tt.wait()) as TransactionReceipt;
    const tlog = tr.logs.find((l) => l.topics[0] === tokenDeployedTopic)!;
    tokenAddr = tokenFactoryIface.parseLog({ topics: [...tlog.topics], data: tlog.data })!.args[0] as string;
    pass(`${spec.tokenSymbol} token @ ${tokenAddr}`, tr.hash);
  } else {
    pass(`${spec.tokenSymbol} resuming with existing token @ ${tokenAddr}`);
  }
  const token = await ethers.getContractAt("CiretaToken", tokenAddr, issuer);

  // ── 2. Deploy vested sale (or resume) ─────────────────────────────────
  let saleAddr = process.env[spec.existingSaleEnv] ?? "";
  let saleStart = 0;
  let saleEnd   = 0;

  if (!saleAddr) {
    const blk = await ethers.provider.getBlock("latest");
    saleStart = blk!.timestamp + 90;  // 90s buffer before sale opens
    saleEnd   = saleStart + spec.saleDurationSeconds;

    // hardCap in USDC raw = supplyWhole * priceUsdcRaw
    // (1000 tokens * 1_000_000 USDC_raw/token = 1_000_000_000 USDC raw = 1000 USDC)
    const hardCapUsdc = spec.supplyWhole * spec.priceUsdcRaw;

    const initData = saleInitIface.encodeFunctionData("initialize", [
      tokenAddr, v2.ciretaUSDC!, v2.simpleIdentityRegistry!,
      issuer.address, v2.saleFactory!, v2.platformFeeManager!,
      spec.priceUsdcRaw,      // pricePerToken (USDC raw 6 dec)
      hardCapUsdc,            // hardCap (USDC raw)
      200n,                   // feeBps
      ethers.parseUnits("50000", 6),  // fee cap
      ethers.ZeroAddress,     // OTC disabled
      saleStart, saleEnd,
      spec.supplyRaw,         // totalTokenSupply (token raw, 6 dec)
    ]);

    // effectiveVesting: if vestingSeconds=0 (cliff-only), vault needs a duration
    // for its schedule — pass cliffSeconds as the total duration.
    const effectiveVesting = spec.vestingSeconds === 0n ? spec.cliffSeconds : spec.vestingSeconds;

    const ds = await saleFactory.connect(issuer).deploySaleVested(
      tokenAddr, initData,
      `fr${spec.tokenSymbol}`, `fr${spec.tokenSymbol}`, 6,
      v2.simpleIdentityRegistry!,
      spec.cliffSeconds, effectiveVesting,
      0,   // ExcessPolicy.Keep
    );
    const dsr = (await ds.wait()) as TransactionReceipt;
    const slog = dsr.logs.find(
      (l) => l.topics[0] === saleDeployedTopic &&
             l.address.toLowerCase() === v2.saleFactory!.toLowerCase()
    )!;
    saleAddr = saleFactoryIface.parseLog({ topics: [...slog.topics], data: slog.data })!.args[1] as string;
    pass(`${spec.tokenSymbol} sale @ ${saleAddr}`, dsr.hash);
  } else {
    pass(`${spec.tokenSymbol} resuming with existing sale @ ${saleAddr}`);
  }

  const sale = await ethers.getContractAt("Sale", saleAddr, issuer);

  // Recover sale window from on-chain if resuming
  if (saleStart === 0) {
    saleStart = Number(await safeRead(() => sale.saleStartTime()));
    saleEnd   = Number(await safeRead(() => sale.saleEndTime()));
  }

  const vaultAddr = await safeRead(() => sale.vault());
  const fracAddr  = await safeRead(() => sale.fractionToken());
  pass(`${spec.tokenSymbol} vault @ ${vaultAddr}`);
  pass(`${spec.tokenSymbol} fraction @ ${fracAddr}`);

  // ── 3. Add phase (Seed, minTokens=10 whole, maxTokens=0=unlimited, topup=5) ─
  //  NOTE: addPhase allocation is compared against totalTokenSupply (raw), so pass raw.
  //        minTokens / maxTokens / topUpMinTokens are in WHOLE tokens.
  const phaseCount = await safeRead(() => sale.getPhaseCount());
  if (phaseCount === 0n) {
    const r3 = await gasOf(await sale.connect(issuer).addPhase(
      "Seed",
      spec.priceUsdcRaw,   // pricePerToken (USDC raw, 6 dec)
      spec.supplyRaw,      // allocation (token raw, 6 dec) — full supply
      10n,                 // minTokens (whole tokens)
      0n,                  // maxTokens = 0 means unlimited
      5n,                  // topUpMinTokens (whole tokens)
      saleStart, saleEnd - 1,
      false,               // whitelistOnly
      0,                   // AllocationMode.Fixed
    ));
    pass(`${spec.tokenSymbol}.addPhase Seed`, r3.txHash);
  } else {
    pass(`${spec.tokenSymbol} phase 0 already added`);
  }

  // ── 4. Transfer tokens to vault ────────────────────────────────────────
  const vaultBal = await token.balanceOf(vaultAddr);
  if (vaultBal < spec.supplyRaw) {
    const toTransfer = spec.supplyRaw - vaultBal;
    const r4 = await gasOf(await token.connect(issuer).transfer(vaultAddr, toTransfer));
    pass(`${spec.tokenSymbol}.transfer(vault, ${ethers.formatUnits(toTransfer, 6)})`, r4.txHash);
  } else {
    pass(`${spec.tokenSymbol} vault already funded`);
  }

  // ── 5. Admin approve ───────────────────────────────────────────────────
  const alreadyApproved = await safeRead(() => sale.approved());
  if (!alreadyApproved) {
    const r5 = await gasOf(await sale.connect(admin).approveSale());
    pass(`${spec.tokenSymbol}.approveSale (admin)`, r5.txHash);
  } else {
    pass(`${spec.tokenSymbol} already approved`);
  }

  // ── 6. Wait for sale start + activate ─────────────────────────────────
  const saleStatus = await safeRead(() => sale.status());
  if (saleStatus === 0n) {
    await waitForChainTime(saleStart + 5, `${spec.tokenSymbol} sale start`);
    console.log();
    const r6 = await gasOf(await sale.connect(issuer).activate());
    pass(`${spec.tokenSymbol}.activate (issuer)`, r6.txHash);
  } else {
    pass(`${spec.tokenSymbol} already activated (status=${saleStatus})`);
  }

  // ── 7. Ensure investor has USDC and has approved ─────────────────────
  // Cost = supplyWhole whole tokens * priceUsdcRaw = 1000 * 1_000_000 = 1_000_000_000 USDC raw = 1000 USDC
  const usdcCost = spec.supplyWhole * spec.priceUsdcRaw;
  const usdcBal = await usdc.balanceOf(investor.address);
  if (usdcBal < usdcCost) {
    const mintAmt = usdcCost - usdcBal + ethers.parseUnits("50", 6);
    const rm = await gasOf(await usdc.connect(investor).mint(investor.address, mintAmt));
    pass(`Mint ${ethers.formatUnits(mintAmt, 6)} USDC to investor`, rm.txHash);
  }
  const allowance = await usdc.allowance(investor.address, saleAddr);
  if (allowance < usdcCost) {
    const ra = await gasOf(await usdc.connect(investor).approve(saleAddr, usdcCost));
    pass(`USDC.approve(${spec.tokenSymbol}Sale, ${ethers.formatUnits(usdcCost, 6)})`, ra.txHash);
  }

  // ── 8. Buy full allocation with retry ─────────────────────────────────
  // buy(phaseId, tokenQty) — tokenQty is WHOLE tokens (not raw)
  // Cost = tokenQty * pricePerToken (USDC raw), safeTransferFrom pulls usdcCost from investor
  const buyTxHashes: string[] = [];

  // Check if already bought (investor has fraction balance)
  const frac = await ethers.getContractAt("CiretaFractionToken1155", fracAddr, investor);
  const FRACTION_ID_USDC = await safeRead(() => frac.ID_USDC());
  const fracBal = await frac.balanceOf(investor.address, FRACTION_ID_USDC);

  if (fracBal >= spec.supplyRaw) {
    pass(`${spec.tokenSymbol} investor already holds full fraction balance — skipping buy`);
  } else {
    async function buyWithRetry(qty: bigint) {
      for (let attempt = 1; attempt <= 7; attempt++) {
        try {
          const r = await gasOf(await sale.connect(investor).buy(0, qty));
          buyTxHashes.push(r.txHash);
          pass(`${spec.tokenSymbol}.buy(${qty} whole tokens) — fraction minted`, r.txHash);
          return;
        } catch (e: any) {
          const msg = String(e?.message || e);
          if (attempt === 7 || !msg.includes("execution reverted")) throw e;
          console.log(`  ${spec.tokenSymbol}.buy attempt ${attempt} reverted — waiting 15s…`);
          await new Promise((r) => setTimeout(r, 15000));
        }
      }
    }
    await buyWithRetry(spec.supplyWhole);  // pass WHOLE tokens
  }

  // ── 9. Wait for sale end ──────────────────────────────────────────────
  await waitForChainTime(saleEnd + 5, `${spec.tokenSymbol} sale end`);
  console.log();

  // ── 10. Finalize ───────────────────────────────────────────────────────
  const statusBeforeFinalize = await safeRead(() => sale.status());
  let finalizeTxHash = "";
  let finalizedAtUnix = 0;

  if (statusBeforeFinalize >= 3n) {
    pass(`${spec.tokenSymbol} already finalized (status=${statusBeforeFinalize})`);
    finalizedAtUnix = await chainTimestamp();
    finalizeTxHash  = "ALREADY_FINALIZED";
  } else if (statusBeforeFinalize !== 1n) {
    throw new Error(`${spec.tokenSymbol} unexpected status before finalize: ${statusBeforeFinalize}`);
  } else {
    const rfin = await gasOf(await sale.connect(admin).finalizeSale());
    finalizeTxHash  = rfin.txHash;
    finalizedAtUnix = await chainTimestamp();
    pass(`${spec.tokenSymbol}.finalizeSale`, rfin.txHash);
  }

  // DO NOT call claim or claimTokens — user will claim via launchpad UI.

  return {
    spec,
    tokenAddr,
    saleAddr,
    vaultAddr,
    fracAddr,
    saleStart,
    saleEnd,
    finalizedAtUnix,
    buyTxHashes,
    finalizeTxHash,
    contributedUsdcWhole: ethers.formatUnits(usdcCost, 6),  // "1000.0"
  };
}

// ── main ──────────────────────────────────────────────────────────────────────

async function main() {
  const provider = ethers.provider;
  const admin    = new ethers.Wallet(process.env.ADMIN_PRIVATE_KEY!, provider);
  const issuer   = new ethers.Wallet(process.env.ISSUER_PRIVATE_KEY!, provider);
  const investor = new ethers.Wallet(process.env.INVESTOR_PRIVATE_KEY!, provider);

  const network = await provider.getNetwork();
  if (network.chainId !== 84532n) {
    throw new Error(`Use --network baseSepolia. Got chainId ${network.chainId}`);
  }

  const v2Path = path.join(__dirname, "..", "deployments", "base-sepolia.v2.20260430.json");
  const v2 = JSON.parse(fs.readFileSync(v2Path, "utf-8")) as Record<string, string>;

  const tokenFactory = await ethers.getContractAt("CiretaTokenFactory", v2.tokenFactory!, issuer);
  const saleFactory  = await ethers.getContractAt("CiretaSaleFactory",  v2.saleFactory!, issuer);
  const usdc         = await ethers.getContractAt("CiretaUSDC",         v2.ciretaUSDC!, investor);

  const tokenFactoryIface = (await ethers.getContractFactory("CiretaTokenFactory")).interface;
  const saleFactoryIface  = (await ethers.getContractFactory("CiretaSaleFactory")).interface;

  console.log("\n╔══════════════════════════════════════════════════════════════════╗");
  console.log("║   Three Claim Sales — LOCK20 + VEST5 + LOCK5 (Base Sepolia)      ║");
  console.log("╚══════════════════════════════════════════════════════════════════╝\n");
  console.log(`  admin    ${admin.address}`);
  console.log(`  issuer   ${issuer.address}`);
  console.log(`  investor ${investor.address}\n`);

  const startTime = Date.now();
  const results: SaleResult[] = [];

  for (const spec of SPECS) {
    const result = await deploySale(
      spec, admin, issuer, investor, v2,
      tokenFactory, saleFactory, usdc,
      tokenFactoryIface, saleFactoryIface,
    );
    results.push(result);
  }

  // ── Persist manifest ──────────────────────────────────────────────────
  const stamp = dateStamp();
  const manifestPath = path.join(
    __dirname, "..", "deployments",
    `three-claim-sales.${stamp}.json`,
  );

  const manifest = {
    network: "base-sepolia",
    chainId: 84532,
    deployedAt: new Date().toISOString(),
    sales: results.map((r) => ({
      tokenName:      r.spec.tokenName,
      tokenSymbol:    r.spec.tokenSymbol,
      cliffSeconds:   Number(r.spec.cliffSeconds),
      vestingSeconds: Number(r.spec.vestingSeconds),
      token: {
        address:      r.tokenAddr,
        name:         r.spec.tokenName,
        symbol:       r.spec.tokenSymbol,
        decimals:     6,
        totalSupply:  r.spec.supplyRaw.toString(),
      },
      sale: {
        address:          r.saleAddr,
        vault:            r.vaultAddr,
        fraction:         r.fracAddr,
        mode:             "Vested",
        cliffSeconds:     Number(r.spec.cliffSeconds),
        vestingSeconds:   Number(r.spec.vestingSeconds),
        startTime:        r.saleStart,
        endTime:          r.saleEnd,
        softCap:          ethers.parseUnits("1", 6).toString(),
        hardCap:          (r.spec.supplyWhole * r.spec.priceUsdcRaw).toString(),
        totalTokenSupply: r.spec.supplyRaw.toString(),
      },
      phases: [{
        index:          0,
        name:           "Seed",
        pricePerToken:  r.spec.priceUsdcRaw.toString(),
        allocation:     r.spec.supplyRaw.toString(),
        minTokens:      "10",
        maxTokens:      "0",
        topUpMinTokens: "5",
        startTime:      r.saleStart,
        endTime:        r.saleEnd - 1,
        whitelistOnly:  false,
        allocationMode: "Fixed",
      }],
      issuer: { wallet: issuer.address, name: "AGENT Issuer", jurisdiction: "GB" },
      investor: {
        wallet:           investor.address,
        contributedUsdc:  r.contributedUsdcWhole,
        tokensHeld:       r.spec.supplyWhole.toString(),
        buyTxHashes:      r.buyTxHashes,
        claimTxHashes:    [],   // intentionally empty — user claims via UI
      },
      finalizedAtUnix:  r.finalizedAtUnix,
      finalizeTxHash:   r.finalizeTxHash,
      feeBps:           200,
    })),
  };

  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  pass(`Manifest → ${path.basename(manifestPath)}`);

  const elapsedMin = ((Date.now() - startTime) / 60000).toFixed(1);

  console.log("\n══════════════════════════════════════════════════════════════════");
  console.log(`  ${PASSES.length} PASS  |  elapsed ${elapsedMin}m`);
  console.log("\n  Addresses:");
  for (const r of results) {
    console.log(`  ${r.spec.tokenSymbol.padEnd(8)} token   ${r.tokenAddr}`);
    console.log(`  ${r.spec.tokenSymbol.padEnd(8)} sale    ${r.saleAddr}`);
    console.log(`  ${r.spec.tokenSymbol.padEnd(8)} vault   ${r.vaultAddr}`);
    console.log(`  ${r.spec.tokenSymbol.padEnd(8)} frac    ${r.fracAddr}`);
    if (r.finalizeTxHash && r.finalizeTxHash !== "ALREADY_FINALIZED") {
      console.log(`           finalize  https://sepolia.basescan.org/tx/${r.finalizeTxHash}`);
    }
    console.log();
  }
  console.log(`  Manifest: ${manifestPath}`);
  console.log("══════════════════════════════════════════════════════════════════\n");
}

main().catch((e) => {
  console.error("\nFatal:", e instanceof Error ? e.message : String(e));
  process.exit(1);
});
