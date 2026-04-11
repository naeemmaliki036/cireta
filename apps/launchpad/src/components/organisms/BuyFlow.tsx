"use client";

import { useState } from "react";
import { useChainId } from "wagmi";
import { Shield, AlertCircle, CheckCircle2, Wallet, Fuel } from "lucide-react";
import { Button, Badge } from "@/components/atoms";
import { formatCurrency } from "@/lib/utils";
import { getTxUrl } from "@/lib/contracts/addresses";
import type { Project, ProjectPhase } from "@/lib/api/repositories/projects.repository";

/**
 * Shared compliance acknowledgment block. Used in both USDC and OTC approve
 * steps so both flows enforce the same disclosure.
 */
export function ComplianceAcknowledgment({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <div className="bg-box rounded-xl p-5 mb-4 space-y-4">
      <p className="text-sm text-black/60">
        This purchase involves tokenized securities which may be subject to
        transfer restrictions and lock-up periods. Please ensure you are eligible
        to participate and that your local laws permit such purchases.
      </p>
      <label className="flex items-start gap-3 cursor-pointer">
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          className="mt-0.5 w-4 h-4 rounded border-black/20 text-darkAqua focus:ring-darkAqua"
          data-testid="jurisdiction-checkbox"
        />
        <span className="text-sm text-text">
          I confirm I am not a resident of a restricted jurisdiction
        </span>
      </label>
    </div>
  );
}

/**
 * Low-gas warning banner. Shown when the connected wallet has less than the
 * configured threshold of native ETH on the current chain.
 */
export function LowGasWarning({
  balanceEth,
  threshold = 0.0005,
}: {
  balanceEth: number | null;
  threshold?: number;
}) {
  if (balanceEth == null || balanceEth >= threshold) return null;
  return (
    <div className="mb-4 p-3 rounded-xl bg-yellow-50 border border-yellow-200 flex gap-3 items-start">
      <Fuel className="w-4 h-4 text-yellow-600 flex-shrink-0 mt-0.5" />
      <div className="text-sm">
        <p className="font-medium text-yellow-900">Low ETH for gas</p>
        <p className="text-yellow-800/80">
          You have {balanceEth.toFixed(5)} ETH. You need at least
          {" "}{threshold.toFixed(4)} ETH to cover transaction fees.
        </p>
      </div>
    </div>
  );
}

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
      <span className="text-black/50">{label}</span>
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
  /** This investor's existing cumulative contribution to the sale, human units. */
  userTotalContributed?: number;
  /** Low-gas warning: investor's native ETH balance, in ETH (null = unknown). */
  ethBalance?: number | null;
}

/**
 * Build quick-buy suggestions starting at the effective minimum.
 * - First-time buyer: starts at minTokens → 2x, 5x, 10x
 * - Repeat buyer: starts at topUpMinTokens → 2x, 5x, 10x
 * Clamps to available supply.
 */
function buildQuickQuantities(effectiveMin: number, availableTokens: number): number[] {
  if (effectiveMin <= 0) return [1, 5, 10, 100];
  const base = effectiveMin;
  const raw = [base, base * 2, base * 5, base * 10];
  // Dedupe and filter — don't suggest more than what's available
  const cap = availableTokens > 0 ? availableTokens : Infinity;
  const filtered = raw.filter((q, i, arr) => q <= cap && arr.indexOf(q) === i);
  return filtered.length > 0 ? filtered : [effectiveMin];
}

export function InvestAmountStep({
  project,
  activePhase,
  amount,
  onAmountChange,
  onContinue,
  isConnected,
  onConnect,
  userTotalContributed = 0,
  ethBalance = null,
}: InvestAmountStepProps) {
  // Whole-token buy: `amount` is token quantity (integer, not USDC)
  const tokenQty = parseInt(amount || "0", 10) || 0;
  const pricePerToken = activePhase ? parseFloat(activePhase.price_per_token) : 0;

  // Phase-level minimums are in whole tokens (new schema) — fall back to 1 if missing
  const phaseRaw = activePhase as unknown as { min_tokens?: string; max_tokens?: string; top_up_min_tokens?: string };
  const minTokens = phaseRaw?.min_tokens ? parseInt(phaseRaw.min_tokens, 10) : 1;
  const maxTokens = phaseRaw?.max_tokens ? parseInt(phaseRaw.max_tokens, 10) : 0; // 0 = unlimited
  const topUpMinTokens = phaseRaw?.top_up_min_tokens ? parseInt(phaseRaw.top_up_min_tokens, 10) : 1;

  const usdcRequired = tokenQty * pricePerToken; // exact, zero rounding
  const tokensToReceive = tokenQty;

  // Investor's cumulative whole tokens bought — derive from total USDC contributed ÷ price
  const investorWholeTokens = pricePerToken > 0 ? Math.floor(userTotalContributed / pricePerToken) : 0;
  const isRepeatBuyer = investorWholeTokens > 0;

  // Minimum applied to THIS buy: first-time uses minTokens, repeat uses topUpMinTokens
  const effectiveMin = isRepeatBuyer ? topUpMinTokens : minTokens;

  // Available tokens remaining in the whole sale (from total supply)
  const totalSupply = project.totalTokenSupply ?? 0;
  const soldTotal = project.tokensSoldTotal ?? 0;
  const availableTokens = Math.max(0, totalSupply - soldTotal);

  // Effective per-buy ceiling: min of (investor cap, sale remaining supply)
  const investorMaxRemaining = maxTokens > 0 ? Math.max(0, maxTokens - investorWholeTokens) : Infinity;
  const remainingMax = Math.min(investorMaxRemaining, availableTokens || Infinity);

  // Inline validation error
  let validationError: string | null = null;
  if (tokenQty > 0 && !Number.isInteger(tokenQty)) {
    validationError = "Only whole tokens allowed (e.g. 1, 5, 100)";
  } else if (tokenQty > 0 && tokenQty < effectiveMin) {
    validationError = isRepeatBuyer
      ? `Top-up minimum is ${topUpMinTokens} tokens`
      : `Minimum is ${minTokens} tokens for first-time buyers`;
  } else if (tokenQty > 0 && tokenQty > remainingMax) {
    if (availableTokens > 0 && tokenQty > availableTokens) {
      validationError = `Only ${availableTokens.toLocaleString()} ${project.tokenSymbol} available`;
    } else if (maxTokens > 0) {
      validationError = `Per-buyer cap: ${investorMaxRemaining.toLocaleString()} ${project.tokenSymbol} remaining for your wallet`;
    } else {
      validationError = `Amount exceeds the maximum`;
    }
  }

  if (!isConnected) {
    return (
      <div className="text-center py-8">
        <div className="w-20 h-20 rounded-full bg-darkAqua/10 flex items-center justify-center mx-auto mb-6">
          <Wallet className="w-10 h-10 text-darkAqua" />
        </div>
        <h1 className="text-2xl font-semibold text-text mb-2">Connect Your Wallet</h1>
        <p className="text-black/50 mb-8">You need to connect your wallet before buying</p>
        <Button variant="primary" className="w-full" size="lg" onClick={onConnect}>
          Connect Wallet
        </Button>
      </div>
    );
  }

  return (
    <>
      <h1 className="text-2xl font-semibold text-text mb-2">Buy {project.title}</h1>
      <p className="text-black/50 mb-8">How many tokens would you like to buy?</p>
      <div className="mb-6">
        <label className="block text-sm font-semibold text-text mb-2">
          Number of Tokens ({project.tokenSymbol})
        </label>
        <div className="relative">
          <input
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            value={amount}
            onChange={(e) => {
              // Whole tokens only, strip any non-digit
              const v = e.target.value.replace(/[^\d]/g, "");
              onAmountChange(v);
            }}
            placeholder="0"
            className="input-field text-2xl font-semibold pr-24"
          />
          <span className="absolute right-4 top-1/2 -translate-y-1/2 text-black/40 font-semibold pointer-events-none">
            {project.tokenSymbol}
          </span>
        </div>
        <div className="flex gap-2 mt-3">
          {buildQuickQuantities(effectiveMin, availableTokens).map((v) => (
            <button
              key={v}
              onClick={() => onAmountChange(v.toString())}
              className="flex-1 py-2 text-sm font-medium text-darkAqua bg-darkAqua/10 rounded-lg hover:bg-darkAqua/20 transition-colors"
            >
              {v.toLocaleString()} {project.tokenSymbol}
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
      {tokenQty > 0 && !validationError && (
        <div className="bg-box rounded-xl p-4 space-y-3 mb-6">
          <SummaryRow label="You Receive" value={`${tokensToReceive.toLocaleString()} ${project.tokenSymbol}`} />
          <SummaryRow label="Price per Token" value={formatCurrency(pricePerToken)} />
          <SummaryRow label="Total Cost" value={formatCurrency(usdcRequired)} />
        </div>
      )}
      <p className="text-xs text-black/40 mb-2">
        {isRepeatBuyer ? (
          <>Top-up min: {topUpMinTokens} tokens</>
        ) : (
          <>Min: {minTokens} tokens</>
        )}
        {" "}&bull; Available:{" "}
        {availableTokens > 0 ? `${availableTokens.toLocaleString()} ${project.tokenSymbol}` : "—"}
        {maxTokens > 0 && (
          <>
            {" "}&bull; Per-buyer cap: {maxTokens.toLocaleString()} {project.tokenSymbol}
          </>
        )}
      </p>
      {investorWholeTokens > 0 && (
        <p className="text-xs text-black/50 mb-4">
          You&apos;ve already bought{" "}
          <span className="font-semibold text-text">{investorWholeTokens} tokens</span>
          {maxTokens > 0 && (
            <>
              {" "}of {maxTokens} max ({remainingMax} remaining)
            </>
          )}
        </p>
      )}
      <LowGasWarning balanceEth={ethBalance} />
      <Button
        variant="primary"
        className="w-full"
        size="lg"
        disabled={
          tokenQty <= 0 ||
          tokenQty < effectiveMin ||
          tokenQty > remainingMax ||
          !activePhase
        }
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
  /** Current USDC allowance (formatted, e.g. 1000.50) */
  currentAllowance?: number;
  /** If true, allowance is sufficient — show "Skip" option */
  hasEnoughAllowance?: boolean;
  /** Called when user wants to skip approve (allowance already sufficient) */
  onSkip?: () => void;
  /** Optional back button handler — returns to the amount step */
  onBack?: () => void;
}

export function InvestApproveStep({
  amount,
  isLoading,
  error,
  onApprove,
  currentAllowance = 0,
  hasEnoughAllowance = false,
  onSkip,
  onBack,
}: InvestApproveStepProps) {
  const [complianceMet, setComplianceMet] = useState(false);

  return (
    <>
      <h1 className="text-2xl font-semibold text-text mb-2">Approve USDC</h1>
      <p className="text-black/50 mb-8">Allow the smart contract to spend your USDC</p>

      {/* Show existing allowance */}
      {currentAllowance > 0 && (
        <div className={`rounded-xl p-4 mb-4 flex items-center gap-3 ${
          hasEnoughAllowance
            ? "bg-green-50 border border-green-200"
            : "bg-blue-50 border border-blue-200"
        }`}>
          {hasEnoughAllowance ? (
            <CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0" />
          ) : (
            <Shield className="w-5 h-5 text-blue-600 flex-shrink-0" />
          )}
          <div className="flex-1">
            <p className="text-sm font-medium text-text">
              {hasEnoughAllowance
                ? "Sufficient allowance already approved"
                : `Current allowance: ${formatCurrency(currentAllowance)}`
              }
            </p>
            <p className="text-xs text-black/50">
              {hasEnoughAllowance
                ? `${formatCurrency(currentAllowance)} USDC approved — you can proceed directly.`
                : `You need ${formatCurrency(amount)} but only ${formatCurrency(currentAllowance)} is approved.`
              }
            </p>
          </div>
        </div>
      )}

      {/* If enough allowance, show skip button prominently */}
      {hasEnoughAllowance && onSkip && (
        <div className="mb-6">
          <ComplianceAcknowledgment checked={complianceMet} onChange={setComplianceMet} />
          {error && <p className="text-sm text-red-500 mb-4">{error}</p>}
          <div className="flex gap-3">
            {onBack && (
              <Button variant="outline" className="flex-1" size="lg" onClick={onBack} disabled={isLoading}>
                Back
              </Button>
            )}
            <Button variant="primary" className="flex-1" size="lg" onClick={onSkip} disabled={!complianceMet}>
              Continue to Purchase
            </Button>
          </div>
          <button onClick={onApprove} className="mt-3 text-sm text-black/40 hover:text-black/60 underline block mx-auto">
            Re-approve with new amount
          </button>
        </div>
      )}

      {/* Normal approve flow — shown when allowance is insufficient */}
      {!hasEnoughAllowance && (
        <>
          <div className="bg-box rounded-xl p-6 mb-6 text-center">
            <Shield className="h-12 w-12 text-darkAqua mx-auto mb-4" />
            <p className="font-semibold text-text mb-2">Approve {formatCurrency(amount)} USDC</p>
            <p className="text-sm text-black/50">This is a one-time approval for this purchase</p>
          </div>

          <ComplianceAcknowledgment checked={complianceMet} onChange={setComplianceMet} />

          <div className="p-4 rounded-xl bg-darkAqua/10 border border-darkAqua/30 flex gap-3 mb-6">
            <AlertCircle className="w-5 h-5 text-darkAqua flex-shrink-0" />
            <p className="text-sm text-black/60">You will need to confirm this transaction in your wallet</p>
          </div>
          {error && <p className="text-sm text-red-500 mb-4">{error}</p>}
          <div className="flex gap-3">
            {onBack && (
              <Button variant="outline" className="flex-1" size="lg" onClick={onBack} disabled={isLoading}>
                Back
              </Button>
            )}
            <Button variant="primary" className="flex-1" size="lg" onClick={onApprove} isLoading={isLoading} disabled={!complianceMet || isLoading}>
              {isLoading ? "Approving..." : "Approve USDC"}
            </Button>
          </div>
        </>
      )}
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
  onBack?: () => void;
  /**
   * When true, the on-chain tx is already confirmed and we are saving the
   * purchase to the buyer's portfolio in the backend. Used to show a clear
   * "Saving to your portfolio…" status instead of an ambiguous "Confirming…".
   */
  isRecording?: boolean;
}

export function InvestConfirmStep({
  project,
  amount,
  tokensToReceive,
  isLoading,
  error,
  isSafe = false,
  onConfirm,
  onBack,
  isRecording = false,
}: InvestConfirmStepProps) {
  return (
    <>
      <h1 className="text-2xl font-semibold text-text mb-2">Confirm Purchase</h1>
      <p className="text-black/50 mb-8">Review and confirm your purchase details</p>
      <div className="bg-box rounded-xl p-6 space-y-4 mb-6">
        <SummaryRow label="Project" value={project.title} />
        <SummaryRow label="Amount" value={`${amount.toLocaleString()} USDC`} />
        <SummaryRow label="Tokens" value={`${tokensToReceive.toLocaleString()} ${project.tokenSymbol}`} />
      </div>
      <p className="text-xs text-black/40 mb-4 text-center">
        Network fee paid in ETH from your wallet. Estimated by your wallet at signing time.
      </p>
      {error && <p className="text-sm text-red-500 mb-4">{error}</p>}
      <div className="flex gap-3">
        {onBack && (
          <Button variant="outline" className="flex-1" size="lg" onClick={onBack} disabled={isLoading}>
            Back
          </Button>
        )}
        <Button variant="primary" className="flex-1" size="lg" onClick={onConfirm} isLoading={isLoading}>
          {isLoading ? (isSafe ? "Proposing to Safe..." : "Confirming…") : (isSafe ? "Propose to Safe" : "Confirm Purchase")}
        </Button>
      </div>
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
  const chainId = useChainId();
  return (
    <div className="text-center py-8">
      <div className="w-20 h-20 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-6">
        <CheckCircle2 className="w-10 h-10 text-green-600" />
      </div>
      <h1 className="text-2xl font-semibold text-text mb-2">Purchase Complete</h1>
      <p className="text-black/50 mb-8">
        Your purchase of {tokensToReceive.toLocaleString()} {project.tokenSymbol} in {project.title} is confirmed on-chain.
      </p>
      <div className="bg-box rounded-xl p-6 text-left mb-8 space-y-3 text-sm">
        <h3 className="font-semibold text-text text-base mb-2">Transaction Summary</h3>
        <SummaryRow label="Tokens Received" value={`${tokensToReceive.toLocaleString()} ${project.tokenSymbol}`} />
        <SummaryRow label="Amount Paid" value={`${amount.toLocaleString()} USDC`} />
        {txHash && (
          <SummaryRow
            label="Tx Hash"
            value={
              <a
                href={getTxUrl(chainId, txHash)}
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
