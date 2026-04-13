import { ethers } from "hardhat";
async function main() {
  const [deployer] = await ethers.getSigners();
  const usdc = await ethers.getContractAt("CiretaUSDC", "0x3Bfb6B62C015EE815e5Eb0A7e212F580446D9898", deployer);
  const to = "0x5c5C4A2563ea79D494a0CA2dCd8d596790651fba";
  const amount = ethers.parseUnits("1000000000", 6); // 1 billion USDC (1000M)
  const tx = await usdc.mint(to, amount);
  await tx.wait();
  const bal = await usdc.balanceOf(to);
  console.log(`Minted 1,000M cUSDC to ${to}`);
  console.log(`Balance: ${ethers.formatUnits(bal, 6)} cUSDC`);
}
main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
