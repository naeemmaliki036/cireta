/**
 * Deploy CiretaRedemptionFactory + RedemptionManager implementation.
 *
 * Steps:
 *   1. Deploy RedemptionManager implementation (logic contract).
 *   2. Deploy CiretaRedemptionFactory as a UUPS proxy, initialized with
 *      the implementation address and the platform admin as owner.
 *   3. Persist factory address + impl address into deployments/<network>.json.
 *
 * Environment vars:
 *   - PLATFORM_ADMIN_ADDRESS  (optional) — receives factory ownership; defaults to deployer.
 *
 * Run:
 *   localhost:    ./node_modules/.bin/hardhat run scripts/deploy-redemption-factory.ts --network localhost
 *   base sepolia: ./node_modules/.bin/hardhat run scripts/deploy-redemption-factory.ts --network baseSepolia
 */

import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";

const DEPLOYMENTS_DIR = path.join(__dirname, "..", "deployments");

function getNetworkName(chainId: bigint): string {
  const hn = process.env.HARDHAT_NETWORK;
  if (hn === "localhost" || hn === "hardhat") return "localhost";
  if (chainId === 84532n) return "base-sepolia";
  if (chainId === 8453n) return "base";
  if (chainId === 11155111n) return "sepolia";
  return "hardhat";
}

async function main() {
  const [deployer] = await ethers.getSigners();
  const network = await ethers.provider.getNetwork();
  const networkName = getNetworkName(network.chainId);
  const platformAdmin = process.env.PLATFORM_ADMIN_ADDRESS || deployer.address;

  console.log("╔══════════════════════════════════════════════════════╗");
  console.log("║  Deploy RedemptionManager impl + Factory             ║");
  console.log("╚══════════════════════════════════════════════════════╝");
  console.log(`  Deployer:       ${deployer.address}`);
  console.log(`  Network:        ${networkName} (chainId ${network.chainId})`);
  console.log(`  Platform admin: ${platformAdmin}`);

  // 1. Deploy RedemptionManager implementation
  console.log("\n[1/3] Deploying RedemptionManager implementation...");
  const RM = await ethers.getContractFactory("RedemptionManager");
  const rmImpl = await RM.deploy();
  await rmImpl.waitForDeployment();
  const rmImplAddr = await rmImpl.getAddress();
  console.log(`      → ${rmImplAddr}`);

  // 2. Deploy factory: logic impl + ERC1967Proxy (manual UUPS deploy because
  // OZ Upgrades plugin's network check is incompatible with this RPC).
  console.log("\n[2/3] Deploying CiretaRedemptionFactory implementation...");
  const Factory = await ethers.getContractFactory("CiretaRedemptionFactory");
  const factoryImpl = await Factory.deploy();
  await factoryImpl.waitForDeployment();
  const factoryImplAddr = await factoryImpl.getAddress();
  console.log(`      impl → ${factoryImplAddr}`);

  const initData = factoryImpl.interface.encodeFunctionData("initialize", [
    platformAdmin,
    rmImplAddr,
  ]);

  console.log("      Deploying ERC1967Proxy in front of impl...");
  const Proxy = await ethers.getContractFactory("ERC1967Proxy");
  const proxy = await Proxy.deploy(factoryImplAddr, initData);
  await proxy.waitForDeployment();
  const factoryAddr = await proxy.getAddress();
  console.log(`      proxy → ${factoryAddr}`);

  const factory = Factory.attach(factoryAddr) as any;
  let version: string | null = null;
  for (let attempt = 1; attempt <= 5; attempt++) {
    try {
      version = await factory.version();
      break;
    } catch (e: any) {
      if (attempt === 5) throw e;
      console.log(`      version() attempt ${attempt} failed (${e?.shortMessage || e?.code}); retrying in 3s...`);
      await new Promise((r) => setTimeout(r, 3000));
    }
  }
  console.log(`      version: ${version}`);

  // 3. Persist to deployments JSON
  console.log("\n[3/3] Saving deployment metadata...");
  const fileName = networkName === "hardhat" ? "localhost" : networkName;
  const deployFilePath = path.join(DEPLOYMENTS_DIR, `${fileName}.json`);

  let existing: Record<string, any> = {};
  if (fs.existsSync(deployFilePath)) {
    existing = JSON.parse(fs.readFileSync(deployFilePath, "utf-8"));
  }

  existing.redemptionManagerImplementation = rmImplAddr;
  existing.redemptionFactoryImplementation = factoryImplAddr;
  existing.redemptionFactory = factoryAddr;
  existing.redemptionFactoryVersion = version;
  existing.redemptionFactoryDeployedAt = new Date().toISOString();

  fs.writeFileSync(deployFilePath, JSON.stringify(existing, null, 2) + "\n");
  console.log(`      → ${deployFilePath}`);

  console.log("\n══════════════════════════════════════════════════════");
  console.log("DONE");
  console.log("══════════════════════════════════════════════════════");
  console.log(`  RedemptionManager impl:  ${rmImplAddr}`);
  console.log(`  CiretaRedemptionFactory: ${factoryAddr}`);
  console.log("");
  console.log("  Next: wire factoryAddr into the admin UI so issuers can");
  console.log("  deploy per-token RedemptionManagers from token settings.");
}

main().then(() => process.exit(0)).catch((e) => {
  console.error("\nFAILED:", e);
  process.exit(1);
});
