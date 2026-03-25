import { ethers } from "hardhat";
import * as fs from "fs";

async function main() {
  const deployments = JSON.parse(fs.readFileSync("deployments/base-sepolia.json", "utf8"));
  const [deployer] = await ethers.getSigners();
  
  const FF = await ethers.getContractFactory("CiretaFractionFactory");
  const ff = FF.attach(deployments.fractionFactory);
  
  const currentOwner = await ff.owner();
  console.log("FractionFactory owner:", currentOwner);
  console.log("SaleFactory:", deployments.saleFactory);
  
  if (currentOwner.toLowerCase() !== deployments.saleFactory.toLowerCase()) {
    console.log("Transferring ownership to SaleFactory...");
    const tx = await ff.transferOwnership(deployments.saleFactory);
    await tx.wait();
    console.log("Done!");
  } else {
    console.log("Already owned by SaleFactory");
  }
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
