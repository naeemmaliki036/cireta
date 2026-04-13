import { ethers } from "hardhat";
const ISSUER_KEY = "8a76cb14e3becbb35c0a260e87f2e9b62c72875f91ba93b1fc72c8769ed2d6ef";
async function main() {
  const issuer = new ethers.Wallet(ISSUER_KEY, ethers.provider);
  const sale = await ethers.getContractAt("Sale", "0x7038a5B5fFEc1Ce9D11F6900114EfAE3FE8C8719", issuer);

  // Check if seed ended
  const p0 = await sale.phases(0);
  const now = Math.floor(Date.now() / 1000);
  const seedEnd = Number(p0.endTime);
  if (now < seedEnd) {
    const wait = seedEnd - now + 5;
    console.log(`Seed ends in ${wait}s, waiting...`);
    await new Promise(r => setTimeout(r, wait * 1000));
  }

  const remaining = await sale.getRemainingSupply();
  console.log("Remaining supply:", ethers.formatUnits(remaining, 6));

  const newNow = Math.floor(Date.now() / 1000);
  const saleEnd = Number(await sale.saleEndTime());

  console.log("Adding Private Round...");
  await (await sale.addPhase(
    "Private Round",
    ethers.parseUnits("115000", 6),
    remaining,
    50n, 2882n, 5n,
    BigInt(newNow + 5),
    BigInt(saleEnd),
    false, 0,
  )).wait();

  console.log("Private Round deployed!");
  console.log("  Price: $115,000/token");
  console.log("  Allocation:", ethers.formatUnits(remaining, 6));
}
main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
