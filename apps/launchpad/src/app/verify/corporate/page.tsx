"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
const SumsubWebSdk = dynamic(() => import("@sumsub/websdk-react"), { ssr: false });
import { motion } from "framer-motion";
import { Building2, CheckCircle2, Loader2, AlertCircle } from "lucide-react";
import { Navbar, Footer } from "@/components/organisms";
import { Button, Input, Spinner } from "@/components/atoms";
import {
  initiateCorporateKYB,
  getCorporateKYBStatus,
  type KYBDocumentRequest,
} from "@/lib/api/repositories/kyc.repository";
// Auth handled by httpOnly cookie via proxy

type Step = "form" | "sdk" | "processing" | "approved" | "error";

export default function CorporateVerifyPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("form");
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<KYBDocumentRequest>({
    company_name: "",
    registration_number: "",
    jurisdiction: "",
    directors: [],
    ubo_list: [],
  });

  useEffect(() => {
    const token = "";
    if (!token) { setError("Please log in first"); setStep("error"); return; }
    (async () => {
      try {
        const status = await getCorporateKYBStatus(token);
        if (status.status === "approved" && status.level >= 4) { setStep("approved"); return; }
        if (status.review_status === "pending") { setStep("processing"); }
      } catch (err) { console.error("Failed to check KYB status:", err); }
    })();
  }, []);

  const handleSubmit = async () => {
    const token = "";
    if (!token) { setError("Please log in first"); setStep("error"); return; }
    try {
      const result = await initiateCorporateKYB(token, form);
      setAccessToken(result.access_token);
      setStep("sdk");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to initiate KYB";
      if (msg.includes("pending") || msg.includes("APPLICATION_PENDING")) { setStep("processing"); }
      else if (msg.includes("ALREADY_VERIFIED")) { setStep("approved"); }
      else { setError(msg); setStep("error"); }
    }
  };

  const handleMessage = useCallback((type: string) => {
    if (type === "idCheck.applicantReviewComplete" || type === "idCheck.onApplicantStatusChanged") {
      setStep("processing");
      setTimeout(async () => {
        const token = "";
        if (!token) return;
        try {
          const status = await getCorporateKYBStatus(token);
          if (status.status === "approved") {
            setStep("approved");
            setTimeout(() => router.push("/projects"), 2000);
          }
        } catch (err) { console.error("Failed to poll KYB status:", err); }
      }, 3000);
    }
  }, [router]);

  const handleError = useCallback((err: unknown) => {
    console.error("Sumsub SDK error:", err);
    setError("Verification encountered an error. Please try again.");
    setStep("error");
  }, []);

  const field = (label: string, key: keyof KYBDocumentRequest, placeholder: string) => (
    <div key={key}>
      <label className="block text-sm font-semibold text-text mb-1.5">{label}</label>
      <Input
        placeholder={placeholder}
        value={form[key] as string}
        onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
      />
    </div>
  );

  return (
    <div className="min-h-screen bg-box">
      <Navbar variant="light" />
      <div className="pt-32 pb-20 px-4">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
          className="max-w-2xl mx-auto bg-white rounded-3xl p-8 border border-black/10">

          {step === "form" && (
            <div>
              <div className="text-center mb-8">
                <Building2 className="w-12 h-12 text-darkAqua mx-auto mb-4" />
                <h2 className="text-2xl font-semibold text-text mb-2">Corporate Verification</h2>
                <p className="text-black/50">Submit your company details for KYB verification</p>
              </div>
              <div className="space-y-4">
                {field("Company Name", "company_name", "Cireta Ltd.")}
                {field("Registration Number", "registration_number", "12345678")}
                {field("Jurisdiction", "jurisdiction", "United Kingdom")}
              </div>
              <div className="mt-8">
                <Button variant="primary" className="w-full" onClick={handleSubmit}
                  disabled={!form.company_name || !form.registration_number || !form.jurisdiction}>
                  Submit for Verification
                </Button>
              </div>
            </div>
          )}

          {step === "sdk" && accessToken && (
            <div>
              <div className="text-center mb-8">
                <Building2 className="w-12 h-12 text-darkAqua mx-auto mb-4" />
                <h2 className="text-2xl font-semibold text-text mb-2">Document Upload</h2>
                <p className="text-black/50">Upload required corporate documents</p>
              </div>
              <div className="rounded-2xl overflow-hidden border border-black/10 min-h-[500px]">
                <SumsubWebSdk
                  accessToken={accessToken}
                  expirationHandler={async () => {
                    const t = "";
                    if (!t) throw new Error("Not authenticated");
                    return initiateCorporateKYB(t, form).then((r) => r.access_token);
                  }}
                  config={{ lang: "en" }}
                  options={{ addViewportTag: false, adaptIframeHeight: true }}
                  onMessage={handleMessage}
                  onError={handleError}
                />
              </div>
            </div>
          )}

          {step === "processing" && (
            <div className="text-center py-16">
              <div className="w-20 h-20 rounded-full bg-darkAqua/10 flex items-center justify-center mx-auto mb-6">
                <Loader2 className="w-10 h-10 text-darkAqua animate-spin" />
              </div>
              <h2 className="text-2xl font-semibold text-text mb-2">Under Review</h2>
              <p className="text-black/50 mb-8">Your corporate documents are being reviewed.</p>
              <Button variant="outline" onClick={() => router.push("/projects")}>Continue Browsing</Button>
            </div>
          )}

          {step === "approved" && (
            <div className="text-center py-16">
              <div className="w-20 h-20 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-6">
                <CheckCircle2 className="w-10 h-10 text-green-600" />
              </div>
              <h2 className="text-2xl font-semibold text-text mb-2">Corporate KYB Verified</h2>
              <p className="text-black/50 mb-8">Your company has been verified (Level 4)</p>
              <Button variant="primary" onClick={() => router.push("/projects")}>Start Investing</Button>
            </div>
          )}

          {step === "error" && (
            <div className="text-center py-16">
              <div className="w-20 h-20 rounded-full bg-red-100 flex items-center justify-center mx-auto mb-6">
                <AlertCircle className="w-10 h-10 text-red-500" />
              </div>
              <h2 className="text-2xl font-semibold text-text mb-2">Something Went Wrong</h2>
              <p className="text-black/50 mb-8">{error ?? "Unable to start verification"}</p>
              <Button variant="primary" onClick={() => window.location.reload()}>Try Again</Button>
            </div>
          )}
        </motion.div>
      </div>
      <Footer />
    </div>
  );
}
