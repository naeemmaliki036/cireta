"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { ArrowRight, CheckCircle2, Coins, Shield, Rocket, Zap } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/atoms";
import { IssuerDashboardLayout } from "@/components/templates";
import {
  StepTokenDetails, StepCompliance, StepDeploy,
  type TokenFormData,
} from "@/lib/tokenFormSteps";
import { createToken, deployToken } from "@/lib/api/repositories/tokens";
import { getAccessToken } from "@/lib/api/client";

const STEPS = [
  { id: 1, title: "Token Details", icon: Coins },
  { id: 2, title: "Compliance", icon: Shield },
  { id: 3, title: "Deploy", icon: Rocket },
];

export default function CreateTokenPage() {
  const [currentStep, setCurrentStep] = useState(1);
  const [isDeploying, setIsDeploying] = useState(false);
  const [selectedModules, setSelectedModules] = useState<string[]>(["country_allow", "max_ownership"]);
  const [formData, setFormData] = useState<TokenFormData>({
    name: "", symbol: "", assetType: "commodity", totalSupply: "", decimals: "18", description: "",
  });

  const [deployError, setDeployError] = useState<string | null>(null);
  const [deploySuccess, setDeploySuccess] = useState(false);

  const handleDeploy = async () => {
    setIsDeploying(true);
    setDeployError(null);
    try {
      const token = getAccessToken() ?? "";
      const created = await createToken(
        {
          name: formData.name,
          symbol: formData.symbol,
          asset_type: formData.assetType,
          total_supply: formData.totalSupply,
          decimals: formData.decimals,
          description: formData.description,
        },
        token,
      );
      await deployToken(created.id, token);
      setDeploySuccess(true);
    } catch (err) {
      setDeployError(err instanceof Error ? err.message : "Deployment failed");
    } finally {
      setIsDeploying(false);
    }
  };

  const toggleModule = (id: string) => {
    setSelectedModules((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);
  };

  const isDev = process.env.NODE_ENV === "development";

  const autoFill = () => {
    setFormData({
      name: "Wassa Gold Reserve",
      symbol: "WGLD",
      assetType: "commodity",
      totalSupply: "1000000",
      decimals: "18",
      description: "ERC-3643 security token backed by physical gold reserves in West Africa. Each token represents fractional ownership of audited gold holdings.",
    });
    setSelectedModules(["country_allow", "max_ownership", "max_holders"]);
  };

  const totalSteps = STEPS.length;

  return (
    <IssuerDashboardLayout
      title="Create New Token" description="Deploy a new ERC-3643 security token"
    >
      {/* Dev Auto-fill */}
      {isDev && (
        <div className="flex justify-end mb-4">
          <button onClick={autoFill}
            className="inline-flex items-center gap-1.5 bg-amber-500 text-white px-3 py-1.5 rounded-full hover:bg-amber-600 transition-colors text-xs font-semibold">
            <Zap className="h-3 w-3" />
            Auto-fill Fields
          </button>
        </div>
      )}

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
              style={{ width: `${((currentStep - 1) / (totalSteps - 1)) * 100}%` }} />
          </div>
        </div>
      </div>

      {/* Step Content */}
      <motion.div key={currentStep} initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }}
        className="bg-white rounded-3xl p-8 border border-darkBlack/10">
        {currentStep === 1 && <StepTokenDetails formData={formData} setFormData={setFormData} />}
        {currentStep === 2 && <StepCompliance selectedModules={selectedModules} toggleModule={toggleModule} />}
        {currentStep === 3 && <StepDeploy formData={formData} selectedModules={selectedModules} />}
      </motion.div>

      {/* Navigation */}
      <div className="flex justify-between mt-8">
        {currentStep === 1 ? (
          <Link href="/issuer/tokens"><Button variant="outline">Cancel</Button></Link>
        ) : (
          <Button variant="outline" onClick={() => setCurrentStep(currentStep - 1)}>Back</Button>
        )}
        {currentStep < totalSteps ? (
          <Button variant="primary" onClick={() => setCurrentStep(currentStep + 1)}
            rightIcon={<ArrowRight className="h-4 w-4" />}>Continue</Button>
        ) : (
          <div className="flex flex-col items-end gap-2">
            {deployError && <p className="text-red-600 text-sm">{deployError}</p>}
            {deploySuccess ? (
              <Button variant="primary" disabled>Token Deployed</Button>
            ) : (
              <Button variant="primary" onClick={handleDeploy} isLoading={isDeploying}>
                {isDeploying ? "Deploying..." : "Deploy Token"}
              </Button>
            )}
          </div>
        )}
      </div>
    </IssuerDashboardLayout>
  );
}
