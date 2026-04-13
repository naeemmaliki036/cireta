import { ethers } from "hardhat";
async function main() {
  const sale = await ethers.getContractAt("Sale", "0xa2588377853328f9720229d52F7D757fa0D1D6A3");
  const phase = await sale.phases(0);
  console.log("pricePerToken raw:", phase.pricePerToken.toString());
  console.log("pricePerToken (6 dec):", ethers.formatUnits(phase.pricePerToken, 6));
  console.log("tokenDecimals:", (await sale.tokenDecimals()).toString());
  
  // Simulate: 200 tokens * pricePerToken
  const qty = 200n;
  const cost = qty * phase.pricePerToken;
  console.log("200 tokens cost raw:", cost.toString());
  console.log("200 tokens cost USDC:", ethers.formatUnits(cost, 6));
}
main();
