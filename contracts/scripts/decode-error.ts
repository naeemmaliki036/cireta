import { ethers } from "hardhat";
const errors = ['NotActiveIssuer','IssuerMismatch','FactoryMismatch','FeeMismatch','IssuerNotVerified','InvalidFeeBps','InvalidCaps','ZeroTokenSupply','InvalidSaleWindow','ZeroAddress','TokenSupplyExceeded','SaleWindowTooLong','NotApproved'];
for (const e of errors) {
  const sel = ethers.keccak256(ethers.toUtf8Bytes(e+'()')).slice(0,10);
  if (sel === '0xaf5716a6') console.log('MATCH:', e);
}
console.log('done');
