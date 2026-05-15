"use client";

import { useState, useCallback } from "react";
import { isAddress, parseEventLogs, type Abi } from "viem";
import { useAccount, useChainId } from "wagmi";
import { useConnectModal } from "@rainbow-me/rainbowkit";
import { RefreshCw } from "lucide-react";
import { Button, Input, Textarea } from "@/components/atoms";
import { DeployRedemptionModal } from "@/components/molecules/DeployRedemptionModal";
import { OnChainContent } from "@/components/molecules/RedemptionOnChainContent";
import { useContractAction } from "@/hooks/useContractAction";
import { REDEMPTION_FACTORY_ABI } from "@/lib/contracts/abis/redemptionFactory";
import { requireAddress, getAddressUrl } from "@/lib/contracts/addresses";
import {
  updateTokenRedemption,
  type RedemptionType,
  type Token,
} from "@/lib/api/repositories/tokens";

interface RedemptionPanelProps {
  token: Token;
  onUpdated: (updated: Token) => void;
}

const RADIO_OPTIONS: { value: RedemptionType; label: string }[] = [
  { value: "none", label: "Not redeemable" },
  { value: "manual_off_chain", label: "Manual / off-platform" },
  { value: "on_chain", label: "On-chain via RedemptionManager" },
];

export function RedemptionPanel({ token, onUpdated }: RedemptionPanelProps) {
  const [type, setType] = useState<RedemptionType>(token.redemption_type ?? "none");
  const [url, setUrl] = useState(token.redemption_url ?? "");
  const [description, setDescription] = useState(token.redemption_description ?? "");
  // Allowed methods + min-amount config. Stored as comma-separated string on the
  // server ("cash" / "physical" / "cash,physical"). Default to both enabled.
  const initialMethods = (token.redemption_allowed_methods ?? "cash,physical")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const [allowCash, setAllowCash] = useState(initialMethods.includes("cash"));
  const [allowPhysical, setAllowPhysical] = useState(initialMethods.includes("physical"));
  const [minAmount, setMinAmount] = useState(
    token.redemption_min_amount != null ? String(token.redemption_min_amount) : "",
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // Deploy modal state
  const [showDeployModal, setShowDeployModal] = useState(false);
  const [deployedAddress, setDeployedAddress] = useState<`0x${string}` | null>(null);

  const { isConnected } = useAccount();
  const { openConnectModal } = useConnectModal();
  const chainId = useChainId();
  const action = useContractAction();

  const managerAddress = token.redemption_manager_address ?? "";
  const hasManager = isAddress(managerAddress);

  const handleSave = async (): Promise<void> => {
    setError(null);
    setSuccess(false);
    if (type !== "none" && !allowCash && !allowPhysical) {
      setError("Pick at least one fulfilment method (Cash or Physical).");
      return;
    }
    setSaving(true);
    try {
      const methods = type === "none"
        ? "cash,physical"
        : [allowCash && "cash", allowPhysical && "physical"].filter(Boolean).join(",");
      const minVal = type !== "none" && minAmount.trim() !== ""
        ? Number(minAmount)
        : null;
      const updated = await updateTokenRedemption(token.id, {
        redemption_type: type,
        redemption_url: type === "manual_off_chain" ? (url || null) : null,
        redemption_description: type !== "none" ? (description || null) : null,
        // on_chain manager address is managed separately via the deploy flow
        redemption_manager_address: type === "on_chain" ? (managerAddress || null) : null,
        redemption_allowed_methods: methods,
        redemption_min_amount: minVal != null && Number.isFinite(minVal) ? minVal : null,
      });
      onUpdated(updated);
      setSuccess(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const handleOpenDeploy = (): void => {
    if (!isConnected) { openConnectModal?.(); return; }
    action.reset();
    setDeployedAddress(null);
    setShowDeployModal(true);
  };

  const handleDeploy = useCallback(async (): Promise<void> => {
    if (!token.contract_address || !isAddress(token.contract_address)) return;

    let factoryAddr: `0x${string}`;
    try {
      factoryAddr = requireAddress("redemptionFactory");
    } catch {
      return;
    }

    const tokenAddr = token.contract_address as `0x${string}`;
    action.reset();

    const receipt = await action.execute({
      address: factoryAddr,
      abi: REDEMPTION_FACTORY_ABI as unknown as Abi,
      functionName: "deployRedemptionManager",
      args: [tokenAddr],
      gas: 2_000_000n,
    });

    if (!receipt) return;

    // Parse the RedemptionManagerDeployed event from the receipt
    let rmAddress: `0x${string}` | null = null;
    try {
      const logs = parseEventLogs({
        abi: REDEMPTION_FACTORY_ABI as unknown as Abi,
        eventName: "RedemptionManagerDeployed",
        logs: receipt.logs,
      });
      const evt = logs[0];
      if (evt && "args" in evt) {
        const args = evt.args as {
          token: `0x${string}`;
          redemptionManager: `0x${string}`;
          issuer: `0x${string}`;
        };
        rmAddress = args.redemptionManager ?? null;
      }
    } catch (e) {
      console.warn("[RedemptionPanel] Could not parse RedemptionManagerDeployed logs:", e);
    }

    if (!rmAddress) return;

    // PATCH backend with the new address
    try {
      const updated = await updateTokenRedemption(token.id, {
        redemption_type: "on_chain",
        redemption_manager_address: rmAddress,
      });
      onUpdated(updated);
      setDeployedAddress(rmAddress);
    } catch (e) {
      console.error("[RedemptionPanel] Failed to persist RM address:", e);
    }
  }, [token.contract_address, token.id, action, onUpdated]);

  const handleCloseDeployModal = (): void => {
    setShowDeployModal(false);
    setDeployedAddress(null);
    action.reset();
  };

  const rmExplorerUrl = hasManager ? getAddressUrl(chainId, managerAddress) : null;

  return (
    <>
      <div className="bg-white rounded-lg border border-zinc-100 overflow-hidden mt-6">
        <div className="px-5 py-3 border-b border-zinc-100 bg-zinc-50 flex items-center gap-2">
          <RefreshCw className="h-4 w-4 text-[#13636F]" />
          <h2 className="text-sm font-semibold text-zinc-900">Redemption</h2>
          <span className="text-xs text-zinc-400 ml-1">
            — off-chain metadata, no on-chain transaction required
          </span>
        </div>

        <div className="px-5 py-4 space-y-3">
          {RADIO_OPTIONS.map((opt) => {
            const selected = type === opt.value;
            return (
              <div
                key={opt.value}
                className={`rounded-lg border-2 transition-all overflow-hidden ${
                  selected
                    ? "border-[#13636F] bg-[#13636F]/5"
                    : "border-zinc-200 hover:border-zinc-300"
                }`}
              >
                <button
                  type="button"
                  onClick={() => { setType(opt.value); setError(null); setSuccess(false); }}
                  className="w-full flex items-center gap-3 px-4 py-3 text-left"
                >
                  <div
                    className={`w-4 h-4 rounded-full border-2 flex-shrink-0 ${
                      selected ? "border-[#13636F] bg-[#13636F]" : "border-zinc-300"
                    }`}
                  />
                  <span className="text-sm font-medium text-zinc-800">{opt.label}</span>
                </button>

                {selected && opt.value === "manual_off_chain" && (
                  <div className="px-4 pb-4 ml-7 border-t border-zinc-100 pt-3 space-y-3">
                    <Input
                      label="Redemption URL (optional)"
                      placeholder="https://..."
                      value={url}
                      onChange={(e) => setUrl(e.target.value)}
                    />
                    <Textarea
                      label="Instructions (optional)"
                      placeholder="Describe how holders redeem off-platform..."
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      rows={3}
                    />
                  </div>
                )}

                {selected && opt.value === "on_chain" && (
                  <OnChainContent
                    hasManager={hasManager}
                    managerAddress={managerAddress}
                    rmExplorerUrl={rmExplorerUrl}
                    tokenDeployed={!!token.contract_address}
                    onOpenDeploy={handleOpenDeploy}
                    description={description}
                    onDescriptionChange={(v) => setDescription(v)}
                  />
                )}
              </div>
            );
          })}

          {/* Methods + min-amount config — applies to both on-chain and
              manual paths. Hidden when redemption is disabled. */}
          {type !== "none" && (
            <div className="rounded-lg border border-zinc-200 px-4 py-3 space-y-3 bg-white">
              <div>
                <p className="text-xs font-semibold text-zinc-700 mb-1.5">Allowed fulfilment methods</p>
                <div className="flex gap-4">
                  <label className="flex items-center gap-2 text-sm text-zinc-800 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={allowCash}
                      onChange={(e) => setAllowCash(e.target.checked)}
                      className="rounded"
                    />
                    Cash
                  </label>
                  <label className="flex items-center gap-2 text-sm text-zinc-800 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={allowPhysical}
                      onChange={(e) => setAllowPhysical(e.target.checked)}
                      className="rounded"
                    />
                    Physical
                  </label>
                </div>
                <p className="text-[11px] text-zinc-400 mt-1">
                  Buyers can only pick from the methods you enable here.
                </p>
              </div>
              <div>
                <Input
                  label="Minimum redemption amount (tokens)"
                  type="number"
                  placeholder="e.g. 100 — leave blank for no minimum"
                  value={minAmount}
                  onChange={(e) => setMinAmount(e.target.value)}
                  helperText={`Lowest quantity a buyer can submit in a single redemption. In ${token.symbol} units.`}
                />
              </div>
            </div>
          )}

          {error && <p className="text-xs text-red-600 px-1">{error}</p>}
          {success && (
            <p className="text-xs text-[#13636F] px-1">Redemption settings saved.</p>
          )}

          <div className="pt-1">
            <Button
              variant="primary"
              size="sm"
              onClick={handleSave}
              isLoading={saving}
              disabled={saving}
            >
              Save Redemption Settings
            </Button>
          </div>
        </div>
      </div>

      {showDeployModal && (
        <DeployRedemptionModal
          deployedAddress={deployedAddress}
          action={action}
          onDeploy={handleDeploy}
          onClose={handleCloseDeployModal}
        />
      )}
    </>
  );
}
