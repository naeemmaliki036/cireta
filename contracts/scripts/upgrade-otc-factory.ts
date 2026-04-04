import { ethers } from "hardhat";

async function main() {
  const FACTORY_PROXY = "0x432Ce8ccAa590C895C153121d36cd8992e344022";

  console.log("Step 1: Deploying new IssuerOTCTokenFactory implementation...");
  const Factory = await ethers.getContractFactory("IssuerOTCTokenFactory");
  const impl = await Factory.deploy();
  await impl.waitForDeployment();
  const implAddr = await impl.getAddress();
  console.log("New implementation deployed at:", implAddr);

  // Step 2: Call upgradeToAndCall on the proxy
  // The proxy owner (admin: 0x8eE48b43...) needs to call this.
  // Since deployer != admin, we'll try using the UUPS pattern:
  // The proxy's upgradeToAndCall is called via the implementation's _authorizeUpgrade
  // which checks onlyOwner. So we need the admin key.

  // Check if we can get admin wallet from env
  const adminKey = process.env.ADMIN_PRIVATE_KEY;
  if (adminKey) {
    console.log("\nStep 2: Upgrading proxy with admin wallet...");
    const adminWallet = new ethers.Wallet(adminKey, ethers.provider);
    console.log("Admin:", adminWallet.address);

    const proxyABI = [
      "function upgradeToAndCall(address newImplementation, bytes memory data) external",
    ];
    const proxy = new ethers.Contract(FACTORY_PROXY, proxyABI, adminWallet);
    const tx = await proxy.upgradeToAndCall(implAddr, "0x");
    console.log("Upgrade tx:", tx.hash);
    await tx.wait();
    console.log("Upgrade complete!");
  } else {
    console.log("\n--- MANUAL STEP REQUIRED ---");
    console.log("The admin wallet (0x8eE48b43...) must call upgradeToAndCall on the proxy.");
    console.log(`  Proxy:          ${FACTORY_PROXY}`);
    console.log(`  New Impl:       ${implAddr}`);
    console.log(`  Function:       upgradeToAndCall(${implAddr}, 0x)`);
    console.log("\nAdd ADMIN_PRIVATE_KEY to .env and re-run, or call manually via BaseScan.");
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
