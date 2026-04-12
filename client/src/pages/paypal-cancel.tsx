import { useLocation } from "wouter";
import { XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * PayPal redirects buyers to this page if they cancel checkout.
 */
export default function PayPalCancel() {
  const [, setLocation] = useLocation();

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 text-center px-4">
      <XCircle className="h-14 w-14 text-muted-foreground" />
      <h1 className="font-serif text-2xl font-bold">Payment Cancelled</h1>
      <p className="text-muted-foreground max-w-sm">
        You cancelled the PayPal checkout. Your book is still available — come back whenever you're
        ready.
      </p>
      <div className="flex gap-3">
        <Button variant="outline" onClick={() => setLocation("/browse")}>Browse Books</Button>
        <Button onClick={() => setLocation("/dashboard")}>Go to Dashboard</Button>
      </div>
    </div>
  );
}
