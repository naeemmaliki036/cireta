import { ethers } from "hardhat";

async function main() {
  const provider = ethers.provider;
  const investor = new ethers.Wallet(process.env.INVESTOR_PRIVATE_KEY!, provider);
  const SILVER = "0x79628a858dAb322b9e8D93133c57910391B4117c";
  const SALE = "0x7F9B076310b7347bE8c5D6Dac29E5F714Bad2270";
  const VAULT = "0xEA945f4e4BA69065F96A2d5aEd020c763C021cF4";
  const SIR = "0x5B344d1E07B57D36B8FD99b2e241dd7E8674d7BE";
  const USDC = "0x3Bfb6B62C015EE815e5Eb0A7e212F580446D9898";

  const sale = await ethers.getContractAt("Sale", SALE, investor);
  const sir = await ethers.getContractAt("SimpleIdentityRegistry", SIR, investor);

  console.log("Status:", await sale.status(), "(1=Active)");
  console.log("Phase 0:", await sale.getPhase(0));
  console.log("Hard cap:", await sale.hardCap(), "Total raised:", await sale.totalRaised());
  console.log("\nSIR whitelist:");
  console.log("  investor:", await sir.isVerified(investor.address));
  console.log("  sale:", await sir.isVerified(SALE));
  console.log("  vault:", await sir.isVerified(VAULT));
  const fracAddr = await sale.fractionToken();
  console.log("  fraction:", await sir.isVerified(fracAddr));
  console.log("  silver:", await sir.isVerified(SILVER));

  const usdc = await ethers.getContractAt("CiretaUSDC", USDC, investor);
  console.log("\nInvestor USDC:", ethers.formatUnits(await usdc.balanceOf(investor.address), 6));
  console.log("USDC allowance(investor→sale):", ethers.formatUnits(await usdc.allowance(investor.address, SALE), 6));

  console.log("\nstaticCall buy(0, 100):");
  try {
    await sale.buy.staticCall(0, 100n);
    console.log("  ✓ would succeed");
  } catch (e: any) {
    console.log("  REVERT:", e.shortMessage || e.message?.slice(0, 200));
    if (e.data) {
      console.log("  data:", e.data);
      // Try Sale + ModularCompliance + FractionToken errors
      for (const name of ["Sale", "ModularCompliance", "CiretaFractionToken1155", "CiretaVault", "SimpleIdentityRegistry"]) {
        try {
          const iface = (await ethers.getContractFactory(name)).interface;
          const parsed = iface.parseError(e.data);
          if (parsed) { console.log(`  decoded as ${name}.${parsed.name}(${parsed.args})`); break; }
        } catch {}
      }
    }
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
