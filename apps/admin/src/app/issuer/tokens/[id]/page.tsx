"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { ArrowLeft, Shield, Pause, Play } from "lucide-react";
import Link from "next/link";
import { Button, Badge, Spinner } from "@/components/atoms";
import { WalletBadge } from "@/components/molecules";
import { IssuerDashboardLayout } from "@/components/templates";
import { getToken as fetchToken, type Token } from "@/lib/api/repositories/tokens";
import { pauseToken, unpauseToken } from "@/lib/api/repositories/compliance";
import { getAccessToken } from "@/lib/api/client";

function getAuthToken() {
  return getAccessToken() ?? "";
}

export default function TokenDetailPage({ params: paramsPromise }: { params: Promise<{ id: string }> }) {
  const [token, setToken] = useState<Token | null>(null);
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState(false);
  const [resolvedId, setResolvedId] = useState<string>("");

  useEffect(() => {
    paramsPromise.then((p) => setResolvedId(p.id));
  }, [paramsPromise]);

  useEffect(() => {
    if (!resolvedId) return;
    (async () => {
      try {
        const data = await fetchToken(resolvedId, getAuthToken());
        setToken(data);
      } catch { /* 404 */ }
      finally { setLoading(false); }
    })();
  }, [resolvedId]);

  const handlePauseToggle = async () => {
    if (!token) return;
    setToggling(true);
    const auth = getAuthToken();
    try {
      if (token.is_paused) {
        await unpauseToken(token.id, "Admin action", auth);
        setToken({ ...token, is_paused: false });
      } else {
        await pauseToken(token.id, "Admin action", auth);
        setToken({ ...token, is_paused: true });
      }
    } catch { /* TODO: toast */ }
    setToggling(false);
  };

  if (loading) {
    return (
      <IssuerDashboardLayout title="Token Details" description="">
        <div className="flex justify-center py-24"><Spinner /></div>
      </IssuerDashboardLayout>
    );
  }

  if (!token) {
    return (
      <IssuerDashboardLayout title="Token Details" description="">
        <p className="text-center text-darkBlack/40 py-24">Token not found</p>
      </IssuerDashboardLayout>
    );
  }

  return (
    <IssuerDashboardLayout title={`${token.name} (${token.symbol})`} description={`Token ID: ${token.id}`}>
      <div className="mb-6">
        <Link href="/issuer/tokens" className="flex items-center gap-2 text-sm text-darkBlack/50 hover:text-text">
          <ArrowLeft className="h-4 w-4" /> Back to Tokens
        </Link>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
          className="bg-white rounded-3xl p-6 border border-darkBlack/10">
          <h2 className="text-lg font-semibold text-text mb-4">Token Info</h2>
          <div className="space-y-3">
            {[
              { label: "Name", value: token.name },
              { label: "Symbol", value: token.symbol },
              { label: "Asset Type", value: token.asset_type },
              { label: "Total Supply", value: parseFloat(token.total_supply).toLocaleString() },
              { label: "Status", value: <Badge variant={token.is_paused ? "pending" : "active"} size="sm">{token.is_paused ? "Paused" : "Active"}</Badge> },
            ].map(({ label, value }) => (
              <div key={label} className="flex justify-between py-2 border-b border-darkBlack/5 last:border-0">
                <span className="text-sm text-darkBlack/50">{label}</span>
                <span className="text-sm font-medium text-text">{value}</span>
              </div>
            ))}
          </div>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
          className="bg-white rounded-3xl p-6 border border-darkBlack/10">
          <h2 className="text-lg font-semibold text-text mb-4">Contract</h2>
          {token.contract_address ? (
            <WalletBadge address={token.contract_address} />
          ) : (
            <p className="text-sm text-darkBlack/40">Not yet deployed on-chain</p>
          )}

          <div className="mt-6 pt-4 border-t border-darkBlack/10">
            <h3 className="text-sm font-semibold text-text mb-3">Actions</h3>
            <div className="flex gap-3">
              <Button variant={token.is_paused ? "primary" : "outline"} size="sm"
                leftIcon={token.is_paused ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
                onClick={handlePauseToggle} disabled={toggling || !token.contract_address}>
                {token.is_paused ? "Unpause" : "Pause"} Token
              </Button>
              <Link href={`/issuer/compliance`}>
                <Button variant="outline" size="sm" leftIcon={<Shield className="h-4 w-4" />}>
                  Compliance
                </Button>
              </Link>
            </div>
          </div>
        </motion.div>
      </div>
    </IssuerDashboardLayout>
  );
}
