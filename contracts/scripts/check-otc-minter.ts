import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";

const ISSUER = "0x759948398F66310cAE12896644aCD9eAd86A9650";
const DEPLOYMENT_FILE = "base-sepolia.v2.20260430.json";

async function main() {
  const d = JSON.parse(
    fs.readFileSync(path.join(__dirname, "..", "deployments", DEPLOYMENT_FILE), "utf-8"),
  );

  const factory = await ethers.getContractAt(
    ["function getIssuerOTCTokens(address) view returns (address[])"],
    d.otcTokenFactory,
  );
  const tokens: string[] = await factory.getIssuerOTCTokens(ISSUER);
  console.log(`OTC tokens deployed by ${ISSUER}:`, tokens.length);

  if (tokens.length === 0) {
    console.log("No OTC tokens found for this issuer.");
    return;
  }

  const MINTER_ROLE = ethers.keccak256(ethers.toUtf8Bytes("MINTER_ROLE"));
  const DEFAULT_ADMIN_ROLE = "0x" + "00".repeat(32);
  console.log("MINTER_ROLE selector:", MINTER_ROLE);

  for (const addr of tokens) {
    const t = await ethers.getContractAt(
      [
        "function name() view returns (string)",
        "function symbol() view returns (string)",
        "function hasRole(bytes32,address) view returns (bool)",
        "function getRoleAdmin(bytes32) view returns (bytes32)",
      ],
      addr,
    );
    const [name, symbol, isMinter, isAdmin] = await Promise.all([
      t.name(),
      t.symbol(),
      t.hasRole(MINTER_ROLE, ISSUER),
      t.hasRole(DEFAULT_ADMIN_ROLE, ISSUER),
    ]);
    console.log(`\n${addr}`);
    console.log(`  name:     ${name} (${symbol})`);
    console.log(`  MINTER:   ${isMinter}`);
    console.log(`  ADMIN:    ${isAdmin}`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
