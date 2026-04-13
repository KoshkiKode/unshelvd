import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { Link, Redirect } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  BookOpen, Plus, MessageSquare, DollarSign, FileText, ArrowRight,
  CreditCard, CheckCircle, Loader2, Truck, Package, Clock, AlertCircle,
  ExternalLink, ShoppingBag, TrendingUp, Banknote, Pencil, Trash2, XCircle,
} from "lucide-react";
import type { Book, Transaction, Offer, BookRequest } from "@shared/schema";
import { TERMINAL_TX_STATUSES } from "@shared/schema";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useEffect, useState, type ReactNode } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Label } from "@/components/ui/label";

const RATING_LABELS = ["", "Poor", "Fair", "Good", "Very good", "Excellent"] as const;

/** Transaction as returned by GET /api/payments/transactions — includes joined book/buyer/seller. */
interface TxWithRelations extends Transaction {
  book: { id: number; title: string; author: string; coverUrl: string | null } | null;
  buyer: { id: number; displayName: string; username: string } | null;
  seller: { id: number; displayName: string; username: string } | null;
}

export default function Dashboard() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // State for "Mark as Shipped" dialog
  const [shipDialogOpen, setShipDialogOpen] = useState(false);
  const [shipTxId, setShipTxId] = useState<number | null>(null);
  const [deleteDialogBook, setDeleteDialogBook] = useState<Book | null>(null);
  const [carrier, setCarrier] = useState("");
  const [tracking, setTracking] = useState("");

  // State for "Rate Seller" dialog
  const [rateTx, setRateTx] = useState<TxWithRelations | null>(null);
  const [ratingValue, setRatingValue] = useState(0);

  // State for "Rate Buyer" dialog (seller rates buyer)
  const [rateBuyerTx, setRateBuyerTx] = useState<TxWithRelations | null>(null);
  const [rateBuyerValue, setRateBuyerValue] = useState(0);

  // State for dispute confirm dialog
  const [disputeTx, setDisputeTx] = useState<TxWithRelations | null>(null);

  // State for cancel order confirm dialog
  const [cancelTx, setCancelTx] = useState<TxWithRelations | null>(null);

  const { data: sellerStatus, isLoading: sellerLoading } = useQuery<{
    connected: boolean;
    onboarded: boolean;
    chargesEnabled?: boolean;
    payoutsEnabled?: boolean;
  }>({
    queryKey: ["/api/seller/status"],
    enabled: !!user,
  });

  // Handle returning from Stripe onboarding
  useEffect(() => {
    const hash = window.location.hash;
    if (hash.includes("stripe=complete")) {
      queryClient.invalidateQueries({ queryKey: ["/api/seller/status"] });
      toast({ title: "🎉 Stripe setup complete!", description: "Your bank account is connected. You'll receive payouts when your books sell." });
      window.history.replaceState(null, "", window.location.pathname + "#/dashboard");
    } else if (hash.includes("stripe=refresh")) {
      queryClient.invalidateQueries({ queryKey: ["/api/seller/status"] });
      toast({ title: "Let's finish your setup", description: "Click 'Continue Setup' to complete your Stripe account." });
      window.history.replaceState(null, "", window.location.pathname + "#/dashboard");
    }
  }, []);

  const connectMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/seller/connect", {
        returnUrl: window.location.origin + "/#/dashboard",
      });
      return await res.json();
    },
    onSuccess: (data) => {
      if (data.onboardingUrl) {
        window.location.href = data.onboardingUrl;
      } else if (data.alreadyOnboarded) {
        queryClient.invalidateQueries({ queryKey: ["/api/seller/status"] });
        toast({ title: "Already connected", description: "Your bank account is set up and ready to receive payments." });
      } else if (data.devMode) {
        queryClient.invalidateQueries({ queryKey: ["/api/seller/status"] });
        toast({ title: "Dev mode", description: "Stripe Connect simulated — you're set up for testing." });
      }
    },
    onError: (err: Error) => {
      toast({ title: "Connection failed", description: err.message, variant: "destructive" });
    },
  });

  const { data: books } = useQuery<Book[]>({
    queryKey: [`/api/books/user/${user?.id}`],
    enabled: !!user,
  });

  const { data: offers } = useQuery<{ sent: Offer[]; received: Offer[] }>({
    queryKey: ["/api/offers"],
    enabled: !!user,
  });

  const { data: unread } = useQuery<{ count: number }>({
    queryKey: ["/api/messages/unread/count"],
    enabled: !!user,
  });

  const { data: requestsData } = useQuery<{ requests: BookRequest[]; total: number }>({
    queryKey: [`/api/requests?status=open&limit=100`],
    enabled: !!user,
  });

  const { data: transactions, isLoading: txLoading } = useQuery<{ purchases: TxWithRelations[]; sales: TxWithRelations[] }>({
    queryKey: ["/api/payments/transactions"],
    enabled: !!user,
  });

  const shipMutation = useMutation({
    mutationFn: async ({ id, carrier, tracking }: { id: number; carrier: string; tracking: string }) => {
      const res = await apiRequest("POST", `/api/payments/${id}/ship`, { carrier, trackingNumber: tracking });
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/payments/transactions"] });
      toast({ title: "Marked as shipped!", description: "The buyer has been notified." });
      setShipDialogOpen(false);
      setCarrier("");
      setTracking("");
      setShipTxId(null);
    },
    onError: (err: Error) => {
      toast({ title: "Failed to update", description: err.message, variant: "destructive" });
    },
  });

  const deliverMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest("POST", `/api/payments/${id}/deliver`);
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/payments/transactions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/seller/status"] });
      toast({ title: "Delivery confirmed!", description: "The seller's payout has been released. Thanks for completing the transaction." });
    },
    onError: (err: Error) => {
      toast({ title: "Failed to confirm", description: err.message, variant: "destructive" });
    },
  });

  const rateMutation = useMutation({
    mutationFn: async ({ id, rating }: { id: number; rating: number }) => {
      const res = await apiRequest("POST", `/api/transactions/${id}/rate`, { rating });
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/payments/transactions"] });
      toast({ title: "Rating submitted!", description: "Thanks for your feedback." });
      setRateTx(null);
      setRatingValue(0);
    },
    onError: (err: Error) => {
      toast({ title: "Failed to submit rating", description: err.message, variant: "destructive" });
    },
  });

  const rateBuyerMutation = useMutation({
    mutationFn: async ({ id, rating }: { id: number; rating: number }) => {
      const res = await apiRequest("POST", `/api/transactions/${id}/rate-buyer`, { rating });
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/payments/transactions"] });
      toast({ title: "Rating submitted!", description: "Thanks for rating the buyer." });
      setRateBuyerTx(null);
      setRateBuyerValue(0);
    },
    onError: (err: Error) => {
      toast({ title: "Failed to submit rating", description: err.message, variant: "destructive" });
    },
  });

  const disputeMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest("POST", `/api/payments/${id}/dispute`);
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/payments/transactions"] });
      toast({ title: "Dispute opened", description: "Our team will review this transaction and contact you." });
      setDisputeTx(null);
    },
    onError: (err: Error) => {
      toast({ title: "Failed to open dispute", description: err.message, variant: "destructive" });
    },
  });

  const cancelOrderMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest("POST", `/api/payments/${id}/cancel`);
      if (!res.ok) {
        const body = await res.json();
        throw new Error(body.message || "Failed to cancel order");
      }
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/payments/transactions"] });
      queryClient.invalidateQueries({ queryKey: [`/api/books/user/${user?.id}`] });
      toast({ title: "Order cancelled", description: "Your order has been cancelled and any payment refunded." });
      setCancelTx(null);
    },
    onError: (err: Error) => {
      toast({ title: "Failed to cancel order", description: err.message, variant: "destructive" });
    },
  });

  const deleteBookMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest("DELETE", `/api/books/${id}`);
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/books/user/${user?.id}`] });
      queryClient.invalidateQueries({ queryKey: ["/api/books"] });
      toast({ title: "Book removed", description: "Your listing has been deleted." });
    },
    onError: (err: Error) => {
      toast({ title: "Failed to delete", description: err.message, variant: "destructive" });
    },
  });

  if (!user) return <Redirect to="/login" />;

  const activeListings = books?.filter((b) => b.status === "for-sale" || b.status === "open-to-offers").length || 0;
  const pendingOffers = offers?.received.filter((o) => o.status === "pending").length || 0;
  const unreadMessages = unread?.count || 0;
  const myRequests = requestsData?.requests?.filter((r) => r.userId === user.id && r.status === "open").length || 0;
  const activeTxCount = (transactions?.purchases.filter(t => !TERMINAL_TX_STATUSES.includes(t.status ?? "")).length || 0)
    + (transactions?.sales.filter(t => !TERMINAL_TX_STATUSES.includes(t.status ?? "")).length || 0);

  return (
    <div className="container mx-auto max-w-5xl px-4 py-8" data-testid="dashboard-page">
      <div className="mb-8">
        <h1 className="font-serif text-3xl font-bold mb-1">Dashboard</h1>
        <p className="text-muted-foreground">Welcome back, {user.displayName}</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8" data-testid="dashboard-stats">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center">
                <BookOpen className="h-4.5 w-4.5 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-bold">{activeListings}</p>
                <p className="text-xs text-muted-foreground">Active Listings</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="h-9 w-9 rounded-lg bg-amber-100 dark:bg-amber-900/20 flex items-center justify-center">
                <DollarSign className="h-4.5 w-4.5 text-amber-700 dark:text-amber-400" />
              </div>
              <div>
                <p className="text-2xl font-bold">{pendingOffers}</p>
                <p className="text-xs text-muted-foreground">Pending Offers</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="h-9 w-9 rounded-lg bg-blue-100 dark:bg-blue-900/20 flex items-center justify-center">
                <MessageSquare className="h-4.5 w-4.5 text-blue-700 dark:text-blue-400" />
              </div>
              <div>
                <p className="text-2xl font-bold">{unreadMessages}</p>
                <p className="text-xs text-muted-foreground">Unread Messages</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="h-9 w-9 rounded-lg bg-green-100 dark:bg-green-900/20 flex items-center justify-center">
                <FileText className="h-4.5 w-4.5 text-green-700 dark:text-green-400" />
              </div>
              <div>
                <p className="text-2xl font-bold">{myRequests}</p>
                <p className="text-xs text-muted-foreground">Active Requests</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Quick actions */}
      <div className="flex flex-wrap gap-3 mb-8">
        <Link href="/dashboard/add-book">
          <Button data-testid="quick-add-book">
            <Plus className="h-4 w-4 mr-1.5" />
            List a Book
          </Button>
        </Link>
        <Link href="/requests">
          <Button variant="outline" data-testid="quick-post-request">
            <FileText className="h-4 w-4 mr-1.5" />
            Post a Request
          </Button>
        </Link>
        <Link href="/dashboard/messages">
          <Button variant="outline" data-testid="quick-messages">
            <MessageSquare className="h-4 w-4 mr-1.5" />
            Messages
          </Button>
        </Link>
        <Link href="/dashboard/offers">
          <Button variant="outline" data-testid="quick-offers">
            <DollarSign className="h-4 w-4 mr-1.5" />
            Offers
          </Button>
        </Link>
      </div>

      {/* ── Seller Payout Setup ── */}
      <SellerOnboardingCard
        status={sellerStatus}
        loading={sellerLoading}
        onConnect={() => connectMutation.mutate()}
        connecting={connectMutation.isPending}
      />

      {/* ── Transactions ── */}
      {((transactions?.purchases?.length ?? 0) > 0 || (transactions?.sales?.length ?? 0) > 0 || txLoading) && (
        <div className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-serif text-xl font-semibold flex items-center gap-2">
              Orders
              {activeTxCount > 0 && (
                <Badge variant="destructive" className="text-[10px] h-5 px-1.5">{activeTxCount}</Badge>
              )}
            </h2>
          </div>

          <Tabs defaultValue="purchases">
            <TabsList className="mb-4">
              <TabsTrigger value="purchases" className="gap-1.5">
                <ShoppingBag className="h-3.5 w-3.5" />
                Purchases
                {(transactions?.purchases?.filter(t => !TERMINAL_TX_STATUSES.includes(t.status ?? "")).length ?? 0) > 0 && (
                  <Badge variant="secondary" className="text-[10px] h-4 px-1 ml-0.5">
                    {transactions!.purchases.filter(t => !TERMINAL_TX_STATUSES.includes(t.status ?? "")).length}
                  </Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="sales" className="gap-1.5">
                <TrendingUp className="h-3.5 w-3.5" />
                Sales
                {(transactions?.sales?.filter(t => !TERMINAL_TX_STATUSES.includes(t.status ?? "")).length ?? 0) > 0 && (
                  <Badge variant="secondary" className="text-[10px] h-4 px-1 ml-0.5">
                    {transactions!.sales.filter(t => !TERMINAL_TX_STATUSES.includes(t.status ?? "")).length}
                  </Badge>
                )}
              </TabsTrigger>
            </TabsList>

            <TabsContent value="purchases">
              {txLoading ? (
                <div className="space-y-2">{[1, 2].map(i => <Skeleton key={i} className="h-20 w-full" />)}</div>
              ) : transactions?.purchases.length === 0 ? (
                <EmptyTransactions message="You haven't bought any books yet." />
              ) : (
                <div className="space-y-3">
                  {transactions!.purchases.map((tx) => (
                    <TransactionCard
                      key={tx.id}
                      tx={tx}
                      role="buyer"
                      onConfirmDelivery={() => deliverMutation.mutate(tx.id)}
                      confirming={deliverMutation.isPending && deliverMutation.variables === tx.id}
                      onRate={tx.status === "completed" && !tx.buyerRating ? () => { setRateTx(tx); setRatingValue(0); } : undefined}
                      onDispute={["paid", "shipped"].includes(tx.status ?? "") ? () => setDisputeTx(tx) : undefined}
                      onCancel={["pending", "paid"].includes(tx.status ?? "") ? () => setCancelTx(tx) : undefined}
                    />
                  ))}
                </div>
              )}
            </TabsContent>

            <TabsContent value="sales">
              {txLoading ? (
                <div className="space-y-2">{[1, 2].map(i => <Skeleton key={i} className="h-20 w-full" />)}</div>
              ) : transactions?.sales.length === 0 ? (
                <EmptyTransactions message="No sales yet — list some books to get started!" />
              ) : (
                <div className="space-y-3">
                  {transactions!.sales.map((tx) => (
                    <TransactionCard
                      key={tx.id}
                      tx={tx}
                      role="seller"
                      onMarkShipped={() => {
                        setShipTxId(tx.id);
                        setShipDialogOpen(true);
                      }}
                      onRateBuyer={tx.status === "completed" && !tx.sellerRating ? () => { setRateBuyerTx(tx); setRateBuyerValue(0); } : undefined}
                    />
                  ))}
                </div>
              )}
            </TabsContent>
          </Tabs>
        </div>
      )}

      {/* My Listings */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-serif text-xl font-semibold">My Listings</h2>
          <Link href={`/user/${user.id}`}>
            <Button variant="ghost" size="sm" className="text-muted-foreground">
              View shelf <ArrowRight className="h-4 w-4 ml-1" />
            </Button>
          </Link>
        </div>

        {books && books.length > 0 ? (
          <div className="space-y-2">
            {books.slice(0, 5).map((book) => (
              <div key={book.id} className="flex items-center gap-3 p-3 border rounded-lg bg-card" data-testid={`listing-${book.id}`}>
                <Link href={`/book/${book.id}`} className="flex items-center gap-3 flex-1 min-w-0 hover:opacity-80 transition-opacity cursor-pointer">
                  <div className="h-12 w-9 rounded bg-muted flex items-center justify-center flex-shrink-0">
                    {book.coverUrl ? (
                      <img src={book.coverUrl} alt="" className="h-12 w-9 rounded object-cover" />
                    ) : (
                      <BookOpen className="h-4 w-4 text-muted-foreground/40" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-serif text-sm font-medium truncate">{book.title}</p>
                    <p className="text-xs text-muted-foreground">{book.author}</p>
                  </div>
                  <div className="text-right mr-2">
                    {book.price != null && (
                      <p className="text-sm font-semibold text-primary">${book.price.toFixed(2)}</p>
                    )}
                    <p className="text-[10px] text-muted-foreground capitalize">{book.status.replace(/-/g, " ")}</p>
                  </div>
                </Link>
                <div className="flex items-center gap-1 flex-shrink-0">
                  <Link href={`/dashboard/add-book?edit=${book.id}`}>
                    <Button variant="ghost" size="icon" className="h-7 w-7" title="Edit listing" data-testid={`edit-listing-${book.id}`}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                  </Link>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-destructive hover:text-destructive"
                    title="Delete listing"
                    data-testid={`delete-listing-${book.id}`}
                    onClick={() => setDeleteDialogBook(book)}
                    disabled={deleteBookMutation.isPending}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-8 border rounded-lg bg-card">
            <BookOpen className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
            <p className="text-sm text-muted-foreground mb-3">No books in your library yet</p>
            <Link href="/dashboard/add-book">
              <Button size="sm">Add Your First Book</Button>
            </Link>
          </div>
        )}
      </div>

      {/* Mark as Shipped dialog */}
      <Dialog open={shipDialogOpen} onOpenChange={(v) => { setShipDialogOpen(v); if (!v) { setCarrier(""); setTracking(""); setShipTxId(null); } }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="font-serif">Mark as Shipped</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <p className="text-sm text-muted-foreground">
              Add tracking info so the buyer knows their book is on the way. (Optional but recommended.)
            </p>
            <div className="space-y-1.5">
              <Label htmlFor="carrier">Carrier</Label>
              <Input
                id="carrier"
                placeholder="e.g. USPS, UPS, FedEx"
                value={carrier}
                onChange={(e) => setCarrier(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="tracking">Tracking number</Label>
              <Input
                id="tracking"
                placeholder="e.g. 9400111899223456789012"
                value={tracking}
                onChange={(e) => setTracking(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShipDialogOpen(false)}>Cancel</Button>
            <Button
              onClick={() => shipTxId && shipMutation.mutate({ id: shipTxId, carrier, tracking })}
              disabled={shipMutation.isPending}
              className="gap-1.5"
            >
              {shipMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Truck className="h-4 w-4" />}
              Confirm Shipment
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {/* Delete listing confirmation dialog */}
      <AlertDialog open={!!deleteDialogBook} onOpenChange={(v) => { if (!v) setDeleteDialogBook(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete listing?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to remove "{deleteDialogBook?.title}" from your listings? This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (deleteDialogBook) {
                  deleteBookMutation.mutate(deleteDialogBook.id);
                  setDeleteDialogBook(null);
                }
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Rate Seller dialog */}
      <Dialog open={!!rateTx} onOpenChange={(v) => { if (!v) { setRateTx(null); setRatingValue(0); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rate your seller</DialogTitle>
          </DialogHeader>
          <div className="py-2">
            <p className="text-sm text-muted-foreground mb-4">
              How was your experience with <strong>{rateTx?.seller?.displayName}</strong> for{" "}
              <em>{rateTx?.book?.title}</em>?
            </p>
            <div className="flex gap-2 justify-center mb-2">
              {[1, 2, 3, 4, 5].map((star) => (
                <button
                  key={star}
                  type="button"
                  onClick={() => setRatingValue(star)}
                  className={`text-3xl transition-colors ${star <= ratingValue ? "text-yellow-400" : "text-muted-foreground/30"}`}
                  aria-label={`${star} star${star !== 1 ? "s" : ""}`}
                >
                  ★
                </button>
              ))}
            </div>
            {ratingValue > 0 && (
              <p className="text-center text-sm text-muted-foreground">
                {RATING_LABELS[ratingValue]}
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setRateTx(null); setRatingValue(0); }}>Skip</Button>
            <Button
              disabled={ratingValue === 0 || rateMutation.isPending}
              onClick={() => rateTx && rateMutation.mutate({ id: rateTx.id, rating: ratingValue })}
            >
              {rateMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
              Submit Rating
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Rate Buyer dialog (seller rates buyer) */}
      <Dialog open={!!rateBuyerTx} onOpenChange={(v) => { if (!v) { setRateBuyerTx(null); setRateBuyerValue(0); } }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Rate your buyer</DialogTitle>
          </DialogHeader>
          <div className="py-2">
            <p className="text-sm text-muted-foreground mb-4">
              How was <strong>{rateBuyerTx?.buyer?.displayName}</strong> as a buyer for{" "}
              <em>{rateBuyerTx?.book?.title}</em>?
            </p>
            <div className="flex gap-2 justify-center mb-2">
              {[1, 2, 3, 4, 5].map((star) => (
                <button
                  key={star}
                  type="button"
                  onClick={() => setRateBuyerValue(star)}
                  className={`text-3xl transition-colors ${star <= rateBuyerValue ? "text-yellow-400" : "text-muted-foreground/30"}`}
                  aria-label={`${star} star${star !== 1 ? "s" : ""}`}
                >
                  ★
                </button>
              ))}
            </div>
            {rateBuyerValue > 0 && (
              <p className="text-center text-sm text-muted-foreground">
                {RATING_LABELS[rateBuyerValue]}
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setRateBuyerTx(null); setRateBuyerValue(0); }}>Skip</Button>
            <Button
              disabled={rateBuyerValue === 0 || rateBuyerMutation.isPending}
              onClick={() => rateBuyerTx && rateBuyerMutation.mutate({ id: rateBuyerTx.id, rating: rateBuyerValue })}
            >
              {rateBuyerMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
              Submit Rating
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dispute confirmation dialog */}
      <AlertDialog open={!!disputeTx} onOpenChange={(v) => { if (!v) setDisputeTx(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Open a dispute?</AlertDialogTitle>
            <AlertDialogDescription>
              This will flag <em>{disputeTx?.book?.title}</em> for review by our team.
              Please only open a dispute if the item hasn't arrived, arrived damaged, or significantly
              differs from the listing. We'll contact you within 2 business days.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive hover:bg-destructive/90"
              onClick={() => disputeTx && disputeMutation.mutate(disputeTx.id)}
            >
              {disputeMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
              Open Dispute
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Cancel order confirmation dialog */}
      <AlertDialog open={!!cancelTx} onOpenChange={(v) => { if (!v) setCancelTx(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <XCircle className="h-5 w-5 text-destructive" />
              Cancel this order?
            </AlertDialogTitle>
            <AlertDialogDescription>
              <span className="block">
                Are you sure you want to cancel your order for{" "}
                <em>{cancelTx?.book?.title}</em>?
              </span>
              {cancelTx?.status === "paid" && (
                <span className="block mt-2 font-medium text-foreground">
                  Your payment will be fully refunded within a few business days.
                </span>
              )}
              {cancelTx?.status === "pending" && (
                <span className="block mt-2">
                  No payment was captured — the reservation will be released immediately.
                </span>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep order</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive hover:bg-destructive/90"
              disabled={cancelOrderMutation.isPending}
              onClick={() => cancelTx && cancelOrderMutation.mutate(cancelTx.id)}
            >
              {cancelOrderMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
              Yes, cancel order
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ── Sub-components ──────────────────────────────────────────────

function SellerOnboardingCard({
  status,
  loading,
  onConnect,
  connecting,
}: {
  status: { connected: boolean; onboarded: boolean; chargesEnabled?: boolean } | undefined;
  loading: boolean;
  onConnect: () => void;
  connecting: boolean;
}) {
  if (loading) {
    return <Skeleton className="h-24 w-full mb-6 rounded-xl" />;
  }

  // Fully onboarded ✓
  if (status?.onboarded && status?.chargesEnabled !== false) {
    return (
      <div className="flex items-center gap-2 mb-6 text-sm text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-800 rounded-lg px-4 py-3">
        <CheckCircle className="h-4 w-4 flex-shrink-0" />
        <span>Payout account connected — you'll receive funds automatically when buyers confirm delivery.</span>
      </div>
    );
  }

  // Account created but onboarding not complete
  if (status?.connected && !status?.onboarded) {
    return (
      <Card className="mb-6 border-amber-200 bg-amber-50 dark:bg-amber-950/20">
        <CardContent className="py-4">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-3">
              <AlertCircle className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-medium text-sm">Finish setting up payouts</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Your Stripe account was created but isn't complete. Continue where you left off.
                </p>
              </div>
            </div>
            <Button size="sm" onClick={onConnect} disabled={connecting} className="shrink-0">
              {connecting ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <ExternalLink className="h-4 w-4 mr-1" />}
              Continue
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Not connected at all — show the full pitch
  return (
    <Card className="mb-6 border-primary/20 bg-gradient-to-br from-primary/5 to-primary/0">
      <CardContent className="py-5">
        <div className="flex flex-col sm:flex-row sm:items-center gap-5">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <Banknote className="h-5 w-5 text-primary" />
              <p className="font-semibold text-sm">Become a Seller — Connect Your Bank Account</p>
            </div>
            <p className="text-xs text-muted-foreground mb-3">
              Set up Stripe once to receive secure payouts every time a book sells. Stripe handles bank verification — we never see your details.
            </p>
            <ul className="text-xs text-muted-foreground space-y-1">
              <li className="flex items-center gap-1.5"><CheckCircle className="h-3 w-3 text-green-600" /> Funds held in escrow until buyer confirms delivery</li>
              <li className="flex items-center gap-1.5"><CheckCircle className="h-3 w-3 text-green-600" /> 90% of sale price paid directly to your bank</li>
              <li className="flex items-center gap-1.5"><CheckCircle className="h-3 w-3 text-green-600" /> One-time setup — all future sales pay out automatically</li>
            </ul>
          </div>
          <Button
            onClick={onConnect}
            disabled={connecting}
            className="gap-1.5 shrink-0"
            data-testid="connect-stripe-btn"
          >
            {connecting
              ? <Loader2 className="h-4 w-4 animate-spin" />
              : <CreditCard className="h-4 w-4" />}
            {connecting ? "Redirecting..." : "Set Up Payouts"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

const TX_STATUS: Record<string, { label: string; color: string; icon: ReactNode }> = {
  pending:   { label: "Awaiting payment",     color: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300", icon: <Clock className="h-3 w-3" /> },
  paid:      { label: "Payment confirmed",    color: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",         icon: <CreditCard className="h-3 w-3" /> },
  shipped:   { label: "Shipped",              color: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300", icon: <Truck className="h-3 w-3" /> },
  completed: { label: "Completed",            color: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",     icon: <CheckCircle className="h-3 w-3" /> },
  disputed:  { label: "Disputed",             color: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",             icon: <AlertCircle className="h-3 w-3" /> },
  refunded:  { label: "Refunded",             color: "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300",           icon: <Package className="h-3 w-3" /> },
  cancelled: { label: "Cancelled",            color: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",           icon: <XCircle className="h-3 w-3" /> },
};

function TransactionCard({
  tx,
  role,
  onMarkShipped,
  onConfirmDelivery,
  confirming,
  onRate,
  onRateBuyer,
  onDispute,
  onCancel,
}: {
  tx: TxWithRelations;
  role: "buyer" | "seller";
  onMarkShipped?: () => void;
  onConfirmDelivery?: () => void;
  confirming?: boolean;
  onRate?: () => void;
  onRateBuyer?: () => void;
  onDispute?: () => void;
  onCancel?: () => void;
}){
  const status = TX_STATUS[tx.status ?? ""] ?? { label: tx.status ?? "", color: "", icon: null };

  return (
    <div className="flex items-start gap-3 p-3 border rounded-lg bg-card">
      {/* Cover */}
      <div className="h-14 w-10 rounded bg-muted flex items-center justify-center flex-shrink-0">
        {tx.book?.coverUrl ? (
          <img src={tx.book.coverUrl} alt="" className="h-14 w-10 rounded object-cover" />
        ) : (
          <BookOpen className="h-4 w-4 text-muted-foreground/40" />
        )}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <p className="font-serif text-sm font-medium truncate">{tx.book?.title ?? "Unknown book"}</p>
        <p className="text-xs text-muted-foreground">
          {role === "buyer" ? `Seller: ${tx.seller?.displayName}` : `Buyer: ${tx.buyer?.displayName}`}
          {" · "}${tx.amount.toFixed(2)}
        </p>
        {tx.status === "shipped" && tx.trackingNumber && (
          <p className="text-xs text-muted-foreground mt-0.5">
            {tx.shippingCarrier && `${tx.shippingCarrier} · `}Tracking: <span className="font-mono">{tx.trackingNumber}</span>
          </p>
        )}
        <div className={`inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-full mt-1 ${status.color}`}>
          {status.icon}
          {status.label}
        </div>
      </div>

      {/* Actions */}
      <div className="flex flex-col gap-1.5 items-end shrink-0">
        {role === "seller" && tx.status === "paid" && onMarkShipped && (
          <Button size="sm" variant="outline" onClick={onMarkShipped} className="text-xs h-7 gap-1">
            <Truck className="h-3 w-3" />
            Ship
          </Button>
        )}
        {role === "buyer" && tx.status === "shipped" && onConfirmDelivery && (
          <Button size="sm" onClick={onConfirmDelivery} disabled={confirming} className="text-xs h-7 gap-1">
            {confirming ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCircle className="h-3 w-3" />}
            Got it!
          </Button>
        )}
        {role === "buyer" && onDispute && (
          <Button size="sm" variant="outline" onClick={onDispute} className="text-xs h-7 gap-1 text-destructive border-destructive/30 hover:bg-destructive/10">
            <AlertCircle className="h-3 w-3" />
            Dispute
          </Button>
        )}
        {role === "buyer" && onCancel && (
          <Button size="sm" variant="outline" onClick={onCancel} className="text-xs h-7 gap-1 text-muted-foreground hover:text-destructive hover:border-destructive/30">
            <XCircle className="h-3 w-3" />
            Cancel
          </Button>
        )}
        {tx.status === "completed" && role === "buyer" && (
          <>
            <span className="text-[10px] text-green-600 font-medium">✓ Payout sent</span>
            {onRate && (
              <Button size="sm" variant="outline" onClick={onRate} className="text-xs h-7 gap-1 text-yellow-600 border-yellow-300 hover:bg-yellow-50">
                ★ Rate seller
              </Button>
            )}
            {tx.buyerRating && (
              <span className="text-[10px] text-yellow-600">{"★".repeat(tx.buyerRating)}</span>
            )}
          </>
        )}
        {tx.status === "completed" && role === "seller" && (
          <>
            {onRateBuyer && (
              <Button size="sm" variant="outline" onClick={onRateBuyer} className="text-xs h-7 gap-1 text-yellow-600 border-yellow-300 hover:bg-yellow-50">
                ★ Rate buyer
              </Button>
            )}
            {tx.sellerRating && (
              <span className="text-[10px] text-yellow-600">{"★".repeat(tx.sellerRating)}</span>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function EmptyTransactions({ message }: { message: string }) {
  return (
    <div className="text-center py-8 border rounded-lg bg-card">
      <Package className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
      <p className="text-sm text-muted-foreground">{message}</p>
    </div>
  );
}
