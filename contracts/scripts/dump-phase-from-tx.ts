import { ethers } from "hardhat";

const TX_HASH = "0x771b6b0976cf29f3decca6372119c9e3daee6982cb01a59a7914fe6c13cdbaa2";

async function main() {
  const provider = ethers.provider;
  const tx = await provider.getTransaction(TX_HASH);
  const receipt = await provider.getTransactionReceipt(TX_HASH);
  if (!tx || !receipt) {
    console.error("Tx not found");
    return;
  }
  const saleAddress = tx.to!;
  console.log("Sale contract:", saleAddress);
  console.log("Tx status:    ", receipt.status === 0 ? "REVERTED" : "OK");
  console.log("Block:        ", receipt.blockNumber);

  const sale = await ethers.getContractAt(
    [
      "function getPhaseCount() view returns (uint256)",
      "function getPhase(uint256) view returns (tuple(string name, uint256 pricePerToken, uint256 allocation, uint256 sold, uint256 minTokens, uint256 maxTokens, uint256 topUpMinTokens, uint256 startTime, uint256 endTime, bool whitelistOnly, uint8 allocationMode))",
    ],
    saleAddress,
  );

  const count = await sale.getPhaseCount();
  console.log(`On-chain phase count: ${count}`);

  for (let i = 0; i < Number(count); i++) {
    const p = await sale.getPhase(i);
    console.log(`\n--- Phase ${i} ---`);
    console.log("name:           ", p.name);
    console.log("pricePerToken:  ", p.pricePerToken.toString(), `(${(Number(p.pricePerToken) / 1e18).toString()} per token, 18-dec)`);
    console.log("allocation:     ", p.allocation.toString(), `(${(Number(p.allocation) / 1e6).toString()} tokens, 6-dec)`);
    console.log("minTokens:      ", p.minTokens.toString());
    console.log("maxTokens:      ", p.maxTokens.toString());
    console.log("topUpMinTokens: ", p.topUpMinTokens.toString());
    console.log("startTime:      ", p.startTime.toString(), new Date(Number(p.startTime) * 1000).toISOString());
    console.log("endTime:        ", p.endTime.toString(), new Date(Number(p.endTime) * 1000).toISOString());
    console.log("whitelistOnly:  ", p.whitelistOnly);
    console.log("allocationMode: ", p.allocationMode === 0 ? "fixed" : "remaining");

    const priceHuman = (Number(p.pricePerToken) / 1e18).toString();
    const allocHuman = (Number(p.allocation) / 1e6).toString();
    const startISO = new Date(Number(p.startTime) * 1000).toISOString();
    const endISO = new Date(Number(p.endTime) * 1000).toISOString();
    const mode = p.allocationMode === 0 ? "fixed" : "remaining";

    console.log(`\n--- SQL to backfill (run after looking up sale_id WHERE contract_address = '${saleAddress.toLowerCase()}') ---`);
    console.log(`INSERT INTO sale_phases (id, sale_id, phase_number, name, price_per_token, allocation, sold, min_contribution, max_contribution, top_up_min, min_tokens, max_tokens, top_up_min_tokens, allocation_mode, start_time, end_time, whitelist_only, created_at, updated_at)`);
    console.log(`SELECT gen_random_uuid(), s.id, ${i + 1}, '${p.name.replace(/'/g, "''")}', ${priceHuman}, ${allocHuman}, 0, ${p.minTokens.toString()}, ${p.maxTokens.toString()}, ${p.topUpMinTokens.toString()}, 1, 0, 1, '${mode}', '${startISO}'::timestamptz, '${endISO}'::timestamptz, ${p.whitelistOnly}, NOW(), NOW()`);
    console.log(`FROM token_sales s WHERE LOWER(s.contract_address) = '${saleAddress.toLowerCase()}';`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
