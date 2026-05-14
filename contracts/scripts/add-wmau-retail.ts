import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";

const SALE = "0x11CFB56B6766268cc86F87A6df1Be1c2D060E96F";

async function main() {
  const sandboxEnv = fs.readFileSync(path.join(__dirname, "..", "..", ".env.sandbox-e2e"), "utf-8");
  const getKey = (n: string) => "0x" + sandboxEnv.match(new RegExp(`^${n}=([0-9a-fA-Fx]+)`, "m"))![1].replace(/^0x/, "");
  const issuer = new ethers.Wallet(getKey("ISSUER_PRIVATE_KEY"), ethers.provider);
  const admin = new ethers.Wallet(getKey("ADMIN_PRIVATE_KEY"), ethers.provider);

  const sale = await ethers.getContractAt("Sale", SALE, issuer);
  const saleAsAdmin = await ethers.getContractAt("Sale", SALE, admin);

  let phaseCount = await (sale as any).getPhaseCount();
  console.log("phaseCount:", phaseCount);

  if (phaseCount < 3n) {
    const privEnd = (await (sale as any).getPhase(1)).endTime;
    const saleEnd = await (sale as any).saleEndTime();
    const retStart = privEnd + 60n;
    const retEnd = saleEnd;
    console.log(`Adding Retail: start=${retStart}, end=${retEnd}`);
    const tx = await (sale as any).addPhase(
      "Retail",
      125_000n * 10n ** 6n,
      2_435n * 10n ** 6n,
      1n, 2_435n, 1n,
      retStart, retEnd,
      false, 1,
      { gasLimit: 500_000n },
    );
    console.log("  tx:", tx.hash);
    const r = await tx.wait();
    console.log("  status:", r.status, "gasUsed:", r.gasUsed);
  }

  phaseCount = await (sale as any).getPhaseCount();
  console.log("phaseCount after:", phaseCount);

  // Approve + activate
  const approved = await (sale as any).approved();
  if (!approved) {
    console.log("\nApprove...");
    await (await (saleAsAdmin as any).approveSale()).wait();
  }
  const status = await (sale as any).status();
  if (status === 0n) {
    console.log("Activate...");
    await (await (sale as any).activate()).wait();
  }
  console.log("\nFinal status:", await (sale as any).status(), "(1=Active)");
  console.log("Final phases:", await (sale as any).getPhaseCount());
}

main().catch(e => { console.error("FAILED:", e?.message || e); process.exit(1); });
