import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";

async function main() {
  const adminKey = process.env.ADMIN_PRIVATE_KEY || "a2daeb50164d8702f14926669ed8caba1c9950b8173af1ccd19b0a07ad80b530";
  const admin = new ethers.Wallet(adminKey, ethers.provider);
  const deploymentsPath = path.join(__dirname, "..", "deployments", "base-sepolia.json");
  const addr = JSON.parse(fs.readFileSync(deploymentsPath, "utf-8"));

  console.log("Admin:", admin.address);

  console.log("Deploying new CiretaToken implementation...");
  const CiretaToken = await ethers.getContractFactory("CiretaToken");
  const newImpl = await CiretaToken.deploy();
  await newImpl.waitForDeployment();
  const newImplAddr = await newImpl.getAddress();
  console.log("New impl:", newImplAddr);

  console.log("Updating TokenFactory...");
  const factory = new ethers.Contract(addr.tokenFactory, [
    "function updateImplementations(address,address,address) external",
  ], admin);
  const tx = await factory.updateImplementations(newImplAddr, ethers.ZeroAddress, ethers.ZeroAddress);
  await tx.wait();
  console.log("TokenFactory updated");

  addr.tokenImplementation = newImplAddr;
  fs.writeFileSync(deploymentsPath, JSON.stringify(addr, null, 2) + "\n");
  console.log("Done!");
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
