import { ethers } from "hardhat";
async function main() {
  const receipt = await ethers.provider.getTransactionReceipt("0xda65b88ee50ff84c32693850945b74941050c7ff60b8ee2c17785148a0743356");
  if (!receipt) { console.log("TX not found"); return; }
  console.log("to:", receipt.to);
  console.log("status:", receipt.status);
  console.log("logs:", receipt.logs.length);

  // Check if it went to the right sale contract
  console.log("Expected sale:", "0xa2588377853328f9720229d52F7D757fa0D1D6A3");
  console.log("Match:", receipt.to?.toLowerCase() === "0xa2588377853328f9720229d52F7D757fa0D1D6A3".toLowerCase());
}
main();
