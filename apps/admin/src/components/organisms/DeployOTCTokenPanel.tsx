"use client";

import { useState, useCallback } from "react";
import { type Abi, type TransactionReceipt } from "viem";
import { decodeEventLog } from "viem";
import { useAccount } from "wagmi";
import { useConnectModal } from "@rainbow-me/rainbowkit";
import { Rocket, AlertTriangle } from "lucide-react";
import { Button, Input } from "@/components/atoms";
import { CopyableAddress } from "@/components/atoms/CopyableAddress";
import { TransactionStatus } from "@/components/molecules/TransactionStatus";
import { useContractAction } from "@/hooks/useContractAction";
import { OTC_TOKEN_FACTORY_ABI } from "@/lib/contracts/abis/otcTokenFactory";
import { SALE_ABI } from "@/lib/contracts/abis/sale";

const OTC_FACTORY_ADDRESS = (
  process.env.NEXT_PUBLIC_OTC_TOKEN_FACTORY_ADDRESS ?? ""
) as `0x${string}`;

const IR_ADDRESS = (
  process.env.NEXT_PUBLIC_IDENTITY_REGISTRY_ADDRESS ?? ""
) as `0x${string}`;

interface Props {
  /** Sale contract address — used to call setOTCToken after deployment */
  saleContractAddress: `0x${string}`;
  /** Whether the issuer is active in IssuerRegistry (pre-flight) */
  issuerIsActive: boolean;
  /** Callback when a new OTC token is deployed and set on the sale */
  onDeployed?: (otcTokenAddress: string) => void;
}

/**
 * DeployOTCTokenPanel — lets an issuer self-deploy a new OTC receipt token
 * via IssuerOTCTokenFactory, then optionally set it on the sale contract.
 *
 * Reads the deployed address from the OTCTokenDeployed event in the receipt.
 */
export function DeployOTCTokenPanel({
  saleContractAddress,
  issuerIsActive,
  onDeployed,
}: Props) {
  const { address: walletAddress, isConnected } = useAccount();
  const { openConnectModal } = useConnectModal();

  const [name, setName] = useState("");
  const [symbol, setSymbol] = useState("");
  const [deployedAddress, setDeployedAddress] = useState<string | null>(null);
  const [setOnSaleDone, setSetOnSaleDone] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);

  const deployAction = useContractAction();
  const setOTCAction = useContractAction();

  /** Extract OTCTokenDeployed event from receipt logs */
  const extractDeployedAddress = useCallback(
    (receipt: TransactionReceipt): string | null => {
      for (const log of receipt.logs) {
        try {
          const decoded = decodeEventLog({
            abi: OTC_TOKEN_FACTORY_ABI as unknown as Abi,
            data: log.data,
            topics: log.topics,
          });
          if (decoded.eventName === "OTCTokenDeployed") {
            const args = decoded.args as unknown as { issuer: string; otcToken: string };
            return args.otcToken;
          }
        } catch {
          // Not this event — continue
        }
      }
      return null;
    },
    [],
  );

  const handleDeploy = async () => {
    if (!isConnected) { openConnectModal?.(); return; }

    setValidationError(null);
    setDeployedAddress(null);
    setSetOnSaleDone(false);

    if (!name.trim()) { setValidationError("Token name is required."); return; }
    if (!symbol.trim()) { setValidationError("Token symbol is required."); return; }
    if (!OTC_FACTORY_ADDRESS) {
      setValidationError("NEXT_PUBLIC_OTC_TOKEN_FACTORY_ADDRESS not configured.");
      return;
    }
    if (!IR_ADDRESS) {
      setValidationError("NEXT_PUBLIC_IDENTITY_REGISTRY_ADDRESS not configured.");
      return;
    }
    if (!walletAddress) { setValidationError("Connect a wallet first."); return; }

    deployAction.reset();
    const receipt = await deployAction.execute({
      address: OTC_FACTORY_ADDRESS,
      abi: OTC_TOKEN_FACTORY_ABI as unknown as Abi,
      functionName: "deployOTCToken",
      args: [name.trim(), symbol.trim().toUpperCase(), walletAddress, IR_ADDRESS],
    });

    if (!receipt) return;

    const newAddr = extractDeployedAddress(receipt);
    if (newAddr) {
      setDeployedAddress(newAddr);
      onDeployed?.(newAddr);
    }
  };

  const handleSetOnSale = async () => {
    if (!deployedAddress) return;
    setOTCAction.reset();
    const receipt = await setOTCAction.execute({
      address: saleContractAddress,
      abi: SALE_ABI as unknown as Abi,
      functionName: "setOTCToken",
      args: [deployedAddress as `0x${string}`],
    });
    if (receipt) setSetOnSaleDone(true);
  };

  return (
    <div className="bg-white rounded-lg border border-black/10 p-6 mt-6">
      <div className="flex items-center gap-2 mb-4">
        <Rocket className="h-5 w-5 text-zinc-500" />
        <h2 className="text-lg font-semibold text-text">Deploy New OTC Token</h2>
      </div>
      <p className="text-sm text-black/50 mb-5">
        Deploy a new ERC-20 OTC receipt token via the{" "}
        <code className="font-mono text-xs">IssuerOTCTokenFactory</code>. After
        deployment the address is read from the on-chain event so you can set it
        on this sale in one click.
      </p>

      {/* Issuer inactive warning */}
      {!issuerIsActive && (
        <div className="flex items-center gap-2 p-3 mb-4 rounded-lg border border-amber-200 bg-amber-50 text-xs text-amber-800">
          <AlertTriangle className="h-4 w-4 flex-shrink-0" />
          Your wallet is not registered as an active issuer. The factory call
          will revert. Activate your issuer status first.
        </div>
      )}

      <div className="space-y-4 max-w-md">
        <Input
          label="Token Name"
          placeholder="e.g. Cireta Gold OTC Receipt"
          value={name}
          onChange={(e) => { setName(e.target.value); setValidationError(null); }}
        />
        <Input
          label="Token Symbol"
          placeholder="e.g. CGOTC"
          value={symbol}
          onChange={(e) => { setSymbol(e.target.value.toUpperCase()); setValidationError(null); }}
          helperText="Automatically uppercased."
        />

        {validationError && (
          <p className="text-xs text-red-600">{validationError}</p>
        )}

        <Button
          variant="primary"
          size="sm"
          onClick={handleDeploy}
          disabled={
            !name.trim() ||
            !symbol.trim() ||
            deployAction.isPending ||
            deployAction.isConfirming
          }
          isLoading={deployAction.isPending || deployAction.isConfirming}
        >
          Deploy OTC Token
        </Button>

        <TransactionStatus
          isPending={deployAction.isPending}
          isConfirming={deployAction.isConfirming}
          isConfirmed={deployAction.isConfirmed}
          txHash={deployAction.txHash}
          txUrl={deployAction.txUrl}
          error={deployAction.error}
          successMessage="OTC token deployed on-chain."
        />

        {/* Post-deploy: show address + set-on-sale */}
        {deployedAddress && (
          <div className="rounded-lg border border-zinc-100 bg-zinc-50 p-4 space-y-3">
            <div>
              <p className="text-xs text-zinc-500 mb-1">Deployed OTC Token</p>
              <CopyableAddress address={deployedAddress} className="text-sm" />
            </div>

            {!setOnSaleDone ? (
              <>
                <p className="text-xs text-zinc-500">
                  Set this address on the sale contract so buyers receive these
                  receipt tokens.
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleSetOnSale}
                  disabled={setOTCAction.isPending || setOTCAction.isConfirming}
                  isLoading={setOTCAction.isPending || setOTCAction.isConfirming}
                >
                  Set on Sale
                </Button>
                <TransactionStatus
                  isPending={setOTCAction.isPending}
                  isConfirming={setOTCAction.isConfirming}
                  isConfirmed={setOTCAction.isConfirmed}
                  txHash={setOTCAction.txHash}
                  txUrl={setOTCAction.txUrl}
                  error={setOTCAction.error}
                  successMessage="OTC token set on sale contract."
                />
              </>
            ) : (
              <p className="text-xs text-green-700">
                OTC token set on sale — done.
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
