import { ethers } from "hardhat";
async function main() {
  const sale = await ethers.getContractAt("Sale", "0xa2588377853328f9720229d52F7D757fa0D1D6A3");
  console.log("totalRaised:", ethers.formatUnits(await sale.totalRaised(), 6), "USDC");
  console.log("hardCap:", ethers.formatUnits(await sale.hardCap(), 6), "USDC");
  console.log("totalTokenSold:", ethers.formatUnits(await sale.totalTokenSold(), 6));
  console.log("softCap:", ethers.formatUnits(await sale.softCap(), 6), "USDC");
  console.log("status:", (await sale.status()).toString());
}
main();
