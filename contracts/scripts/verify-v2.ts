import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";

const ADMIN = "0x8eE48b43abb1a53e0a61bB31d0Fc7E898e7f2ac3";
const REGISTRAR = "0xF3D37e6676714AC9C353E11824E4DD6b85952293";
const DEPLOYER = "0xd1C9a9EF308aeCC3FEB4281D9BCe00beF46C7C4c";
const DEFAULT_ADMIN_ROLE = "0x0000000000000000000000000000000000000000000000000000000000000000";
const REGISTRAR_ROLE = ethers.keccak256(ethers.toUtf8Bytes("REGISTRAR_ROLE"));

async function main() {
  const f = path.join(__dirname, "..", "deployments", "base-sepolia.v2.20260430.json");
  const A = JSON.parse(fs.readFileSync(f, "utf-8"));

  const ownableAbi = ["function owner() view returns (address)"];
  const acAbi = ["function hasRole(bytes32,address) view returns (bool)"];
  const erc20Abi = ["function symbol() view returns (string)", "function decimals() view returns (uint8)"];
  const tokenFactoryAbi = [
    "function issuerRegistry() view returns (address)",
    "function simpleIdentityMode() view returns (bool)",
  ];
  const saleFactoryAbi = [
    "function issuerRegistry() view returns (address)",
    "function platformFeeManager() view returns (address)",
    "function fractionFactory() view returns (address)",
  ];
  const otcFactoryAbi = [
    "function issuerRegistry() view returns (address)",
  ];

  let pass = 0, fail = 0;
  const check = (cond: boolean, label: string, detail = "") => {
    if (cond) { pass++; console.log(`  ✓ ${label}${detail ? " — " + detail : ""}`); }
    else { fail++; console.log(`  ✗ ${label}${detail ? " — " + detail : ""}`); }
  };

  console.log("\n=== Bytecode presence ===");
  for (const k of ["simpleIdentityRegistry", "issuerRegistry", "platformFeeManager",
                    "tokenFactory", "saleFactory", "fractionFactory", "otcTokenFactory",
                    "ciretaUSDC",
                    "countryAllowModule", "maxHolderCountModule", "maxOwnershipModule",
                    "maxBalanceModule", "lockModule", "whitelistModule",
                    "conditionalTransferModule", "transferRestrictModule",
                    "timeLockedTransferModule", "timeTransfersLimitModule"]) {
    const code = await ethers.provider.getCode(A[k]);
    check(code !== "0x", `${k} has bytecode`, A[k]);
  }

  console.log("\n=== USDC functional ===");
  const usdc = new ethers.Contract(A["ciretaUSDC"], erc20Abi, ethers.provider);
  const sym = await usdc.symbol();
  const dec = await usdc.decimals();
  check(sym.length > 0, "USDC.symbol()", sym);
  check(Number(dec) === 6, "USDC.decimals() = 6", String(dec));

  console.log("\n=== Ownable.owner == Admin ===");
  for (const k of ["simpleIdentityRegistry", "issuerRegistry", "platformFeeManager",
                    "tokenFactory", "saleFactory", "otcTokenFactory",
                    "countryAllowModule", "maxHolderCountModule", "maxOwnershipModule",
                    "maxBalanceModule", "lockModule", "whitelistModule",
                    "conditionalTransferModule", "transferRestrictModule",
                    "timeLockedTransferModule", "timeTransfersLimitModule"]) {
    const c = new ethers.Contract(A[k], ownableAbi, ethers.provider);
    const o = await c.owner();
    check(o.toLowerCase() === ADMIN.toLowerCase(), `${k}.owner = Admin`, o);
  }

  console.log("\n=== fractionFactory.owner == saleFactory (by design) ===");
  {
    const c = new ethers.Contract(A["fractionFactory"], ownableAbi, ethers.provider);
    const o = await c.owner();
    check(o.toLowerCase() === A["saleFactory"].toLowerCase(),
      "fractionFactory.owner = saleFactory", o);
  }

  console.log("\n=== AccessControl roles on SimpleIdentityRegistry ===");
  {
    const ir = new ethers.Contract(A["simpleIdentityRegistry"], acAbi, ethers.provider);
    check(await ir.hasRole(DEFAULT_ADMIN_ROLE, ADMIN), "Admin has DEFAULT_ADMIN_ROLE on IR");
    check(!(await ir.hasRole(DEFAULT_ADMIN_ROLE, DEPLOYER)), "Deployer has NO DEFAULT_ADMIN_ROLE on IR");
    check(await ir.hasRole(REGISTRAR_ROLE, REGISTRAR), "Identity Registrar has REGISTRAR_ROLE");
    check(await ir.hasRole(REGISTRAR_ROLE, A["tokenFactory"]), "TokenFactory has REGISTRAR_ROLE");
    check(await ir.hasRole(REGISTRAR_ROLE, A["saleFactory"]), "SaleFactory has REGISTRAR_ROLE");
    check(await ir.hasRole(REGISTRAR_ROLE, A["fractionFactory"]), "FractionFactory has REGISTRAR_ROLE");
    check(await ir.hasRole(REGISTRAR_ROLE, A["otcTokenFactory"]), "OTCFactory has REGISTRAR_ROLE");
  }

  console.log("\n=== AccessControl roles on IssuerRegistry ===");
  {
    const ir2 = new ethers.Contract(A["issuerRegistry"], acAbi, ethers.provider);
    check(await ir2.hasRole(DEFAULT_ADMIN_ROLE, ADMIN), "Admin has DEFAULT_ADMIN_ROLE on IssuerRegistry");
    check(!(await ir2.hasRole(DEFAULT_ADMIN_ROLE, DEPLOYER)), "Deployer has NO DEFAULT_ADMIN_ROLE on IssuerRegistry");
  }

  console.log("\n=== Factory wiring ===");
  {
    const tf = new ethers.Contract(A["tokenFactory"], tokenFactoryAbi, ethers.provider);
    const sm = await tf.simpleIdentityMode();
    check(sm === true, "TokenFactory.simpleIdentityMode = true", String(sm));
    // Note: TokenFactory has no top-level identityRegistry getter — IR is bound
    // per-token at deploy time via the deployToken(...) parameter.
  }
  {
    const sf = new ethers.Contract(A["saleFactory"], saleFactoryAbi, ethers.provider);
    const issReg = await sf.issuerRegistry();
    check(issReg.toLowerCase() === A["issuerRegistry"].toLowerCase(),
      "SaleFactory.issuerRegistry → IssuerRegistry", issReg);
    const pfm = await sf.platformFeeManager();
    check(pfm.toLowerCase() === A["platformFeeManager"].toLowerCase(),
      "SaleFactory.platformFeeManager → PlatformFeeManager", pfm);
    const ff = await sf.fractionFactory();
    check(ff.toLowerCase() === A["fractionFactory"].toLowerCase(),
      "SaleFactory.fractionFactory → FractionFactory", ff);
  }
  {
    const otc = new ethers.Contract(A["otcTokenFactory"], otcFactoryAbi, ethers.provider);
    const issReg = await otc.issuerRegistry();
    check(issReg.toLowerCase() === A["issuerRegistry"].toLowerCase(),
      "OTCFactory.issuerRegistry → IssuerRegistry", issReg);
  }

  console.log(`\n${fail === 0 ? "✓ ALL CHECKS PASSED" : "✗ SOME CHECKS FAILED"} — ${pass} passed, ${fail} failed`);
  if (fail > 0) process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(1); });
