import { expect } from "chai";
import { ethers, upgrades } from "hardhat";
import type { CiretaTokenFactory } from "../typechain-types";
import { deployInfra, deployToken } from "./helpers";

describe("CiretaTokenFactory", () => {
  let factory: CiretaTokenFactory;
  let owner: Awaited<ReturnType<typeof ethers.getSigners>>[0];

  const MAX_SUPPLY = 1_000_000_000n * 10n ** 6n; // 1 billion at 6 decimals

  beforeEach(async () => {
    [owner] = await ethers.getSigners();
    const infra = await deployInfra(owner.address);

    // Deploy raw (non-proxy) implementations — factory uses them as ERC1967Proxy targets
    const TokenImplFactory = await ethers.getContractFactory("CiretaToken");
    const tokenImpl = await TokenImplFactory.deploy();

    const IRImplFactory = await ethers.getContractFactory("IdentityRegistry");
    const irImpl = await IRImplFactory.deploy();

    const MCImplFactory = await ethers.getContractFactory("ModularCompliance");
    const mcImpl = await MCImplFactory.deploy();

    // Deploy IssuerRegistry
    const IsReg = await ethers.getContractFactory("IssuerRegistry");
    const issuerReg = await upgrades.deployProxy(IsReg, [owner.address]);

    const FFactory = await ethers.getContractFactory("CiretaTokenFactory");
    factory = (await upgrades.deployProxy(FFactory, [
      owner.address,
      await tokenImpl.getAddress(),
      await irImpl.getAddress(),
      await mcImpl.getAddress(),
      await infra.claimTopics.getAddress(),
      await infra.trustedIssuers.getAddress(),
      await infra.idStorage.getAddress(),
      await issuerReg.getAddress(),
    ])) as unknown as CiretaTokenFactory;

    // Use simpleIdentityMode so deployToken doesn't try to bindIdentityRegistry
    // on identityRegistryStorage (factory is not its owner in tests).
    await factory.setSimpleIdentityMode(true);
  });

  it("deploys with correct owner", async () => {
    expect(await factory.owner()).to.equal(owner.address);
  });

  // ── v2 deployToken ─────────────────────────────────────────────────────────

  describe("v2 deployToken", () => {
    it("owner can deploy a mintable token via factory (legacy IR path)", async () => {
      const [tx1, tx2, tx3] = await factory.deployToken.staticCall(
        "Gold Token", "GLD", 6,
        owner.address,
        ethers.ZeroAddress, // address(0) → fresh per-token IR deployed
        MAX_SUPPLY,
        true,  // mintable
        0n,    // no pre-mint
      );
      // Addresses are non-zero
      expect(tx1).to.not.equal(ethers.ZeroAddress);
      expect(tx2).to.not.equal(ethers.ZeroAddress);
      expect(tx3).to.not.equal(ethers.ZeroAddress);
    });

    it("deployed token has correct maxSupply and isMintable", async () => {
      const [tokenAddr] = await factory.deployToken.staticCall(
        "Gold Token", "GLD", 6,
        owner.address,
        ethers.ZeroAddress,
        MAX_SUPPLY,
        true,
        0n,
      );
      await factory.deployToken(
        "Gold Token", "GLD", 6,
        owner.address,
        ethers.ZeroAddress,
        MAX_SUPPLY,
        true,
        0n,
      );
      const token = await ethers.getContractAt("CiretaToken", tokenAddr);
      expect(await token.maxSupply()).to.equal(MAX_SUPPLY);
      expect(await token.isMintable()).to.be.true;
    });

    it("deploys fixed-supply token — pre-mints full amount to issuer, no further minting", async () => {
      const FIXED_SUPPLY = 500n * 10n ** 6n;
      const [tokenAddr] = await factory.deployToken.staticCall(
        "Fixed Gold", "fGLD", 6,
        owner.address,
        ethers.ZeroAddress,
        FIXED_SUPPLY,
        false,         // not mintable
        FIXED_SUPPLY,  // must equal maxSupply for fixed
      );
      await factory.deployToken(
        "Fixed Gold", "fGLD", 6,
        owner.address,
        ethers.ZeroAddress,
        FIXED_SUPPLY,
        false,
        FIXED_SUPPLY,
      );
      const token = await ethers.getContractAt("CiretaToken", tokenAddr);
      expect(await token.isMintable()).to.be.false;
      expect(await token.totalSupply()).to.equal(FIXED_SUPPLY);
      expect(await token.balanceOf(owner.address)).to.equal(FIXED_SUPPLY);
      // SUPPLY_ROLE revoked — further mint should revert
      await expect(token.connect(owner).mint(owner.address, 1n))
        .to.be.reverted;
    });

    it("reverts deployToken when maxSupply is 0", async () => {
      await expect(
        factory.deployToken(
          "T", "T", 6, owner.address, ethers.ZeroAddress,
          0n, true, 0n,
        ),
      ).to.be.revertedWith("max supply required");
    });

    it("non-issuer reverts with 'not owner or active issuer'", async () => {
      const [, nonIssuer] = await ethers.getSigners();
      await expect(
        factory.connect(nonIssuer).deployToken(
          "T", "T", 6, nonIssuer.address, ethers.ZeroAddress,
          MAX_SUPPLY, true, 0n,
        ),
      ).to.be.revertedWith("not owner or active issuer");
    });

    it("tracks deployed token in deployedTokens array", async () => {
      await factory.deployToken(
        "Gold Token", "GLD", 6,
        owner.address,
        ethers.ZeroAddress,
        MAX_SUPPLY,
        true,
        0n,
      );
      expect(await factory.getDeployedTokensCount()).to.equal(1);
    });

    it("emits TokenDeployed event", async () => {
      await expect(
        factory.deployToken(
          "Gold Token", "GLD", 6,
          owner.address,
          ethers.ZeroAddress,
          MAX_SUPPLY,
          true,
          0n,
        ),
      ).to.emit(factory, "TokenDeployed");
    });
  });
});
