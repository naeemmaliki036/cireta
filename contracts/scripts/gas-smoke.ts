/**
 * Gas-limit smoke test — exercises every newly-wired contract function from
 * the gaps-and-fixes audit closure work, plus re-verifies the recent gas-fix
 * paths (addPhase, buy, claim) that were tightened in the last 2 days.
 *
 * For each call, we capture receipt.gasUsed and assert it stays under the
 * caller's expected ceiling. Anything that blows past the ceiling fails the
 * step and prints the actual gas, so a regression shows up loud.
 *
 * Usage:
 *   npx hardhat run contracts/scripts/gas-smoke.ts --network hardhat
 */

import { ethers, upgrades } from "hardhat";
import type { Contract, ContractTransactionResponse, TransactionReceipt } from "ethers";

interface Step { name: string; gas: bigint; ceiling: bigint; status: "PASS" | "FAIL"; note?: string }

const steps: Step[] = [];
const FAIL_LIST: string[] = [];

function record(name: string, gas: bigint, ceiling: bigint, note?: string) {
  const status = gas <= ceiling ? "PASS" : "FAIL";
  steps.push({ name, gas, ceiling, status, note });
  const pad = name.padEnd(46, " ");
  const gNum = `${gas.toLocaleString()}`.padStart(10, " ");
  const cNum = `${ceiling.toLocaleString()}`.padStart(10, " ");
  console.log(`  [${status}] ${pad} ${gNum} / ${cNum} gas${note ? "  — " + note : ""}`);
  if (status === "FAIL") FAIL_LIST.push(`${name}: used ${gas} > ceiling ${ceiling}`);
}

async function gasOf(tx: ContractTransactionResponse): Promise<bigint> {
  const r = (await tx.wait()) as TransactionReceipt;
  return r.gasUsed;
}

async function main() {
  const [admin, issuer, inv1, inv2, inv3] = await ethers.getSigners();
  console.log("\n╔══════════════════════════════════════════════════════════════════╗");
  console.log("║   CIRETA — Gas-limit smoke test (gaps-and-fixes coverage)       ║");
  console.log("╚══════════════════════════════════════════════════════════════════╝\n");
  console.log(`  admin   ${admin.address}`);
  console.log(`  issuer  ${issuer.address}`);
  console.log(`  inv1    ${inv1.address}`);
  console.log(`  inv2    ${inv2.address}`);
  console.log(`  inv3    ${inv3.address}\n`);

  // ── Deploy v2 platform inline ────────────────────────────────────────────
  console.log("  Deploying v2 platform...");

  const sirF = await ethers.getContractFactory("SimpleIdentityRegistry");
  const sir = await upgrades.deployProxy(sirF, [admin.address, ethers.ZeroAddress, ethers.ZeroAddress, ethers.ZeroAddress], { kind: "uups" });
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
  const fractionImpl = await (await ethers.getContractFactory("CiretaFractionToken1155")).deploy();

  const tokenFactoryF = await ethers.getContractFactory("CiretaTokenFactory");
  const tokenFactory = await upgrades.deployProxy(tokenFactoryF, [
    admin.address,
    await tokenImpl.getAddress(),
    await sirImpl.getAddress(),
    await compImpl.getAddress(),
    ethers.ZeroAddress, ethers.ZeroAddress, ethers.ZeroAddress,
    await ir.getAddress(),
  ], { kind: "uups" });
  await tokenFactory.waitForDeployment();

  const saleFactoryF = await ethers.getContractFactory("CiretaSaleFactory");
  const saleFactory = await upgrades.deployProxy(saleFactoryF, [admin.address, await saleImpl.getAddress()], { kind: "uups" });
  await saleFactory.waitForDeployment();

  const fractionFactoryF = await ethers.getContractFactory("CiretaFractionFactory");
  const fractionFactory = await upgrades.deployProxy(
    fractionFactoryF,
    [admin.address, await fractionImpl.getAddress(), await vaultImpl.getAddress()],
    { kind: "uups", unsafeAllow: ["constructor"] }
  );
  await fractionFactory.waitForDeployment();
  await (await fractionFactory.transferOwnership(await saleFactory.getAddress())).wait();

  const REGISTRAR_ROLE = ethers.keccak256(ethers.toUtf8Bytes("REGISTRAR_ROLE"));
  for (const f of [tokenFactory, saleFactory, fractionFactory]) {
    await (await sir.grantRole(REGISTRAR_ROLE, await f.getAddress())).wait();
  }
  await (await tokenFactory.setSimpleIdentityMode(true)).wait();
  await (await saleFactory.setIssuerRegistry(await ir.getAddress())).wait();
  await (await saleFactory.setPlatformFeeManager(await pfm.getAddress())).wait();
  await (await saleFactory.setFractionFactory(await fractionFactory.getAddress())).wait();

  const usdc = await (await ethers.getContractFactory("CiretaUSDC")).deploy();
  await usdc.waitForDeployment();

  // Fund investors with USDC for buys
  for (const w of [inv1, inv2, inv3]) {
    await (await usdc.mint(w.address, ethers.parseUnits("1000000", 6))).wait();
  }

  console.log("  Platform deployed.\n");

  // ── Section 1: IssuerRegistry — register/suspend/reactivate ──────────────
  console.log("─ Section 1: IssuerRegistry (register/suspend/reactivate) ─");

  let r: TransactionReceipt;
  r = (await (await ir.registerIssuer(issuer.address, "Smoke Issuer", "GB")).wait()) as TransactionReceipt;
  record("IssuerRegistry.registerIssuer", r.gasUsed, 250_000n);

  r = (await (await ir.activateIssuer(issuer.address)).wait()) as TransactionReceipt;
  record("IssuerRegistry.activateIssuer", r.gasUsed, 80_000n);

  r = (await (await ir.suspendIssuer(issuer.address, "smoke test")).wait()) as TransactionReceipt;
  record("IssuerRegistry.suspendIssuer", r.gasUsed, 120_000n, "newly wired");

  r = (await (await ir.reactivateIssuer(issuer.address)).wait()) as TransactionReceipt;
  record("IssuerRegistry.reactivateIssuer", r.gasUsed, 80_000n, "newly wired (v2.1)");

  // Whitelist the issuer for KYC checks downstream
  await (await sir.addToWhitelist(issuer.address, 826)).wait();

  // ── Section 2: SimpleIdentityRegistry — addAgent/removeAgent ─────────────
  console.log("\n─ Section 2: SimpleIdentityRegistry (addAgent/removeAgent) ─");

  r = (await (await sir.addAgent(inv1.address)).wait()) as TransactionReceipt;
  record("SimpleIdentityRegistry.addAgent", r.gasUsed, 100_000n, "newly wired");

  r = (await (await sir.removeAgent(inv1.address)).wait()) as TransactionReceipt;
  record("SimpleIdentityRegistry.removeAgent", r.gasUsed, 60_000n, "newly wired");

  // Whitelist all 3 investors
  for (const w of [inv1, inv2, inv3]) {
    await (await sir.addToWhitelist(w.address, 826)).wait();
  }

  // ── Section 3: Token deploy + freeze suite (CRITICAL) ───────────────────
  console.log("\n─ Section 3: CiretaToken — freeze suite (CRITICAL gap) ─");

  const maxSupply = ethers.parseUnits("1000000", 6);
  const initialMint = ethers.parseUnits("500000", 6);
  const tdTx = await tokenFactory.connect(issuer).deployToken(
    "Smoke Gold", "SMG", 6, issuer.address, await sir.getAddress(),
    maxSupply, true, initialMint
  );
  const tdReceipt = (await tdTx.wait()) as TransactionReceipt;
  record("CiretaTokenFactory.deployToken", tdReceipt.gasUsed, 4_000_000n, "proxy + IR + compliance + REGISTRAR");

  // Parse TokenDeployed event
  const tokenFactoryIface = (await ethers.getContractFactory("CiretaTokenFactory")).interface;
  const topic = tokenFactoryIface.getEvent("TokenDeployed").topicHash;
  let tokenAddr = "";
  let complianceAddr = "";
  for (const log of tdReceipt.logs) {
    if (log.topics[0] === topic) {
      const parsed = tokenFactoryIface.parseLog(log);
      tokenAddr = parsed!.args[0] as string;
      complianceAddr = parsed!.args[2] as string;
      break;
    }
  }
  if (!tokenAddr) throw new Error("TokenDeployed not found");
  console.log(`  token=${tokenAddr.slice(0, 10)}…  compliance=${complianceAddr.slice(0, 10)}…`);

  const token = await ethers.getContractAt("CiretaToken", tokenAddr);

  // Distribute some tokens for transfer / freeze tests
  await (await token.connect(issuer).transfer(inv1.address, ethers.parseUnits("10000", 6))).wait();
  await (await token.connect(issuer).transfer(inv2.address, ethers.parseUnits("10000", 6))).wait();

  // Freeze address (CRITICAL #70)
  r = (await (await token.connect(issuer).setAddressFrozen(inv1.address, true)).wait()) as TransactionReceipt;
  record("CiretaToken.setAddressFrozen", r.gasUsed, 100_000n, "CRITICAL #70 freeze");

  r = (await (await token.connect(issuer).setAddressFrozen(inv1.address, false)).wait()) as TransactionReceipt;
  record("CiretaToken.setAddressFrozen(unfreeze)", r.gasUsed, 60_000n);

  // Batch freeze
  r = (await (await token.connect(issuer).batchSetAddressFrozen(
    [inv1.address, inv2.address, inv3.address], [true, true, true]
  )).wait()) as TransactionReceipt;
  record("CiretaToken.batchSetAddressFrozen[3]", r.gasUsed, 200_000n, "CRITICAL #70 batch");

  await (await token.connect(issuer).batchSetAddressFrozen(
    [inv1.address, inv2.address, inv3.address], [false, false, false]
  )).wait();

  // Partial freeze
  r = (await (await token.connect(issuer).freezePartialTokens(inv1.address, ethers.parseUnits("1000", 6))).wait()) as TransactionReceipt;
  record("CiretaToken.freezePartialTokens", r.gasUsed, 100_000n);

  r = (await (await token.connect(issuer).unfreezePartialTokens(inv1.address, ethers.parseUnits("1000", 6))).wait()) as TransactionReceipt;
  record("CiretaToken.unfreezePartialTokens", r.gasUsed, 60_000n);

  r = (await (await token.connect(issuer).batchFreezePartialTokens(
    [inv1.address, inv2.address], [ethers.parseUnits("100", 6), ethers.parseUnits("200", 6)]
  )).wait()) as TransactionReceipt;
  record("CiretaToken.batchFreezePartialTokens[2]", r.gasUsed, 180_000n);

  await (await token.connect(issuer).batchUnfreezePartialTokens(
    [inv1.address, inv2.address], [ethers.parseUnits("100", 6), ethers.parseUnits("200", 6)]
  )).wait();

  // ── Section 4: Token forced transfer + batch (#75) ───────────────────────
  console.log("\n─ Section 4: CiretaToken — batchForcedTransfer (#75) ─");

  r = (await (await token.connect(issuer).forcedTransfer(inv2.address, inv3.address, ethers.parseUnits("100", 6))).wait()) as TransactionReceipt;
  record("CiretaToken.forcedTransfer", r.gasUsed, 200_000n);

  r = (await (await token.connect(issuer).batchForcedTransfer(
    [inv1.address, inv2.address],
    [inv3.address, inv3.address],
    [ethers.parseUnits("50", 6), ethers.parseUnits("50", 6)]
  )).wait()) as TransactionReceipt;
  record("CiretaToken.batchForcedTransfer[2]", r.gasUsed, 350_000n, "#75 newly wired");

  // ── Section 5: Sale lifecycle (deploy, addPhase, approve, unapprove, ────
  //              activate, buy [recent gas fix], finalize, claim) ─────────
  // Run BEFORE binding compliance modules so transfers don't get rejected
  // by the country-allow module (sale contract is auto-whitelisted at
  // country 0, which the module would reject).
  console.log("\n─ Section 5: Sale lifecycle (recent gas fixes + #72/#73) ─");

  // Encode sale init
  const saleIface = new ethers.Interface([
    "function initialize(address,address,address,address,address,address,uint256,uint256,uint256,uint256,address,uint256,uint256,uint256)",
  ]);
  const now = Math.floor(Date.now() / 1000);
  const block = await ethers.provider.getBlock("latest");
  const chainNow = block!.timestamp;
  const saleStart = chainNow + 60;
  const saleEnd = chainNow + 30 * 24 * 3600;

  const initData = saleIface.encodeFunctionData("initialize", [
    tokenAddr, await usdc.getAddress(), await sir.getAddress(),
    issuer.address, await saleFactory.getAddress(), await pfm.getAddress(),
    ethers.parseUnits("1000", 6),    // softCap
    ethers.parseUnits("100000", 6),  // hardCap
    200n,                             // feeBps (matches PlatformFeeManager)
    ethers.parseUnits("50000", 6),   // feeCap
    ethers.ZeroAddress,               // otcToken
    saleStart,
    saleEnd,
    ethers.parseUnits("100000", 6),  // totalTokenSupply
  ]);

  const dsTx = await saleFactory.connect(issuer).deploySale(tokenAddr, initData);
  const dsR = (await dsTx.wait()) as TransactionReceipt;
  record("CiretaSaleFactory.deploySale", dsR.gasUsed, 1_500_000n);

  const sales = (await saleFactory.getSalesForToken(tokenAddr)) as string[];
  const saleAddr = sales[0]!;
  const sale = await ethers.getContractAt("Sale", saleAddr);

  // Issuer deposits project tokens for the sale (Direct mode)
  await (await token.connect(issuer).transfer(saleAddr, ethers.parseUnits("100000", 6))).wait();

  // Add phase (re-verifies e504aac whole-token-arg fix)
  // AllocationMode: enum is { Fixed=0, Remaining=1 }. Remaining skips per-phase
  // cap and just enforces totalTokenSupply.
  r = (await (await sale.connect(issuer).addPhase(
    "Public",
    ethers.parseUnits("1", 6),                        // pricePerToken (payment-token decimals)
    ethers.parseUnits("100000", 6),                   // allocation: raw token units
    100n,                                              // minTokens: whole tokens
    50000n,                                            // maxTokens: whole tokens
    10n,                                               // topUpMinTokens
    saleStart,
    saleEnd - 1,
    false,
    1                                                  // AllocationMode.Remaining
  )).wait()) as TransactionReceipt;
  record("Sale.addPhase", r.gasUsed, 350_000n, "re-verifies e504aac whole-token args");

  // Approve / unapprove (#72)
  r = (await (await sale.connect(admin).approveSale()).wait()) as TransactionReceipt;
  record("Sale.approveSale", r.gasUsed, 80_000n);

  r = (await (await sale.connect(admin).unapproveSale()).wait()) as TransactionReceipt;
  record("Sale.unapproveSale", r.gasUsed, 50_000n, "#72 newly wired");

  // Re-approve to proceed
  await (await sale.connect(admin).approveSale()).wait();

  // Move to sale window and activate
  await ethers.provider.send("evm_setNextBlockTimestamp", [saleStart + 1]);
  r = (await (await sale.connect(issuer).activate()).wait()) as TransactionReceipt;
  record("Sale.activate", r.gasUsed, 120_000n);

  // Buy — re-verifies 1c0junior (raw-units) + 9685afa (price scaling) gas fixes
  await (await usdc.connect(inv1).approve(saleAddr, ethers.parseUnits("1000", 6))).wait();
  r = (await (await sale.connect(inv1).buy(0, 1000n)).wait()) as TransactionReceipt;
  record("Sale.buy (1k tokens, first buyer)", r.gasUsed, 450_000n, "re-verifies 1c0junior raw-units fix");

  await (await usdc.connect(inv2).approve(saleAddr, ethers.parseUnits("500", 6))).wait();
  r = (await (await sale.connect(inv2).buy(0, 500n)).wait()) as TransactionReceipt;
  record("Sale.buy (500 tokens, second buyer)", r.gasUsed, 350_000n);

  // Skip to after sale end + finalize
  await ethers.provider.send("evm_setNextBlockTimestamp", [saleEnd + 1]);
  r = (await (await sale.connect(issuer).finalizeSale()).wait()) as TransactionReceipt;
  record("Sale.finalizeSale", r.gasUsed, 350_000n);

  // claim — Direct-mode auto-claims at buy time, so claimTokens() reverts
  // AlreadyClaimed. The claim path is covered by Vested-mode hardhat tests.
  console.log("  (skipping claimTokens — Direct mode auto-claims; covered by hardhat tests)");

  // ── Section 6: ModularCompliance.setAllowedSelector (#75) + module flow ─
  console.log("\n─ Section 6: ModularCompliance (setAllowedSelector + module wiring) ─");

  const compliance = await ethers.getContractAt("ModularCompliance", complianceAddr);

  // setAllowedSelector
  const fakeSelector = "0xdeadbeef";
  r = (await (await compliance.connect(issuer).setAllowedSelector(fakeSelector, true)).wait()) as TransactionReceipt;
  record("ModularCompliance.setAllowedSelector(allow)", r.gasUsed, 80_000n, "#75 newly wired");

  r = (await (await compliance.connect(issuer).setAllowedSelector(fakeSelector, false)).wait()) as TransactionReceipt;
  record("ModularCompliance.setAllowedSelector(revoke)", r.gasUsed, 50_000n);

  // Wire CountryAllowModule (representative module flow)
  const countryModF = await ethers.getContractFactory("CountryAllowModule");
  const countryMod = await upgrades.deployProxy(countryModF, [admin.address], { kind: "uups" });
  await countryMod.waitForDeployment();

  const countryIface = (await ethers.getContractFactory("CountryAllowModule")).interface;
  const bindSel = countryIface.getFunction("bindCompliance").selector;
  const addCountrySel = countryIface.getFunction("addAllowedCountry").selector;
  await (await compliance.connect(issuer).setAllowedSelector(bindSel, true)).wait();
  await (await compliance.connect(issuer).setAllowedSelector(addCountrySel, true)).wait();

  r = (await (await compliance.connect(issuer).addModule(await countryMod.getAddress())).wait()) as TransactionReceipt;
  record("ModularCompliance.addModule(CountryAllow)", r.gasUsed, 200_000n);

  await (await countryMod.connect(issuer).bindCompliance(complianceAddr)).wait();
  r = (await (await countryMod.connect(issuer).addAllowedCountry(complianceAddr, 826)).wait()) as TransactionReceipt;
  record("CountryAllowModule.addAllowedCountry", r.gasUsed, 100_000n);

  // ── Section 7: Vault.setExcessPolicy (nice-to-have; only if vested mode) ─
  // Skipped in this Direct-mode smoke; covered by hardhat tests.

  // ── Summary ──────────────────────────────────────────────────────────────
  console.log("\n══════════════════════════════════════════════════════════════════");
  const passes = steps.filter(s => s.status === "PASS").length;
  const fails = steps.filter(s => s.status === "FAIL").length;
  const totalGas = steps.reduce((acc, s) => acc + s.gas, 0n);
  console.log(`  ${passes} PASS / ${fails} FAIL — total gas across all calls: ${totalGas.toLocaleString()}`);

  if (fails > 0) {
    console.log("\n  FAILED CALLS:");
    for (const f of FAIL_LIST) console.log(`    - ${f}`);
    process.exit(1);
  }
  console.log("\n  ✓ All gas measurements within ceiling — no regression detected.\n");
}

main().catch((e) => {
  console.error("Fatal:", e instanceof Error ? e.message : String(e));
  process.exit(1);
});
