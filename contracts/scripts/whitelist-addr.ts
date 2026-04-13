import { ethers } from "hardhat";
const REGISTRAR_KEY = "c4af503e32ae01edaf52559ac320bbe16a97275ee6347c8ecc42fb27a898008d";
async function main() {
  const registrar = new ethers.Wallet(REGISTRAR_KEY, ethers.provider);
  const addr = "0x731490d1Cf4199f45368F3F739c91A2A1262d065";
  // Whitelist on WGGH registry
  const reg = await ethers.getContractAt("SimpleIdentityRegistry", "0x2f25fB1Eca5153ee5caF99bCa720C289646EB5D1", registrar);
  await (await reg.addToWhitelist(addr, 784)).wait();
  console.log("Whitelisted on WGGH:", await reg.isVerified(addr));
}
main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
