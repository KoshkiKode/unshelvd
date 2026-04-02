import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { CreditCard, Shield, Loader2, CheckCircle, Package } from "lucide-react";
import type { Book } from "@shared/schema";

const PLATFORM_FEE = 0.05; // 5%

interface CheckoutDialogProps {
  book: Book & { seller?: { displayName: string } };
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function CheckoutDialog({ book, open, onOpenChange }: CheckoutDialogProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [step, setStep] = useState<"review" | "processing" | "success">("review");

  const price = book.price || 0;
  const fee = Math.round(price * PLATFORM_FEE * 100) / 100;
  const total = price;

  const checkoutMutation = useMutation({
    mutationFn: async () => {
      // 1. Create payment intent
      const res = await apiRequest("POST", "/api/payments/checkout", { bookId: book.id });
      const data = await res.json();
      
      // 2. If Stripe is configured, it would redirect to Stripe Elements here
      // For now (dev mode), auto-confirm the payment
      if (!data.clientSecret) {
        // Dev mode — auto confirm
        await apiRequest("POST", `/api/payments/${data.transactionId}/confirm`);
      }
      
      return data;
    },
    onSuccess: () => {
      setStep("success");
      queryClient.invalidateQueries({ queryKey: [`/api/books/${book.id}`] });
      queryClient.invalidateQueries({ queryKey: ["/api/payments/transactions"] });
    },
    onError: (err: Error) => {
      toast({ title: "Payment failed", description: err.message, variant: "destructive" });
      setStep("review");
    },
  });

  const handleCheckout = () => {
    setStep("processing");
    checkoutMutation.mutate();
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) setStep("review"); }}>
      <DialogContent className="max-w-md" data-testid="checkout-dialog">
        {step === "review" && (
          <>
            <DialogHeader>
              <DialogTitle className="font-serif">Buy This Book</DialogTitle>
              <DialogDescription>Review your purchase</DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4">
              {/* Book info */}
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
                </div>
              </div>

              {/* Price breakdown */}
              <div className="border rounded-lg p-3 space-y-2 text-sm">
                <div className="flex justify-between">
                  <span>Book price</span>
                  <span>${price.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-muted-foreground text-xs">
                  <span>Platform fee (5%)</span>
                  <span>${fee.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>Seller receives</span>
                  <span>${(price - fee).toFixed(2)}</span>
                </div>
                <div className="border-t pt-2 flex justify-between font-medium">
                  <span>Total</span>
                  <span className="text-primary">${total.toFixed(2)}</span>
                </div>
              </div>

              <div className="flex items-start gap-2 text-xs text-muted-foreground bg-muted/50 rounded-lg p-3">
                <Shield className="h-4 w-4 flex-shrink-0 mt-0.5" />
                <p>Your payment is held securely until you confirm receipt of the book. If there's an issue, you can open a dispute.</p>
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
              <Button onClick={handleCheckout} className="gap-2" data-testid="confirm-purchase-btn">
                <CreditCard className="h-4 w-4" />
                Pay ${total.toFixed(2)}
              </Button>
            </DialogFooter>
          </>
        )}

        {step === "processing" && (
          <div className="py-12 text-center">
            <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary mb-4" />
            <p className="font-medium">Processing payment...</p>
            <p className="text-sm text-muted-foreground">This will only take a moment</p>
          </div>
        )}

        {step === "success" && (
          <div className="py-12 text-center">
            <CheckCircle className="h-12 w-12 text-green-600 mx-auto mb-4" />
            <p className="font-serif text-xl font-medium mb-2">Purchase Complete</p>
            <p className="text-sm text-muted-foreground mb-4">
              The seller has been notified. They'll ship your book and provide tracking info.
            </p>
            <Button onClick={() => onOpenChange(false)}>Done</Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
