import { ethers } from "hardhat";
async function main() {
  const rm = await ethers.getContractAt("RedemptionManager", "0xB0e37faF3A469524885e23c980bbE9d57af9aa51");
  const req = await (rm as any).requests(0);
  console.log("investor   :", req.investor);
  console.log("amount     :", req.amount.toString());
  console.log("method     :", req.method.toString(), "(0=Cash, 1=Physical)");
  console.log("status     :", req.status.toString(), "(0=Pending, 1=Processing, 2=Fulfilled, 3=Cancelled)");
  console.log("fulfilledAt:", req.fulfilledAt.toString());
}
main().then(()=>process.exit(0));
