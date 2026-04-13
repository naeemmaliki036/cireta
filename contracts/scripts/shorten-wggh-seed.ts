import { ethers } from "hardhat";
const ISSUER_KEY = "8a76cb14e3becbb35c0a260e87f2e9b62c72875f91ba93b1fc72c8769ed2d6ef";
async function main() {
  const issuer = new ethers.Wallet(ISSUER_KEY, ethers.provider);
  const sale = await ethers.getContractAt("Sale", "0x7038a5B5fFEc1Ce9D11F6900114EfAE3FE8C8719", issuer);
  const now = Math.floor(Date.now() / 1000);
  const newEnd = now + 300; // 5 minutes from now
  await (await sale.shortenPhase(0, newEnd)).wait();
  console.log("Seed phase shortened to:", new Date(newEnd * 1000).toISOString());
}
main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
