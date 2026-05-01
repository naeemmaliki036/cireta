/**
 * Upgrade v2 platform implementations to v2.1 (event-coverage release).
 *
 * Two tiers handled in one run:
 *
 *   Tier 1 — UUPS proxies pointing at new impls (admin signs upgradeToAndCall):
 *     - SimpleIdentityRegistry
 *     - IssuerRegistry
 *     - PlatformFeeManager
 *     - CiretaTokenFactory
 *     - CiretaSaleFactory
 *     - IssuerOTCTokenFactory
 *
 *     CiretaFractionFactory is intentionally SKIPPED here because its proxy
 *     is owned by CiretaSaleFactory (not admin), so upgradeToAndCall must be
 *     issued from SaleFactory and there is no helper for that today. The new
 *     events on FractionFactory are nice-to-have (delegated setter logging);
 *     skip is safe — see the upgrade plan in docs.
 *
 *   Tier 2 — factory pointer updates so future deployments use the new impls:
 *     - CiretaTokenFactory.updateImplementations(token, identityRegistry, compliance)
 *     - CiretaSaleFactory.setSaleImplementation(sale)
 *     - CiretaSaleFactory.setFractionVaultImpl(vault)        (delegates to FractionFactory)
 *     - CiretaSaleFactory.setFractionTokenImpl(fractionToken) (delegates to FractionFactory)
 *     - IssuerOTCTokenFactory.setOTCTokenImplementation(otcToken)
 *
 * Idempotent: each upgrade reads the current impl slot first and skips when
 * already at the freshly-deployed address. Re-runs after a partial failure
 * are safe.
 *
 * Authorization: the connected signer must be V2_ADMIN_ADDRESS (deployer was
 * stripped of DEFAULT_ADMIN_ROLE at the end of the v2 deploy). Set
 * `IDENTITY_SIGNER_PRIVATE_KEY` to the admin's key for the duration of the
 * run. The script fails fast if the connected signer doesn't match.
 *
 * Usage:
 *   cd contracts
 *   IDENTITY_SIGNER_PRIVATE_KEY=<admin-key> \
 *     WEB3_RPC_URL=https://base-sepolia.infura.io/v3/<infura-key> \
 *     V2_FILE=base-sepolia.v2.20260430.json \
 *     ./node_modules/.bin/hardhat run scripts/upgrade-impls-v2.1.ts --network baseSepolia
 *
 *   Output → deployments/<network>.v2.1.<date>.json
 */

import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";

// ── Constants ───────────────────────────────────────────────────────────────

const SLEEP_MS = 350; // Pause between RPC writes — keep public RPCs happy.
const ERC1967_IMPL_SLOT =
  "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc";

// Minimal ABIs — keeps us off OZ-typed factories so we can interact with proxies
// regardless of ABI/typechain shape after the upgrade.
const UUPS_ABI = [
  "function upgradeToAndCall(address newImplementation, bytes data) payable",
  "function upgradeTo(address newImplementation)",
];
const OWNABLE_ABI = ["function owner() view returns (address)"];
const TOKEN_FACTORY_ABI = [
  "function tokenImplementation() view returns (address)",
  "function identityRegistryImplementation() view returns (address)",
  "function complianceImplementation() view returns (address)",
  "function updateImplementations(address,address,address) external",
];
const SALE_FACTORY_ABI = [
  "function saleImplementation() view returns (address)",
  "function setSaleImplementation(address) external",
  "function setFractionVaultImpl(address) external",
  "function setFractionTokenImpl(address) external",
];
const FRACTION_FACTORY_ABI = [
  "function vaultImplementation() view returns (address)",
  "function fractionTokenImplementation() view returns (address)",
];
const OTC_FACTORY_ABI = [
  "function otcTokenImplementation() view returns (address)",
  "function setOTCTokenImplementation(address) external",
];

// ── Helpers ─────────────────────────────────────────────────────────────────

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function loadV2File(): { addr: Record<string, string>; file: string } {
  const dir = path.join(__dirname, "..", "deployments");
  let file: string;
  if (process.env.V2_FILE) {
    file = path.isAbsolute(process.env.V2_FILE)
      ? process.env.V2_FILE
      : path.join(dir, process.env.V2_FILE);
  } else {
    const stamped = fs
      .readdirSync(dir)
      .filter((f) => /^base-sepolia\.v2\.\d{8}\.json$/.test(f))
      .sort()
      .reverse();
    if (stamped.length === 0) {
      throw new Error(
        "No deployments/base-sepolia.v2.<date>.json found. Set V2_FILE=... or run deploy-v2 first.",
      );
    }
    file = path.join(dir, stamped[0]);
  }
  return { addr: JSON.parse(fs.readFileSync(file, "utf-8")), file };
}

async function readImpl(proxy: string): Promise<string> {
  const slot = await ethers.provider.getStorage(proxy, ERC1967_IMPL_SLOT);
  // Last 20 bytes of the slot are the impl address.
  return ethers.getAddress("0x" + slot.slice(-40));
}

interface PhaseLog { label: string; ok: boolean; detail?: string; tx?: string }
const log: PhaseLog[] = [];
function record(label: string, ok: boolean, detail?: string, tx?: string) {
  log.push({ label, ok, detail, tx });
  const tag = ok ? "✓" : "✗";
  console.log(`  ${tag} ${label.padEnd(48)} ${detail ?? ""}${tx ? ` tx=${tx.slice(0, 10)}…` : ""}`);
}

// ── Phase 1: Deploy all new impls ───────────────────────────────────────────

interface NewImpls {
  token: string;
  simpleIdentityRegistry: string;
  modularCompliance: string;
  sale: string;
  vault: string;
  fractionToken1155: string;
  otcToken: string;
  // Proxy impls (the contracts themselves, not their templates)
  issuerRegistry: string;
  platformFeeManager: string;
  tokenFactory: string;
  saleFactory: string;
  otcTokenFactory: string;
}

async function deployImpl(name: string, ctorArgs: unknown[] = []): Promise<string> {
  const Factory = await ethers.getContractFactory(name);
  const impl = await Factory.deploy(...ctorArgs);
  await impl.waitForDeployment();
  const addr = await impl.getAddress();
  await sleep(SLEEP_MS);
  return addr;
}

async function deployAllImpls(): Promise<NewImpls> {
  console.log("\n=== Phase 1: Deploy new implementations ===");
  const out: Partial<NewImpls> = {};

  out.token = await deployImpl("CiretaToken");
  record("CiretaToken impl", true, out.token);

  out.simpleIdentityRegistry = await deployImpl("SimpleIdentityRegistry");
  record("SimpleIdentityRegistry impl", true, out.simpleIdentityRegistry);

  out.modularCompliance = await deployImpl("ModularCompliance");
  record("ModularCompliance impl", true, out.modularCompliance);

  out.sale = await deployImpl("Sale");
  record("Sale impl", true, out.sale);

  out.vault = await deployImpl("CiretaVault");
  record("CiretaVault impl", true, out.vault);

  out.fractionToken1155 = await deployImpl("CiretaFractionToken1155");
  record("CiretaFractionToken1155 impl", true, out.fractionToken1155);

  out.otcToken = await deployImpl("IssuerOTCToken");
  record("IssuerOTCToken impl", true, out.otcToken);

  out.issuerRegistry = await deployImpl("IssuerRegistry");
  record("IssuerRegistry impl", true, out.issuerRegistry);

  out.platformFeeManager = await deployImpl("PlatformFeeManager");
  record("PlatformFeeManager impl", true, out.platformFeeManager);

  out.tokenFactory = await deployImpl("CiretaTokenFactory");
  record("CiretaTokenFactory impl", true, out.tokenFactory);

  out.saleFactory = await deployImpl("CiretaSaleFactory");
  record("CiretaSaleFactory impl", true, out.saleFactory);

  out.otcTokenFactory = await deployImpl("IssuerOTCTokenFactory");
  record("IssuerOTCTokenFactory impl", true, out.otcTokenFactory);

  return out as NewImpls;
}

// ── Phase 2: Upgrade Tier 1 proxies ─────────────────────────────────────────

async function upgradeProxy(
  label: string,
  proxyAddr: string,
  newImpl: string,
  signer: ethers.Signer,
): Promise<void> {
  if (!proxyAddr) {
    record(label, false, "no proxy address — skip");
    return;
  }
  const currentImpl = await readImpl(proxyAddr);
  if (currentImpl.toLowerCase() === newImpl.toLowerCase()) {
    record(label, true, `already at ${newImpl.slice(0, 10)}…`);
    return;
  }
  try {
    const proxy = new ethers.Contract(proxyAddr, UUPS_ABI, signer);
    const tx = await proxy.upgradeToAndCall(newImpl, "0x");
    const receipt = await tx.wait();
    if (!receipt || receipt.status !== 1) {
      record(label, false, `tx reverted or no receipt`, receipt?.hash);
      return;
    }
    // Verify the impl slot updated. Public RPCs sometimes lag the just-mined
    // block by a second or two — poll up to 5 times before giving up.
    let after = await readImpl(proxyAddr);
    for (let i = 0; i < 5 && after.toLowerCase() !== newImpl.toLowerCase(); i++) {
      await sleep(1500);
      after = await readImpl(proxyAddr);
    }
    if (after.toLowerCase() !== newImpl.toLowerCase()) {
      record(label, false, `impl slot did not update after retries — got ${after}`, receipt?.hash);
      return;
    }
    record(label, true, `${currentImpl.slice(0, 10)}… → ${newImpl.slice(0, 10)}…`, receipt?.hash);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    record(label, false, msg.slice(0, 80));
  }
  await sleep(SLEEP_MS);
}

async function upgradeAllProxies(addr: Record<string, string>, impls: NewImpls, signer: ethers.Signer) {
  console.log("\n=== Phase 2: Upgrade Tier 1 proxies ===");
  await upgradeProxy("SimpleIdentityRegistry", addr.simpleIdentityRegistry, impls.simpleIdentityRegistry, signer);
  await upgradeProxy("IssuerRegistry",         addr.issuerRegistry,         impls.issuerRegistry,         signer);
  await upgradeProxy("PlatformFeeManager",     addr.platformFeeManager,     impls.platformFeeManager,     signer);
  await upgradeProxy("CiretaTokenFactory",     addr.tokenFactory,           impls.tokenFactory,           signer);
  await upgradeProxy("CiretaSaleFactory",      addr.saleFactory,            impls.saleFactory,            signer);
  await upgradeProxy("IssuerOTCTokenFactory",  addr.otcTokenFactory,        impls.otcTokenFactory,        signer);
  console.log("  CiretaFractionFactory:                       skipped (owned by SaleFactory; see header note)");
}

// ── Phase 3: Update factory template pointers ───────────────────────────────

async function updateFactoryPointers(
  addr: Record<string, string>,
  impls: NewImpls,
  signer: ethers.Signer,
) {
  console.log("\n=== Phase 3: Update factory template pointers ===");

  // CiretaTokenFactory.updateImplementations(token, idRegistry, compliance)
  try {
    const tf = new ethers.Contract(addr.tokenFactory, TOKEN_FACTORY_ABI, signer);
    const curToken = await tf.tokenImplementation();
    const curIdReg = await tf.identityRegistryImplementation();
    const curCmp = await tf.complianceImplementation();
    const same =
      curToken.toLowerCase() === impls.token.toLowerCase() &&
      curIdReg.toLowerCase() === impls.simpleIdentityRegistry.toLowerCase() &&
      curCmp.toLowerCase() === impls.modularCompliance.toLowerCase();
    if (same) {
      record("TokenFactory.updateImplementations", true, "already pointing at new impls");
    } else {
      const tx = await tf.updateImplementations(impls.token, impls.simpleIdentityRegistry, impls.modularCompliance);
      const r = await tx.wait();
      record("TokenFactory.updateImplementations", true, "token+idRegistry+compliance", r?.hash);
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    record("TokenFactory.updateImplementations", false, msg.slice(0, 80));
  }
  await sleep(SLEEP_MS);

  // CiretaSaleFactory.setSaleImplementation
  try {
    const sf = new ethers.Contract(addr.saleFactory, SALE_FACTORY_ABI, signer);
    const cur = await sf.saleImplementation();
    if (cur.toLowerCase() === impls.sale.toLowerCase()) {
      record("SaleFactory.setSaleImplementation", true, "already at new impl");
    } else {
      const tx = await sf.setSaleImplementation(impls.sale);
      const r = await tx.wait();
      record("SaleFactory.setSaleImplementation", true, `→ ${impls.sale.slice(0, 10)}…`, r?.hash);
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    record("SaleFactory.setSaleImplementation", false, msg.slice(0, 80));
  }
  await sleep(SLEEP_MS);

  // CiretaSaleFactory.setFractionVaultImpl  (delegates to FractionFactory.setVaultImplementation)
  try {
    const sf = new ethers.Contract(addr.saleFactory, SALE_FACTORY_ABI, signer);
    const ff = new ethers.Contract(addr.fractionFactory, FRACTION_FACTORY_ABI, ethers.provider);
    const cur = await ff.vaultImplementation();
    if (cur.toLowerCase() === impls.vault.toLowerCase()) {
      record("SaleFactory.setFractionVaultImpl", true, "already at new impl");
    } else {
      const tx = await sf.setFractionVaultImpl(impls.vault);
      const r = await tx.wait();
      record("SaleFactory.setFractionVaultImpl", true, `vault → ${impls.vault.slice(0, 10)}…`, r?.hash);
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    record("SaleFactory.setFractionVaultImpl", false, msg.slice(0, 80));
  }
  await sleep(SLEEP_MS);

  // CiretaSaleFactory.setFractionTokenImpl (delegates to FractionFactory.setFractionTokenImplementation)
  try {
    const sf = new ethers.Contract(addr.saleFactory, SALE_FACTORY_ABI, signer);
    const ff = new ethers.Contract(addr.fractionFactory, FRACTION_FACTORY_ABI, ethers.provider);
    const cur = await ff.fractionTokenImplementation();
    if (cur.toLowerCase() === impls.fractionToken1155.toLowerCase()) {
      record("SaleFactory.setFractionTokenImpl", true, "already at new impl");
    } else {
      const tx = await sf.setFractionTokenImpl(impls.fractionToken1155);
      const r = await tx.wait();
      record("SaleFactory.setFractionTokenImpl", true, `fraction → ${impls.fractionToken1155.slice(0, 10)}…`, r?.hash);
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    record("SaleFactory.setFractionTokenImpl", false, msg.slice(0, 80));
  }
  await sleep(SLEEP_MS);

  // IssuerOTCTokenFactory.setOTCTokenImplementation
  try {
    const otc = new ethers.Contract(addr.otcTokenFactory, OTC_FACTORY_ABI, signer);
    const cur = await otc.otcTokenImplementation();
    if (cur.toLowerCase() === impls.otcToken.toLowerCase()) {
      record("OTCFactory.setOTCTokenImplementation", true, "already at new impl");
    } else {
      const tx = await otc.setOTCTokenImplementation(impls.otcToken);
      const r = await tx.wait();
      record("OTCFactory.setOTCTokenImplementation", true, `→ ${impls.otcToken.slice(0, 10)}…`, r?.hash);
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    record("OTCFactory.setOTCTokenImplementation", false, msg.slice(0, 80));
  }
}

// ── Main ────────────────────────────────────────────────────────────────────

async function main() {
  const { addr, file } = loadV2File();
  console.log(`Loaded addresses from: ${path.basename(file)}`);

  const [signer] = await ethers.getSigners();
  const network = await ethers.provider.getNetwork();
  const balance = await ethers.provider.getBalance(signer.address);
  console.log(`Signer:  ${signer.address}`);
  console.log(`Network: ${network.name} (chainId ${network.chainId})`);
  console.log(`Balance: ${ethers.formatEther(balance)} ETH`);

  // Authorization check — admin only.
  const expectedAdmin = process.env.V2_ADMIN_ADDRESS ?? addr.admin;
  if (!expectedAdmin) {
    throw new Error("V2_ADMIN_ADDRESS not set and no `admin` field in v2 file — cannot verify signer.");
  }
  if (signer.address.toLowerCase() !== expectedAdmin.toLowerCase()) {
    throw new Error(
      `Connected signer ${signer.address} != expected admin ${expectedAdmin}. ` +
      `Tier 1 upgrades + Tier 2 setters all require the admin wallet. ` +
      `Set IDENTITY_SIGNER_PRIVATE_KEY to the admin's key.`,
    );
  }
  console.log(`✓ Signer matches V2_ADMIN_ADDRESS`);

  // Sanity: verify the proxies are owned by admin (skip FractionFactory — owned by SaleFactory).
  for (const k of ["simpleIdentityRegistry", "issuerRegistry", "platformFeeManager", "tokenFactory", "saleFactory", "otcTokenFactory"]) {
    if (!addr[k]) continue;
    try {
      const c = new ethers.Contract(addr[k], OWNABLE_ABI, ethers.provider);
      const owner = await c.owner();
      if (owner.toLowerCase() !== expectedAdmin.toLowerCase()) {
        console.log(`  WARN: ${k} owner = ${owner} (expected admin ${expectedAdmin})`);
      }
    } catch { /* not Ownable; AccessControl-only — skip */ }
  }

  // Phase 1: deploy new impls.
  const impls = await deployAllImpls();

  // Phase 2: upgrade UUPS proxies.
  await upgradeAllProxies(addr, impls, signer);

  // Phase 3: update factory template pointers.
  await updateFactoryPointers(addr, impls, signer);

  // ── Save manifest ────────────────────────────────────────────────────────
  const today = new Date();
  const stamp = `${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, "0")}${String(today.getDate()).padStart(2, "0")}`;
  const networkPrefix = network.chainId === 84532n ? "base-sepolia" : network.chainId === 31337n ? "localhost" : `chain-${network.chainId}`;
  const outPath = path.join(__dirname, "..", "deployments", `${networkPrefix}.v2.1.${stamp}.json`);
  const out = {
    upgradedAt: new Date().toISOString(),
    network: networkPrefix,
    admin: expectedAdmin,
    sourceV2File: path.basename(file),
    newImplementations: impls,
    proxies: {
      simpleIdentityRegistry: addr.simpleIdentityRegistry,
      issuerRegistry: addr.issuerRegistry,
      platformFeeManager: addr.platformFeeManager,
      tokenFactory: addr.tokenFactory,
      saleFactory: addr.saleFactory,
      fractionFactory: addr.fractionFactory,
      otcTokenFactory: addr.otcTokenFactory,
    },
    log,
  };
  fs.writeFileSync(outPath, JSON.stringify(out, null, 2));

  // ── Summary ──────────────────────────────────────────────────────────────
  console.log("\n╔══════════════════════════════════════════════════════════╗");
  console.log("║         V2.1 UPGRADE COMPLETE                            ║");
  console.log("╚══════════════════════════════════════════════════════════╝");
  const failed = log.filter((l) => !l.ok);
  console.log(`  Output:  ${outPath}`);
  console.log(`  Total:   ${log.length} steps, ${failed.length} failed`);

  if (failed.length > 0) {
    console.log("\n── Failures ─────────────────────────────────────────────");
    for (const f of failed) console.log(`  ✗ ${f.label}: ${f.detail}`);
    process.exit(1);
  }

  const finalBalance = await ethers.provider.getBalance(signer.address);
  console.log(`\n  Gas spent: ${ethers.formatEther(balance - finalBalance)} ETH`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
