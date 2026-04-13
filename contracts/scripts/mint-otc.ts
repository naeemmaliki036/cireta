import { ethers } from "hardhat";
const ISSUER_KEY = "8a76cb14e3becbb35c0a260e87f2e9b62c72875f91ba93b1fc72c8769ed2d6ef";
async function main() {
  const issuer = new ethers.Wallet(ISSUER_KEY, ethers.provider);
  const otc = await ethers.getContractAt("IssuerOTCToken", "0xBcc89C28eea3f8d81B5022bA6D8567578d20fC41", issuer);
  const MINTER = await otc.MINTER_ROLE();
  try { await (await otc.grantRole(MINTER, issuer.address)).wait(); } catch {}
  const to = "0x5c5C4A2563ea79D494a0CA2dCd8d596790651fba";
  await (await otc.mint(to, ethers.parseUnits("100000000", 6))).wait();
  const bal = await otc.balanceOf(to);
  console.log(`Minted 100M OTC to ${to}`);
  console.log(`Balance: ${ethers.formatUnits(bal, 6)}`);
}
main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
