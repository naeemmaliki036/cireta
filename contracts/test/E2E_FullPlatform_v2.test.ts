/**
 * E2E_FullPlatform_v2.test.ts
 *
 * Integrated full-platform lifecycle test covering all three role perspectives:
 * Admin, Issuer, and Investor — in a single coherent flow.
 *
 * Sections:
 *   A. Platform bootstrap (admin deploys + wires all contracts)
 *   B. Admin issuer registration — 3-tx flow (register, activate, IR-whitelist)
 *   C. Issuer self-serve: deploy Mintable token (maxSupply guard)
 *   D. Issuer self-serve: deploy Fixed-Supply token (SUPPLY_ROLE revoked)
 *   E. Issuer attaches CountryAllowModule + MaxHolderCountModule
 *   F. Cross-issuer compliance isolation
 *   G. Issuer deploys Vested sale — cliff+linear variant
 *   H. Issuer deploys Vested sale — lock-up-only variant (cliff == vesting)
 *   I. Investor buys from active sale
 *   J. Transfer compliance enforcement (country block + non-verified block)
 *   K. Vault claim math: cliff+linear at 3 time points
 *   L. Vault claim math: lock-up-only at 2 time points
 *   M. Refund flow: sale misses soft cap
 *   N. Admin role boundary: admin CANNOT mint (no SUPPLY_ROLE)
 *   O. Sale pause / unpause by admin
 *   P. CiretaVault: lock-up-only InvalidVestingConfig guard (cliff > vesting)
 */

import { expect } from "chai";
import { ethers, upgrades } from "hardhat";
import { time } from "@nomicfoundation/hardhat-network-helpers";
import type { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";

// ── Constants ────────────────────────────────────────────────────────────────

const DAY = 24 * 3600;
const DECIMALS = 6;
const ONE_TOKEN = 10n ** BigInt(DECIMALS);
const MAX_SUPPLY = 1_000_000n * ONE_TOKEN;   // 1 million @ 6 dec
const FIXED_SUPPLY = 500_000n * ONE_TOKEN;   // 500k @ 6 dec

const COUNTRY_UK = 826;
const COUNTRY_AU = 36;
const COUNTRY_FR = 250;
const COUNTRY_SYSTEM = 0;

// Sale params
const SOFT_CAP = ethers.parseUnits("1000", 6);   // 1000 USDC
const HARD_CAP = ethers.parseUnits("50000", 6);  // 50k USDC
const TOTAL_TOKEN_SUPPLY = ethers.parseUnits("10000", 6); // 10k tokens for sale
const PRICE_PER_TOKEN = ethers.parseUnits("1", 6);        // 1 USDC per token
const PHASE_ALLOCATION = ethers.parseUnits("10000", 6);   // all tokens in one phase
const MIN_TOKENS = 10n;
const MAX_TOKENS = 5000n;
const TOP_UP_MIN = 5n;

// ── Fixture builder ──────────────────────────────────────────────────────────

/**
 * Deploy the full platform contract suite and wire up all roles.
 * Returns all handles needed by every test section.
 */
async function deployPlatform(
  admin: SignerWithAddress,
  issuer: SignerWithAddress,
  issuerB: SignerWithAddress,
) {
  // ── SimpleIdentityRegistry (platform IR) ──
  const SIR = await ethers.getContractFactory("SimpleIdentityRegistry");
  const ir = await upgrades.deployProxy(SIR, [
    admin.address,
    ethers.ZeroAddress,
    ethers.ZeroAddress,
    ethers.ZeroAddress,
  ], { unsafeAllow: ["constructor"] });

  // ── IssuerRegistry ──
  const IsReg = await ethers.getContractFactory("IssuerRegistry");
  const issuerReg = await upgrades.deployProxy(IsReg, [admin.address]);

  // ── PlatformFeeManager ──
  const PFM = await ethers.getContractFactory("PlatformFeeManager");
  const feeManager = await upgrades.deployProxy(PFM, [admin.address, admin.address, 0]);

  // ── Raw implementations for CiretaTokenFactory ──
  const TokenImplF = await ethers.getContractFactory("CiretaToken");
  const tokenImpl = await TokenImplF.deploy();

  const IRImplF = await ethers.getContractFactory("IdentityRegistry");
  const irImpl = await IRImplF.deploy();

  const MCImplF = await ethers.getContractFactory("ModularCompliance");
  const mcImpl = await MCImplF.deploy();

  // Supporting registries for IdentityRegistry (legacy full mode — only needed as params)
  const CTR = await ethers.getContractFactory("ClaimTopicsRegistry");
  const claimTopics = await upgrades.deployProxy(CTR, [admin.address]);
  const TIR = await ethers.getContractFactory("TrustedIssuersRegistry");
  const trustedIssuers = await upgrades.deployProxy(TIR, [admin.address]);
  const IRS = await ethers.getContractFactory("IdentityRegistryStorage");
  const idStorage = await upgrades.deployProxy(IRS, [admin.address]);

  // ── CiretaTokenFactory ──
  const TFF = await ethers.getContractFactory("CiretaTokenFactory");
  const tokenFactory = await upgrades.deployProxy(TFF, [
    admin.address,
    await tokenImpl.getAddress(),
    await irImpl.getAddress(),
    await mcImpl.getAddress(),
    await claimTopics.getAddress(),
    await trustedIssuers.getAddress(),
    await idStorage.getAddress(),
    await issuerReg.getAddress(),
  ]);
  // simpleIdentityMode — avoids bindIdentityRegistry on the shared storage
  await tokenFactory.connect(admin).setSimpleIdentityMode(true);

  // ── Sale implementation ──
  const SaleF = await ethers.getContractFactory("Sale");
  const saleImpl = await SaleF.deploy();

  // ── CiretaFractionToken implementation ──
  const FTF = await ethers.getContractFactory("CiretaFractionToken1155");
  const fractionImpl = await FTF.deploy();

  // ── CiretaVault implementation ──
  const VF = await ethers.getContractFactory("CiretaVault");
  const vaultImpl = await VF.deploy();

  // ── CiretaFractionFactory ──
  const FFF = await ethers.getContractFactory("CiretaFractionFactory");
  const fractionFactory = await upgrades.deployProxy(FFF, [
    admin.address,
    await fractionImpl.getAddress(),
    await vaultImpl.getAddress(),
  ], { unsafeAllow: ["constructor"] });

  // ── CiretaSaleFactory ──
  const SFF = await ethers.getContractFactory("CiretaSaleFactory");
  const saleFactory = await upgrades.deployProxy(SFF, [
    admin.address,
    await saleImpl.getAddress(),
  ], { unsafeAllow: ["constructor"] });
  await saleFactory.connect(admin).setIssuerRegistry(await issuerReg.getAddress());
  await saleFactory.connect(admin).setPlatformFeeManager(await feeManager.getAddress());
  await saleFactory.connect(admin).setFractionFactory(await fractionFactory.getAddress());

  // ── Grant REGISTRAR_ROLE on IR to all 4 factories ──
  const REGISTRAR_ROLE = await ir.REGISTRAR_ROLE();
  await ir.connect(admin).grantRole(REGISTRAR_ROLE, await tokenFactory.getAddress());
  await ir.connect(admin).grantRole(REGISTRAR_ROLE, await saleFactory.getAddress());
  await ir.connect(admin).grantRole(REGISTRAR_ROLE, await fractionFactory.getAddress());

  // Transfer CiretaFractionFactory ownership to saleFactory
  // (saleFactory.deploySaleVested calls fractionFactory.deployVaultAndFraction which is onlyOwner)
  await fractionFactory.connect(admin).transferOwnership(await saleFactory.getAddress());

  // ── Compliance modules ──
  const CAF = await ethers.getContractFactory("CountryAllowModule");
  const countryModule = await upgrades.deployProxy(CAF, [admin.address]);

  const MHCF = await ethers.getContractFactory("MaxHolderCountModule");
  const maxHolderModule = await upgrades.deployProxy(MHCF, [admin.address]);

  // ── Admin registers + activates issuer + adds to IR (3-tx flow) ──
  await issuerReg.connect(admin).registerIssuer(issuer.address, "Test Issuer", "GB");
  await issuerReg.connect(admin).activateIssuer(issuer.address);
  await ir.connect(admin).addToWhitelist(issuer.address, COUNTRY_UK);

  // IssuerB — register + activate but NOT yet added to IR (will be added per test)
  await issuerReg.connect(admin).registerIssuer(issuerB.address, "Issuer B", "AU");
  await issuerReg.connect(admin).activateIssuer(issuerB.address);
  await ir.connect(admin).addToWhitelist(issuerB.address, COUNTRY_AU);

  // ── Mock USDC (payment token) ──
  const ERC20F = await ethers.getContractFactory("MockERC20");
  const usdc = await ERC20F.deploy("Mock USDC", "USDC", 6);

  return {
    ir, issuerReg, feeManager,
    tokenFactory, saleFactory, fractionFactory,
    countryModule, maxHolderModule,
    usdc,
    REGISTRAR_ROLE,
  };
}

// ── Suite ────────────────────────────────────────────────────────────────────

describe("E2E FullPlatform v2 — integrated lifecycle", () => {
  let admin: SignerWithAddress;
  let issuer: SignerWithAddress;
  let issuerB: SignerWithAddress;
  let investor: SignerWithAddress;
  let investorB: SignerWithAddress; // second KYC'd investor (same country)
  let investorFR: SignerWithAddress; // investor with country = France (blocked)
  let stranger: SignerWithAddress;

  before(async () => {
    [admin, issuer, issuerB, investor, investorB, investorFR, stranger] = await ethers.getSigners();
  });

  // ── A. Platform bootstrap ─────────────────────────────────────────────────

  describe("A. Platform bootstrap — admin deploys and wires all contracts", () => {
    it("A1. deploys all platform contracts with zero reverts", async () => {
      const { ir, issuerReg, feeManager, tokenFactory, saleFactory, fractionFactory } =
        await deployPlatform(admin, issuer, issuerB);

      // Contracts exist (non-zero addresses)
      expect(await ir.getAddress()).to.not.equal(ethers.ZeroAddress);
      expect(await issuerReg.getAddress()).to.not.equal(ethers.ZeroAddress);
      expect(await feeManager.getAddress()).to.not.equal(ethers.ZeroAddress);
      expect(await tokenFactory.getAddress()).to.not.equal(ethers.ZeroAddress);
      expect(await saleFactory.getAddress()).to.not.equal(ethers.ZeroAddress);
      expect(await fractionFactory.getAddress()).to.not.equal(ethers.ZeroAddress);
    });

    it("A2. REGISTRAR_ROLE granted on IR to all factories", async () => {
      const { ir, tokenFactory, saleFactory, fractionFactory, REGISTRAR_ROLE } =
        await deployPlatform(admin, issuer, issuerB);

      expect(await ir.hasRole(REGISTRAR_ROLE, await tokenFactory.getAddress())).to.be.true;
      expect(await ir.hasRole(REGISTRAR_ROLE, await saleFactory.getAddress())).to.be.true;
      expect(await ir.hasRole(REGISTRAR_ROLE, await fractionFactory.getAddress())).to.be.true;
    });
  });

  // ── B. Admin 3-tx issuer registration flow ───────────────────────────────

  describe("B. Admin issuer registration — 3-tx flow", () => {
    it("B1. after 3 txs issuer is Active and IR-whitelisted", async () => {
      const { ir, issuerReg } = await deployPlatform(admin, issuer, issuerB);

      // All already done in deployPlatform — verify end state
      expect(await issuerReg.isActiveIssuer(issuer.address)).to.be.true;
      expect(await ir.isVerified(issuer.address)).to.be.true;
      expect(await ir.investorCountry(issuer.address)).to.equal(COUNTRY_UK);
    });

    it("B2. non-active address cannot deploy token via factory", async () => {
      const { tokenFactory, ir } = await deployPlatform(admin, issuer, issuerB);

      await expect(
        tokenFactory.connect(stranger).deployToken(
          "T", "T", 6, stranger.address, await ir.getAddress(),
          MAX_SUPPLY, true, 0n,
        ),
      ).to.be.revertedWith("not owner or active issuer");
    });

    it("B3. pending (not yet activated) issuer cannot deploy token", async () => {
      const { tokenFactory, issuerReg, ir } = await deployPlatform(admin, issuer, issuerB);

      const pendingIssuer = stranger;
      await issuerReg.connect(admin).registerIssuer(pendingIssuer.address, "Pending", "US");
      // NOT calling activateIssuer

      await expect(
        tokenFactory.connect(pendingIssuer).deployToken(
          "T", "T", 6, pendingIssuer.address, await ir.getAddress(),
          MAX_SUPPLY, true, 0n,
        ),
      ).to.be.revertedWith("not owner or active issuer");
    });
  });

  // ── C. Issuer self-serve: deploy Mintable token ──────────────────────────

  describe("C. Issuer deploys Mintable token via TokenFactory", () => {
    let ir: any, tokenFactory: any;
    let mintableToken: any;
    let mintableCompliance: any;
    let mintableIR: any;

    beforeEach(async () => {
      const platform = await deployPlatform(admin, issuer, issuerB);
      ir = platform.ir;
      tokenFactory = platform.tokenFactory;

      const [tp, irp, cp] = await tokenFactory.connect(issuer).deployToken.staticCall(
        "Issuer Gold", "IGLD", DECIMALS,
        issuer.address,
        await ir.getAddress(),
        MAX_SUPPLY, true, 0n,
      );
      await tokenFactory.connect(issuer).deployToken(
        "Issuer Gold", "IGLD", DECIMALS,
        issuer.address,
        await ir.getAddress(),
        MAX_SUPPLY, true, 0n,
      );
      mintableToken = await ethers.getContractAt("CiretaToken", tp);
      mintableIR = irp;
      mintableCompliance = await ethers.getContractAt("ModularCompliance", cp);
    });

    it("C1. token deployed with correct maxSupply and mintable flag", async () => {
      expect(await mintableToken.maxSupply()).to.equal(MAX_SUPPLY);
      expect(await mintableToken.isMintable()).to.be.true;
      expect(await mintableToken.totalSupply()).to.equal(0n);
    });

    it("C2. token + compliance auto-whitelisted on platform IR", async () => {
      expect(await ir.isVerified(await mintableToken.getAddress())).to.be.true;
      expect(await ir.isVerified(await mintableCompliance.getAddress())).to.be.true;
    });

    it("C3. token uses the platform IR address passed in", async () => {
      const tokenIR = await mintableToken.identityRegistry();
      expect(tokenIR.toLowerCase()).to.equal((await ir.getAddress()).toLowerCase());
    });

    it("C4. issuer can mint up to maxSupply in increments", async () => {
      // Mint 250k
      await mintableToken.connect(issuer).mint(issuer.address, 250_000n * ONE_TOKEN);
      expect(await mintableToken.totalSupply()).to.equal(250_000n * ONE_TOKEN);

      // Mint another 750k — now at cap
      await mintableToken.connect(issuer).mint(issuer.address, 750_000n * ONE_TOKEN);
      expect(await mintableToken.totalSupply()).to.equal(MAX_SUPPLY);
    });

    it("C5. mint beyond cap reverts with 'exceeds max supply'", async () => {
      await mintableToken.connect(issuer).mint(issuer.address, MAX_SUPPLY);
      await expect(mintableToken.connect(issuer).mint(issuer.address, 1n))
        .to.be.revertedWith("exceeds max supply");
    });

    it("C6. burn frees headroom — can mint again after burn", async () => {
      await mintableToken.connect(issuer).mint(issuer.address, MAX_SUPPLY);
      expect(await mintableToken.totalSupply()).to.equal(MAX_SUPPLY);

      // Burn 250k — use explicit overloaded signature: burn(address, uint256)
      const burnAmount = 250_000n * ONE_TOKEN;
      await mintableToken.connect(issuer)["burn(address,uint256)"](issuer.address, burnAmount);
      expect(await mintableToken.totalSupply()).to.equal(750_000n * ONE_TOKEN);

      // Mint 250k again — succeeds (burns freed the headroom)
      await mintableToken.connect(issuer).mint(issuer.address, burnAmount);
      expect(await mintableToken.totalSupply()).to.equal(MAX_SUPPLY);
    });

    it("C7. compliance ownership transferred to issuer", async () => {
      const compOwner = await mintableCompliance.owner();
      expect(compOwner.toLowerCase()).to.equal(issuer.address.toLowerCase());
    });

    it("C8. issuer cannot deploy on behalf of another address", async () => {
      await expect(
        tokenFactory.connect(issuer).deployToken(
          "T", "T", 6, stranger.address, await ir.getAddress(),
          MAX_SUPPLY, true, 0n,
        ),
      ).to.be.revertedWith("issuer must be msg.sender");
    });
  });

  // ── D. Issuer self-serve: deploy Fixed-Supply token ──────────────────────

  describe("D. Issuer deploys Fixed-Supply token", () => {
    let ir: any, tokenFactory: any;
    let fixedToken: any;

    beforeEach(async () => {
      const platform = await deployPlatform(admin, issuer, issuerB);
      ir = platform.ir;
      tokenFactory = platform.tokenFactory;

      const [tp] = await tokenFactory.connect(issuer).deployToken.staticCall(
        "Fixed Gold", "FGLD", DECIMALS,
        issuer.address,
        await ir.getAddress(),
        FIXED_SUPPLY, false, FIXED_SUPPLY,
      );
      await tokenFactory.connect(issuer).deployToken(
        "Fixed Gold", "FGLD", DECIMALS,
        issuer.address,
        await ir.getAddress(),
        FIXED_SUPPLY, false, FIXED_SUPPLY,
      );
      fixedToken = await ethers.getContractAt("CiretaToken", tp);
    });

    it("D1. full supply pre-minted to issuer immediately", async () => {
      expect(await fixedToken.totalSupply()).to.equal(FIXED_SUPPLY);
      expect(await fixedToken.balanceOf(issuer.address)).to.equal(FIXED_SUPPLY);
    });

    it("D2. SUPPLY_ROLE revoked — subsequent mint() reverts", async () => {
      await expect(fixedToken.connect(issuer).mint(issuer.address, 1n))
        .to.be.reverted;
    });

    it("D3. isMintable() returns false", async () => {
      expect(await fixedToken.isMintable()).to.be.false;
    });

    it("D4. admin (not SUPPLY_ROLE holder) also cannot mint", async () => {
      await expect(fixedToken.connect(admin).mint(admin.address, 1n))
        .to.be.reverted;
    });

    it("D5. fixed-supply: partial initialMintAmount is rejected by factory", async () => {
      await expect(
        tokenFactory.connect(issuer).deployToken(
          "T", "T", 6, issuer.address, await ir.getAddress(),
          FIXED_SUPPLY, false, FIXED_SUPPLY / 2n, // partial — invalid
        ),
      ).to.be.revertedWith("fixed supply must mint full max");
    });
  });

  // ── E. Issuer attaches compliance modules ────────────────────────────────

  describe("E. Issuer attaches CountryAllowModule + MaxHolderCountModule", () => {
    let ir: any, tokenFactory: any, countryModule: any, maxHolderModule: any;
    let token: any, compliance: any;

    beforeEach(async () => {
      const platform = await deployPlatform(admin, issuer, issuerB);
      ir = platform.ir;
      tokenFactory = platform.tokenFactory;
      countryModule = platform.countryModule;
      maxHolderModule = platform.maxHolderModule;

      // Deploy mintable token — issuer now owns the compliance
      const [tp, , cp] = await tokenFactory.connect(issuer).deployToken.staticCall(
        "Gold", "GLD", DECIMALS, issuer.address, await ir.getAddress(),
        MAX_SUPPLY, true, 0n,
      );
      await tokenFactory.connect(issuer).deployToken(
        "Gold", "GLD", DECIMALS, issuer.address, await ir.getAddress(),
        MAX_SUPPLY, true, 0n,
      );
      token = await ethers.getContractAt("CiretaToken", tp);
      compliance = await ethers.getContractAt("ModularCompliance", cp);
    });

    it("E1. issuer (compliance owner) can add CountryAllowModule", async () => {
      const compAddr = await compliance.getAddress();

      // addModule — only owner
      await compliance.connect(issuer).addModule(await countryModule.getAddress());
      // bindCompliance — issuer signs (complianceBinder modifier: owner of compliance)
      await countryModule.connect(issuer).bindCompliance(compAddr);
      // batchAllowCountries — issuer signs (complianceAdmin modifier)
      await countryModule.connect(issuer).batchAllowCountries(compAddr, [COUNTRY_SYSTEM, COUNTRY_UK, COUNTRY_AU]);

      expect(await countryModule.isCountryAllowed(compAddr, COUNTRY_UK)).to.be.true;
      expect(await countryModule.isCountryAllowed(compAddr, COUNTRY_AU)).to.be.true;
      expect(await countryModule.isCountryAllowed(compAddr, COUNTRY_FR)).to.be.false;
    });

    it("E2. issuer can attach MaxHolderCountModule and set max = 100", async () => {
      const compAddr = await compliance.getAddress();

      await compliance.connect(issuer).addModule(await maxHolderModule.getAddress());
      await maxHolderModule.connect(issuer).bindCompliance(compAddr);
      await maxHolderModule.connect(issuer).setMaxHolderCount(compAddr, 100);

      expect(await maxHolderModule.getMaxHolderCount(compAddr)).to.equal(100n);
    });

    it("E3. admin (module owner) can also configure any bound compliance", async () => {
      const compAddr = await compliance.getAddress();
      // Issuer binds
      await compliance.connect(issuer).addModule(await countryModule.getAddress());
      await countryModule.connect(issuer).bindCompliance(compAddr);
      // Admin configures (module owner path)
      await countryModule.connect(admin).addAllowedCountry(compAddr, COUNTRY_AU);
      expect(await countryModule.isCountryAllowed(compAddr, COUNTRY_AU)).to.be.true;
    });

    it("E4. stranger cannot addAllowedCountry on issuer's compliance", async () => {
      const compAddr = await compliance.getAddress();
      await compliance.connect(issuer).addModule(await countryModule.getAddress());
      await countryModule.connect(issuer).bindCompliance(compAddr);
      await expect(
        countryModule.connect(stranger).addAllowedCountry(compAddr, COUNTRY_UK),
      ).to.be.revertedWith("not authorized");
    });

    it("E5. bindCompliance reverts for stranger (complianceBinder modifier)", async () => {
      // compliance not yet bound — but stranger is neither module owner nor compliance owner
      const compAddr = await compliance.getAddress();
      await expect(
        countryModule.connect(stranger).bindCompliance(compAddr),
      ).to.be.revertedWith("not authorized");
    });
  });

  // ── F. Cross-issuer compliance isolation ─────────────────────────────────

  describe("F. Cross-issuer isolation on compliance config", () => {
    it("F1. issuerA cannot addAllowedCountry on issuerB's compliance", async () => {
      const platform = await deployPlatform(admin, issuer, issuerB);
      const { ir, tokenFactory, countryModule } = platform;

      // issuerA deploys a token
      const [, , cpA] = await tokenFactory.connect(issuer).deployToken.staticCall(
        "A Token", "ATK", DECIMALS, issuer.address, await ir.getAddress(),
        MAX_SUPPLY, true, 0n,
      );
      await tokenFactory.connect(issuer).deployToken(
        "A Token", "ATK", DECIMALS, issuer.address, await ir.getAddress(),
        MAX_SUPPLY, true, 0n,
      );
      const compA = await ethers.getContractAt("ModularCompliance", cpA);
      await compA.connect(issuer).addModule(await countryModule.getAddress());
      await countryModule.connect(issuer).bindCompliance(cpA);

      // issuerB deploys a token
      const [, , cpB] = await tokenFactory.connect(issuerB).deployToken.staticCall(
        "B Token", "BTK", DECIMALS, issuerB.address, await ir.getAddress(),
        MAX_SUPPLY, true, 0n,
      );
      await tokenFactory.connect(issuerB).deployToken(
        "B Token", "BTK", DECIMALS, issuerB.address, await ir.getAddress(),
        MAX_SUPPLY, true, 0n,
      );
      const compB = await ethers.getContractAt("ModularCompliance", cpB);
      await compB.connect(issuerB).addModule(await countryModule.getAddress());
      await countryModule.connect(issuerB).bindCompliance(cpB);

      // Cross-contamination checks
      await expect(
        countryModule.connect(issuer).addAllowedCountry(cpB, COUNTRY_UK),
      ).to.be.revertedWith("not authorized");

      await expect(
        countryModule.connect(issuerB).addAllowedCountry(cpA, COUNTRY_AU),
      ).to.be.revertedWith("not authorized");
    });

    it("F2. issuerA cannot unbind issuerB's compliance", async () => {
      const platform = await deployPlatform(admin, issuer, issuerB);
      const { ir, tokenFactory, countryModule } = platform;

      const [, , cpB] = await tokenFactory.connect(issuerB).deployToken.staticCall(
        "B Token", "BTK", DECIMALS, issuerB.address, await ir.getAddress(),
        MAX_SUPPLY, true, 0n,
      );
      await tokenFactory.connect(issuerB).deployToken(
        "B Token", "BTK", DECIMALS, issuerB.address, await ir.getAddress(),
        MAX_SUPPLY, true, 0n,
      );
      const compB = await ethers.getContractAt("ModularCompliance", cpB);
      await compB.connect(issuerB).addModule(await countryModule.getAddress());
      await countryModule.connect(issuerB).bindCompliance(cpB);

      await expect(
        countryModule.connect(issuer).unbindCompliance(cpB),
      ).to.be.revertedWith("not authorized");
    });
  });

  // ── G. Issuer deploys Vested sale (cliff+linear) ─────────────────────────

  describe("G. Issuer deploys Vested sale — cliff+linear", () => {
    let platform: Awaited<ReturnType<typeof deployPlatform>>;
    let projectToken: any;
    let saleAddr: string;
    let vaultAddr: string;
    let fractionAddr: string;

    const CLIFF = 10 * DAY;
    const VESTING = 30 * DAY;

    beforeEach(async () => {
      platform = await deployPlatform(admin, issuer, issuerB);
      const { ir, tokenFactory, saleFactory, usdc } = platform;

      // Deploy the project token via factory
      const [tp] = await tokenFactory.connect(issuer).deployToken.staticCall(
        "Gold Token", "GLD", DECIMALS, issuer.address, await ir.getAddress(),
        MAX_SUPPLY, true, 0n,
      );
      await tokenFactory.connect(issuer).deployToken(
        "Gold Token", "GLD", DECIMALS, issuer.address, await ir.getAddress(),
        MAX_SUPPLY, true, 0n,
      );
      projectToken = await ethers.getContractAt("CiretaToken", tp);

      // Mint tokens for the issuer
      await projectToken.connect(issuer).mint(issuer.address, TOTAL_TOKEN_SUPPLY);

      const now = await time.latest();
      const saleStart = now + 120;
      const saleEnd = now + 60 * DAY;

      const iface = new ethers.Interface([
        "function initialize(address,address,address,address,address,address,uint256,uint256,uint256,uint256,address,uint256,uint256,uint256)",
      ]);
      const initData = iface.encodeFunctionData("initialize", [
        await projectToken.getAddress(),
        await usdc.getAddress(),
        await ir.getAddress(),
        issuer.address,
        await saleFactory.getAddress(),
        await (platform.feeManager).getAddress(),
        SOFT_CAP,
        HARD_CAP,
        0n,   // feeBasisPoints
        0n,   // feeCapUsdc
        ethers.ZeroAddress,
        saleStart,
        saleEnd,
        TOTAL_TOKEN_SUPPLY,
      ]);

      const tx = await saleFactory.connect(issuer).deploySaleVested(
        await projectToken.getAddress(),
        initData,
        "frGLD", "frGLD", DECIMALS,
        await ir.getAddress(),
        CLIFF, VESTING,
        0, // ExcessPolicy.Keep
      );
      const receipt = await tx.wait();

      saleAddr = (await saleFactory.getSalesForToken(await projectToken.getAddress()))[0];
      vaultAddr = await (platform.fractionFactory as any).saleToVault(saleAddr);
      fractionAddr = await (platform.fractionFactory as any).saleToFraction(saleAddr);
    });

    it("G1. sale, vault, and fractionToken deployed", async () => {
      expect(saleAddr).to.not.equal(ethers.ZeroAddress);
      expect(vaultAddr).to.not.equal(ethers.ZeroAddress);
      expect(fractionAddr).to.not.equal(ethers.ZeroAddress);
    });

    it("G2. sale, vault, and fractionToken auto-whitelisted on IR", async () => {
      const { ir } = platform;
      expect(await ir.isVerified(saleAddr)).to.be.true;
      expect(await ir.isVerified(vaultAddr)).to.be.true;
      expect(await ir.isVerified(fractionAddr)).to.be.true;
    });

    it("G3. sale is in Draft status and in vested mode", async () => {
      const sale = await ethers.getContractAt("Sale", saleAddr);
      expect(await sale.status()).to.equal(0n); // Draft
      const mode = await sale.saleMode();
      expect(mode).to.equal(1n); // Vested
    });

    it("G4. issuer can add a phase and deposit project tokens", async () => {
      const sale = await ethers.getContractAt("Sale", saleAddr);
      const saleStart = await sale.saleStartTime();

      await sale.connect(issuer).addPhase(
        "Public", PRICE_PER_TOKEN, PHASE_ALLOCATION,
        MIN_TOKENS, MAX_TOKENS, TOP_UP_MIN,
        Number(saleStart), Number(saleStart) + 25 * DAY,
        false, 0, // AllocationMode.Fixed
      );

      // Deposit tokens into sale → vault
      const amount = TOTAL_TOKEN_SUPPLY;
      await projectToken.connect(issuer).approve(saleAddr, amount);
      await sale.connect(issuer).depositProjectTokens(amount);

      const vault = await ethers.getContractAt("CiretaVault", vaultAddr);
      expect(await vault.totalLocked()).to.equal(amount);
    });

    it("G5. sale activates after admin approval + deposit + phase", async () => {
      const sale = await ethers.getContractAt("Sale", saleAddr);
      const saleStart = await sale.saleStartTime();

      await sale.connect(issuer).addPhase(
        "Public", PRICE_PER_TOKEN, PHASE_ALLOCATION,
        MIN_TOKENS, MAX_TOKENS, TOP_UP_MIN,
        Number(saleStart), Number(saleStart) + 25 * DAY,
        false, 0,
      );

      await projectToken.connect(issuer).approve(saleAddr, TOTAL_TOKEN_SUPPLY);
      await sale.connect(issuer).depositProjectTokens(TOTAL_TOKEN_SUPPLY);

      await sale.connect(admin).approveSale();
      await sale.connect(issuer).activate();
      expect(await sale.status()).to.equal(1n); // Active
    });
  });

  // ── H. Issuer deploys Vested sale (lock-up only) ─────────────────────────

  describe("H. Issuer deploys Vested sale — lock-up-only (cliff == vesting)", () => {
    let platform: Awaited<ReturnType<typeof deployPlatform>>;
    let projectToken: any;
    let saleAddr: string;
    let vaultAddr: string;

    const LOCKUP = 60 * DAY;

    beforeEach(async () => {
      platform = await deployPlatform(admin, issuer, issuerB);
      const { ir, tokenFactory, saleFactory, usdc, feeManager } = platform;

      const [tp] = await tokenFactory.connect(issuer).deployToken.staticCall(
        "Copper Token", "CPR", DECIMALS, issuer.address, await ir.getAddress(),
        MAX_SUPPLY, true, 0n,
      );
      await tokenFactory.connect(issuer).deployToken(
        "Copper Token", "CPR", DECIMALS, issuer.address, await ir.getAddress(),
        MAX_SUPPLY, true, 0n,
      );
      projectToken = await ethers.getContractAt("CiretaToken", tp);
      await projectToken.connect(issuer).mint(issuer.address, TOTAL_TOKEN_SUPPLY);

      const now = await time.latest();
      const saleStart = now + 120;
      const saleEnd = now + 90 * DAY;

      const iface = new ethers.Interface([
        "function initialize(address,address,address,address,address,address,uint256,uint256,uint256,uint256,address,uint256,uint256,uint256)",
      ]);
      const initData = iface.encodeFunctionData("initialize", [
        await projectToken.getAddress(),
        await usdc.getAddress(),
        await ir.getAddress(),
        issuer.address,
        await saleFactory.getAddress(),
        await feeManager.getAddress(),
        SOFT_CAP, HARD_CAP, 0n, 0n,
        ethers.ZeroAddress,
        saleStart, saleEnd, TOTAL_TOKEN_SUPPLY,
      ]);

      await saleFactory.connect(issuer).deploySaleVested(
        await projectToken.getAddress(),
        initData,
        "frCPR", "frCPR", DECIMALS,
        await ir.getAddress(),
        LOCKUP, LOCKUP, // cliff == vesting → lock-up variant
        0,
      );

      saleAddr = (await saleFactory.getSalesForToken(await projectToken.getAddress()))[0];
      vaultAddr = await (platform.fractionFactory as any).saleToVault(saleAddr);
    });

    it("H1. vault configured with cliff == vesting (lock-up only)", async () => {
      const vault = await ethers.getContractAt("CiretaVault", vaultAddr);
      const cfg = await vault.vestingConfig();
      expect(cfg.cliffDuration).to.equal(LOCKUP);
      expect(cfg.vestingDuration).to.equal(LOCKUP);
    });

    it("H2. vault sale + fraction auto-whitelisted", async () => {
      const { ir } = platform;
      const fractionAddr = await (platform.fractionFactory as any).saleToFraction(saleAddr);
      expect(await ir.isVerified(saleAddr)).to.be.true;
      expect(await ir.isVerified(vaultAddr)).to.be.true;
      expect(await ir.isVerified(fractionAddr)).to.be.true;
    });
  });

  // ── I. Investor buys from active sale ────────────────────────────────────

  describe("I. Investor buys from active Vested sale", () => {
    let platform: Awaited<ReturnType<typeof deployPlatform>>;
    let projectToken: any;
    let sale: any;
    let vault: any;
    let fractionToken: any;
    let saleStart: number;

    const CLIFF = 10 * DAY;
    const VESTING = 30 * DAY;

    beforeEach(async () => {
      platform = await deployPlatform(admin, issuer, issuerB);
      const { ir, tokenFactory, saleFactory, usdc, feeManager } = platform;

      // Whitelist investor
      await ir.connect(admin).addToWhitelist(investor.address, COUNTRY_UK);
      await ir.connect(admin).addToWhitelist(investorB.address, COUNTRY_UK);
      await ir.connect(admin).addToWhitelist(investorFR.address, COUNTRY_FR);

      const [tp] = await tokenFactory.connect(issuer).deployToken.staticCall(
        "Gold", "GLD", DECIMALS, issuer.address, await ir.getAddress(),
        MAX_SUPPLY, true, 0n,
      );
      await tokenFactory.connect(issuer).deployToken(
        "Gold", "GLD", DECIMALS, issuer.address, await ir.getAddress(),
        MAX_SUPPLY, true, 0n,
      );
      projectToken = await ethers.getContractAt("CiretaToken", tp);
      await projectToken.connect(issuer).mint(issuer.address, TOTAL_TOKEN_SUPPLY);

      const now = await time.latest();
      saleStart = now + 120;
      const saleEnd = now + 60 * DAY;

      const iface = new ethers.Interface([
        "function initialize(address,address,address,address,address,address,uint256,uint256,uint256,uint256,address,uint256,uint256,uint256)",
      ]);
      const initData = iface.encodeFunctionData("initialize", [
        await projectToken.getAddress(),
        await usdc.getAddress(),
        await ir.getAddress(),
        issuer.address,
        await saleFactory.getAddress(),
        await feeManager.getAddress(),
        SOFT_CAP, HARD_CAP, 0n, 0n,
        ethers.ZeroAddress,
        saleStart, saleEnd, TOTAL_TOKEN_SUPPLY,
      ]);

      await saleFactory.connect(issuer).deploySaleVested(
        await projectToken.getAddress(),
        initData,
        "frGLD", "frGLD", DECIMALS,
        await ir.getAddress(),
        CLIFF, VESTING, 0,
      );

      const saleAddr = (await saleFactory.getSalesForToken(await projectToken.getAddress()))[0];
      sale = await ethers.getContractAt("Sale", saleAddr);
      const vaultAddr = await (platform.fractionFactory as any).saleToVault(saleAddr);
      const fractionAddr = await (platform.fractionFactory as any).saleToFraction(saleAddr);
      vault = await ethers.getContractAt("CiretaVault", vaultAddr);
      fractionToken = await ethers.getContractAt("CiretaFractionToken1155", fractionAddr);

      // Add phase
      await sale.connect(issuer).addPhase(
        "Public", PRICE_PER_TOKEN, PHASE_ALLOCATION,
        MIN_TOKENS, MAX_TOKENS, TOP_UP_MIN,
        saleStart, saleStart + 25 * DAY, false, 0,
      );

      // Deposit + approve + activate
      await projectToken.connect(issuer).approve(await sale.getAddress(), TOTAL_TOKEN_SUPPLY);
      await sale.connect(issuer).depositProjectTokens(TOTAL_TOKEN_SUPPLY);
      await sale.connect(admin).approveSale();
      await sale.connect(issuer).activate();

      // Time-travel to inside the phase
      await time.increaseTo(saleStart + 10);
    });

    it("I1. KYC'd investor can buy — USDC deducted, fraction minted", async () => {
      const { usdc } = platform;
      const BUY_TOKENS = 100n;
      const COST = BUY_TOKENS * PRICE_PER_TOKEN;

      await usdc.mint(investor.address, COST);
      await usdc.connect(investor).approve(await sale.getAddress(), COST);
      await sale.connect(investor).buy(0, BUY_TOKENS);

      expect(await usdc.balanceOf(investor.address)).to.equal(0n);
      const fractionBalance = await fractionToken.balanceOf(investor.address, 1n);
      expect(fractionBalance).to.equal(BUY_TOKENS * ONE_TOKEN);
    });

    it("I2. non-KYC'd investor buy reverts with KYCRequired", async () => {
      const { usdc } = platform;
      const COST = 100n * PRICE_PER_TOKEN;
      await usdc.mint(stranger.address, COST);
      await usdc.connect(stranger).approve(await sale.getAddress(), COST);
      await expect(sale.connect(stranger).buy(0, 100n))
        .to.be.revertedWithCustomError(sale, "KYCRequired");
    });

    it("I3. sale total raised tracks contributions", async () => {
      const { usdc } = platform;
      const BUY_TOKENS = 200n;
      const COST = BUY_TOKENS * PRICE_PER_TOKEN;
      await usdc.mint(investor.address, COST);
      await usdc.connect(investor).approve(await sale.getAddress(), COST);
      await sale.connect(investor).buy(0, BUY_TOKENS);
      expect(await sale.totalRaised()).to.equal(COST);
    });
  });

  // ── J. Transfer compliance enforcement ───────────────────────────────────

  describe("J. Transfer compliance — country block + non-verified block", () => {
    let platform: Awaited<ReturnType<typeof deployPlatform>>;
    let token: any;
    let compliance: any;

    beforeEach(async () => {
      platform = await deployPlatform(admin, issuer, issuerB);
      const { ir, tokenFactory, countryModule } = platform;

      // Whitelist investor (UK), investorB (UK), investorFR (France)
      await ir.connect(admin).addToWhitelist(investor.address, COUNTRY_UK);
      await ir.connect(admin).addToWhitelist(investorB.address, COUNTRY_UK);
      await ir.connect(admin).addToWhitelist(investorFR.address, COUNTRY_FR);

      const [tp, , cp] = await tokenFactory.connect(issuer).deployToken.staticCall(
        "Gold", "GLD", DECIMALS, issuer.address, await ir.getAddress(),
        MAX_SUPPLY, true, 0n,
      );
      await tokenFactory.connect(issuer).deployToken(
        "Gold", "GLD", DECIMALS, issuer.address, await ir.getAddress(),
        MAX_SUPPLY, true, 0n,
      );
      token = await ethers.getContractAt("CiretaToken", tp);
      compliance = await ethers.getContractAt("ModularCompliance", cp);

      // Mint to investor
      await token.connect(issuer).mint(investor.address, 1000n * ONE_TOKEN);

      // Attach CountryAllowModule — allow UK + AU + System only
      await compliance.connect(issuer).addModule(await countryModule.getAddress());
      await countryModule.connect(issuer).bindCompliance(cp);
      await countryModule.connect(issuer).batchAllowCountries(
        cp, [COUNTRY_SYSTEM, COUNTRY_UK, COUNTRY_AU]
      );
    });

    it("J1. investor can transfer to another UK-verified address", async () => {
      await token.connect(investor).transfer(investorB.address, 100n * ONE_TOKEN);
      expect(await token.balanceOf(investorB.address)).to.equal(100n * ONE_TOKEN);
    });

    it("J2. investor CANNOT transfer to a non-whitelisted address", async () => {
      await expect(
        token.connect(investor).transfer(stranger.address, 100n * ONE_TOKEN),
      ).to.be.reverted; // recipient not verified in IR
    });

    it("J3. cross-country block: UK investor cannot transfer to France (country 250 not allowed)", async () => {
      await expect(
        token.connect(investor).transfer(investorFR.address, 100n * ONE_TOKEN),
      ).to.be.reverted; // CountryAllowModule blocks France
    });

    it("J4. after allowing France, transfer to FR address succeeds", async () => {
      const compAddr = await compliance.getAddress();
      await platform.countryModule.connect(issuer).addAllowedCountry(compAddr, COUNTRY_FR);
      await token.connect(investor).transfer(investorFR.address, 100n * ONE_TOKEN);
      expect(await token.balanceOf(investorFR.address)).to.equal(100n * ONE_TOKEN);
    });
  });

  // ── K. Vault cliff+linear claim math ─────────────────────────────────────

  describe("K. Vault cliff+linear claim math (3 time points)", () => {
    const CLIFF = 10 * DAY;
    const VESTING = 30 * DAY;
    const BALANCE = 1000n * 10n ** 18n; // 18 dec for clean division

    let vault: any;
    let fractionToken: any;
    let projectToken: any;
    let saleAccount: SignerWithAddress;

    before(async () => {
      [, , , , , , , saleAccount] = await ethers.getSigners();
    });

    beforeEach(async () => {
      const MockIR = await ethers.getContractFactory("MockIdentityRegistry");
      const mockRegistry = await MockIR.deploy();
      const ERC20 = await ethers.getContractFactory("MockERC20");
      projectToken = await ERC20.deploy("Gold", "GLD", 18);

      const FT = await ethers.getContractFactory("CiretaFractionToken1155");
      fractionToken = await upgrades.deployProxy(FT, [
        "frGLD", "frGLD", 18,
        await mockRegistry.getAddress(),
        await projectToken.getAddress(),
        ethers.ZeroAddress,
        admin.address,
      ], { unsafeAllow: ["constructor"] });

      const Vault = await ethers.getContractFactory("CiretaVault");
      vault = await upgrades.deployProxy(Vault, [
        await projectToken.getAddress(),
        await fractionToken.getAddress(),
        await mockRegistry.getAddress(),
        CLIFF, VESTING,
        saleAccount.address,
        admin.address,
        0,
        admin.address,
      ], { unsafeAllow: ["constructor"] });

      const MINTER_ROLE = ethers.keccak256(ethers.toUtf8Bytes("MINTER_ROLE"));
      const BURNER_ROLE = ethers.keccak256(ethers.toUtf8Bytes("BURNER_ROLE"));
      await fractionToken.grantRole(MINTER_ROLE, saleAccount.address);
      await fractionToken.grantRole(BURNER_ROLE, await vault.getAddress());

      await projectToken.mint(saleAccount.address, BALANCE);
      await projectToken.connect(saleAccount).approve(await vault.getAddress(), BALANCE);
      await vault.connect(saleAccount).depositTokens(BALANCE);
      await vault.connect(saleAccount).recordAllocation(investor.address, 1, BALANCE);
      await fractionToken.connect(saleAccount).mint(investor.address, 1, BALANCE, "0x");
      await vault.connect(saleAccount).startVesting();
    });

    it("K1. claimable at t=0 is 0 (before cliff)", async () => {
      expect(await vault.getClaimable(investor.address)).to.equal(0n);
    });

    it("K2. claimable exactly at cliff = 0 (cliff boundary: linear elapsed = 0)", async () => {
      await time.increase(CLIFF);
      // At exactly cliff: linearElapsed = 0 → 0 claimable
      expect(await vault.getClaimable(investor.address)).to.equal(0n);
    });

    it("K3. claimable at midpoint (t=20d) ≈ 50% of balance (±1 wei)", async () => {
      // elapsed=20d, cliff=10d, vesting=30d
      // linearElapsed = 10d, linearDuration = 20d → 50%
      await time.increase(20 * DAY);
      const claimable = await vault.getClaimable(investor.address);
      expect(claimable).to.be.closeTo(BALANCE / 2n, 1n);
    });

    it("K4. claimable at full vesting = 100%", async () => {
      await time.increase(VESTING);
      expect(await vault.getClaimable(investor.address)).to.equal(BALANCE);
    });

    it("K5. investor claims at full vesting — receives all project tokens", async () => {
      await time.increase(VESTING + 1);
      await vault.connect(investor).claim();
      expect(await projectToken.balanceOf(investor.address)).to.equal(BALANCE);
      expect(await fractionToken.balanceOf(investor.address, 1n)).to.equal(0n);
    });

    it("K6. two partial claims accumulate correctly", async () => {
      // Snapshot the vesting start time so we can use absolute time jumps
      const startTime = await vault.vestingStartTime();

      // First claim at midpoint (~50% vested)
      await time.increaseTo(Number(startTime) + 20 * DAY);
      await vault.connect(investor).claim();
      const afterFirst = await projectToken.balanceOf(investor.address);
      // Should be roughly 50%: linearElapsed=10d out of linearDuration=20d
      expect(afterFirst).to.be.gt(0n);
      expect(afterFirst).to.be.lt(BALANCE);

      // Second claim at full vesting: total = 100%
      await time.increaseTo(Number(startTime) + VESTING + 1);
      await vault.connect(investor).claim();
      expect(await projectToken.balanceOf(investor.address)).to.equal(BALANCE);
    });
  });

  // ── L. Vault lock-up-only claim math ─────────────────────────────────────

  describe("L. Vault lock-up-only claim math (2 time points)", () => {
    const LOCKUP = 30 * DAY;
    const BALANCE = 500n * 10n ** 18n;

    let vault: any;
    let fractionToken: any;
    let projectToken: any;
    let saleAccount: SignerWithAddress;

    before(async () => {
      [, , , , , , , saleAccount] = await ethers.getSigners();
    });

    beforeEach(async () => {
      const MockIR = await ethers.getContractFactory("MockIdentityRegistry");
      const mockRegistry = await MockIR.deploy();
      const ERC20 = await ethers.getContractFactory("MockERC20");
      projectToken = await ERC20.deploy("Gold", "GLD", 18);

      const FT = await ethers.getContractFactory("CiretaFractionToken1155");
      fractionToken = await upgrades.deployProxy(FT, [
        "frGLD", "frGLD", 18,
        await mockRegistry.getAddress(),
        await projectToken.getAddress(),
        ethers.ZeroAddress,
        admin.address,
      ], { unsafeAllow: ["constructor"] });

      const Vault = await ethers.getContractFactory("CiretaVault");
      vault = await upgrades.deployProxy(Vault, [
        await projectToken.getAddress(),
        await fractionToken.getAddress(),
        await mockRegistry.getAddress(),
        LOCKUP, LOCKUP, // cliff == vesting
        saleAccount.address,
        admin.address,
        0,
        admin.address,
      ], { unsafeAllow: ["constructor"] });

      const MINTER_ROLE = ethers.keccak256(ethers.toUtf8Bytes("MINTER_ROLE"));
      const BURNER_ROLE = ethers.keccak256(ethers.toUtf8Bytes("BURNER_ROLE"));
      await fractionToken.grantRole(MINTER_ROLE, saleAccount.address);
      await fractionToken.grantRole(BURNER_ROLE, await vault.getAddress());

      await projectToken.mint(saleAccount.address, BALANCE);
      await projectToken.connect(saleAccount).approve(await vault.getAddress(), BALANCE);
      await vault.connect(saleAccount).depositTokens(BALANCE);
      await vault.connect(saleAccount).recordAllocation(investor.address, 1, BALANCE);
      await fractionToken.connect(saleAccount).mint(investor.address, 1, BALANCE, "0x");
      await vault.connect(saleAccount).startVesting();
    });

    it("L1. claimable at t=cliff-1 is 0 (lock still closed)", async () => {
      await time.increase(LOCKUP - 1);
      expect(await vault.getClaimable(investor.address)).to.equal(0n);
    });

    it("L2. claimable at t=cliff is 100% (lock unlocks all at once)", async () => {
      await time.increase(LOCKUP);
      expect(await vault.getClaimable(investor.address)).to.equal(BALANCE);
    });

    it("L3. claim() before lockup reverts with NothingToClaim", async () => {
      await time.increase(LOCKUP - 2);
      await expect(vault.connect(investor).claim())
        .to.be.revertedWithCustomError(vault, "NothingToClaim");
    });

    it("L4. claim() at lockup end delivers full balance", async () => {
      await time.increase(LOCKUP + 1);
      await vault.connect(investor).claim();
      expect(await projectToken.balanceOf(investor.address)).to.equal(BALANCE);
    });
  });

  // ── M. Refund flow — sale misses soft cap ─────────────────────────────────

  describe("M. Refund flow — vested sale misses soft cap", () => {
    let platform: Awaited<ReturnType<typeof deployPlatform>>;
    let projectToken: any;
    let sale: any;
    let fractionToken: any;
    let saleStart: number;
    let saleEnd: number;

    beforeEach(async () => {
      platform = await deployPlatform(admin, issuer, issuerB);
      const { ir, tokenFactory, saleFactory, usdc, feeManager } = platform;

      await ir.connect(admin).addToWhitelist(investor.address, COUNTRY_UK);

      const [tp] = await tokenFactory.connect(issuer).deployToken.staticCall(
        "Gold", "GLD", DECIMALS, issuer.address, await ir.getAddress(),
        MAX_SUPPLY, true, 0n,
      );
      await tokenFactory.connect(issuer).deployToken(
        "Gold", "GLD", DECIMALS, issuer.address, await ir.getAddress(),
        MAX_SUPPLY, true, 0n,
      );
      projectToken = await ethers.getContractAt("CiretaToken", tp);
      await projectToken.connect(issuer).mint(issuer.address, TOTAL_TOKEN_SUPPLY);

      const now = await time.latest();
      saleStart = now + 120;
      saleEnd = now + 5 * DAY; // short window

      const iface = new ethers.Interface([
        "function initialize(address,address,address,address,address,address,uint256,uint256,uint256,uint256,address,uint256,uint256,uint256)",
      ]);
      const initData = iface.encodeFunctionData("initialize", [
        await projectToken.getAddress(),
        await usdc.getAddress(),
        await ir.getAddress(),
        issuer.address,
        await saleFactory.getAddress(),
        await feeManager.getAddress(),
        SOFT_CAP, HARD_CAP, 0n, 0n,
        ethers.ZeroAddress,
        saleStart, saleEnd, TOTAL_TOKEN_SUPPLY,
      ]);

      await saleFactory.connect(issuer).deploySaleVested(
        await projectToken.getAddress(),
        initData,
        "frGLD", "frGLD", DECIMALS,
        await ir.getAddress(),
        5 * DAY, 30 * DAY, 0,
      );

      const saleAddr = (await saleFactory.getSalesForToken(await projectToken.getAddress()))[0];
      sale = await ethers.getContractAt("Sale", saleAddr);
      const fractionAddr = await (platform.fractionFactory as any).saleToFraction(saleAddr);
      fractionToken = await ethers.getContractAt("CiretaFractionToken1155", fractionAddr);

      await sale.connect(issuer).addPhase(
        "Public", PRICE_PER_TOKEN, PHASE_ALLOCATION,
        MIN_TOKENS, MAX_TOKENS, TOP_UP_MIN,
        saleStart, saleEnd - 10, false, 0,
      );

      await projectToken.connect(issuer).approve(await sale.getAddress(), TOTAL_TOKEN_SUPPLY);
      await sale.connect(issuer).depositProjectTokens(TOTAL_TOKEN_SUPPLY);
      await sale.connect(admin).approveSale();
      await sale.connect(issuer).activate();

      // Investor buys a tiny amount — well under soft cap (1000 USDC)
      await time.increaseTo(saleStart + 10);
      const BUY_TOKENS = 10n;
      const COST = BUY_TOKENS * PRICE_PER_TOKEN;
      await usdc.mint(investor.address, COST);
      await usdc.connect(investor).approve(await sale.getAddress(), COST);
      await sale.connect(investor).buy(0, BUY_TOKENS);

      // Expire the sale window → finalize as failed
      await time.increaseTo(saleEnd + 10);
      await sale.connect(issuer).finalizeSale();
      expect(await sale.status()).to.equal(4n); // FinalizedFailed
    });

    it("M1. sale finalizes as FinalizedFailed when below soft cap", async () => {
      expect(await sale.status()).to.equal(4n);
    });

    it("M2. claimRefund reverts before activateRefunds", async () => {
      await expect(sale.connect(investor).claimRefund())
        .to.be.revertedWithCustomError(sale, "RefundsNotActive");
    });

    it("M3. issuer activates refunds — investor gets USDC back", async () => {
      const { usdc } = platform;
      await sale.connect(issuer).activateRefunds();

      const balBefore = await usdc.balanceOf(investor.address);
      await sale.connect(investor).claimRefund();
      const balAfter = await usdc.balanceOf(investor.address);

      const expectedRefund = 10n * PRICE_PER_TOKEN;
      expect(balAfter - balBefore).to.equal(expectedRefund);
    });

    it("M4. investor cannot double-refund", async () => {
      await sale.connect(issuer).activateRefunds();
      await sale.connect(investor).claimRefund();
      await expect(sale.connect(investor).claimRefund())
        .to.be.revertedWithCustomError(sale, "AlreadyClaimed");
    });

    it("M5. non-buyer cannot claim refund (NotPaymentContributor)", async () => {
      await sale.connect(issuer).activateRefunds();
      await expect(sale.connect(stranger).claimRefund())
        .to.be.revertedWithCustomError(sale, "NotPaymentContributor");
    });
  });

  // ── N. Admin role boundary: cannot mint ───────────────────────────────────

  describe("N. Admin role boundary — admin CANNOT mint tokens", () => {
    it("N1. admin has no SUPPLY_ROLE — mint() reverts with AccessControl", async () => {
      const { ir, tokenFactory } = await deployPlatform(admin, issuer, issuerB);

      const [tp] = await tokenFactory.connect(admin).deployToken.staticCall(
        "Gold", "GLD", DECIMALS, issuer.address, await ir.getAddress(),
        MAX_SUPPLY, true, 0n,
      );
      await tokenFactory.connect(admin).deployToken(
        "Gold", "GLD", DECIMALS, issuer.address, await ir.getAddress(),
        MAX_SUPPLY, true, 0n,
      );
      const token = await ethers.getContractAt("CiretaToken", tp);

      // admin is deployer (factory owner) but NOT the issuer — no SUPPLY_ROLE
      await expect(token.connect(admin).mint(admin.address, 1n))
        .to.be.reverted;
    });
  });

  // ── O. Sale pause / unpause ───────────────────────────────────────────────

  describe("O. Sale pause / unpause by admin", () => {
    let sale: any;
    let saleStart: number;
    let platform: Awaited<ReturnType<typeof deployPlatform>>;

    beforeEach(async () => {
      platform = await deployPlatform(admin, issuer, issuerB);
      const { ir, tokenFactory, saleFactory, usdc, feeManager } = platform;

      await ir.connect(admin).addToWhitelist(investor.address, COUNTRY_UK);

      const [tp] = await tokenFactory.connect(issuer).deployToken.staticCall(
        "Gold", "GLD", DECIMALS, issuer.address, await ir.getAddress(),
        MAX_SUPPLY, true, 0n,
      );
      await tokenFactory.connect(issuer).deployToken(
        "Gold", "GLD", DECIMALS, issuer.address, await ir.getAddress(),
        MAX_SUPPLY, true, 0n,
      );
      const projectToken = await ethers.getContractAt("CiretaToken", tp);
      await projectToken.connect(issuer).mint(issuer.address, TOTAL_TOKEN_SUPPLY);

      const now = await time.latest();
      saleStart = now + 120;
      const saleEnd = now + 60 * DAY;

      const iface = new ethers.Interface([
        "function initialize(address,address,address,address,address,address,uint256,uint256,uint256,uint256,address,uint256,uint256,uint256)",
      ]);
      const initData = iface.encodeFunctionData("initialize", [
        await projectToken.getAddress(),
        await usdc.getAddress(),
        await ir.getAddress(),
        issuer.address,
        await saleFactory.getAddress(),
        await feeManager.getAddress(),
        SOFT_CAP, HARD_CAP, 0n, 0n,
        ethers.ZeroAddress,
        saleStart, saleEnd, TOTAL_TOKEN_SUPPLY,
      ]);

      await saleFactory.connect(issuer).deploySaleVested(
        await projectToken.getAddress(),
        initData,
        "frGLD", "frGLD", DECIMALS,
        await ir.getAddress(),
        10 * DAY, 30 * DAY, 0,
      );

      const saleAddr = (await saleFactory.getSalesForToken(await projectToken.getAddress()))[0];
      sale = await ethers.getContractAt("Sale", saleAddr);

      await sale.connect(issuer).addPhase(
        "Public", PRICE_PER_TOKEN, PHASE_ALLOCATION,
        MIN_TOKENS, MAX_TOKENS, TOP_UP_MIN,
        saleStart, saleStart + 25 * DAY, false, 0,
      );
      await projectToken.connect(issuer).approve(await sale.getAddress(), TOTAL_TOKEN_SUPPLY);
      await sale.connect(issuer).depositProjectTokens(TOTAL_TOKEN_SUPPLY);
      await sale.connect(admin).approveSale();
      await sale.connect(issuer).activate();
    });

    it("O1. admin can pause an active sale", async () => {
      await sale.connect(admin).pause();
      expect(await sale.status()).to.equal(2n); // Paused
    });

    it("O2. admin can unpause a paused sale", async () => {
      await sale.connect(admin).pause();
      await sale.connect(admin).unpause();
      expect(await sale.status()).to.equal(1n); // Active
    });

    it("O3. buy reverts on paused sale", async () => {
      const { usdc } = platform;
      await sale.connect(admin).pause();
      await time.increaseTo(saleStart + 10);
      const COST = 100n * PRICE_PER_TOKEN;
      await usdc.mint(investor.address, COST);
      await usdc.connect(investor).approve(await sale.getAddress(), COST);
      await expect(sale.connect(investor).buy(0, 100n))
        .to.be.revertedWithCustomError(sale, "InvalidStatus");
    });

    it("O4. issuer can also pause active sale", async () => {
      await sale.connect(issuer).pause();
      expect(await sale.status()).to.equal(2n);
    });

    it("O5. stranger cannot pause the sale", async () => {
      await expect(sale.connect(stranger).pause())
        .to.be.revertedWithCustomError(sale, "NotIssuerOrAdmin");
    });
  });

  // ── P. CiretaVault guard: cliff > vesting ─────────────────────────────────

  describe("P. CiretaVault InvalidVestingConfig guard", () => {
    it("P1. cliff > vesting reverts with InvalidVestingConfig", async () => {
      const ERC20 = await ethers.getContractFactory("MockERC20");
      const projectToken = await ERC20.deploy("Gold", "GLD", 18);
      const MockIR = await ethers.getContractFactory("MockIdentityRegistry");
      const mockRegistry = await MockIR.deploy();
      const FT = await ethers.getContractFactory("CiretaFractionToken1155");
      const fractionToken = await upgrades.deployProxy(FT, [
        "frGLD", "frGLD", 18,
        await mockRegistry.getAddress(),
        await projectToken.getAddress(),
        ethers.ZeroAddress,
        admin.address,
      ], { unsafeAllow: ["constructor"] });

      const Vault = await ethers.getContractFactory("CiretaVault");
      await expect(
        upgrades.deployProxy(Vault, [
          await projectToken.getAddress(),
          await fractionToken.getAddress(),
          await mockRegistry.getAddress(),
          60 * DAY,  // cliff > vesting — invalid
          30 * DAY,
          stranger.address,
          admin.address,
          0,
          admin.address,
        ], { unsafeAllow: ["constructor"] }),
      ).to.be.revertedWithCustomError(Vault, "InvalidVestingConfig");
    });

    it("P2. vestingDuration = 0 reverts with InvalidVestingConfig", async () => {
      const ERC20 = await ethers.getContractFactory("MockERC20");
      const projectToken = await ERC20.deploy("Gold", "GLD", 18);
      const MockIR = await ethers.getContractFactory("MockIdentityRegistry");
      const mockRegistry = await MockIR.deploy();
      const FT = await ethers.getContractFactory("CiretaFractionToken1155");
      const fractionToken = await upgrades.deployProxy(FT, [
        "frGLD", "frGLD", 18,
        await mockRegistry.getAddress(),
        await projectToken.getAddress(),
        ethers.ZeroAddress,
        admin.address,
      ], { unsafeAllow: ["constructor"] });

      const Vault = await ethers.getContractFactory("CiretaVault");
      await expect(
        upgrades.deployProxy(Vault, [
          await projectToken.getAddress(),
          await fractionToken.getAddress(),
          await mockRegistry.getAddress(),
          0, 0, // both zero — invalid (vestingDuration must be > 0)
          stranger.address,
          admin.address,
          0,
          admin.address,
        ], { unsafeAllow: ["constructor"] }),
      ).to.be.revertedWithCustomError(Vault, "InvalidVestingConfig");
    });
  });
});
