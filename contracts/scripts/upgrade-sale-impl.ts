/**
 * Deploy new Sale implementation and update SaleFactory.
 */
import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";

const ADMIN_KEY = "a2daeb50164d8702f14926669ed8caba1c9950b8173af1ccd19b0a07ad80b530";

async function main() {
  const [deployer] = await ethers.getSigners();
  const admin = new ethers.Wallet(ADMIN_KEY, ethers.provider);

  const deployments = JSON.parse(
    fs.readFileSync(path.join(__dirname, "..", "deployments", "base-sepolia.json"), "utf-8"),
  );

  console.log("=== Deploying new Sale implementation ===");
  const Sale = await ethers.getContractFactory("Sale");
  const newImpl = await Sale.deploy();
  await newImpl.waitForDeployment();
  const newImplAddr = await newImpl.getAddress();
  console.log(`  New Sale impl: ${newImplAddr}`);
  console.log(`  Old Sale impl: ${deployments.saleImplementation}`);

  // Update SaleFactory (owned by admin)
  console.log("\n=== Updating SaleFactory.saleImplementation ===");
  const saleFactory = await ethers.getContractAt("CiretaSaleFactory", deployments.saleFactory, admin);
  const tx = await saleFactory.setSaleImplementation(newImplAddr);
  await tx.wait();
  console.log(`  SaleFactory updated`);

  // Save
  deployments.saleImplementation = newImplAddr;
  fs.writeFileSync(
    path.join(__dirname, "..", "deployments", "base-sepolia.json"),
    JSON.stringify(deployments, null, 2) + "\n",
  );
  console.log("  Saved to deployments/base-sepolia.json");

  // Verify
  const currentImpl = await saleFactory.saleImplementation();
  console.log(`  Verified: ${currentImpl === newImplAddr ? "OK" : "MISMATCH"}`);
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
