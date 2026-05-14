/**
 * Deploy SWZCUP (Ultra-Fine Copper Powder) — direct-mode sale on base-sepolia.
 *
 * Uses CiretaSaleFactory.deploySale() (direct, NOT deploySaleVested).
 * No vault, no fraction, no cliff — tokens delivered immediately on buy().
 *
 * Run:
 *   ./node_modules/.bin/hardhat run scripts/deploy-swzcup-sale.ts --network baseSepolia
 */
import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";

const TOKEN_FACTORY = "0x14e2A35c35DC58d4eB6BFE329811Ca1bDbbF94E4";
const SALE_FACTORY = "0xFfC765aB999CF3D718Aa81869DE3D32Ff3E0d2d9";
const PFM = "0xA6d90EAf016981d706474C8E3e56EB3D1859640b";
const USDC = "0x3Bfb6B62C015EE815e5Eb0A7e212F580446D9898";
const SHARED_IR = "0x5B344d1E07B57D36B8FD99b2e241dd7E8674d7BE";

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

  // ── Step 1: Deploy SWZCUP token ──
  console.log("\n=== Step 1: Deploy SWZCUP token ===");
  const tokenFactory = await ethers.getContractAt("CiretaTokenFactory", TOKEN_FACTORY, issuer);
  const MAX_SUPPLY = 1_000n * 10n ** 6n; // 1000 tokens @ 6 decimals
  const tx1 = await (tokenFactory as any).deployToken(
    "Ultra-Fine Copper Powder Token", "SWZCUP", 6, issuer.address, SHARED_IR,
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

  // ── Step 2: Deploy direct-mode sale ──
  console.log("\n=== Step 2: Deploy direct-mode Sale ===");
  const block = await ethers.provider.getBlock("latest");
  const nowTs = BigInt(block!.timestamp);
  const startTime = nowTs + 60n;
  const endTime = startTime + 365n * 86400n;

  const SOFT_CAP = 70_000n * 10n ** 6n;        // 70K USDC = 1 kg (any single buy passes)
  const HARD_CAP = 70_000_000n * 10n ** 6n;    // 70M USDC

  const SaleFactory = await ethers.getContractFactory("Sale");
  const initData = SaleFactory.interface.encodeFunctionData("initialize", [
    tokenAddr, USDC, SHARED_IR, issuer.address,
    SALE_FACTORY, PFM,
    SOFT_CAP, HARD_CAP, feeBps, 0n,
    ethers.ZeroAddress, startTime, endTime, MAX_SUPPLY,
  ]);

  const saleFactory = await ethers.getContractAt("CiretaSaleFactory", SALE_FACTORY, issuer);
  // deploySale = DIRECT mode (no vault/fraction deploy)
  const tx2 = await (saleFactory as any).deploySale(tokenAddr, initData);
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

  // ── Step 3: Transfer tokens directly to Sale (no vault for direct mode) ──
  console.log("\n=== Step 3: Transfer SWZCUP to Sale contract ===");
  const token = await ethers.getContractAt("CiretaToken", tokenAddr, issuer);
  await (await token.transfer(saleAddr, MAX_SUPPLY)).wait();
  console.log(`  Sale SWZCUP: ${ethers.formatUnits(await token.balanceOf(saleAddr), 6)}`);

  // ── Step 4: Add the public direct-sale phase ──
  console.log("\n=== Step 4: Add Direct Sale phase ===");
  const phaseStart = startTime + 60n;
  const phaseEnd = endTime;
  await (await (sale as any).addPhase(
    "Direct Sale",
    70_000n * 10n ** 6n,        // 70K USDC per token
    MAX_SUPPLY,                 // full supply
    1n,                         // min 1 token = 1 kg
    1_000n,                     // max 1000 tokens per buyer (= total supply)
    1n,                         // top-up min
    phaseStart, phaseEnd,
    false, 0,                   // not whitelistOnly, AllocationMode.Fixed
  )).wait();
  console.log(`  Phase added — ${new Date(Number(phaseStart) * 1000).toISOString()} → ${new Date(Number(phaseEnd) * 1000).toISOString()}`);

  // ── Step 5: Approve + activate ──
  console.log("\n=== Step 5: Admin approve + issuer activate ===");
  const saleAsAdmin = await ethers.getContractAt("Sale", saleAddr, admin);
  await (await (saleAsAdmin as any).approveSale()).wait();
  await (await (sale as any).activate()).wait();
  console.log(`  status: ${await (sale as any).status()} (1=Active)`);

  const out = {
    token: tokenAddr,
    sale: saleAddr,
    compliance: complianceAddr,
    identityRegistry: SHARED_IR,
    startTime: Number(startTime),
    endTime: Number(endTime),
    phaseStart: Number(phaseStart),
    phaseEnd: Number(phaseEnd),
  };

  console.log("\n══════════════════════════════════════════════════════");
  console.log("SWZCUP DEPLOY COMPLETE");
  console.log("══════════════════════════════════════════════════════");
  console.log(JSON.stringify(out, null, 2));
  fs.writeFileSync("/tmp/swzcup-deploy.json", JSON.stringify(out, null, 2) + "\n");
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
