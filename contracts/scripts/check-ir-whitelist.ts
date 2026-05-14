/**
 * Check whether wallets are whitelisted on the shared sandbox identity registry.
 */
import { ethers } from "hardhat";

const IR = "0x5B344d1E07B57D36B8FD99b2e241dd7E8674d7BE";

const WALLETS = [
  "0xCf8d44D79Ca51E905E1c686E3804aeDFE3f908B3",
  "0xdBAD4B42C4c5e529FC8a02dc577D50ad106813d0",
];

async function main() {
  const ir = await ethers.getContractAt("SimpleIdentityRegistry", IR);
  console.log(`Identity Registry: ${IR}\n`);
  for (const w of WALLETS) {
    try {
      const verified: boolean = await (ir as any).isVerified(w);
      console.log(`  ${w}: ${verified ? "✓ VERIFIED" : "✗ NOT registered"}`);
    } catch (e: any) {
      console.log(`  ${w}: error → ${e?.shortMessage || e?.message}`);
    }
  }
}

main().catch(e => { console.error(e); process.exit(1); });
