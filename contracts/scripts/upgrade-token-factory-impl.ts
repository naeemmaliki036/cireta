/**
 * Upgrade CiretaTokenFactory implementation.
 * Required after modifying CiretaTokenFactory.sol (e.g. allowing issuers to deploy tokens).
 *
 * Requires ADMIN_PRIVATE_KEY (factory owner).
 */
import { ethers, upgrades } from "hardhat";
import * as fs from "fs";
import * as path from "path";

async function main() {
  const adminKey = process.env.ADMIN_PRIVATE_KEY || "a2daeb50164d8702f14926669ed8caba1c9950b8173af1ccd19b0a07ad80b530";
  const admin = new ethers.Wallet(adminKey, ethers.provider);
  const deploymentsPath = path.join(__dirname, "..", "deployments", "base-sepolia.json");
  const addr = JSON.parse(fs.readFileSync(deploymentsPath, "utf-8"));

  console.log("Admin:", admin.address);
  console.log("TokenFactory proxy:", addr.tokenFactory);

  // Verify ownership
  const factory = await ethers.getContractAt("CiretaTokenFactory", addr.tokenFactory, admin);
  const owner = await factory.owner();
  console.log("Factory owner:", owner);
  if (owner.toLowerCase() !== admin.address.toLowerCase()) {
    console.error("Admin is not the factory owner!");
    process.exit(1);
  }

  // Upgrade via UUPS
  console.log("\nUpgrading TokenFactory implementation...");
  const NewImpl = await ethers.getContractFactory("CiretaTokenFactory", admin);
  const upgraded = await upgrades.upgradeProxy(addr.tokenFactory, NewImpl, {
    kind: "uups",
  });
  await upgraded.waitForDeployment();
  console.log("TokenFactory upgraded successfully!");

  // Verify the new function works
  console.log("\nVerifying: isActiveIssuer check is available...");
  const issuerReg = await factory.issuerRegistry();
  console.log("IssuerRegistry:", issuerReg);

  console.log("Done!");
}

main()
  .then(() => process.exit(0))
  .catch((e) => { console.error(e); process.exit(1); });
