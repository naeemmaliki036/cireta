import { ethers } from "hardhat";

const REGISTRY = "0x5B344d1E07B57D36B8FD99b2e241dd7E8674d7BE";

async function main() {
  const registry = await ethers.getContractAt(
    [
      "function REGISTRAR_ROLE() view returns (bytes32)",
      "function DEFAULT_ADMIN_ROLE() view returns (bytes32)",
      "function getRoleMemberCount(bytes32) view returns (uint256)",
      "function getRoleMember(bytes32, uint256) view returns (address)",
      "function hasRole(bytes32, address) view returns (bool)",
      "function owner() view returns (address)",
    ],
    REGISTRY,
  );

  const REGISTRAR_ROLE = await registry.REGISTRAR_ROLE();
  const ADMIN_ROLE = await registry.DEFAULT_ADMIN_ROLE();
  console.log("Registry:        ", REGISTRY);
  console.log("REGISTRAR_ROLE:  ", REGISTRAR_ROLE);
  console.log("DEFAULT_ADMIN:   ", ADMIN_ROLE);

  // AccessControl in this contract isn't enumerable, so check candidate
  // addresses individually with hasRole().
  const candidates: Record<string, string> = {
    "deployer/admin (deployment.admin)":   "0x8eE48b43abb1a53e0a61bB31d0Fc7E898e7f2ac3",
    "saleFactory":                          "0xFfC765aB999CF3D718Aa81869DE3D32Ff3E0d2d9",
    "tokenFactory":                         "0x14e2A35c35DC58d4eB6BFE329811Ca1bDbbF94E4",
    "fractionFactory":                      "0x4E9412A787731A20A7C28cF92Aa6a799539b1C64",
    "otcTokenFactory":                      "0x0094c64d3bA4218381C77cCE7493991CBe42b969",
    "issuerRegistry":                       "0x601D0DC8025CEA6B89E922E38f2Af0CCC61bBEDa",
  };
  // Also check whatever the API service key + IDENTITY_SIGNER are, if set.
  for (const env of ["IDENTITY_SIGNER_PRIVATE_KEY", "CLAIM_SIGNER_PRIVATE_KEY"]) {
    const pk = process.env[env];
    if (pk) {
      try {
        const a = new ethers.Wallet(pk).address;
        candidates[`${env} address`] = a;
      } catch {}
    }
  }

  for (const [role, label] of [[REGISTRAR_ROLE, "REGISTRAR_ROLE"], [ADMIN_ROLE, "DEFAULT_ADMIN_ROLE"]] as const) {
    console.log(`\n=== ${label} ===`);
    for (const [name, addr] of Object.entries(candidates)) {
      try {
        const has = await registry.hasRole(role, addr);
        console.log(`  ${has ? "✓" : "✗"}  ${name.padEnd(40)} ${addr}`);
      } catch (e) {
        console.log(`  ?  ${name.padEnd(40)} ${addr} — ${(e as Error).message}`);
      }
    }
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
