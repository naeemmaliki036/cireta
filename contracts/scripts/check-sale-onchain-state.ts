import { ethers } from "hardhat";

const SALE = "0x1B2306046dd1E0925596a892C241084e174Dad8f";

async function main() {
  const sale = await ethers.getContractAt(
    [
      "function getPhaseCount() view returns (uint256)",
      "function getPhase(uint256) view returns (tuple(uint256 phaseId, uint256 pricePerToken, uint256 allocation, uint256 minContribution, uint256 maxContribution, uint256 minTokens, uint256 maxTokens, uint256 topUpMinTokens, uint256 startTime, uint256 endTime, bool whitelistOnly, uint8 allocationMode, uint256 totalRaised, uint256 totalTokenSold))",
      "function saleStartTime() view returns (uint256)",
      "function saleEndTime() view returns (uint256)",
      "function status() view returns (uint8)",
      "function totalRaised() view returns (uint256)",
    ],
    SALE,
  );

  const block = await ethers.provider.getBlock("latest");
  const ts = block!.timestamp;
  const fmt = (s: bigint) => `${s} (${new Date(Number(s) * 1000).toISOString()})`;

  const [count, ss, se, status] = await Promise.all([
    sale.getPhaseCount(), sale.saleStartTime(), sale.saleEndTime(), sale.status(),
  ]);
  console.log("Sale:           ", SALE);
  console.log("status:         ", status);
  console.log("saleStartTime:  ", fmt(ss));
  console.log("saleEndTime:    ", fmt(se));
  console.log("now (chain):    ", `${ts} (${new Date(ts * 1000).toISOString()})`);
  console.log("phaseCount:     ", count.toString());

  for (let i = 0n; i < count; i++) {
    const p = await sale.getPhase(i);
    console.log(`\n--- phase[${i}] ---`);
    console.log(`  phaseId:           ${p.phaseId}`);
    console.log(`  startTime:         ${fmt(p.startTime)}`);
    console.log(`  endTime:           ${fmt(p.endTime)}`);
    const inWindow = ts >= Number(p.startTime) && ts < Number(p.endTime);
    console.log(`  current?           ${inWindow}`);
    console.log(`  pricePerToken:     ${p.pricePerToken}`);
    console.log(`  allocation:        ${p.allocation}`);
    console.log(`  totalRaised:       ${p.totalRaised}`);
    console.log(`  totalTokenSold:    ${p.totalTokenSold}`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
