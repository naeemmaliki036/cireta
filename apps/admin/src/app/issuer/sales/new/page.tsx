"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import dynamic from "next/dynamic";
import { ArrowRight, CheckCircle2, Coins, FileText, Calendar, Rocket, Users, HelpCircle, Clock, Settings, ImageIcon, ChevronDown, ChevronRight } from "lucide-react";

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
const TA = "w-full rounded-lg border border-darkBlack/10 p-3 text-sm focus:outline-none focus:ring-2 focus:ring-darkAqua";

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
    { id: 5, title: "FAQ & Docs", icon: HelpCircle },
    ...(!isComingSoon ? [{ id: 6, title: "Phases", icon: Calendar }] : []),
    ...(!isComingSoon ? [{ id: 7, title: "Token & Caps", icon: Settings }] : []),
    ...(!isComingSoon && saleMode === "vested" ? [{ id: 8, title: "Vesting", icon: Clock }] : []),
    { id: 9, title: "Review", icon: Rocket },
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
      case 5: return true; // FAQ & Docs — optional
      case 6: return phases.length > 0 && phases.every((p) => p.name.trim() !== "" && p.pricePerToken !== "" && p.allocation !== "" && p.startDate !== "" && p.endDate !== "");
      case 7: return selectedTokenId !== "" && softCap !== "" && hardCap !== "";
      case 8: return cliffDays !== "" && vestingDays !== "";
      default: return true;
    }
  })();
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

      <motion.div key={step} initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="bg-white rounded-lg p-8 border border-darkBlack/10">
        {/* Step 1: Sale Info */}
        {step === 1 && (
          <div className="max-w-2xl mx-auto space-y-6">
            <h2 className="text-xl font-semibold text-text">Sale Info</h2>
            <Input label="Sale Title" placeholder="e.g., Gold Reserve Token Sale" value={title} onChange={(e) => setTitle(e.target.value)} />
            <div><label className="input-label">Short Description</label>
              <textarea className={TA} rows={2} placeholder="Brief summary" value={description} onChange={(e) => setDescription(e.target.value)} /></div>
            <div className="flex items-center gap-3 p-4 rounded-lg border border-darkBlack/10">
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
            <div className="border-t border-darkBlack/10 pt-6 mt-2">
              <div className="flex items-center gap-3 p-4 rounded-lg border border-darkBlack/10">
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
            <p className="text-gray-500 mb-6">Add key team members to display on the sale page</p>
            <div className="space-y-6">
              {teamMembers.map((m, i) => (
                <div key={i} className="border border-darkBlack/10 rounded-lg p-6 space-y-4">
                  <div className="flex items-center justify-between"><h3 className="font-semibold text-text">Member {i + 1}</h3>{rmBtn(teamMembers, () => setTeamMembers((t) => t.filter((_, idx) => idx !== i)))}</div>
                  <div className="grid grid-cols-2 gap-4">
                    <Input label="Name" placeholder="John Doe" value={m.name} onChange={(e) => updTeam(i, "name", e.target.value)} />
                    <Input label="Title" placeholder="CEO" value={m.title} onChange={(e) => updTeam(i, "title", e.target.value)} />
                  </div>
                  <div><label className="input-label">Bio</label><textarea className={`${TA} resize-y`} rows={7} placeholder="Brief biography, expertise, and role in the project..." value={m.bio} onChange={(e) => updTeam(i, "bio", e.target.value)} /></div>
                  <FileUpload label="Photo" accept="image/*" prefix="team" value={m.photo_url || null} previewType="image"
                    onUpload={(r) => updTeam(i, "photo_url", r.url)} onRemove={() => updTeam(i, "photo_url", "")} />
                </div>))}
              <Button variant="outline" onClick={() => setTeamMembers((t) => [...t, emptyTeam()])} className="w-full">+ Add Team Member</Button>
            </div>
          </div>
        )}
        {/* Step 5: FAQ & Docs */}
        {step === 5 && (
          <div className="max-w-2xl mx-auto space-y-8">
            <div>
              <h2 className="text-xl font-semibold text-text mb-2">FAQs</h2>
              <div className="space-y-3">
                {faqs.map((f, i) => {
                  const isOpen = expandedFAQ === i;
                  const preview = f.question || `FAQ ${i + 1} (empty)`;
                  return (
                    <div key={i} className="border border-darkBlack/10 rounded-lg overflow-hidden">
                      <button type="button" onClick={() => setExpandedFAQ(isOpen ? null : i)}
                        className="w-full flex items-center gap-3 px-5 py-3.5 text-left hover:bg-zinc-50 transition-colors">
                        {isOpen ? <ChevronDown className="h-4 w-4 text-zinc-400 flex-shrink-0" /> : <ChevronRight className="h-4 w-4 text-zinc-400 flex-shrink-0" />}
                        <span className="font-semibold text-text text-sm flex-1 truncate">{preview}</span>
                        {rmBtn(faqs, () => { setFaqs((fq) => fq.filter((_, idx) => idx !== i)); if (isOpen) setExpandedFAQ(null); })}
                      </button>
                      {isOpen && (
                        <div className="px-5 pb-5 space-y-3 border-t border-darkBlack/5 pt-4">
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
            <div>
              <h2 className="text-xl font-semibold text-text mb-2">Documents</h2>
              <div className="space-y-4">
                {documents.map((d, i) => (
                  <div key={i} className="border border-darkBlack/10 rounded-lg p-5 space-y-3">
                    <div className="flex items-center justify-between"><span className="font-semibold text-text text-sm">Doc {i + 1}</span>{rmBtn(documents, () => setDocuments((ds) => ds.filter((_, idx) => idx !== i)))}</div>
                    <div className="grid grid-cols-2 gap-4">
                      <Input label="Name" value={d.name} onChange={(e) => updDoc(i, "name", e.target.value)} />
                      <Select label="Type" options={DOC_TYPES} value={d.type} onChange={(e) => updDoc(i, "type", e.target.value)} />
                    </div>
                    <FileUpload label="Document File" accept=".pdf" prefix="documents" value={d.url || null} previewType="document"
                      visibility={["whitepaper", "legal"].includes(d.type) ? "public" : "private"}
                      onUpload={(r) => updDoc(i, "url", r.url)} onRemove={() => updDoc(i, "url", "")} />
                  </div>))}
                <Button variant="outline" onClick={() => setDocuments((ds) => [...ds, emptyDoc()])} className="w-full">+ Add Document</Button>
              </div>
            </div>
          </div>
        )}
        {/* Step 6: Phases (skip if coming soon) */}
        {step === 6 && (
          <div className="max-w-2xl mx-auto">
            <h2 className="text-xl font-semibold text-text mb-1">Sale Phases</h2>
            <p className="text-sm text-gray-500 mb-6">
              Define one or more sale phases. Each phase has its own price, allocation, and time window.
              Phases run sequentially — they must not overlap.
            </p>
            <div className="space-y-6">
              {phases.map((ph, i) => {
                const totalRaise = ph.pricePerToken && ph.allocation ? (parseFloat(ph.pricePerToken) * parseFloat(ph.allocation)).toLocaleString("en-US") : null;
                return (
                <div key={i} className="border border-zinc-200 rounded-lg overflow-hidden">
                  {/* Phase header */}
                  <div className="flex items-center justify-between px-5 py-3 bg-zinc-50 border-b border-zinc-100">
                    <div className="flex items-center gap-2">
                      <span className="w-6 h-6 rounded-full bg-darkAqua text-white text-xs font-bold flex items-center justify-center">{i + 1}</span>
                      <h3 className="font-semibold text-sm text-zinc-900">{ph.name || `Phase ${i + 1}`}</h3>
                    </div>
                    {rmBtn(phases, () => setPhases((p) => p.filter((_, idx) => idx !== i)))}
                  </div>

                  <div className="p-5 space-y-4">
                    <div>
                      <Input label="Phase Name" placeholder="e.g., Seed Round, Private Sale, Public Sale" value={ph.name} onChange={(e) => updPhase(i, "name", e.target.value)} />
                      <p className="text-[11px] text-zinc-400 mt-1">This name is shown to investors on the launchpad.</p>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Input label="Price per Token (USDC)" type="number" placeholder="e.g., 1.00" value={ph.pricePerToken} onChange={(e) => updPhase(i, "pricePerToken", e.target.value)} />
                        <p className="text-[11px] text-zinc-400 mt-1">How much 1 token costs in USDC.</p>
                      </div>
                      <div>
                        <Input label="Allocation (tokens)" type="number" placeholder="e.g., 100000" value={ph.allocation} onChange={(e) => updPhase(i, "allocation", e.target.value)} />
                        <p className="text-[11px] text-zinc-400 mt-1">Max tokens available in this phase.</p>
                      </div>
                    </div>

                    {/* Calculated raise */}
                    {totalRaise && (
                      <div className="bg-darkAqua/5 rounded-lg px-4 py-2 text-sm">
                        <span className="text-zinc-500">Phase raise: </span>
                        <span className="font-semibold text-darkAqua">${totalRaise} USDC</span>
                        <span className="text-zinc-400"> ({Number(ph.allocation).toLocaleString("en-US")} tokens × ${ph.pricePerToken})</span>
                      </div>
                    )}

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Input label="Start Date & Time" type="datetime-local" value={ph.startDate} onChange={(e) => updPhase(i, "startDate", e.target.value)} />
                        <p className="text-[11px] text-zinc-400 mt-1">When investors can start buying.</p>
                      </div>
                      <div>
                        <Input label="End Date & Time" type="datetime-local" value={ph.endDate} onChange={(e) => updPhase(i, "endDate", e.target.value)} />
                        <p className="text-[11px] text-zinc-400 mt-1">Phase closes at this time.</p>
                      </div>
                    </div>
                  </div>
                </div>);
              })}
              <button onClick={() => setPhases((p) => [...p, emptyPhase()])}
                className="w-full border-2 border-dashed border-zinc-300 hover:border-darkAqua rounded-lg py-4 text-sm font-medium text-zinc-500 hover:text-darkAqua transition-colors">
                + Add Another Phase
              </button>
            </div>
          </div>
        )}
        {/* Step 7: Token & Caps (skip if coming soon) */}
        {step === 7 && (
          <div className="max-w-2xl mx-auto space-y-6">
            <h2 className="text-xl font-semibold text-text">Token & Funding Caps</h2>
            <Select label="Token being sold (optional)" options={[{ value: "", label: "Select a token..." }, ...tokens.map((t) => {
              const addr = t.contract_address;
              const masked = addr ? ` — ${addr.slice(0, 6)}...${addr.slice(-4)}` : "";
              return { value: t.id, label: `${t.name} (${t.symbol})${masked}` };
            })]}
              value={selectedTokenId} onChange={(e) => setSelectedTokenId(e.target.value)} />
            <Select label="Payment Token (Stablecoin)" options={PAYMENT_TOKENS} value={paymentToken} onChange={(e) => setPaymentToken(e.target.value)} />
            <div className="grid grid-cols-2 gap-4">
              <Input label="Soft Cap (USDC)" type="number" placeholder="e.g., 50000" value={softCap} onChange={(e) => setSoftCap(e.target.value)} />
              <Input label="Hard Cap (USDC)" type="number" placeholder="e.g., 500000" value={hardCap} onChange={(e) => setHardCap(e.target.value)} />
            </div>
          </div>
        )}
        {/* Step 8: Vesting (skip if direct or coming soon) */}
        {step === 8 && (() => {
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
        {/* Step 9: Review */}
        {step === 9 && (
          <div className="max-w-2xl mx-auto text-center">
            <div className="w-20 h-20 rounded-md bg-darkAqua/10 flex items-center justify-center mx-auto mb-6"><Rocket className="h-10 w-10 text-darkAqua" /></div>
            <h2 className="text-xl font-semibold text-text mb-2">{isComingSoon ? "Ready to Publish as Coming Soon" : "Ready to Submit"}</h2>
            <p className="text-gray-500 mb-8">{isComingSoon ? "This will be submitted for admin approval as a Coming Soon listing" : "This will be submitted for admin approval"}</p>
            <div className="bg-box rounded-lg p-6 text-left mb-8 space-y-3 text-sm">
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
                ["Gallery", `${galleryItems.filter((i) => i.media_type === "image").length} images, ${galleryItems.filter((i) => i.media_type === "video").length} videos`],
                ["Hero", bannerImageUrl ? "Selected" : "None"],
                ["Team", `${teamMembers.filter((m) => m.name).length} members`],
                ["FAQs", `${faqs.filter((f) => f.question).length}`],
                ["Documents", `${documents.filter((d) => d.url).length}`],
              ].map(([label, value]) => (
                <div key={String(label)} className="flex justify-between"><span className="text-gray-500">{label}</span><span className="font-medium">{value}</span></div>
              ))}
            </div>
            <div className="p-4 rounded-lg bg-gold/10 border border-gold/30 text-left">
              <p className="text-sm text-gray-600"><strong className="text-gold">Next steps:</strong> {isComingSoon
                ? "Save to create the sale. Once approved by admin, it will appear on the launchpad as Coming Soon."
                : "Save to create the sale. You'll then deploy the sale contract on-chain, complete the setup checklist, and submit for admin approval."}</p>
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
          <Button variant="primary" onClick={nextStep} disabled={!canProceed} rightIcon={<ArrowRight className="h-4 w-4" />}>Continue</Button>
        ) : (
          <div className="flex flex-col items-end gap-2">
            {success ? <Link href="/issuer/sales"><Button variant="primary">View Sales</Button></Link>
              : <Button variant="primary" onClick={handleSubmit} isLoading={isSubmitting}>
                  {isSubmitting ? "Saving..." : isComingSoon ? "Submit for Approval" : "Save & Continue"}
                </Button>}
          </div>
        )}
      </div>
    </IssuerDashboardLayout>
  );
}
