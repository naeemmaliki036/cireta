/**
 * Read sale state to diagnose why addPhase reverts. Usage:
 *   SALE=0x... ISSUER=0x... ./node_modules/.bin/hardhat run scripts/diag-sale-state.ts --network baseSepolia
 */
import { ethers } from "hardhat";

async function main() {
  const SALE = process.env.SALE!;
  const ISSUER = process.env.ISSUER!;
  const sale = await ethers.getContractAt("Sale", SALE);

  const issuer = await (sale as any).issuer();
  const factory = await (sale as any).factory();
  const status = await (sale as any).status();
  const saleStart = await (sale as any).saleStartTime();
  const saleEnd = await (sale as any).saleEndTime();
  const openEnded = await (sale as any).openEnded();
  const totalTokenSupply = await (sale as any).totalTokenSupply();
  const tokenDec = await (sale as any).tokenDecimals();
  const feeBps = await (sale as any).feeBasisPoints();
  const phaseCount = await (sale as any).getPhaseCount();

  console.log("Sale          :", SALE);
  console.log("issuer (chain):", issuer);
  console.log("issuer (sent) :", ISSUER, ISSUER.toLowerCase() === issuer.toLowerCase() ? "✓" : "✗ MISMATCH");
  console.log("factory       :", factory);
  console.log("status        :", status.toString(), "(0=Draft, 1=Active, 2=Finalized, 3=Failed)");
  console.log("saleStartTime :", saleStart.toString(), new Date(Number(saleStart) * 1000).toISOString());
  console.log("saleEndTime   :", saleEnd.toString(), new Date(Number(saleEnd) * 1000).toISOString());
  console.log("openEnded     :", openEnded);
  console.log("tokenSupply   :", totalTokenSupply.toString(), "(=", ethers.formatUnits(totalTokenSupply, tokenDec), "tokens )");
  console.log("tokenDecimals :", tokenDec);
  console.log("feeBps        :", feeBps.toString());
  console.log("phaseCount    :", phaseCount.toString());

  // Compare to attempted phase params
  const phaseStart = 1779169936n;
  const phaseEnd = 1779858456n;
  const phaseAllocation = 1_000_000n * 10n ** BigInt(tokenDec);
  console.log("\n--- compare phase args ---");
  console.log("phaseStart    :", phaseStart.toString(), new Date(Number(phaseStart) * 1000).toISOString(),
    phaseStart >= saleStart ? "✓ >= saleStart" : "✗ < saleStart");
  console.log("phaseEnd      :", phaseEnd.toString(), new Date(Number(phaseEnd) * 1000).toISOString(),
    phaseEnd <= saleEnd ? "✓ <= saleEnd" : "✗ > saleEnd");
  console.log("phaseAlloc    :", phaseAllocation.toString(),
    phaseAllocation <= totalTokenSupply ? "✓ <= tokenSupply" : "✗ > tokenSupply (Fixed mode rejects)");
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
