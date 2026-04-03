/**
 * Cireta E2E Smoke Test — Base Sepolia
 *
 * Tests the full deployment end-to-end:
 * 1. Admin registers issuer in IssuerRegistry
 * 2. Admin deploys a test token via TokenFactory
 * 3. Verify token trio (Token + SimpleIdentityRegistry + Compliance)
 * 4. Admin activates issuer on-chain
 *
 * Requires:
 *   ADMIN_PRIVATE_KEY — Platform admin wallet (owns all contracts)
 *   ISSUER_ADDRESS — Issuer wallet address to register
 *
 * Usage:
 *   ADMIN_PRIVATE_KEY=0x... ISSUER_ADDRESS=0x... npx hardhat run scripts/e2e-test.ts --network baseSepolia
 */

import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";

async function main() {
  const adminKey = process.env.ADMIN_PRIVATE_KEY;
  const issuerAddress = process.env.ISSUER_ADDRESS;

  if (!adminKey) {
    console.error("Set ADMIN_PRIVATE_KEY env var (platform admin wallet)");
    process.exit(1);
  }
  if (!issuerAddress) {
    console.error("Set ISSUER_ADDRESS env var (issuer wallet to register)");
    process.exit(1);
  }

  // Load deployment addresses
  const deploymentsPath = path.join(__dirname, "..", "deployments", "base-sepolia.json");
  if (!fs.existsSync(deploymentsPath)) {
    console.error("No deployment found at", deploymentsPath);
    process.exit(1);
  }
  const addr = JSON.parse(fs.readFileSync(deploymentsPath, "utf-8"));

  // Create admin signer
  const admin = new ethers.Wallet(adminKey, ethers.provider);
  console.log("╔══════════════════════════════════════════════════════╗");
  console.log("║         CIRETA E2E SMOKE TEST                       ║");
  console.log("╚══════════════════════════════════════════════════════╝");
  console.log(`  Admin:   ${admin.address}`);
  console.log(`  Issuer:  ${issuerAddress}`);

  const balance = await ethers.provider.getBalance(admin.address);
  console.log(`  Balance: ${ethers.formatEther(balance)} ETH`);
  console.log("");

  // ── Step 1: Register issuer in IssuerRegistry ──
  console.log("=== Step 1: Register Issuer ===");
  const issuerRegistry = new ethers.Contract(
    addr.issuerRegistry,
    [
      "function registerIssuer(address wallet, string name, string jurisdiction) external",
      "function activateIssuer(address wallet) external",
      "function isActiveIssuer(address wallet) external view returns (bool)",
      "function getIssuer(address wallet) external view returns (tuple(address wallet, string name, string jurisdiction, uint8 status, uint256 registeredAt, uint256 updatedAt))",
    ],
    admin,
  );

  try {
    const issuerData = await issuerRegistry.getIssuer(issuerAddress);
    if (issuerData.status > 0) {
      console.log(`  Issuer already registered (status: ${issuerData.status})`);
    } else {
      throw new Error("not registered");
    }
  } catch {
    console.log("  Registering issuer...");
    const tx1 = await issuerRegistry.registerIssuer(issuerAddress, "Cireta Test Issuer", "AE");
    await tx1.wait();
    console.log("  Registered: Cireta Test Issuer (AE)");
  }

  // ── Step 2: Activate issuer ──
  console.log("\n=== Step 2: Activate Issuer ===");
  const isActive = await issuerRegistry.isActiveIssuer(issuerAddress);
  if (isActive) {
    console.log("  Issuer already active");
  } else {
    const tx2 = await issuerRegistry.activateIssuer(issuerAddress);
    await tx2.wait();
    console.log("  Issuer activated");
  }

  // ── Step 3: Deploy test token via TokenFactory ──
  console.log("\n=== Step 3: Deploy Test Token ===");
  const tokenFactory = new ethers.Contract(
    addr.tokenFactory,
    [
      "function deployToken(string name, string symbol, uint8 decimals, address issuer) external returns (address, address, address)",
      "event TokenDeployed(address indexed token, address indexed identityRegistry, address indexed compliance, address issuer)",
    ],
    admin,
  );

  console.log("  Deploying token: Cireta Test Gold (cTGLD, 6 decimals)...");
  const tx3 = await tokenFactory.deployToken("Cireta Test Gold", "cTGLD", 6, issuerAddress, { gasLimit: 5_000_000 });
  const receipt = await tx3.wait();

  // Parse TokenDeployed event
  let tokenAddress = "", identityRegistryAddress = "", complianceAddress = "";
  for (const log of receipt.logs) {
    try {
      const parsed = tokenFactory.interface.parseLog({ topics: [...log.topics], data: log.data });
      if (parsed && parsed.name === "TokenDeployed") {
        tokenAddress = parsed.args[0];
        identityRegistryAddress = parsed.args[1];
        complianceAddress = parsed.args[2];
        break;
      }
    } catch { /* skip non-matching logs */ }
  }

  if (!tokenAddress) {
    // Fallback: try to get from transaction events
    console.log("  Could not parse TokenDeployed event, checking logs...");
    console.log("  Logs:", receipt.logs.length);
  }

  console.log(`  Token:              ${tokenAddress}`);
  console.log(`  IdentityRegistry:   ${identityRegistryAddress}`);
  console.log(`  Compliance:         ${complianceAddress}`);

  // ── Step 4: Verify token ──
  console.log("\n=== Step 4: Verify Token ===");
  if (tokenAddress) {
    const token = new ethers.Contract(
      tokenAddress,
      [
        "function name() external view returns (string)",
        "function symbol() external view returns (string)",
        "function decimals() external view returns (uint8)",
        "function identityRegistry() external view returns (address)",
        "function compliance() external view returns (address)",
      ],
      ethers.provider,
    );

    const name = await token.name();
    const symbol = await token.symbol();
    const decimals = await token.decimals();
    const ir = await token.identityRegistry();
    const comp = await token.compliance();

    console.log(`  Name:        ${name}`);
    console.log(`  Symbol:      ${symbol}`);
    console.log(`  Decimals:    ${decimals}`);
    console.log(`  ID Registry: ${ir}`);
    console.log(`  Compliance:  ${comp}`);

    // Verify SimpleIdentityRegistry
    const simpleIR = new ethers.Contract(
      ir,
      ["function isVerified(address) external view returns (bool)"],
      ethers.provider,
    );
    const verified = await simpleIR.isVerified(issuerAddress);
    console.log(`  Issuer verified: ${verified} (expected: false — not whitelisted yet)`);
  }

  // ── Summary ──
  const finalBalance = await ethers.provider.getBalance(admin.address);
  const gasUsed = balance - finalBalance;

  console.log("\n╔══════════════════════════════════════════════════════╗");
  console.log("║         E2E TEST COMPLETE                           ║");
  console.log("╚══════════════════════════════════════════════════════╝");
  console.log(`  Gas Used:  ${ethers.formatEther(gasUsed)} ETH`);
  console.log(`  Remaining: ${ethers.formatEther(finalBalance)} ETH`);
  if (tokenAddress) {
    console.log(`  Token:     ${tokenAddress}`);
    console.log(`  View on BaseScan: https://sepolia.basescan.org/address/${tokenAddress}`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
