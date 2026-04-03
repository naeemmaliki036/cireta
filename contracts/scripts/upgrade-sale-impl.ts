/**
 * Upgrade Sale Implementation
 *
 * Deploys a new Sale implementation and updates CiretaSaleFactory.
 * Required after modifying Sale.sol (e.g. adding OTC token to initialize()).
 *
 * Requires ADMIN_PRIVATE_KEY (factory owner).
 *
 * Usage:
 *   ADMIN_PRIVATE_KEY=... hh run scripts/upgrade-sale-impl.ts --network baseSepolia
 */

import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";

async function main() {
  const adminKey = process.env.ADMIN_PRIVATE_KEY;
  if (!adminKey) {
    console.error("Set ADMIN_PRIVATE_KEY (factory owner)");
    process.exit(1);
  }

  const deploymentsPath = path.join(__dirname, "..", "deployments", "base-sepolia.json");
  const addr = JSON.parse(fs.readFileSync(deploymentsPath, "utf-8"));
  const admin = new ethers.Wallet(adminKey, ethers.provider);

  console.log("Admin:", admin.address);
  console.log("SaleFactory:", addr.saleFactory);

  // 1. Deploy new Sale implementation (anyone can do this)
  console.log("\nDeploying new Sale implementation...");
  const Sale = await ethers.getContractFactory("Sale");
  const newImpl = await Sale.deploy();
  await newImpl.waitForDeployment();
  const newImplAddr = await newImpl.getAddress();
  console.log("New Sale impl:", newImplAddr);

  // 2. Admin updates factory
  console.log("Updating SaleFactory...");
  const factory = new ethers.Contract(addr.saleFactory, [
    "function setSaleImplementation(address impl) external",
    "function owner() view returns (address)",
  ], admin);

  const owner = await factory.owner();
  console.log("Factory owner:", owner);

  if (owner.toLowerCase() !== admin.address.toLowerCase()) {
    console.error("Admin wallet is not the factory owner!");
    process.exit(1);
  }

  const tx = await factory.setSaleImplementation(newImplAddr);
  await tx.wait();
  console.log("SaleFactory updated to new implementation");

  // 3. Save
  addr.saleImplementation = newImplAddr;
  fs.writeFileSync(deploymentsPath, JSON.stringify(addr, null, 2) + "\n");
  console.log("Saved to deployments file");
  console.log("\nDone! All new sales will use the updated Sale contract.");
}

main()
  .then(() => process.exit(0))
  .catch((e) => { console.error(e); process.exit(1); });
