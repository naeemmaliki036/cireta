import { ethers } from "hardhat";

const SALE = "0x1b2306046dd1e0925596a892c241084e174dad8f";

async function main() {
  const sale = await ethers.getContractAt(
    [
      "function approved() view returns (bool)",
      "function status() view returns (uint8)",
      "function issuer() view returns (address)",
      "function token() view returns (address)",
      "function vault() view returns (address)",
      "function saleMode() view returns (uint8)",
      "function getPhaseCount() view returns (uint256)",
    ],
    SALE,
  );

  const [approved, status, issuer, token, vault, saleMode, phaseCount] = await Promise.all([
    sale.approved(),
    sale.status(),
    sale.issuer(),
    sale.token(),
    sale.vault(),
    sale.saleMode(),
    sale.getPhaseCount(),
  ]);

  const STATUS = ["Draft", "PendingApproval", "Approved", "Active", "FinalizedSuccess", "FinalizedFailed", "Rejected"];
  console.log(`Sale:           ${SALE}`);
  console.log(`status:         ${status} (${STATUS[Number(status)]})`);
  console.log(`approved:       ${approved} ${approved ? "✓" : "✗ admin must call approveSale() first"}`);
  console.log(`issuer:         ${issuer}`);
  console.log(`token:          ${token}`);
  console.log(`vault:          ${vault}`);
  console.log(`saleMode:       ${saleMode === 0n ? "Direct" : "Vested"}`);
  console.log(`phaseCount:     ${phaseCount} ${phaseCount > 0n ? "✓" : "✗ at least 1 phase needed"}`);

  // Check token balances
  const tokenContract = await ethers.getContractAt(
    ["function balanceOf(address) view returns (uint256)", "function decimals() view returns (uint8)"],
    token,
  );
  const decimals = await tokenContract.decimals();
  const saleBal = await tokenContract.balanceOf(SALE);
  const vaultBal = vault !== ethers.ZeroAddress ? await tokenContract.balanceOf(vault) : 0n;
  const fmt = (n: bigint) => (Number(n) / 10 ** Number(decimals)).toLocaleString();
  console.log(`token decimals: ${decimals}`);
  console.log(`sale balance:   ${saleBal} (${fmt(saleBal)} tokens)`);
  console.log(`vault balance:  ${vaultBal} (${fmt(vaultBal)} tokens) ${vaultBal > 0n ? "✓" : "✗ tokens must be deposited to vault"}`);

  console.log("\n=== Verdict ===");
  if (Number(status) !== 0) console.log(`✗ status must be Draft (currently ${STATUS[Number(status)]})`);
  if (!approved) console.log(`✗ approved must be true — admin: call Sale.approveSale() at ${SALE}`);
  if (saleMode === 1n && vaultBal === 0n) console.log(`✗ vault has 0 tokens — issuer: transfer ${token} to ${vault}`);
  if (saleMode === 0n && saleBal === 0n) console.log(`✗ sale has 0 tokens — issuer: transfer ${token} to ${SALE}`);
  if (phaseCount === 0n) console.log(`✗ no phases — issuer: addPhase()`);
}

main().catch((e) => { console.error(e); process.exit(1); });
