/**
 * One-off: verify already-deployed CiretaRedemptionFactory on base-sepolia
 * and persist the metadata. Used after deploy-redemption-factory.ts failed
 * its post-deploy version() check (RPC indexing race).
 */
import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";

const RM_IMPL = "0x0162526D24aA5f824FBdF7aE5b8522A3E42bF2dB";
const FACTORY_IMPL = "0x1b1Acdaf92e9de4CC268888415b03041Ba3aabf8";
const FACTORY = "0x2C87c774728EE581b3e39B4562B65676b203E6B4";

async function main() {
  const factory = await ethers.getContractAt("CiretaRedemptionFactory", FACTORY);

  let version: string | null = null;
  for (let i = 1; i <= 6; i++) {
    try {
      version = await (factory as any).version();
      break;
    } catch (e: any) {
      console.log(`attempt ${i}: ${e?.shortMessage || e?.code}`);
      await new Promise((r) => setTimeout(r, 3000));
    }
  }
  console.log("version:", version);

  const owner = await (factory as any).owner();
  const impl = await (factory as any).redemptionManagerImplementation();
  console.log("owner:", owner);
  console.log("redemptionManagerImpl:", impl);

  const filePath = path.join(__dirname, "..", "deployments", "base-sepolia.json");
  const existing = JSON.parse(fs.readFileSync(filePath, "utf-8"));
  existing.redemptionManagerImplementation = RM_IMPL;
  existing.redemptionFactoryImplementation = FACTORY_IMPL;
  existing.redemptionFactory = FACTORY;
  existing.redemptionFactoryVersion = version;
  existing.redemptionFactoryDeployedAt = new Date().toISOString();
  fs.writeFileSync(filePath, JSON.stringify(existing, null, 2) + "\n");
  console.log("saved → base-sepolia.json");
}

main().then(() => process.exit(0)).catch((e) => {
  console.error(e);
  process.exit(1);
});
