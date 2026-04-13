import { ethers } from "hardhat";
const ISSUER_KEY = "8a76cb14e3becbb35c0a260e87f2e9b62c72875f91ba93b1fc72c8769ed2d6ef";
async function main() {
  const issuer = new ethers.Wallet(ISSUER_KEY, ethers.provider);
  const sale = await ethers.getContractAt("Sale", "0xa2588377853328f9720229d52F7D757fa0D1D6A3", issuer);

  // Shorten phase 1
  const now = Math.floor(Date.now() / 1000);
  console.log("1. Shortening phase 1...");
  await (await sale.shortenPhase(1, now + 5)).wait();
  console.log("   Done");

  await new Promise(r => setTimeout(r, 10000));

  // Add phase 2 — same price, NOT whitelist-only, starts in 30s (time to whitelist)
  const newStart = Math.floor(Date.now() / 1000) + 30;
  const saleEnd = Number(await sale.saleEndTime());
  console.log("2. Adding phase 2 (whitelistOnly, starts in 30s)...");
  await (await sale.addPhase(
    "Seed Round",
    ethers.parseUnits("85000", 6),
    ethers.parseUnits("100000", 6),
    10n, 50000n, 5n,
    BigInt(newStart), BigInt(saleEnd),
    true, 0,
  )).wait();
  console.log("   Done");

  // Whitelist investor BEFORE phase starts
  console.log("3. Whitelisting investor for phase 2...");
  await (await sale.setWhitelist(2, ["0x5c5C4A2563ea79D494a0CA2dCd8d596790651fba"], true)).wait();
  console.log("   Done");

  // Verify
  const phase2 = await sale.phases(2);
  console.log("\nPhase 2 price:", ethers.formatUnits(phase2.pricePerToken, 6), "USDC");
  console.log("Phase 2 starts:", new Date(Number(phase2.startTime) * 1000).toISOString());
  console.log("Investor WL:", await sale.whitelisted(2, "0x5c5C4A2563ea79D494a0CA2dCd8d596790651fba"));
  console.log("Remaining:", ethers.formatUnits(await sale.getRemainingSupply(), 6), "tokens");
}
main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
