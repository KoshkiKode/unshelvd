import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { Link, Redirect } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { BookOpen, Plus, MessageSquare, DollarSign, FileText, ArrowRight, CreditCard, CheckCircle, Loader2 } from "lucide-react";
import type { Book } from "@shared/schema";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

export default function Dashboard() {
  const { user } = useAuth();
  const { toast } = useToast();

  const { data: sellerStatus } = useQuery<{ connected: boolean; onboarded: boolean }>({
    queryKey: ["/api/seller/status"],
    enabled: !!user,
  });

  const connectMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/seller/connect", {
        returnUrl: window.location.origin + "/#/dashboard",
      });
      return await res.json();
    },
    onSuccess: (data) => {
      if (data.onboardingUrl) {
        window.open(data.onboardingUrl, "_blank");
      } else if (data.alreadyOnboarded) {
        toast({ title: "Already connected", description: "Your bank account is set up and ready to receive payments." });
      } else if (data.devMode) {
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

  const { data: offers } = useQuery<{ sent: any[]; received: any[] }>({
    queryKey: ["/api/offers"],
    enabled: !!user,
  });

  const { data: unread } = useQuery<{ count: number }>({
    queryKey: ["/api/messages/unread/count"],
    enabled: !!user,
  });

  const { data: requests } = useQuery<any[]>({
    queryKey: ["/api/requests"],
    enabled: !!user,
  });

  if (!user) return <Redirect to="/login" />;

  const activeListings = books?.filter((b) => b.status === "for-sale" || b.status === "open-to-offers").length || 0;
  const pendingOffers = offers?.received.filter((o) => o.status === "pending").length || 0;
  const unreadMessages = unread?.count || 0;
  const myRequests = requests?.filter((r) => r.userId === user.id && r.status === "open").length || 0;

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

      {/* Seller Bank Account Connection */}
      {sellerStatus && !sellerStatus.onboarded && (
        <Card className="mb-6 border-amber-200 bg-amber-50 dark:bg-amber-950/20">
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <CreditCard className="h-5 w-5 text-amber-600" />
                <div>
                  <p className="font-medium text-sm">Connect your bank account to sell books</p>
                  <p className="text-xs text-muted-foreground">Set up Stripe to receive payments when your books sell.</p>
                </div>
              </div>
              <Button
                size="sm"
                onClick={() => connectMutation.mutate()}
                disabled={connectMutation.isPending}
                data-testid="connect-stripe-btn"
              >
                {connectMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <CreditCard className="h-4 w-4 mr-1" />}
                Connect
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
      {sellerStatus?.onboarded && (
        <div className="flex items-center gap-2 mb-4 text-xs text-green-600">
          <CheckCircle className="h-3.5 w-3.5" />
          <span>Bank account connected — you'll receive payments when books sell</span>
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
              <Link key={book.id} href={`/book/${book.id}`}>
                <div className="flex items-center gap-3 p-3 border rounded-lg bg-card hover:shadow-sm transition-shadow cursor-pointer" data-testid={`listing-${book.id}`}>
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
                  <div className="text-right">
                    {book.price != null && (
                      <p className="text-sm font-semibold text-primary">${book.price.toFixed(2)}</p>
                    )}
                    <p className="text-[10px] text-muted-foreground capitalize">{book.status.replace(/-/g, " ")}</p>
                  </div>
                </div>
              </Link>
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
    </div>
  );
}
