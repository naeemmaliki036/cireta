/**
 * Verify every v2 contract on BaseScan.
 *
 * Reads addresses from deployments/<network>.v2.<date>.json (most recent
 * date-stamped file by default; override with V2_FILE=...).
 *
 * Verifies:
 *   - All implementation contracts via `hardhat verify`
 *   - All proxies via the OZ upgrades plugin so BaseScan links proxy → impl
 *   - The IssuerOTCToken impl (deployed via OZ Beacon-style by
 *     IssuerOTCTokenFactory — verified as a plain impl)
 *
 * Idempotent: BaseScan returns "Already Verified" for previously-verified
 * contracts and the script logs that and continues.
 *
 * Usage:
 *   BASESCAN_API_KEY=<your-key> \
 *     WEB3_RPC_URL=https://base-sepolia.infura.io/v3/<key> \
 *     npx hardhat run scripts/verify-v2-explorer.ts --network baseSepolia
 */

import { ethers, run, upgrades } from "hardhat";
import * as fs from "fs";
import * as path from "path";

interface AddressMap { [k: string]: string }

function loadAddresses(): { addr: AddressMap; file: string } {
  const dir = path.join(__dirname, "..", "deployments");
  let file: string;
  if (process.env.V2_FILE) {
    file = path.isAbsolute(process.env.V2_FILE)
      ? process.env.V2_FILE
      : path.join(dir, process.env.V2_FILE);
  } else {
    const stamped = fs.readdirSync(dir)
      .filter(f => /^base-sepolia\.v2\.\d{8}\.json$/.test(f))
      .sort().reverse();
    if (stamped.length === 0) {
      console.error("No base-sepolia.v2.<date>.json found in deployments/");
      process.exit(1);
    }
    file = path.join(dir, stamped[0]);
  }
  return { addr: JSON.parse(fs.readFileSync(file, "utf-8")), file };
}

async function verifyImpl(label: string, address: string) {
  if (!address) { console.log(`  ${label.padEnd(40)} : (no address — skip)`); return; }
  try {
    console.log(`  → ${label.padEnd(40)} ${address}`);
    await run("verify:verify", { address, constructorArguments: [] });
    console.log(`    ✓ verified`);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes("Already Verified") || msg.includes("already verified")) {
      console.log(`    ✓ already verified`);
    } else {
      console.log(`    ✗ ${msg.split("\n")[0]?.slice(0, 100)}`);
    }
  }
  // 300ms pause between calls — BaseScan rate-limits 2 req/sec on free tier.
  await new Promise(r => setTimeout(r, 350));
}

async function verifyProxy(label: string, address: string) {
  if (!address) { console.log(`  ${label.padEnd(40)} : (no proxy — skip)`); return; }
  try {
    console.log(`  → ${label.padEnd(40)} ${address}`);
    // verify:verify works for proxy too — Etherscan v2 API recognizes
    // EIP-1967 layout and links proxy ↔ impl automatically when both are verified.
    await run("verify:verify", { address, constructorArguments: [] });
    console.log(`    ✓ verified`);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes("Already Verified") || msg.includes("already verified")) {
      console.log(`    ✓ already verified`);
    } else {
      console.log(`    ✗ ${msg.split("\n")[0]?.slice(0, 100)}`);
    }
  }
  await new Promise(r => setTimeout(r, 350));
}

async function main() {
  if (!process.env.BASESCAN_API_KEY) {
    console.error("BASESCAN_API_KEY not set. Get one at https://basescan.org/myapikey");
    process.exit(1);
  }

  const { addr, file } = loadAddresses();
  console.log(`Loaded addresses from: ${path.basename(file)}`);
  console.log(`Network: ${(await ethers.provider.getNetwork()).chainId}`);

  console.log("\n── Implementation contracts ──────────────────────────────");
  await verifyImpl("CiretaToken impl",                    addr["tokenImplementation"]);
  await verifyImpl("SimpleIdentityRegistry impl",         addr["simpleIdentityRegistryImplementation"]);
  await verifyImpl("ModularCompliance impl",              addr["complianceImplementation"]);
  await verifyImpl("Sale impl",                           addr["saleImplementation"]);
  await verifyImpl("CiretaVault impl",                    addr["vaultImplementation"]);
  await verifyImpl("CiretaFractionToken1155 impl",        addr["fractionTokenImplementation"]);
  await verifyImpl("IssuerOTCToken impl",                 addr["otcTokenImplementation"]);

  console.log("\n── UUPS proxies ──────────────────────────────────────────");
  await verifyProxy("SimpleIdentityRegistry proxy",       addr["simpleIdentityRegistry"]);
  await verifyProxy("IssuerRegistry proxy",               addr["issuerRegistry"]);
  await verifyProxy("PlatformFeeManager proxy",           addr["platformFeeManager"]);
  await verifyProxy("CiretaTokenFactory proxy",           addr["tokenFactory"]);
  await verifyProxy("CiretaSaleFactory proxy",            addr["saleFactory"]);
  await verifyProxy("CiretaFractionFactory proxy",        addr["fractionFactory"]);
  await verifyProxy("IssuerOTCTokenFactory proxy",        addr["otcTokenFactory"]);

  console.log("\n── Compliance module proxies ─────────────────────────────");
  for (const k of [
    "countryAllowModule", "maxHolderCountModule", "maxOwnershipModule",
    "maxBalanceModule", "lockModule", "whitelistModule",
    "conditionalTransferModule", "transferRestrictModule",
    "timeLockedTransferModule", "timeTransfersLimitModule",
  ]) {
    await verifyProxy(k, addr[k]);
  }

  // CiretaUSDC is the kept v1 mock. Skip if already verified.
  console.log("\n── Other ─────────────────────────────────────────────────");
  await verifyImpl("CiretaUSDC (mock)",                   addr["ciretaUSDC"]);

  // Suppress "unused import" warning at compile time.
  void upgrades;

  console.log("\n✓ Done. Check https://sepolia.basescan.org/address/<addr>#code for each.");
}

main().catch(e => { console.error(e); process.exit(1); });
