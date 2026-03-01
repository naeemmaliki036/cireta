import { expect } from "chai";
import { ethers } from "hardhat";
import type { CiretaToken, IdentityRegistry } from "../typechain-types";
import { deployInfra, deployToken, registerIdentity } from "./helpers";

describe("CiretaToken", () => {
  let token: CiretaToken;
  let registry: IdentityRegistry;
  let owner: Awaited<ReturnType<typeof ethers.getSigners>>[0];
  let user1: Awaited<ReturnType<typeof ethers.getSigners>>[0];

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
    expect(await token.decimals()).to.equal(18);
  });

  it("owner can mint tokens", async () => {
    await token.mint(owner.address, ethers.parseEther("1000"));
    expect(await token.balanceOf(owner.address)).to.equal(ethers.parseEther("1000"));
  });

  it("owner can pause and unpause", async () => {
    await token.pause();
    expect(await token.paused()).to.be.true;
    await token.unpause();
    expect(await token.paused()).to.be.false;
  });

  it("cannot transfer when paused", async () => {
    await token.mint(owner.address, ethers.parseEther("100"));
    await token.pause();
    await expect(
      token.transfer(user1.address, ethers.parseEther("10"))
    ).to.be.reverted;
  });
});
