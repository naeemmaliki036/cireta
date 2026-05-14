/**
 * Diagnostic: send the deployToken tx with explicit gasLimit so it actually
 * goes on-chain. Then read the receipt + use debug_traceCall to surface revert.
 */
import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";

async function main() {
  const sandboxEnv = fs.readFileSync(path.join(__dirname, "..", "..", ".env.sandbox-e2e"), "utf-8");
  const keyName = process.env.AS_ADMIN ? "ADMIN_PRIVATE_KEY" : "ISSUER_PRIVATE_KEY";
  const m = sandboxEnv.match(new RegExp(`^${keyName}=([0-9a-fA-Fx]+)`, "m"));
  const issuerKey = "0x" + m![1].replace(/^0x/, "");
  const issuer = new ethers.Wallet(issuerKey, ethers.provider);
  console.log(`signer (${keyName}): ${issuer.address}`);

  const deploy = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "deployments", "base-sepolia.json"), "utf-8"));
  const tf = await ethers.getContractAt("CiretaTokenFactory", deploy.tokenFactory, issuer);

  console.log("Sending deployToken tx with explicit gasLimit...");
  try {
    const tx = await (tf as any).deployToken(
      "Neuro Rehab Ghana",
      "NRG",
      6,
      issuer.address,
      ethers.ZeroAddress,
      75_000n * 10n ** 6n,
      false,
      75_000n * 10n ** 6n,
      { gasLimit: 10_000_000n },
    );
    console.log(`tx: ${tx.hash}`);
    const receipt = await tx.wait();
    console.log(`status: ${receipt.status}`);
    if (receipt.status === 0) {
      console.log("Tx reverted. Trying eth_call at the same block...");
      try {
        await ethers.provider.call({
          to: deploy.tokenFactory,
          data: tx.data,
          from: issuer.address,
          gasLimit: 10_000_000n,
        }, receipt.blockNumber);
      } catch (e: any) {
        console.log("call error:", e?.shortMessage || e?.info?.error?.message || JSON.stringify(e?.info || e));
      }
    }
  } catch (e: any) {
    console.log("Send failed:");
    console.log("  message:", e?.message);
    console.log("  shortMessage:", e?.shortMessage);
    console.log("  info:", JSON.stringify(e?.info)?.slice(0, 500));
    console.log("  error.error.data:", e?.error?.error?.data);
  }
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
