"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import dynamic from "next/dynamic";
import { ArrowRight, CheckCircle2, Coins, FileText, Calendar, Rocket, Users, HelpCircle, Clock, Settings } from "lucide-react";

const RichTextEditor = dynamic(
  () => import("@/components/molecules/RichTextEditor"),
  { ssr: false }
);
import Link from "next/link";
import { Button, Input, Select } from "@/components/atoms";
import { IssuerDashboardLayout } from "@/components/templates";
import { getTokens, type Token } from "@/lib/api/repositories/tokens";
import {
  createSale, addSaleTeamMember, addSaleFAQ, addSaleDocument, submitSaleForApproval,
  type TeamMemberData, type FAQData, type DocumentData,
} from "@/lib/api/repositories/sales";
import { getAccessToken } from "@/lib/api/client";

interface PhaseData { name: string; pricePerToken: string; allocation: string; startDate: string; endDate: string }
const emptyPhase = (): PhaseData => ({ name: "", pricePerToken: "", allocation: "", startDate: "", endDate: "" });
const emptyTeam = (): TeamMemberData => ({ name: "", title: "", bio: "", photo_url: "" });
const emptyFAQ = (): FAQData => ({ question: "", answer: "" });
const emptyDoc = (): DocumentData => ({ name: "", type: "legal", url: "" });
const DOC_TYPES = [{ value: "legal", label: "Legal" }, { value: "audit", label: "Audit" }, { value: "whitepaper", label: "Whitepaper" }, { value: "other", label: "Other" }];
const TA = "w-full rounded-xl border border-darkBlack/10 p-3 text-sm focus:outline-none focus:ring-2 focus:ring-darkAqua";

export default function CreateSalePage() {
  const [step, setStep] = useState(1);
  const [tokens, setTokens] = useState<Token[]>([]);
  // Step 1: Sale Info
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [isComingSoon, setIsComingSoon] = useState(false);
  const [saleMode, setSaleMode] = useState("vested");
  const [saleStructure, setSaleStructure] = useState("phase_allocated");
  // OTC
  const [otcEnabled, setOtcEnabled] = useState(false);
  const [otcContent, setOtcContent] = useState("");
  // Step 2: Content
  const [fullDescription, setFullDescription] = useState("");
  const [bannerImageUrl, setBannerImageUrl] = useState("");
  // Step 3: Team
  const [teamMembers, setTeamMembers] = useState<TeamMemberData[]>([emptyTeam()]);
  // Step 4: FAQ & Docs
  const [faqs, setFaqs] = useState<FAQData[]>([emptyFAQ()]);
  const [documents, setDocuments] = useState<DocumentData[]>([emptyDoc()]);
  // Step 5: Phases (skip if coming soon)
  const [phases, setPhases] = useState<PhaseData[]>([{ ...emptyPhase(), name: "Seed Round" }]);
  // Step 6: Vesting (skip if direct or coming soon)
  const [cliffDays, setCliffDays] = useState("0");
  const [vestingDays, setVestingDays] = useState("365");
  // Step 7: Token & Caps (skip if coming soon)
  const [selectedTokenId, setSelectedTokenId] = useState("");
  const [paymentToken, setPaymentToken] = useState("0x036CbD53842c5426634e7929541eC2318f3dCF7e");
  const [softCap, setSoftCap] = useState("");
  const [hardCap, setHardCap] = useState("");
  // State
  const [isSaving, setIsSaving] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [savedSaleId, setSavedSaleId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await getTokens(1, 100, undefined, getAccessToken() ?? "");
        setTokens(res.items);
      } catch { /* ignore */ }
    })();
  }, []);

  // Auto-load platform OTC template when OTC is first enabled
  const handleOtcToggle = async (enabled: boolean) => {
    setOtcEnabled(enabled);
    if (enabled && !otcContent) {
      try {
        const data = await apiFetch<Record<string, string>>("/api/v1/admin/platform/settings");
        if (data.otc_default_content) setOtcContent(data.otc_default_content);
      } catch { /* use empty */ }
    }
  };

  // Dynamic steps based on isComingSoon and saleMode
  const allSteps = [
    { id: 1, title: "Sale Info", icon: Coins },
    { id: 2, title: "Content", icon: FileText },
    { id: 3, title: "Team", icon: Users },
    { id: 4, title: "FAQ & Docs", icon: HelpCircle },
    ...(!isComingSoon ? [{ id: 5, title: "Phases", icon: Calendar }] : []),
    ...(!isComingSoon ? [{ id: 6, title: "Token & Caps", icon: Settings }] : []),
    ...(!isComingSoon && saleMode === "vested" ? [{ id: 7, title: "Vesting", icon: Clock }] : []),
    { id: 8, title: "Review", icon: Rocket },
  ];
  const visibleStepIds = allSteps.map((s) => s.id);
  const currentIdx = visibleStepIds.indexOf(step);
  const nextStep = () => { const ni = currentIdx + 1; if (ni < visibleStepIds.length) setStep(visibleStepIds[ni]!); };
  const prevStep = () => { const pi = currentIdx - 1; if (pi >= 0) setStep(visibleStepIds[pi]!); };
  const isLast = currentIdx === visibleStepIds.length - 1;
  const isFirst = currentIdx === 0;
  const selectedToken = tokens.find((t) => t.id === selectedTokenId);

  const upd = <T,>(setter: React.Dispatch<React.SetStateAction<T[]>>) =>
    (i: number, field: string, v: string) => setter((arr) => arr.map((item, idx) => (idx === i ? { ...item, [field]: v } : item)));
  const updPhase = upd(setPhases); const updTeam = upd(setTeamMembers); const updFAQ = upd(setFaqs); const updDoc = upd(setDocuments);
  const rmBtn = (list: unknown[], onClick: () => void) =>
    list.length > 1 ? <button onClick={onClick} className="text-sm text-red-500 hover:underline">Remove</button> : null;

  const handleSaveDraft = async (): Promise<string | null> => {
    setIsSaving(true); setError(null);
    try {
      const tk = getAccessToken() ?? "";
      if (!savedSaleId) {
        const validPhases = phases.filter((p) => p.name && p.pricePerToken && p.allocation && p.startDate && p.endDate);
        const sale = await createSale({
          title: title || undefined, description: description || undefined,
          full_description: fullDescription || undefined, banner_image_url: bannerImageUrl || undefined,
          is_coming_soon: isComingSoon, otc_enabled: otcEnabled, otc_content: otcEnabled ? otcContent : undefined,
          sale_mode: saleMode, sale_structure: saleStructure,
          cliff_duration_days: parseInt(cliffDays) || 0, vesting_duration_days: parseInt(vestingDays) || 365,
          token_id: selectedTokenId || undefined, payment_token: paymentToken,
          soft_cap: softCap || undefined, hard_cap: hardCap || undefined,
          phases: isComingSoon ? [] : validPhases.map((p) => ({
            name: p.name, allocation: Number(p.allocation), price_per_token: p.pricePerToken,
            start_time: new Date(p.startDate).toISOString(), end_time: new Date(p.endDate).toISOString(),
          })),
        }, tk);
        setSavedSaleId(sale.id);
        for (const m of teamMembers.filter((m) => m.name)) await addSaleTeamMember(sale.id, m, tk);
        for (const f of faqs.filter((f) => f.question)) await addSaleFAQ(sale.id, f, tk);
        for (const d of documents.filter((d) => d.url)) await addSaleDocument(sale.id, d, tk);
        return sale.id;
      }
      return savedSaleId;
    } catch (err) { setError(err instanceof Error ? err.message : "Save failed"); return null; }
    finally { setIsSaving(false); }
  };

  const handleSubmit = async () => {
    setIsSubmitting(true); setError(null);
    try {
      const saleId = await handleSaveDraft();
      if (!saleId) { setIsSubmitting(false); return; }
      await submitSaleForApproval(saleId, getAccessToken() ?? "");
      setSuccess(true);
    } catch (err) { setError(err instanceof Error ? err.message : "Submission failed"); }
    finally { setIsSubmitting(false); }
  };

  return (
    <IssuerDashboardLayout title="Create New Sale" description="Set up a token sale with rich content">
      {/* Progress Steps */}
      <div className="mb-8 overflow-x-auto">
        <div className="flex items-center justify-between relative min-w-[600px]">
          {allSteps.map((s, i) => (
            <div key={s.id} className="flex flex-col items-center z-10">
              <div className={`w-10 h-10 rounded-full flex items-center justify-center transition-colors cursor-pointer ${
                visibleStepIds.indexOf(step) > i ? "bg-green-500 text-white" : step === s.id ? "bg-darkAqua text-white" : "bg-gray-200 text-gray-500"
              }`} onClick={() => setStep(s.id)}>
                {visibleStepIds.indexOf(step) > i ? <CheckCircle2 className="h-5 w-5" /> : <s.icon className="h-5 w-5" />}
              </div>
              <p className={`mt-2 text-xs font-semibold ${step === s.id || visibleStepIds.indexOf(step) > i ? "text-text" : "text-gray-400"}`}>{s.title}</p>
            </div>
          ))}
          <div className="absolute top-5 left-0 right-0 h-0.5 bg-gray-200 -z-0">
            <div className="h-full bg-green-500 transition-all duration-500" style={{ width: `${(currentIdx / Math.max(allSteps.length - 1, 1)) * 100}%` }} />
          </div>
        </div>
      </div>

      <motion.div key={step} initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="bg-white rounded-3xl p-8 border border-darkBlack/10">
        {/* Step 1: Sale Info */}
        {step === 1 && (
          <div className="max-w-2xl mx-auto space-y-6">
            <h2 className="text-xl font-semibold text-text">Sale Info</h2>
            <Input label="Sale Title" placeholder="e.g., Gold Reserve Token Sale" value={title} onChange={(e) => setTitle(e.target.value)} />
            <div><label className="input-label">Short Description</label>
              <textarea className={TA} rows={2} placeholder="Brief summary" value={description} onChange={(e) => setDescription(e.target.value)} /></div>
            <div className="flex items-center gap-3 p-4 rounded-xl border border-darkBlack/10">
              <input type="checkbox" id="comingSoon" checked={isComingSoon} onChange={(e) => setIsComingSoon(e.target.checked)} className="h-5 w-5 rounded" />
              <label htmlFor="comingSoon" className="text-sm"><span className="font-semibold">Prelisting (coming soon)</span> — Publish as a preview without token or sale contract. You can convert to a live sale later.</label>
            </div>
            <Select label="Sale Mode" options={[{ value: "vested", label: "Vested (fractions → claim after vesting)" }, { value: "direct", label: "Direct (ERC-3643 tokens immediately)" }]}
              value={saleMode} onChange={(e) => setSaleMode(e.target.value)} />
            <Select label="Sale Structure" options={[
              { value: "phase_allocated", label: "Phase Allocated — each phase has its own token cap" },
              { value: "price_tiered", label: "Price Tiered — 100% allocation shared, phases only change price" },
            ]} value={saleStructure} onChange={(e) => setSaleStructure(e.target.value)} />
            {/* OTC & Bank Transfer */}
            <div className="border-t border-darkBlack/10 pt-6 mt-2">
              <div className="flex items-center gap-3 p-4 rounded-xl border border-darkBlack/10">
                <input type="checkbox" id="otcEnabled" checked={otcEnabled} onChange={(e) => handleOtcToggle(e.target.checked)} className="h-5 w-5 rounded" />
                <label htmlFor="otcEnabled" className="text-sm"><span className="font-semibold">Enable OTC & Bank Transfer</span> — Allow investors to pay via wire transfer or OTC. An &quot;OTC &amp; Bank&quot; tab will be shown on the sale page.</label>
              </div>
              {otcEnabled && (
                <div className="mt-4 space-y-2">
                  <label className="block text-sm font-medium text-zinc-600">OTC Instructions (shown to investors)</label>
                  <p className="text-xs text-zinc-400">Include wire details, process steps, minimum amounts, and contact info. Auto-loaded from platform template — customize for this sale.</p>
                  <RichTextEditor content={otcContent} onChange={setOtcContent} placeholder="Enter OTC & bank transfer instructions..." />
                </div>
              )}
            </div>
          </div>
        )}
        {/* Step 2: Content */}
        {step === 2 && (
          <div className="max-w-2xl mx-auto space-y-6">
            <h2 className="text-xl font-semibold text-text">Content</h2>
            <div><label className="input-label">Full Description</label>
              <textarea className={TA} rows={8} placeholder="Detailed project description, investment thesis, background..." value={fullDescription} onChange={(e) => setFullDescription(e.target.value)} />
              <p className="text-xs text-gray-400 mt-1">Plain text for now. Rich text editor coming soon.</p></div>
            <Input label="Banner Image URL" placeholder="https://example.com/banner.jpg" value={bannerImageUrl} onChange={(e) => setBannerImageUrl(e.target.value)} />
            {bannerImageUrl && <div className="rounded-xl overflow-hidden border border-darkBlack/10"><img src={bannerImageUrl} alt="Banner preview" className="w-full h-48 object-cover" /></div>}
          </div>
        )}
        {/* Step 3: Team */}
        {step === 3 && (
          <div className="max-w-2xl mx-auto">
            <h2 className="text-xl font-semibold text-text mb-2">Team Members</h2>
            <p className="text-gray-500 mb-6">Add key team members to display on the sale page</p>
            <div className="space-y-6">
              {teamMembers.map((m, i) => (
                <div key={i} className="border border-darkBlack/10 rounded-2xl p-6 space-y-4">
                  <div className="flex items-center justify-between"><h3 className="font-semibold text-text">Member {i + 1}</h3>{rmBtn(teamMembers, () => setTeamMembers((t) => t.filter((_, idx) => idx !== i)))}</div>
                  <div className="grid grid-cols-2 gap-4">
                    <Input label="Name" placeholder="John Doe" value={m.name} onChange={(e) => updTeam(i, "name", e.target.value)} />
                    <Input label="Title" placeholder="CEO" value={m.title} onChange={(e) => updTeam(i, "title", e.target.value)} />
                  </div>
                  <div><label className="input-label">Bio</label><textarea className={TA} rows={2} value={m.bio} onChange={(e) => updTeam(i, "bio", e.target.value)} /></div>
                  <Input label="Photo URL" placeholder="https://..." value={m.photo_url} onChange={(e) => updTeam(i, "photo_url", e.target.value)} />
                </div>))}
              <Button variant="outline" onClick={() => setTeamMembers((t) => [...t, emptyTeam()])} className="w-full">+ Add Team Member</Button>
            </div>
          </div>
        )}
        {/* Step 4: FAQ & Docs */}
        {step === 4 && (
          <div className="max-w-2xl mx-auto space-y-8">
            <div>
              <h2 className="text-xl font-semibold text-text mb-2">FAQs</h2>
              <div className="space-y-4">
                {faqs.map((f, i) => (
                  <div key={i} className="border border-darkBlack/10 rounded-2xl p-5 space-y-3">
                    <div className="flex items-center justify-between"><span className="font-semibold text-text text-sm">FAQ {i + 1}</span>{rmBtn(faqs, () => setFaqs((fq) => fq.filter((_, idx) => idx !== i)))}</div>
                    <Input label="Question" value={f.question} onChange={(e) => updFAQ(i, "question", e.target.value)} />
                    <div><label className="input-label">Answer</label><textarea className={TA} rows={2} value={f.answer} onChange={(e) => updFAQ(i, "answer", e.target.value)} /></div>
                  </div>))}
                <Button variant="outline" onClick={() => setFaqs((f) => [...f, emptyFAQ()])} className="w-full">+ Add FAQ</Button>
              </div>
            </div>
            <div>
              <h2 className="text-xl font-semibold text-text mb-2">Documents</h2>
              <div className="space-y-4">
                {documents.map((d, i) => (
                  <div key={i} className="border border-darkBlack/10 rounded-2xl p-5 space-y-3">
                    <div className="flex items-center justify-between"><span className="font-semibold text-text text-sm">Doc {i + 1}</span>{rmBtn(documents, () => setDocuments((ds) => ds.filter((_, idx) => idx !== i)))}</div>
                    <div className="grid grid-cols-2 gap-4">
                      <Input label="Name" value={d.name} onChange={(e) => updDoc(i, "name", e.target.value)} />
                      <Select label="Type" options={DOC_TYPES} value={d.type} onChange={(e) => updDoc(i, "type", e.target.value)} />
                    </div>
                    <Input label="URL" value={d.url} onChange={(e) => updDoc(i, "url", e.target.value)} />
                  </div>))}
                <Button variant="outline" onClick={() => setDocuments((ds) => [...ds, emptyDoc()])} className="w-full">+ Add Document</Button>
              </div>
            </div>
          </div>
        )}
        {/* Step 5: Phases (skip if coming soon) */}
        {step === 5 && (
          <div className="max-w-2xl mx-auto">
            <h2 className="text-xl font-semibold text-text mb-2">Sale Phases</h2>
            <p className="text-gray-500 mb-6">Configure one or more phases</p>
            <div className="space-y-6">
              {phases.map((ph, i) => (
                <div key={i} className="border border-darkBlack/10 rounded-2xl p-6 space-y-4">
                  <div className="flex items-center justify-between"><h3 className="font-semibold text-text">Phase {i + 1}</h3>{rmBtn(phases, () => setPhases((p) => p.filter((_, idx) => idx !== i)))}</div>
                  <Input label="Phase Name" placeholder="e.g., Seed Round" value={ph.name} onChange={(e) => updPhase(i, "name", e.target.value)} />
                  <div className="grid grid-cols-2 gap-4">
                    <Input label="Price per Token (USDC)" type="number" value={ph.pricePerToken} onChange={(e) => updPhase(i, "pricePerToken", e.target.value)} />
                    <Input label="Allocation (tokens)" type="number" value={ph.allocation} onChange={(e) => updPhase(i, "allocation", e.target.value)} />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <Input label="Start Date" type="datetime-local" value={ph.startDate} onChange={(e) => updPhase(i, "startDate", e.target.value)} />
                    <Input label="End Date" type="datetime-local" value={ph.endDate} onChange={(e) => updPhase(i, "endDate", e.target.value)} />
                  </div>
                </div>))}
              <Button variant="outline" onClick={() => setPhases((p) => [...p, emptyPhase()])} className="w-full">+ Add Phase</Button>
            </div>
          </div>
        )}
        {/* Step 6: Token & Caps (skip if coming soon) */}
        {step === 6 && (
          <div className="max-w-2xl mx-auto space-y-6">
            <h2 className="text-xl font-semibold text-text">Token & Funding Caps</h2>
            <Select label="Token being sold (optional)" options={[{ value: "", label: "Select a token..." }, ...tokens.map((t) => ({ value: t.id, label: `${t.name} (${t.symbol})` }))]}
              value={selectedTokenId} onChange={(e) => setSelectedTokenId(e.target.value)} />
            <Input label="Payment Token Address (USDC)" value={paymentToken} onChange={(e) => setPaymentToken(e.target.value)} />
            <div className="grid grid-cols-2 gap-4">
              <Input label="Soft Cap (USDC)" type="number" placeholder="e.g., 50000" value={softCap} onChange={(e) => setSoftCap(e.target.value)} />
              <Input label="Hard Cap (USDC)" type="number" placeholder="e.g., 500000" value={hardCap} onChange={(e) => setHardCap(e.target.value)} />
            </div>
          </div>
        )}
        {/* Step 7: Vesting (skip if direct or coming soon) */}
        {step === 7 && (
          <div className="max-w-2xl mx-auto space-y-6">
            <h2 className="text-xl font-semibold text-text">Vesting Configuration</h2>
            <p className="text-gray-500">Configure how tokens are released to investors after purchase</p>
            <Input label="Cliff Duration (days)" type="number" placeholder="e.g., 90" value={cliffDays} onChange={(e) => setCliffDays(e.target.value)}
              helperText="Days before any tokens can be claimed. 0 = no cliff." />
            <Input label="Vesting Duration (days)" type="number" placeholder="e.g., 365" value={vestingDays} onChange={(e) => setVestingDays(e.target.value)}
              helperText="Linear vesting period after cliff. Tokens unlock gradually over this period." />
            <div className="p-4 rounded-xl bg-box text-sm space-y-1">
              <p><strong>Preview:</strong></p>
              <p>Cliff: {cliffDays || 0} days after sale finalization</p>
              <p>Vesting: {vestingDays || 0} days linear after cliff ends</p>
              <p>Total time to full unlock: {(parseInt(cliffDays) || 0) + (parseInt(vestingDays) || 0)} days</p>
            </div>
          </div>
        )}
        {/* Step 8: Review */}
        {step === 8 && (
          <div className="max-w-2xl mx-auto text-center">
            <div className="w-20 h-20 rounded-full bg-darkAqua/10 flex items-center justify-center mx-auto mb-6"><Rocket className="h-10 w-10 text-darkAqua" /></div>
            <h2 className="text-xl font-semibold text-text mb-2">{isComingSoon ? "Ready to Publish as Coming Soon" : "Ready to Submit"}</h2>
            <p className="text-gray-500 mb-8">{isComingSoon ? "This will be submitted for admin approval as a Coming Soon listing" : "This will be submitted for admin approval"}</p>
            <div className="bg-box rounded-2xl p-6 text-left mb-8 space-y-3 text-sm">
              <h3 className="font-semibold text-text mb-2">Sale Summary</h3>
              {[
                ["Title", title || "Untitled"],
                ["Type", isComingSoon ? "Coming Soon" : "Live Sale"],
                ["Mode", saleMode === "vested" ? "Vested" : "Direct"],
                ["Structure", saleStructure === "phase_allocated" ? "Phase Allocated" : "Price Tiered"],
                ...(!isComingSoon ? [
                  ["Token", selectedToken ? `${selectedToken.name} (${selectedToken.symbol})` : "Not selected"],
                  ["Soft Cap", softCap ? `${softCap} USDC` : "Not set"],
                  ["Hard Cap", hardCap ? `${hardCap} USDC` : "Not set"],
                  ["Phases", `${phases.filter((p) => p.name).length} configured`],
                  ...(saleMode === "vested" ? [["Vesting", `${cliffDays}d cliff + ${vestingDays}d linear`]] : []),
                ] : []),
                ["OTC & Bank Transfer", otcEnabled ? "Enabled" : "Disabled"],
                ["Description", description ? `${description.slice(0, 60)}...` : "None"],
                ["Full Description", fullDescription ? `${fullDescription.length} chars` : "None"],
                ["Banner", bannerImageUrl ? "Set" : "None"],
                ["Team", `${teamMembers.filter((m) => m.name).length} members`],
                ["FAQs", `${faqs.filter((f) => f.question).length}`],
                ["Documents", `${documents.filter((d) => d.url).length}`],
              ].map(([label, value]) => (
                <div key={String(label)} className="flex justify-between"><span className="text-gray-500">{label}</span><span className="font-medium">{value}</span></div>
              ))}
            </div>
            <div className="p-4 rounded-xl bg-gold/10 border border-gold/30 text-left">
              <p className="text-sm text-gray-600"><strong className="text-gold">Note:</strong> {isComingSoon
                ? "This will be visible on the launchpad as Coming Soon once approved. You can convert it to a live sale later by adding token, phases, and caps."
                : "Once approved by admin, you can deploy the sale contract on-chain via the dApp."}</p>
            </div>
          </div>
        )}
      </motion.div>

      {/* Navigation */}
      <div className="flex justify-between items-center mt-8">
        <div className="flex items-center gap-3">
          {isFirst ? <Link href="/issuer/sales"><Button variant="outline">Cancel</Button></Link>
            : <Button variant="outline" onClick={prevStep}>Back</Button>}
          {!savedSaleId && <Button variant="outline" onClick={handleSaveDraft} isLoading={isSaving}>{isSaving ? "Saving..." : "Save as Draft"}</Button>}
          {savedSaleId && <span className="text-xs text-green-600 font-medium">Draft saved</span>}
          {error && <span className="text-xs text-red-600">{error}</span>}
        </div>
        {!isLast ? (
          <Button variant="primary" onClick={nextStep} rightIcon={<ArrowRight className="h-4 w-4" />}>Continue</Button>
        ) : (
          <div className="flex flex-col items-end gap-2">
            {success ? <Link href="/issuer/sales"><Button variant="primary">View Sales</Button></Link>
              : <Button variant="primary" onClick={handleSubmit} isLoading={isSubmitting}>
                  {isSubmitting ? "Submitting..." : "Submit for Approval"}
                </Button>}
          </div>
        )}
      </div>
    </IssuerDashboardLayout>
  );
}
