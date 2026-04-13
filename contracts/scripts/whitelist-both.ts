import { ethers } from "hardhat";
const REGISTRAR_KEY = "c4af503e32ae01edaf52559ac320bbe16a97275ee6347c8ecc42fb27a898008d";
async function main() {
  const registrar = new ethers.Wallet(REGISTRAR_KEY, ethers.provider);
  const addr = "0x731490d1Cf4199f45368F3F739c91A2A1262d065";
  for (const [name, regAddr] of [
    ["WMAU", "0x5A74E6C8e5ec735bE9f0c1Be8CD28c20de75FA5b"],
    ["WGGH", "0x2f25fB1Eca5153ee5caF99bCa720C289646EB5D1"],
  ]) {
    const reg = await ethers.getContractAt("SimpleIdentityRegistry", regAddr, registrar);
    const already = await reg.isVerified(addr);
    if (!already) {
      await (await reg.addToWhitelist(addr, 784)).wait();
      console.log(`${name}: whitelisted`);
    } else {
      console.log(`${name}: already whitelisted`);
    }
  }
}
main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
