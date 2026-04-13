/**
 * Fix Wassa Gold Seed phase price: $1 → $85,000 per token.
 * Shorten current phase, add new one with correct price.
 */
import { ethers } from "hardhat";

const ISSUER_KEY = "8a76cb14e3becbb35c0a260e87f2e9b62c72875f91ba93b1fc72c8769ed2d6ef";
const SALE = "0xa2588377853328f9720229d52F7D757fa0D1D6A3";

async function main() {
  const issuer = new ethers.Wallet(ISSUER_KEY, ethers.provider);
  const sale = await ethers.getContractAt("Sale", SALE, issuer);

  // Check current state
  const phase0 = await sale.phases(0);
  console.log("Current phase price:", ethers.formatUnits(phase0.pricePerToken, 6), "USDC");
  console.log("Current phase sold:", ethers.formatUnits(phase0.sold, 6), "tokens");

  // Shorten current phase to now
  const now = Math.floor(Date.now() / 1000);
  console.log("\n1. Shortening phase 0...");
  await (await sale.shortenPhase(0, now + 5)).wait();
  console.log("   Phase 0 shortened");

  // Wait for it to end
  console.log("   Waiting 10s...");
  await new Promise(r => setTimeout(r, 10000));

  // Add new phase with correct price ($85,000 = 85000 * 10^6 raw)
  const newStart = Math.floor(Date.now() / 1000) + 5;
  const saleEnd = Number(await sale.saleEndTime());
  const correctPrice = ethers.parseUnits("85000", 6); // $85,000 in USDC (6 decimals)
  const allocation = ethers.parseUnits("100000", 6); // 100k tokens

  console.log("\n2. Adding new Seed phase with $85,000 price...");
  await (await sale.addPhase(
    "Seed Round",
    correctPrice,
    allocation,
    10n,     // minTokens
    50000n,  // maxTokens
    5n,      // topUpMin
    BigInt(newStart),
    BigInt(saleEnd),
    true,    // whitelistOnly
    0,       // Fixed
  )).wait();
  console.log("   New phase added");

  // Whitelist the investor
  console.log("\n3. Whitelisting investor...");
  await (await sale.setWhitelist(1, ["0x5c5C4A2563ea79D494a0CA2dCd8d596790651fba"], true)).wait();
  console.log("   Investor whitelisted for new phase");

  // Verify
  const phase1 = await sale.phases(1);
  console.log("\nNew phase price:", ethers.formatUnits(phase1.pricePerToken, 6), "USDC");
  console.log("New phase allocation:", ethers.formatUnits(phase1.allocation, 6), "tokens");
  console.log("Remaining supply:", ethers.formatUnits(await sale.getRemainingSupply(), 6));
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
