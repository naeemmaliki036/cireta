import { ethers } from "hardhat";

async function main() {
  const abi = ["function owner() view returns (address)"];
  const c = new ethers.Contract("0x432Ce8ccAa590C895C153121d36cd8992e344022", abi, ethers.provider);
  const owner = await c.owner();
  const [signer] = await ethers.getSigners();
  console.log("Factory owner:", owner);
  console.log("Deployer:", signer.address);
  console.log("Match:", owner.toLowerCase() === signer.address.toLowerCase());
}

main();
