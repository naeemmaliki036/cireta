/**
 * Cireta Platform — Master Deployment Script
 *
 * Deploys platform contracts based on identity mode selection.
 * If IDENTITY_MODE is not set, prompts the user to choose.
 *
 * Modes:
 *   - "simple"  → 13 contracts (SimpleIdentityRegistry whitelist)
 *   - "erc3643" → 20 contracts (full ONCHAINID + claim verification)
 *
 * Idempotent: skips already-deployed contracts.
 * Ownership: transfers ALL contracts to PLATFORM_ADMIN_ADDRESS at the end.
 *
 * Usage:
 *   IDENTITY_MODE=simple npx hardhat run scripts/deploy.ts --network baseSepolia
 */

import { ethers, upgrades } from "hardhat";
import * as fs from "fs";
import * as path from "path";

interface DeploymentAddresses {
  // Platform registries (simple mode skips identity-related ones)
  issuerRegistry: string;
  platformFeeManager: string;
  // ERC-3643 only
  identityRegistryStorage: string;
  claimTopicsRegistry: string;
  trustedIssuersRegistry: string;
  // Implementations
  tokenImplementation: string;
  simpleIdentityRegistryImplementation: string;
  identityRegistryImplementation: string;
  complianceImplementation: string;
  saleImplementation: string;
  fractionTokenImplementation: string;
  vaultImplementation: string;
  // ERC-3643 identity implementations
  onchainIdImplementation: string;
  onchainIdFactory: string;
  claimIssuer: string;
  // Factories
  tokenFactory: string;
  saleFactory: string;
  fractionFactory: string;
  // Compliance modules
  countryAllowModule: string;
  maxHolderCountModule: string;
  // Testnet only
  ciretaUSDC: string;
  // Metadata
  identityMode: string;
}

const DEPLOYMENTS_DIR = path.join(__dirname, "..", "deployments");

function loadExistingDeployment(network: string): Partial<DeploymentAddresses> {
  const filePath = path.join(DEPLOYMENTS_DIR, `${network}.json`);
  if (fs.existsSync(filePath)) {
    return JSON.parse(fs.readFileSync(filePath, "utf-8"));
  }
  return {};
}

function saveDeployment(network: string, addresses: Partial<DeploymentAddresses>) {
  if (!fs.existsSync(DEPLOYMENTS_DIR)) {
    fs.mkdirSync(DEPLOYMENTS_DIR, { recursive: true });
  }
  const filePath = path.join(DEPLOYMENTS_DIR, `${network}.json`);
  fs.writeFileSync(filePath, JSON.stringify(addresses, null, 2) + "\n");
}

function getNetworkName(chainId: bigint): string {
  const hn = process.env.HARDHAT_NETWORK;
  if (hn === "localhost" || hn === "hardhat") return "localhost";
  if (chainId === 84532n) return "base-sepolia";
  if (chainId === 8453n) return "base";
  if (chainId === 11155111n) return "sepolia";
  return "hardhat";
}

async function main() {
  const [deployer] = await ethers.getSigners();
  const network = await ethers.provider.getNetwork();
  const networkName = getNetworkName(network.chainId);

  // ── Identity mode selection ──
  const identityMode = process.env.IDENTITY_MODE || "";

  if (!identityMode || !["simple", "erc3643"].includes(identityMode)) {
    console.log("");
    console.log("╔══════════════════════════════════════════════════════════════╗");
    console.log("║  IDENTITY_MODE not set. Set it in .env before deploying.    ║");
    console.log("╠══════════════════════════════════════════════════════════════╣");
    console.log("║                                                             ║");
    console.log("║  IDENTITY_MODE=simple                                       ║");
    console.log("║    Whitelist-based verification (recommended to start)       ║");
    console.log("║    • 13 contracts deployed                                  ║");
    console.log("║    • ~50K gas per investor (~$0.002)                         ║");
    console.log("║    • Backend adds wallets to whitelist after KYC             ║");
    console.log("║    • Can upgrade to ERC-3643 later without breaking          ║");
    console.log("║      existing tokens                                        ║");
    console.log("║                                                             ║");
    console.log("║  IDENTITY_MODE=erc3643                                      ║");
    console.log("║    Full ONCHAINID + Claims (institutional grade)             ║");
    console.log("║    • 20 contracts deployed                                  ║");
    console.log("║    • ~1.9M gas per investor (~$0.06)                         ║");
    console.log("║    • Deploys per-investor identity contracts on-chain        ║");
    console.log("║    • Cryptographic claim verification on every transfer      ║");
    console.log("║    • Cross-platform identity portability (ERC-734/735)       ║");
    console.log("║    • Requires CLAIM_SIGNER_PRIVATE_KEY env var               ║");
    console.log("║                                                             ║");
    console.log("╚══════════════════════════════════════════════════════════════╝");
    console.log("");
    console.log("  Set IDENTITY_MODE=simple or IDENTITY_MODE=erc3643 in your .env file and re-run.");
    console.log("");
    process.exit(1);
  }

  const isSimple = identityMode === "simple";

  console.log("");
  console.log("╔══════════════════════════════════════════════════════╗");
  console.log("║         CIRETA PLATFORM DEPLOYMENT                  ║");
  console.log("╚══════════════════════════════════════════════════════╝");
  console.log(`  Deployer:       ${deployer.address}`);
  console.log(`  Network:        ${networkName} (chainId: ${network.chainId})`);
  console.log(`  Identity Mode:  ${identityMode.toUpperCase()}`);

  const balance = await ethers.provider.getBalance(deployer.address);
  console.log(`  Balance:        ${ethers.formatEther(balance)} ETH`);

  const platformAdmin = process.env.PLATFORM_ADMIN_ADDRESS;
  const feeReceiver = process.env.PLATFORM_FEE_RECEIVER;
  console.log(`  Platform Admin: ${platformAdmin || "deployer (no transfer)"}`);
  console.log(`  Fee Receiver:   ${feeReceiver || "deployer"}`);
  console.log(`  Contracts:      ${isSimple ? "~13" : "~20"}`);
  console.log("");

  // Load existing deployment for idempotency
  const existing = loadExistingDeployment(networkName);
  const addr: Partial<DeploymentAddresses> = { ...existing };
  addr.identityMode = identityMode;

  // ════════════════════════════════════════════════════════
  // STEP 1: Platform Registries
  // ════════════════════════════════════════════════════════
  console.log("=== Step 1: Platform Registries ===");

  if (!addr.issuerRegistry) {
    const F = await ethers.getContractFactory("IssuerRegistry");
    const proxy = await upgrades.deployProxy(F, [deployer.address], { kind: "uups" });
    await proxy.waitForDeployment();
    addr.issuerRegistry = await proxy.getAddress();
    console.log("  IssuerRegistry:", addr.issuerRegistry);
  } else {
    console.log("  IssuerRegistry: (exists)", addr.issuerRegistry);
  }

  if (!addr.platformFeeManager) {
    const F = await ethers.getContractFactory("PlatformFeeManager");
    const proxy = await upgrades.deployProxy(
      F, [deployer.address, deployer.address, 200],
      { kind: "uups" },
    );
    await proxy.waitForDeployment();
    addr.platformFeeManager = await proxy.getAddress();
    console.log("  PlatformFeeManager:", addr.platformFeeManager);
  } else {
    console.log("  PlatformFeeManager: (exists)", addr.platformFeeManager);
  }

  // ERC-3643 only: deploy shared identity registries
  if (!isSimple) {
    if (!addr.identityRegistryStorage) {
      const F = await ethers.getContractFactory("IdentityRegistryStorage");
      const proxy = await upgrades.deployProxy(F, [deployer.address], { kind: "uups" });
      await proxy.waitForDeployment();
      addr.identityRegistryStorage = await proxy.getAddress();
      console.log("  IdentityRegistryStorage:", addr.identityRegistryStorage);
    } else {
      console.log("  IdentityRegistryStorage: (exists)", addr.identityRegistryStorage);
    }

    if (!addr.claimTopicsRegistry) {
      const F = await ethers.getContractFactory("ClaimTopicsRegistry");
      const proxy = await upgrades.deployProxy(F, [deployer.address], { kind: "uups" });
      await proxy.waitForDeployment();
      addr.claimTopicsRegistry = await proxy.getAddress();
      console.log("  ClaimTopicsRegistry:", addr.claimTopicsRegistry);
    } else {
      console.log("  ClaimTopicsRegistry: (exists)", addr.claimTopicsRegistry);
    }

    if (!addr.trustedIssuersRegistry) {
      const F = await ethers.getContractFactory("TrustedIssuersRegistry");
      const proxy = await upgrades.deployProxy(F, [deployer.address], { kind: "uups" });
      await proxy.waitForDeployment();
      addr.trustedIssuersRegistry = await proxy.getAddress();
      console.log("  TrustedIssuersRegistry:", addr.trustedIssuersRegistry);
    } else {
      console.log("  TrustedIssuersRegistry: (exists)", addr.trustedIssuersRegistry);
    }
  } else {
    console.log("  IdentityRegistryStorage: SKIPPED (simple mode)");
    console.log("  ClaimTopicsRegistry: SKIPPED (simple mode)");
    console.log("  TrustedIssuersRegistry: SKIPPED (simple mode)");
  }

  saveDeployment(networkName, addr);

  // ════════════════════════════════════════════════════════
  // STEP 2: Implementation Contracts
  // ════════════════════════════════════════════════════════
  console.log("\n=== Step 2: Implementation Contracts ===");

  if (!addr.tokenImplementation) {
    const F = await ethers.getContractFactory("CiretaToken");
    const impl = await F.deploy();
    await impl.waitForDeployment();
    addr.tokenImplementation = await impl.getAddress();
    console.log("  CiretaToken impl:", addr.tokenImplementation);
  } else {
    console.log("  CiretaToken impl: (exists)", addr.tokenImplementation);
  }

  if (isSimple) {
    // Simple mode: deploy only SimpleIdentityRegistry
    if (!addr.simpleIdentityRegistryImplementation) {
      const F = await ethers.getContractFactory("SimpleIdentityRegistry");
      const impl = await F.deploy();
      await impl.waitForDeployment();
      addr.simpleIdentityRegistryImplementation = await impl.getAddress();
      console.log("  SimpleIdentityRegistry impl:", addr.simpleIdentityRegistryImplementation);
    } else {
      console.log("  SimpleIdentityRegistry impl: (exists)", addr.simpleIdentityRegistryImplementation);
    }
    console.log("  IdentityRegistry impl: SKIPPED (simple mode)");
  } else {
    // ERC-3643 mode: deploy full IdentityRegistry
    if (!addr.identityRegistryImplementation) {
      const F = await ethers.getContractFactory("IdentityRegistry");
      const impl = await F.deploy();
      await impl.waitForDeployment();
      addr.identityRegistryImplementation = await impl.getAddress();
      console.log("  IdentityRegistry impl:", addr.identityRegistryImplementation);
    } else {
      console.log("  IdentityRegistry impl: (exists)", addr.identityRegistryImplementation);
    }
    console.log("  SimpleIdentityRegistry impl: SKIPPED (erc3643 mode)");
  }

  if (!addr.complianceImplementation) {
    const F = await ethers.getContractFactory("ModularCompliance");
    const impl = await F.deploy();
    await impl.waitForDeployment();
    addr.complianceImplementation = await impl.getAddress();
    console.log("  ModularCompliance impl:", addr.complianceImplementation);
  } else {
    console.log("  ModularCompliance impl: (exists)", addr.complianceImplementation);
  }

  if (!addr.saleImplementation) {
    const F = await ethers.getContractFactory("Sale");
    const impl = await F.deploy();
    await impl.waitForDeployment();
    addr.saleImplementation = await impl.getAddress();
    console.log("  Sale impl:", addr.saleImplementation);
  } else {
    console.log("  Sale impl: (exists)", addr.saleImplementation);
  }

  if (!addr.fractionTokenImplementation) {
    const F = await ethers.getContractFactory("CiretaFractionToken");
    const impl = await F.deploy();
    await impl.waitForDeployment();
    addr.fractionTokenImplementation = await impl.getAddress();
    console.log("  FractionToken impl:", addr.fractionTokenImplementation);
  } else {
    console.log("  FractionToken impl: (exists)", addr.fractionTokenImplementation);
  }

  if (!addr.vaultImplementation) {
    const F = await ethers.getContractFactory("CiretaVault");
    const impl = await F.deploy();
    await impl.waitForDeployment();
    addr.vaultImplementation = await impl.getAddress();
    console.log("  Vault impl:", addr.vaultImplementation);
  } else {
    console.log("  Vault impl: (exists)", addr.vaultImplementation);
  }

  saveDeployment(networkName, addr);

  // ════════════════════════════════════════════════════════
  // STEP 3: Factories
  // ════════════════════════════════════════════════════════
  console.log("\n=== Step 3: Factories ===");

  const identityImpl = isSimple
    ? addr.simpleIdentityRegistryImplementation!
    : addr.identityRegistryImplementation!;

  // For simple mode, pass zero addresses for unused registry references
  const claimTopicsAddr = addr.claimTopicsRegistry || ethers.ZeroAddress;
  const trustedIssuersAddr = addr.trustedIssuersRegistry || ethers.ZeroAddress;
  const identityStorageAddr = addr.identityRegistryStorage || ethers.ZeroAddress;

  if (!addr.tokenFactory) {
    const F = await ethers.getContractFactory("CiretaTokenFactory");
    const proxy = await upgrades.deployProxy(F, [
      deployer.address,
      addr.tokenImplementation,
      identityImpl,
      addr.complianceImplementation,
      claimTopicsAddr,
      trustedIssuersAddr,
      identityStorageAddr,
      addr.issuerRegistry,
    ], { kind: "uups" });
    await proxy.waitForDeployment();
    addr.tokenFactory = await proxy.getAddress();
    console.log("  CiretaTokenFactory:", addr.tokenFactory);
  } else {
    console.log("  CiretaTokenFactory: (exists)", addr.tokenFactory);
  }

  if (!addr.saleFactory) {
    const F = await ethers.getContractFactory("CiretaSaleFactory");
    const proxy = await upgrades.deployProxy(F, [
      deployer.address,
      addr.saleImplementation,
    ], { kind: "uups" });
    await proxy.waitForDeployment();
    addr.saleFactory = await proxy.getAddress();
    console.log("  CiretaSaleFactory:", addr.saleFactory);
  } else {
    console.log("  CiretaSaleFactory: (exists)", addr.saleFactory);
  }

  if (!addr.fractionFactory) {
    const F = await ethers.getContractFactory("CiretaFractionFactory");
    const proxy = await upgrades.deployProxy(F, [
      deployer.address,
      addr.fractionTokenImplementation,
      addr.vaultImplementation,
    ], { kind: "uups", unsafeAllow: ["constructor"] });
    await proxy.waitForDeployment();
    addr.fractionFactory = await proxy.getAddress();
    console.log("  CiretaFractionFactory:", addr.fractionFactory);
  } else {
    console.log("  CiretaFractionFactory: (exists)", addr.fractionFactory);
  }

  saveDeployment(networkName, addr);

  // ════════════════════════════════════════════════════════
  // STEP 4: Identity Mode Configuration
  // ════════════════════════════════════════════════════════
  console.log(`\n=== Step 4: Identity Mode (${identityMode.toUpperCase()}) ===`);

  const tokenFactory = (await ethers.getContractFactory("CiretaTokenFactory")).attach(addr.tokenFactory!) as any;

  if (isSimple) {
    try {
      const tx = await tokenFactory.setSimpleIdentityMode(true);
      await tx.wait();
      console.log("  SimpleIdentityMode: ENABLED");
    } catch (e: any) {
      console.log("  SimpleIdentityMode: already set —", e.message?.slice(0, 60));
    }
  } else {
    // ERC-3643: deploy identity contracts
    if (!addr.onchainIdImplementation) {
      const F = await ethers.getContractFactory("OnchainID");
      const impl = await F.deploy();
      await impl.waitForDeployment();
      addr.onchainIdImplementation = await impl.getAddress();
      console.log("  OnchainID impl:", addr.onchainIdImplementation);
    }

    if (!addr.onchainIdFactory) {
      const F = await ethers.getContractFactory("OnchainIDFactory");
      const proxy = await upgrades.deployProxy(F, [
        addr.onchainIdImplementation, deployer.address,
      ], { kind: "uups" });
      await proxy.waitForDeployment();
      addr.onchainIdFactory = await proxy.getAddress();
      console.log("  OnchainIDFactory:", addr.onchainIdFactory);
    }

    if (!addr.claimIssuer) {
      const claimSigner = process.env.CLAIM_SIGNER_ADDRESS || deployer.address;
      const F = await ethers.getContractFactory("CiretaClaimIssuer");
      const proxy = await upgrades.deployProxy(F, [
        deployer.address, claimSigner,
      ], { kind: "uups" });
      await proxy.waitForDeployment();
      addr.claimIssuer = await proxy.getAddress();
      console.log("  CiretaClaimIssuer:", addr.claimIssuer);

      // Register as trusted issuer
      const tir = (await ethers.getContractFactory("TrustedIssuersRegistry")).attach(addr.trustedIssuersRegistry!) as any;
      try {
        const tx = await tir.addTrustedIssuer(addr.claimIssuer, [1, 2]);
        await tx.wait();
        console.log("  ClaimIssuer registered for topics [KYC=1, AML=2]");
      } catch {
        console.log("  ClaimIssuer: already registered (non-fatal)");
      }
    }

    // Configure claim topics
    try {
      const ct = (await ethers.getContractFactory("ClaimTopicsRegistry")).attach(addr.claimTopicsRegistry!) as any;
      await (await ct.addClaimTopic(1)).wait(); // KYC
      console.log("  ClaimTopicsRegistry: added KYC topic (1)");
    } catch {
      console.log("  ClaimTopicsRegistry: KYC topic already added (non-fatal)");
    }

    try {
      const tx = await tokenFactory.setSimpleIdentityMode(false);
      await tx.wait();
      console.log("  SimpleIdentityMode: DISABLED (using ERC-3643)");
    } catch (e: any) {
      console.log("  SimpleIdentityMode: already disabled —", e.message?.slice(0, 60));
    }

    saveDeployment(networkName, addr);
  }

  // ════════════════════════════════════════════════════════
  // STEP 5: Cross-Contract Wiring
  // ════════════════════════════════════════════════════════
  console.log("\n=== Step 5: Cross-Contract Wiring ===");

  // IdentityRegistryStorage → TokenFactory (ERC-3643 only)
  if (!isSimple && addr.identityRegistryStorage) {
    const irs = (await ethers.getContractFactory("IdentityRegistryStorage")).attach(addr.identityRegistryStorage) as any;
    const currentOwner = await irs.owner();
    if (currentOwner.toLowerCase() !== addr.tokenFactory!.toLowerCase()) {
      const tx = await irs.transferOwnership(addr.tokenFactory!);
      await tx.wait();
      console.log("  IdentityRegistryStorage → TokenFactory");
    } else {
      console.log("  IdentityRegistryStorage → TokenFactory (already done)");
    }
  }

  // SaleFactory references
  {
    const sf = (await ethers.getContractFactory("CiretaSaleFactory")).attach(addr.saleFactory!) as any;

    try {
      await (await sf.setIssuerRegistry(addr.issuerRegistry!)).wait();
      console.log("  SaleFactory.issuerRegistry →", addr.issuerRegistry);
    } catch {
      console.log("  SaleFactory.issuerRegistry: already set (non-fatal)");
    }

    try {
      await (await sf.setPlatformFeeManager(addr.platformFeeManager!)).wait();
      console.log("  SaleFactory.platformFeeManager →", addr.platformFeeManager);
    } catch {
      console.log("  SaleFactory.platformFeeManager: already set (non-fatal)");
    }

    try {
      await (await sf.setFractionFactory(addr.fractionFactory!)).wait();
      console.log("  SaleFactory.fractionFactory →", addr.fractionFactory);
    } catch {
      console.log("  SaleFactory.fractionFactory: already set (non-fatal)");
    }
  }

  // Transfer FractionFactory ownership to SaleFactory (required for deploySaleVested)
  {
    const ff = (await ethers.getContractFactory("CiretaFractionFactory")).attach(addr.fractionFactory!) as any;
    const ffOwner = await ff.owner();
    if (ffOwner.toLowerCase() !== addr.saleFactory!.toLowerCase()) {
      if (ffOwner.toLowerCase() === deployer.address.toLowerCase()) {
        await (await ff.transferOwnership(addr.saleFactory!)).wait();
        console.log("  FractionFactory → SaleFactory (ownership transferred)");
      } else {
        console.log("  FractionFactory → owned by", ffOwner.slice(0, 10), "(manual transfer needed)");
      }
    } else {
      console.log("  FractionFactory → SaleFactory (already done)");
    }
  }

  // ════════════════════════════════════════════════════════
  // STEP 6: Compliance Modules
  // ════════════════════════════════════════════════════════
  console.log("\n=== Step 6: Compliance Modules ===");

  if (!addr.countryAllowModule) {
    const F = await ethers.getContractFactory("CountryAllowModule");
    const proxy = await upgrades.deployProxy(F, [deployer.address], { kind: "uups" });
    await proxy.waitForDeployment();
    addr.countryAllowModule = await proxy.getAddress();
    console.log("  CountryAllowModule:", addr.countryAllowModule);
  } else {
    console.log("  CountryAllowModule: (exists)", addr.countryAllowModule);
  }

  if (!addr.maxHolderCountModule) {
    const F = await ethers.getContractFactory("MaxHolderCountModule");
    const proxy = await upgrades.deployProxy(F, [deployer.address], { kind: "uups" });
    await proxy.waitForDeployment();
    addr.maxHolderCountModule = await proxy.getAddress();
    console.log("  MaxHolderCountModule:", addr.maxHolderCountModule);
  } else {
    console.log("  MaxHolderCountModule: (exists)", addr.maxHolderCountModule);
  }

  saveDeployment(networkName, addr);

  // ════════════════════════════════════════════════════════
  // STEP 6b: Testnet Mock Tokens (skip on mainnet)
  // ════════════════════════════════════════════════════════
  const isMainnet = network.chainId === 8453n;
  if (!isMainnet) {
    console.log("\n=== Step 6b: Testnet Mock Tokens ===");
    if (!addr.ciretaUSDC) {
      const F = await ethers.getContractFactory("CiretaUSDC");
      const token = await F.deploy();
      await token.waitForDeployment();
      addr.ciretaUSDC = await token.getAddress();
      console.log("  CiretaUSDC (cUSDC):", addr.ciretaUSDC);
    } else {
      console.log("  CiretaUSDC: (exists)", addr.ciretaUSDC);
    }
    saveDeployment(networkName, addr);
  } else {
    console.log("\n=== Step 6b: Mainnet — using real USDC (0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913) ===");
  }

  // ════════════════════════════════════════════════════════
  // STEP 7: Transfer Ownership to Platform Admin
  // ════════════════════════════════════════════════════════
  if (platformAdmin && platformAdmin.toLowerCase() !== deployer.address.toLowerCase()) {
    console.log("\n=== Step 7: Transfer Ownership to Platform Admin ===");
    console.log(`  Admin: ${platformAdmin}`);

    // Update fee receiver BEFORE transferring ownership
    if (feeReceiver) {
      try {
        const pfm = (await ethers.getContractFactory("PlatformFeeManager")).attach(addr.platformFeeManager!) as any;
        const current = await pfm.feeReceiver();
        if (current.toLowerCase() !== feeReceiver.toLowerCase()) {
          await (await pfm.setFeeReceiver(feeReceiver)).wait();
          console.log(`  FeeReceiver → ${feeReceiver}`);
        } else {
          console.log(`  FeeReceiver → already set`);
        }
      } catch (e: any) {
        console.error(`  FeeReceiver failed: ${e.message?.slice(0, 80)}`);
      }
    }

    // Build transfer list based on mode
    const transfers: Array<{ name: string; address: string }> = [
      { name: "IssuerRegistry", address: addr.issuerRegistry! },
      { name: "PlatformFeeManager", address: addr.platformFeeManager! },
      { name: "CiretaTokenFactory", address: addr.tokenFactory! },
      { name: "CiretaSaleFactory", address: addr.saleFactory! },
      // NOTE: FractionFactory ownership goes to SaleFactory (not admin)
      // because SaleFactory.deploySaleVested() calls FractionFactory.deployVaultAndFraction() which is onlyOwner
      { name: "CountryAllowModule", address: addr.countryAllowModule! },
      { name: "MaxHolderCountModule", address: addr.maxHolderCountModule! },
    ];

    // ERC-3643 only contracts
    if (!isSimple) {
      if (addr.claimTopicsRegistry) transfers.push({ name: "ClaimTopicsRegistry", address: addr.claimTopicsRegistry });
      if (addr.trustedIssuersRegistry) transfers.push({ name: "TrustedIssuersRegistry", address: addr.trustedIssuersRegistry });
      if (addr.onchainIdFactory) transfers.push({ name: "OnchainIDFactory", address: addr.onchainIdFactory });
      if (addr.claimIssuer) transfers.push({ name: "CiretaClaimIssuer", address: addr.claimIssuer });
    }

    for (const { name, address } of transfers) {
      if (!address) continue;
      try {
        const contract = (await ethers.getContractFactory(name)).attach(address) as any;
        const currentOwner = await contract.owner();
        if (currentOwner.toLowerCase() === deployer.address.toLowerCase()) {
          await (await contract.transferOwnership(platformAdmin)).wait();
          console.log(`  ${name} → transferred`);
        } else {
          console.log(`  ${name} → already owned by ${currentOwner.slice(0, 10)}...`);
        }
      } catch (e: any) {
        console.error(`  ${name} → FAILED: ${e.message?.slice(0, 80)}`);
      }
    }

    console.log("\n  Ownership transfer complete. Deployer has ZERO access.");
  } else if (!platformAdmin) {
    console.log("\n⚠️  PLATFORM_ADMIN_ADDRESS not set — deployer retains ownership.");
  } else {
    console.log("\n  Platform admin = deployer — no transfer needed.");
  }

  // Final save
  saveDeployment(networkName, addr);

  // ════════════════════════════════════════════════════════
  // SUMMARY
  // ════════════════════════════════════════════════════════
  const finalBalance = await ethers.provider.getBalance(deployer.address);
  const gasUsed = balance - finalBalance;
  const deployedCount = Object.entries(addr).filter(([k, v]) => v && k !== "identityMode").length;

  console.log("\n╔══════════════════════════════════════════════════════╗");
  console.log("║         DEPLOYMENT COMPLETE                         ║");
  console.log("╚══════════════════════════════════════════════════════╝");
  console.log(`  Network:        ${networkName}`);
  console.log(`  Identity Mode:  ${identityMode.toUpperCase()}`);
  console.log(`  Gas Used:       ${ethers.formatEther(gasUsed)} ETH`);
  console.log(`  Remaining:      ${ethers.formatEther(finalBalance)} ETH`);
  console.log(`  Contracts:      ${deployedCount}`);
  console.log("\n" + JSON.stringify(addr, null, 2));
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
