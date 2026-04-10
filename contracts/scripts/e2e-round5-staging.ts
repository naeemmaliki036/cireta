/**
 * Round-5 End-to-End Test — Base Sepolia Staging
 *
 * Full lifecycle: register issuer → deploy token → deploy sale → add phase
 * → deposit → approve → activate → mint USDC → buy → finalize → verify.
 *
 * Usage:
 *   cd contracts
 *   ./node_modules/.bin/hardhat run scripts/e2e-round5-staging.ts --network baseSepolia
 */

import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";

// ── Keys ────────────────────────────────────────────────────────────────────
const ADMIN_KEY = process.env.ADMIN_PRIVATE_KEY!;
const SIGNER_KEY = process.env.IDENTITY_SIGNER_PRIVATE_KEY!;
const ISSUER_KEY = "8a76cb14e3becbb35c0a260e87f2e9b62c72875f91ba93b1fc72c8769ed2d6ef";
const INVESTOR_KEY = "cd354e1926e9874572b3be04e7b21e84ccf01bd7ceecfff91cca4c2aebdba1a0";

// ── Deployed Addresses ──────────────────────────────────────────────────────
const deployments = JSON.parse(
  fs.readFileSync(path.join(__dirname, "..", "deployments", "base-sepolia.json"), "utf-8"),
);
const ISSUER_REGISTRY = deployments.issuerRegistry;
const FEE_MANAGER = deployments.platformFeeManager;
const TOKEN_FACTORY = deployments.tokenFactory;
const SALE_FACTORY = deployments.saleFactory;
const CIRETA_USDC = deployments.ciretaUSDC;
const IDENTITY_REGISTRY = "0x390F619D7C7d2e87E674Db36E0FD27a9402B517a";

async function main() {
  const provider = ethers.provider;

  const admin = new ethers.Wallet(ADMIN_KEY, provider);
  const signer = new ethers.Wallet(SIGNER_KEY, provider);
  const issuer = new ethers.Wallet(ISSUER_KEY, provider);
  const investor = new ethers.Wallet(INVESTOR_KEY, provider);

  console.log("╔══════════════════════════════════════════════════════╗");
  console.log("║     ROUND-5 E2E TEST — BASE SEPOLIA STAGING        ║");
  console.log("╚══════════════════════════════════════════════════════╝");
  console.log(`  Admin:    ${admin.address}`);
  console.log(`  Signer:   ${signer.address}`);
  console.log(`  Issuer:   ${issuer.address}`);
  console.log(`  Investor: ${investor.address}`);
  console.log("");

  // ════════════════════════════════════════════════════════
  // STEP 1: Register + activate issuer
  // ════════════════════════════════════════════════════════
  console.log("=== Step 1: Register & activate issuer ===");
  const issuerReg = await ethers.getContractAt("IssuerRegistry", ISSUER_REGISTRY, admin);
  const issuerData = await issuerReg.getIssuer(issuer.address);
  if (issuerData.status === 0n) {
    // Not registered
    const tx1 = await issuerReg.registerIssuer(issuer.address, "Test Issuer R5", "AE");
    await tx1.wait();
    console.log("  Registered issuer");
    const tx2 = await issuerReg.activateIssuer(issuer.address);
    await tx2.wait();
    console.log("  Activated issuer");
  } else if (issuerData.status === 1n) {
    // Pending
    const tx2 = await issuerReg.activateIssuer(issuer.address);
    await tx2.wait();
    console.log("  Activated issuer (was pending)");
  } else {
    console.log("  Issuer already active");
  }

  // ════════════════════════════════════════════════════════
  // STEP 2: Whitelist issuer + investor on identity registry
  // ════════════════════════════════════════════════════════
  console.log("\n=== Step 2: Whitelist on identity registry ===");
  const idReg = await ethers.getContractAt("SimpleIdentityRegistry", IDENTITY_REGISTRY, signer);
  for (const [label, addr] of [["Issuer", issuer.address], ["Investor", investor.address]]) {
    const verified = await idReg.isVerified(addr);
    if (!verified) {
      const tx = await idReg.addToWhitelist(addr, 784); // UAE
      await tx.wait();
      console.log(`  Whitelisted ${label}: ${addr}`);
    } else {
      console.log(`  ${label} already whitelisted`);
    }
  }

  // ════════════════════════════════════════════════════════
  // STEP 3: Deploy a CiretaToken via TokenFactory
  // ════════════════════════════════════════════════════════
  console.log("\n=== Step 3: Deploy CiretaToken ===");
  const tokenFactory = await ethers.getContractAt("CiretaTokenFactory", TOKEN_FACTORY, issuer);
  const tokenTx = await tokenFactory.deployToken(
    "Round5 Gold Test",    // name
    "R5GOLD",              // symbol
    6,                     // decimals
    IDENTITY_REGISTRY,     // identity registry
    issuer.address,        // compliance (placeholder — using identity registry)
    issuer.address,        // issuerWallet
  );
  const tokenReceipt = await tokenTx.wait();
  // Parse TokenDeployed event to get the token address
  const tokenDeployedLog = tokenReceipt!.logs.find((log: any) => {
    try {
      const parsed = tokenFactory.interface.parseLog({ topics: log.topics as string[], data: log.data });
      return parsed?.name === "TokenDeployed";
    } catch { return false; }
  });
  let tokenAddress: string;
  if (tokenDeployedLog) {
    const parsed = tokenFactory.interface.parseLog({ topics: tokenDeployedLog.topics as string[], data: tokenDeployedLog.data });
    tokenAddress = parsed!.args[1]; // second arg is the token proxy address
    console.log(`  Token deployed: ${tokenAddress}`);
  } else {
    throw new Error("TokenDeployed event not found");
  }

  // Mint project tokens to issuer
  const projectToken = await ethers.getContractAt("CiretaToken", tokenAddress, issuer);
  const mintAmount = ethers.parseUnits("100000", 6); // 100k tokens
  const mintTx = await projectToken.mint(issuer.address, mintAmount);
  await mintTx.wait();
  console.log(`  Minted 100,000 R5GOLD to issuer`);

  // ════════════════════════════════════════════════════════
  // STEP 4: Deploy Sale via SaleFactory (vested mode)
  // ════════════════════════════════════════════════════════
  console.log("\n=== Step 4: Deploy Sale (vested) ===");
  const saleFactory = await ethers.getContractAt("CiretaSaleFactory", SALE_FACTORY, issuer);

  // Get fee for issuer
  const feeMgr = await ethers.getContractAt("PlatformFeeManager", FEE_MANAGER, issuer);
  const feeBps = await feeMgr.getFeeForIssuer(issuer.address);

  const now = Math.floor(Date.now() / 1000);
  const saleStartTime = now;
  const saleEndTime = now + 90 * 86400; // 90 days
  const softCap = ethers.parseUnits("1000", 6);   // 1000 USDC
  const hardCap = ethers.parseUnits("100000", 6);  // 100k USDC
  const totalTokenSupply = ethers.parseUnits("100000", 6); // 100k tokens

  // Encode Sale.initialize calldata (14 args)
  const saleIface = new ethers.Interface([
    "function initialize(address,address,address,address,address,address,uint256,uint256,uint256,uint256,address,uint256,uint256,uint256)",
  ]);
  const initData = saleIface.encodeFunctionData("initialize", [
    tokenAddress,          // _token
    CIRETA_USDC,           // _paymentToken
    IDENTITY_REGISTRY,     // _identityRegistry
    issuer.address,        // _issuer
    SALE_FACTORY,          // _factory
    FEE_MANAGER,           // _feeManager
    softCap,               // _softCap
    hardCap,               // _hardCap
    feeBps,                // _feeBasisPoints
    ethers.parseUnits("50000", 6), // _feeCapUsdc
    ethers.ZeroAddress,    // _otcToken (none)
    BigInt(saleStartTime), // _saleStartTime
    BigInt(saleEndTime),   // _saleEndTime
    totalTokenSupply,      // _totalTokenSupply
  ]);

  const cliffDuration = 30 * 86400;    // 30 days
  const vestingDuration = 180 * 86400; // 180 days

  const saleTx = await saleFactory.deploySaleVested(
    tokenAddress,
    initData,
    "R5GOLD Fraction",     // fractionName
    "fR5GOLD",             // fractionSymbol
    6,                     // fractionDecimals
    IDENTITY_REGISTRY,
    cliffDuration,
    vestingDuration,
    0, // ExcessPolicy.Keep
    { gasLimit: 10_000_000 },
  );
  const saleReceipt = await saleTx.wait();

  // Parse SaleDeployed event
  const saleDeployedLog = saleReceipt!.logs.find((log: any) => {
    try {
      const parsed = saleFactory.interface.parseLog({ topics: log.topics as string[], data: log.data });
      return parsed?.name === "SaleDeployed";
    } catch { return false; }
  });
  let saleAddress: string;
  if (saleDeployedLog) {
    const parsed = saleFactory.interface.parseLog({ topics: saleDeployedLog.topics as string[], data: saleDeployedLog.data });
    saleAddress = parsed!.args[1]; // second arg is the sale proxy address
  } else {
    throw new Error("SaleDeployed event not found");
  }

  const sale = await ethers.getContractAt("Sale", saleAddress, issuer);
  const vaultAddr = await sale.vault();
  const fractionAddr = await sale.fractionToken();
  console.log(`  Sale:     ${saleAddress}`);
  console.log(`  Vault:    ${vaultAddr}`);
  console.log(`  Fraction: ${fractionAddr}`);
  console.log(`  Version:  ${await sale.version()}`);

  // ════════════════════════════════════════════════════════
  // STEP 5: Add phase (issuer)
  // ════════════════════════════════════════════════════════
  console.log("\n=== Step 5: Add phase ===");
  const phaseStart = now + 60;          // starts in 1 min
  const phaseEnd = now + 30 * 86400;    // 30 days
  const phaseTx = await sale.addPhase(
    "Seed Round",                              // name
    ethers.parseUnits("1", 18),                // pricePerToken = 1 USDC (18 decimals for price)
    ethers.parseUnits("50000", 6),             // allocation = 50k tokens (Fixed)
    ethers.parseUnits("100", 6),               // minContribution = 100 USDC
    ethers.parseUnits("50000", 6),             // maxContribution = 50k USDC
    ethers.parseUnits("1000", 6),              // topUpMin = 1000 USDC
    BigInt(phaseStart),
    BigInt(phaseEnd),
    false,                                     // whitelistOnly
    0,                                         // AllocationMode.Fixed
  );
  await phaseTx.wait();
  console.log(`  Phase added: Seed Round (${new Date(phaseStart * 1000).toISOString()} → ${new Date(phaseEnd * 1000).toISOString()})`);

  // ════════════════════════════════════════════════════════
  // STEP 6: Deposit project tokens into vault (issuer)
  // ════════════════════════════════════════════════════════
  console.log("\n=== Step 6: Deposit project tokens ===");
  const depositAmount = ethers.parseUnits("100000", 6);
  const approveTx = await projectToken.approve(saleAddress, depositAmount);
  await approveTx.wait();
  const depTx = await sale.depositProjectTokens(depositAmount);
  await depTx.wait();
  const vaultBalance = await projectToken.balanceOf(vaultAddr);
  console.log(`  Deposited 100,000 R5GOLD into vault (balance: ${ethers.formatUnits(vaultBalance, 6)})`);

  // ════════════════════════════════════════════════════════
  // STEP 7: Approve sale (admin on-chain)
  // ════════════════════════════════════════════════════════
  console.log("\n=== Step 7: Admin approves sale ===");
  const saleAsAdmin = await ethers.getContractAt("Sale", saleAddress, admin);
  const approveSaleTx = await saleAsAdmin.approveSale();
  await approveSaleTx.wait();
  console.log(`  Sale approved on-chain`);

  // ════════════════════════════════════════════════════════
  // STEP 8: Activate sale (issuer on-chain)
  // ════════════════════════════════════════════════════════
  console.log("\n=== Step 8: Issuer activates sale ===");
  const activateTx = await sale.activate({ gasLimit: 500_000 });
  await activateTx.wait();
  const saleStatus = await sale.status();
  console.log(`  Sale status: ${saleStatus} (1 = Active)`);

  // ════════════════════════════════════════════════════════
  // STEP 9: Mint cUSDC to investor
  // ════════════════════════════════════════════════════════
  console.log("\n=== Step 9: Mint cUSDC to investor ===");
  // CiretaUSDC is a mock — deployer can mint
  const usdc = await ethers.getContractAt("CiretaUSDC", CIRETA_USDC, signer);
  const usdcAmount = ethers.parseUnits("10000", 6); // 10k USDC
  const usdcMintTx = await usdc.mint(investor.address, usdcAmount);
  await usdcMintTx.wait();
  const investorUsdcBal = await usdc.balanceOf(investor.address);
  console.log(`  Investor cUSDC balance: ${ethers.formatUnits(investorUsdcBal, 6)}`);

  // ════════════════════════════════════════════════════════
  // STEP 10: Wait for phase start, then buy
  // ════════════════════════════════════════════════════════
  console.log("\n=== Step 10: Investor buys ===");
  const currentTime = Math.floor(Date.now() / 1000);
  if (currentTime < phaseStart) {
    const waitSec = phaseStart - currentTime + 5;
    console.log(`  Waiting ${waitSec}s for phase to start...`);
    await new Promise((r) => setTimeout(r, waitSec * 1000));
  }

  const buyAmount = ethers.parseUnits("5000", 6); // 5000 USDC
  const saleAsInvestor = await ethers.getContractAt("Sale", saleAddress, investor);
  const usdcAsInvestor = await ethers.getContractAt("CiretaUSDC", CIRETA_USDC, investor);

  // Approve USDC spend
  const usdcApproveTx = await usdcAsInvestor.approve(saleAddress, buyAmount);
  await usdcApproveTx.wait();
  console.log(`  Approved ${ethers.formatUnits(buyAmount, 6)} USDC`);

  // Buy
  const buyTx = await saleAsInvestor.buy(0, buyAmount, { gasLimit: 1_000_000 });
  const buyReceipt = await buyTx.wait();
  console.log(`  Buy tx: ${buyReceipt!.hash}`);

  // Verify on-chain state
  const totalRaised = await sale.totalRaised();
  const totalTokenSold = await sale.totalTokenSold();
  const contribution = await sale.getContribution(investor.address);
  const paymentContrib = await sale.paymentContributed(investor.address);
  console.log(`  Total raised: ${ethers.formatUnits(totalRaised, 6)} USDC`);
  console.log(`  Total tokens sold: ${ethers.formatUnits(totalTokenSold, 6)}`);
  console.log(`  Investor contribution: ${ethers.formatUnits(contribution.amount, 6)} USDC → ${ethers.formatUnits(contribution.tokensAllocated, 6)} tokens`);
  console.log(`  Investor paymentContributed: ${ethers.formatUnits(paymentContrib, 6)} USDC`);

  // Check fraction token balance
  const fraction = await ethers.getContractAt("CiretaFractionToken1155", fractionAddr, investor);
  const fractionBal = await fraction.balanceOf(investor.address, 1); // id 1 = USDC
  console.log(`  Investor fraction balance (id 1): ${ethers.formatUnits(fractionBal, 6)}`);

  // ════════════════════════════════════════════════════════
  // STEP 11: Finalize sale (admin)
  // ════════════════════════════════════════════════════════
  console.log("\n=== Step 11: Finalize sale ===");
  // We raised 5000 > softCap 1000, so this is a success finalization
  const finTx = await saleAsAdmin.finalizeSale({ gasLimit: 1_000_000 });
  await finTx.wait();
  const finalStatus = await sale.status();
  console.log(`  Final status: ${finalStatus} (3 = FinalizedSuccess)`);

  // ════════════════════════════════════════════════════════
  // SUMMARY
  // ════════════════════════════════════════════════════════
  console.log("\n╔══════════════════════════════════════════════════════╗");
  console.log("║     E2E TEST COMPLETE                               ║");
  console.log("╚══════════════════════════════════════════════════════╝");
  console.log(`  Token:       ${tokenAddress}`);
  console.log(`  Sale:        ${saleAddress}`);
  console.log(`  Vault:       ${vaultAddr}`);
  console.log(`  Fraction:    ${fractionAddr}`);
  console.log(`  Status:      ${finalStatus === 3n ? "FinalizedSuccess" : String(finalStatus)}`);
  console.log(`  Raised:      ${ethers.formatUnits(totalRaised, 6)} USDC`);
  console.log(`  Tokens Sold: ${ethers.formatUnits(totalTokenSold, 6)}`);
  console.log(`  Fractions:   ${ethers.formatUnits(fractionBal, 6)} (id 1, vesting)`);
  console.log("");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("E2E FAILED:", error);
    process.exit(1);
  });
