import { ethers, upgrades } from "hardhat";
import * as fs from "fs";
import * as path from "path";

interface DeploymentAddresses {
  identityRegistryStorage: string;
  claimTopicsRegistry: string;
  trustedIssuersRegistry: string;
  issuerRegistry: string;
  platformFeeManager: string;
  tokenFactory: string;
  saleFactory: string;
  tokenImplementation: string;
  saleImplementation: string;
  identityRegistryImplementation: string;
  complianceImplementation: string;
  countryAllowModule: string;
  maxHolderCountModule: string;
  // Per-token/sale addresses (populated by deploySale)
  sampleToken?: string;
  sampleSale?: string;
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
  console.log(`\nDeployment addresses saved to: ${filePath}`);
}

async function main() {
  const [deployer] = await ethers.getSigners();
  const network = await ethers.provider.getNetwork();
  // Detect local hardhat node: --network localhost or hardhat's in-process node
  const isLocalhost = process.env.HARDHAT_NETWORK === "localhost" || process.env.HARDHAT_NETWORK === "hardhat";
  const networkName = isLocalhost ? "localhost" : network.chainId === 84532n ? "base-sepolia" : network.chainId === 8453n ? "base" : network.chainId === 11155111n ? "sepolia" : "hardhat";

  console.log("Deploying contracts with account:", deployer.address);
  console.log("Network:", networkName, "(chainId:", network.chainId.toString(), ")");

  const balance = await ethers.provider.getBalance(deployer.address);
  console.log("Account balance:", ethers.formatEther(balance), "ETH");

  // Load existing deployment for idempotency
  const existing = loadExistingDeployment(networkName);
  const addresses: Partial<DeploymentAddresses> = { ...existing };

  // 1. Deploy platform registries (deploy once)
  console.log("\n=== Deploying Platform Registries ===");

  if (!addresses.identityRegistryStorage) {
    const IdentityRegistryStorage = await ethers.getContractFactory("IdentityRegistryStorage");
    const identityStorageProxy = await upgrades.deployProxy(
      IdentityRegistryStorage,
      [deployer.address],
      { kind: "uups" }
    );
    await identityStorageProxy.waitForDeployment();
    addresses.identityRegistryStorage = await identityStorageProxy.getAddress();
    console.log("IdentityRegistryStorage deployed to:", addresses.identityRegistryStorage);
  } else {
    console.log("IdentityRegistryStorage already deployed:", addresses.identityRegistryStorage);
  }

  if (!addresses.claimTopicsRegistry) {
    const ClaimTopicsRegistry = await ethers.getContractFactory("ClaimTopicsRegistry");
    const claimTopicsProxy = await upgrades.deployProxy(
      ClaimTopicsRegistry,
      [deployer.address],
      { kind: "uups" }
    );
    await claimTopicsProxy.waitForDeployment();
    addresses.claimTopicsRegistry = await claimTopicsProxy.getAddress();
    console.log("ClaimTopicsRegistry deployed to:", addresses.claimTopicsRegistry);
  } else {
    console.log("ClaimTopicsRegistry already deployed:", addresses.claimTopicsRegistry);
  }

  if (!addresses.trustedIssuersRegistry) {
    const TrustedIssuersRegistry = await ethers.getContractFactory("TrustedIssuersRegistry");
    const trustedIssuersProxy = await upgrades.deployProxy(
      TrustedIssuersRegistry,
      [deployer.address],
      { kind: "uups" }
    );
    await trustedIssuersProxy.waitForDeployment();
    addresses.trustedIssuersRegistry = await trustedIssuersProxy.getAddress();
    console.log("TrustedIssuersRegistry deployed to:", addresses.trustedIssuersRegistry);
  } else {
    console.log("TrustedIssuersRegistry already deployed:", addresses.trustedIssuersRegistry);
  }

  if (!addresses.issuerRegistry) {
    const IssuerRegistry = await ethers.getContractFactory("IssuerRegistry");
    const issuerRegistryProxy = await upgrades.deployProxy(
      IssuerRegistry,
      [deployer.address],
      { kind: "uups" }
    );
    await issuerRegistryProxy.waitForDeployment();
    addresses.issuerRegistry = await issuerRegistryProxy.getAddress();
    console.log("IssuerRegistry deployed to:", addresses.issuerRegistry);
  } else {
    console.log("IssuerRegistry already deployed:", addresses.issuerRegistry);
  }

  if (!addresses.platformFeeManager) {
    const PlatformFeeManager = await ethers.getContractFactory("PlatformFeeManager");
    const feeManagerProxy = await upgrades.deployProxy(
      PlatformFeeManager,
      [deployer.address, deployer.address, 200], // 2% default fee
      { kind: "uups" }
    );
    await feeManagerProxy.waitForDeployment();
    addresses.platformFeeManager = await feeManagerProxy.getAddress();
    console.log("PlatformFeeManager deployed to:", addresses.platformFeeManager);
  } else {
    console.log("PlatformFeeManager already deployed:", addresses.platformFeeManager);
  }

  // 2. Deploy implementation contracts
  console.log("\n=== Deploying Implementation Contracts ===");

  if (!addresses.tokenImplementation) {
    const CiretaToken = await ethers.getContractFactory("CiretaToken");
    const tokenImpl = await CiretaToken.deploy();
    await tokenImpl.waitForDeployment();
    addresses.tokenImplementation = await tokenImpl.getAddress();
    console.log("CiretaToken implementation deployed to:", addresses.tokenImplementation);
  } else {
    console.log("CiretaToken implementation already deployed:", addresses.tokenImplementation);
  }

  if (!addresses.identityRegistryImplementation) {
    const IdentityRegistry = await ethers.getContractFactory("IdentityRegistry");
    const identityRegistryImpl = await IdentityRegistry.deploy();
    await identityRegistryImpl.waitForDeployment();
    addresses.identityRegistryImplementation = await identityRegistryImpl.getAddress();
    console.log("IdentityRegistry implementation deployed to:", addresses.identityRegistryImplementation);
  } else {
    console.log("IdentityRegistry implementation already deployed:", addresses.identityRegistryImplementation);
  }

  if (!addresses.complianceImplementation) {
    const ModularCompliance = await ethers.getContractFactory("ModularCompliance");
    const complianceImpl = await ModularCompliance.deploy();
    await complianceImpl.waitForDeployment();
    addresses.complianceImplementation = await complianceImpl.getAddress();
    console.log("ModularCompliance implementation deployed to:", addresses.complianceImplementation);
  } else {
    console.log("ModularCompliance implementation already deployed:", addresses.complianceImplementation);
  }

  if (!addresses.saleImplementation) {
    const Sale = await ethers.getContractFactory("Sale");
    const saleImpl = await Sale.deploy();
    await saleImpl.waitForDeployment();
    addresses.saleImplementation = await saleImpl.getAddress();
    console.log("Sale implementation deployed to:", addresses.saleImplementation);
  } else {
    console.log("Sale implementation already deployed:", addresses.saleImplementation);
  }

  // 3. Deploy Token Factory
  console.log("\n=== Deploying Token Factory ===");

  if (!addresses.tokenFactory) {
    const CiretaTokenFactory = await ethers.getContractFactory("CiretaTokenFactory");
    const factoryProxy = await upgrades.deployProxy(
      CiretaTokenFactory,
      [
        deployer.address,
        addresses.tokenImplementation,
        addresses.identityRegistryImplementation,
        addresses.complianceImplementation,
        addresses.claimTopicsRegistry,
        addresses.trustedIssuersRegistry,
        addresses.identityRegistryStorage,
        addresses.issuerRegistry,
      ],
      { kind: "uups" }
    );
    await factoryProxy.waitForDeployment();
    addresses.tokenFactory = await factoryProxy.getAddress();
    console.log("CiretaTokenFactory deployed to:", addresses.tokenFactory);
  } else {
    console.log("CiretaTokenFactory already deployed:", addresses.tokenFactory);
  }

  // 4. Deploy Sale Factory
  console.log("\n=== Deploying Sale Factory ===");

  if (!addresses.saleFactory) {
    const CiretaSaleFactory = await ethers.getContractFactory("CiretaSaleFactory");
    const saleFactoryProxy = await upgrades.deployProxy(
      CiretaSaleFactory,
      [deployer.address, addresses.saleImplementation],
      { kind: "uups" }
    );
    await saleFactoryProxy.waitForDeployment();
    addresses.saleFactory = await saleFactoryProxy.getAddress();
    console.log("CiretaSaleFactory deployed to:", addresses.saleFactory);
  } else {
    console.log("CiretaSaleFactory already deployed:", addresses.saleFactory);
  }

  // 4b. Transfer IdentityRegistryStorage ownership to TokenFactory
  //     so factory can call bindIdentityRegistry() (onlyOwner)
  console.log("\n=== Transferring IdentityRegistryStorage ownership to TokenFactory ===");
  {
    const IdentityRegistryStorage = await ethers.getContractFactory("IdentityRegistryStorage");
    const identityStorage = IdentityRegistryStorage.attach(addresses.identityRegistryStorage!) as any;
    const currentOwner = await identityStorage.owner();
    if (currentOwner.toLowerCase() !== addresses.tokenFactory!.toLowerCase()) {
      const tx = await identityStorage.transferOwnership(addresses.tokenFactory!);
      await tx.wait();
      console.log("IdentityRegistryStorage ownership transferred to TokenFactory:", addresses.tokenFactory);
    } else {
      console.log("IdentityRegistryStorage already owned by TokenFactory");
    }
  }

  // 5. Deploy compliance modules
  console.log("\n=== Deploying Compliance Modules ===");

  if (!addresses.countryAllowModule) {
    const CountryAllowModule = await ethers.getContractFactory("CountryAllowModule");
    const countryModuleProxy = await upgrades.deployProxy(
      CountryAllowModule,
      [deployer.address],
      { kind: "uups" }
    );
    await countryModuleProxy.waitForDeployment();
    addresses.countryAllowModule = await countryModuleProxy.getAddress();
    console.log("CountryAllowModule deployed to:", addresses.countryAllowModule);
  } else {
    console.log("CountryAllowModule already deployed:", addresses.countryAllowModule);
  }

  if (!addresses.maxHolderCountModule) {
    const MaxHolderCountModule = await ethers.getContractFactory("MaxHolderCountModule");
    const maxHolderModuleProxy = await upgrades.deployProxy(
      MaxHolderCountModule,
      [deployer.address],
      { kind: "uups" }
    );
    await maxHolderModuleProxy.waitForDeployment();
    addresses.maxHolderCountModule = await maxHolderModuleProxy.getAddress();
    console.log("MaxHolderCountModule deployed to:", addresses.maxHolderCountModule);
  } else {
    console.log("MaxHolderCountModule already deployed:", addresses.maxHolderCountModule);
  }

  // 6. Configure claim topics
  console.log("\n=== Configuring Claim Topics ===");
  try {
    const ClaimTopicsRegistry = await ethers.getContractFactory("ClaimTopicsRegistry");
    const claimTopics = ClaimTopicsRegistry.attach(addresses.claimTopicsRegistry!) as any;
    await claimTopics.addClaimTopic(1); // KYC claim topic
    console.log("Added KYC claim topic (1)");
  } catch {
    console.log("KYC claim topic already added (or failed — non-fatal)");
  }

  // 7. Transfer ownership to platform admin (staged deploy — Option 2)
  //    Deployer was temporary owner for setup convenience.
  //    After this block, deployer retains ZERO access.
  const platformAdmin = process.env.PLATFORM_ADMIN_ADDRESS;
  const feeReceiver = process.env.PLATFORM_FEE_RECEIVER || platformAdmin;

  if (platformAdmin && platformAdmin.toLowerCase() !== deployer.address.toLowerCase()) {
    console.log("\n=== Transferring Ownership to Platform Admin ===");
    console.log("Platform admin:", platformAdmin);

    // Update PlatformFeeManager fee receiver BEFORE transferring ownership
    // (setFeeReceiver is onlyOwner — deployer must still be owner)
    if (feeReceiver) {
      try {
        const PFM = await ethers.getContractFactory("PlatformFeeManager");
        const pfm = PFM.attach(addresses.platformFeeManager!) as any;
        const currentReceiver = await pfm.feeReceiver();
        if (currentReceiver.toLowerCase() !== feeReceiver.toLowerCase()) {
          const tx = await pfm.setFeeReceiver(feeReceiver);
          await tx.wait();
          console.log(`  PlatformFeeManager.feeReceiver → updated to ${feeReceiver}`);
        } else {
          console.log(`  PlatformFeeManager.feeReceiver → already set to ${feeReceiver}`);
        }
      } catch (e: any) {
        console.error(`  PlatformFeeManager.feeReceiver → update failed: ${e.message?.slice(0, 100)}`);
      }
    }

    // Transfer ownership of all platform contracts to ciretaAdmin
    const transfers: Array<{ name: string; address: string }> = [
      { name: "ClaimTopicsRegistry", address: addresses.claimTopicsRegistry! },
      { name: "TrustedIssuersRegistry", address: addresses.trustedIssuersRegistry! },
      { name: "IssuerRegistry", address: addresses.issuerRegistry! },
      { name: "PlatformFeeManager", address: addresses.platformFeeManager! },
      { name: "CiretaTokenFactory", address: addresses.tokenFactory! },
      { name: "CiretaSaleFactory", address: addresses.saleFactory! },
      { name: "CountryAllowModule", address: addresses.countryAllowModule! },
      { name: "MaxHolderCountModule", address: addresses.maxHolderCountModule! },
    ];

    for (const { name, address } of transfers) {
      try {
        const factory = await ethers.getContractFactory(name);
        const contract = factory.attach(address) as any;
        const currentOwner = await contract.owner();
        if (currentOwner.toLowerCase() === deployer.address.toLowerCase()) {
          const tx = await contract.transferOwnership(platformAdmin);
          await tx.wait();
          console.log(`  ${name} → ownership transferred to ${platformAdmin}`);
        } else {
          console.log(`  ${name} → already owned by ${currentOwner} (skipped)`);
        }
      } catch (e: any) {
        console.error(`  ${name} → transfer failed: ${e.message?.slice(0, 100)}`);
      }
    }

    console.log("\nOwnership transfer complete. Deployer wallet has ZERO access.");
  } else if (!platformAdmin) {
    console.log("\n⚠️  PLATFORM_ADMIN_ADDRESS not set — deployer retains ownership.");
    console.log("   Set PLATFORM_ADMIN_ADDRESS env var for production deployments.");
  } else {
    console.log("\nPlatform admin is the deployer — no ownership transfer needed.");
  }

  // Save all addresses
  saveDeployment(networkName, addresses);

  // Summary
  console.log("\n=== Deployment Summary ===");
  console.log(JSON.stringify(addresses, null, 2));
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
