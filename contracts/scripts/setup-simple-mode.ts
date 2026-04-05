import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";

async function main() {
  const args = process.env;
  const factoryAddr = args.TOKEN_FACTORY_ADDRESS;
  const simpleIrAddr = args.SIMPLE_IR_ADDRESS;

  if (!factoryAddr || !simpleIrAddr) {
    console.error("Set TOKEN_FACTORY_ADDRESS and SIMPLE_IR_ADDRESS env vars");
    process.exit(1);
  }

  const factory = await ethers.getContractAt("CiretaTokenFactory", factoryAddr);

  // Update identity registry implementation to SimpleIdentityRegistry
  const tx1 = await factory.updateImplementations(
    ethers.ZeroAddress,  // keep token impl
    simpleIrAddr,        // new identity registry impl
    ethers.ZeroAddress   // keep compliance impl
  );
  await tx1.wait();
  console.log("Updated identity registry implementation to SimpleIdentityRegistry");

  // Enable simple mode
  const tx2 = await factory.setSimpleIdentityMode(true);
  await tx2.wait();
  console.log("Simple identity mode enabled on factory");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
