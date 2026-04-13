import { ethers } from "hardhat";
async function main() {
  const addr = "0x731490d1Cf4199f45368F3F739c91A2A1262d065";
  // WGGH registry
  const reg = await ethers.getContractAt("SimpleIdentityRegistry", "0x2f25fB1Eca5153ee5caF99bCa720C289646EB5D1");
  console.log("WGGH registry:", await reg.isVerified(addr) ? "WHITELISTED" : "NOT whitelisted");
  // Also check if whitelisted for Private Round phase on-chain
  const sale = await ethers.getContractAt("Sale", "0x7038a5B5fFEc1Ce9D11F6900114EfAE3FE8C8719");
  console.log("Phase 1 whitelist:", await sale.whitelisted(1, addr) ? "YES" : "NO");
}
main();
