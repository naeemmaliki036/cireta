"use client";

import { useState, useEffect } from "react";
import { useAccount, useSignMessage, useConnect } from "wagmi";
import { Button, Badge } from "@/components/atoms";
import { listWallets, unlinkWallet, setPrimaryWallet, type Wallet } from "@/lib/api/repositories/wallets.repository";

export default function WalletsPage() {
  const [wallets, setWallets] = useState<Wallet[]>([]);
  const [loading, setLoading] = useState(true);
  const [linking, setLinking] = useState(false);
  const [error, setError] = useState("");
  const { address, isConnected } = useAccount();
  const { signMessageAsync } = useSignMessage();
  const { connect, connectors } = useConnect();

  const fetchWallets = async () => {
    try {
      const data = await listWallets();
      setWallets(data);
    } catch {
      setError("Failed to load wallets");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchWallets(); }, []);

  const handleLink = async () => {
    if (!address) return;
    setLinking(true);
    setError("");
    try {
      const nonce = crypto.randomUUID();
      const signature = await signMessageAsync({ message: `Link wallet to Cireta account: ${nonce}` });
      const { linkWallet } = await import("@/lib/api/repositories/wallets.repository");
      await linkWallet({ address, signature, nonce });
      await fetchWallets();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to link wallet");
    } finally {
      setLinking(false);
    }
  };

  const handleRemove = async (addr: string) => {
    try {
      await unlinkWallet(addr);
      await fetchWallets();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to remove wallet");
    }
  };

  const handleSetPrimary = async (addr: string) => {
    try {
      await setPrimaryWallet(addr);
      await fetchWallets();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to set primary");
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-white mb-1">Wallets</h2>
        <p className="text-white/40 text-sm">Connect wallets to invest in token sales.</p>
      </div>

      {error && <p className="text-red-400 text-sm">{error}</p>}

      <div className="bg-white/5 rounded-xl p-6 space-y-3">
        {loading ? (
          <p className="text-white/40 text-sm">Loading...</p>
        ) : wallets.length === 0 ? (
          <p className="text-white/40 text-sm">No wallets linked yet.</p>
        ) : (
          wallets.map((w) => (
            <div key={w.id} className="flex items-center justify-between py-3 border-b border-white/5 last:border-0">
              <div className="space-y-0.5">
                <div className="flex items-center gap-2">
                  <span className="text-white font-mono text-sm">
                    {w.address.slice(0, 6)}...{w.address.slice(-4)}
                  </span>
                  {w.is_primary && <Badge variant="active">Primary</Badge>}
                  {w.is_safe && <Badge variant="default">Safe</Badge>}
                </div>
                <p className="text-white/30 text-xs">Linked {new Date(w.linked_at).toLocaleDateString()}</p>
              </div>
              <div className="flex gap-2">
                {!w.is_primary && (
                  <Button variant="secondary" size="sm" onClick={() => handleSetPrimary(w.address)}>
                    Set Primary
                  </Button>
                )}
                {!w.is_primary && (
                  <Button variant="secondary" size="sm" onClick={() => handleRemove(w.address)}>
                    Remove
                  </Button>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      <div className="bg-white/5 rounded-xl p-6">
        <h3 className="text-sm font-medium text-white mb-3">Link New Wallet</h3>
        {isConnected && address ? (
          <div className="space-y-3">
            <p className="text-white/60 text-sm">
              Connected: <span className="text-white font-mono">{address.slice(0, 6)}...{address.slice(-4)}</span>
            </p>
            <Button onClick={handleLink} disabled={linking} variant="primary" size="sm">
              {linking ? "Signing..." : "Link This Wallet"}
            </Button>
          </div>
        ) : (
          <div className="space-y-2">
            <p className="text-white/40 text-sm mb-3">Connect a wallet first to link it to your account.</p>
            {connectors.slice(0, 3).map((connector) => (
              <Button key={connector.id} variant="secondary" size="sm" onClick={() => connect({ connector })}>
                Connect {connector.name}
              </Button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
