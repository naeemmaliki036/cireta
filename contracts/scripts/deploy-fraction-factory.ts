import { ethers, upgrades } from "hardhat";
import * as fs from "fs";

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deployer:", deployer.address);
  
  const deployments = JSON.parse(fs.readFileSync("deployments/base-sepolia.json", "utf8"));
  
  const fractionImplAddr = deployments.fractionTokenImplementation || "";
  
  // 1. FractionToken impl (skip if already deployed)
  let finalFractionImpl = fractionImplAddr;
  if (!finalFractionImpl) {
    console.log("Deploying CiretaFractionToken impl...");
    const FT = await ethers.getContractFactory("CiretaFractionToken");
    const ft = await FT.deploy();
    await ft.waitForDeployment();
    finalFractionImpl = await ft.getAddress();
  }
  console.log("FractionToken impl:", finalFractionImpl);
  
  // 2. Vault impl
  let finalVaultImpl = deployments.vaultImplementation || "";
  if (!finalVaultImpl) {
    console.log("Deploying CiretaVault impl...");
    const V = await ethers.getContractFactory("CiretaVault");
    const v = await V.deploy();
    await v.waitForDeployment();
    finalVaultImpl = await v.getAddress();
    deployments.vaultImplementation = finalVaultImpl;
    fs.writeFileSync("deployments/base-sepolia.json", JSON.stringify(deployments, null, 2));
  }
  console.log("Vault impl:", finalVaultImpl);
  
  // 3. FractionFactory proxy
  let finalFactory = deployments.fractionFactory || "";
  if (!finalFactory) {
    console.log("Deploying CiretaFractionFactory proxy...");
    const FF = await ethers.getContractFactory("CiretaFractionFactory");
    const ff = await upgrades.deployProxy(FF, [deployer.address, finalFractionImpl, finalVaultImpl], { kind: "uups", unsafeAllow: ["constructor"] });
    await ff.waitForDeployment();
    finalFactory = await ff.getAddress();
    deployments.fractionFactory = finalFactory;
    fs.writeFileSync("deployments/base-sepolia.json", JSON.stringify(deployments, null, 2));
  }
  console.log("FractionFactory:", finalFactory);
  
  // 4. Set on SaleFactory
  console.log("Setting fractionFactory on SaleFactory...");
  const SF = await ethers.getContractFactory("CiretaSaleFactory");
  const sf = SF.attach(deployments.saleFactory);
  const tx = await sf.setFractionFactory(finalFactory);
  await tx.wait();
  console.log("Done!");
  
  // Save all
  deployments.fractionTokenImplementation = finalFractionImpl;
  fs.writeFileSync("deployments/base-sepolia.json", JSON.stringify(deployments, null, 2));
  console.log("✅ Saved");
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
