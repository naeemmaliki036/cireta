/**
 * E2E test for CiretaRedemptionFactory.
 *
 * Scenarios:
 *   1. Factory deploys a RedemptionManager bound to a token; issuer becomes owner.
 *   2. Second deploy for the same token reverts AlreadyDeployed.
 *   3. Investor requests redemption; tokens move to RedemptionManager.
 *   4. Issuer fulfils the request; tokens burn.
 *   5. Investor cancels a separate pending request; tokens return.
 *
 * Run:
 *   ./node_modules/.bin/hardhat node                # in another terminal
 *   ./node_modules/.bin/hardhat run scripts/e2e-redemption-factory.ts --network localhost
 */

import { ethers, upgrades } from "hardhat";
import { Contract, Signer } from "ethers";

const ZERO = ethers.ZeroAddress;
const COUNTRY = 840;

function ok(label: string, cond: boolean) {
  const tag = cond ? "PASS" : "FAIL";
  console.log(`   [${tag}] ${label}`);
  if (!cond) {
    process.exitCode = 1;
    throw new Error(`assertion failed: ${label}`);
  }
}

function header(s: string) {
  console.log("\n──────────────────────────────────────────────────");
  console.log(s);
  console.log("──────────────────────────────────────────────────");
}

async function expectRevert(p: Promise<any>, label: string, fragment?: string) {
  try {
    await p;
    ok(`${label} (expected revert)`, false);
  } catch (e: any) {
    const msg = e?.shortMessage || e?.message || String(e);
    if (fragment && !msg.toLowerCase().includes(fragment.toLowerCase())) {
      console.log(`   [WARN] revert fragment "${fragment}" not in: ${msg.slice(0, 140)}`);
    }
    ok(`${label} (reverted)`, true);
  }
}

async function main() {
  console.log("╔══════════════════════════════════════════════════════════╗");
  console.log("║  E2E REDEMPTION FACTORY                                  ║");
  console.log("╚══════════════════════════════════════════════════════════╝");

  const [deployer, issuer, investor] = await ethers.getSigners();
  const deployerAddr = await deployer.getAddress();
  const issuerAddr = await issuer.getAddress();
  const investorAddr = await investor.getAddress();

  // 1. Identity registry + whitelist
  const SimpleIR = await ethers.getContractFactory("SimpleIdentityRegistry");
  const registry = (await upgrades.deployProxy(SimpleIR, [
    deployerAddr, ZERO, ZERO, ZERO,
  ], { kind: "uups" })) as unknown as Contract;
  await registry.waitForDeployment();
  const REGISTRAR_ROLE = await registry.REGISTRAR_ROLE();
  await (await registry.grantRole(REGISTRAR_ROLE, deployerAddr)).wait();
  for (const s of [issuer, investor]) {
    await (await registry.addToWhitelist(await s.getAddress(), COUNTRY)).wait();
  }

  // 2. ModularCompliance + CiretaToken (issuer holds SUPPLY + BURNER role implicitly via DEFAULT_ADMIN)
  const Compliance = await ethers.getContractFactory("ModularCompliance");
  const compliance = (await upgrades.deployProxy(Compliance, [deployerAddr], { kind: "uups" })) as unknown as Contract;
  await compliance.waitForDeployment();

  const Token = await ethers.getContractFactory("CiretaToken");
  const supply = 1_000_000n * 10n ** 6n;
  const projectToken = (await upgrades.deployProxy(Token, [
    "RedeemTest", "RDM", 6,
    await registry.getAddress(),
    await compliance.getAddress(),
    issuerAddr,    // owner_
    deployerAddr,  // admin_
    supply, true, supply,
  ], { kind: "uups" })) as unknown as Contract;
  await projectToken.waitForDeployment();
  await (await compliance.bindToken(await projectToken.getAddress())).wait();
  await (await registry.addToWhitelist(await projectToken.getAddress(), 0)).wait();

  // Issuer transfers some tokens to the investor so they can redeem later
  const investorAlloc = 1_000n * 10n ** 6n;
  await (await projectToken.connect(issuer).transfer(investorAddr, investorAlloc)).wait();

  // 3. Deploy RedemptionManager impl + factory
  const RM = await ethers.getContractFactory("RedemptionManager");
  const rmImpl = await RM.deploy();
  await rmImpl.waitForDeployment();
  const rmImplAddr = await rmImpl.getAddress();

  const Factory = await ethers.getContractFactory("CiretaRedemptionFactory");
  const factory = (await upgrades.deployProxy(Factory, [deployerAddr, rmImplAddr], { kind: "uups" })) as unknown as Contract;
  await factory.waitForDeployment();

  console.log(`\nDeployed:`);
  console.log(`   RedemptionManager impl: ${rmImplAddr}`);
  console.log(`   CiretaRedemptionFactory: ${await factory.getAddress()}`);
  console.log(`   CiretaToken (RDM): ${await projectToken.getAddress()}`);
  ok("factory.version() == 1.0.0", (await factory.version()) === "1.0.0");

  // ── Scenario 1: issuer deploys their RedemptionManager ─────────────────
  header("1 — Issuer deploys RedemptionManager via factory");
  const tokenAddr = await projectToken.getAddress();
  const tx = await factory.connect(issuer).deployRedemptionManager(tokenAddr);
  const receipt = await tx.wait();
  const event = receipt!.logs.find((l: any) => l.fragment?.name === "RedemptionManagerDeployed");
  const rmAddr = event!.args[1];
  console.log(`   → deployed at ${rmAddr}`);

  const rm = RM.attach(rmAddr) as unknown as Contract;
  ok("RedemptionManager token() = projectToken", (await rm.token()) === tokenAddr);
  ok("RedemptionManager owner() = issuer", (await rm.owner()) === issuerAddr);
  ok("factory tracks token → RM", (await factory.tokenRedemptionManager(tokenAddr)) === rmAddr);
  ok("factory count == 1", (await factory.getRedemptionManagerCount()) === 1n);

  // Post-deploy issuer wiring (production responsibility too):
  // 1. Whitelist the RM proxy on the identity registry so token transfers
  //    TO it pass the CiretaToken._update isVerified(to) check.
  // 2. Grant SUPPLY_ROLE to the RM so fulfil() can burn held tokens.
  await (await registry.addToWhitelist(rmAddr, 0)).wait();
  const SUPPLY_ROLE = await projectToken.SUPPLY_ROLE();
  await (await projectToken.connect(issuer).grantRole(SUPPLY_ROLE, rmAddr)).wait();

  // ── Scenario 2: duplicate deploy reverts ───────────────────────────────
  header("2 — Second deploy for the same token reverts AlreadyDeployed");
  await expectRevert(
    factory.connect(issuer).deployRedemptionManager(tokenAddr),
    "duplicate deploy rejected",
    "AlreadyDeployed",
  );

  // ── Scenario 3: investor requests redemption ───────────────────────────
  header("3 — Investor requests redemption (200 tokens, Cash)");
  const reqAmount = 200n * 10n ** 6n;
  await (await projectToken.connect(investor).approve(rmAddr, reqAmount)).wait();
  const reqTx = await (rm.connect(investor) as any).requestRedemption(reqAmount, 0); // 0 = Cash
  await reqTx.wait();

  const reqId = 0n;
  const req = await rm.requests(reqId);
  ok("request investor matches", req.investor === investorAddr);
  ok("request amount matches", req.amount === reqAmount);
  ok("request status == Pending (0)", req.status === 0n);
  ok("tokens transferred to RM", (await projectToken.balanceOf(rmAddr)) === reqAmount);
  ok("investor balance debited", (await projectToken.balanceOf(investorAddr)) === investorAlloc - reqAmount);

  // ── Scenario 4: issuer fulfils the request ─────────────────────────────
  header("4 — Issuer fulfils (tokens burn)");
  const supplyBefore = await projectToken.totalSupply();
  await (await rm.connect(issuer).fulfil(reqId)).wait();
  const reqAfter = await rm.requests(reqId);
  const supplyAfter = await projectToken.totalSupply();

  ok("request status == Fulfilled (2)", reqAfter.status === 2n);
  ok("tokens burned (RM balance now 0)", (await projectToken.balanceOf(rmAddr)) === 0n);
  ok("total supply decreased by reqAmount", supplyBefore - supplyAfter === reqAmount);

  // ── Scenario 5: cancel returns tokens ──────────────────────────────────
  header("5 — Investor cancels a separate pending request");
  const cancelAmount = 50n * 10n ** 6n;
  await (await projectToken.connect(investor).approve(rmAddr, cancelAmount)).wait();
  await (await (rm.connect(investor) as any).requestRedemption(cancelAmount, 1)).wait(); // 1 = Physical
  const cancelId = 1n;

  const investorBalBefore = await projectToken.balanceOf(investorAddr);
  await (await rm.connect(investor).cancel(cancelId)).wait();
  const cancelReq = await rm.requests(cancelId);
  const investorBalAfter = await projectToken.balanceOf(investorAddr);

  ok("request status == Cancelled (3)", cancelReq.status === 3n);
  ok("tokens returned to investor", investorBalAfter - investorBalBefore === cancelAmount);

  // ── Scenario 6: view all investor requests ─────────────────────────────
  header("6 — Investor request history");
  const ids = await rm.getInvestorRequests(investorAddr);
  console.log(`   investor request ids: [${ids.join(", ")}]`);
  ok("investor has 2 requests on record", ids.length === 2);

  console.log("\n══════════════════════════════════════════════════════════");
  console.log("ALL REDEMPTION FACTORY SCENARIOS PASSED");
  console.log("══════════════════════════════════════════════════════════");
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error("\nFAILED:", e?.message || e);
    process.exit(1);
  });
