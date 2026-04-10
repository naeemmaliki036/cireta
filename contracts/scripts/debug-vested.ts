/**
 * Debug vested sale deployment — isolate the issue.
 */
import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";

async function main() {
  const adminKey = "a2daeb50164d8702f14926669ed8caba1c9950b8173af1ccd19b0a07ad80b530";
  const issuerKey = "8a76cb14e3becbb35c0a260e87f2e9b62c72875f91ba93b1fc72c8769ed2d6ef";
  const inv1Key = "cd354e1926e9874572b3be04e7b21e84ccf01bd7ceecfff91cca4c2aebdba1a0";

  const admin = new ethers.Wallet(adminKey, ethers.provider);
  const issuer = new ethers.Wallet(issuerKey, ethers.provider);
  const investor1 = new ethers.Wallet(inv1Key, ethers.provider);

  const addr = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "deployments", "base-sepolia.json"), "utf-8"));

  console.log("=== Debug Vested Sale ===");
  console.log("Issuer:", issuer.address);
  console.log("SaleFactory:", addr.saleFactory);
  console.log("FractionFactory:", addr.fractionFactory);

  // Check SaleFactory configuration
  const sf = new ethers.Contract(addr.saleFactory, [
    "function owner() view returns (address)",
    "function fractionFactory() view returns (address)",
    "function issuerRegistry() view returns (address)",
    "function platformFeeManager() view returns (address)",
    "function saleImplementation() view returns (address)",
  ], ethers.provider);

  console.log("\nSaleFactory config:");
  console.log("  owner:", await sf.owner());
  console.log("  fractionFactory:", await sf.fractionFactory());
  console.log("  issuerRegistry:", await sf.issuerRegistry());
  console.log("  feeManager:", await sf.platformFeeManager());
  console.log("  saleImpl:", await sf.saleImplementation());

  // Check FractionFactory
  const ff = new ethers.Contract(addr.fractionFactory, [
    "function owner() view returns (address)",
    "function fractionTokenImplementation() view returns (address)",
    "function vaultImplementation() view returns (address)",
  ], ethers.provider);

  console.log("\nFractionFactory config:");
  console.log("  owner:", await ff.owner());
  console.log("  fractionImpl:", await ff.fractionTokenImplementation());
  console.log("  vaultImpl:", await ff.vaultImplementation());

  // Check IssuerRegistry
  const ir = new ethers.Contract(addr.issuerRegistry, [
    "function isActiveIssuer(address) view returns (bool)",
  ], ethers.provider);
  console.log("\nIssuer active:", await ir.isActiveIssuer(issuer.address));

  // Use an existing token from our last test
  // Deploy a fresh token for vested test
  const tokenFactory = new ethers.Contract(addr.tokenFactory, [
    "function deployToken(string, string, uint8, address) external",
    "function getDeployedTokensCount() view returns (uint256)",
    "function getDeployedTokens(uint256, uint256) view returns (address[])",
  ], admin);

  console.log("\nDeploying fresh token for vested test...");
  const txT = await tokenFactory.deployToken("Vested Test", "vTST", 6, issuer.address, { gasLimit: 5_000_000 });
  await txT.wait();
  const tc = await tokenFactory.getDeployedTokensCount();
  const toks = await tokenFactory.getDeployedTokens(tc - 1n, 1);
  const tokenAddr = toks[0];
  console.log("Token:", tokenAddr);

  const token = new ethers.Contract(tokenAddr, [
    "function identityRegistry() view returns (address)",
    "function mint(address, uint256) external",
    "function approve(address, uint256) returns (bool)",
    "function balanceOf(address) view returns (uint256)",
  ], issuer);
  const irAddr = await token.identityRegistry();
  console.log("IdentityRegistry:", irAddr);

  // Whitelist issuer + investor
  const simpleIR = new ethers.Contract(irAddr, [
    "function addAgent(address) external",
    "function addToWhitelist(address, uint16) external",
    "function isVerified(address) view returns (bool)",
  ], issuer);
  try { await (await simpleIR.addAgent(issuer.address)).wait(); } catch {}
  if (!(await simpleIR.isVerified(issuer.address))) await (await simpleIR.addToWhitelist(issuer.address, 784)).wait();
  if (!(await simpleIR.isVerified(investor1.address))) await (await simpleIR.addToWhitelist(investor1.address, 784)).wait();
  console.log("Whitelisted issuer + investor");

  // Mint tokens
  await (await token.mint(issuer.address, ethers.parseUnits("100000", 6))).wait();
  console.log("Minted 100K vTST");

  // Try deploySaleVested
  console.log("\nAttempting deploySaleVested...");

  const SALE_INIT_ABI = [
    "function initialize(address, address, address, address, address, address, uint256, uint256, uint256, uint256, address, uint256, uint256) external",
  ];
  const saleIface = new ethers.Interface(SALE_INIT_ABI);
  const usdcAddr = addr.ciretaUSDC;
  const nowTs = Math.floor(Date.now() / 1000);
  const saleStart = nowTs + 60;
  const saleEnd = nowTs + 30 * 24 * 3600;

  const initData = saleIface.encodeFunctionData("initialize", [
    tokenAddr, usdcAddr, irAddr, issuer.address,
    addr.saleFactory, addr.platformFeeManager,
    ethers.parseUnits("50", 6),   // softCap
    ethers.parseUnits("5000", 6), // hardCap
    200, 0,                       // feeBps, feeCap
    ethers.ZeroAddress,           // no OTC
    saleStart, saleEnd,
  ]);

  const saleFactoryIssuer = new ethers.Contract(addr.saleFactory, [
    "function deploySaleVested(address, bytes, string, string, uint8, address, uint256, uint256, uint8) external returns (address)",
    "function getSalesForToken(address) view returns (address[])",
  ], issuer);

  try {
    // Static call first
    console.log("Static call...");
    await saleFactoryIssuer.deploySaleVested.staticCall(
      tokenAddr, initData,
      "cvTST", "cvTST", 6,
      irAddr,
      0,   // cliff 0
      60,  // vesting 60s
      0,   // ExcessPolicy.Keep
    );
    console.log("Static call PASSED — submitting tx...");
  } catch (e: any) {
    console.log("Static call FAILED:", e.reason || e.revert?.name || e.message?.slice(0, 200));

    // Check if it's an ownership issue — FractionFactory.deployVaultAndFraction is onlyOwner
    const ffOwner = await ff.owner();
    const sfAddr = addr.saleFactory;
    console.log("\nFractionFactory owner:", ffOwner);
    console.log("SaleFactory address:", sfAddr);
    console.log("Match:", ffOwner.toLowerCase() === sfAddr.toLowerCase());
    console.log("\nThe SaleFactory needs to be the owner of FractionFactory");
    console.log("(so it can call deployVaultAndFraction internally)");
    return;
  }

  const tx = await saleFactoryIssuer.deploySaleVested(
    tokenAddr, initData,
    "cvTST", "cvTST", 6,
    irAddr, 0, 60, 0,
    { gasLimit: 6_000_000 },
  );
  const receipt = await tx.wait();
  console.log("Vested sale deployed! Tx:", receipt.hash);

  const sales = await saleFactoryIssuer.getSalesForToken(tokenAddr);
  const vestedSaleAddr = sales[sales.length - 1];
  console.log("Vested Sale:", vestedSaleAddr);

  const vestedSale = new ethers.Contract(vestedSaleAddr, [
    "function saleMode() view returns (uint8)",
    "function vault() view returns (address)",
    "function fractionToken() view returns (address)",
    "function status() view returns (uint8)",
    "function addPhase(string, uint256, uint256, uint256, uint256, uint256, uint256, bool) external",
    "function activate() external",
    "function buy(uint256, uint256) external",
    "function finalizeSale() external",
    "function depositProjectTokens(uint256) external",
    "function getContribution(address) view returns (tuple(uint256, uint256, bool, bool, bool))",
  ], issuer);

  console.log("Mode:", await vestedSale.saleMode(), "(1=Vested)");
  const vaultAddr = await vestedSale.vault();
  const fractionAddr = await vestedSale.fractionToken();
  console.log("Vault:", vaultAddr);
  console.log("FractionToken:", fractionAddr);

  // Whitelist sale + vault + fraction
  for (const ca of [vestedSaleAddr, vaultAddr, fractionAddr]) {
    if (!(await simpleIR.isVerified(ca))) {
      await (await simpleIR.addToWhitelist(ca, 0)).wait();
    }
  }
  console.log("Whitelisted sale/vault/fraction contracts");

  // Add phase
  const now = Math.floor(Date.now() / 1000);
  await (await vestedSale.addPhase(
    "Vested Round",
    ethers.parseUnits("1", 18),
    ethers.parseUnits("5000", 6),
    ethers.parseUnits("10", 6),
    ethers.parseUnits("5000", 6),
    now + 10, now + 86400, false,
  )).wait();
  console.log("Phase added");

  // Admin activates
  const vestedSaleAdmin = new ethers.Contract(vestedSaleAddr, ["function activate() external"], admin);
  await (await vestedSaleAdmin.activate()).wait();
  console.log("Activated");

  // Wait
  const wait = (now + 10) - Math.floor(Date.now() / 1000) + 3;
  if (wait > 0) { console.log(`Waiting ${wait}s...`); await new Promise(r => setTimeout(r, wait * 1000)); }

  // Investor buys
  const cusdc = new ethers.Contract(usdcAddr, [
    "function approve(address, uint256) returns (bool)",
    "function balanceOf(address) view returns (uint256)",
  ], investor1);
  const buyAmt = ethers.parseUnits("100", 6);
  await (await cusdc.approve(vestedSaleAddr, buyAmt)).wait();
  const vestedInv = new ethers.Contract(vestedSaleAddr, ["function buy(uint256, uint256) external"], investor1);
  await (await vestedInv.buy(0, buyAmt, { gasLimit: 500_000 })).wait();
  console.log("Investor bought 100 USDC of vested tokens");

  // Check fraction balance
  const fraction = new ethers.Contract(fractionAddr, [
    "function balanceOf(address) view returns (uint256)",
    "function decimals() view returns (uint8)",
  ], ethers.provider);
  const fracBal = await fraction.balanceOf(investor1.address);
  const fracDec = await fraction.decimals();
  console.log(`Fraction balance: ${ethers.formatUnits(fracBal, fracDec)} (decimals: ${fracDec})`);

  // Deposit project tokens to vault
  await (await token.approve(vestedSaleAddr, ethers.parseUnits("5000", 6))).wait();
  await (await vestedSale.depositProjectTokens(ethers.parseUnits("5000", 6), { gasLimit: 500_000 })).wait();
  console.log("Deposited 5000 vTST to vault");

  // Finalize
  await (await vestedSale.finalizeSale({ gasLimit: 500_000 })).wait();
  console.log("Finalized! Status:", (await vestedSale.status()).toString());

  // Wait for vesting (60 seconds)
  console.log("Waiting 65s for vesting to complete...");
  await new Promise(r => setTimeout(r, 65000));

  // Check claimable
  const vault = new ethers.Contract(vaultAddr, [
    "function getClaimable(address) view returns (uint256)",
    "function getVested(address) view returns (uint256)",
    "function claim() external",
  ], investor1);

  const vested = await vault.getVested(investor1.address);
  const claimable = await vault.getClaimable(investor1.address);
  console.log(`Vested: ${ethers.formatUnits(vested, 6)}, Claimable: ${ethers.formatUnits(claimable, 6)}`);

  // Claim
  if (claimable > 0n) {
    const balBefore = await token.balanceOf(investor1.address);
    await (await vault.claim({ gasLimit: 500_000 })).wait();
    const balAfter = await token.balanceOf(investor1.address);
    console.log(`Claimed! vTST balance: ${ethers.formatUnits(balBefore, 6)} → ${ethers.formatUnits(balAfter, 6)}`);

    // Check fraction burned
    const fracAfter = await fraction.balanceOf(investor1.address);
    console.log(`Fraction balance after claim: ${ethers.formatUnits(fracAfter, fracDec)}`);
  } else {
    console.log("Nothing claimable — vesting may not have started");
  }

  console.log("\n=== VESTED SALE TEST COMPLETE ===");
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
