"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { ArrowLeft, Lock } from "lucide-react";
import Link from "next/link";
import { useAccount, useReadContract } from "wagmi";
import { useConnectModal } from "@rainbow-me/rainbowkit";
import { keccak256, toBytes, type Abi } from "viem";
import { Button, Spinner } from "@/components/atoms";
import { IssuerDashboardLayout } from "@/components/templates";
import { getToken as fetchToken, type Token } from "@/lib/api/repositories/tokens";
import { getAccessToken } from "@/lib/api/client";
import { CIRETA_TOKEN_ABI } from "@/lib/contracts/abis/ciretaToken";
import { AddressFreezeToggle, PartialFreezePanel } from "@/components/molecules/FreezeAddressPanel";
import { FreezeBatchPanel } from "@/components/molecules/FreezeBatchPanel";

function getAuthToken(): string {
  return getAccessToken() ?? "";
}

// keccak256("FREEZE_ROLE") — matches CiretaToken.sol constant
const FREEZE_ROLE = keccak256(toBytes("FREEZE_ROLE")) as `0x${string}`;

const abi = CIRETA_TOKEN_ABI as unknown as Abi;

type TabId = "single" | "batch";

export default function FreezeManagementPage({
  params: paramsPromise,
}: {
  params: Promise<{ id: string }>;
}) {
  const [resolvedId, setResolvedId] = useState<string>("");
  const [token, setToken] = useState<Token | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabId>("single");

  const { isConnected, address: walletAddress } = useAccount();
  const { openConnectModal } = useConnectModal();

  useEffect(() => {
    paramsPromise.then((p) => setResolvedId(p.id));
  }, [paramsPromise]);

  useEffect(() => {
    if (!resolvedId) return;
    (async () => {
      try {
        const data = await fetchToken(resolvedId, getAuthToken());
        setToken(data);
      } catch { /* 404 */ } finally {
        setLoading(false);
      }
    })();
  }, [resolvedId]);

  const contractAddr = token?.contract_address as `0x${string}` | undefined;
  const decimals = token?.decimals ?? 6;

  // Preflight: check FREEZE_ROLE on connected wallet
  const {
    data: hasFreezeRoleRaw,
    isFetched: freezeRoleFetched,
  } = useReadContract({
    address: contractAddr,
    abi,
    functionName: "hasRole",
    args: walletAddress ? [FREEZE_ROLE, walletAddress] : undefined,
    query: { enabled: !!contractAddr && !!walletAddress },
  });
  const hasFreezeRole = hasFreezeRoleRaw as boolean | undefined;

  if (loading) {
    return (
      <IssuerDashboardLayout title="Freeze Management" description="">
        <div className="flex justify-center py-24"><Spinner /></div>
      </IssuerDashboardLayout>
    );
  }

  if (!token) {
    return (
      <IssuerDashboardLayout title="Freeze Management" description="">
        <p className="text-center text-black/40 py-24">Token not found</p>
      </IssuerDashboardLayout>
    );
  }

  const tabs: { id: TabId; label: string }[] = [
    { id: "single", label: "Single Address" },
    { id: "batch", label: "Batch Operations" },
  ];

  return (
    <IssuerDashboardLayout
      title={`Freeze Management — ${token.symbol}`}
      description="Freeze or unfreeze addresses and partial token amounts on-chain"
      actions={
        <Link href={`/issuer/tokens/${resolvedId}`}>
          <Button variant="outline" size="sm" leftIcon={<ArrowLeft className="h-4 w-4" />}>
            Back to Token
          </Button>
        </Link>
      }
    >
      <div className="mb-6">
        <Link href="/issuer/tokens" className="flex items-center gap-2 text-sm text-black/50 hover:text-text">
          <ArrowLeft className="h-4 w-4" /> Back to Tokens
        </Link>
      </div>

      {!isConnected && (
        <div className="mb-6 p-4 rounded-lg bg-amber-50 border border-amber-200 text-sm text-amber-700">
          Connect your wallet to manage token freezes.{" "}
          <button onClick={() => openConnectModal?.()} className="underline font-medium ml-1">
            Connect Wallet
          </button>
        </div>
      )}

      {!token.contract_address && (
        <div className="mb-6 p-4 rounded-lg bg-amber-50 border border-amber-200 text-sm text-amber-700">
          This token has not been deployed on-chain yet. Deploy it first from the{" "}
          <Link href={`/issuer/tokens/${resolvedId}`} className="underline font-medium">
            token detail page
          </Link>.
        </div>
      )}

      {/* Tab bar */}
      <div className="flex border-b border-black/10 mb-6 gap-1">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2.5 text-sm font-medium rounded-t-lg transition-colors ${
              activeTab === tab.id
                ? "bg-white border border-b-white border-black/10 text-darkAqua -mb-px"
                : "text-black/50 hover:text-text"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Single-address tab */}
      {activeTab === "single" && contractAddr && (
        <div className="space-y-6">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-white rounded-lg p-6 border border-black/10"
          >
            <h2 className="text-lg font-semibold text-text mb-1 flex items-center gap-2">
              <Lock className="h-5 w-5 text-darkAqua" /> Address Freeze Toggle
            </h2>
            <p className="text-xs text-black/40 mb-4">
              Fully freeze an address — all transfers from that wallet are blocked.
              Calls <code className="font-mono">setAddressFrozen(addr, bool)</code>.
            </p>
            <AddressFreezeToggle
              contractAddr={contractAddr}
              hasFreezeRole={hasFreezeRole}
              freezeRoleFetched={freezeRoleFetched}
            />
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.08 }}
            className="bg-white rounded-lg p-6 border border-black/10"
          >
            <h2 className="text-lg font-semibold text-text mb-1 flex items-center gap-2">
              <Lock className="h-5 w-5 text-darkAqua" /> Partial Token Freeze
            </h2>
            <p className="text-xs text-black/40 mb-4">
              Freeze or unfreeze a specific token amount for an address without fully blocking it.
              Calls <code className="font-mono">freezePartialTokens</code> or{" "}
              <code className="font-mono">unfreezePartialTokens</code>.
            </p>
            <PartialFreezePanel
              contractAddr={contractAddr}
              decimals={decimals}
              symbol={token.symbol}
              hasFreezeRole={hasFreezeRole}
              freezeRoleFetched={freezeRoleFetched}
            />
          </motion.div>
        </div>
      )}

      {/* Batch tab */}
      {activeTab === "batch" && contractAddr && (
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white rounded-lg p-6 border border-black/10"
        >
          <h2 className="text-lg font-semibold text-text mb-1 flex items-center gap-2">
            <Lock className="h-5 w-5 text-darkAqua" /> Batch Freeze Operations
          </h2>
          <p className="text-xs text-black/40 mb-6">
            Process many addresses in a single transaction. All three batch functions (
            <code className="font-mono">batchSetAddressFrozen</code>,{" "}
            <code className="font-mono">batchFreezePartialTokens</code>,{" "}
            <code className="font-mono">batchUnfreezePartialTokens</code>) are wired below.
          </p>
          <FreezeBatchPanel
            contractAddr={contractAddr}
            decimals={decimals}
            symbol={token.symbol}
            hasFreezeRole={hasFreezeRole}
            freezeRoleFetched={freezeRoleFetched}
          />
        </motion.div>
      )}
    </IssuerDashboardLayout>
  );
}
