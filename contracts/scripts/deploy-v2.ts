/**
 * Cireta Platform — V2 Deployment Script
 *
 * Deploys the v2 contract suite against the existing platform registries.
 *
 * Strategy:
 *   KEEP (read from base-sepolia.json):
 *     simpleIdentityRegistry    — live platform IR, all verified investors on it
 *     issuerRegistry            — all registered issuers
 *     platformFeeManager        — fee config unchanged
 *     ciretaUSDC                — testnet mock, no reason to redeploy
 *
 *   FRESH v2 implementations (always redeployed — new bytecode):
 *     tokenImplementation               CiretaToken (maxSupply + mintable)
 *     simpleIdentityRegistryImplementation
 *     complianceImplementation          ModularCompliance
 *     saleImplementation                Sale (clean)
 *     vaultImplementation               CiretaVault (lock-up math fixed)
 *     fractionTokenImplementation       CiretaFractionToken1155
 *     otcTokenImplementation            IssuerOTCToken
 *
 *   FRESH v2 factory proxies (new UUPS proxies — wire to v2 impls):
 *     tokenFactory      CiretaTokenFactory
 *     saleFactory       CiretaSaleFactory
 *     fractionFactory   CiretaFractionFactory
 *     otcTokenFactory   IssuerOTCTokenFactory
 *
 *   FRESH v2 compliance modules (10 modules, relaxed access control):
 *     countryAllowModule, maxHolderCountModule, maxOwnershipModule,
 *     maxBalanceModule, lockModule, whitelistModule, conditionalTransferModule,
 *     transferRestrictModule, timeLockedTransferModule, timeTransfersLimitModule
 *
 * Idempotency:
 *   Reads base-sepolia.v2.json on startup. Any address already present is
 *   skipped. Pass --fresh (env V2_FRESH=1) to force a full redeploy.
 *
 * Local hardhat:
 *   When network == hardhat/localhost AND no base-sepolia.json is found,
 *   deploys the "kept" contracts fresh too.
 *
 * Usage:
 *   # Local hardhat (no .env needed):
 *   IDENTITY_MODE=simple npx hardhat run scripts/deploy-v2.ts --network hardhat
 *
 *   # Base Sepolia:
 *   IDENTITY_MODE=simple V2_FRESH=1 npx hardhat run scripts/deploy-v2.ts --network baseSepolia
 */

import { ethers, upgrades } from "hardhat";
import * as fs from "fs";
import * as path from "path";

// ── Types ──────────────────────────────────────────────────────────────────

interface V2Addresses {
  // ── Kept from v1 ──────────────────────────────────
  simpleIdentityRegistry: string;
  issuerRegistry: string;
  platformFeeManager: string;
  ciretaUSDC: string;

  // ── V2 implementations ────────────────────────────
  tokenImplementation: string;
  simpleIdentityRegistryImplementation: string;
  complianceImplementation: string;
  saleImplementation: string;
  vaultImplementation: string;
  fractionTokenImplementation: string;
  otcTokenImplementation: string;

  // ── V2 factory proxies ────────────────────────────
  tokenFactory: string;
  saleFactory: string;
  fractionFactory: string;
  otcTokenFactory: string;

  // ── V2 compliance modules ─────────────────────────
  countryAllowModule: string;
  maxHolderCountModule: string;
  maxOwnershipModule: string;
  maxBalanceModule: string;
  lockModule: string;
  whitelistModule: string;
  conditionalTransferModule: string;
  transferRestrictModule: string;
  timeLockedTransferModule: string;
  timeTransfersLimitModule: string;

  // ── Metadata ──────────────────────────────────────
  identityMode: string;
  deployedAt: string;
  network: string;
}

// ── File helpers ───────────────────────────────────────────────────────────

const DEPLOYMENTS_DIR = path.join(__dirname, "..", "deployments");

function loadJson(filePath: string): Record<string, string> {
  if (fs.existsSync(filePath)) {
    return JSON.parse(fs.readFileSync(filePath, "utf-8"));
  }
  return {};
}

function saveJson(filePath: string, data: Record<string, string>) {
  if (!fs.existsSync(DEPLOYMENTS_DIR)) {
    fs.mkdirSync(DEPLOYMENTS_DIR, { recursive: true });
  }
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + "\n");
}

function getNetworkName(chainId: bigint, hn?: string): string {
  if (hn === "localhost" || hn === "hardhat") return "localhost";
  if (chainId === 84532n) return "base-sepolia";
  if (chainId === 8453n) return "base";
  if (chainId === 11155111n) return "sepolia";
  return "localhost";
}

// ── Gas tracking ───────────────────────────────────────────────────────────

const gasLog: Array<{ label: string; gas: bigint }> = [];

// ── Main ───────────────────────────────────────────────────────────────────

async function main() {
  const [deployer] = await ethers.getSigners();
  const network = await ethers.provider.getNetwork();
  const hn = process.env.HARDHAT_NETWORK;
  const networkName = getNetworkName(network.chainId, hn);
  const isLocal = networkName === "localhost";
  const isFresh = process.env.V2_FRESH === "1";

  // ── Print header ──────────────────────────────────────────────────────

  const balance = await ethers.provider.getBalance(deployer.address);

  console.log("");
  console.log("╔══════════════════════════════════════════════════════════╗");
  console.log("║         CIRETA PLATFORM — V2 DEPLOYMENT                 ║");
  console.log("╚══════════════════════════════════════════════════════════╝");
  console.log(`  Deployer:   ${deployer.address}`);
  console.log(`  Network:    ${networkName} (chainId: ${network.chainId})`);
  console.log(`  Balance:    ${ethers.formatEther(balance)} ETH`);
  console.log(`  Mode:       ${isFresh ? "FRESH (V2_FRESH=1)" : "IDEMPOTENT"}`);
  console.log("");

  // ── Load existing data ────────────────────────────────────────────────

  const v1File = path.join(DEPLOYMENTS_DIR, "base-sepolia.json");

  // Date-stamped filename so each deploy is preserved (e.g. base-sepolia.v2.20260430.json).
  // Idempotent re-runs on the same day land in the same file. Override with V2_DATE=YYYYMMDD.
  // Uses local date (not UTC) so the stamp matches the deployer's wall clock.
  const today = new Date();
  const stamp = process.env.V2_DATE
    ?? `${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, "0")}${String(today.getDate()).padStart(2, "0")}`;
  const networkPrefix = isLocal ? "localhost" : "base-sepolia";
  const v2File = path.join(DEPLOYMENTS_DIR, `${networkPrefix}.v2.${stamp}.json`);

  // v1 addresses — the "keep" candidates
  const v1 = isLocal ? {} : loadJson(v1File);

  // v2 in-progress — skip already-deployed addresses unless fresh
  const existing: Record<string, string> = isFresh ? {} : loadJson(v2File);
  const addr: Record<string, string> = { ...existing };

  // ── Helper to deploy or skip ──────────────────────────────────────────

  async function deployImpl(
    key: string,
    contractName: string,
    force = false
  ): Promise<string> {
    if (addr[key] && !force) {
      console.log(`    ${contractName} impl: (exists) ${addr[key]}`);
      return addr[key];
    }
    const before = await ethers.provider.getBalance(deployer.address);
    const F = await ethers.getContractFactory(contractName);
    const impl = await F.deploy();
    await impl.waitForDeployment();
    const address = await impl.getAddress();
    const after = await ethers.provider.getBalance(deployer.address);
    gasLog.push({ label: `${contractName} impl`, gas: before - after });
    addr[key] = address;
    saveJson(v2File, addr);
    console.log(`    ${contractName} impl: ${address}`);
    return address;
  }

  async function deployProxy(
    key: string,
    contractName: string,
    initArgs: unknown[],
    opts: { unsafeAllow?: string[] } = {},
    force = false
  ): Promise<string> {
    if (addr[key] && !force) {
      console.log(`    ${contractName} proxy: (exists) ${addr[key]}`);
      return addr[key];
    }
    const before = await ethers.provider.getBalance(deployer.address);
    const F = await ethers.getContractFactory(contractName);
    const proxyOpts: Record<string, unknown> = { kind: "uups" };
    if (opts.unsafeAllow) proxyOpts.unsafeAllow = opts.unsafeAllow;
    const proxy = await upgrades.deployProxy(F, initArgs, proxyOpts as Parameters<typeof upgrades.deployProxy>[2]);
    await proxy.waitForDeployment();
    const address = await proxy.getAddress();
    const after = await ethers.provider.getBalance(deployer.address);
    gasLog.push({ label: `${contractName} proxy`, gas: before - after });
    addr[key] = address;
    saveJson(v2File, addr);
    console.log(`    ${contractName} proxy: ${address}`);
    return address;
  }

  // ── STEP 1: Kept contracts ────────────────────────────────────────────

  console.log("=== Step 1: Preserved v1 Contracts ===");

  if (isLocal) {
    // Local hardhat: no pre-existing deployment — deploy fresh
    console.log("  Local hardhat — deploying kept contracts fresh");

    await deployProxy("simpleIdentityRegistry", "SimpleIdentityRegistry",
      [deployer.address, ethers.ZeroAddress, ethers.ZeroAddress, ethers.ZeroAddress]);

    await deployProxy("issuerRegistry", "IssuerRegistry", [deployer.address]);

    await deployProxy("platformFeeManager", "PlatformFeeManager",
      [deployer.address, deployer.address, 200]);

    // Testnet mock USDC
    if (!addr["ciretaUSDC"]) {
      const F = await ethers.getContractFactory("CiretaUSDC");
      const t = await F.deploy();
      await t.waitForDeployment();
      addr["ciretaUSDC"] = await t.getAddress();
      saveJson(v2File, addr);
      console.log(`    CiretaUSDC: ${addr["ciretaUSDC"]}`);
    } else {
      console.log(`    CiretaUSDC: (exists) ${addr["ciretaUSDC"]}`);
    }
  } else {
    // Base Sepolia: read from v1 deployment
    const kept = [
      "simpleIdentityRegistry",
      "issuerRegistry",
      "platformFeeManager",
      "ciretaUSDC",
    ] as const;

    for (const k of kept) {
      const v1Addr = v1[k];
      if (!v1Addr) {
        // ciretaUSDC might not be in current base-sepolia.json
        if (k === "ciretaUSDC" && v1["ciretaUSDC"]) {
          addr[k] = v1["ciretaUSDC"];
        } else if (k === "simpleIdentityRegistry") {
          // simpleIdentityRegistry might be missing from current base-sepolia.json
          // (it was in the Apr-12 backup). If absent, deploy fresh.
          if (!addr[k]) {
            console.log(`  WARNING: ${k} not found in v1. Deploying fresh.`);
            await deployProxy(k, "SimpleIdentityRegistry",
              [deployer.address, ethers.ZeroAddress, ethers.ZeroAddress, ethers.ZeroAddress]);
          } else {
            console.log(`  ${k}: (from v2 file) ${addr[k]}`);
          }
          continue;
        } else {
          throw new Error(`Required v1 address missing: ${k}. Check base-sepolia.json.`);
        }
      } else {
        addr[k] = v1Addr;
      }
      console.log(`  ${k}: (kept) ${addr[k]}`);
    }
    saveJson(v2File, addr);
  }

  // ── STEP 2: V2 Implementations ────────────────────────────────────────

  console.log("\n=== Step 2: V2 Implementations (always fresh bytecode) ===");

  // Force-redeploy all impls on v2 run (they get new addresses each time)
  // If v2.json already has them and V2_FRESH=0, skip.
  await deployImpl("tokenImplementation", "CiretaToken");
  await deployImpl("simpleIdentityRegistryImplementation", "SimpleIdentityRegistry");
  await deployImpl("complianceImplementation", "ModularCompliance");
  await deployImpl("saleImplementation", "Sale");
  await deployImpl("vaultImplementation", "CiretaVault");
  await deployImpl("fractionTokenImplementation", "CiretaFractionToken1155");
  await deployImpl("otcTokenImplementation", "IssuerOTCToken");

  // ── STEP 3: V2 Factory Proxies ────────────────────────────────────────

  console.log("\n=== Step 3: V2 Factory Proxies ===");

  await deployProxy("tokenFactory", "CiretaTokenFactory", [
    deployer.address,
    addr["tokenImplementation"],
    addr["simpleIdentityRegistryImplementation"],
    addr["complianceImplementation"],
    ethers.ZeroAddress, // claimTopicsRegistry — zero in simple mode
    ethers.ZeroAddress, // trustedIssuersRegistry — zero in simple mode
    ethers.ZeroAddress, // identityRegistryStorage — zero in simple mode
    addr["issuerRegistry"],
  ]);

  await deployProxy("saleFactory", "CiretaSaleFactory", [
    deployer.address,
    addr["saleImplementation"],
  ]);

  await deployProxy("fractionFactory", "CiretaFractionFactory", [
    deployer.address,
    addr["fractionTokenImplementation"],
    addr["vaultImplementation"],
  ], { unsafeAllow: ["constructor"] });

  await deployProxy("otcTokenFactory", "IssuerOTCTokenFactory", [
    deployer.address,
    addr["otcTokenImplementation"],
  ]);

  // ── STEP 4: V2 Compliance Modules ─────────────────────────────────────

  console.log("\n=== Step 4: V2 Compliance Modules ===");

  const modules: Array<[string, string]> = [
    ["countryAllowModule",       "CountryAllowModule"],
    ["maxHolderCountModule",     "MaxHolderCountModule"],
    ["maxOwnershipModule",       "MaxOwnershipModule"],
    ["maxBalanceModule",         "MaxBalanceModule"],
    ["lockModule",               "LockModule"],
    ["whitelistModule",          "WhitelistModule"],
    ["conditionalTransferModule","ConditionalTransferModule"],
    ["transferRestrictModule",   "TransferRestrictModule"],
    ["timeLockedTransferModule", "TimeLockedTransferModule"],
    ["timeTransfersLimitModule", "TimeTransfersLimitModule"],
  ];

  for (const [key, name] of modules) {
    await deployProxy(key, name, [deployer.address]);
  }

  // ── STEP 5: Wire Up Roles & Config ───────────────────────────────────

  console.log("\n=== Step 5: Wire Up Roles & Config ===");

  const sirContract = (await ethers.getContractFactory("SimpleIdentityRegistry"))
    .attach(addr["simpleIdentityRegistry"]) as unknown as {
      hasRole(role: string, account: string): Promise<boolean>;
      grantRole(role: string, account: string): Promise<{ wait(): Promise<void> }>;
      DEFAULT_ADMIN_ROLE(): Promise<string>;
    };

  // Compute REGISTRAR_ROLE keccak (matches the constant in SimpleIdentityRegistry)
  const REGISTRAR_ROLE = ethers.keccak256(ethers.toUtf8Bytes("REGISTRAR_ROLE"));
  const DEFAULT_ADMIN_ROLE = "0x0000000000000000000000000000000000000000000000000000000000000000";

  // Factories that need REGISTRAR_ROLE on the platform IR
  const factoryNames = [
    { key: "tokenFactory",    name: "CiretaTokenFactory" },
    { key: "saleFactory",     name: "CiretaSaleFactory" },
    { key: "fractionFactory", name: "CiretaFractionFactory" },
    { key: "otcTokenFactory", name: "IssuerOTCTokenFactory" },
  ];

  for (const f of factoryNames) {
    const factoryAddr = addr[f.key];
    try {
      const hasRole = await sirContract.hasRole(REGISTRAR_ROLE, factoryAddr);
      if (!hasRole) {
        const tx = await sirContract.grantRole(REGISTRAR_ROLE, factoryAddr);
        await tx.wait();
        console.log(`  REGISTRAR_ROLE granted to ${f.name} (${factoryAddr.slice(0, 10)}...)`);
      } else {
        console.log(`  REGISTRAR_ROLE: ${f.name} already has role`);
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      // If deployer is not admin, it may not have grantRole permission.
      // This is expected on Base Sepolia when deployer != registry admin.
      console.log(`  WARN: could not grant REGISTRAR_ROLE to ${f.name}: ${msg.slice(0, 80)}`);
      console.log(`    Manual: call grantRole(REGISTRAR_ROLE, ${factoryAddr}) on IR as admin`);
    }
  }

  // ── TokenFactory config ─────────────────────────────────────────────

  {
    const tf = (await ethers.getContractFactory("CiretaTokenFactory"))
      .attach(addr["tokenFactory"]) as unknown as {
        simpleIdentityMode(): Promise<boolean>;
        setSimpleIdentityMode(v: boolean): Promise<{ wait(): Promise<void> }>;
      };

    try {
      const currentMode = await tf.simpleIdentityMode();
      if (!currentMode) {
        const tx = await tf.setSimpleIdentityMode(true);
        await tx.wait();
        console.log("  TokenFactory.simpleIdentityMode = true");
      } else {
        console.log("  TokenFactory.simpleIdentityMode: already true");
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      console.log(`  WARN: setSimpleIdentityMode failed: ${msg.slice(0, 80)}`);
    }
  }

  // ── SaleFactory config ───────────────────────────────────────────────

  {
    const sf = (await ethers.getContractFactory("CiretaSaleFactory"))
      .attach(addr["saleFactory"]) as unknown as {
        issuerRegistry(): Promise<string>;
        platformFeeManager(): Promise<string>;
        fractionFactory(): Promise<string>;
        setIssuerRegistry(a: string): Promise<{ wait(): Promise<void> }>;
        setPlatformFeeManager(a: string): Promise<{ wait(): Promise<void> }>;
        setFractionFactory(a: string): Promise<{ wait(): Promise<void> }>;
      };

    const configPairs: Array<{
      getter: () => Promise<string>;
      setter: (a: string) => Promise<{ wait(): Promise<void> }>;
      value: string;
      label: string;
    }> = [
      {
        getter: () => sf.issuerRegistry(),
        setter: (a) => sf.setIssuerRegistry(a),
        value: addr["issuerRegistry"],
        label: "SaleFactory.issuerRegistry",
      },
      {
        getter: () => sf.platformFeeManager(),
        setter: (a) => sf.setPlatformFeeManager(a),
        value: addr["platformFeeManager"],
        label: "SaleFactory.platformFeeManager",
      },
      {
        getter: () => sf.fractionFactory(),
        setter: (a) => sf.setFractionFactory(a),
        value: addr["fractionFactory"],
        label: "SaleFactory.fractionFactory",
      },
    ];

    for (const { getter, setter, value, label } of configPairs) {
      try {
        const current = await getter();
        if (current.toLowerCase() !== value.toLowerCase()) {
          const tx = await setter(value);
          await tx.wait();
          console.log(`  ${label} → ${value.slice(0, 10)}...`);
        } else {
          console.log(`  ${label}: already set`);
        }
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        console.log(`  WARN: ${label}: ${msg.slice(0, 80)}`);
      }
    }
  }

  // ── OTCFactory config ────────────────────────────────────────────────

  {
    const otcF = (await ethers.getContractFactory("IssuerOTCTokenFactory"))
      .attach(addr["otcTokenFactory"]) as unknown as {
        issuerRegistry(): Promise<string>;
        setIssuerRegistry(a: string): Promise<{ wait(): Promise<void> }>;
      };

    try {
      const current = await otcF.issuerRegistry();
      if (current.toLowerCase() !== addr["issuerRegistry"].toLowerCase()) {
        const tx = await otcF.setIssuerRegistry(addr["issuerRegistry"]);
        await tx.wait();
        console.log(`  OTCFactory.issuerRegistry → ${addr["issuerRegistry"].slice(0, 10)}...`);
      } else {
        console.log("  OTCFactory.issuerRegistry: already set");
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      console.log(`  WARN: OTCFactory.issuerRegistry: ${msg.slice(0, 80)}`);
    }
  }

  // ── Transfer FractionFactory ownership to SaleFactory ───────────────

  {
    const ff = (await ethers.getContractFactory("CiretaFractionFactory"))
      .attach(addr["fractionFactory"]) as unknown as {
        owner(): Promise<string>;
        transferOwnership(a: string): Promise<{ wait(): Promise<void> }>;
      };

    try {
      const ffOwner = await ff.owner();
      const sfAddr = addr["saleFactory"];
      if (ffOwner.toLowerCase() !== sfAddr.toLowerCase()) {
        if (ffOwner.toLowerCase() === deployer.address.toLowerCase()) {
          const tx = await ff.transferOwnership(sfAddr);
          await tx.wait();
          console.log(`  FractionFactory ownership → SaleFactory`);
        } else {
          console.log(`  FractionFactory owned by ${ffOwner.slice(0, 10)}... (manual transfer needed)`);
        }
      } else {
        console.log("  FractionFactory ownership: already SaleFactory");
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      console.log(`  WARN: FractionFactory ownership transfer: ${msg.slice(0, 80)}`);
    }
  }

  // ── STEP 5b: Identity Registrar role ────────────────────────────────

  const registrarAddr = process.env.V2_REGISTRAR_ADDRESS;
  if (registrarAddr) {
    try {
      const hasRole = await sirContract.hasRole(REGISTRAR_ROLE, registrarAddr);
      if (!hasRole) {
        const tx = await sirContract.grantRole(REGISTRAR_ROLE, registrarAddr);
        await tx.wait();
        console.log(`  REGISTRAR_ROLE granted to Identity Registrar (${registrarAddr.slice(0, 10)}...)`);
      } else {
        console.log(`  REGISTRAR_ROLE: Identity Registrar already has role`);
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      console.log(`  WARN: could not grant REGISTRAR_ROLE to Identity Registrar: ${msg.slice(0, 80)}`);
    }
  } else {
    console.log(`  WARN: V2_REGISTRAR_ADDRESS not set — skipped Identity Registrar role grant`);
  }

  // ── STEP 6: Handoff to Admin ─────────────────────────────────────────
  //
  // Transfer Ownable.owner + DEFAULT_ADMIN_ROLE on all platform contracts to
  // the configured V2_ADMIN_ADDRESS. After this phase the deployer wallet has
  // zero authority on the platform. Skipped automatically when V2_ADMIN_ADDRESS
  // is unset (e.g. local hardhat smoke test).

  const adminAddr = process.env.V2_ADMIN_ADDRESS;

  if (adminAddr && adminAddr.toLowerCase() !== deployer.address.toLowerCase()) {
    console.log(`\n=== Step 6: Handoff to Admin (${adminAddr}) ===`);

    // Minimal ABIs — getContractFactory can't be used for abstract bases (OwnableUpgradeable, AccessControlUpgradeable).
    const ownableAbi = [
      "function owner() view returns (address)",
      "function transferOwnership(address) returns ()",
    ];
    const accessControlAbi = [
      "function hasRole(bytes32, address) view returns (bool)",
      "function grantRole(bytes32, address) returns ()",
      "function renounceRole(bytes32, address) returns ()",
    ];

    // Helper: try transferOwnership on an Ownable contract.
    const transferOwn = async (key: string, label: string) => {
      const target = addr[key];
      if (!target) return;
      const c = (await ethers.getContractAt(ownableAbi, target)) as unknown as {
        owner(): Promise<string>;
        transferOwnership(a: string): Promise<{ wait(): Promise<void> }>;
      };
      try {
        const cur = await c.owner();
        if (cur.toLowerCase() === adminAddr.toLowerCase()) {
          console.log(`  ${label.padEnd(28)}: already owned by Admin`);
          return;
        }
        if (cur.toLowerCase() !== deployer.address.toLowerCase()) {
          console.log(`  ${label.padEnd(28)}: owned by ${cur.slice(0, 10)}... — skip (deployer not owner)`);
          return;
        }
        const tx = await c.transferOwnership(adminAddr);
        await tx.wait();
        console.log(`  ${label.padEnd(28)}: transferOwnership(Admin) ✓`);
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        console.log(`  ${label.padEnd(28)}: WARN ${msg.slice(0, 70)}`);
      }
    };

    // Helper: grant DEFAULT_ADMIN_ROLE then renounce deployer's role.
    // Order matters — grant first, then renounce. Otherwise we brick the contract.
    const handoffAccessControl = async (key: string, label: string) => {
      const target = addr[key];
      if (!target) return;
      const c = (await ethers.getContractAt(accessControlAbi, target)) as unknown as {
        hasRole(role: string, account: string): Promise<boolean>;
        grantRole(role: string, account: string): Promise<{ wait(): Promise<void> }>;
        renounceRole(role: string, account: string): Promise<{ wait(): Promise<void> }>;
      };
      try {
        // Step 1: grant DEFAULT_ADMIN_ROLE to admin if not already
        const adminHas = await c.hasRole(DEFAULT_ADMIN_ROLE, adminAddr);
        if (!adminHas) {
          const tx = await c.grantRole(DEFAULT_ADMIN_ROLE, adminAddr);
          await tx.wait();
          console.log(`  ${label.padEnd(28)}: grantRole(DEFAULT_ADMIN_ROLE, Admin) ✓`);
        } else {
          console.log(`  ${label.padEnd(28)}: Admin already has DEFAULT_ADMIN_ROLE`);
        }
        // Step 2: renounce deployer's DEFAULT_ADMIN_ROLE
        const deployerHas = await c.hasRole(DEFAULT_ADMIN_ROLE, deployer.address);
        if (deployerHas) {
          const tx2 = await c.renounceRole(DEFAULT_ADMIN_ROLE, deployer.address);
          await tx2.wait();
          console.log(`  ${label.padEnd(28)}: renounceRole(DEFAULT_ADMIN_ROLE, deployer) ✓`);
        }
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        console.log(`  ${label.padEnd(28)}: WARN ${msg.slice(0, 70)}`);
      }
    };

    // 1. AccessControl handoff first (so admin has DEFAULT_ADMIN_ROLE before
    //    we transfer Ownable, in case the same wallet check is downstream).
    await handoffAccessControl("simpleIdentityRegistry", "IR (DEFAULT_ADMIN_ROLE)");
    await handoffAccessControl("issuerRegistry", "IssuerRegistry (DAR)");

    // 2. Ownable transfers
    await transferOwn("simpleIdentityRegistry", "IR Owner");
    await transferOwn("issuerRegistry", "IssuerRegistry Owner");
    await transferOwn("platformFeeManager", "PlatformFeeManager Owner");
    await transferOwn("tokenFactory", "TokenFactory Owner");
    // Note: fractionFactory ownership was already transferred to saleFactory in Step 5.
    // Don't transfer it to admin — that would break SaleFactory.deploySaleVested.
    await transferOwn("saleFactory", "SaleFactory Owner");
    await transferOwn("otcTokenFactory", "OTCFactory Owner");
    for (const [key, name] of modules) {
      await transferOwn(key, `${name} Owner`);
    }

    // ── STEP 7: Verify handoff ────────────────────────────────────────────

    console.log("\n=== Step 7: Verify Handoff ===");

    let allOk = true;
    const ownerCheck = async (key: string, label: string, expectedOwner: string) => {
      const target = addr[key];
      if (!target) return;
      const c = (await ethers.getContractAt(ownableAbi, target)) as unknown as { owner(): Promise<string> };
      try {
        const cur = await c.owner();
        const ok = cur.toLowerCase() === expectedOwner.toLowerCase();
        if (!ok) allOk = false;
        console.log(`  ${ok ? "✓" : "✗"} ${label.padEnd(28)}: owner = ${cur}`);
      } catch (e) {
        allOk = false;
        console.log(`  ✗ ${label.padEnd(28)}: read failed`);
      }
    };

    const roleCheck = async (key: string, label: string, role: string, account: string, shouldHave: boolean) => {
      const target = addr[key];
      if (!target) return;
      const c = (await ethers.getContractAt(accessControlAbi, target)) as unknown as { hasRole(role: string, account: string): Promise<boolean> };
      try {
        const has = await c.hasRole(role, account);
        const ok = has === shouldHave;
        if (!ok) allOk = false;
        console.log(`  ${ok ? "✓" : "✗"} ${label.padEnd(28)}: hasRole=${has} expected=${shouldHave}`);
      } catch (e) {
        allOk = false;
        console.log(`  ✗ ${label.padEnd(28)}: read failed`);
      }
    };

    // Owner = Admin checks
    await ownerCheck("simpleIdentityRegistry", "IR.owner = Admin", adminAddr);
    await ownerCheck("issuerRegistry", "IssuerRegistry.owner = Admin", adminAddr);
    await ownerCheck("platformFeeManager", "FeeMgr.owner = Admin", adminAddr);
    await ownerCheck("tokenFactory", "TokenFactory.owner = Admin", adminAddr);
    await ownerCheck("saleFactory", "SaleFactory.owner = Admin", adminAddr);
    await ownerCheck("otcTokenFactory", "OTCFactory.owner = Admin", adminAddr);
    // FractionFactory deliberately NOT checked — it's owned by SaleFactory by design.

    // Admin has DEFAULT_ADMIN_ROLE on the AccessControl contracts
    await roleCheck("simpleIdentityRegistry", "IR DAR(Admin)=true", DEFAULT_ADMIN_ROLE, adminAddr, true);
    await roleCheck("issuerRegistry", "IssuerReg DAR(Admin)=true", DEFAULT_ADMIN_ROLE, adminAddr, true);

    // Deployer has NO DEFAULT_ADMIN_ROLE anymore
    await roleCheck("simpleIdentityRegistry", "IR DAR(Deployer)=false", DEFAULT_ADMIN_ROLE, deployer.address, false);
    await roleCheck("issuerRegistry", "IssuerReg DAR(Deployer)=false", DEFAULT_ADMIN_ROLE, deployer.address, false);

    // Each factory still has REGISTRAR_ROLE on the IR
    for (const f of factoryNames) {
      await roleCheck("simpleIdentityRegistry", `IR REGISTRAR(${f.name.slice(0, 10)})=true`, REGISTRAR_ROLE, addr[f.key], true);
    }

    // Identity Registrar wallet has REGISTRAR_ROLE
    if (registrarAddr) {
      await roleCheck("simpleIdentityRegistry", "IR REGISTRAR(Registrar)=true", REGISTRAR_ROLE, registrarAddr, true);
    }

    if (!allOk) {
      console.log("\n✗ HANDOFF VERIFICATION FAILED — review the errors above before proceeding.");
      process.exit(1);
    }
    console.log("\n✓ All handoff checks passed.");
  } else if (adminAddr) {
    console.log(`\n=== Step 6: Handoff skipped — Admin == Deployer ===`);
  } else {
    console.log(`\n=== Step 6: Handoff skipped — V2_ADMIN_ADDRESS unset (local mode) ===`);
  }

  // ── STEP 8: Finalize + Save ───────────────────────────────────────────

  addr["identityMode"] = "simple";
  addr["deployedAt"] = new Date().toISOString();
  addr["network"] = networkName;
  if (adminAddr) addr["admin"] = adminAddr;
  if (registrarAddr) addr["identityRegistrar"] = registrarAddr;
  if (process.env.V2_ISSUER_ADDRESS) addr["firstIssuer"] = process.env.V2_ISSUER_ADDRESS;
  saveJson(v2File, addr);

  // ── Summary ───────────────────────────────────────────────────────────

  const finalBalance = await ethers.provider.getBalance(deployer.address);
  const totalGas = balance - finalBalance;

  console.log("\n╔══════════════════════════════════════════════════════════╗");
  console.log("║         V2 DEPLOYMENT COMPLETE                          ║");
  console.log("╚══════════════════════════════════════════════════════════╝");
  console.log(`  Output file:  ${v2File}`);
  console.log(`  Network:      ${networkName}`);
  console.log(`  Gas used:     ${ethers.formatEther(totalGas)} ETH`);
  console.log(`  Balance left: ${ethers.formatEther(finalBalance)} ETH`);

  console.log("\n── Kept from v1 ──────────────────────────────────────────");
  for (const k of ["simpleIdentityRegistry","issuerRegistry","platformFeeManager","ciretaUSDC"]) {
    console.log(`  ${k.padEnd(38)}: ${addr[k] ?? "(missing)"}`);
  }

  console.log("\n── New v2 implementations ────────────────────────────────");
  const impls = ["tokenImplementation","simpleIdentityRegistryImplementation",
    "complianceImplementation","saleImplementation","vaultImplementation",
    "fractionTokenImplementation","otcTokenImplementation"];
  for (const k of impls) {
    console.log(`  ${k.padEnd(38)}: ${addr[k] ?? "(missing)"}`);
  }

  console.log("\n── New v2 factory proxies ────────────────────────────────");
  for (const k of ["tokenFactory","saleFactory","fractionFactory","otcTokenFactory"]) {
    console.log(`  ${k.padEnd(38)}: ${addr[k] ?? "(missing)"}`);
  }

  console.log("\n── New v2 compliance modules ─────────────────────────────");
  for (const [key] of modules) {
    console.log(`  ${key.padEnd(38)}: ${addr[key] ?? "(missing)"}`);
  }

  console.log("\n── Roles granted ─────────────────────────────────────────");
  for (const f of factoryNames) {
    console.log(`  REGISTRAR_ROLE on simpleIdentityRegistry → ${f.name}`);
  }

  console.log("\n── Per-contract gas breakdown ────────────────────────────");
  for (const { label, gas } of gasLog) {
    console.log(`  ${label.padEnd(40)}: ${ethers.formatEther(gas)} ETH`);
  }

  console.log("\n  Total ETH consumed:", ethers.formatEther(totalGas));

  // ── Env-var block (copy-paste into Railway / Vercel) ──────────────────
  // Backend keys mirror Pydantic Settings field names in packages/common/core/config.py.
  // Frontend keys match NEXT_PUBLIC_* references in apps/admin and apps/launchpad.
  const chainId = isLocal ? 31337 : 84532; // Base Sepolia
  const rpcDefault = isLocal ? "http://127.0.0.1:8545" : "https://base-sepolia.publicnode.com";

  console.log("\n╔══════════════════════════════════════════════════════════╗");
  console.log("║   ENV-VAR BLOCK — paste into Railway (backend)          ║");
  console.log("╚══════════════════════════════════════════════════════════╝");
  console.log(`CHAIN_ID=${chainId}`);
  console.log(`WEB3_RPC_URL=${rpcDefault}`);
  console.log(`IDENTITY_REGISTRY_ADDRESS=${addr["simpleIdentityRegistry"] ?? ""}`);
  console.log(`ISSUER_REGISTRY_ADDRESS=${addr["issuerRegistry"] ?? ""}`);
  console.log(`TOKEN_FACTORY_ADDRESS=${addr["tokenFactory"] ?? ""}`);
  console.log(`SALE_FACTORY_ADDRESS=${addr["saleFactory"] ?? ""}`);
  console.log(`FRACTION_FACTORY_ADDRESS=${addr["fractionFactory"] ?? ""}`);
  console.log(`MODULAR_COMPLIANCE_ADDRESS=${addr["complianceImplementation"] ?? ""}`);
  console.log(`IDENTITY_MODE=simple`);
  console.log(`# IDENTITY_FACTORY_ADDRESS= (only needed for erc3643 mode — leave blank for simple)`);
  if (registrarAddr) {
    console.log(`# Identity Registrar wallet (worker that calls IR.addToWhitelist):`);
    console.log(`# IDENTITY_SIGNER_PRIVATE_KEY=<set in Railway secret store — DO NOT print here>`);
  }

  console.log("\n╔══════════════════════════════════════════════════════════╗");
  console.log("║   ENV-VAR BLOCK — paste into Vercel (frontend)          ║");
  console.log("╚══════════════════════════════════════════════════════════╝");
  console.log(`NEXT_PUBLIC_CHAIN_ID=${chainId}`);
  console.log(`NEXT_PUBLIC_RPC_URL=${rpcDefault}`);
  console.log(`NEXT_PUBLIC_USDC_ADDRESS=${addr["ciretaUSDC"] ?? ""}`);
  console.log(`NEXT_PUBLIC_IDENTITY_REGISTRY_ADDRESS=${addr["simpleIdentityRegistry"] ?? ""}`);
  console.log(`NEXT_PUBLIC_ISSUER_REGISTRY_ADDRESS=${addr["issuerRegistry"] ?? ""}`);
  console.log(`NEXT_PUBLIC_PLATFORM_FEE_MANAGER_ADDRESS=${addr["platformFeeManager"] ?? ""}`);
  console.log(`NEXT_PUBLIC_TOKEN_FACTORY_ADDRESS=${addr["tokenFactory"] ?? ""}`);
  console.log(`NEXT_PUBLIC_SALE_FACTORY_ADDRESS=${addr["saleFactory"] ?? ""}`);
  console.log(`NEXT_PUBLIC_OTC_TOKEN_FACTORY_ADDRESS=${addr["otcTokenFactory"] ?? ""}`);
  console.log(`NEXT_PUBLIC_COUNTRY_ALLOW_MODULE_ADDRESS=${addr["countryAllowModule"] ?? ""}`);
  console.log(`NEXT_PUBLIC_MAX_HOLDER_COUNT_MODULE_ADDRESS=${addr["maxHolderCountModule"] ?? ""}`);
  console.log(`NEXT_PUBLIC_MAX_OWNERSHIP_MODULE_ADDRESS=${addr["maxOwnershipModule"] ?? ""}`);
  console.log(`NEXT_PUBLIC_MAX_BALANCE_MODULE_ADDRESS=${addr["maxBalanceModule"] ?? ""}`);
  console.log(`NEXT_PUBLIC_LOCK_MODULE_ADDRESS=${addr["lockModule"] ?? ""}`);
  console.log(`NEXT_PUBLIC_WHITELIST_MODULE_ADDRESS=${addr["whitelistModule"] ?? ""}`);
  console.log(`NEXT_PUBLIC_CONDITIONAL_TRANSFER_MODULE_ADDRESS=${addr["conditionalTransferModule"] ?? ""}`);
  console.log(`NEXT_PUBLIC_TRANSFER_RESTRICT_MODULE_ADDRESS=${addr["transferRestrictModule"] ?? ""}`);
  console.log(`NEXT_PUBLIC_TIME_LOCKED_TRANSFER_MODULE_ADDRESS=${addr["timeLockedTransferModule"] ?? ""}`);
  console.log(`NEXT_PUBLIC_TIME_TRANSFERS_LIMIT_MODULE_ADDRESS=${addr["timeTransfersLimitModule"] ?? ""}`);

  // Also write the env block to a sidecar file next to the addresses JSON.
  const envFile = v2File.replace(/\.json$/, ".env");
  const envLines: string[] = [
    "# === BACKEND (Railway) ===",
    `CHAIN_ID=${chainId}`,
    `WEB3_RPC_URL=${rpcDefault}`,
    `IDENTITY_REGISTRY_ADDRESS=${addr["simpleIdentityRegistry"] ?? ""}`,
    `ISSUER_REGISTRY_ADDRESS=${addr["issuerRegistry"] ?? ""}`,
    `TOKEN_FACTORY_ADDRESS=${addr["tokenFactory"] ?? ""}`,
    `SALE_FACTORY_ADDRESS=${addr["saleFactory"] ?? ""}`,
    `FRACTION_FACTORY_ADDRESS=${addr["fractionFactory"] ?? ""}`,
    `MODULAR_COMPLIANCE_ADDRESS=${addr["complianceImplementation"] ?? ""}`,
    `IDENTITY_MODE=simple`,
    "",
    "# === FRONTEND (Vercel) ===",
    `NEXT_PUBLIC_CHAIN_ID=${chainId}`,
    `NEXT_PUBLIC_RPC_URL=${rpcDefault}`,
    `NEXT_PUBLIC_USDC_ADDRESS=${addr["ciretaUSDC"] ?? ""}`,
    `NEXT_PUBLIC_IDENTITY_REGISTRY_ADDRESS=${addr["simpleIdentityRegistry"] ?? ""}`,
    `NEXT_PUBLIC_ISSUER_REGISTRY_ADDRESS=${addr["issuerRegistry"] ?? ""}`,
    `NEXT_PUBLIC_PLATFORM_FEE_MANAGER_ADDRESS=${addr["platformFeeManager"] ?? ""}`,
    `NEXT_PUBLIC_TOKEN_FACTORY_ADDRESS=${addr["tokenFactory"] ?? ""}`,
    `NEXT_PUBLIC_SALE_FACTORY_ADDRESS=${addr["saleFactory"] ?? ""}`,
    `NEXT_PUBLIC_OTC_TOKEN_FACTORY_ADDRESS=${addr["otcTokenFactory"] ?? ""}`,
    `NEXT_PUBLIC_COUNTRY_ALLOW_MODULE_ADDRESS=${addr["countryAllowModule"] ?? ""}`,
    `NEXT_PUBLIC_MAX_HOLDER_COUNT_MODULE_ADDRESS=${addr["maxHolderCountModule"] ?? ""}`,
    `NEXT_PUBLIC_MAX_OWNERSHIP_MODULE_ADDRESS=${addr["maxOwnershipModule"] ?? ""}`,
    `NEXT_PUBLIC_MAX_BALANCE_MODULE_ADDRESS=${addr["maxBalanceModule"] ?? ""}`,
    `NEXT_PUBLIC_LOCK_MODULE_ADDRESS=${addr["lockModule"] ?? ""}`,
    `NEXT_PUBLIC_WHITELIST_MODULE_ADDRESS=${addr["whitelistModule"] ?? ""}`,
    `NEXT_PUBLIC_CONDITIONAL_TRANSFER_MODULE_ADDRESS=${addr["conditionalTransferModule"] ?? ""}`,
    `NEXT_PUBLIC_TRANSFER_RESTRICT_MODULE_ADDRESS=${addr["transferRestrictModule"] ?? ""}`,
    `NEXT_PUBLIC_TIME_LOCKED_TRANSFER_MODULE_ADDRESS=${addr["timeLockedTransferModule"] ?? ""}`,
    `NEXT_PUBLIC_TIME_TRANSFERS_LIMIT_MODULE_ADDRESS=${addr["timeTransfersLimitModule"] ?? ""}`,
    "",
  ];
  fs.writeFileSync(envFile, envLines.join("\n"));
  console.log(`\n  Env block also saved to: ${envFile}`);
  console.log("");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
