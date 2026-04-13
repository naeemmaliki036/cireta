import { ethers } from "hardhat";
async function main() {
  const receipt = await ethers.provider.getTransactionReceipt("0xb917574e17a1888b1954e22c0c39a64c9be33cf6d1b3243ba2f5b2b87e30565e");
  console.log("Status:", receipt?.status, "(0=reverted, 1=success)");
  console.log("To:", receipt?.to);
  
  // Check what the sale state looks like
  const sale = await ethers.getContractAt("Sale", "0x7038a5B5fFEc1Ce9D11F6900114EfAE3FE8C8719");
  console.log("\nRemaining supply:", ethers.formatUnits(await sale.getRemainingSupply(), 6));
  console.log("Total raised:", ethers.formatUnits(await sale.totalRaised(), 6));
  console.log("Hard cap:", ethers.formatUnits(await sale.hardCap(), 6));
  
  const remaining = Number(ethers.formatUnits(await sale.hardCap() - await sale.totalRaised(), 6));
  console.log("Remaining USDC:", remaining);
  console.log("Max tokens at $115k:", Math.floor(remaining / 115000));
  
  // 845 tokens × $115,000 = $97,175,000
  console.log("\n845 × 115000 =", 845 * 115000);
  console.log("Would total:", Number(ethers.formatUnits(await sale.totalRaised(), 6)) + 845 * 115000);
}
main();
