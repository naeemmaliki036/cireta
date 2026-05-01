/**
 * Deploys 4 sales on Base Sepolia for buy/claim UX testing.
 *
 * LONG  — 36,000-token supply @ 5,000 USDC/token, 1-year sale window, 365-day cliff (Vested)
 * OPEN  — 36,000-token supply @ 10,000 USDC/token, open-ended (endTime=0), 365-day cliff (Vested)
 * QUICK — 100,000-token supply @ 2 USDC/token, 1-day sale window (Direct — no vault, no frac)
 * MINT  — 5,000-token supply @ 100 USDC/token, 1-day sale window, mintable (Direct — no vault)
 *
 * Each sale is stopped at status=Active, then 10% of allocation is bought by INVESTOR.
 * NO finalize. User will buy more + finalize themselves.
 *
 * OPEN uses endTime=0 (on-chain openEnded=true flag — supported by Sale contract).
 * MAX_SALE_DURATION = 730 days, so 100-year endTime would revert; use 0 for open-ended.
 *
 * Resume support via env vars:
 *   EXISTING_LONG_TOKEN,  EXISTING_LONG_SALE
 *   EXISTING_OPEN_TOKEN,  EXISTING_OPEN_SALE
 *   EXISTING_QUICK_TOKEN, EXISTING_QUICK_SALE
 *   EXISTING_MINT_TOKEN,  EXISTING_MINT_SALE
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
    process.stdout.write(`\r  Waiting ${label} — chain Δ${target - now}s    `);
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

type SaleMode = "Vested" | "Direct";

interface SaleSpec {
  tokenName: string;
  tokenSymbol: string;
  supplyRaw: bigint;           // maxSupply raw (6 decimals)
  supplyWhole: bigint;
  initialMintRaw: bigint;      // tokens minted to issuer at deploy (may equal supplyRaw)
  mintable: boolean;
  tokenType: string;           // "fixed" | "mintable"
  priceUsdcRaw: bigint;
  hardCapRaw: bigint;
  softCapRaw: bigint;
  cliffSeconds: bigint;
  vestingSeconds: bigint;      // == cliff for cliff-only; 0 for Direct
  saleMode: SaleMode;
  saleEndOffsetSeconds: number; // 0 = open-ended (endTime=0)
  phaseAllocationRaw: bigint;
  phaseDurationSeconds: number;
  minTokensWhole: bigint;
  topUpMinTokensWhole: bigint;
  // Test buy: 10% of allocation (whole tokens)
  testBuyWhole: bigint;
  testBuyUsdcRaw: bigint;      // testBuyWhole * priceUsdcRaw
  existingTokenEnv: string;
  existingSaleEnv: string;
}

const ONE_YEAR_SECONDS = BigInt(365 * 24 * 3600);

const SPECS: SaleSpec[] = [
  {
    tokenName:             "Long-Running Test",
    tokenSymbol:           "LONG",
    supplyRaw:             ethers.parseUnits("36000", 6),
    supplyWhole:           36000n,
    initialMintRaw:        ethers.parseUnits("36000", 6),
    mintable:              false,
    tokenType:             "fixed",
    priceUsdcRaw:          5_000_000_000n,
    hardCapRaw:            180_000_000_000_000n,
    softCapRaw:            1_000_000n,
    cliffSeconds:          ONE_YEAR_SECONDS,
    vestingSeconds:        ONE_YEAR_SECONDS,
    saleMode:              "Vested",
    saleEndOffsetSeconds:  365 * 24 * 3600,
    phaseAllocationRaw:    ethers.parseUnits("36000", 6),
    phaseDurationSeconds:  90 * 24 * 3600,
    minTokensWhole:        1n,
    topUpMinTokensWhole:   5n,
    testBuyWhole:          3600n,              // 10% of 36,000
    testBuyUsdcRaw:        18_000_000_000_000n, // 3600 * 5000 USDC raw
    existingTokenEnv:      "EXISTING_LONG_TOKEN",
    existingSaleEnv:       "EXISTING_LONG_SALE",
  },
  {
    tokenName:             "Open-Ended Test",
    tokenSymbol:           "OPEN",
    supplyRaw:             ethers.parseUnits("36000", 6),
    supplyWhole:           36000n,
    initialMintRaw:        ethers.parseUnits("36000", 6),
    mintable:              false,
    tokenType:             "fixed",
    priceUsdcRaw:          10_000_000_000n,
    hardCapRaw:            360_000_000_000_000n,
    softCapRaw:            1_000_000n,
    cliffSeconds:          ONE_YEAR_SECONDS,
    vestingSeconds:        ONE_YEAR_SECONDS,
    saleMode:              "Vested",
    saleEndOffsetSeconds:  0,                 // 0 = open-ended (endTime=0)
    phaseAllocationRaw:    ethers.parseUnits("36000", 6),
    phaseDurationSeconds:  86_400,
    minTokensWhole:        1n,
    topUpMinTokensWhole:   5n,
    testBuyWhole:          3600n,
    testBuyUsdcRaw:        36_000_000_000_000n, // 3600 * 10000 USDC raw
    existingTokenEnv:      "EXISTING_OPEN_TOKEN",
    existingSaleEnv:       "EXISTING_OPEN_SALE",
  },
  {
    tokenName:             "Quick Fee Test",
    tokenSymbol:           "QUICK",
    supplyRaw:             ethers.parseUnits("100000", 6),
    supplyWhole:           100000n,
    initialMintRaw:        ethers.parseUnits("100000", 6),
    mintable:              false,
    tokenType:             "fixed",
    priceUsdcRaw:          2_000_000n,
    hardCapRaw:            200_000_000_000n,
    softCapRaw:            1_000_000n,
    cliffSeconds:          0n,
    vestingSeconds:        0n,
    saleMode:              "Direct",
    saleEndOffsetSeconds:  86_400,
    phaseAllocationRaw:    ethers.parseUnits("100000", 6),
    phaseDurationSeconds:  86_400,
    minTokensWhole:        1n,
    topUpMinTokensWhole:   5n,
    testBuyWhole:          10000n,             // 10% of 100,000
    testBuyUsdcRaw:        20_000_000_000n,    // 10000 * 2 USDC raw
    existingTokenEnv:      "EXISTING_QUICK_TOKEN",
    existingSaleEnv:       "EXISTING_QUICK_SALE",
  },
  {
    tokenName:             "Mintable Test",
    tokenSymbol:           "MINT",
    supplyRaw:             ethers.parseUnits("10000", 6), // maxSupply
    supplyWhole:           10000n,
    initialMintRaw:        ethers.parseUnits("5000", 6),  // pre-mint = 5k
    mintable:              true,
    tokenType:             "mintable",
    priceUsdcRaw:          100_000_000n,
    hardCapRaw:            500_000_000_000n,
    softCapRaw:            1_000_000n,
    cliffSeconds:          0n,
    vestingSeconds:        0n,
    saleMode:              "Direct",
    saleEndOffsetSeconds:  86_400,
    phaseAllocationRaw:    ethers.parseUnits("5000", 6),
    phaseDurationSeconds:  86_400,
    minTokensWhole:        1n,
    topUpMinTokensWhole:   5n,
    testBuyWhole:          500n,               // 10% of 5,000 phase alloc
    testBuyUsdcRaw:        50_000_000_000n,    // 500 * 100 USDC raw
    existingTokenEnv:      "EXISTING_MINT_TOKEN",
    existingSaleEnv:       "EXISTING_MINT_SALE",
  },
];

// ── per-sale deploy result ────────────────────────────────────────────────────

interface SaleResult {
  spec: SaleSpec;
  tokenAddr: string;
  saleAddr: string;
  vaultAddr: string;
  fracAddr: string;
  saleStart: number;
  saleEnd: number;
  openEnded: boolean;
  buyTxHash: string;
  buyAtUnix: number;
}

// ── buyWithRetry ──────────────────────────────────────────────────────────────

async function buyWithRetry(
  sale: ethers.Contract,
  investor: ethers.Wallet,
  qty: bigint,
  label: string,
): Promise<string> {
  for (let attempt = 1; attempt <= 5; attempt++) {
    try {
      const r = await gasOf(await sale.connect(investor).buy(0, qty));
      return r.txHash;
    } catch (e: any) {
      const msg = String(e?.message || e);
      if (attempt === 5) throw e;
      console.log(`  ${label}.buy attempt ${attempt} reverted — waiting 15s… (${msg.slice(0, 80)})`);
      await new Promise((r) => setTimeout(r, 15000));
    }
  }
  throw new Error(`${label}.buy exhausted`);
}

// ── per-sale deploy function ───────────────────────────────────────────────────

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

  const openEnded = spec.saleEndOffsetSeconds === 0;

  header(`${spec.tokenSymbol} — ${spec.tokenName} [${spec.saleMode}${openEnded ? " open-ended" : ""}]`);
  console.log(`  supply=${spec.supplyWhole}  initialMint=${ethers.formatUnits(spec.initialMintRaw, 6)}  price=${ethers.formatUnits(spec.priceUsdcRaw, 6)} USDC  cliff=${spec.cliffSeconds}s  mintable=${spec.mintable}`);

  // ── 1. Deploy token ────────────────────────────────────────────────────
  let tokenAddr = process.env[spec.existingTokenEnv] ?? "";
  if (!tokenAddr) {
    const tt = await tokenFactory.connect(issuer).deployToken(
      spec.tokenName, spec.tokenSymbol, 6,
      issuer.address, v2.simpleIdentityRegistry!,
      spec.supplyRaw,
      spec.mintable,
      spec.initialMintRaw,
    );
    const tr = (await tt.wait()) as TransactionReceipt;
    const tlog = tr.logs.find((l) => l.topics[0] === tokenDeployedTopic)!;
    tokenAddr = tokenFactoryIface.parseLog({ topics: [...tlog.topics], data: tlog.data })!.args[0] as string;
    pass(`${spec.tokenSymbol} token deployed @ ${tokenAddr}`, tr.hash);
  } else {
    pass(`${spec.tokenSymbol} resuming with existing token @ ${tokenAddr}`);
  }
  const token = await ethers.getContractAt("CiretaToken", tokenAddr, issuer);

  // ── 2. Deploy sale ─────────────────────────────────────────────────────
  let saleAddr = process.env[spec.existingSaleEnv] ?? "";
  let saleStart = 0;
  let saleEnd   = 0;

  if (!saleAddr) {
    const blk = await ethers.provider.getBlock("latest");
    saleStart = blk!.timestamp + 300;
    saleEnd   = openEnded ? 0 : saleStart + spec.saleEndOffsetSeconds;

    const initData = saleInitIface.encodeFunctionData("initialize", [
      tokenAddr,
      v2.ciretaUSDC!,
      v2.simpleIdentityRegistry!,
      issuer.address,
      v2.saleFactory!,
      v2.platformFeeManager!,
      spec.softCapRaw,
      spec.hardCapRaw,
      200n,                      // feeBps
      ethers.parseUnits("50000", 6),
      ethers.ZeroAddress,
      BigInt(saleStart),
      BigInt(saleEnd),
      spec.initialMintRaw,       // totalTokenSupply
    ]);

    if (spec.saleMode === "Vested") {
      const ds = await saleFactory.connect(issuer).deploySaleVested(
        tokenAddr, initData,
        `fr${spec.tokenSymbol}`, `fr${spec.tokenSymbol}`, 6,
        v2.simpleIdentityRegistry!,
        spec.cliffSeconds, spec.vestingSeconds,
        0,
      );
      const dsr = (await ds.wait()) as TransactionReceipt;
      const slog = dsr.logs.find(
        (l) => l.topics[0] === saleDeployedTopic &&
               l.address.toLowerCase() === v2.saleFactory!.toLowerCase()
      )!;
      saleAddr = saleFactoryIface.parseLog({ topics: [...slog.topics], data: slog.data })!.args[1] as string;
      pass(`${spec.tokenSymbol} vested sale deployed @ ${saleAddr}`, dsr.hash);
    } else {
      const ds = await saleFactory.connect(issuer).deploySale(tokenAddr, initData);
      const dsr = (await ds.wait()) as TransactionReceipt;
      const slog = dsr.logs.find(
        (l) => l.topics[0] === saleDeployedTopic &&
               l.address.toLowerCase() === v2.saleFactory!.toLowerCase()
      )!;
      saleAddr = saleFactoryIface.parseLog({ topics: [...slog.topics], data: slog.data })!.args[1] as string;
      pass(`${spec.tokenSymbol} direct sale deployed @ ${saleAddr}`, dsr.hash);
    }
  } else {
    pass(`${spec.tokenSymbol} resuming with existing sale @ ${saleAddr}`);
  }

  const sale = await ethers.getContractAt("Sale", saleAddr, issuer);

  if (saleStart === 0) {
    saleStart = Number(await safeRead(() => sale.saleStartTime()));
    saleEnd   = Number(await safeRead(() => sale.saleEndTime()));
  }

  let vaultAddr = "";
  let fracAddr  = "";
  if (spec.saleMode === "Vested") {
    vaultAddr = await safeRead(() => sale.vault());
    fracAddr  = await safeRead(() => sale.fractionToken());
    pass(`${spec.tokenSymbol} vault  @ ${vaultAddr}`);
    pass(`${spec.tokenSymbol} frac   @ ${fracAddr}`);
  }

  // ── 3. Add phase ───────────────────────────────────────────────────────
  const phaseCount = await safeRead(() => sale.getPhaseCount());
  if (phaseCount === 0n) {
    const phaseEnd = saleStart + spec.phaseDurationSeconds;
    const r3 = await gasOf(await sale.connect(issuer).addPhase(
      "Seed",
      spec.priceUsdcRaw,
      spec.phaseAllocationRaw,
      spec.minTokensWhole,
      0n,
      spec.topUpMinTokensWhole,
      BigInt(saleStart),
      BigInt(phaseEnd),
      false,
      0,
    ));
    pass(`${spec.tokenSymbol}.addPhase Seed (phase_end=${phaseEnd})`, r3.txHash);
  } else {
    pass(`${spec.tokenSymbol} phase 0 already added`);
  }

  // ── 4. Transfer tokens to sale/vault ──────────────────────────────────
  const transferTarget = spec.saleMode === "Vested" ? vaultAddr : saleAddr;
  const targetBal = await token.balanceOf(transferTarget);
  if (targetBal < spec.initialMintRaw) {
    const toTransfer = spec.initialMintRaw - targetBal;
    const r4 = await gasOf(await token.connect(issuer).transfer(transferTarget, toTransfer));
    pass(`${spec.tokenSymbol}.transfer(${spec.saleMode === "Vested" ? "vault" : "sale"}, ${ethers.formatUnits(toTransfer, 6)} tokens)`, r4.txHash);
  } else {
    pass(`${spec.tokenSymbol} target already funded`);
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

  // Wait for chain to settle state after activate (sometimes safeRead returns stale status=0)
  await new Promise((r) => setTimeout(r, 6000));
  const finalStatus = await safeRead(() => sale.status());
  if (finalStatus !== 1n) {
    // One more attempt with longer wait
    await new Promise((r) => setTimeout(r, 10000));
    const finalStatus2 = await safeRead(() => sale.status());
    if (finalStatus2 !== 1n) {
      throw new Error(`${spec.tokenSymbol} unexpected status after activate: ${finalStatus2} (expected 1=Active)`);
    }
  }

  // ── 7. Test buy: 10% of allocation (idempotent via env var) ──────────
  // Resume: if EXISTING_<SYM>_BUY_TX is set, skip the buy (already done).
  const existingBuyTxEnv = `EXISTING_${spec.tokenSymbol}_BUY_TX`;
  let buyTxHash = process.env[existingBuyTxEnv] ?? "";
  let buyAtUnix = 0;

  if (buyTxHash) {
    buyAtUnix = await chainTimestamp();
    pass(`${spec.tokenSymbol} test buy already done (tx=${buyTxHash})`);
  } else {
    const allowance = await usdc.allowance(investor.address, saleAddr);
    if (allowance < spec.testBuyUsdcRaw) {
      const ra = await gasOf(await usdc.connect(investor).approve(saleAddr, spec.testBuyUsdcRaw));
      pass(`${spec.tokenSymbol} USDC.approve(sale, ${ethers.formatUnits(spec.testBuyUsdcRaw, 6)})`, ra.txHash);
    } else {
      pass(`${spec.tokenSymbol} USDC allowance already sufficient`);
    }

    buyTxHash = await buyWithRetry(sale, investor, spec.testBuyWhole, spec.tokenSymbol);
    buyAtUnix = await chainTimestamp();
    pass(`${spec.tokenSymbol}.buy(${spec.testBuyWhole} whole tokens)  cost=${ethers.formatUnits(spec.testBuyUsdcRaw, 6)} USDC`, buyTxHash);
  }

  // Print on-chain confirmation
  const totalRaised = await safeRead(() => sale.totalRaised());
  console.log(`  ${spec.tokenSymbol} totalRaised() = ${ethers.formatUnits(totalRaised, 6)} USDC`);

  if (spec.saleMode === "Vested") {
    const vault = await ethers.getContractAt(
      ["function totalMintedFractions() external view returns (uint256)"],
      vaultAddr, issuer,
    );
    const minted = await safeRead(() => vault.totalMintedFractions());
    console.log(`  ${spec.tokenSymbol} vault.totalMintedFractions() = ${ethers.formatUnits(minted, 6)}`);
  }

  pass(`${spec.tokenSymbol} DONE — status=Active, bought ${spec.testBuyWhole} tokens (10%)`);

  return { spec, tokenAddr, saleAddr, vaultAddr, fracAddr, saleStart, saleEnd, openEnded, buyTxHash, buyAtUnix };
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

  console.log("\n╔══════════════════════════════════════════════════════════════════════╗");
  console.log("║   LONG + OPEN + QUICK + MINT — Buy/Claim UX Testing (Base Sepolia)  ║");
  console.log("╚══════════════════════════════════════════════════════════════════════╝\n");
  console.log(`  admin    ${admin.address}`);
  console.log(`  issuer   ${issuer.address}`);
  console.log(`  investor ${investor.address}\n`);

  // ── Pre-mint USDC to investor (60M USDC raw = 60 USDC * 10^6 per USDC, but USDC 6 dec)
  // Grand total needed: 18M + 36M + 20k + 50k USDC raw ≈ 54.07M USDC raw
  // Buffer: mint 60_000_000_000_000 raw (60M USDC 6-dec)
  const USDC_BUFFER_RAW = 60_000_000_000_000n; // 60,000,000 USDC raw
  const investorBal = await usdc.balanceOf(investor.address);
  console.log(`  Investor USDC balance: ${ethers.formatUnits(investorBal, 6)} USDC`);
  let mintTxHash = "";
  if (investorBal < USDC_BUFFER_RAW) {
    const mintAmt = USDC_BUFFER_RAW - investorBal;
    const rm = await gasOf(await usdc.connect(investor).mint(investor.address, mintAmt));
    mintTxHash = rm.txHash;
    pass(`Minted ${ethers.formatUnits(mintAmt, 6)} USDC to investor`, rm.txHash);
  } else {
    pass(`Investor already has sufficient USDC (${ethers.formatUnits(investorBal, 6)})`);
  }

  const startTime = Date.now();
  const results: SaleResult[] = [];

  for (const spec of SPECS) {
    // LONG token is pre-deployed — check for resume
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
    `long-and-open.${stamp}.json`,
  );

  const manifest = {
    network: "base-sepolia",
    chainId: 84532,
    deployedAt: new Date().toISOString(),
    investor: investor.address,
    usdcMintTxHash: mintTxHash,
    sales: results.map((r) => ({
      tokenName:      r.spec.tokenName,
      tokenSymbol:    r.spec.tokenSymbol,
      tokenType:      r.spec.tokenType,
      cliffSeconds:   Number(r.spec.cliffSeconds),
      vestingSeconds: Number(r.spec.vestingSeconds),
      saleMode:       r.spec.saleMode,
      openEnded:      r.openEnded,
      token: {
        address:      r.tokenAddr,
        name:         r.spec.tokenName,
        symbol:       r.spec.tokenSymbol,
        decimals:     6,
        totalSupply:  r.spec.supplyRaw.toString(),
        initialMint:  r.spec.initialMintRaw.toString(),
        mintable:     r.spec.mintable,
      },
      sale: {
        address:          r.saleAddr,
        vault:            r.vaultAddr || null,
        fraction:         r.fracAddr  || null,
        mode:             r.spec.saleMode,
        cliffSeconds:     Number(r.spec.cliffSeconds),
        vestingSeconds:   Number(r.spec.vestingSeconds),
        startTime:        r.saleStart,
        endTime:          r.saleEnd,
        softCap:          r.spec.softCapRaw.toString(),
        hardCap:          r.spec.hardCapRaw.toString(),
        pricePerToken:    r.spec.priceUsdcRaw.toString(),
        totalTokenSupply: r.spec.initialMintRaw.toString(),
      },
      phases: [{
        index:          0,
        name:           "Seed",
        pricePerToken:  r.spec.priceUsdcRaw.toString(),
        allocation:     r.spec.phaseAllocationRaw.toString(),
        minTokens:      r.spec.minTokensWhole.toString(),
        maxTokens:      "0",
        topUpMinTokens: r.spec.topUpMinTokensWhole.toString(),
        startTime:      r.saleStart,
        endTime:        r.saleStart + r.spec.phaseDurationSeconds,
        whitelistOnly:  false,
        allocationMode: "Fixed",
      }],
      testBuy: {
        buyerWallet:   investor.address,
        tokensWhole:   r.spec.testBuyWhole.toString(),
        usdcRaw:       r.spec.testBuyUsdcRaw.toString(),
        buyTxHash:     r.buyTxHash,
        buyAtUnix:     r.buyAtUnix,
      },
      issuer: { wallet: issuer.address },
      feeBps: 200,
    })),
  };

  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  pass(`Manifest → ${path.basename(manifestPath)}`);

  const elapsedMin = ((Date.now() - startTime) / 60000).toFixed(1);

  console.log("\n══════════════════════════════════════════════════════════════════");
  console.log(`  ${PASSES.length} PASS  |  elapsed ${elapsedMin}m`);
  if (mintTxHash) {
    console.log(`\n  USDC mint → https://sepolia.basescan.org/tx/${mintTxHash}`);
  }
  console.log("\n  Addresses + buy summary:");
  for (const r of results) {
    console.log(`\n  ── ${r.spec.tokenSymbol} (${r.spec.saleMode}) ──`);
    console.log(`     token    ${r.tokenAddr}`);
    console.log(`     sale     ${r.saleAddr}`);
    if (r.vaultAddr) console.log(`     vault    ${r.vaultAddr}`);
    if (r.fracAddr)  console.log(`     frac     ${r.fracAddr}`);
    console.log(`     start    ${r.saleStart}  (${new Date(r.saleStart * 1000).toISOString()})`);
    console.log(`     end      ${r.openEnded ? "open-ended" : `${r.saleEnd}  (${new Date(r.saleEnd * 1000).toISOString()})`}`);
    console.log(`     buy      ${r.spec.testBuyWhole} tokens  ${ethers.formatUnits(r.spec.testBuyUsdcRaw, 6)} USDC`);
    console.log(`     buyTx    https://sepolia.basescan.org/tx/${r.buyTxHash}`);
  }
  console.log(`\n  Manifest: ${manifestPath}`);
  console.log("══════════════════════════════════════════════════════════════════\n");
}

main().catch((e) => {
  console.error("\nFatal:", e instanceof Error ? e.message : String(e));
  process.exit(1);
});
