/**
 * Deploy a new Sale implementation (Option-A fee routing — fees flow direct
 * to the PFM's feeReceiver EOA at finalize) and point CiretaSaleFactory at
 * it. EXISTING sales are NOT upgraded (each sale is its own UUPS proxy with
 * its own _authorizeUpgrade) — only NEW sales deployed by the factory after
 * this run get the fix. This matches the user's intent.
 */

import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";
import type { TransactionReceipt } from "ethers";

async function main() {
  const provider = ethers.provider;
  const admin = new ethers.Wallet(process.env.ADMIN_PRIVATE_KEY!, provider);

  const v2Path = path.join(__dirname, "..", "deployments", "base-sepolia.v2.20260430.json");
  const v2 = JSON.parse(fs.readFileSync(v2Path, "utf-8")) as Record<string, string>;
  const SALE_FACTORY = v2.saleFactory!;
  const OLD_SALE_IMPL = v2.saleImplementation!;

  console.log("\n  Sale-impl upgrade — Option A (fee routing fix)");
  console.log(`  admin            ${admin.address}`);
  console.log(`  saleFactory      ${SALE_FACTORY}`);
  console.log(`  old saleImpl     ${OLD_SALE_IMPL}\n`);

  // 1. Deploy new Sale implementation
  console.log("  Deploying new Sale impl…");
  const SaleF = (await ethers.getContractFactory("Sale")).connect(admin);
  const newImpl = await SaleF.deploy();
  await newImpl.waitForDeployment();
  const newAddr = await newImpl.getAddress();
  console.log(`  ✓ New Sale impl: ${newAddr}`);

  // 2. Update SaleFactory's saleImplementation pointer (so future deploySale
  //    proxies clone the new impl).
  const factoryIface = (await ethers.getContractFactory("CiretaSaleFactory")).interface;
  const setterFragment = factoryIface.fragments.find(
    (f) => f.type === "function" && f.name === "setSaleImplementation"
  );
  if (!setterFragment) {
    throw new Error("CiretaSaleFactory has no setSaleImplementation(address) — abort.");
  }
  const factory = await ethers.getContractAt("CiretaSaleFactory", SALE_FACTORY, admin);
  console.log("  Pointing SaleFactory at new impl…");
  const tx = await factory.setSaleImplementation(newAddr);
  const r = (await tx.wait()) as TransactionReceipt;
  if (r.status !== 1) throw new Error(`setSaleImplementation reverted ${r.hash}`);
  console.log(`  ✓ SaleFactory.setSaleImplementation tx: https://sepolia.basescan.org/tx/${r.hash}`);

  // 3. Verify
  const readImpl = await factory.saleImplementation();
  console.log(`\n  Factory.saleImplementation() = ${readImpl}`);
  if (readImpl.toLowerCase() !== newAddr.toLowerCase()) {
    throw new Error(`Mismatch — factory still points at ${readImpl}`);
  }
  console.log("\n  ✓ Done. Future Sale deploys will route fees to PFM.feeReceiver EOA.");
  console.log("    Existing 4 sales (AGENT/TIN/SILVER/MNA03) keep the old routing.\n");
}

main().catch((e) => { console.error("Fatal:", e instanceof Error ? e.message : String(e)); process.exit(1); });
