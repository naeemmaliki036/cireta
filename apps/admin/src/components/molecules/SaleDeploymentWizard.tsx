"use client";

import { useState } from "react";
import { CheckCircle2, AlertCircle, Rocket, Shield, Coins } from "lucide-react";
import { useAccount } from "wagmi";
import { useConnectModal } from "@rainbow-me/rainbowkit";
import { encodeFunctionData, type Abi } from "viem";
import { Button } from "@/components/atoms";
import { TransactionStatus } from "@/components/molecules/TransactionStatus";
import { useContractAction } from "@/hooks/useContractAction";
import { SALE_ABI } from "@/lib/contracts/abis/sale";
import { SALE_FACTORY_ABI } from "@/lib/contracts/abis/saleFactory";
import { SIMPLE_IDENTITY_REGISTRY_ABI } from "@/lib/contracts/abis/simpleIdentityRegistry";
import { requireAddress } from "@/lib/contracts/addresses";

// ERC20 approve ABI
const ERC20_ABI = [
  { name: "approve", type: "function", stateMutability: "nonpayable", inputs: [{ name: "spender", type: "address" }, { name: "amount", type: "uint256" }], outputs: [{ name: "", type: "bool" }] },
  { name: "balanceOf", type: "function", stateMutability: "view", inputs: [{ name: "account", type: "address" }], outputs: [{ name: "", type: "uint256" }] },
  { name: "transfer", type: "function", stateMutability: "nonpayable", inputs: [{ name: "to", type: "address" }, { name: "amount", type: "uint256" }], outputs: [{ name: "", type: "bool" }] },
] as const;

interface SaleDeploymentWizardProps {
  sale: {
    id: string;
    title: string | null;
    token_name: string | null;
    token_symbol: string | null;
    token_contract_address: string | null;
    identity_registry_address: string | null;
    contract_address: string | null;
    payment_token: string;
    soft_cap: string;
    hard_cap: string;
    sale_mode: string;
    otc_token_address?: string | null;
  };
  onComplete: () => void;
}

type StepStatus = "pending" | "active" | "done" | "error";

interface Step {
  id: string;
  label: string;
  description: string;
  icon: typeof Rocket;
}

const DIRECT_STEPS: Step[] = [
  { id: "deploy", label: "Deploy Sale Contract", description: "Deploy the sale contract on-chain via SaleFactory", icon: Rocket },
  { id: "whitelist", label: "Whitelist Sale Contract", description: "Add sale address to identity registry so it can receive tokens", icon: Shield },
  { id: "deposit", label: "Deposit Project Tokens", description: "Transfer project tokens to the sale contract for direct delivery", icon: Coins },
];

const VESTED_STEPS: Step[] = [
  { id: "deploy", label: "Deploy Vested Sale", description: "Deploy sale + vault + fraction token via SaleFactory", icon: Rocket },
  { id: "whitelist", label: "Whitelist Contracts", description: "Add sale, vault, and fraction token to identity registry", icon: Shield },
  { id: "deposit", label: "Deposit Project Tokens", description: "Deposit tokens to vault for vesting", icon: Coins },
];

export function SaleDeploymentWizard({ sale, onComplete }: SaleDeploymentWizardProps) {
  const { isConnected, address: walletAddress } = useAccount();
  const { openConnectModal } = useConnectModal();
  const deployAction = useContractAction();
  const whitelistAction = useContractAction();
  const approveAction = useContractAction();
  const depositAction = useContractAction();

  const [saleAddress, setSaleAddress] = useState(sale.contract_address || "");
  const [vaultAddress] = useState("");
  const [fractionAddress] = useState("");
  const [depositAmount, setDepositAmount] = useState("");
  const [completedSteps, setCompletedSteps] = useState<Set<string>>(new Set(sale.contract_address ? ["deploy"] : []));
  const [error, setError] = useState("");

  const isVested = sale.sale_mode === "vested";
  const steps = isVested ? VESTED_STEPS : DIRECT_STEPS;

  const getStepStatus = (stepId: string): StepStatus => {
    if (completedSteps.has(stepId)) return "done";
    const idx = steps.findIndex(s => s.id === stepId);
    const prevDone = idx === 0 || completedSteps.has(steps[idx - 1]!.id);
    if (prevDone) return "active";
    return "pending";
  };

  const requireWallet = () => {
    if (!isConnected) { openConnectModal?.(); return false; }
    return true;
  };

  // Step 1: Deploy
  const handleDeploy = async () => {
    if (!requireWallet() || !sale.token_contract_address || !sale.identity_registry_address) return;
    setError("");

    const feeManagerAddr = requireAddress("platformFeeManager");
    const saleFactoryAddr = requireAddress("saleFactory");
    const otcAddr = sale.otc_token_address || "0x0000000000000000000000000000000000000000";

    const initData = encodeFunctionData({
      abi: SALE_ABI as unknown as Abi,
      functionName: "initialize",
      args: [
        sale.token_contract_address as `0x${string}`,
        sale.payment_token as `0x${string}`,
        sale.identity_registry_address as `0x${string}`,
        walletAddress as `0x${string}`, // issuer = connected wallet
        saleFactoryAddr as `0x${string}`,
        feeManagerAddr as `0x${string}`,
        BigInt(Math.round(parseFloat(sale.soft_cap) * 1e6)),
        BigInt(Math.round(parseFloat(sale.hard_cap) * 1e6)),
        200n, // feeBps
        0n,   // feeCap
        otcAddr as `0x${string}`,
      ],
    });

    try {
      const receipt = await deployAction.execute({
        address: saleFactoryAddr as `0x${string}`,
        abi: SALE_FACTORY_ABI as unknown as Abi,
        functionName: "deploySale",
        args: [sale.token_contract_address as `0x${string}`, initData],
        gas: 5_000_000n,
      });

      if (receipt) {
        // Parse SaleDeployed event to get sale address
        for (const log of receipt.logs) {
          try {
            // SaleDeployed topic0
            if (log.topics[0] && log.topics[1]) {
              const addr = "0x" + log.topics[1].slice(26);
              setSaleAddress(addr);
              break;
            }
          } catch { /* skip */ }
        }
        setCompletedSteps(prev => new Set([...prev, "deploy"]));
        // Record in backend
        try {
          const { apiFetch } = await import("@/lib/api/client");
          await apiFetch(`/api/v1/sales/${sale.id}/record-deployment`, {
            method: "POST",
            body: { contract_address: saleAddress, tx_hash: receipt.transactionHash },
          });
        } catch { /* non-fatal */ }
      }
    } catch (e: any) {
      setError(e.message?.slice(0, 100) || "Deploy failed");
    }
  };

  // Step 2: Whitelist
  const handleWhitelist = async () => {
    if (!requireWallet() || !sale.identity_registry_address || !saleAddress) return;
    setError("");

    const addresses = [saleAddress];
    if (vaultAddress) addresses.push(vaultAddress);
    if (fractionAddress) addresses.push(fractionAddress);

    const countries = addresses.map(() => 0); // country 0 for contracts

    try {
      if (addresses.length === 1) {
        await whitelistAction.execute({
          address: sale.identity_registry_address as `0x${string}`,
          abi: SIMPLE_IDENTITY_REGISTRY_ABI as unknown as Abi,
          functionName: "addToWhitelist",
          args: [saleAddress as `0x${string}`, 0],
        });
      } else {
        await whitelistAction.execute({
          address: sale.identity_registry_address as `0x${string}`,
          abi: SIMPLE_IDENTITY_REGISTRY_ABI as unknown as Abi,
          functionName: "batchAddToWhitelist",
          args: [addresses as `0x${string}`[], countries],
        });
      }
      setCompletedSteps(prev => new Set([...prev, "whitelist"]));
    } catch (e: any) {
      setError(e.message?.slice(0, 100) || "Whitelist failed");
    }
  };

  // Step 3: Deposit tokens
  const handleDeposit = async () => {
    if (!requireWallet() || !sale.token_contract_address || !saleAddress || !depositAmount) return;
    setError("");

    const amount = BigInt(Math.round(parseFloat(depositAmount) * 1e6));

    try {
      if (isVested) {
        // Vested: approve sale then call depositProjectTokens
        await approveAction.execute({
          address: sale.token_contract_address as `0x${string}`,
          abi: ERC20_ABI as unknown as Abi,
          functionName: "approve",
          args: [saleAddress as `0x${string}`, amount],
        });

        await depositAction.execute({
          address: saleAddress as `0x${string}`,
          abi: SALE_ABI as unknown as Abi,
          functionName: "depositProjectTokens",
          args: [amount],
        });
      } else {
        // Direct: simple token transfer to sale
        await depositAction.execute({
          address: sale.token_contract_address as `0x${string}`,
          abi: ERC20_ABI as unknown as Abi,
          functionName: "transfer",
          args: [saleAddress as `0x${string}`, amount],
        });
      }
      setCompletedSteps(prev => new Set([...prev, "deposit"]));
      onComplete();
    } catch (e: any) {
      setError(e.message?.slice(0, 100) || "Deposit failed");
    }
  };

  const allDone = steps.every(s => completedSteps.has(s.id));

  return (
    <div className="bg-white rounded-lg border border-zinc-100 p-6 space-y-5">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-zinc-900">On-Chain Deployment</h3>
        {allDone && <span className="text-xs font-medium text-green-600 bg-green-50 px-3 py-1 rounded-md">Ready for activation</span>}
      </div>

      {error && (
        <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-600 flex items-center gap-2">
          <AlertCircle className="h-4 w-4 flex-shrink-0" /> {error}
        </div>
      )}

      <div className="space-y-3">
        {steps.map((step) => {
          const status = getStepStatus(step.id);

          return (
            <div key={step.id} className={`p-4 rounded-lg border transition-colors ${
              status === "done" ? "bg-green-50 border-green-200" :
              status === "active" ? "bg-white border-darkAqua/30" :
              "bg-zinc-50 border-zinc-100 opacity-60"
            }`}>
              <div className="flex items-start gap-3">
                <div className={`w-8 h-8 rounded-md flex items-center justify-center flex-shrink-0 ${
                  status === "done" ? "bg-green-100 text-green-600" :
                  status === "active" ? "bg-darkAqua/10 text-darkAqua" :
                  "bg-zinc-100 text-zinc-400"
                }`}>
                  {status === "done" ? <CheckCircle2 className="h-4 w-4" /> : <step.icon className="h-4 w-4" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-zinc-900">{step.label}</p>
                  <p className="text-xs text-zinc-500 mt-0.5">{step.description}</p>

                  {/* Step-specific UI */}
                  {status === "active" && step.id === "deploy" && (
                    <div className="mt-3">
                      <Button variant="primary" size="sm" onClick={handleDeploy}
                        disabled={deployAction.isPending || deployAction.isConfirming}
                        isLoading={deployAction.isPending || deployAction.isConfirming}>
                        <Rocket className="h-3.5 w-3.5 mr-1.5" /> Deploy
                      </Button>
                      <TransactionStatus isPending={deployAction.isPending} isConfirming={deployAction.isConfirming} isConfirmed={deployAction.isConfirmed} txHash={deployAction.txHash} txUrl={deployAction.txUrl} error={deployAction.error} />
                    </div>
                  )}

                  {status === "active" && step.id === "whitelist" && (
                    <div className="mt-3">
                      <p className="text-xs text-zinc-400 mb-2 font-mono">{saleAddress}{vaultAddress && ` + ${vaultAddress.slice(0, 10)}...`}</p>
                      <Button variant="primary" size="sm" onClick={handleWhitelist}
                        disabled={whitelistAction.isPending || whitelistAction.isConfirming}
                        isLoading={whitelistAction.isPending || whitelistAction.isConfirming}>
                        <Shield className="h-3.5 w-3.5 mr-1.5" /> Whitelist Contracts
                      </Button>
                      <TransactionStatus isPending={whitelistAction.isPending} isConfirming={whitelistAction.isConfirming} isConfirmed={whitelistAction.isConfirmed} txHash={whitelistAction.txHash} txUrl={whitelistAction.txUrl} error={whitelistAction.error} />
                    </div>
                  )}

                  {status === "active" && step.id === "deposit" && (
                    <div className="mt-3">
                      <div className="flex items-center gap-2 mb-2">
                        <input
                          type="number"
                          value={depositAmount}
                          onChange={(e) => setDepositAmount(e.target.value)}
                          placeholder={`Amount (${sale.token_symbol || "tokens"})`}
                          className="px-3 py-2 rounded-lg border border-zinc-200 text-sm w-48 focus:outline-none focus:ring-2 focus:ring-darkAqua/30"
                        />
                        <Button variant="primary" size="sm" onClick={handleDeposit}
                          disabled={!depositAmount || depositAction.isPending || depositAction.isConfirming || approveAction.isPending}
                          isLoading={depositAction.isPending || depositAction.isConfirming || approveAction.isPending}>
                          <Coins className="h-3.5 w-3.5 mr-1.5" /> {isVested ? "Approve & Deposit" : "Transfer Tokens"}
                        </Button>
                      </div>
                      <TransactionStatus isPending={approveAction.isPending || depositAction.isPending} isConfirming={approveAction.isConfirming || depositAction.isConfirming} isConfirmed={depositAction.isConfirmed} txHash={depositAction.txHash || approveAction.txHash} txUrl={depositAction.txUrl || approveAction.txUrl} error={depositAction.error || approveAction.error} />
                    </div>
                  )}

                  {status === "done" && step.id === "deploy" && saleAddress && (
                    <p className="text-xs font-mono text-green-600 mt-1">{saleAddress}</p>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {allDone && (
        <div className="p-4 rounded-lg bg-green-50 border border-green-200 text-sm text-green-700">
          <p className="font-semibold">All steps complete</p>
          <p className="text-xs mt-1">The sale is deployed, whitelisted, and funded. Waiting for admin to activate on-chain.</p>
        </div>
      )}
    </div>
  );
}
