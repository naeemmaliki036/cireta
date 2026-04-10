import { ethers } from "hardhat";
import * as fs from "fs";

async function main() {
  const d = JSON.parse(fs.readFileSync("deployments/base-sepolia.json", "utf8"));
  const [deployer] = await ethers.getSigners();
  
  // Get SaleFactory
  const SF = await ethers.getContractFactory("CiretaSaleFactory");
  const sf = SF.attach(d.saleFactory);
  
  // Get token contract (DTG)
  const tokenAddr = "0x8ce4C12Db53523410b99f54fAdB4AeeB55AB72DF"; // DTG
  const Token = await ethers.getContractFactory("CiretaToken");
  const token = Token.attach(tokenAddr);
  
  // Get identityRegistry from token
  let identityReg;
  try {
    identityReg = await token.identityRegistry();
    console.log("Token identityRegistry:", identityReg);
  } catch(e) {
    console.log("Could not read identityRegistry, using platform default");
    identityReg = d.identityRegistryStorage; // fallback
  }
  
  // Check fractionFactory is set
  try {
    const ff = await sf.fractionFactory();
    console.log("SaleFactory.fractionFactory:", ff);
    console.log("Expected:", d.fractionFactory);
  } catch(e) {
    console.error("Could not read fractionFactory:", e);
  }
  
  // Encode Sale.initialize calldata (same as backend)
  const Sale = await ethers.getContractFactory("Sale");
  const paymentToken = "0x036CbD53842c5426634e7929541eC2318f3dCF7e"; // USDC Sepolia
  const feeManager = d.platformFeeManager;
  const softCap = ethers.parseUnits("100", 6);
  const hardCap = ethers.parseUnits("500", 6);
  const nowTs = Math.floor(Date.now() / 1000);
  const saleStart = nowTs + 60;
  const saleEnd = nowTs + 30 * 24 * 3600;

  const initData = Sale.interface.encodeFunctionData("initialize", [
    tokenAddr, paymentToken, identityReg, deployer.address,
    d.saleFactory, feeManager,
    softCap, hardCap, 250, 0,
    ethers.ZeroAddress, // no OTC
    saleStart, saleEnd,
  ]);
  
  console.log("\nSimulating deploySaleVested...");
  try {
    await sf.deploySaleVested.staticCall(
      tokenAddr, deployer.address,
      initData, "cDTG", "cDTG", 18,
      identityReg, 0, 365*86400, 0
    );
    console.log("Static call SUCCESS");
  } catch(e: any) {
    console.error("Static call FAILED:", e.message?.slice(0, 200));
    // Try to decode
    if (e.data) {
      console.log("Error data:", e.data);
      try {
        const decoded = sf.interface.parseError(e.data);
        console.log("Decoded:", decoded);
      } catch {}
    }
  }
}

main().catch(console.error);
