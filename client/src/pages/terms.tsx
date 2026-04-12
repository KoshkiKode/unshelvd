import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";

export default function TermsOfService() {
  return (
    <div className="container mx-auto max-w-3xl px-4 py-8">
      <Link href="/">
        <Button variant="ghost" size="sm" className="mb-6 text-muted-foreground">
          <ArrowLeft className="h-4 w-4 mr-1" /> Home
        </Button>
      </Link>

      <h1 className="font-serif text-3xl font-bold mb-2">Terms of Service</h1>
      <p className="text-sm text-muted-foreground mb-8">Last updated: April 2026</p>

      <div className="prose prose-sm max-w-none space-y-6 text-sm leading-relaxed text-muted-foreground">

        <section>
          <h2 className="font-serif text-lg font-semibold text-foreground mb-2">1. Acceptance</h2>
          <p>
            By creating an account or using Unshelv'd you agree to these Terms of Service ("Terms").
            If you do not agree, do not use the platform. These Terms form a binding agreement between
            you and KoshkiKode LLC ("we", "us").
          </p>
        </section>

        <section>
          <h2 className="font-serif text-lg font-semibold text-foreground mb-2">2. Eligibility</h2>
          <p>
            You must be at least 16 years old to use Unshelv'd. By registering, you represent that you
            meet this requirement. Accounts are personal and non-transferable.
          </p>
        </section>

        <section>
          <h2 className="font-serif text-lg font-semibold text-foreground mb-2">3. The Marketplace</h2>
          <p>
            Unshelv'd is a peer-to-peer marketplace. We facilitate transactions between buyers and sellers
            but are not a party to any sale. We do not own or hold inventory. Sellers are solely responsible
            for the accuracy of their listings and the condition of items they ship.
          </p>
        </section>

        <section>
          <h2 className="font-serif text-lg font-semibold text-foreground mb-2">4. Listings and Content</h2>
          <p className="mb-2">When you list a book you represent that:</p>
          <ul className="list-disc list-inside space-y-1">
            <li>You own the item or have the right to sell it.</li>
            <li>The description (condition, edition, language, photos) is accurate.</li>
            <li>The item is not stolen, counterfeit, or prohibited.</li>
          </ul>
          <p className="mt-2">
            We reserve the right to remove any listing that violates these Terms without notice.
          </p>
        </section>

        <section>
          <h2 className="font-serif text-lg font-semibold text-foreground mb-2">5. Payments and Fees</h2>
          <p className="mb-2">
            Unshelv'd charges a platform fee on each completed sale (currently 10%, subject to change).
            Fees are deducted before the seller payout is transferred.
          </p>
          <p>
            Payments are processed by Stripe Connect and/or PayPal. Funds are held in escrow from the
            time of purchase until the buyer confirms delivery. By using payments you agree to the terms
            of the relevant payment processor.
          </p>
        </section>

        <section>
          <h2 className="font-serif text-lg font-semibold text-foreground mb-2">6. Buyer Protection</h2>
          <p>
            Buyers may open a dispute for any transaction in "paid" or "shipped" status. Disputes are
            reviewed manually. If a seller fails to ship or ships an item materially different from the
            listing, we will issue a refund at our discretion. Disputes must be opened within 30 days
            of payment.
          </p>
        </section>

        <section>
          <h2 className="font-serif text-lg font-semibold text-foreground mb-2">7. Seller Obligations</h2>
          <ul className="list-disc list-inside space-y-1">
            <li>Ship items within 5 business days of payment confirmation.</li>
            <li>Provide accurate tracking information when available.</li>
            <li>Package items appropriately to prevent damage in transit.</li>
            <li>Communicate promptly with buyers through the platform's messaging system.</li>
          </ul>
        </section>

        <section>
          <h2 className="font-serif text-lg font-semibold text-foreground mb-2">8. Prohibited Uses</h2>
          <p>You may not:</p>
          <ul className="list-disc list-inside space-y-1 mt-2">
            <li>List counterfeit, illegal, or stolen books.</li>
            <li>Conduct transactions outside the platform to avoid fees.</li>
            <li>Create multiple accounts or impersonate other users.</li>
            <li>Harass, spam, or abuse other users through messages.</li>
            <li>Attempt to hack, scrape, or disrupt the platform.</li>
            <li>Use the platform for money laundering or fraud.</li>
          </ul>
        </section>

        <section>
          <h2 className="font-serif text-lg font-semibold text-foreground mb-2">9. Account Suspension and Termination</h2>
          <p>
            We may suspend or terminate your account at any time for violations of these Terms,
            suspected fraud, or any other reason at our sole discretion. Suspended accounts may
            not receive pending payouts until the matter is resolved.
          </p>
          <p className="mt-2">
            You may delete your account at any time from your Account Settings. Transaction records
            are retained for compliance purposes even after account deletion.
          </p>
        </section>

        <section>
          <h2 className="font-serif text-lg font-semibold text-foreground mb-2">10. Intellectual Property</h2>
          <p>
            You retain ownership of content you upload (photos, descriptions). By uploading, you grant
            us a non-exclusive, royalty-free licence to display that content on the platform. We own
            the platform code, design, and brand.
          </p>
        </section>

        <section>
          <h2 className="font-serif text-lg font-semibold text-foreground mb-2">11. Disclaimer of Warranties</h2>
          <p>
            THE PLATFORM IS PROVIDED "AS IS" WITHOUT WARRANTIES OF ANY KIND. WE DO NOT GUARANTEE
            UPTIME, ACCURACY OF LISTINGS, OR OUTCOMES OF TRANSACTIONS. USE AT YOUR OWN RISK.
          </p>
        </section>

        <section>
          <h2 className="font-serif text-lg font-semibold text-foreground mb-2">12. Limitation of Liability</h2>
          <p>
            TO THE MAXIMUM EXTENT PERMITTED BY LAW, WE SHALL NOT BE LIABLE FOR ANY INDIRECT,
            INCIDENTAL, SPECIAL, OR CONSEQUENTIAL DAMAGES ARISING FROM YOUR USE OF THE PLATFORM.
            OUR TOTAL LIABILITY SHALL NOT EXCEED THE FEES PAID BY YOU IN THE 12 MONTHS PRECEDING
            THE CLAIM.
          </p>
        </section>

        <section>
          <h2 className="font-serif text-lg font-semibold text-foreground mb-2">13. Governing Law</h2>
          <p>
            These Terms are governed by the laws of the State of Michigan, where KoshkiKode LLC is registered,
            without regard to conflict-of-law provisions.
          </p>
        </section>

        <section>
          <h2 className="font-serif text-lg font-semibold text-foreground mb-2">14. Changes to Terms</h2>
          <p>
            We may update these Terms at any time. Continued use of the platform after changes are
            posted constitutes acceptance. We will try to notify you of material changes via email or
            an in-app notice.
          </p>
        </section>

        <section>
          <h2 className="font-serif text-lg font-semibold text-foreground mb-2">15. Contact</h2>
          <p>
            Questions about these Terms? Message us through the app or email us at{" "}
            <a href="mailto:legal@koshkikode.com" className="text-primary underline">legal@koshkikode.com</a>.
          </p>
        </section>

      </div>
    </div>
  );
}
