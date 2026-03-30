import { ethers } from "hardhat";
import * as fs from "fs";

async function main() {
  const [deployer] = await ethers.getSigners();
  const deployments = JSON.parse(fs.readFileSync("deployments/sepolia.json", "utf8"));

  const FF = await ethers.getContractFactory("CiretaFractionFactory");
  const ff = FF.attach(deployments.fractionFactory) as any;

  const owner = await ff.owner();
  console.log("FractionFactory current owner:", owner);
  console.log("SaleFactory address:", deployments.saleFactory);

  if (owner.toLowerCase() !== deployments.saleFactory.toLowerCase()) {
    const tx = await ff.transferOwnership(deployments.saleFactory);
    await tx.wait();
    console.log("Transferred FractionFactory ownership to SaleFactory");
  } else {
    console.log("Already owned by SaleFactory");
  }
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
