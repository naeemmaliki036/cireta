/**
 * Cireta Platform — Bulk Contract Verification on BaseScan
 *
 * Reads all addresses from deployments/base-sepolia.json and verifies each
 * contract on BaseScan (Base Sepolia).
 *
 * UUPS proxies: only implementation contracts are verified here.
 * Proxy contracts are auto-verified by BaseScan/Etherscan.
 *
 * Usage:
 *   npx hardhat run scripts/verify-all.ts --network baseSepolia
 */

import { run } from "hardhat";
import * as fs from "fs";
import * as path from "path";

const DEPLOYMENT_FILE = path.join(__dirname, "../deployments/base-sepolia.json");

/**
 * Map from deployment JSON key to the fully-qualified contract name.
 * All implementation contracts have no constructor args (_disableInitializers).
 * CiretaUSDC has a no-arg constructor as well.
 */
const CONTRACTS_TO_VERIFY: Record<string, { contract: string; constructorArgs: unknown[] }> = {
  // ─── Implementation contracts (UUPS, no constructor args) ───
  tokenImplementation: {
    contract: "src/token/CiretaToken.sol:CiretaToken",
    constructorArgs: [],
  },
  simpleIdentityRegistryImplementation: {
    contract: "src/identity/SimpleIdentityRegistry.sol:SimpleIdentityRegistry",
    constructorArgs: [],
  },
  complianceImplementation: {
    contract: "src/token/ModularCompliance.sol:ModularCompliance",
    constructorArgs: [],
  },
  saleImplementation: {
    contract: "src/sale/Sale.sol:Sale",
    constructorArgs: [],
  },
  fractionTokenImplementation: {
    contract: "src/fraction/CiretaFractionToken.sol:CiretaFractionToken",
    constructorArgs: [],
  },
  vaultImplementation: {
    contract: "src/vault/CiretaVault.sol:CiretaVault",
    constructorArgs: [],
  },

  // ─── Standalone contracts (no constructor args) ───
  ciretaUSDC: {
    contract: "src/token/CiretaUSDC.sol:CiretaUSDC",
    constructorArgs: [],
  },

  // ─── Compliance modules (UUPS, no constructor args) ───
  countryAllowModule: {
    contract: "src/compliance/CountryAllowModule.sol:CountryAllowModule",
    constructorArgs: [],
  },
  maxHolderCountModule: {
    contract: "src/compliance/MaxHolderCountModule.sol:MaxHolderCountModule",
    constructorArgs: [],
  },

  // ─── Factory & platform proxies — skip proxy, verify implementation ───
  // These are UUPS proxies. BaseScan auto-verifies the proxy wrapper.
  // The underlying implementation has _disableInitializers() with no args.
  // We skip these because `hardhat verify` on a proxy address tries to
  // verify the proxy bytecode, not the implementation. If you need to
  // force-verify an implementation behind a proxy, use the implementation
  // address from the proxy's storage slot 0x360894...
  //
  // issuerRegistry:  SKIP (proxy)
  // platformFeeManager: SKIP (proxy)
  // tokenFactory: SKIP (proxy)
  // saleFactory: SKIP (proxy)
  // fractionFactory: SKIP (proxy)
};

interface VerifyResult {
  key: string;
  address: string;
  status: "verified" | "already-verified" | "failed";
  message?: string;
}

async function main() {
  // ── Load deployment addresses ──
  if (!fs.existsSync(DEPLOYMENT_FILE)) {
    throw new Error(`Deployment file not found: ${DEPLOYMENT_FILE}`);
  }
  const deployments = JSON.parse(fs.readFileSync(DEPLOYMENT_FILE, "utf-8"));

  console.log("=".repeat(60));
  console.log("Cireta — BaseScan Contract Verification");
  console.log("=".repeat(60));
  console.log(`Deployment file: ${DEPLOYMENT_FILE}`);
  console.log(`Contracts to verify: ${Object.keys(CONTRACTS_TO_VERIFY).length}`);
  console.log("");

  const results: VerifyResult[] = [];

  for (const [key, config] of Object.entries(CONTRACTS_TO_VERIFY)) {
    const address = deployments[key];
    if (!address) {
      console.log(`[SKIP] ${key} — not found in deployment file`);
      results.push({ key, address: "N/A", status: "failed", message: "Not in deployment file" });
      continue;
    }

    console.log(`[VERIFY] ${key} at ${address}`);
    console.log(`         Contract: ${config.contract}`);

    try {
      await run("verify:verify", {
        address,
        contract: config.contract,
        constructorArguments: config.constructorArgs,
      });
      console.log(`  => SUCCESS`);
      results.push({ key, address, status: "verified" });
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);

      // Hardhat verify throws if contract is already verified
      if (
        msg.includes("Already Verified") ||
        msg.includes("already verified") ||
        msg.includes("Contract source code already verified")
      ) {
        console.log(`  => ALREADY VERIFIED`);
        results.push({ key, address, status: "already-verified" });
      } else {
        console.error(`  => FAILED: ${msg}`);
        results.push({ key, address, status: "failed", message: msg });
      }
    }

    console.log("");
  }

  // ── Summary ──
  console.log("=".repeat(60));
  console.log("VERIFICATION SUMMARY");
  console.log("=".repeat(60));

  const verified = results.filter((r) => r.status === "verified");
  const alreadyVerified = results.filter((r) => r.status === "already-verified");
  const failed = results.filter((r) => r.status === "failed");

  console.log(`  Verified:         ${verified.length}`);
  console.log(`  Already verified: ${alreadyVerified.length}`);
  console.log(`  Failed:           ${failed.length}`);
  console.log("");

  if (verified.length > 0) {
    console.log("Newly verified:");
    for (const r of verified) {
      console.log(`  - ${r.key}: ${r.address}`);
    }
    console.log("");
  }

  if (failed.length > 0) {
    console.log("Failed:");
    for (const r of failed) {
      console.log(`  - ${r.key}: ${r.address} — ${r.message}`);
    }
    console.log("");
  }

  // ── Skipped proxy contracts ──
  const proxyKeys = ["issuerRegistry", "platformFeeManager", "tokenFactory", "saleFactory", "fractionFactory"];
  const skippedProxies = proxyKeys.filter((k) => deployments[k]);
  if (skippedProxies.length > 0) {
    console.log("Skipped UUPS proxies (auto-verified by BaseScan):");
    for (const k of skippedProxies) {
      console.log(`  - ${k}: ${deployments[k]}`);
    }
    console.log("");
  }

  if (failed.length > 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
