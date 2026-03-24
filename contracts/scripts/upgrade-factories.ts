import { ethers, upgrades } from "hardhat";
import * as fs from "fs";
import * as path from "path";

async function main() {
  const deploymentsFile = path.join(__dirname, "..", "deployments", "base-sepolia.json");
  const deploy = JSON.parse(fs.readFileSync(deploymentsFile, "utf8"));
  
  const [deployer] = await ethers.getSigners();
  console.log("Upgrading with:", deployer.address);
  console.log("Balance:", ethers.formatEther(await ethers.provider.getBalance(deployer.address)), "ETH");
  
  // Upgrade TokenFactory
  console.log("\n=== Upgrading CiretaTokenFactory ===");
  const TokenFactory = await ethers.getContractFactory("CiretaTokenFactory");
  const upgradedTF = await upgrades.upgradeProxy(deploy.tokenFactory, TokenFactory);
  await upgradedTF.waitForDeployment();
  console.log("TokenFactory upgraded at:", deploy.tokenFactory);
  
  // Upgrade SaleFactory  
  console.log("\n=== Upgrading CiretaSaleFactory ===");
  const SaleFactory = await ethers.getContractFactory("CiretaSaleFactory");
  const upgradedSF = await upgrades.upgradeProxy(deploy.saleFactory, SaleFactory);
  await upgradedSF.waitForDeployment();
  console.log("SaleFactory upgraded at:", deploy.saleFactory);
  
  // Deploy new Sale implementation (with initialOwner param)
  console.log("\n=== Deploying new Sale implementation ===");
  const Sale = await ethers.getContractFactory("Sale");
  const newSaleImpl = await Sale.deploy();
  await newSaleImpl.waitForDeployment();
  const newSaleAddr = await newSaleImpl.getAddress();
  console.log("New Sale impl:", newSaleAddr);
  deploy.saleImplementation = newSaleAddr;
  
  // Update SaleFactory's implementation reference
  const saleFactory = await ethers.getContractAt("CiretaSaleFactory", deploy.saleFactory);
  const currentImpl = await saleFactory.saleImplementation();
  if (currentImpl.toLowerCase() !== newSaleAddr.toLowerCase()) {
    console.log("Updating SaleFactory implementation to:", newSaleAddr);
    const tx = await saleFactory.setSaleImplementation(newSaleAddr);
    await tx.wait();
    console.log("SaleFactory implementation updated on-chain.");
  } else {
    console.log("SaleFactory already using new Sale impl.");
  }
  // Save updated deployments
  fs.writeFileSync(deploymentsFile, JSON.stringify(deploy, null, 2) + "\n");
  console.log("\nDeployments updated");
  
  // Transfer IdentityRegistryStorage ownership to TokenFactory (Bug #1 fix)
  console.log("\n=== Transferring IdentityRegistryStorage ownership to TokenFactory ===");
  const idRegStorage = await ethers.getContractAt("IdentityRegistryStorage", deploy.identityRegistryStorage);
  const currentOwner = await idRegStorage.owner();
  console.log("Current owner:", currentOwner);
  if (currentOwner.toLowerCase() === deploy.tokenFactory.toLowerCase()) {
    console.log("Already owned by TokenFactory");
  } else {
    const tx = await idRegStorage.transferOwnership(deploy.tokenFactory);
    await tx.wait();
    console.log("Transferred to TokenFactory");
  }
  
  console.log("\n=== All upgrades complete ===");
}

main().catch(console.error);
