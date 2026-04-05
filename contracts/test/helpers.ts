import { ethers, upgrades } from "hardhat";
import type {
  CiretaToken,
  IdentityRegistry,
  ModularCompliance,
} from "../typechain-types";

export async function deployInfra(owner: string) {
  const CTR = await ethers.getContractFactory("ClaimTopicsRegistry");
  const claimTopics = await upgrades.deployProxy(CTR, [owner]);

  const TIR = await ethers.getContractFactory("TrustedIssuersRegistry");
  const trustedIssuers = await upgrades.deployProxy(TIR, [owner]);

  const IRS = await ethers.getContractFactory("IdentityRegistryStorage");
  const idStorage = await upgrades.deployProxy(IRS, [owner]);

  const IR = await ethers.getContractFactory("IdentityRegistry");
  const registry = (await upgrades.deployProxy(IR, [
    owner,
    await claimTopics.getAddress(),
    await trustedIssuers.getAddress(),
    await idStorage.getAddress(),
  ])) as unknown as IdentityRegistry;

  // Bind storage to registry
  const storageContract = await ethers.getContractAt(
    "IdentityRegistryStorage",
    await idStorage.getAddress(),
  );
  await storageContract.bindIdentityRegistry(await registry.getAddress());

  const MC = await ethers.getContractFactory("ModularCompliance");
  const compliance = (await upgrades.deployProxy(MC, [owner])) as unknown as ModularCompliance;

  return { registry, compliance, claimTopics, trustedIssuers, idStorage };
}

export async function deployToken(
  owner: string,
  registry: IdentityRegistry,
  compliance: ModularCompliance,
  admin?: string,
) {
  const TF = await ethers.getContractFactory("CiretaToken");
  const token = (await upgrades.deployProxy(TF, [
    "Test Token", "TST", 18,
    await registry.getAddress(),
    await compliance.getAddress(),
    owner,
    admin || owner,  // admin_ defaults to owner if not provided
  ])) as unknown as CiretaToken;

  await compliance.bindToken(await token.getAddress());
  return token;
}

/**
 * Register an address in the identity registry (for mint/transfer tests).
 * Uses a dummy identity address and country code 840 (US).
 */
export async function registerIdentity(
  registry: IdentityRegistry,
  userAddress: string,
  country = 840,
) {
  // Add the signer as an agent first
  await registry.addAgent(userAddress);
  // Use the user address itself as a dummy identity contract
  await registry.registerIdentity(userAddress, userAddress, country);
}
