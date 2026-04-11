"use client";

import { useState } from "react";
import {
  CheckCircle2, Circle, AlertCircle, Rocket, Shield, Coins,
  ListChecks, Send, Settings, FileText, ChevronDown, ChevronUp,
} from "lucide-react";
import { useAccount, useReadContract } from "wagmi";
import { useConnectModal } from "@rainbow-me/rainbowkit";
import { type Abi } from "viem";
import { Button, Badge } from "@/components/atoms";
import { TransactionStatus } from "@/components/molecules/TransactionStatus";
import { useContractAction } from "@/hooks/useContractAction";
import { isAddress } from "viem";
import { Input } from "@/components/atoms";
import { SIMPLE_IDENTITY_REGISTRY_ABI } from "@/lib/contracts/abis/simpleIdentityRegistry";
import { CIRETA_TOKEN_ABI } from "@/lib/contracts/abis/ciretaToken";
import { SALE_ABI } from "@/lib/contracts/abis/sale";
import { OTC_TOKEN_ABI } from "@/lib/contracts/abis/otcToken";
import { OTC_TOKEN_FACTORY_ABI } from "@/lib/contracts/abis/otcTokenFactory";

/** Read OTC token label for dropdown */
function OTCDropdownOption({ address }: { address: string }) {
  const abi = OTC_TOKEN_ABI as unknown as Abi;
  const addr = address as `0x${string}`;
  const { data: name } = useReadContract({ address: addr, abi, functionName: "name" });
  const { data: symbol } = useReadContract({ address: addr, abi, functionName: "symbol" });
  const masked = `${address.slice(0, 6)}...${address.slice(-4)}`;
  return <option value={address}>{(name as string) || "OTC"} ({(symbol as string) || "?"}) — {masked}</option>;
}

/** Inline OTC token config — dropdown of issuer's deployed OTC tokens */
function OTCInlineConfig({ saleId, saleContractAddress, currentOTCTokenAddress, onSuccess }: {
  saleId: string;
  saleContractAddress: `0x${string}`;
  currentOTCTokenAddress: string | null;
  onSuccess: () => void;
}) {
  const { address: walletAddress } = useAccount();
  const factoryAddr = process.env.NEXT_PUBLIC_OTC_TOKEN_FACTORY_ADDRESS as `0x${string}` | undefined;
  const [selectedAddr, setSelectedAddr] = useState("");
  const [manualAddr, setManualAddr] = useState("");
  const action = useContractAction();
  const isZero = !currentOTCTokenAddress || currentOTCTokenAddress === "0x0000000000000000000000000000000000000000";

  // Read issuer's OTC tokens from factory
  const { data: otcTokenAddrs } = useReadContract({
    address: factoryAddr!,
    abi: OTC_TOKEN_FACTORY_ABI as unknown as Abi,
    functionName: "getIssuerOTCTokens",
    args: walletAddress ? [walletAddress] : undefined,
    query: { enabled: !!factoryAddr && !!walletAddress },
  });
  const otcList = (otcTokenAddrs as string[] | undefined)?.filter(
    (a) => a !== "0x0000000000000000000000000000000000000000"
  ) ?? [];

  const effectiveAddr = selectedAddr === "manual" ? manualAddr : selectedAddr;

  const handleSet = async () => {
    if (!effectiveAddr || !isAddress(effectiveAddr)) return;
    const receipt = await action.execute({
      address: saleContractAddress,
      abi: SALE_ABI as unknown as Abi,
      functionName: "setOTCToken",
      args: [effectiveAddr as `0x${string}`],
    });
    if (receipt) {
      // Sync OTC token address to backend DB
      try {
        await fetch(`/api/proxy/api/v1/sales/${saleId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ otc_token_address: effectiveAddr }),
          credentials: "include",
        });
      } catch { /* on-chain is source of truth */ }
      setSelectedAddr(""); setManualAddr(""); onSuccess();
    }
  };

  return (
    <div className="space-y-3">
      {!isZero && (
        <div className="flex items-center gap-2 text-xs text-zinc-500">
          <span>Current:</span>
          <button onClick={() => navigator.clipboard.writeText(currentOTCTokenAddress!)}
            className="inline-flex items-center gap-1 font-mono bg-zinc-100 hover:bg-zinc-200 px-2 py-0.5 rounded transition-colors cursor-pointer text-[11px]">
            {currentOTCTokenAddress!.slice(0, 6)}...{currentOTCTokenAddress!.slice(-4)}
            <svg className="h-3 w-3 text-zinc-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
          </button>
        </div>
      )}

      {otcList.length > 0 ? (
        <div>
          <label className="block text-xs font-medium text-zinc-600 mb-1">Select OTC Token</label>
          <select value={selectedAddr} onChange={(e) => setSelectedAddr(e.target.value)}
            className="w-full px-3 py-2 rounded-lg border border-zinc-200 text-sm focus:outline-none focus:ring-2 focus:ring-darkAqua/30 bg-white">
            <option value="">Choose an OTC token...</option>
            {otcList.map((addr) => <OTCDropdownOption key={addr} address={addr} />)}
            <option value="manual">Enter address manually...</option>
          </select>
        </div>
      ) : (
        <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-xs text-amber-700">
          No OTC tokens deployed yet. <a href="/issuer/tokens" className="underline font-medium">Deploy one from the Tokens page</a>, then come back to link it.
        </div>
      )}

      {selectedAddr === "manual" && (
        <Input placeholder="OTC token address (0x...)" value={manualAddr} maxLength={42}
          onChange={(e) => setManualAddr(e.target.value)}
          error={manualAddr && !isAddress(manualAddr) ? "Invalid EVM address" : undefined} />
      )}

      {(selectedAddr && selectedAddr !== "") && (
        <Button variant="primary" size="sm" onClick={handleSet}
          disabled={!effectiveAddr || !isAddress(effectiveAddr) || action.isPending || action.isConfirming}
          isLoading={action.isPending || action.isConfirming}>
          {isZero ? "Link OTC Token to Sale" : "Update OTC Token"}
        </Button>
      )}

      <TransactionStatus isPending={action.isPending} isConfirming={action.isConfirming}
        isConfirmed={action.isConfirmed} txHash={action.txHash} txUrl={action.txUrl}
        error={action.error} successMessage="OTC token linked to this sale." />
    </div>
  );
}

interface SaleSetupChecklistProps {
  sale: {
    id: string;
    title: string | null;
    status: string;
    contract_address: string | null;
    token_contract_address: string | null;
    identity_registry_address: string | null;
    token_name: string | null;
    token_symbol: string | null;
    payment_token: string;
    soft_cap: string;
    hard_cap: string;
    sale_mode: string;
    otc_enabled: boolean;
    otc_token_address?: string | null;
    phases: { id: string; name: string; allocation?: string }[];
    description_text: string | null;
    full_description: string | null;
  };
  onReload: () => void;
  onSubmitForApproval: () => void;
  isSubmitting: boolean;
}

interface ChecklistStep {
  id: string;
  label: string;
  description: string;
  icon: typeof Rocket;
  required: boolean;
  completed: boolean;
  actionLabel?: string;
}

export function SaleSetupChecklist({ sale, onReload, onSubmitForApproval, isSubmitting }: SaleSetupChecklistProps) {
  const { isConnected, address: walletAddress } = useAccount();
  const { openConnectModal } = useConnectModal();
  // Platform identity registry fallback
  const irAddress = (sale.identity_registry_address || process.env.NEXT_PUBLIC_IDENTITY_REGISTRY_ADDRESS) as `0x${string}` | undefined;
  const whitelistAction = useContractAction();
  const depositAction = useContractAction();
  const approveTokenAction = useContractAction();
  // Calculate required deposit from total phase allocation
  const totalAllocation = sale.phases.reduce((sum, p) => sum + parseFloat(p.allocation || "0"), 0);
  const [depositAmount, setDepositAmount] = useState("");
  const [expandedStep, setExpandedStep] = useState<string | null>(null);
  const [showReview, setShowReview] = useState(false);

  // Read on-chain phase count
  const { data: onChainPhaseCount } = useReadContract({
    address: sale.contract_address as `0x${string}`,
    abi: SALE_ABI as unknown as Abi,
    functionName: "getPhaseCount",
    query: { enabled: !!sale.contract_address },
  });
  const chainPhases = Number(onChainPhaseCount ?? 0);

  // Read issuer token balance for deposit check
  const { data: issuerTokenBalance } = useReadContract({
    address: sale.token_contract_address as `0x${string}`,
    abi: CIRETA_TOKEN_ABI as unknown as Abi,
    functionName: "balanceOf",
    args: walletAddress ? [walletAddress] : undefined,
    query: { enabled: !!sale.token_contract_address && !!walletAddress },
  });
  const issuerBalance = Number(issuerTokenBalance ?? 0);
  const tokenDecimals = 6; // Cireta tokens use 6 decimals
  const issuerBalanceFormatted = (issuerBalance / 10 ** tokenDecimals).toLocaleString();

  const hasContract = !!sale.contract_address;
  const hasPhases = sale.phases.length > 0 && chainPhases >= sale.phases.length;
  const hasDescription = !!(sale.description_text || sale.full_description);
  const isVested = sale.sale_mode === "vested";

  // Read vault address from sale contract (for vested sales)
  const { data: vaultAddress } = useReadContract({
    address: sale.contract_address as `0x${string}`,
    abi: SALE_ABI as unknown as Abi,
    functionName: "vault",
    query: { enabled: !!sale.contract_address && isVested },
  });

  // Check if tokens are deposited — read project token balance of vault (vested) or sale contract (direct)
  const depositCheckAddress = isVested ? (vaultAddress as string) : sale.contract_address;
  const { data: depositedBalanceRaw } = useReadContract({
    address: sale.token_contract_address as `0x${string}`,
    abi: CIRETA_TOKEN_ABI as unknown as Abi,
    functionName: "balanceOf",
    args: depositCheckAddress ? [depositCheckAddress as `0x${string}`] : undefined,
    query: { enabled: !!sale.token_contract_address && !!depositCheckAddress },
  });
  const tokensDeposited = depositedBalanceRaw ? (depositedBalanceRaw as bigint) > 0n : false;

  // Check on-chain if the sale contract is whitelisted in the identity registry
  const { data: isContractWhitelisted, refetch: refetchWhitelist } = useReadContract({
    address: irAddress!,
    abi: SIMPLE_IDENTITY_REGISTRY_ABI as unknown as Abi,
    functionName: "isVerified",
    args: sale.contract_address ? [sale.contract_address as `0x${string}`] : undefined,
    query: { enabled: !!irAddress && !!sale.contract_address },
  });
  // Also check vault + issuer wallet for vested sales
  const { data: isVaultWhitelisted, refetch: refetchVaultWhitelist } = useReadContract({
    address: irAddress!,
    abi: SIMPLE_IDENTITY_REGISTRY_ABI as unknown as Abi,
    functionName: "isVerified",
    args: vaultAddress ? [vaultAddress as `0x${string}`] : undefined,
    query: { enabled: !!irAddress && !!vaultAddress && isVested },
  });
  const { data: isIssuerWhitelisted, refetch: refetchIssuerWhitelist } = useReadContract({
    address: irAddress!,
    abi: SIMPLE_IDENTITY_REGISTRY_ABI as unknown as Abi,
    functionName: "isVerified",
    args: walletAddress ? [walletAddress as `0x${string}`] : undefined,
    query: { enabled: !!irAddress && !!walletAddress },
  });
  // All required addresses must be whitelisted
  const contractWhitelisted = isContractWhitelisted === true
    && (!isVested || isVaultWhitelisted === true)
    && isIssuerWhitelisted === true;

  const steps: ChecklistStep[] = [
    {
      id: "deploy",
      label: "Deploy Sale Contract",
      description: "Deploy the sale contract on-chain from your wallet.",
      icon: Rocket,
      required: true,
      completed: hasContract,
    },
    {
      id: "whitelist",
      label: "Whitelist Sale Contract",
      description: isVested
        ? "Whitelist the sale contract, vault, and your issuer wallet in the platform identity registry so they can hold and transfer tokens."
        : "Add the sale contract to the platform identity registry so it can receive tokens. All KYC-verified buyers are already whitelisted.",
      icon: Shield,
      required: true,
      completed: contractWhitelisted,
    },
    {
      id: "phases",
      label: "Configure Sale Phases",
      description: "Add at least one phase with price, allocation, and time window.",
      icon: ListChecks,
      required: true,
      completed: hasPhases,
    },
    {
      id: "deposit",
      label: "Deposit Project Tokens",
      description: isVested
        ? "Approve and deposit tokens to the vesting vault."
        : "Transfer project tokens to the sale contract for direct delivery.",
      icon: Coins,
      required: true,
      completed: tokensDeposited,
    },
    {
      id: "content",
      label: "Add Sale Description",
      description: "Write a description so buyers understand the offering.",
      icon: FileText,
      required: false,
      completed: hasDescription,
    },
    {
      id: "otc",
      label: "Configure OTC Token",
      description: "Link an OTC token for off-platform payments.",
      icon: Settings,
      required: false,
      completed: !!sale.otc_token_address || !sale.otc_enabled,
    },
  ];

  const requiredSteps = steps.filter((s) => s.required);
  const optionalSteps = steps.filter((s) => !s.required);
  const requiredDone = requiredSteps.every((s) => s.completed);
  const completedCount = steps.filter((s) => s.completed).length;
  const progress = Math.round((completedCount / steps.length) * 100);

  // Find the first incomplete required step
  const nextStep = requiredSteps.find((s) => !s.completed);

  const requireWallet = () => {
    if (!isConnected) { openConnectModal?.(); return false; }
    return true;
  };

  const handleWhitelist = async () => {
    if (!requireWallet() || !irAddress || !sale.contract_address || !walletAddress) return;

    // Collect all addresses that need whitelisting
    const addresses: `0x${string}`[] = [];
    const countries: number[] = [];

    if (isContractWhitelisted !== true) {
      addresses.push(sale.contract_address as `0x${string}`);
      countries.push(0);
    }
    if (isVested && vaultAddress && isVaultWhitelisted !== true) {
      addresses.push(vaultAddress as `0x${string}`);
      countries.push(0);
    }
    if (isIssuerWhitelisted !== true) {
      addresses.push(walletAddress as `0x${string}`);
      countries.push(784); // UAE default
    }

    if (addresses.length === 0) {
      // All already whitelisted
      refetchWhitelist();
      refetchVaultWhitelist();
      refetchIssuerWhitelist();
      return;
    }

    const receipt = addresses.length === 1
      ? await whitelistAction.execute({
          address: irAddress!,
          abi: SIMPLE_IDENTITY_REGISTRY_ABI as unknown as Abi,
          functionName: "addToWhitelist",
          args: [addresses[0], countries[0]],
        })
      : await whitelistAction.execute({
          address: irAddress!,
          abi: SIMPLE_IDENTITY_REGISTRY_ABI as unknown as Abi,
          functionName: "batchAddToWhitelist",
          args: [addresses, countries],
        });

    if (receipt) {
      refetchWhitelist();
      refetchVaultWhitelist();
      refetchIssuerWhitelist();
      onReload();
    }
  };

  const handleDeposit = async () => {
    const effectiveAmount = depositAmount || (totalAllocation > 0 ? totalAllocation.toString() : "");
    if (!requireWallet() || !sale.token_contract_address || !sale.contract_address || !effectiveAmount) return;
    if (!depositAmount) setDepositAmount(effectiveAmount);
    const amount = BigInt(Math.round(parseFloat(effectiveAmount) * 1e6));

    if (isVested) {
      // Approve then deposit — only proceed to deposit if approve succeeds
      const approveReceipt = await approveTokenAction.execute({
        address: sale.token_contract_address as `0x${string}`,
        abi: CIRETA_TOKEN_ABI as unknown as Abi,
        functionName: "approve",
        args: [sale.contract_address as `0x${string}`, amount],
      });
      if (!approveReceipt) return; // Approve failed or rejected
      const receipt = await depositAction.execute({
        address: sale.contract_address as `0x${string}`,
        abi: SALE_ABI as unknown as Abi,
        functionName: "depositProjectTokens",
        args: [amount],
      });
      if (receipt) onReload();
    } else {
      // Direct transfer
      const receipt = await depositAction.execute({
        address: sale.token_contract_address as `0x${string}`,
        abi: CIRETA_TOKEN_ABI as unknown as Abi,
        functionName: "transfer",
        args: [sale.contract_address as `0x${string}`, amount],
      });
      if (receipt) onReload();
    }
  };

  // If sale is already deployed and submitted, don't show setup
  if (sale.status !== "draft" && sale.status !== "rejected") return null;
  if (!hasContract) return null; // Deploy button is handled elsewhere

  return (
    <div className="bg-white rounded-lg border border-zinc-100 overflow-hidden mb-6">
      {/* Header with progress */}
      <div className="px-6 py-4 border-b border-zinc-100">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h3 className="font-semibold text-zinc-900">Sale Setup</h3>
            <p className="text-xs text-zinc-400 mt-0.5">Complete these steps before submitting for approval</p>
          </div>
          <span className="text-xs font-medium text-zinc-500">{completedCount}/{steps.length} complete</span>
        </div>
        <div className="h-2 bg-zinc-100 rounded-md overflow-hidden">
          <div className="h-full bg-darkAqua rounded-md transition-all duration-500" style={{ width: `${progress}%` }} />
        </div>
      </div>

      {/* Steps */}
      <div className="divide-y divide-zinc-50">
        {/* Required steps */}
        <div className="px-6 py-3">
          <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider mb-2">Required</p>
          {requiredSteps.map((step) => {
            const isExpanded = expandedStep === step.id;
            const isNext = nextStep?.id === step.id;
            const StepIcon = step.icon;

            return (
              <div key={step.id} className={`rounded-lg mb-2 transition-all ${
                step.completed ? "bg-green-50/50" : isNext ? "bg-darkAqua/5 border border-darkAqua/20" : "bg-zinc-50"
              }`}>
                <button onClick={() => setExpandedStep(isExpanded ? null : step.id)}
                  className="w-full flex items-center gap-3 p-3 text-left">
                  <div className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 ${
                    step.completed ? "bg-green-100 text-green-600" : isNext ? "bg-darkAqua/20 text-darkAqua" : "bg-zinc-200 text-zinc-400"
                  }`}>
                    {step.completed ? <CheckCircle2 className="h-4 w-4" /> : <StepIcon className="h-3.5 w-3.5" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-medium ${step.completed ? "text-green-700" : "text-zinc-900"}`}>{step.label}</p>
                    <p className="text-xs text-zinc-400">{step.description}</p>
                  </div>
                  {!step.completed && (
                    isExpanded ? <ChevronUp className="h-4 w-4 text-zinc-400" /> : <ChevronDown className="h-4 w-4 text-zinc-400" />
                  )}
                  {step.completed && <Badge variant="success" size="sm">Done</Badge>}
                </button>

                {/* Expanded action area */}
                {isExpanded && !step.completed && (
                  <div className="px-3 pb-3 ml-10">
                    {step.id === "whitelist" && (
                      <div>
                        <div className="flex items-center gap-2 text-xs text-zinc-500 mb-2">
                          <span>Sale contract:</span>
                          <button
                            onClick={() => sale.contract_address && navigator.clipboard.writeText(sale.contract_address)}
                            title="Click to copy full address"
                            className="inline-flex items-center gap-1 font-mono bg-zinc-100 hover:bg-zinc-200 px-2 py-0.5 rounded transition-colors text-[11px] cursor-pointer"
                          >
                            {sale.contract_address?.slice(0, 6)}...{sale.contract_address?.slice(-4)}
                            <svg className="h-3 w-3 text-zinc-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
                          </button>
                        </div>
                        <Button variant="primary" size="sm" onClick={handleWhitelist}
                          disabled={whitelistAction.isPending || whitelistAction.isConfirming}
                          isLoading={whitelistAction.isPending || whitelistAction.isConfirming}>
                          <Shield className="h-3.5 w-3.5 mr-1.5" /> Whitelist Contract
                        </Button>
                        <TransactionStatus isPending={whitelistAction.isPending} isConfirming={whitelistAction.isConfirming}
                          isConfirmed={whitelistAction.isConfirmed} txHash={whitelistAction.txHash} txUrl={whitelistAction.txUrl}
                          error={whitelistAction.error} successMessage="Contract whitelisted." />
                      </div>
                    )}

                    {step.id === "phases" && (
                      <div>
                        <p className="text-xs text-zinc-500 mb-2">
                          <span className="font-semibold">{chainPhases}</span> of <span className="font-semibold">{sale.phases.length}</span> phase{sale.phases.length !== 1 ? "s" : ""} deployed on-chain.
                          {sale.phases.length === 0 && " Add phases in the sale detail section below."}
                        </p>
                        {sale.phases.length > chainPhases && (
                          <p className="text-xs text-amber-600">Use the "Deploy On-Chain" buttons in the Phases section below to sync.</p>
                        )}
                        {chainPhases >= sale.phases.length && sale.phases.length > 0 && (
                          <p className="text-xs text-green-600 font-medium">All phases deployed on-chain.</p>
                        )}
                      </div>
                    )}

                    {step.id === "deposit" && (
                      <div>
                        {totalAllocation > 0 && (
                          <div className="bg-blue-50 border border-blue-200 rounded-lg px-3 py-2 mb-3 text-xs text-blue-700">
                            Required: <span className="font-bold">{totalAllocation.toLocaleString()} {sale.token_symbol || "tokens"}</span> (total allocation across {sale.phases.length} phase{sale.phases.length > 1 ? "s" : ""})
                          </div>
                        )}
                        <div className="mb-3 text-xs">
                          Your balance: <span className="font-semibold">{issuerBalanceFormatted} {sale.token_symbol || "tokens"}</span>
                          {totalAllocation > 0 && issuerBalance / 10 ** tokenDecimals < totalAllocation && (
                            <span className="text-red-500 ml-2">Insufficient — mint more tokens first.</span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 mb-2">
                          <input type="number" value={depositAmount || (totalAllocation > 0 ? totalAllocation.toString() : "")}
                            onChange={(e) => setDepositAmount(e.target.value)}
                            placeholder={`Amount (${sale.token_symbol || "tokens"})`}
                            className="px-3 py-2 rounded-lg border border-zinc-200 text-sm w-48 focus:outline-none focus:ring-2 focus:ring-darkAqua/30" />
                          <Button variant="primary" size="sm" onClick={handleDeposit}
                            disabled={(!depositAmount && totalAllocation === 0) || depositAction.isPending || depositAction.isConfirming || approveTokenAction.isPending}
                            isLoading={depositAction.isPending || depositAction.isConfirming || approveTokenAction.isPending}>
                            <Coins className="h-3.5 w-3.5 mr-1.5" /> {isVested ? "Approve & Deposit" : "Transfer Tokens"}
                          </Button>
                        </div>
                        <TransactionStatus isPending={approveTokenAction.isPending || depositAction.isPending}
                          isConfirming={approveTokenAction.isConfirming || depositAction.isConfirming}
                          isConfirmed={depositAction.isConfirmed} txHash={depositAction.txHash || approveTokenAction.txHash}
                          txUrl={depositAction.txUrl || approveTokenAction.txUrl}
                          error={depositAction.error || approveTokenAction.error} successMessage="Tokens deposited." />
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Optional steps */}
        <div className="px-6 py-3">
          <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider mb-2">Optional</p>
          {optionalSteps.map((step) => {
            const StepIcon = step.icon;
            const isExpanded = expandedStep === step.id;
            return (
              <div key={step.id} className={`rounded-lg mb-2 transition-all ${
                step.completed ? "bg-green-50/50" : "bg-zinc-50"
              }`}>
                <button onClick={() => setExpandedStep(isExpanded ? null : step.id)}
                  className="w-full flex items-center gap-3 p-3 text-left">
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 ${
                    step.completed ? "bg-green-100 text-green-600" : "bg-zinc-100 text-zinc-400"
                  }`}>
                    {step.completed ? <CheckCircle2 className="h-3.5 w-3.5" /> : <StepIcon className="h-3 w-3" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={`text-xs font-medium ${step.completed ? "text-green-700" : "text-zinc-600"}`}>{step.label}</p>
                    <p className="text-[11px] text-zinc-400">{step.description}</p>
                  </div>
                  {step.completed ? (
                    <span className="text-[10px] text-green-600">Done</span>
                  ) : (
                    isExpanded ? <ChevronUp className="h-4 w-4 text-zinc-400" /> : <ChevronDown className="h-4 w-4 text-zinc-400" />
                  )}
                </button>

                {/* OTC config inline */}
                {isExpanded && step.id === "otc" && sale.contract_address && (
                  <div className="px-3 pb-3 ml-9">
                    <OTCInlineConfig
                      saleId={sale.id}
                      saleContractAddress={sale.contract_address as `0x${string}`}
                      currentOTCTokenAddress={sale.otc_token_address ?? null}
                      onSuccess={onReload}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Submit for Approval */}
      <div className="px-6 py-4 bg-zinc-50 border-t border-zinc-100">
        {requiredDone ? (
          <div>
            {!showReview ? (
              <Button variant="primary" onClick={() => setShowReview(true)} className="w-full">
                <Send className="h-4 w-4 mr-2" /> Review & Submit for Approval
              </Button>
            ) : (
              <div className="space-y-4">
                <h4 className="font-semibold text-sm text-zinc-900">Review Before Submitting</h4>

                {/* Summary */}
                <div className="bg-white rounded-lg border border-zinc-200 p-4 text-sm space-y-2">
                  <div className="flex justify-between"><span className="text-zinc-500">Title</span><span className="font-medium">{sale.title || "Untitled"}</span></div>
                  <div className="flex justify-between"><span className="text-zinc-500">Token</span><span className="font-medium">{sale.token_name} ({sale.token_symbol})</span></div>
                  <div className="flex justify-between"><span className="text-zinc-500">Mode</span><span className="font-medium capitalize">{sale.sale_mode}</span></div>
                  <div className="flex justify-between"><span className="text-zinc-500">Soft Cap</span><span className="font-medium">{parseFloat(sale.soft_cap).toLocaleString()} USDC</span></div>
                  <div className="flex justify-between"><span className="text-zinc-500">Hard Cap</span><span className="font-medium">{parseFloat(sale.hard_cap).toLocaleString()} USDC</span></div>
                  <div className="flex justify-between"><span className="text-zinc-500">Phases</span><span className="font-medium">{sale.phases.length} configured</span></div>
                  <div className="flex justify-between items-center"><span className="text-zinc-500">Contract</span>
                    <button onClick={() => sale.contract_address && navigator.clipboard.writeText(sale.contract_address)} title="Copy" className="inline-flex items-center gap-1 font-mono text-xs bg-zinc-100 hover:bg-zinc-200 px-2 py-0.5 rounded transition-colors cursor-pointer">
                      {sale.contract_address?.slice(0, 6)}...{sale.contract_address?.slice(-4)}
                      <svg className="h-3 w-3 text-zinc-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
                    </button>
                  </div>
                  <div className="flex justify-between"><span className="text-zinc-500">OTC</span><span className="font-medium">{sale.otc_enabled ? "Enabled" : "Disabled"}</span></div>
                </div>

                {/* Checklist recap */}
                <div className="bg-white rounded-lg border border-zinc-200 p-4">
                  <p className="text-xs font-semibold text-zinc-700 mb-2">Checklist Status</p>
                  <div className="space-y-1">
                    {steps.map((s) => (
                      <div key={s.id} className="flex items-center gap-2 text-xs">
                        {s.completed ? <CheckCircle2 className="h-3 w-3 text-green-600" /> : <Circle className="h-3 w-3 text-zinc-300" />}
                        <span className={s.completed ? "text-green-700" : "text-zinc-400"}>{s.label}</span>
                        {!s.required && <span className="text-zinc-300 ml-auto">optional</span>}
                      </div>
                    ))}
                  </div>
                </div>

                <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-700">
                  <AlertCircle className="h-3.5 w-3.5 inline mr-1" />
                  Once submitted, the admin will review and approve to make this sale visible on the launchpad. The admin will then activate it on-chain to allow purchases.
                </div>

                <div className="flex items-center justify-center gap-4">
                  <Button variant="outline" size="sm" onClick={() => setShowReview(false)}>Cancel</Button>
                  <Button variant="primary" size="sm" onClick={onSubmitForApproval} isLoading={isSubmitting}>
                    <Send className="h-3.5 w-3.5 mr-1.5" /> Submit for Approval
                  </Button>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="text-center">
            <p className="text-xs text-zinc-400 mb-2">Complete all required steps to submit for approval</p>
            <Button variant="primary" disabled className="w-full opacity-50">
              <Send className="h-4 w-4 mr-2" /> Submit for Approval
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
