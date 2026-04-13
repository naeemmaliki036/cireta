import { ethers } from "hardhat";
const errors = [
  "InsufficientOTCBalance()", "OTCNotApproved()", "InsufficientBalance()",
  "ExceedsHardCap()", "ExceedsAllocation()", "TokenSupplyExceeded()",
  "BelowMinContribution()", "ExceedsMaxContribution()", "TopUpBelowMin()",
];
for (const e of errors) {
  if (ethers.keccak256(ethers.toUtf8Bytes(e)).slice(0, 10) === "0xfb8f41b2") {
    console.log("MATCH:", e);
  }
}
// Also check ERC20 errors
const erc20Errors = [
  "ERC20InsufficientAllowance(address,uint256,uint256)",
  "ERC20InsufficientBalance(address,uint256,uint256)",
];
for (const e of erc20Errors) {
  if (ethers.keccak256(ethers.toUtf8Bytes(e)).slice(0, 10) === "0xfb8f41b2") {
    console.log("MATCH:", e);
  }
}
console.log("Selector: 0xfb8f41b2");
