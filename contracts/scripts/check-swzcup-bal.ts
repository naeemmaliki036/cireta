import { ethers } from "hardhat";
async function main() {
  const t = await ethers.getContractAt("CiretaToken", "0xf57836E6CE6a5A3ff1ABd15bA562fF3979e43C30");
  const bal = await (t as any).balanceOf("0x5c5C4A2563ea79D494a0CA2dCd8d596790651fba");
  console.log("Naeem 101 SWZCUP balance:", ethers.formatUnits(bal, 6));
}
main().then(()=>process.exit(0));
