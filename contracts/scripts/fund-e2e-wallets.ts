/**
 * Fund the e2e test wallets with ETH on the local hardhat node.
 * The e2e-full-test wallets are at fixed private keys (not hardhat's
 * 20 default accounts), so they have 0 ETH on a fresh node.
 *
 * Usage: hardhat run scripts/fund-e2e-wallets.ts --network localhost
 */
import { ethers } from "hardhat";

async function main() {
  const [funder] = await ethers.getSigners();
  console.log(`Funder: ${funder.address}`);
  console.log(`Balance: ${ethers.formatEther(await ethers.provider.getBalance(funder.address))} ETH`);

  const wallets = {
    admin:     "0x8eE48b43abb1a53e0a61bB31d0Fc7E898e7f2ac3",
    issuer:    "0x759948398F66310cAE12896644aCD9eAd86A9650",
    investor1: "0x5c5C4A2563ea79D494a0CA2dCd8d596790651fba",
    investor2: "0x5806C2346F2346940D4505ee81749b514EA0bbc2",
    otcOp:     "0x73eE8cBF3461531F177BbF5D4436db0A9f080114",
  };

  const amount = ethers.parseEther("100");
  for (const [name, addr] of Object.entries(wallets)) {
    const tx = await funder.sendTransaction({ to: addr, value: amount });
    await tx.wait();
    console.log(`  Sent 100 ETH to ${name} (${addr})`);
  }

  console.log("\nDone.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
