import { ethers } from "hardhat";
async function main() {
  const sale = await ethers.getContractAt("Sale", "0x7038a5B5fFEc1Ce9D11F6900114EfAE3FE8C8719");
  const p = await sale.phases(0);
  console.log("Start:", new Date(Number(p.startTime) * 1000).toISOString());
  console.log("End:", new Date(Number(p.endTime) * 1000).toISOString());
}
main();
