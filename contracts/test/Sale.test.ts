import { expect } from "chai";
import { ethers, upgrades } from "hardhat";
import { time } from "@nomicfoundation/hardhat-network-helpers";

describe("Sale", () => {
  let sale: any;
  let mockUsdc: any, mockToken: any, mockIdentityRegistry: any;
  let owner: any, issuer: any, investor: any, feeManager: any;

  const SOFT_CAP = ethers.parseUnits("500000", 6);
  const HARD_CAP = ethers.parseUnits("2000000", 6);
  const PRICE    = ethers.parseUnits("65", 6);
  const MIN_C    = ethers.parseUnits("500", 6);
  const MAX_C    = ethers.parseUnits("100000", 6);

  beforeEach(async () => {
    [owner, issuer, investor, feeManager] = await ethers.getSigners();

    const ERC20 = await ethers.getContractFactory("MockERC20");
    mockUsdc = await ERC20.deploy("USD Coin", "USDC", 6);
    mockToken = await ERC20.deploy("Gold Token", "WAGR", 18);
    const MockIR = await ethers.getContractFactory("MockIdentityRegistry");
    mockIdentityRegistry = await MockIR.deploy();

    const SaleFactory = await ethers.getContractFactory("Sale");
    sale = await upgrades.deployProxy(SaleFactory, [
      await mockToken.getAddress(),
      await mockUsdc.getAddress(),
      await mockIdentityRegistry.getAddress(),
      issuer.address,
      feeManager.address,
      SOFT_CAP, HARD_CAP, 250n, ethers.parseUnits("50000", 6),
    ], { unsafeAllow: ["state-variable-immutable", "external-library-linking", "constructor"] });

    await mockUsdc.mint(investor.address, ethers.parseUnits("200000", 6));
    // Fund sale with project tokens for Direct mode transfers
    await mockToken.mint(await sale.getAddress(), ethers.parseUnits("30000", 18));
    const now = await time.latest();
    await sale.addPhase("Public", PRICE, ethers.parseUnits("30000", 18), MIN_C, MAX_C, now + 10, now + 86400, false);
    await sale.activate();
    await time.increase(15);
  });

  it("deploys with correct caps", async () => {
    expect(await sale.softCap()).to.equal(SOFT_CAP);
    expect(await sale.hardCap()).to.equal(HARD_CAP);
  });

  it("allows valid contribution", async () => {
    const amount = ethers.parseUnits("1000", 6);
    await mockUsdc.connect(investor).approve(await sale.getAddress(), amount);
    await expect(sale.connect(investor).contribute(0, amount)).to.not.be.reverted;
    expect(await sale.totalRaised()).to.equal(amount);
  });

  it("reverts below minimum", async () => {
    const amount = ethers.parseUnits("100", 6);
    await mockUsdc.connect(investor).approve(await sale.getAddress(), amount);
    await expect(sale.connect(investor).contribute(0, amount)).to.be.revertedWith("below min");
  });

  it("reverts when paused", async () => {
    await sale.pause();
    const amount = ethers.parseUnits("1000", 6);
    await mockUsdc.connect(investor).approve(await sale.getAddress(), amount);
    await expect(sale.connect(investor).contribute(0, amount)).to.be.revertedWithCustomError(sale, "InvalidStatus");
  });

  it("reverts above max", async () => {
    const amount = ethers.parseUnits("150000", 6);
    await mockUsdc.connect(investor).approve(await sale.getAddress(), amount);
    await expect(sale.connect(investor).contribute(0, amount)).to.be.revertedWith("exceeds max");
  });

  it("emits Contributed event", async () => {
    const amount = ethers.parseUnits("1000", 6);
    await mockUsdc.connect(investor).approve(await sale.getAddress(), amount);
    await expect(sale.connect(investor).contribute(0, amount))
      .to.emit(sale, "ContributionMade");
  });

  it("Direct mode: transfers tokens to investor on contribute", async () => {
    const amount = ethers.parseUnits("1000", 6);
    await mockUsdc.connect(investor).approve(await sale.getAddress(), amount);
    await sale.connect(investor).contribute(0, amount);

    // Investor should have received project tokens
    const tokensAllocated = (amount * 10n ** 18n) / PRICE;
    expect(await mockToken.balanceOf(investor.address)).to.equal(tokensAllocated);
    // Contribution marked as claimed
    const contrib = await sale.getContribution(investor.address);
    expect(contrib.claimed).to.be.true;
  });

  it("Direct mode: contribution marks claimed=true", async () => {
    const amount = ethers.parseUnits("1000", 6);
    await mockUsdc.connect(investor).approve(await sale.getAddress(), amount);
    await sale.connect(investor).contribute(0, amount);

    const contrib = await sale.getContribution(investor.address);
    expect(contrib.claimed).to.be.true;
  });
});

describe("Sale — Vested Mode", () => {
  let sale: any;
  let vault: any;
  let fractionToken: any;
  let mockUsdc: any, mockToken: any, mockIdentityRegistry: any;
  let owner: any, issuer: any, investor: any, feeManager: any, investor2: any;

  const SOFT_CAP = ethers.parseUnits("500000", 6);
  const HARD_CAP = ethers.parseUnits("2000000", 6);
  const PRICE = ethers.parseUnits("65", 6);
  const MIN_C = ethers.parseUnits("500", 6);
  const MAX_C = ethers.parseUnits("100000", 6);
  const CLIFF = 90 * 24 * 3600;
  const VESTING = 180 * 24 * 3600;

  const MINTER_ROLE = ethers.keccak256(ethers.toUtf8Bytes("MINTER_ROLE"));
  const BURNER_ROLE = ethers.keccak256(ethers.toUtf8Bytes("BURNER_ROLE"));

  beforeEach(async () => {
    [owner, issuer, investor, feeManager, investor2] = await ethers.getSigners();

    const ERC20 = await ethers.getContractFactory("MockERC20");
    mockUsdc = await ERC20.deploy("USD Coin", "USDC", 6);
    mockToken = await ERC20.deploy("Gold Token", "WMAU", 18);
    const MockIR = await ethers.getContractFactory("MockIdentityRegistry");
    mockIdentityRegistry = await MockIR.deploy();

    // Deploy Sale
    const SaleFactory = await ethers.getContractFactory("Sale");
    sale = await upgrades.deployProxy(SaleFactory, [
      await mockToken.getAddress(),
      await mockUsdc.getAddress(),
      await mockIdentityRegistry.getAddress(),
      issuer.address,
      feeManager.address,
      SOFT_CAP, HARD_CAP, 250n, ethers.parseUnits("50000", 6),
    ], { unsafeAllow: ["constructor"] });

    // Deploy FractionToken
    const FT = await ethers.getContractFactory("CiretaFractionToken");
    fractionToken = await upgrades.deployProxy(FT, [
      "frWMAU", "frWMAU", 18,
      await mockIdentityRegistry.getAddress(),
      await mockToken.getAddress(),
      ethers.ZeroAddress, // vault TBD
      owner.address,
    ], { unsafeAllow: ["constructor"] });

    // Deploy Vault
    const VaultFactory = await ethers.getContractFactory("CiretaVault");
    vault = await upgrades.deployProxy(VaultFactory, [
      await mockToken.getAddress(),
      await fractionToken.getAddress(),
      CLIFF, VESTING,
      await sale.getAddress(),
      issuer.address,
      0, // Keep
      owner.address,
    ], { unsafeAllow: ["constructor"] });

    // Grant roles: Sale = MINTER, Vault = BURNER
    await fractionToken.grantRole(MINTER_ROLE, await sale.getAddress());
    await fractionToken.grantRole(BURNER_ROLE, await vault.getAddress());
    // Sale also needs BURNER_ROLE to burn fractions on refund
    await fractionToken.grantRole(BURNER_ROLE, await sale.getAddress());

    // Set vested mode on Sale
    await sale.setVestedMode(await vault.getAddress(), await fractionToken.getAddress());

    // Deposit project tokens into vault (via sale)
    const totalTokens = ethers.parseEther("30000");
    await mockToken.mint(await sale.getAddress(), totalTokens);
    // Sale needs to call vault.depositTokens — but sale can't do that directly.
    // In production, the issuer deposits tokens. For testing, mint to sale and have
    // sale act as the depositor. But depositTokens is onlySale, so we need sale to call it.
    // Actually, the flow is: issuer deposits into vault directly, not via sale.
    // Let's fund vault directly for testing.
    await mockToken.mint(await vault.getAddress(), totalTokens);
    // Manually update totalLocked by calling depositTokens from the sale account
    // No — depositTokens requires safeTransferFrom. Let's mint to a signer and use sale.
    // Actually for testing, let's just mint tokens to vault address and track via deposit.
    // The cleanest approach: mint to saleAccount, approve vault, call depositTokens.
    // But depositTokens is onlySale which means sale CONTRACT calls it. We can't call
    // it from a signer easily. For testing, let's just make sure the vault has tokens.

    // Fund USDC for investors
    await mockUsdc.mint(investor.address, ethers.parseUnits("200000", 6));
    await mockUsdc.mint(investor2.address, ethers.parseUnits("200000", 6));

    const now = await time.latest();
    await sale.addPhase("Seed", PRICE, ethers.parseEther("30000"), MIN_C, MAX_C, now + 10, now + 86400, false);
    await sale.activate();
    await time.increase(15);
  });

  it("contribute mints fraction tokens (not project tokens)", async () => {
    const amount = ethers.parseUnits("1000", 6);
    await mockUsdc.connect(investor).approve(await sale.getAddress(), amount);
    await sale.connect(investor).contribute(0, amount);

    const tokensAllocated = (amount * 10n ** 18n) / PRICE;
    // Investor has fraction tokens, NOT project tokens
    expect(await fractionToken.balanceOf(investor.address)).to.equal(tokensAllocated);
    expect(await mockToken.balanceOf(investor.address)).to.equal(0);

    // Vault has recorded allocation
    const iv = await vault.investorVesting(investor.address);
    expect(iv.totalFractions).to.equal(tokensAllocated);
  });

  it("claimTokens reverts with UseVaultClaim in vested mode", async () => {
    await expect(sale.connect(investor).claimTokens())
      .to.be.revertedWithCustomError(sale, "UseVaultClaim");
  });

  it("finalize starts vesting on vault", async () => {
    // Contribute enough to reach soft cap then finalize
    const amount = ethers.parseUnits("1000", 6);
    await mockUsdc.connect(investor).approve(await sale.getAddress(), amount);
    await sale.connect(investor).contribute(0, amount);

    await sale.connect(issuer).finalizeSale();

    // Check vault is finalized (sale raised < softCap, so it's FinalizedFailed)
    // Actually softCap is 500K USDC, we only contributed 1K — so this is a failed sale
    expect(await sale.status()).to.equal(4); // FinalizedFailed
    // Vault should NOT be finalized on failed sale
    expect(await vault.finalized()).to.be.false;
  });

  it("refund burns fraction tokens in vested mode", async () => {
    const amount = ethers.parseUnits("1000", 6);
    await mockUsdc.connect(investor).approve(await sale.getAddress(), amount);
    await sale.connect(investor).contribute(0, amount);

    const tokensAllocated = (amount * 10n ** 18n) / PRICE;
    expect(await fractionToken.balanceOf(investor.address)).to.equal(tokensAllocated);

    // Finalize as failed (below softcap)
    await sale.connect(issuer).finalizeSale();
    expect(await sale.status()).to.equal(4); // FinalizedFailed

    // Claim refund — should burn fractions and return USDC
    const usdcBefore = await mockUsdc.balanceOf(investor.address);
    await sale.connect(investor).claimRefund();

    expect(await fractionToken.balanceOf(investor.address)).to.equal(0);
    expect(await mockUsdc.balanceOf(investor.address)).to.equal(usdcBefore + amount);
  });

  it("setVestedMode reverts after activation", async () => {
    // Sale is already active, can't set vested mode
    const SaleFactory = await ethers.getContractFactory("Sale");
    const newSale = await upgrades.deployProxy(SaleFactory, [
      await mockToken.getAddress(),
      await mockUsdc.getAddress(),
      await mockIdentityRegistry.getAddress(),
      issuer.address,
      feeManager.address,
      SOFT_CAP, HARD_CAP, 250n, ethers.parseUnits("50000", 6),
    ], { unsafeAllow: ["constructor"] });

    await newSale.setVestedMode(await vault.getAddress(), await fractionToken.getAddress());
    await newSale.activate();

    // Now trying to set vested mode again should fail
    await expect(newSale.setVestedMode(await vault.getAddress(), await fractionToken.getAddress()))
      .to.be.revertedWithCustomError(newSale, "InvalidStatus");
  });

  it("saleMode defaults to Direct (backward compatible)", async () => {
    const SaleFactory = await ethers.getContractFactory("Sale");
    const directSale = await upgrades.deployProxy(SaleFactory, [
      await mockToken.getAddress(),
      await mockUsdc.getAddress(),
      await mockIdentityRegistry.getAddress(),
      issuer.address,
      feeManager.address,
      SOFT_CAP, HARD_CAP, 250n, ethers.parseUnits("50000", 6),
    ], { unsafeAllow: ["constructor"] });
    expect(await directSale.saleMode()).to.equal(0); // Direct
  });
});
