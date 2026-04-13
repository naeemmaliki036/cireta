import { ethers } from "hardhat";
const INVESTOR_KEY = "cd354e1926e9874572b3be04e7b21e84ccf01bd7ceecfff91cca4c2aebdba1a0";
async function main() {
  const investor = new ethers.Wallet(INVESTOR_KEY, ethers.provider);
  const sale = await ethers.getContractAt("Sale", "0x7038a5B5fFEc1Ce9D11F6900114EfAE3FE8C8719", investor);
  
  // Check allowance
  const usdc = await ethers.getContractAt("CiretaUSDC", "0x3Bfb6B62C015EE815e5Eb0A7e212F580446D9898");
  const allowance = await usdc.allowance(investor.address, await sale.getAddress());
  console.log("Allowance:", ethers.formatUnits(allowance, 6));
  console.log("Needed: 500 × 115000 =", 500 * 115000);
  console.log("Sufficient?", Number(ethers.formatUnits(allowance, 6)) >= 500 * 115000);
  
  try {
    await sale.buy.staticCall(1, 500n);
    console.log("Static call: SUCCESS");
  } catch (e: any) {
    const sel = e.data?.slice(0, 10);
    console.log("Revert selector:", sel);
    const known: Record<string, string> = {
      "0xfb8f41b2": "ERC20InsufficientAllowance",
      "0xe450d38c": "ERC20InsufficientBalance",
    };
    console.log("Error:", known[sel] || "unknown — " + (e.reason || e.message?.slice(0, 100)));
  }
}
main();
