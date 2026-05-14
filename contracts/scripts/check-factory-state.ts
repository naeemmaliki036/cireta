/**
 * Read the on-chain state of CiretaTokenFactory to find the missing setting.
 */
import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";

async function main() {
  const deploy = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "deployments", "base-sepolia.json"), "utf-8"));
  const tf = await ethers.getContractAt("CiretaTokenFactory", deploy.tokenFactory);

  console.log("=== CiretaTokenFactory state ===");
  console.log(`address:                          ${deploy.tokenFactory}`);
  console.log(`owner():                          ${await (tf as any).owner()}`);
  console.log(`tokenImplementation():            ${await (tf as any).tokenImplementation()}`);
  console.log(`identityRegistryImplementation(): ${await (tf as any).identityRegistryImplementation()}`);
  console.log(`complianceImplementation():       ${await (tf as any).complianceImplementation()}`);
  console.log(`simpleIdentityMode():             ${await (tf as any).simpleIdentityMode()}`);
  console.log(`issuerRegistry():                 ${await (tf as any).issuerRegistry()}`);
  console.log(`claimTopicsRegistry():            ${await (tf as any).claimTopicsRegistry()}`);
  console.log(`trustedIssuersRegistry():         ${await (tf as any).trustedIssuersRegistry()}`);
  console.log(`identityRegistryStorage():        ${await (tf as any).identityRegistryStorage()}`);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
