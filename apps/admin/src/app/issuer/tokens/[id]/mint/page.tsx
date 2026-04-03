"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { ArrowLeft, Coins, Wallet } from "lucide-react";
import Link from "next/link";
import { useAccount, useReadContract } from "wagmi";
import { useConnectModal } from "@rainbow-me/rainbowkit";
import { parseUnits, formatUnits, type Abi } from "viem";
import { Button, Spinner } from "@/components/atoms";
import { TransactionStatus } from "@/components/molecules/TransactionStatus";
import { IssuerDashboardLayout } from "@/components/templates";
import { getToken as fetchToken, type Token } from "@/lib/api/repositories/tokens";
import { getAccessToken } from "@/lib/api/client";
import { useContractAction } from "@/hooks/useContractAction";
import { CIRETA_TOKEN_ABI } from "@/lib/contracts/abis/ciretaToken";

function getAuthToken() {
  return getAccessToken() ?? "";
}

export default function MintTokenPage({ params: paramsPromise }: { params: Promise<{ id: string }> }) {
  const [token, setToken] = useState<Token | null>(null);
  const [loading, setLoading] = useState(true);
  const [resolvedId, setResolvedId] = useState<string>("");
  const [recipient, setRecipient] = useState<string>("");
  const [amount, setAmount] = useState<string>("");
  const [validationError, setValidationError] = useState<string | null>(null);

  const { isConnected, address: walletAddress } = useAccount();
  const { openConnectModal } = useConnectModal();
  const mintAction = useContractAction();

  useEffect(() => {
    paramsPromise.then((p) => setResolvedId(p.id));
  }, [paramsPromise]);

  useEffect(() => {
    if (!resolvedId) return;
    (async () => {
      try {
        const data = await fetchToken(resolvedId, getAuthToken());
        setToken(data);
      } catch { /* 404 */ }
      finally { setLoading(false); }
    })();
  }, [resolvedId]);

  // Set default recipient to connected wallet
  useEffect(() => {
    if (walletAddress && !recipient) {
      setRecipient(walletAddress);
    }
  }, [walletAddress, recipient]);

  const contractAddr = token?.contract_address as `0x${string}` | undefined;
  const abi = CIRETA_TOKEN_ABI as unknown as Abi;

  // Read total supply from chain
  const { data: totalSupplyRaw } = useReadContract({
    address: contractAddr,
    abi,
    functionName: "totalSupply",
    query: { enabled: !!contractAddr },
  });

  // Read connected wallet balance from chain
  const { data: balanceRaw } = useReadContract({
    address: contractAddr,
    abi,
    functionName: "balanceOf",
    args: walletAddress ? [walletAddress] : undefined,
    query: { enabled: !!contractAddr && !!walletAddress },
  });

  const decimals = token?.decimals ?? 18;
  const totalSupply = totalSupplyRaw
    ? formatUnits(totalSupplyRaw as bigint, decimals)
    : null;
  const walletBalance = balanceRaw
    ? formatUnits(balanceRaw as bigint, decimals)
    : null;

  const handleMint = async () => {
    setValidationError(null);

    if (!isConnected) {
      openConnectModal?.();
      return;
    }
    if (!contractAddr) {
      setValidationError("Token is not deployed on-chain yet.");
      return;
    }
    if (!recipient || !/^0x[a-fA-F0-9]{40}$/.test(recipient)) {
      setValidationError("Enter a valid recipient address.");
      return;
    }
    if (!amount || parseFloat(amount) <= 0) {
      setValidationError("Amount must be greater than 0.");
      return;
    }

    try {
      const parsedAmount = parseUnits(amount, decimals);
      const receipt = await mintAction.execute({
        address: contractAddr,
        abi,
        functionName: "mint",
        args: [recipient as `0x${string}`, parsedAmount],
      });

      if (receipt) {
        setAmount("");
        // Keep recipient for convenience
      }
    } catch {
      setValidationError("Failed to parse amount.");
    }
  };

  if (loading) {
    return (
      <IssuerDashboardLayout title="Mint Tokens" description="">
        <div className="flex justify-center py-24"><Spinner /></div>
      </IssuerDashboardLayout>
    );
  }

  if (!token) {
    return (
      <IssuerDashboardLayout title="Mint Tokens" description="">
        <p className="text-center text-darkBlack/40 py-24">Token not found</p>
      </IssuerDashboardLayout>
    );
  }

  return (
    <IssuerDashboardLayout
      title={`Mint ${token.symbol}`}
      description={`Mint new ${token.name} tokens to any address`}
    >
      <div className="mb-6">
        <Link
          href={`/issuer/tokens/${resolvedId}`}
          className="flex items-center gap-2 text-sm text-darkBlack/50 hover:text-text transition-colors"
        >
          <ArrowLeft className="h-4 w-4" /> Back to Token
        </Link>
      </div>

      {!token.contract_address && (
        <div className="mb-6 p-4 rounded-xl bg-amber-50 border border-amber-200 text-sm text-amber-700">
          This token has not been deployed on-chain yet. Deploy it first from the token detail page.
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white rounded-3xl p-6 border border-darkBlack/10"
        >
          <div className="flex items-center gap-2 mb-2">
            <Coins className="h-5 w-5 text-darkAqua" />
            <h3 className="text-sm font-medium text-darkBlack/50">Total Supply</h3>
          </div>
          <p className="text-2xl font-semibold text-text">
            {totalSupply !== null
              ? parseFloat(totalSupply).toLocaleString()
              : parseFloat(token.total_supply).toLocaleString()}
          </p>
          <p className="text-xs text-darkBlack/40 mt-1">{token.symbol}</p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          className="bg-white rounded-3xl p-6 border border-darkBlack/10"
        >
          <div className="flex items-center gap-2 mb-2">
            <Wallet className="h-5 w-5 text-darkAqua" />
            <h3 className="text-sm font-medium text-darkBlack/50">Your Balance</h3>
          </div>
          <p className="text-2xl font-semibold text-text">
            {walletBalance !== null
              ? parseFloat(walletBalance).toLocaleString()
              : "--"}
          </p>
          <p className="text-xs text-darkBlack/40 mt-1">{token.symbol}</p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="bg-white rounded-3xl p-6 border border-darkBlack/10"
        >
          <div className="flex items-center gap-2 mb-2">
            <Coins className="h-5 w-5 text-darkAqua" />
            <h3 className="text-sm font-medium text-darkBlack/50">Token Info</h3>
          </div>
          <p className="text-lg font-semibold text-text">{token.name}</p>
          <p className="text-xs text-darkBlack/40 mt-1">
            {token.symbol} &middot; {decimals} decimals &middot; {token.asset_type}
          </p>
        </motion.div>
      </div>

      {/* Mint Form */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15 }}
        className="bg-white rounded-3xl p-6 border border-darkBlack/10"
      >
        <h2 className="text-lg font-semibold text-text mb-4 flex items-center gap-2">
          <Coins className="h-5 w-5" /> Mint Tokens
        </h2>

        <div className="space-y-4 max-w-lg">
          <div>
            <label className="block text-sm font-medium text-zinc-700 mb-1">
              Recipient Address
            </label>
            <input
              type="text"
              value={recipient}
              onChange={(e) => {
                setRecipient(e.target.value);
                setValidationError(null);
              }}
              className="w-full px-4 py-2.5 rounded-xl border border-zinc-200 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-darkAqua/30 focus:border-darkAqua"
              placeholder="0x..."
            />
            <p className="text-xs text-darkBlack/40 mt-1">
              Defaults to your connected wallet address.
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-zinc-700 mb-1">
              Amount
            </label>
            <input
              type="text"
              value={amount}
              onChange={(e) => {
                setAmount(e.target.value);
                setValidationError(null);
              }}
              className="w-full px-4 py-2.5 rounded-xl border border-zinc-200 text-sm focus:outline-none focus:ring-2 focus:ring-darkAqua/30 focus:border-darkAqua"
              placeholder="1000"
            />
            <p className="text-xs text-darkBlack/40 mt-1">
              Human-readable amount (will be multiplied by 10^{decimals}).
            </p>
          </div>

          {validationError && (
            <p className="text-sm text-red-600">{validationError}</p>
          )}

          <Button
            variant="primary"
            onClick={handleMint}
            disabled={
              mintAction.isPending ||
              mintAction.isConfirming ||
              !token.contract_address
            }
            isLoading={mintAction.isPending || mintAction.isConfirming}
            leftIcon={<Coins className="h-4 w-4" />}
          >
            Mint Tokens
          </Button>

          <TransactionStatus
            isPending={mintAction.isPending}
            isConfirming={mintAction.isConfirming}
            isConfirmed={mintAction.isConfirmed}
            txHash={mintAction.txHash}
            txUrl={mintAction.txUrl}
            error={mintAction.error}
            successMessage={`Successfully minted ${amount || "tokens"} ${token.symbol}.`}
          />
        </div>
      </motion.div>
    </IssuerDashboardLayout>
  );
}
