import { ethers } from "hardhat";
import * as fs from "fs";
const out = JSON.parse(fs.readFileSync("/tmp/wmau-deploy.json", "utf-8"));

async function main() {
  // Read deployed-but-failed state for WMAU.
  // We didn't capture vault/sale from this run since the script bailed early —
  // grab from the deploy tx receipts. Actually we know the token's deployed event.
  // Easiest: look up the sale from the token's most recent transactions.
  // For now: read what we have logged above.
  console.log("captured out:", out);

  // Find sale via SaleFactory.tokenSales[token]
  const saleFactory = await ethers.getContractAt("CiretaSaleFactory", "0xFfC765aB999CF3D718Aa81869DE3D32Ff3E0d2d9");
  const sales = await (saleFactory as any).tokenSales("0xC9DB4F2cF60c537f7F5a8c3F08aD929e90F1F90b"); // placeholder
}

main().catch(e => { console.error(e); process.exit(1); });
