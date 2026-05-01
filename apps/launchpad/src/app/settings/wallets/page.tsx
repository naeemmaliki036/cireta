"use client";

import { useState, useEffect, useCallback } from "react";
import { useAccount, useSignMessage, useDisconnect } from "wagmi";
import { useConnectModal } from "@rainbow-me/rainbowkit";
import {
  Wallet,
  Plus,
  Trash2,
  Star,
  Copy,
  CheckCircle2,
  AlertCircle,
  Pencil,
  Lock,
  Clock,
} from "lucide-react";
import { Button, Badge } from "@/components/atoms";
import {
  listWallets,
  unlinkWallet,
  setPrimaryWallet,
  linkWallet,
  renameWallet,
  type Wallet as WalletType,
} from "@/lib/api/repositories/wallets.repository";
import { useAuth } from "@/contexts/AuthContext";
import { useConfirmation } from "@/components/molecules/ConfirmationModal";

export default function WalletsPage() {
  const [wallets, setWallets] = useState<WalletType[]>([]);
  const [loading, setLoading] = useState(true);
  const [linking, setLinking] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [copied, setCopied] = useState<string | null>(null);
  const [labelInput, setLabelInput] = useState("");
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const { address, isConnected } = useAccount();
  const { signMessageAsync } = useSignMessage();
  const { disconnect } = useDisconnect();
  const { openConnectModal } = useConnectModal();
  const { user } = useAuth();
  const isVerified = user?.kycStatus === "approved";
  const { showConfirmation, ConfirmationModal } = useConfirmation();

  const connectNewWallet = useCallback(() => {
    if (isConnected) {
      disconnect();
      setTimeout(() => openConnectModal?.(), 300);
    } else {
      openConnectModal?.();
    }
  }, [isConnected, disconnect, openConnectModal]);

  const fetchWallets = useCallback(async () => {
    try {
      const data = await listWallets();
      setWallets(data);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Failed to load wallets";
      console.error("Wallet load error:", e);
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchWallets(); }, [fetchWallets]);

  const alreadyLinked = wallets.some(
    (w) => w.address.toLowerCase() === address?.toLowerCase()
  );

  const handleLink = async () => {
    if (!address) return;
    const trimmed = labelInput.trim();
    if (!trimmed) {
      setError("Please give this wallet a name (e.g. Hardware ledger, Trading wallet).");
      return;
    }
    if (trimmed.length > 50) {
      setError("Wallet name must be 50 characters or fewer.");
      return;
    }
    setLinking(true);
    setError("");
    setSuccess("");
    try {
      const nonce = crypto.randomUUID();
      const signature = await signMessageAsync({ message: `I confirm that I am the owner of this wallet and authorize Cireta (cireta.com) to link it to my account.\n\nThis signature is only used for verification and does not grant access to your funds.\n\nNonce: ${nonce}` });
      await linkWallet({ address, signature, nonce, label: trimmed });
      await fetchWallets();
      setLabelInput("");
      setSuccess("Wallet linked successfully!");
      setTimeout(() => setSuccess(""), 3000);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.toLowerCase().includes("user rejected") || msg.toLowerCase().includes("user denied")) {
        // No-op
      } else {
        setError(msg);
      }
    } finally {
      setLinking(false);
    }
  };

  const handleRemove = async (w: WalletType) => {
    const short = `${w.address.slice(0, 6)}...${w.address.slice(-4)}`;

    if (w.has_contributions) {
      setError(`${w.label || short} has bought tokens in a sale and cannot be removed.`);
      return;
    }

    const confirmTitle = isVerified ? "Request Wallet Removal" : "Remove Wallet";
    const confirmMsg = isVerified
      ? `Are you sure you want to request removal of ${w.label || short}? An admin will review the request. Your wallet stays linked until it's approved.`
      : `Are you sure you want to remove wallet ${w.label || short}? This action cannot be undone.`;

    showConfirmation(
      confirmTitle,
      confirmMsg,
      async () => {
        setError("");
        try {
          const res = await unlinkWallet(w.address);
          await fetchWallets();
          if (res.status === "deletion_requested") {
            setSuccess("Removal request submitted. An admin will review it shortly.");
          } else {
            setSuccess("Wallet removed successfully");
          }
          setTimeout(() => setSuccess(""), 4000);
        } catch (e: unknown) {
          setError(e instanceof Error ? e.message : "Failed to remove wallet");
        }
      },
      { variant: "danger", confirmText: isVerified ? "Request Removal" : "Remove Wallet" }
    );
  };

  const handleRename = async (w: WalletType) => {
    const trimmed = renameValue.trim();
    if (!trimmed) {
      setError("Wallet name cannot be empty.");
      return;
    }
    if (trimmed.length > 50) {
      setError("Wallet name must be 50 characters or fewer.");
      return;
    }
    setError("");
    try {
      await renameWallet(w.address, trimmed);
      await fetchWallets();
      setRenamingId(null);
      setRenameValue("");
      setSuccess("Wallet renamed.");
      setTimeout(() => setSuccess(""), 3000);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to rename wallet");
    }
  };

  const handleSetPrimary = async (addr: string) => {
    const short = `${addr.slice(0, 6)}...${addr.slice(-4)}`;
    showConfirmation(
      "Set Primary Wallet",
      `Are you sure you want to set ${short} as your primary wallet? This will be used for purchases and payouts.`,
      async () => {
        setError("");
        try {
          await setPrimaryWallet(addr);
          await fetchWallets();
          setSuccess("Primary wallet updated");
          setTimeout(() => setSuccess(""), 3000);
        } catch (e: unknown) {
          setError(e instanceof Error ? e.message : "Failed to set primary");
        }
      },
      { confirmText: "Set as Primary" }
    );
  };

  const copyAddress = (addr: string) => {
    navigator.clipboard.writeText(addr);
    setCopied(addr);
    setTimeout(() => setCopied(null), 2000);
  };

  return (
    <div>
      <div className="flex items-end justify-between mb-5 flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-text tracking-tight">Wallets</h1>
          <p className="text-sm text-black/60 mt-1.5">Connect, name and manage your blockchain wallets.</p>
        </div>
        <span className="text-xs text-black/60 bg-box border border-black/10 px-2.5 py-1 rounded-full">
          {wallets.length}/{process.env.NEXT_PUBLIC_MAX_WALLETS || "5"} wallets
        </span>
      </div>

      <div className="space-y-5">

      {isVerified && (
        <div className="flex items-start gap-2.5 text-xs p-3.5 bg-box rounded-xl border border-black/10">
          <Lock className="h-4 w-4 shrink-0 mt-0.5 text-text" />
          <div>
            <p className="font-medium text-text">Verified accounts require admin review for wallet removals.</p>
            <p className="mt-0.5 text-black/60">
              You can&apos;t self-delete a wallet from a KYC-verified profile. Use the
              <span className="font-semibold"> Request removal</span> action and an admin will review.
              Wallets that have already bought tokens in a sale cannot be removed at all.
            </p>
          </div>
        </div>
      )}

      {error && (
        <div className="flex items-center gap-2 text-sm p-3 bg-box rounded-xl border border-black/10">
          <AlertCircle className="h-4 w-4 shrink-0 text-text" />
          <span className="text-text">{error}</span>
        </div>
      )}

      {success && (
        <div className="flex items-center gap-2 text-sm p-3 bg-darkAqua/10 rounded-xl border border-darkAqua/20">
          <CheckCircle2 className="h-4 w-4 shrink-0 text-darkAqua" />
          <span className="text-darkAqua">{success}</span>
        </div>
      )}

      {/* Linked Wallets */}
      <div className="bg-white rounded-2xl border border-black/10 overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-black/40 text-sm">Loading wallets...</div>
        ) : wallets.length === 0 && isConnected && address ? (
          <FirstWalletLinkPanel
            address={address}
            labelInput={labelInput}
            setLabelInput={setLabelInput}
            handleLink={handleLink}
            linking={linking}
          />
        ) : wallets.length === 0 ? (
          <div className="p-10 text-center">
            <div className="w-14 h-14 rounded-2xl bg-box flex items-center justify-center mx-auto mb-3">
              <Wallet className="h-6 w-6 text-darkAqua" />
            </div>
            <p className="font-medium text-text mb-1">No wallets linked</p>
            <p className="text-sm text-black/50 mb-5">Connect a wallet to start buying in token sales</p>
            <Button
              variant="primary"
              size="sm"
              leftIcon={<Plus className="h-4 w-4" />}
              onClick={connectNewWallet}
            >
              Connect Wallet
            </Button>
          </div>
        ) : (
          <div className="divide-y divide-black/5">
            {wallets.map((w) => {
              const removeDisabled = w.is_primary || w.has_contributions || w.has_pending_deletion_request;
              const removeTitle = w.is_primary
                ? "Set another wallet as primary first"
                : w.has_contributions
                  ? "This wallet has bought tokens in a sale and cannot be removed"
                  : w.has_pending_deletion_request
                    ? "Removal request is already pending admin review"
                    : isVerified
                      ? "Request removal (admin review)"
                      : "Remove wallet";
              return (
                <div key={w.id} className="flex items-center justify-between px-5 py-4 hover:bg-box/40 transition-colors">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                      w.is_primary ? "bg-darkAqua/10" : "bg-box"
                    }`}>
                      <Wallet className={`h-5 w-5 ${w.is_primary ? "text-darkAqua" : "text-black/40"}`} />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        {renamingId === w.id ? (
                          <div className="flex items-center gap-2">
                            <input
                              type="text"
                              autoFocus
                              maxLength={50}
                              value={renameValue}
                              onChange={(e) => setRenameValue(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") handleRename(w);
                                if (e.key === "Escape") {
                                  setRenamingId(null);
                                  setRenameValue("");
                                }
                              }}
                              className="text-sm font-medium text-text border-b border-darkAqua focus:outline-none px-1 py-0.5 max-w-[180px]"
                            />
                            <button
                              onClick={() => handleRename(w)}
                              className="text-xs text-darkAqua font-medium hover:underline"
                            >
                              Save
                            </button>
                            <button
                              onClick={() => {
                                setRenamingId(null);
                                setRenameValue("");
                              }}
                              className="text-xs text-black/40 hover:underline"
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <>
                            <span className="text-sm font-medium text-text truncate max-w-[180px]">
                              {w.label || <span className="text-black/30 italic">(unnamed)</span>}
                            </span>
                            <button
                              onClick={() => {
                                setRenamingId(w.id);
                                setRenameValue(w.label || "");
                              }}
                              className="text-black/20 hover:text-darkAqua transition-colors"
                              title="Rename wallet"
                            >
                              <Pencil className="h-3 w-3" />
                            </button>
                          </>
                        )}
                        {w.is_primary && <Badge variant="active" size="sm">Primary</Badge>}
                        {w.is_safe && <Badge variant="default" size="sm">Safe</Badge>}
                        {w.has_contributions && (
                          <Badge variant="default" size="sm">Has purchases</Badge>
                        )}
                        {w.has_pending_deletion_request && (
                          <span className="inline-flex items-center gap-1 text-xs text-black/60 bg-box border border-black/10 px-2 py-0.5 rounded-full">
                            <Clock className="h-3 w-3" /> Pending admin review
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="font-mono text-xs text-black/40">
                          {w.address.slice(0, 6)}...{w.address.slice(-4)}
                        </span>
                        <button
                          onClick={() => copyAddress(w.address)}
                          className="text-black/20 hover:text-darkAqua transition-colors"
                          title="Copy address"
                        >
                          {copied === w.address ? (
                            <CheckCircle2 className="h-3 w-3 text-darkAqua" />
                          ) : (
                            <Copy className="h-3 w-3" />
                          )}
                        </button>
                        <span className="text-xs text-black/20">·</span>
                        <span className="text-xs text-black/40">
                          Linked {new Date(w.linked_at).toLocaleDateString()}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {!w.is_primary && !w.has_contributions && (
                      <button
                        onClick={() => handleSetPrimary(w.address)}
                        className="p-2 rounded-lg text-black/30 hover:text-darkAqua hover:bg-darkAqua/10 transition-colors"
                        title="Set as primary"
                      >
                        <Star className="h-4 w-4" />
                      </button>
                    )}
                    <button
                      onClick={() => !removeDisabled && handleRemove(w)}
                      disabled={removeDisabled}
                      className="p-2 rounded-lg text-black/30 hover:text-text hover:bg-box transition-colors disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:text-black/30"
                      title={removeTitle}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Link New Wallet — only show when wallets exist and connected wallet is not already linked */}
      {wallets.length > 0 && isConnected && address && !alreadyLinked && (
        <div className="bg-white rounded-2xl border border-black/10 p-5">
          <h3 className="text-sm font-semibold text-text mb-3">Link New Wallet</h3>
          <div className="p-4 bg-box rounded-xl border border-black/10 space-y-3">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-darkAqua/10 flex items-center justify-center">
                <Wallet className="h-4 w-4 text-darkAqua" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium text-text">
                  <span className="font-mono">{address.slice(0, 6)}...{address.slice(-4)}</span>
                </p>
                <p className="text-xs text-black/50">Sign a message to prove ownership and link this wallet</p>
              </div>
            </div>
            <input
              type="text"
              value={labelInput}
              onChange={(e) => setLabelInput(e.target.value)}
              placeholder="Name this wallet (e.g. Hardware ledger)"
              maxLength={50}
              className="w-full px-3 py-2 text-sm border border-black/10 rounded-lg focus:outline-none focus:border-darkAqua focus:ring-1 focus:ring-darkAqua/20"
            />
            <div className="flex justify-end">
              <Button onClick={handleLink} disabled={linking || !labelInput.trim()} variant="primary" size="sm">
                {linking ? "Signing..." : "Link Wallet"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Add another wallet — show when under the cap */}
      {wallets.length > 0 && (!isConnected || alreadyLinked) && wallets.length < Number(process.env.NEXT_PUBLIC_MAX_WALLETS || "5") && (
        <div className="bg-white rounded-2xl border border-black/10 p-5">
          <div className="flex items-center justify-between p-4 bg-box rounded-xl border border-dashed border-black/15">
            <div>
              <p className="text-sm font-medium text-text">Add another wallet</p>
              <p className="text-xs text-black/50 mt-0.5">You can link up to {process.env.NEXT_PUBLIC_MAX_WALLETS || "5"} wallets to your account</p>
            </div>
            <Button
              onClick={connectNewWallet}
              variant="primary"
              size="sm"
              leftIcon={<Plus className="h-4 w-4" />}
            >
              Connect Wallet
            </Button>
          </div>
        </div>
      )}
      <ConfirmationModal />
      </div>
    </div>
  );
}

interface FirstWalletLinkPanelProps {
  address: string;
  labelInput: string;
  setLabelInput: (v: string) => void;
  handleLink: () => void;
  linking: boolean;
}

function FirstWalletLinkPanel({
  address,
  labelInput,
  setLabelInput,
  handleLink,
  linking,
}: FirstWalletLinkPanelProps) {
  return (
    <div className="p-6">
      <div className="p-4 bg-box rounded-xl border border-black/10 space-y-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-darkAqua/10 flex items-center justify-center">
            <Wallet className="h-5 w-5 text-darkAqua" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-medium text-text">
              <span className="font-mono">{address.slice(0, 6)}...{address.slice(-4)}</span>
            </p>
            <p className="text-xs text-black/50">Sign a message to prove ownership and link this wallet</p>
          </div>
        </div>
        <input
          type="text"
          value={labelInput}
          onChange={(e) => setLabelInput(e.target.value)}
          placeholder="Name this wallet (e.g. Hardware ledger)"
          maxLength={50}
          className="w-full px-3 py-2 text-sm border border-black/10 rounded-lg focus:outline-none focus:border-darkAqua focus:ring-1 focus:ring-darkAqua/20"
        />
        <div className="flex justify-end">
          <Button onClick={handleLink} disabled={linking || !labelInput.trim()} variant="primary" size="sm">
            {linking ? "Signing..." : "Link Wallet"}
          </Button>
        </div>
      </div>
    </div>
  );
}
