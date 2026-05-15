import { ethers } from "hardhat";

const SALE = "0xb56Aa215df04A98859cfF7545050eAE0859f1016";
const OTC_RECIPIENT = "0x5c5C4A2563ea79D494a0CA2dCd8d596790651fba";

async function main() {
  const sale = await ethers.getContractAt("Sale", SALE);
  const totalRaised = await (sale as any).totalRaised();
  const otcContributed = await (sale as any).otcContributed(OTC_RECIPIENT);
  const userTotal = await (sale as any).totalContributed(OTC_RECIPIENT);

  console.log("Sale.totalRaised               :", totalRaised.toString(),
    "(", ethers.formatUnits(totalRaised, 6), "USDC )");
  console.log("Sale.totalContributed[buyer]   :", userTotal.toString(),
    "(", ethers.formatUnits(userTotal, 6), "USDC )");
  console.log("Sale.otcContributed[buyer]     :", otcContributed.toString(),
    "(", ethers.formatUnits(otcContributed, 6), "USDC )");

  // Phase sold
  const phase = await (sale as any).phases(0);
  console.log("\nPhase 0 sold (raw)             :", phase.sold.toString(),
    "(", ethers.formatUnits(phase.sold, 6), "BTP )");
  console.log("Phase 0 allocation (raw)       :", phase.allocation.toString(),
    "(", ethers.formatUnits(phase.allocation, 6), "BTP )");
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
