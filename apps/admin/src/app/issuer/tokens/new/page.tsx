"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { ArrowLeft, ArrowRight, CheckCircle2, Coins, Shield, Rocket, Zap, AlertCircle, Wallet, XCircle } from "lucide-react";
import Link from "next/link";
import { useAccount, useReadContract, useDisconnect } from "wagmi";
import { useConnectModal } from "@rainbow-me/rainbowkit";
import { type Abi } from "viem";
import { Button } from "@/components/atoms";
import { TransactionStatus } from "@/components/molecules/TransactionStatus";
import { IssuerDashboardLayout } from "@/components/templates";
import {
  StepTokenDetails, StepCompliance, StepDeploy,
  type TokenFormData, type ComplianceConfig,
} from "@/lib/tokenFormSteps";
import { createToken } from "@/lib/api/repositories/tokens";
import { useContractAction } from "@/hooks/useContractAction";
import { TOKEN_FACTORY_ABI } from "@/lib/contracts/abis/tokenFactory";
import { ISSUER_REGISTRY_ABI } from "@/lib/contracts/abis/issuerRegistry";
import { requireAddress, getAddresses } from "@/lib/contracts/addresses";
import { apiFetch } from "@/lib/api/client";

const STEPS = [
  { id: 1, title: "Token Details", icon: Coins },
  { id: 2, title: "Compliance", icon: Shield },
  { id: 3, title: "Review & Deploy", icon: Rocket },
];

export default function CreateTokenPage() {
  const [currentStep, setCurrentStep] = useState(1);
  const [selectedModules, setSelectedModules] = useState<string[]>(["country_allow", "max_ownership"]);
  const [formData, setFormData] = useState<TokenFormData>({
    name: "", symbol: "", assetType: "", totalSupply: "", decimals: "6", description: "",
  });
  const [complianceConfig, setComplianceConfig] = useState<ComplianceConfig>({
    selectedCountries: new Set<number>(),
    maxOwnership: "",
    maxHolders: "",
  });
  const [createdTokenId, setCreatedTokenId] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingDone, setRecordingDone] = useState(false);

  // Wallet
  const { isConnected, address: walletAddress } = useAccount();
  const { openConnectModal } = useConnectModal();
  const { disconnect } = useDisconnect();
  const deployAction = useContractAction();

  // Check if connected wallet is a registered issuer on-chain
  const issuerRegistryAddr = getAddresses().issuerRegistry;
  const { data: isActiveIssuer, isLoading: isCheckingIssuer } = useReadContract({
    address: issuerRegistryAddr as `0x${string}`,
    abi: ISSUER_REGISTRY_ABI as unknown as Abi,
    functionName: "isActiveIssuer",
    args: walletAddress ? [walletAddress] : undefined,
    query: { enabled: !!walletAddress && !!issuerRegistryAddr },
  });

  const walletIsVerifiedIssuer = isActiveIssuer === true;

  const toggleModule = (id: string) => {
    setSelectedModules((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);
  };

  const isDev = process.env.NODE_ENV === "development";

  const autoFill = () => {
    setFormData({
      name: "Wassa Gold Reserve",
      symbol: "WGLD",
      assetType: "commodity",
      totalSupply: "1000000",
      decimals: "6",
      description: "ERC-3643 security token backed by physical gold reserves in West Africa.",
    });
    setSelectedModules(["country_allow", "max_ownership", "max_holders"]);
    setComplianceConfig({
      selectedCountries: new Set([784, 826, 702]), // UAE, UK, Singapore
      maxOwnership: "100000",
      maxHolders: "500",
    });
  };

  const handleDeploy = async () => {
    if (!isConnected || !walletAddress) { openConnectModal?.(); return; }
    setSaveError(null);

    let tokenId = createdTokenId;
    if (!tokenId) {
      try {
        const created = await createToken({
          name: formData.name, symbol: formData.symbol,
          asset_type: formData.assetType, total_supply: formData.totalSupply,
          decimals: formData.decimals, description: formData.description,
        });
        tokenId = created.id;
        setCreatedTokenId(tokenId);
      } catch (err) {
        setSaveError(err instanceof Error ? err.message : "Failed to save token");
        return;
      }
    }

    try {
      const factoryAddr = requireAddress("tokenFactory");
      const receipt = await deployAction.execute({
        address: factoryAddr,
        abi: TOKEN_FACTORY_ABI as unknown as Abi,
        functionName: "deployToken",
        args: [formData.name, formData.symbol, parseInt(formData.decimals), walletAddress],
        gas: 5_000_000n, // 3 proxy deployments (Token + IdentityRegistry + Compliance)
      });

      if (receipt && tokenId) {
        // Save to localStorage as backup in case recording fails or user navigates away
        const pendingKey = `cireta_pending_token_${tokenId}`;
        localStorage.setItem(pendingKey, JSON.stringify({
          tokenId, txHash: receipt.transactionHash, timestamp: Date.now(),
        }));

        await recordDeployment(tokenId, receipt.transactionHash, pendingKey);
      }
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Deployment failed");
    }
  };

  const recordDeployment = async (tokenId: string, txHash: string, pendingKey: string) => {
    setIsRecording(true);
    setSaveError(null);
    try {
      await apiFetch(`/api/v1/tokens/${tokenId}/record-deployment`, {
        method: "POST",
        body: { tx_hash: txHash },
      });
      setRecordingDone(true);
      localStorage.removeItem(pendingKey); // cleanup on success
    } catch {
      setSaveError("Token deployed on-chain but failed to sync. Click 'Retry Sync' to try again.");
    } finally {
      setIsRecording(false);
    }
  };

  const handleRetrySync = async () => {
    if (!createdTokenId) return;
    const pendingKey = `cireta_pending_token_${createdTokenId}`;
    const saved = localStorage.getItem(pendingKey);
    if (!saved) { setSaveError("No pending deployment found."); return; }
    const { txHash } = JSON.parse(saved);
    await recordDeployment(createdTokenId, txHash, pendingKey);
  };

  // On mount: check for any pending deployments from previous sessions
  useEffect(() => {
    if (!createdTokenId) return;
    const pendingKey = `cireta_pending_token_${createdTokenId}`;
    const saved = localStorage.getItem(pendingKey);
    if (saved && !recordingDone) {
      const { txHash, timestamp } = JSON.parse(saved);
      // Only auto-retry if less than 1 hour old
      if (Date.now() - timestamp < 3600000) {
        recordDeployment(createdTokenId, txHash, pendingKey);
      }
    }
  }, [createdTokenId]);

  // Block navigation during deployment/recording
  const isDeploying = deployAction.isPending || deployAction.isConfirming || isRecording;

  useEffect(() => {
    if (!isDeploying) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "Deployment in progress. Are you sure you want to leave?";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [isDeploying]);

  const totalSteps = STEPS.length;
  const canContinue = currentStep === 1
    ? formData.name && formData.symbol && formData.totalSupply && formData.assetType
    : true;

  // Gate: require wallet connection
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
              You need to connect your issuer wallet before creating a token. The token will be deployed from this wallet and you&apos;ll be the token owner.
            </p>
            <Button variant="primary" onClick={() => openConnectModal?.()}>
              <Wallet className="h-4 w-4 mr-2" /> Connect Wallet
            </Button>
          </div>
        </div>
      </IssuerDashboardLayout>
    );
  }

  // Gate: verify wallet is a registered issuer
  if (!isCheckingIssuer && !walletIsVerifiedIssuer) {
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
              Contact the platform admin to register your wallet in the Issuer Registry, or connect a different wallet that is already registered.
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

      {/* Compact progress bar */}
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
            {i < STEPS.length - 1 && <div className={`flex-1 h-0.5 ${currentStep > step.id ? "bg-green-500" : "bg-zinc-200"}`} />}
          </div>
        ))}
      </div>

      {/* Transaction status + errors — always at top */}
      {(saveError || deployAction.isPending || deployAction.isConfirming || deployAction.isConfirmed || deployAction.error || isRecording) && (
        <div className="mb-4">
          {saveError && (
            <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-600 mb-3">
              <div className="flex items-center gap-2">
                <AlertCircle className="h-4 w-4 flex-shrink-0" /> {saveError}
              </div>
              {deployAction.isConfirmed && !recordingDone && (
                <Button variant="outline" size="sm" onClick={handleRetrySync} className="mt-2"
                  isLoading={isRecording} disabled={isRecording}>
                  Retry Sync
                </Button>
              )}
            </div>
          )}
          <TransactionStatus
            isPending={deployAction.isPending} isConfirming={deployAction.isConfirming}
            isConfirmed={deployAction.isConfirmed && !isRecording} txHash={deployAction.txHash}
            txUrl={deployAction.txUrl} error={deployAction.error}
            successMessage={recordingDone ? "Token deployed and registered." : "Token deployed on-chain."}
          />
          {isRecording && (
            <div className="mt-2 p-3 rounded-lg bg-blue-50 border border-blue-200 text-sm text-blue-700 flex items-center gap-2">
              <div className="h-4 w-4 border-2 border-blue-300 border-t-blue-600 rounded-full animate-spin flex-shrink-0" />
              Registering contract addresses — please wait...
            </div>
          )}
        </div>
      )}

      {/* Step content + navigation */}
      <motion.div key={currentStep} initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }}
        className="bg-white rounded-lg border border-zinc-100 overflow-hidden">
        <div className="p-6">
          {currentStep === 1 && <StepTokenDetails formData={formData} setFormData={setFormData} />}
          {currentStep === 2 && <StepCompliance selectedModules={selectedModules} toggleModule={toggleModule} complianceConfig={complianceConfig} setComplianceConfig={setComplianceConfig} />}
          {currentStep === 3 && <StepDeploy formData={formData} selectedModules={selectedModules} complianceConfig={complianceConfig} />}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-zinc-50 border-t border-zinc-100">
          <div className="flex items-center justify-center gap-6">
            {currentStep === 1 ? (
              <Link href="/issuer/tokens"><Button variant="outline" size="sm" disabled={isDeploying}>Cancel</Button></Link>
            ) : (
              <Button variant="outline" size="sm" onClick={() => setCurrentStep(currentStep - 1)} disabled={isDeploying}>
                <ArrowLeft className="h-3.5 w-3.5 mr-1" /> Back
              </Button>
            )}
            {currentStep < totalSteps ? (
              <Button variant="primary" size="sm" onClick={() => setCurrentStep(currentStep + 1)} disabled={!canContinue}>
                Continue <ArrowRight className="h-3.5 w-3.5 ml-1" />
              </Button>
            ) : recordingDone ? (
              <Link href={createdTokenId ? `/issuer/tokens/${createdTokenId}` : "/issuer/tokens"}>
                <Button variant="primary" size="sm"><CheckCircle2 className="h-3.5 w-3.5 mr-1" /> View Token</Button>
              </Link>
            ) : (
              <Button variant="primary" size="sm" onClick={handleDeploy}
                disabled={deployAction.isPending || deployAction.isConfirming || isRecording}
                isLoading={deployAction.isPending || deployAction.isConfirming || isRecording}>
                <Rocket className="h-3.5 w-3.5 mr-1" />
                {isRecording ? "Registering..." : !isConnected ? "Connect Wallet" : "Deploy Token"}
              </Button>
            )}
          </div>
        </div>
      </motion.div>
    </IssuerDashboardLayout>
  );
}
