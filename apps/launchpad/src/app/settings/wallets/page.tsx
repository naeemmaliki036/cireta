"use client";

import { useState, useEffect, useCallback } from "react";
import { useAccount, useSignMessage, useDisconnect } from "wagmi";
import { useConnectModal } from "@rainbow-me/rainbowkit";
import { Wallet, Plus, Trash2, Star, Copy, CheckCircle2, AlertCircle } from "lucide-react";
import { Button, Badge } from "@/components/atoms";
import { listWallets, unlinkWallet, setPrimaryWallet, type Wallet as WalletType } from "@/lib/api/repositories/wallets.repository";

export default function WalletsPage() {
  const [wallets, setWallets] = useState<WalletType[]>([]);
  const [loading, setLoading] = useState(true);
  const [linking, setLinking] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [copied, setCopied] = useState<string | null>(null);
  const { address, isConnected } = useAccount();
  const { signMessageAsync } = useSignMessage();
  const { disconnect } = useDisconnect();
  const { openConnectModal } = useConnectModal();

  const connectNewWallet = useCallback(() => {
    if (isConnected) {
      disconnect();
      // Small delay to let disconnect complete before opening modal
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
    setLinking(true);
    setError("");
    setSuccess("");
    try {
      const nonce = crypto.randomUUID();
      const signature = await signMessageAsync({ message: `I confirm that I am the owner of this wallet and authorize Cireta (cireta.com) to link it to my account.\n\nThis signature is only used for verification and does not grant access to your funds.\n\nNonce: ${nonce}` });
      const { linkWallet } = await import("@/lib/api/repositories/wallets.repository");
      await linkWallet({ address, signature, nonce });
      await fetchWallets();
      setSuccess("Wallet linked successfully!");
      setTimeout(() => setSuccess(""), 3000);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      // Silently ignore user rejections (MetaMask cancel, etc.)
      if (msg.toLowerCase().includes("user rejected") || msg.toLowerCase().includes("user denied")) {
        // No-op
      } else {
        setError(msg);
      }
    } finally {
      setLinking(false);
    }
  };

  const handleRemove = async (addr: string) => {
    const short = `${addr.slice(0, 6)}...${addr.slice(-4)}`;
    if (!window.confirm(`Remove wallet ${short}? This action cannot be undone.`)) return;
    setError("");
    try {
      await unlinkWallet(addr);
      await fetchWallets();
      setSuccess("Wallet removed successfully");
      setTimeout(() => setSuccess(""), 3000);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to remove wallet");
    }
  };

  const handleSetPrimary = async (addr: string) => {
    const short = `${addr.slice(0, 6)}...${addr.slice(-4)}`;
    if (!window.confirm(`Set ${short} as your primary wallet? This will be used for investments and payouts.`)) return;
    setError("");
    try {
      await setPrimaryWallet(addr);
      await fetchWallets();
      setSuccess("Primary wallet updated");
      setTimeout(() => setSuccess(""), 3000);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to set primary");
    }
  };

  const copyAddress = (addr: string) => {
    navigator.clipboard.writeText(addr);
    setCopied(addr);
    setTimeout(() => setCopied(null), 2000);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-gray-900 mb-1">Wallets</h2>
          <p className="text-gray-500 text-sm">Connect and manage your blockchain wallets.</p>
        </div>
        <span className="text-xs text-gray-400 bg-gray-100 px-2.5 py-1 rounded-full">
          {wallets.length}/{process.env.NEXT_PUBLIC_MAX_WALLETS || "5"} wallets
        </span>
      </div>

      {error && (
        <div className="flex items-center gap-2 text-red-600 text-sm p-3 bg-red-50 rounded-xl border border-red-200">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      {success && (
        <div className="flex items-center gap-2 text-emerald-600 text-sm p-3 bg-emerald-50 rounded-xl border border-emerald-200">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          {success}
        </div>
      )}

      {/* Linked Wallets */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-gray-400 text-sm">Loading wallets...</div>
        ) : wallets.length === 0 && isConnected && address ? (
          <div className="p-6">
            <div className="flex items-center justify-between p-4 bg-gray-50 rounded-xl border border-gray-100">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-darkAqua/10 flex items-center justify-center">
                  <Wallet className="h-5 w-5 text-darkAqua" />
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-900">
                    <span className="font-mono">{address.slice(0, 6)}...{address.slice(-4)}</span>
                  </p>
                  <p className="text-xs text-gray-400">Sign a message to prove ownership and link this wallet</p>
                </div>
              </div>
              <Button onClick={handleLink} disabled={linking} variant="primary" size="sm">
                {linking ? "Signing..." : "Link Wallet"}
              </Button>
            </div>
          </div>
        ) : wallets.length === 0 ? (
          <div className="p-10 text-center">
            <div className="w-14 h-14 rounded-2xl bg-gray-100 flex items-center justify-center mx-auto mb-3">
              <Wallet className="h-6 w-6 text-gray-400" />
            </div>
            <p className="font-medium text-gray-900 mb-1">No wallets linked</p>
            <p className="text-sm text-gray-400 mb-5">Connect a wallet to start investing in token sales</p>
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
          <div className="divide-y divide-gray-100">
            {wallets.map((w) => (
              <div key={w.id} className="flex items-center justify-between px-5 py-4 hover:bg-gray-50/50 transition-colors">
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                    w.is_primary ? "bg-darkAqua/10" : "bg-gray-100"
                  }`}>
                    <Wallet className={`h-5 w-5 ${w.is_primary ? "text-darkAqua" : "text-gray-400"}`} />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-sm font-medium text-gray-900">
                        {w.address.slice(0, 6)}...{w.address.slice(-4)}
                      </span>
                      <button
                        onClick={() => copyAddress(w.address)}
                        className="text-gray-300 hover:text-darkAqua transition-colors"
                        title="Copy address"
                      >
                        {copied === w.address ? (
                          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                        ) : (
                          <Copy className="h-3.5 w-3.5" />
                        )}
                      </button>
                      {w.is_primary && <Badge variant="active" size="sm">Primary</Badge>}
                      {w.is_safe && <Badge variant="default" size="sm">Safe</Badge>}
                    </div>
                    <p className="text-xs text-gray-400 mt-0.5">
                      Linked {new Date(w.linked_at).toLocaleDateString()}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-1.5">
                  {!w.is_primary && (
                    <button
                      onClick={() => handleSetPrimary(w.address)}
                      className="p-2 rounded-lg text-gray-400 hover:text-amber-500 hover:bg-amber-50 transition-colors"
                      title="Set as primary"
                    >
                      <Star className="h-4 w-4" />
                    </button>
                  )}
                  {!w.is_primary && (
                    <button
                      onClick={() => handleRemove(w.address)}
                      className="p-2 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors"
                      title="Remove wallet"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Link New Wallet — only show when wallets exist and connected wallet is not already linked */}
      {wallets.length > 0 && isConnected && address && !alreadyLinked && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <h3 className="text-sm font-semibold text-gray-900 mb-3">Link New Wallet</h3>
          <div className="flex items-center justify-between p-4 bg-gray-50 rounded-xl border border-gray-100">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-darkAqua/10 flex items-center justify-center">
                <Wallet className="h-4 w-4 text-darkAqua" />
              </div>
              <div>
                <p className="text-sm font-medium text-gray-900">
                  <span className="font-mono">{address.slice(0, 6)}...{address.slice(-4)}</span>
                </p>
                <p className="text-xs text-gray-400">Sign a message to prove ownership and link this wallet</p>
              </div>
            </div>
            <Button onClick={handleLink} disabled={linking} variant="primary" size="sm">
              {linking ? "Signing..." : "Link Wallet"}
            </Button>
          </div>
        </div>
      )}

      {/* Add another wallet — show when under the cap */}
      {wallets.length > 0 && (!isConnected || alreadyLinked) && wallets.length < Number(process.env.NEXT_PUBLIC_MAX_WALLETS || "5") && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <div className="flex items-center justify-between p-4 bg-gray-50 rounded-xl border border-dashed border-gray-200">
            <div>
              <p className="text-sm font-medium text-gray-700">Add another wallet</p>
              <p className="text-xs text-gray-400 mt-0.5">You can link up to {process.env.NEXT_PUBLIC_MAX_WALLETS || "5"} wallets to your account</p>
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
    </div>
  );
}
