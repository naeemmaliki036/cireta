import { ethers } from "hardhat";
async function main() {
  const sale = await ethers.getContractAt("Sale", "0x7038a5B5fFEc1Ce9D11F6900114EfAE3FE8C8719");
  const totalRaised = await sale.totalRaised();
  const hardCap = await sale.hardCap();
  console.log("Total raised:", ethers.formatUnits(totalRaised, 6), "USDC");
  console.log("Hard cap:", ethers.formatUnits(hardCap, 6), "USDC");
  
  // 1200 tokens × $115,000 = $138,000,000
  const cost = 1200n * 115000000000n; // 1200 × 115000 × 10^6
  const newTotal = totalRaised + cost;
  console.log("\nCost of 1200 tokens:", ethers.formatUnits(cost, 6), "USDC");
  console.log("New total would be:", ethers.formatUnits(newTotal, 6), "USDC");
  console.log("Exceeds hard cap?", newTotal > hardCap);
  
  // How many tokens can fit?
  const remainingUsdc = hardCap - totalRaised;
  console.log("\nRemaining USDC capacity:", ethers.formatUnits(remainingUsdc, 6));
  console.log("Max tokens at $115k:", Number(remainingUsdc) / 115000000000);
}
main();
