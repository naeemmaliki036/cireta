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
import { getChainId } from "@/lib/chain";

// Configured chain ID
const BASE_CHAIN_ID = BigInt(getChainId());

// Safe transaction service URL — picked by chain ID
const TX_SERVICE_URLS: Record<number, string> = {
  8453: "https://safe-transaction-base.safe.global",
  84532: "https://safe-transaction-base-sepolia.safe.global",
};
const TX_SERVICE_URL = TX_SERVICE_URLS[Number(BASE_CHAIN_ID)];
if (!TX_SERVICE_URL) {
  throw new Error(`No Safe tx-service URL configured for chain ID ${BASE_CHAIN_ID}`);
}

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

export async function getTransaction(safeTxHash: string) {
  const apiKit = initSafeApiKit();
  return apiKit.getTransaction(safeTxHash);
}

export async function getSafeInfo(safeAddress: string) {
  const apiKit = initSafeApiKit();
  return apiKit.getSafeInfo(safeAddress);
}

const SAFE_CHAIN_PREFIXES: Record<number, string> = {
  8453: "base",
  84532: "base-sepolia",
};

/** Build the Safe App URL for a specific transaction */
export function getSafeTxUrl(safeAddress: string, safeTxHash: string): string {
  const chainPrefix = SAFE_CHAIN_PREFIXES[Number(BASE_CHAIN_ID)];
  if (!chainPrefix) {
    throw new Error(`No Safe app prefix configured for chain ID ${BASE_CHAIN_ID}`);
  }
  return `https://app.safe.global/transactions/tx?safe=${chainPrefix}:${safeAddress}&id=multisig_${safeAddress}_${safeTxHash}`;
}
