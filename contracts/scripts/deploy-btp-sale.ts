/**
 * Deploy Best Tube Production (BTP) — Steel & Tube Fabrication Factory Morocco.
 *
 * Vested sale (12-month cliff, 0 linear), OTC-enabled.
 *  - BTP project token: 60,000 max supply, 6 decimals
 *  - Soft cap 100K USDC, hard cap 60M USDC
 *  - Sale window: 1 year from start
 *  - Phase 1 "Private Round": 90 days, $1000/BTP, min 100K USDC, max 60M USDC
 *  - OTC token "CIRETA OTC INFRA" / OTCINFRA — 1B pre-minted to 0x5c5C…1fba
 *
 * Run:
 *   ./node_modules/.bin/hardhat run scripts/deploy-btp-sale.ts --network baseSepolia
 */

import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";

const TOKEN_FACTORY = "0x14e2A35c35DC58d4eB6BFE329811Ca1bDbbF94E4";
const SALE_FACTORY = "0xFfC765aB999CF3D718Aa81869DE3D32Ff3E0d2d9";
const OTC_FACTORY = "0x0094c64d3bA4218381C77cCE7493991CBe42b969";
const PFM = "0xA6d90EAf016981d706474C8E3e56EB3D1859640b";
const USDC = "0x3Bfb6B62C015EE815e5Eb0A7e212F580446D9898";
const SHARED_IR = "0x5B344d1E07B57D36B8FD99b2e241dd7E8674d7BE";

const OTC_MINT_TO = "0x5c5C4A2563ea79D494a0CA2dCd8d596790651fba";

// (a) Cliff 12m, no linear — locked 365 days, then 100% claimable.
// Vault contract requires _vestingDuration != 0 AND _cliffDuration <= _vestingDuration,
// so we encode "cliff-only" as cliff == vesting (vesting completes exactly at the cliff).
const CLIFF_SECONDS = 365n * 86400n;
const VESTING_SECONDS = 365n * 86400n;

// Sale window
const SALE_DURATION_SECONDS = 365n * 86400n;
const PHASE_DURATION_SECONDS = 90n * 86400n;

// Token economics
const MAX_SUPPLY = 60_000n * 10n ** 6n; // 60,000 BTP (6 decimals)
const SOFT_CAP = 100_000n * 10n ** 6n; // 100K USDC
const HARD_CAP = 60_000_000n * 10n ** 6n; // 60M USDC

// Phase 1
const PRICE_PER_TOKEN = 1_000n * 10n ** 6n; // $1000/BTP in USDC raw units
const MIN_BUY_TOKENS = 100n; // 100K USDC / $1000
const MAX_BUY_TOKENS = 60_000n; // 60M USDC / $1000
const TOP_UP_MIN_TOKENS = 1n;

// OTC pre-mint: 1B OTCINFRA (6 decimals → 1e15 raw)
const OTC_MINT_AMOUNT = 1_000_000_000n * 10n ** 6n;

async function main() {
  const sandboxEnv = fs.readFileSync(
    path.join(__dirname, "..", "..", ".env.sandbox-e2e"),
    "utf-8"
  );
  const getKey = (n: string) =>
    "0x" +
    sandboxEnv
      .match(new RegExp(`^${n}=([0-9a-fA-Fx]+)`, "m"))![1]
      .replace(/^0x/, "");
  const issuer = new ethers.Wallet(getKey("ISSUER_PRIVATE_KEY"), ethers.provider);
  const admin = new ethers.Wallet(getKey("ADMIN_PRIVATE_KEY"), ethers.provider);
  console.log(`Issuer: ${issuer.address}`);
  console.log(`Admin:  ${admin.address}`);
  console.log(`Cliff:  ${CLIFF_SECONDS}s (= 365 days)`);
  console.log(`Vesting:${VESTING_SECONDS}s (= cliff-only payout)`);

  const pfm = await ethers.getContractAt("PlatformFeeManager", PFM);
  const feeBps = await (pfm as any).getFeeForIssuer(issuer.address);
  console.log(`Platform fee for issuer: ${feeBps} bps`);

  // ── Step 1: Deploy BTP token (or reuse via env override) ──
  console.log("\n=== Step 1: Deploy BTP token ===");
  const tokenFactory = await ethers.getContractAt(
    "CiretaTokenFactory",
    TOKEN_FACTORY,
    issuer
  );

  let tokenAddr = process.env.BTP_TOKEN_ADDRESS ?? "";
  let complianceAddr = "";

  if (tokenAddr) {
    console.log(`  reusing existing BTP token: ${tokenAddr}`);
  } else {
    const tx1 = await (tokenFactory as any).deployToken(
      "Best Tube Production Token",
      "BTP",
      6,
      issuer.address,
      SHARED_IR,
      MAX_SUPPLY,
      false,
      MAX_SUPPLY
    );
    const rcpt1 = await tx1.wait();
    console.log(`  tx: ${rcpt1.hash}`);
    for (const log of rcpt1.logs) {
      try {
        const parsed = tokenFactory.interface.parseLog({
          topics: [...log.topics],
          data: log.data,
        });
        if (parsed && parsed.name === "TokenDeployed") {
          tokenAddr = parsed.args.token;
          complianceAddr = parsed.args.compliance;
          break;
        }
      } catch {
        /* skip */
      }
    }
    console.log(`  token:      ${tokenAddr}`);
    console.log(`  compliance: ${complianceAddr}`);
  }

  // ── Step 2: Deploy vested sale ──
  console.log("\n=== Step 2: Deploy vested Sale (1-year window) ===");
  const block = await ethers.provider.getBlock("latest");
  const nowTs = BigInt(block!.timestamp);
  const startTime = nowTs + 60n;
  const endTime = startTime + SALE_DURATION_SECONDS;

  const SaleFactory = await ethers.getContractFactory("Sale");
  const initData = SaleFactory.interface.encodeFunctionData("initialize", [
    tokenAddr,
    USDC,
    SHARED_IR,
    issuer.address,
    SALE_FACTORY,
    PFM,
    SOFT_CAP,
    HARD_CAP,
    feeBps,
    0n,
    ethers.ZeroAddress, // _otcToken — set explicitly below after we deploy the OTC token
    startTime,
    endTime,
    MAX_SUPPLY,
  ]);

  const saleFactory = await ethers.getContractAt(
    "CiretaSaleFactory",
    SALE_FACTORY,
    issuer
  );

  // Try a static call first so we capture revert reason cleanly.
  try {
    await (saleFactory as any).deploySaleVested.staticCall(
      tokenAddr, initData,
      "Fractional BTP", "frBTP", 6, SHARED_IR,
      CLIFF_SECONDS, VESTING_SECONDS, 0,
    );
  } catch (e: any) {
    console.error("  STATIC CALL REVERTED:");
    console.error("  shortMessage:", e?.shortMessage);
    console.error("  reason:      ", e?.reason);
    console.error("  data:        ", e?.data);
    throw e;
  }

  const tx2 = await (saleFactory as any).deploySaleVested(
    tokenAddr,
    initData,
    "Fractional BTP",
    "frBTP",
    6,
    SHARED_IR,
    CLIFF_SECONDS,
    VESTING_SECONDS,
    0
  );
  const rcpt2 = await tx2.wait();
  console.log(`  tx: ${rcpt2.hash}`);

  let saleAddr = "";
  for (const log of rcpt2.logs) {
    try {
      const parsed = saleFactory.interface.parseLog({
        topics: [...log.topics],
        data: log.data,
      });
      if (parsed && parsed.name === "SaleDeployed") {
        saleAddr = parsed.args.sale;
        break;
      }
    } catch {
      /* skip */
    }
  }
  console.log(`  sale: ${saleAddr}`);

  // Read vault + fraction (with retry for RPC indexing race)
  const sale = await ethers.getContractAt("Sale", saleAddr, issuer);
  let vaultAddr = "",
    fractionAddr = "";
  for (let attempt = 1; attempt <= 5; attempt++) {
    try {
      vaultAddr = await (sale as any).vault();
      fractionAddr = await (sale as any).fractionToken();
      break;
    } catch (e: any) {
      if (attempt === 5) throw e;
      console.log(`  vault() attempt ${attempt} failed; retrying in 3s...`);
      await new Promise((r) => setTimeout(r, 3000));
    }
  }
  console.log(`  vault:    ${vaultAddr}`);
  console.log(`  fraction: ${fractionAddr}`);

  // ── Step 3: Deploy OTC token (CIRETA OTC INFRA / OTCINFRA) ──
  console.log("\n=== Step 3: Deploy OTC token CIRETA OTC INFRA ===");
  const otcFactory = await ethers.getContractAt(
    "IssuerOTCTokenFactory",
    OTC_FACTORY,
    issuer
  );
  const tx3 = await (otcFactory as any).deployOTCToken(
    "CIRETA OTC INFRA",
    "OTCINFRA",
    issuer.address,
    SHARED_IR
  );
  const rcpt3 = await tx3.wait();
  console.log(`  tx: ${rcpt3.hash}`);

  let otcAddr = "";
  for (const log of rcpt3.logs) {
    try {
      const parsed = otcFactory.interface.parseLog({
        topics: [...log.topics],
        data: log.data,
      });
      if (parsed && parsed.name === "OTCTokenDeployed") {
        otcAddr = parsed.args.otcToken;
        break;
      }
    } catch {
      /* skip */
    }
  }
  console.log(`  otc token: ${otcAddr}`);

  // ── Step 4: Wire OTC to sale ──
  console.log("\n=== Step 4: Sale.setOTCToken ===");
  const tx4 = await (sale as any).setOTCToken(otcAddr);
  await tx4.wait();
  console.log(`  tx: ${tx4.hash}`);
  const otcOnSale = await (sale as any).otcToken();
  console.log(`  sale.otcToken(): ${otcOnSale}`);
  if (otcOnSale.toLowerCase() !== otcAddr.toLowerCase()) {
    throw new Error("setOTCToken did not wire correctly");
  }

  // ── Step 5: Pre-mint 1B OTCINFRA to recipient ──
  console.log(`\n=== Step 5: Mint 1B OTCINFRA → ${OTC_MINT_TO} ===`);
  const otcToken = await ethers.getContractAt("IssuerOTCToken", otcAddr, issuer);
  const tx5 = await (otcToken as any).mint(OTC_MINT_TO, OTC_MINT_AMOUNT);
  await tx5.wait();
  console.log(`  tx: ${tx5.hash}`);
  const balance = await (otcToken as any).balanceOf(OTC_MINT_TO);
  console.log(
    `  recipient balance: ${ethers.formatUnits(balance, 6)} OTCINFRA`
  );

  // ── Step 6: Deposit project tokens into vault ──
  console.log("\n=== Step 6: Deposit project tokens ===");
  const token = await ethers.getContractAt("CiretaToken", tokenAddr, issuer);
  await (await token.approve(saleAddr, MAX_SUPPLY)).wait();
  await (await (sale as any).depositProjectTokens(MAX_SUPPLY)).wait();
  console.log(`  vault BTP: ${ethers.formatUnits(await token.balanceOf(vaultAddr), 6)}`);

  // ── Step 7: Add Private Round phase (3 months) ──
  console.log("\n=== Step 7: Add Private Round phase (90 days) ===");
  const phaseStart = startTime + 60n;
  const phaseEnd = phaseStart + PHASE_DURATION_SECONDS;
  if (phaseEnd > endTime) throw new Error("phase end exceeds sale end");
  await (
    await (sale as any).addPhase(
      "Seed Round",
      PRICE_PER_TOKEN,
      MAX_SUPPLY,
      MIN_BUY_TOKENS,
      MAX_BUY_TOKENS,
      TOP_UP_MIN_TOKENS,
      phaseStart,
      phaseEnd,
      false,
      0
    )
  ).wait();
  console.log(
    `  Private Round added — runs ${new Date(Number(phaseStart) * 1000).toISOString()} → ${new Date(Number(phaseEnd) * 1000).toISOString()}`
  );

  // ── Step 8: Admin approve + issuer activate ──
  console.log("\n=== Step 8: Admin approve + issuer activate ===");
  const saleAsAdmin = await ethers.getContractAt("Sale", saleAddr, admin);
  await (await (saleAsAdmin as any).approveSale()).wait();
  await (await (sale as any).activate()).wait();
  const status = await (sale as any).status();
  console.log(`  status: ${status} (1=Active)`);

  // ── Output ──
  const out = {
    label: "Best Tube Production (BTP) — Steel & Tube Fabrication Morocco",
    token: tokenAddr,
    identityRegistry: SHARED_IR,
    compliance: complianceAddr,
    sale: saleAddr,
    vault: vaultAddr,
    fraction: fractionAddr,
    otcToken: otcAddr,
    otcMintRecipient: OTC_MINT_TO,
    otcMintAmount: OTC_MINT_AMOUNT.toString(),
    startTime: Number(startTime),
    endTime: Number(endTime),
    phaseStart: Number(phaseStart),
    phaseEnd: Number(phaseEnd),
    cliffSeconds: Number(CLIFF_SECONDS),
    vestingSeconds: Number(VESTING_SECONDS),
    softCap: SOFT_CAP.toString(),
    hardCap: HARD_CAP.toString(),
    maxSupply: MAX_SUPPLY.toString(),
    pricePerTokenRaw: PRICE_PER_TOKEN.toString(),
    minBuyTokens: MIN_BUY_TOKENS.toString(),
    maxBuyTokens: MAX_BUY_TOKENS.toString(),
  };

  console.log("\n══════════════════════════════════════════════════════");
  console.log("BTP DEPLOY COMPLETE");
  console.log("══════════════════════════════════════════════════════");
  console.log(JSON.stringify(out, null, 2));
  fs.writeFileSync("/tmp/btp-deploy.json", JSON.stringify(out, null, 2) + "\n");
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
