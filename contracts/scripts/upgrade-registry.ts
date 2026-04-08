/**
 * Upgrade SimpleIdentityRegistry and IssuerRegistry to role-based access control.
 *
 * Uses two different owner keys:
 *   - DEPLOYER_PRIVATE_KEY (0x7599...) — owns SimpleIdentityRegistry
 *   - PLATFORM_ADMIN_PRIVATE_KEY (0x8eE4...) — owns IssuerRegistry
 */
import { ethers, upgrades } from "hardhat";

async function main() {
  const provider = ethers.provider;
  const [defaultSigner] = await ethers.getSigners();

  const identityRegistryAddress = process.env.IDENTITY_REGISTRY_ADDRESS;
  const issuerRegistryAddress = process.env.ISSUER_REGISTRY_ADDRESS;
  const identitySignerAddress = process.env.IDENTITY_SIGNER_ADDRESS || defaultSigner.address;

  // ── Upgrade SimpleIdentityRegistry ──

  if (identityRegistryAddress && process.env.DEPLOYER_PRIVATE_KEY) {
    console.log("\n=== Upgrading SimpleIdentityRegistry ===");
    console.log("Proxy:", identityRegistryAddress);

    const deployerWallet = new ethers.Wallet(process.env.DEPLOYER_PRIVATE_KEY, provider);
    console.log("Owner wallet:", deployerWallet.address);

    const balance = await provider.getBalance(deployerWallet.address);
    console.log("Balance:", ethers.formatEther(balance), "ETH");

    const Factory = await ethers.getContractFactory("SimpleIdentityRegistry", deployerWallet);

    // Force-import if not already registered (deployed outside this machine)
    try {
      await upgrades.forceImport(identityRegistryAddress, Factory, { kind: "uups" });
      console.log("Proxy force-imported into upgrades manifest.");
    } catch (e: any) {
      if (!e.message?.includes("already registered")) throw e;
      console.log("Proxy already registered in manifest.");
    }

    const upgraded = await upgrades.upgradeProxy(identityRegistryAddress, Factory);
    await upgraded.waitForDeployment();
    console.log("Implementation upgraded.");

    // Migrate to roles
    const tx1 = await upgraded.migrateToRoles();
    await tx1.wait();
    console.log("migrateToRoles() called — DEFAULT_ADMIN_ROLE granted to owner.");

    // Grant AGENT_ROLE to the backend identity signer (so it can still add wallets)
    const AGENT_ROLE = await upgraded.AGENT_ROLE();
    const REGISTRAR_ROLE = await upgraded.REGISTRAR_ROLE();

    // Check if identity signer is already an agent
    const isAlreadyAgent = await upgraded.isAgent(identitySignerAddress);
    if (!isAlreadyAgent) {
      const tx2 = await upgraded.grantRole(AGENT_ROLE, identitySignerAddress);
      await tx2.wait();
      console.log(`AGENT_ROLE granted to identity signer: ${identitySignerAddress}`);
    } else {
      console.log(`Identity signer already has agent access: ${identitySignerAddress}`);
      // Also grant via AccessControl so it works with new role system
      const hasRegistrar = await upgraded.hasRole(REGISTRAR_ROLE, identitySignerAddress);
      if (!hasRegistrar) {
        const tx3 = await upgraded.grantRole(REGISTRAR_ROLE, identitySignerAddress);
        await tx3.wait();
        console.log(`REGISTRAR_ROLE also granted to: ${identitySignerAddress}`);
      }
    }

    // Verify
    const COMPLIANCE_ROLE = await upgraded.COMPLIANCE_ROLE();
    console.log("\nRole constants:");
    console.log("  AGENT_ROLE:     ", AGENT_ROLE);
    console.log("  REGISTRAR_ROLE: ", REGISTRAR_ROLE);
    console.log("  COMPLIANCE_ROLE:", COMPLIANCE_ROLE);
    console.log("Verified — identity signer isAgent:", await upgraded.isAgent(identitySignerAddress));
  } else {
    console.log("Skipping SimpleIdentityRegistry — missing address or DEPLOYER_PRIVATE_KEY");
  }

  // ── Upgrade IssuerRegistry ──

  if (issuerRegistryAddress && process.env.PLATFORM_ADMIN_PRIVATE_KEY) {
    console.log("\n=== Upgrading IssuerRegistry ===");
    console.log("Proxy:", issuerRegistryAddress);

    const adminWallet = new ethers.Wallet(process.env.PLATFORM_ADMIN_PRIVATE_KEY, provider);
    console.log("Owner wallet:", adminWallet.address);

    const balance = await provider.getBalance(adminWallet.address);
    console.log("Balance:", ethers.formatEther(balance), "ETH");

    const Factory = await ethers.getContractFactory("IssuerRegistry", adminWallet);

    try {
      await upgrades.forceImport(issuerRegistryAddress, Factory, { kind: "uups" });
      console.log("Proxy force-imported into upgrades manifest.");
    } catch (e: any) {
      if (!e.message?.includes("already registered")) throw e;
      console.log("Proxy already registered in manifest.");
    }

    const upgraded = await upgrades.upgradeProxy(issuerRegistryAddress, Factory);
    await upgraded.waitForDeployment();
    console.log("Implementation upgraded.");

    const tx1 = await upgraded.migrateToRoles();
    await tx1.wait();
    console.log("migrateToRoles() called — DEFAULT_ADMIN_ROLE granted to owner.");

    // Grant ISSUER_MANAGER_ROLE to the admin wallet itself + identity signer
    const ISSUER_MANAGER_ROLE = await upgraded.ISSUER_MANAGER_ROLE();
    const tx2 = await upgraded.grantRole(ISSUER_MANAGER_ROLE, adminWallet.address);
    await tx2.wait();
    console.log(`ISSUER_MANAGER_ROLE granted to admin: ${adminWallet.address}`);

    // Also grant to identity signer so backend can manage issuers
    const tx3 = await upgraded.grantRole(ISSUER_MANAGER_ROLE, identitySignerAddress);
    await tx3.wait();
    console.log(`ISSUER_MANAGER_ROLE granted to signer: ${identitySignerAddress}`);

    console.log("\nRole constants:");
    console.log("  ISSUER_MANAGER_ROLE:", ISSUER_MANAGER_ROLE);
  } else {
    console.log("Skipping IssuerRegistry — missing address or PLATFORM_ADMIN_PRIVATE_KEY");
  }

  console.log("\n=== Upgrade complete ===");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
