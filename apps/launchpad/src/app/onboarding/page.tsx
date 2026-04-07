"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { User, Building2, Wallet, ShieldCheck, CheckCircle2, ArrowRight, ArrowLeft, AlertTriangle, Loader2, X, Home, Scale, Lock, Clock, Search, Copy } from "lucide-react";
import { Button } from "@/components/atoms";
import { useAuth } from "@/contexts/AuthContext";
import { useKYC } from "@/contexts/KYCContext";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useAccount } from "wagmi";
import { apiFetch } from "@/lib/api/client";
import {
  getOnboardingStatus,
  setOnboardingType,
  saveOnboardingDetails,
  completeOnboarding,
  type OnboardingStatus,
} from "@/lib/api/repositories/auth.repository";

type Step = "type" | "details" | "wallet" | "kyc" | "complete";

const COUNTRIES = [
  "Afghanistan","Albania","Algeria","Andorra","Angola","Antigua and Barbuda","Argentina","Armenia","Australia","Austria",
  "Azerbaijan","Bahamas","Bahrain","Bangladesh","Barbados","Belarus","Belgium","Belize","Benin","Bhutan","Bolivia",
  "Bosnia and Herzegovina","Botswana","Brazil","Brunei","Bulgaria","Burkina Faso","Burundi","Cambodia","Cameroon","Canada",
  "Cape Verde","Central African Republic","Chad","Chile","China","Colombia","Comoros","Congo","Costa Rica","Croatia","Cuba",
  "Cyprus","Czech Republic","Denmark","Djibouti","Dominica","Dominican Republic","East Timor","Ecuador","Egypt","El Salvador",
  "Equatorial Guinea","Eritrea","Estonia","Eswatini","Ethiopia","Fiji","Finland","France","Gabon","Gambia","Georgia","Germany",
  "Ghana","Greece","Grenada","Guatemala","Guinea","Guinea-Bissau","Guyana","Haiti","Honduras","Hungary","Iceland","India",
  "Indonesia","Iran","Iraq","Ireland","Israel","Italy","Ivory Coast","Jamaica","Japan","Jordan","Kazakhstan","Kenya",
  "Kiribati","Kosovo","Kuwait","Kyrgyzstan","Laos","Latvia","Lebanon","Lesotho","Liberia","Libya","Liechtenstein","Lithuania",
  "Luxembourg","Madagascar","Malawi","Malaysia","Maldives","Mali","Malta","Marshall Islands","Mauritania","Mauritius","Mexico",
  "Micronesia","Moldova","Monaco","Mongolia","Montenegro","Morocco","Mozambique","Myanmar","Namibia","Nauru","Nepal",
  "Netherlands","New Zealand","Nicaragua","Niger","Nigeria","North Korea","North Macedonia","Norway","Oman","Pakistan","Palau",
  "Palestine","Panama","Papua New Guinea","Paraguay","Peru","Philippines","Poland","Portugal","Qatar","Romania","Russia",
  "Rwanda","Saint Kitts and Nevis","Saint Lucia","Saint Vincent and the Grenadines","Samoa","San Marino","Sao Tome and Principe",
  "Saudi Arabia","Senegal","Serbia","Seychelles","Sierra Leone","Singapore","Slovakia","Slovenia","Solomon Islands","Somalia",
  "South Africa","South Korea","South Sudan","Spain","Sri Lanka","Sudan","Suriname","Sweden","Switzerland","Syria","Taiwan",
  "Tajikistan","Tanzania","Thailand","Togo","Tonga","Trinidad and Tobago","Tunisia","Turkey","Turkmenistan","Tuvalu","Uganda",
  "Ukraine","United Arab Emirates","United Kingdom","United States","Uruguay","Uzbekistan","Vanuatu","Vatican City","Venezuela",
  "Vietnam","Yemen","Zambia","Zimbabwe",
];

const STEPS: { id: Step; label: string; required: boolean }[] = [
  { id: "type", label: "Investor Type", required: true },
  { id: "details", label: "Personal Details", required: true },
  { id: "wallet", label: "Wallet", required: false },
  { id: "kyc", label: "Verification", required: true },
];

export default function OnboardingPage() {
  const router = useRouter();
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();
  const { kycStatus } = useKYC();
  const { isConnected, address } = useAccount();
  const [walletCopied, setWalletCopied] = useState(false);
  const [step, setStep] = useState<Step>("type");
  const [status, setStatus] = useState<OnboardingStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);

  // Form state — null means no selection yet
  const [investorType, setInvestorType] = useState<"individual" | "corporate" | null>(null);
  const [typeConfirmed, setTypeConfirmed] = useState(false);
  // Individual
  const [dob, setDob] = useState("");
  const [nationality, setNationality] = useState("");
  const [countryOfResidence, setCountryOfResidence] = useState("");
  const [phone, setPhone] = useState("");
  // Corporate
  const [companyName, setCompanyName] = useState("");
  const [regNumber, setRegNumber] = useState("");
  const [jurisdiction, setJurisdiction] = useState("");

  // Track which steps were completed server-side (for read-only)
  const isTypeCompleted = status?.steps.type?.completed ?? false;
  const isDetailsCompleted = status?.steps.details?.completed ?? false;

  useEffect(() => {
    if (authLoading) return;
    if (!isAuthenticated) { router.push("/login"); return; }
    (async () => {
      try {
        const data = await getOnboardingStatus();
        setStatus(data);
        if (data.completed) { router.push("/projects"); return; }
        // Jump to first incomplete step
        if (data.steps.type?.completed && data.investor_type) {
          setInvestorType(data.investor_type as "individual" | "corporate");
          setTypeConfirmed(true);
          if (data.steps.details?.completed) {
            if (data.steps.wallet && !data.steps.wallet.completed && !data.steps.kyc?.completed) {
              setStep("wallet");
            } else if (data.steps.kyc?.completed) {
              setStep("complete");
            } else {
              setStep("kyc");
            }
          } else {
            setStep("details");
          }
        }
      } catch (err) { console.error("Onboarding status fetch failed:", err); }
      finally { setLoading(false); }
    })();
  }, [authLoading, isAuthenticated, router]);

  const currentStepIndex = STEPS.findIndex((s) => s.id === step);

  const handleSetType = async () => {
    if (!investorType) return;
    setSaving(true);
    setError(null);
    try {
      await setOnboardingType(investorType);
      setTypeConfirmed(true);
      // Update local status
      setStatus((prev) => {
        if (!prev) return prev;
        const typeStep = prev.steps.type ?? { completed: false, label: "Investor Type" };
        return { ...prev, investor_type: investorType, steps: { ...prev.steps, type: { ...typeStep, completed: true } } };
      });
      setStep("details");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to set type";
      // If type was already set, treat as success — just move forward
      if (msg.includes("already been set") || msg.includes("TYPE_ALREADY_SET")) {
        setTypeConfirmed(true);
        setStatus((prev) => {
          if (!prev) return prev;
          const typeStep = prev.steps.type ?? { completed: false, label: "Investor Type" };
          return { ...prev, investor_type: investorType, steps: { ...prev.steps, type: { ...typeStep, completed: true } } };
        });
        setStep("details");
      } else {
        setError(msg);
      }
    } finally {
      setSaving(false);
      setShowConfirmDialog(false);
    }
  };

  const handleSaveDetails = async () => {
    setSaving(true);
    setError(null);
    // Required field validation
    if (investorType === "individual") {
      if (!dob || !nationality || !countryOfResidence) {
        setError("Please fill in all required fields: Date of Birth, Nationality, and Country of Residence.");
        setSaving(false);
        return;
      }
    } else {
      if (!companyName || !regNumber || !jurisdiction) {
        setError("Please fill in all required fields: Company Name, Registration Number, and Jurisdiction.");
        setSaving(false);
        return;
      }
    }
    // DOB 18+ validation for individuals
    if (investorType === "individual" && dob) {
      const birthDate = new Date(dob);
      const today = new Date();
      const age = today.getFullYear() - birthDate.getFullYear();
      const monthDiff = today.getMonth() - birthDate.getMonth();
      const actualAge = monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate()) ? age - 1 : age;
      if (actualAge < 18) {
        setError("You must be at least 18 years old to invest.");
        setSaving(false);
        return;
      }
    }
    try {
      const details = investorType === "individual"
        ? { date_of_birth: dob || undefined, nationality: nationality || undefined, country_of_residence: countryOfResidence || undefined }
        : { company_name: companyName || undefined, company_registration_number: regNumber || undefined, company_jurisdiction: jurisdiction || undefined };
      await saveOnboardingDetails(details);
      setStatus((prev) => {
        if (!prev) return prev;
        const detailsStep = prev.steps.details ?? { completed: false, label: "Personal Details" };
        return { ...prev, steps: { ...prev.steps, details: { ...detailsStep, completed: true } } };
      });
      setStep("wallet");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const handleDevKycApprove = async () => {
    setSaving(true);
    setError(null);
    try {
      await apiFetch("/api/v1/kyc/dev-approve", { method: "POST" });
      await completeOnboarding();
      setStep("complete");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    } finally {
      setSaving(false);
    }
  };

  if (authLoading || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <Loader2 className="h-8 w-8 animate-spin text-gray-300" />
      </div>
    );
  }

  // Exit link component — elegant exit
  const ExitLink = () => (
    <Link href="/projects" className="flex items-center justify-center gap-2 text-sm text-gray-400 hover:text-gray-600 mt-5 transition-colors">
      <Home className="h-3.5 w-3.5" />
      Exit &mdash; I&apos;ll do this later
    </Link>
  );

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Confirmation Dialog */}
      {showConfirmDialog && investorType && (
        <>
          <div className="fixed inset-0 bg-black/40 z-50" onClick={() => setShowConfirmDialog(false)} />
          <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-full max-w-md bg-white rounded-2xl shadow-xl p-6">
            <div className="flex items-start justify-between mb-4">
              <h3 className="text-lg font-bold text-gray-900">Confirm Your Selection</h3>
              <button onClick={() => setShowConfirmDialog(false)} className="p-1 hover:bg-gray-100 rounded-lg">
                <X className="h-5 w-5 text-gray-400" />
              </button>
            </div>
            <div className="bg-gray-50 rounded-xl p-4 mb-4">
              <div className="flex items-center gap-3">
                {investorType === "individual"
                  ? <User className="h-6 w-6 text-gray-700" />
                  : <Building2 className="h-6 w-6 text-gray-700" />}
                <div>
                  <p className="font-semibold text-gray-900">{investorType === "individual" ? "Individual Investor" : "Corporate Investor"}</p>
                  <p className="text-xs text-gray-500">{investorType === "individual" ? "KYC verification (ID + selfie)" : "KYB verification (company docs)"}</p>
                </div>
              </div>
            </div>
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 mb-6">
              <p className="text-xs text-amber-800">
                <strong>This cannot be undone.</strong> Your verification path and compliance requirements are determined by this choice.
              </p>
            </div>
            <div className="flex gap-3">
              <Button onClick={() => setShowConfirmDialog(false)} variant="outline" className="flex-1 rounded-xl">
                Go Back
              </Button>
              <Button onClick={handleSetType} className="flex-1 bg-gray-900 text-white rounded-xl hover:bg-gray-800" isLoading={saving}>
                Continue
              </Button>
            </div>
          </div>
        </>
      )}

      {/* Header */}
      <header className="bg-white border-b border-gray-100 px-6 py-4">
        <div className="max-w-3xl mx-auto flex items-center justify-between">
          <Link href="/">
            <Image src="/images/logo/cireta-colored.png" alt="Cireta" width={120} height={32} className="h-8 w-auto" />
          </Link>
          <span className="text-sm text-gray-400">
            {user?.display_name || user?.email}
          </span>
        </div>
      </header>

      <div className="max-w-2xl mx-auto px-6 py-12">
        {/* Progress */}
        {step !== "complete" && (
          <div className="flex items-center justify-between mb-10">
            {STEPS.map((s, i) => (
              <div key={s.id} className="flex items-center">
                <div className="flex flex-col items-center">
                  <div className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold transition-colors ${
                    i < currentStepIndex ? "bg-green-500 text-white"
                    : i === currentStepIndex ? "bg-gray-900 text-white"
                    : "bg-gray-200 text-gray-400"
                  }`}>
                    {i < currentStepIndex ? <CheckCircle2 className="h-5 w-5" /> : i + 1}
                  </div>
                  <span className={`text-xs font-medium mt-1.5 whitespace-nowrap ${
                    i < currentStepIndex ? "text-green-600"
                    : i === currentStepIndex ? "text-gray-900"
                    : "text-gray-400"
                  }`}>
                    {s.label}
                  </span>
                </div>
                {i < STEPS.length - 1 && (
                  <div className={`w-12 sm:w-20 h-0.5 mx-1 mb-5 ${i < currentStepIndex ? "bg-green-500" : "bg-gray-200"}`} />
                )}
              </div>
            ))}
          </div>
        )}

        {error && (
          <div className="mb-6 rounded-xl bg-red-50 p-4 text-sm text-red-600 border border-red-100">{error}</div>
        )}

        {/* Step 0: Investor Type */}
        {step === "type" && (
          <div className="bg-white rounded-2xl border border-gray-100 p-8">
            <h1 className="text-2xl font-bold text-gray-900 mb-2">How will you be investing?</h1>
            <p className="text-gray-500 text-sm mb-8">Select your investor type to proceed</p>

            {isTypeCompleted ? (
              /* Read-only view when type already confirmed */
              <div className="mb-6">
                <div className="p-6 rounded-2xl border-2 border-gray-900 bg-gray-50">
                  {investorType === "individual"
                    ? <User className="h-8 w-8 mb-3 text-gray-900" />
                    : <Building2 className="h-8 w-8 mb-3 text-gray-900" />}
                  <h3 className="font-semibold text-gray-900">{investorType === "individual" ? "Individual" : "Corporate"}</h3>
                  <p className="text-sm text-gray-500 mt-1">{investorType === "individual" ? "Personal investment account" : "Company or entity investment"}</p>
                  <p className="text-xs text-green-600 mt-2 flex items-center gap-1"><CheckCircle2 className="h-3 w-3" /> Confirmed</p>
                </div>
              </div>
            ) : (
              /* Selection cards */
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
                <button onClick={() => setInvestorType("individual")}
                  className={`p-6 rounded-2xl border-2 text-left transition-all ${
                    investorType === "individual" ? "border-gray-900 bg-gray-50" : "border-gray-200 hover:border-gray-300"
                  }`}>
                  <User className={`h-8 w-8 mb-3 ${investorType === "individual" ? "text-gray-900" : "text-gray-400"}`} />
                  <h3 className="font-semibold text-gray-900">Individual</h3>
                  <p className="text-sm text-gray-500 mt-1">Personal investment account</p>
                  <p className="text-xs text-gray-400 mt-2">Verification: KYC (ID + selfie)</p>
                </button>
                <button onClick={() => setInvestorType("corporate")}
                  className={`p-6 rounded-2xl border-2 text-left transition-all ${
                    investorType === "corporate" ? "border-gray-900 bg-gray-50" : "border-gray-200 hover:border-gray-300"
                  }`}>
                  <Building2 className={`h-8 w-8 mb-3 ${investorType === "corporate" ? "text-gray-900" : "text-gray-400"}`} />
                  <h3 className="font-semibold text-gray-900">Corporate</h3>
                  <p className="text-sm text-gray-500 mt-1">Company or entity investment</p>
                  <p className="text-xs text-gray-400 mt-2">Verification: KYB (company docs)</p>
                </button>
              </div>
            )}

            {!isTypeCompleted && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-6">
                <div className="flex gap-3">
                  <AlertTriangle className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm text-amber-800 font-medium">This selection is permanent</p>
                    <p className="text-xs text-amber-700 mt-1">
                      Your compliance verification path ({investorType === "individual" ? "KYC" : investorType === "corporate" ? "KYB" : "KYC/KYB"}) depends on this choice and cannot be changed after confirmation.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {isTypeCompleted ? (
              <Button onClick={() => setStep("details")} className="w-full bg-gray-900 text-white rounded-xl hover:bg-gray-800" size="lg">
                Next <ArrowRight className="h-4 w-4 ml-2" />
              </Button>
            ) : (
              <Button
                onClick={() => investorType && setShowConfirmDialog(true)}
                disabled={!investorType}
                className="w-full bg-gray-900 text-white rounded-xl hover:bg-gray-800 disabled:opacity-40 disabled:cursor-not-allowed"
                size="lg"
              >
                {investorType
                  ? <>Continue as {investorType === "individual" ? "Individual" : "Corporate"} <ArrowRight className="h-4 w-4 ml-2" /></>
                  : "Select Investor Type"
                }
              </Button>
            )}
            <ExitLink />
          </div>
        )}

        {/* Step 1: Details */}
        {step === "details" && (
          <div className="bg-white rounded-2xl border border-gray-100 p-8">
            <h1 className="text-2xl font-bold text-gray-900 mb-2">
              {investorType === "individual" ? "Personal Details" : "Company Details"}
            </h1>
            <p className="text-gray-500 text-sm mb-8">Required for identity verification</p>

            {investorType === "individual" ? (
              <div className="space-y-5">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Date of Birth</label>
                  <input type="date" value={dob} onChange={(e) => setDob(e.target.value)}
                    disabled={isDetailsCompleted}
                    max={new Date().toISOString().split("T")[0]}
                    className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-gray-900 focus:ring-1 focus:ring-gray-900 disabled:bg-gray-50 disabled:text-gray-500 disabled:cursor-not-allowed" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Nationality</label>
                  <select value={nationality} onChange={(e) => setNationality(e.target.value)}
                    disabled={isDetailsCompleted}
                    className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-gray-900 focus:ring-1 focus:ring-gray-900 bg-white disabled:bg-gray-50 disabled:text-gray-500 disabled:cursor-not-allowed">
                    <option value="">Select nationality</option>
                    {COUNTRIES.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Country of Residence</label>
                  <select value={countryOfResidence} onChange={(e) => setCountryOfResidence(e.target.value)}
                    disabled={isDetailsCompleted}
                    className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-gray-900 focus:ring-1 focus:ring-gray-900 bg-white disabled:bg-gray-50 disabled:text-gray-500 disabled:cursor-not-allowed">
                    <option value="">Select country</option>
                    {COUNTRIES.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Mobile Phone <span className="text-gray-400 font-normal">(optional)</span></label>
                  <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)}
                    placeholder="+971 50 123 4567"
                    className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-gray-900 focus:ring-1 focus:ring-gray-900" />
                </div>
              </div>
            ) : (
              <div className="space-y-5">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Company Name</label>
                  <input type="text" value={companyName} onChange={(e) => setCompanyName(e.target.value)}
                    disabled={isDetailsCompleted}
                    placeholder="Legal entity name"
                    className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-gray-900 focus:ring-1 focus:ring-gray-900 disabled:bg-gray-50 disabled:text-gray-500 disabled:cursor-not-allowed" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Registration Number</label>
                  <input type="text" value={regNumber} onChange={(e) => setRegNumber(e.target.value)}
                    disabled={isDetailsCompleted}
                    placeholder="Company registration / incorporation number"
                    className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-gray-900 focus:ring-1 focus:ring-gray-900 disabled:bg-gray-50 disabled:text-gray-500 disabled:cursor-not-allowed" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Jurisdiction</label>
                  <select value={jurisdiction} onChange={(e) => setJurisdiction(e.target.value)}
                    disabled={isDetailsCompleted}
                    className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-gray-900 focus:ring-1 focus:ring-gray-900 bg-white disabled:bg-gray-50 disabled:text-gray-500 disabled:cursor-not-allowed">
                    <option value="">Select country of incorporation</option>
                    {COUNTRIES.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Contact Phone <span className="text-gray-400 font-normal">(optional)</span></label>
                  <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)}
                    placeholder="+971 50 123 4567"
                    className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-gray-900 focus:ring-1 focus:ring-gray-900" />
                </div>
              </div>
            )}

            <div className="flex gap-3 mt-8">
              <Button onClick={() => setStep("type")} variant="outline" className="rounded-xl">
                <ArrowLeft className="h-4 w-4 mr-1" /> Back
              </Button>
              {isDetailsCompleted ? (
                <Button onClick={() => setStep("wallet")} className="flex-1 bg-gray-900 text-white rounded-xl hover:bg-gray-800" size="lg">
                  Next <ArrowRight className="h-4 w-4 ml-2" />
                </Button>
              ) : (
                <Button onClick={handleSaveDetails} className="flex-1 bg-gray-900 text-white rounded-xl hover:bg-gray-800" size="lg" isLoading={saving}>
                  Save &amp; Continue <ArrowRight className="h-4 w-4 ml-2" />
                </Button>
              )}
            </div>
            <ExitLink />
          </div>
        )}

        {/* Step 2: Wallet */}
        {step === "wallet" && (
          <div className="bg-white rounded-2xl border border-gray-100 p-8 text-center">
            <div className="w-16 h-16 rounded-2xl bg-blue-50 flex items-center justify-center mx-auto mb-6">
              <Wallet className="h-8 w-8 text-blue-600" />
            </div>
            <h1 className="text-2xl font-bold text-gray-900 mb-2">Connect Your Wallet</h1>
            <p className="text-gray-500 text-sm mb-8 max-w-md mx-auto">
              Link a crypto wallet for on-chain investments. This is optional — you can also invest via bank transfer.
              You can always add or manage wallets later from your account settings.
            </p>

            <div className="flex flex-col items-center gap-4 mb-8">
              {isConnected && address ? (
                <div className="flex flex-col items-center gap-3">
                  <div className="flex items-center gap-2 text-green-600 font-medium">
                    <CheckCircle2 className="h-5 w-5" /> Wallet connected
                  </div>
                  <div className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-xl px-4 py-3">
                    <Wallet className="h-4 w-4 text-gray-400" />
                    <span className="font-mono text-sm text-gray-700">{address.slice(0, 6)}...{address.slice(-4)}</span>
                    <button
                      onClick={() => { navigator.clipboard.writeText(address); setWalletCopied(true); setTimeout(() => setWalletCopied(false), 2000); }}
                      className="text-gray-400 hover:text-darkAqua transition-colors ml-1"
                      title="Copy address"
                    >
                      {walletCopied ? <CheckCircle2 className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
              ) : (
                <ConnectButton />
              )}
            </div>

            <div className="flex gap-3 justify-center">
              <Button onClick={() => setStep("details")} variant="outline" className="rounded-xl">
                <ArrowLeft className="h-4 w-4 mr-1" /> Back
              </Button>
              <Button onClick={() => setStep("kyc")} className="bg-gray-900 text-white rounded-xl hover:bg-gray-800" size="lg">
                {isConnected ? "Continue" : "Skip for now"} <ArrowRight className="h-4 w-4 ml-2" />
              </Button>
            </div>
            <ExitLink />
          </div>
        )}

        {/* Step 3: KYC */}
        {step === "kyc" && (
          <div className="bg-white rounded-2xl border border-gray-100 p-8 text-center">
            <div className={`w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-6 ${
              kycStatus.status === "pending" ? "bg-amber-50" : "bg-green-50"
            }`}>
              {kycStatus.status === "pending"
                ? <Clock className="h-8 w-8 text-amber-600" />
                : <ShieldCheck className="h-8 w-8 text-green-600" />}
            </div>
            <h1 className="text-2xl font-bold text-gray-900 mb-2">Identity Verification</h1>
            <p className="text-gray-500 text-sm mb-2">
              {investorType === "corporate" ? "Complete KYB (Know Your Business) verification" : "Complete KYC (Know Your Customer) verification"}
            </p>
            <p className="text-xs text-gray-400 mb-6">Usually takes 2-3 minutes</p>

            {/* Status banner when KYC is pending */}
            {kycStatus.status === "pending" && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-6 max-w-md mx-auto">
                <div className="flex items-center justify-center gap-2 mb-1">
                  <div className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
                  <p className="text-sm font-semibold text-amber-800">Verification In Progress</p>
                </div>
                <p className="text-xs text-amber-600">
                  Your documents have been submitted and are being reviewed. This usually takes a few minutes but can take up to 24 hours.
                  <br />In case of delay, contact <a href="https://cireta.com" target="_blank" rel="noopener noreferrer" className="text-darkAqua underline hover:text-darkAqua/80">compliance@cireta.com</a>.
                </p>
              </div>
            )}

            {/* Status banner when KYC is rejected */}
            {kycStatus.status === "rejected" && (
              <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-6 max-w-md mx-auto">
                <div className="flex items-center justify-center gap-2 mb-1">
                  <AlertTriangle className="h-4 w-4 text-red-500" />
                  <p className="text-sm font-semibold text-red-800">Verification Failed</p>
                </div>
                <p className="text-xs text-red-600">
                  {kycStatus.message || "Your verification was not approved. Please try again with valid documents."}
                </p>
              </div>
            )}

            {/* Compliance context */}
            <div className="bg-gradient-to-br from-gray-50 to-white rounded-xl p-5 mb-6 text-left max-w-md mx-auto border border-gray-100">
              <p className="text-xs text-gray-500 mb-4">
                Cireta tokenizes regulated real-world assets as compliant security tokens. Under applicable securities and AML/CFT regulations,
                we are required to verify every investor&apos;s identity before granting access to investment opportunities.
              </p>
              <div className="flex items-start gap-2 mb-3">
                <Scale className="h-3.5 w-3.5 text-gray-400 mt-0.5 flex-shrink-0" />
                <p className="text-[11px] text-gray-400">Compliant with international anti-money laundering and securities regulations</p>
              </div>
              <div className="flex items-start gap-2">
                <Lock className="h-3.5 w-3.5 text-gray-400 mt-0.5 flex-shrink-0" />
                <p className="text-[11px] text-gray-400">Your data is encrypted and processed by Sumsub, a certified verification provider</p>
              </div>
            </div>

            {kycStatus.status !== "pending" && (
              <div className="bg-gray-50 rounded-xl p-6 mb-8 text-left max-w-md mx-auto">
                <h3 className="font-medium text-gray-900 text-sm mb-3">What you&apos;ll need:</h3>
                <ul className="space-y-2 text-sm text-gray-600">
                  {investorType === "individual" ? (
                    <>
                      <li className="flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-gray-400" /> Government-issued ID (passport, driver&apos;s license)</li>
                      <li className="flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-gray-400" /> Selfie for face verification</li>
                      <li className="flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-gray-400" /> Proof of address (utility bill, bank statement)</li>
                    </>
                  ) : (
                    <>
                      <li className="flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-gray-400" /> Certificate of incorporation</li>
                      <li className="flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-gray-400" /> Beneficial ownership documentation</li>
                      <li className="flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-gray-400" /> Authorized representative ID</li>
                    </>
                  )}
                </ul>
              </div>
            )}

            <div className="flex items-center justify-center gap-3">
              <Button onClick={() => setStep("wallet")} variant="outline" className="rounded-xl">
                <ArrowLeft className="h-4 w-4 mr-1" /> Back
              </Button>
              <Link href="/verify">
                <Button className="bg-gray-900 text-white rounded-xl hover:bg-gray-800 px-12" size="lg">
                  {kycStatus.status === "pending" ? (
                    <><Search className="h-4 w-4 mr-2" /> Check Status</>
                  ) : kycStatus.status === "rejected" ? (
                    <>Retry Verification <ArrowRight className="h-4 w-4 ml-2" /></>
                  ) : (
                    <>Start Verification <ArrowRight className="h-4 w-4 ml-2" /></>
                  )}
                </Button>
              </Link>
            </div>
            {/* Dev bypass */}
            {kycStatus.status !== "pending" && (
              <button onClick={handleDevKycApprove}
                className="text-xs text-gray-400 hover:text-gray-600 underline mt-3">
                Skip Verification (Dev Only)
              </button>
            )}
            <ExitLink />
          </div>
        )}

        {/* Complete */}
        {step === "complete" && (
          <div className="bg-white rounded-2xl border border-gray-100 p-8 text-center">
            <div className="w-20 h-20 rounded-full bg-green-50 flex items-center justify-center mx-auto mb-6">
              <CheckCircle2 className="h-10 w-10 text-green-500" />
            </div>
            <h1 className="text-2xl font-bold text-gray-900 mb-2">You&apos;re all set!</h1>
            <p className="text-gray-500 text-sm mb-8 max-w-md mx-auto">
              Your account is verified and ready. Start exploring investment opportunities.
            </p>
            <Link href="/projects">
              <Button className="bg-gray-900 text-white rounded-xl hover:bg-gray-800 px-12" size="lg">
                Browse Projects <ArrowRight className="h-4 w-4 ml-2" />
              </Button>
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
