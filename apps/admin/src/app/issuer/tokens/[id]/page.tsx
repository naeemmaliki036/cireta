"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { ArrowLeft, Shield, Pause, Play, Rocket, Coins } from "lucide-react";
import Link from "next/link";
import { useAccount, useReadContract } from "wagmi";
import { useConnectModal } from "@rainbow-me/rainbowkit";
import { decodeEventLog, type Abi } from "viem";
import { Button, Badge, Spinner } from "@/components/atoms";
import { WalletBadge } from "@/components/molecules";
import { TransactionStatus } from "@/components/molecules/TransactionStatus";
import { IssuerDashboardLayout } from "@/components/templates";
import { getToken as fetchToken, recordTokenDeployment, type Token } from "@/lib/api/repositories/tokens";
import { getAccessToken } from "@/lib/api/client";
import { useContractAction } from "@/hooks/useContractAction";
import { TOKEN_FACTORY_ABI } from "@/lib/contracts/abis/tokenFactory";
import { CIRETA_TOKEN_ABI } from "@/lib/contracts/abis/ciretaToken";
import { requireAddress } from "@/lib/contracts/addresses";

function getAuthToken() {
  return getAccessToken() ?? "";
}

export default function TokenDetailPage({ params: paramsPromise }: { params: Promise<{ id: string }> }) {
  const [token, setToken] = useState<Token | null>(null);
  const [loading, setLoading] = useState(true);
  const [resolvedId, setResolvedId] = useState<string>("");

  // On-chain deployment
  const { isConnected, address: walletAddress } = useAccount();
  const { openConnectModal } = useConnectModal();
  const deployAction = useContractAction();
  const pauseAction = useContractAction();

  // Read on-chain total supply to show mint guidance
  const { data: onChainSupply } = useReadContract({
    address: token?.contract_address as `0x${string}`,
    abi: CIRETA_TOKEN_ABI as unknown as Abi,
    functionName: "totalSupply",
    query: { enabled: !!token?.contract_address },
  });
  const supplyMinted = Number(onChainSupply ?? 0) > 0;

  // Read on-chain paused state
  const { data: onChainPaused, refetch: refetchPaused } = useReadContract({
    address: token?.contract_address as `0x${string}`,
    abi: CIRETA_TOKEN_ABI as unknown as Abi,
    functionName: "paused",
    query: { enabled: !!token?.contract_address },
  });
  const isPaused = typeof onChainPaused === "boolean" ? onChainPaused : token?.is_paused ?? false;

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

  const handlePauseToggle = async () => {
    if (!token?.contract_address) return;
    if (!isConnected) { openConnectModal?.(); return; }

    pauseAction.reset();
    const fnName = isPaused ? "unpause" : "pause";
    const receipt = await pauseAction.execute({
      address: token.contract_address as `0x${string}`,
      abi: CIRETA_TOKEN_ABI as unknown as Abi,
      functionName: fnName,
    });
    if (receipt) {
      await refetchPaused();
    }
  };

  const handleDeployOnChain = async () => {
    if (!token || !walletAddress) {
      if (!isConnected) openConnectModal?.();
      return;
    }
    let factoryAddress: `0x${string}`;
    try {
      factoryAddress = requireAddress("tokenFactory");
    } catch {
      deployAction.reset();
      return;
    }

    const receipt = await deployAction.execute({
      address: factoryAddress,
      abi: TOKEN_FACTORY_ABI as unknown as Abi,
      functionName: "deployToken",
      args: [token.name, token.symbol, token.decimals ?? 18, walletAddress],
      gas: 5_000_000n,
    });

    if (receipt) {
      // Parse TokenDeployed event from logs
      let tokenAddr: string | null = null;
      let registryAddr: string | null = null;
      let complianceAddr: string | null = null;

      for (const log of receipt.logs) {
        try {
          const decoded = decodeEventLog({
            abi: TOKEN_FACTORY_ABI,
            data: log.data,
            topics: log.topics,
          });
          if (decoded.eventName === "TokenDeployed") {
            const args = decoded.args as {
              token: string;
              identityRegistry: string;
              compliance: string;
            };
            tokenAddr = args.token;
            registryAddr = args.identityRegistry;
            complianceAddr = args.compliance;
          }
        } catch { /* not our event */ }
      }

      if (tokenAddr && registryAddr && complianceAddr) {
        try {
          const updated = await recordTokenDeployment(resolvedId, {
            contract_address: tokenAddr,
            identity_registry_address: registryAddr,
            compliance_address: complianceAddr,
            tx_hash: receipt.transactionHash,
          });
          setToken(updated);
        } catch { /* on-chain is source of truth */ }
      }
    }
  };

  if (loading) {
    return (
      <IssuerDashboardLayout title="Token Details" description="">
        <div className="flex justify-center py-24"><Spinner /></div>
      </IssuerDashboardLayout>
    );
  }

  if (!token) {
    return (
      <IssuerDashboardLayout title="Token Details" description="">
        <p className="text-center text-black/40 py-24">Token not found</p>
      </IssuerDashboardLayout>
    );
  }

  return (
    <IssuerDashboardLayout title={`${token.name} (${token.symbol})`} description={`Token ID: ${token.id}`}
      actions={
        <div className="flex items-center gap-2">
          <Link href={`/issuer/tokens/${resolvedId}/mint`}>
            <Button variant="outline" size="sm" leftIcon={<Coins className="h-4 w-4" />}
              disabled={!token.contract_address}>
              Mint Tokens
            </Button>
          </Link>
          <Link href={`/issuer/tokens/${resolvedId}/compliance`}>
            <Button variant="outline" size="sm" leftIcon={<Shield className="h-4 w-4" />}>
              Compliance
            </Button>
          </Link>
        </div>
      }
    >
      <div className="mb-6">
        <Link href="/issuer/tokens" className="flex items-center gap-2 text-sm text-black/50 hover:text-text">
          <ArrowLeft className="h-4 w-4" /> Back to Tokens
        </Link>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
          className="bg-white rounded-lg p-6 border border-black/10">
          <h2 className="text-lg font-semibold text-text mb-4">Token Info</h2>
          <div className="space-y-3">
            {[
              { label: "Name", value: token.name },
              { label: "Symbol", value: token.symbol },
              { label: "Asset Type", value: token.asset_type },
              { label: "Total Supply", value: parseFloat(token.total_supply).toLocaleString() },
              { label: "Status", value: <Badge variant={isPaused ? "pending" : "active"} size="sm">{isPaused ? "Paused" : "Active"}</Badge> },
            ].map(({ label, value }) => (
              <div key={label} className="flex justify-between py-2 border-b border-black/5 last:border-0">
                <span className="text-sm text-black/50">{label}</span>
                <span className="text-sm font-medium text-text">{value}</span>
              </div>
            ))}
          </div>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
          className="bg-white rounded-lg p-6 border border-black/10">
          <h2 className="text-lg font-semibold text-text mb-4">Contract</h2>
          {token.contract_address ? (
            <div className="space-y-2">
              <WalletBadge address={token.contract_address} />
              {token.identity_registry_address && (
                <div className="text-xs text-black/50">
                  Identity Registry: <code className="font-mono bg-zinc-100 px-1 rounded">{token.identity_registry_address.slice(0, 10)}...{token.identity_registry_address.slice(-8)}</code>
                </div>
              )}
              {token.compliance_address && (
                <div className="text-xs text-black/50">
                  Compliance: <code className="font-mono bg-zinc-100 px-1 rounded">{token.compliance_address.slice(0, 10)}...{token.compliance_address.slice(-8)}</code>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-black/40">Not yet deployed on-chain</p>
              <Button
                variant="primary"
                size="sm"
                onClick={handleDeployOnChain}
                disabled={deployAction.isPending || deployAction.isConfirming}
                isLoading={deployAction.isPending || deployAction.isConfirming}
                leftIcon={<Rocket className="h-4 w-4" />}
              >
                Deploy On-Chain
              </Button>
              <TransactionStatus
                isPending={deployAction.isPending}
                isConfirming={deployAction.isConfirming}
                isConfirmed={deployAction.isConfirmed}
                txHash={deployAction.txHash}
                txUrl={deployAction.txUrl}
                error={deployAction.error}
                successMessage="Token deployed on-chain. Contract addresses recorded."
              />
            </div>
          )}

          {token.contract_address && !supplyMinted && (
            <div className="mt-4 p-3 rounded-lg bg-amber-50 border border-amber-200 text-sm text-amber-700">
              <Coins className="h-4 w-4 inline mr-1.5" />
              <strong>Next step:</strong> Mint tokens to your wallet before creating a sale.
              <Link href={`/issuer/tokens/${resolvedId}/mint`} className="ml-2 underline font-medium">
                Go to Mint
              </Link>
            </div>
          )}

          <div className="mt-6 pt-4 border-t border-black/10">
            <h3 className="text-sm font-semibold text-text mb-3">Actions</h3>
            <div className="flex gap-3">
              {isPaused ? (
                <Button variant="primary" size="sm"
                  leftIcon={<Play className="h-4 w-4" />}
                  onClick={handlePauseToggle}
                  disabled={pauseAction.isPending || pauseAction.isConfirming || !token.contract_address}
                  isLoading={pauseAction.isPending || pauseAction.isConfirming}>
                  Unpause Token
                </Button>
              ) : (
                <Button variant="outline" size="sm"
                  className="border-red-300 text-red-600 hover:bg-red-50"
                  leftIcon={<Pause className="h-4 w-4" />}
                  onClick={handlePauseToggle}
                  disabled={pauseAction.isPending || pauseAction.isConfirming || !token.contract_address}
                  isLoading={pauseAction.isPending || pauseAction.isConfirming}>
                  Pause Token
                </Button>
              )}
            </div>
            <TransactionStatus
              isPending={pauseAction.isPending}
              isConfirming={pauseAction.isConfirming}
              isConfirmed={pauseAction.isConfirmed}
              txHash={pauseAction.txHash}
              txUrl={pauseAction.txUrl}
              error={pauseAction.error}
              successMessage={isPaused ? "Token paused on-chain." : "Token unpaused on-chain."}
            />
          </div>
        </motion.div>
      </div>
    </IssuerDashboardLayout>
  );
}
