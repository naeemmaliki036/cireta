"use client";

import { useState, useEffect } from "react";
import { isAddress, type Abi } from "viem";
import { useAccount, useReadContract } from "wagmi";
import { useConnectModal } from "@rainbow-me/rainbowkit";
import { ArrowLeft, ShieldAlert } from "lucide-react";
import Link from "next/link";
import { Button, Spinner } from "@/components/atoms";
import { TransactionStatus } from "@/components/molecules/TransactionStatus";
import { RedemptionPanel } from "@/components/molecules/RedemptionPanel";
import { IssuerDashboardLayout } from "@/components/templates";
import { useContractAction } from "@/hooks/useContractAction";
import { CIRETA_TOKEN_ABI } from "@/lib/contracts/abis/ciretaToken";
import { getToken, type Token } from "@/lib/api/repositories/tokens";
import { getAccessToken } from "@/lib/api/client";

const DEFAULT_ADMIN_ROLE =
  "0x0000000000000000000000000000000000000000000000000000000000000000" as const;

interface StringSetterRowProps {
  label: string;
  placeholder?: string;
  contractAddress: `0x${string}`;
  abi: Abi;
  functionName: string;
  disabled?: boolean;
}

function StringSetterRow({
  label,
  placeholder,
  contractAddress,
  abi,
  functionName,
  disabled,
}: StringSetterRowProps) {
  const { isConnected } = useAccount();
  const { openConnectModal } = useConnectModal();
  const action = useContractAction();
  const [value, setValue] = useState("");

  const handleSave = async () => {
    if (!isConnected) { openConnectModal?.(); return; }
    if (!value.trim()) return;
    action.reset();
    await action.execute({ address: contractAddress, abi, functionName, args: [value.trim()] });
  };

  return (
    <div className="py-3 border-b border-zinc-100 last:border-0">
      <div className="flex items-center gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold text-zinc-700">{label}</p>
        </div>
        <input
          value={value}
          onChange={(e) => { setValue(e.target.value); action.reset(); }}
          placeholder={placeholder ?? "New value..."}
          className="w-56 text-xs border border-zinc-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-darkAqua/30 focus:border-darkAqua"
          disabled={disabled}
        />
        <Button
          variant="primary"
          size="sm"
          onClick={handleSave}
          disabled={disabled || !value.trim() || action.isPending || action.isConfirming}
          isLoading={action.isPending || action.isConfirming}
        >
          Save
        </Button>
      </div>
      <TransactionStatus
        isPending={action.isPending}
        isConfirming={action.isConfirming}
        isConfirmed={action.isConfirmed}
        txHash={action.txHash}
        txUrl={action.txUrl}
        error={action.error}
        successMessage={`${label} updated on-chain.`}
      />
    </div>
  );
}

interface AddressSetterRowProps extends Omit<StringSetterRowProps, "placeholder"> {}

function AddressSetterRow({
  label,
  contractAddress,
  abi,
  functionName,
  disabled,
}: AddressSetterRowProps) {
  const { isConnected } = useAccount();
  const { openConnectModal } = useConnectModal();
  const action = useContractAction();
  const [value, setValue] = useState("");
  const isValid = isAddress(value);

  const handleSave = async () => {
    if (!isConnected) { openConnectModal?.(); return; }
    if (!isValid) return;
    action.reset();
    await action.execute({ address: contractAddress, abi, functionName, args: [value as `0x${string}`] });
  };

  return (
    <div className="py-3 border-b border-zinc-100 last:border-0">
      <div className="flex items-center gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold text-zinc-700">{label}</p>
        </div>
        <input
          value={value}
          onChange={(e) => { setValue(e.target.value.trim()); action.reset(); }}
          placeholder="0x..."
          maxLength={42}
          className={`w-56 text-xs font-mono border rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-darkAqua/30 focus:border-darkAqua ${
            value && !isValid ? "border-red-300" : "border-zinc-200"
          }`}
          disabled={disabled}
        />
        <Button
          variant="primary"
          size="sm"
          onClick={handleSave}
          disabled={disabled || !isValid || action.isPending || action.isConfirming}
          isLoading={action.isPending || action.isConfirming}
        >
          Save
        </Button>
      </div>
      <TransactionStatus
        isPending={action.isPending}
        isConfirming={action.isConfirming}
        isConfirmed={action.isConfirmed}
        txHash={action.txHash}
        txUrl={action.txUrl}
        error={action.error}
        successMessage={`${label} updated on-chain.`}
      />
    </div>
  );
}

export default function TokenSettingsPage({
  params: paramsPromise,
}: {
  params: Promise<{ id: string }>;
}) {
  const [token, setToken] = useState<Token | null>(null);
  const [loading, setLoading] = useState(true);
  const [resolvedId, setResolvedId] = useState<string>("");

  const { address: walletAddress, isConnected } = useAccount();

  useEffect(() => {
    paramsPromise.then((p) => setResolvedId(p.id));
  }, [paramsPromise]);

  useEffect(() => {
    if (!resolvedId) return;
    (async () => {
      try {
        const data = await getToken(resolvedId, getAccessToken() ?? "");
        setToken(data);
      } catch { /* 404 */ }
      finally { setLoading(false); }
    })();
  }, [resolvedId]);

  const tokenContract = token?.contract_address as `0x${string}` | undefined;

  // Pre-flight: check DEFAULT_ADMIN_ROLE
  const { data: adminCheckData } = useReadContract({
    address: tokenContract,
    abi: CIRETA_TOKEN_ABI as unknown as Abi,
    functionName: "hasRole",
    args:
      tokenContract && walletAddress
        ? [DEFAULT_ADMIN_ROLE, walletAddress]
        : undefined,
    query: { enabled: !!tokenContract && !!walletAddress },
  });
  const isAdmin = adminCheckData === true;

  if (loading) {
    return (
      <IssuerDashboardLayout title="Token Settings">
        <div className="flex justify-center py-24"><Spinner /></div>
      </IssuerDashboardLayout>
    );
  }

  if (!token) {
    return (
      <IssuerDashboardLayout title="Token Settings">
        <p className="text-center text-black/40 py-24">Token not found.</p>
      </IssuerDashboardLayout>
    );
  }

  if (!token.contract_address) {
    return (
      <IssuerDashboardLayout title={`${token.name} — Settings`}>
        <div className="p-4 rounded-lg bg-amber-50 border border-amber-200 text-sm text-amber-700">
          Token has not been deployed on-chain yet. Deploy the token first.
        </div>
      </IssuerDashboardLayout>
    );
  }

  const disabled = !isConnected || isAdmin === false;

  return (
    <IssuerDashboardLayout
      title={`${token.name} — Token Settings`}
      description="DEFAULT_ADMIN_ROLE setters for on-chain token metadata"
    >
      <div className="mb-6">
        <Link
          href={`/issuer/tokens/${resolvedId}`}
          className="inline-flex items-center gap-2 text-sm text-black/50 hover:text-text"
        >
          <ArrowLeft className="h-4 w-4" /> Back to Token
        </Link>
      </div>

      <div className="max-w-2xl">
        {isConnected && isAdmin === false && (
          <div className="flex items-center gap-2 p-3 mb-5 rounded-lg border border-amber-200 bg-amber-50 text-sm text-amber-800">
            <ShieldAlert className="h-4 w-4 flex-shrink-0" />
            Connected wallet does not hold DEFAULT_ADMIN_ROLE on this token — save calls will revert.
          </div>
        )}

        <div className="bg-white rounded-lg border border-zinc-100 overflow-hidden">
          <div className="px-5 py-3 border-b border-zinc-100 bg-zinc-50">
            <h2 className="text-sm font-semibold text-zinc-900">Token Metadata Setters</h2>
            <p className="text-xs text-zinc-400 mt-0.5">
              Requires DEFAULT_ADMIN_ROLE on{" "}
              <code className="font-mono">{token.contract_address}</code>
            </p>
          </div>
          <div className="px-5">
            <StringSetterRow
              label="setName"
              placeholder="New token name"
              contractAddress={token.contract_address as `0x${string}`}
              abi={CIRETA_TOKEN_ABI as unknown as Abi}
              functionName="setName"
              disabled={disabled}
            />
            <StringSetterRow
              label="setSymbol"
              placeholder="New symbol (e.g. CGLD)"
              contractAddress={token.contract_address as `0x${string}`}
              abi={CIRETA_TOKEN_ABI as unknown as Abi}
              functionName="setSymbol"
              disabled={disabled}
            />
            <AddressSetterRow
              label="setIdentityRegistry"
              contractAddress={token.contract_address as `0x${string}`}
              abi={CIRETA_TOKEN_ABI as unknown as Abi}
              functionName="setIdentityRegistry"
              disabled={disabled}
            />
            <AddressSetterRow
              label="setCompliance"
              contractAddress={token.contract_address as `0x${string}`}
              abi={CIRETA_TOKEN_ABI as unknown as Abi}
              functionName="setCompliance"
              disabled={disabled}
            />
            <AddressSetterRow
              label="setOnchainID"
              contractAddress={token.contract_address as `0x${string}`}
              abi={CIRETA_TOKEN_ABI as unknown as Abi}
              functionName="setOnchainID"
              disabled={disabled}
            />
          </div>
        </div>

        <RedemptionPanel
          token={token}
          onUpdated={(updated) => setToken(updated)}
        />
      </div>
    </IssuerDashboardLayout>
  );
}
