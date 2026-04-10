import { expect } from "chai";
import { ethers, upgrades } from "hardhat";
import { time } from "@nomicfoundation/hardhat-toolbox/network-helpers";
import type { VestingVault, CiretaToken } from "../typechain-types";
import { deployInfra, deployToken, registerIdentity } from "./helpers";

describe("VestingVault", () => {
  let vault: VestingVault;
  let token: CiretaToken;
  let owner: Awaited<ReturnType<typeof ethers.getSigners>>[0];
  let beneficiary: Awaited<ReturnType<typeof ethers.getSigners>>[0];

  beforeEach(async () => {
    [owner, beneficiary] = await ethers.getSigners();
    const infra = await deployInfra(owner.address);
    token = await deployToken(owner.address, infra.registry, infra.compliance);

    // Register owner and beneficiary identities
    await registerIdentity(infra.registry, owner.address);
    await registerIdentity(infra.registry, beneficiary.address);

    // Deploy VestingVault with unsafeAllow for constructor
    const VF = await ethers.getContractFactory("VestingVault");
    vault = (await upgrades.deployProxy(VF, [
      await token.getAddress(),
      owner.address,
    ], { unsafeAllow: ["state-variable-immutable", "constructor"] })) as unknown as VestingVault;

    // Register vault identity (it receives tokens from owner on createSchedule)
    const vaultAddr = await vault.getAddress();
    await registerIdentity(infra.registry, vaultAddr);

    // Mint tokens to owner and approve vault to pull from owner
    await token.mint(owner.address, ethers.parseUnits("100000", 6));
    await token.approve(vaultAddr, ethers.parseUnits("100000", 6));
  });

  it("owner can create vesting schedule", async () => {
    const now = await time.latest();
    await vault.createSchedule(
      beneficiary.address,
      ethers.parseUnits("10000", 6),
      now,           // startTime
      30 * 86400,    // cliffDuration (30 days)
      365 * 86400,   // vestingDuration (1 year)
    );
    const schedule = await vault.getSchedule(beneficiary.address, 0);
    // Schedule struct has totalAmount, claimedAmount, startTime, cliffEnd, vestingEnd, revoked
    expect(schedule.totalAmount).to.equal(ethers.parseUnits("10000", 6));
    expect(schedule.claimedAmount).to.equal(0n);
    expect(schedule.revoked).to.be.false;
  });

  it("cannot claim before cliff", async () => {
    const now = await time.latest();
    await vault.createSchedule(
      beneficiary.address,
      ethers.parseUnits("10000", 6),
      now,           // startTime
      30 * 86400,    // cliffDuration (30 days)
      365 * 86400,   // vestingDuration (1 year)
    );
    await expect(
      vault.connect(beneficiary).claim(0)
    ).to.be.revertedWith("cliff not reached");
  });

  it("can claim after cliff", async () => {
    const now = await time.latest();
    const cliffDuration = 30 * 86400;
    await vault.createSchedule(
      beneficiary.address,
      ethers.parseUnits("10000", 6),
      now,             // startTime
      cliffDuration,   // cliffDuration
      365 * 86400,     // vestingDuration
    );
    await time.increaseTo(now + cliffDuration + 100 * 86400);
    await vault.connect(beneficiary).claim(0);
    const balance = await token.balanceOf(beneficiary.address);
    expect(balance).to.be.gt(0);
  });
});
