import { ethers } from "hardhat";

const SALE = "0xb56Aa215df04A98859cfF7545050eAE0859f1016";
const TOKEN = "0x6570A973ddA4Ae750bDbC56a8C10a6c19B753B07";
const VAULT = "0xB6A91814Da6711AF58E5750E59c36d422846DE2c";
const OTC = "0x7B041a8c5646f3aE8CF2555c5327f31bFa3490c4";
const OTC_RECIPIENT = "0x5c5C4A2563ea79D494a0CA2dCd8d596790651fba";

async function main() {
  const sale = await ethers.getContractAt("Sale", SALE);
  const token = await ethers.getContractAt("CiretaToken", TOKEN);
  const otc = await ethers.getContractAt("IssuerOTCToken", OTC);

  const status = await (sale as any).status();
  const otcAddr = await (sale as any).otcToken();
  const phasesLen = await (sale as any).getPhaseCount();
  const vaultBal = await token.balanceOf(VAULT);
  const otcBal = await (otc as any).balanceOf(OTC_RECIPIENT);
  const otcSupply = await (otc as any).totalSupply();
  const otcName = await (otc as any).name();
  const otcSymbol = await (otc as any).symbol();
  const issuerAddr = await (sale as any).issuer();
  const approvedBy = await (sale as any).approvedBy?.().catch(() => "n/a");

  console.log("Sale status   :", status.toString(), "(0=Draft, 1=Active, 2=Finalized, 3=Failed)");
  console.log("Sale issuer   :", issuerAddr);
  console.log("Sale.otcToken :", otcAddr);
  console.log("Phases        :", phasesLen.toString());
  console.log("Vault BTP bal :", ethers.formatUnits(vaultBal, 6));
  console.log("OTC name      :", otcName);
  console.log("OTC symbol    :", otcSymbol);
  console.log("OTC supply    :", ethers.formatUnits(otcSupply, 6));
  console.log("OTC bal recip :", ethers.formatUnits(otcBal, 6));
  console.log("approvedBy    :", approvedBy);

  if (phasesLen > 0n) {
    const phase = await (sale as any).phases(0);
    console.log("Phase 0:");
    console.log("  name        :", phase.name);
    console.log("  pricePerTok :", phase.pricePerToken.toString());
    console.log("  allocation  :", phase.allocation.toString());
    console.log("  start       :", new Date(Number(phase.startTime) * 1000).toISOString());
    console.log("  end         :", new Date(Number(phase.endTime) * 1000).toISOString());
  }
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
