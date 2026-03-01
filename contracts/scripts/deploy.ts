import { ethers, upgrades } from "hardhat";

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying contracts with account:", deployer.address);

  const balance = await ethers.provider.getBalance(deployer.address);
  console.log("Account balance:", ethers.formatEther(balance), "ETH");

  // 1. Deploy platform registries (deploy once)
  console.log("\n=== Deploying Platform Registries ===");

  // Identity Registry Storage
  const IdentityRegistryStorage = await ethers.getContractFactory("IdentityRegistryStorage");
  const identityStorageProxy = await upgrades.deployProxy(
    IdentityRegistryStorage,
    [deployer.address],
    { kind: "uups" }
  );
  await identityStorageProxy.waitForDeployment();
  const identityStorageAddr = await identityStorageProxy.getAddress();
  console.log("IdentityRegistryStorage deployed to:", identityStorageAddr);

  // Claim Topics Registry
  const ClaimTopicsRegistry = await ethers.getContractFactory("ClaimTopicsRegistry");
  const claimTopicsProxy = await upgrades.deployProxy(
    ClaimTopicsRegistry,
    [deployer.address],
    { kind: "uups" }
  );
  await claimTopicsProxy.waitForDeployment();
  const claimTopicsAddr = await claimTopicsProxy.getAddress();
  console.log("ClaimTopicsRegistry deployed to:", claimTopicsAddr);

  // Trusted Issuers Registry
  const TrustedIssuersRegistry = await ethers.getContractFactory("TrustedIssuersRegistry");
  const trustedIssuersProxy = await upgrades.deployProxy(
    TrustedIssuersRegistry,
    [deployer.address],
    { kind: "uups" }
  );
  await trustedIssuersProxy.waitForDeployment();
  const trustedIssuersAddr = await trustedIssuersProxy.getAddress();
  console.log("TrustedIssuersRegistry deployed to:", trustedIssuersAddr);

  // Issuer Registry
  const IssuerRegistry = await ethers.getContractFactory("IssuerRegistry");
  const issuerRegistryProxy = await upgrades.deployProxy(
    IssuerRegistry,
    [deployer.address],
    { kind: "uups" }
  );
  await issuerRegistryProxy.waitForDeployment();
  const issuerRegistryAddr = await issuerRegistryProxy.getAddress();
  console.log("IssuerRegistry deployed to:", issuerRegistryAddr);

  // Platform Fee Manager
  const PlatformFeeManager = await ethers.getContractFactory("PlatformFeeManager");
  const feeManagerProxy = await upgrades.deployProxy(
    PlatformFeeManager,
    [deployer.address, deployer.address, 200], // 2% default fee
    { kind: "uups" }
  );
  await feeManagerProxy.waitForDeployment();
  const feeManagerAddr = await feeManagerProxy.getAddress();
  console.log("PlatformFeeManager deployed to:", feeManagerAddr);

  // 2. Deploy implementation contracts
  console.log("\n=== Deploying Implementation Contracts ===");

  const CiretaToken = await ethers.getContractFactory("CiretaToken");
  const tokenImpl = await CiretaToken.deploy();
  await tokenImpl.waitForDeployment();
  const tokenImplAddr = await tokenImpl.getAddress();
  console.log("CiretaToken implementation deployed to:", tokenImplAddr);

  const IdentityRegistry = await ethers.getContractFactory("IdentityRegistry");
  const identityRegistryImpl = await IdentityRegistry.deploy();
  await identityRegistryImpl.waitForDeployment();
  const identityRegistryImplAddr = await identityRegistryImpl.getAddress();
  console.log("IdentityRegistry implementation deployed to:", identityRegistryImplAddr);

  const ModularCompliance = await ethers.getContractFactory("ModularCompliance");
  const complianceImpl = await ModularCompliance.deploy();
  await complianceImpl.waitForDeployment();
  const complianceImplAddr = await complianceImpl.getAddress();
  console.log("ModularCompliance implementation deployed to:", complianceImplAddr);

  // 3. Deploy Token Factory
  console.log("\n=== Deploying Token Factory ===");

  const CiretaTokenFactory = await ethers.getContractFactory("CiretaTokenFactory");
  const factoryProxy = await upgrades.deployProxy(
    CiretaTokenFactory,
    [
      deployer.address,
      tokenImplAddr,
      identityRegistryImplAddr,
      complianceImplAddr,
      claimTopicsAddr,
      trustedIssuersAddr,
      identityStorageAddr,
      issuerRegistryAddr,
    ],
    { kind: "uups" }
  );
  await factoryProxy.waitForDeployment();
  const factoryAddr = await factoryProxy.getAddress();
  console.log("CiretaTokenFactory deployed to:", factoryAddr);

  // 4. Deploy compliance modules
  console.log("\n=== Deploying Compliance Modules ===");

  const CountryAllowModule = await ethers.getContractFactory("CountryAllowModule");
  const countryModuleProxy = await upgrades.deployProxy(
    CountryAllowModule,
    [deployer.address],
    { kind: "uups" }
  );
  await countryModuleProxy.waitForDeployment();
  const countryModuleAddr = await countryModuleProxy.getAddress();
  console.log("CountryAllowModule deployed to:", countryModuleAddr);

  const MaxHolderCountModule = await ethers.getContractFactory("MaxHolderCountModule");
  const maxHolderModuleProxy = await upgrades.deployProxy(
    MaxHolderCountModule,
    [deployer.address],
    { kind: "uups" }
  );
  await maxHolderModuleProxy.waitForDeployment();
  const maxHolderModuleAddr = await maxHolderModuleProxy.getAddress();
  console.log("MaxHolderCountModule deployed to:", maxHolderModuleAddr);

  // 5. Add default claim topics (KYC)
  console.log("\n=== Configuring Claim Topics ===");
  const claimTopics = ClaimTopicsRegistry.attach(claimTopicsAddr);
  await claimTopics.addClaimTopic(1); // KYC claim topic
  console.log("Added KYC claim topic (1)");

  // Summary
  console.log("\n=== Deployment Summary ===");
  console.log({
    identityRegistryStorage: identityStorageAddr,
    claimTopicsRegistry: claimTopicsAddr,
    trustedIssuersRegistry: trustedIssuersAddr,
    issuerRegistry: issuerRegistryAddr,
    platformFeeManager: feeManagerAddr,
    tokenFactory: factoryAddr,
    tokenImplementation: tokenImplAddr,
    identityRegistryImplementation: identityRegistryImplAddr,
    complianceImplementation: complianceImplAddr,
    countryAllowModule: countryModuleAddr,
    maxHolderCountModule: maxHolderModuleAddr,
  });
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
