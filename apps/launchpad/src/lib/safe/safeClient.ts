/**
 * Safe (multisig) wallet helpers.
 *
 * Provides utilities for proposing transactions via Safe Protocol Kit
 * when the connected wallet is a Safe smart contract wallet.
 */

import Safe from "@safe-global/protocol-kit";
import SafeApiKit from "@safe-global/api-kit";
import {
  type MetaTransactionData,
  OperationType,
} from "@safe-global/types-kit";

// Base Mainnet chain ID
const BASE_CHAIN_ID = 8453n;

// Base chain tx service URL
const TX_SERVICE_URL = "https://safe-transaction-base.safe.global";

/**
 * Initialize Safe Protocol Kit for a given Safe address.
 */
export async function initSafe(
  safeAddress: string,
  signer: string,
): Promise<Safe> {
  const protocolKit = await Safe.init({
    provider: window.ethereum,
    signer,
    safeAddress,
  });
  return protocolKit;
}

/**
 * Initialize Safe API Kit for transaction service.
 */
export function initSafeApiKit(): SafeApiKit {
  return new SafeApiKit({
    chainId: BASE_CHAIN_ID,
    txServiceUrl: TX_SERVICE_URL,
  });
}

/**
 * Propose a transaction to the Safe multisig.
 *
 * Instead of executing directly, this creates a Safe transaction
 * that requires confirmations from other signers.
 *
 * @param safeAddress - The Safe contract address
 * @param signer - The current signer's address
 * @param to - Destination contract address
 * @param value - ETH value (usually "0")
 * @param data - Encoded transaction data
 * @returns The Safe transaction hash (not an on-chain tx hash)
 */
export async function proposeTransaction(
  safeAddress: string,
  signer: string,
  to: string,
  value: string,
  data: string,
): Promise<string> {
  const protocolKit = await initSafe(safeAddress, signer);
  const apiKit = initSafeApiKit();

  const txData: MetaTransactionData = {
    to,
    value,
    data,
    operation: OperationType.Call,
  };

  const safeTx = await protocolKit.createTransaction({
    transactions: [txData],
  });

  const safeTxHash = await protocolKit.getTransactionHash(safeTx);
  const signature = await protocolKit.signHash(safeTxHash);

  await apiKit.proposeTransaction({
    safeAddress,
    safeTransactionData: safeTx.data,
    safeTxHash,
    senderAddress: signer,
    senderSignature: signature.data,
  });

  return safeTxHash;
}

/**
 * Get pending transactions for a Safe.
 */
export async function getPendingTransactions(
  safeAddress: string,
) {
  const apiKit = initSafeApiKit();
  return apiKit.getPendingTransactions(safeAddress);
}
