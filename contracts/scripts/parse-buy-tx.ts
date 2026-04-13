import { ethers } from "hardhat";
async function main() {
  const receipt = await ethers.provider.getTransactionReceipt("0xda65b88ee50ff84c32693850945b74941050c7ff60b8ee2c17785148a0743356");
  if (!receipt) { console.log("TX not found"); return; }

  console.log("Status:", receipt.status === 1 ? "SUCCESS" : "FAILED");
  console.log("To:", receipt.to);
  console.log("Logs:", receipt.logs.length);

  // Parse each log
  const sale = await ethers.getContractAt("Sale", receipt.to!);
  const fraction = await ethers.getContractAt("CiretaFractionToken1155", "0x22C5D649acE31525196CBb058A4A3b180124B4B0");

  for (const log of receipt.logs) {
    try {
      const parsed = sale.interface.parseLog({ topics: log.topics as string[], data: log.data });
      if (parsed) console.log(`\nSale event: ${parsed.name}`, parsed.args);
    } catch {}
    try {
      const parsed = fraction.interface.parseLog({ topics: log.topics as string[], data: log.data });
      if (parsed) console.log(`\nFraction event: ${parsed.name}`, parsed.args);
    } catch {}
  }

  // Check fraction balance
  const bal1 = await fraction.balanceOf("0x5c5C4A2563ea79D494a0CA2dCd8d596790651fba", 1);
  const bal2 = await fraction.balanceOf("0x5c5C4A2563ea79D494a0CA2dCd8d596790651fba", 2);
  console.log("\nFraction balance ID=1:", ethers.formatUnits(bal1, 6));
  console.log("Fraction balance ID=2:", ethers.formatUnits(bal2, 6));
}
main();
