/**
 * Deploy Round-6 Sale implementation and rewire CiretaSaleFactory to use it.
 *
 * What this script does:
 *   1. Deploy the new Sale logic contract (no proxy — it's an implementation).
 *   2. Verify it reports version() == "6.0.0".
 *   3. Look up the CiretaSaleFactory address from contracts/deployments/<network>.json.
 *   4. Call factory.setSaleImplementation(newImpl) — onlyOwner.
 *   5. Save the new impl address back to the deployment JSON under
 *      `saleImplementation` so future deploys use it.
 *
 * What this script does NOT do:
 *   - Upgrade existing Sale proxies. UUPS upgrade is per-proxy and the user
 *     has explicitly said "forget about already deployed instances." Future
 *     sales deployed via the factory will use the new impl automatically.
 *
 * Run:
 *   localhost:    ./node_modules/.bin/hardhat run scripts/deploy-sale-impl-v6.ts --network localhost
 *   base sepolia: ./node_modules/.bin/hardhat run scripts/deploy-sale-impl-v6.ts --network baseSepolia
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

  console.log("╔══════════════════════════════════════════════════════╗");
  console.log("║  Deploy Round-6 Sale impl + upgrade SaleFactory     ║");
  console.log("╚══════════════════════════════════════════════════════╝");
  console.log(`  Deployer: ${deployer.address}`);
  console.log(`  Network:  ${networkName} (chainId ${network.chainId})`);

  // 1. Deploy new Sale impl — or reuse if SALE_IMPL_ADDRESS env var is set
  // (useful when a prior run left an undeployed-but-uncatalogued impl on-chain).
  console.log("\n[1/5] Sale implementation...");
  const Sale = await ethers.getContractFactory("Sale");
  let newImplAddr: string;
  let newImpl: any;
  const reuse = process.env.SALE_IMPL_ADDRESS;
  if (reuse && reuse.startsWith("0x")) {
    newImplAddr = reuse;
    newImpl = Sale.attach(reuse);
    console.log(`      reusing SALE_IMPL_ADDRESS=${reuse}`);
  } else {
    const deployed = await Sale.deploy();
    await deployed.waitForDeployment();
    newImpl = deployed;
    newImplAddr = await deployed.getAddress();
    console.log(`      deployed → ${newImplAddr}`);
  }

  // 2. Verify version (with retry — base-sepolia RPC sometimes returns empty
  // data on view calls right after a contract creation, before its node-side
  // index catches up).
  console.log("\n[2/5] Verifying version()...");
  let version: string | null = null;
  for (let attempt = 1; attempt <= 5; attempt++) {
    try {
      version = await newImpl.version();
      break;
    } catch (e: any) {
      if (attempt === 5) throw e;
      console.log(`      attempt ${attempt} failed (${e?.shortMessage || e?.code}); retrying in 3s...`);
      await new Promise((r) => setTimeout(r, 3000));
    }
  }
  console.log(`      → ${version}`);
  if (version !== "6.0.0") {
    throw new Error(`Expected version "6.0.0" but got "${version}". Aborting.`);
  }

  // 3. Look up factory
  const networkForLookup = networkName === "hardhat" ? "localhost" : networkName;
  const deployFilePath = path.join(DEPLOYMENTS_DIR, `${networkForLookup}.json`);

  let factoryAddr: string | undefined;
  if (fs.existsSync(deployFilePath)) {
    const existing = JSON.parse(fs.readFileSync(deployFilePath, "utf-8"));
    factoryAddr = existing.saleFactory;
  }

  if (!factoryAddr) {
    console.log(`\n[3/5] No saleFactory in ${deployFilePath} — skipping factory wire-up.`);
    console.log("      Round-6 Sale impl deployed standalone. To wire it into a factory:");
    console.log(`      factory.setSaleImplementation("${newImplAddr}")`);
    process.exit(0);
  }

  console.log(`\n[3/5] Factory: ${factoryAddr}`);

  // 4. Call setSaleImplementation
  // Honor an optional ADMIN_PRIVATE_KEY env var so the admin tx can be sent
  // by a different signer than the deployer (typical mainnet/sandbox shape).
  console.log("\n[4/5] Updating factory.saleImplementation...");
  const SaleFactory = await ethers.getContractFactory("CiretaSaleFactory");
  const factory = SaleFactory.attach(factoryAddr) as any;

  const owner: string = await factory.owner();
  console.log(`      factory owner: ${owner}`);

  let signer = deployer;
  const adminKey = process.env.ADMIN_PRIVATE_KEY;
  if (adminKey && adminKey.startsWith("0x")) {
    signer = new ethers.Wallet(adminKey, ethers.provider);
    console.log(`      using ADMIN_PRIVATE_KEY signer: ${await signer.getAddress()}`);
  }

  if (owner.toLowerCase() !== (await signer.getAddress()).toLowerCase()) {
    console.log(`      ⚠️  Signer ${await signer.getAddress()} is NOT the factory owner.`);
    console.log("      Cannot send setSaleImplementation. The factory owner must call:");
    console.log(`      factory.setSaleImplementation("${newImplAddr}")`);
    console.log("\n      Calldata for Safe submission:");
    const calldata = factory.interface.encodeFunctionData("setSaleImplementation", [newImplAddr]);
    console.log(`        to:    ${factoryAddr}`);
    console.log(`        data:  ${calldata}`);
    console.log(`        value: 0`);
    process.exit(0);
  }

  const factoryAsSigner = factory.connect(signer);
  const oldImpl = await factoryAsSigner.saleImplementation();
  console.log(`      old impl: ${oldImpl}`);
  await (await factoryAsSigner.setSaleImplementation(newImplAddr)).wait();
  const confirmedImpl = await factoryAsSigner.saleImplementation();
  console.log(`      new impl: ${confirmedImpl}`);
  if (confirmedImpl.toLowerCase() !== newImplAddr.toLowerCase()) {
    throw new Error("setSaleImplementation did not update factory state. Aborting.");
  }

  // 5. Persist
  console.log("\n[5/5] Saving deployment JSON...");
  const existing = JSON.parse(fs.readFileSync(deployFilePath, "utf-8"));
  existing.saleImplementation = newImplAddr;
  existing.saleImplementationVersion = "6.0.0";
  existing.saleImplementationDeployedAt = new Date().toISOString();
  fs.writeFileSync(deployFilePath, JSON.stringify(existing, null, 2) + "\n");
  console.log(`      → ${deployFilePath}`);

  console.log("\n══════════════════════════════════════════════════════");
  console.log("DONE — future sales deployed via this factory will use Round-6.");
  console.log("══════════════════════════════════════════════════════");
}

main().then(() => process.exit(0)).catch((e) => {
  console.error("\nFAILED:", e);
  process.exit(1);
});
