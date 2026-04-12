import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";
const d = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "deployments", "base-sepolia.json"), "utf-8"));
async function main() {
  const sf = await ethers.getContractAt("CiretaSaleFactory", d.saleFactory);
  console.log("SaleFactory owner:", await sf.owner());
  console.log("issuerRegistry:", await sf.issuerRegistry());
  console.log("saleImpl:", await sf.saleImplementation());
  console.log("fractionFactory:", await sf.fractionFactory());
  console.log("feeManager:", await sf.platformFeeManager());
  const ff = await ethers.getContractAt("CiretaFractionFactory", d.fractionFactory);
  console.log("FractionFactory owner:", await ff.owner());
  const ir = await ethers.getContractAt("IssuerRegistry", d.issuerRegistry);
  const issuerData = await ir.getIssuer("0x759948398F66310cAE12896644aCD9eAd86A9650");
  console.log("Issuer status:", issuerData.status, "(2=active)");
}
main();
