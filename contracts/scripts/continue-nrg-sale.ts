/**
 * Continuation for the NRG deploy — token + sale are already on-chain.
 * Picks up at step 3 (vault deposit) through activate.
 */
import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";

const TOKEN = "0x2fE32e67ea246ea4959E3697396e4015Dae67205";
const SALE = "0x24A8a38F7154B9b06d3E9EA3C646f1043E7EBd4a";
const VAULT = "0xC7D76B7CedAa0300F431f057a113437A4fe92052";
const FRACTION = "0x61E6d0E51987cf8643394a2E3903Fc6192C62009";
const COMPLIANCE = "0xa16749E93e7540869ab4fB5AFb2Dd5C7B9Abac4A";
const IDENTITY_REGISTRY = "0x5B344d1E07B57D36B8FD99b2e241dd7E8674d7BE";

const TOTAL_TOKEN_SUPPLY = 75_000n * 10n ** 6n; // 75K NRG @ 6 decimals

async function main() {
  const sandboxEnv = fs.readFileSync(path.join(__dirname, "..", "..", ".env.sandbox-e2e"), "utf-8");
  const getKey = (n: string) => "0x" + sandboxEnv.match(new RegExp(`^${n}=([0-9a-fA-Fx]+)`, "m"))![1].replace(/^0x/, "");

  const issuer = new ethers.Wallet(getKey("ISSUER_PRIVATE_KEY"), ethers.provider);
  const admin = new ethers.Wallet(getKey("ADMIN_PRIVATE_KEY"), ethers.provider);
  console.log(`Issuer: ${issuer.address}`);
  console.log(`Admin:  ${admin.address}`);

  const token = await ethers.getContractAt("CiretaToken", TOKEN, issuer);
  const sale = await ethers.getContractAt("Sale", SALE, issuer);
  const saleAsAdmin = await ethers.getContractAt("Sale", SALE, admin);

  // --- Read current sale state ---
  const status = await (sale as any).status();
  const phaseCount = await (sale as any).getPhaseCount();
  const approved = await (sale as any).approved();
  const issuerBal = await token.balanceOf(issuer.address);
  const vaultBal = await token.balanceOf(VAULT);
  console.log(`\nCurrent sale state:`);
  console.log(`  status:      ${status} (0=Draft)`);
  console.log(`  approved:    ${approved}`);
  console.log(`  phaseCount:  ${phaseCount}`);
  console.log(`  vault NRG balance:  ${ethers.formatUnits(vaultBal, 6)}`);
  console.log(`  issuer NRG balance: ${ethers.formatUnits(issuerBal, 6)}`);

  // === Step 3: Deposit tokens (if not already) ===
  if (vaultBal < TOTAL_TOKEN_SUPPLY) {
    console.log("\n=== Step 3: Deposit project tokens to vault ===");
    const need = TOTAL_TOKEN_SUPPLY - vaultBal;
    console.log(`Approving Sale for ${ethers.formatUnits(need, 6)} NRG...`);
    await (await token.approve(SALE, need)).wait();
    console.log(`Depositing...`);
    await (await (sale as any).depositProjectTokens(need)).wait();
    const newVaultBal = await token.balanceOf(VAULT);
    console.log(`  vault NRG: ${ethers.formatUnits(newVaultBal, 6)}`);
  } else {
    console.log("\n=== Step 3: SKIP (vault already has tokens) ===");
  }

  // === Step 4: Add Seed phase (if not already) ===
  if (phaseCount === 0n) {
    console.log("\n=== Step 4: Add Seed phase ===");
    const block = await ethers.provider.getBlock("latest");
    const now = BigInt(block!.timestamp);
    const saleStartTime = await (sale as any).saleStartTime();
    const saleEndTime = await (sale as any).saleEndTime();

    // Phase must fall inside [saleStartTime, saleEndTime].
    // For start: max(saleStartTime, now + 30) to give a buffer.
    const phaseStart = saleStartTime > now + 30n ? saleStartTime : now + 30n;
    const phaseEnd = saleEndTime;
    console.log(`  saleStartTime: ${saleStartTime} (${new Date(Number(saleStartTime) * 1000).toISOString()})`);
    console.log(`  saleEndTime:   ${saleEndTime} (${new Date(Number(saleEndTime) * 1000).toISOString()})`);
    console.log(`  phaseStart:    ${phaseStart}`);
    console.log(`  phaseEnd:      ${phaseEnd}`);

    const PRICE = 1_000n * 10n ** 6n;
    const ALLOC = TOTAL_TOKEN_SUPPLY;
    await (await (sale as any).addPhase(
      "Seed",
      PRICE,
      ALLOC,
      100n, // min: first-time buyer = 100 tokens = 100K USDC
      75_000n, // max: per-buyer cap
      1n,      // top-up
      phaseStart,
      phaseEnd,
      false,
      0, // Fixed
    )).wait();
    console.log(`  Seed phase added`);
  } else {
    console.log("\n=== Step 4: SKIP (phase already added) ===");
  }

  // === Step 5: Admin approve ===
  if (!approved) {
    console.log("\n=== Step 5a: Admin approveSale ===");
    await (await (saleAsAdmin as any).approveSale()).wait();
    console.log(`  approved`);
  } else {
    console.log("\n=== Step 5a: SKIP (already approved) ===");
  }

  // === Step 5b: Issuer activate (only if still Draft) ===
  const statusFinal = await (sale as any).status();
  if (statusFinal === 0n) {
    console.log("\n=== Step 5b: Issuer activate ===");
    await (await (sale as any).activate()).wait();
    console.log(`  activated. status now: ${await (sale as any).status()} (1=Active)`);
  } else {
    console.log(`\n=== Step 5b: SKIP (status=${statusFinal}) ===`);
  }

  // === Output ===
  const phase = await (sale as any).getPhase(0);
  const out = {
    token: TOKEN,
    sale: SALE,
    vault: VAULT,
    fraction: FRACTION,
    compliance: COMPLIANCE,
    identityRegistry: IDENTITY_REGISTRY,
    saleStartTime: Number(await (sale as any).saleStartTime()),
    saleEndTime: Number(await (sale as any).saleEndTime()),
    phase: {
      name: phase.name,
      pricePerToken: phase.pricePerToken.toString(),
      allocation: phase.allocation.toString(),
      startTime: Number(phase.startTime),
      endTime: Number(phase.endTime),
    },
    finalStatus: Number(await (sale as any).status()),
    cliffSeconds: 3600,
    vestingSeconds: 3600,
  };

  console.log("\n══════════════════════════════════════════════════════");
  console.log("ON-CHAIN STATE READY");
  console.log("══════════════════════════════════════════════════════");
  console.log(JSON.stringify(out, null, 2));
  fs.writeFileSync("/tmp/nrg-deploy.json", JSON.stringify(out, null, 2) + "\n");
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
