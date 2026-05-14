/**
 * Continuation for the WMAU deploy — token, sale, vault deployed; Seed phase
 * added; deposits done. Picks up at adding Private + Retail phases, then
 * approves + activates.
 */
import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";

const TOKEN = "0x09ab611DBD3A26Bb0cfa2bC038898F5F70051d9B";
const SALE = "0x11CFB56B6766268cc86F87A6df1Be1c2D060E96F";
const VAULT = "0x359ae1e854016F103c110Fc11Ed88fEA7235fDD4";
const FRACTION = "0xf6633fC8811515Ae9dd121C03b351fa3F45b721c";
const COMPLIANCE = "0x3a25bC176319e59DA189c05313eC9100ecec818f";
const IDENTITY_REGISTRY = "0x5B344d1E07B57D36B8FD99b2e241dd7E8674d7BE";

async function main() {
  const sandboxEnv = fs.readFileSync(path.join(__dirname, "..", "..", ".env.sandbox-e2e"), "utf-8");
  const getKey = (n: string) => "0x" + sandboxEnv.match(new RegExp(`^${n}=([0-9a-fA-Fx]+)`, "m"))![1].replace(/^0x/, "");
  const issuer = new ethers.Wallet(getKey("ISSUER_PRIVATE_KEY"), ethers.provider);
  const admin = new ethers.Wallet(getKey("ADMIN_PRIVATE_KEY"), ethers.provider);

  const sale = await ethers.getContractAt("Sale", SALE, issuer);
  const saleAsAdmin = await ethers.getContractAt("Sale", SALE, admin);

  const saleStart = await (sale as any).saleStartTime();
  const saleEnd = await (sale as any).saleEndTime();
  const seedPhase = await (sale as any).getPhase(0);
  const seedEnd = seedPhase.endTime;
  const phaseCount = await (sale as any).getPhaseCount();
  const approved = await (sale as any).approved();
  const status = await (sale as any).status();
  console.log("State: phaseCount=", phaseCount, " approved=", approved, " status=", status);

  const ONE_DAY = 86400n;

  // Add Private phase (if not already)
  if (phaseCount < 2n) {
    console.log("\n=== Add Private phase ===");
    const privStart = seedEnd + 60n; // 60s buffer to be safe
    const privEnd = saleStart + 182n * ONE_DAY;
    await (await (sale as any).addPhase(
      "Private",
      115_000n * 10n ** 6n,
      2_435n * 10n ** 6n,
      50n, 2_435n, 1n,
      privStart, privEnd,
      false, 1, // Remaining
    )).wait();
    console.log(`  Private: ${new Date(Number(privStart) * 1000).toISOString()} → ${new Date(Number(privEnd) * 1000).toISOString()}`);
  }

  // Add Retail phase (if not already)
  const newPhaseCount = await (sale as any).getPhaseCount();
  if (newPhaseCount < 3n) {
    console.log("\n=== Add Retail phase ===");
    const privPhase = await (sale as any).getPhase(1);
    const retStart = privPhase.endTime + 60n;
    const retEnd = saleEnd;
    await (await (sale as any).addPhase(
      "Retail",
      125_000n * 10n ** 6n,
      2_435n * 10n ** 6n,
      1n, 2_435n, 1n,
      retStart, retEnd,
      false, 1,
    )).wait();
    console.log(`  Retail: ${new Date(Number(retStart) * 1000).toISOString()} → ${new Date(Number(retEnd) * 1000).toISOString()}`);
  }

  // Approve + activate
  if (!approved) {
    console.log("\n=== Admin approve ===");
    await (await (saleAsAdmin as any).approveSale()).wait();
  }
  if (status === 0n) {
    console.log("\n=== Issuer activate ===");
    await (await (sale as any).activate()).wait();
  }

  console.log("\nFinal phaseCount:", await (sale as any).getPhaseCount());
  console.log("Final status:    ", await (sale as any).status(), "(1=Active)");

  const out = {
    token: TOKEN, sale: SALE, vault: VAULT, fraction: FRACTION,
    compliance: COMPLIANCE, identityRegistry: IDENTITY_REGISTRY,
    saleStartTime: Number(saleStart),
    saleEndTime: Number(saleEnd),
    phases: [
      await (sale as any).getPhase(0),
      await (sale as any).getPhase(1),
      await (sale as any).getPhase(2),
    ].map(p => ({
      name: p.name, price: p.pricePerToken.toString(),
      allocation: p.allocation.toString(),
      start: Number(p.startTime), end: Number(p.endTime),
      min: Number(p.minTokens), max: Number(p.maxTokens), topUp: Number(p.topUpMinTokens),
    })),
  };
  fs.writeFileSync("/tmp/wmau-deploy.json", JSON.stringify(out, null, 2) + "\n");
  console.log("\nSaved → /tmp/wmau-deploy.json");
  console.log(JSON.stringify(out, null, 2));
}

main().catch(e => { console.error(e); process.exit(1); });
