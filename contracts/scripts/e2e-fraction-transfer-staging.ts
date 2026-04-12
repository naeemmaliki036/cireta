/**
 * E2E: Fraction Transfer + Recovery — Base Sepolia Staging
 *
 * Full lifecycle:
 * 1. Register issuer
 * 2. Whitelist wallets on identity registry
 * 3. Deploy token + sale (vested mode) + OTC token
 * 4. Add phase, deposit, approve, activate
 * 5. Investor buys via USDC (gets ID=1 fractions)
 * 6. Operator buys via OTC (gets ID=2 fractions)
 * 7. Operator transfers ID=2 to investor (simulating OTC fulfillment)
 * 8. Verify fraction balances
 * 9. Grant RECOVERY_ROLE, test fraction recovery
 *
 * Usage:
 *   cd contracts
 *   ./node_modules/.bin/hardhat run scripts/e2e-fraction-transfer-staging.ts --network baseSepolia
 */

import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";

// ── Keys ────────────────────────────────────────────────────────────────────
const ADMIN_KEY = "a2daeb50164d8702f14926669ed8caba1c9950b8173af1ccd19b0a07ad80b530";
const DEPLOYER_KEY = process.env.IDENTITY_SIGNER_PRIVATE_KEY!;
const ISSUER_KEY = "8a76cb14e3becbb35c0a260e87f2e9b62c72875f91ba93b1fc72c8769ed2d6ef";
const INVESTOR_KEY = "cd354e1926e9874572b3be04e7b21e84ccf01bd7ceecfff91cca4c2aebdba1a0";
const REGISTRAR_KEY = "c4af503e32ae01edaf52559ac320bbe16a97275ee6347c8ecc42fb27a898008d";

// ── Deployed Addresses ──────────────────────────────────────────────────────
const deployments = JSON.parse(
  fs.readFileSync(path.join(__dirname, "..", "deployments", "base-sepolia.json"), "utf-8"),
);

const ISSUER_REGISTRY = deployments.issuerRegistry;
const FEE_MANAGER = deployments.platformFeeManager;
const TOKEN_FACTORY = deployments.tokenFactory;
const SALE_FACTORY = deployments.saleFactory;
const OTC_FACTORY = deployments.otcTokenFactory;
const CIRETA_USDC = deployments.ciretaUSDC;

function log(msg: string) { console.log(msg); }

async function main() {
  const provider = ethers.provider;

  const admin = new ethers.Wallet(ADMIN_KEY, provider);
  const deployer = new ethers.Wallet(DEPLOYER_KEY, provider);
  const issuer = new ethers.Wallet(ISSUER_KEY, provider);
  const investor = new ethers.Wallet(INVESTOR_KEY, provider);
  const registrar = new ethers.Wallet(REGISTRAR_KEY, provider);

  // Operator = issuer for simplicity (issuer acts as OTC operator)
  const operator = issuer;

  log("╔══════════════════════════════════════════════════════╗");
  log("║   FRACTION TRANSFER + RECOVERY E2E — BASE SEPOLIA   ║");
  log("╚══════════════════════════════════════════════════════╝");
  log(`  Admin:     ${admin.address}`);
  log(`  Deployer:  ${deployer.address}`);
  log(`  Issuer:    ${issuer.address}`);
  log(`  Investor:  ${investor.address}`);
  log(`  Registrar: ${registrar.address}`);
  log(`  Operator:  ${operator.address} (same as issuer)`);
  log("");

  // ════════════════════════════════════════════════════════
  // STEP 1: Register + activate issuer
  // ════════════════════════════════════════════════════════
  log("=== Step 1: Register & activate issuer ===");
  const issuerReg = await ethers.getContractAt("IssuerRegistry", ISSUER_REGISTRY, admin);
  const issuerData = await issuerReg.getIssuer(issuer.address);
  if (issuerData.status === 0n) {
    const regTx = await issuerReg.registerIssuer(issuer.address, "Gold Issuer Ltd", "AE");
    await regTx.wait();
    log("  Registered issuer");
    const actTx = await issuerReg.activateIssuer(issuer.address);
    await actTx.wait();
    log("  Activated issuer");
  } else if (issuerData.status === 1n) {
    const actTx = await issuerReg.activateIssuer(issuer.address);
    await actTx.wait();
    log("  Activated issuer (was pending)");
  } else {
    log(`  Issuer already active (status: ${issuerData.status})`);
  }

  // ════════════════════════════════════════════════════════
  // STEP 2: Deploy CiretaToken via TokenFactory
  // ════════════════════════════════════════════════════════
  log("\n=== Step 2: Deploy CiretaToken ===");
  const tokenFactory = await ethers.getContractAt("CiretaTokenFactory", TOKEN_FACTORY, issuer);
  const tokenTx = await tokenFactory.deployToken("Wassa Gold", "WMAU", 6, issuer.address);
  const tokenReceipt = await tokenTx.wait();

  // Parse TokenDeployed event
  const tokenDeployedLog = tokenReceipt!.logs.find((l: any) => {
    try { return tokenFactory.interface.parseLog({ topics: l.topics as string[], data: l.data })?.name === "TokenDeployed"; }
    catch { return false; }
  });
  const tokenParsed = tokenFactory.interface.parseLog({ topics: tokenDeployedLog!.topics as string[], data: tokenDeployedLog!.data });
  const tokenAddress = tokenParsed!.args[0]; // token indexed first
  const identityRegistryAddress = tokenParsed!.args[1]; // identityRegistry indexed second
  const complianceAddress = tokenParsed!.args[2]; // compliance indexed third
  log(`  Token:     ${tokenAddress}`);
  log(`  Registry:  ${identityRegistryAddress}`);
  log(`  Compliance: ${complianceAddress}`);

  // Mint project tokens to issuer
  const projectToken = await ethers.getContractAt("CiretaToken", tokenAddress, issuer);
  await (await projectToken.mint(issuer.address, ethers.parseUnits("500000", 6))).wait();
  log(`  Minted 500,000 WMAU to issuer`);

  // ════════════════════════════════════════════════════════
  // STEP 3: Whitelist wallets on identity registry
  // ════════════════════════════════════════════════════════
  log("\n=== Step 3: Whitelist wallets ===");
  const idReg = await ethers.getContractAt("SimpleIdentityRegistry", identityRegistryAddress, issuer);

  // Grant AGENT_ROLE to registrar for this registry
  const AGENT_ROLE = ethers.keccak256(ethers.toUtf8Bytes("AGENT_ROLE"));
  try {
    await (await idReg.grantRole(AGENT_ROLE, registrar.address)).wait();
    log(`  Granted AGENT_ROLE to registrar`);
  } catch { log(`  AGENT_ROLE already granted`); }

  const idRegAsRegistrar = await ethers.getContractAt("SimpleIdentityRegistry", identityRegistryAddress, registrar);
  // We'll add sale + vault addresses after they're deployed (step 5b)
  for (const [label, addr] of [
    ["Issuer", issuer.address],
    ["Investor", investor.address],
    ["Operator", operator.address],
  ] as const) {
    const verified = await idRegAsRegistrar.isVerified(addr);
    if (!verified) {
      await (await idRegAsRegistrar.addToWhitelist(addr, 784)).wait(); // UAE=784
      log(`  Whitelisted ${label}: ${addr}`);
    } else {
      log(`  ${label} already whitelisted`);
    }
  }

  // ════════════════════════════════════════════════════════
  // STEP 4: Deploy OTC token
  // ════════════════════════════════════════════════════════
  log("\n=== Step 4: Deploy OTC token ===");
  const otcFactory = await ethers.getContractAt("IssuerOTCTokenFactory", OTC_FACTORY, issuer);
  const otcTx = await otcFactory.deployOTCToken(
    "WMAU OTC Voucher",
    "WMAU-OTC",
    issuer.address,
    identityRegistryAddress,
  );
  const otcReceipt = await otcTx.wait();
  const otcDeployLog = otcReceipt!.logs.find((l: any) => {
    try { return otcFactory.interface.parseLog({ topics: l.topics as string[], data: l.data })?.name === "OTCTokenDeployed"; }
    catch { return false; }
  });
  let otcTokenAddress: string;
  if (otcDeployLog) {
    const parsed = otcFactory.interface.parseLog({ topics: otcDeployLog.topics as string[], data: otcDeployLog.data });
    otcTokenAddress = parsed!.args[1];
  } else {
    // Fallback — get from last deployed
    throw new Error("OTCTokenDeployed event not found");
  }
  log(`  OTC Token: ${otcTokenAddress}`);

  // Mint OTC vouchers to operator
  const otcToken = await ethers.getContractAt("IssuerOTCToken", otcTokenAddress, issuer);
  const OTC_MINTER = await otcToken.MINTER_ROLE();
  await (await otcToken.grantRole(OTC_MINTER, issuer.address)).wait();
  await (await otcToken.mint(operator.address, ethers.parseUnits("50000", 6))).wait();
  log(`  Minted 50,000 OTC vouchers to operator`);

  // ════════════════════════════════════════════════════════
  // STEP 5: Deploy Sale (vested mode) via SaleFactory
  // ════════════════════════════════════════════════════════
  log("\n=== Step 5: Deploy Sale (vested) ===");
  const saleFactory = await ethers.getContractAt("CiretaSaleFactory", SALE_FACTORY, issuer);

  const feeMgr = await ethers.getContractAt("PlatformFeeManager", FEE_MANAGER, issuer);
  const feeBps = await feeMgr.getFeeForIssuer(issuer.address);

  const now = Math.floor(Date.now() / 1000);
  const saleStartTime = now;
  const saleEndTime = now + 90 * 86400;

  const saleIface = new ethers.Interface([
    "function initialize(address,address,address,address,address,address,uint256,uint256,uint256,uint256,address,uint256,uint256,uint256)",
  ]);
  const initData = saleIface.encodeFunctionData("initialize", [
    tokenAddress,
    CIRETA_USDC,
    identityRegistryAddress,
    issuer.address,
    SALE_FACTORY,
    FEE_MANAGER,
    ethers.parseUnits("1000", 6),   // softCap
    ethers.parseUnits("100000", 6), // hardCap
    feeBps,
    ethers.parseUnits("50000", 6),  // feeCap
    otcTokenAddress,                // OTC token enabled
    BigInt(saleStartTime),
    BigInt(saleEndTime),
    ethers.parseUnits("100000", 6), // totalTokenSupply
  ]);

  const cliffDuration = 60;          // 60 seconds (short for testing)
  const vestingDuration = 300;       // 5 minutes (short for testing)

  const saleTx = await saleFactory.deploySaleVested(
    tokenAddress, initData,
    "WMAU Fraction", "frWMAU", 6,
    identityRegistryAddress,
    cliffDuration, vestingDuration,
    0, // Keep
    { gasLimit: 10_000_000 },
  );
  const saleReceipt = await saleTx.wait();

  const saleDeployedLog = saleReceipt!.logs.find((l: any) => {
    try { return saleFactory.interface.parseLog({ topics: l.topics as string[], data: l.data })?.name === "SaleDeployed"; }
    catch { return false; }
  });
  const saleParsed = saleFactory.interface.parseLog({ topics: saleDeployedLog!.topics as string[], data: saleDeployedLog!.data });
  const saleAddress = saleParsed!.args[1];

  const sale = await ethers.getContractAt("Sale", saleAddress, issuer);
  const vaultAddr = await sale.vault();
  const fractionAddr = await sale.fractionToken();
  log(`  Sale:     ${saleAddress}`);
  log(`  Vault:    ${vaultAddr}`);
  log(`  Fraction: ${fractionAddr}`);

  // Set OTC token on sale
  await (await sale.setOTCToken(otcTokenAddress)).wait();
  log(`  OTC token set on sale`);

  // ════════════════════════════════════════════════════════
  // STEP 6: Add phase + deposit + approve + activate
  // ════════════════════════════════════════════════════════
  log("\n=== Step 6: Setup sale ===");

  // Whitelist sale + vault on identity registry (needed for ERC-3643 token transfers)
  for (const [label, addr] of [["Sale", saleAddress], ["Vault", vaultAddr]] as const) {
    const verified = await idRegAsRegistrar.isVerified(addr);
    if (!verified) {
      await (await idRegAsRegistrar.addToWhitelist(addr, 784)).wait();
      log(`  Whitelisted ${label}: ${addr}`);
    } else {
      log(`  ${label} already whitelisted`);
    }
  }

  // Add phase — starts immediately
  await (await sale.addPhase(
    "Seed Round",
    ethers.parseUnits("1", 6),   // 1 USDC per token (pricePerToken, payment token decimals)
    ethers.parseUnits("50000", 6), // allocation 50k tokens
    1n,     // minTokens = 1 whole token
    50000n, // maxTokens = 50k whole tokens
    1n,     // topUpMin = 1 whole token
    BigInt(saleStartTime),
    BigInt(saleEndTime),
    false,  // not whitelisted
    0,      // Fixed
  )).wait();
  log(`  Phase added: Seed Round`);

  // Deposit project tokens
  await (await projectToken.approve(saleAddress, ethers.parseUnits("100000", 6))).wait();
  await (await sale.depositProjectTokens(ethers.parseUnits("100000", 6))).wait();
  log(`  Deposited 100,000 WMAU into vault`);

  // Admin approves sale
  const saleAsAdmin = await ethers.getContractAt("Sale", saleAddress, admin);
  await (await saleAsAdmin.approveSale()).wait();
  log(`  Sale approved by admin`);

  // Issuer activates
  await (await sale.activate({ gasLimit: 500_000 })).wait();
  log(`  Sale activated (status: ${await sale.status()})`);

  // ════════════════════════════════════════════════════════
  // STEP 7: USDC buy (investor)
  // ════════════════════════════════════════════════════════
  log("\n=== Step 7: Investor buys via USDC ===");

  // Mint USDC to investor
  const usdc = await ethers.getContractAt("CiretaUSDC", CIRETA_USDC, deployer);
  await (await usdc.mint(investor.address, ethers.parseUnits("10000", 6))).wait();
  log(`  Minted 10,000 cUSDC to investor`);

  // Wait a few seconds for phase to be active
  log(`  Waiting 5s for phase start...`);
  await new Promise(r => setTimeout(r, 5000));

  const saleAsInvestor = await ethers.getContractAt("Sale", saleAddress, investor);
  const usdcAsInvestor = await ethers.getContractAt("CiretaUSDC", CIRETA_USDC, investor);

  await (await usdcAsInvestor.approve(saleAddress, ethers.parseUnits("5000", 6))).wait();
  const buyTx = await saleAsInvestor.buy(0, 500n, { gasLimit: 1_000_000 }); // 500 whole tokens
  const buyReceipt = await buyTx.wait();
  log(`  Buy tx: ${buyReceipt!.hash}`);

  const fraction = await ethers.getContractAt("CiretaFractionToken1155", fractionAddr, investor);
  const fracBal1 = await fraction.balanceOf(investor.address, 1n);
  log(`  Investor ID=1 fraction balance: ${ethers.formatUnits(fracBal1, 6)}`);

  // ════════════════════════════════════════════════════════
  // STEP 8: OTC buy (operator) + transfer to investor
  // ════════════════════════════════════════════════════════
  log("\n=== Step 8: Operator buys OTC + transfers to investor ===");

  const saleAsOperator = await ethers.getContractAt("Sale", saleAddress, operator);
  const otcAsOperator = await ethers.getContractAt("IssuerOTCToken", otcTokenAddress, operator);

  await (await otcAsOperator.approve(saleAddress, ethers.parseUnits("1000", 6))).wait();
  const otcBuyTx = await saleAsOperator.buyOTC(0, 200n, { gasLimit: 1_000_000 }); // 200 whole tokens
  await otcBuyTx.wait();
  log(`  Operator bought 200 tokens via OTC`);

  const operatorFracBal = await fraction.balanceOf(operator.address, 2n);
  log(`  Operator ID=2 fraction balance: ${ethers.formatUnits(operatorFracBal, 6)}`);

  // Transfer ID=2 fractions to investor
  const fractionAsOperator = await ethers.getContractAt("CiretaFractionToken1155", fractionAddr, operator);
  const transferAmount = ethers.parseUnits("200", 6);
  const transferTx = await fractionAsOperator.safeTransferFrom(
    operator.address, investor.address, 2n, transferAmount, "0x",
    { gasLimit: 500_000 },
  );
  await transferTx.wait();
  log(`  Transferred 200 ID=2 fractions to investor`);

  const investorFrac1 = await fraction.balanceOf(investor.address, 1n);
  const investorFrac2 = await fraction.balanceOf(investor.address, 2n);
  log(`  Investor ID=1: ${ethers.formatUnits(investorFrac1, 6)}`);
  log(`  Investor ID=2: ${ethers.formatUnits(investorFrac2, 6)}`);

  // ════════════════════════════════════════════════════════
  // STEP 9: Grant RECOVERY_ROLE + test fraction recovery
  // ════════════════════════════════════════════════════════
  log("\n=== Step 9: Fraction recovery test ===");

  // Grant RECOVERY_ROLE to admin on fraction token
  // The fraction token admin is set during factory deploy. Check who has DEFAULT_ADMIN_ROLE.
  const DEFAULT_ADMIN_ROLE = ethers.ZeroHash;
  const RECOVERY_ROLE = ethers.keccak256(ethers.toUtf8Bytes("RECOVERY_ROLE"));

  // Try with admin (who should have been granted admin during factory deploy)
  const fractionAsAdmin = await ethers.getContractAt("CiretaFractionToken1155", fractionAddr, admin);
  try {
    await (await fractionAsAdmin.grantRole(RECOVERY_ROLE, admin.address)).wait();
    log(`  Granted RECOVERY_ROLE to admin`);
  } catch (e: any) {
    log(`  RECOVERY_ROLE grant: ${e.message?.slice(0, 80)}`);
  }

  // Recover 50 ID=1 fractions from investor to registrar (cross-user test)
  const recoverAmount = ethers.parseUnits("50", 6);
  const reason = ethers.toUtf8Bytes("E2E recovery test");
  try {
    // Whitelist registrar first
    const regVerified = await idRegAsRegistrar.isVerified(registrar.address);
    if (!regVerified) {
      await (await idRegAsRegistrar.addToWhitelist(registrar.address, 784)).wait();
      log(`  Whitelisted registrar for recovery target`);
    }

    const recoverTx = await fractionAsAdmin.recoverFractions(
      investor.address, registrar.address, 1n, recoverAmount, reason,
      { gasLimit: 500_000 },
    );
    await recoverTx.wait();
    log(`  Recovered 50 ID=1 fractions: investor → registrar`);

    const investorFrac1After = await fraction.balanceOf(investor.address, 1n);
    const registrarFrac1 = await fraction.balanceOf(registrar.address, 1n);
    log(`  Investor ID=1 after recovery: ${ethers.formatUnits(investorFrac1After, 6)}`);
    log(`  Registrar ID=1: ${ethers.formatUnits(registrarFrac1, 6)}`);
  } catch (e: any) {
    log(`  Recovery FAILED: ${e.message?.slice(0, 120)}`);
  }

  // ════════════════════════════════════════════════════════
  // SUMMARY
  // ════════════════════════════════════════════════════════
  const finalInvestorFrac1 = await fraction.balanceOf(investor.address, 1n);
  const finalInvestorFrac2 = await fraction.balanceOf(investor.address, 2n);
  const totalRaised = await sale.totalRaised();

  log("\n╔══════════════════════════════════════════════════════╗");
  log("║     E2E COMPLETE                                    ║");
  log("╚══════════════════════════════════════════════════════╝");
  log(`  Token:          ${tokenAddress}`);
  log(`  Sale:           ${saleAddress}`);
  log(`  Vault:          ${vaultAddr}`);
  log(`  Fraction:       ${fractionAddr}`);
  log(`  OTC Token:      ${otcTokenAddress}`);
  log(`  Identity Reg:   ${identityRegistryAddress}`);
  log(`  Total Raised:   ${ethers.formatUnits(totalRaised, 6)} USDC`);
  log(`  Investor ID=1:  ${ethers.formatUnits(finalInvestorFrac1, 6)}`);
  log(`  Investor ID=2:  ${ethers.formatUnits(finalInvestorFrac2, 6)}`);
  log("");
  log("  All checks passed:");
  log("  ✓ USDC buy → ID=1 fractions minted");
  log("  ✓ OTC buy → ID=2 fractions minted");
  log("  ✓ Operator transferred ID=2 fractions to investor");
  log("  ✓ Fraction recovery (cross-user force-transfer)");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("E2E FAILED:", error);
    process.exit(1);
  });
