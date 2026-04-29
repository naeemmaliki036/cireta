import { expect } from "chai";
import { ethers, upgrades } from "hardhat";
import type { CiretaToken, IdentityRegistry } from "../typechain-types";
import { deployInfra, deployToken, registerIdentity } from "./helpers";

describe("CiretaToken", () => {
  let token: CiretaToken;
  let registry: IdentityRegistry;
  let owner: Awaited<ReturnType<typeof ethers.getSigners>>[0];
  let user1: Awaited<ReturnType<typeof ethers.getSigners>>[0];

  const parseToken = (n: string) => ethers.parseUnits(n, 6);
  const MAX_SUPPLY = 1_000_000n * 10n ** 6n; // 1 million tokens

  beforeEach(async () => {
    [owner, user1] = await ethers.getSigners();
    const infra = await deployInfra(owner.address);
    registry = infra.registry;
    token = await deployToken(owner.address, registry, infra.compliance);

    // Register owner identity for minting
    await registerIdentity(registry, owner.address);
  });

  it("has correct name and symbol", async () => {
    expect(await token.name()).to.equal("Test Token");
    expect(await token.symbol()).to.equal("TST");
    expect(await token.decimals()).to.equal(6);
  });

  it("owner can mint tokens", async () => {
    await token.mint(owner.address, parseToken("1000"));
    expect(await token.balanceOf(owner.address)).to.equal(parseToken("1000"));
  });

  it("owner can pause and unpause", async () => {
    await token.pause();
    expect(await token.paused()).to.be.true;
    await token.unpause();
    expect(await token.paused()).to.be.false;
  });

  it("cannot transfer when paused", async () => {
    await token.mint(owner.address, parseToken("100"));
    await token.pause();
    await expect(
      token.transfer(user1.address, parseToken("10"))
    ).to.be.reverted;
  });

  // ── v2 supply economics ────────────────────────────────────────────────────

  describe("v2 supply economics — mintable token", () => {
    let mintableToken: CiretaToken;
    const MAX = 1_000n * 10n ** 6n; // 1000 tokens

    beforeEach(async () => {
      const infra = await deployInfra(owner.address);
      mintableToken = await deployToken(
        owner.address, infra.registry, infra.compliance,
        owner.address, MAX, true, 0n,
      );
      await registerIdentity(infra.registry, owner.address);
    });

    it("exposes maxSupply and isMintable", async () => {
      expect(await mintableToken.maxSupply()).to.equal(MAX);
      expect(await mintableToken.isMintable()).to.be.true;
    });

    it("owner can mint up to cap", async () => {
      await mintableToken.mint(owner.address, MAX);
      expect(await mintableToken.totalSupply()).to.equal(MAX);
    });

    it("mint reverts when it would exceed cap", async () => {
      await mintableToken.mint(owner.address, MAX);
      await expect(mintableToken.mint(owner.address, 1n))
        .to.be.revertedWith("exceeds max supply");
    });

    it("mint up to cap minus 1 then 1 more hits the cap exactly", async () => {
      await mintableToken.mint(owner.address, MAX - 1n);
      await mintableToken.mint(owner.address, 1n);
      expect(await mintableToken.totalSupply()).to.equal(MAX);
    });

    it("batchMint enforces cap across elements", async () => {
      // Two mints each half the cap => total = cap
      await mintableToken.batchMint(
        [owner.address, owner.address],
        [MAX / 2n, MAX / 2n],
      );
      expect(await mintableToken.totalSupply()).to.equal(MAX);
    });

    it("batchMint reverts when cumulative total exceeds cap", async () => {
      await expect(
        mintableToken.batchMint(
          [owner.address, owner.address],
          [MAX, 1n],
        ),
      ).to.be.revertedWith("exceeds max supply");
    });
  });

  describe("v2 supply economics — fixed-supply token", () => {
    let fixedToken: CiretaToken;
    let fixedOwner: Awaited<ReturnType<typeof ethers.getSigners>>[0];
    const MAX = 500n * 10n ** 6n; // 500 tokens — fully pre-minted

    beforeEach(async () => {
      [fixedOwner] = await ethers.getSigners();
      const infra = await deployInfra(fixedOwner.address);
      fixedToken = await deployToken(
        fixedOwner.address, infra.registry, infra.compliance,
        fixedOwner.address, MAX, false, MAX, // fixed: initialMint = maxSupply
      );
    });

    it("is not mintable", async () => {
      expect(await fixedToken.isMintable()).to.be.false;
    });

    it("pre-mints full supply to owner at initialization", async () => {
      expect(await fixedToken.totalSupply()).to.equal(MAX);
      expect(await fixedToken.balanceOf(fixedOwner.address)).to.equal(MAX);
    });

    it("SUPPLY_ROLE is revoked — subsequent mint reverts", async () => {
      // Even the issuer cannot mint more (SUPPLY_ROLE was revoked in initialize)
      await expect(fixedToken.connect(fixedOwner).mint(fixedOwner.address, 1n))
        .to.be.reverted;
    });
  });

  describe("v2 initialize — validation", () => {
    it("reverts when maxSupply is 0", async () => {
      const infra = await deployInfra(owner.address);
      const TF = await ethers.getContractFactory("CiretaToken");
      await expect(
        upgrades.deployProxy(TF, [
          "T", "T", 6,
          await infra.registry.getAddress(),
          await infra.compliance.getAddress(),
          owner.address,
          owner.address,
          0n,    // maxSupply = 0 → should revert
          true,
          0n,
        ]),
      ).to.be.revertedWith("max supply required");
    });

    it("reverts when fixed-supply initialMint != maxSupply", async () => {
      const infra = await deployInfra(owner.address);
      const TF = await ethers.getContractFactory("CiretaToken");
      await expect(
        upgrades.deployProxy(TF, [
          "T", "T", 6,
          await infra.registry.getAddress(),
          await infra.compliance.getAddress(),
          owner.address,
          owner.address,
          1000n,   // maxSupply
          false,   // fixed
          500n,    // initialMintAmount != maxSupply → should revert
        ]),
      ).to.be.revertedWith("fixed supply must mint full max");
    });

    it("reverts when mintable initialMint > maxSupply", async () => {
      const infra = await deployInfra(owner.address);
      const TF = await ethers.getContractFactory("CiretaToken");
      await expect(
        upgrades.deployProxy(TF, [
          "T", "T", 6,
          await infra.registry.getAddress(),
          await infra.compliance.getAddress(),
          owner.address,
          owner.address,
          1000n,   // maxSupply
          true,    // mintable
          1001n,   // initialMintAmount > maxSupply → should revert
        ]),
      ).to.be.revertedWith("initial > max");
    });
  });
});
