"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  Mail, Save, RotateCcw, Send, Eye, EyeOff, AlertCircle,
  CheckCircle2, X, Code, Variable,
} from "lucide-react";
import { Button, Badge, Spinner } from "@/components/atoms";
import RichTextEditor from "@/components/molecules/RichTextEditor";
import { PlatformAdminLayout } from "@/components/templates";
import {
  getEmailTemplates,
  updateEmailTemplate,
  toggleEmailTemplate,
  previewEmailTemplate,
  resetEmailTemplate,
  type EmailTemplate,
} from "@/lib/api/repositories/email-templates";

const CATEGORIES: Record<string, string[]> = {
  "Authentication": ["otp_code", "welcome", "wallet_linked"],
  "Compliance": ["kyc_approved", "kyc_rejected", "kyb_approved", "kyb_rejected", "kyc_expiry_warning"],
  "Investments": ["investment_confirmation", "sale_finalized_success", "sale_finalized_failed", "tokens_claimed", "refund_claimed", "redemption_fulfilled", "dividend_available"],
  "Issuer": ["issuer_approved", "issuer_approval_request", "sale_approved", "sale_rejected", "issuer_wallet_approved", "issuer_wallet_rejected"],
  "Admin Alerts": ["admin_sale_submitted"],
};

const DISPLAY_NAMES: Record<string, string> = {
  otp_code: "OTC Code",
  welcome: "Welcome Email",
  wallet_linked: "Wallet Linked",
  kyc_approved: "KYC Approved",
  kyc_rejected: "KYC Rejected",
  kyb_approved: "KYB Approved (Corporate)",
  kyb_rejected: "KYB Rejected (Corporate)",
  kyc_expiry_warning: "KYC Expiry Warning",
  investment_confirmation: "Investment Confirmation",
  sale_finalized_success: "Sale Finalized (Success)",
  sale_finalized_failed: "Sale Finalized (Failed)",
  tokens_claimed: "Tokens Claimed",
  refund_claimed: "Refund Claimed",
  redemption_fulfilled: "Redemption Fulfilled",
  dividend_available: "Dividend Available",
  issuer_approved: "Issuer Approved",
  issuer_approval_request: "Issuer Approval Request",
  sale_approved: "Sale Approved",
  sale_rejected: "Sale Rejected",
  issuer_wallet_approved: "Issuer Wallet Approved",
  issuer_wallet_rejected: "Issuer Wallet Rejected",
  admin_sale_submitted: "Sale Submitted (Admin)",
};

function getCategoryForKey(key: string): string {
  for (const [cat, keys] of Object.entries(CATEGORIES)) {
    if (keys.includes(key)) return cat;
  }
  return "Other";
}

export default function EmailTemplatesPage() {
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [editSubject, setEditSubject] = useState("");
  const [editBody, setEditBody] = useState("");
  const [saving, setSaving] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [previewEmail, setPreviewEmail] = useState("");
  const [showPreview, setShowPreview] = useState(false);
  const [showSource, setShowSource] = useState(false);

  const loadTemplates = useCallback(async () => {
    try {
      const data = await getEmailTemplates();
      setTemplates(data);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { loadTemplates(); }, [loadTemplates]);

  const selected = templates.find((t) => t.key === selectedKey);

  const selectTemplate = (key: string) => {
    const tmpl = templates.find((t) => t.key === key);
    if (tmpl) {
      setSelectedKey(key);
      setEditSubject(tmpl.subject);
      setEditBody(tmpl.html_body);
      setMessage(null);
      setShowPreview(false);
      setShowSource(false);
    }
  };

  const hasChanges = selected && (editSubject !== selected.subject || editBody !== selected.html_body);

  const handleSave = async () => {
    if (!selectedKey || !hasChanges) return;
    if (editSubject.trim().length < 10) {
      setMessage({ type: "error", text: "Subject must be at least 10 characters" });
      return;
    }
    if (editBody.trim().length < 100) {
      setMessage({ type: "error", text: "Email body must be at least 100 characters" });
      return;
    }
    setSaving(true);
    setMessage(null);
    try {
      await updateEmailTemplate(selectedKey, { subject: editSubject, html_body: editBody });
      await loadTemplates();
      setMessage({ type: "success", text: "Template saved" });
    } catch (err) {
      setMessage({ type: "error", text: err instanceof Error ? err.message : "Save failed" });
    } finally { setSaving(false); }
  };

  const handleToggle = async (key: string) => {
    setActionLoading(`toggle-${key}`);
    try {
      await toggleEmailTemplate(key);
      await loadTemplates();
    } catch { /* ignore */ }
    finally { setActionLoading(null); }
  };

  const handleReset = async () => {
    if (!selectedKey) return;
    setActionLoading("reset");
    try {
      await resetEmailTemplate(selectedKey);
      await loadTemplates();
      // Re-select to refresh editor
      const updated = (await getEmailTemplates()).find((t) => t.key === selectedKey);
      if (updated) {
        setEditSubject(updated.subject);
        setEditBody(updated.html_body);
      }
      setMessage({ type: "success", text: "Reset to default" });
    } catch (err) {
      setMessage({ type: "error", text: err instanceof Error ? err.message : "Reset failed" });
    } finally { setActionLoading(null); }
  };

  const handleSendPreview = async () => {
    if (!selectedKey || !previewEmail) return;
    setActionLoading("preview");
    try {
      await previewEmailTemplate(selectedKey, previewEmail);
      setMessage({ type: "success", text: `Test email sent to ${previewEmail}` });
    } catch (err) {
      setMessage({ type: "error", text: err instanceof Error ? err.message : "Preview failed" });
    } finally { setActionLoading(null); }
  };

  const editorInstanceRef = useRef<{ insertContent: (content: string) => void } | null>(null);

  const insertVariable = (varName: string) => {
    const tag = `{{${varName}}}`;
    if (!showSource && editorInstanceRef.current) {
      editorInstanceRef.current.insertContent(tag);
    } else {
      setEditBody((prev) => prev + tag);
    }
  };

  if (loading) {
    return (
      <PlatformAdminLayout title="Email Management" description="Manage transactional email content">
        <div className="flex justify-center py-20"><Spinner /></div>
      </PlatformAdminLayout>
    );
  }

  // Group templates by category
  const grouped: Record<string, EmailTemplate[]> = {};
  for (const tmpl of templates) {
    const cat = getCategoryForKey(tmpl.key);
    if (!grouped[cat]) grouped[cat] = [];
    grouped[cat].push(tmpl);
  }

  return (
    <PlatformAdminLayout title="Email Management" description="Manage transactional email content">
      <div className="flex gap-6 min-h-[calc(100vh-12rem)]">
        {/* Sidebar — template list */}
        <div className="w-60 flex-shrink-0 bg-white rounded-lg border border-zinc-100 overflow-hidden">
          <div className="p-3 space-y-3 max-h-[calc(100vh-14rem)] overflow-y-auto">
            {Object.entries(grouped).map(([category, tmpls]) => (
              <div key={category}>
                <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-[0.12em] px-2.5 mb-1">{category}</p>
                {tmpls.map((t) => (
                  <button
                    key={t.key}
                    onClick={() => selectTemplate(t.key)}
                    className={`w-full text-left px-2.5 py-2 rounded-lg text-xs transition-all flex items-center justify-between gap-1.5 ${
                      selectedKey === t.key
                        ? "bg-darkAqua text-white font-semibold"
                        : "text-zinc-600 hover:bg-zinc-50 font-medium"
                    }`}
                  >
                    <span className="truncate">{DISPLAY_NAMES[t.key] ?? t.key.replace(/_/g, " ")}</span>
                    <span className="flex items-center gap-1 flex-shrink-0">
                      {t.is_custom && <span className="w-1.5 h-1.5 rounded-md bg-blue-400" title="Customized" />}
                      {!t.is_active && <EyeOff className="h-3 w-3 text-zinc-300" />}
                    </span>
                  </button>
                ))}
              </div>
            ))}
          </div>
        </div>

        {/* Editor panel */}
        <div className="flex-1 min-w-0">
          {!selected ? (
            <div className="flex items-center justify-center h-full">
              <div className="text-center">
                <Mail className="h-10 w-10 text-zinc-200 mx-auto mb-3" />
                <p className="text-zinc-400 text-sm">Select a template to edit</p>
              </div>
            </div>
          ) : (
            <div className="bg-white rounded-lg border border-zinc-100 overflow-hidden">
              {/* Header */}
              <div className="px-6 py-4 border-b border-zinc-100 flex items-center justify-between">
                <div>
                  <h3 className="font-semibold text-zinc-900">{DISPLAY_NAMES[selected.key] ?? selected.key.replace(/_/g, " ")}</h3>
                  {selected.description && <p className="text-xs text-zinc-400 mt-0.5">{selected.description}</p>}
                </div>
                <div className="flex items-center gap-2">
                  {selected.is_custom && <Badge variant="default" size="sm">Customized</Badge>}
                  <button
                    onClick={() => handleToggle(selected.key)}
                    disabled={actionLoading === `toggle-${selected.key}`}
                    className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                      selected.is_active
                        ? "bg-green-100 text-green-700 hover:bg-green-200"
                        : "bg-zinc-100 text-zinc-500 hover:bg-zinc-200"
                    }`}
                  >
                    {selected.is_active ? "Active" : "Disabled"}
                  </button>
                </div>
              </div>

              {/* Message */}
              {message && (
                <div className={`mx-6 mt-4 p-3 rounded-lg border text-sm flex items-center gap-2 ${
                  message.type === "success" ? "bg-green-50 border-green-200 text-green-700" : "bg-red-50 border-red-200 text-red-600"
                }`}>
                  {message.type === "error" ? <AlertCircle className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />}
                  {message.text}
                  <button onClick={() => setMessage(null)} className="ml-auto"><X className="h-3.5 w-3.5" /></button>
                </div>
              )}

              <div className="p-6 space-y-4">
                {/* Subject */}
                <div>
                  <label className="block text-xs font-semibold text-zinc-500 mb-1.5">Subject Line</label>
                  <input
                    type="text"
                    value={editSubject}
                    onChange={(e) => setEditSubject(e.target.value)}
                    className="w-full px-4 py-2.5 rounded-lg border border-zinc-200 text-sm focus:outline-none focus:ring-2 focus:ring-darkAqua/30 focus:border-darkAqua"
                  />
                </div>

                {/* Available variables */}
                {selected.variables.length > 0 && (
                  <div>
                    <label className="block text-xs font-semibold text-zinc-500 mb-1.5 flex items-center gap-1">
                      <Variable className="h-3 w-3" /> Available Variables
                    </label>
                    <div className="flex flex-wrap gap-1.5">
                      {selected.variables.map((v) => (
                        <button
                          key={v}
                          onClick={() => insertVariable(v)}
                          className="px-2.5 py-1 bg-zinc-100 hover:bg-darkAqua text-zinc-600 hover:text-white rounded-md text-xs font-mono transition-colors cursor-pointer"
                          title="Click to insert at cursor"
                        >
                          {`{{${v}}}`}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Body editor */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-xs font-semibold text-zinc-500">Email Body</label>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => { setShowSource(!showSource); setShowPreview(false); }}
                        className={`px-2 py-1 rounded text-xs font-medium transition-colors ${showSource ? "bg-zinc-800 text-white" : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200"}`}
                      >
                        <Code className="h-3 w-3 inline mr-1" />Source
                      </button>
                      <button
                        onClick={() => { setShowPreview(!showPreview); setShowSource(false); }}
                        className={`px-2 py-1 rounded text-xs font-medium transition-colors ${showPreview ? "bg-zinc-800 text-white" : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200"}`}
                      >
                        <Eye className="h-3 w-3 inline mr-1" />Preview
                      </button>
                    </div>
                  </div>

                  {showPreview ? (
                    <div className="border border-zinc-200 rounded-lg overflow-hidden">
                      <iframe
                        srcDoc={editBody.replace(/\{\{(\w+)\}\}/g, (_, v) => `<span style="background:#e0f2fe;padding:1px 4px;border-radius:3px;font-size:12px">${v}</span>`)}
                        className="w-full h-[400px] bg-white"
                        sandbox="allow-same-origin"
                        title="Email preview"
                      />
                    </div>
                  ) : showSource ? (
                    <textarea
                      value={editBody}
                      onChange={(e) => setEditBody(e.target.value)}
                      className="w-full px-4 py-3 rounded-lg border border-zinc-200 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-darkAqua/30 focus:border-darkAqua leading-relaxed"
                      rows={16}
                    />
                  ) : (
                    <RichTextEditor
                      content={editBody}
                      onChange={(html) => setEditBody(html)}
                      placeholder="Write email content..."
                      editorRef={(ed) => { editorInstanceRef.current = ed as unknown as { insertContent: (content: string) => void } | null; }}
                    />
                  )}
                </div>

                {/* Actions */}
                <div className="flex items-center justify-between pt-2 border-t border-zinc-100">
                  <div className="flex items-center gap-2">
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={handleSave}
                      isLoading={saving}
                      disabled={!hasChanges || saving}
                    >
                      <Save className="h-3.5 w-3.5 mr-1.5" />
                      Save Changes
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={handleReset}
                      isLoading={actionLoading === "reset"}
                      disabled={!selected.is_custom}
                    >
                      <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
                      Reset to Default
                    </Button>
                  </div>

                  <div className="flex items-center gap-2">
                    <input
                      type="email"
                      value={previewEmail}
                      onChange={(e) => setPreviewEmail(e.target.value)}
                      placeholder="test@example.com"
                      className="px-3 py-1.5 rounded-lg border border-zinc-200 text-xs w-48 focus:outline-none focus:ring-2 focus:ring-darkAqua/30"
                    />
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleSendPreview}
                      isLoading={actionLoading === "preview"}
                      disabled={!previewEmail || actionLoading === "preview"}
                    >
                      <Send className="h-3.5 w-3.5 mr-1.5" />
                      Send Test
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </PlatformAdminLayout>
  );
}
