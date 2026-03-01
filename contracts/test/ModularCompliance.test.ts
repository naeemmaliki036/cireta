import { expect } from "chai";
import { ethers, upgrades } from "hardhat";
import type { ModularCompliance, CountryAllowModule } from "../typechain-types";

describe("ModularCompliance", () => {
  let compliance: ModularCompliance;
  let countryModule: CountryAllowModule;
  let owner: Awaited<ReturnType<typeof ethers.getSigners>>[0];

  beforeEach(async () => {
    [owner] = await ethers.getSigners();

    const MCFactory = await ethers.getContractFactory("ModularCompliance");
    compliance = (await upgrades.deployProxy(MCFactory, [owner.address])) as unknown as ModularCompliance;

    const CAFactory = await ethers.getContractFactory("CountryAllowModule");
    countryModule = (await upgrades.deployProxy(CAFactory, [owner.address])) as unknown as CountryAllowModule;
  });

  it("can add and remove modules", async () => {
    const moduleAddr = await countryModule.getAddress();
    await compliance.addModule(moduleAddr);

    const modules = await compliance.getModules();
    expect(modules).to.include(moduleAddr);

    await compliance.removeModule(moduleAddr);
    const modulesAfter = await compliance.getModules();
    expect(modulesAfter).to.not.include(moduleAddr);
  });

  it("emits events on add/remove", async () => {
    const moduleAddr = await countryModule.getAddress();
    await expect(compliance.addModule(moduleAddr))
      .to.emit(compliance, "ModuleAdded");

    await expect(compliance.removeModule(moduleAddr))
      .to.emit(compliance, "ModuleRemoved");
  });
});
