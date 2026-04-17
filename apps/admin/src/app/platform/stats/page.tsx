"use client";

import { useState, useEffect, useCallback } from "react";
import { Save, RefreshCw, Plus, Trash2, AlertTriangle } from "lucide-react";
import { Button, Spinner, Badge } from "@/components/atoms";
import { PlatformAdminLayout } from "@/components/templates";
import { apiFetch } from "@/lib/api/client";

interface PlatformStat {
  key: string;
  value: string;
  label: string;
  sort_order: number;
  is_active: boolean;
}

interface EditedStat {
  value: string;
  label: string;
  sort_order: number;
  is_active: boolean;
}

export default function PlatformStatsPage() {
  const [stats, setStats] = useState<PlatformStat[]>([]);
  const [loading, setLoading] = useState(true);
  const [edits, setEdits] = useState<Record<string, EditedStat>>({});
  const [saving, setSaving] = useState<Record<string, boolean>>({});
  const [saveSuccess, setSaveSuccess] = useState<Record<string, boolean>>({});
  const [error, setError] = useState<string | null>(null);

  // Add new stat
  const [showAddForm, setShowAddForm] = useState(false);
  const [newStat, setNewStat] = useState({ key: "", label: "", value: "", sort_order: 0 });
  const [addLoading, setAddLoading] = useState(false);

  // Delete
  const [deleteKey, setDeleteKey] = useState<string | null>(null);
  const [deleteConfirmStep, setDeleteConfirmStep] = useState(0); // 0=none, 1=first confirm, 2=second confirm
  const [deleting, setDeleting] = useState(false);

  const fetchStats = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await apiFetch<PlatformStat[]>("/api/v1/admin/platform/stats");
      setStats(data);
      setEdits({});
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load stats");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  const getEdited = (stat: PlatformStat): EditedStat => {
    return edits[stat.key] ?? {
      value: stat.value,
      label: stat.label,
      sort_order: stat.sort_order,
      is_active: stat.is_active,
    };
  };

  const updateField = (key: string, stat: PlatformStat, field: keyof EditedStat, val: string | number | boolean) => {
    const current = getEdited(stat);
    setEdits((prev) => ({ ...prev, [key]: { ...current, [field]: val } }));
  };

  const isDirty = (stat: PlatformStat): boolean => {
    const edited = edits[stat.key];
    if (!edited) return false;
    return (
      edited.value !== stat.value ||
      edited.label !== stat.label ||
      edited.sort_order !== stat.sort_order ||
      edited.is_active !== stat.is_active
    );
  };

  const handleSave = async (stat: PlatformStat) => {
    const edited = getEdited(stat);
    setSaving((prev) => ({ ...prev, [stat.key]: true }));
    setSaveSuccess((prev) => ({ ...prev, [stat.key]: false }));
    try {
      await apiFetch(`/api/v1/admin/platform/stats/${stat.key}`, {
        method: "PUT",
        body: edited,
      });
      setStats((prev) =>
        prev.map((s) => (s.key === stat.key ? { ...s, ...edited } : s))
      );
      setEdits((prev) => {
        const next = { ...prev };
        delete next[stat.key];
        return next;
      });
      setSaveSuccess((prev) => ({ ...prev, [stat.key]: true }));
      setTimeout(() => setSaveSuccess((prev) => ({ ...prev, [stat.key]: false })), 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving((prev) => ({ ...prev, [stat.key]: false }));
    }
  };

  const handleSaveAll = async () => {
    const dirtyStats = stats.filter((s) => isDirty(s));
    for (const stat of dirtyStats) {
      await handleSave(stat);
    }
  };

  const handleAdd = async () => {
    if (!newStat.key.trim() || !newStat.label.trim() || !newStat.value.trim()) return;
    setAddLoading(true);
    setError(null);
    try {
      const created = await apiFetch<PlatformStat>("/api/v1/admin/platform/stats", {
        method: "POST",
        body: {
          key: newStat.key.trim().toLowerCase().replace(/\s+/g, "_"),
          label: newStat.label.trim(),
          value: newStat.value.trim(),
          sort_order: newStat.sort_order,
        },
      });
      setStats((prev) => [...prev, created]);
      setNewStat({ key: "", label: "", value: "", sort_order: stats.length + 1 });
      setShowAddForm(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create stat");
    } finally {
      setAddLoading(false);
    }
  };

  const handleDeleteClick = (key: string) => {
    setDeleteKey(key);
    setDeleteConfirmStep(1);
  };

  const handleDeleteConfirm = async () => {
    if (deleteConfirmStep === 1) {
      setDeleteConfirmStep(2);
      return;
    }
    if (!deleteKey) return;
    setDeleting(true);
    try {
      await apiFetch(`/api/v1/admin/platform/stats/${deleteKey}`, { method: "DELETE" });
      setStats((prev) => prev.filter((s) => s.key !== deleteKey));
      setDeleteKey(null);
      setDeleteConfirmStep(0);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete stat");
    } finally {
      setDeleting(false);
    }
  };

  const handleDeleteCancel = () => {
    setDeleteKey(null);
    setDeleteConfirmStep(0);
  };

  const hasDirty = stats.some((s) => isDirty(s));

  return (
    <PlatformAdminLayout
      title="Platform Stats"
      description="Manage platform statistics displayed on the website"
      breadcrumbs={[
        { label: "Platform", href: "/platform/overview" },
        { label: "Stats" },
      ]}
      actions={
        <div className="flex items-center gap-2">
          {hasDirty && (
            <Button variant="primary" size="sm" onClick={handleSaveAll}>
              <Save className="h-3.5 w-3.5 mr-1.5" /> Save All
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={() => { setShowAddForm(true); setNewStat({ key: "", label: "", value: "", sort_order: stats.length + 1 }); }}>
            <Plus className="h-3.5 w-3.5 mr-1.5" /> Add Stat
          </Button>
          <Button variant="outline" size="sm" onClick={fetchStats}>
            <RefreshCw className="h-3.5 w-3.5 mr-1.5" /> Refresh
          </Button>
        </div>
      }
    >
      {error && (
        <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
          {error}
          <button onClick={() => setError(null)} className="ml-2 text-red-500 hover:text-red-700">&times;</button>
        </div>
      )}

      {/* Add New Stat Form */}
      {showAddForm && (
        <div className="mb-6 bg-white rounded-lg border border-zinc-200 p-5">
          <h3 className="text-sm font-semibold text-zinc-900 mb-4">Add New Stat</h3>
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
            <div>
              <label className="block text-xs text-zinc-500 mb-1">Key (unique identifier)</label>
              <input
                type="text"
                placeholder="e.g. total_investors"
                value={newStat.key}
                onChange={(e) => setNewStat((p) => ({ ...p, key: e.target.value }))}
                className="w-full px-3 py-2 text-sm border border-zinc-200 rounded-md focus:outline-none focus:border-[#13636F]"
              />
            </div>
            <div>
              <label className="block text-xs text-zinc-500 mb-1">Label (display name)</label>
              <input
                type="text"
                placeholder="e.g. Total Investors"
                value={newStat.label}
                onChange={(e) => setNewStat((p) => ({ ...p, label: e.target.value }))}
                className="w-full px-3 py-2 text-sm border border-zinc-200 rounded-md focus:outline-none focus:border-[#13636F]"
              />
            </div>
            <div>
              <label className="block text-xs text-zinc-500 mb-1">Value</label>
              <input
                type="text"
                placeholder="e.g. 500+"
                value={newStat.value}
                onChange={(e) => setNewStat((p) => ({ ...p, value: e.target.value }))}
                className="w-full px-3 py-2 text-sm border border-zinc-200 rounded-md focus:outline-none focus:border-[#13636F]"
              />
            </div>
            <div>
              <label className="block text-xs text-zinc-500 mb-1">Sort Order</label>
              <input
                type="number"
                value={newStat.sort_order}
                onChange={(e) => setNewStat((p) => ({ ...p, sort_order: parseInt(e.target.value) || 0 }))}
                className="w-full px-3 py-2 text-sm border border-zinc-200 rounded-md focus:outline-none focus:border-[#13636F]"
              />
            </div>
          </div>
          <div className="flex items-center gap-2 mt-4">
            <Button variant="primary" size="sm" onClick={handleAdd} disabled={addLoading || !newStat.key.trim() || !newStat.label.trim()} isLoading={addLoading}>
              <Plus className="h-3.5 w-3.5 mr-1" /> Create Stat
            </Button>
            <Button variant="outline" size="sm" onClick={() => setShowAddForm(false)}>Cancel</Button>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteKey && deleteConfirmStep > 0 && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-xl shadow-xl p-6 max-w-sm w-full mx-4">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center shrink-0">
                <AlertTriangle className="h-5 w-5 text-red-600" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-zinc-900">
                  {deleteConfirmStep === 1 ? "Delete this stat?" : "Are you absolutely sure?"}
                </h3>
                <p className="text-xs text-zinc-500 mt-0.5">
                  {deleteConfirmStep === 1
                    ? `This will permanently remove "${deleteKey}" from the platform stats.`
                    : "This action cannot be undone. The stat will be removed from the homepage immediately."}
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
                className={deleteConfirmStep === 2 ? "!bg-red-600 hover:!bg-red-700" : "!bg-amber-500 hover:!bg-amber-600"}
              >
                {deleteConfirmStep === 1 ? "Yes, Delete" : "Confirm Delete"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-16">
          <Spinner />
        </div>
      ) : stats.length === 0 && !showAddForm ? (
        <div className="text-center py-16 text-zinc-400 text-sm">
          No platform stats found. Click &quot;Add Stat&quot; to create one.
        </div>
      ) : (
        <div className="bg-white rounded-lg border border-black/10 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-[#ECF3F4] border-b border-black/10">
                  <th className="text-left px-4 py-3 font-semibold text-black">Key</th>
                  <th className="text-left px-4 py-3 font-semibold text-black">Label</th>
                  <th className="text-left px-4 py-3 font-semibold text-black">Value</th>
                  <th className="text-left px-4 py-3 font-semibold text-black w-24">Order</th>
                  <th className="text-center px-4 py-3 font-semibold text-black w-20">Active</th>
                  <th className="text-right px-4 py-3 font-semibold text-black w-36">Actions</th>
                </tr>
              </thead>
              <tbody>
                {stats.sort((a, b) => a.sort_order - b.sort_order).map((stat) => {
                  const edited = getEdited(stat);
                  const dirty = isDirty(stat);
                  return (
                    <tr key={stat.key} className="border-b border-black/5 last:border-0">
                      <td className="px-4 py-3">
                        <code className="text-xs font-mono bg-[#ECF3F4] px-2 py-1 rounded text-[#13636F]">
                          {stat.key}
                        </code>
                      </td>
                      <td className="px-4 py-3">
                        <input
                          type="text"
                          value={edited.label}
                          onChange={(e) => updateField(stat.key, stat, "label", e.target.value)}
                          className="w-full px-2 py-1.5 text-sm border border-black/10 rounded-md focus:outline-none focus:border-[#13636F] bg-white"
                        />
                      </td>
                      <td className="px-4 py-3">
                        <input
                          type="text"
                          value={edited.value}
                          onChange={(e) => updateField(stat.key, stat, "value", e.target.value)}
                          className="w-full px-2 py-1.5 text-sm border border-black/10 rounded-md focus:outline-none focus:border-[#13636F] bg-white"
                        />
                      </td>
                      <td className="px-4 py-3">
                        <input
                          type="number"
                          value={edited.sort_order}
                          onChange={(e) => updateField(stat.key, stat, "sort_order", parseInt(e.target.value) || 0)}
                          className="w-full px-2 py-1.5 text-sm border border-black/10 rounded-md focus:outline-none focus:border-[#13636F] bg-white"
                        />
                      </td>
                      <td className="px-4 py-3 text-center">
                        <button
                          type="button"
                          onClick={() => updateField(stat.key, stat, "is_active", !edited.is_active)}
                          className={`inline-flex items-center justify-center w-10 h-6 rounded-full transition-colors ${
                            edited.is_active ? "bg-[#13636F]" : "bg-black/20"
                          }`}
                        >
                          <span
                            className={`block w-4 h-4 rounded-full bg-white transition-transform ${
                              edited.is_active ? "translate-x-2" : "-translate-x-2"
                            }`}
                          />
                        </button>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {saveSuccess[stat.key] ? (
                            <Badge variant="default" size="sm" className="bg-green-100 text-green-700 border-green-200">
                              Saved
                            </Badge>
                          ) : (
                            <Button
                              variant="primary"
                              size="sm"
                              onClick={() => handleSave(stat)}
                              disabled={!dirty || saving[stat.key]}
                              isLoading={saving[stat.key]}
                              className="text-xs"
                            >
                              <Save className="h-3 w-3 mr-1" /> Save
                            </Button>
                          )}
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleDeleteClick(stat.key)}
                            className="text-xs !text-red-500 !border-red-200 hover:!bg-red-50"
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </PlatformAdminLayout>
  );
}
