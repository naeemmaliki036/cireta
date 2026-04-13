import { ethers } from "hardhat";
async function main() {
  const sale = await ethers.getContractAt("Sale", "0x7038a5B5fFEc1Ce9D11F6900114EfAE3FE8C8719");
  const now = Math.floor(Date.now() / 1000);
  const count = await sale.getPhaseCount();
  for (let i = 0; i < Number(count); i++) {
    const p = await sale.phases(i);
    const s = Number(p.startTime), e = Number(p.endTime);
    console.log(`Phase ${i}: ${p.name} | ${now < s ? "upcoming" : now >= e ? "ended" : "ACTIVE"} | sold: ${ethers.formatUnits(p.sold, 6)}`);
  }
  console.log("Remaining:", ethers.formatUnits(await sale.getRemainingSupply(), 6));
  console.log("Status:", (await sale.status()).toString());
}
main();
