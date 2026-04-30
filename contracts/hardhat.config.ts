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
      chainId: 31337,
    },
    localhost: {
      url: "http://127.0.0.1:8545",
      chainId: 31337,
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
    // Etherscan v2 maps the same key to every supported chain (BaseScan included).
    // Set per-network keys explicitly so hardhat-verify uses BASESCAN_API_KEY for
    // both Base Sepolia and Base Mainnet without confusion.
    apiKey: {
      baseSepolia: process.env.BASESCAN_API_KEY || "",
      base: process.env.BASESCAN_API_KEY || "",
    },
    // We default to BaseScan's per-chain API endpoint (api-sepolia.basescan.org /
    // api.basescan.org) instead of Etherscan's unified v2 endpoint
    // (api.etherscan.io/v2/api). Some networks block the etherscan.io DNS;
    // BaseScan's own domain is consistently reachable.
    customChains: [
      {
        network: "baseSepolia",
        chainId: 84532,
        urls: {
          apiURL: "https://api-sepolia.basescan.org/api",
          browserURL: "https://sepolia.basescan.org",
        },
      },
      {
        network: "base",
        chainId: 8453,
        urls: {
          apiURL: "https://api.basescan.org/api",
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
