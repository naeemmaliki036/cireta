import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";

const DEPLOYMENT_FILE = "base-sepolia.v2.20260430.json";

async function main() {
  const issuerPk = process.env.ISSUER_PK;
  if (!issuerPk) {
    console.error("Set ISSUER_PK env var (issuer wallet private key)");
    process.exit(1);
  }

  const d = JSON.parse(
    fs.readFileSync(path.join(__dirname, "..", "deployments", DEPLOYMENT_FILE), "utf-8"),
  );
  const issuer = new ethers.Wallet(issuerPk.startsWith("0x") ? issuerPk : `0x${issuerPk}`, ethers.provider);

  console.log("\n=== Repro Sale Deploy ===");
  console.log("Network:        ", (await ethers.provider.getNetwork()).name, (await ethers.provider.getNetwork()).chainId);
  console.log("Issuer wallet:  ", issuer.address);
  console.log("Block timestamp:", (await ethers.provider.getBlock("latest"))!.timestamp);
  console.log("Token factory:  ", d.tokenFactory);
  console.log("Sale factory:   ", d.saleFactory);
  console.log("Identity reg:   ", d.simpleIdentityRegistry);
  console.log("Issuer registry:", d.issuerRegistry);
  console.log("Fee manager:    ", d.platformFeeManager);
  console.log("Payment token:  ", d.ciretaUSDC);

  // ── Pre-checks ─────────────────────────────────────────────────────────
  console.log("\n--- Pre-checks ---");
  const ir = await ethers.getContractAt(
    ["function isVerified(address) view returns (bool)"],
    d.simpleIdentityRegistry,
    issuer,
  );
  const issuerReg = await ethers.getContractAt(
    ["function isActiveIssuer(address) view returns (bool)"],
    d.issuerRegistry,
    issuer,
  );
  const feeMgr = await ethers.getContractAt(
    ["function getFeeForIssuer(address) view returns (uint256)"],
    d.platformFeeManager,
    issuer,
  );

  const [verified, active, feeBps] = await Promise.all([
    ir.isVerified(issuer.address),
    issuerReg.isActiveIssuer(issuer.address),
    feeMgr.getFeeForIssuer(issuer.address),
  ]);
  console.log("isVerified(issuer):    ", verified);
  console.log("isActiveIssuer(issuer):", active);
  console.log("feeBps(issuer):        ", feeBps.toString());

  if (!verified) {
    console.error("\nFAIL: issuer is NOT on the IR whitelist. Sale.initialize will revert with IssuerNotVerified().");
    console.error("Fix: admin calls SimpleIdentityRegistry.addToWhitelist(issuer, 0) — UI: /platform/issuers → 'Add to Identity Registry'");
    process.exit(2);
  }
  if (!active) {
    console.error("\nFAIL: issuer is NOT active. Factory will revert with NotActiveIssuer().");
    console.error("Fix: admin calls IssuerRegistry.setIssuerActive(issuer, true)");
    process.exit(2);
  }

  // ── Step 1: Deploy TST token (100 supply, 6 decimals, fixed) ──────────
  console.log("\n--- Step 1: Deploy TST token ---");
  const tokenFactory = await ethers.getContractAt("CiretaTokenFactory", d.tokenFactory, issuer);
  const maxSupply = ethers.parseUnits("100", 6);
  let tokenAddress: string;
  try {
    const tx = await tokenFactory.deployToken(
      "Test Token",
      "TST",
      6,
      issuer.address,
      d.simpleIdentityRegistry,
      maxSupply,
      false,
      maxSupply,
    );
    console.log("deployToken tx:", tx.hash);
    const receipt = await tx.wait();
    const event = receipt!.logs
      .map((l: any) => { try { return tokenFactory.interface.parseLog(l); } catch { return null; } })
      .find((e: any) => e?.name === "TokenDeployed");
    tokenAddress = event!.args[0];
    console.log("Token deployed:", tokenAddress);
  } catch (e: any) {
    return logRevert("deployToken", e, tokenFactory.interface);
  }

  // ── Step 2: Encode Sale.initialize calldata ───────────────────────────
  console.log("\n--- Step 2: Encode Sale.initialize ---");
  const now = Math.floor(Date.now() / 1000);
  const saleStart = now + 60;                  // 1 min from now
  const saleEnd   = now + 60 + 15 * 60;        // 15 min phase + 1 min buffer
  const phaseStart = saleStart;
  const phaseEnd   = saleEnd;

  const saleIface = new ethers.Interface([
    "function initialize(address,address,address,address,address,address,uint256,uint256,uint256,uint256,address,uint256,uint256,uint256)",
  ]);
  const initData = saleIface.encodeFunctionData("initialize", [
    tokenAddress,
    d.ciretaUSDC,
    d.simpleIdentityRegistry,
    issuer.address,
    d.saleFactory,
    d.platformFeeManager,
    ethers.parseUnits("100", 6),                // softCap = $100
    ethers.parseUnits("1000", 6),               // hardCap = $1000
    feeBps,
    ethers.parseUnits("50000", 6),              // feeCapUsdc
    ethers.ZeroAddress,                         // otcToken
    BigInt(saleStart),
    BigInt(saleEnd),
    ethers.parseUnits("100", 6),                // totalTokenSupply (100 TST)
  ]);
  console.log("initData length:", initData.length);
  console.log("saleStart:", saleStart, "saleEnd:", saleEnd, "duration:", saleEnd - saleStart, "s");

  // ── Step 3: Static-call deploySale to get the precise revert ──────────
  console.log("\n--- Step 3: Static-call deploySale ---");
  const saleFactory = await ethers.getContractAt("CiretaSaleFactory", d.saleFactory, issuer);
  try {
    await saleFactory.deploySale.staticCall(tokenAddress, initData);
    console.log("Static call OK — tx will succeed");
  } catch (e: any) {
    return logRevert("deploySale.staticCall", e, saleFactory.interface);
  }

  // ── Step 4: Send actual tx ────────────────────────────────────────────
  console.log("\n--- Step 4: Send deploySale tx ---");
  let saleAddress: string;
  try {
    const tx = await saleFactory.deploySale(tokenAddress, initData);
    console.log("deploySale tx:", tx.hash);
    const receipt = await tx.wait();
    const event = receipt!.logs
      .map((l: any) => { try { return saleFactory.interface.parseLog(l); } catch { return null; } })
      .find((e: any) => e?.name === "SaleDeployed");
    saleAddress = event!.args[1];
    console.log("Sale deployed:", saleAddress);
  } catch (e: any) {
    return logRevert("deploySale", e, saleFactory.interface);
  }

  // ── Step 5: Add 15-min phase at price 10 ──────────────────────────────
  console.log("\n--- Step 5: Add phase ---");
  const sale = await ethers.getContractAt("Sale", saleAddress, issuer);
  try {
    const tx = await sale.addPhase(
      "Phase 1",
      ethers.parseUnits("10", 18),               // pricePerToken: $10 (1e18 scaled)
      ethers.parseUnits("100", 6),               // allocation: 100 TST
      1n,                                        // minTokens
      0n,                                        // maxTokens (no cap)
      1n,                                        // topUpMinTokens
      BigInt(phaseStart),
      BigInt(phaseEnd),
      false,                                     // whitelistOnly
      0,                                         // AllocationMode.Fixed
    );
    console.log("addPhase tx:", tx.hash);
    await tx.wait();
    console.log("Phase added.");
  } catch (e: any) {
    return logRevert("addPhase", e, sale.interface);
  }

  console.log("\n✅ Repro complete:");
  console.log("   Token:", tokenAddress);
  console.log("   Sale: ", saleAddress);
}

function logRevert(label: string, e: any, iface: ethers.Interface) {
  console.error(`\n❌ ${label} REVERTED`);
  const data = e.data ?? e.error?.data ?? e.info?.error?.data;
  if (data && typeof data === "string") {
    try {
      const parsed = iface.parseError(data);
      console.error(`   Custom error: ${parsed!.name}(${parsed!.args.map(String).join(", ")})`);
    } catch {
      console.error(`   Raw error data: ${data}`);
    }
  } else {
    console.error(`   ${e.shortMessage || e.message?.slice(0, 300)}`);
  }
  if (e.transactionHash) console.error(`   tx: ${e.transactionHash}`);
  process.exit(3);
}

main().catch((e) => {
  console.error("Unhandled:", e);
  process.exit(1);
});
