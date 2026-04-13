import { ethers } from "hardhat";
const ISSUER_KEY = "8a76cb14e3becbb35c0a260e87f2e9b62c72875f91ba93b1fc72c8769ed2d6ef";
async function main() {
  const issuer = new ethers.Wallet(ISSUER_KEY, ethers.provider);
  const sale = await ethers.getContractAt("Sale", "0xa2588377853328f9720229d52F7D757fa0D1D6A3", issuer);
  const phase1 = await sale.phases(1);
  console.log("Phase 1 start:", new Date(Number(phase1.startTime) * 1000).toISOString());
  console.log("Phase 1 end:", new Date(Number(phase1.endTime) * 1000).toISOString());
  console.log("Phase 1 price:", ethers.formatUnits(phase1.pricePerToken, 6));
  console.log("Phase 1 whitelistOnly:", phase1.whitelistOnly);
  console.log("Now:", new Date().toISOString());

  // Phase already started — can't setWhitelist. Make it non-whitelist instead
  // Actually check if phase started
  const now = Math.floor(Date.now() / 1000);
  if (now >= Number(phase1.startTime)) {
    console.log("\nPhase already started — whitelist locked. But tx from whitelisted wallet will work if buyer was on phase 0 whitelist");
    // Check if the investor is whitelisted for phase 1
    const isWL = await sale.whitelisted(1, "0x5c5C4A2563ea79D494a0CA2dCd8d596790651fba");
    console.log("Investor whitelisted for phase 1:", isWL);

    // Check phase 0
    const isWL0 = await sale.whitelisted(0, "0x5c5C4A2563ea79D494a0CA2dCd8d596790651fba");
    console.log("Investor whitelisted for phase 0:", isWL0);
  }
}
main();
