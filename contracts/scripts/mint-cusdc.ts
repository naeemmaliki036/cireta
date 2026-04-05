/**
 * Mint cUSDC to test wallets.
 * Anyone can call mint() — open faucet for testnet.
 */
import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";

async function main() {
  const [signer] = await ethers.getSigners();
  const deploymentsPath = path.join(__dirname, "..", "deployments", "base-sepolia.json");
  const addr = JSON.parse(fs.readFileSync(deploymentsPath, "utf-8"));

  const cusdc = new ethers.Contract(addr.ciretaUSDC, [
    "function mint(address to, uint256 amount) external",
    "function balanceOf(address) view returns (uint256)",
    "function symbol() view returns (string)",
  ], signer);

  const recipients = [
    { name: "Investor 01", address: "0x5c5C4A2563ea79D494a0CA2dCd8d596790651fba" },
    { name: "Investor 02", address: "0x5806C2346F2346940D4505ee81749b514EA0bbc2" },
  ];

  const amount = ethers.parseUnits("100000", 6); // 100K cUSDC each

  for (const r of recipients) {
    const tx = await cusdc.mint(r.address, amount);
    await tx.wait();
    const bal = await cusdc.balanceOf(r.address);
    console.log(`${r.name} (${r.address}): ${ethers.formatUnits(bal, 6)} cUSDC`);
  }

  console.log("\nDone!");
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
