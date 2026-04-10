import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import "@openzeppelin/hardhat-upgrades";
import * as dotenv from "dotenv";

dotenv.config({ path: "../.env" });

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.24",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
      viaIR: true,
      // Round-5: bumped from "paris" to "cancun" so OpenZeppelin's ERC1155
      // (used by CiretaFractionToken1155) can compile — it relies on the
      // mcopy opcode introduced in Cancun. Base + Base Sepolia both support
      // Cancun (Dencun upgrade Mar 2024), so the bytecode is fine to deploy.
      evmVersion: "cancun",
    },
  },
  networks: {
    hardhat: {
      chainId: 8453,
    },
    localhost: {
      url: "http://127.0.0.1:8545",
      chainId: 8453,
    },
    base: {
      url: process.env.WEB3_RPC_URL || "https://mainnet.base.org",
      chainId: 8453,
      accounts: process.env.IDENTITY_SIGNER_PRIVATE_KEY
        ? [process.env.IDENTITY_SIGNER_PRIVATE_KEY]
        : [],
    },
    baseSepolia: {
      url: process.env.WEB3_RPC_URL ?? (() => { throw new Error("WEB3_RPC_URL not set"); })(),
      chainId: 84532,
      accounts: process.env.IDENTITY_SIGNER_PRIVATE_KEY
        ? [process.env.IDENTITY_SIGNER_PRIVATE_KEY]
        : [],
    },
    sepolia: {
      url: process.env.WEB3_RPC_URL || "https://eth-sepolia.g.alchemy.com/v2/demo",
      chainId: 11155111,
      accounts: process.env.IDENTITY_SIGNER_PRIVATE_KEY
        ? [process.env.IDENTITY_SIGNER_PRIVATE_KEY]
        : [],
    },
  },
  etherscan: {
    enabled: true,
    apiKey: process.env.BASESCAN_API_KEY || "",
    customChains: [
      {
        network: "baseSepolia",
        chainId: 84532,
        urls: {
          apiURL: "https://api.etherscan.io/v2/api?chainid=84532",
          browserURL: "https://sepolia.basescan.org",
        },
      },
      {
        network: "base",
        chainId: 8453,
        urls: {
          apiURL: "https://api.etherscan.io/v2/api?chainid=8453",
          browserURL: "https://basescan.org",
        },
      },
    ],
  },
  sourcify: {
    enabled: true,
  },
  paths: {
    sources: "./src",
    tests: "./test",
    cache: "./cache",
    artifacts: "./artifacts",
  },
};

export default config;
