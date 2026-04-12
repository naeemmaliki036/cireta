"use client";

import { useState, useEffect, useCallback } from "react";
import { Users, Plus, Pencil, Trash2, X, RefreshCw, Linkedin } from "lucide-react";
import { Button, Input, Textarea, Spinner, FileUpload } from "@/components/atoms";
import { PlatformAdminLayout } from "@/components/templates";
import { apiFetch } from "@/lib/api/client";
import type { UploadResult } from "@/lib/api/client";

interface TeamMember {
  id: string;
  name: string;
  title: string;
  bio: string | null;
  photo_url: string | null;
  linkedin_url: string | null;
  sort_order: number;
}

interface TeamForm {
  name: string;
  title: string;
  bio: string;
  photo_url: string;
  linkedin_url: string;
  sort_order: number;
}

const emptyForm: TeamForm = {
  name: "",
  title: "",
  bio: "",
  photo_url: "",
  linkedin_url: "",
  sort_order: 0,
};

export default function TeamPage() {
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Modal state
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<TeamForm>(emptyForm);
  const [submitting, setSubmitting] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);

  const fetchMembers = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await apiFetch<TeamMember[]>("/api/v1/platform/team");
      setMembers(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load team members");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchMembers();
  }, [fetchMembers]);

  const openAdd = () => {
    setEditingId(null);
    setForm(emptyForm);
    setShowModal(true);
  };

  const openEdit = (member: TeamMember) => {
    setEditingId(member.id);
    setForm({
      name: member.name,
      title: member.title,
      bio: member.bio ?? "",
      photo_url: member.photo_url ?? "",
      linkedin_url: member.linkedin_url ?? "",
      sort_order: member.sort_order,
    });
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    setEditingId(null);
    setForm(emptyForm);
  };

  const handleSubmit = async () => {
    if (!form.name.trim() || !form.title.trim()) return;
    setSubmitting(true);
    try {
      if (editingId) {
        await apiFetch(`/api/v1/admin/platform/team/${editingId}`, {
          method: "PUT",
          body: form,
        });
      } else {
        await apiFetch("/api/v1/admin/platform/team", {
          method: "POST",
          body: form,
        });
      }
      closeModal();
      fetchMembers();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save team member");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this team member?")) return;
    setDeleting(id);
    try {
      await apiFetch(`/api/v1/admin/platform/team/${id}`, { method: "DELETE" });
      setMembers((prev) => prev.filter((m) => m.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete team member");
    } finally {
      setDeleting(null);
    }
  };

  const handlePhotoUpload = (result: UploadResult) => {
    setForm((prev) => ({ ...prev, photo_url: result.url }));
  };

  return (
    <PlatformAdminLayout
      title="Team Members"
      description="Manage team members displayed on the website"
      breadcrumbs={[
        { label: "Platform", href: "/platform/overview" },
        { label: "Team" },
      ]}
      actions={
        <div className="flex items-center gap-2">
          <Button variant="primary" size="sm" onClick={openAdd}>
            <Plus className="h-3.5 w-3.5 mr-1.5" /> Add Member
          </Button>
          <Button variant="outline" size="sm" onClick={fetchMembers}>
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
      ) : members.length === 0 ? (
        <div className="text-center py-16">
          <Users className="h-12 w-12 text-black/20 mx-auto mb-3" />
          <p className="text-sm text-zinc-500">No team members yet.</p>
          <Button variant="primary" size="sm" className="mt-4" onClick={openAdd}>
            <Plus className="h-3.5 w-3.5 mr-1.5" /> Add First Member
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {members.map((member) => (
            <div
              key={member.id}
              className="bg-white rounded-lg border border-black/10 p-5 flex flex-col"
            >
              {/* Photo + Name */}
              <div className="flex items-center gap-3 mb-3">
                <div className="w-12 h-12 rounded-full bg-[#ECF3F4] flex items-center justify-center overflow-hidden shrink-0">
                  {member.photo_url ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img
                      src={member.photo_url}
                      alt={member.name}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <span className="text-lg font-semibold text-[#13636F]">
                      {member.name.charAt(0).toUpperCase()}
                    </span>
                  )}
                </div>
                <div className="min-w-0">
                  <h3 className="text-sm font-semibold text-black truncate">{member.name}</h3>
                  <p className="text-xs text-[#13636F]">{member.title}</p>
                </div>
              </div>

              {/* Bio */}
              {member.bio && (
                <p className="text-xs text-zinc-500 mb-3 line-clamp-3">{member.bio}</p>
              )}

              {/* LinkedIn */}
              {member.linkedin_url && (
                <a
                  href={member.linkedin_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-[#13636F] hover:underline flex items-center gap-1 mb-3"
                >
                  <Linkedin className="h-3 w-3" /> LinkedIn
                </a>
              )}

              <p className="text-xs text-zinc-400 mb-3">Order: {member.sort_order}</p>

              {/* Actions */}
              <div className="flex items-center gap-2 mt-auto">
                <Button variant="outline" size="sm" className="text-xs flex-1" onClick={() => openEdit(member)}>
                  <Pencil className="h-3 w-3 mr-1" /> Edit
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="text-xs text-red-600 border-red-200 hover:bg-red-50"
                  onClick={() => handleDelete(member.id)}
                  isLoading={deleting === member.id}
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/50" onClick={closeModal} />
          <div className="relative bg-white rounded-lg w-full max-w-md mx-4 p-6 shadow-xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-semibold text-black">
                {editingId ? "Edit Team Member" : "Add Team Member"}
              </h2>
              <button onClick={closeModal} className="p-1 rounded-md hover:bg-[#ECF3F4] transition-colors">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-4">
              <Input
                label="Name"
                placeholder="Full name"
                value={form.name}
                onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
              />
              <Input
                label="Title"
                placeholder="e.g. CEO, CTO, Head of Design"
                value={form.title}
                onChange={(e) => setForm((prev) => ({ ...prev, title: e.target.value }))}
              />
              <Textarea
                label="Bio"
                placeholder="Short biography..."
                value={form.bio}
                onChange={(e) => setForm((prev) => ({ ...prev, bio: e.target.value }))}
                rows={3}
              />
              <Input
                label="LinkedIn URL"
                placeholder="https://linkedin.com/in/..."
                value={form.linkedin_url}
                onChange={(e) => setForm((prev) => ({ ...prev, linkedin_url: e.target.value }))}
              />
              <Input
                label="Sort Order"
                type="number"
                value={String(form.sort_order)}
                onChange={(e) => setForm((prev) => ({ ...prev, sort_order: parseInt(e.target.value) || 0 }))}
              />
              <FileUpload
                label="Photo"
                accept="image/*"
                maxSizeMB={5}
                value={form.photo_url || null}
                onUpload={handlePhotoUpload}
                onRemove={() => setForm((prev) => ({ ...prev, photo_url: "" }))}
                prefix="team"
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
                disabled={!form.name.trim() || !form.title.trim() || submitting}
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
