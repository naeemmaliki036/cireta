import { ethers } from "hardhat";

async function main() {
  const SimpleIdentityRegistry = await ethers.getContractFactory("SimpleIdentityRegistry");
  const impl = await SimpleIdentityRegistry.deploy();
  await impl.waitForDeployment();
  const addr = await impl.getAddress();
  // Output parseable line for the shell script
  console.log(`SIMPLE_IR_ADDRESS=${addr}`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
