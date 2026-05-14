import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";

const SALE = "0x11CFB56B6766268cc86F87A6df1Be1c2D060E96F";

async function main() {
  const sandboxEnv = fs.readFileSync(path.join(__dirname, "..", "..", ".env.sandbox-e2e"), "utf-8");
  const issuerKey = "0x" + sandboxEnv.match(/^ISSUER_PRIVATE_KEY=([0-9a-fA-Fx]+)/m)![1].replace(/^0x/, "");
  const issuer = new ethers.Wallet(issuerKey, ethers.provider);
  const sale = await ethers.getContractAt("Sale", SALE, issuer);

  const privEnd = (await (sale as any).getPhase(1)).endTime;
  const saleEnd = await (sale as any).saleEndTime();
  console.log("privEnd:", privEnd, "saleEnd:", saleEnd, "delta:", saleEnd - privEnd);

  for (const offset of [60n, 120n, 600n]) {
    const start = privEnd + offset;
    const end = saleEnd;
    try {
      await (sale as any).addPhase.staticCall(
        "Retail",
        125_000n * 10n ** 6n,
        2_435n * 10n ** 6n,
        1n, 2_435n, 1n,
        start, end,
        false, 1, // Remaining
      );
      console.log(`offset ${offset}: ✓ would succeed`);
    } catch (e: any) {
      console.log(`offset ${offset}: ✗ ${e?.shortMessage || e?.reason} data=${e?.data?.slice(0,20)}`);
    }
  }
}
main().catch(e => { console.error(e); process.exit(1); });
