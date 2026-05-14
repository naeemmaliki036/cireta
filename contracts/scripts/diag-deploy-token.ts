/**
 * Diagnostic: call deployToken via staticCall to surface the actual revert reason.
 */
import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";

async function main() {
  const sandboxEnv = fs.readFileSync(path.join(__dirname, "..", "..", ".env.sandbox-e2e"), "utf-8");
  const m = sandboxEnv.match(/^ISSUER_PRIVATE_KEY=([0-9a-fA-Fx]+)/m);
  const issuerKey = "0x" + m![1].replace(/^0x/, "");
  const issuer = new ethers.Wallet(issuerKey, ethers.provider);

  const deploy = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "deployments", "base-sepolia.json"), "utf-8"));
  const tf = await ethers.getContractAt("CiretaTokenFactory", deploy.tokenFactory, issuer);

  // Raw eth_call to get the revert data
  const data = tf.interface.encodeFunctionData("deployToken", [
    "Neuro Rehab Ghana",
    "NRG",
    6,
    issuer.address,
    ethers.ZeroAddress,
    75_000n * 10n ** 6n,
    false,
    75_000n * 10n ** 6n,
  ]);

  try {
    const result = await ethers.provider.call({
      to: deploy.tokenFactory,
      data,
      from: issuer.address,
    });
    console.log("eth_call returned:", result);
  } catch (e: any) {
    console.log("Full error:");
    console.log(JSON.stringify(e, Object.getOwnPropertyNames(e), 2).slice(0, 2000));
  }
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
