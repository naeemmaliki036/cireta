import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";

async function main() {
  const adminKey = process.env.ADMIN_PRIVATE_KEY || "a2daeb50164d8702f14926669ed8caba1c9950b8173af1ccd19b0a07ad80b530";
  const admin = new ethers.Wallet(adminKey, ethers.provider);
  const deployments = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "deployments", "base-sepolia.json"), "utf8"));

  const ff = new ethers.Contract(deployments.fractionFactory, [
    "function transferOwnership(address) external",
    "function owner() view returns (address)",
  ], admin);

  const currentOwner = await ff.owner();
  console.log("FractionFactory owner:", currentOwner);
  console.log("SaleFactory:", deployments.saleFactory);

  if (currentOwner.toLowerCase() !== deployments.saleFactory.toLowerCase()) {
    console.log("Transferring ownership to SaleFactory...");
    const tx = await ff.transferOwnership(deployments.saleFactory);
    await tx.wait();
    console.log("New owner:", await ff.owner());
    console.log("Done!");
  } else {
    console.log("Already owned by SaleFactory");
  }
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
