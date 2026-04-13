import { ethers } from "hardhat";
const ISSUER_KEY = "8a76cb14e3becbb35c0a260e87f2e9b62c72875f91ba93b1fc72c8769ed2d6ef";
async function main() {
  const issuer = new ethers.Wallet(ISSUER_KEY, ethers.provider);
  const sale = await ethers.getContractAt("Sale", "0x7038a5B5fFEc1Ce9D11F6900114EfAE3FE8C8719", issuer);
  const remaining = await sale.getRemainingSupply();
  const now = Math.floor(Date.now() / 1000);
  const saleEnd = Number(await sale.saleEndTime());
  console.log("Remaining:", ethers.formatUnits(remaining, 6));
  // Use Remaining mode (1) — no fixed allocation, sells whatever is left
  await (await sale.addPhase(
    "Private Round", ethers.parseUnits("115000", 6),
    0, // allocation = 0 for Remaining mode
    50n, 2882n, 5n, BigInt(now + 10), BigInt(saleEnd),
    false, 1, // AllocationMode.Remaining
  )).wait();
  console.log("Private Round deployed! (Remaining mode)");
  console.log("  Available:", ethers.formatUnits(remaining, 6), "tokens");
}
main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
