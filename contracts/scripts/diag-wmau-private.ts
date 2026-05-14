/**
 * Diagnose why Private phase add reverted on WMAU sale.
 */
import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";

const SALE = "0x11CFB56B6766268cc86F87A6df1Be1c2D060E96F";

async function main() {
  const sandboxEnv = fs.readFileSync(path.join(__dirname, "..", "..", ".env.sandbox-e2e"), "utf-8");
  const getKey = (n: string) => "0x" + sandboxEnv.match(new RegExp(`^${n}=([0-9a-fA-Fx]+)`, "m"))![1].replace(/^0x/, "");
  const issuer = new ethers.Wallet(getKey("ISSUER_PRIVATE_KEY"), ethers.provider);

  const sale = await ethers.getContractAt("Sale", SALE, issuer);

  // Recover seedEnd from on-chain
  const seedPhase = await (sale as any).getPhase(0);
  const seedEnd = seedPhase.endTime;
  const saleEnd = await (sale as any).saleEndTime();
  console.log("Seed end:", seedEnd, "Sale end:", saleEnd);

  // Try 5 variations of addPhase
  const variations = [
    { label: "seedEnd+1, Remaining", start: seedEnd + 1n,    mode: 1 },
    { label: "seedEnd+60, Remaining", start: seedEnd + 60n,  mode: 1 },
    { label: "seedEnd+1, Fixed",      start: seedEnd + 1n,    mode: 0 },
    { label: "seedEnd+60, Fixed",      start: seedEnd + 60n,  mode: 0 },
  ];

  const ONE_DAY = 86400n;
  // Private should end 91 days after its start (or whatever — try sale end)
  for (const v of variations) {
    const privEnd = v.start + 91n * ONE_DAY;
    const trueEnd = privEnd > saleEnd ? saleEnd : privEnd;
    console.log(`\n→ ${v.label}: start=${v.start}, end=${trueEnd}, mode=${v.mode}`);
    try {
      await (sale as any).addPhase.staticCall(
        "Private",
        115_000n * 10n ** 6n,
        2_435n * 10n ** 6n,
        50n, 2_435n, 1n,
        v.start, trueEnd,
        false, v.mode,
      );
      console.log("   ✓ would succeed");
    } catch (e: any) {
      console.log("   ✗ revert:", e?.shortMessage || e?.reason || e?.code, "  data:", e?.data?.slice(0, 20));
    }
  }
}

main().catch(e => { console.error(e); process.exit(1); });
