import { ethers } from "hardhat";
async function main() {
  const sale = await ethers.getContractAt("Sale", "0x7038a5B5fFEc1Ce9D11F6900114EfAE3FE8C8719");
  const receipt = await ethers.provider.getTransactionReceipt("0x95c258ced4b89a0933af30e2be41aa56552e77fff1c31cec816065536b1cd5e5");
  console.log("Status:", receipt?.status); // 0 = reverted
  
  // Check remaining supply
  const remaining = await sale.getRemainingSupply();
  console.log("Remaining supply:", ethers.formatUnits(remaining, 6));
  
  // Check phase details
  const p1 = await sale.phases(1);
  console.log("\nPrivate Round:");
  console.log("  Allocation:", ethers.formatUnits(p1.allocation, 6));
  console.log("  Sold:", ethers.formatUnits(p1.sold, 6));
  console.log("  Mode:", p1.allocationMode.toString(), "(0=Fixed, 1=Remaining)");
  console.log("  Max tokens:", p1.maxTokens.toString());
  
  // Check investor contribution
  const contrib = await sale.totalContributed("0x5c5C4A2563ea79D494a0CA2dCd8d596790651fba");
  const investorTokens = await sale.contributions("0x5c5C4A2563ea79D494a0CA2dCd8d596790651fba");
  console.log("\nInvestor total contributed:", ethers.formatUnits(contrib, 6));
  console.log("Investor tokens allocated:", ethers.formatUnits(investorTokens.tokensAllocated, 6));
  
  // 1200 tokens requested — check if exceeds remaining
  console.log("\n1200 tokens × $115,000 = $138,000,000 USDC");
  console.log("Remaining tokens:", ethers.formatUnits(remaining, 6));
}
main();
