import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";
const ADMIN_KEY = "a2daeb50164d8702f14926669ed8caba1c9950b8173af1ccd19b0a07ad80b530";
async function main() {
  const [deployer] = await ethers.getSigners();
  const admin = new ethers.Wallet(ADMIN_KEY, ethers.provider);
  const d = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "deployments", "base-sepolia.json"), "utf-8"));
  console.log("Deploying new Sale implementation...");
  const Sale = await ethers.getContractFactory("Sale");
  const newImpl = await Sale.deploy();
  await newImpl.waitForDeployment();
  const newAddr = await newImpl.getAddress();
  console.log("New Sale impl:", newAddr);
  console.log("Old Sale impl:", d.saleImplementation);
  const sf = await ethers.getContractAt("CiretaSaleFactory", d.saleFactory, admin);
  await (await sf.setSaleImplementation(newAddr)).wait();
  console.log("SaleFactory updated");
  d.saleImplementation = newAddr;
  fs.writeFileSync(path.join(__dirname, "..", "deployments", "base-sepolia.json"), JSON.stringify(d, null, 2) + "\n");
  console.log("Saved");
}
main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
