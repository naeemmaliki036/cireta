import { ethers } from "hardhat";
import * as fs from "fs";

async function main() {
  const d = JSON.parse(fs.readFileSync("deployments/base-sepolia.json", "utf8"));
  const iface = new ethers.Interface(["function owner() view returns (address)"]);
  const provider = ethers.provider;
  
  for (const [name, addr] of Object.entries(d)) {
    if (!addr || typeof addr !== 'string' || !addr.startsWith('0x')) continue;
    try {
      const result = await provider.call({ to: addr, data: iface.encodeFunctionData("owner") });
      const owner = iface.decodeFunctionResult("owner", result)[0];
      const isSaleFactory = owner.toLowerCase() === d.saleFactory?.toLowerCase();
      const isDeployer = owner.toLowerCase() === '0xbe84c7a8f44f673173d51c0a212c9c66267066a0';
      const label = isSaleFactory ? ' ← SaleFactory' : isDeployer ? ' ← deployer' : '';
      console.log(`${name}: owner=${owner}${label}`);
    } catch {}
  }
}

main().catch(console.error);
