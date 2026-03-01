import { expect } from "chai";
import { ethers, upgrades } from "hardhat";
import type { CountryAllowModule, ModularCompliance } from "../typechain-types";

describe("CountryAllowModule", () => {
  let module: CountryAllowModule;
  let compliance: ModularCompliance;
  let owner: Awaited<ReturnType<typeof ethers.getSigners>>[0];

  beforeEach(async () => {
    [owner] = await ethers.getSigners();

    const MCFactory = await ethers.getContractFactory("ModularCompliance");
    compliance = (await upgrades.deployProxy(MCFactory, [owner.address])) as unknown as ModularCompliance;

    const CAFactory = await ethers.getContractFactory("CountryAllowModule");
    module = (await upgrades.deployProxy(CAFactory, [owner.address])) as unknown as CountryAllowModule;

    // Bind compliance to module
    const complianceAddr = await compliance.getAddress();
    await module.bindCompliance(complianceAddr);
  });

  it("returns correct name", async () => {
    expect(await module.name()).to.equal("CountryAllowModule");
  });

  it("can add and check allowed countries", async () => {
    const complianceAddr = await compliance.getAddress();
    await module.addAllowedCountry(complianceAddr, 840); // US
    expect(await module.isCountryAllowed(complianceAddr, 840)).to.be.true;
    expect(await module.isCountryAllowed(complianceAddr, 643)).to.be.false; // Russia
  });

  it("can batch allow countries", async () => {
    const complianceAddr = await compliance.getAddress();
    await module.batchAllowCountries(complianceAddr, [840, 826, 276]); // US, UK, DE
    expect(await module.isCountryAllowed(complianceAddr, 840)).to.be.true;
    expect(await module.isCountryAllowed(complianceAddr, 826)).to.be.true;
    expect(await module.isCountryAllowed(complianceAddr, 276)).to.be.true;
  });

  it("can remove allowed country", async () => {
    const complianceAddr = await compliance.getAddress();
    await module.addAllowedCountry(complianceAddr, 840);
    await module.removeAllowedCountry(complianceAddr, 840);
    expect(await module.isCountryAllowed(complianceAddr, 840)).to.be.false;
  });
});
