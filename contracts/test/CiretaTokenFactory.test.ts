import { expect } from "chai";
import { ethers, upgrades } from "hardhat";
import type { CiretaTokenFactory } from "../typechain-types";
import { deployInfra, deployToken } from "./helpers";

describe("CiretaTokenFactory", () => {
  let factory: CiretaTokenFactory;
  let owner: Awaited<ReturnType<typeof ethers.getSigners>>[0];

  beforeEach(async () => {
    [owner] = await ethers.getSigners();
    const infra = await deployInfra(owner.address);

    // Deploy a token implementation for the factory
    const tokenImpl = await deployToken(owner.address, infra.registry, infra.compliance);

    // Deploy IssuerRegistry
    const IsReg = await ethers.getContractFactory("IssuerRegistry");
    const issuerReg = await upgrades.deployProxy(IsReg, [owner.address]);

    const FFactory = await ethers.getContractFactory("CiretaTokenFactory");
    factory = (await upgrades.deployProxy(FFactory, [
      owner.address,
      await tokenImpl.getAddress(),
      await infra.registry.getAddress(),
      await infra.compliance.getAddress(),
      await infra.claimTopics.getAddress(),
      await infra.trustedIssuers.getAddress(),
      await infra.idStorage.getAddress(),
      await issuerReg.getAddress(),
    ])) as unknown as CiretaTokenFactory;
  });

  it("deploys with correct owner", async () => {
    expect(await factory.owner()).to.equal(owner.address);
  });
});
