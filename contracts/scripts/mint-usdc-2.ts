import { ethers } from "hardhat";
async function main() {
  const [deployer] = await ethers.getSigners();
  const usdc = await ethers.getContractAt("CiretaUSDC", "0x3Bfb6B62C015EE815e5Eb0A7e212F580446D9898", deployer);
  const to = "0x731490d1Cf4199f45368F3F739c91A2A1262d065";
  await (await usdc.mint(to, ethers.parseUnits("100000000", 6))).wait();
  console.log("Minted 100M cUSDC to", to);
  console.log("Balance:", ethers.formatUnits(await usdc.balanceOf(to), 6));
}
main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
