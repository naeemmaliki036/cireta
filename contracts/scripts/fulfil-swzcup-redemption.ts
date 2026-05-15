/**
 * Path A step 4: fulfil(0) on the SWZCUP RedemptionManager. Issuer signs.
 *
 * Run:
 *   ./node_modules/.bin/hardhat run scripts/fulfil-swzcup-redemption.ts --network baseSepolia
 */

import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";

const RM_ADDR = "0xB0e37faF3A469524885e23c980bbE9d57af9aa51";
const REQUEST_ID = 0n;

async function main() {
  const sandboxEnv = fs.readFileSync(
    path.join(__dirname, "..", "..", ".env.sandbox-e2e"),
    "utf-8",
  );
  const getKey = (n: string) =>
    "0x" +
    sandboxEnv
      .match(new RegExp(`^${n}=([0-9a-fA-Fx]+)`, "m"))![1]
      .replace(/^0x/, "");
  const issuer = new ethers.Wallet(getKey("ISSUER_PRIVATE_KEY"), ethers.provider);
  console.log("issuer:", issuer.address);

  const rm = await ethers.getContractAt("RedemptionManager", RM_ADDR, issuer);
  // Read the request first to confirm state
  const req = await (rm as any).requests(REQUEST_ID);
  console.log("request:", {
    investor: req.investor,
    amount: req.amount.toString(),
    status: req.status.toString(),
    method: req.method.toString(),
  });

  const tx = await (rm as any).fulfil(REQUEST_ID);
  const rcpt = await tx.wait();
  console.log("fulfil tx:", rcpt.hash);

  const after = await (rm as any).requests(REQUEST_ID);
  console.log("status after:", after.status.toString(), "(2 = Fulfilled)");
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
