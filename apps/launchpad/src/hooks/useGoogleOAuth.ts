"use client";

import { useState } from "react";

export function useGoogleOAuth() {
  const [isTermsModalOpen, setIsTermsModalOpen] = useState(false);

  const handleGoogleSignIn = () => {
    setIsTermsModalOpen(true);
  };

  const handleTermsAccept = () => {
    setIsTermsModalOpen(false);
    // Redirect to Google OAuth
    window.location.href = "/api/auth/google";
  };

  const handleTermsClose = () => {
    setIsTermsModalOpen(false);
  };

  return {
    isTermsModalOpen,
    handleGoogleSignIn,
    handleTermsAccept,
    handleTermsClose,
  };
}