import { ethers } from "hardhat";

const TX = "0xc68cbc006613abb448ba2fac01f93496744fce6fc86046d0bbf78b5b7e589254";

async function main() {
  const r = await ethers.provider.getTransactionReceipt(TX);
  if (!r) throw new Error("tx not found");
  console.log("from :", r.from);
  console.log("to   :", r.to);
  console.log("block:", r.blockNumber);
  console.log("logs :", r.logs.length);
  // RedemptionRequested(uint256 indexed id, address indexed investor, uint256 amount)
  const TOPIC = ethers.id("RedemptionRequested(uint256,address,uint256)");
  for (const log of r.logs) {
    if (log.topics[0] === TOPIC) {
      const id = BigInt(log.topics[1]);
      const investor = "0x" + log.topics[2].slice(-40);
      const amount = BigInt(log.data);
      console.log("\nRedemptionRequested:");
      console.log("  rm     :", log.address);
      console.log("  id     :", id.toString());
      console.log("  investor:", investor);
      console.log("  amount :", amount.toString(), "(raw)");
    }
  }
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
