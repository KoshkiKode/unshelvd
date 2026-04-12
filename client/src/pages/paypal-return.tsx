import { useEffect, useState } from "react";
import { useSearch, useLocation } from "wouter";
import { apiRequest } from "@/lib/queryClient";
import { useQueryClient } from "@tanstack/react-query";
import { CheckCircle, XCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * PayPal redirects buyers to this page after they approve payment.
 * URL looks like: /#/paypal/return?bookId=123&token=ORDER_ID&PayerID=PAYER_ID
 * We capture the order here, then redirect to the dashboard.
 */
export default function PayPalReturn() {
  const search = useSearch();
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();

  const params = new URLSearchParams(search);
  const orderId = params.get("token"); // PayPal appends ?token=ORDER_ID

  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    if (!orderId) {
      setErrorMessage("No PayPal order token found in the URL.");
      setStatus("error");
      return;
    }

    apiRequest("POST", "/api/payments/paypal/capture-order", { orderId })
      .then(async (res) => {
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error((body as any).message || "Capture failed");
        }
        queryClient.invalidateQueries({ queryKey: ["/api/payments/transactions"] });
        setStatus("success");
      })
      .catch((err: Error) => {
        setErrorMessage(err.message || "Something went wrong capturing your payment.");
        setStatus("error");
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderId]);

  if (status === "loading") {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <Loader2 className="h-10 w-10 animate-spin text-primary" />
        <p className="text-lg font-medium">Confirming your payment…</p>
        <p className="text-sm text-muted-foreground">Please wait, this will only take a moment.</p>
      </div>
    );
  }

  if (status === "success") {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 text-center px-4">
        <CheckCircle className="h-14 w-14 text-green-600" />
        <h1 className="font-serif text-2xl font-bold">Purchase Complete!</h1>
        <p className="text-muted-foreground max-w-sm">
          Your PayPal payment was successful. The seller has been notified and will ship your book
          soon. Your payment is held securely — you'll release it once the book arrives.
        </p>
        <Button onClick={() => setLocation("/dashboard")}>View My Purchases</Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 text-center px-4">
      <XCircle className="h-14 w-14 text-destructive" />
      <h1 className="font-serif text-2xl font-bold">Payment Failed</h1>
      <p className="text-muted-foreground max-w-sm">{errorMessage}</p>
      <div className="flex gap-3">
        <Button variant="outline" onClick={() => setLocation("/browse")}>Browse Books</Button>
        <Button onClick={() => setLocation("/dashboard")}>Go to Dashboard</Button>
      </div>
    </div>
  );
}
