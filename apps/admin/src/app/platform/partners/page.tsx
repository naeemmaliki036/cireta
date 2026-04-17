"use client";

import { useState, useEffect, useCallback } from "react";
import { Handshake, Plus, Pencil, Trash2, X, RefreshCw, ExternalLink, LayoutGrid, List, AlertTriangle } from "lucide-react";
import { Button, Input, Spinner, FileUpload } from "@/components/atoms";
import { PlatformAdminLayout } from "@/components/templates";
import { apiFetch } from "@/lib/api/client";
import type { UploadResult } from "@/lib/api/client";

interface Partner {
  id: string;
  name: string;
  logo_url: string | null;
  website_url: string | null;
  sort_order: number;
}

interface PartnerForm {
  name: string;
  logo_url: string;
  website_url: string;
  sort_order: number;
}

const emptyForm: PartnerForm = { name: "", logo_url: "", website_url: "", sort_order: 0 };

export default function PartnersPage() {
  const [partners, setPartners] = useState<Partner[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"card" | "table">(() => {
    if (typeof window !== "undefined") return (localStorage.getItem("partners_view") as "card" | "table") || "card";
    return "card";
  });

  // Modal state
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<PartnerForm>(emptyForm);
  const [submitting, setSubmitting] = useState(false);

  // Delete confirmation
  const [deleteTarget, setDeleteTarget] = useState<Partner | null>(null);
  const [deleteStep, setDeleteStep] = useState(0);
  const [deleting, setDeleting] = useState(false);

  // Per-row config
  const [perRow, setPerRow] = useState(6);
  const [perRowDirty, setPerRowDirty] = useState(false);
  const [savingPerRow, setSavingPerRow] = useState(false);

  const fetchPartners = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await apiFetch<Partner[]>("/api/v1/platform/partners");
      setPartners(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load partners");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPartners();
    // Load per-row setting
    apiFetch<Record<string, string>>("/api/v1/admin/platform/settings")
      .then((s) => { if (s.partners_per_row) setPerRow(parseInt(s.partners_per_row) || 6); })
      .catch(() => {});
  }, [fetchPartners]);

  const toggleView = (mode: "card" | "table") => {
    setViewMode(mode);
    localStorage.setItem("partners_view", mode);
  };

  const openAdd = () => {
    setEditingId(null);
    setForm({ ...emptyForm, sort_order: partners.length + 1 });
    setShowModal(true);
  };

  const openEdit = (partner: Partner) => {
    setEditingId(partner.id);
    setForm({
      name: partner.name,
      logo_url: partner.logo_url ?? "",
      website_url: partner.website_url ?? "",
      sort_order: partner.sort_order,
    });
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    setEditingId(null);
    setForm(emptyForm);
  };

  const handleSubmit = async () => {
    if (!form.name.trim()) return;
    setSubmitting(true);
    try {
      if (editingId) {
        await apiFetch(`/api/v1/admin/platform/partners/${editingId}`, {
          method: "PUT",
          body: form,
        });
      } else {
        await apiFetch("/api/v1/admin/platform/partners", {
          method: "POST",
          body: form,
        });
      }
      closeModal();
      fetchPartners();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save partner");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteClick = (partner: Partner) => {
    setDeleteTarget(partner);
    setDeleteStep(1);
  };

  const handleDeleteConfirm = async () => {
    if (deleteStep === 1) { setDeleteStep(2); return; }
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await apiFetch(`/api/v1/admin/platform/partners/${deleteTarget.id}`, { method: "DELETE" });
      setPartners((prev) => prev.filter((p) => p.id !== deleteTarget.id));
      setDeleteTarget(null);
      setDeleteStep(0);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete partner");
    } finally {
      setDeleting(false);
    }
  };

  const handleDeleteCancel = () => {
    setDeleteTarget(null);
    setDeleteStep(0);
  };

  const handleLogoUpload = (result: UploadResult) => {
    setForm((prev) => ({ ...prev, logo_url: result.url }));
  };

  const savePerRow = async () => {
    setSavingPerRow(true);
    try {
      await apiFetch("/api/v1/admin/platform/settings", {
        method: "PATCH",
        body: { partners_per_row: String(perRow) },
      });
      setPerRowDirty(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save setting");
    } finally {
      setSavingPerRow(false);
    }
  };

  const sorted = [...partners].sort((a, b) => a.sort_order - b.sort_order);

  return (
    <PlatformAdminLayout
      title="Partners"
      description="Manage platform partners displayed on the website"
      breadcrumbs={[
        { label: "Platform", href: "/platform/overview" },
        { label: "Partners" },
      ]}
      actions={
        <div className="flex items-center gap-2">
          <Button variant="primary" size="sm" onClick={openAdd}>
            <Plus className="h-3.5 w-3.5 mr-1.5" /> Add Partner
          </Button>
          <div className="flex items-center border border-zinc-200 rounded-md overflow-hidden">
            <button
              onClick={() => toggleView("card")}
              className={`p-1.5 transition-colors ${viewMode === "card" ? "bg-zinc-100 text-zinc-900" : "text-zinc-400 hover:text-zinc-600"}`}
              title="Card view"
            >
              <LayoutGrid className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={() => toggleView("table")}
              className={`p-1.5 transition-colors ${viewMode === "table" ? "bg-zinc-100 text-zinc-900" : "text-zinc-400 hover:text-zinc-600"}`}
              title="Table view"
            >
              <List className="h-3.5 w-3.5" />
            </button>
          </div>
          <Button variant="outline" size="sm" onClick={fetchPartners}>
            <RefreshCw className="h-3.5 w-3.5 mr-1.5" /> Refresh
          </Button>
        </div>
      }
    >
      {error && (
        <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
          {error}
          <button onClick={() => setError(null)} className="ml-2 underline">dismiss</button>
        </div>
      )}

      {/* Per-row config */}
      <div className="mb-4 flex items-center gap-3 bg-white rounded-lg border border-zinc-200 px-4 py-3">
        <label className="text-xs text-zinc-500 font-medium whitespace-nowrap">Logos per row on website:</label>
        <input
          type="number"
          min={2}
          max={12}
          value={perRow}
          onChange={(e) => { setPerRow(parseInt(e.target.value) || 6); setPerRowDirty(true); }}
          className="w-16 px-2 py-1 text-sm border border-zinc-200 rounded-md focus:outline-none focus:border-[#13636F]"
        />
        {perRowDirty && (
          <Button variant="primary" size="sm" onClick={savePerRow} isLoading={savingPerRow} className="text-xs">
            Save
          </Button>
        )}
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <Spinner />
        </div>
      ) : partners.length === 0 ? (
        <div className="text-center py-16">
          <Handshake className="h-12 w-12 text-black/20 mx-auto mb-3" />
          <p className="text-sm text-zinc-500">No partners yet.</p>
          <Button variant="primary" size="sm" className="mt-4" onClick={openAdd}>
            <Plus className="h-3.5 w-3.5 mr-1.5" /> Add First Partner
          </Button>
        </div>
      ) : viewMode === "card" ? (
        /* ── Card View ── */
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {sorted.map((partner) => (
            <div
              key={partner.id}
              className="bg-white rounded-2xl border border-black/10 overflow-hidden flex flex-col transition-shadow duration-300 hover:shadow-lg group"
            >
              <div className="h-32 bg-[#ECF3F4] flex items-center justify-center p-4 transition-colors duration-300 group-hover:bg-[#e3ecee]">
                {partner.logo_url ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img src={partner.logo_url} alt={partner.name} className="max-h-full max-w-full object-contain" />
                ) : (
                  <Handshake className="h-10 w-10 text-black/20" />
                )}
              </div>
              <div className="p-4 flex-1 flex flex-col">
                <h3 className="text-sm font-semibold text-black">{partner.name}</h3>
                {partner.website_url && (
                  <a href={partner.website_url} target="_blank" rel="noopener noreferrer"
                    className="text-xs text-[#13636F] hover:underline mt-1 flex items-center gap-1">
                    <ExternalLink className="h-3 w-3" />
                    {partner.website_url.replace(/^https?:\/\//, "").slice(0, 30)}
                  </a>
                )}
                <p className="text-xs text-zinc-400 mt-1">Order: {partner.sort_order}</p>
                <div className="flex items-center gap-2 mt-auto pt-3">
                  <Button variant="outline" size="sm" className="text-xs flex-1" onClick={() => openEdit(partner)}>
                    <Pencil className="h-3 w-3 mr-1" /> Edit
                  </Button>
                  <Button variant="outline" size="sm" className="text-xs !text-red-500 !border-red-200 hover:!bg-red-50" onClick={() => handleDeleteClick(partner)}>
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        /* ── Table View ── */
        <div className="bg-white rounded-lg border border-black/10 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-[#ECF3F4] border-b border-black/10">
                  <th className="text-left px-4 py-3 font-semibold text-black w-16">Logo</th>
                  <th className="text-left px-4 py-3 font-semibold text-black">Name</th>
                  <th className="text-left px-4 py-3 font-semibold text-black">Website</th>
                  <th className="text-left px-4 py-3 font-semibold text-black w-20">Order</th>
                  <th className="text-right px-4 py-3 font-semibold text-black w-28">Actions</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((partner) => (
                  <tr key={partner.id} className="border-b border-black/5 last:border-0 hover:bg-zinc-50 transition-colors">
                    <td className="px-4 py-3">
                      <div className="w-10 h-10 rounded-lg bg-[#ECF3F4] flex items-center justify-center overflow-hidden">
                        {partner.logo_url ? (
                          /* eslint-disable-next-line @next/next/no-img-element */
                          <img src={partner.logo_url} alt={partner.name} className="max-h-full max-w-full object-contain" />
                        ) : (
                          <Handshake className="h-4 w-4 text-black/20" />
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 font-medium text-black">{partner.name}</td>
                    <td className="px-4 py-3">
                      {partner.website_url ? (
                        <a href={partner.website_url} target="_blank" rel="noopener noreferrer"
                          className="text-xs text-[#13636F] hover:underline flex items-center gap-1">
                          <ExternalLink className="h-3 w-3" />
                          {partner.website_url.replace(/^https?:\/\//, "").slice(0, 40)}
                        </a>
                      ) : <span className="text-xs text-zinc-300">—</span>}
                    </td>
                    <td className="px-4 py-3 text-zinc-500">{partner.sort_order}</td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <Button variant="outline" size="sm" className="text-xs" onClick={() => openEdit(partner)}>
                          <Pencil className="h-3 w-3" />
                        </Button>
                        <Button variant="outline" size="sm" className="text-xs !text-red-500 !border-red-200 hover:!bg-red-50" onClick={() => handleDeleteClick(partner)}>
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteTarget && deleteStep > 0 && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-xl shadow-xl p-6 max-w-sm w-full mx-4">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center shrink-0">
                <AlertTriangle className="h-5 w-5 text-red-600" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-zinc-900">
                  {deleteStep === 1 ? "Delete this partner?" : "Are you absolutely sure?"}
                </h3>
                <p className="text-xs text-zinc-500 mt-0.5">
                  {deleteStep === 1
                    ? `This will permanently remove "${deleteTarget.name}" from the partners list.`
                    : "This action cannot be undone. The partner will be removed immediately."}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 justify-end">
              <Button variant="outline" size="sm" onClick={handleDeleteCancel}>Cancel</Button>
              <Button
                variant="primary"
                size="sm"
                onClick={handleDeleteConfirm}
                isLoading={deleting}
                className={deleteStep === 2 ? "!bg-red-600 hover:!bg-red-700" : "!bg-amber-500 hover:!bg-amber-600"}
              >
                {deleteStep === 1 ? "Yes, Delete" : "Confirm Delete"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Add/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/50" onClick={closeModal} />
          <div className="relative bg-white rounded-lg w-full max-w-md mx-4 p-6 shadow-xl">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-semibold text-black">
                {editingId ? "Edit Partner" : "Add Partner"}
              </h2>
              <button onClick={closeModal} className="p-1 rounded-md hover:bg-[#ECF3F4] transition-colors">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-4">
              <Input
                label="Name"
                placeholder="Partner name"
                value={form.name}
                onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
              />
              <Input
                label="Website URL"
                placeholder="https://example.com"
                value={form.website_url}
                onChange={(e) => setForm((prev) => ({ ...prev, website_url: e.target.value }))}
              />
              <Input
                label="Sort Order"
                type="number"
                value={String(form.sort_order)}
                onChange={(e) => setForm((prev) => ({ ...prev, sort_order: parseInt(e.target.value) || 0 }))}
              />
              <FileUpload
                label="Logo"
                accept="image/*"
                maxSizeMB={5}
                value={form.logo_url || null}
                onUpload={handleLogoUpload}
                onRemove={() => setForm((prev) => ({ ...prev, logo_url: "" }))}
                prefix="partners"
                visibility="public"
                previewType="image"
              />
            </div>

            <div className="flex justify-end gap-2 mt-6">
              <Button variant="outline" size="sm" onClick={closeModal}>
                Cancel
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={handleSubmit}
                disabled={!form.name.trim() || submitting}
                isLoading={submitting}
              >
                {editingId ? "Update" : "Create"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </PlatformAdminLayout>
  );
}
