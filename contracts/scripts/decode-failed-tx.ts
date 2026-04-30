import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";

const TX_HASH = "0xcec3f74eb8ff24c4443245554094772bf4efb0742c33e542dc6e531dc24715d4";
const DEPLOYMENT_FILE = "base-sepolia.v2.20260430.json";

async function main() {
  const provider = ethers.provider;
  const d = JSON.parse(
    fs.readFileSync(path.join(__dirname, "..", "deployments", DEPLOYMENT_FILE), "utf-8"),
  );

  console.log("\n=== Decode Failed Tx ===");
  console.log("Tx:", TX_HASH);

  const tx = await provider.getTransaction(TX_HASH);
  const receipt = await provider.getTransactionReceipt(TX_HASH);
  if (!tx || !receipt) {
    console.error("Tx not found");
    return;
  }
  console.log("Block:   ", receipt.blockNumber);
  console.log("Status:  ", receipt.status === 0 ? "REVERTED" : "OK");
  console.log("From:    ", tx.from);
  console.log("To:      ", tx.to);
  console.log("Gas used:", receipt.gasUsed.toString());

  // Re-run as eth_call AT THE BLOCK THE TX WAS MINED IN — this is the only way
  // to get the revert reason on a chain that doesn't keep tx traces.
  console.log("\n--- Replaying as eth_call at block", receipt.blockNumber, "---");
  try {
    const result = await provider.call({
      from: tx.from,
      to: tx.to!,
      data: tx.data,
      value: tx.value,
      gasLimit: tx.gasLimit,
      gasPrice: tx.gasPrice,
    }, receipt.blockNumber - 1);
    console.log("Replay returned (no revert):", result);
  } catch (e: any) {
    const data = e.data ?? e.error?.data ?? e.info?.error?.data;
    console.log("Revert raw:", data);
    if (data && typeof data === "string" && data.length >= 10) {
      // Try every contract interface we know
      const candidates = [
        await ethers.getContractAt("CiretaSaleFactory", d.saleFactory),
        await ethers.getContractAt("Sale", d.saleImplementation),
        await ethers.getContractAt("CiretaFractionFactory", d.fractionFactory),
        await ethers.getContractAt("CiretaVault", d.vaultImplementation),
        await ethers.getContractAt("SimpleIdentityRegistry", d.simpleIdentityRegistry),
      ];
      for (const c of candidates) {
        try {
          const parsed = c.interface.parseError(data);
          if (parsed) {
            console.log(`→ Decoded: ${parsed.name}(${parsed.args.map(String).join(", ")})`);
            console.log(`   from interface of: ${c.target}`);
            return;
          }
        } catch { /* try next */ }
      }
      console.log("(no matching custom error in known contracts)");
      console.log("Selector:", data.slice(0, 10));
    } else {
      console.log("Error:", e.shortMessage || e.message?.slice(0, 300));
    }
  }
}

main().catch((e) => {
  console.error("Unhandled:", e);
  process.exit(1);
});
