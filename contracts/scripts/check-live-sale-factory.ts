import { ethers } from "hardhat";
async function main() {
  const f = await ethers.getContractAt("CiretaSaleFactory", "0xFfC765aB999CF3D718Aa81869DE3D32Ff3E0d2d9");
  console.log("live saleFactory:", await f.getAddress());
  console.log("  saleImplementation:", await (f as any).saleImplementation());
  try { console.log("  version:", await (f as any).version()); } catch { console.log("  version: (no version() function)"); }
  console.log("  owner:", await (f as any).owner());

  // Check what's at the new sale we just deployed
  const sale = await ethers.getContractAt("Sale", "0x24A8a38F7154B9b06d3E9EA3C646f1043E7EBd4a");
  try { console.log("\nnew sale.version():", await (sale as any).version()); } catch (e: any) { console.log("\nsale.version() FAILED:", e?.shortMessage); }
  try { console.log("new sale.vault():", await (sale as any).vault()); } catch (e: any) { console.log("sale.vault() FAILED:", e?.shortMessage); }
  try { console.log("new sale.fractionToken():", await (sale as any).fractionToken()); } catch (e: any) { console.log("sale.fractionToken() FAILED:", e?.shortMessage); }
  try { console.log("new sale.saleMode():", await (sale as any).saleMode()); } catch (e: any) { console.log("sale.saleMode() FAILED:", e?.shortMessage); }
  try { console.log("new sale.status():", await (sale as any).status()); } catch (e: any) { console.log("sale.status() FAILED:", e?.shortMessage); }
}
main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
