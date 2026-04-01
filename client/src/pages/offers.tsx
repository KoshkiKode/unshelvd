import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { apiRequest } from "@/lib/queryClient";
import { Redirect, Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { DollarSign, Check, X, ArrowLeftRight, BookOpen } from "lucide-react";
import { useState } from "react";

const statusColors: Record<string, string> = {
  pending: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400",
  accepted: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
  declined: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
  countered: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
};

export default function Offers() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [counterAmount, setCounterAmount] = useState("");
  const [counteringId, setCounteringId] = useState<number | null>(null);

  const { data, isLoading } = useQuery<{ sent: any[]; received: any[] }>({
    queryKey: ["/api/offers"],
    enabled: !!user,
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, status, counterAmount }: { id: number; status: string; counterAmount?: number }) => {
      await apiRequest("PATCH", `/api/offers/${id}`, {
        status,
        counterAmount: counterAmount || null,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/offers"] });
      toast({ title: "Offer updated" });
      setCounteringId(null);
      setCounterAmount("");
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  if (!user) return <Redirect to="/login" />;

  const OfferCard = ({ offer, type }: { offer: any; type: "sent" | "received" }) => (
    <div className="border rounded-lg p-4 bg-card" data-testid={`offer-${offer.id}`}>
      <div className="flex items-start gap-3">
        <div className="h-12 w-9 rounded bg-muted flex items-center justify-center flex-shrink-0">
          {offer.book?.coverUrl ? (
            <img src={offer.book.coverUrl} alt="" className="h-12 w-9 rounded object-cover" />
          ) : (
            <BookOpen className="h-4 w-4 text-muted-foreground/40" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <Link href={`/book/${offer.bookId}`}>
            <h3 className="font-serif text-sm font-medium hover:underline cursor-pointer">{offer.book?.title}</h3>
          </Link>
          <p className="text-xs text-muted-foreground">{offer.book?.author}</p>

          <div className="flex items-center gap-3 mt-2">
            <span className="text-lg font-bold text-primary">${offer.amount.toFixed(2)}</span>
            <Badge className={`text-[10px] ${statusColors[offer.status] || ""}`}>
              {offer.status}
            </Badge>
          </div>

          {offer.counterAmount && (
            <p className="text-xs text-muted-foreground mt-1">
              Counter: ${offer.counterAmount.toFixed(2)}
            </p>
          )}

          {offer.message && (
            <p className="text-xs text-muted-foreground mt-1 italic">"{offer.message}"</p>
          )}

          <p className="text-xs text-muted-foreground mt-1">
            {type === "sent" ? `To: ${offer.seller?.displayName}` : `From: ${offer.buyer?.displayName}`}
          </p>
        </div>

        {/* Actions for received offers */}
        {type === "received" && offer.status === "pending" && (
          <div className="flex flex-col gap-1">
            <Button
              size="sm"
              variant="default"
              onClick={() => updateMutation.mutate({ id: offer.id, status: "accepted" })}
              disabled={updateMutation.isPending}
              data-testid={`accept-offer-${offer.id}`}
            >
              <Check className="h-3.5 w-3.5 mr-1" />
              Accept
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => updateMutation.mutate({ id: offer.id, status: "declined" })}
              disabled={updateMutation.isPending}
              data-testid={`decline-offer-${offer.id}`}
            >
              <X className="h-3.5 w-3.5 mr-1" />
              Decline
            </Button>
            <Dialog open={counteringId === offer.id} onOpenChange={(open) => setCounteringId(open ? offer.id : null)}>
              <DialogTrigger asChild>
                <Button size="sm" variant="outline" data-testid={`counter-offer-${offer.id}`}>
                  <ArrowLeftRight className="h-3.5 w-3.5 mr-1" />
                  Counter
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle className="font-serif">Counter Offer</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 mt-2">
                  <p className="text-sm text-muted-foreground">
                    Original offer: <strong>${offer.amount.toFixed(2)}</strong>
                  </p>
                  <div>
                    <label className="text-sm font-medium mb-1 block">Your counter amount</label>
                    <Input
                      type="number"
                      step="0.01"
                      min="0.01"
                      value={counterAmount}
                      onChange={(e) => setCounterAmount(e.target.value)}
                      placeholder="$0.00"
                      data-testid="counter-amount-input"
                    />
                  </div>
                  <Button
                    className="w-full"
                    onClick={() => updateMutation.mutate({
                      id: offer.id,
                      status: "countered",
                      counterAmount: parseFloat(counterAmount),
                    })}
                    disabled={!counterAmount || updateMutation.isPending}
                    data-testid="submit-counter"
                  >
                    Send Counter
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        )}
      </div>
    </div>
  );

  return (
    <div className="container mx-auto max-w-3xl px-4 py-8" data-testid="offers-page">
      <h1 className="font-serif text-3xl font-bold mb-6">My Offers</h1>

      <Tabs defaultValue="received" data-testid="offers-tabs">
        <TabsList className="mb-6">
          <TabsTrigger value="received" data-testid="tab-received">
            Received ({data?.received.length || 0})
          </TabsTrigger>
          <TabsTrigger value="sent" data-testid="tab-sent">
            Sent ({data?.sent.length || 0})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="received">
          {isLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-lg" />)}
            </div>
          ) : data?.received && data.received.length > 0 ? (
            <div className="space-y-3">
              {data.received.map((offer) => (
                <OfferCard key={offer.id} offer={offer} type="received" />
              ))}
            </div>
          ) : (
            <div className="text-center py-16 border rounded-lg bg-card">
              <DollarSign className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">No offers received yet</p>
            </div>
          )}
        </TabsContent>

        <TabsContent value="sent">
          {isLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-lg" />)}
            </div>
          ) : data?.sent && data.sent.length > 0 ? (
            <div className="space-y-3">
              {data.sent.map((offer) => (
                <OfferCard key={offer.id} offer={offer} type="sent" />
              ))}
            </div>
          ) : (
            <div className="text-center py-16 border rounded-lg bg-card">
              <DollarSign className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">No offers sent yet</p>
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
