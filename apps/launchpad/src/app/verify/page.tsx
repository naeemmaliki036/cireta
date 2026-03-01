"use client";

import { motion } from "framer-motion";
import { Navbar, Footer } from "@/components/organisms";
import { SumsubVerification } from "@/components/organisms/SumsubVerification";

export default function VerifyPage() {
  return (
    <div className="min-h-screen bg-box">
      <Navbar variant="light" />
      <div className="pt-32 pb-20 px-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="max-w-2xl mx-auto bg-white rounded-3xl p-8 border border-darkBlack/10"
        >
          <SumsubVerification />
        </motion.div>
      </div>
      <Footer />
    </div>
  );
}
