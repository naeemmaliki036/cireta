const { ethers } = require("hardhat");
const fs = require("fs");
const path = require("path");
const deploys = JSON.parse(fs.readFileSync(path.join(__dirname, "../deployments/base-sepolia.json"), "utf-8"));

async function main() {
  console.log("Checking deployed contracts on Base Sepolia...\n");
  for (const [name, addr] of Object.entries(deploys)) {
    if (!addr || addr === "0x0000000000000000000000000000000000000000") {
      console.log(`❌ ${name}: NOT DEPLOYED`); continue;
    }
    try {
      const code = await ethers.provider.getCode(addr);
      const bytes = (code.length - 2) / 2;
      console.log(bytes > 0 ? `✅ ${name}: ${addr} (${bytes} bytes)` : `❌ ${name}: ${addr} (NO CODE)`);
    } catch (e) {
      console.log(`⚠️ ${name}: ${e.message.slice(0, 80)}`);
    }
  }
  console.log("\n═══ Factory Ownership ═══");
  const abi = ["function owner() view returns (address)"];
  for (const n of ["tokenFactory", "saleFactory"]) {
    try {
      const c = new ethers.Contract(deploys[n], abi, ethers.provider);
      console.log(`${n} owner: ${await c.owner()}`);
    } catch(e) { console.log(`${n}: ${e.message.slice(0, 100)}`); }
  }
}
main().catch(console.error);
