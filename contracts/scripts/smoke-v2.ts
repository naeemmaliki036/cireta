/**
 * Cireta Platform — V2 Smoke Test
 *
 * Validates the v2 deployment end-to-end:
 *   1. Load v2 addresses (or self-deploy on local hardhat)
 *   2. Register a new test issuer (admin signer)
 *   3. Issuer deploys a Mintable token via v2 TokenFactory + platform IR
 *   4. Verify token + compliance auto-whitelisted on platform IR
 *   5. Issuer attaches CountryAllowModule + adds country code 826 (GB)
 *   6. Whitelist two investors, verify transfer between them passes
 *   7. Print success summary
 *
 * Usage:
 *   # Local hardhat (deploys fresh v2 suite inline):
 *   npx hardhat run scripts/smoke-v2.ts --network hardhat
 *
 *   # Base Sepolia (reads base-sepolia.v2.json):
 *   npx hardhat run scripts/smoke-v2.ts --network baseSepolia
 */

import { ethers, upgrades } from "hardhat";
import * as fs from "fs";
import * as path from "path";

// ── Types ──────────────────────────────────────────────────────────────────

interface SmokeResult {
  step: string;
  status: "PASS" | "FAIL" | "SKIP";
  details: string;
  txHash?: string;
}

// ── Helpers ────────────────────────────────────────────────────────────────

const results: SmokeResult[] = [];

function pass(step: string, details: string, txHash?: string) {
  results.push({ step, status: "PASS", details, txHash });
  console.log(`  PASS  ${step}: ${details.slice(0, 120)}`);
}

function fail(step: string, details: string) {
  results.push({ step, status: "FAIL", details });
  console.log(`  FAIL  ${step}: ${details.slice(0, 120)}`);
}

function skip(step: string, reason: string) {
  results.push({ step, status: "SKIP", details: reason });
  console.log(`  SKIP  ${step}: ${reason}`);
}

function log(msg: string) {
  console.log(`\n=== ${msg} ===`);
}

function getNetworkName(chainId: bigint, hn?: string): string {
  if (hn === "localhost" || hn === "hardhat") return "localhost";
  if (chainId === 84532n) return "base-sepolia";
  return "localhost";
}

// ── Inline deploy for local hardhat ───────────────────────────────────────

async function deployLocalV2(deployer: Awaited<ReturnType<typeof ethers.getSigners>>[0]): Promise<Record<string, string>> {
  console.log("  Deploying v2 suite inline for local hardhat...");
  const addr: Record<string, string> = {};

  async function deployProxy(contractName: string, initArgs: unknown[], opts: { unsafeAllow?: string[] } = {}): Promise<string> {
    const F = await ethers.getContractFactory(contractName);
    const proxyOpts: Record<string, unknown> = { kind: "uups" };
    if (opts.unsafeAllow) proxyOpts.unsafeAllow = opts.unsafeAllow;
    const proxy = await upgrades.deployProxy(F, initArgs, proxyOpts as Parameters<typeof upgrades.deployProxy>[2]);
    await proxy.waitForDeployment();
    return await proxy.getAddress();
  }

  async function deployImpl(contractName: string): Promise<string> {
    const F = await ethers.getContractFactory(contractName);
    const impl = await F.deploy();
    await impl.waitForDeployment();
    return await impl.getAddress();
  }

  // Registries
  addr["simpleIdentityRegistry"] = await deployProxy("SimpleIdentityRegistry",
    [deployer.address, ethers.ZeroAddress, ethers.ZeroAddress, ethers.ZeroAddress]);
  addr["issuerRegistry"] = await deployProxy("IssuerRegistry", [deployer.address]);
  addr["platformFeeManager"] = await deployProxy("PlatformFeeManager",
    [deployer.address, deployer.address, 200]);

  // Implementations
  addr["tokenImplementation"] = await deployImpl("CiretaToken");
  addr["simpleIdentityRegistryImplementation"] = await deployImpl("SimpleIdentityRegistry");
  addr["complianceImplementation"] = await deployImpl("ModularCompliance");
  addr["saleImplementation"] = await deployImpl("Sale");
  addr["vaultImplementation"] = await deployImpl("CiretaVault");
  addr["fractionTokenImplementation"] = await deployImpl("CiretaFractionToken1155");
  addr["otcTokenImplementation"] = await deployImpl("IssuerOTCToken");

  // Factories
  addr["tokenFactory"] = await deployProxy("CiretaTokenFactory", [
    deployer.address,
    addr["tokenImplementation"],
    addr["simpleIdentityRegistryImplementation"],
    addr["complianceImplementation"],
    ethers.ZeroAddress, ethers.ZeroAddress, ethers.ZeroAddress,
    addr["issuerRegistry"],
  ]);
  addr["saleFactory"] = await deployProxy("CiretaSaleFactory", [deployer.address, addr["saleImplementation"]]);
  addr["fractionFactory"] = await deployProxy("CiretaFractionFactory",
    [deployer.address, addr["fractionTokenImplementation"], addr["vaultImplementation"]],
    { unsafeAllow: ["constructor"] });
  addr["otcTokenFactory"] = await deployProxy("IssuerOTCTokenFactory", [deployer.address, addr["otcTokenImplementation"]]);

  // Compliance modules
  for (const [key, name] of [
    ["countryAllowModule","CountryAllowModule"],
    ["maxHolderCountModule","MaxHolderCountModule"],
  ] as const) {
    addr[key] = await deployProxy(name, [deployer.address]);
  }

  // Wire up
  const REGISTRAR_ROLE = ethers.keccak256(ethers.toUtf8Bytes("REGISTRAR_ROLE"));
  const sir = (await ethers.getContractFactory("SimpleIdentityRegistry")).attach(addr["simpleIdentityRegistry"]) as unknown as {
    grantRole(role: string, addr: string): Promise<{ wait(): Promise<void> }>;
  };
  for (const factoryKey of ["tokenFactory","saleFactory","fractionFactory","otcTokenFactory"]) {
    await (await sir.grantRole(REGISTRAR_ROLE, addr[factoryKey])).wait();
  }

  const tf = (await ethers.getContractFactory("CiretaTokenFactory")).attach(addr["tokenFactory"]) as unknown as {
    setSimpleIdentityMode(v: boolean): Promise<{ wait(): Promise<void> }>;
  };
  await (await tf.setSimpleIdentityMode(true)).wait();

  const sf = (await ethers.getContractFactory("CiretaSaleFactory")).attach(addr["saleFactory"]) as unknown as {
    setIssuerRegistry(a: string): Promise<{ wait(): Promise<void> }>;
    setPlatformFeeManager(a: string): Promise<{ wait(): Promise<void> }>;
    setFractionFactory(a: string): Promise<{ wait(): Promise<void> }>;
  };
  await (await sf.setIssuerRegistry(addr["issuerRegistry"])).wait();
  await (await sf.setPlatformFeeManager(addr["platformFeeManager"])).wait();
  await (await sf.setFractionFactory(addr["fractionFactory"])).wait();

  const otcF = (await ethers.getContractFactory("IssuerOTCTokenFactory")).attach(addr["otcTokenFactory"]) as unknown as {
    setIssuerRegistry(a: string): Promise<{ wait(): Promise<void> }>;
  };
  await (await otcF.setIssuerRegistry(addr["issuerRegistry"])).wait();

  const ff = (await ethers.getContractFactory("CiretaFractionFactory")).attach(addr["fractionFactory"]) as unknown as {
    transferOwnership(a: string): Promise<{ wait(): Promise<void> }>;
  };
  await (await ff.transferOwnership(addr["saleFactory"])).wait();

  // testnet USDC mock
  const usdcF = await ethers.getContractFactory("CiretaUSDC");
  const usdc = await usdcF.deploy();
  await usdc.waitForDeployment();
  addr["ciretaUSDC"] = await usdc.getAddress();

  console.log(`  Inline v2 deploy: ${Object.keys(addr).length} contracts`);
  return addr;
}

// ── Main ───────────────────────────────────────────────────────────────────

async function main() {
  const signers = await ethers.getSigners();
  const admin = signers[0];

  const network = await ethers.provider.getNetwork();
  const hn = process.env.HARDHAT_NETWORK;
  const networkName = getNetworkName(network.chainId, hn);
  const isLocal = networkName === "localhost";

  console.log("\n╔══════════════════════════════════════════════════════════╗");
  console.log("║         CIRETA V2 SMOKE TEST                            ║");
  console.log("╚══════════════════════════════════════════════════════════╝");
  console.log(`  Network:  ${networkName}`);
  console.log(`  Admin:    ${admin.address}`);

  // ── Step 0: Load or deploy addresses ──────────────────────────────────

  log("Step 0: Load v2 addresses");

  let ADDR: Record<string, string>;

  if (isLocal) {
    ADDR = await deployLocalV2(admin);
    pass("0-LoadAddresses", `Deployed ${Object.keys(ADDR).length} contracts inline on local hardhat`);
  } else {
    const DEPLOYMENTS_DIR = path.join(__dirname, "..", "deployments");
    // Pick the most recent date-stamped v2 file (e.g. base-sepolia.v2.20260430.json),
    // or fall back to a non-stamped file for back-compat. Override with V2_FILE=<path>.
    let v2File: string;
    if (process.env.V2_FILE) {
      v2File = path.isAbsolute(process.env.V2_FILE)
        ? process.env.V2_FILE
        : path.join(DEPLOYMENTS_DIR, process.env.V2_FILE);
    } else {
      const stamped = fs.readdirSync(DEPLOYMENTS_DIR)
        .filter(f => /^base-sepolia\.v2\.\d{8}\.json$/.test(f))
        .sort()
        .reverse();
      v2File = stamped.length > 0
        ? path.join(DEPLOYMENTS_DIR, stamped[0])
        : path.join(DEPLOYMENTS_DIR, "base-sepolia.v2.json");
    }
    if (!fs.existsSync(v2File)) {
      console.error(`  ERROR: ${v2File} not found. Run deploy-v2.ts first.`);
      process.exit(1);
    }
    console.log(`  Loading addresses from ${path.basename(v2File)}`);
    ADDR = JSON.parse(fs.readFileSync(v2File, "utf-8")) as Record<string, string>;
    for (const k of ["simpleIdentityRegistry","issuerRegistry","platformFeeManager",
                      "tokenFactory","saleFactory","countryAllowModule","ciretaUSDC"]) {
      if (!ADDR[k]) {
        console.error(`  ERROR: missing address for ${k} in v2 file`);
        process.exit(1);
      }
    }
    pass("0-LoadAddresses", `Loaded ${Object.keys(ADDR).length} addresses from ${path.basename(v2File)}`);
  }

  // ── Step 1: Register test issuer ───────────────────────────────────────

  log("Step 1: Register test issuer");

  const issuer = isLocal && signers.length > 1
    ? signers[1]
    : ethers.Wallet.createRandom().connect(ethers.provider);

  console.log(`  Issuer wallet: ${issuer.address}`);

  // Fund issuer if needed
  {
    const bal = await ethers.provider.getBalance(issuer.address);
    if (bal < ethers.parseEther("0.5")) {
      const tx = await admin.sendTransaction({ to: issuer.address, value: ethers.parseEther("2") });
      await tx.wait();
      console.log(`  Funded issuer with 2 ETH`);
    }
  }

  // Attach IssuerRegistry through admin signer
  const issuerRegistryIface = (await ethers.getContractFactory("IssuerRegistry")).interface;
  const issuerRegistry = new ethers.Contract(ADDR["issuerRegistry"], issuerRegistryIface, admin);

  try {
    const alreadyActive = await issuerRegistry.isActiveIssuer(issuer.address) as boolean;
    if (!alreadyActive) {
      const tx1 = await (issuerRegistry.connect(admin) as typeof issuerRegistry).registerIssuer(
        issuer.address, "Smoke Test Issuer", "GB"
      ) as { wait(): Promise<unknown>; hash: string };
      await tx1.wait();

      const tx2 = await (issuerRegistry.connect(admin) as typeof issuerRegistry).activateIssuer(issuer.address) as { wait(): Promise<unknown>; hash: string };
      await tx2.wait();
      pass("1-RegisterIssuer", `Issuer ${issuer.address.slice(0, 10)}... registered & activated`, tx2.hash);
    } else {
      pass("1-RegisterIssuer", "Issuer already active");
    }
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    fail("1-RegisterIssuer", msg.slice(0, 200));
    console.log("  Continuing despite issuer registration failure...");
  }

  // Whitelist issuer on platform IR (issuer must be verified for Sale.initialize)
  const sirIface = (await ethers.getContractFactory("SimpleIdentityRegistry")).interface;
  const sir = new ethers.Contract(ADDR["simpleIdentityRegistry"], sirIface, admin);

  try {
    const isVerified = await sir.isVerified(issuer.address) as boolean;
    if (!isVerified) {
      const tx = await (sir.connect(admin) as typeof sir).addToWhitelist(issuer.address, 826) as { wait(): Promise<unknown> };
      await tx.wait();
      console.log(`  Issuer whitelisted on platform IR (country 826)`);
    } else {
      console.log(`  Issuer already whitelisted on IR`);
    }
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.log(`  WARN: Whitelist issuer: ${msg.slice(0, 80)}`);
  }

  // ── Step 2: Deploy token via v2 TokenFactory ──────────────────────────

  log("Step 2: Deploy Mintable token via v2 TokenFactory");

  let tokenAddr = "";
  let complianceAddr = "";

  try {
    const tokenFactoryIface = (await ethers.getContractFactory("CiretaTokenFactory")).interface;
    const tokenFactory = new ethers.Contract(ADDR["tokenFactory"], tokenFactoryIface, issuer);

    const maxSupply = ethers.parseUnits("1000000", 6);
    const initialMint = ethers.parseUnits("500000", 6);

    const tx = await (tokenFactory.connect(issuer) as typeof tokenFactory).deployToken(
      "Smoke Test Gold Token",
      "STGT",
      6,
      issuer.address,
      ADDR["simpleIdentityRegistry"],
      maxSupply,
      true,
      initialMint
    ) as { wait(): Promise<{ hash: string; logs: Array<{ topics: string[]; data: string; address: string }> }>; hash: string };

    const receipt = await tx.wait();

    // Parse TokenDeployed event
    const tokenDeployedTopic = tokenFactoryIface.getEvent("TokenDeployed").topicHash;
    let found = false;
    if (receipt && receipt.logs) {
      for (const rawLog of receipt.logs) {
        if (rawLog.topics[0] === tokenDeployedTopic) {
          const parsed = tokenFactoryIface.parseLog(rawLog);
          if (parsed) {
            tokenAddr = parsed.args[0] as string;
            // identityRegistry is args[1], compliance is args[2]
            complianceAddr = parsed.args[2] as string;
            found = true;
            break;
          }
        }
      }
    }

    if (found && tokenAddr) {
      pass("2-DeployToken",
        `token=${tokenAddr.slice(0,10)}... compliance=${complianceAddr.slice(0,10)}...`,
        receipt?.hash
      );
    } else {
      fail("2-DeployToken", "TokenDeployed event not found in receipt");
    }
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    fail("2-DeployToken", msg.slice(0, 200));
  }

  // ── Step 3: Verify auto-whitelist ─────────────────────────────────────

  log("Step 3: Verify token + compliance auto-whitelisted on platform IR");

  if (!tokenAddr || !complianceAddr) {
    skip("3-AutoWhitelist", "No token deployed");
  } else {
    try {
      const tokenWhitelisted = await sir.isVerified(tokenAddr) as boolean;
      const compWhitelisted = await sir.isVerified(complianceAddr) as boolean;

      if (tokenWhitelisted && compWhitelisted) {
        pass("3-AutoWhitelist", `token: ${tokenWhitelisted}, compliance: ${compWhitelisted}`);
      } else {
        fail("3-AutoWhitelist",
          `token=${tokenWhitelisted}, compliance=${compWhitelisted}. ` +
          `Check REGISTRAR_ROLE on IR ${ADDR["simpleIdentityRegistry"]}`
        );
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      fail("3-AutoWhitelist", msg.slice(0, 200));
    }
  }

  // ── Step 4: Attach CountryAllowModule ─────────────────────────────────

  log("Step 4: Attach CountryAllowModule + add country 826 (GB)");

  if (!complianceAddr) {
    skip("4-CountryModule", "No compliance address");
  } else {
    try {
      const complianceIface = (await ethers.getContractFactory("ModularCompliance")).interface;
      const compliance = new ethers.Contract(complianceAddr, complianceIface, issuer);

      const countryModuleIface = (await ethers.getContractFactory("CountryAllowModule")).interface;
      const bindSelector = countryModuleIface.getFunction("bindCompliance").selector;
      const addCountrySelector = countryModuleIface.getFunction("addAllowedCountry").selector;

      // Allow selectors so callModuleFunction can forward them
      await ((compliance.connect(issuer) as typeof compliance)
        .setAllowedSelector(bindSelector, true) as Promise<{ wait(): Promise<void> }>).then(tx => tx.wait());
      await ((compliance.connect(issuer) as typeof compliance)
        .setAllowedSelector(addCountrySelector, true) as Promise<{ wait(): Promise<void> }>).then(tx => tx.wait());

      // Add module
      await ((compliance.connect(issuer) as typeof compliance)
        .addModule(ADDR["countryAllowModule"]) as Promise<{ wait(): Promise<void> }>).then(tx => tx.wait());

      // Bind compliance to the module (issuer owns the compliance)
      const countryModule = new ethers.Contract(ADDR["countryAllowModule"], countryModuleIface, issuer);
      await ((countryModule.connect(issuer) as typeof countryModule)
        .bindCompliance(complianceAddr) as Promise<{ wait(): Promise<void> }>).then(tx => tx.wait());

      // Add country 826 (GB)
      const addTx = await (countryModule.connect(issuer) as typeof countryModule)
        .addAllowedCountry(complianceAddr, 826) as { wait(): Promise<void>; hash: string };
      await addTx.wait();

      const isAllowed = await countryModule.isCountryAllowed(complianceAddr, 826) as boolean;
      if (isAllowed) {
        pass("4-CountryModule", "CountryAllowModule bound, country 826 (GB) allowed", addTx.hash);
      } else {
        fail("4-CountryModule", "Country 826 not marked allowed after addAllowedCountry");
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      fail("4-CountryModule", msg.slice(0, 200));
    }
  }

  // ── Step 5: Transfer between KYC'd wallets ────────────────────────────

  log("Step 5: Transfer tokens between two KYC'd wallets");

  if (!tokenAddr) {
    skip("5-Transfer", "No token deployed");
  } else {
    try {
      const investor1 = isLocal && signers.length > 2
        ? signers[2]
        : ethers.Wallet.createRandom().connect(ethers.provider);
      const investor2 = isLocal && signers.length > 3
        ? signers[3]
        : ethers.Wallet.createRandom().connect(ethers.provider);

      console.log(`  Investor1: ${investor1.address}`);
      console.log(`  Investor2: ${investor2.address}`);

      // Fund investors for gas
      for (const inv of [investor1, investor2]) {
        const bal = await ethers.provider.getBalance(inv.address);
        if (bal < ethers.parseEther("0.1")) {
          await (await admin.sendTransaction({ to: inv.address, value: ethers.parseEther("1") })).wait();
        }
      }

      // Whitelist both investors on platform IR
      for (const inv of [investor1, investor2]) {
        const isVerified = await sir.isVerified(inv.address) as boolean;
        if (!isVerified) {
          await ((sir.connect(admin) as typeof sir)
            .addToWhitelist(inv.address, 826) as Promise<{ wait(): Promise<void> }>).then(tx => tx.wait());
        }
      }

      // Attach token as issuer
      const tokenIface = (await ethers.getContractFactory("CiretaToken")).interface;
      const tokenContract = new ethers.Contract(tokenAddr, tokenIface, issuer);

      const transferAmount = ethers.parseUnits("1000", 6);

      // Issuer → Investor1
      await ((tokenContract.connect(issuer) as typeof tokenContract)
        .transfer(investor1.address, transferAmount) as Promise<{ wait(): Promise<void> }>).then(tx => tx.wait());

      // Investor1 → Investor2
      const tx2 = await (tokenContract.connect(investor1) as typeof tokenContract)
        .transfer(investor2.address, ethers.parseUnits("500", 6)) as { wait(): Promise<void>; hash: string };
      await tx2.wait();

      const bal2 = await tokenContract.balanceOf(investor2.address) as bigint;
      if (bal2 >= ethers.parseUnits("500", 6)) {
        pass("5-Transfer",
          `Investor2 received ${ethers.formatUnits(bal2, 6)} STGT`,
          tx2.hash
        );
      } else {
        fail("5-Transfer", `Investor2 balance too low: ${ethers.formatUnits(bal2, 6)}`);
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      fail("5-Transfer", msg.slice(0, 200));
    }
  }

  // ── Summary ───────────────────────────────────────────────────────────

  log("SUMMARY");

  const passCount = results.filter(r => r.status === "PASS").length;
  const failCount = results.filter(r => r.status === "FAIL").length;
  const skipCount = results.filter(r => r.status === "SKIP").length;

  console.log(`\n  ${passCount} PASS  /  ${failCount} FAIL  /  ${skipCount} SKIP\n`);

  for (const r of results) {
    const icon = r.status === "PASS" ? "v" : r.status === "FAIL" ? "x" : "~";
    console.log(`  [${r.status}] ${icon} ${r.step}: ${r.details.slice(0, 120)}`);
    if (r.txHash) {
      const txUrl = networkName === "base-sepolia"
        ? `https://sepolia.basescan.org/tx/${r.txHash}`
        : r.txHash;
      console.log(`             TX: ${txUrl}`);
    }
  }

  if (failCount > 0) {
    console.log(`\n  ${failCount} step(s) failed. See above.`);
    process.exit(1);
  } else {
    console.log("\n  All smoke tests passed. V2 deployment is healthy.");
  }
}

main().catch((e) => {
  console.error("Fatal:", e instanceof Error ? e.message : String(e));
  process.exit(1);
});
