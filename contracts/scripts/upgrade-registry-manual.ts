/**
 * Manual UUPS upgrade — deploys new implementation and calls upgradeToAndCall + migrateToRoles.
 */
import { ethers } from "hardhat";

const IR_PROXY = process.env.IDENTITY_REGISTRY_ADDRESS!;
const ISSUER_PROXY = process.env.ISSUER_REGISTRY_ADDRESS!;

async function main() {
  const provider = ethers.provider;
  const deployerWallet = new ethers.Wallet(process.env.DEPLOYER_PRIVATE_KEY!, provider);
  const adminWallet = new ethers.Wallet(process.env.PLATFORM_ADMIN_PRIVATE_KEY!, provider);
  const identitySignerAddr = (new ethers.Wallet(process.env.IDENTITY_SIGNER_PRIVATE_KEY!, provider)).address;

  // ── 1. Upgrade SimpleIdentityRegistry ──
  console.log("\n=== SimpleIdentityRegistry ===");
  console.log("Proxy:", IR_PROXY);
  console.log("Owner:", deployerWallet.address);
  console.log("Balance:", ethers.formatEther(await provider.getBalance(deployerWallet.address)), "ETH");

  // Deploy new implementation
  const IRFactory = await ethers.getContractFactory("SimpleIdentityRegistry", deployerWallet);
  const irImpl = await IRFactory.deploy();
  await irImpl.waitForDeployment();
  const irImplAddr = await irImpl.getAddress();
  console.log("New implementation deployed:", irImplAddr);

  // Call upgradeToAndCall on the proxy (UUPS)
  const proxyAbi = [
    "function upgradeToAndCall(address newImplementation, bytes memory data) external",
    "function migrateToRoles() external",
    "function owner() external view returns (address)",
    "function addAgent(address) external",
    "function isAgent(address) external view returns (bool)",
    "function grantRole(bytes32 role, address account) external",
    "function hasRole(bytes32 role, address account) external view returns (bool)",
    "function REGISTRAR_ROLE() external view returns (bytes32)",
    "function COMPLIANCE_ROLE() external view returns (bytes32)",
    "function AGENT_ROLE() external view returns (bytes32)",
    "function DEFAULT_ADMIN_ROLE() external view returns (bytes32)",
  ];

  const irProxy = new ethers.Contract(IR_PROXY, proxyAbi, deployerWallet);

  // Step 1: upgrade implementation (no init call)
  console.log("Upgrading proxy implementation...");
  const tx1 = await irProxy.upgradeToAndCall(irImplAddr, "0x");
  const receipt1 = await tx1.wait();
  console.log("Upgrade tx:", receipt1.hash);

  // Step 2: call migrateToRoles separately
  console.log("Calling migrateToRoles...");
  const tx1b = await irProxy.migrateToRoles();
  await tx1b.wait();
  console.log("migrateToRoles done.");

  // Verify
  const implSlot = "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc";
  const newImpl = "0x" + (await provider.getStorage(IR_PROXY, implSlot)).slice(26);
  console.log("Verified implementation:", newImpl);

  // Grant roles
  const REGISTRAR_ROLE = await irProxy.REGISTRAR_ROLE();
  const AGENT_ROLE = await irProxy.AGENT_ROLE();

  const isAlreadyAgent = await irProxy.isAgent(identitySignerAddr);
  console.log("Identity signer already agent:", isAlreadyAgent);

  if (!isAlreadyAgent) {
    const tx = await irProxy.grantRole(AGENT_ROLE, identitySignerAddr);
    await tx.wait();
    console.log("Granted AGENT_ROLE to:", identitySignerAddr);
  }

  // Also grant REGISTRAR_ROLE
  const hasRegistrar = await irProxy.hasRole(REGISTRAR_ROLE, identitySignerAddr);
  if (!hasRegistrar) {
    const tx = await irProxy.grantRole(REGISTRAR_ROLE, identitySignerAddr);
    await tx.wait();
    console.log("Granted REGISTRAR_ROLE to:", identitySignerAddr);
  }

  const adminRole = await irProxy.DEFAULT_ADMIN_ROLE();
  console.log("Owner has DEFAULT_ADMIN_ROLE:", await irProxy.hasRole(adminRole, deployerWallet.address));
  console.log("Signer isAgent:", await irProxy.isAgent(identitySignerAddr));

  // ── 2. Upgrade IssuerRegistry ──
  console.log("\n=== IssuerRegistry ===");
  console.log("Proxy:", ISSUER_PROXY);
  console.log("Owner:", adminWallet.address);
  console.log("Balance:", ethers.formatEther(await provider.getBalance(adminWallet.address)), "ETH");

  const IssuerFactory = await ethers.getContractFactory("IssuerRegistry", adminWallet);
  const issImpl = await IssuerFactory.deploy();
  await issImpl.waitForDeployment();
  const issImplAddr = await issImpl.getAddress();
  console.log("New implementation deployed:", issImplAddr);

  const issuerProxyAbi = [
    "function upgradeToAndCall(address newImplementation, bytes memory data) external",
    "function migrateToRoles() external",
    "function owner() external view returns (address)",
    "function grantRole(bytes32 role, address account) external",
    "function hasRole(bytes32 role, address account) external view returns (bool)",
    "function ISSUER_MANAGER_ROLE() external view returns (bytes32)",
    "function DEFAULT_ADMIN_ROLE() external view returns (bytes32)",
  ];

  const issProxy = new ethers.Contract(ISSUER_PROXY, issuerProxyAbi, adminWallet);
  const issMigrateData = IssuerFactory.interface.encodeFunctionData("migrateToRoles");

  console.log("Upgrading proxy implementation...");
  const tx2 = await issProxy.upgradeToAndCall(issImplAddr, "0x");
  const receipt2 = await tx2.wait();
  console.log("Upgrade tx:", receipt2.hash);

  console.log("Calling migrateToRoles...");
  const tx2b = await issProxy.migrateToRoles();
  await tx2b.wait();
  console.log("migrateToRoles done.");

  // Grant ISSUER_MANAGER_ROLE
  const ISSUER_MANAGER_ROLE = await issProxy.ISSUER_MANAGER_ROLE();
  const tx3 = await issProxy.grantRole(ISSUER_MANAGER_ROLE, adminWallet.address);
  await tx3.wait();
  console.log("Granted ISSUER_MANAGER_ROLE to admin:", adminWallet.address);

  const tx4 = await issProxy.grantRole(ISSUER_MANAGER_ROLE, identitySignerAddr);
  await tx4.wait();
  console.log("Granted ISSUER_MANAGER_ROLE to signer:", identitySignerAddr);

  const issAdminRole = await issProxy.DEFAULT_ADMIN_ROLE();
  console.log("Admin has DEFAULT_ADMIN_ROLE:", await issProxy.hasRole(issAdminRole, adminWallet.address));

  console.log("\n=== All upgrades complete ===");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
