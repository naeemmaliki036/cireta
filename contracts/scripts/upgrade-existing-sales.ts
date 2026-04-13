import { ethers } from "hardhat";
const ADMIN_KEY = "a2daeb50164d8702f14926669ed8caba1c9950b8173af1ccd19b0a07ad80b530";
const ISSUER_KEY = "8a76cb14e3becbb35c0a260e87f2e9b62c72875f91ba93b1fc72c8769ed2d6ef";
const NEW_IMPL = "0xEC918f0f0BDdEDfb2932b022Ea1C1c94aae5473A";
const SALES = [
  "0x41dD6F429EABb37C74D1Bc396B4E1169Fe486a3B", // WMAU
  "0x7038a5B5fFEc1Ce9D11F6900114EfAE3FE8C8719", // WGGH
];
async function main() {
  const admin = new ethers.Wallet(ADMIN_KEY, ethers.provider);
  for (const saleAddr of SALES) {
    const sale = await ethers.getContractAt("Sale", saleAddr, admin);
    try {
      await (await sale.upgradeToAndCall(NEW_IMPL, "0x")).wait();
      console.log(`${saleAddr}: upgraded ✓`);
    } catch (e: any) {
      console.log(`${saleAddr}: ${e.message?.slice(0, 80)}`);
    }
  }
}
main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
