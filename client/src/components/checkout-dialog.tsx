import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { CreditCard, Shield, Loader2, CheckCircle, Package, Lock } from "lucide-react";
import type { Book } from "@shared/schema";
import { loadStripe } from "@stripe/stripe-js";
import { Elements, PaymentElement, useStripe, useElements } from "@stripe/react-stripe-js";

const PLATFORM_FEE = 0.10;

const stripeKey = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY;
const stripePromise = stripeKey ? loadStripe(stripeKey) : null;

interface CheckoutDialogProps {
  book: Book & { seller?: { displayName: string } };
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// Inner form — must live inside <Elements> provider so it can call useStripe/useElements
interface StripePaymentFormProps {
  total: number;
  transactionId: number;
  onSuccess: () => void;
  onError: (message: string) => void;
  onBack: () => void;
}

function StripePaymentForm({ total, transactionId, onSuccess, onError, onBack }: StripePaymentFormProps) {
  const stripe = useStripe();
  const elements = useElements();
  const [processing, setProcessing] = useState(false);

  const handleSubmit = async () => {
    if (!stripe || !elements) return;
    setProcessing(true);

    const { error } = await stripe.confirmPayment({
      elements,
      confirmParams: {
        return_url: `${window.location.origin}/#/dashboard`,
      },
      redirect: "if_required",
    });

    if (error) {
      onError(error.message ?? "Payment failed");
      setProcessing(false);
      return;
    }

    try {
      await apiRequest("POST", `/api/payments/${transactionId}/confirm`);
      onSuccess();
    } catch (err: any) {
      onError(err.message ?? "Failed to confirm payment");
      setProcessing(false);
    }
  };

  return (
    <div className="space-y-4">
      <PaymentElement options={{ layout: "tabs" }} />
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Lock className="h-3 w-3" />
        <span>Secured by Stripe — your card details are never stored by us</span>
      </div>
      <div className="flex gap-2 pt-1">
        <Button variant="outline" onClick={onBack} disabled={processing} className="flex-1">
          Back
        </Button>
        <Button onClick={handleSubmit} disabled={processing || !stripe || !elements} className="flex-1 gap-2">
          {processing ? <Loader2 className="h-4 w-4 animate-spin" /> : <CreditCard className="h-4 w-4" />}
          Pay ${total.toFixed(2)}
        </Button>
      </div>
    </div>
  );
}

export default function CheckoutDialog({ book, open, onOpenChange }: CheckoutDialogProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [step, setStep] = useState<"review" | "payment" | "processing" | "success">("review");
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [transactionId, setTransactionId] = useState<number | null>(null);

  const price = book.price || 0;
  const fee = Math.round(price * PLATFORM_FEE * 100) / 100;
  const total = price;

  const handleClose = (v: boolean) => {
    onOpenChange(v);
    if (!v) {
      setStep("review");
      setClientSecret(null);
      setTransactionId(null);
    }
  };

  const checkoutMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/payments/checkout", { bookId: book.id });
      return await res.json();
    },
    onSuccess: (data) => {
      setTransactionId(data.transactionId);
      if (data.clientSecret && data.stripeConfigured) {
        setClientSecret(data.clientSecret);
        setStep("payment");
      } else {
        // Dev / no-Stripe mode — auto-confirm immediately
        setStep("processing");
        apiRequest("POST", `/api/payments/${data.transactionId}/confirm`)
          .then(() => {
            setStep("success");
            queryClient.invalidateQueries({ queryKey: [`/api/books/${book.id}`] });
            queryClient.invalidateQueries({ queryKey: ["/api/payments/transactions"] });
          })
          .catch((err) => {
            toast({ title: "Payment failed", description: err.message, variant: "destructive" });
            setStep("review");
          });
      }
    },
    onError: (err: Error) => {
      toast({ title: "Checkout failed", description: err.message, variant: "destructive" });
    },
  });

  const handlePaymentSuccess = () => {
    setStep("success");
    queryClient.invalidateQueries({ queryKey: [`/api/books/${book.id}`] });
    queryClient.invalidateQueries({ queryKey: ["/api/payments/transactions"] });
  };

  const handlePaymentError = (message: string) => {
    toast({ title: "Payment failed", description: message, variant: "destructive" });
    setStep("payment");
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-md" data-testid="checkout-dialog">

        {/* Step 1 — Review order */}
        {step === "review" && (
          <>
            <DialogHeader>
              <DialogTitle className="font-serif">Buy This Book</DialogTitle>
              <DialogDescription>Review your order before paying</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="flex gap-3">
                {book.coverUrl ? (
                  <img src={book.coverUrl} alt="" className="w-16 h-24 object-cover rounded" />
                ) : (
                  <div className="w-16 h-24 bg-muted rounded flex items-center justify-center">
                    <Package className="h-6 w-6 text-muted-foreground" />
                  </div>
                )}
                <div>
                  <p className="font-serif font-medium">{book.title}</p>
                  <p className="text-sm text-muted-foreground">{book.author}</p>
                  <p className="text-xs text-muted-foreground capitalize mt-1">{book.condition} condition</p>
                  {book.seller?.displayName && (
                    <p className="text-xs text-muted-foreground mt-0.5">Sold by {book.seller.displayName}</p>
                  )}
                </div>
              </div>

              <div className="border rounded-lg p-3 space-y-2 text-sm">
                <div className="flex justify-between">
                  <span>Book price</span>
                  <span>${price.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-muted-foreground text-xs">
                  <span>Platform fee (10%)</span>
                  <span>${fee.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>Seller receives</span>
                  <span>${(price - fee).toFixed(2)}</span>
                </div>
                <div className="border-t pt-2 flex justify-between font-semibold">
                  <span>You pay today</span>
                  <span className="text-primary">${total.toFixed(2)}</span>
                </div>
              </div>

              <div className="flex items-start gap-2 text-xs text-muted-foreground bg-muted/50 rounded-lg p-3">
                <Shield className="h-4 w-4 flex-shrink-0 mt-0.5 text-green-600" />
                <p>Your payment is held securely in escrow until you confirm the book arrived. If there's an issue, contact us to open a dispute.</p>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => handleClose(false)}>Cancel</Button>
              <Button
                onClick={() => checkoutMutation.mutate()}
                disabled={checkoutMutation.isPending}
                className="gap-2"
                data-testid="confirm-purchase-btn"
              >
                {checkoutMutation.isPending
                  ? <Loader2 className="h-4 w-4 animate-spin" />
                  : <CreditCard className="h-4 w-4" />}
                {checkoutMutation.isPending ? "Setting up..." : `Pay $${total.toFixed(2)}`}
              </Button>
            </DialogFooter>
          </>
        )}

        {/* Step 2 — Stripe payment form */}
        {step === "payment" && clientSecret && (
          <>
            <DialogHeader>
              <DialogTitle className="font-serif">Enter Payment Details</DialogTitle>
              <DialogDescription>Secure payment processed by Stripe</DialogDescription>
            </DialogHeader>
            <div className="py-4">
              {stripePromise ? (
                <Elements
                  stripe={stripePromise}
                  options={{
                    clientSecret,
                    appearance: { theme: "stripe", variables: { borderRadius: "8px" } },
                  }}
                >
                  <StripePaymentForm
                    total={total}
                    transactionId={transactionId!}
                    onSuccess={handlePaymentSuccess}
                    onError={handlePaymentError}
                    onBack={() => setStep("review")}
                  />
                </Elements>
              ) : (
                <div className="text-center py-6 text-sm text-muted-foreground">
                  Stripe is not configured. Contact support.
                </div>
              )}
            </div>
          </>
        )}

        {/* Step 3 — Processing */}
        {step === "processing" && (
          <div className="py-12 text-center">
            <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary mb-4" />
            <p className="font-medium">Processing payment...</p>
            <p className="text-sm text-muted-foreground">This will only take a moment</p>
          </div>
        )}

        {/* Step 4 — Success */}
        {step === "success" && (
          <div className="py-12 text-center">
            <CheckCircle className="h-12 w-12 text-green-600 mx-auto mb-4" />
            <p className="font-serif text-xl font-medium mb-2">Purchase Complete!</p>
            <p className="text-sm text-muted-foreground mb-6">
              The seller has been notified and will ship your book soon.
              Your payment is held securely — you'll release it once the book arrives.
            </p>
            <Button onClick={() => handleClose(false)}>View My Purchases</Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
