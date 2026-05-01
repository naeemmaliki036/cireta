import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";

const TX_HASH = "0x121f7904b8a52a6b0b8306d4836d4cac096caa1698e8f8d82052a084dec21036";
const DEPLOYMENT_FILE = "base-sepolia.v2.20260430.json";

async function main() {
  const provider = ethers.provider;
  const d = JSON.parse(
    fs.readFileSync(path.join(__dirname, "..", "deployments", DEPLOYMENT_FILE), "utf-8"),
  );

  const tx = await provider.getTransaction(TX_HASH);
  const receipt = await provider.getTransactionReceipt(TX_HASH);
  if (!tx || !receipt) {
    console.error("Tx not found");
    return;
  }
  console.log("\n=== Failed Tx ===");
  console.log("Tx:      ", TX_HASH);
  console.log("Block:   ", receipt.blockNumber);
  console.log("Status:  ", receipt.status === 0 ? "REVERTED" : "OK");
  console.log("From:    ", tx.from);
  console.log("To:      ", tx.to);
  console.log("Selector:", tx.data.slice(0, 10));
  console.log("Gas used:", receipt.gasUsed.toString());

  // Decode method called
  const saleAbi = (await ethers.getContractFactory("Sale")).interface;
  let parsedCall: ReturnType<typeof saleAbi.parseTransaction> | null = null;
  try { parsedCall = saleAbi.parseTransaction({ data: tx.data, value: tx.value }); } catch {}
  if (parsedCall) {
    console.log("Method:  ", parsedCall.name, "(", parsedCall.fragment.format(), ")");
  }

  // Replay as eth_call at the block before to catch the revert reason
  console.log("\n--- Replay as eth_call at block", receipt.blockNumber - 1, "---");
  try {
    await provider.call({
      from: tx.from,
      to: tx.to!,
      data: tx.data,
      value: tx.value,
      gasLimit: tx.gasLimit,
      gasPrice: tx.gasPrice,
    }, receipt.blockNumber - 1);
    console.log("Replay returned (no revert)");
  } catch (e: unknown) {
    const err = e as { data?: string; error?: { data?: string }; info?: { error?: { data?: string } }; message?: string };
    const data = err.data ?? err.error?.data ?? err.info?.error?.data;
    console.log("Revert raw:", data);
    console.log("Message:   ", err.message);
    if (data && typeof data === "string" && data.length >= 10) {
      const sel = data.slice(0, 10);
      // Decode standard Error(string)
      if (sel === "0x08c379a0") {
        const reason = ethers.AbiCoder.defaultAbiCoder().decode(["string"], "0x" + data.slice(10))[0];
        console.log("Standard revert string:", reason);
      } else {
        // Try every contract interface we know
        const candidates = [
          await ethers.getContractAt("Sale", d.saleImplementation),
          await ethers.getContractAt("CiretaSaleFactory", d.saleFactory),
          await ethers.getContractAt("CiretaFractionFactory", d.fractionFactory),
          await ethers.getContractAt("PlatformFeeManager", d.platformFeeManager),
          await ethers.getContractAt("IssuerRegistry", d.issuerRegistry),
        ];
        for (const c of candidates) {
          try {
            const decoded = c.interface.parseError(data);
            if (decoded) {
              console.log("Custom error:", decoded.name, "args:", decoded.args);
              break;
            }
          } catch {}
        }
        console.log("(could not decode custom error from any known contract)");
      }
    }
  }

  // Inspect the sale state at the time of the call so we can pinpoint
  // which guard tripped.
  if (tx.to) {
    console.log("\n--- Sale state @ block", receipt.blockNumber - 1, "---");
    try {
      const sale = await ethers.getContractAt(
        [
          "function status() view returns (uint8)",
          "function approved() view returns (bool)",
          "function totalRaised() view returns (uint256)",
          "function paymentContributedTotal() view returns (uint256)",
          "function softCap() view returns (uint256)",
          "function hardCap() view returns (uint256)",
          "function saleEndTime() view returns (uint256)",
          "function openEnded() view returns (bool)",
          "function finalizationPending() view returns (bool)",
          "function feeManager() view returns (address)",
          "function feeBasisPoints() view returns (uint256)",
          "function feeCapUsdc() view returns (uint256)",
          "function paymentToken() view returns (address)",
          "function saleMode() view returns (uint8)",
          "function vault() view returns (address)",
        ],
        tx.to!,
      );
      const STATUS = ["Draft","Active","Paused","FinalizedSuccess","FinalizedFailed","Rejected"];
      const SALE_MODE = ["Direct","Vested"];
      const overrides = { blockTag: receipt.blockNumber - 1 };
      const [status, approved, totalRaised, ptcTotal, softCap, hardCap, saleEndTime, openEnded, finalPending, feeMgr, feeBps, feeCap, payTok, mode, vault] = await Promise.all([
        sale.status(overrides), sale.approved(overrides),
        sale.totalRaised(overrides), sale.paymentContributedTotal(overrides),
        sale.softCap(overrides), sale.hardCap(overrides),
        sale.saleEndTime(overrides), sale.openEnded(overrides),
        sale.finalizationPending(overrides), sale.feeManager(overrides),
        sale.feeBasisPoints(overrides), sale.feeCapUsdc(overrides),
        sale.paymentToken(overrides), sale.saleMode(overrides),
        sale.vault(overrides),
      ]);
      const block = await provider.getBlock(receipt.blockNumber - 1);
      console.log(`status:                ${status} (${STATUS[Number(status)]})`);
      console.log(`approved:              ${approved}`);
      console.log(`saleMode:              ${SALE_MODE[Number(mode)]}`);
      console.log(`totalRaised:           ${totalRaised}`);
      console.log(`paymentContribTotal:   ${ptcTotal}`);
      console.log(`softCap:               ${softCap}`);
      console.log(`hardCap:               ${hardCap}`);
      console.log(`saleEndTime:           ${saleEndTime} (block.timestamp=${block!.timestamp}, expired=${!openEnded && block!.timestamp >= Number(saleEndTime)})`);
      console.log(`openEnded:             ${openEnded}`);
      console.log(`finalizationPending:   ${finalPending}`);
      console.log(`feeManager:            ${feeMgr}`);
      console.log(`feeBasisPoints:        ${feeBps}`);
      console.log(`feeCapUsdc:            ${feeCap}`);
      console.log(`paymentToken:          ${payTok}`);
      console.log(`vault:                 ${vault}`);

      // Sale balance of payment token (relevant for fee transfer)
      const erc20 = await ethers.getContractAt(
        ["function balanceOf(address) view returns (uint256)", "function decimals() view returns (uint8)", "function symbol() view returns (string)"],
        payTok as string,
      );
      const [decimals, symbol, saleBal] = await Promise.all([
        erc20.decimals(overrides),
        erc20.symbol(overrides),
        erc20.balanceOf(tx.to!, overrides),
      ]);
      console.log(`Sale ${symbol} balance:  ${saleBal} (raw, ${decimals}d)`);

      const expectedFee = (BigInt(ptcTotal) * BigInt(feeBps)) / 10000n;
      const cappedFee = feeCap > 0n && expectedFee > BigInt(feeCap) ? BigInt(feeCap) : expectedFee;
      console.log(`Expected fee:          ${cappedFee} (${ethers.formatUnits(cappedFee, Number(decimals))} ${symbol})`);
      console.log(`Sale has enough?       ${BigInt(saleBal) >= cappedFee}`);

      // For Vested mode, check vault balance — _finalize requires non-zero
      if (Number(mode) === 1 && vault !== ethers.ZeroAddress) {
        const tokenAddr = await sale.runner!.provider!.call({
          to: tx.to!,
          data: ethers.id("token()").slice(0, 10),
        });
        const tokenContract = await ethers.getContractAt(["function balanceOf(address) view returns (uint256)"], "0x" + (tokenAddr as string).slice(-40));
        const vaultBal = await tokenContract.balanceOf(vault, overrides);
        console.log(`Vault token balance:   ${vaultBal} (must be > 0 for Vested finalize)`);
      }
    } catch (e) {
      console.log("Could not load sale state:", (e as Error).message);
    }
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
