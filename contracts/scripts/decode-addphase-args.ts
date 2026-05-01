import { ethers } from "hardhat";

const TX_HASH = "0x22057846164d0995d4c189c13df787da290af3e2cb5dcec69eead8575433f265";

async function main() {
  const provider = ethers.provider;
  const tx = await provider.getTransaction(TX_HASH);
  if (!tx) { console.error("Tx not found"); return; }

  const saleAbi = (await ethers.getContractFactory("Sale")).interface;
  const parsed = saleAbi.parseTransaction({ data: tx.data, value: tx.value });
  if (!parsed) { console.error("Could not parse"); return; }
  console.log("Method:", parsed.name);
  console.log("Args:");
  parsed.args.forEach((a, i) => {
    const name = parsed.fragment.inputs[i]?.name ?? `arg${i}`;
    let printable: string;
    if (typeof a === "bigint") {
      // Render any uint256 that looks like a unix timestamp as a date too
      const v = Number(a);
      const isPlausibleUnix = v > 1700000000 && v < 2100000000;
      printable = isPlausibleUnix
        ? `${a} (${new Date(v * 1000).toISOString()})`
        : a.toString();
    } else {
      printable = String(a);
    }
    console.log(`  ${name} =`, printable);
  });

  // Now read existing phases on this sale at block before the tx
  const receipt = await provider.getTransactionReceipt(TX_HASH);
  const sale = await ethers.getContractAt(
    [
      "function getPhaseCount() view returns (uint256)",
      "function getPhase(uint256) view returns (tuple(uint256 phaseId, uint256 pricePerToken, uint256 allocation, uint256 minContribution, uint256 maxContribution, uint256 minTokens, uint256 maxTokens, uint256 topUpMinTokens, uint256 startTime, uint256 endTime, bool whitelistOnly, uint8 allocationMode, uint256 totalRaised, uint256 totalTokenSold))",
    ],
    tx.to!,
  );
  const overrides = { blockTag: receipt!.blockNumber - 1 };
  const count = Number(await sale.getPhaseCount(overrides));
  console.log(`\nExisting on-chain phases at this block: ${count}`);
  for (let i = 0; i < count; i++) {
    const p = await sale.getPhase(BigInt(i), overrides);
    console.log(`  phase[${i}]:`,
      `phaseId=${p.phaseId}`,
      `start=${p.startTime} (${new Date(Number(p.startTime) * 1000).toISOString()})`,
      `end=${p.endTime} (${new Date(Number(p.endTime) * 1000).toISOString()})`,
    );
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
