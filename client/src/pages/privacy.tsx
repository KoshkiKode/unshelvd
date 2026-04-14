import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import ExternalLink from "@/components/external-link";

export default function PrivacyPolicy() {
  return (
    <div className="container mx-auto max-w-3xl px-4 py-8">
      <Link href="/">
        <Button variant="ghost" size="sm" className="mb-6 text-muted-foreground">
          <ArrowLeft className="h-4 w-4 mr-1" /> Home
        </Button>
      </Link>

      <h1 className="font-serif text-3xl font-bold mb-2">Privacy Policy</h1>
      <p className="text-sm text-muted-foreground mb-8">Last updated: April 2026</p>

      <div className="prose prose-sm max-w-none space-y-6 text-sm leading-relaxed text-muted-foreground">

        <section>
          <h2 className="font-serif text-lg font-semibold text-foreground mb-2">1. Who We Are</h2>
          <p>
            Unshelv'd ("we", "us", "our") is a peer-to-peer book marketplace operated by KoshkiKode LLC.
            Our website is <ExternalLink href="https://unshelvd.koshkikode.com" className="text-primary underline">unshelvd.koshkikode.com</ExternalLink>.
            If you have questions about this policy, message us through the app.
          </p>
        </section>

        <section>
          <h2 className="font-serif text-lg font-semibold text-foreground mb-2">2. What We Collect</h2>
          <p className="mb-2">When you use Unshelv'd, we may collect:</p>
          <ul className="list-disc list-inside space-y-1">
            <li><strong className="text-foreground">Account information</strong> — username, display name, email address, password (bcrypt-hashed).</li>
            <li><strong className="text-foreground">Profile information</strong> — bio, location, avatar image (optional).</li>
            <li><strong className="text-foreground">Book listings</strong> — title, author, condition, price, photos, and other details you enter.</li>
            <li><strong className="text-foreground">Transaction data</strong> — purchase/sale records, shipping information, payment provider references (we never store full card numbers).</li>
            <li><strong className="text-foreground">Messages</strong> — direct messages exchanged between users on the platform.</li>
            <li><strong className="text-foreground">Usage data</strong> — standard server logs (IP address, browser type, pages visited) for security and debugging.</li>
          </ul>
        </section>

        <section>
          <h2 className="font-serif text-lg font-semibold text-foreground mb-2">3. How We Use Your Data</h2>
          <ul className="list-disc list-inside space-y-1">
            <li>To operate the marketplace (listings, purchases, messaging, offers).</li>
            <li>To process payments via Stripe Connect and PayPal.</li>
            <li>To send transactional emails (offers, shipping updates, password resets).</li>
            <li>To prevent fraud and enforce our Terms of Service.</li>
            <li>To improve the platform and fix bugs.</li>
          </ul>
          <p className="mt-2">We do not sell your personal data to third parties.</p>
        </section>

        <section>
          <h2 className="font-serif text-lg font-semibold text-foreground mb-2">4. Payment Processors</h2>
          <p>
            Payments are processed by <strong className="text-foreground">Stripe</strong> and optionally <strong className="text-foreground">PayPal</strong>.
            We never see or store your full card number. Stripe and PayPal have their own privacy policies —
            please review them before transacting:
          </p>
          <ul className="list-disc list-inside space-y-1 mt-2">
            <li><ExternalLink href="https://stripe.com/privacy" className="text-primary underline">Stripe Privacy Policy</ExternalLink></li>
            <li><ExternalLink href="https://www.paypal.com/webapps/mpp/ua/privacy-full" className="text-primary underline">PayPal Privacy Policy</ExternalLink></li>
          </ul>
        </section>

        <section>
          <h2 className="font-serif text-lg font-semibold text-foreground mb-2">5. Data Sharing</h2>
          <p>
            We share limited data only as necessary to operate the platform:
          </p>
          <ul className="list-disc list-inside space-y-1 mt-2">
            <li>Your display name and rating are visible to other users.</li>
            <li>Your shipping address (if provided during a transaction) is shared with the seller for that transaction only.</li>
            <li>We use Google Cloud (hosting) and Amazon SES (email) — both process data under data processing agreements.</li>
          </ul>
        </section>

        <section>
          <h2 className="font-serif text-lg font-semibold text-foreground mb-2">6. Cookies and Storage</h2>
          <p>
            We use a session cookie to keep you logged in. We also store your UI theme preference
            (light/dark) in localStorage. We do not use tracking cookies or third-party ad cookies
            beyond the optional Google AdSense unit (which sets its own cookies for ad personalisation —
            you can opt out via Google's ad settings).
          </p>
        </section>

        <section>
          <h2 className="font-serif text-lg font-semibold text-foreground mb-2">7. Your Rights (GDPR / CCPA)</h2>
          <p>You have the right to:</p>
          <ul className="list-disc list-inside space-y-1 mt-2">
            <li><strong className="text-foreground">Access</strong> — request a copy of the data we hold about you.</li>
            <li><strong className="text-foreground">Rectification</strong> — correct inaccurate data via your account settings.</li>
            <li><strong className="text-foreground">Erasure</strong> — delete your account from <Link href="/dashboard/settings" className="text-primary underline">Account Settings</Link>. This anonymises your personal data while preserving transaction records required for accounting.</li>
            <li><strong className="text-foreground">Portability</strong> — request an export of your data by messaging us through the app.</li>
            <li><strong className="text-foreground">Object</strong> — opt out of any non-essential data processing by contacting us.</li>
          </ul>
        </section>

        <section>
          <h2 className="font-serif text-lg font-semibold text-foreground mb-2">8. Data Retention</h2>
          <p>
            We retain account data for as long as your account is active. Deleted accounts are anonymised
            immediately (personal fields are cleared). Transaction records are kept for 7 years to comply
            with financial regulations.
          </p>
        </section>

        <section>
          <h2 className="font-serif text-lg font-semibold text-foreground mb-2">9. Security</h2>
          <p>
            Passwords are hashed with bcrypt (12 rounds). All data in transit is encrypted via TLS.
            We use rate limiting, input validation, and HTTP security headers. No security system is
            perfect — please use a strong, unique password.
          </p>
        </section>

        <section>
          <h2 className="font-serif text-lg font-semibold text-foreground mb-2">10. Changes to This Policy</h2>
          <p>
            We may update this policy from time to time. The "last updated" date at the top of this page
            will change when we do. Continued use of the platform after changes constitutes acceptance.
          </p>
        </section>

      </div>
    </div>
  );
}
