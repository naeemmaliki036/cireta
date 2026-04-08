import { expect } from "chai";
import { ethers, upgrades } from "hardhat";
import { SimpleIdentityRegistry } from "../typechain-types";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";

describe("SimpleIdentityRegistry — Role-Based Access Control", function () {
  let registry: SimpleIdentityRegistry;
  let owner: HardhatEthersSigner;
  let registrar: HardhatEthersSigner;
  let compliance: HardhatEthersSigner;
  let agent: HardhatEthersSigner;
  let nobody: HardhatEthersSigner;
  let wallet1: HardhatEthersSigner;
  let wallet2: HardhatEthersSigner;

  let REGISTRAR_ROLE: string;
  let COMPLIANCE_ROLE: string;
  let AGENT_ROLE: string;
  let DEFAULT_ADMIN_ROLE: string;

  beforeEach(async function () {
    [owner, registrar, compliance, agent, nobody, wallet1, wallet2] = await ethers.getSigners();

    const Factory = await ethers.getContractFactory("SimpleIdentityRegistry");
    registry = (await upgrades.deployProxy(Factory, [
      owner.address,
      ethers.ZeroAddress,
      ethers.ZeroAddress,
      ethers.ZeroAddress,
    ])) as unknown as SimpleIdentityRegistry;
    await registry.waitForDeployment();

    REGISTRAR_ROLE = await registry.REGISTRAR_ROLE();
    COMPLIANCE_ROLE = await registry.COMPLIANCE_ROLE();
    AGENT_ROLE = await registry.AGENT_ROLE();
    DEFAULT_ADMIN_ROLE = await registry.DEFAULT_ADMIN_ROLE();
  });

  describe("Initialization", function () {
    it("owner has DEFAULT_ADMIN_ROLE", async function () {
      expect(await registry.hasRole(DEFAULT_ADMIN_ROLE, owner.address)).to.be.true;
    });

    it("owner can grant roles", async function () {
      await registry.grantRole(REGISTRAR_ROLE, registrar.address);
      expect(await registry.hasRole(REGISTRAR_ROLE, registrar.address)).to.be.true;
    });
  });

  describe("REGISTRAR_ROLE", function () {
    beforeEach(async function () {
      await registry.grantRole(REGISTRAR_ROLE, registrar.address);
    });

    it("can addToWhitelist", async function () {
      await registry.connect(registrar).addToWhitelist(wallet1.address, 784);
      expect(await registry.isVerified(wallet1.address)).to.be.true;
      expect(await registry.investorCountry(wallet1.address)).to.equal(784);
    });

    it("can batchAddToWhitelist", async function () {
      await registry.connect(registrar).batchAddToWhitelist(
        [wallet1.address, wallet2.address],
        [784, 826],
      );
      expect(await registry.isVerified(wallet1.address)).to.be.true;
      expect(await registry.isVerified(wallet2.address)).to.be.true;
    });

    it("can registerIdentity", async function () {
      await registry.connect(registrar).registerIdentity(wallet1.address, wallet1.address, 702);
      expect(await registry.isVerified(wallet1.address)).to.be.true;
    });

    it("can updateCountry", async function () {
      await registry.connect(registrar).addToWhitelist(wallet1.address, 784);
      await registry.connect(registrar).updateCountry(wallet1.address, 826);
      expect(await registry.investorCountry(wallet1.address)).to.equal(826);
    });

    it("CANNOT removeFromWhitelist", async function () {
      await registry.connect(owner).addToWhitelist(wallet1.address, 784);
      await expect(
        registry.connect(registrar).removeFromWhitelist(wallet1.address),
      ).to.be.revertedWith("not compliance");
    });

    it("CANNOT batchRemoveFromWhitelist", async function () {
      await registry.connect(owner).addToWhitelist(wallet1.address, 784);
      await expect(
        registry.connect(registrar).batchRemoveFromWhitelist([wallet1.address]),
      ).to.be.revertedWith("not compliance");
    });
  });

  describe("COMPLIANCE_ROLE", function () {
    beforeEach(async function () {
      await registry.grantRole(COMPLIANCE_ROLE, compliance.address);
      // Add a wallet first (as owner)
      await registry.addToWhitelist(wallet1.address, 784);
    });

    it("can removeFromWhitelist", async function () {
      await registry.connect(compliance).removeFromWhitelist(wallet1.address);
      expect(await registry.isVerified(wallet1.address)).to.be.false;
    });

    it("can batchRemoveFromWhitelist", async function () {
      await registry.addToWhitelist(wallet2.address, 826);
      await registry.connect(compliance).batchRemoveFromWhitelist([wallet1.address, wallet2.address]);
      expect(await registry.isVerified(wallet1.address)).to.be.false;
      expect(await registry.isVerified(wallet2.address)).to.be.false;
    });

    it("can deleteIdentity", async function () {
      await registry.connect(compliance).deleteIdentity(wallet1.address);
      expect(await registry.isVerified(wallet1.address)).to.be.false;
    });

    it("CANNOT addToWhitelist", async function () {
      await expect(
        registry.connect(compliance).addToWhitelist(wallet2.address, 826),
      ).to.be.revertedWith("not registrar");
    });
  });

  describe("AGENT_ROLE (full access — backward compat)", function () {
    beforeEach(async function () {
      await registry.grantRole(AGENT_ROLE, agent.address);
    });

    it("can addToWhitelist", async function () {
      await registry.connect(agent).addToWhitelist(wallet1.address, 784);
      expect(await registry.isVerified(wallet1.address)).to.be.true;
    });

    it("can removeFromWhitelist", async function () {
      await registry.connect(agent).addToWhitelist(wallet1.address, 784);
      await registry.connect(agent).removeFromWhitelist(wallet1.address);
      expect(await registry.isVerified(wallet1.address)).to.be.false;
    });

    it("isAgent returns true", async function () {
      expect(await registry.isAgent(agent.address)).to.be.true;
    });
  });

  describe("Legacy addAgent/removeAgent", function () {
    it("addAgent grants AGENT_ROLE", async function () {
      await registry.addAgent(agent.address);
      expect(await registry.hasRole(AGENT_ROLE, agent.address)).to.be.true;
      expect(await registry.isAgent(agent.address)).to.be.true;
    });

    it("removeAgent revokes AGENT_ROLE", async function () {
      await registry.addAgent(agent.address);
      await registry.removeAgent(agent.address);
      expect(await registry.hasRole(AGENT_ROLE, agent.address)).to.be.false;
      expect(await registry.isAgent(agent.address)).to.be.false;
    });

    it("legacy agent can add and remove", async function () {
      await registry.addAgent(agent.address);
      await registry.connect(agent).addToWhitelist(wallet1.address, 784);
      expect(await registry.isVerified(wallet1.address)).to.be.true;
      await registry.connect(agent).removeFromWhitelist(wallet1.address);
      expect(await registry.isVerified(wallet1.address)).to.be.false;
    });
  });

  describe("Unauthorized access", function () {
    it("nobody cannot addToWhitelist", async function () {
      await expect(
        registry.connect(nobody).addToWhitelist(wallet1.address, 784),
      ).to.be.revertedWith("not registrar");
    });

    it("nobody cannot removeFromWhitelist", async function () {
      await registry.addToWhitelist(wallet1.address, 784);
      await expect(
        registry.connect(nobody).removeFromWhitelist(wallet1.address),
      ).to.be.revertedWith("not compliance");
    });

    it("nobody cannot addAgent", async function () {
      await expect(
        registry.connect(nobody).addAgent(agent.address),
      ).to.be.reverted;
    });

    it("nobody cannot grantRole", async function () {
      await expect(
        registry.connect(nobody).grantRole(REGISTRAR_ROLE, nobody.address),
      ).to.be.reverted;
    });
  });

  describe("migrateToRoles", function () {
    it("grants DEFAULT_ADMIN_ROLE to owner", async function () {
      // Already done in initialize, but migrateToRoles is idempotent
      await registry.migrateToRoles();
      expect(await registry.hasRole(DEFAULT_ADMIN_ROLE, owner.address)).to.be.true;
    });

    it("only owner can call", async function () {
      await expect(registry.connect(nobody).migrateToRoles()).to.be.reverted;
    });
  });

  describe("Whitelist count tracking", function () {
    it("increments on add, decrements on remove", async function () {
      expect(await registry.whitelistedCount()).to.equal(0);
      await registry.addToWhitelist(wallet1.address, 784);
      expect(await registry.whitelistedCount()).to.equal(1);
      await registry.addToWhitelist(wallet2.address, 826);
      expect(await registry.whitelistedCount()).to.equal(2);
      await registry.removeFromWhitelist(wallet1.address);
      expect(await registry.whitelistedCount()).to.equal(1);
    });

    it("no double-count on duplicate add", async function () {
      await registry.addToWhitelist(wallet1.address, 784);
      await registry.addToWhitelist(wallet1.address, 784); // no-op
      expect(await registry.whitelistedCount()).to.equal(1);
    });
  });
});
