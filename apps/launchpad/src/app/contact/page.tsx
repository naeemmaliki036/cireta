import { Mail, Clock, MessageSquare, MapPin } from "lucide-react";
import { Navbar, Footer } from "@/components/organisms";

export default function ContactPage() {
  return (
    <div className="min-h-screen bg-white flex flex-col">
      <Navbar variant="light" />

      <main className="flex-1 max-w-4xl mx-auto px-6 py-16 pt-24">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Contact Us</h1>
        <p className="text-gray-500 mb-12">We&apos;re here to help. Reach out through any of the channels below.</p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-12">
          <div className="p-6 rounded-2xl border border-gray-100 hover:border-gray-200 transition-colors">
            <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center mb-4">
              <Mail className="h-5 w-5 text-blue-600" />
            </div>
            <h2 className="font-semibold text-gray-900 mb-1">General Support</h2>
            <a href="mailto:support@cireta.com" className="text-sm text-blue-600 hover:underline">support@cireta.com</a>
            <p className="text-xs text-gray-400 mt-2">For account issues, KYC help, and general questions</p>
          </div>

          <div className="p-6 rounded-2xl border border-gray-100 hover:border-gray-200 transition-colors">
            <div className="w-10 h-10 rounded-xl bg-teal-50 flex items-center justify-center mb-4">
              <MessageSquare className="h-5 w-5 text-teal-600" />
            </div>
            <h2 className="font-semibold text-gray-900 mb-1">OTC & Large Allocations</h2>
            <a href="mailto:otc@cireta.com" className="text-sm text-teal-600 hover:underline">otc@cireta.com</a>
            <p className="text-xs text-gray-400 mt-2">For purchases over $50,000 and OTC desk inquiries</p>
          </div>

          <div className="p-6 rounded-2xl border border-gray-100 hover:border-gray-200 transition-colors">
            <div className="w-10 h-10 rounded-xl bg-purple-50 flex items-center justify-center mb-4">
              <Clock className="h-5 w-5 text-purple-600" />
            </div>
            <h2 className="font-semibold text-gray-900 mb-1">Response Time</h2>
            <p className="text-sm text-gray-600 font-medium">Within 24 hours</p>
            <p className="text-xs text-gray-400 mt-2">For urgent matters, email with subject line &quot;URGENT&quot;</p>
          </div>

          <div className="p-6 rounded-2xl border border-gray-100 hover:border-gray-200 transition-colors">
            <div className="w-10 h-10 rounded-xl bg-amber-50 flex items-center justify-center mb-4">
              <MapPin className="h-5 w-5 text-amber-600" />
            </div>
            <h2 className="font-semibold text-gray-900 mb-1">Issuer Partnerships</h2>
            <a href="mailto:issuers@cireta.com" className="text-sm text-amber-600 hover:underline">issuers@cireta.com</a>
            <p className="text-xs text-gray-400 mt-2">For asset issuers looking to tokenize on Cireta</p>
          </div>
        </div>

        <div className="bg-gray-50 rounded-2xl p-8 text-center">
          <h2 className="font-semibold text-gray-900 mb-2">Need to change your buyer type?</h2>
          <p className="text-sm text-gray-500 max-w-md mx-auto">
            If you selected the wrong buyer type during onboarding (individual vs corporate),
            email <a href="mailto:support@cireta.com" className="text-blue-600 hover:underline">support@cireta.com</a> with
            your registered email and the correct type. Our team will assist you.
          </p>
        </div>
      </main>

      <Footer />
    </div>
  );
}
