/**
 * Deploy NRG (Neuro Rehab Ghana) token + vested-mode Sale + Seed phase on base-sepolia.
 *
 * Steps:
 *   1. Deploy CiretaToken proxy via CiretaTokenFactory.deployToken() (issuer signer)
 *   2. Deploy vested Sale via CiretaSaleFactory.deploySaleVested() (issuer signer)
 *   3. Issuer deposits the entire token supply into the vault
 *   4. Issuer adds the Seed phase
 *   5. Admin approveSale, issuer activate
 *
 * Run:
 *   ./node_modules/.bin/hardhat run scripts/deploy-nrg-sale.ts --network baseSepolia
 *
 * Requires in env: ISSUER_PRIVATE_KEY, ADMIN_PRIVATE_KEY (from ../.env.sandbox-e2e)
 *
 * Outputs token / sale / vault / fraction / identityRegistry addresses for the
 * caller to insert into the DB.
 */

import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";

const DEPLOY_FILE = path.join(__dirname, "..", "deployments", "base-sepolia.json");

interface Out {
  token: string;
  identityRegistry: string;
  compliance: string;
  sale: string;
  vault: string;
  fraction: string;
  startTime: number;
  endTime: number;
  phaseStart: number;
  phaseEnd: number;
}

async function main() {
  // ── Signers ────────────────────────────────────────────────────────────
  // .env.sandbox-e2e holds ISSUER_PRIVATE_KEY + ADMIN_PRIVATE_KEY
  const sandboxEnv = fs.readFileSync(path.join(__dirname, "..", "..", ".env.sandbox-e2e"), "utf-8");
  const getKey = (name: string) => {
    const m = sandboxEnv.match(new RegExp(`^${name}=([0-9a-fA-Fx]+)`, "m"));
    if (!m) throw new Error(`${name} not in .env.sandbox-e2e`);
    return m[1].startsWith("0x") ? m[1] : "0x" + m[1];
  };

  const issuerKey = getKey("ISSUER_PRIVATE_KEY");
  const adminKey = getKey("ADMIN_PRIVATE_KEY");

  const issuer = new ethers.Wallet(issuerKey, ethers.provider);
  const admin = new ethers.Wallet(adminKey, ethers.provider);
  console.log(`Issuer signer: ${issuer.address}`);
  console.log(`Admin signer:  ${admin.address}`);

  // ── Canonical live sandbox addresses (Railway env) ─────────────────────
  // deployments/base-sepolia.json is STALE — these are what the working
  // admin UI uses and what every existing sandbox token (LONG/OPEN/...) was
  // deployed through.
  const tokenFactoryAddr = "0x14e2A35c35DC58d4eB6BFE329811Ca1bDbbF94E4";
  const saleFactoryAddr = "0xFfC765aB999CF3D718Aa81869DE3D32Ff3E0d2d9";
  const platformFeeManagerAddr = "0xA6d90EAf016981d706474C8E3e56EB3D1859640b";
  const usdcAddr = "0x3Bfb6B62C015EE815e5Eb0A7e212F580446D9898";
  const sharedIdentityRegistry = "0x5B344d1E07B57D36B8FD99b2e241dd7E8674d7BE";

  console.log(`\nFactories (live sandbox):`);
  console.log(`  tokenFactory:       ${tokenFactoryAddr}`);
  console.log(`  saleFactory:        ${saleFactoryAddr}`);
  console.log(`  platformFeeManager: ${platformFeeManagerAddr}`);
  console.log(`  USDC:               ${usdcAddr}`);
  console.log(`  identityRegistry:   ${sharedIdentityRegistry}  (shared platform IR)`);

  // ── Read issuer's platform fee ─────────────────────────────────────────
  const pfm = await ethers.getContractAt("PlatformFeeManager", platformFeeManagerAddr);
  const feeBps = await pfm.getFeeForIssuer(issuer.address);
  console.log(`\nIssuer platform fee: ${feeBps} bps`);

  // ════════════════════════════════════════════════════════════════════════
  // STEP 1: Deploy NRG token
  // ════════════════════════════════════════════════════════════════════════
  console.log("\n=== Step 1: Deploy NRG token ===");
  const tokenFactory = await ethers.getContractAt("CiretaTokenFactory", tokenFactoryAddr, issuer);

  // Pass the SHARED platform identity registry so investors KYC'd on prior
  // sales can buy this one without re-whitelisting.
  const NRG_NAME = "Neuro Rehab Ghana";
  const NRG_SYMBOL = "NRG";
  const DECIMALS = 6;
  const MAX_SUPPLY = 75_000n * 10n ** 6n; // 75,000 tokens at 6 decimals

  const deployTokenTx = await tokenFactory.deployToken(
    NRG_NAME,
    NRG_SYMBOL,
    DECIMALS,
    issuer.address,
    sharedIdentityRegistry,
    MAX_SUPPLY,
    false, // mintable
    MAX_SUPPLY, // pre-mint full supply to issuer
  );
  const deployTokenReceipt = await deployTokenTx.wait();
  console.log(`tx: ${deployTokenReceipt!.hash}`);

  // Parse TokenDeployed event for the addresses
  const tokenDeployedTopic = ethers.id("TokenDeployed(address,address,address,address)");
  const evt = deployTokenReceipt!.logs.find((l: any) => l.topics[0] === tokenDeployedTopic);
  if (!evt) {
    // Fallback: derive from returned tuple via callStatic
    console.log("(no TokenDeployed event; reading return values manually)");
  }
  // Easiest: parse from receipt by name
  const iface = tokenFactory.interface;
  let tokenAddr = "";
  let identityRegistryAddr = "";
  let complianceAddr = "";
  for (const log of deployTokenReceipt!.logs) {
    try {
      const parsed = iface.parseLog({ topics: [...log.topics], data: log.data });
      if (parsed && parsed.name === "TokenDeployed") {
        tokenAddr = parsed.args.token;
        identityRegistryAddr = parsed.args.identityRegistry;
        complianceAddr = parsed.args.compliance;
        break;
      }
    } catch {
      // not from this contract
    }
  }
  console.log(`  token:            ${tokenAddr}`);
  console.log(`  identityRegistry: ${identityRegistryAddr}`);
  console.log(`  compliance:       ${complianceAddr}`);

  if (!tokenAddr) throw new Error("Could not find TokenDeployed event in receipt");

  // ════════════════════════════════════════════════════════════════════════
  // STEP 2: Deploy vested Sale
  // ════════════════════════════════════════════════════════════════════════
  console.log("\n=== Step 2: Deploy vested-mode Sale ===");

  // Sale window: now + 60s → now + 90 days
  const block = await ethers.provider.getBlock("latest");
  const blockTs = BigInt(block!.timestamp);
  const startTime = blockTs + 60n;
  const endTime = startTime + 90n * 86400n;

  const SOFT_CAP = 100_000n * 10n ** 6n; // 100K USDC
  const HARD_CAP = 75_000_000n * 10n ** 6n; // 75M USDC
  const TOTAL_TOKEN_SUPPLY = MAX_SUPPLY; // 75K tokens at 6 decimals

  // Encode Sale.initialize() — use any Sale contract for ABI encoding (we use
  // the freshly-deployed token here just to get the interface).
  const saleImpl = await ethers.getContractFactory("Sale");
  const initData = saleImpl.interface.encodeFunctionData("initialize", [
    tokenAddr,
    usdcAddr,
    identityRegistryAddr,
    issuer.address,
    saleFactoryAddr, // factory
    platformFeeManagerAddr, // feeManager
    SOFT_CAP,
    HARD_CAP,
    feeBps,
    0n, // feeCapUsdc
    ethers.ZeroAddress, // otcToken (none for now)
    startTime,
    endTime,
    TOTAL_TOKEN_SUPPLY,
  ]);

  const saleFactory = await ethers.getContractAt("CiretaSaleFactory", saleFactoryAddr, issuer);

  // Vault excessPolicy: 0 = Keep (default; unsold stays in vault, withdrawn via withdrawExcess)
  const FRACTION_NAME = "Fractional NRG";
  const FRACTION_SYMBOL = "frNRG";
  const CLIFF = 3600n; // 1 hour (sandbox-testable)
  const VESTING = 3600n; // cliff-only

  const deploySaleTx = await saleFactory.deploySaleVested(
    tokenAddr,
    initData,
    FRACTION_NAME,
    FRACTION_SYMBOL,
    DECIMALS,
    identityRegistryAddr,
    CLIFF,
    VESTING,
    0, // ExcessPolicy.Keep
  );
  const deploySaleReceipt = await deploySaleTx.wait();
  console.log(`tx: ${deploySaleReceipt!.hash}`);

  // Parse SaleDeployed event
  let saleAddr = "";
  for (const log of deploySaleReceipt!.logs) {
    try {
      const parsed = saleFactory.interface.parseLog({ topics: [...log.topics], data: log.data });
      if (parsed && parsed.name === "SaleDeployed") {
        saleAddr = parsed.args.sale;
        break;
      }
    } catch {
      // skip
    }
  }
  if (!saleAddr) throw new Error("Could not find SaleDeployed event");
  console.log(`  sale: ${saleAddr}`);

  // Read vault + fraction from the Sale contract directly
  const saleC = await ethers.getContractAt("Sale", saleAddr, issuer);
  const vaultAddr = await saleC.vault();
  const fractionAddr = await saleC.fractionToken();
  console.log(`  vault:    ${vaultAddr}`);
  console.log(`  fraction: ${fractionAddr}`);

  // ════════════════════════════════════════════════════════════════════════
  // STEP 3: Issuer deposits tokens
  // ════════════════════════════════════════════════════════════════════════
  console.log("\n=== Step 3: Deposit project tokens to vault ===");
  const projectToken = await ethers.getContractAt("CiretaToken", tokenAddr, issuer);

  // Issuer needs to approve the Sale for the deposit (Sale.depositProjectTokens
  // calls token.transferFrom(issuer, this) then transfers to vault).
  console.log(`Approving Sale for ${ethers.formatUnits(TOTAL_TOKEN_SUPPLY, 6)} NRG...`);
  await (await projectToken.approve(saleAddr, TOTAL_TOKEN_SUPPLY)).wait();
  console.log(`Depositing ${ethers.formatUnits(TOTAL_TOKEN_SUPPLY, 6)} NRG into vault...`);
  await (await saleC.depositProjectTokens(TOTAL_TOKEN_SUPPLY)).wait();
  console.log(`  vault balance: ${ethers.formatUnits(await projectToken.balanceOf(vaultAddr), 6)} NRG`);

  // ════════════════════════════════════════════════════════════════════════
  // STEP 4: Add Seed phase
  // ════════════════════════════════════════════════════════════════════════
  console.log("\n=== Step 4: Add Seed phase ===");
  const phaseStart = startTime + 60n; // give a small buffer after sale start
  const phaseEnd = endTime;
  const PRICE_PER_TOKEN = 1_000n * 10n ** 6n; // 1000 USDC per whole token
  const PHASE_ALLOCATION = TOTAL_TOKEN_SUPPLY; // full 75K
  const MIN_TOKENS = 100n; // first-time buyer min
  const MAX_TOKENS = 75_000n; // per-buyer cap
  const TOP_UP_MIN = 1n; // 1 token = 1K USDC

  const addPhaseTx = await saleC.addPhase(
    "Seed",
    PRICE_PER_TOKEN,
    PHASE_ALLOCATION,
    MIN_TOKENS,
    MAX_TOKENS,
    TOP_UP_MIN,
    phaseStart,
    phaseEnd,
    false, // whitelistOnly
    0, // AllocationMode.Fixed
  );
  await addPhaseTx.wait();
  console.log(`  Seed phase added (1000 USDC/NRG, 75K alloc, runs ${new Date(Number(phaseStart) * 1000).toISOString()} → ${new Date(Number(phaseEnd) * 1000).toISOString()})`);

  // ════════════════════════════════════════════════════════════════════════
  // STEP 5: Admin approve + issuer activate
  // ════════════════════════════════════════════════════════════════════════
  console.log("\n=== Step 5: Admin approveSale + issuer activate ===");
  const saleAsAdmin = await ethers.getContractAt("Sale", saleAddr, admin);
  await (await saleAsAdmin.approveSale()).wait();
  console.log(`  approved by admin`);

  await (await saleC.activate()).wait();
  console.log(`  activated by issuer`);

  const status = await saleC.status();
  console.log(`  sale.status() = ${status} (1 = Active)`);

  // ── Output for DB step ──────────────────────────────────────────────────
  const out: Out = {
    token: tokenAddr,
    identityRegistry: identityRegistryAddr,
    compliance: complianceAddr,
    sale: saleAddr,
    vault: vaultAddr,
    fraction: fractionAddr,
    startTime: Number(startTime),
    endTime: Number(endTime),
    phaseStart: Number(phaseStart),
    phaseEnd: Number(phaseEnd),
  };

  console.log("\n══════════════════════════════════════════════════════");
  console.log("CONTRACT DEPLOY DONE");
  console.log("══════════════════════════════════════════════════════");
  console.log(JSON.stringify(out, null, 2));

  // Save to /tmp for the DB-insert step
  const outPath = "/tmp/nrg-deploy.json";
  fs.writeFileSync(outPath, JSON.stringify(out, null, 2) + "\n");
  console.log(`\nSaved deploy artifacts → ${outPath}`);
}

main().then(() => process.exit(0)).catch((e) => {
  console.error("\nFAILED:", e);
  process.exit(1);
});
