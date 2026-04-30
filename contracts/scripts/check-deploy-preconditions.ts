import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";

const DEPLOYMENT_FILE = "base-sepolia.v2.20260430.json";
const ISSUER = "0x759948398F66310cAE12896644aCD9eAd86A9650";

async function main() {
  const d = JSON.parse(
    fs.readFileSync(path.join(__dirname, "..", "deployments", DEPLOYMENT_FILE), "utf-8"),
  );
  const provider = ethers.provider;
  const block = await provider.getBlock("latest");

  console.log("\n=== Sale-Deploy Pre-Conditions ===");
  console.log("Network:        ", (await provider.getNetwork()).chainId);
  console.log("Block ts:       ", block!.timestamp, "→", new Date(Number(block!.timestamp) * 1000).toISOString());
  console.log("Issuer wallet:  ", ISSUER);
  console.log();

  const ir = await ethers.getContractAt(
    [
      "function isVerified(address) view returns (bool)",
      "function isWhitelisted(address) view returns (bool)",
      "function REGISTRAR_ROLE() view returns (bytes32)",
      "function hasRole(bytes32,address) view returns (bool)",
    ],
    d.simpleIdentityRegistry,
  );
  const issuerReg = await ethers.getContractAt(
    ["function isActiveIssuer(address) view returns (bool)"],
    d.issuerRegistry,
  );
  const feeMgr = await ethers.getContractAt(
    ["function getFeeForIssuer(address) view returns (uint256)"],
    d.platformFeeManager,
  );
  const factory = await ethers.getContractAt(
    [
      "function REGISTRAR_ROLE() view returns (bytes32)",
      "function hasRole(bytes32,address) view returns (bool)",
    ],
    d.simpleIdentityRegistry,
  );

  // Pre-condition checks for the THREE custom errors that can revert deploySale*
  const verified = await ir.isVerified(ISSUER);
  console.log("[1] IR.isVerified(issuer):       ", verified, verified ? "✓" : "✗ Sale.initialize → IssuerNotVerified");

  const active = await issuerReg.isActiveIssuer(ISSUER);
  console.log("[2] IssuerRegistry.isActive:     ", active, active ? "✓" : "✗ Factory → NotActiveIssuer");

  const feeBps = await feeMgr.getFeeForIssuer(ISSUER);
  console.log("[3] PlatformFeeManager.fee:      ", feeBps.toString(), feeBps === 200n ? "✓ matches UI value 200" : `(UI sent 200 — mismatch → FeeMismatch)`);

  // Bonus: does the SaleFactory itself have REGISTRAR_ROLE on the IR?
  // (not a deploy revert, but if missing, the auto-whitelist of the new Sale proxy
  //  would fail silently — Sale would still deploy)
  const REGISTRAR_ROLE = await factory.REGISTRAR_ROLE();
  const factoryHasRegistrar = await ir.hasRole(REGISTRAR_ROLE, d.saleFactory);
  console.log("[4] SaleFactory has REGISTRAR_ROLE on IR (for auto-whitelist):", factoryHasRegistrar);

  // Static-call the actual deploySaleVested with the same payload we observed in the user's failed tx
  // to get the exact custom-error name.
  console.log("\n--- Reproducing the failed call (eth_call only) ---");
  const FAILED_CALLDATA = "0x12065efb00000000000000000000000013d69a61b82b1c45e4c30011568c5657791c7fdd00000000000000000000000000000000000000000000000000000000000001200000000000000000000000000000000000000000000000000000000000000320000000000000000000000000000000000000000000000000000000000000036000000000000000000000000000000000000000000000000000000000000000060000000000000000000000005b344d1e07b57d36b8fd99b2e241dd7e8674d7be0000000000000000000000000000000000000000000000000000000000278d000000000000000000000000000000000000000000000000000000000000278d00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000001c4b9e8e5dd00000000000000000000000013d69a61b82b1c45e4c30011568c5657791c7fdd0000000000000000000000003bfb6b62c015ee815e5eb0a7e212f580446d98980000000000000000000000005b344d1e07b57d36b8fd99b2e241dd7e8674d7be000000000000000000000000759948398f66310cae12896644acd9ead86a9650000000000000000000000000ffc765ab999cf3d718aa81869de3d32ff3e0d2d9000000000000000000000000a6d90eaf016981d706474c8e3e56eb3d1859640b000000000000000000000000000000000000000000000000000000003b9aca0000000000000000000000000000000000000000000000000000000006b5ce4d0000000000000000000000000000000000000000000000000000000000000000c80000000000000000000000000000000000000000000000000000000ba43b740000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000069f2b66b000000000000000000000000000000000000000000000000000000006bd3e9eb00000000000000000000000000000000000000000000000000000000abc7d4800000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000124d4e41205761737361204672616374696f6e000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000056632383832000000000000000000000000000000000000000000000000000000";

  const saleFactoryIface = await ethers.getContractAt("CiretaSaleFactory", d.saleFactory);
  const saleIface = await ethers.getContractAt("Sale", ethers.ZeroAddress).catch(() => null);

  try {
    const result = await provider.call({
      from: ISSUER,
      to: d.saleFactory,
      data: FAILED_CALLDATA,
    });
    console.log("eth_call returned (no revert):", result);
  } catch (e: any) {
    const data = e.data ?? e.error?.data ?? e.info?.error?.data;
    if (data && typeof data === "string" && data.length >= 10) {
      const selector = data.slice(0, 10);
      console.log("Revert selector:", selector);

      // Try to decode against both interfaces
      try {
        const parsed = saleFactoryIface.interface.parseError(data);
        if (parsed) console.log(`→ ${parsed.name}(${parsed.args.map(String).join(", ")})`);
      } catch { /* ignore */ }
      if (saleIface) {
        try {
          const parsed = saleIface.interface.parseError(data);
          if (parsed) console.log(`→ ${parsed.name}(${parsed.args.map(String).join(", ")})`);
        } catch { /* ignore */ }
      }
    } else {
      console.log("Raw error:", e.shortMessage || e.message?.slice(0, 300));
    }
  }
}

main().catch((e) => {
  console.error("Unhandled:", e);
  process.exit(1);
});
