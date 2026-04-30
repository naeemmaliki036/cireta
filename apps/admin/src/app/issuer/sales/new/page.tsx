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
import { useRouter, useSearchParams } from "next/navigation";
import { isAddress } from "viem";
import { Button, Input, Select, FileUpload } from "@/components/atoms";
import { InfoTooltip } from "@/components/atoms/InfoTooltip";
import {
  MAX_SALE_DURATION_DAYS,
  maxAllowedSaleEnd,
  maxAllowedPhaseEnd,
  saleWindowTooLong,
  phaseOutsideSaleWindow,
} from "@/lib/sale/saleWindow";
import { ImageGallery, type GalleryItem } from "@/components/molecules/ImageGallery";
import { OTCTokenSelect } from "@/components/molecules/OTCTokenSelect";
import { SaleSlugField } from "@/components/molecules/SaleSlugField";
import { DEFAULT_OTC_TEMPLATE } from "@/lib/templates/otc";
import { IssuerDashboardLayout } from "@/components/templates";

import { getTokens, type Token } from "@/lib/api/repositories/tokens";
import { getPaymentTokens, type PaymentToken } from "@/lib/api/repositories/payment-tokens";
import {
  createSale, updateSale, getSale, addSaleTeamMember, addSaleFAQ, addSaleDocument, addSaleImage,
  removeSaleTeamMember, removeSaleFAQ, removeSaleDocument, removeSaleImage,
  listSaleTeamMembers, listSaleFAQs, listSaleDocuments, listSaleImages,
  createPhase, deletePhase, submitSaleForApproval,
  type TeamMemberData, type FAQData, type DocumentData,
} from "@/lib/api/repositories/sales";
import { getAccessToken, apiFetch } from "@/lib/api/client";

interface PhaseData { name: string; pricePerToken: string; allocation: string; startDate: string; endDate: string }
const emptyPhase = (): PhaseData => ({ name: "", pricePerToken: "", allocation: "", startDate: "", endDate: "" });

/** Convert a UTC ISO timestamp into the local 'YYYY-MM-DDTHH:mm' form
 *  expected by <input type="datetime-local">. Naively slicing the ISO
 *  string drops the timezone offset and shifts the displayed value. */
function toDatetimeLocal(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
const emptyTeam = (): TeamMemberData => ({ name: "", title: "", bio: "", photo_url: "" });
const emptyFAQ = (): FAQData => ({ question: "", answer: "" });
const emptyDoc = (): DocumentData => ({ name: "", type: "legal", url: "" });
const DOC_TYPES = [{ value: "legal", label: "Legal" }, { value: "audit", label: "Audit" }, { value: "whitepaper", label: "Whitepaper" }, { value: "other", label: "Other" }];
const TA = "w-full rounded-lg border border-black/10 p-3 text-sm focus:outline-none focus:ring-2 focus:ring-darkAqua resize-y";

export default function CreateSalePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const editingSaleId = searchParams.get("id");
  const isEditMode = !!editingSaleId;
  const [step, setStep] = useState(1);
  // Track which steps the user has actually visited. Without this, default
  // form values (e.g. cliffDays='0', vestingDays='365') would mark Vesting
  // as complete on step 1 — confusing because the user hasn't been there yet.
  const [visitedSteps, setVisitedSteps] = useState<Set<number>>(new Set([1]));
  const visitStep = (id: number) => {
    setStep(id);
    setVisitedSteps((prev) => prev.has(id) ? prev : new Set(prev).add(id));
  };

  // Unit per custom-duration input. Internal storage stays in days (decimal)
  // so the contract conversion (days * 86400) doesn't change.
  type DurationUnit = "min" | "hr" | "day" | "mo" | "yr";
  const [cliffUnit, setCliffUnit] = useState<DurationUnit>("day");
  const [vestingUnit, setVestingUnit] = useState<DurationUnit>("day");
  const [lockupUnit, setLockupUnit] = useState<DurationUnit>("day");
  const [prefilling, setPrefilling] = useState(isEditMode);
  const [tokens, setTokens] = useState<Token[]>([]);
  const [paymentTokens, setPaymentTokens] = useState<PaymentToken[]>([]);
  const [paymentTokenMode, setPaymentTokenMode] = useState<"preset" | "custom">("preset");
  const [customPaymentToken, setCustomPaymentToken] = useState("");
  // Step 1: Sale Info
  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
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
  // Initial state is fully empty — no hardcoded "Seed Round" name. The previous
  // hardcode meant every untouched draft had an unsaveable partial phase row
  // (name set, other fields empty), which got silently filtered out at save
  // time and surfaced later as "0 phases configured" in the checklist.
  const [phases, setPhases] = useState<PhaseData[]>([emptyPhase()]);
  // Step 6: Vesting (skip if direct or coming soon)
  const [vestingPreset, setVestingPreset] = useState<"cliff_linear" | "lockup">("cliff_linear");
  const [cliffDays, setCliffDays] = useState("0");
  const [vestingDays, setVestingDays] = useState("365");
  const [lockupDays, setLockupDays] = useState("365");
  // Step 7: Token & Caps (skip if coming soon)
  const [selectedTokenId, setSelectedTokenId] = useState("");
  const [paymentToken, setPaymentToken] = useState("");
  const [softCap, setSoftCap] = useState("");
  const [hardCap, setHardCap] = useState("");
  // Round-5: explicit total token supply + optional sale end time (none = open-ended)
  const [totalTokenSupply, setTotalTokenSupply] = useState("");
  const [saleStartDate, setSaleStartDate] = useState("");
  const [saleEndDate, setSaleEndDate] = useState("");
  const [isOpenEnded, setIsOpenEnded] = useState(false);
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
    (async () => {
      try {
        const chainId = Number(process.env.NEXT_PUBLIC_CHAIN_ID);
        setPaymentTokens(await getPaymentTokens(Number.isFinite(chainId) ? chainId : undefined));
      } catch { /* ignore */ }
    })();
  }, []);

  // Prefill from existing draft when ?id= is set.
  // Wait for paymentTokens to load before running so the preset/custom
  // detection finds the cUSDC / USDC entries instead of falling through
  // to "custom" mode for a token that's actually in the dropdown.
  useEffect(() => {
    if (!editingSaleId) return;
    if (paymentTokens.length === 0) return;
    (async () => {
      try {
        const tk = getAccessToken() ?? "";
        const sale = await getSale(editingSaleId, tk);
        if (sale.status !== "draft") {
          setError("This sale is no longer in draft status and cannot be edited via the wizard.");
          return;
        }
        setSavedSaleId(sale.id);
        setTitle(sale.title ?? "");
        setSlug(sale.slug ?? "");
        setDescription(sale.description_text ?? "");
        setIsComingSoon(sale.is_coming_soon);
        setSaleMode(sale.sale_mode || "");
        setSaleStructure(sale.sale_structure || "");
        setOtcEnabled(sale.otc_enabled);
        setOtcContent(sale.otc_content ?? "");
        setOtcTokenAddress(sale.otc_token_address ?? "");
        setFullDescription(sale.full_description ?? "");
        // Backend now stores seconds (Integer). Convert to days for the form,
        // which keeps "days" as its working unit for human-friendly presets.
        // Lock-up convention: cliff == vesting > 0 means a single unlock at
        // the end of the lock-up period. Use a small tolerance so floating
        // point conversion drift (sub-day testing values like 5 min) doesn't
        // misclassify lock-up as cliff_linear.
        const savedCliff = (sale.cliff_duration_seconds ?? 0) / 86400;
        const savedVesting = (sale.vesting_duration_seconds ?? 365 * 86400) / 86400;
        const isLockup = savedVesting > 0 && Math.abs(savedCliff - savedVesting) < 1e-6;
        if (isLockup) {
          setVestingPreset("lockup");
          setLockupDays(String(savedVesting));
          // Also seed cliff/vesting fields so toggling back to cliff_linear
          // shows reasonable defaults instead of empty.
          setCliffDays(String(savedCliff));
          setVestingDays(String(savedVesting));
        } else {
          setVestingPreset("cliff_linear");
          setCliffDays(String(savedCliff));
          setVestingDays(String(savedVesting));
          // Seed lockup field too so toggling shows the longer of the two.
          setLockupDays(String(Math.max(savedCliff, savedVesting) || 365));
        }
        setSelectedTokenId(sale.token_id ?? "");
        const presetMatch = paymentTokens.some(
          (pt) => pt.address.toLowerCase() === (sale.payment_token ?? "").toLowerCase(),
        );
        setPaymentToken(sale.payment_token ?? "");
        if (sale.payment_token && !presetMatch) {
          setPaymentTokenMode("custom");
          setCustomPaymentToken(sale.payment_token);
        }
        // Backend returns Decimals which serialize to "0E-18" / "0" — coerce to
        // a clean number string so the empty-state placeholder shows for unset values.
        const cleanCap = (v: string | null | undefined): string => {
          if (!v) return "";
          const n = Number(v);
          if (Number.isNaN(n) || n === 0) return "";
          return String(n);
        };
        setSoftCap(cleanCap(sale.soft_cap));
        setHardCap(cleanCap(sale.hard_cap));
        setTotalTokenSupply(cleanCap(sale.total_token_supply));
        setIsOpenEnded(sale.is_open_ended);
        // Parse the UTC ISO timestamp back into a local datetime-local string
        // ("YYYY-MM-DDTHH:mm") so the picker shows the same wall-clock time the
        // user originally entered. .slice(0,16) on the raw ISO would drop the
        // user's timezone offset and shift the value by tzOffset hours.
        setSaleStartDate(toDatetimeLocal(sale.sale_start_time));
        setSaleEndDate(toDatetimeLocal(sale.sale_end_time));
        if (sale.phases?.length) {
          // Backend serializes Decimal as "100.000000000000000000". Trim
          // trailing zeros (and the dot) so the form shows "100" not the
          // full 18-decimal string the user never typed.
          const trimNum = (s: string | null | undefined): string => {
            if (!s) return "";
            const n = Number(s);
            return Number.isFinite(n) ? String(n) : s;
          };
          setPhases(sale.phases.map((p) => ({
            name: p.name,
            pricePerToken: trimNum(p.price_per_token),
            allocation: trimNum(p.allocation),
            startDate: toDatetimeLocal(p.start_time),
            endDate: toDatetimeLocal(p.end_time),
          })));
        }
        // Sub-resources
        const [team, faqRows, docRows, imageRows] = await Promise.all([
          listSaleTeamMembers(sale.id, tk).catch(() => []),
          listSaleFAQs(sale.id, tk).catch(() => []),
          listSaleDocuments(sale.id, tk).catch(() => []),
          listSaleImages(sale.id, tk).catch(() => []),
        ]);
        if (team.length) setTeamMembers(team.map((m) => ({ name: m.name, title: m.title ?? "", bio: m.bio ?? "", photo_url: m.photo_url ?? "" })));
        if (faqRows.length) setFaqs(faqRows.map((f) => ({ question: f.question, answer: f.answer })));
        if (docRows.length) setDocuments(docRows.map((d) => ({ name: d.name, type: d.type, url: d.url })));
        if (imageRows.length) setGalleryItems(imageRows.map((g) => ({
          id: g.id,
          url: g.url,
          caption: g.caption ?? "",
          is_banner: g.is_banner ?? false,
          sort_order: g.sort_order ?? 0,
          media_type: (g.media_type === "video" ? "video" : "image") as "image" | "video",
          video_url: g.video_url,
        })));
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load sale for editing");
      } finally {
        setPrefilling(false);
      }
    })();
    // We add paymentTokens to deps so the effect retries once payment tokens
    // are loaded — the early return above ensures it fires only once
    // meaningfully (when both editingSaleId and paymentTokens are available).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editingSaleId, paymentTokens.length]);

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
  // Note: Token & Caps must come BEFORE Phases because phase windows are
  // bounded by the sale start/end dates set in Token & Caps.
  const allSteps = [
    { id: 1, title: "Sale Info", icon: Coins },
    { id: 2, title: "Content", icon: FileText },
    { id: 3, title: "Gallery", icon: ImageIcon },
    { id: 4, title: "Team", icon: Users },
    { id: 5, title: "FAQs", icon: HelpCircle },
    { id: 6, title: "Documents", icon: FolderOpen },
    ...(!isComingSoon ? [{ id: 7, title: "Raise Details", icon: Settings }] : []),
    ...(!isComingSoon ? [{ id: 8, title: "Sale Phases", icon: Calendar }] : []),
    ...(!isComingSoon && saleMode === "vested" ? [{ id: 9, title: "Vesting", icon: Clock }] : []),
    { id: 10, title: "Review", icon: Rocket },
  ];
  const visibleStepIds = allSteps.map((s) => s.id);
  const currentIdx = visibleStepIds.indexOf(step);
  const nextStep = () => { const ni = currentIdx + 1; if (ni < visibleStepIds.length) visitStep(visibleStepIds[ni]!); };
  const prevStep = () => { const pi = currentIdx - 1; if (pi >= 0) visitStep(visibleStepIds[pi]!); };
  const isLast = currentIdx === visibleStepIds.length - 1;
  const isFirst = currentIdx === 0;
  // Validate that phases don't overlap: each phase start must be >= previous phase end
  const phasesHaveOverlap = (() => {
    if (phases.length < 2) return false;
    for (let i = 1; i < phases.length; i++) {
      const prevEnd = phases[i - 1]!.endDate;
      const currStart = phases[i]!.startDate;
      if (!prevEnd || !currStart) continue;
      if (new Date(currStart).getTime() < new Date(prevEnd).getTime()) return true;
    }
    return false;
  })();

  // Per-phase window violations (relative to current Token & Caps state)
  const phaseWindowIssues = phases.map((p, i) => {
    const check = phaseOutsideSaleWindow({
      phaseStart: p.startDate,
      phaseEnd: p.endDate,
      saleStart: saleStartDate,
      saleEnd: saleEndDate,
      isOpenEnded,
    });
    return check.ok ? null : `Phase ${i + 1} (${p.name || "unnamed"}): ${check.reason}`;
  }).filter(Boolean) as string[];

  const phasesValid = phases.length > 0
    && phases.every((p) => p.name.trim() !== "" && p.pricePerToken !== "" && p.allocation !== "" && p.startDate !== "" && p.endDate !== ""
      && new Date(p.endDate).getTime() > new Date(p.startDate).getTime())
    && !phasesHaveOverlap
    && phaseWindowIssues.length === 0;

  const tokenCapsValid = selectedTokenId !== ""
    && softCap !== ""
    && hardCap !== ""
    && totalTokenSupply !== ""
    && saleStartDate !== ""
    && (isOpenEnded || saleEndDate !== "")
    && !saleWindowTooLong(saleStartDate, saleEndDate);

  // Returns a human-readable list of reasons the current step can't be advanced.
  // Used inline above the Continue button so users see *what* needs fixing.
  const proceedIssues = (): string[] => {
    switch (step) {
      case 1: {
        const issues: string[] = [];
        if (title.trim() === "") issues.push("Sale title is required.");
        if (description.trim() === "") issues.push("Short description is required.");
        if (saleMode === "") issues.push("Pick a sale mode (Direct or Vested).");
        if (saleStructure === "") issues.push("Pick a sale structure.");
        if (otcEnabled && (!otcTokenAddress || !isAddress(otcTokenAddress))) {
          issues.push("Pick an OTC token (or disable OTC). Required when OTC is enabled.");
        }
        return issues;
      }
      case 7: {
        const issues: string[] = [];
        if (selectedTokenId === "") issues.push("Select the token being sold.");
        if (softCap === "") issues.push("Soft cap (USDC) is required.");
        if (hardCap === "") issues.push("Hard cap (USDC) is required.");
        if (totalTokenSupply === "") issues.push("Total token supply is required.");
        if (saleStartDate === "") issues.push("Sale start date is required.");
        if (!isOpenEnded && saleEndDate === "") issues.push("Sale end date is required (or check Open-ended).");
        if (saleWindowTooLong(saleStartDate, saleEndDate)) {
          issues.push(`Sale duration exceeds ${MAX_SALE_DURATION_DAYS} days — reduce the end date.`);
        }
        return issues;
      }
      case 8: {
        const issues: string[] = [];
        if (phases.length === 0) issues.push("Add at least one phase.");
        phases.forEach((p, i) => {
          const tag = `Phase ${i + 1}${p.name ? ` (${p.name})` : ""}`;
          if (p.name.trim() === "") issues.push(`${tag}: name is required.`);
          if (p.pricePerToken === "") issues.push(`${tag}: price per token is required.`);
          if (p.allocation === "") issues.push(`${tag}: allocation is required.`);
          if (p.startDate === "") issues.push(`${tag}: start date is required.`);
          if (p.endDate === "") issues.push(`${tag}: end date is required.`);
          if (p.startDate && p.endDate && new Date(p.endDate).getTime() <= new Date(p.startDate).getTime()) {
            issues.push(`${tag}: end date must be after start date.`);
          }
        });
        if (phasesHaveOverlap) issues.push("Phases overlap — each must start after the previous one ends.");
        issues.push(...phaseWindowIssues);
        return issues;
      }
      case 9: {
        const issues: string[] = [];
        if (cliffDays === "") issues.push("Cliff duration is required.");
        if (vestingDays === "") issues.push("Vesting duration is required.");
        return issues;
      }
      default: return [];
    }
  };

  const canProceed = (() => {
    switch (step) {
      case 1: return title.trim() !== "" && description.trim() !== "" && saleMode !== "" && saleStructure !== "";
      case 2: return true; // Content — optional
      case 3: return true; // Gallery — optional
      case 4: return true; // Team — optional
      case 5: return true; // FAQs — optional
      case 6: return true; // Documents — optional
      case 7: return tokenCapsValid;
      case 8: return phasesValid;
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
      case 7: return tokenCapsValid;
      case 8: return phasesValid;
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
    // Detect partially-filled rows BEFORE filtering them out. Saving silently
    // dropped these previously, which made users think their data persisted
    // when it didn't. Now we block save and explain exactly what's missing.
    const phasePartialIssues: string[] = [];
    phases.forEach((p, i) => {
      const hasAny = p.name || p.pricePerToken || p.allocation || p.startDate || p.endDate;
      const hasAll = p.name && p.pricePerToken && p.allocation && p.startDate && p.endDate;
      if (hasAny && !hasAll) {
        const missing: string[] = [];
        if (!p.name) missing.push("name");
        if (!p.pricePerToken) missing.push("price");
        if (!p.allocation) missing.push("allocation");
        if (!p.startDate) missing.push("start date");
        if (!p.endDate) missing.push("end date");
        phasePartialIssues.push(`Phase ${i + 1}: missing ${missing.join(", ")}`);
      }
    });
    const teamPartialIssues = teamMembers
      .map((m, i) => {
        const hasAny = m.name || m.title || m.bio || m.photo_url;
        return hasAny && !m.name ? `Team member ${i + 1}: name is required to save (other fields filled).` : null;
      })
      .filter(Boolean) as string[];
    const faqPartialIssues = faqs
      .map((f, i) => {
        const hasAny = f.question || f.answer;
        return hasAny && !f.question ? `FAQ ${i + 1}: question is required to save (answer filled).` : null;
      })
      .filter(Boolean) as string[];
    const docPartialIssues = documents
      .map((d, i) => {
        const hasAny = d.name || d.url;
        return hasAny && !d.url ? `Document ${i + 1}: URL is required to save (name filled).` : null;
      })
      .filter(Boolean) as string[];
    const allPartialIssues = [
      ...phasePartialIssues,
      ...teamPartialIssues,
      ...faqPartialIssues,
      ...docPartialIssues,
    ];
    if (allPartialIssues.length > 0) {
      setError(
        "Some rows have incomplete data and would be dropped silently. Fill the missing fields or clear the row, then save again. " +
        allPartialIssues.join("; "),
      );
      setIsSaving(false);
      return null;
    }
    try {
      const tk = getAccessToken() ?? "";
      const validPhases = phases.filter((p) => p.name && p.pricePerToken && p.allocation && p.startDate && p.endDate);

      // Edit mode: PATCH the draft sale, then sync sub-resources
      if (savedSaleId) {
        await updateSale(savedSaleId, {
          title: title || undefined,
          slug: slug || undefined,
          description: description || undefined,
          full_description: fullDescription || undefined,
          banner_image_url: bannerImageUrl || undefined,
          is_coming_soon: isComingSoon,
          otc_enabled: otcEnabled,
          otc_content: otcEnabled ? otcContent : undefined,
          otc_token_address: otcEnabled && otcTokenAddress ? otcTokenAddress : undefined,
          sale_mode: saleMode || undefined,
          sale_structure: saleStructure || undefined,
          cliff_duration_seconds: Math.round((vestingPreset === "lockup" ? parseFloat(lockupDays) || 365 : parseFloat(cliffDays) || 0) * 86400),
          vesting_duration_seconds: Math.round((vestingPreset === "lockup" ? parseFloat(lockupDays) || 365 : parseFloat(vestingDays) || 365) * 86400),
          token_id: selectedTokenId || undefined,
          payment_token: paymentToken || undefined,
          soft_cap: softCap || undefined,
          hard_cap: hardCap || undefined,
          total_token_supply: totalTokenSupply || undefined,
          sale_start_time: saleStartDate ? new Date(saleStartDate).toISOString() : undefined,
          sale_end_time: isOpenEnded || !saleEndDate ? undefined : new Date(saleEndDate).toISOString(),
          is_open_ended: isOpenEnded,
        });
        // Phases: delete-all-then-create-all (only valid for draft sales — backend allows this only pre-deploy)
        const existing = await getSale(savedSaleId, tk);
        for (const p of existing.phases) {
          try { await deletePhase(savedSaleId, p.id, tk); } catch { /* ignore */ }
        }
        if (!isComingSoon) {
          for (const p of validPhases) {
            await createPhase(savedSaleId, {
              name: p.name, price_per_token: p.pricePerToken, allocation: p.allocation,
              start_time: new Date(p.startDate).toISOString(), end_time: new Date(p.endDate).toISOString(),
              min_contribution: "1", top_up_min: "1000", allocation_mode: "fixed",
            }, tk);
          }
        }
        // Team / FAQs / Docs / Images: same pattern — delete existing, recreate from current state
        const [exTeam, exFaqs, exDocs, exImages] = await Promise.all([
          listSaleTeamMembers(savedSaleId, tk).catch(() => []),
          listSaleFAQs(savedSaleId, tk).catch(() => []),
          listSaleDocuments(savedSaleId, tk).catch(() => []),
          listSaleImages(savedSaleId, tk).catch(() => []),
        ]);
        for (const m of exTeam) try { await removeSaleTeamMember(savedSaleId, m.id); } catch { /* ignore */ }
        for (const f of exFaqs) try { await removeSaleFAQ(savedSaleId, f.id); } catch { /* ignore */ }
        for (const d of exDocs) try { await removeSaleDocument(savedSaleId, d.id); } catch { /* ignore */ }
        for (const i of exImages) try { await removeSaleImage(savedSaleId, i.id, tk); } catch { /* ignore */ }
        for (const m of teamMembers.filter((m) => m.name)) await addSaleTeamMember(savedSaleId, m, tk);
        for (const f of faqs.filter((f) => f.question)) await addSaleFAQ(savedSaleId, f, tk);
        for (const d of documents.filter((d) => d.url)) await addSaleDocument(savedSaleId, d, tk);
        for (const g of galleryItems) await addSaleImage(savedSaleId, {
          url: g.url, caption: g.caption, is_banner: g.is_banner,
          sort_order: g.sort_order, media_type: g.media_type, video_url: g.video_url,
        }, tk);
        return savedSaleId;
      }

      // Create mode: brand new sale
      const sale = await createSale({
        title: title || undefined,
        slug: slug || undefined,
        description: description || undefined,
        full_description: fullDescription || undefined, banner_image_url: bannerImageUrl || undefined,
        is_coming_soon: isComingSoon, otc_enabled: otcEnabled, otc_content: otcEnabled ? otcContent : undefined, otc_token_address: otcEnabled && otcTokenAddress ? otcTokenAddress : undefined,
        sale_mode: saleMode, sale_structure: saleStructure,
        cliff_duration_seconds: Math.round((vestingPreset === "lockup" ? parseFloat(lockupDays) || 365 : parseFloat(cliffDays) || 0) * 86400),
        vesting_duration_seconds: Math.round((vestingPreset === "lockup" ? parseFloat(lockupDays) || 365 : parseFloat(vestingDays) || 365) * 86400),
        token_id: selectedTokenId || undefined, payment_token: paymentToken,
        soft_cap: softCap || undefined, hard_cap: hardCap || undefined,
        total_token_supply: totalTokenSupply || undefined,
        sale_start_time: saleStartDate ? new Date(saleStartDate).toISOString() : undefined,
        sale_end_time: isOpenEnded || !saleEndDate ? undefined : new Date(saleEndDate).toISOString(),
        is_open_ended: isOpenEnded,
        phases: isComingSoon ? [] : validPhases.map((p) => ({
          name: p.name, allocation: Number(p.allocation), price_per_token: p.pricePerToken,
          start_time: new Date(p.startDate).toISOString(), end_time: new Date(p.endDate).toISOString(),
          min_contribution: "1",
          top_up_min: "1000",
          allocation_mode: "fixed",
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
    } catch (err) {
      console.error("[handleSaveDraft] failed:", err);
      setError(err instanceof Error ? err.message : "Save failed");
      return null;
    }
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
        // ?from=wizard bypasses the [id] page's draft→wizard redirect so the
        // user can actually click "Deploy On-Chain" instead of bouncing back.
        router.push(`/issuer/sales/${saleId}?from=wizard`);
      }
    } catch (err) {
      console.error("[handleSubmit] failed:", err);
      setError(err instanceof Error ? err.message : "Submission failed");
    }
    finally { setIsSubmitting(false); }
  };

  if (prefilling) {
    return (
      <IssuerDashboardLayout title="Continue Sale Setup" description="Loading draft…">
        <div className="flex justify-center py-24 text-zinc-400 text-sm">Loading draft…</div>
      </IssuerDashboardLayout>
    );
  }

  return (
    <IssuerDashboardLayout title={isEditMode ? "Continue Sale Setup" : "Create New Sale"} description={isEditMode ? "Resume editing a draft sale — all wizard steps remain editable until you submit for approval." : "Set up a token sale with rich content"}>
      {/* Progress Steps */}
      <div className="mb-8 overflow-x-auto">
        <div className="flex items-center justify-between relative min-w-[600px]">
          {allSteps.map((s) => {
            // A step is "complete" only if the user has actually visited it
            // AND its required fields are filled. Default values would
            // otherwise mark steps the user has never seen as done.
            const complete = visitedSteps.has(s.id) && isStepComplete(s.id);
            const isCurrent = step === s.id;
            return (
            <div key={s.id} className="flex flex-col items-center z-10">
              <div className={`w-10 h-10 rounded-full flex items-center justify-center transition-colors cursor-pointer ${
                complete && !isCurrent ? "bg-green-500 text-white" : isCurrent ? "bg-darkAqua text-white" : "bg-gray-200 text-gray-500"
              }`} onClick={() => visitStep(s.id)}>
                {complete && !isCurrent ? <CheckCircle2 className="h-5 w-5" /> : <s.icon className="h-5 w-5" />}
              </div>
              <p className={`mt-2 text-xs font-semibold ${isCurrent || complete ? "text-text" : "text-gray-400"}`}>{s.title}</p>
            </div>
            );
          })}
          <div className="absolute top-5 left-0 right-0 h-0.5 bg-gray-200 -z-0">
            <div className="h-full bg-green-500 transition-all duration-500" style={{ width: `${(allSteps.filter((s) => visitedSteps.has(s.id) && isStepComplete(s.id)).length / Math.max(allSteps.length - 1, 1)) * 100}%` }} />
          </div>
        </div>
      </div>

      <div className="flex gap-5">
      <div className="flex-1 min-w-0">
      {/* Navigation — aligned with the main body width, not the page (so it sits to the
          left of the sidebar instead of stretching across it). */}
      {!isLast && (
        <div className="flex justify-between items-center mb-4">
          <div className="flex items-center gap-3">
            {isFirst ? <Link href="/issuer/sales"><Button variant="outline" size="sm">Cancel</Button></Link>
              : <Button variant="outline" size="sm" onClick={prevStep}>Back</Button>}
            {/* Always-available save: "Save Draft" before first save, "Save
                Changes" after. Previously the button was hidden once savedSaleId
                was set, which left users editing intermediate steps with no way
                to persist without walking to the Review tab. */}
            <Button variant="outline" size="sm" onClick={handleSaveDraft} isLoading={isSaving}>
              {isSaving ? "Saving..." : savedSaleId ? "Save Changes" : "Save Draft"}
            </Button>
            {savedSaleId && !error && !isSaving && <span className="text-xs text-green-600 font-medium">Draft saved</span>}
            {error && <span className="text-xs text-red-600">{error}</span>}
          </div>
          <Button variant="primary" size="sm" onClick={nextStep} disabled={!canProceed} rightIcon={<ArrowRight className="h-4 w-4" />}>Continue</Button>
        </div>
      )}
      {isLast && !isFirst && (
        <div className="mb-4">
          <div className="flex items-center justify-between">
            <Button variant="outline" size="sm" onClick={prevStep}>Back</Button>
            <div className="flex items-center gap-2">
              {savedSaleId && !error && <span className="text-xs text-green-600 font-medium">Draft saved</span>}
              <Button variant="outline" size="sm" onClick={handleSaveDraft} isLoading={isSaving}>
                {isSaving ? "Saving..." : savedSaleId ? "Save Changes" : "Save Draft"}
              </Button>
              {success ? (
                <Link href="/issuer/sales"><Button variant="primary" size="sm">View Sales</Button></Link>
              ) : (
                <Button variant="primary" size="sm" onClick={handleSubmit} isLoading={isSubmitting}>
                  {isSubmitting ? "Saving..." : isComingSoon ? "Submit for Approval" : "Save & Continue to Deployment →"}
                </Button>
              )}
            </div>
          </div>
          {error && (
            <p className="mt-2 text-xs text-red-600 text-right">{error}</p>
          )}
        </div>
      )}
      <motion.div key={step} initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="bg-white rounded-lg p-8 border border-black/10">
        {/* Step 1: Sale Info */}
        {step === 1 && (
          <div className="max-w-2xl mx-auto space-y-6">
            <h2 className="text-xl font-semibold text-text">Sale Info</h2>
            <Input label="Sale Title" placeholder="e.g., Gold Reserve Token Sale" value={title} onChange={(e) => setTitle(e.target.value)} />
            <SaleSlugField
              value={slug}
              onChange={setSlug}
              title={title}
              excludeId={savedSaleId ?? undefined}
            />
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
                <label htmlFor="otcEnabled" className="text-sm"><span className="font-semibold">Enable OTC & Bank Transfer</span> — Allow buyers to pay via wire transfer or OTC. An &quot;OTC &amp; Bank&quot; tab will be shown on the sale page.</label>
              </div>
              {otcEnabled && (
                <div className="mt-4 space-y-4">
                  <div className="space-y-1">
                    <p className="text-xs text-zinc-400">
                      Pick an OTC token you&apos;ve deployed, or paste a custom address. Buyers holding OTC tokens can use them to purchase at the sale price. Required when OTC is enabled.
                    </p>
                    <OTCTokenSelect
                      value={otcTokenAddress}
                      onChange={setOtcTokenAddress}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <label className="block text-sm font-medium text-zinc-600">OTC Instructions (shown to buyers)</label>
                      <button
                        type="button"
                        onClick={async () => {
                          if (
                            otcContent.trim() &&
                            !window.confirm("Replace the current OTC instructions with the default template?")
                          ) {
                            return;
                          }
                          // Try the platform-configured template first; fall back to the
                          // bundled default if the API is unreachable or unauthorized.
                          // The template is just a starter — issuers can edit anything.
                          try {
                            const data = await apiFetch<Record<string, string>>("/api/v1/admin/platform/settings");
                            setOtcContent(data.otc_default_content || DEFAULT_OTC_TEMPLATE);
                          } catch (e) {
                            console.warn("[OTC default template] platform settings unreachable, using bundled template:", e);
                            setOtcContent(DEFAULT_OTC_TEMPLATE);
                          }
                        }}
                        className="text-xs font-medium text-darkAqua hover:underline"
                      >
                        Use default template
                      </button>
                    </div>
                    <p className="text-xs text-zinc-400">Include wire details, process steps, minimum amounts, and contact info.</p>
                    <RichTextEditor content={otcContent} onChange={setOtcContent} placeholder="Enter OTC & bank transfer instructions..." />
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
              <p className="text-xs text-zinc-400 mb-2">Detailed project description, purchase thesis, background. Supports rich formatting.</p>
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
                      /* eslint-disable-next-line @next/next/no-img-element */
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
            <p className="text-sm text-gray-500 mb-4">Add frequently asked questions for buyers. These appear on the sale page.</p>
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
        {/* Step 8: Phases (skip if coming soon) */}
        {step === 8 && (
          <div className="max-w-2xl mx-auto">
            <h2 className="text-xl font-semibold text-text mb-1 flex items-center gap-1.5">
              Sale Phases
              <InfoTooltip text="Each phase has its own price, allocation, and time window. Phases must not overlap, must start at or after the Sale Start, and must end at or before the Sale End (or 730 days from start for open-ended sales). The smart contract enforces all of these — invalid phases will not deploy on-chain." />
            </h2>
            <p className="text-sm text-gray-500 mb-3">
              Define one or more sale phases. Each phase has its own price, allocation, and time window. Phases run sequentially &mdash; they must not overlap.
            </p>
            {/* Sale window context — derived from Token & Caps step */}
            {saleStartDate ? (
              <div className="mb-4 px-3 py-2 rounded-md bg-darkAqua/5 border border-darkAqua/20 text-xs text-zinc-700">
                <span className="font-semibold text-darkAqua">Sale window:</span>{" "}
                {new Date(saleStartDate).toLocaleString()} →{" "}
                {isOpenEnded
                  ? `open-ended (auto-cap ${new Date(maxAllowedSaleEnd(saleStartDate)).toLocaleString()})`
                  : saleEndDate
                  ? new Date(saleEndDate).toLocaleString()
                  : "(set Sale End in step 7)"}
                . All phases must fit inside this window.
              </div>
            ) : (
              <div className="mb-4 px-3 py-2 rounded-md bg-amber-50 border border-amber-200 text-xs text-amber-800">
                Set <strong>Sale Start</strong> in the previous step (Raise Details) before defining phases.
              </div>
            )}
            {phasesHaveOverlap && (
              <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-600 mb-2">
                Phases overlap: each phase&apos;s start date must be after the previous phase&apos;s end date.
              </div>
            )}
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
                      {(() => {
                        const endBeforeStart = ph.startDate && ph.endDate
                          && new Date(ph.endDate).getTime() <= new Date(ph.startDate).getTime();
                        const windowCheck = phaseOutsideSaleWindow({
                          phaseStart: ph.startDate,
                          phaseEnd: ph.endDate,
                          saleStart: saleStartDate,
                          saleEnd: saleEndDate,
                          isOpenEnded,
                        });
                        return (
                          <>
                            <div className="grid grid-cols-2 gap-3">
                              <Input
                                label="Start Date"
                                type="datetime-local"
                                value={ph.startDate}
                                onChange={(e) => updPhase(i, "startDate", e.target.value)}
                                min={saleStartDate || undefined}
                                max={maxAllowedPhaseEnd({ saleStart: saleStartDate, saleEnd: saleEndDate, isOpenEnded }) || undefined}
                                disabled={!saleStartDate}
                                helperText={!saleStartDate ? "Set Sale Start (step 7) first." : undefined}
                              />
                              <Input
                                label="End Date"
                                type="datetime-local"
                                value={ph.endDate}
                                onChange={(e) => updPhase(i, "endDate", e.target.value)}
                                min={ph.startDate || saleStartDate || undefined}
                                max={maxAllowedPhaseEnd({ saleStart: saleStartDate, saleEnd: saleEndDate, isOpenEnded }) || undefined}
                                disabled={!saleStartDate}
                                helperText={!saleStartDate ? "Set Sale Start (step 7) first." : undefined}
                                error={endBeforeStart ? "End date must be after start date." : undefined}
                              />
                            </div>
                            {!windowCheck.ok && (
                              <div className="px-3 py-2 rounded-md bg-red-50 border border-red-200 text-xs text-red-700">
                                {windowCheck.reason}
                              </div>
                            )}
                          </>
                        );
                      })()}
                    </div>
                  )}
                </div>);
              })}
              <Button
                variant="outline"
                size="sm"
                onClick={() => { setPhases((p) => [...p, emptyPhase()]); setExpandedPhase(phases.length); }}
                className="w-full"
                disabled={!saleStartDate}
                title={!saleStartDate ? "Set Sale Start in step 7 first" : undefined}
              >
                + Add Phase
              </Button>
            </div>
          </div>
        )}
        {/* Step 7: Token & Caps (skip if coming soon) */}
        {step === 7 && (
          <div className="max-w-2xl mx-auto space-y-6">
            <h2 className="text-xl font-semibold text-text">Raise Details</h2>
            <Select label="Token being sold (optional)" options={[{ value: "", label: "Select a token..." }, ...tokens.filter((t) => t.contract_address && t.contract_address !== "0x0000000000000000000000000000000000000000").map((t) => {
              const addr = t.contract_address!;
              return { value: t.id, label: `${t.name} (${t.symbol}) — ${addr.slice(0, 6)}...${addr.slice(-4)}` };
            })]}
              value={selectedTokenId} onChange={(e) => setSelectedTokenId(e.target.value)} />
            <Select label="Payment Token (Stablecoin)" options={[
              { value: "", label: "Select payment token..." },
              ...paymentTokens.map((pt) => ({
                value: pt.address,
                label: `${pt.symbol} — ${pt.address.slice(0, 6)}...${pt.address.slice(-4)}`,
              })),
              { value: "__custom__", label: "Custom address…" },
            ]} value={paymentTokenMode === "custom" ? "__custom__" : paymentToken}
              onChange={(e) => {
                const v = e.target.value;
                if (v === "__custom__") {
                  setPaymentTokenMode("custom");
                  setPaymentToken(customPaymentToken);
                } else {
                  setPaymentTokenMode("preset");
                  setPaymentToken(v);
                }
              }} />
            {paymentTokenMode === "custom" && (
              <Input
                label="Custom Payment Token Address"
                placeholder="0x..."
                value={customPaymentToken}
                maxLength={42}
                onChange={(e) => {
                  const v = e.target.value.trim();
                  setCustomPaymentToken(v);
                  setPaymentToken(isAddress(v) ? v : "");
                }}
                error={customPaymentToken && !isAddress(customPaymentToken) ? "Invalid EVM address" : undefined}
                helperText="Paste any ERC-20 stablecoin address. Must be a valid checksummed address."
              />
            )}
            <div className="grid grid-cols-2 gap-4">
              <Input label="Soft Cap (USDC)" type="number" placeholder="e.g., 50000" value={softCap} onChange={(e) => setSoftCap(e.target.value)} />
              <Input label="Hard Cap (USDC)" type="number" placeholder="e.g., 500000" value={hardCap} onChange={(e) => setHardCap(e.target.value)} />
            </div>
            {/* Round-5: total token supply */}
            <Input
              label="Total Token Supply (tokens)"
              type="number"
              placeholder="e.g., 1000000"
              value={totalTokenSupply}
              onChange={(e) => setTotalTokenSupply(e.target.value)}
            />
            <p className="text-xs text-gray-500">
              Maximum tokens this sale will ever sell across all phases. Required.
            </p>
            {/* Round-5: sale window */}
            <div className="space-y-2">
              <div className="flex items-center gap-1.5 text-sm font-medium text-zinc-700">
                Sale Window
                <InfoTooltip text={`Sets the outer window in which all phases must run. Maximum total duration is ${MAX_SALE_DURATION_DAYS} days (2 years), enforced at the smart-contract level. Set Sale End to leave the sale fixed-window, or check Open-ended to keep adding phases until you decide to close.`} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <Input
                  label="Sale Start"
                  type="datetime-local"
                  value={saleStartDate}
                  onChange={(e) => setSaleStartDate(e.target.value)}
                  helperText="When investors can first contribute. Must be in the future."
                />
                <Input
                  label={isOpenEnded ? "Sale End (open-ended)" : "Sale End"}
                  type="datetime-local"
                  value={saleEndDate}
                  onChange={(e) => setSaleEndDate(e.target.value)}
                  disabled={isOpenEnded}
                  max={saleStartDate ? maxAllowedSaleEnd(saleStartDate) : undefined}
                  helperText={
                    isOpenEnded
                      ? `No fixed end. Sale auto-caps at ${MAX_SALE_DURATION_DAYS} days from start.`
                      : saleStartDate
                      ? `Latest allowed: ${new Date(maxAllowedSaleEnd(saleStartDate)).toLocaleString()}`
                      : `Maximum ${MAX_SALE_DURATION_DAYS} days from Sale Start.`
                  }
                  error={
                    !isOpenEnded && saleWindowTooLong(saleStartDate, saleEndDate)
                      ? `Sale duration exceeds ${MAX_SALE_DURATION_DAYS} days.`
                      : undefined
                  }
                />
              </div>
            </div>
            <label className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                checked={isOpenEnded}
                onChange={(e) => {
                  setIsOpenEnded(e.target.checked);
                  if (e.target.checked) setSaleEndDate("");
                }}
                className="mt-0.5 rounded border-zinc-300 text-darkAqua focus:ring-darkAqua/30"
              />
              <span>
                <strong>Open-ended sale</strong>
                <span className="text-gray-500">
                  {" "}— issuer keeps adding phases until target reached. Hard-capped at {MAX_SALE_DURATION_DAYS} days from start; if no new phase is added for 180 days, anyone can close the sale.
                </span>
              </span>
            </label>
            {/* Cross-step warning: changing the sale window may invalidate already-defined phases. */}
            {phaseWindowIssues.length > 0 && (
              <div className="px-3 py-2 rounded-md bg-amber-50 border border-amber-200 text-xs text-amber-800">
                <p className="font-semibold mb-1">
                  Heads up — {phaseWindowIssues.length} existing phase
                  {phaseWindowIssues.length === 1 ? "" : "s"} now fall outside this sale window:
                </p>
                <ul className="list-disc list-inside space-y-0.5">
                  {phaseWindowIssues.map((msg, i) => <li key={i}>{msg}</li>)}
                </ul>
                <p className="mt-1">Adjust them in the Phases step before submitting.</p>
              </div>
            )}
          </div>
        )}
        {/* Step 9: Vesting (skip if direct or coming soon) */}
        {step === 9 && (() => {
          const TESTING_PRESETS = [
            { label: "5 min", days: 5 / 1440 },
            { label: "30 min", days: 30 / 1440 },
            { label: "1 hour", days: 1 / 24 },
            { label: "1 day", days: 1 },
          ];
          const DURATION_PRESETS = [
            ...TESTING_PRESETS,
            { label: "1 month", days: 30 },
            { label: "3 months", days: 90 },
            { label: "6 months", days: 180 },
            { label: "9 months", days: 270 },
            { label: "1 year", days: 365 },
            { label: "1.5 years", days: 548 },
            { label: "2 years", days: 730 },
            { label: "3 years", days: 1095 },
          ];
          const CLIFF_PRESETS = [
            { label: "No cliff", days: 0 },
            ...TESTING_PRESETS,
            { label: "1 week", days: 7 },
            { label: "1 month", days: 30 },
            { label: "3 months", days: 90 },
            { label: "6 months", days: 180 },
            { label: "9 months", days: 270 },
            { label: "1 year", days: 365 },
          ];
          // Unit conversions — internal state always days (decimal).
          const UNIT_DAYS: Record<DurationUnit, number> = {
            min: 1 / 1440,
            hr: 1 / 24,
            day: 1,
            mo: 30,
            yr: 365,
          };
          const UNIT_LABEL: Record<DurationUnit, string> = {
            min: "minutes", hr: "hours", day: "days", mo: "months", yr: "years",
          };
          const daysToUnit = (days: number, unit: DurationUnit): string => {
            if (!days || days <= 0) return "";
            const v = days / UNIT_DAYS[unit];
            // Round to 4 decimals max, drop trailing zeros
            return v.toFixed(4).replace(/\.?0+$/, "");
          };
          const unitToDaysStr = (value: string, unit: DurationUnit): string => {
            const n = parseFloat(value);
            if (!n || isNaN(n) || n <= 0) return "";
            return String(n * UNIT_DAYS[unit]);
          };

          interface CustomDurationInputProps {
            valueDays: string;
            onChangeDays: (s: string) => void;
            unit: DurationUnit;
            onChangeUnit: (u: DurationUnit) => void;
            allowZero?: boolean;
          }
          const CustomDurationInput = ({ valueDays, onChangeDays, unit, onChangeUnit, allowZero }: CustomDurationInputProps) => {
            const days = parseFloat(valueDays) || 0;
            return (
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  min={allowZero ? 0 : 0.001}
                  step="any"
                  placeholder={`Custom ${UNIT_LABEL[unit]}`}
                  value={daysToUnit(days, unit)}
                  onChange={(e) => onChangeDays(unitToDaysStr(e.target.value, unit))}
                />
                <select
                  value={unit}
                  onChange={(e) => onChangeUnit(e.target.value as DurationUnit)}
                  className="px-2 py-1.5 text-xs border border-zinc-200 rounded-md bg-white focus:outline-none focus:border-darkAqua"
                >
                  <option value="min">min</option>
                  <option value="hr">hr</option>
                  <option value="day">days</option>
                  <option value="mo">months</option>
                  <option value="yr">years</option>
                </select>
                {days > 0 && days < 1 && (
                  <span className="text-xs text-darkAqua whitespace-nowrap">= {fmtDuration(days)}</span>
                )}
              </div>
            );
          };
          const cliffNum = parseFloat(cliffDays) || 0;
          const vestingNum = parseFloat(vestingDays) || 0;
          const lockupNum = parseFloat(lockupDays) || 0;
          const cliffError = vestingPreset === "cliff_linear" && cliffNum > 0 && vestingNum > 0 && cliffNum >= vestingNum;
          const totalDays = vestingPreset === "lockup" ? lockupNum : cliffNum + vestingNum;

          // Strip trailing zeros after the decimal so round numbers show as
          // "9 months" instead of "9.0 months".
          const trim = (n: number, places: number) =>
            n.toFixed(places).replace(/\.?0+$/, "");
          const fmtDuration = (d: number): string => {
            if (d === 0) return "None";
            if (d < 1 / 24) return `${Math.round(d * 1440)} min`;
            if (d < 1) return `${trim(d * 24, 1)} hr`;
            if (d < 30) return `${trim(d, 1)} day${d > 1 ? "s" : ""}`;
            if (d < 365) return `${trim(d / 30, 1)} months`;
            return `${trim(d / 365, 1)} years`;
          };

          return (
          <div className="max-w-2xl mx-auto space-y-6">
            <h2 className="text-xl font-semibold text-text mb-1">Vesting Configuration</h2>
            <p className="text-sm text-gray-500">Configure how tokens are released to buyers after the sale finalizes.</p>

            {/* Vesting type toggle */}
            <div>
              <p className="text-sm font-medium text-zinc-700 mb-2">Vesting Type</p>
              <div className="grid grid-cols-2 gap-3">
                {(["cliff_linear", "lockup"] as const).map((t) => (
                  <button key={t} type="button" onClick={() => setVestingPreset(t)}
                    className={`flex items-start gap-3 p-4 rounded-lg border-2 text-left transition-all ${
                      vestingPreset === t ? "border-darkAqua bg-darkAqua/5" : "border-zinc-200 hover:border-zinc-300"
                    }`}>
                    <div className={`w-4 h-4 rounded-full border-2 mt-0.5 flex-shrink-0 ${
                      vestingPreset === t ? "border-darkAqua bg-darkAqua" : "border-zinc-300"
                    }`} />
                    <div>
                      <p className="font-semibold text-sm text-text">
                        {t === "cliff_linear" ? "Cliff + Linear Vesting" : "Lock-up Only"}
                      </p>
                      <p className="text-xs text-zinc-500 mt-0.5">
                        {t === "cliff_linear"
                          ? "Tokens release linearly after a cliff period."
                          : "All tokens unlock at once after the lock-up ends."}
                      </p>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {vestingPreset === "lockup" ? (
              /* Lock-up only: single duration field */
              <div>
                <label className="block text-sm font-medium text-zinc-700 mb-2">Lock-up Duration</label>
                <p className="text-xs text-zinc-400 mb-3">Buyers cannot claim any tokens until this period ends. Then 100% unlocks at once.</p>
                <div className="flex flex-wrap gap-2 mb-2">
                  {DURATION_PRESETS.map((p) => (
                    <button key={`lockup-${p.days}`} type="button" onClick={() => setLockupDays(String(p.days))}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                        lockupNum === p.days ? "bg-darkAqua text-white" : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200"
                      }`}>
                      {p.label}
                    </button>
                  ))}
                </div>
                <CustomDurationInput
                  valueDays={lockupDays}
                  onChangeDays={setLockupDays}
                  unit={lockupUnit}
                  onChangeUnit={setLockupUnit}
                />
              </div>
            ) : (
              /* Cliff + linear vesting */
              <>
                {/* Cliff */}
                <div>
                  <label className="block text-sm font-medium text-zinc-700 mb-2">Cliff Period</label>
                  <p className="text-xs text-zinc-400 mb-3">No tokens can be claimed during the cliff. After the cliff ends, vesting begins.</p>
                  <div className="flex flex-wrap gap-2 mb-2">
                    {CLIFF_PRESETS.filter(p => p.days < vestingNum || vestingNum === 0).map((p) => (
                      <button key={`cliff-${p.days}`} type="button" onClick={() => setCliffDays(String(p.days))}
                        className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                          cliffNum === p.days ? "bg-darkAqua text-white" : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200"
                        }`}>
                        {p.label}
                      </button>
                    ))}
                  </div>
                  <CustomDurationInput
                    valueDays={cliffDays}
                    onChangeDays={setCliffDays}
                    unit={cliffUnit}
                    onChangeUnit={setCliffUnit}
                    allowZero
                  />
                </div>

                {/* Vesting */}
                <div>
                  <label className="block text-sm font-medium text-zinc-700 mb-2">Vesting Duration</label>
                  <p className="text-xs text-zinc-400 mb-3">After the cliff, tokens unlock linearly over this period. At the end, 100% is claimable.</p>
                  <div className="flex flex-wrap gap-2 mb-2">
                    {DURATION_PRESETS.filter(p => p.days > cliffNum).map((p) => (
                      <button key={`vest-${p.days}`} type="button" onClick={() => setVestingDays(String(p.days))}
                        className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                          vestingNum === p.days ? "bg-darkAqua text-white" : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200"
                        }`}>
                        {p.label}
                      </button>
                    ))}
                  </div>
                  <CustomDurationInput
                    valueDays={vestingDays}
                    onChangeDays={setVestingDays}
                    unit={vestingUnit}
                    onChangeUnit={setVestingUnit}
                  />
                </div>

                {cliffError && (
                  <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-600">
                    Cliff must be shorter than the vesting duration.
                  </div>
                )}
              </>
            )}

            {/* Preview */}
            <div className="p-4 rounded-lg bg-darkAqua/5 border border-darkAqua/20 text-sm space-y-2">
              <p className="font-semibold text-zinc-900">Schedule Preview</p>
              {vestingPreset === "lockup" ? (
                <div className="grid grid-cols-2 gap-3 text-center">
                  <div className="bg-white rounded-lg p-3">
                    <p className="text-xs text-zinc-400">Lock-up</p>
                    <p className="font-bold text-zinc-900">{fmtDuration(lockupNum)}</p>
                  </div>
                  <div className="bg-white rounded-lg p-3">
                    <p className="text-xs text-zinc-400">Full Unlock</p>
                    <p className="font-bold text-darkAqua">{fmtDuration(lockupNum)}</p>
                  </div>
                </div>
              ) : (
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
              )}
              {totalDays > 0 && vestingPreset === "cliff_linear" && (
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
                  <SectionRow label="Payment" value={paymentToken ? (paymentTokens.find(t => t.address.toLowerCase() === paymentToken.toLowerCase())?.symbol || `Custom (${paymentToken.slice(0, 6)}...${paymentToken.slice(-4)})`) : "Not set"} muted={!paymentToken} />
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
      </div>

      {/* Right sidebar — contextual tips. The pt offset matches the height of
          the navigation row (Back/Save/Continue + mb-4) in the form column,
          so tips visually align with the top of the white form card. */}
      <aside className="hidden lg:block w-72 shrink-0 pt-[52px]">
        <div className="sticky top-20 space-y-4">
          {step === 1 && (
            <div className="bg-zinc-50 border border-zinc-100 rounded-lg p-4">
              <h4 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2">Tips</h4>
              <ul className="text-xs text-zinc-500 space-y-2">
                <li>Choose a clear, descriptive title that buyers will recognize.</li>
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
                <li>Showing your team builds trust with buyers.</li>
                <li>Include key roles: CEO, CTO, legal, operations.</li>
                <li>Photos are optional but strongly recommended.</li>
              </ul>
            </div>
          )}
          {step === 5 && (
            <div className="bg-zinc-50 border border-zinc-100 rounded-lg p-4">
              <h4 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2">FAQ Tips</h4>
              <ul className="text-xs text-zinc-500 space-y-2">
                <li>Answer common buyer questions: &ldquo;What is this token backed by?&rdquo;, &ldquo;When can I trade?&rdquo;</li>
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
                <li>Legal and whitepaper docs are publicly visible to buyers.</li>
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
                <li><strong>Soft cap</strong> — minimum raise needed. Below this, buyers can claim refunds.</li>
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
                <li>Common: 6-month cliff + 12-month vesting for early buyers.</li>
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
                    <li>Once approved, buyers can start buying.</li>
                  </>
                )}
              </ul>
            </div>
          )}
          {/* Pending issues — only when Continue is blocked. Sits below tips. */}
          {!isLast && !canProceed && (() => {
            const issues = proceedIssues();
            if (issues.length === 0) return null;
            return (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                <h4 className="text-xs font-semibold text-amber-800 uppercase tracking-wider mb-2">
                  Complete the following to continue
                </h4>
                <ul className="list-disc list-inside text-xs text-amber-800 space-y-1">
                  {issues.map((msg, i) => <li key={i}>{msg}</li>)}
                </ul>
              </div>
            );
          })()}
        </div>
      </aside>
      </div>

    </IssuerDashboardLayout>
  );
}
