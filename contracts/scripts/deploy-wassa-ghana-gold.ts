/**
 * Deploy Wassa Ghana Gold sale:
 * - Total supply: 2,882 tokens
 * - Seed: $85,000/token, ALL 2,882 tokens allocation, min 100, topUp 10
 * - Private (tentative DB only): $115,000/token, unsold from seed, min 50, topUp 5
 */
import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";

const ADMIN_KEY = "a2daeb50164d8702f14926669ed8caba1c9950b8173af1ccd19b0a07ad80b530";
const ISSUER_KEY = "8a76cb14e3becbb35c0a260e87f2e9b62c72875f91ba93b1fc72c8769ed2d6ef";
const REGISTRAR_KEY = "c4af503e32ae01edaf52559ac320bbe16a97275ee6347c8ecc42fb27a898008d";

const d = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "deployments", "base-sepolia.json"), "utf-8"));

async function main() {
  const provider = ethers.provider;
  const admin = new ethers.Wallet(ADMIN_KEY, provider);
  const issuer = new ethers.Wallet(ISSUER_KEY, provider);
  const registrar = new ethers.Wallet(REGISTRAR_KEY, provider);

  const TOTAL_SUPPLY = ethers.parseUnits("2882", 6);
  const SEED_PRICE = ethers.parseUnits("85000", 6);

  console.log("╔══════════════════════════════════════════════════════╗");
  console.log("║   WASSA GHANA GOLD — DEPLOY                        ║");
  console.log("╚══════════════════════════════════════════════════════╝\n");

  // 1. Deploy token
  console.log("=== 1. Deploy Token ===");
  const tokenFactory = await ethers.getContractAt("CiretaTokenFactory", d.tokenFactory, issuer);
  const tokenTx = await tokenFactory.deployToken("Wassa Ghana Gold", "WGGH", 6, issuer.address);
  const tokenReceipt = await tokenTx.wait();
  const tokenLog = tokenReceipt!.logs.find((l: any) => {
    try { return tokenFactory.interface.parseLog({ topics: l.topics as string[], data: l.data })?.name === "TokenDeployed"; }
    catch { return false; }
  });
  const tp = tokenFactory.interface.parseLog({ topics: tokenLog!.topics as string[], data: tokenLog!.data });
  const tokenAddr = tp!.args[0];
  const registryAddr = tp!.args[1];
  console.log(`  Token:    ${tokenAddr}`);
  console.log(`  Registry: ${registryAddr}`);

  const token = await ethers.getContractAt("CiretaToken", tokenAddr, issuer);
  await (await token.mint(issuer.address, ethers.parseUnits("500000", 6))).wait();
  console.log("  Minted 500,000 WGGH");

  // 2. Whitelist issuer
  console.log("\n=== 2. Whitelist ===");
  const AGENT_ROLE = ethers.keccak256(ethers.toUtf8Bytes("AGENT_ROLE"));
  const reg = await ethers.getContractAt("SimpleIdentityRegistry", registryAddr, issuer);
  await (await reg.grantRole(AGENT_ROLE, registrar.address)).wait();
  const regR = await ethers.getContractAt("SimpleIdentityRegistry", registryAddr, registrar);
  await (await regR.addToWhitelist(issuer.address, 784)).wait();
  console.log("  Issuer whitelisted");

  // 3. OTC token
  console.log("\n=== 3. OTC Token ===");
  const otcFactory = await ethers.getContractAt("IssuerOTCTokenFactory", d.otcTokenFactory, issuer);
  const otcTx = await otcFactory.deployOTCToken("WGGH OTC", "WGGH-OTC", issuer.address, registryAddr);
  const otcReceipt = await otcTx.wait();
  const otcLog = otcReceipt!.logs.find((l: any) => {
    try { return otcFactory.interface.parseLog({ topics: l.topics as string[], data: l.data })?.name === "OTCTokenDeployed"; }
    catch { return false; }
  });
  const otcAddr = otcFactory.interface.parseLog({ topics: otcLog!.topics as string[], data: otcLog!.data })!.args[1];
  console.log(`  OTC Token: ${otcAddr}`);

  // 4. Deploy sale
  console.log("\n=== 4. Deploy Sale ===");
  const saleFactory = await ethers.getContractAt("CiretaSaleFactory", d.saleFactory, issuer);
  const feeMgr = await ethers.getContractAt("PlatformFeeManager", d.platformFeeManager, issuer);
  const feeBps = await feeMgr.getFeeForIssuer(issuer.address);

  const now = Math.floor(Date.now() / 1000);
  const saleIface = new ethers.Interface([
    "function initialize(address,address,address,address,address,address,uint256,uint256,uint256,uint256,address,uint256,uint256,uint256)",
  ]);
  const initData = saleIface.encodeFunctionData("initialize", [
    tokenAddr, d.ciretaUSDC, registryAddr, issuer.address,
    d.saleFactory, d.platformFeeManager,
    ethers.parseUnits("8500000", 6),   // softCap $8.5M
    ethers.parseUnits("244970000", 6), // hardCap $244.97M
    feeBps, ethers.parseUnits("50000", 6),
    otcAddr, BigInt(now), BigInt(now + 365 * 86400), TOTAL_SUPPLY,
  ]);

  const saleTx = await saleFactory.deploySaleVested(
    tokenAddr, initData, "frWGGH", "frWGGH", 6, registryAddr,
    30 * 86400, 180 * 86400, 0, { gasLimit: 10_000_000 },
  );
  const saleReceipt = await saleTx.wait();
  const saleLog = saleReceipt!.logs.find((l: any) => {
    try { return saleFactory.interface.parseLog({ topics: l.topics as string[], data: l.data })?.name === "SaleDeployed"; }
    catch { return false; }
  });
  const saleAddr = saleFactory.interface.parseLog({ topics: saleLog!.topics as string[], data: saleLog!.data })!.args[1];
  const sale = await ethers.getContractAt("Sale", saleAddr, issuer);
  const vaultAddr = await sale.vault();
  const fractionAddr = await sale.fractionToken();
  console.log(`  Sale:     ${saleAddr}`);
  console.log(`  Vault:    ${vaultAddr}`);
  console.log(`  Fraction: ${fractionAddr}`);

  await (await sale.setOTCToken(otcAddr)).wait();

  // 5. Whitelist sale + vault + investor
  console.log("\n=== 5. Whitelist contracts + investor ===");
  for (const [label, addr] of [["Sale", saleAddr], ["Vault", vaultAddr], ["Investor", "0x5c5C4A2563ea79D494a0CA2dCd8d596790651fba"]] as const) {
    await (await regR.addToWhitelist(addr, 784)).wait();
    console.log(`  ${label} whitelisted`);
  }

  // 6. Deposit
  console.log("\n=== 6. Deposit ===");
  await (await token.approve(saleAddr, ethers.parseUnits("500000", 6))).wait();
  await (await sale.depositProjectTokens(TOTAL_SUPPLY)).wait();
  console.log(`  Deposited 2,882 WGGH into vault`);

  // 7. Seed phase — ALL 2,882 tokens
  console.log("\n=== 7. Add Seed Phase (all supply) ===");
  const seedStart = now + 120;
  const seedEnd = now + 60 * 86400;
  await (await sale.addPhase(
    "Seed Round", SEED_PRICE, TOTAL_SUPPLY, // allocation = full 2,882
    100n, 2882n, 10n,
    BigInt(seedStart), BigInt(seedEnd),
    true, 0,
  )).wait();
  console.log(`  Seed: $85,000/token, 2,882 allocation (all supply), min 100, topUp 10`);

  // Whitelist investor
  await (await sale.setWhitelist(0, ["0x5c5C4A2563ea79D494a0CA2dCd8d596790651fba"], true)).wait();
  console.log("  Investor whitelisted for Seed");

  // 8. Activate
  console.log("\n=== 8. Activate ===");
  const saleAdmin = await ethers.getContractAt("Sale", saleAddr, admin);
  await (await saleAdmin.approveSale()).wait();
  await (await sale.activate({ gasLimit: 500_000 })).wait();
  console.log(`  Sale ACTIVE`);

  // Summary
  console.log("\n╔══════════════════════════════════════════════════════╗");
  console.log("║   WASSA GHANA GOLD DEPLOYED                        ║");
  console.log("╚══════════════════════════════════════════════════════╝");
  console.log(`  Token:     ${tokenAddr}`);
  console.log(`  Registry:  ${registryAddr}`);
  console.log(`  Sale:      ${saleAddr}`);
  console.log(`  Vault:     ${vaultAddr}`);
  console.log(`  Fraction:  ${fractionAddr}`);
  console.log(`  OTC Token: ${otcAddr}`);
}

main().then(() => process.exit(0)).catch(e => { console.error("FAILED:", e); process.exit(1); });
