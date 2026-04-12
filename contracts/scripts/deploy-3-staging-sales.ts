/**
 * Deploy 3 staging sales:
 *
 * 1. Wassa Gold (WMAU) — LIVE with Seed (private, whitelist) phase active
 * 2. Cireta Real Estate Fund (CREF) — UPCOMING, deployed on chain, one phase starting in 7 days
 * 3. Copper Futures Token (CFUT) — COMING SOON, no on-chain deployment (DB only via API)
 *
 * Usage:
 *   cd contracts
 *   ./node_modules/.bin/hardhat run scripts/deploy-3-staging-sales.ts --network baseSepolia
 */

import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";

const ADMIN_KEY = "a2daeb50164d8702f14926669ed8caba1c9950b8173af1ccd19b0a07ad80b530";
const DEPLOYER_KEY = process.env.IDENTITY_SIGNER_PRIVATE_KEY!;
const ISSUER_KEY = "8a76cb14e3becbb35c0a260e87f2e9b62c72875f91ba93b1fc72c8769ed2d6ef";
const INVESTOR_KEY = "cd354e1926e9874572b3be04e7b21e84ccf01bd7ceecfff91cca4c2aebdba1a0";
const REGISTRAR_KEY = "c4af503e32ae01edaf52559ac320bbe16a97275ee6347c8ecc42fb27a898008d";

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

async function ensureIssuerActive(admin: any, issuerAddr: string) {
  const reg = await ethers.getContractAt("IssuerRegistry", ISSUER_REGISTRY, admin);
  const data = await reg.getIssuer(issuerAddr);
  if (data.status === 0n) {
    await (await reg.registerIssuer(issuerAddr, "Gold & Commodities Ltd", "AE")).wait();
    await (await reg.activateIssuer(issuerAddr)).wait();
    log("  Registered + activated issuer");
  } else if (data.status === 1n) {
    await (await reg.activateIssuer(issuerAddr)).wait();
    log("  Activated issuer");
  } else {
    log("  Issuer already active");
  }
}

async function deployToken(issuer: any, name: string, symbol: string) {
  const factory = await ethers.getContractAt("CiretaTokenFactory", TOKEN_FACTORY, issuer);
  const tx = await factory.deployToken(name, symbol, 6, issuer.address);
  const receipt = await tx.wait();
  const eventLog = receipt!.logs.find((l: any) => {
    try { return factory.interface.parseLog({ topics: l.topics as string[], data: l.data })?.name === "TokenDeployed"; }
    catch { return false; }
  });
  const parsed = factory.interface.parseLog({ topics: eventLog!.topics as string[], data: eventLog!.data });
  return { tokenAddress: parsed!.args[0], registryAddress: parsed!.args[1], complianceAddress: parsed!.args[2] };
}

async function whitelistAddresses(registrar: any, issuer: any, registryAddress: string, addresses: [string, string][]) {
  const AGENT_ROLE = ethers.keccak256(ethers.toUtf8Bytes("AGENT_ROLE"));
  const reg = await ethers.getContractAt("SimpleIdentityRegistry", registryAddress, issuer);
  try { await (await reg.grantRole(AGENT_ROLE, registrar.address)).wait(); } catch { /* already granted */ }
  const regAsRegistrar = await ethers.getContractAt("SimpleIdentityRegistry", registryAddress, registrar);
  for (const [label, addr] of addresses) {
    const verified = await regAsRegistrar.isVerified(addr);
    if (!verified) {
      await (await regAsRegistrar.addToWhitelist(addr, 784)).wait();
      log(`  Whitelisted ${label}: ${addr.slice(0, 10)}...`);
    }
  }
}

async function deploySaleVested(
  issuer: any,
  tokenAddress: string,
  registryAddress: string,
  otcTokenAddr: string,
  cliffDays: number,
  vestingDays: number,
) {
  const factory = await ethers.getContractAt("CiretaSaleFactory", SALE_FACTORY, issuer);
  const feeMgr = await ethers.getContractAt("PlatformFeeManager", FEE_MANAGER, issuer);
  const feeBps = await feeMgr.getFeeForIssuer(issuer.address);

  const now = Math.floor(Date.now() / 1000);
  const saleIface = new ethers.Interface([
    "function initialize(address,address,address,address,address,address,uint256,uint256,uint256,uint256,address,uint256,uint256,uint256)",
  ]);
  const initData = saleIface.encodeFunctionData("initialize", [
    tokenAddress, CIRETA_USDC, registryAddress, issuer.address,
    SALE_FACTORY, FEE_MANAGER,
    ethers.parseUnits("5000", 6),    // softCap 5k USDC
    ethers.parseUnits("500000", 6),  // hardCap 500k USDC
    feeBps,
    ethers.parseUnits("50000", 6),   // feeCap
    otcTokenAddr,
    BigInt(now),                     // saleStart = now
    BigInt(now + 180 * 86400),       // saleEnd = 180 days
    ethers.parseUnits("500000", 6),  // totalTokenSupply 500k tokens
  ]);

  const tokenContract = await ethers.getContractAt("CiretaToken", tokenAddress, issuer);
  const sym = await tokenContract.symbol();
  const tx = await factory.deploySaleVested(
    tokenAddress, initData,
    `fr${sym}`,
    `fr${sym}`,
    6, registryAddress,
    cliffDays * 86400,
    vestingDays * 86400,
    0, // ExcessPolicy.Keep
    { gasLimit: 10_000_000 },
  );
  const receipt = await tx.wait();
  const eventLog = receipt!.logs.find((l: any) => {
    try { return factory.interface.parseLog({ topics: l.topics as string[], data: l.data })?.name === "SaleDeployed"; }
    catch { return false; }
  });
  const parsed = factory.interface.parseLog({ topics: eventLog!.topics as string[], data: eventLog!.data });
  const saleAddress = parsed!.args[1];
  const sale = await ethers.getContractAt("Sale", saleAddress, issuer);
  return {
    saleAddress,
    vaultAddress: await sale.vault(),
    fractionAddress: await sale.fractionToken(),
    sale,
  };
}

async function main() {
  const provider = ethers.provider;
  const admin = new ethers.Wallet(ADMIN_KEY, provider);
  const deployer = new ethers.Wallet(DEPLOYER_KEY, provider);
  const issuer = new ethers.Wallet(ISSUER_KEY, provider);
  const investor = new ethers.Wallet(INVESTOR_KEY, provider);
  const registrar = new ethers.Wallet(REGISTRAR_KEY, provider);

  log("╔══════════════════════════════════════════════════════╗");
  log("║   DEPLOY 3 STAGING SALES — BASE SEPOLIA             ║");
  log("╚══════════════════════════════════════════════════════╝\n");

  // ── Ensure issuer is active ──
  await ensureIssuerActive(admin, issuer.address);

  // ════════════════════════════════════════════════════════════
  // SALE 1: Wassa Gold (WMAU) — LIVE with Seed phase
  // ════════════════════════════════════════════════════════════
  log("\n══════════════════════════════════════════════════");
  log("  SALE 1: Wassa Gold Token (WMAU) — LIVE");
  log("══════════════════════════════════════════════════");

  // Deploy token
  const wmau = await deployToken(issuer, "Wassa Gold Token", "WMAU");
  log(`  Token:    ${wmau.tokenAddress}`);
  log(`  Registry: ${wmau.registryAddress}`);

  // Mint supply
  const projectToken1 = await ethers.getContractAt("CiretaToken", wmau.tokenAddress, issuer);
  await (await projectToken1.mint(issuer.address, ethers.parseUnits("500000", 6))).wait();
  log("  Minted 500,000 WMAU");

  // Whitelist issuer on registry BEFORE deploying sale (Sale.initialize checks IssuerNotVerified)
  await whitelistAddresses(registrar, issuer, wmau.registryAddress, [
    ["Issuer", issuer.address],
  ]);

  // Deploy OTC token
  const otcFactory = await ethers.getContractAt("IssuerOTCTokenFactory", OTC_FACTORY, issuer);
  const otcTx = await otcFactory.deployOTCToken("WMAU OTC Voucher", "WMAU-OTC", issuer.address, wmau.registryAddress);
  const otcReceipt = await otcTx.wait();
  const otcLog = otcReceipt!.logs.find((l: any) => {
    try { return otcFactory.interface.parseLog({ topics: l.topics as string[], data: l.data })?.name === "OTCTokenDeployed"; }
    catch { return false; }
  });
  const otcAddr1 = otcFactory.interface.parseLog({ topics: otcLog!.topics as string[], data: otcLog!.data })!.args[1];
  log(`  OTC Token: ${otcAddr1}`);

  // Deploy sale (vested: 30 day cliff, 365 day vesting)
  const sale1 = await deploySaleVested(issuer, wmau.tokenAddress, wmau.registryAddress, otcAddr1, 30, 365);
  log(`  Sale:     ${sale1.saleAddress}`);
  log(`  Vault:    ${sale1.vaultAddress}`);
  log(`  Fraction: ${sale1.fractionAddress}`);

  // Set OTC token
  await (await sale1.sale.setOTCToken(otcAddr1)).wait();

  // Whitelist wallets
  await whitelistAddresses(registrar, issuer, wmau.registryAddress, [
    ["Investor", investor.address],
    ["Sale", sale1.saleAddress],
    ["Vault", sale1.vaultAddress],
  ]);

  // Deposit project tokens
  await (await projectToken1.approve(sale1.saleAddress, ethers.parseUnits("500000", 6))).wait();
  await (await sale1.sale.depositProjectTokens(ethers.parseUnits("500000", 6))).wait();
  log("  Deposited 500,000 WMAU into vault");

  // Add Seed Phase (private, whitelist-only) — starts in 2 min, 30 days
  const now = Math.floor(Date.now() / 1000);
  const seedStart = now + 120; // 2 min from now so we can set whitelist
  await (await sale1.sale.addPhase(
    "Seed Round",
    ethers.parseUnits("1", 6),       // 1 USDC per token
    ethers.parseUnits("100000", 6),  // 100k allocation
    10n,    // minTokens
    50000n, // maxTokens
    5n,     // topUpMin
    BigInt(seedStart),
    BigInt(seedStart + 30 * 86400),
    true,   // whitelistOnly
    0,      // Fixed
  )).wait();
  log("  Phase added: Seed Round (private, whitelist-only, 30 days)");

  // Whitelist investor + issuer(operator) BEFORE phase starts
  await (await sale1.sale.setWhitelist(0, [investor.address, issuer.address], true)).wait();
  log("  Investor + Issuer whitelisted for Seed phase");

  // Approve + activate
  const sale1Admin = await ethers.getContractAt("Sale", sale1.saleAddress, admin);
  await (await sale1Admin.approveSale()).wait();
  await (await sale1.sale.activate({ gasLimit: 500_000 })).wait();
  log(`  Sale ACTIVATED (status: ${await sale1.sale.status()})`);

  // Do a test buy from investor — wait for phase start
  const usdc = await ethers.getContractAt("CiretaUSDC", CIRETA_USDC, deployer);
  await (await usdc.mint(investor.address, ethers.parseUnits("50000", 6))).wait();
  log("  Minted 50,000 cUSDC to investor");

  const waitSec = seedStart - Math.floor(Date.now() / 1000) + 5;
  log(`  Waiting ${waitSec}s for Seed phase to start...`);
  await new Promise(r => setTimeout(r, waitSec * 1000));

  const sale1Investor = await ethers.getContractAt("Sale", sale1.saleAddress, investor);
  const usdcInvestor = await ethers.getContractAt("CiretaUSDC", CIRETA_USDC, investor);
  await (await usdcInvestor.approve(sale1.saleAddress, ethers.parseUnits("5000", 6))).wait();
  const buyTx = await sale1Investor.buy(0, 1000n, { gasLimit: 1_000_000 });
  await buyTx.wait();
  log(`  Investor bought 1,000 WMAU via USDC ✓`);

  const fraction1 = await ethers.getContractAt("CiretaFractionToken1155", sale1.fractionAddress, investor);
  const bal1 = await fraction1.balanceOf(investor.address, 1n);
  log(`  Investor fraction balance (ID=1): ${ethers.formatUnits(bal1, 6)}`);

  // Mint OTC vouchers and do OTC buy
  const otcToken1 = await ethers.getContractAt("IssuerOTCToken", otcAddr1, issuer);
  await (await otcToken1.grantRole(await otcToken1.MINTER_ROLE(), issuer.address)).wait();
  await (await otcToken1.mint(issuer.address, ethers.parseUnits("10000", 6))).wait();
  await (await otcToken1.approve(sale1.saleAddress, ethers.parseUnits("5000", 6))).wait();
  const otcBuyTx = await sale1.sale.buyOTC(0, 500n, { gasLimit: 1_000_000 });
  await otcBuyTx.wait();
  log(`  Issuer (as operator) bought 500 WMAU via OTC ✓`);

  // Transfer OTC fractions to investor
  const fraction1Issuer = await ethers.getContractAt("CiretaFractionToken1155", sale1.fractionAddress, issuer);
  await (await fraction1Issuer.safeTransferFrom(
    issuer.address, investor.address, 2n, ethers.parseUnits("500", 6), "0x", { gasLimit: 500_000 },
  )).wait();
  log(`  Transferred 500 ID=2 fractions to investor ✓`);

  const totalRaised1 = await sale1.sale.totalRaised();
  const remaining1 = await sale1.sale.getRemainingSupply();
  log(`  Total raised: ${ethers.formatUnits(totalRaised1, 6)} USDC`);
  log(`  Remaining supply: ${ethers.formatUnits(remaining1, 6)} tokens`);

  // ════════════════════════════════════════════════════════════
  // SALE 2: Cireta Real Estate Fund (CREF) — UPCOMING
  // ════════════════════════════════════════════════════════════
  log("\n══════════════════════════════════════════════════");
  log("  SALE 2: Cireta Real Estate Fund (CREF) — UPCOMING");
  log("══════════════════════════════════════════════════");

  const cref = await deployToken(issuer, "Cireta Real Estate Fund", "CREF");
  log(`  Token:    ${cref.tokenAddress}`);
  log(`  Registry: ${cref.registryAddress}`);

  const projectToken2 = await ethers.getContractAt("CiretaToken", cref.tokenAddress, issuer);
  await (await projectToken2.mint(issuer.address, ethers.parseUnits("500000", 6))).wait();
  log("  Minted 500,000 CREF");

  // Whitelist issuer BEFORE deploying sale
  await whitelistAddresses(registrar, issuer, cref.registryAddress, [
    ["Issuer", issuer.address],
  ]);

  const sale2 = await deploySaleVested(issuer, cref.tokenAddress, cref.registryAddress, ethers.ZeroAddress, 60, 730);
  log(`  Sale:     ${sale2.saleAddress}`);
  log(`  Vault:    ${sale2.vaultAddress}`);
  log(`  Fraction: ${sale2.fractionAddress}`);

  // Whitelist sale + vault
  await whitelistAddresses(registrar, issuer, cref.registryAddress, [
    ["Issuer", issuer.address],
    ["Sale", sale2.saleAddress],
    ["Vault", sale2.vaultAddress],
  ]);

  // Deposit tokens
  await (await projectToken2.approve(sale2.saleAddress, ethers.parseUnits("500000", 6))).wait();
  await (await sale2.sale.depositProjectTokens(ethers.parseUnits("500000", 6))).wait();
  log("  Deposited 500,000 CREF into vault");

  // Add one phase starting in 7 days
  const phase2Start = now + 7 * 86400;
  const phase2End = now + 60 * 86400;
  await (await sale2.sale.addPhase(
    "Private Sale",
    ethers.parseUnits("2", 6),       // 2 USDC per token
    ethers.parseUnits("250000", 6),  // 250k allocation
    100n,    // minTokens
    100000n, // maxTokens
    50n,     // topUpMin
    BigInt(phase2Start),
    BigInt(phase2End),
    false,   // not whitelisted
    0,       // Fixed
  )).wait();
  log(`  Phase added: Private Sale (starts in 7 days, 53-day window)`);

  // Approve + activate (sale is upcoming — active status but phase not started)
  const sale2Admin = await ethers.getContractAt("Sale", sale2.saleAddress, admin);
  await (await sale2Admin.approveSale()).wait();
  await (await sale2.sale.activate({ gasLimit: 500_000 })).wait();
  log(`  Sale ACTIVATED (status: ${await sale2.sale.status()}) — phase starts in 7 days`);

  // ════════════════════════════════════════════════════════════
  // SALE 3: Copper Futures (CFUT) — COMING SOON (no on-chain)
  // ════════════════════════════════════════════════════════════
  log("\n══════════════════════════════════════════════════");
  log("  SALE 3: Copper Futures Token (CFUT) — COMING SOON");
  log("══════════════════════════════════════════════════");
  log("  No on-chain deployment — this is a DB-only 'coming soon' sale.");
  log("  Create via admin UI or API: POST /api/v1/sales with is_coming_soon=true");
  log("  Title: 'Copper Futures Token'");
  log("  Description: 'Tokenized copper futures — physical delivery backed.'");

  // ════════════════════════════════════════════════════════════
  // SUMMARY
  // ════════════════════════════════════════════════════════════
  log("\n╔══════════════════════════════════════════════════════╗");
  log("║     3 STAGING SALES DEPLOYED                        ║");
  log("╚══════════════════════════════════════════════════════╝");
  log("");
  log("  SALE 1: Wassa Gold Token (WMAU) — LIVE");
  log(`    Token:     ${wmau.tokenAddress}`);
  log(`    Registry:  ${wmau.registryAddress}`);
  log(`    Sale:      ${sale1.saleAddress}`);
  log(`    Vault:     ${sale1.vaultAddress}`);
  log(`    Fraction:  ${sale1.fractionAddress}`);
  log(`    OTC Token: ${otcAddr1}`);
  log(`    Status:    Active, Seed phase live`);
  log(`    Raised:    ${ethers.formatUnits(totalRaised1, 6)} USDC`);
  log(`    Remaining: ${ethers.formatUnits(remaining1, 6)} tokens`);
  log("");
  log("  SALE 2: Cireta Real Estate Fund (CREF) — UPCOMING");
  log(`    Token:     ${cref.tokenAddress}`);
  log(`    Registry:  ${cref.registryAddress}`);
  log(`    Sale:      ${sale2.saleAddress}`);
  log(`    Vault:     ${sale2.vaultAddress}`);
  log(`    Fraction:  ${sale2.fractionAddress}`);
  log(`    Status:    Active, phase starts in 7 days`);
  log("");
  log("  SALE 3: Copper Futures Token (CFUT) — COMING SOON");
  log("    No on-chain deployment. Create via admin UI.");
  log("");

  // Save all addresses
  const result = {
    sale1_wmau: {
      token: wmau.tokenAddress,
      registry: wmau.registryAddress,
      sale: sale1.saleAddress,
      vault: sale1.vaultAddress,
      fraction: sale1.fractionAddress,
      otcToken: otcAddr1,
    },
    sale2_cref: {
      token: cref.tokenAddress,
      registry: cref.registryAddress,
      sale: sale2.saleAddress,
      vault: sale2.vaultAddress,
      fraction: sale2.fractionAddress,
    },
  };
  fs.writeFileSync(
    path.join(__dirname, "..", "deployments", "staging-sales.json"),
    JSON.stringify(result, null, 2) + "\n",
  );
  log("  Saved to deployments/staging-sales.json");
}

main().then(() => process.exit(0)).catch(e => { console.error("FAILED:", e); process.exit(1); });
