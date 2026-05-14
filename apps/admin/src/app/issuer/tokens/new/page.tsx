"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import {
  ArrowLeft, ArrowRight, CheckCircle2, Coins, Shield, Rocket,
  Globe, Zap, AlertCircle, Wallet, XCircle, RefreshCw,
} from "lucide-react";
import Link from "next/link";
import { useAccount, useDisconnect } from "wagmi";
import { useConnectModal } from "@rainbow-me/rainbowkit";
import { type Abi, createPublicClient } from "viem";
import { getChain, getTransport } from "@/lib/chain";
import { Button } from "@/components/atoms";
import { TransactionStatus } from "@/components/molecules/TransactionStatus";
import { IssuerDashboardLayout } from "@/components/templates";
import {
  StepTokenDetails, StepIdentityRegistry, StepCompliance, StepDeploy,
  StepRedemption, DEFAULT_REDEMPTION,
  type TokenFormData, type ComplianceConfig, type RedemptionFormData,
} from "@/lib/tokenFormSteps";
import { useTokenDeploy, DEPLOY_STAGE_LABEL } from "@/hooks/useTokenDeploy";
import { ISSUER_REGISTRY_ABI } from "@/lib/contracts/abis/issuerRegistry";
import { getAddresses } from "@/lib/contracts/addresses";

const STEPS = [
  { id: 1, title: "Token Details", icon: Coins },
  { id: 2, title: "Identity Registry", icon: Globe },
  { id: 3, title: "Compliance", icon: Shield },
  { id: 4, title: "Redemption", icon: RefreshCw },
  { id: 5, title: "Review & Deploy", icon: Rocket },
];

const PLATFORM_IR = process.env.NEXT_PUBLIC_IDENTITY_REGISTRY_ADDRESS ?? "";

const DEFAULT_FORM: TokenFormData = {
  name: "", symbol: "", assetType: "", totalSupply: "",
  maxSupply: "", initialMintAmount: "", tokenType: "mintable",
  decimals: "6", description: "", identityRegistry: PLATFORM_IR,
};

const DEFAULT_COMPLIANCE: ComplianceConfig = {
  selectedCountries: new Set<number>(),
  maxOwnership: "",
  maxHolders: "",
};

export default function CreateTokenPage() {
  const [currentStep, setCurrentStep] = useState(1);
  const [selectedModules, setSelectedModules] = useState<string[]>(["country_allow", "max_ownership"]);
  const [formData, setFormData] = useState<TokenFormData>(DEFAULT_FORM);
  const [complianceConfig, setComplianceConfig] = useState<ComplianceConfig>(DEFAULT_COMPLIANCE);
  const [redemptionData, setRedemptionData] = useState<RedemptionFormData>(DEFAULT_REDEMPTION);

  const { isConnected, address: walletAddress } = useAccount();
  const { openConnectModal } = useConnectModal();
  const { disconnect } = useDisconnect();
  const { deployStage, saveError, createdTokenId, deploy, retrySync, contractAction } = useTokenDeploy();

  const issuerRegistryAddr = getAddresses().issuerRegistry;
  const [isActiveIssuer, setIsActiveIssuer] = useState<boolean | undefined>(undefined);
  const [isCheckingIssuer, setIsCheckingIssuer] = useState(false);

  useEffect(() => {
    if (!walletAddress || !issuerRegistryAddr) { setIsActiveIssuer(undefined); return; }
    setIsCheckingIssuer(true);
    const client = createPublicClient({ chain: getChain(), transport: getTransport() });
    client.readContract({
      address: issuerRegistryAddr,
      abi: ISSUER_REGISTRY_ABI as unknown as Abi,
      functionName: "isActiveIssuer",
      args: [walletAddress],
    }).then((r) => setIsActiveIssuer(r === true))
      .catch(() => setIsActiveIssuer(false))
      .finally(() => setIsCheckingIssuer(false));
  }, [walletAddress, issuerRegistryAddr]);

  // Auto-retry pending deployments on token ID available
  useEffect(() => {
    if (createdTokenId && deployStage === "idle") {
      const pendingKey = `cireta_pending_token_${createdTokenId}`;
      const saved = localStorage.getItem(pendingKey);
      if (saved) {
        const { timestamp } = JSON.parse(saved) as { timestamp: number };
        if (Date.now() - timestamp < 3_600_000) retrySync();
      }
    }
  }, [createdTokenId]);

  const walletIsVerifiedIssuer = isActiveIssuer === true;
  const isDev = process.env.NODE_ENV === "development";

  const autoFill = (): void => {
    setFormData({
      name: "Wassa Gold Reserve", symbol: "WGLD", assetType: "commodity",
      totalSupply: "1000000", maxSupply: "1000000", initialMintAmount: "0",
      tokenType: "mintable", decimals: "6",
      description: "ERC-3643 security token backed by physical gold reserves in West Africa.",
      identityRegistry: PLATFORM_IR,
    });
    setSelectedModules(["country_allow", "max_ownership", "max_holders"]);
    setComplianceConfig({ selectedCountries: new Set([784, 826, 702]), maxOwnership: "100000", maxHolders: "500" });
  };

  const toggleModule = (id: string): void =>
    setSelectedModules((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);

  const handleDeploy = async (): Promise<void> => {
    if (!isConnected || !walletAddress) { openConnectModal?.(); return; }
    await deploy(walletAddress as `0x${string}`, formData, redemptionData);
  };

  const isDeploying = deployStage !== "idle" && deployStage !== "done";
  const isDone = deployStage === "done";

  useEffect(() => {
    if (!isDeploying) return;
    const handler = (e: BeforeUnloadEvent): void => {
      e.preventDefault();
      e.returnValue = "Deployment in progress. Are you sure you want to leave?";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [isDeploying]);

  const maxSupplyN = Number(formData.maxSupply);
  const initN = Number(formData.initialMintAmount) || 0;
  const initExceedsMax = formData.tokenType === "mintable" && formData.initialMintAmount !== "" && initN > maxSupplyN && maxSupplyN > 0;

  const canContinue = (() => {
    if (currentStep === 1) return !!(formData.name && formData.symbol && formData.maxSupply && maxSupplyN > 0 && formData.assetType && !initExceedsMax);
    if (currentStep === 2) return !!formData.identityRegistry;
    return true;
  })();

  const totalSteps = STEPS.length;
  const canDeploy = canContinue && !!formData.identityRegistry && !isDeploying;

  // ── Wallet gates ──────────────────────────────────────────────────────────
  if (!isConnected) {
    return (
      <IssuerDashboardLayout title="Create New Token" description="Deploy a new ERC-3643 security token">
        <div className="max-w-lg mx-auto mt-12">
          <div className="bg-white rounded-lg border border-zinc-100 p-8 text-center">
            <div className="w-16 h-16 rounded-full bg-darkAqua/10 flex items-center justify-center mx-auto mb-4">
              <Wallet className="h-8 w-8 text-darkAqua" />
            </div>
            <h2 className="text-lg font-bold text-zinc-900 mb-2">Connect Your Wallet</h2>
            <p className="text-sm text-zinc-500 mb-6">
              Connect your issuer wallet before creating a token. The token will be deployed from this wallet.
            </p>
            <Button variant="primary" onClick={() => openConnectModal?.()}>
              <Wallet className="h-4 w-4 mr-2" /> Connect Wallet
            </Button>
          </div>
        </div>
      </IssuerDashboardLayout>
    );
  }

  if (isCheckingIssuer) {
    return (
      <IssuerDashboardLayout title="Create New Token" description="Deploy a new ERC-3643 security token">
        <div className="flex items-center justify-center py-20">
          <div className="text-center">
            <div className="h-8 w-8 border-2 border-zinc-200 border-t-darkAqua rounded-full animate-spin mx-auto mb-3" />
            <p className="text-sm text-zinc-500">Verifying issuer wallet...</p>
          </div>
        </div>
      </IssuerDashboardLayout>
    );
  }

  if (!walletIsVerifiedIssuer) {
    return (
      <IssuerDashboardLayout title="Create New Token" description="Deploy a new ERC-3643 security token">
        <div className="max-w-lg mx-auto mt-12">
          <div className="bg-white rounded-lg border border-red-200 p-8 text-center">
            <div className="w-16 h-16 rounded-full bg-red-50 flex items-center justify-center mx-auto mb-4">
              <XCircle className="h-8 w-8 text-red-500" />
            </div>
            <h2 className="text-lg font-bold text-zinc-900 mb-2">Wallet Not Registered</h2>
            <p className="text-sm text-zinc-500 mb-3">
              The connected wallet is not registered as an active issuer on-chain.
            </p>
            <div className="bg-zinc-50 rounded-lg p-3 mb-6">
              <p className="font-mono text-xs text-zinc-600 break-all">{walletAddress}</p>
            </div>
            <p className="text-xs text-zinc-400 mb-6">
              Contact the platform admin to register your wallet, or connect a different wallet.
            </p>
            <div className="flex items-center justify-center gap-4">
              <Button variant="outline" onClick={() => { disconnect(); setTimeout(() => openConnectModal?.(), 300); }}>
                Switch Wallet
              </Button>
              <Link href="/issuer/overview">
                <Button variant="ghost">Back to Dashboard</Button>
              </Link>
            </div>
          </div>
        </div>
      </IssuerDashboardLayout>
    );
  }

  // ── Main wizard ───────────────────────────────────────────────────────────
  return (
    <IssuerDashboardLayout title="Create New Token" description="Deploy a new ERC-3643 security token">
      {/* Verified issuer badge */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2 text-xs">
          <span className="inline-flex items-center gap-1.5 bg-green-50 text-green-700 px-3 py-1.5 rounded-md font-medium">
            <CheckCircle2 className="h-3 w-3" /> Verified Issuer
          </span>
          <span className="font-mono text-zinc-400">{walletAddress?.slice(0, 6)}...{walletAddress?.slice(-4)}</span>
        </div>
        {isDev && (
          <button onClick={autoFill}
            className="inline-flex items-center gap-1.5 bg-amber-100 text-amber-700 px-3 py-1.5 rounded-md hover:bg-amber-200 transition-colors text-xs font-semibold">
            <Zap className="h-3 w-3" /> Auto-fill (Dev Only)
          </button>
        )}
      </div>

      {/* Progress bar */}
      <div className="flex items-center gap-2 mb-6">
        {STEPS.map((step, i) => (
          <div key={step.id} className="flex items-center gap-2 flex-1">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${
              currentStep > step.id ? "bg-green-500 text-white"
              : currentStep === step.id ? "bg-darkAqua text-white"
              : "bg-zinc-200 text-zinc-500"
            }`}>
              {currentStep > step.id ? <CheckCircle2 className="h-4 w-4" /> : step.id}
            </div>
            <span className={`text-xs font-medium hidden sm:block ${currentStep >= step.id ? "text-text" : "text-zinc-400"}`}>
              {step.title}
            </span>
            {i < STEPS.length - 1 && (
              <div className={`flex-1 h-0.5 ${currentStep > step.id ? "bg-green-500" : "bg-zinc-200"}`} />
            )}
          </div>
        ))}
      </div>

      {/* Status strip */}
      {(saveError || deployStage !== "idle" || contractAction.error) && (
        <div className="mb-4 space-y-2">
          {saveError && (
            <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-600">
              <div className="flex items-center gap-2">
                <AlertCircle className="h-4 w-4 flex-shrink-0" /> {saveError}
              </div>
              {contractAction.isConfirmed && deployStage === "idle" && (
                <Button variant="outline" size="sm" onClick={retrySync} className="mt-2">Retry Sync</Button>
              )}
            </div>
          )}
          {deployStage !== "idle" && deployStage !== "done" && (
            <div className="p-3 rounded-lg bg-blue-50 border border-blue-200 text-sm text-blue-700 flex items-center gap-2">
              <div className="h-4 w-4 border-2 border-blue-300 border-t-blue-600 rounded-full animate-spin flex-shrink-0" />
              {DEPLOY_STAGE_LABEL[deployStage]}
            </div>
          )}
          <TransactionStatus isPending={contractAction.isPending} isConfirming={contractAction.isConfirming}
            isConfirmed={contractAction.isConfirmed && deployStage === "done"}
            txHash={contractAction.txHash} txUrl={contractAction.txUrl}
            error={contractAction.error} successMessage="Token deployed and registered." />
        </div>
      )}

      {/* Step content */}
      <motion.div key={currentStep} initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }}
        className="bg-white rounded-lg border border-zinc-100 overflow-hidden">
        <div className="p-6">
          {currentStep === 1 && <StepTokenDetails formData={formData} setFormData={setFormData} />}
          {currentStep === 2 && <StepIdentityRegistry formData={formData} setFormData={setFormData} />}
          {currentStep === 3 && (
            <StepCompliance selectedModules={selectedModules} toggleModule={toggleModule}
              complianceConfig={complianceConfig} setComplianceConfig={setComplianceConfig} />
          )}
          {currentStep === 4 && (
            <StepRedemption data={redemptionData} onChange={setRedemptionData} />
          )}
          {currentStep === 5 && (
            <StepDeploy formData={formData} selectedModules={selectedModules} complianceConfig={complianceConfig} />
          )}
        </div>

        {/* Footer nav */}
        <div className="px-6 py-4 bg-zinc-50 border-t border-zinc-100">
          <div className="flex items-center justify-center gap-6">
            {currentStep === 1 ? (
              <Link href="/issuer/tokens">
                <Button variant="outline" size="sm" disabled={isDeploying}>Cancel</Button>
              </Link>
            ) : (
              <Button variant="outline" size="sm" onClick={() => setCurrentStep(currentStep - 1)} disabled={isDeploying}>
                <ArrowLeft className="h-3.5 w-3.5 mr-1" /> Back
              </Button>
            )}
            {currentStep < totalSteps ? (
              <Button variant="primary" size="sm" onClick={() => setCurrentStep(currentStep + 1)} disabled={!canContinue || isDeploying}>
                Continue <ArrowRight className="h-3.5 w-3.5 ml-1" />
              </Button>
            ) : isDone ? (
              <Link href={createdTokenId ? `/issuer/tokens/${createdTokenId}` : "/issuer/tokens"}>
                <Button variant="primary" size="sm">
                  <CheckCircle2 className="h-3.5 w-3.5 mr-1" /> View Token
                </Button>
              </Link>
            ) : (
              <Button variant="primary" size="sm" onClick={handleDeploy} disabled={!canDeploy} isLoading={isDeploying}>
                <Rocket className="h-3.5 w-3.5 mr-1" />
                {isDeploying ? (DEPLOY_STAGE_LABEL[deployStage] || "Deploying...") : "Deploy Token"}
              </Button>
            )}
          </div>
        </div>
      </motion.div>
    </IssuerDashboardLayout>
  );
}
