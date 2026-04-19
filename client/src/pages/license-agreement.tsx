import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";

export default function LicenseAgreement() {
  return (
    <div className="container mx-auto max-w-3xl px-4 py-8">
      <Link href="/">
        <Button variant="ghost" size="sm" className="mb-6 text-muted-foreground">
          <ArrowLeft className="h-4 w-4 mr-1" /> Home
        </Button>
      </Link>

      <h1 className="font-serif text-3xl font-bold mb-2">Platform License Agreement</h1>
      <p className="text-sm text-muted-foreground mb-8">Last updated: April 2026</p>

      <div className="prose prose-sm max-w-none space-y-6 text-sm leading-relaxed text-muted-foreground">
        <section>
          <h2 className="font-serif text-lg font-semibold text-foreground mb-2">1. Agreement Scope</h2>
          <p>
            This License Agreement governs your right to access and use the Unshelv&apos;d platform on web,
            desktop, and mobile distributions. By using any version, you agree to this agreement.
          </p>
        </section>

        <section>
          <h2 className="font-serif text-lg font-semibold text-foreground mb-2">2. Service Model</h2>
          <p>
            Unshelv&apos;d is a marketplace intermediary. We provide the software and transaction rails
            connecting buyers and sellers but do not own listed inventory.
          </p>
        </section>

        <section>
          <h2 className="font-serif text-lg font-semibold text-foreground mb-2">3. Transaction Percentage</h2>
          <p>
            Unshelv&apos;d currently takes a 10% percentage per completed transaction as a middleman fee.
            Our stated target is to reduce this over time to 5% per transaction as operations scale.
            Any fee updates are published in platform legal pages.
          </p>
        </section>

        <section>
          <h2 className="font-serif text-lg font-semibold text-foreground mb-2">4. User Responsibilities</h2>
          <ul className="list-disc list-inside space-y-1">
            <li>Provide accurate account and listing information.</li>
            <li>Use payment flows and communications only through approved platform channels.</li>
            <li>Comply with applicable laws and marketplace policies.</li>
          </ul>
        </section>

        <section>
          <h2 className="font-serif text-lg font-semibold text-foreground mb-2">5. Suspension and Revocation</h2>
          <p>
            We may suspend accounts or revoke access for fraud, abuse, policy violations, or legal/compliance reasons.
          </p>
        </section>

        <section>
          <h2 className="font-serif text-lg font-semibold text-foreground mb-2">6. Open Source Repository License</h2>
          <p>
            The public Unshelv&apos;d source repository is licensed under MIT. This Platform License Agreement
            governs service usage, while repository source usage remains governed by the MIT license text.
          </p>
        </section>
      </div>
    </div>
  );
}
