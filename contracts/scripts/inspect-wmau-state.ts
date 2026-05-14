/**
 * The WMAU deploy bailed mid-script (script lost the addresses).
 * Recover them from the Sale at 0x11CFB56B6766268cc86F87A6df1Be1c2D060E96F (the
 * `to` address from the failed Private-phase tx).
 */
import { ethers } from "hardhat";

const SALE = "0x11CFB56B6766268cc86F87A6df1Be1c2D060E96F";

async function main() {
  const sale = await ethers.getContractAt("Sale", SALE);
  const tokenAddr = await (sale as any).token();
  const vaultAddr = await (sale as any).vault();
  const fractionAddr = await (sale as any).fractionToken();
  const status = await (sale as any).status();
  const approved = await (sale as any).approved();
  const phaseCount = await (sale as any).getPhaseCount();
  const saleStart = await (sale as any).saleStartTime();
  const saleEnd = await (sale as any).saleEndTime();
  const mode = await (sale as any).saleMode();

  console.log("Sale state:");
  console.log("  token:       ", tokenAddr);
  console.log("  vault:       ", vaultAddr);
  console.log("  fraction:    ", fractionAddr);
  console.log("  status:      ", status);
  console.log("  approved:    ", approved);
  console.log("  saleMode:    ", mode, "(1=Vested)");
  console.log("  phaseCount:  ", phaseCount);
  console.log("  saleStart:   ", saleStart, new Date(Number(saleStart) * 1000).toISOString());
  console.log("  saleEnd:     ", saleEnd, new Date(Number(saleEnd) * 1000).toISOString());

  if (vaultAddr !== ethers.ZeroAddress) {
    const token = await ethers.getContractAt("CiretaToken", tokenAddr);
    console.log("  vault WMAU:  ", ethers.formatUnits(await token.balanceOf(vaultAddr), 6));
    console.log("  issuer WMAU: ", ethers.formatUnits(await token.balanceOf("0x759948398F66310cAE12896644aCD9eAd86A9650"), 6));
  }

  if (phaseCount > 0n) {
    for (let i = 0n; i < phaseCount; i++) {
      const p = await (sale as any).getPhase(i);
      console.log(`  phase[${i}]:`, p.name, " price=", p.pricePerToken.toString(), " min=", p.minTokens, " start=", p.startTime, " end=", p.endTime);
    }
  }
}

main().catch(e => { console.error(e); process.exit(1); });
