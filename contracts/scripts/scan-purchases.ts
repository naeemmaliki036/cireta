import { ethers } from "hardhat";
async function main() {
  const sale = await ethers.getContractAt("Sale", "0x41dD6F429EABb37C74D1Bc396B4E1169Fe486a3B");
  const latest = await ethers.provider.getBlockNumber();
  // Scan last 500 blocks in chunks of 10
  const from = Math.max(0, latest - 500);
  let allEvents: any[] = [];
  for (let start = from; start <= latest; start += 10) {
    const end = Math.min(start + 9, latest);
    try {
      const events = await sale.queryFilter(sale.filters.Purchase(), start, end);
      allEvents.push(...events);
    } catch { /* skip */ }
  }
  console.log(`Found ${allEvents.length} Purchase events:\n`);
  for (const e of allEvents) {
    const a = e.args;
    console.log(`TX: ${e.transactionHash}`);
    console.log(`  Buyer: ${a[0]}`);
    console.log(`  Phase: ${a[1]}`);
    console.log(`  USDC:  ${ethers.formatUnits(a[2], 6)}`);
    console.log(`  Tokens: ${ethers.formatUnits(a[3], 6)}`);
    console.log(`  IsOTC: ${a[4]}`);
    console.log("");
  }
}
main();
