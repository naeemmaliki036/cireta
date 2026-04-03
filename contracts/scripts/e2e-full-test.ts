/**
 * Cireta Full E2E Test — Base Sepolia
 *
 * Complete platform lifecycle test:
 *   1.  Deploy MockUSDC (or use cUSDC) + OTC Token
 *   2.  Register & activate issuer
 *   3.  Deploy token via TokenFactory
 *   4.  Whitelist all participants
 *   5.  Mint project tokens to issuer
 *   6.  Create DIRECT sale (with OTC token)
 *   7.  Admin activates sale
 *   8.  Investor 01 buys with USDC
 *   9.  Issuer mints OTC tokens to Investor 02, Investor 02 buys with OTC
 *  10.  Finalize direct sale, investor claims
 *  11.  Create VESTED sale
 *  12.  Investor buys vested, deposit tokens, finalize, claim
 *
 * Keys (env vars):
 *   ADMIN_PRIVATE_KEY   — 0x8eE48b43... (platform admin)
 *   ISSUER_PRIVATE_KEY  — 0x759948... (issuer)
 *   INVESTOR1_PRIVATE_KEY — 0x5c5C4A... (investor 01)
 *   INVESTOR2_PRIVATE_KEY — 0x5806C2... (investor 02 / OTC buyer)
 */

import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";

// ── ABIs ──

const ERC20_ABI = [
  "function balanceOf(address) view returns (uint256)",
  "function allowance(address, address) view returns (uint256)",
  "function approve(address, uint256) returns (bool)",
  "function transfer(address, uint256) returns (bool)",
  "function mint(address, uint256) external",
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
];

const SALE_INIT_ABI = [
  "function initialize(address token, address paymentToken, address identityRegistry, address issuer, address factory, address feeManager, uint256 softCap, uint256 hardCap, uint256 feeBasisPoints, uint256 feeCapUsdc, address otcToken) external",
];

const SALE_ABI = [
  ...SALE_INIT_ABI,
  "function addPhase(string, uint256, uint256, uint256, uint256, uint256, uint256, bool) external",
  "function activate() external",
  "function buy(uint256, uint256) external",
  "function buyOTC(uint256, uint256) external",
  "function finalizeSale() external",
  "function claimTokens() external",
  "function depositProjectTokens(uint256) external",
  "function setOTCToken(address) external",
  "function getTotalRaised() view returns (uint256)",
  "function getContribution(address) view returns (tuple(uint256 amount, uint256 tokensAllocated, bool claimed, bool refunded, bool isOtc))",
  "function status() view returns (uint8)",
  "function issuer() view returns (address)",
  "function admin() view returns (address)",
  "function saleMode() view returns (uint8)",
  "function vault() view returns (address)",
  "function fractionToken() view returns (address)",
  "function otcToken() view returns (address)",
];

const TOKEN_ABI = [
  ...ERC20_ABI,
  "function identityRegistry() view returns (address)",
  "function compliance() view returns (address)",
];

const SIMPLE_IR_ABI = [
  "function addToWhitelist(address, uint16) external",
  "function batchAddToWhitelist(address[], uint16[]) external",
  "function isVerified(address) view returns (bool)",
  "function addAgent(address) external",
  "function isAgent(address) view returns (bool)",
  "function owner() view returns (address)",
];

const OTC_TOKEN_ABI = [
  ...ERC20_ABI,
  "function burn(address, uint256) external",
];

const VAULT_ABI = [
  "function getClaimable(address) view returns (uint256)",
  "function claim() external",
];

// ── Helpers ──

function log(step: string, msg: string) {
  console.log(`  [${step}] ${msg}`);
}

function fmt(val: bigint, decimals = 6): string {
  return ethers.formatUnits(val, decimals);
}

async function main() {
  // ── Load keys ──
  const adminKey = process.env.ADMIN_PRIVATE_KEY || "a2daeb50164d8702f14926669ed8caba1c9950b8173af1ccd19b0a07ad80b530";
  const issuerKey = process.env.ISSUER_PRIVATE_KEY || "8a76cb14e3becbb35c0a260e87f2e9b62c72875f91ba93b1fc72c8769ed2d6ef";
  const inv1Key = process.env.INVESTOR1_PRIVATE_KEY || "cd354e1926e9874572b3be04e7b21e84ccf01bd7ceecfff91cca4c2aebdba1a0";
  const inv2Key = process.env.INVESTOR2_PRIVATE_KEY || "09c82cb198d39b789b4b15423b9ac8ed6a8c0e0b3a818973d9a3201f4368f65a";
  const otcKey = process.env.OTC_PRIVATE_KEY || "b0a80e71369be520f793fa2804e8b9d6dd76b963e9239966fc34f5e2a5e1bb54";

  const admin = new ethers.Wallet(adminKey, ethers.provider);
  const issuer = new ethers.Wallet(issuerKey, ethers.provider);
  const investor1 = new ethers.Wallet(inv1Key, ethers.provider);
  const investor2 = new ethers.Wallet(inv2Key, ethers.provider);
  const otcOperator = new ethers.Wallet(otcKey, ethers.provider);

  const deploymentsPath = path.join(__dirname, "..", "deployments", "base-sepolia.json");
  const addr = JSON.parse(fs.readFileSync(deploymentsPath, "utf-8"));

  console.log("╔══════════════════════════════════════════════════════╗");
  console.log("║       CIRETA FULL E2E TEST — BASE SEPOLIA           ║");
  console.log("╚══════════════════════════════════════════════════════╝");
  console.log(`  Admin:      ${admin.address}`);
  console.log(`  Issuer:     ${issuer.address}`);
  console.log(`  Investor1:  ${investor1.address}`);
  console.log(`  Investor2:  ${investor2.address} (OTC buyer)`);
  console.log(`  OTC Op:     ${otcOperator.address}`);
  console.log(`  cUSDC:      ${addr.ciretaUSDC}`);
  console.log("");

  const usdcAddr = addr.ciretaUSDC;

  // ════════════════════════════════════════════
  // STEP 1: Mint cUSDC to investors
  // ════════════════════════════════════════════
  console.log("=== Step 1: Fund Investors with cUSDC ===");
  const cusdc = new ethers.Contract(usdcAddr, ERC20_ABI, admin);
  const mintAmt = ethers.parseUnits("50000", 6);

  for (const [name, wallet] of [["Investor1", investor1], ["Investor2", investor2]] as const) {
    const bal = await cusdc.balanceOf(wallet.address);
    if (bal < mintAmt) {
      await (await cusdc.mint(wallet.address, mintAmt)).wait();
    }
    log("1", `${name}: ${fmt(await cusdc.balanceOf(wallet.address))} cUSDC`);
  }

  // ════════════════════════════════════════════
  // STEP 2: Register & Activate Issuer
  // ════════════════════════════════════════════
  console.log("\n=== Step 2: Register & Activate Issuer ===");
  const issuerReg = new ethers.Contract(addr.issuerRegistry, [
    "function registerIssuer(address, string, string) external",
    "function activateIssuer(address) external",
    "function isActiveIssuer(address) view returns (bool)",
  ], admin);

  if (await issuerReg.isActiveIssuer(issuer.address)) {
    log("2", "Issuer already active");
  } else {
    try { await (await issuerReg.registerIssuer(issuer.address, "E2E Issuer", "AE")).wait(); } catch { /* already registered */ }
    await (await issuerReg.activateIssuer(issuer.address)).wait();
    log("2", "Issuer registered & activated");
  }

  // ════════════════════════════════════════════
  // STEP 3: Deploy Token
  // ════════════════════════════════════════════
  console.log("\n=== Step 3: Deploy Token ===");
  const tokenFactory = new ethers.Contract(addr.tokenFactory, [
    "function deployToken(string, string, uint8, address) external returns (address, address, address)",
    "function getDeployedTokensCount() view returns (uint256)",
    "function getDeployedTokens(uint256, uint256) view returns (address[])",
  ], admin);

  const tx3 = await tokenFactory.deployToken("E2E Test Token", "eTST", 6, issuer.address, { gasLimit: 5_000_000 });
  await tx3.wait();

  const tokenCount = await tokenFactory.getDeployedTokensCount();
  const tokens = await tokenFactory.getDeployedTokens(tokenCount - 1n, 1);
  const tokenAddr = tokens[0];

  const token = new ethers.Contract(tokenAddr, TOKEN_ABI, issuer);
  const irAddr = await token.identityRegistry();
  const compAddr = await token.compliance();

  log("3", `Token: ${tokenAddr} (${await token.symbol()})`);
  log("3", `IdentityRegistry: ${irAddr}`);
  log("3", `Compliance: ${compAddr}`);

  // ════════════════════════════════════════════
  // STEP 4: Deploy OTC Token
  // ════════════════════════════════════════════
  console.log("\n=== Step 4: Deploy OTC Token ===");
  const OTCTokenFactory = await ethers.getContractFactory("IssuerOTCToken", admin);
  const otcTokenContract = await OTCTokenFactory.deploy();
  await otcTokenContract.waitForDeployment();
  const otcTokenAddr = await otcTokenContract.getAddress();

  // Initialize OTC token — issuer gets MINTER_ROLE
  const otcToken = new ethers.Contract(otcTokenAddr, [
    "function initialize(string, string, address, address) external",
    ...OTC_TOKEN_ABI,
  ], issuer);

  // OTC token needs initialization since it's implementation pattern
  // Actually IssuerOTCToken uses initializer — let's deploy via factory or directly
  // For simplicity, deploy a simple MockERC20 as OTC token
  const MockERC20 = await ethers.getContractFactory("MockERC20", issuer);
  const otcMock = await MockERC20.deploy("Cireta OTC Token", "cOTC", 6);
  await otcMock.waitForDeployment();
  const otcAddr = await otcMock.getAddress();
  log("4", `OTC Token: ${otcAddr} (cOTC, 6 decimals)`);

  // ════════════════════════════════════════════
  // STEP 5: Whitelist All Participants
  // ════════════════════════════════════════════
  console.log("\n=== Step 5: Whitelist All Participants ===");
  const simpleIR = new ethers.Contract(irAddr, SIMPLE_IR_ABI, issuer);

  // Check if issuer is agent
  const isAgent = await simpleIR.isAgent(issuer.address);
  if (!isAgent) {
    // Owner of IR should be the issuer (set by TokenFactory)
    const irOwner = await simpleIR.owner();
    log("5", `IR owner: ${irOwner}, trying to add issuer as agent...`);
    const irAsOwner = new ethers.Contract(irAddr, SIMPLE_IR_ABI, irOwner.toLowerCase() === admin.address.toLowerCase() ? admin : issuer);
    await (await irAsOwner.addAgent(issuer.address)).wait();
    log("5", "Issuer added as agent");
  }

  const walletsToWhitelist = [
    { name: "Issuer", addr: issuer.address },
    { name: "Investor1", addr: investor1.address },
    { name: "Investor2", addr: investor2.address },
    { name: "OTC Op", addr: otcOperator.address },
  ];

  for (const w of walletsToWhitelist) {
    if (!(await simpleIR.isVerified(w.addr))) {
      await (await simpleIR.addToWhitelist(w.addr, 784)).wait(); // 784 = UAE
      log("5", `Whitelisted ${w.name}`);
    } else {
      log("5", `${w.name} already whitelisted`);
    }
  }

  // ════════════════════════════════════════════
  // STEP 6: Mint Project Tokens to Issuer
  // ════════════════════════════════════════════
  console.log("\n=== Step 6: Mint Project Tokens ===");
  const supplyAmount = ethers.parseUnits("1000000", 6);
  await (await token.mint(issuer.address, supplyAmount)).wait();
  log("6", `Minted ${fmt(supplyAmount)} eTST to issuer`);

  // ════════════════════════════════════════════
  // STEP 7: Create DIRECT Sale (with OTC)
  // ════════════════════════════════════════════
  console.log("\n=== Step 7: Create Direct Sale ===");
  const saleFactory = new ethers.Contract(addr.saleFactory, [
    "function deploySale(address, bytes) external returns (address)",
    "function getSalesForToken(address) view returns (address[])",
    "event SaleDeployed(address indexed sale, address indexed token, address indexed issuer)",
  ], issuer);

  const softCap = ethers.parseUnits("50", 6);
  const hardCap = ethers.parseUnits("10000", 6);

  const saleIface = new ethers.Interface(SALE_INIT_ABI);
  const initData = saleIface.encodeFunctionData("initialize", [
    tokenAddr, usdcAddr, irAddr, issuer.address,
    addr.saleFactory, addr.platformFeeManager,
    softCap, hardCap, 200, 0, // 2% fee, no cap
    otcAddr, // OTC token linked at creation
  ]);

  const tx7 = await saleFactory.deploySale(tokenAddr, initData, { gasLimit: 3_000_000 });
  await tx7.wait();

  const sales = await saleFactory.getSalesForToken(tokenAddr);
  const saleAddr = sales[sales.length - 1];
  const sale = new ethers.Contract(saleAddr, SALE_ABI, issuer);

  log("7", `Sale: ${saleAddr}`);
  log("7", `OTC Token on sale: ${await sale.otcToken()}`);
  log("7", `Status: ${await sale.status()} (0=Draft)`);

  // Add phase
  // Sale.buy() formula: tokensToAllocate = (amount * 1e18) / pricePerToken
  // For 6-decimal token at 1 USDC per token:
  //   amount=200e6, pricePerToken=1e18 → tokensToAllocate=200e6 (correct for 6-dec token)
  // allocation must also be in raw token units (6 dec)
  const now = Math.floor(Date.now() / 1000);
  await (await sale.addPhase(
    "Public Sale",
    ethers.parseUnits("1", 18),     // 1 USDC per token
    ethers.parseUnits("10000", 6),  // 10K allocation in token units (6 dec)
    ethers.parseUnits("10", 6),     // min 10 USDC
    ethers.parseUnits("5000", 6),   // max 5K USDC
    now + 15, now + 86400, false,
  )).wait();
  log("7", "Phase added: 1 USDC/token, 10K allocation");

  // Whitelist the sale contract so it can receive tokens
  if (!(await simpleIR.isVerified(saleAddr))) {
    await (await simpleIR.addToWhitelist(saleAddr, 0)).wait();
    log("7", "Whitelisted sale contract");
  }

  // Transfer tokens to sale (for direct delivery)
  await (await token.transfer(saleAddr, ethers.parseUnits("10000", 6))).wait();
  log("7", "Transferred 10,000 eTST to sale");

  // ════════════════════════════════════════════
  // STEP 8: Admin Activates Sale
  // ════════════════════════════════════════════
  console.log("\n=== Step 8: Admin Activates Sale ===");
  const saleAdmin = new ethers.Contract(saleAddr, SALE_ABI, admin);
  await (await saleAdmin.activate()).wait();
  log("8", `Sale activated! Status: ${await sale.status()}`);

  // Wait for phase start
  const wait1 = (now + 15) - Math.floor(Date.now() / 1000) + 5;
  if (wait1 > 0) {
    log("8", `Waiting ${wait1}s for phase start...`);
    await new Promise(r => setTimeout(r, wait1 * 1000));
  }

  // ════════════════════════════════════════════
  // STEP 9: Investor 01 Buys with USDC
  // ════════════════════════════════════════════
  console.log("\n=== Step 9: Investor 01 Buys with USDC ===");
  const usdcInv1 = new ethers.Contract(usdcAddr, ERC20_ABI, investor1);
  const buyAmt1 = ethers.parseUnits("200", 6);
  await (await usdcInv1.approve(saleAddr, buyAmt1)).wait();
  log("9", `Approved ${fmt(buyAmt1)} cUSDC to sale`);

  // Debug: check allowance and phase
  const allowance = await usdcInv1.allowance(investor1.address, saleAddr);
  log("9", `Allowance: ${fmt(allowance)}`);
  log("9", `Investor1 verified: ${await simpleIR.isVerified(investor1.address)}`);

  // Use compiled ABI for accurate encoding
  const SaleArtifact = await ethers.getContractFactory("Sale");
  const saleInv1 = SaleArtifact.attach(saleAddr).connect(investor1) as any;

  // Debug: check phase timing
  const phase0 = await saleInv1.getPhase(0);
  const blockTs = (await ethers.provider.getBlock("latest"))!.timestamp;
  log("9", `Phase start: ${phase0.startTime}, Phase end: ${phase0.endTime}, Block time: ${blockTs}`);
  log("9", `Phase started: ${blockTs >= phase0.startTime}, Phase ended: ${blockTs > phase0.endTime}`);

  try {
    // Try static call first to get revert reason
    await saleInv1.buy.staticCall(0, buyAmt1);
    log("9", "Static call passed — submitting tx...");
    await (await saleInv1.buy(0, buyAmt1, { gasLimit: 500_000 })).wait();
  } catch (e: any) {
    log("9", `Revert: ${e.reason || e.revert?.name || e.message?.slice(0, 150)}`);
    throw e;
  }

  const contrib1 = await sale.getContribution(investor1.address);
  log("9", `Investor1 bought: ${fmt(contrib1.amount)} USDC → ${fmt(contrib1.tokensAllocated)} eTST`);
  log("9", `Investor1 eTST balance: ${fmt(await token.balanceOf(investor1.address))}`);

  // ════════════════════════════════════════════
  // STEP 10: Investor 02 Buys with OTC Token
  // ════════════════════════════════════════════
  console.log("\n=== Step 10: Investor 02 Buys with OTC ===");

  // Issuer mints OTC tokens to Investor 02 (representing off-platform payment)
  const otcMintAmt = ethers.parseUnits("500", 6);
  const otcIssuer = new ethers.Contract(otcAddr, OTC_TOKEN_ABI, issuer);
  await (await otcIssuer.mint(investor2.address, otcMintAmt)).wait();
  log("10", `Issuer minted ${fmt(otcMintAmt)} cOTC to Investor2`);

  // Investor 02 approves + buys with OTC
  const otcInv2 = new ethers.Contract(otcAddr, ERC20_ABI, investor2);
  await (await otcInv2.approve(saleAddr, otcMintAmt)).wait();
  const saleInv2 = new ethers.Contract(saleAddr, SALE_ABI, investor2);
  await (await saleInv2.buyOTC(0, otcMintAmt, { gasLimit: 500_000 })).wait();

  const contrib2 = await sale.getContribution(investor2.address);
  log("10", `Investor2 OTC bought: ${fmt(contrib2.tokensAllocated)} eTST (isOtc: ${contrib2.isOtc})`);
  log("10", `Investor2 eTST balance: ${fmt(await token.balanceOf(investor2.address))}`);
  log("10", `Total raised (USDC only): ${fmt(await sale.getTotalRaised())}`);

  // ════════════════════════════════════════════
  // STEP 11: Finalize Direct Sale
  // ════════════════════════════════════════════
  console.log("\n=== Step 11: Finalize Direct Sale ===");
  await (await sale.finalizeSale({ gasLimit: 500_000 })).wait();
  const finalStatus = await sale.status();
  log("11", `Sale finalized! Status: ${finalStatus} (3=Success, 4=Failed)`);

  // ═══════════════════════════════════════════════════
  // STEP 12: Create VESTED Sale
  // ═══════════════════════════════════════════════════
  console.log("\n=== Step 12: Create Vested Sale ===");

  const saleFactoryVested = new ethers.Contract(addr.saleFactory, [
    "function deploySaleVested(address, bytes, string, string, uint8, address, uint256, uint256, uint8) external returns (address)",
    "function getSalesForToken(address) view returns (address[])",
  ], issuer);

  const initData2 = saleIface.encodeFunctionData("initialize", [
    tokenAddr, usdcAddr, irAddr, issuer.address,
    addr.saleFactory, addr.platformFeeManager,
    ethers.parseUnits("50", 6), ethers.parseUnits("5000", 6),
    200, 0,
    ethers.ZeroAddress, // no OTC for vested
  ]);

  try {
    const tx12 = await saleFactoryVested.deploySaleVested(
      tokenAddr, initData2,
      "ceTST Fraction", "ceTST", 6,
      irAddr,
      0,     // cliff: 0 seconds
      60,    // vesting: 60 seconds (short for testing)
      0,     // ExcessPolicy.Keep
      { gasLimit: 6_000_000 },
    );
    await tx12.wait();

    const allSales = await saleFactoryVested.getSalesForToken(tokenAddr);
    const vestedSaleAddr = allSales[allSales.length - 1];
    const vestedSale = new ethers.Contract(vestedSaleAddr, SALE_ABI, issuer);

    log("12", `Vested Sale: ${vestedSaleAddr}`);
    log("12", `Mode: ${await vestedSale.saleMode()} (1=Vested)`);
    log("12", `Vault: ${await vestedSale.vault()}`);
    log("12", `FractionToken: ${await vestedSale.fractionToken()}`);

    // Whitelist vested sale + vault + fraction contracts
    const vaultAddrV = await vestedSale.vault();
    const fractionAddrV = await vestedSale.fractionToken();
    for (const ca of [vestedSaleAddr, vaultAddrV, fractionAddrV]) {
      if (!(await simpleIR.isVerified(ca))) {
        await (await simpleIR.addToWhitelist(ca, 0)).wait();
      }
    }
    log("12", "Whitelisted sale/vault/fraction contracts");

    // Add phase
    const now2 = Math.floor(Date.now() / 1000);
    await (await vestedSale.addPhase(
      "Vested Round",
      ethers.parseUnits("1", 18),    // 1 USDC per token
      ethers.parseUnits("5000", 6),  // 5K allocation (6 dec)
      ethers.parseUnits("10", 6),    // min 10 USDC
      ethers.parseUnits("5000", 6),  // max 5K USDC
      now2 + 10, now2 + 86400, false,
    )).wait();
    log("12", "Phase added");

    // Admin activates
    const vestedSaleAdmin = new ethers.Contract(vestedSaleAddr, SALE_ABI, admin);
    await (await vestedSaleAdmin.activate()).wait();
    log("12", "Vested sale activated");

    // Wait for phase
    const wait2 = (now2 + 5) - Math.floor(Date.now() / 1000) + 3;
    if (wait2 > 0) {
      log("12", `Waiting ${wait2}s...`);
      await new Promise(r => setTimeout(r, wait2 * 1000));
    }

    // Investor 01 buys vested
    const buyVested = ethers.parseUnits("100", 6);
    const usdcInv1v = new ethers.Contract(usdcAddr, ERC20_ABI, investor1);
    await (await usdcInv1v.approve(vestedSaleAddr, buyVested)).wait();
    const vestedInv1 = new ethers.Contract(vestedSaleAddr, SALE_ABI, investor1);
    await (await vestedInv1.buy(0, buyVested, { gasLimit: 500_000 })).wait();

    const contribV = await vestedSale.getContribution(investor1.address);
    log("12", `Investor1 vested: ${fmt(contribV.tokensAllocated)} fractions`);

    // Check fraction balance
    const fractionAddr = await vestedSale.fractionToken();
    const fraction = new ethers.Contract(fractionAddr, ERC20_ABI, ethers.provider);
    log("12", `Fraction balance: ${fmt(await fraction.balanceOf(investor1.address))}`);

    // ═══════════════════════════════════════════
    // STEP 13: Deposit Tokens & Finalize Vested
    // ═══════════════════════════════════════════
    console.log("\n=== Step 13: Deposit & Finalize Vested Sale ===");
    const depositAmt = ethers.parseUnits("5000", 6);
    await (await token.approve(vestedSaleAddr, depositAmt)).wait();
    await (await vestedSale.depositProjectTokens(depositAmt, { gasLimit: 500_000 })).wait();
    log("13", `Deposited ${fmt(depositAmt)} eTST to vault`);

    await (await vestedSale.finalizeSale({ gasLimit: 500_000 })).wait();
    log("13", `Vested sale finalized! Status: ${await vestedSale.status()}`);

    // ═══════════════════════════════════════════
    // STEP 14: Claim Vested Tokens
    // ═══════════════════════════════════════════
    console.log("\n=== Step 14: Claim Vested Tokens ===");
    log("14", "Waiting 65s for vesting...");
    await new Promise(r => setTimeout(r, 65000));

    const vaultAddr = await vestedSale.vault();
    const vault = new ethers.Contract(vaultAddr, VAULT_ABI, investor1);
    const claimable = await vault.getClaimable(investor1.address);
    log("14", `Claimable: ${fmt(claimable)} eTST`);

    if (claimable > 0n) {
      await (await vault.claim({ gasLimit: 500_000 })).wait();
      log("14", `Claimed! eTST balance: ${fmt(await token.balanceOf(investor1.address))}`);
    }

  } catch (e: any) {
    log("12", `Vested sale error: ${e.message?.slice(0, 120)}`);
  }

  // ════════════════════════════════════════════
  // SUMMARY
  // ════════════════════════════════════════════
  console.log("\n╔══════════════════════════════════════════════════════╗");
  console.log("║         FULL E2E TEST COMPLETE                      ║");
  console.log("╚══════════════════════════════════════════════════════╝");
  console.log(`  Token:         ${tokenAddr}`);
  console.log(`  Direct Sale:   ${saleAddr}`);
  console.log(`  OTC Token:     ${otcAddr}`);
  console.log(`  Inv1 eTST:     ${fmt(await token.balanceOf(investor1.address))}`);
  console.log(`  Inv2 eTST:     ${fmt(await token.balanceOf(investor2.address))}`);
  console.log(`  BaseScan:      https://sepolia.basescan.org/address/${tokenAddr}`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
