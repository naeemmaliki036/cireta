/**
 * Hardhat E2E — two more sale shapes:
 *
 *   TIN     Direct mode (no vault, no fractions). Investor receives the
 *           underlying token immediately on each buy. We assert that
 *           token.balanceOf(investor) increases per chunk and there's no
 *           fraction-token contract involved at all.
 *
 *   SILVER  Vested linear (cliff=0, vesting=3600s = 1 hour). Investor
 *           receives ERC-1155 fractions on each buy, then drives the vault
 *           through several partial claims at +15min / +30min / +45min /
 *           +60min and we verify the cumulative AGENT balance grows
 *           proportionally each step.
 *
 * Run:
 *   cd contracts && npx hardhat run scripts/e2e-multi-sale.ts --network hardhat
 */

import { ethers, upgrades, network } from "hardhat";
import type { Contract, ContractTransactionResponse, TransactionReceipt } from "ethers";

const PASSES: string[] = [];
function pass(msg: string, gas?: bigint) {
  PASSES.push(msg);
  const g = gas ? ` (${gas.toLocaleString()} gas)` : "";
  console.log(`  [PASS] ${msg}${g}`);
}
function header(s: string) { console.log(`\n─ ${s} ─`); }

async function gasOf(tx: ContractTransactionResponse): Promise<bigint> {
  const r = (await tx.wait()) as TransactionReceipt;
  if (r.status !== 1) throw new Error("tx reverted");
  return r.gasUsed;
}
async function setNextTimestamp(ts: number) {
  await network.provider.send("evm_setNextBlockTimestamp", [ts]);
  await network.provider.send("evm_mine", []);
}
async function timeTravel(seconds: number) {
  await network.provider.send("evm_increaseTime", [seconds]);
  await network.provider.send("evm_mine", []);
}

async function main() {
  const [admin, registrar, issuer, investor] = await ethers.getSigners();
  console.log("\n╔══════════════════════════════════════════════════════════════════╗");
  console.log("║   E2E Multi-sale — TIN (Direct) + SILVER (Vested-linear)        ║");
  console.log("╚══════════════════════════════════════════════════════════════════╝");

  // ── Inline v2 deploy ──────────────────────────────────────────────────
  header("Deploy v2 platform");
  const sirF = await ethers.getContractFactory("SimpleIdentityRegistry");
  const sir = await upgrades.deployProxy(sirF,
    [admin.address, ethers.ZeroAddress, ethers.ZeroAddress, ethers.ZeroAddress], { kind: "uups" });
  await sir.waitForDeployment();
  const irF = await ethers.getContractFactory("IssuerRegistry");
  const ir = await upgrades.deployProxy(irF, [admin.address], { kind: "uups" });
  await ir.waitForDeployment();
  const pfmF = await ethers.getContractFactory("PlatformFeeManager");
  const pfm = await upgrades.deployProxy(pfmF, [admin.address, admin.address, 200], { kind: "uups" });
  await pfm.waitForDeployment();

  const tokenImpl = await (await ethers.getContractFactory("CiretaToken")).deploy();
  const sirImpl = await (await ethers.getContractFactory("SimpleIdentityRegistry")).deploy();
  const compImpl = await (await ethers.getContractFactory("ModularCompliance")).deploy();
  const saleImpl = await (await ethers.getContractFactory("Sale")).deploy();
  const vaultImpl = await (await ethers.getContractFactory("CiretaVault")).deploy();
  const fracImpl = await (await ethers.getContractFactory("CiretaFractionToken1155")).deploy();

  const tokenFactory = await upgrades.deployProxy(
    await ethers.getContractFactory("CiretaTokenFactory"),
    [admin.address, await tokenImpl.getAddress(), await sirImpl.getAddress(),
     await compImpl.getAddress(), ethers.ZeroAddress, ethers.ZeroAddress, ethers.ZeroAddress,
     await ir.getAddress()],
    { kind: "uups" }
  );
  await tokenFactory.waitForDeployment();
  const saleFactory = await upgrades.deployProxy(
    await ethers.getContractFactory("CiretaSaleFactory"),
    [admin.address, await saleImpl.getAddress()], { kind: "uups" }
  );
  await saleFactory.waitForDeployment();
  const fractionFactory = await upgrades.deployProxy(
    await ethers.getContractFactory("CiretaFractionFactory"),
    [admin.address, await fracImpl.getAddress(), await vaultImpl.getAddress()],
    { kind: "uups", unsafeAllow: ["constructor"] }
  );
  await fractionFactory.waitForDeployment();

  const REGISTRAR_ROLE = ethers.keccak256(ethers.toUtf8Bytes("REGISTRAR_ROLE"));
  for (const f of [tokenFactory, saleFactory, fractionFactory]) {
    await (await sir.grantRole(REGISTRAR_ROLE, await f.getAddress())).wait();
  }
  await (await sir.grantRole(REGISTRAR_ROLE, registrar.address)).wait();
  await (await tokenFactory.setSimpleIdentityMode(true)).wait();
  await (await saleFactory.setIssuerRegistry(await ir.getAddress())).wait();
  await (await saleFactory.setPlatformFeeManager(await pfm.getAddress())).wait();
  await (await saleFactory.setFractionFactory(await fractionFactory.getAddress())).wait();
  await (await fractionFactory.transferOwnership(await saleFactory.getAddress())).wait();

  const usdc = await (await ethers.getContractFactory("CiretaUSDC")).deploy();
  await usdc.waitForDeployment();

  pass("v2 platform deployed");

  // ── Register issuer + whitelist investor ──────────────────────────────
  header("Issuer + investor onboarding");
  await (await ir.registerIssuer(issuer.address, "Multi Test Issuer", "GB")).wait();
  await (await ir.activateIssuer(issuer.address)).wait();
  await (await sir.connect(registrar).addToWhitelist(issuer.address, 826)).wait();
  await (await sir.connect(registrar).addToWhitelist(investor.address, 826)).wait();
  pass("Issuer registered, both wallets whitelisted on SIR");

  const tokenFactoryIface = (await ethers.getContractFactory("CiretaTokenFactory")).interface;
  const tokenDeployedTopic = tokenFactoryIface.getEvent("TokenDeployed").topicHash;
  const saleFactoryIface = (await ethers.getContractFactory("CiretaSaleFactory")).interface;
  const saleDeployedTopic = saleFactoryIface.getEvent("SaleDeployed").topicHash;

  // ── SALE 1 — TIN (Direct mode, no lockup) ──────────────────────────────
  header("SALE 1 — TIN (Direct, 500 supply, chunk buys, instant receipt)");

  const TIN_SUPPLY = ethers.parseUnits("500", 6);
  let tx = await tokenFactory.connect(issuer).deployToken(
    "TIN", "TIN", 6, issuer.address, await sir.getAddress(),
    TIN_SUPPLY, true, TIN_SUPPLY
  );
  let receipt = (await tx.wait()) as TransactionReceipt;
  const tinAddr = tokenFactoryIface.parseLog({
    topics: [...receipt.logs.find((l) => l.topics[0] === tokenDeployedTopic)!.topics],
    data: receipt.logs.find((l) => l.topics[0] === tokenDeployedTopic)!.data,
  })!.args[0] as string;
  pass(`TIN deployed @ ${tinAddr.slice(0, 10)}…`);

  // Sale init for Direct mode
  const saleIface = new ethers.Interface([
    "function initialize(address,address,address,address,address,address,uint256,uint256,uint256,uint256,address,uint256,uint256,uint256)",
  ]);
  const block1 = await ethers.provider.getBlock("latest");
  const TIN_START = block1!.timestamp + 60;
  const TIN_END = TIN_START + 30 * 24 * 3600;
  const tinInitData = saleIface.encodeFunctionData("initialize", [
    tinAddr, await usdc.getAddress(), await sir.getAddress(),
    issuer.address, await saleFactory.getAddress(), await pfm.getAddress(),
    ethers.parseUnits("1", 6),
    ethers.parseUnits("500", 6),
    200n, ethers.parseUnits("50000", 6),
    ethers.ZeroAddress, TIN_START, TIN_END, TIN_SUPPLY,
  ]);
  // Use deploySale (NOT deploySaleVested) — this is the Direct path
  tx = await saleFactory.connect(issuer).deploySale(tinAddr, tinInitData);
  receipt = (await tx.wait()) as TransactionReceipt;
  const tinSaleLog = receipt.logs.find((l) => l.topics[0] === saleDeployedTopic);
  const tinSaleAddr = saleFactoryIface.parseLog({
    topics: [...tinSaleLog!.topics], data: tinSaleLog!.data,
  })!.args[1] as string;
  const tinSale = await ethers.getContractAt("Sale", tinSaleAddr, issuer);

  // Direct sales have no vault and no fraction
  const tinVault = await tinSale.vault();
  const tinFraction = await tinSale.fractionToken();
  if (tinVault !== ethers.ZeroAddress || tinFraction !== ethers.ZeroAddress) {
    throw new Error(`Direct sale should have no vault/fraction; got vault=${tinVault} fraction=${tinFraction}`);
  }
  pass(`Direct sale at ${tinSaleAddr.slice(0, 10)}… (no vault, no fraction)`);

  // Add Seed phase, deposit, approve, activate
  await (await tinSale.connect(issuer).addPhase(
    "Seed", ethers.parseUnits("1", 6), TIN_SUPPLY,
    10n, 0n, 5n, TIN_START, TIN_END - 1, false, 0
  )).wait();
  // Direct mode: tokens go to the SALE contract, not a vault
  const tin = await ethers.getContractAt("CiretaToken", tinAddr, issuer);
  await (await tin.connect(issuer).transfer(tinSaleAddr, TIN_SUPPLY)).wait();
  await (await tinSale.connect(admin).approveSale()).wait();
  await setNextTimestamp(TIN_START + 1);
  await (await tinSale.connect(issuer).activate()).wait();
  pass("TIN sale Active — phase added, deposited, approved, activated");

  // Investor needs USDC
  await (await usdc.mint(investor.address, ethers.parseUnits("500", 6))).wait();
  await (await usdc.connect(investor).approve(tinSaleAddr, ethers.parseUnits("500", 6))).wait();

  // Buy in chunks: 50 + 100 + 25 = 175 TIN
  // Verify investor balance grows AT EACH BUY (no lockup, no claim needed)
  let prevBal = 0n;
  for (const qty of [50n, 100n, 25n]) {
    await (await tinSale.connect(investor).buy(0, qty)).wait();
    const bal = await tin.balanceOf(investor.address);
    const delta = bal - prevBal;
    const expected = qty * (10n ** 6n);
    if (delta !== expected) {
      throw new Error(`buy(${qty}) → expected delta ${expected}, got ${delta}`);
    }
    prevBal = bal;
    pass(`buy(${qty}) → +${qty} TIN delivered immediately to investor`);
  }
  const tinFinalBal = await tin.balanceOf(investor.address);
  if (tinFinalBal !== ethers.parseUnits("175", 6)) throw new Error("TIN final balance != 175");
  pass(`Direct mode verified: investor holds 175 TIN with no claim step`);

  // ── SALE 2 — SILVER (Vested linear, 1 hr) ──────────────────────────────
  header("SALE 2 — SILVER (Vested linear, cliff=0, vesting=3600s, 800 supply)");

  const SILVER_SUPPLY = ethers.parseUnits("800", 6);
  tx = await tokenFactory.connect(issuer).deployToken(
    "SILVER", "SILVER", 6, issuer.address, await sir.getAddress(),
    SILVER_SUPPLY, true, SILVER_SUPPLY
  );
  receipt = (await tx.wait()) as TransactionReceipt;
  const silverAddr = (await ethers.getContractFactory("CiretaTokenFactory")).interface.parseLog({
    topics: [...receipt.logs.find((l) => l.topics[0] === tokenDeployedTopic)!.topics],
    data: receipt.logs.find((l) => l.topics[0] === tokenDeployedTopic)!.data,
  })!.args[0] as string;
  pass(`SILVER deployed @ ${silverAddr.slice(0, 10)}…`);

  const block2 = await ethers.provider.getBlock("latest");
  const SILVER_START = block2!.timestamp + 60;
  const SILVER_END = SILVER_START + 5 * 60;  // 5-minute sale window
  const silverInitData = saleIface.encodeFunctionData("initialize", [
    silverAddr, await usdc.getAddress(), await sir.getAddress(),
    issuer.address, await saleFactory.getAddress(), await pfm.getAddress(),
    ethers.parseUnits("1", 6),
    ethers.parseUnits("1600", 6),       // 800 tokens × 2 USDC
    200n, ethers.parseUnits("50000", 6),
    ethers.ZeroAddress, SILVER_START, SILVER_END, SILVER_SUPPLY,
  ]);
  // cliff=0, vesting=3600 → linear release over 1 hour, no cliff
  tx = await saleFactory.connect(issuer).deploySaleVested(
    silverAddr, silverInitData, "frSILVER", "frSILVER", 6,
    await sir.getAddress(), 0n, 3600n, 0
  );
  receipt = (await tx.wait()) as TransactionReceipt;
  const silverSaleAddr = saleFactoryIface.parseLog({
    topics: [...receipt.logs.find((l) => l.topics[0] === saleDeployedTopic)!.topics],
    data: receipt.logs.find((l) => l.topics[0] === saleDeployedTopic)!.data,
  })!.args[1] as string;
  const silverSale = await ethers.getContractAt("Sale", silverSaleAddr, issuer);
  const silverVaultAddr = await silverSale.vault();
  const silverFracAddr = await silverSale.fractionToken();
  pass(`Vested sale at ${silverSaleAddr.slice(0, 10)}…, vault=${silverVaultAddr.slice(0, 10)}…`);

  // Add phase: 800 tokens at 2 USDC each
  await (await silverSale.connect(issuer).addPhase(
    "Seed", ethers.parseUnits("2", 6), SILVER_SUPPLY,
    10n, 0n, 5n, SILVER_START, SILVER_END - 1, false, 0
  )).wait();
  const silver = await ethers.getContractAt("CiretaToken", silverAddr, issuer);
  await (await silver.connect(issuer).transfer(silverVaultAddr, SILVER_SUPPLY)).wait();
  await (await silverSale.connect(admin).approveSale()).wait();
  await setNextTimestamp(SILVER_START + 1);
  await (await silverSale.connect(issuer).activate()).wait();
  pass("SILVER sale Active");

  // Investor: needs 2 USDC × 180 = 360 USDC (we already have 325 left from TIN; mint more)
  await (await usdc.mint(investor.address, ethers.parseUnits("500", 6))).wait();
  await (await usdc.connect(investor).approve(silverSaleAddr, ethers.parseUnits("500", 6))).wait();

  // Buy in chunks: 100 + 50 + 30 = 180 SILVER (cost: 200 + 100 + 60 = 360 USDC)
  for (const qty of [100n, 50n, 30n]) {
    await (await silverSale.connect(investor).buy(0, qty)).wait();
    pass(`buy(${qty}) — minted ${qty} frSILVER`);
  }
  const silverFraction = await ethers.getContractAt("CiretaFractionToken1155", silverFracAddr, investor);
  const silverFracBal = await silverFraction.balanceOf(investor.address, await silverFraction.ID_USDC());
  if (silverFracBal !== ethers.parseUnits("180", 6)) {
    throw new Error(`Expected 180 frSILVER raw, got ${silverFracBal}`);
  }
  pass(`Investor holds 180 frSILVER (linear vesting starts at finalize)`);

  // Finalize
  await setNextTimestamp(SILVER_END + 1);
  await (await silverSale.connect(issuer).finalizeSale()).wait();
  pass("SILVER finalized — 1-hour linear vesting clock starts now");

  // Partial claims at +15min, +30min, +45min, +60min
  // Vested = elapsed / 3600 × 180 (SILVER raw)
  const silverVault = await ethers.getContractAt("CiretaVault", silverVaultAddr, investor);
  const TOTAL = ethers.parseUnits("180", 6);
  const checkpoints = [
    { wait: 15 * 60, label: "+15min", expectedPct: 25 },
    { wait: 15 * 60, label: "+30min", expectedPct: 50 },
    { wait: 15 * 60, label: "+45min", expectedPct: 75 },
    { wait: 15 * 60 + 5, label: "+60min (full)", expectedPct: 100 },
  ];
  let cumulativeClaimed = 0n;
  for (const cp of checkpoints) {
    await timeTravel(cp.wait);
    const beforeBal = await silver.balanceOf(investor.address);
    await (await silverVault.connect(investor).claim()).wait();
    const afterBal = await silver.balanceOf(investor.address);
    const released = afterBal - beforeBal;
    cumulativeClaimed += released;
    // Vault pays out (vested - already claimed). Cumulative should match expectedPct.
    const expectedCumulative = (TOTAL * BigInt(cp.expectedPct)) / 100n;
    const tolerance = ethers.parseUnits("1", 6); // 1 SILVER tolerance for evm timestamp granularity
    if (cumulativeClaimed > expectedCumulative + tolerance ||
        cumulativeClaimed < expectedCumulative - tolerance) {
      throw new Error(
        `${cp.label}: expected cumulative ${expectedCumulative}, got ${cumulativeClaimed}`
      );
    }
    pass(`${cp.label} claim → +${released} SILVER (cumulative ${cumulativeClaimed} ≈ ${cp.expectedPct}%)`);
  }
  if (cumulativeClaimed !== TOTAL) {
    throw new Error(`Final cumulative claimed ${cumulativeClaimed} != 180e6 (${TOTAL})`);
  }
  pass(`Linear vesting verified: investor holds 180 SILVER after 4 partial claims`);

  // ── Summary ────────────────────────────────────────────────────────────
  console.log("\n══════════════════════════════════════════════════════════════════");
  console.log(`  ${PASSES.length} PASS / 0 FAIL`);
  console.log(`\n  TIN (Direct)     ${tinAddr}`);
  console.log(`  TIN sale          ${tinSaleAddr}`);
  console.log(`  SILVER (Vested)  ${silverAddr}`);
  console.log(`  SILVER sale       ${silverSaleAddr}`);
  console.log(`  SILVER vault      ${silverVaultAddr}`);
  console.log(`  SILVER fraction   ${silverFracAddr}`);
  console.log("\n  ✓ Multi-sale E2E passes on hardhat.\n");
}

main().catch((e) => {
  console.error("\nFatal:", e instanceof Error ? e.message : String(e));
  process.exit(1);
});
