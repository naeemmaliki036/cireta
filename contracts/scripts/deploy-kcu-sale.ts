/**
 * Deploy KCU (Kinusi Copper Token) — vested 12-month, seed-round-only.
 * Run: ./node_modules/.bin/hardhat run scripts/deploy-kcu-sale.ts --network baseSepolia
 */
import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";

const TOKEN_FACTORY = "0x14e2A35c35DC58d4eB6BFE329811Ca1bDbbF94E4";
const SALE_FACTORY = "0xFfC765aB999CF3D718Aa81869DE3D32Ff3E0d2d9";
const PFM = "0xA6d90EAf016981d706474C8E3e56EB3D1859640b";
const USDC = "0x3Bfb6B62C015EE815e5Eb0A7e212F580446D9898";
const SHARED_IR = "0x5B344d1E07B57D36B8FD99b2e241dd7E8674d7BE";

const CLIFF = 365n * 86400n;
const VESTING = 365n * 86400n;

async function main() {
  const sandboxEnv = fs.readFileSync(path.join(__dirname, "..", "..", ".env.sandbox-e2e"), "utf-8");
  const getKey = (n: string) => "0x" + sandboxEnv.match(new RegExp(`^${n}=([0-9a-fA-Fx]+)`, "m"))![1].replace(/^0x/, "");
  const issuer = new ethers.Wallet(getKey("ISSUER_PRIVATE_KEY"), ethers.provider);
  const admin = new ethers.Wallet(getKey("ADMIN_PRIVATE_KEY"), ethers.provider);

  console.log(`Issuer: ${issuer.address}`);
  console.log(`Admin:  ${admin.address}`);

  const pfm = await ethers.getContractAt("PlatformFeeManager", PFM);
  const feeBps = await (pfm as any).getFeeForIssuer(issuer.address);

  // ── Step 1: Deploy KCU token ──
  console.log("\n=== Step 1: Deploy KCU token ===");
  const tokenFactory = await ethers.getContractAt("CiretaTokenFactory", TOKEN_FACTORY, issuer);
  const MAX_SUPPLY = 36_000n * 10n ** 6n;
  const tx1 = await (tokenFactory as any).deployToken(
    "Kinusi Copper Token", "KCU", 6, issuer.address, SHARED_IR,
    MAX_SUPPLY, false, MAX_SUPPLY,
  );
  const rcpt1 = await tx1.wait();
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

  // ── Step 2: Deploy vested Sale ──
  console.log("\n=== Step 2: Deploy vested Sale ===");
  const block = await ethers.provider.getBlock("latest");
  const nowTs = BigInt(block!.timestamp);
  const startTime = nowTs + 60n;
  const endTime = startTime + 90n * 86400n; // 90-day window (seed only)

  const SOFT_CAP = 2_500_000n * 10n ** 6n;
  const HARD_CAP = 180_000_000n * 10n ** 6n;

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
    "Fractional KCU", "frKCU", 6, SHARED_IR,
    CLIFF, VESTING, 0,
  );
  const rcpt2 = await tx2.wait();
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
    } catch { await new Promise(r => setTimeout(r, 3000)); }
  }
  console.log(`  vault:    ${vaultAddr}`);
  console.log(`  fraction: ${fractionAddr}`);

  // ── Step 3: Deposit + add phase + activate ──
  console.log("\n=== Step 3: Deposit ===");
  const token = await ethers.getContractAt("CiretaToken", tokenAddr, issuer);
  await (await token.approve(saleAddr, MAX_SUPPLY)).wait();
  await (await (sale as any).depositProjectTokens(MAX_SUPPLY)).wait();

  console.log("\n=== Step 4: Add Seed phase ===");
  const phaseStart = startTime + 60n;
  const phaseEnd = endTime;
  await (await (sale as any).addPhase(
    "Seed",
    5_000n * 10n ** 6n,
    MAX_SUPPLY,
    500n, 36_000n, 1n,
    phaseStart, phaseEnd,
    false, 1, // Remaining
  )).wait();

  console.log("\n=== Step 5: Approve + activate ===");
  const saleAsAdmin = await ethers.getContractAt("Sale", saleAddr, admin);
  await (await (saleAsAdmin as any).approveSale()).wait();
  await (await (sale as any).activate()).wait();

  const out = {
    token: tokenAddr, sale: saleAddr, vault: vaultAddr, fraction: fractionAddr,
    compliance: complianceAddr, identityRegistry: SHARED_IR,
    saleStartTime: Number(startTime), saleEndTime: Number(endTime),
    phaseStart: Number(phaseStart), phaseEnd: Number(phaseEnd),
    cliffSeconds: Number(CLIFF),
  };
  console.log("\n=== DEPLOY COMPLETE ===");
  console.log(JSON.stringify(out, null, 2));
  fs.writeFileSync("/tmp/kcu-deploy.json", JSON.stringify(out, null, 2) + "\n");
}

main().catch(e => { console.error(e); process.exit(1); });
