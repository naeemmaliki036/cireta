"use client";

import { useState, useEffect, useCallback } from "react";
import { Handshake, Plus, Pencil, Trash2, X, RefreshCw, ExternalLink } from "lucide-react";
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

  // Modal state
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<PartnerForm>(emptyForm);
  const [submitting, setSubmitting] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);

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
  }, [fetchPartners]);

  const openAdd = () => {
    setEditingId(null);
    setForm(emptyForm);
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

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this partner?")) return;
    setDeleting(id);
    try {
      await apiFetch(`/api/v1/admin/platform/partners/${id}`, { method: "DELETE" });
      setPartners((prev) => prev.filter((p) => p.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete partner");
    } finally {
      setDeleting(null);
    }
  };

  const handleLogoUpload = (result: UploadResult) => {
    setForm((prev) => ({ ...prev, logo_url: result.url }));
  };

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
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {partners.map((partner) => (
            <div
              key={partner.id}
              className="bg-white rounded-lg border border-black/10 overflow-hidden flex flex-col"
            >
              {/* Logo */}
              <div className="h-32 bg-[#ECF3F4] flex items-center justify-center p-4">
                {partner.logo_url ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img
                    src={partner.logo_url}
                    alt={partner.name}
                    className="max-h-full max-w-full object-contain"
                  />
                ) : (
                  <Handshake className="h-10 w-10 text-black/20" />
                )}
              </div>
              {/* Info */}
              <div className="p-4 flex-1 flex flex-col">
                <h3 className="text-sm font-semibold text-black">{partner.name}</h3>
                {partner.website_url && (
                  <a
                    href={partner.website_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-[#13636F] hover:underline mt-1 flex items-center gap-1"
                  >
                    <ExternalLink className="h-3 w-3" />
                    {partner.website_url.replace(/^https?:\/\//, "").slice(0, 30)}
                  </a>
                )}
                <p className="text-xs text-zinc-400 mt-1">Order: {partner.sort_order}</p>
                <div className="flex items-center gap-2 mt-auto pt-3">
                  <Button variant="outline" size="sm" className="text-xs flex-1" onClick={() => openEdit(partner)}>
                    <Pencil className="h-3 w-3 mr-1" /> Edit
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-xs text-red-600 border-red-200 hover:bg-red-50"
                    onClick={() => handleDelete(partner.id)}
                    isLoading={deleting === partner.id}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal */}
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
