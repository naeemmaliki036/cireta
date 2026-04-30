"use client";

import { useState, use } from "react";
import Link from "next/link";
import { ArrowLeft, Coins, Send } from "lucide-react";
import { useAccount, useReadContract } from "wagmi";
import { useConnectModal } from "@rainbow-me/rainbowkit";
import { parseUnits, formatUnits, isAddress, type Abi } from "viem";
import { Button, Input, Badge } from "@/components/atoms";
import { CopyableAddress } from "@/components/atoms/CopyableAddress";
import { ExplorerLinkIcon } from "@/components/atoms/ExplorerLinkIcon";
import { IssuerDashboardLayout } from "@/components/templates";
import { TransactionStatus } from "@/components/molecules/TransactionStatus";
import { useContractAction } from "@/hooks/useContractAction";
import { OTC_TOKEN_ABI } from "@/lib/contracts/abis/otcToken";

// keccak256("MINTER_ROLE")
const MINTER_ROLE = "0x9f2df0fed2c77648de5860a4cc508cd0818c85b8b8a1ab4ceeef8d981c8956a6";

export default function OTCTokenDetailPage({ params }: { params: Promise<{ address: string }> }) {
  const { address: rawAddress } = use(params);
  const otcAddr = (isAddress(rawAddress) ? rawAddress : "0x0000000000000000000000000000000000000000") as `0x${string}`;
  const valid = otcAddr !== "0x0000000000000000000000000000000000000000";

  const { address: walletAddress, isConnected } = useAccount();
  const { openConnectModal } = useConnectModal();

  const mintAction = useContractAction();

  // Read token metadata
  const baseQuery = { enabled: valid };
  const { data: nameRaw } = useReadContract({ address: otcAddr, abi: OTC_TOKEN_ABI, functionName: "name", query: baseQuery });
  const { data: symbolRaw } = useReadContract({ address: otcAddr, abi: OTC_TOKEN_ABI, functionName: "symbol", query: baseQuery });
  const { data: decimalsRaw } = useReadContract({ address: otcAddr, abi: OTC_TOKEN_ABI, functionName: "decimals", query: baseQuery });
  const { data: totalSupplyRaw, refetch: refetchSupply } = useReadContract({
    address: otcAddr, abi: OTC_TOKEN_ABI, functionName: "totalSupply", query: baseQuery,
  });
  const { data: hasMinterRoleRaw } = useReadContract({
    address: otcAddr,
    abi: OTC_TOKEN_ABI as unknown as Abi,
    functionName: "hasRole",
    args: walletAddress ? [MINTER_ROLE, walletAddress] : undefined,
    query: { enabled: valid && !!walletAddress },
  });

  const name = (nameRaw as string) || "OTC Token";
  const symbol = (symbolRaw as string) || "OTC";
  const decimals = typeof decimalsRaw === "number" ? decimalsRaw : 6;
  const totalSupply = totalSupplyRaw ? formatUnits(totalSupplyRaw as bigint, decimals) : "0";
  const hasMinterRole = hasMinterRoleRaw === true;

  // Mint form
  const [recipient, setRecipient] = useState("");
  const [amount, setAmount] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  const handleMint = async () => {
    setFormError(null);
    if (!isConnected) { openConnectModal?.(); return; }
    if (!valid) { setFormError("Invalid OTC token address."); return; }
    if (!isAddress(recipient)) { setFormError("Recipient must be a valid wallet address."); return; }
    const amt = parseFloat(amount);
    if (!amt || amt <= 0) { setFormError("Amount must be greater than zero."); return; }
    if (!hasMinterRole) {
      setFormError("Connected wallet does not have MINTER_ROLE on this OTC token. Either grant it via the issuer registry or mint via the linked sale.");
      return;
    }
    try {
      const amountWei = parseUnits(amount, decimals);
      await mintAction.execute({
        address: otcAddr,
        abi: OTC_TOKEN_ABI as unknown as Abi,
        functionName: "mint",
        args: [recipient as `0x${string}`, amountWei],
      });
      setRecipient("");
      setAmount("");
      refetchSupply();
    } catch (e) {
      setFormError(e instanceof Error ? e.message : "Mint failed");
    }
  };

  if (!valid) {
    return (
      <IssuerDashboardLayout title="OTC Token" description="Invalid address">
        <Link href="/issuer/tokens" className="inline-flex items-center gap-1.5 text-sm text-darkAqua hover:underline">
          <ArrowLeft className="h-4 w-4" /> Back to Tokens
        </Link>
        <p className="mt-4 text-sm text-red-600">The provided address is not a valid EVM address.</p>
      </IssuerDashboardLayout>
    );
  }

  return (
    <IssuerDashboardLayout title={name} description={`${symbol} · OTC token detail`}>
      <Link href="/issuer/tokens" className="inline-flex items-center gap-1.5 text-sm text-darkAqua hover:underline mb-4">
        <ArrowLeft className="h-4 w-4" /> Back to Tokens
      </Link>

      {/* Summary card */}
      <div className="bg-white rounded-lg border border-zinc-100 p-6 mb-6">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-xl font-semibold text-text">{name}</h1>
            <p className="text-sm text-black/50 mt-1">
              {symbol} · {decimals} decimals
            </p>
            <div className="mt-3 flex items-center gap-2 text-xs">
              <CopyableAddress address={otcAddr} />
              <ExplorerLinkIcon address={otcAddr} />
            </div>
          </div>
          <Badge variant="active" size="sm">
            <Coins className="h-3 w-3 mr-1" /> Deployed
          </Badge>
        </div>

        <div className="grid grid-cols-3 gap-4 mt-6">
          <div className="bg-zinc-50 rounded-md px-4 py-3">
            <p className="text-[11px] text-black/40 uppercase tracking-wider mb-1">Total Minted</p>
            <p className="text-lg font-mono font-semibold text-text">
              {parseFloat(totalSupply).toLocaleString("en-US", { maximumFractionDigits: 6 })}
            </p>
          </div>
          <div className="bg-zinc-50 rounded-md px-4 py-3">
            <p className="text-[11px] text-black/40 uppercase tracking-wider mb-1">Symbol</p>
            <p className="text-lg font-mono font-semibold text-text">{symbol}</p>
          </div>
          <div className="bg-zinc-50 rounded-md px-4 py-3">
            <p className="text-[11px] text-black/40 uppercase tracking-wider mb-1">Decimals</p>
            <p className="text-lg font-mono font-semibold text-text">{decimals}</p>
          </div>
        </div>
      </div>

      {/* Mint form */}
      <div className="bg-white rounded-lg border border-zinc-100 p-6">
        <h2 className="text-base font-semibold text-text mb-1 flex items-center gap-2">
          <Send className="h-4 w-4 text-darkAqua" /> Mint OTC Tokens
        </h2>
        <p className="text-xs text-black/50 mb-4">
          Mint receipt tokens to an investor who paid off-platform. Requires <code>MINTER_ROLE</code>{" "}
          on the OTC token. The Sale contract is granted MINTER_ROLE automatically when wired via OTC config.
        </p>

        {!isConnected && (
          <div className="mb-4 px-3 py-2 rounded-md bg-amber-50 border border-amber-200 text-xs text-amber-800">
            Connect your wallet to mint.
          </div>
        )}
        {isConnected && !hasMinterRole && (
          <div className="mb-4 px-3 py-2 rounded-md bg-amber-50 border border-amber-200 text-xs text-amber-800">
            <strong>{walletAddress?.slice(0, 6)}…{walletAddress?.slice(-4)}</strong> does not hold MINTER_ROLE on this token.
            The mint button will revert. Either mint from the linked sale&apos;s OTC tab, or grant MINTER_ROLE to your wallet first.
          </div>
        )}

        <div className="space-y-4 max-w-xl">
          <Input
            label="Recipient Wallet"
            placeholder="0x… investor wallet"
            value={recipient}
            onChange={(e) => setRecipient(e.target.value.trim())}
            maxLength={42}
            error={recipient && !isAddress(recipient) ? "Invalid EVM address" : undefined}
          />
          <Input
            label={`Amount (${symbol})`}
            type="number"
            placeholder="e.g. 100"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            helperText={`Minted as ${decimals}-decimal units. Enter the human amount.`}
          />
          {formError && (
            <p className="text-xs text-red-600">{formError}</p>
          )}
          <Button
            variant="primary"
            size="sm"
            onClick={handleMint}
            disabled={!recipient || !amount || mintAction.isPending || mintAction.isConfirming || !isConnected}
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
            successMessage={`Minted ${amount || "?"} ${symbol} successfully.`}
          />
        </div>
      </div>
    </IssuerDashboardLayout>
  );
}
