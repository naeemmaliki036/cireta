import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";

async function main() {
  const addr = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "deployments", "base-sepolia.json"), "utf-8"));

  const factory = new ethers.Contract(addr.tokenFactory, [
    "function getDeployedTokensCount() view returns (uint256)",
    "function getDeployedTokens(uint256 offset, uint256 limit) view returns (address[])",
  ], ethers.provider);

  const count = await factory.getDeployedTokensCount();
  console.log("Deployed tokens:", count.toString());

  if (count > 0n) {
    const tokens = await factory.getDeployedTokens(0, count);
    for (const t of tokens) {
      const token = new ethers.Contract(t, [
        "function name() view returns (string)",
        "function symbol() view returns (string)",
        "function decimals() view returns (uint8)",
        "function identityRegistry() view returns (address)",
        "function compliance() view returns (address)",
      ], ethers.provider);
      console.log("\nToken:", t);
      console.log("  Name:", await token.name());
      console.log("  Symbol:", await token.symbol());
      console.log("  Decimals:", (await token.decimals()).toString());
      console.log("  IdentityRegistry:", await token.identityRegistry());
      console.log("  Compliance:", await token.compliance());
      console.log("  BaseScan:", `https://sepolia.basescan.org/address/${t}`);
    }
  }
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
