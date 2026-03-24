"use client";

import { useState } from "react";
import { Shield, AlertCircle, CheckCircle2, Wallet } from "lucide-react";
import { Button, Badge } from "@/components/atoms";
import { formatCurrency } from "@/lib/utils";
import type { Project, ProjectPhase } from "@/lib/api/repositories/projects.repository";

// Minimal ERC-20 ABI for approve
export const ERC20_APPROVE_ABI = [
  {
    name: "approve",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
] as const;

export type InvestStep = "amount" | "approve" | "confirm" | "success";

interface SummaryRowProps {
  label: string;
  value: React.ReactNode;
}

export function SummaryRow({ label, value }: SummaryRowProps) {
  return (
    <div className="flex justify-between text-sm">
      <span className="text-darkBlack/50">{label}</span>
      <span className="font-semibold">{value}</span>
    </div>
  );
}

interface InvestAmountStepProps {
  project: Project;
  activePhase: ProjectPhase | null;
  amount: string;
  onAmountChange: (v: string) => void;
  onContinue: () => void;
  isConnected: boolean;
  onConnect: () => void;
}

const QUICK_AMOUNTS = [500, 1000, 5000, 10000];

export function InvestAmountStep({
  project,
  activePhase,
  amount,
  onAmountChange,
  onContinue,
  isConnected,
  onConnect,
}: InvestAmountStepProps) {
  const numericAmount = parseFloat(amount) || 0;
  const pricePerToken = activePhase ? parseFloat(activePhase.price_per_token) : 0;
  const minContrib = activePhase ? parseFloat(activePhase.min_contribution) : 0;
  const maxContrib = activePhase ? parseFloat(activePhase.max_contribution) || Infinity : Infinity;
  const tokensToReceive = pricePerToken > 0 ? numericAmount / pricePerToken : 0;

  // Inline validation error
  let validationError: string | null = null;
  if (numericAmount > 0 && numericAmount < minContrib) {
    validationError = `Minimum contribution is ${formatCurrency(minContrib)}`;
  } else if (numericAmount > 0 && numericAmount > maxContrib) {
    validationError = `Maximum contribution is ${formatCurrency(maxContrib)}`;
  }

  if (!isConnected) {
    return (
      <div className="text-center py-8">
        <div className="w-20 h-20 rounded-full bg-darkAqua/10 flex items-center justify-center mx-auto mb-6">
          <Wallet className="w-10 h-10 text-darkAqua" />
        </div>
        <h1 className="text-2xl font-semibold text-text mb-2">Connect Your Wallet</h1>
        <p className="text-darkBlack/50 mb-8">You need to connect your wallet before investing</p>
        <Button variant="primary" className="w-full" size="lg" onClick={onConnect}>
          Connect Wallet
        </Button>
      </div>
    );
  }

  return (
    <>
      <h1 className="text-2xl font-semibold text-text mb-2">Invest in {project.title}</h1>
      <p className="text-darkBlack/50 mb-8">Enter the amount you wish to invest in USDC</p>
      <div className="mb-6">
        <label className="block text-sm font-semibold text-text mb-2">Investment Amount (USDC)</label>
        <div className="relative">
          <input
            type="number"
            value={amount}
            onChange={(e) => onAmountChange(e.target.value)}
            placeholder="0.00"
            className="input-field text-2xl font-semibold pr-20"
          />
          <span className="absolute right-4 top-1/2 -translate-y-1/2 text-darkBlack/40 font-semibold">USDC</span>
        </div>
        <div className="flex gap-2 mt-3">
          {QUICK_AMOUNTS.map((v) => (
            <button
              key={v}
              onClick={() => onAmountChange(v.toString())}
              className="flex-1 py-2 text-sm font-medium text-darkAqua bg-darkAqua/10 rounded-lg hover:bg-darkAqua/20 transition-colors"
            >
              ${v.toLocaleString()}
            </button>
          ))}
        </div>
      </div>
      {validationError && (
        <div className="p-3 rounded-lg bg-red-50 border border-red-200 mb-4 flex gap-2 items-center">
          <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0" />
          <p className="text-sm text-red-600">{validationError}</p>
        </div>
      )}
      {numericAmount > 0 && !validationError && (
        <div className="bg-box rounded-xl p-4 space-y-3 mb-6">
          <SummaryRow label="You Pay" value={formatCurrency(numericAmount)} />
          <SummaryRow
            label="You Receive"
            value={`${tokensToReceive.toLocaleString(undefined, { maximumFractionDigits: 4 })} ${project.tokenSymbol}`}
          />
          <SummaryRow label="Price per Token" value={formatCurrency(pricePerToken)} />
        </div>
      )}
      <p className="text-xs text-darkBlack/40 mb-6">
        Min: {formatCurrency(minContrib)} &bull; Max:{" "}
        {isFinite(maxContrib) ? formatCurrency(maxContrib) : "Unlimited"}
      </p>
      <Button
        variant="primary"
        className="w-full"
        size="lg"
        disabled={numericAmount <= 0 || numericAmount < minContrib || numericAmount > maxContrib || !activePhase}
        onClick={onContinue}
      >
        Continue
      </Button>
    </>
  );
}

interface InvestApproveStepProps {
  amount: number;
  isLoading: boolean;
  error: string | null;
  onApprove: () => void;
}

export function InvestApproveStep({ amount, isLoading, error, onApprove }: InvestApproveStepProps) {
  const [riskAcknowledged, setRiskAcknowledged] = useState(false);
  const [jurisdictionConfirmed, setJurisdictionConfirmed] = useState(false);

  const complianceMet = riskAcknowledged && jurisdictionConfirmed;

  return (
    <>
      <h1 className="text-2xl font-semibold text-text mb-2">Approve USDC</h1>
      <p className="text-darkBlack/50 mb-8">Allow the smart contract to spend your USDC</p>
      <div className="bg-box rounded-xl p-6 mb-6 text-center">
        <Shield className="h-12 w-12 text-darkAqua mx-auto mb-4" />
        <p className="font-semibold text-text mb-2">Approve {formatCurrency(amount)} USDC</p>
        <p className="text-sm text-darkBlack/50">This is a one-time approval for this investment</p>
      </div>

      {/* Compliance acknowledgment */}
      <div className="bg-box rounded-xl p-5 mb-6 space-y-4">
        <p className="text-sm text-darkBlack/70 font-medium">
          This investment involves regulated securities. You acknowledge that security tokens are subject to
          transfer restrictions, lock-up periods, and regulatory requirements. Returns are not guaranteed and
          you may lose your entire investment.
        </p>
        <label className="flex items-start gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={riskAcknowledged}
            onChange={(e) => setRiskAcknowledged(e.target.checked)}
            className="mt-0.5 w-4 h-4 rounded border-darkBlack/20 text-darkAqua focus:ring-darkAqua"
            data-testid="risk-checkbox"
          />
          <span className="text-sm text-text">
            I understand and accept the risks associated with this investment
          </span>
        </label>
        <label className="flex items-start gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={jurisdictionConfirmed}
            onChange={(e) => setJurisdictionConfirmed(e.target.checked)}
            className="mt-0.5 w-4 h-4 rounded border-darkBlack/20 text-darkAqua focus:ring-darkAqua"
            data-testid="jurisdiction-checkbox"
          />
          <span className="text-sm text-text">
            I confirm I am not a resident of a restricted jurisdiction
          </span>
        </label>
      </div>

      <div className="p-4 rounded-xl bg-gold/10 border border-gold/30 flex gap-3 mb-6">
        <AlertCircle className="w-5 h-5 text-gold flex-shrink-0" />
        <p className="text-sm text-darkBlack/60">You will need to confirm this transaction in your wallet</p>
      </div>
      {error && <p className="text-sm text-red-500 mb-4">{error}</p>}
      <Button variant="primary" className="w-full" size="lg" onClick={onApprove} isLoading={isLoading} disabled={!complianceMet || isLoading}>
        {isLoading ? "Approving..." : "Approve USDC"}
      </Button>
    </>
  );
}

interface InvestConfirmStepProps {
  project: Project;
  amount: number;
  tokensToReceive: number;
  isLoading: boolean;
  error: string | null;
  isSafe?: boolean;
  onConfirm: () => void;
}

export function InvestConfirmStep({
  project,
  amount,
  tokensToReceive,
  isLoading,
  error,
  isSafe = false,
  onConfirm,
}: InvestConfirmStepProps) {
  return (
    <>
      <h1 className="text-2xl font-semibold text-text mb-2">Confirm Investment</h1>
      <p className="text-darkBlack/50 mb-8">Review and confirm your investment details</p>
      <div className="bg-box rounded-xl p-6 space-y-4 mb-6">
        <SummaryRow label="Project" value={project.title} />
        <SummaryRow label="Amount" value={formatCurrency(amount)} />
        <SummaryRow label="Tokens" value={`${tokensToReceive.toLocaleString()} ${project.tokenSymbol}`} />
        <div className="pt-4 border-t border-darkBlack/10">
          <SummaryRow label="Network Fee" value="~$0.10" />
        </div>
      </div>
      {error && <p className="text-sm text-red-500 mb-4">{error}</p>}
      <Button variant="primary" className="w-full" size="lg" onClick={onConfirm} isLoading={isLoading}>
        {isLoading ? (isSafe ? "Proposing to Safe..." : "Confirming...") : (isSafe ? "Propose to Safe" : "Confirm Investment")}
      </Button>
    </>
  );
}

interface InvestSuccessStepProps {
  project: Project;
  amount: number;
  tokensToReceive: number;
  txHash: string | null;
}

export function InvestSuccessStep({ project, amount, tokensToReceive, txHash }: InvestSuccessStepProps) {
  return (
    <div className="text-center py-8">
      <div className="w-20 h-20 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-6">
        <CheckCircle2 className="w-10 h-10 text-green-600" />
      </div>
      <h1 className="text-2xl font-semibold text-text mb-2">Investment Successful!</h1>
      <p className="text-darkBlack/50 mb-8">
        You have successfully invested {formatCurrency(amount)} in {project.title}
      </p>
      <div className="bg-box rounded-xl p-6 text-left mb-8 space-y-3 text-sm">
        <h3 className="font-semibold text-text text-base mb-2">Transaction Summary</h3>
        <SummaryRow label="Amount Invested" value={formatCurrency(amount)} />
        <SummaryRow label="Tokens Allocated" value={`${tokensToReceive.toLocaleString()} ${project.tokenSymbol}`} />
        {txHash && (
          <SummaryRow
            label="Tx Hash"
            value={
              <a
                href={`https://basescan.org/tx/${txHash}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-darkAqua underline"
              >
                {txHash.slice(0, 10)}…
              </a>
            }
          />
        )}
        <SummaryRow label="Status" value={<Badge variant="success">Confirmed</Badge>} />
      </div>
    </div>
  );
}
