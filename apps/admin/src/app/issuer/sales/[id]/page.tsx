"use client";

import { useState, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import {
  BarChart3, Clock, ArrowLeft, Wallet, Send, AlertCircle,
  Pencil, X, Check, Upload, ImageIcon, Globe, Star,
} from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Badge, Spinner, Button } from "@/components/atoms";
import { StatCard } from "@/components/molecules";
import RichTextEditor from "@/components/molecules/RichTextEditor";
import { SaleContentReview } from "@/components/molecules/SaleContentReview";
import { ProgressBar } from "@/components/atoms";
import { IssuerDashboardLayout } from "@/components/templates";
import { formatCurrency } from "@/lib/utils";
import {
  getSale, submitSaleForApproval, updateSale, setHeroImage,
  addSaleImage, removeSaleImage,
  type Sale, type UpdateSaleRequest, type ImageData,
} from "@/lib/api/repositories/sales";
import { apiFetch, apiUpload } from "@/lib/api/client";

interface SaleImage {
  id: string;
  url: string;
  caption?: string;
  is_banner?: boolean;
  sort_order?: number;
  media_type?: string;
  video_url?: string;
}

export default function SaleDetailPage({ params: paramsPromise }: { params: Promise<{ id: string }> }) {
  const searchParams = useSearchParams();
  const [sale, setSale] = useState<Sale | null>(null);
  const [loading, setLoading] = useState(true);
  const [resolvedId, setResolvedId] = useState<string>("");
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [editing, setEditing] = useState(searchParams.get("edit") === "1");
  const [editForm, setEditForm] = useState<UpdateSaleRequest>({});
  const [saving, setSaving] = useState(false);
  // Gallery management
  const [images, setImages] = useState<SaleImage[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

  useEffect(() => { paramsPromise.then((p) => setResolvedId(p.id)); }, [paramsPromise]);

  const reload = useCallback(async () => {
    if (!resolvedId) return;
    try {
      const s = await getSale(resolvedId);
      setSale(s);
    } catch { /* 404 */ }
  }, [resolvedId]);

  const loadImages = useCallback(async () => {
    if (!resolvedId) return;
    try {
      const imgs = await apiFetch<SaleImage[]>(`/api/v1/sales/${resolvedId}/images`);
      setImages(imgs);
    } catch { /* ignore */ }
  }, [resolvedId]);

  useEffect(() => {
    if (!resolvedId) return;
    (async () => {
      try { setSale(await getSale(resolvedId)); }
      catch { /* 404 */ }
      finally { setLoading(false); }
    })();
    loadImages();
  }, [resolvedId, loadImages]);

  const handleAction = async (action: string, fn: () => Promise<void>) => {
    setActionLoading(action); setActionError(null); setActionSuccess(null);
    try { await fn(); setActionSuccess(action); await reload(); }
    catch (err) { setActionError(err instanceof Error ? err.message : "Action failed"); }
    finally { setActionLoading(null); }
  };

  const handleSubmitForApproval = () => handleAction("submit", async () => {
    await submitSaleForApproval(resolvedId);
  });

  const handleConvertToLive = () => handleAction("convert", async () => {
    await apiFetch(`/api/v1/sales/${resolvedId}/convert-to-live`, { method: "POST", body: {} });
  });

  // Auto-populate edit form when sale loads and ?edit=1
  useEffect(() => {
    if (sale && editing && !editForm.title) {
      setEditForm({
        title: sale.title ?? undefined,
        description: sale.description_text ?? undefined,
        full_description: sale.full_description ?? undefined,
        banner_image_url: sale.banner_image_url ?? undefined,
        website_url: sale.website_url ?? undefined,
        twitter_url: sale.twitter_url ?? undefined,
        linkedin_url: sale.linkedin_url ?? undefined,
        instagram_url: sale.instagram_url ?? undefined,
        facebook_url: sale.facebook_url ?? undefined,
        telegram_url: sale.telegram_url ?? undefined,
        discord_url: sale.discord_url ?? undefined,
      });
    }
  }, [sale, editing, editForm.title]);

  const startEditing = () => {
    if (!sale) return;
    setEditForm({
      title: sale.title ?? undefined,
      description: sale.description_text ?? undefined,
      full_description: sale.full_description ?? undefined,
      banner_image_url: sale.banner_image_url ?? undefined,
      website_url: sale.website_url ?? undefined,
      twitter_url: sale.twitter_url ?? undefined,
      linkedin_url: sale.linkedin_url ?? undefined,
      instagram_url: sale.instagram_url ?? undefined,
      facebook_url: sale.facebook_url ?? undefined,
      telegram_url: sale.telegram_url ?? undefined,
      discord_url: sale.discord_url ?? undefined,
    });
    setEditing(true);
  };

  const handleSave = async () => {
    setSaving(true); setActionError(null);
    try {
      const updated = await updateSale(resolvedId, editForm);
      setSale(updated);
      setEditing(false);
      setActionSuccess("save");
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Save failed");
    } finally { setSaving(false); }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true); setUploadProgress(0);
    try {
      const result = await apiUpload(file, "sales", "public", (pct) => setUploadProgress(pct));
      const isVideo = file.type.startsWith("video/");
      await addSaleImage(resolvedId, {
        url: result.url,
        is_banner: images.length === 0,
        media_type: isVideo ? "video" : "image",
      });
      await loadImages();
      await reload();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Upload failed");
    } finally { setUploading(false); setUploadProgress(0); }
  };

  const handleSetHero = async (imageId: string) => {
    try {
      await setHeroImage(resolvedId, imageId);
      await loadImages();
      await reload();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Failed to set hero");
    }
  };

  const handleRemoveImage = async (imageId: string) => {
    try {
      await removeSaleImage(resolvedId, imageId);
      await loadImages();
      await reload();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Failed to remove image");
    }
  };

  if (loading) return <IssuerDashboardLayout title="Sale Details" description=""><div className="flex justify-center py-24"><Spinner /></div></IssuerDashboardLayout>;
  if (!sale) return <IssuerDashboardLayout title="Sale Details" description=""><p className="text-center text-darkBlack/40 py-24">Sale not found</p></IssuerDashboardLayout>;

  const raised = parseFloat(sale.total_raised || "0");
  const cap = parseFloat(sale.hard_cap || "0");
  const soft = parseFloat(sale.soft_cap || "0");
  const pct = cap > 0 ? (raised / cap) * 100 : 0;
  const isDraft = sale.status === "draft";
  const isPending = sale.status === "pending_approval";
  const isApprovedComingSoon = sale.status === "approved_coming_soon";
  const isApproved = sale.status === "approved";
  const isActive = sale.status === "active";
  const isFinalizedSuccess = sale.status === "finalized_success" || sale.status === "finalized";
  const isFailed = sale.status === "finalized_failed" || sale.status === "failed";
  const isRejected = sale.status === "rejected";

  return (
    <IssuerDashboardLayout title={sale.title || sale.token_name || "Sale Details"} description={`Sale ID: ${sale.id}`}>
      <div className="mb-6 flex items-center justify-between">
        <Link href="/issuer/sales" className="flex items-center gap-2 text-sm text-darkBlack/50 hover:text-text transition-colors">
          <ArrowLeft className="h-4 w-4" /> Back to Sales
        </Link>
        <div className="flex items-center gap-3">
          {!editing && (
            <Button variant="secondary" onClick={startEditing}>
              <Pencil className="h-4 w-4 mr-2" /> Edit Details
            </Button>
          )}
          {isDraft && <Button variant="primary" onClick={handleSubmitForApproval} isLoading={actionLoading === "submit"}>
            <Send className="h-4 w-4 mr-2" /> Submit for Approval
          </Button>}
          {isApprovedComingSoon && <Button variant="primary" onClick={handleConvertToLive} isLoading={actionLoading === "convert"}>
            Convert to Live Sale
          </Button>}
          {isApproved && <div className="p-3 rounded-xl bg-green-50 border border-green-200 text-sm text-green-700">
            <p className="font-semibold">Approved — deploy on-chain via dApp</p>
          </div>}
          {isFinalizedSuccess && <div className="p-3 rounded-xl bg-darkAqua/10 border border-darkAqua/20 text-sm text-darkAqua">
            <Wallet className="h-4 w-4 inline mr-1" /> Withdraw funds via dApp — call <code className="font-mono bg-darkAqua/10 px-1 rounded">withdrawFunds()</code>
          </div>}
        </div>
      </div>

      {actionError && <div className="mb-4 p-3 rounded-xl bg-red-50 border border-red-200 text-sm text-red-600"><AlertCircle className="h-4 w-4 inline mr-1" />{actionError}</div>}
      {actionSuccess && <div className="mb-4 p-3 rounded-xl bg-green-50 border border-green-200 text-sm text-green-600">Changes saved successfully</div>}

      {/* Status Banner */}
      {isPending && <div className="mb-6 p-4 rounded-xl bg-amber-50 border border-amber-200 text-sm text-amber-700">Pending admin approval. You&apos;ll be notified once reviewed.</div>}
      {isRejected && <div className="mb-6 p-4 rounded-xl bg-red-50 border border-red-200 text-sm text-red-700">Sale was rejected. Edit and resubmit.</div>}
      {isFailed && <div className="mb-6 p-4 rounded-xl bg-red-50 border border-red-200 text-sm text-red-700">Sale failed to reach soft cap. Investors can claim refunds.</div>}

      {/* Edit Form */}
      {editing && (
        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}
          className="bg-white rounded-3xl p-6 border border-darkAqua/30 mb-6 space-y-5">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-text">Edit Sale Details</h2>
            <div className="flex items-center gap-2">
              <Button variant="secondary" onClick={() => setEditing(false)} disabled={saving}>
                <X className="h-4 w-4 mr-1" /> Cancel
              </Button>
              <Button variant="primary" onClick={handleSave} isLoading={saving}>
                <Check className="h-4 w-4 mr-1" /> Save Changes
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4">
            <div>
              <label className="block text-sm font-medium text-zinc-700 mb-1">Title</label>
              <input
                type="text"
                value={editForm.title ?? ""}
                onChange={(e) => setEditForm({ ...editForm, title: e.target.value })}
                className="w-full px-4 py-2.5 rounded-xl border border-zinc-200 text-sm focus:outline-none focus:ring-2 focus:ring-darkAqua/30 focus:border-darkAqua"
                placeholder="Sale title"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-700 mb-1">Short Description</label>
              <textarea
                value={editForm.description ?? ""}
                onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                className="w-full px-4 py-2.5 rounded-xl border border-zinc-200 text-sm focus:outline-none focus:ring-2 focus:ring-darkAqua/30 focus:border-darkAqua"
                rows={3}
                placeholder="Brief description of the sale"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-700 mb-1">Full Description</label>
              <RichTextEditor
                content={editForm.full_description ?? ""}
                onChange={(html) => setEditForm({ ...editForm, full_description: html })}
                placeholder="Write a detailed description..."
              />
            </div>
          </div>

          {/* Social Links */}
          <div>
            <h3 className="text-sm font-semibold text-zinc-700 mb-3 flex items-center gap-2">
              <Globe className="h-4 w-4" /> Social Links
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {([
                ["website_url", "Website URL"],
                ["twitter_url", "Twitter / X"],
                ["linkedin_url", "LinkedIn"],
                ["telegram_url", "Telegram"],
                ["discord_url", "Discord"],
                ["instagram_url", "Instagram"],
                ["facebook_url", "Facebook"],
              ] as const).map(([key, label]) => (
                <div key={key}>
                  <label className="block text-xs text-zinc-500 mb-1">{label}</label>
                  <input
                    type="url"
                    value={(editForm as Record<string, string | undefined>)[key] ?? ""}
                    onChange={(e) => setEditForm({ ...editForm, [key]: e.target.value || undefined })}
                    className="w-full px-3 py-2 rounded-lg border border-zinc-200 text-sm focus:outline-none focus:ring-2 focus:ring-darkAqua/30 focus:border-darkAqua"
                    placeholder={`https://...`}
                  />
                </div>
              ))}
            </div>
          </div>
        </motion.div>
      )}

      {/* Hero Image / Gallery Management */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
        className="bg-white rounded-3xl p-6 border border-darkBlack/10 mb-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-text flex items-center gap-2">
            <ImageIcon className="h-5 w-5" /> Hero Image & Gallery
          </h2>
          <label className="cursor-pointer inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-zinc-200 text-sm font-medium text-zinc-600 hover:bg-zinc-50 transition-colors">
            <Upload className="h-4 w-4" />
            {uploading ? `Uploading ${uploadProgress}%` : "Upload Media"}
            <input type="file" accept="image/*,video/*" className="hidden" onChange={handleFileUpload} disabled={uploading} />
          </label>
        </div>

        {images.length > 0 ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {images.sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)).map((img) => (
              <div key={img.id} className={`relative rounded-xl overflow-hidden border-2 group ${img.is_banner ? "border-darkAqua ring-2 ring-darkAqua/20" : "border-zinc-100"}`}>
                <div className="relative h-32">
                  {img.media_type === "video" ? (
                    <div className="w-full h-full bg-zinc-900 flex items-center justify-center">
                      <video src={img.url} className="w-full h-full object-cover" muted />
                    </div>
                  ) : (
                    <img src={img.url} alt={img.caption || ""} className="w-full h-full object-cover" />
                  )}
                  {img.is_banner && (
                    <span className="absolute top-1.5 left-1.5 bg-darkAqua text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full">HERO</span>
                  )}
                  {/* Hover actions */}
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100">
                    {!img.is_banner && (
                      <button
                        onClick={() => handleSetHero(img.id)}
                        className="w-8 h-8 rounded-full bg-white/90 flex items-center justify-center text-darkAqua hover:bg-white"
                        title="Set as hero"
                      >
                        <Star className="h-4 w-4" />
                      </button>
                    )}
                    <button
                      onClick={() => handleRemoveImage(img.id)}
                      className="w-8 h-8 rounded-full bg-white/90 flex items-center justify-center text-red-500 hover:bg-white"
                      title="Remove"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                </div>
                {img.caption && <p className="text-[11px] text-zinc-500 px-2 py-1.5 truncate">{img.caption}</p>}
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-8">
            <ImageIcon className="h-8 w-8 text-zinc-300 mx-auto mb-2" />
            <p className="text-zinc-400 text-sm">No media uploaded. Upload an image or video to set as the hero.</p>
          </div>
        )}
      </motion.div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <StatCard label="Total Raised" value={raised} prefix="$" icon={<BarChart3 className="h-5 w-5" />} />
        <StatCard label="Hard Cap" value={cap} prefix="$" icon={<BarChart3 className="h-5 w-5" />} />
        <StatCard label="Soft Cap" value={soft} prefix="$" icon={<BarChart3 className="h-5 w-5" />} />
      </div>

      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="bg-white rounded-3xl p-6 border border-darkBlack/10 mb-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-text">Progress</h2>
          <Badge variant={isActive ? "active" : "default"} size="sm">{sale.status}</Badge>
        </div>
        <ProgressBar value={pct} size="md" />
        <div className="flex justify-between text-sm mt-2 text-darkBlack/50">
          <span>{formatCurrency(raised)} raised</span>
          <span>{pct.toFixed(1)}% of {formatCurrency(cap)}</span>
        </div>
      </motion.div>

      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="bg-white rounded-3xl p-6 border border-darkBlack/10">
        <h2 className="text-lg font-semibold text-text mb-6">Phases</h2>
        {sale.phases.length === 0 ? (
          <p className="text-darkBlack/40 text-center py-4">No phases configured</p>
        ) : (
          <div className="space-y-4">
            {sale.phases.map((phase) => {
              const phaseSold = parseFloat(phase.sold || "0");
              const phaseAlloc = parseFloat(phase.allocation || "0");
              const phasePct = phaseAlloc > 0 ? (phaseSold / phaseAlloc) * 100 : 0;
              return (
                <div key={phase.id} className="p-4 rounded-2xl bg-box">
                  <div className="flex items-center justify-between mb-2">
                    <p className="font-medium text-text">{phase.name}</p>
                    <div className="flex items-center gap-2 text-sm text-darkBlack/50">
                      <Clock className="h-3 w-3" />
                      <span>{phase.start_time.slice(0, 10)} → {phase.end_time.slice(0, 10)}</span>
                    </div>
                  </div>
                  <ProgressBar value={phasePct} size="sm" />
                  <div className="flex justify-between text-xs mt-1 text-darkBlack/40">
                    <span>Price: ${phase.price_per_token}</span>
                    <span>{formatCurrency(phaseSold)} / {formatCurrency(phaseAlloc)}</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </motion.div>

      {/* Sale Content: description, gallery, team, FAQ, documents */}
      <div className="mt-6">
        <SaleContentReview saleId={sale.id} description={sale.description_text} fullDescription={sale.full_description} />
      </div>
    </IssuerDashboardLayout>
  );
}
