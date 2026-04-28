"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { ArrowLeft, Coins, Wallet, ShieldCheck, ShieldAlert, Shield, Flame, Layers } from "lucide-react";
import Link from "next/link";
import { useAccount, useReadContract } from "wagmi";
import { useConnectModal } from "@rainbow-me/rainbowkit";
import { parseUnits, formatUnits, isAddress, type Abi } from "viem";
import { Button, Spinner } from "@/components/atoms";
import { TransactionStatus } from "@/components/molecules/TransactionStatus";
import { IssuerDashboardLayout } from "@/components/templates";
import { getToken as fetchToken, type Token } from "@/lib/api/repositories/tokens";
import { getAccessToken } from "@/lib/api/client";
import { useContractAction } from "@/hooks/useContractAction";
import { CIRETA_TOKEN_ABI } from "@/lib/contracts/abis/ciretaToken";
import { SIMPLE_IDENTITY_REGISTRY_ABI } from "@/lib/contracts/abis/simpleIdentityRegistry";
import { BatchAddressInput, useBatchRows } from "@/components/molecules/BatchAddressInput";

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
  const [, setRawUnits] = useState<string | null>(null);

  const { isConnected, address: walletAddress } = useAccount();
  const { openConnectModal } = useConnectModal();
  const mintAction = useContractAction();
  const whitelistAction = useContractAction();
  const burnAction = useContractAction();
  const [burnFrom, setBurnFrom] = useState<string>("");
  const [burnAmount, setBurnAmount] = useState<string>("");
  const [burnError, setBurnError] = useState<string | null>(null);
  const batchMintAction = useContractAction();
  const batchBurnAction = useContractAction();
  const [batchMintInput, setBatchMintInput] = useState<string>("");
  const [batchBurnInput, setBatchBurnInput] = useState<string>("");
  const [batchError, setBatchError] = useState<string | null>(null);
  const batchMintRows = useBatchRows(batchMintInput, true);
  const batchBurnRows = useBatchRows(batchBurnInput, true);

  // Check if recipient is whitelisted — use token's registry or platform default
  const irAddress = token?.identity_registry_address || process.env.NEXT_PUBLIC_IDENTITY_REGISTRY_ADDRESS;
  const recipientValid = recipient && isAddress(recipient);
  const { data: isRecipientVerified, refetch: refetchVerified } = useReadContract({
    address: irAddress as `0x${string}`,
    abi: SIMPLE_IDENTITY_REGISTRY_ABI as unknown as Abi,
    functionName: "isVerified",
    args: recipientValid ? [recipient as `0x${string}`] : undefined,
    query: { enabled: !!irAddress && !!recipientValid },
  });

  const handleWhitelist = async () => {
    if (!irAddress || !recipientValid) return;
    const receipt = await whitelistAction.execute({
      address: irAddress as `0x${string}`,
      abi: SIMPLE_IDENTITY_REGISTRY_ABI as unknown as Abi,
      functionName: "addToWhitelist",
      args: [recipient as `0x${string}`, 784], // UAE default
    });
    if (receipt) refetchVerified();
  };

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
    if (walletAddress && !burnFrom) {
      setBurnFrom(walletAddress);
    }
  }, [walletAddress, recipient, burnFrom]);

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

  const decimals = token?.decimals ?? 6;

  /**
   * Sanitize user input: strip commas/spaces, validate it's a proper number,
   * then use parseUnits which works with clean decimal strings.
   */
  const sanitizeAmount = (raw: string): string | null => {
    const cleaned = raw.replace(/[,\s]/g, "");
    if (!cleaned || isNaN(Number(cleaned)) || Number(cleaned) <= 0) return null;
    // Ensure no more decimal places than the token supports
    const parts = cleaned.split(".");
    if (parts.length === 2 && (parts[1]?.length ?? 0) > decimals) return null;
    return cleaned;
  };

  // Compute raw units preview whenever amount or decimals changes
  useEffect(() => {
    if (!amount) { setRawUnits(null); return; }
    const cleaned = sanitizeAmount(amount);
    if (!cleaned) { setRawUnits(null); return; }
    try {
      const units = parseUnits(cleaned, decimals);
      setRawUnits(units.toString());
    } catch {
      setRawUnits(null);
    }
  }, [amount, decimals]);
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
    const cleaned = sanitizeAmount(amount);
    if (!cleaned) {
      setValidationError(
        "Enter a valid positive number. " +
        `Max ${decimals} decimal places. Commas are allowed.`
      );
      return;
    }

    let parsedAmount: bigint;
    try {
      parsedAmount = parseUnits(cleaned, decimals);
    } catch {
      setValidationError("Failed to parse amount — check the value and try again.");
      return;
    }

    const receipt = await mintAction.execute({
      address: contractAddr,
      abi,
      functionName: "mint",
      args: [recipient as `0x${string}`, parsedAmount],
    });

    if (receipt) {
      setAmount("");
    }
  };

  const handleBurn = async () => {
    setBurnError(null);
    if (!isConnected) {
      openConnectModal?.();
      return;
    }
    if (!contractAddr) {
      setBurnError("Token is not deployed on-chain yet.");
      return;
    }
    if (!burnFrom || !isAddress(burnFrom)) {
      setBurnError("Enter a valid account address to burn from.");
      return;
    }
    const cleaned = sanitizeAmount(burnAmount);
    if (!cleaned) {
      setBurnError(`Enter a valid positive number. Max ${decimals} decimal places.`);
      return;
    }
    let parsed: bigint;
    try {
      parsed = parseUnits(cleaned, decimals);
    } catch {
      setBurnError("Failed to parse amount.");
      return;
    }
    const receipt = await burnAction.execute({
      address: contractAddr,
      abi,
      functionName: "burn",
      args: [burnFrom as `0x${string}`, parsed],
    });
    if (receipt) setBurnAmount("");
  };

  const handleBatch = async (mode: "mint" | "burn") => {
    setBatchError(null);
    if (!isConnected) { openConnectModal?.(); return; }
    if (!contractAddr) { setBatchError("Token is not deployed on-chain yet."); return; }
    const rows = mode === "mint" ? batchMintRows : batchBurnRows;
    const valid = rows.filter((r) => r.addressValid && r.amountValid);
    if (valid.length === 0) { setBatchError("Add at least one valid row."); return; }
    if (valid.length !== rows.length) { setBatchError("Fix invalid rows before submitting."); return; }
    let addrs: `0x${string}`[];
    let amounts: bigint[];
    try {
      addrs = valid.map((r) => r.address as `0x${string}`);
      amounts = valid.map((r) => parseUnits(r.amountRaw, decimals));
    } catch {
      setBatchError("Failed to parse amounts.");
      return;
    }
    const action = mode === "mint" ? batchMintAction : batchBurnAction;
    const fn = mode === "mint" ? "batchMint" : "batchBurn";
    const receipt = await action.execute({
      address: contractAddr,
      abi,
      functionName: fn,
      args: [addrs, amounts],
    });
    if (receipt) {
      if (mode === "mint") setBatchMintInput("");
      else setBatchBurnInput("");
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
        <p className="text-center text-black/40 py-24">Token not found</p>
      </IssuerDashboardLayout>
    );
  }

  return (
    <IssuerDashboardLayout
      title={`Mint ${token.symbol}`}
      description={`Mint new ${token.name} tokens to any address`}
      actions={
        <Link href={`/issuer/tokens/${resolvedId}`}>
          <Button variant="outline" size="sm" leftIcon={<ArrowLeft className="h-4 w-4" />}>
            Back to Token
          </Button>
        </Link>
      }
    >

      {!token.contract_address && (
        <div className="mb-6 p-4 rounded-lg bg-amber-50 border border-amber-200 text-sm text-amber-700">
          This token has not been deployed on-chain yet. Deploy it first from the token detail page.
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white rounded-lg p-6 border border-black/10"
        >
          <div className="flex items-center gap-2 mb-2">
            <Coins className="h-5 w-5 text-darkAqua" />
            <h3 className="text-sm font-medium text-black/50">Total Supply</h3>
          </div>
          <p className="text-2xl font-semibold text-text">
            {totalSupply !== null
              ? parseFloat(totalSupply).toLocaleString()
              : parseFloat(token.total_supply).toLocaleString()}
          </p>
          <p className="text-xs text-black/40 mt-1">{token.symbol}</p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          className="bg-white rounded-lg p-6 border border-black/10"
        >
          <div className="flex items-center gap-2 mb-2">
            <Wallet className="h-5 w-5 text-darkAqua" />
            <h3 className="text-sm font-medium text-black/50">Your Balance</h3>
          </div>
          <p className="text-2xl font-semibold text-text">
            {walletBalance !== null
              ? parseFloat(walletBalance).toLocaleString()
              : "--"}
          </p>
          <p className="text-xs text-black/40 mt-1">{token.symbol}</p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="bg-white rounded-lg p-6 border border-black/10"
        >
          <div className="flex items-center gap-2 mb-2">
            <Coins className="h-5 w-5 text-darkAqua" />
            <h3 className="text-sm font-medium text-black/50">Token Info</h3>
          </div>
          <p className="text-lg font-semibold text-text">{token.name}</p>
          <p className="text-xs text-black/40 mt-1">
            {token.symbol} &middot; {decimals} decimals &middot; {token.asset_type}
          </p>
        </motion.div>
      </div>

      {/* Mint Form */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15 }}
        className="bg-white rounded-lg p-6 border border-black/10"
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
              maxLength={42}
              className={`w-full px-4 py-2.5 rounded-lg border text-sm font-mono focus:outline-none focus:ring-2 focus:ring-darkAqua/30 focus:border-darkAqua ${
                recipient && !isAddress(recipient) ? "border-red-300 bg-red-50/30" : "border-zinc-200"
              }`}
              placeholder="0x..."
            />
            {recipient && !isAddress(recipient) ? (
              <p className="text-xs text-red-500 mt-1">Invalid EVM address — must be 42 characters starting with 0x</p>
            ) : (
              <p className="text-xs text-black/40 mt-1">Defaults to your connected wallet address.</p>
            )}

            {/* Whitelist status — informational only (mint doesn't require it, but transfers do) */}
            {recipientValid && irAddress && recipient?.toLowerCase() !== walletAddress?.toLowerCase() && (
              <div className="mt-2">
                {isRecipientVerified === true ? (
                  <div className="flex items-center gap-2 text-xs text-green-600 bg-green-50 px-3 py-2 rounded-lg">
                    <ShieldCheck className="h-3.5 w-3.5" /> Recipient is whitelisted — can transfer tokens onward
                  </div>
                ) : isRecipientVerified === false ? (
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                    <div className="flex items-center gap-2 text-xs text-blue-700 mb-2">
                      <ShieldAlert className="h-3.5 w-3.5" /> Recipient is not whitelisted yet. Minting will work, but they won&apos;t be able to transfer tokens until whitelisted.
                    </div>
                    <Button variant="outline" size="sm" onClick={handleWhitelist}
                      disabled={whitelistAction.isPending || whitelistAction.isConfirming}
                      isLoading={whitelistAction.isPending || whitelistAction.isConfirming}>
                      <Shield className="h-3.5 w-3.5 mr-1.5" /> Whitelist Now (Optional)
                    </Button>
                    <TransactionStatus isPending={whitelistAction.isPending} isConfirming={whitelistAction.isConfirming}
                      isConfirmed={whitelistAction.isConfirmed} txHash={whitelistAction.txHash} txUrl={whitelistAction.txUrl}
                      error={whitelistAction.error} successMessage="Address whitelisted." />
                  </div>
                ) : null}
              </div>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-zinc-700 mb-1">
              Amount
            </label>
            <input
              type="number"
              inputMode="decimal"
              min="0"
              step="any"
              value={amount}
              onChange={(e) => {
                const val = e.target.value.replace(/[^0-9.]/g, "");
                setAmount(val);
                setValidationError(null);
              }}
              className="w-full px-4 py-2.5 rounded-lg border border-zinc-200 text-sm focus:outline-none focus:ring-2 focus:ring-darkAqua/30 focus:border-darkAqua"
              placeholder="1000"
            />
            {amount && Number(amount) > 0 && (() => {
              const n = Number(amount);
              const fmt = (v: number) => v % 1 === 0 ? v.toFixed(0) : v.toFixed(2);
              const word = n >= 1_000_000_000 ? `${fmt(n / 1_000_000_000)} billion`
                : n >= 1_000_000 ? `${fmt(n / 1_000_000)} million`
                : n >= 1_000 ? `${fmt(n / 1_000)} thousand`
                : "";
              const formatted = n.toLocaleString("en-US");
              return <p className="text-sm font-medium text-darkAqua mt-1.5">{formatted}{word ? ` (${word})` : ""} tokens</p>;
            })()}
            {!amount && (
              <p className="text-xs text-black/40 mt-1">Enter the number of tokens to mint.</p>
            )}
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

      {/* Burn Form */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="mt-6 bg-white rounded-lg p-6 border border-black/10"
      >
        <h2 className="text-lg font-semibold text-text mb-1 flex items-center gap-2">
          <Flame className="h-5 w-5 text-red-500" /> Burn Tokens
        </h2>
        <p className="text-xs text-black/40 mb-4">
          Burn tokens from any account. Requires SUPPLY_ROLE on the token contract. Permanent — cannot be reversed.
        </p>

        <div className="space-y-4 max-w-lg">
          <div>
            <label className="block text-sm font-medium text-zinc-700 mb-1">From Account</label>
            <input
              type="text"
              value={burnFrom}
              onChange={(e) => { setBurnFrom(e.target.value); setBurnError(null); }}
              maxLength={42}
              className={`w-full px-4 py-2.5 rounded-lg border text-sm font-mono focus:outline-none focus:ring-2 focus:ring-red-500/30 focus:border-red-500 ${
                burnFrom && !isAddress(burnFrom) ? "border-red-300 bg-red-50/30" : "border-zinc-200"
              }`}
              placeholder="0x..."
            />
            {burnFrom && !isAddress(burnFrom) && (
              <p className="text-xs text-red-500 mt-1">Invalid EVM address</p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-zinc-700 mb-1">Amount</label>
            <input
              type="number"
              inputMode="decimal"
              min="0"
              step="any"
              value={burnAmount}
              onChange={(e) => {
                const val = e.target.value.replace(/[^0-9.]/g, "");
                setBurnAmount(val);
                setBurnError(null);
              }}
              className="w-full px-4 py-2.5 rounded-lg border border-zinc-200 text-sm focus:outline-none focus:ring-2 focus:ring-red-500/30 focus:border-red-500"
              placeholder="1000"
            />
            {burnAmount && Number(burnAmount) > 0 && (
              <p className="text-sm font-medium text-red-600 mt-1.5">
                Burning {Number(burnAmount).toLocaleString("en-US")} {token.symbol}
              </p>
            )}
          </div>

          {burnError && <p className="text-sm text-red-600">{burnError}</p>}

          <Button
            variant="outline"
            onClick={handleBurn}
            disabled={burnAction.isPending || burnAction.isConfirming || !token.contract_address}
            isLoading={burnAction.isPending || burnAction.isConfirming}
            leftIcon={<Flame className="h-4 w-4 text-red-500" />}
          >
            Burn Tokens
          </Button>

          <TransactionStatus
            isPending={burnAction.isPending}
            isConfirming={burnAction.isConfirming}
            isConfirmed={burnAction.isConfirmed}
            txHash={burnAction.txHash}
            txUrl={burnAction.txUrl}
            error={burnAction.error}
            successMessage={`Successfully burned ${burnAmount || "tokens"} ${token.symbol}.`}
          />
        </div>
      </motion.div>

      {/* Batch Operations */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.25 }}
        className="mt-6 bg-white rounded-lg p-6 border border-black/10"
      >
        <h2 className="text-lg font-semibold text-text mb-1 flex items-center gap-2">
          <Layers className="h-5 w-5 text-darkAqua" /> Batch Operations
        </h2>
        <p className="text-xs text-black/40 mb-4">
          Mint or burn many addresses in a single transaction. One row per recipient: <code className="font-mono">address,amount</code>.
        </p>
        {batchError && <p className="text-sm text-red-600 mb-3">{batchError}</p>}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div>
            <p className="text-sm font-medium text-zinc-700 mb-2 flex items-center gap-2">
              <Coins className="h-4 w-4 text-darkAqua" /> Batch Mint
            </p>
            <BatchAddressInput value={batchMintInput} onChange={setBatchMintInput} withAmount />
            <div className="mt-3 flex items-center justify-between">
              <p className="text-xs text-black/40">{batchMintRows.length} row{batchMintRows.length !== 1 ? "s" : ""}</p>
              <Button
                variant="primary"
                size="sm"
                onClick={() => handleBatch("mint")}
                disabled={batchMintAction.isPending || batchMintAction.isConfirming || !token.contract_address || batchMintRows.length === 0}
                isLoading={batchMintAction.isPending || batchMintAction.isConfirming}
                leftIcon={<Coins className="h-3.5 w-3.5" />}
              >
                Batch Mint
              </Button>
            </div>
            <TransactionStatus
              isPending={batchMintAction.isPending}
              isConfirming={batchMintAction.isConfirming}
              isConfirmed={batchMintAction.isConfirmed}
              txHash={batchMintAction.txHash}
              txUrl={batchMintAction.txUrl}
              error={batchMintAction.error}
              successMessage="Batch mint executed."
            />
          </div>

          <div>
            <p className="text-sm font-medium text-zinc-700 mb-2 flex items-center gap-2">
              <Flame className="h-4 w-4 text-red-500" /> Batch Burn
            </p>
            <BatchAddressInput value={batchBurnInput} onChange={setBatchBurnInput} withAmount />
            <div className="mt-3 flex items-center justify-between">
              <p className="text-xs text-black/40">{batchBurnRows.length} row{batchBurnRows.length !== 1 ? "s" : ""}</p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleBatch("burn")}
                disabled={batchBurnAction.isPending || batchBurnAction.isConfirming || !token.contract_address || batchBurnRows.length === 0}
                isLoading={batchBurnAction.isPending || batchBurnAction.isConfirming}
                leftIcon={<Flame className="h-3.5 w-3.5 text-red-500" />}
              >
                Batch Burn
              </Button>
            </div>
            <TransactionStatus
              isPending={batchBurnAction.isPending}
              isConfirming={batchBurnAction.isConfirming}
              isConfirmed={batchBurnAction.isConfirmed}
              txHash={batchBurnAction.txHash}
              txUrl={batchBurnAction.txUrl}
              error={batchBurnAction.error}
              successMessage="Batch burn executed."
            />
          </div>
        </div>
      </motion.div>
    </IssuerDashboardLayout>
  );
}
