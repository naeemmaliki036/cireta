"use client";

import { useState, useCallback } from "react";
import { parseUnits, parseEventLogs, type Abi } from "viem";
import { createToken, recordTokenDeployment } from "@/lib/api/repositories/tokens";
import { useContractAction } from "@/hooks/useContractAction";
import { TOKEN_FACTORY_ABI } from "@/lib/contracts/abis/tokenFactory";
import { requireAddress } from "@/lib/contracts/addresses";
import type { TokenFormData, RedemptionFormData } from "@/lib/tokenFormSteps";
import type { TransactionReceipt } from "viem";

export type DeployStage =
  | "idle"
  | "saving_draft"
  | "signing"
  | "confirming"
  | "recording"
  | "done";

export const DEPLOY_STAGE_LABEL: Record<DeployStage, string> = {
  idle: "",
  saving_draft: "Saving draft...",
  signing: "Sign in your wallet...",
  confirming: "Confirming on-chain...",
  recording: "Recording deployment...",
  done: "Done — viewing token",
};

export interface UseTokenDeployReturn {
  deployStage: DeployStage;
  saveError: string | null;
  createdTokenId: string | null;
  deploy: (walletAddress: `0x${string}`, formData: TokenFormData, redemptionData?: RedemptionFormData) => Promise<void>;
  retrySync: () => Promise<void>;
  contractAction: ReturnType<typeof useContractAction>;
}

interface PendingDeployment {
  tokenId: string;
  txHash: string;
  tokenAddress: string;
  irAddress: string;
  complianceAddress: string;
  maxSupply: string;
  mintable: boolean;
  timestamp: number;
}

function getPendingKey(tokenId: string): string {
  return `cireta_pending_token_${tokenId}`;
}

export function useTokenDeploy(): UseTokenDeployReturn {
  const [deployStage, setDeployStage] = useState<DeployStage>("idle");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [createdTokenId, setCreatedTokenId] = useState<string | null>(null);
  const contractAction = useContractAction();

  const doRecord = useCallback(async (
    tokenId: string,
    txHash: string,
    tokenAddress: string,
    irAddress: string,
    complianceAddress: string,
    maxSupply: string,
    mintable: boolean,
    initialMintAmount: string,
  ): Promise<void> => {
    setDeployStage("recording");
    try {
      await recordTokenDeployment(tokenId, {
        tx_hash: txHash,
        contract_address: tokenAddress,
        identity_registry_address: irAddress,
        compliance_address: complianceAddress,
        max_supply: maxSupply,
        mintable,
        current_supply: mintable ? (initialMintAmount || "0") : maxSupply,
      });
      localStorage.removeItem(getPendingKey(tokenId));
      setDeployStage("done");
    } catch {
      setSaveError("Token deployed on-chain but failed to sync. Click 'Retry Sync' to try again.");
      setDeployStage("idle");
    }
  }, []);

  const deploy = useCallback(async (
    walletAddress: `0x${string}`,
    formData: TokenFormData,
    redemptionData?: RedemptionFormData,
  ): Promise<void> => {
    if (!formData.identityRegistry) {
      setSaveError("Select an identity registry before deploying.");
      return;
    }

    setSaveError(null);
    contractAction.reset();

    // 1. Save draft
    setDeployStage("saving_draft");
    let tokenId = createdTokenId;
    if (!tokenId) {
      try {
        const created = await createToken({
          name: formData.name, symbol: formData.symbol,
          asset_type: formData.assetType, total_supply: formData.maxSupply,
          max_supply: formData.maxSupply, mintable: formData.tokenType === "mintable",
          decimals: formData.decimals, description: formData.description,
          ...(redemptionData && redemptionData.redemptionType !== "none" ? {
            redemption_type: redemptionData.redemptionType,
            redemption_url: redemptionData.redemptionUrl || null,
            redemption_description: redemptionData.redemptionDescription || null,
            redemption_manager_address: redemptionData.redemptionManagerAddress || null,
          } : { redemption_type: "none" }),
        });
        tokenId = created.id;
        setCreatedTokenId(tokenId);
      } catch (err) {
        setSaveError(err instanceof Error ? err.message : "Failed to save token draft");
        setDeployStage("idle");
        return;
      }
    }

    // 2. Build contract args
    const decimalsNum = parseInt(formData.decimals, 10);
    const maxSupplyRaw = parseUnits(formData.maxSupply, decimalsNum);
    const isMintable = formData.tokenType === "mintable";
    const initialMintRaw = isMintable && formData.initialMintAmount
      ? parseUnits(formData.initialMintAmount, decimalsNum)
      : (isMintable ? 0n : maxSupplyRaw);

    let factoryAddr: `0x${string}`;
    try {
      factoryAddr = requireAddress("tokenFactory");
    } catch {
      setSaveError("Token Factory contract address not configured.");
      setDeployStage("idle");
      return;
    }

    // 3. Sign + broadcast
    setDeployStage("signing");
    const receipt: TransactionReceipt | null = await contractAction.execute({
      address: factoryAddr,
      abi: TOKEN_FACTORY_ABI as unknown as Abi,
      functionName: "deployToken",
      args: [
        formData.name, formData.symbol, decimalsNum, walletAddress,
        formData.identityRegistry as `0x${string}`,
        maxSupplyRaw, isMintable, initialMintRaw,
      ],
      gas: 4_000_000n,
    });

    if (!receipt || !tokenId) { setDeployStage("idle"); return; }
    setDeployStage("confirming");

    // 4. Parse logs
    let tokenAddress = "";
    let irAddress = "";
    let complianceAddress = "";
    try {
      const logs = parseEventLogs({
        abi: TOKEN_FACTORY_ABI as unknown as Abi,
        eventName: "TokenDeployed",
        logs: receipt.logs,
      });
      const evt = logs[0];
      if (evt && "args" in evt) {
        const args = evt.args as { token: `0x${string}`; identityRegistry: `0x${string}`; compliance: `0x${string}` };
        tokenAddress = args.token ?? "";
        irAddress = args.identityRegistry ?? "";
        complianceAddress = args.compliance ?? "";
      }
    } catch (e) {
      console.warn("[useTokenDeploy] Could not parse TokenDeployed logs:", e);
    }

    // Persist for retry resilience
    const pending: PendingDeployment = {
      tokenId, txHash: receipt.transactionHash,
      tokenAddress, irAddress, complianceAddress,
      maxSupply: formData.maxSupply, mintable: isMintable, timestamp: Date.now(),
    };
    localStorage.setItem(getPendingKey(tokenId), JSON.stringify(pending));

    // 5. Record
    await doRecord(tokenId, receipt.transactionHash, tokenAddress, irAddress, complianceAddress,
      formData.maxSupply, isMintable, formData.initialMintAmount);
  }, [createdTokenId, contractAction, doRecord]);

  const retrySync = useCallback(async (): Promise<void> => {
    if (!createdTokenId) return;
    const saved = localStorage.getItem(getPendingKey(createdTokenId));
    if (!saved) { setSaveError("No pending deployment found."); return; }
    const p = JSON.parse(saved) as PendingDeployment;
    setSaveError(null);
    await doRecord(createdTokenId, p.txHash, p.tokenAddress, p.irAddress, p.complianceAddress,
      p.maxSupply, p.mintable, "0");
  }, [createdTokenId, doRecord]);

  return { deployStage, saveError, createdTokenId, deploy, retrySync, contractAction };
}
