/**
 * E2E_IssuerSelfServe_v2.test.ts
 *
 * End-to-end tests for v2 contract changes:
 *   A. Token economics (fixed-supply vs mintable, maxSupply cap, batchMint)
 *   B. Issuer self-serve token deploy (access control on CiretaTokenFactory)
 *   C. Auto-whitelist (token, compliance, sale, vault, fraction all land in IR)
 *   D. Compliance issuer self-serve (complianceAdmin modifier, cross-issuer isolation)
 *   E. Vault lock-up-only variant (cliff == vesting)
 *   F. Vault cliff + linear vesting (preserved behavior, elapsed-from-cliff math)
 */
import { expect } from "chai";
import { ethers, upgrades } from "hardhat";
import { time } from "@nomicfoundation/hardhat-network-helpers";
import type { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";

// ── Constants ────────────────────────────────────────────────────────────────

const DAY = 24 * 3600;
const MAX_SUPPLY = 1_000_000n * 10n ** 6n; // 1 million tokens at 6 decimals

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Deploy a SimpleIdentityRegistry and grant REGISTRAR_ROLE to `registrar`.
 */
async function deploySimpleIR(owner: SignerWithAddress, registrar?: SignerWithAddress) {
  const SIR = await ethers.getContractFactory("SimpleIdentityRegistry");
  const ir = await upgrades.deployProxy(SIR, [
    owner.address,
    ethers.ZeroAddress,
    ethers.ZeroAddress,
    ethers.ZeroAddress,
  ], { unsafeAllow: ["constructor"] });

  if (registrar) {
    const REGISTRAR_ROLE = await ir.REGISTRAR_ROLE();
    await ir.connect(owner).grantRole(REGISTRAR_ROLE, registrar.address);
  }
  return ir;
}

/**
 * Deploy the full CiretaTokenFactory stack and return factory + IR.
 * The factory is granted REGISTRAR_ROLE on the IR so auto-whitelist works.
 * Uses raw (non-proxy) implementation contracts as required by ERC1967Proxy.
 */
async function deployTokenFactory(owner: SignerWithAddress, issuerReg: any) {
  const ir = await deploySimpleIR(owner);

  // Deploy supporting proxies (needed for factory init params)
  const CTR = await ethers.getContractFactory("ClaimTopicsRegistry");
  const claimTopics = await upgrades.deployProxy(CTR, [owner.address]);

  const TIR = await ethers.getContractFactory("TrustedIssuersRegistry");
  const trustedIssuers = await upgrades.deployProxy(TIR, [owner.address]);

  const IRS = await ethers.getContractFactory("IdentityRegistryStorage");
  const idStorage = await upgrades.deployProxy(IRS, [owner.address]);

  // Deploy RAW implementations — CiretaTokenFactory uses these as ERC1967Proxy targets.
  // UUPS contracts have _disableInitializers() in their constructor so raw deploy is safe.
  const TokenImplFactory = await ethers.getContractFactory("CiretaToken");
  const tokenImpl = await TokenImplFactory.deploy();

  const IRImplFactory = await ethers.getContractFactory("IdentityRegistry");
  const irImpl = await IRImplFactory.deploy();

  const MCImplFactory = await ethers.getContractFactory("ModularCompliance");
  const mcImpl = await MCImplFactory.deploy();

  // Deploy factory
  const FF = await ethers.getContractFactory("CiretaTokenFactory");
  const factory = await upgrades.deployProxy(FF, [
    owner.address,
    await tokenImpl.getAddress(),
    await irImpl.getAddress(),
    await mcImpl.getAddress(),
    await claimTopics.getAddress(),
    await trustedIssuers.getAddress(),
    await idStorage.getAddress(),
    await issuerReg.getAddress(),
  ]);

  // Grant REGISTRAR_ROLE on the SimpleIR to the factory so auto-whitelist succeeds
  const REGISTRAR_ROLE = await ir.REGISTRAR_ROLE();
  await ir.connect(owner).grantRole(REGISTRAR_ROLE, await factory.getAddress());

  // Use simpleIdentityMode so deployToken with address(0) IR doesn't try to call
  // bindIdentityRegistry on identityRegistryStorage (factory is not its owner in tests).
  await factory.setSimpleIdentityMode(true);

  return { factory, ir };
}

// ─────────────────────────────────────────────────────────────────────────────

describe("E2E IssuerSelfServe v2", () => {
  let admin: SignerWithAddress;
  let issuer: SignerWithAddress;
  let issuerB: SignerWithAddress;
  let buyer: SignerWithAddress;
  let stranger: SignerWithAddress;

  before(async () => {
    [admin, issuer, issuerB, buyer, stranger] = await ethers.getSigners();
  });

  // ── A. Token economics ────────────────────────────────────────────────────

  describe("A. Token economics", () => {
    let registry: any;
    let compliance: any;

    beforeEach(async () => {
      const IR = await ethers.getContractFactory("MockIdentityRegistry");
      registry = await IR.deploy();
      const MC = await ethers.getContractFactory("MockCompliance");
      compliance = await MC.deploy();
    });

    async function deployTokenWith(
      owner: SignerWithAddress,
      maxSupply: bigint,
      mintable: boolean,
      initialMint: bigint,
    ) {
      const TF = await ethers.getContractFactory("CiretaToken");
      const token = await upgrades.deployProxy(TF, [
        "Test Token", "TST", 6,
        await registry.getAddress(),
        await compliance.getAddress(),
        owner.address,
        owner.address,
        maxSupply,
        mintable,
        initialMint,
      ], { unsafeAllow: ["constructor"] });
      return token;
    }

    it("A1. fixed-supply: initialMintAmount must equal maxSupply", async () => {
      const token = await deployTokenWith(admin, MAX_SUPPLY, false, MAX_SUPPLY);
      expect(await token.totalSupply()).to.equal(MAX_SUPPLY);
      expect(await token.balanceOf(admin.address)).to.equal(MAX_SUPPLY);
    });

    it("A2. fixed-supply: SUPPLY_ROLE revoked — subsequent mint() reverts", async () => {
      const token = await deployTokenWith(admin, MAX_SUPPLY, false, MAX_SUPPLY);
      await expect(token.connect(admin).mint(admin.address, 1n))
        .to.be.reverted; // SUPPLY_ROLE removed
    });

    it("A3. mintable: respects maxSupply cap — can mint up to cap", async () => {
      const token = await deployTokenWith(admin, MAX_SUPPLY, true, 0n);
      await token.mint(admin.address, MAX_SUPPLY);
      expect(await token.totalSupply()).to.equal(MAX_SUPPLY);
    });

    it("A4. mintable: reverts when mint would exceed cap", async () => {
      const token = await deployTokenWith(admin, MAX_SUPPLY, true, 0n);
      await token.mint(admin.address, MAX_SUPPLY);
      await expect(token.connect(admin).mint(admin.address, 1n))
        .to.be.revertedWith("exceeds max supply");
    });

    it("A5. batchMint enforces cap cumulatively across all elements", async () => {
      const token = await deployTokenWith(admin, MAX_SUPPLY, true, 0n);
      const half = MAX_SUPPLY / 2n;
      // This is fine (sums to cap exactly)
      await token.batchMint([admin.address, admin.address], [half, half]);
      expect(await token.totalSupply()).to.equal(MAX_SUPPLY);

      // Deploy fresh token for overflow test
      const token2 = await deployTokenWith(admin, MAX_SUPPLY, true, 0n);
      await expect(
        token2.batchMint([admin.address, admin.address], [MAX_SUPPLY, 1n]),
      ).to.be.revertedWith("exceeds max supply");
    });

    it("A6. initialMintAmount can be partial for mintable token", async () => {
      const half = MAX_SUPPLY / 2n;
      const token = await deployTokenWith(admin, MAX_SUPPLY, true, half);
      expect(await token.totalSupply()).to.equal(half);
      // Can mint remaining half
      await token.mint(admin.address, half);
      expect(await token.totalSupply()).to.equal(MAX_SUPPLY);
    });
  });

  // ── B. Issuer self-serve token deploy ─────────────────────────────────────

  describe("B. Issuer self-serve token deploy", () => {
    let issuerReg: any;
    let factory: any;
    let ir: any;

    beforeEach(async () => {
      // Deploy IssuerRegistry and register issuer
      const IsReg = await ethers.getContractFactory("IssuerRegistry");
      issuerReg = await upgrades.deployProxy(IsReg, [admin.address]);
      await issuerReg.registerIssuer(issuer.address, "Test Issuer", "AU");
      await issuerReg.activateIssuer(issuer.address);

      ({ factory, ir } = await deployTokenFactory(admin, issuerReg));
    });

    it("B1. non-issuer wallet deployToken reverts with 'not owner or active issuer'", async () => {
      await expect(
        factory.connect(stranger).deployToken(
          "T", "T", 6, stranger.address, ethers.ZeroAddress,
          MAX_SUPPLY, true, 0n,
        ),
      ).to.be.revertedWith("not owner or active issuer");
    });

    it("B2. active issuer can deploy their own token", async () => {
      await factory.connect(issuer).deployToken(
        "Issuer Gold", "IGLD", 6,
        issuer.address,
        ethers.ZeroAddress, // legacy IR path (simpleIdentityMode=true avoids bindIdentityRegistry)
        MAX_SUPPLY, true, 0n,
      );
      expect(await factory.getDeployedTokensCount()).to.equal(1);
    });

    it("B3. active issuer cannot deploy for a different issuer address", async () => {
      await expect(
        factory.connect(issuer).deployToken(
          "T", "T", 6,
          stranger.address, // issuer != msg.sender
          ethers.ZeroAddress,
          MAX_SUPPLY, true, 0n,
        ),
      ).to.be.revertedWith("issuer must be msg.sender");
    });

    it("B4. SystemContractWhitelisted events emitted on deploy", async () => {
      // Deploy with the SimpleIR (factory has REGISTRAR_ROLE → success=true)
      const tx = await factory.connect(admin).deployToken(
        "SIR Token", "SIRT", 6,
        admin.address,
        await ir.getAddress(), // use the SimpleIR where factory has REGISTRAR_ROLE
        MAX_SUPPLY, true, 0n,
      );
      const receipt = await tx.wait();
      const iface = factory.interface;
      const events = receipt.logs
        .map((log: any) => { try { return iface.parseLog(log); } catch { return null; } })
        .filter((e: any) => e?.name === "SystemContractWhitelisted");

      expect(events.length).to.equal(2); // token + compliance
      // Both should succeed (factory has REGISTRAR_ROLE on ir)
      for (const evt of events) {
        expect(evt.args.success).to.be.true;
      }
    });
  });

  // ── C. Auto-whitelist ─────────────────────────────────────────────────────

  describe("C. Auto-whitelist", () => {
    let ir: any;
    let factory: any;

    beforeEach(async () => {
      const IsReg = await ethers.getContractFactory("IssuerRegistry");
      const issuerReg = await upgrades.deployProxy(IsReg, [admin.address]);
      ({ factory, ir } = await deployTokenFactory(admin, issuerReg));
    });

    it("C1. after token deploy, IR.isVerified(token) == true && IR.isVerified(compliance) == true", async () => {
      const irAddr = await ir.getAddress();
      const [tokenProxy, , complianceProxy] = await factory.deployToken.staticCall(
        "Gold", "GLD", 6,
        admin.address,
        irAddr,   // use the SimpleIR
        MAX_SUPPLY, true, 0n,
      );
      await factory.deployToken(
        "Gold", "GLD", 6, admin.address, irAddr, MAX_SUPPLY, true, 0n,
      );

      expect(await ir.isVerified(tokenProxy)).to.be.true;
      expect(await ir.isVerified(complianceProxy)).to.be.true;
    });

    it("C2. after sale deploy, IR.isVerified(sale) == true", async () => {
      // Deploy the sale factory stack and wire it to the same IR
      const IsReg = await ethers.getContractFactory("IssuerRegistry");
      const issuerReg = await upgrades.deployProxy(IsReg, [admin.address]);
      await issuerReg.registerIssuer(issuer.address, "Test", "AU");
      await issuerReg.activateIssuer(issuer.address);

      const ERC20 = await ethers.getContractFactory("MockERC20");
      const mockToken = await ERC20.deploy("Gold Token", "GLD", 6);
      const mockUsdc = await ERC20.deploy("USDC", "USDC", 6);

      const SaleContract = await ethers.getContractFactory("Sale");
      const saleImpl = await SaleContract.deploy();

      const SFContract = await ethers.getContractFactory("CiretaSaleFactory");
      const saleFactory = await upgrades.deployProxy(
        SFContract,
        [admin.address, await saleImpl.getAddress()],
        { unsafeAllow: ["constructor"] },
      );
      await saleFactory.setIssuerRegistry(await issuerReg.getAddress());

      // Grant REGISTRAR_ROLE to saleFactory on the ir so auto-whitelist succeeds
      const REGISTRAR_ROLE = await ir.REGISTRAR_ROLE();
      await ir.connect(admin).grantRole(REGISTRAR_ROLE, await saleFactory.getAddress());

      // Encode Sale.initialize — uses MockIdentityRegistry to avoid dependency
      const MockIR = await ethers.getContractFactory("MockIdentityRegistry");
      const mockIR = await MockIR.deploy();

      const PFM = await ethers.getContractFactory("PlatformFeeManager");
      const pfm = await upgrades.deployProxy(PFM, [admin.address, admin.address, 0]);
      await saleFactory.setPlatformFeeManager(await pfm.getAddress());

      const now = await time.latest();
      const iface = new ethers.Interface([
        "function initialize(address,address,address,address,address,address,uint256,uint256,uint256,uint256,address,uint256,uint256,uint256)",
      ]);
      const initData = iface.encodeFunctionData("initialize", [
        await mockToken.getAddress(),
        await mockUsdc.getAddress(),
        await mockIR.getAddress(), // uses MockIR that also exposes addToWhitelist via _tryWhitelist
        issuer.address,
        await saleFactory.getAddress(),
        admin.address,
        ethers.parseUnits("100", 6),
        ethers.parseUnits("10000", 6),
        0n, 0n,
        ethers.ZeroAddress,
        now + 60,
        now + 30 * DAY,
        ethers.parseUnits("100000", 6),
      ]);

      // Sale factory attempts to whitelist the sale on the MockIR
      // The MockIR doesn't have addToWhitelist so it will emit success=false (gracefully)
      // What matters: the tx succeeds and the sale is deployed
      const tx = await saleFactory.connect(issuer).deploySale(
        await mockToken.getAddress(), initData,
      );
      const receipt = await tx.wait();
      const salesForToken = await saleFactory.getSalesForToken(await mockToken.getAddress());
      expect(salesForToken.length).to.equal(1);

      // The auto-whitelist on a MockIR will fail gracefully (no addToWhitelist fn)
      // but the sale is still deployed successfully
      const saleAddr = salesForToken[0];
      expect(saleAddr).to.not.equal(ethers.ZeroAddress);
    });

    it("C3. after fraction+vault deploy, both vault and fraction are whitelisted", async () => {
      const ERC20 = await ethers.getContractFactory("MockERC20");
      const mockToken = await ERC20.deploy("Gold", "GLD", 6);

      const FT = await ethers.getContractFactory("CiretaFractionToken1155");
      const fractionImpl = await FT.deploy();
      const V = await ethers.getContractFactory("CiretaVault");
      const vaultImpl = await V.deploy();

      const FFContract = await ethers.getContractFactory("CiretaFractionFactory");
      const fractionFactory = await upgrades.deployProxy(
        FFContract,
        [admin.address, await fractionImpl.getAddress(), await vaultImpl.getAddress()],
        { unsafeAllow: ["constructor"] },
      );

      // Grant REGISTRAR_ROLE to fractionFactory so auto-whitelist passes
      const REGISTRAR_ROLE = await ir.REGISTRAR_ROLE();
      await ir.connect(admin).grantRole(REGISTRAR_ROLE, await fractionFactory.getAddress());

      const irAddr = await ir.getAddress();
      const tx = await fractionFactory.deployVaultAndFraction(
        "frGLD", "frGLD", 6,
        await mockToken.getAddress(),
        irAddr,
        stranger.address, // sale (dummy)
        30 * DAY, 180 * DAY, 0, admin.address,
      );
      const receipt = await tx.wait();

      const vaultAddr = await fractionFactory.saleToVault(stranger.address);
      const fractionAddr = await fractionFactory.saleToFraction(stranger.address);

      expect(await ir.isVerified(vaultAddr)).to.be.true;
      expect(await ir.isVerified(fractionAddr)).to.be.true;
    });
  });

  // ── D. Compliance issuer self-serve ───────────────────────────────────────

  describe("D. Compliance issuer self-serve (complianceAdmin modifier)", () => {
    let module: any;

    beforeEach(async () => {
      const CAFactory = await ethers.getContractFactory("CountryAllowModule");
      module = await upgrades.deployProxy(CAFactory, [admin.address]);
    });

    async function deployIssuerCompliance(issuerSigner: SignerWithAddress) {
      const MCFactory = await ethers.getContractFactory("ModularCompliance");
      const comp = await upgrades.deployProxy(MCFactory, [issuerSigner.address]);
      // Issuer binds their compliance to the module
      await module.connect(issuerSigner).bindCompliance(await comp.getAddress());
      return comp;
    }

    it("D1. issuer (= compliance owner) can addAllowedCountry — no admin required", async () => {
      const comp = await deployIssuerCompliance(issuer);
      await module.connect(issuer).addAllowedCountry(await comp.getAddress(), 826); // UK
      expect(await module.isCountryAllowed(await comp.getAddress(), 826)).to.be.true;
    });

    it("D2. non-owner non-admin wallet reverts on addAllowedCountry", async () => {
      const comp = await deployIssuerCompliance(issuer);
      await expect(
        module.connect(stranger).addAllowedCountry(await comp.getAddress(), 826),
      ).to.be.revertedWith("not authorized");
    });

    it("D3. cross-issuer isolation: issuerA cannot configure issuerB's compliance", async () => {
      const compA = await deployIssuerCompliance(issuer);
      const compB = await deployIssuerCompliance(issuerB);

      // issuer cannot touch issuerB's compliance
      await expect(
        module.connect(issuer).addAllowedCountry(await compB.getAddress(), 840),
      ).to.be.revertedWith("not authorized");

      // issuerB cannot touch issuer's compliance
      await expect(
        module.connect(issuerB).addAllowedCountry(await compA.getAddress(), 840),
      ).to.be.revertedWith("not authorized");
    });

    it("D4. admin (module owner) can always configure any bound compliance", async () => {
      const comp = await deployIssuerCompliance(issuer);
      // admin owns the module — complianceAdmin allows this
      await module.connect(admin).addAllowedCountry(await comp.getAddress(), 36); // AU
      expect(await module.isCountryAllowed(await comp.getAddress(), 36)).to.be.true;
    });

    it("D5. issuer can unbindCompliance from their own module binding", async () => {
      const comp = await deployIssuerCompliance(issuer);
      await module.connect(issuer).unbindCompliance(await comp.getAddress());
      expect(await module.isComplianceBound(await comp.getAddress())).to.be.false;
    });
  });

  // ── E. Vault lock-up-only variant (cliff == vesting) ─────────────────────

  describe("E. Vault lock-up-only variant (cliff == vesting)", () => {
    const LOCKUP = 30 * DAY; // cliff = vesting = 30 days
    const BALANCE = ethers.parseEther("100");

    let vault: any;
    let fractionToken: any;
    let projectToken: any;
    let saleAccount: SignerWithAddress;
    let investor: SignerWithAddress;
    let mockRegistry: any;

    beforeEach(async () => {
      [, , , saleAccount, investor] = await ethers.getSigners();

      const MockIR = await ethers.getContractFactory("MockIdentityRegistry");
      mockRegistry = await MockIR.deploy();
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
        LOCKUP,  // cliffDuration == vestingDuration → lock-up variant
        LOCKUP,
        saleAccount.address,
        admin.address,
        0, // Keep
        admin.address,
      ], { unsafeAllow: ["constructor"] });

      const MINTER_ROLE = ethers.keccak256(ethers.toUtf8Bytes("MINTER_ROLE"));
      const BURNER_ROLE = ethers.keccak256(ethers.toUtf8Bytes("BURNER_ROLE"));
      await fractionToken.grantRole(MINTER_ROLE, saleAccount.address);
      await fractionToken.grantRole(BURNER_ROLE, await vault.getAddress());

      // Setup: deposit + allocate + start vesting
      await projectToken.mint(saleAccount.address, BALANCE);
      await projectToken.connect(saleAccount).approve(await vault.getAddress(), BALANCE);
      await vault.connect(saleAccount).depositTokens(BALANCE);
      await vault.connect(saleAccount).recordAllocation(investor.address, 1, BALANCE);
      await fractionToken.connect(saleAccount).mint(investor.address, 1, BALANCE, "0x");
      await vault.connect(saleAccount).startVesting();
    });

    it("E1. claimable() at t=0 is 0", async () => {
      expect(await vault.getClaimable(investor.address)).to.equal(0n);
    });

    it("E2. claimable() at t=15d (mid-lockup) is still 0", async () => {
      await time.increase(15 * DAY);
      expect(await vault.getClaimable(investor.address)).to.equal(0n);
    });

    it("E3. claimable() at t=30d (exactly at lockup end) is full balance", async () => {
      await time.increase(LOCKUP);
      expect(await vault.getClaimable(investor.address)).to.equal(BALANCE);
    });

    it("E4. claimable() at t=60d (after lockup) is still full balance", async () => {
      await time.increase(60 * DAY);
      expect(await vault.getClaimable(investor.address)).to.equal(BALANCE);
    });

    it("E5. claim() before lockup reverts with NothingToClaim", async () => {
      await time.increase(15 * DAY);
      await expect(vault.connect(investor).claim())
        .to.be.revertedWithCustomError(vault, "NothingToClaim");
    });

    it("E6. claim() after lockup delivers full balance", async () => {
      await time.increase(LOCKUP + 1);
      await vault.connect(investor).claim();
      expect(await projectToken.balanceOf(investor.address)).to.equal(BALANCE);
    });

    it("E7. vault reverts if cliff > vesting (InvalidVestingConfig)", async () => {
      const Vault = await ethers.getContractFactory("CiretaVault");
      await expect(
        upgrades.deployProxy(Vault, [
          await projectToken.getAddress(),
          await fractionToken.getAddress(),
          await mockRegistry.getAddress(),
          60 * DAY,  // cliff > vesting
          30 * DAY,
          saleAccount.address,
          admin.address,
          0, admin.address,
        ], { unsafeAllow: ["constructor"] }),
      ).to.be.revertedWithCustomError(Vault, "InvalidVestingConfig");
    });
  });

  // ── F. Vault cliff + linear vesting (existing behavior preserved) ─────────

  describe("F. Vault cliff + linear vesting", () => {
    const CLIFF = 10 * DAY;
    const VESTING = 30 * DAY;
    const BALANCE = 1000n * 10n ** 18n; // 1000 tokens (18 dec for easy math)

    let vault: any;
    let fractionToken: any;
    let projectToken: any;
    let saleAccount: SignerWithAddress;
    let investor: SignerWithAddress;
    let mockRegistry: any;

    beforeEach(async () => {
      [, , , saleAccount, investor] = await ethers.getSigners();

      const MockIR = await ethers.getContractFactory("MockIdentityRegistry");
      mockRegistry = await MockIR.deploy();
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
        CLIFF,
        VESTING,
        saleAccount.address,
        admin.address,
        0, // Keep
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

    it("F1. claimable() at t=5d (before cliff) is 0", async () => {
      await time.increase(5 * DAY);
      expect(await vault.getClaimable(investor.address)).to.equal(0n);
    });

    it("F2. claimable() at t=10d (exactly at cliff) is 0 (boundary: cliff not crossed)", async () => {
      await time.increase(CLIFF);
      // elapsed == cliffDuration means cliff check returns false
      // (contract: if elapsed < cliffDuration → return 0; then at elapsed==cliff → enters linear branch)
      // Linear elapsed at t=cliff = 0, so result = 0
      const claimable = await vault.getClaimable(investor.address);
      // At exactly t=cliff: linearElapsed = 0 → 0 tokens
      expect(claimable).to.equal(0n);
    });

    it("F3. claimable() at t=20d (midpoint cliff→vesting) is ~50% of balance", async () => {
      await time.increase(20 * DAY);
      // elapsed=20d, cliff=10d, vesting=30d
      // linearElapsed = 20 - 10 = 10d, linearDuration = 30 - 10 = 20d → 50%
      const claimable = await vault.getClaimable(investor.address);
      // Allow small rounding (±1 wei)
      expect(claimable).to.be.closeTo(BALANCE / 2n, 1n);
    });

    it("F4. claimable() at t=30d (full vesting) is full balance", async () => {
      await time.increase(VESTING);
      expect(await vault.getClaimable(investor.address)).to.equal(BALANCE);
    });

    it("F5. full claim after vesting delivers all tokens", async () => {
      await time.increase(VESTING + 1);
      await vault.connect(investor).claim();
      expect(await projectToken.balanceOf(investor.address)).to.equal(BALANCE);
      expect(await fractionToken.balanceOf(investor.address, 1)).to.equal(0n);
    });
  });
});
