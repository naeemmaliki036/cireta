/**
 * Deploy WMAU (Wassa Gold Token) — vested 12-month, 3-phase chained sale.
 * Run: ./node_modules/.bin/hardhat run scripts/deploy-wmau-sale.ts --network baseSepolia
 */
import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";

const TOKEN_FACTORY = "0x14e2A35c35DC58d4eB6BFE329811Ca1bDbbF94E4";
const SALE_FACTORY = "0xFfC765aB999CF3D718Aa81869DE3D32Ff3E0d2d9";
const PFM = "0xA6d90EAf016981d706474C8E3e56EB3D1859640b";
const USDC = "0x3Bfb6B62C015EE815e5Eb0A7e212F580446D9898";
const SHARED_IR = "0x5B344d1E07B57D36B8FD99b2e241dd7E8674d7BE";

const ONE_DAY = 86400n;
const CLIFF = 365n * ONE_DAY; // 12-month cliff
const VESTING = 365n * ONE_DAY; // cliff-only

async function main() {
  const sandboxEnv = fs.readFileSync(path.join(__dirname, "..", "..", ".env.sandbox-e2e"), "utf-8");
  const getKey = (n: string) => "0x" + sandboxEnv.match(new RegExp(`^${n}=([0-9a-fA-Fx]+)`, "m"))![1].replace(/^0x/, "");
  const issuer = new ethers.Wallet(getKey("ISSUER_PRIVATE_KEY"), ethers.provider);
  const admin = new ethers.Wallet(getKey("ADMIN_PRIVATE_KEY"), ethers.provider);

  console.log(`Issuer: ${issuer.address}`);
  console.log(`Admin:  ${admin.address}`);

  const pfm = await ethers.getContractAt("PlatformFeeManager", PFM);
  const feeBps = await (pfm as any).getFeeForIssuer(issuer.address);
  console.log(`Platform fee: ${feeBps} bps`);

  // ── Step 1: Deploy WMAU token ──
  console.log("\n=== Step 1: Deploy WMAU token ===");
  const tokenFactory = await ethers.getContractAt("CiretaTokenFactory", TOKEN_FACTORY, issuer);
  const MAX_SUPPLY = 2_435n * 10n ** 6n; // 2,435 tokens
  const tx1 = await (tokenFactory as any).deployToken(
    "Wassa Gold Token", "WMAU", 6, issuer.address, SHARED_IR,
    MAX_SUPPLY, false, MAX_SUPPLY,
  );
  const rcpt1 = await tx1.wait();
  console.log(`  tx: ${rcpt1.hash}`);

  let tokenAddr = "", complianceAddr = "";
  for (const log of rcpt1.logs) {
    try {
      const parsed = tokenFactory.interface.parseLog({ topics: [...log.topics], data: log.data });
      if (parsed && parsed.name === "TokenDeployed") {
        tokenAddr = parsed.args.token;
        complianceAddr = parsed.args.compliance;
        break;
      }
    } catch { /* skip */ }
  }
  console.log(`  token:      ${tokenAddr}`);
  console.log(`  compliance: ${complianceAddr}`);

  // ── Step 2: Deploy vested sale ──
  console.log("\n=== Step 2: Deploy vested Sale ===");
  const block = await ethers.provider.getBlock("latest");
  const nowTs = BigInt(block!.timestamp);
  const startTime = nowTs + 60n;
  const endTime = startTime + 365n * ONE_DAY;

  const SOFT_CAP = 8_500_000n * 10n ** 6n;
  const HARD_CAP = 244_970_000n * 10n ** 6n;

  const SaleFactory = await ethers.getContractFactory("Sale");
  const initData = SaleFactory.interface.encodeFunctionData("initialize", [
    tokenAddr, USDC, SHARED_IR, issuer.address,
    SALE_FACTORY, PFM,
    SOFT_CAP, HARD_CAP, feeBps, 0n,
    ethers.ZeroAddress, startTime, endTime, MAX_SUPPLY,
  ]);

  const saleFactory = await ethers.getContractAt("CiretaSaleFactory", SALE_FACTORY, issuer);
  const tx2 = await (saleFactory as any).deploySaleVested(
    tokenAddr, initData,
    "Fractional WMAU", "frWMAU", 6, SHARED_IR,
    CLIFF, VESTING, 0,
  );
  const rcpt2 = await tx2.wait();
  console.log(`  tx: ${rcpt2.hash}`);

  let saleAddr = "";
  for (const log of rcpt2.logs) {
    try {
      const parsed = saleFactory.interface.parseLog({ topics: [...log.topics], data: log.data });
      if (parsed && parsed.name === "SaleDeployed") {
        saleAddr = parsed.args.sale;
        break;
      }
    } catch { /* skip */ }
  }
  console.log(`  sale: ${saleAddr}`);

  const sale = await ethers.getContractAt("Sale", saleAddr, issuer);
  let vaultAddr = "", fractionAddr = "";
  for (let attempt = 1; attempt <= 5; attempt++) {
    try {
      vaultAddr = await (sale as any).vault();
      fractionAddr = await (sale as any).fractionToken();
      break;
    } catch {
      console.log(`  vault() attempt ${attempt}; retry in 3s...`);
      await new Promise(r => setTimeout(r, 3000));
    }
  }
  console.log(`  vault:    ${vaultAddr}`);
  console.log(`  fraction: ${fractionAddr}`);

  // ── Step 3: Deposit tokens ──
  console.log("\n=== Step 3: Deposit WMAU to vault ===");
  const token = await ethers.getContractAt("CiretaToken", tokenAddr, issuer);
  await (await token.approve(saleAddr, MAX_SUPPLY)).wait();
  await (await (sale as any).depositProjectTokens(MAX_SUPPLY)).wait();
  console.log(`  vault WMAU: ${ethers.formatUnits(await token.balanceOf(vaultAddr), 6)}`);

  // ── Step 4: Add 3 phases (Seed → Private → Retail) ──
  console.log("\n=== Step 4: Add 3 phases ===");

  // Phase 0 — Seed: 0d → 91d, $85K/kg
  const seedStart = startTime + 60n;
  const seedEnd = startTime + 91n * ONE_DAY;
  await (await (sale as any).addPhase(
    "Seed",
    85_000n * 10n ** 6n,
    MAX_SUPPLY,
    100n, 2_435n, 1n,
    seedStart, seedEnd,
    false, 1, // AllocationMode.Remaining
  )).wait();
  console.log(`  Seed:    ${new Date(Number(seedStart) * 1000).toISOString()} → ${new Date(Number(seedEnd) * 1000).toISOString()}  ($85K/kg, min 100kg)`);

  // Phase 1 — Private: 91d+1s → 182d, $115K/kg
  const privStart = seedEnd + 1n;
  const privEnd = startTime + 182n * ONE_DAY;
  await (await (sale as any).addPhase(
    "Private",
    115_000n * 10n ** 6n,
    MAX_SUPPLY,
    50n, 2_435n, 1n,
    privStart, privEnd,
    false, 1,
  )).wait();
  console.log(`  Private: ${new Date(Number(privStart) * 1000).toISOString()} → ${new Date(Number(privEnd) * 1000).toISOString()}  ($115K/kg, min 50kg)`);

  // Phase 2 — Retail: 182d+1s → 365d, $125K/kg
  const retStart = privEnd + 1n;
  const retEnd = endTime;
  await (await (sale as any).addPhase(
    "Retail",
    125_000n * 10n ** 6n,
    MAX_SUPPLY,
    1n, 2_435n, 1n,
    retStart, retEnd,
    false, 1,
  )).wait();
  console.log(`  Retail:  ${new Date(Number(retStart) * 1000).toISOString()} → ${new Date(Number(retEnd) * 1000).toISOString()}  ($125K/kg, min 1kg)`);

  // ── Step 5: Approve + activate ──
  console.log("\n=== Step 5: Admin approve + issuer activate ===");
  const saleAsAdmin = await ethers.getContractAt("Sale", saleAddr, admin);
  await (await (saleAsAdmin as any).approveSale()).wait();
  await (await (sale as any).activate()).wait();
  console.log(`  status: ${await (sale as any).status()} (1=Active)`);

  const out = {
    token: tokenAddr,
    sale: saleAddr,
    vault: vaultAddr,
    fraction: fractionAddr,
    compliance: complianceAddr,
    identityRegistry: SHARED_IR,
    startTime: Number(startTime),
    endTime: Number(endTime),
    phases: {
      seed:    { start: Number(seedStart), end: Number(seedEnd) },
      private: { start: Number(privStart), end: Number(privEnd) },
      retail:  { start: Number(retStart),  end: Number(retEnd) },
    },
    cliffSeconds: Number(CLIFF),
  };

  console.log("\n══════════════════════════════════════════════════════");
  console.log("WMAU DEPLOY COMPLETE");
  console.log("══════════════════════════════════════════════════════");
  console.log(JSON.stringify(out, null, 2));
  fs.writeFileSync("/tmp/wmau-deploy.json", JSON.stringify(out, null, 2) + "\n");
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
