import { ethers } from "hardhat";
const ISSUER_KEY = "8a76cb14e3becbb35c0a260e87f2e9b62c72875f91ba93b1fc72c8769ed2d6ef";
async function main() {
  const issuer = new ethers.Wallet(ISSUER_KEY, ethers.provider);
  const otc = await ethers.getContractAt("IssuerOTCToken", "0xA6A17359f23b39904Bb309553CF769B0231B0564", issuer);
  const to = "0x5c5C4A2563ea79D494a0CA2dCd8d596790651fba";
  const bal = await otc.balanceOf(to);
  console.log("Current OTC balance:", ethers.formatUnits(bal, 6));
  if (Number(bal) === 0) {
    console.log("Minting 100M OTC...");
    const MINTER = await otc.MINTER_ROLE();
    try { await (await otc.grantRole(MINTER, issuer.address)).wait(); } catch {}
    await (await otc.mint(to, ethers.parseUnits("100000000", 6))).wait();
    console.log("Done. Balance:", ethers.formatUnits(await otc.balanceOf(to), 6));
  } else {
    console.log("Already has OTC tokens");
  }
}
main();
