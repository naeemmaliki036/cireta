import Link from "next/link";
import Image from "next/image";

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-white">
      <header className="border-b border-gray-100 px-6 py-4">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <Link href="/">
            <Image src="/images/logo/cireta-colored.png" alt="Cireta" width={120} height={32} className="h-8 w-auto" />
          </Link>
          <Link href="/register" className="text-sm text-gray-500 hover:text-gray-700">Back to Register</Link>
        </div>
      </header>
      <main className="max-w-4xl mx-auto px-6 py-16">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Terms of Service</h1>
        <p className="text-sm text-gray-400 mb-12">Last updated: March 2026</p>

        <div className="prose prose-gray max-w-none space-y-8">
          <section>
            <h2 className="text-xl font-semibold text-gray-900">1. Acceptance of Terms</h2>
            <p className="text-gray-600 leading-relaxed">By accessing or using the Cireta platform ("Platform"), you agree to be bound by these Terms of Service ("Terms"). If you do not agree, do not use the Platform. Cireta reserves the right to modify these Terms at any time. Continued use after changes constitutes acceptance of the revised Terms.</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900">2. Platform Description</h2>
            <p className="text-gray-600 leading-relaxed">Cireta is a regulated tokenization platform that enables the issuance, distribution, and management of security tokens representing real-world assets including gold, copper, and commodity futures on the Base Layer 2 blockchain. The Platform uses ERC-3643 compliant security tokens with full KYC/AML enforcement.</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900">3. Eligibility</h2>
            <p className="text-gray-600 leading-relaxed">You must be at least 18 years old and legally permitted to invest in securities in your jurisdiction. By using the Platform, you represent that you meet all eligibility requirements and that any information you provide is accurate and complete. Residents of sanctioned or restricted jurisdictions may not use the Platform.</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900">4. Account Registration and KYC</h2>
            <p className="text-gray-600 leading-relaxed">To invest through the Platform, you must complete identity verification (KYC) through our third-party provider. You agree to provide truthful and accurate information during this process. Cireta reserves the right to refuse or revoke access if verification fails or fraudulent information is detected. A single KYC verification grants access to all assets on the Platform.</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900">5. Investment Risks</h2>
            <p className="text-gray-600 leading-relaxed">Investments in tokenized real-world assets carry significant risks including but not limited to: market risk, liquidity risk, regulatory risk, smart contract risk, and custody risk. Past performance is not indicative of future results. You should invest only what you can afford to lose. Cireta does not provide investment advice. Consult a qualified financial advisor before investing.</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900">6. Token Ownership and Custody</h2>
            <p className="text-gray-600 leading-relaxed">Security tokens issued on the Platform represent fractional ownership in the underlying asset via a Special Purpose Vehicle (SPV). Token transfers are subject to compliance checks enforced by the ERC-3643 standard. Cireta offers both custodial (platform-managed) and non-custodial (self-custody wallet) options for token holding.</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900">7. Redemption</h2>
            <p className="text-gray-600 leading-relaxed">Token holders may redeem their tokens during designated redemption windows. Redemption may be in cash (at net asset value) or physical delivery of the underlying commodity, subject to minimum quantities and delivery logistics. Redemption terms are specified per asset and disclosed at the time of investment.</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900">8. Fees</h2>
            <p className="text-gray-600 leading-relaxed">The Platform charges fees as disclosed on each investment opportunity, including but not limited to: platform fees, management fees, and transaction fees. Fee schedules are available on each project page. Cireta reserves the right to modify fees with reasonable notice.</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900">9. Prohibited Activities</h2>
            <p className="text-gray-600 leading-relaxed">You may not use the Platform for money laundering, terrorist financing, fraud, market manipulation, or any other illegal activity. You may not attempt to circumvent KYC/AML controls, bypass transfer restrictions, or interfere with the Platform's smart contracts or infrastructure.</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900">10. Limitation of Liability</h2>
            <p className="text-gray-600 leading-relaxed">To the maximum extent permitted by law, Cireta shall not be liable for any indirect, incidental, special, or consequential damages arising from your use of the Platform or any investment made through it. Cireta's total liability shall not exceed the fees paid by you to the Platform in the twelve months preceding the claim.</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900">11. Governing Law</h2>
            <p className="text-gray-600 leading-relaxed">These Terms shall be governed by and construed in accordance with the laws of the jurisdiction in which Cireta is incorporated. Any disputes shall be resolved through binding arbitration in accordance with the rules of the applicable arbitration body.</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900">12. Contact</h2>
            <p className="text-gray-600 leading-relaxed">For questions about these Terms, contact us at <a href="mailto:legal@cireta.com" className="text-darkAqua hover:underline">legal@cireta.com</a>.</p>
          </section>
        </div>
      </main>
    </div>
  );
}
