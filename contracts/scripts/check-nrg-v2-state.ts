import { ethers } from "hardhat";

const TOKEN = "0xaD3c8aE21a3E5feAa95c7B2fc6B26b724344b658";
const SALE = "0x35AA07275828FfDe23De3551d8F74b6c9283a25b";
const VAULT = "0xF46Ca1860F31b77Ea5ADa77E25c95b464d94fb41";

async function main() {
  const token = await ethers.getContractAt("CiretaToken", TOKEN);
  const sale = await ethers.getContractAt("Sale", SALE);
  const vault = await ethers.getContractAt("CiretaVault", VAULT);

  console.log("== ON-CHAIN STATE ==");
  console.log("token.balanceOf(vault):  ", ethers.formatUnits(await token.balanceOf(VAULT), 6), "NRG");
  console.log("token.balanceOf(sale):   ", ethers.formatUnits(await token.balanceOf(SALE), 6), "NRG");
  console.log("token.balanceOf(issuer): ", ethers.formatUnits(await token.balanceOf("0x759948398F66310cAE12896644aCD9eAd86A9650"), 6), "NRG");
  console.log("sale.status():           ", await (sale as any).status());
  console.log("sale.approved():         ", await (sale as any).approved());
  console.log("sale.getPhaseCount():    ", await (sale as any).getPhaseCount());
  console.log("vault.totalLocked():     ", ethers.formatUnits(await (vault as any).totalLocked(), 6));
  console.log("vault.fractionToken():   ", await (vault as any).fractionToken());
  console.log("vault.sale():            ", await (vault as any).sale());
  console.log("vault.vestingConfig():   ", await (vault as any).vestingConfig());
  console.log("sale.vault():            ", await (sale as any).vault());
  console.log("sale.fractionToken():    ", await (sale as any).fractionToken());
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
