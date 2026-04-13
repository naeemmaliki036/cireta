import { ethers } from "hardhat";
async function main() {
  const addr = "0x731490d1Cf4199f45368F3F739c91A2A1262d065";
  const usdc = await ethers.getContractAt("CiretaUSDC", "0x3Bfb6B62C015EE815e5Eb0A7e212F580446D9898");
  const bal = await usdc.balanceOf(addr);
  console.log("USDC balance:", ethers.formatUnits(bal, 6));
  console.log("Needed for 3 tokens × $115k:", 345000);
  console.log("Sufficient?", Number(ethers.formatUnits(bal, 6)) >= 345000);
  
  // Check allowance
  const allowance = await usdc.allowance(addr, "0x7038a5B5fFEc1Ce9D11F6900114EfAE3FE8C8719");
  console.log("Allowance:", ethers.formatUnits(allowance, 6));
}
main();
