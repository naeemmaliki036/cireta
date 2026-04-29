import { expect } from "chai";
import { ethers, upgrades } from "hardhat";
import type { CountryAllowModule, ModularCompliance } from "../typechain-types";

describe("CountryAllowModule", () => {
  let module: CountryAllowModule;
  let compliance: ModularCompliance;
  let owner: Awaited<ReturnType<typeof ethers.getSigners>>[0];
  let issuer: Awaited<ReturnType<typeof ethers.getSigners>>[0];
  let other: Awaited<ReturnType<typeof ethers.getSigners>>[0];

  beforeEach(async () => {
    [owner, issuer, other] = await ethers.getSigners();

    const MCFactory = await ethers.getContractFactory("ModularCompliance");
    // Deploy compliance owned by issuer (simulates issuer self-serve)
    compliance = (await upgrades.deployProxy(MCFactory, [issuer.address])) as unknown as ModularCompliance;

    const CAFactory = await ethers.getContractFactory("CountryAllowModule");
    module = (await upgrades.deployProxy(CAFactory, [owner.address])) as unknown as CountryAllowModule;

    // Bind compliance to module using issuer (who owns the compliance)
    const complianceAddr = await compliance.getAddress();
    await module.connect(issuer).bindCompliance(complianceAddr);
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

  // ── v2: complianceAdmin modifier (issuer = Ownable(compliance).owner()) ─────

  describe("v2 complianceAdmin — issuer self-serve", () => {
    it("issuer (compliance owner) can addAllowedCountry without module owner involvement", async () => {
      const complianceAddr = await compliance.getAddress();
      // issuer is Ownable(compliance).owner() — should pass complianceAdmin modifier
      await module.connect(issuer).addAllowedCountry(complianceAddr, 826);
      expect(await module.isCountryAllowed(complianceAddr, 826)).to.be.true;
    });

    it("issuer can batchAllowCountries on their own compliance", async () => {
      const complianceAddr = await compliance.getAddress();
      await module.connect(issuer).batchAllowCountries(complianceAddr, [36, 826, 0]);
      expect(await module.isCountryAllowed(complianceAddr, 36)).to.be.true;
      expect(await module.isCountryAllowed(complianceAddr, 826)).to.be.true;
      expect(await module.isCountryAllowed(complianceAddr, 0)).to.be.true; // system country
    });

    it("issuer can removeAllowedCountry", async () => {
      const complianceAddr = await compliance.getAddress();
      await module.connect(issuer).addAllowedCountry(complianceAddr, 840);
      await module.connect(issuer).removeAllowedCountry(complianceAddr, 840);
      expect(await module.isCountryAllowed(complianceAddr, 840)).to.be.false;
    });

    it("non-owner non-compliance-owner reverts on addAllowedCountry", async () => {
      const complianceAddr = await compliance.getAddress();
      await expect(
        module.connect(other).addAllowedCountry(complianceAddr, 840),
      ).to.be.revertedWith("not authorized");
    });

    it("non-owner non-compliance-owner reverts on batchAllowCountries", async () => {
      const complianceAddr = await compliance.getAddress();
      await expect(
        module.connect(other).batchAllowCountries(complianceAddr, [840]),
      ).to.be.revertedWith("not authorized");
    });
  });

  describe("v2 complianceBinder modifier — bindCompliance", () => {
    it("issuer can bind their own compliance to module without admin", async () => {
      // Deploy a fresh compliance owned by issuer
      const MCFactory = await ethers.getContractFactory("ModularCompliance");
      const issuerCompliance = (await upgrades.deployProxy(MCFactory, [issuer.address])) as unknown as ModularCompliance;
      const addr = await issuerCompliance.getAddress();
      // Module owner is `owner`, issuer is compliance owner — both should work
      await module.connect(issuer).bindCompliance(addr);
      expect(await module.isComplianceBound(addr)).to.be.true;
    });

    it("unrelated third party cannot bind compliance they don't own", async () => {
      const MCFactory = await ethers.getContractFactory("ModularCompliance");
      const issuerCompliance = (await upgrades.deployProxy(MCFactory, [issuer.address])) as unknown as ModularCompliance;
      const addr = await issuerCompliance.getAddress();
      // `other` is neither module owner nor compliance owner
      await expect(module.connect(other).bindCompliance(addr))
        .to.be.revertedWith("not authorized");
    });
  });

  describe("v2 cross-issuer isolation", () => {
    it("issuerA cannot configure issuerB's compliance", async () => {
      const [, issuerA, issuerB] = await ethers.getSigners();
      const MCFactory = await ethers.getContractFactory("ModularCompliance");

      // Each issuer gets their own compliance
      const compA = (await upgrades.deployProxy(MCFactory, [issuerA.address])) as unknown as ModularCompliance;
      const compB = (await upgrades.deployProxy(MCFactory, [issuerB.address])) as unknown as ModularCompliance;

      // Bind both to the same module
      await module.connect(issuerA).bindCompliance(await compA.getAddress());
      await module.connect(issuerB).bindCompliance(await compB.getAddress());

      // issuerA cannot touch issuerB's compliance config
      await expect(
        module.connect(issuerA).addAllowedCountry(await compB.getAddress(), 840),
      ).to.be.revertedWith("not authorized");

      // issuerB cannot touch issuerA's compliance config
      await expect(
        module.connect(issuerB).addAllowedCountry(await compA.getAddress(), 840),
      ).to.be.revertedWith("not authorized");
    });
  });
});
