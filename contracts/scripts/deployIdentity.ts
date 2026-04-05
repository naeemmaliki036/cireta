import { ethers } from "hardhat";
import * as dotenv from "dotenv";

dotenv.config();

/**
 * Deploy an ONCHAINID Identity contract for a specific wallet address.
 *
 * Usage:
 *   npx hardhat run scripts/deployIdentity.ts --network base --wallet 0x...
 *   npx hardhat run scripts/deployIdentity.ts --network baseSepolia --wallet 0x...
 *
 * Environment variables required:
 *   IDENTITY_SIGNER_PRIVATE_KEY - Private key with ETH for gas
 *   IDENTITY_FACTORY_ADDRESS - Deployed IdentityFactory contract address
 */

// Parse command-line arguments for --wallet
function getWalletArg(): string {
  const args = process.argv;
  const walletIdx = args.findIndex((arg) => arg === "--wallet");
  if (walletIdx === -1 || walletIdx + 1 >= args.length) {
    throw new Error("Missing --wallet argument. Usage: --wallet 0xYourAddress");
  }
  const wallet = args[walletIdx + 1];
  if (!ethers.isAddress(wallet)) {
    throw new Error(`Invalid wallet address: ${wallet}`);
  }
  return ethers.getAddress(wallet);
}

async function main() {
  const wallet = getWalletArg();
  const [deployer] = await ethers.getSigners();

  console.log("Deploying Identity with account:", deployer.address);
  console.log("Target wallet:", wallet);

  const balance = await ethers.provider.getBalance(deployer.address);
  console.log("Account balance:", ethers.formatEther(balance), "ETH");

  const factoryAddress = process.env.IDENTITY_FACTORY_ADDRESS;
  if (!factoryAddress) {
    throw new Error("IDENTITY_FACTORY_ADDRESS environment variable not set");
  }

  console.log("Using IdentityFactory at:", factoryAddress);

  // IdentityFactory ABI (minimal for createIdentityWithSalt)
  const factoryAbi = [
    {
      inputs: [
        { name: "_wallet", type: "address" },
        { name: "_salt", type: "bytes32" },
      ],
      name: "createIdentityWithSalt",
      outputs: [{ name: "", type: "address" }],
      stateMutability: "nonpayable",
      type: "function",
    },
    {
      anonymous: false,
      inputs: [
        { indexed: true, name: "wallet", type: "address" },
        { indexed: false, name: "identity", type: "address" },
      ],
      name: "IdentityCreated",
      type: "event",
    },
  ];

  const factory = new ethers.Contract(factoryAddress, factoryAbi, deployer);

  // Generate deterministic salt from wallet address
  const salt = ethers.keccak256(wallet);
  console.log("Using salt:", salt);

  console.log("\nDeploying Identity...");
  const tx = await factory.createIdentityWithSalt(wallet, salt);
  console.log("Transaction hash:", tx.hash);

  const receipt = await tx.wait();
  console.log("Transaction confirmed in block:", receipt.blockNumber);

  // Parse IdentityCreated event to get the deployed address
  let identityAddress: string | null = null;
  for (const log of receipt.logs) {
    try {
      const parsed = factory.interface.parseLog({
        topics: log.topics as string[],
        data: log.data,
      });
      if (parsed && parsed.name === "IdentityCreated") {
        identityAddress = parsed.args.identity;
        break;
      }
    } catch {
      // Not our event, continue
    }
  }

  if (identityAddress) {
    console.log("\n=== Identity Deployed Successfully ===");
    console.log("Wallet:", wallet);
    console.log("Identity:", identityAddress);
    console.log("Salt:", salt);
  } else {
    console.log("\nWarning: Could not parse IdentityCreated event");
    console.log("Check transaction on block explorer:", tx.hash);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
