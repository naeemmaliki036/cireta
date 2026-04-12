"use client";

import { useState } from "react";
import { Scissors, FastForward, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/atoms";
import { TransactionStatus } from "@/components/molecules/TransactionStatus";
import { useContractAction } from "@/hooks/useContractAction";
import { SALE_ABI } from "@/lib/contracts/abis/sale";
import { updatePhase, deletePhase } from "@/lib/api/repositories/sales";
import type { Abi } from "viem";

interface PhaseActionsProps {
  saleId: string;
  contractAddress: string | null;
  phase: {
    id: string;
    name: string;
    start_time: string;
    end_time: string;
    price_per_token: string;
    allocation: string;
    min_contribution: string;
    max_contribution: string;
    whitelist_only?: boolean;
    allocation_mode: string;
    deployed_on_chain: boolean;
    on_chain_phase_id: number | null;
  };
  phaseIndex: number;
  phaseStatus: "active" | "upcoming" | "ended";
  onReload: () => void;
}

export function PhaseActions({
  saleId,
  contractAddress,
  phase,
  phaseIndex,
  phaseStatus,
  onReload,
}: PhaseActionsProps) {
  const [showShortenInput, setShowShortenInput] = useState(false);
  const [showAdvanceInput, setShowAdvanceInput] = useState(false);
  const [showEditForm, setShowEditForm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [editValues, setEditValues] = useState({
    name: phase.name,
    price_per_token: phase.price_per_token,
    allocation: phase.allocation,
    start_time: phase.start_time.slice(0, 16),
    end_time: phase.end_time.slice(0, 16),
  });
  const [message, setMessage] = useState("");

  const shortenAction = useContractAction();
  const advanceAction = useContractAction();

  const isDeployed = phase.deployed_on_chain;
  const canShorten = isDeployed && contractAddress && (phaseStatus === "active" || phaseStatus === "upcoming");
  const canAdvance = isDeployed && contractAddress && phaseStatus === "upcoming";
  const canEdit = !isDeployed;
  const canDelete = !isDeployed;

  const handleShorten = async () => {
    if (!contractAddress) return;
    const newEnd = Math.floor(Date.now() / 1000) + 10; // 10 seconds from now
    const receipt = await shortenAction.execute({
      address: contractAddress as `0x${string}`,
      abi: SALE_ABI as unknown as Abi,
      functionName: "shortenPhase",
      args: [BigInt(phaseIndex), BigInt(newEnd)],
    });
    if (receipt) {
      // Sync to DB
      const endDate = new Date(newEnd * 1000).toISOString();
      await updatePhase(saleId, phase.id, { end_time: endDate });
      setShowShortenInput(false);
      onReload();
    }
  };

  const handleAdvance = async () => {
    if (!contractAddress) return;
    const newStart = Math.floor(Date.now() / 1000) + 30; // 30 seconds from now
    const receipt = await advanceAction.execute({
      address: contractAddress as `0x${string}`,
      abi: SALE_ABI as unknown as Abi,
      functionName: "advancePhaseStart",
      args: [BigInt(phaseIndex), BigInt(newStart)],
    });
    if (receipt) {
      const startDate = new Date(newStart * 1000).toISOString();
      await updatePhase(saleId, phase.id, { start_time: startDate });
      setShowAdvanceInput(false);
      onReload();
    }
  };

  const handleEdit = async () => {
    setMessage("");
    try {
      await updatePhase(saleId, phase.id, {
        name: editValues.name,
        price_per_token: editValues.price_per_token,
        allocation: editValues.allocation,
        start_time: new Date(editValues.start_time).toISOString(),
        end_time: new Date(editValues.end_time).toISOString(),
      });
      setShowEditForm(false);
      onReload();
    } catch {
      setMessage("Failed to update phase");
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    setMessage("");
    try {
      await deletePhase(saleId, phase.id);
      onReload();
    } catch {
      setMessage("Failed to delete phase");
      setDeleting(false);
    }
  };

  return (
    <div className="mt-3 space-y-2">
      {/* Action buttons */}
      <div className="flex items-center gap-2 flex-wrap">
        {canShorten && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => { setShowShortenInput(!showShortenInput); setShowAdvanceInput(false); setShowEditForm(false); }}
            disabled={shortenAction.isPending || shortenAction.isConfirming}
          >
            <Scissors className="w-3 h-3 mr-1" /> End Phase Now
          </Button>
        )}
        {canAdvance && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => { setShowAdvanceInput(!showAdvanceInput); setShowShortenInput(false); setShowEditForm(false); }}
            disabled={advanceAction.isPending || advanceAction.isConfirming}
          >
            <FastForward className="w-3 h-3 mr-1" /> Start Earlier
          </Button>
        )}
        {canEdit && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => { setShowEditForm(!showEditForm); setShowShortenInput(false); setShowAdvanceInput(false); }}
          >
            <Pencil className="w-3 h-3 mr-1" /> Edit
          </Button>
        )}
        {canDelete && (
          <Button
            variant="outline"
            size="sm"
            onClick={handleDelete}
            disabled={deleting}
            className="text-red-600 border-red-200 hover:bg-red-50"
          >
            <Trash2 className="w-3 h-3 mr-1" /> {deleting ? "Deleting..." : "Delete"}
          </Button>
        )}
      </div>

      {/* Shorten confirmation */}
      {showShortenInput && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
          <p className="text-sm text-amber-800 mb-2">
            This will end the phase immediately on-chain. Buyers will no longer be able to purchase in this phase.
            You can then add a new phase for the next round.
          </p>
          <div className="flex gap-2">
            <Button size="sm" onClick={handleShorten} disabled={shortenAction.isPending || shortenAction.isConfirming}>
              {shortenAction.isPending ? "Signing..." : shortenAction.isConfirming ? "Confirming..." : "Confirm End Phase"}
            </Button>
            <Button variant="outline" size="sm" onClick={() => setShowShortenInput(false)}>Cancel</Button>
          </div>
          <TransactionStatus
            isPending={shortenAction.isPending} isConfirming={shortenAction.isConfirming}
            isConfirmed={shortenAction.isConfirmed} txHash={shortenAction.txHash}
            txUrl={shortenAction.txUrl} error={shortenAction.error}
            successMessage="Phase ended successfully."
          />
        </div>
      )}

      {/* Advance confirmation */}
      {showAdvanceInput && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
          <p className="text-sm text-blue-800 mb-2">
            This will advance the phase start time to now (30 seconds from submission).
            The phase will become active immediately after the transaction confirms.
          </p>
          <div className="flex gap-2">
            <Button size="sm" onClick={handleAdvance} disabled={advanceAction.isPending || advanceAction.isConfirming}>
              {advanceAction.isPending ? "Signing..." : advanceAction.isConfirming ? "Confirming..." : "Confirm Start Now"}
            </Button>
            <Button variant="outline" size="sm" onClick={() => setShowAdvanceInput(false)}>Cancel</Button>
          </div>
          <TransactionStatus
            isPending={advanceAction.isPending} isConfirming={advanceAction.isConfirming}
            isConfirmed={advanceAction.isConfirmed} txHash={advanceAction.txHash}
            txUrl={advanceAction.txUrl} error={advanceAction.error}
            successMessage="Phase start time advanced."
          />
        </div>
      )}

      {/* Edit form (tentative phases only) */}
      {showEditForm && (
        <div className="bg-white border border-black/10 rounded-lg p-4 space-y-3">
          <p className="text-sm font-medium text-text">Edit Tentative Phase</p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-black/40">Name</label>
              <input
                value={editValues.name}
                onChange={(e) => setEditValues((v) => ({ ...v, name: e.target.value }))}
                className="w-full border border-black/10 rounded px-2 py-1.5 text-sm"
              />
            </div>
            <div>
              <label className="text-xs text-black/40">Price per Token</label>
              <input
                value={editValues.price_per_token}
                onChange={(e) => setEditValues((v) => ({ ...v, price_per_token: e.target.value }))}
                className="w-full border border-black/10 rounded px-2 py-1.5 text-sm"
              />
            </div>
            <div>
              <label className="text-xs text-black/40">Allocation</label>
              <input
                value={editValues.allocation}
                onChange={(e) => setEditValues((v) => ({ ...v, allocation: e.target.value }))}
                className="w-full border border-black/10 rounded px-2 py-1.5 text-sm"
              />
            </div>
            <div>
              <label className="text-xs text-black/40">Start Time</label>
              <input
                type="datetime-local"
                value={editValues.start_time}
                onChange={(e) => setEditValues((v) => ({ ...v, start_time: e.target.value }))}
                className="w-full border border-black/10 rounded px-2 py-1.5 text-sm"
              />
            </div>
            <div>
              <label className="text-xs text-black/40">End Time</label>
              <input
                type="datetime-local"
                value={editValues.end_time}
                onChange={(e) => setEditValues((v) => ({ ...v, end_time: e.target.value }))}
                className="w-full border border-black/10 rounded px-2 py-1.5 text-sm"
              />
            </div>
          </div>
          <div className="flex gap-2">
            <Button size="sm" onClick={handleEdit}>Save Changes</Button>
            <Button variant="outline" size="sm" onClick={() => setShowEditForm(false)}>Cancel</Button>
          </div>
          {message && <p className="text-xs text-red-500">{message}</p>}
        </div>
      )}

      {message && !showEditForm && <p className="text-xs text-red-500">{message}</p>}
    </div>
  );
}
