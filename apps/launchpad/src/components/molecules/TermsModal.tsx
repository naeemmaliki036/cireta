"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/atoms";

interface TermsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAccept: () => void;
  title?: string;
}

export function TermsModal({ isOpen, onClose, onAccept, title = "Terms & Conditions Required" }: TermsModalProps) {
  const [agreed, setAgreed] = useState(false);

  if (!isOpen) return null;

  const handleAccept = () => {
    if (agreed) {
      onAccept();
      setAgreed(false); // Reset for next time
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black bg-opacity-50">
      <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-text">{title}</h3>
          <button
            onClick={onClose}
            className="p-1 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X className="h-5 w-5 text-gray-400" />
          </button>
        </div>

        {/* Content */}
        <div className="mb-6">
          <p className="text-sm text-gray-600 mb-4">
            To continue with Google, please read and agree to our Terms of Service and Privacy Policy.
          </p>

          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={agreed}
              onChange={(e) => setAgreed(e.target.checked)}
              className="w-4 h-4 rounded border-gray-300 text-darkAqua focus:ring-darkAqua mt-0.5 flex-shrink-0"
            />
            <span className="text-sm text-gray-600 leading-relaxed">
              I&apos;ve read and agree to the{" "}
              <a
                href="https://www.cireta.com/terms-of-service"
                target="_blank"
                rel="noopener noreferrer"
                className="text-darkAqua hover:underline font-medium"
              >
                Terms of Service
              </a>
              {" "}and{" "}
              <a
                href="https://www.cireta.com/privacy-policy"
                target="_blank"
                rel="noopener noreferrer"
                className="text-darkAqua hover:underline font-medium"
              >
                Privacy Policy
              </a>
            </span>
          </label>
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={onClose}
          >
            Cancel
          </Button>
          <Button
            size="sm"
            className="btn-cta"
            onClick={handleAccept}
            disabled={!agreed}
          >
            Continue with Google
          </Button>
        </div>
      </div>
    </div>
  );
}