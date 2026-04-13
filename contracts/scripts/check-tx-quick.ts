import { ethers } from "hardhat";
async function main() {
  const sale = await ethers.getContractAt("Sale", "0x7038a5B5fFEc1Ce9D11F6900114EfAE3FE8C8719");
  const receipt = await ethers.provider.getTransactionReceipt("0x9fe27c2c5865f8563bb225f50c5fd71885e3c26ae59dcfbde5c05fe880d8b2ec");
  if (!receipt) { console.log("not found"); return; }
  for (const log of receipt.logs) {
    try {
      const p = sale.interface.parseLog({ topics: log.topics as string[], data: log.data });
      if (p?.name === "Purchase") {
        console.log("Phase:", p.args[1].toString());
        console.log("USDC:", ethers.formatUnits(p.args[2], 6));
        console.log("Tokens:", ethers.formatUnits(p.args[3], 6));
        console.log("IsOTC:", p.args[4]);
      }
    } catch {}
  }
}
main();
