import { ethers } from "hardhat";
async function main() {
  const usdc = await ethers.getContractAt("CiretaUSDC", "0x3Bfb6B62C015EE815e5Eb0A7e212F580446D9898");
  const allowance = await usdc.allowance("0x5c5C4A2563ea79D494a0CA2dCd8d596790651fba", "0x7038a5B5fFEc1Ce9D11F6900114EfAE3FE8C8719");
  console.log("Current USDC allowance:", ethers.formatUnits(allowance, 6));
  console.log("Needed for 845 tokens:", 845 * 115000);
}
main();
