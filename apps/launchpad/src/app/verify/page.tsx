"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import {
  Shield,
  CheckCircle2,
  FileText,
  Camera,
  UserCheck,
  ArrowRight,
  ArrowLeft,
} from "lucide-react";
import { Button, Badge, Spinner } from "@/components/atoms";
import { PageLayout } from "@/components/templates";

const STEPS = [
  {
    id: 1,
    title: "Identity Document",
    description: "Upload a valid government-issued ID",
    icon: FileText,
  },
  {
    id: 2,
    title: "Liveness Check",
    description: "Complete a quick video verification",
    icon: Camera,
  },
  {
    id: 3,
    title: "Review",
    description: "We'll verify your information",
    icon: UserCheck,
  },
];

export default function VerifyPage() {
  const [currentStep, setCurrentStep] = useState(1);
  const [isLoading, setIsLoading] = useState(false);
  const [isComplete, setIsComplete] = useState(false);

  const handleNext = async () => {
    if (currentStep < 3) {
      setCurrentStep(currentStep + 1);
    } else {
      setIsLoading(true);
      // Simulate submission
      await new Promise((resolve) => setTimeout(resolve, 2000));
      setIsLoading(false);
      setIsComplete(true);
    }
  };

  if (isComplete) {
    return (
      <PageLayout variant="light">
        <div className="min-h-[80vh] flex items-center justify-center px-4 py-20">
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="max-w-md text-center"
          >
            <div className="w-20 h-20 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-6">
              <CheckCircle2 className="w-10 h-10 text-green-600" />
            </div>
            <h1 className="text-2xl font-semibold text-text mb-4">
              Verification Submitted
            </h1>
            <p className="text-gray-500 mb-8">
              Your documents have been submitted for review. We&apos;ll notify
              you once the verification is complete, usually within 24 hours.
            </p>
            <Button
              variant="primary"
              size="lg"
              onClick={() => (window.location.href = "/portfolio")}
            >
              Go to Portfolio
            </Button>
          </motion.div>
        </div>
      </PageLayout>
    );
  }

  return (
    <PageLayout variant="light">
      <div className="min-h-screen bg-box py-32 px-4">
        <div className="max-w-3xl mx-auto">
          {/* Header */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-center mb-12"
          >
            <div className="w-16 h-16 rounded-full bg-darkAqua/10 flex items-center justify-center mx-auto mb-6">
              <Shield className="w-8 h-8 text-darkAqua" />
            </div>
            <h1 className="text-xxl font-semibold text-text -tracking-[1.44px] mb-4">
              Identity Verification
            </h1>
            <p className="text-gray-500 max-w-md mx-auto">
              Complete KYC verification to start investing. Your information is
              encrypted and securely processed.
            </p>
          </motion.div>

          {/* Progress Steps */}
          <div className="mb-12">
            <div className="flex items-center justify-between">
              {STEPS.map((step, index) => (
                <div key={step.id} className="flex items-center flex-1">
                  <div className="flex flex-col items-center">
                    <div
                      className={`w-12 h-12 rounded-full flex items-center justify-center ${
                        currentStep > step.id
                          ? "bg-green-500 text-white"
                          : currentStep === step.id
                          ? "bg-darkAqua text-white"
                          : "bg-gray-200 text-gray-500"
                      }`}
                    >
                      {currentStep > step.id ? (
                        <CheckCircle2 className="w-6 h-6" />
                      ) : (
                        <step.icon className="w-6 h-6" />
                      )}
                    </div>
                    <div className="mt-3 text-center">
                      <p
                        className={`text-sm font-semibold ${
                          currentStep >= step.id
                            ? "text-text"
                            : "text-gray-400"
                        }`}
                      >
                        {step.title}
                      </p>
                      <p className="text-xs text-gray-400 hidden sm:block">
                        {step.description}
                      </p>
                    </div>
                  </div>
                  {index < STEPS.length - 1 && (
                    <div
                      className={`flex-1 h-1 mx-4 rounded-full ${
                        currentStep > step.id ? "bg-green-500" : "bg-gray-200"
                      }`}
                    />
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Step Content */}
          <motion.div
            key={currentStep}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            className="bg-white rounded-3xl p-8 border border-darkBlack/10"
          >
            {currentStep === 1 && (
              <div className="text-center">
                <h2 className="text-xl font-semibold text-text mb-4">
                  Upload Your ID Document
                </h2>
                <p className="text-gray-500 mb-8">
                  Please upload a clear photo of your passport, driver&apos;s
                  license, or national ID card.
                </p>

                <div className="border-2 border-dashed border-darkBlack/20 rounded-2xl p-12 hover:border-darkAqua transition-colors cursor-pointer">
                  <div className="w-16 h-16 rounded-full bg-box flex items-center justify-center mx-auto mb-4">
                    <FileText className="w-8 h-8 text-darkAqua" />
                  </div>
                  <p className="font-medium text-text mb-2">
                    Click to upload or drag and drop
                  </p>
                  <p className="text-sm text-gray-400">
                    PNG, JPG or PDF (max 10MB)
                  </p>
                </div>

                <div className="mt-8 p-4 rounded-xl bg-box text-left">
                  <h3 className="font-semibold text-sm text-text mb-2">
                    Accepted Documents
                  </h3>
                  <ul className="text-sm text-gray-500 space-y-1">
                    <li>• Passport (most preferred)</li>
                    <li>• Driver&apos;s License</li>
                    <li>• National ID Card</li>
                  </ul>
                </div>
              </div>
            )}

            {currentStep === 2 && (
              <div className="text-center">
                <h2 className="text-xl font-semibold text-text mb-4">
                  Liveness Check
                </h2>
                <p className="text-gray-500 mb-8">
                  Take a quick selfie to verify that you&apos;re a real person.
                  Make sure your face is well-lit and clearly visible.
                </p>

                <div className="aspect-video max-w-md mx-auto bg-darkBlack rounded-2xl flex items-center justify-center mb-8">
                  <div className="text-center text-white/60">
                    <Camera className="w-12 h-12 mx-auto mb-4" />
                    <p>Camera preview will appear here</p>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-4 max-w-md mx-auto">
                  {["Good lighting", "Face centered", "Remove glasses"].map(
                    (tip) => (
                      <div
                        key={tip}
                        className="p-3 rounded-xl bg-box text-center"
                      >
                        <CheckCircle2 className="w-5 h-5 text-darkAqua mx-auto mb-1" />
                        <p className="text-xs text-gray-500">{tip}</p>
                      </div>
                    )
                  )}
                </div>
              </div>
            )}

            {currentStep === 3 && (
              <div className="text-center">
                <h2 className="text-xl font-semibold text-text mb-4">
                  Review & Submit
                </h2>
                <p className="text-gray-500 mb-8">
                  Please review your submitted information. Once submitted,
                  we&apos;ll process your verification.
                </p>

                <div className="space-y-4 text-left mb-8">
                  <div className="flex items-center justify-between p-4 rounded-xl bg-box">
                    <div className="flex items-center gap-3">
                      <FileText className="w-5 h-5 text-darkAqua" />
                      <span>Identity Document</span>
                    </div>
                    <Badge variant="success">Uploaded</Badge>
                  </div>
                  <div className="flex items-center justify-between p-4 rounded-xl bg-box">
                    <div className="flex items-center gap-3">
                      <Camera className="w-5 h-5 text-darkAqua" />
                      <span>Liveness Check</span>
                    </div>
                    <Badge variant="success">Completed</Badge>
                  </div>
                </div>

                <p className="text-sm text-gray-400">
                  By submitting, you agree that the information provided is
                  accurate and that you consent to our verification process.
                </p>
              </div>
            )}
          </motion.div>

          {/* Navigation */}
          <div className="flex justify-between mt-8">
            <Button
              variant="outline"
              onClick={() => setCurrentStep(Math.max(1, currentStep - 1))}
              disabled={currentStep === 1}
              leftIcon={<ArrowLeft className="w-4 h-4" />}
            >
              Back
            </Button>
            <Button
              variant="primary"
              onClick={handleNext}
              isLoading={isLoading}
              rightIcon={
                currentStep < 3 ? <ArrowRight className="w-4 h-4" /> : undefined
              }
            >
              {currentStep === 3 ? "Submit Verification" : "Continue"}
            </Button>
          </div>
        </div>
      </div>
    </PageLayout>
  );
}
