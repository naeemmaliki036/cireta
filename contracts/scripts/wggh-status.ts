import { ethers } from "hardhat";
async function main() {
  const sale = await ethers.getContractAt("Sale", "0x7038a5B5fFEc1Ce9D11F6900114EfAE3FE8C8719");
  const now = Math.floor(Date.now() / 1000);

  console.log("=== Sale Status ===");
  console.log("Status:", (await sale.status()).toString(), "(1=Active)");
  console.log("Total Raised:", ethers.formatUnits(await sale.totalRaised(), 6), "USDC");
  console.log("Total Sold:", ethers.formatUnits(await sale.totalTokenSold(), 6), "tokens");
  console.log("Remaining:", ethers.formatUnits(await sale.getRemainingSupply(), 6), "tokens");
  console.log("Total Supply:", ethers.formatUnits(await sale.totalTokenSupply(), 6));

  const phaseCount = await sale.getPhaseCount();
  console.log("\nPhases on-chain:", phaseCount.toString());
  for (let i = 0; i < Number(phaseCount); i++) {
    const p = await sale.phases(i);
    const start = Number(p.startTime);
    const end = Number(p.endTime);
    const status = now < start ? "upcoming" : now >= end ? "ended" : "active";
    console.log(`\n  Phase ${i}: ${p.name}`);
    console.log(`    Price: ${ethers.formatUnits(p.pricePerToken, 6)} USDC`);
    console.log(`    Allocation: ${ethers.formatUnits(p.allocation, 6)}`);
    console.log(`    Sold: ${ethers.formatUnits(p.sold, 6)}`);
    console.log(`    Start: ${new Date(start * 1000).toISOString()}`);
    console.log(`    End: ${new Date(end * 1000).toISOString()}`);
    console.log(`    Status: ${status}`);
  }
}
main();
