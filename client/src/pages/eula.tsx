import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";

export default function EndUserLicenseAgreement() {
  return (
    <div className="container mx-auto max-w-3xl px-4 py-8">
      <Link href="/">
        <Button variant="ghost" size="sm" className="mb-6 text-muted-foreground">
          <ArrowLeft className="h-4 w-4 mr-1" /> Home
        </Button>
      </Link>

      <h1 className="font-serif text-3xl font-bold mb-2">End User License Agreement (EULA)</h1>
      <p className="text-sm text-muted-foreground mb-8">Last updated: April 2026</p>

      <div className="prose prose-sm max-w-none space-y-6 text-sm leading-relaxed text-muted-foreground">
        <section>
          <h2 className="font-serif text-lg font-semibold text-foreground mb-2">1. License Grant</h2>
          <p>
            We grant you a limited, non-exclusive, non-transferable, revocable license to use
            Unshelv&apos;d on supported devices for personal or internal business use, subject to this
            EULA and our Terms of Service.
          </p>
        </section>

        <section>
          <h2 className="font-serif text-lg font-semibold text-foreground mb-2">2. Ownership</h2>
          <p>
            Unshelv&apos;d, including software, design, branding, and related content (excluding user
            content), is owned by KoshkiKode LLC and protected by intellectual property laws.
          </p>
        </section>

        <section>
          <h2 className="font-serif text-lg font-semibold text-foreground mb-2">3. Restrictions</h2>
          <ul className="list-disc list-inside space-y-1">
            <li>You may not reverse engineer, decompile, or modify the app except where required by law.</li>
            <li>You may not use the app to violate laws, platform rules, or third-party rights.</li>
            <li>You may not bypass payment flows, abuse APIs, or disrupt service operations.</li>
          </ul>
        </section>

        <section>
          <h2 className="font-serif text-lg font-semibold text-foreground mb-2">4. Payments and Platform Role</h2>
          <p>
            Unshelv&apos;d acts as a small middleman between buyers and sellers and takes a per-transaction
            platform percentage. The current platform fee is 10%, and our target is to reduce it
            over time to 5% per transaction as the platform scales.
          </p>
        </section>

        <section>
          <h2 className="font-serif text-lg font-semibold text-foreground mb-2">5. Updates and Availability</h2>
          <p>
            We may update, improve, suspend, or discontinue features at any time. Some functionality
            may require internet access or third-party service availability.
          </p>
        </section>

        <section>
          <h2 className="font-serif text-lg font-semibold text-foreground mb-2">6. Disclaimer and Limitation</h2>
          <p>
            THE APP IS PROVIDED &quot;AS IS&quot; WITHOUT WARRANTIES OF ANY KIND. TO THE MAXIMUM EXTENT
            PERMITTED BY LAW, WE ARE NOT LIABLE FOR INDIRECT OR CONSEQUENTIAL DAMAGES ARISING
            FROM USE OF THE APP.
          </p>
        </section>

        <section>
          <h2 className="font-serif text-lg font-semibold text-foreground mb-2">7. Termination</h2>
          <p>
            This license ends automatically if you violate this EULA. We may suspend or terminate
            access as described in the Terms of Service.
          </p>
        </section>

        <section>
          <h2 className="font-serif text-lg font-semibold text-foreground mb-2">8. Contact</h2>
          <p>
            Questions about this EULA can be sent to{" "}
            <a href="mailto:legal@koshkikode.com" className="text-primary underline">legal@koshkikode.com</a>.
          </p>
        </section>
      </div>
    </div>
  );
}
