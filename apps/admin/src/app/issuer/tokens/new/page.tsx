"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import {
  ArrowRight,
  CheckCircle2,
  Coins,
  FileText,
  Shield,
  Rocket,
  Upload,
} from "lucide-react";
import Link from "next/link";
import { Button, Input, Select, Textarea, Badge } from "@/components/atoms";
import { IssuerDashboardLayout } from "@/components/templates";

const STEPS = [
  { id: 1, title: "Token Details", icon: Coins },
  { id: 2, title: "Documentation", icon: FileText },
  { id: 3, title: "Compliance", icon: Shield },
  { id: 4, title: "Deploy", icon: Rocket },
];

const ASSET_TYPES = [
  { value: "commodity", label: "Commodity (Gold, Copper, etc.)" },
  { value: "futures", label: "Futures Contract" },
];

const COMPLIANCE_MODULES = [
  { id: "country_allow", name: "Country Allow List", description: "Restrict to specific countries" },
  { id: "max_ownership", name: "Max Ownership", description: "Limit maximum token ownership per holder" },
  { id: "max_holders", name: "Max Holder Count", description: "Limit total number of token holders" },
  { id: "conditional_transfer", name: "Conditional Transfer", description: "Require approval for transfers" },
  { id: "time_limit", name: "Time-Based Limits", description: "Restrict transfers to certain periods" },
];

export default function CreateTokenPage() {
  const [currentStep, setCurrentStep] = useState(1);
  const [isDeploying, setIsDeploying] = useState(false);
  const [selectedModules, setSelectedModules] = useState<string[]>(["country_allow", "max_ownership"]);

  const [formData, setFormData] = useState({
    name: "",
    symbol: "",
    assetType: "commodity",
    totalSupply: "",
    decimals: "18",
    description: "",
  });

  const handleNext = () => {
    if (currentStep < 4) {
      setCurrentStep(currentStep + 1);
    }
  };

  const handleBack = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
    }
  };

  const handleDeploy = async () => {
    setIsDeploying(true);
    // Simulate deployment
    await new Promise((resolve) => setTimeout(resolve, 3000));
    setIsDeploying(false);
    // Redirect to token detail page
  };

  const toggleModule = (moduleId: string) => {
    setSelectedModules((prev) =>
      prev.includes(moduleId)
        ? prev.filter((id) => id !== moduleId)
        : [...prev, moduleId]
    );
  };

  return (
    <IssuerDashboardLayout
      title="Create New Token"
      description="Deploy a new ERC-3643 security token"
      breadcrumbs={[
        { label: "Tokens", href: "/issuer/tokens" },
        { label: "Create New" },
      ]}
    >
      {/* Progress Steps */}
      <div className="mb-8">
        <div className="flex items-center justify-between relative">
          {STEPS.map((step) => (
            <div key={step.id} className="flex flex-col items-center z-10">
              <div
                className={`w-12 h-12 rounded-full flex items-center justify-center transition-colors ${
                  currentStep > step.id
                    ? "bg-green-500 text-white"
                    : currentStep === step.id
                    ? "bg-darkAqua text-white"
                    : "bg-gray-200 text-gray-500"
                }`}
              >
                {currentStep > step.id ? (
                  <CheckCircle2 className="h-6 w-6" />
                ) : (
                  <step.icon className="h-6 w-6" />
                )}
              </div>
              <div className="mt-3 text-center">
                <p
                  className={`text-sm font-semibold ${
                    currentStep >= step.id ? "text-text" : "text-gray-400"
                  }`}
                >
                  {step.title}
                </p>
              </div>
            </div>
          ))}
          <div className="absolute top-6 left-0 right-0 h-0.5 bg-gray-200 -z-0">
            <div
              className="h-full bg-green-500 transition-all duration-500"
              style={{ width: `${((currentStep - 1) / 3) * 100}%` }}
            />
          </div>
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
          <div className="max-w-2xl mx-auto">
            <h2 className="text-xl font-semibold text-text mb-6">Token Details</h2>
            <div className="space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <Input
                  label="Token Name"
                  placeholder="e.g., West African Gold Reserve"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                />
                <Input
                  label="Token Symbol"
                  placeholder="e.g., WAGR"
                  value={formData.symbol}
                  onChange={(e) => setFormData({ ...formData, symbol: e.target.value.toUpperCase() })}
                />
              </div>

              <Select
                label="Asset Type"
                options={ASSET_TYPES}
                value={formData.assetType}
                onChange={(e) => setFormData({ ...formData, assetType: e.target.value })}
              />

              <div className="grid grid-cols-2 gap-4">
                <Input
                  label="Total Supply"
                  type="number"
                  placeholder="e.g., 1000000"
                  value={formData.totalSupply}
                  onChange={(e) => setFormData({ ...formData, totalSupply: e.target.value })}
                />
                <Input
                  label="Decimals"
                  type="number"
                  value={formData.decimals}
                  onChange={(e) => setFormData({ ...formData, decimals: e.target.value })}
                />
              </div>

              <Textarea
                label="Description"
                placeholder="Describe the underlying asset..."
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              />
            </div>
          </div>
        )}

        {currentStep === 2 && (
          <div className="max-w-2xl mx-auto">
            <h2 className="text-xl font-semibold text-text mb-6">Documentation</h2>
            <div className="space-y-6">
              <div>
                <label className="input-label">Legal Documents</label>
                <div className="border-2 border-dashed border-darkBlack/20 rounded-2xl p-8 text-center hover:border-darkAqua transition-colors cursor-pointer">
                  <Upload className="h-10 w-10 text-gray-400 mx-auto mb-4" />
                  <p className="font-medium text-text mb-1">Upload legal documents</p>
                  <p className="text-sm text-gray-500">PDF, DOC up to 10MB each</p>
                </div>
              </div>

              <div>
                <label className="input-label">Proof of Reserve</label>
                <div className="border-2 border-dashed border-darkBlack/20 rounded-2xl p-8 text-center hover:border-darkAqua transition-colors cursor-pointer">
                  <Upload className="h-10 w-10 text-gray-400 mx-auto mb-4" />
                  <p className="font-medium text-text mb-1">Upload proof of reserve</p>
                  <p className="text-sm text-gray-500">Audit reports, custody certificates</p>
                </div>
              </div>

              <Input
                label="Chainlink PoR Feed Address (Optional)"
                placeholder="0x..."
                helperText="Connect to Chainlink Proof of Reserve for real-time verification"
              />
            </div>
          </div>
        )}

        {currentStep === 3 && (
          <div className="max-w-2xl mx-auto">
            <h2 className="text-xl font-semibold text-text mb-2">Compliance Modules</h2>
            <p className="text-gray-500 mb-6">Select the compliance rules for your token</p>

            <div className="space-y-4">
              {COMPLIANCE_MODULES.map((module) => (
                <button
                  key={module.id}
                  type="button"
                  onClick={() => toggleModule(module.id)}
                  className={`w-full flex items-center justify-between p-4 rounded-2xl border-2 transition-colors text-left ${
                    selectedModules.includes(module.id)
                      ? "border-darkAqua bg-darkAqua/5"
                      : "border-darkBlack/10 hover:border-darkBlack/20"
                  }`}
                >
                  <div className="flex items-center gap-4">
                    <div
                      className={`w-6 h-6 rounded-full border-2 flex items-center justify-center ${
                        selectedModules.includes(module.id)
                          ? "border-darkAqua bg-darkAqua"
                          : "border-gray-300"
                      }`}
                    >
                      {selectedModules.includes(module.id) && (
                        <CheckCircle2 className="h-4 w-4 text-white" />
                      )}
                    </div>
                    <div>
                      <p className="font-semibold text-text">{module.name}</p>
                      <p className="text-sm text-gray-500">{module.description}</p>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {currentStep === 4 && (
          <div className="max-w-2xl mx-auto text-center">
            <div className="w-20 h-20 rounded-full bg-darkAqua/10 flex items-center justify-center mx-auto mb-6">
              <Rocket className="h-10 w-10 text-darkAqua" />
            </div>
            <h2 className="text-xl font-semibold text-text mb-2">Ready to Deploy</h2>
            <p className="text-gray-500 mb-8">Review your token configuration before deployment</p>

            <div className="bg-box rounded-2xl p-6 text-left mb-8">
              <h3 className="font-semibold text-text mb-4">Token Summary</h3>
              <div className="space-y-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-500">Name</span>
                  <span className="font-medium">{formData.name || "Not set"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Symbol</span>
                  <span className="font-medium">{formData.symbol || "Not set"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Asset Type</span>
                  <Badge variant="default" size="sm">{formData.assetType}</Badge>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Total Supply</span>
                  <span className="font-medium">{formData.totalSupply || "Not set"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Compliance Modules</span>
                  <span className="font-medium">{selectedModules.length} selected</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Network</span>
                  <span className="font-medium">Base Mainnet</span>
                </div>
              </div>
            </div>

            <div className="p-4 rounded-xl bg-gold/10 border border-gold/30 text-left mb-8">
              <p className="text-sm text-gray-600">
                <strong className="text-gold">Note:</strong> Deploying will create the token contract on Base Mainnet.
                This action requires a transaction fee and cannot be undone.
              </p>
            </div>
          </div>
        )}
      </motion.div>

      {/* Navigation */}
      <div className="flex justify-between mt-8">
        {currentStep === 1 ? (
          <Link href="/issuer/tokens">
            <Button variant="outline" >
              Cancel
            </Button>
          </Link>
        ) : (
          <Button
            variant="outline"
            onClick={handleBack} >
            Back
          </Button>
        )}

        {currentStep < 4 ? (
          <Button
            variant="primary"
            onClick={handleNext}
            rightIcon={<ArrowRight className="h-4 w-4" />}
          >
            Continue
          </Button>
        ) : (
          <Button
            variant="primary"
            onClick={handleDeploy}
            isLoading={isDeploying} >
            {isDeploying ? "Deploying..." : "Deploy Token"}
          </Button>
        )}
      </div>
    </IssuerDashboardLayout>
  );
}
