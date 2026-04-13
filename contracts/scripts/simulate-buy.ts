import { ethers } from "hardhat";
const INVESTOR_KEY = "cd354e1926e9874572b3be04e7b21e84ccf01bd7ceecfff91cca4c2aebdba1a0";
async function main() {
  const investor = new ethers.Wallet(INVESTOR_KEY, ethers.provider);
  const sale = await ethers.getContractAt("Sale", "0x7038a5B5fFEc1Ce9D11F6900114EfAE3FE8C8719", investor);
  
  try {
    await sale.buy.staticCall(1, 845n);
  } catch (e: any) {
    console.log("Revert reason:", e.reason || e.message?.slice(0, 200));
    // Try to decode
    if (e.data) console.log("Error data:", e.data);
  }
}
main();
