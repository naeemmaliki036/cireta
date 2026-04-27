/**
 * Coverage for contract surfaces newly exposed in the UI gap analysis sprint
 * (docs/UI_GAP_ANALYSIS_2026-04-27.md). Each describe block maps to one or
 * more buttons/forms added on the admin/launchpad portals.
 *
 * Pre-existing tests already cover: Sale.setWhitelist, Sale.shorten/advance/withdrawTokens,
 * Sale.withdrawUnsoldTokens, Vault.withdrawExcess, DividendDistributor snapshot+claim,
 * SimpleIdentityRegistry.batchAdd/Remove. This file fills the remaining gaps.
 */
import { expect } from "chai";
import { ethers, upgrades } from "hardhat";
import type { CiretaToken, IdentityRegistry, ModularCompliance } from "../typechain-types";
import { deployInfra, deployToken, registerIdentity } from "./helpers";

const ZERO = "0x0000000000000000000000000000000000000000";

describe("CiretaToken — batch + partial freeze + burn (UI sprint coverage)", () => {
  let token: CiretaToken;
  let registry: IdentityRegistry;
  let compliance: ModularCompliance;
  let owner: Awaited<ReturnType<typeof ethers.getSigners>>[0];
  let user1: Awaited<ReturnType<typeof ethers.getSigners>>[0];
  let user2: Awaited<ReturnType<typeof ethers.getSigners>>[0];
  let user3: Awaited<ReturnType<typeof ethers.getSigners>>[0];

  const t = (n: string) => ethers.parseUnits(n, 6);

  beforeEach(async () => {
    [owner, user1, user2, user3] = await ethers.getSigners();
    const infra = await deployInfra(owner.address);
    registry = infra.registry;
    compliance = infra.compliance;
    token = await deployToken(owner.address, registry, compliance);

    await registerIdentity(registry, owner.address);
    await registry.registerIdentity(user1.address, user1.address, 840);
    await registry.registerIdentity(user2.address, user2.address, 840);
    await registry.registerIdentity(user3.address, user3.address, 840);

    // Seed balances for freeze + burn + transfer tests
    await token.mint(owner.address, t("100000"));
    await token.transfer(user1.address, t("10000"));
    await token.transfer(user2.address, t("5000"));
  });

  // ── Single burn (Burn UI on /issuer/tokens/[id]/mint) ──
  describe("burn", () => {
    // CiretaToken has both burn(uint256) (ERC20Burnable) and burn(address,uint256) (custom);
    // ethers v6 needs the disambiguated signature.
    it("owner with SUPPLY_ROLE can burn from any account", async () => {
      const before = await token.balanceOf(user1.address);
      await token.getFunction("burn(address,uint256)")(user1.address, t("1000"));
      expect(await token.balanceOf(user1.address)).to.equal(before - t("1000"));
    });

    it("non-SUPPLY_ROLE caller is rejected", async () => {
      await expect(
        token.connect(user1).getFunction("burn(address,uint256)")(user1.address, t("100")),
      ).to.be.reverted;
    });
  });

  // ── batchMint (Batch Mint card on /issuer/tokens/[id]/mint) ──
  describe("batchMint", () => {
    it("mints to multiple verified recipients in one tx", async () => {
      const balanceBefore3 = await token.balanceOf(user3.address);
      await token.batchMint(
        [user2.address, user3.address],
        [t("100"), t("200")],
      );
      expect(await token.balanceOf(user3.address)).to.equal(balanceBefore3 + t("200"));
    });

    it("reverts on length mismatch", async () => {
      await expect(token.batchMint([user1.address], [t("1"), t("2")])).to.be.reverted;
    });

    it("reverts if any recipient is unverified", async () => {
      const wallets = await ethers.getSigners();
      const stranger = wallets[wallets.length - 1]!;
      await expect(
        token.batchMint([user1.address, stranger.address], [t("1"), t("2")]),
      ).to.be.reverted;
    });
  });

  // ── batchBurn (Batch Burn card on /issuer/tokens/[id]/mint) ──
  describe("batchBurn", () => {
    it("burns from multiple holders in one tx", async () => {
      const u1Before = await token.balanceOf(user1.address);
      const u2Before = await token.balanceOf(user2.address);
      await token.batchBurn([user1.address, user2.address], [t("100"), t("250")]);
      expect(await token.balanceOf(user1.address)).to.equal(u1Before - t("100"));
      expect(await token.balanceOf(user2.address)).to.equal(u2Before - t("250"));
    });

    it("reverts on length mismatch", async () => {
      await expect(token.batchBurn([user1.address, user2.address], [t("1")])).to.be.reverted;
    });
  });

  // ── freezePartialTokens / unfreezePartialTokens
  // (Freeze Partial / Unfreeze Partial cards on /issuer/compliance) ──
  describe("freezePartialTokens", () => {
    it("freezes a specific amount, blocks transferring beyond unfrozen", async () => {
      await token.freezePartialTokens(user1.address, t("8000"));
      expect(await token.getFrozenTokens(user1.address)).to.equal(t("8000"));
      // Transfer of unfrozen 2000 succeeds
      await token.connect(user1).transfer(user2.address, t("2000"));
      // Transfer that would dip into frozen reverts
      await expect(
        token.connect(user1).transfer(user2.address, t("1")),
      ).to.be.reverted;
    });

    it("unfreezePartialTokens releases the locked amount", async () => {
      await token.freezePartialTokens(user1.address, t("5000"));
      await token.unfreezePartialTokens(user1.address, t("5000"));
      expect(await token.getFrozenTokens(user1.address)).to.equal(0n);
    });

    it("freezing beyond available balance reverts", async () => {
      await expect(token.freezePartialTokens(user1.address, t("999999"))).to.be.reverted;
    });

    it("unfreezing more than frozen reverts", async () => {
      await token.freezePartialTokens(user1.address, t("100"));
      await expect(token.unfreezePartialTokens(user1.address, t("101"))).to.be.reverted;
    });
  });

  // ── batchSetAddressFrozen ──
  describe("batchSetAddressFrozen", () => {
    it("freezes/unfreezes multiple addresses in one tx", async () => {
      await token.batchSetAddressFrozen(
        [user1.address, user2.address],
        [true, true],
      );
      expect(await token.isFrozen(user1.address)).to.equal(true);
      expect(await token.isFrozen(user2.address)).to.equal(true);

      await token.batchSetAddressFrozen(
        [user1.address, user2.address],
        [false, false],
      );
      expect(await token.isFrozen(user1.address)).to.equal(false);
      expect(await token.isFrozen(user2.address)).to.equal(false);
    });
  });

  // ── batchFreezePartialTokens / batchUnfreezePartialTokens ──
  describe("batch partial freeze", () => {
    it("freezes partial amounts across multiple holders", async () => {
      await token.batchFreezePartialTokens(
        [user1.address, user2.address],
        [t("1000"), t("500")],
      );
      expect(await token.getFrozenTokens(user1.address)).to.equal(t("1000"));
      expect(await token.getFrozenTokens(user2.address)).to.equal(t("500"));

      await token.batchUnfreezePartialTokens(
        [user1.address, user2.address],
        [t("1000"), t("500")],
      );
      expect(await token.getFrozenTokens(user1.address)).to.equal(0n);
      expect(await token.getFrozenTokens(user2.address)).to.equal(0n);
    });
  });

  // ── batchTransfer (investor-side; CiretaToken.transfer * N in one call) ──
  describe("batchTransfer (investor)", () => {
    it("transfers to multiple verified recipients in one tx", async () => {
      const u3Before = await token.balanceOf(user3.address);
      const ownerBefore = await token.balanceOf(owner.address);
      await token.batchTransfer(
        [user3.address, user1.address],
        [t("777"), t("123")],
      );
      expect(await token.balanceOf(user3.address)).to.equal(u3Before + t("777"));
      expect(await token.balanceOf(owner.address)).to.equal(ownerBefore - t("777") - t("123"));
    });
  });

  // ── batchForcedTransfer (compliance-side admin operation) ──
  describe("batchForcedTransfer", () => {
    it("force-moves tokens between wallets ignoring freeze status", async () => {
      await token.freezePartialTokens(user1.address, t("8000"));
      const u1Before = await token.balanceOf(user1.address);
      const u3Before = await token.balanceOf(user3.address);

      await token.batchForcedTransfer(
        [user1.address],
        [user3.address],
        [t("9000")], // Bigger than unfrozen — forced transfer must still succeed
      );

      expect(await token.balanceOf(user3.address)).to.equal(u3Before + t("9000"));
      expect(await token.balanceOf(user1.address)).to.equal(u1Before - t("9000"));
    });
  });
});

describe("ModularCompliance — callModuleFunction generic configurator (UI sprint)", () => {
  let compliance: ModularCompliance;
  let module: Awaited<ReturnType<typeof ethers.getContractAt>>;
  let owner: Awaited<ReturnType<typeof ethers.getSigners>>[0];

  beforeEach(async () => {
    [owner] = await ethers.getSigners();

    const MC = await ethers.getContractFactory("ModularCompliance");
    compliance = (await upgrades.deployProxy(MC, [owner.address])) as unknown as ModularCompliance;

    const MaxHolder = await ethers.getContractFactory("MaxHolderCountModule");
    const maxHolderModule = await upgrades.deployProxy(MaxHolder, [owner.address]);
    module = await ethers.getContractAt("MaxHolderCountModule", await maxHolderModule.getAddress());

    await compliance.addModule(await module.getAddress());
  });

  it("rejects callData whose selector isn't allow-listed", async () => {
    const iface = new ethers.Interface([
      "function setMaxHolderCount(address compliance, uint256 maxCount)",
    ]);
    const data = iface.encodeFunctionData("setMaxHolderCount", [
      await compliance.getAddress(),
      42n,
    ]);
    await expect(
      compliance.callModuleFunction(data, await module.getAddress()),
    ).to.be.revertedWith("selector not allowed");
  });

  it("after setAllowedSelector, callModuleFunction passes the compliance check and forwards", async () => {
    // setMaxHolderCount on MaxHolderCountModule is onlyOwner, so the inner call
    // reverts at the module (msg.sender = compliance, not the module's owner).
    // We verify the compliance-side gates (selector allow + module bound) pass
    // by observing that the failure is now "module call failed" rather than
    // "selector not allowed" — i.e. the call is being forwarded.
    const iface = new ethers.Interface([
      "function setMaxHolderCount(address compliance, uint256 maxCount)",
    ]);
    const selector = iface.getFunction("setMaxHolderCount")!.selector as `0x${string}`;
    const data = iface.encodeFunctionData("setMaxHolderCount", [
      await compliance.getAddress(),
      99n,
    ]);

    await compliance.setAllowedSelector(selector, true);
    await expect(
      compliance.callModuleFunction(data, await module.getAddress()),
    ).to.be.revertedWith("module call failed");
  });

  it("reverts if module is not bound", async () => {
    const iface = new ethers.Interface([
      "function setMaxHolderCount(address compliance, uint256 maxCount)",
    ]);
    const data = iface.encodeFunctionData("setMaxHolderCount", [
      await compliance.getAddress(),
      1n,
    ]);
    await expect(
      compliance.callModuleFunction(data, ZERO),
    ).to.be.revertedWith("module not bound");
  });
});

describe("PlatformFeeManager — removeIssuerCustomFee (UI sprint)", () => {
  let pfm: any;
  let owner: Awaited<ReturnType<typeof ethers.getSigners>>[0];
  let issuer: Awaited<ReturnType<typeof ethers.getSigners>>[0];
  let receiver: Awaited<ReturnType<typeof ethers.getSigners>>[0];

  beforeEach(async () => {
    [owner, issuer, receiver] = await ethers.getSigners();
    const PFM = await ethers.getContractFactory("PlatformFeeManager");
    pfm = await upgrades.deployProxy(PFM, [owner.address, receiver.address, 200]);
  });

  it("getFeeForIssuer returns default until override is set", async () => {
    expect(await pfm.getFeeForIssuer(issuer.address)).to.equal(200n);
  });

  it("setIssuerFee then removeIssuerCustomFee reverts to default", async () => {
    await pfm.setIssuerFee(issuer.address, 50);
    expect(await pfm.getFeeForIssuer(issuer.address)).to.equal(50n);

    await pfm.removeIssuerCustomFee(issuer.address);
    expect(await pfm.getFeeForIssuer(issuer.address)).to.equal(200n);
    expect(await pfm.hasCustomFee(issuer.address)).to.equal(false);
  });

  it("removeIssuerCustomFee on issuer that never had override is a no-op", async () => {
    await pfm.removeIssuerCustomFee(issuer.address);
    expect(await pfm.getFeeForIssuer(issuer.address)).to.equal(200n);
  });

  it("non-owner cannot remove an override", async () => {
    await pfm.setIssuerFee(issuer.address, 100);
    await expect(pfm.connect(issuer).removeIssuerCustomFee(issuer.address)).to.be.reverted;
  });
});
