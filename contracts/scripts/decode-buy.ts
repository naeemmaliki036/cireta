import { ethers } from "hardhat";
const TX = "0x0a54b39968a158fde024ece19e4ee30662f6c194e1a25a91a581d95e0525642a";
async function main() {
  const tx = await ethers.provider.getTransaction(TX);
  if (!tx) return;
  const saleAbi = (await ethers.getContractFactory("Sale")).interface;
  const p = saleAbi.parseTransaction({ data: tx.data, value: tx.value });
  console.log("Method:", p?.name);
  p?.args.forEach((a, i) => console.log(" ", p.fragment.inputs[i]?.name, "=", String(a)));

  const sale = await ethers.getContractAt(
    [
      "function getPhase(uint256) view returns (tuple(string name, uint256 pricePerToken, uint256 allocation, uint256 sold, uint256 minTokens, uint256 maxTokens, uint256 topUpMinTokens, uint256 startTime, uint256 endTime, bool whitelistOnly, uint8 allocationMode))",
      "function token() view returns (address)",
    ],
    tx.to!,
  );
  const tokenAddr = await sale.token();
  const erc20 = await ethers.getContractAt(["function decimals() view returns (uint8)", "function symbol() view returns (string)"], tokenAddr);
  const [dec, sym] = await Promise.all([erc20.decimals(), erc20.symbol()]);
  console.log(`\ntoken decimals: ${dec} ${sym}`);

  const ph = await sale.getPhase(1n);
  console.log("\nphase[1]:");
  console.log("  pricePerToken:    ", ph.pricePerToken.toString(), `(${ethers.formatUnits(ph.pricePerToken, 18)} payment-units per whole token)`);
  console.log("  minTokens (raw):  ", ph.minTokens.toString());
  console.log("  minTokens (whole):", ethers.formatUnits(ph.minTokens, Number(dec)));
  console.log("  maxTokens (raw):  ", ph.maxTokens.toString());
  console.log("  maxTokens (whole):", ethers.formatUnits(ph.maxTokens, Number(dec)));
  console.log("  topUpMinTokens:   ", ph.topUpMinTokens.toString(), `(${ethers.formatUnits(ph.topUpMinTokens, Number(dec))} whole)`);
}
main();
