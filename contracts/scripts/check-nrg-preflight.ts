/**
 * Pre-flight diagnostic for deploy-nrg-sale.ts.
 * Confirms each precondition: issuer registered on-chain, factory roles, etc.
 */
import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";

const DEPLOY_FILE = path.join(__dirname, "..", "deployments", "base-sepolia.json");
const ISSUER_ADDR = "0x759948398F66310cAE12896644aCD9eAd86A9650";

async function main() {
  const deploy = JSON.parse(fs.readFileSync(DEPLOY_FILE, "utf-8"));

  console.log("=== IssuerRegistry on-chain check ===");
  const reg = await ethers.getContractAt("IssuerRegistry", deploy.issuerRegistry);
  try {
    const isActive = await (reg as any).isActiveIssuer(ISSUER_ADDR);
    console.log(`  IssuerRegistry.isActiveIssuer(${ISSUER_ADDR}): ${isActive}`);
  } catch (e: any) {
    console.log(`  ERROR: ${e?.shortMessage || e?.message || e}`);
  }

  console.log("\n=== Token factory wiring ===");
  const tf = await ethers.getContractAt("CiretaTokenFactory", deploy.tokenFactory);
  try {
    const ir = await (tf as any).issuerRegistry();
    console.log(`  CiretaTokenFactory.issuerRegistry: ${ir}`);
    console.log(`  matches deployment?  ${ir.toLowerCase() === deploy.issuerRegistry.toLowerCase()}`);
  } catch (e: any) {
    console.log(`  ERROR: ${e?.shortMessage || e?.message || e}`);
  }
  try {
    const simpleMode = await (tf as any).simpleIdentityMode();
    console.log(`  simpleIdentityMode: ${simpleMode}`);
  } catch (e: any) {
    console.log(`  ERROR reading simpleIdentityMode: ${e?.shortMessage || e?.message}`);
  }
  const tfOwner = await (tf as any).owner();
  console.log(`  CiretaTokenFactory.owner(): ${tfOwner}`);

  console.log("\n=== ETH balance ===");
  const bal = await ethers.provider.getBalance(ISSUER_ADDR);
  console.log(`  issuer ETH balance: ${ethers.formatEther(bal)} ETH`);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
