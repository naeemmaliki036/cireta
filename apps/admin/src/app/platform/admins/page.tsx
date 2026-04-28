"use client";

import { useState, useEffect } from "react";
import { parseApiDate } from "@/lib/utils";
import { Plus, Trash2, Shield, ShieldCheck, UserCog, Mail } from "lucide-react";
import { Button } from "@/components/atoms";
import { PlatformAdminLayout } from "@/components/templates";
import { apiFetch } from "@/lib/api/client";

interface AdminAccount {
  id: string;
  email: string;
  display_name: string | null;
  role: string;
  is_super_admin: boolean;
  created_at: string;
}

export default function AdminAccountsPage() {
  const [admins, setAdmins] = useState<AdminAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const fetchAdmins = async () => {
    try {
      const data = await apiFetch<{ items: AdminAccount[] }>("/api/v1/admin/admins");
      setAdmins(data.items);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load. You may not have super admin access.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchAdmins(); }, []);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    setAdding(true);
    setError("");
    setSuccess("");
    try {
      await apiFetch("/api/v1/admin/admins", {
        method: "POST",
        body: { email, display_name: displayName || undefined },
      });
      setEmail("");
      setDisplayName("");
      setSuccess("Admin account created. They can log in via OTP.");
      setTimeout(() => setSuccess(""), 4000);
      await fetchAdmins();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create admin");
    } finally {
      setAdding(false);
    }
  };

  const handleRemove = async (adminId: string, adminEmail: string) => {
    if (!confirm(`Remove admin access for ${adminEmail}? They will be demoted to buyer.`)) return;
    setError("");
    try {
      await apiFetch(`/api/v1/admin/admins/${adminId}`, { method: "DELETE" });
      await fetchAdmins();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to remove");
    }
  };

  return (
    <PlatformAdminLayout
      title="Admin Accounts"
      description="Manage platform administrator access"
    >
      <div className="max-w-3xl">
        {/* Add Admin Form */}
        <div className="bg-white rounded-lg border border-zinc-100 p-8 mb-8">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center">
              <UserCog className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-zinc-900">Add Admin</h2>
              <p className="text-sm text-zinc-400">New admins log in via email OTP — no password needed</p>
            </div>
          </div>
          {error && <p className="text-red-600 text-sm mb-4 p-3 bg-red-50 rounded-xl border border-red-100">{error}</p>}
          {success && <p className="text-green-600 text-sm mb-4 p-3 bg-green-50 rounded-xl border border-green-100">{success}</p>}
          <form onSubmit={handleAdd} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-zinc-700 mb-1.5">Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="admin@cireta.com"
                  required
                  className="w-full border border-zinc-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-700 mb-1.5">Display Name <span className="text-zinc-300">(optional)</span></label>
                <input
                  type="text"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="Jane Doe"
                  className="w-full border border-zinc-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                />
              </div>
            </div>
            <Button type="submit" variant="primary" isLoading={adding} className="px-6">
              <Plus className="h-4 w-4 mr-2" />
              Create Admin Account
            </Button>
          </form>
        </div>

        {/* Admin List */}
        <div className="bg-white rounded-lg border border-zinc-100 overflow-hidden">
          <div className="px-8 py-5 border-b border-zinc-100">
            <h2 className="text-lg font-semibold text-zinc-900">Current Admins</h2>
            <p className="text-sm text-zinc-400 mt-0.5">{admins.length} {admins.length === 1 ? "account" : "accounts"}</p>
          </div>
          {loading ? (
            <div className="p-12 text-center text-zinc-400">Loading...</div>
          ) : admins.length === 0 ? (
            <div className="p-12 text-center text-zinc-400">No admin accounts found</div>
          ) : (
            <div className="divide-y divide-zinc-50">
              {admins.map((admin) => (
                <div key={admin.id} className="flex items-center justify-between px-8 py-5 hover:bg-zinc-50/50 transition-colors">
                  <div className="flex items-center gap-4">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                      admin.is_super_admin ? "bg-amber-50" : "bg-blue-50"
                    }`}>
                      {admin.is_super_admin ? (
                        <ShieldCheck className="h-5 w-5 text-amber-600" />
                      ) : (
                        <Shield className="h-5 w-5 text-blue-600" />
                      )}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium text-zinc-900">{admin.display_name || admin.email}</p>
                        {admin.is_super_admin && (
                          <span className="text-[10px] font-bold uppercase tracking-wider text-amber-600 bg-amber-50 px-2 py-0.5 rounded-md border border-amber-200">
                            Super Admin
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-zinc-400 mt-0.5 flex items-center gap-1">
                        <Mail className="h-3 w-3" /> {admin.email}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-zinc-400">
                      {parseApiDate(admin.created_at).toLocaleDateString()}
                    </span>
                    {!admin.is_super_admin && (
                      <button
                        onClick={() => handleRemove(admin.id, admin.email)}
                        className="w-8 h-8 rounded-lg flex items-center justify-center text-zinc-300 hover:text-red-500 hover:bg-red-50 transition-all"
                        title="Remove admin access"
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
      </div>
    </PlatformAdminLayout>
  );
}
