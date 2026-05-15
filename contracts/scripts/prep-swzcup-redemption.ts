/**
 * Path A pre-flight for the SWZCUP redemption E2E:
 *   1. deployRedemptionManager(SWZCUP)        — issuer signs (also tries IR whitelist auto)
 *   2. addToWhitelist(rm, 0)                  — admin signs (idempotent: skip if verified)
 *   3. grantRole(SUPPLY_ROLE, rm)             — issuer signs (so RM can burn)
 *
 * Outputs the new RM address so we can patch the DB row.
 *
 * Run:
 *   ./node_modules/.bin/hardhat run scripts/prep-swzcup-redemption.ts --network baseSepolia
 */

import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";

const REDEMPTION_FACTORY = "0x2C87c774728EE581b3e39B4562B65676b203E6B4";
const IDENTITY_REGISTRY = "0x5B344d1E07B57D36B8FD99b2e241dd7E8674d7BE";
const SWZCUP_TOKEN = "0xf57836E6CE6a5A3ff1ABd15bA562fF3979e43C30";

const SUPPLY_ROLE_HASH = ethers.id("SUPPLY_ROLE");

async function main() {
  const sandboxEnv = fs.readFileSync(
    path.join(__dirname, "..", "..", ".env.sandbox-e2e"),
    "utf-8",
  );
  const getKey = (n: string) =>
    "0x" +
    sandboxEnv
      .match(new RegExp(`^${n}=([0-9a-fA-Fx]+)`, "m"))![1]
      .replace(/^0x/, "");
  const issuer = new ethers.Wallet(getKey("ISSUER_PRIVATE_KEY"), ethers.provider);
  const admin = new ethers.Wallet(getKey("ADMIN_PRIVATE_KEY"), ethers.provider);
  console.log("issuer:", issuer.address);
  console.log("admin :", admin.address);

  // ── 1. Deploy RedemptionManager for SWZCUP ──
  console.log("\n=== Step 1: deployRedemptionManager(SWZCUP) ===");
  const factory = await ethers.getContractAt(
    "CiretaRedemptionFactory",
    REDEMPTION_FACTORY,
    issuer,
  );
  // Skip if already deployed
  let rmAddr = "";
  try {
    rmAddr = await (factory as any).tokenRedemptionManager(SWZCUP_TOKEN);
  } catch {}
  if (rmAddr && rmAddr !== ethers.ZeroAddress) {
    console.log("  already deployed:", rmAddr);
  } else {
    const tx = await (factory as any).deployRedemptionManager(SWZCUP_TOKEN);
    const rcpt = await tx.wait();
    console.log("  tx:", rcpt.hash);
    for (const log of rcpt.logs) {
      try {
        const parsed = factory.interface.parseLog({
          topics: [...log.topics],
          data: log.data,
        });
        if (parsed?.name === "RedemptionManagerDeployed") {
          rmAddr =
            (parsed.args.redemptionManager as string) ||
            (parsed.args[1] as string);
          break;
        }
      } catch {}
    }
    if (!rmAddr) {
      // Retry on the view
      for (let i = 0; i < 5; i++) {
        await new Promise((r) => setTimeout(r, 2000));
        rmAddr = await (factory as any).tokenRedemptionManager(SWZCUP_TOKEN);
        if (rmAddr && rmAddr !== ethers.ZeroAddress) break;
      }
    }
    console.log("  rm:", rmAddr);
  }
  if (!rmAddr || rmAddr === ethers.ZeroAddress) {
    throw new Error("RM address not resolved");
  }

  // ── 2. Whitelist RM on IR (idempotent) ──
  console.log("\n=== Step 2: addToWhitelist(rm) on IR ===");
  const ir = await ethers.getContractAt(
    "SimpleIdentityRegistry",
    IDENTITY_REGISTRY,
    admin,
  );
  const alreadyVerified = await (ir as any).isVerified(rmAddr);
  if (alreadyVerified) {
    console.log("  already whitelisted ✓");
  } else {
    const tx = await (ir as any).addToWhitelist(rmAddr, 0);
    const rcpt = await tx.wait();
    console.log("  tx:", rcpt.hash);
  }

  // ── 3. Grant SUPPLY_ROLE to RM on SWZCUP ──
  console.log("\n=== Step 3: grantRole(SUPPLY_ROLE, rm) on SWZCUP ===");
  const token = await ethers.getContractAt("CiretaToken", SWZCUP_TOKEN, issuer);
  const hasRole = await (token as any).hasRole(SUPPLY_ROLE_HASH, rmAddr);
  if (hasRole) {
    console.log("  already has SUPPLY_ROLE ✓");
  } else {
    const tx = await (token as any).grantRole(SUPPLY_ROLE_HASH, rmAddr);
    const rcpt = await tx.wait();
    console.log("  tx:", rcpt.hash);
  }

  console.log("\n══════════════════════════════════════════════════");
  console.log("PATH A PREP COMPLETE");
  console.log("══════════════════════════════════════════════════");
  console.log(JSON.stringify({ swzcup_token: SWZCUP_TOKEN, redemption_manager: rmAddr }, null, 2));
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
