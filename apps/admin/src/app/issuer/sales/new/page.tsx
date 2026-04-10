"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import dynamic from "next/dynamic";
import { ArrowRight, CheckCircle2, Coins, FileText, Calendar, Rocket, Users, HelpCircle, Clock, Settings, ImageIcon, ChevronDown, ChevronRight, FolderOpen } from "lucide-react";

const RichTextEditor = dynamic(
  () => import("@/components/molecules/RichTextEditor"),
  { ssr: false }
);
import Link from "next/link";
import { useRouter } from "next/navigation";
import { isAddress } from "viem";
import { Button, Input, Select, FileUpload } from "@/components/atoms";
import { ImageGallery, type GalleryItem } from "@/components/molecules/ImageGallery";
import { IssuerDashboardLayout } from "@/components/templates";

// Preconfigured stablecoins — update addresses per network
// Base Sepolia (testnet)
const PAYMENT_TOKENS = [
  { value: "", label: "Select payment token..." },
  { value: "0xE730be8760dcd7B1dA6EC26F027A5A4aa6c88c72", label: "cUSDC — Cireta USDC Mock (testnet faucet)" },
  { value: "0x036CbD53842c5426634e7929541eC2318f3dCF7e", label: "USDC — Circle (Base Sepolia)" },
];
// Base Mainnet — swap the above with:
// const PAYMENT_TOKENS = [
//   { value: "", label: "Select payment token..." },
//   { value: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", label: "USDC — Circle (Base)" },
//   { value: "0xd9aAEc86B65D86f6A7B5B1b0c42FFA531710b6CA", label: "USDbC — Bridged USDC (Base)" },
// ];
import { getTokens, type Token } from "@/lib/api/repositories/tokens";
import {
  createSale, addSaleTeamMember, addSaleFAQ, addSaleDocument, addSaleImage, submitSaleForApproval,
  type TeamMemberData, type FAQData, type DocumentData,
} from "@/lib/api/repositories/sales";
import { getAccessToken, apiFetch } from "@/lib/api/client";

interface PhaseData { name: string; pricePerToken: string; allocation: string; startDate: string; endDate: string }
const emptyPhase = (): PhaseData => ({ name: "", pricePerToken: "", allocation: "", startDate: "", endDate: "" });
const emptyTeam = (): TeamMemberData => ({ name: "", title: "", bio: "", photo_url: "" });
const emptyFAQ = (): FAQData => ({ question: "", answer: "" });
const emptyDoc = (): DocumentData => ({ name: "", type: "legal", url: "" });
const DOC_TYPES = [{ value: "legal", label: "Legal" }, { value: "audit", label: "Audit" }, { value: "whitepaper", label: "Whitepaper" }, { value: "other", label: "Other" }];
const TA = "w-full rounded-lg border border-black/10 p-3 text-sm focus:outline-none focus:ring-2 focus:ring-darkAqua resize-y";

export default function CreateSalePage() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [tokens, setTokens] = useState<Token[]>([]);
  // Step 1: Sale Info
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [isComingSoon, setIsComingSoon] = useState(false);
  const [saleMode, setSaleMode] = useState("");
  const [saleStructure, setSaleStructure] = useState("");
  // OTC
  const [otcEnabled, setOtcEnabled] = useState(false);
  const [otcContent, setOtcContent] = useState("");
  const [otcTokenAddress, setOtcTokenAddress] = useState("");
  // Step 2: Content
  const [fullDescription, setFullDescription] = useState("");
  // Step 3: Gallery
  const [galleryItems, setGalleryItems] = useState<GalleryItem[]>([]);
  // Step 3: Team
  const [teamMembers, setTeamMembers] = useState<TeamMemberData[]>([emptyTeam()]);
  // Step 4: FAQ & Docs
  const [faqs, setFaqs] = useState<FAQData[]>([emptyFAQ()]);
  const [expandedFAQ, setExpandedFAQ] = useState<number | null>(0);
  const [expandedTeam, setExpandedTeam] = useState<number | null>(0);
  const [expandedDoc, setExpandedDoc] = useState<number | null>(0);
  const [expandedPhase, setExpandedPhase] = useState<number | null>(0);
  const [documents, setDocuments] = useState<DocumentData[]>([emptyDoc()]);
  // Step 5: Phases (skip if coming soon)
  const [phases, setPhases] = useState<PhaseData[]>([{ ...emptyPhase(), name: "Seed Round" }]);
  // Step 6: Vesting (skip if direct or coming soon)
  const [cliffDays, setCliffDays] = useState("0");
  const [vestingDays, setVestingDays] = useState("365");
  // Step 7: Token & Caps (skip if coming soon)
  const [selectedTokenId, setSelectedTokenId] = useState("");
  const [paymentToken, setPaymentToken] = useState("");
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

  const bannerImageUrl = galleryItems.find((i) => i.is_banner)?.url || "";

  // Dynamic steps based on isComingSoon and saleMode
  const allSteps = [
    { id: 1, title: "Sale Info", icon: Coins },
    { id: 2, title: "Content", icon: FileText },
    { id: 3, title: "Gallery", icon: ImageIcon },
    { id: 4, title: "Team", icon: Users },
    { id: 5, title: "FAQs", icon: HelpCircle },
    { id: 6, title: "Documents", icon: FolderOpen },
    ...(!isComingSoon ? [{ id: 7, title: "Phases", icon: Calendar }] : []),
    ...(!isComingSoon ? [{ id: 8, title: "Token & Caps", icon: Settings }] : []),
    ...(!isComingSoon && saleMode === "vested" ? [{ id: 9, title: "Vesting", icon: Clock }] : []),
    { id: 10, title: "Review", icon: Rocket },
  ];
  const visibleStepIds = allSteps.map((s) => s.id);
  const currentIdx = visibleStepIds.indexOf(step);
  const nextStep = () => { const ni = currentIdx + 1; if (ni < visibleStepIds.length) setStep(visibleStepIds[ni]!); };
  const prevStep = () => { const pi = currentIdx - 1; if (pi >= 0) setStep(visibleStepIds[pi]!); };
  const isLast = currentIdx === visibleStepIds.length - 1;
  const isFirst = currentIdx === 0;
  const canProceed = (() => {
    switch (step) {
      case 1: return title.trim() !== "" && description.trim() !== "" && saleMode !== "" && saleStructure !== "";
      case 2: return true; // Content — optional
      case 3: return true; // Gallery — optional
      case 4: return true; // Team — optional
      case 5: return true; // FAQs — optional
      case 6: return true; // Documents — optional
      case 7: return phases.length > 0 && phases.every((p) => p.name.trim() !== "" && p.pricePerToken !== "" && p.allocation !== "" && p.startDate !== "" && p.endDate !== "");
      case 8: return selectedTokenId !== "" && softCap !== "" && hardCap !== "";
      case 9: return cliffDays !== "" && vestingDays !== "";
      default: return true;
    }
  })();
  const selectedToken = tokens.find((t) => t.id === selectedTokenId);

  const isStepComplete = (stepId: number): boolean => {
    switch (stepId) {
      case 1: return title.trim() !== "" && description.trim() !== "" && saleMode !== "" && saleStructure !== "";
      case 2: return !!fullDescription;
      case 3: return galleryItems.length > 0;
      case 4: return teamMembers.some((m) => m.name.trim() !== "");
      case 5: return faqs.some((f) => f.question.trim() !== "");
      case 6: return documents.some((d) => !!d.url);
      case 7: return phases.length > 0 && phases.every((p) => p.name.trim() !== "" && p.pricePerToken !== "" && p.allocation !== "" && p.startDate !== "" && p.endDate !== "");
      case 8: return selectedTokenId !== "" && softCap !== "" && hardCap !== "";
      case 9: return cliffDays !== "" && vestingDays !== "";
      default: return false;
    }
  };

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
          is_coming_soon: isComingSoon, otc_enabled: otcEnabled, otc_content: otcEnabled ? otcContent : undefined, otc_token_address: otcEnabled && otcTokenAddress ? otcTokenAddress : undefined,
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
        for (const g of galleryItems) await addSaleImage(sale.id, {
          url: g.url, caption: g.caption, is_banner: g.is_banner,
          sort_order: g.sort_order, media_type: g.media_type, video_url: g.video_url,
        }, tk);
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
      if (isComingSoon) {
        await submitSaleForApproval(saleId, getAccessToken() ?? "");
        setSuccess(true);
      } else {
        // Non-coming-soon: save as draft and redirect to sale page for deploy + setup
        router.push(`/issuer/sales/${saleId}`);
      }
    } catch (err) { setError(err instanceof Error ? err.message : "Submission failed"); }
    finally { setIsSubmitting(false); }
  };

  return (
    <IssuerDashboardLayout title="Create New Sale" description="Set up a token sale with rich content">
      {/* Progress Steps */}
      <div className="mb-8 overflow-x-auto">
        <div className="flex items-center justify-between relative min-w-[600px]">
          {allSteps.map((s) => {
            const complete = isStepComplete(s.id);
            const isCurrent = step === s.id;
            return (
            <div key={s.id} className="flex flex-col items-center z-10">
              <div className={`w-10 h-10 rounded-full flex items-center justify-center transition-colors cursor-pointer ${
                complete && !isCurrent ? "bg-green-500 text-white" : isCurrent ? "bg-darkAqua text-white" : "bg-gray-200 text-gray-500"
              }`} onClick={() => setStep(s.id)}>
                {complete && !isCurrent ? <CheckCircle2 className="h-5 w-5" /> : <s.icon className="h-5 w-5" />}
              </div>
              <p className={`mt-2 text-xs font-semibold ${isCurrent || complete ? "text-text" : "text-gray-400"}`}>{s.title}</p>
            </div>
            );
          })}
          <div className="absolute top-5 left-0 right-0 h-0.5 bg-gray-200 -z-0">
            <div className="h-full bg-green-500 transition-all duration-500" style={{ width: `${(allSteps.filter((s) => isStepComplete(s.id)).length / Math.max(allSteps.length - 1, 1)) * 100}%` }} />
          </div>
        </div>
      </div>

      {/* Navigation — above content */}
      {!isLast && (
        <div className="flex justify-between items-center mb-4">
          <div className="flex items-center gap-3">
            {isFirst ? <Link href="/issuer/sales"><Button variant="outline" size="sm">Cancel</Button></Link>
              : <Button variant="outline" size="sm" onClick={prevStep}>Back</Button>}
            {!savedSaleId && <Button variant="outline" size="sm" onClick={handleSaveDraft} isLoading={isSaving}>{isSaving ? "Saving..." : "Save Draft"}</Button>}
            {savedSaleId && <span className="text-xs text-green-600 font-medium">Draft saved</span>}
            {error && <span className="text-xs text-red-600">{error}</span>}
          </div>
          <Button variant="primary" size="sm" onClick={nextStep} disabled={!canProceed} rightIcon={<ArrowRight className="h-4 w-4" />}>Continue</Button>
        </div>
      )}
      {isLast && !isFirst && (
        <div className="flex items-center justify-between mb-4">
          <Button variant="outline" size="sm" onClick={prevStep}>Back</Button>
          <div className="flex items-center gap-2">
            {!savedSaleId && (
              <Button variant="outline" size="sm" onClick={handleSaveDraft} isLoading={isSaving}>
                {isSaving ? "Saving..." : "Save Draft"}
              </Button>
            )}
            {savedSaleId && !success && <span className="text-xs text-green-600 font-medium">Draft saved</span>}
            {success ? (
              <Link href="/issuer/sales"><Button variant="primary" size="sm">View Sales</Button></Link>
            ) : (
              <Button variant="primary" size="sm" onClick={handleSubmit} isLoading={isSubmitting}>
                {isSubmitting ? "Saving..." : isComingSoon ? "Submit for Approval" : "Save & Continue"}
              </Button>
            )}
          </div>
        </div>
      )}

      <div className="flex gap-5">
      <motion.div key={step} initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="bg-white rounded-lg p-8 border border-black/10 flex-1 min-w-0">
        {/* Step 1: Sale Info */}
        {step === 1 && (
          <div className="max-w-2xl mx-auto space-y-6">
            <h2 className="text-xl font-semibold text-text">Sale Info</h2>
            <Input label="Sale Title" placeholder="e.g., Gold Reserve Token Sale" value={title} onChange={(e) => setTitle(e.target.value)} />
            <div><label className="input-label">Short Description</label>
              <textarea className={TA} rows={2} placeholder="Brief summary" value={description} onChange={(e) => setDescription(e.target.value)} /></div>
            <div className="flex items-center gap-3 p-4 rounded-lg border border-black/10">
              <input type="checkbox" id="comingSoon" checked={isComingSoon} onChange={(e) => setIsComingSoon(e.target.checked)} className="h-5 w-5 rounded" />
              <label htmlFor="comingSoon" className="text-sm"><span className="font-semibold">Prelisting (coming soon)</span> — Publish as a preview without token or sale contract. You can convert to a live sale later.</label>
            </div>
            <Select label="Sale Mode" options={[{ value: "", label: "Select sale mode..." }, { value: "vested", label: "Vested (fractions → claim after vesting)" }, { value: "direct", label: "Direct (ERC-3643 tokens immediately)" }]}
              value={saleMode} onChange={(e) => setSaleMode(e.target.value)} />
            <Select label="Sale Structure" options={[
              { value: "", label: "Select sale structure..." },
              { value: "phase_allocated", label: "Phase Allocated — each phase has its own token cap" },
              { value: "price_tiered", label: "Price Tiered — 100% allocation shared, phases only change price" },
            ]} value={saleStructure} onChange={(e) => setSaleStructure(e.target.value)} />
            {/* OTC & Bank Transfer */}
            <div className="border-t border-black/10 pt-6 mt-2">
              <div className="flex items-center gap-3 p-4 rounded-lg border border-black/10">
                <input type="checkbox" id="otcEnabled" checked={otcEnabled} onChange={(e) => handleOtcToggle(e.target.checked)} className="h-5 w-5 rounded" />
                <label htmlFor="otcEnabled" className="text-sm"><span className="font-semibold">Enable OTC & Bank Transfer</span> — Allow investors to pay via wire transfer or OTC. An &quot;OTC &amp; Bank&quot; tab will be shown on the sale page.</label>
              </div>
              {otcEnabled && (
                <div className="mt-4 space-y-4">
                  <div className="space-y-2">
                    <label className="block text-sm font-medium text-zinc-600">OTC Instructions (shown to investors)</label>
                    <p className="text-xs text-zinc-400">Include wire details, process steps, minimum amounts, and contact info.</p>
                    <RichTextEditor content={otcContent} onChange={setOtcContent} placeholder="Enter OTC & bank transfer instructions..." />
                  </div>
                  <div className="space-y-1">
                    <label className="block text-sm font-medium text-zinc-600">OTC Token Contract Address (optional)</label>
                    <p className="text-xs text-zinc-400">If the issuer has an OTC token deployed, enter the address. Investors holding OTC tokens can use them to purchase at the sale price. Can also be set after sale creation.</p>
                    <Input value={otcTokenAddress} onChange={(e) => setOtcTokenAddress(e.target.value)} placeholder="0x... (leave empty to set later)"
                      maxLength={42} error={otcTokenAddress && !isAddress(otcTokenAddress) ? "Invalid EVM address" : undefined} />
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
        {/* Step 2: Content */}
        {step === 2 && (
          <div className="space-y-4">
            <h2 className="text-xl font-semibold text-text">Content</h2>
            <div>
              <label className="input-label">Full Description</label>
              <p className="text-xs text-zinc-400 mb-2">Detailed project description, investment thesis, background. Supports rich formatting.</p>
              <div className="min-h-[60vh]">
                <RichTextEditor content={fullDescription} onChange={setFullDescription} placeholder="Enter full project description..." />
              </div>
            </div>
          </div>
        )}
        {/* Step 3: Gallery */}
        {step === 3 && (
          <div className="max-w-2xl mx-auto space-y-6">
            <h2 className="text-xl font-semibold text-text">Media Gallery</h2>
            <p className="text-gray-500">Upload images and add a video. Select one as the hero banner.</p>
            <ImageGallery items={galleryItems} onChange={setGalleryItems} />
          </div>
        )}
        {/* Step 4: Team */}
        {step === 4 && (
          <div className="max-w-2xl mx-auto">
            <h2 className="text-xl font-semibold text-text mb-2">Team Members</h2>
            <p className="text-gray-500 mb-4 text-sm">Add key team members to display on the sale page</p>
            <div className="space-y-2">
              {teamMembers.map((m, i) => {
                const isOpen = expandedTeam === i;
                const label = m.name ? `${m.name}${m.title ? ` — ${m.title}` : ""}` : `Member ${i + 1} (empty)`;
                return (
                <div key={i} className="border border-black/10 rounded-lg overflow-hidden">
                  <button type="button" onClick={() => setExpandedTeam(isOpen ? null : i)}
                    className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-zinc-50 transition-colors">
                    {isOpen ? <ChevronDown className="h-4 w-4 text-zinc-400 shrink-0" /> : <ChevronRight className="h-4 w-4 text-zinc-400 shrink-0" />}
                    {m.photo_url ? (
                      <img src={m.photo_url.startsWith("/") ? `${process.env.NEXT_PUBLIC_API_URL || ""}${m.photo_url}` : m.photo_url}
                        alt="" className="w-8 h-8 rounded-full object-cover shrink-0" />
                    ) : (
                      <div className="w-8 h-8 rounded-full bg-zinc-200 flex items-center justify-center text-zinc-400 text-xs font-bold shrink-0">
                        {m.name?.[0]?.toUpperCase() || "?"}
                      </div>
                    )}
                    <span className="font-medium text-text text-sm flex-1 truncate">{label}</span>
                    {rmBtn(teamMembers, () => { setTeamMembers((t) => t.filter((_, idx) => idx !== i)); if (isOpen) setExpandedTeam(null); })}
                  </button>
                  {isOpen && (
                    <div className="px-4 pb-4 space-y-3 border-t border-black/5 pt-3">
                      <div className="grid grid-cols-2 gap-3">
                        <Input placeholder="Name" value={m.name} onChange={(e) => updTeam(i, "name", e.target.value)} />
                        <Input placeholder="Title (e.g. CEO)" value={m.title} onChange={(e) => updTeam(i, "title", e.target.value)} />
                      </div>
                      <textarea className={`${TA}`} rows={7} placeholder="Brief biography, expertise, and role in the project..." value={m.bio} onChange={(e) => updTeam(i, "bio", e.target.value)} />
                      <FileUpload label="Photo" accept="image/*" prefix="team" value={m.photo_url || null} previewType="image"
                        onUpload={(r) => updTeam(i, "photo_url", r.url)} onRemove={() => updTeam(i, "photo_url", "")} />
                    </div>
                  )}
                </div>);
              })}
              <Button variant="outline" size="sm" onClick={() => { setTeamMembers((t) => [...t, emptyTeam()]); setExpandedTeam(teamMembers.length); }} className="w-full">+ Add Team Member</Button>
            </div>
          </div>
        )}
        {/* Step 5: FAQs */}
        {step === 5 && (
          <div className="max-w-2xl mx-auto">
            <h2 className="text-xl font-semibold text-text mb-2">FAQs</h2>
            <p className="text-sm text-gray-500 mb-4">Add frequently asked questions for investors. These appear on the sale page.</p>
            <div className="space-y-3">
              {faqs.map((f, i) => {
                const isOpen = expandedFAQ === i;
                const preview = f.question || `FAQ ${i + 1} (empty)`;
                return (
                  <div key={i} className="border border-black/10 rounded-lg overflow-hidden">
                    <button type="button" onClick={() => setExpandedFAQ(isOpen ? null : i)}
                      className="w-full flex items-center gap-3 px-5 py-3.5 text-left hover:bg-zinc-50 transition-colors">
                      {isOpen ? <ChevronDown className="h-4 w-4 text-zinc-400 flex-shrink-0" /> : <ChevronRight className="h-4 w-4 text-zinc-400 flex-shrink-0" />}
                      <span className="font-semibold text-text text-sm flex-1 truncate">{preview}</span>
                      {rmBtn(faqs, () => { setFaqs((fq) => fq.filter((_, idx) => idx !== i)); if (isOpen) setExpandedFAQ(null); })}
                    </button>
                    {isOpen && (
                      <div className="px-5 pb-5 space-y-3 border-t border-black/5 pt-4">
                        <div><label className="input-label">Question</label><textarea className={TA} rows={3} placeholder="Enter the question..." value={f.question} onChange={(e) => updFAQ(i, "question", e.target.value)} /></div>
                        <div><label className="input-label">Answer</label><textarea className={TA} rows={7} placeholder="Enter a detailed answer..." value={f.answer} onChange={(e) => updFAQ(i, "answer", e.target.value)} /></div>
                      </div>
                    )}
                  </div>
                );
              })}
              <Button variant="outline" onClick={() => { setFaqs((f) => [...f, emptyFAQ()]); setExpandedFAQ(faqs.length); }} className="w-full">+ Add FAQ</Button>
            </div>
          </div>
        )}
        {/* Step 6: Documents */}
        {step === 6 && (
          <div className="max-w-2xl mx-auto">
            <h2 className="text-xl font-semibold text-text mb-2">Documents</h2>
            <p className="text-sm text-gray-500 mb-4">Upload supporting documents — legal, audit, whitepaper, or other files.</p>
            <div className="space-y-2">
              {documents.map((d, i) => {
                const isOpen = expandedDoc === i;
                const label = d.name || `Document ${i + 1} (empty)`;
                const typeLabel = DOC_TYPES.find((t) => t.value === d.type)?.label || d.type;
                return (
                <div key={i} className="border border-black/10 rounded-lg overflow-hidden">
                  <button type="button" onClick={() => setExpandedDoc(isOpen ? null : i)}
                    className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-zinc-50 transition-colors">
                    {isOpen ? <ChevronDown className="h-4 w-4 text-zinc-400 shrink-0" /> : <ChevronRight className="h-4 w-4 text-zinc-400 shrink-0" />}
                    <FileText className="h-4 w-4 text-zinc-400 shrink-0" />
                    <span className="font-medium text-text text-sm flex-1 truncate">{label}</span>
                    <span className="text-[10px] text-zinc-400 uppercase font-medium shrink-0">{typeLabel}</span>
                    {d.url && <span className="w-2 h-2 rounded-full bg-green-500 shrink-0" title="Uploaded" />}
                    {rmBtn(documents, () => { setDocuments((ds) => ds.filter((_, idx) => idx !== i)); if (isOpen) setExpandedDoc(null); })}
                  </button>
                  {isOpen && (
                    <div className="px-4 pb-4 space-y-3 border-t border-black/5 pt-3">
                      <div className="grid grid-cols-2 gap-3">
                        <Input label="Name" value={d.name} onChange={(e) => updDoc(i, "name", e.target.value)} />
                        <Select label="Type" options={DOC_TYPES} value={d.type} onChange={(e) => updDoc(i, "type", e.target.value)} />
                      </div>
                      <FileUpload label="Document File" accept=".pdf" prefix="documents" value={d.url || null} previewType="document"
                        visibility={["whitepaper", "legal"].includes(d.type) ? "public" : "private"}
                        onUpload={(r) => updDoc(i, "url", r.url)} onRemove={() => updDoc(i, "url", "")} />
                    </div>
                  )}
                </div>);
              })}
              <Button variant="outline" size="sm" onClick={() => { setDocuments((ds) => [...ds, emptyDoc()]); setExpandedDoc(documents.length); }} className="w-full">+ Add Document</Button>
            </div>
          </div>
        )}
        {/* Step 7: Phases (skip if coming soon) */}
        {step === 7 && (
          <div className="max-w-2xl mx-auto">
            <h2 className="text-xl font-semibold text-text mb-1">Sale Phases</h2>
            <p className="text-sm text-gray-500 mb-6">
              Define one or more sale phases. Each phase has its own price, allocation, and time window.
              Phases run sequentially — they must not overlap.
            </p>
            <div className="space-y-2">
              {phases.map((ph, i) => {
                const isOpen = expandedPhase === i;
                const totalRaise = ph.pricePerToken && ph.allocation ? (parseFloat(ph.pricePerToken) * parseFloat(ph.allocation)).toLocaleString("en-US") : null;
                const summary = ph.pricePerToken && ph.allocation ? `$${ph.pricePerToken}/token · ${Number(ph.allocation).toLocaleString()} tokens` : "";
                return (
                <div key={i} className="border border-zinc-200 rounded-lg overflow-hidden">
                  <button type="button" onClick={() => setExpandedPhase(isOpen ? null : i)}
                    className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-zinc-50 transition-colors">
                    {isOpen ? <ChevronDown className="h-4 w-4 text-zinc-400 shrink-0" /> : <ChevronRight className="h-4 w-4 text-zinc-400 shrink-0" />}
                    <span className="w-6 h-6 rounded-full bg-darkAqua text-white text-xs font-bold flex items-center justify-center shrink-0">{i + 1}</span>
                    <span className="font-medium text-sm text-zinc-900 flex-1 truncate">{ph.name || `Phase ${i + 1}`}</span>
                    {summary && <span className="text-xs text-zinc-400 shrink-0">{summary}</span>}
                    {rmBtn(phases, () => { setPhases((p) => p.filter((_, idx) => idx !== i)); if (isOpen) setExpandedPhase(null); })}
                  </button>
                  {isOpen && (
                    <div className="px-4 pb-4 space-y-4 border-t border-zinc-100 pt-3">
                      <div>
                        <Input label="Phase Name" placeholder="e.g., Seed Round" value={ph.name} onChange={(e) => updPhase(i, "name", e.target.value)} />
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <Input label="Price per Token (USDC)" type="number" placeholder="e.g., 1.00" value={ph.pricePerToken} onChange={(e) => updPhase(i, "pricePerToken", e.target.value)} />
                        <Input label="Allocation (tokens)" type="number" placeholder="e.g., 100000" value={ph.allocation} onChange={(e) => updPhase(i, "allocation", e.target.value)} />
                      </div>
                      {totalRaise && (
                        <div className="bg-darkAqua/5 rounded-md px-3 py-2 text-xs">
                          <span className="text-zinc-500">Phase raise: </span>
                          <span className="font-semibold text-darkAqua">${totalRaise} USDC</span>
                        </div>
                      )}
                      <div className="grid grid-cols-2 gap-3">
                        <Input label="Start Date" type="datetime-local" value={ph.startDate} onChange={(e) => updPhase(i, "startDate", e.target.value)} />
                        <Input label="End Date" type="datetime-local" value={ph.endDate} onChange={(e) => updPhase(i, "endDate", e.target.value)} />
                      </div>
                    </div>
                  )}
                </div>);
              })}
              <Button variant="outline" size="sm" onClick={() => { setPhases((p) => [...p, emptyPhase()]); setExpandedPhase(phases.length); }} className="w-full">
                + Add Phase
              </Button>
            </div>
          </div>
        )}
        {/* Step 8: Token & Caps (skip if coming soon) */}
        {step === 8 && (
          <div className="max-w-2xl mx-auto space-y-6">
            <h2 className="text-xl font-semibold text-text">Token & Funding Caps</h2>
            <Select label="Token being sold (optional)" options={[{ value: "", label: "Select a token..." }, ...tokens.filter((t) => t.contract_address && t.contract_address !== "0x0000000000000000000000000000000000000000").map((t) => {
              const addr = t.contract_address!;
              return { value: t.id, label: `${t.name} (${t.symbol}) — ${addr.slice(0, 6)}...${addr.slice(-4)}` };
            })]}
              value={selectedTokenId} onChange={(e) => setSelectedTokenId(e.target.value)} />
            <Select label="Payment Token (Stablecoin)" options={PAYMENT_TOKENS.map((pt) => ({
              ...pt,
              label: pt.value ? `${pt.label.split(" — ")[0]} — ${pt.value.slice(0, 6)}...${pt.value.slice(-4)}` : pt.label,
            }))} value={paymentToken} onChange={(e) => setPaymentToken(e.target.value)} />
            <div className="grid grid-cols-2 gap-4">
              <Input label="Soft Cap (USDC)" type="number" placeholder="e.g., 50000" value={softCap} onChange={(e) => setSoftCap(e.target.value)} />
              <Input label="Hard Cap (USDC)" type="number" placeholder="e.g., 500000" value={hardCap} onChange={(e) => setHardCap(e.target.value)} />
            </div>
          </div>
        )}
        {/* Step 9: Vesting (skip if direct or coming soon) */}
        {step === 9 && (() => {
          const PRESETS = [
            { label: "No cliff", days: 0 },
            { label: "1 day", days: 1 },
            { label: "1 week", days: 7 },
            { label: "1 month", days: 30 },
            { label: "3 months", days: 90 },
            { label: "6 months", days: 180 },
            { label: "9 months", days: 270 },
            { label: "1 year", days: 365 },
            { label: "1.5 years", days: 548 },
            { label: "2 years", days: 730 },
            { label: "3 years", days: 1095 },
          ];
          const cliffNum = parseInt(cliffDays) || 0;
          const vestingNum = parseInt(vestingDays) || 0;
          const cliffError = cliffNum > 0 && vestingNum > 0 && cliffNum >= vestingNum;
          const totalDays = cliffNum + vestingNum;

          const fmtDuration = (d: number) =>
            d === 0 ? "None" : d < 30 ? `${d} day${d > 1 ? "s" : ""}` : d < 365 ? `${(d / 30).toFixed(1)} months` : `${(d / 365).toFixed(1)} years`;

          return (
          <div className="max-w-2xl mx-auto space-y-6">
            <h2 className="text-xl font-semibold text-text mb-1">Vesting Configuration</h2>
            <p className="text-sm text-gray-500">Configure how tokens are released to investors after the sale finalizes.</p>

            {/* Cliff */}
            <div>
              <label className="block text-sm font-medium text-zinc-700 mb-2">Cliff Period</label>
              <p className="text-xs text-zinc-400 mb-3">No tokens can be claimed during the cliff. After the cliff ends, vesting begins.</p>
              <div className="flex flex-wrap gap-2 mb-2">
                {PRESETS.filter(p => p.days < vestingNum || vestingNum === 0).map((p) => (
                  <button key={`cliff-${p.days}`} type="button" onClick={() => setCliffDays(String(p.days))}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                      cliffNum === p.days ? "bg-darkAqua text-white" : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200"
                    }`}>
                    {p.label}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-2">
                <Input type="number" min={0} placeholder="Custom days" value={cliffDays}
                  onChange={(e) => setCliffDays(e.target.value)} />
                <span className="text-xs text-zinc-400 whitespace-nowrap">days</span>
              </div>
            </div>

            {/* Vesting */}
            <div>
              <label className="block text-sm font-medium text-zinc-700 mb-2">Vesting Duration</label>
              <p className="text-xs text-zinc-400 mb-3">After the cliff, tokens unlock linearly over this period. At the end, 100% is claimable.</p>
              <div className="flex flex-wrap gap-2 mb-2">
                {PRESETS.filter(p => p.days > 0 && p.days > cliffNum).map((p) => (
                  <button key={`vest-${p.days}`} type="button" onClick={() => setVestingDays(String(p.days))}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                      vestingNum === p.days ? "bg-darkAqua text-white" : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200"
                    }`}>
                    {p.label}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-2">
                <Input type="number" min={1} placeholder="Custom days" value={vestingDays}
                  onChange={(e) => setVestingDays(e.target.value)} />
                <span className="text-xs text-zinc-400 whitespace-nowrap">days</span>
              </div>
            </div>

            {/* Validation */}
            {cliffError && (
              <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-600">
                Cliff must be shorter than the vesting duration.
              </div>
            )}

            {/* Preview */}
            <div className="p-4 rounded-lg bg-darkAqua/5 border border-darkAqua/20 text-sm space-y-2">
              <p className="font-semibold text-zinc-900">Schedule Preview</p>
              <div className="grid grid-cols-3 gap-3 text-center">
                <div className="bg-white rounded-lg p-3">
                  <p className="text-xs text-zinc-400">Cliff</p>
                  <p className="font-bold text-zinc-900">{fmtDuration(cliffNum)}</p>
                </div>
                <div className="bg-white rounded-lg p-3">
                  <p className="text-xs text-zinc-400">Vesting</p>
                  <p className="font-bold text-zinc-900">{fmtDuration(vestingNum)}</p>
                </div>
                <div className="bg-white rounded-lg p-3">
                  <p className="text-xs text-zinc-400">Full Unlock</p>
                  <p className="font-bold text-darkAqua">{fmtDuration(totalDays)}</p>
                </div>
              </div>
              {vestingNum > 0 && (
                <div className="mt-2">
                  <div className="flex items-center gap-1 text-[10px] text-zinc-400 mb-1">
                    <span>Sale finalizes</span>
                    <span className="flex-1 border-t border-dashed border-zinc-300" />
                    {cliffNum > 0 && <><span>Cliff ends</span><span className="flex-1 border-t border-dashed border-zinc-300" /></>}
                    <span>Fully vested</span>
                  </div>
                  <div className="h-2 rounded-md bg-zinc-200 overflow-hidden flex">
                    {cliffNum > 0 && <div className="bg-amber-400" style={{ width: `${(cliffNum / totalDays) * 100}%` }} />}
                    <div className="bg-darkAqua" style={{ width: `${(vestingNum / totalDays) * 100}%` }} />
                  </div>
                </div>
              )}
            </div>
          </div>
          );
        })()}
        {/* Step 10: Review */}
        {step === 10 && (() => {
          const imgCount = galleryItems.filter((i) => i.media_type === "image").length;
          const vidCount = galleryItems.filter((i) => i.media_type === "video").length;
          const teamCount = teamMembers.filter((m) => m.name).length;
          const faqCount = faqs.filter((f) => f.question).length;
          const docCount = documents.filter((d) => d.url).length;
          const phaseCount = phases.filter((p) => p.name).length;

          const SectionRow = ({ label, value, muted }: { label: string; value: string; muted?: boolean }) => (
            <div className="flex justify-between py-1.5">
              <span className="text-zinc-500 text-sm">{label}</span>
              <span className={`text-sm font-medium ${muted ? "text-zinc-400" : "text-text"}`}>{value}</span>
            </div>
          );

          return (
          <div className="max-w-3xl mx-auto">
            <div className="mb-6">
              <h2 className="text-xl font-semibold text-text">{isComingSoon ? "Ready to Publish" : "Review & Submit"}</h2>
              <p className="text-sm text-zinc-500 mt-0.5">Review your sale details before {isComingSoon ? "publishing" : "saving"}</p>
            </div>

            {error && <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-600 mb-4">{error}</div>}

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* Sale Info */}
              <div className="bg-white border border-zinc-100 rounded-lg p-5">
                <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-3">Sale Info</h3>
                <SectionRow label="Title" value={title || "Untitled"} muted={!title} />
                <SectionRow label="Type" value={isComingSoon ? "Coming Soon" : "Live Sale"} />
                <SectionRow label="Mode" value={saleMode === "vested" ? "Vested" : "Direct"} />
                <SectionRow label="Structure" value={saleStructure === "phase_allocated" ? "Phase Allocated" : "Price Tiered"} />
                <SectionRow label="OTC & Bank Transfer" value={otcEnabled ? "Enabled" : "Disabled"} />
                {description && <SectionRow label="Description" value={`${description.slice(0, 50)}...`} />}
              </div>

              {/* Token & Funding */}
              {!isComingSoon && (
                <div className="bg-white border border-zinc-100 rounded-lg p-5">
                  <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-3">Token & Funding</h3>
                  <SectionRow label="Token" value={selectedToken ? `${selectedToken.name} (${selectedToken.symbol})` : "Not selected"} muted={!selectedToken} />
                  <SectionRow label="Payment" value={paymentToken ? PAYMENT_TOKENS.find(t => t.value === paymentToken)?.label?.split(" — ")[0] || paymentToken.slice(0, 10) + "..." : "Not set"} muted={!paymentToken} />
                  <SectionRow label="Soft Cap" value={softCap ? `$${Number(softCap).toLocaleString()}` : "Not set"} muted={!softCap} />
                  <SectionRow label="Hard Cap" value={hardCap ? `$${Number(hardCap).toLocaleString()}` : "Not set"} muted={!hardCap} />
                  <SectionRow label="Phases" value={`${phaseCount} configured`} />
                  {saleMode === "vested" && (
                    <SectionRow label="Vesting" value={`${cliffDays}d cliff + ${vestingDays}d linear`} />
                  )}
                </div>
              )}

              {/* Content & Media */}
              <div className="bg-white border border-zinc-100 rounded-lg p-5">
                <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-3">Content & Media</h3>
                <SectionRow label="Full Description" value={fullDescription ? `${fullDescription.length} chars` : "None"} muted={!fullDescription} />
                <SectionRow label="Gallery" value={imgCount || vidCount ? `${imgCount} image${imgCount !== 1 ? "s" : ""}, ${vidCount} video${vidCount !== 1 ? "s" : ""}` : "Empty"} muted={!imgCount && !vidCount} />
                <SectionRow label="Hero Image" value={bannerImageUrl ? "Selected" : "None"} muted={!bannerImageUrl} />
                <SectionRow label="Team" value={teamCount ? `${teamCount} member${teamCount !== 1 ? "s" : ""}` : "None"} muted={!teamCount} />
              </div>

              {/* FAQs */}
              <div className="bg-white border border-zinc-100 rounded-lg p-5">
                <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-3">FAQs</h3>
                {faqCount > 0 ? (
                  <div className="space-y-2">
                    {faqs.filter((f) => f.question).map((f, i) => (
                      <div key={i} className="text-sm">
                        <p className="font-medium text-text">{f.question}</p>
                        <p className="text-zinc-400 text-xs mt-0.5 truncate">{f.answer || "No answer"}</p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-zinc-400">No FAQs added</p>
                )}
              </div>

              {/* Documents */}
              <div className="bg-white border border-zinc-100 rounded-lg p-5 lg:col-span-2">
                <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-3">Documents</h3>
                {docCount > 0 ? (
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {documents.filter((d) => d.url).map((d, i) => (
                      <div key={i} className="flex items-center gap-2 bg-zinc-50 rounded-md px-3 py-2 text-sm">
                        <FileText className="h-4 w-4 text-zinc-400 shrink-0" />
                        <div className="min-w-0">
                          <p className="font-medium text-text truncate">{d.name || "Untitled"}</p>
                          <p className="text-[10px] text-zinc-400 uppercase">{d.type}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-zinc-400">No documents uploaded</p>
                )}
              </div>
            </div>

          </div>
          );
        })()}
      </motion.div>

      {/* Right sidebar — contextual tips */}
      <aside className="hidden lg:block w-72 shrink-0">
        <div className="sticky top-20 space-y-4">
          {step === 1 && (
            <div className="bg-zinc-50 border border-zinc-100 rounded-lg p-4">
              <h4 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2">Tips</h4>
              <ul className="text-xs text-zinc-500 space-y-2">
                <li>Choose a clear, descriptive title that investors will recognize.</li>
                <li><strong>Direct</strong> mode delivers tokens immediately after purchase.</li>
                <li><strong>Vested</strong> mode locks tokens and releases them over time.</li>
                <li>Enable OTC if you want to accept bank transfers or off-chain payments.</li>
              </ul>
            </div>
          )}
          {step === 2 && (
            <div className="bg-zinc-50 border border-zinc-100 rounded-lg p-4">
              <h4 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2">Content Tips</h4>
              <ul className="text-xs text-zinc-500 space-y-2">
                <li>Use the rich editor to add headings, images, and videos.</li>
                <li>This content appears as the main description on the sale page.</li>
                <li>Upload images directly — they&apos;re stored on our cloud storage.</li>
              </ul>
            </div>
          )}
          {step === 3 && (
            <div className="bg-zinc-50 border border-zinc-100 rounded-lg p-4">
              <h4 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2">Gallery Tips</h4>
              <ul className="text-xs text-zinc-500 space-y-2">
                <li>Add high-quality images that showcase the asset.</li>
                <li>Set one image as the hero/banner — it appears at the top of the sale page.</li>
                <li>You can also add YouTube videos for presentations or explainers.</li>
              </ul>
            </div>
          )}
          {step === 4 && (
            <div className="bg-zinc-50 border border-zinc-100 rounded-lg p-4">
              <h4 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2">Team Tips</h4>
              <ul className="text-xs text-zinc-500 space-y-2">
                <li>Showing your team builds trust with investors.</li>
                <li>Include key roles: CEO, CTO, legal, operations.</li>
                <li>Photos are optional but strongly recommended.</li>
              </ul>
            </div>
          )}
          {step === 5 && (
            <div className="bg-zinc-50 border border-zinc-100 rounded-lg p-4">
              <h4 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2">FAQ Tips</h4>
              <ul className="text-xs text-zinc-500 space-y-2">
                <li>Answer common investor questions: &ldquo;What is this token backed by?&rdquo;, &ldquo;When can I trade?&rdquo;</li>
                <li>Good FAQs reduce support requests and improve conversion.</li>
                <li>3-5 FAQs is a good starting point.</li>
              </ul>
            </div>
          )}
          {step === 6 && (
            <div className="bg-zinc-50 border border-zinc-100 rounded-lg p-4">
              <h4 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2">Document Tips</h4>
              <ul className="text-xs text-zinc-500 space-y-2">
                <li>Upload legal documents, audit reports, and whitepapers.</li>
                <li>Legal and whitepaper docs are publicly visible to investors.</li>
                <li>Audit docs build credibility — third-party audits are highly valued.</li>
              </ul>
            </div>
          )}
          {step === 7 && (
            <div className="bg-zinc-50 border border-zinc-100 rounded-lg p-4">
              <h4 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2">Phase Tips</h4>
              <ul className="text-xs text-zinc-500 space-y-2">
                <li>Phases run sequentially — they must not overlap in dates.</li>
                <li>Common pattern: Seed → Private → Public with increasing prices.</li>
                <li>Each phase has its own allocation cap and time window.</li>
              </ul>
            </div>
          )}
          {step === 8 && (
            <div className="bg-zinc-50 border border-zinc-100 rounded-lg p-4">
              <h4 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2">Funding Tips</h4>
              <ul className="text-xs text-zinc-500 space-y-2">
                <li>Select the deployed token this sale will distribute.</li>
                <li><strong>Soft cap</strong> — minimum raise needed. Below this, investors can claim refunds.</li>
                <li><strong>Hard cap</strong> — maximum raise. Sale closes when this is reached.</li>
              </ul>
            </div>
          )}
          {step === 9 && (
            <div className="bg-zinc-50 border border-zinc-100 rounded-lg p-4">
              <h4 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2">Vesting Tips</h4>
              <ul className="text-xs text-zinc-500 space-y-2">
                <li><strong>Cliff</strong> — no tokens can be claimed during this period.</li>
                <li><strong>Vesting</strong> — after the cliff, tokens unlock linearly over this duration.</li>
                <li>Common: 6-month cliff + 12-month vesting for early investors.</li>
              </ul>
            </div>
          )}
          {step === 10 && (
            <div className="bg-darkAqua/10 border border-darkAqua/30 rounded-lg p-4">
              <h4 className="text-xs font-semibold text-darkAqua uppercase tracking-wider mb-2">Next Steps</h4>
              <ul className="text-xs text-zinc-600 space-y-2">
                {isComingSoon ? (
                  <>
                    <li>Save to create the sale.</li>
                    <li>Once approved by admin, it will appear on the launchpad as Coming Soon.</li>
                    <li>You can convert it to a live sale later by adding phases and token details.</li>
                  </>
                ) : (
                  <>
                    <li>Save to create the sale record.</li>
                    <li>Deploy the sale contract on-chain.</li>
                    <li>Complete the setup checklist (whitelist, deposit tokens).</li>
                    <li>Submit for admin approval.</li>
                    <li>Once approved, investors can start buying.</li>
                  </>
                )}
              </ul>
            </div>
          )}
        </div>
      </aside>
      </div>

    </IssuerDashboardLayout>
  );
}
