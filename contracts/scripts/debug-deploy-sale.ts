import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";

const ISSUER_KEY = "8a76cb14e3becbb35c0a260e87f2e9b62c72875f91ba93b1fc72c8769ed2d6ef";
const d = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "deployments", "base-sepolia.json"), "utf-8"));

async function main() {
  const issuer = new ethers.Wallet(ISSUER_KEY, ethers.provider);
  const feeMgr = await ethers.getContractAt("PlatformFeeManager", d.platformFeeManager, issuer);
  const feeBps = await feeMgr.getFeeForIssuer(issuer.address);
  console.log("Fee bps:", feeBps.toString());

  // Use existing token from previous E2E
  const tokenAddress = "0x81dAB3d8E1F60b9c4093D0508ab20442b06b2958";
  const registryAddress = "0x63B616976B788BC65cB66561283436e4DD41ce18";

  const now = Math.floor(Date.now() / 1000);
  const saleIface = new ethers.Interface([
    "function initialize(address,address,address,address,address,address,uint256,uint256,uint256,uint256,address,uint256,uint256,uint256)",
  ]);
  const initData = saleIface.encodeFunctionData("initialize", [
    tokenAddress, d.ciretaUSDC, registryAddress, issuer.address,
    d.saleFactory, d.platformFeeManager,
    ethers.parseUnits("5000", 6),
    ethers.parseUnits("500000", 6),
    feeBps,
    ethers.parseUnits("50000", 6),
    ethers.ZeroAddress,
    BigInt(now), BigInt(now + 180 * 86400),
    ethers.parseUnits("500000", 6),
  ]);
  console.log("initData length:", initData.length);

  const factory = await ethers.getContractAt("CiretaSaleFactory", d.saleFactory, issuer);

  // Try static call first for better error message
  try {
    await factory.deploySaleVested.staticCall(
      tokenAddress, initData,
      "frWMAU", "frWMAU", 6, registryAddress,
      30 * 86400, 365 * 86400, 0,
    );
    console.log("Static call OK — should succeed");
  } catch (e: any) {
    console.log("Static call FAILED:", e.message?.slice(0, 200));
    // Try to decode the error
    if (e.data) console.log("Error data:", e.data);
  }
}
main();
