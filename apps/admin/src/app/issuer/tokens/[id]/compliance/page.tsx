"use client";

import { useState, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import { ArrowLeft, Plus, Shield, Loader2 } from "lucide-react";
import Link from "next/link";
import { Button, Badge, Spinner, Input } from "@/components/atoms";
import { IssuerDashboardLayout } from "@/components/templates";
import { getToken as fetchToken, type Token } from "@/lib/api/repositories/tokens";
import {
  getComplianceStatus,
  addComplianceModule,
  removeComplianceModule,
  type ComplianceStatus,
} from "@/lib/api/repositories/token-compliance";
import { ModuleCard } from "./ComplianceModuleCards";

export default function TokenCompliancePage({
  params: paramsPromise,
}: {
  params: Promise<{ id: string }>;
}) {
  const [tokenId, setTokenId] = useState("");
  const [token, setToken] = useState<Token | null>(null);
  const [compliance, setCompliance] = useState<ComplianceStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showAddModule, setShowAddModule] = useState(false);
  const [newModuleAddress, setNewModuleAddress] = useState("");
  const [addingModule, setAddingModule] = useState(false);
  const [removingModule, setRemovingModule] = useState<string | null>(null);

  useEffect(() => {
    paramsPromise.then((p) => setTokenId(p.id));
  }, [paramsPromise]);

  const loadData = useCallback(async () => {
    if (!tokenId) return;
    setLoading(true);
    setError("");
    try {
      const [tokenData, complianceData] = await Promise.all([
        fetchToken(tokenId),
        getComplianceStatus(tokenId),
      ]);
      setToken(tokenData);
      setCompliance(complianceData);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load compliance data");
    }
    setLoading(false);
  }, [tokenId]);

  useEffect(() => { loadData(); }, [loadData]);

  const handleAddModule = async () => {
    if (!newModuleAddress) return;
    setAddingModule(true);
    try {
      await addComplianceModule(tokenId, newModuleAddress);
      setNewModuleAddress("");
      setShowAddModule(false);
      await loadData();
    } catch { /* toast */ }
    setAddingModule(false);
  };

  const handleRemoveModule = async (addr: string) => {
    setRemovingModule(addr);
    try {
      await removeComplianceModule(tokenId, addr);
      await loadData();
    } catch { /* toast */ }
    setRemovingModule(null);
  };

  if (loading) {
    return (
      <IssuerDashboardLayout title="Compliance Modules" description="">
        <div className="flex justify-center py-24"><Spinner /></div>
      </IssuerDashboardLayout>
    );
  }

  if (error || !token) {
    return (
      <IssuerDashboardLayout title="Compliance Modules" description="">
        <div className="mb-6">
          <Link href={tokenId ? `/issuer/tokens/${tokenId}` : "/issuer/tokens"}
            className="flex items-center gap-2 text-sm text-darkBlack/50 hover:text-text">
            <ArrowLeft className="h-4 w-4" /> Back to Token
          </Link>
        </div>
        <p className="text-center text-darkBlack/40 py-24">
          {error || "Token not found or compliance contract not deployed"}
        </p>
      </IssuerDashboardLayout>
    );
  }

  return (
    <IssuerDashboardLayout title={`${token.name} — Compliance`} description="Manage on-chain compliance modules">
      <div className="mb-6">
        <Link href={`/issuer/tokens/${tokenId}`} className="flex items-center gap-2 text-sm text-darkBlack/50 hover:text-text">
          <ArrowLeft className="h-4 w-4" /> Back to Token
        </Link>
      </div>

      {/* Compliance contract info */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
        className="bg-white rounded-3xl p-6 border border-darkBlack/10 mb-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-text mb-1">Compliance Contract</h2>
            {compliance?.compliance_address && (
              <p className="text-sm text-darkBlack/50 font-mono">{compliance.compliance_address}</p>
            )}
          </div>
          <Badge variant={compliance && compliance.modules.length > 0 ? "active" : "pending"} size="sm">
            {compliance?.modules.length ?? 0} module{compliance?.modules.length !== 1 ? "s" : ""} attached
          </Badge>
        </div>
      </motion.div>

      {/* Add Module */}
      <div className="mb-6">
        {!showAddModule ? (
          <Button variant="primary" size="sm" leftIcon={<Plus className="h-4 w-4" />}
            onClick={() => setShowAddModule(true)}>
            Add Module
          </Button>
        ) : (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }}
            className="bg-white rounded-2xl border border-darkBlack/10 p-5">
            <h3 className="text-sm font-semibold text-text mb-3">Attach Compliance Module</h3>
            <p className="text-xs text-darkBlack/40 mb-4">
              Enter the deployed module contract address. The module must implement IComplianceModule.
            </p>
            <div className="flex items-end gap-3">
              <div className="flex-1">
                <label className="block text-xs text-darkBlack/50 mb-1">Module Address</label>
                <Input value={newModuleAddress} onChange={(e) => setNewModuleAddress(e.target.value)}
                  placeholder="0x..." className="font-mono" />
              </div>
              <Button variant="primary" size="sm" onClick={handleAddModule}
                disabled={addingModule || !newModuleAddress}
                leftIcon={addingModule ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}>
                {addingModule ? "Adding..." : "Add"}
              </Button>
              <Button variant="outline" size="sm" onClick={() => { setShowAddModule(false); setNewModuleAddress(""); }}>
                Cancel
              </Button>
            </div>
          </motion.div>
        )}
      </div>

      {/* Module list */}
      <div className="space-y-4">
        {compliance?.modules.map((mod) => (
          <ModuleCard key={mod.address} module={mod} tokenId={tokenId}
            onRemove={handleRemoveModule} onRefresh={loadData}
            removing={removingModule === mod.address} />
        ))}
        {compliance?.modules.length === 0 && (
          <div className="text-center py-16">
            <Shield className="h-12 w-12 text-darkBlack/20 mx-auto mb-3" />
            <p className="text-sm text-darkBlack/40">
              No compliance modules attached. Add a module to enforce transfer restrictions.
            </p>
          </div>
        )}
      </div>
    </IssuerDashboardLayout>
  );
}
