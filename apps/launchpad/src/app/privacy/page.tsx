import Link from "next/link";
import Image from "next/image";

export default function PrivacyPage() {
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
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Privacy Policy</h1>
        <p className="text-sm text-gray-400 mb-12">Last updated: March 2026</p>

        <div className="prose prose-gray max-w-none space-y-8">
          <section>
            <h2 className="text-xl font-semibold text-gray-900">1. Introduction</h2>
            <p className="text-gray-600 leading-relaxed">Cireta ("we", "us", "our") is committed to protecting your personal data. This Privacy Policy explains how we collect, use, store, and protect your information when you use the Cireta platform ("Platform"). By using the Platform, you consent to the practices described in this policy.</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900">2. Information We Collect</h2>
            <p className="text-gray-600 leading-relaxed mb-3">We collect the following categories of personal data:</p>
            <ul className="list-disc pl-6 text-gray-600 space-y-2">
              <li><strong>Account Information:</strong> Name, email address, and display name provided during registration.</li>
              <li><strong>Identity Verification (KYC):</strong> Government-issued ID, selfie, proof of address, date of birth, nationality, and country of residence — processed by our third-party KYC provider (Sumsub).</li>
              <li><strong>Financial Information:</strong> Investment amounts, transaction history, wallet addresses, and payment method details.</li>
              <li><strong>Blockchain Data:</strong> On-chain wallet addresses, transaction hashes, and token balances (publicly visible on the blockchain).</li>
              <li><strong>Technical Data:</strong> IP address, browser type, device information, and usage analytics.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900">3. How We Use Your Information</h2>
            <ul className="list-disc pl-6 text-gray-600 space-y-2">
              <li>To verify your identity and comply with KYC/AML regulations.</li>
              <li>To process investments, redemptions, and distributions.</li>
              <li>To manage your account and provide customer support.</li>
              <li>To send transactional emails (verification codes, investment confirmations, KYC status updates).</li>
              <li>To detect and prevent fraud, money laundering, and other illegal activities.</li>
              <li>To comply with legal and regulatory obligations.</li>
              <li>To improve the Platform and develop new features.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900">4. Data Storage and Security</h2>
            <p className="text-gray-600 leading-relaxed">All sensitive personal data (KYC IDs, wallet addresses, API tokens) is encrypted at rest using AES-256 encryption. We use industry-standard security measures including HTTPS, OWASP-compliant security headers, rate limiting, and brute force protection. KYC data is processed by Sumsub and stored in accordance with their security standards.</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900">5. Data Sharing</h2>
            <p className="text-gray-600 leading-relaxed mb-3">We do not sell your personal data. We share information only with:</p>
            <ul className="list-disc pl-6 text-gray-600 space-y-2">
              <li><strong>KYC Provider (Sumsub):</strong> For identity verification and AML screening.</li>
              <li><strong>Blockchain Networks:</strong> Transaction data is recorded on-chain and is publicly visible.</li>
              <li><strong>Custodians and Auditors:</strong> To manage physical asset custody and compliance audits.</li>
              <li><strong>Regulatory Authorities:</strong> When required by law or court order.</li>
              <li><strong>Service Providers:</strong> Cloud hosting (Google Cloud), email delivery (Resend), and analytics — all bound by data processing agreements.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900">6. Your Rights</h2>
            <p className="text-gray-600 leading-relaxed mb-3">Depending on your jurisdiction, you may have the right to:</p>
            <ul className="list-disc pl-6 text-gray-600 space-y-2">
              <li>Access the personal data we hold about you.</li>
              <li>Request correction of inaccurate data.</li>
              <li>Request deletion of your data (subject to legal retention requirements).</li>
              <li>Object to processing of your data for certain purposes.</li>
              <li>Request data portability.</li>
              <li>Withdraw consent at any time (where processing is based on consent).</li>
            </ul>
            <p className="text-gray-600 leading-relaxed mt-3">To exercise any of these rights, contact us at <a href="mailto:privacy@cireta.com" className="text-darkAqua hover:underline">privacy@cireta.com</a>.</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900">7. Data Retention</h2>
            <p className="text-gray-600 leading-relaxed">We retain your personal data for as long as your account is active and for a minimum of 5 years after account closure to comply with regulatory record-keeping requirements. KYC data is retained in accordance with applicable anti-money laundering regulations. You may request deletion of non-regulatory data at any time.</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900">8. Cookies</h2>
            <p className="text-gray-600 leading-relaxed">We use essential cookies for authentication (httpOnly session cookies) and optional analytics cookies. Essential cookies cannot be disabled as they are required for the Platform to function. You can manage analytics cookie preferences in your browser settings.</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900">9. International Transfers</h2>
            <p className="text-gray-600 leading-relaxed">Your data may be transferred to and processed in countries outside your country of residence, including the United States (cloud hosting) and the European Union (KYC processing). We ensure appropriate safeguards are in place for all international data transfers.</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900">10. Changes to This Policy</h2>
            <p className="text-gray-600 leading-relaxed">We may update this Privacy Policy from time to time. We will notify you of material changes via email or a prominent notice on the Platform. Continued use after changes constitutes acceptance.</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900">11. Contact</h2>
            <p className="text-gray-600 leading-relaxed">For questions about this Privacy Policy or to exercise your data rights, contact our Data Protection Officer at <a href="mailto:privacy@cireta.com" className="text-darkAqua hover:underline">privacy@cireta.com</a>.</p>
          </section>
        </div>
      </main>
    </div>
  );
}
