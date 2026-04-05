"use client";

import { useState, useEffect, useCallback, use } from "react";
import { ArrowLeft, Coins, AlertCircle } from "lucide-react";
import Link from "next/link";
import { useAccount, useReadContract } from "wagmi";
import { useConnectModal } from "@rainbow-me/rainbowkit";
import { parseUnits, formatUnits, isAddress, type Abi } from "viem";
import { Button, Spinner, Badge } from "@/components/atoms";
import { IssuerDashboardLayout } from "@/components/templates";
import { TransactionStatus } from "@/components/molecules/TransactionStatus";
import { useContractAction } from "@/hooks/useContractAction";
import { OTC_TOKEN_ABI } from "@/lib/contracts/abis/otcToken";
import { getSale, type Sale } from "@/lib/api/repositories/sales";
import { apiFetch } from "@/lib/api/client";

interface MintRecord {
  id: string;
  wallet_address: string;
  tokens_allocated: string;
  created_at: string;
}

export default function OTCMintPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { isConnected } = useAccount();
  const { openConnectModal } = useConnectModal();

  const [sale, setSale] = useState<Sale | null>(null);
  const [loading, setLoading] = useState(true);
  const [investorWallet, setInvestorWallet] = useState("");
  const [amount, setAmount] = useState("");
  const [records, setRecords] = useState<MintRecord[]>([]);
  const [formError, setFormError] = useState<string | null>(null);

  const mintAction = useContractAction();

  // Derive OTC token address from the sale
  const otcTokenAddress = (sale as unknown as Record<string, unknown>)?.otc_token_address as string | undefined;
  const validOtcAddress = otcTokenAddress && isAddress(otcTokenAddress) && otcTokenAddress !== "0x0000000000000000000000000000000000000000"
    ? (otcTokenAddress as `0x${string}`)
    : null;

  // Read total supply on-chain
  const { data: totalSupply, refetch: refetchSupply } = useReadContract({
    address: validOtcAddress ?? undefined,
    abi: OTC_TOKEN_ABI,
    functionName: "totalSupply",
    query: { enabled: !!validOtcAddress },
  });

  // Read decimals
  const { data: decimals } = useReadContract({
    address: validOtcAddress ?? undefined,
    abi: OTC_TOKEN_ABI,
    functionName: "decimals",
    query: { enabled: !!validOtcAddress },
  });

  // Read symbol
  const { data: symbol } = useReadContract({
    address: validOtcAddress ?? undefined,
    abi: OTC_TOKEN_ABI,
    functionName: "symbol",
    query: { enabled: !!validOtcAddress },
  });

  const tokenDecimals = typeof decimals === "number" ? decimals : 18;
  const tokenSymbol = typeof symbol === "string" ? symbol : "cOTC";

  const fetchRecords = useCallback(async () => {
    try {
      const data = await apiFetch<{ items: MintRecord[] }>(`/api/v1/sales/${id}/contributions?is_otc=true`);
      setRecords(data.items ?? []);
    } catch {
      setRecords([]);
    }
  }, [id]);

  useEffect(() => {
    (async () => {
      try {
        const s = await getSale(id);
        setSale(s);
      } catch { /* 404 */ }
      finally { setLoading(false); }
    })();
    fetchRecords();
  }, [id, fetchRecords]);

  const handleMint = async () => {
    setFormError(null);

    if (!isConnected) {
      openConnectModal?.();
      return;
    }

    if (!validOtcAddress) {
      setFormError("No OTC token address configured for this sale.");
      return;
    }

    if (!investorWallet || !isAddress(investorWallet)) {
      setFormError("Please enter a valid wallet address.");
      return;
    }

    const numAmount = parseFloat(amount);
    if (!numAmount || numAmount <= 0) {
      setFormError("Please enter a valid amount greater than 0.");
      return;
    }

    mintAction.reset();
    const receipt = await mintAction.execute({
      address: validOtcAddress,
      abi: OTC_TOKEN_ABI as unknown as Abi,
      functionName: "mint",
      args: [investorWallet as `0x${string}`, parseUnits(amount, tokenDecimals)],
    });

    if (receipt) {
      setInvestorWallet("");
      setAmount("");
      refetchSupply();
      fetchRecords();
    }
  };

  if (loading) {
    return (
      <IssuerDashboardLayout title="OTC Token Minting" description="">
        <div className="flex justify-center py-24"><Spinner /></div>
      </IssuerDashboardLayout>
    );
  }

  if (!sale) {
    return (
      <IssuerDashboardLayout title="OTC Token Minting" description="">
        <p className="text-center text-darkBlack/40 py-24">Sale not found</p>
      </IssuerDashboardLayout>
    );
  }

  return (
    <IssuerDashboardLayout
      title="OTC Token Minting"
      description={`Mint OTC tokens for ${sale.title || sale.token_name || "this sale"}`}
      breadcrumbs={[
        { label: "Sales", href: "/issuer/sales" },
        { label: sale.title || sale.token_name || "Sale", href: `/issuer/sales/${id}` },
        { label: "OTC Mint" },
      ]}
    >
      <div className="mb-6">
        <Link
          href={`/issuer/sales/${id}`}
          className="flex items-center gap-2 text-sm text-darkBlack/50 hover:text-text transition-colors"
        >
          <ArrowLeft className="h-4 w-4" /> Back to Sale
        </Link>
      </div>

      {!validOtcAddress && (
        <div className="mb-6 p-4 rounded-xl bg-amber-50 border border-amber-200 text-sm text-amber-700">
          <AlertCircle className="h-4 w-4 inline mr-2" />
          No OTC token address is configured for this sale. Deploy the OTC token first or update the sale with an OTC token address.
        </div>
      )}

      {/* Supply Overview */}
      {validOtcAddress && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
          <div className="bg-white rounded-2xl p-5 border border-darkBlack/10">
            <p className="text-xs uppercase tracking-wider text-darkBlack/40 mb-1">Token</p>
            <p className="text-lg font-bold text-text">{tokenSymbol}</p>
            <p className="text-xs text-darkBlack/30 font-mono mt-1 truncate">{validOtcAddress}</p>
          </div>
          <div className="bg-white rounded-2xl p-5 border border-darkBlack/10">
            <p className="text-xs uppercase tracking-wider text-darkBlack/40 mb-1">Total Supply</p>
            <p className="text-lg font-bold text-text">
              {totalSupply !== undefined
                ? Number(formatUnits(totalSupply as bigint, tokenDecimals)).toLocaleString()
                : "---"}
            </p>
          </div>
          <div className="bg-white rounded-2xl p-5 border border-darkBlack/10">
            <p className="text-xs uppercase tracking-wider text-darkBlack/40 mb-1">OTC Allocations</p>
            <p className="text-lg font-bold text-text">{records.length}</p>
          </div>
        </div>
      )}

      <TransactionStatus
        isPending={mintAction.isPending}
        isConfirming={mintAction.isConfirming}
        isConfirmed={mintAction.isConfirmed}
        txHash={mintAction.txHash}
        txUrl={mintAction.txUrl}
        error={mintAction.error}
        successMessage="OTC tokens minted successfully."
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Mint Form */}
        <div className="bg-white rounded-2xl border border-darkBlack/10 p-6">
          <h2 className="text-lg font-semibold text-text mb-1 flex items-center gap-2">
            <Coins className="h-5 w-5 text-darkAqua" /> Mint OTC Tokens
          </h2>
          <p className="text-xs text-darkBlack/40 mb-5">
            Mint OTC receipt tokens to an investor or operator wallet after receiving off-chain payment.
          </p>

          {formError && (
            <div className="mb-4 p-3 rounded-xl bg-red-50 border border-red-200 text-sm text-red-600 flex items-center gap-2">
              <AlertCircle className="h-4 w-4 flex-shrink-0" />
              {formError}
            </div>
          )}

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-zinc-700 mb-1">Investor / Operator Wallet Address</label>
              <input
                type="text"
                value={investorWallet}
                onChange={(e) => setInvestorWallet(e.target.value)}
                placeholder="0x..."
                maxLength={42}
                className={`w-full px-4 py-2.5 rounded-xl border text-sm focus:outline-none focus:ring-2 focus:ring-darkAqua/30 focus:border-darkAqua font-mono ${
                  investorWallet && !isAddress(investorWallet) ? "border-red-300 bg-red-50/30" : "border-zinc-200"
                }`}
              />
              {investorWallet && !isAddress(investorWallet) && (
                <p className="text-xs text-red-500 mt-1">Invalid EVM address — must be 42 characters starting with 0x</p>
              )}
              {investorWallet && isAddress(investorWallet) && (
                <p className="text-xs text-green-600 mt-1">Valid address</p>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-700 mb-1">Amount ({tokenSymbol})</label>
              <input
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="10000"
                min="0"
                step="any"
                className="w-full px-4 py-2.5 rounded-xl border border-zinc-200 text-sm focus:outline-none focus:ring-2 focus:ring-darkAqua/30 focus:border-darkAqua"
              />
            </div>
            <Button
              variant="primary"
              className="w-full"
              onClick={handleMint}
              disabled={!validOtcAddress || !isAddress(investorWallet) || mintAction.isPending || mintAction.isConfirming}
              isLoading={mintAction.isPending || mintAction.isConfirming}
            >
              {mintAction.isPending ? "Sign in Wallet..." : mintAction.isConfirming ? "Confirming..." : "Mint OTC Tokens"}
            </Button>
          </div>
        </div>

        {/* Recent Mints */}
        <div className="bg-white rounded-2xl border border-darkBlack/10 p-6">
          <h2 className="text-lg font-semibold text-text mb-4">Recent OTC Allocations</h2>
          {records.length === 0 ? (
            <div className="text-center py-8">
              <Coins className="h-8 w-8 text-darkBlack/20 mx-auto mb-2" />
              <p className="text-darkBlack/30 text-sm">No OTC allocations yet.</p>
            </div>
          ) : (
            <div className="space-y-3 max-h-96 overflow-y-auto">
              {records.map((r) => (
                <div key={r.id} className="flex items-center justify-between p-3 rounded-xl bg-zinc-50 border border-zinc-100">
                  <div className="min-w-0">
                    <p className="text-sm font-mono text-text truncate">{r.wallet_address}</p>
                    <p className="text-xs text-darkBlack/40 mt-0.5">
                      {new Date(r.created_at).toLocaleDateString()}
                    </p>
                  </div>
                  <Badge variant="outline" size="sm">
                    {Number(r.tokens_allocated).toLocaleString()} tokens
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </IssuerDashboardLayout>
  );
}
