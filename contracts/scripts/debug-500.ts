import { ethers } from "hardhat";
async function main() {
  const receipt = await ethers.provider.getTransactionReceipt("0xee7f797c9c3f433b40ee12ce9c498b9f12e0d0bf7ebd8299462c7325c7cc99cc");
  console.log("Status:", receipt?.status, "(0=reverted, 1=success)");
  
  const sale = await ethers.getContractAt("Sale", "0x7038a5B5fFEc1Ce9D11F6900114EfAE3FE8C8719");
  const totalRaised = await sale.totalRaised();
  const hardCap = await sale.hardCap();
  const remaining = hardCap - totalRaised;
  
  console.log("Total raised:", ethers.formatUnits(totalRaised, 6));
  console.log("Hard cap:", ethers.formatUnits(hardCap, 6));
  console.log("Remaining USDC:", ethers.formatUnits(remaining, 6));
  console.log("Max tokens at $115k:", Math.floor(Number(ethers.formatUnits(remaining, 6)) / 115000));
  console.log("500 × $115k =", 500 * 115000, "→ exceeds?", 500 * 115000 > Number(ethers.formatUnits(remaining, 6)));
}
main();
