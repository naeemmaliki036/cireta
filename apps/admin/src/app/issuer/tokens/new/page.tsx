"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { ArrowRight, CheckCircle2, Coins, FileText, Shield, Rocket } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/atoms";
import { IssuerDashboardLayout } from "@/components/templates";
import {
  StepTokenDetails, StepDocumentation, StepCompliance, StepDeploy,
  type TokenFormData,
} from "@/lib/tokenFormSteps";

const STEPS = [
  { id: 1, title: "Token Details", icon: Coins },
  { id: 2, title: "Documentation", icon: FileText },
  { id: 3, title: "Compliance", icon: Shield },
  { id: 4, title: "Deploy", icon: Rocket },
];

export default function CreateTokenPage() {
  const [currentStep, setCurrentStep] = useState(1);
  const [isDeploying, setIsDeploying] = useState(false);
  const [selectedModules, setSelectedModules] = useState<string[]>(["country_allow", "max_ownership"]);
  const [formData, setFormData] = useState<TokenFormData>({
    name: "", symbol: "", assetType: "commodity", totalSupply: "", decimals: "18", description: "",
  });

  const handleDeploy = async () => {
    setIsDeploying(true);
    await new Promise((resolve) => setTimeout(resolve, 3000));
    setIsDeploying(false);
  };

  const toggleModule = (id: string) => {
    setSelectedModules((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);
  };

  return (
    <IssuerDashboardLayout
      title="Create New Token" description="Deploy a new ERC-3643 security token"
      breadcrumbs={[{ label: "Tokens", href: "/issuer/tokens" }, { label: "Create New" }]}
    >
      {/* Progress Steps */}
      <div className="mb-8">
        <div className="flex items-center justify-between relative">
          {STEPS.map((step) => (
            <div key={step.id} className="flex flex-col items-center z-10">
              <div className={`w-12 h-12 rounded-full flex items-center justify-center transition-colors ${
                currentStep > step.id ? "bg-green-500 text-white"
                  : currentStep === step.id ? "bg-darkAqua text-white" : "bg-gray-200 text-gray-500"
              }`}>
                {currentStep > step.id ? <CheckCircle2 className="h-6 w-6" /> : <step.icon className="h-6 w-6" />}
              </div>
              <p className={`mt-3 text-sm font-semibold ${currentStep >= step.id ? "text-text" : "text-gray-400"}`}>
                {step.title}
              </p>
            </div>
          ))}
          <div className="absolute top-6 left-0 right-0 h-0.5 bg-gray-200 -z-0">
            <div className="h-full bg-green-500 transition-all duration-500"
              style={{ width: `${((currentStep - 1) / 3) * 100}%` }} />
          </div>
        </div>
      </div>

      {/* Step Content */}
      <motion.div key={currentStep} initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }}
        className="bg-white rounded-3xl p-8 border border-darkBlack/10">
        {currentStep === 1 && <StepTokenDetails formData={formData} setFormData={setFormData} />}
        {currentStep === 2 && <StepDocumentation />}
        {currentStep === 3 && <StepCompliance selectedModules={selectedModules} toggleModule={toggleModule} />}
        {currentStep === 4 && <StepDeploy formData={formData} selectedModules={selectedModules} />}
      </motion.div>

      {/* Navigation */}
      <div className="flex justify-between mt-8">
        {currentStep === 1 ? (
          <Link href="/issuer/tokens"><Button variant="outline">Cancel</Button></Link>
        ) : (
          <Button variant="outline" onClick={() => setCurrentStep(currentStep - 1)}>Back</Button>
        )}
        {currentStep < 4 ? (
          <Button variant="primary" onClick={() => setCurrentStep(currentStep + 1)}
            rightIcon={<ArrowRight className="h-4 w-4" />}>Continue</Button>
        ) : (
          <Button variant="primary" onClick={handleDeploy} isLoading={isDeploying}>
            {isDeploying ? "Deploying..." : "Deploy Token"}
          </Button>
        )}
      </div>
    </IssuerDashboardLayout>
  );
}
