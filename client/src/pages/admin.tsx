import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { apiRequest } from "@/lib/queryClient";
import { Redirect } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import {
  DollarSign, Users, BookOpen, TrendingUp, ShoppingCart,
  AlertTriangle, CheckCircle, Package, Clock, Ban,
  RefreshCcw, Shield, Globe, BarChart3,
} from "lucide-react";

interface Overview {
  users: number;
  newUsersLast7Days: number;
  books: number;
  activeListings: number;
  catalog: number;
  works: number;
  requests: number;
  messages: number;
  transactions: {
    total: number; completed: number; pending: number;
    paid: number; shipped: number; disputed: number;
  };
  revenue: {
    totalSales: string; platformFees: string; sellerPayouts: string;
  };
}

interface Transaction {
  id: number; amount: number; platformFee: number; sellerPayout: number;
  status: string; createdAt: string; shippingCarrier?: string; trackingNumber?: string;
  buyer?: { id: number; username: string; displayName: string; email: string };
  seller?: { id: number; username: string; displayName: string; email: string };
  book?: { id: number; title: string; author: string };
}

interface UserInfo {
  id: number; username: string; displayName: string; email: string;
  role: string; totalSales: number; totalPurchases: number; createdAt: string;
}

export default function AdminDashboard() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: adminCheck } = useQuery<{ isAdmin: boolean }>({
    queryKey: ["/api/admin/check"],
    retry: false,
  });

  const { data: overview, isLoading } = useQuery<Overview>({
    queryKey: ["/api/admin/overview"],
    enabled: !!adminCheck?.isAdmin,
    refetchInterval: 30000,
  });

  const { data: txData } = useQuery<{ transactions: Transaction[]; total: number }>({
    queryKey: ["/api/admin/transactions"],
    enabled: !!adminCheck?.isAdmin,
  });

  const { data: usersData } = useQuery<{ users: UserInfo[]; total: number }>({
    queryKey: ["/api/admin/users"],
    enabled: !!adminCheck?.isAdmin,
  });

  const { data: revenueData } = useQuery<any>({
    queryKey: ["/api/admin/revenue"],
    enabled: !!adminCheck?.isAdmin,
  });

  const disputeMutation = useMutation({
    mutationFn: async (txId: number) => {
      await apiRequest("POST", `/api/admin/transactions/${txId}/dispute`);
    },
    onSuccess: () => {
      toast({ title: "Transaction marked as disputed" });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/transactions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/overview"] });
    },
  });

  const refundMutation = useMutation({
    mutationFn: async (txId: number) => {
      await apiRequest("POST", `/api/admin/transactions/${txId}/refund`);
    },
    onSuccess: () => {
      toast({ title: "Transaction refunded" });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/transactions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/overview"] });
    },
  });

  const suspendMutation = useMutation({
    mutationFn: async (userId: number) => {
      await apiRequest("POST", `/api/admin/users/${userId}/suspend`);
    },
    onSuccess: () => {
      toast({ title: "User status updated" });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
    },
  });

  if (!user) return <Redirect to="/login" />;
  if (adminCheck && !adminCheck.isAdmin) return <Redirect to="/dashboard" />;

  if (isLoading || !overview) {
    return (
      <div className="container mx-auto max-w-6xl px-4 py-8">
        <Skeleton className="h-8 w-64 mb-6" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[1,2,3,4,5,6,7,8].map(i => <Skeleton key={i} className="h-24" />)}
        </div>
      </div>
    );
  }

  const statusColor: Record<string, string> = {
    pending: "bg-yellow-100 text-yellow-800",
    paid: "bg-blue-100 text-blue-800",
    shipped: "bg-purple-100 text-purple-800",
    completed: "bg-green-100 text-green-800",
    disputed: "bg-red-100 text-red-800",
    refunded: "bg-gray-100 text-gray-800",
  };

  return (
    <div className="container mx-auto max-w-6xl px-4 py-8" data-testid="admin-page">
      <div className="flex items-center gap-3 mb-6">
        <Shield className="h-6 w-6 text-primary" />
        <h1 className="font-serif text-2xl font-bold">Admin Dashboard</h1>
      </div>

      {/* Revenue cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2 mb-1">
              <DollarSign className="h-4 w-4 text-green-600" />
              <span className="text-xs text-muted-foreground">Your Revenue</span>
            </div>
            <p className="font-serif text-xl font-bold text-green-600">${overview.revenue.platformFees}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2 mb-1">
              <ShoppingCart className="h-4 w-4 text-primary" />
              <span className="text-xs text-muted-foreground">Total Sales</span>
            </div>
            <p className="font-serif text-xl font-bold">${overview.revenue.totalSales}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2 mb-1">
              <Users className="h-4 w-4 text-blue-600" />
              <span className="text-xs text-muted-foreground">Users</span>
            </div>
            <p className="font-serif text-xl font-bold">{overview.users}</p>
            <p className="text-[10px] text-muted-foreground">+{overview.newUsersLast7Days} this week</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2 mb-1">
              <BookOpen className="h-4 w-4 text-amber-600" />
              <span className="text-xs text-muted-foreground">Active Listings</span>
            </div>
            <p className="font-serif text-xl font-bold">{overview.activeListings}</p>
          </CardContent>
        </Card>
      </div>

      {/* Secondary stats */}
      <div className="grid grid-cols-3 md:grid-cols-6 gap-2 mb-6">
        <div className="text-center p-2 bg-muted/50 rounded">
          <p className="font-bold text-sm">{overview.transactions.completed}</p>
          <p className="text-[10px] text-muted-foreground">Completed</p>
        </div>
        <div className="text-center p-2 bg-muted/50 rounded">
          <p className="font-bold text-sm">{overview.transactions.pending}</p>
          <p className="text-[10px] text-muted-foreground">Pending</p>
        </div>
        <div className="text-center p-2 bg-muted/50 rounded">
          <p className="font-bold text-sm">{overview.transactions.shipped}</p>
          <p className="text-[10px] text-muted-foreground">Shipped</p>
        </div>
        <div className="text-center p-2 bg-muted/50 rounded">
          <p className="font-bold text-sm text-red-600">{overview.transactions.disputed}</p>
          <p className="text-[10px] text-muted-foreground">Disputed</p>
        </div>
        <div className="text-center p-2 bg-muted/50 rounded">
          <p className="font-bold text-sm">{overview.catalog.toLocaleString()}</p>
          <p className="text-[10px] text-muted-foreground">Catalog</p>
        </div>
        <div className="text-center p-2 bg-muted/50 rounded">
          <p className="font-bold text-sm">{overview.messages}</p>
          <p className="text-[10px] text-muted-foreground">Messages</p>
        </div>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="transactions">
        <TabsList className="mb-4">
          <TabsTrigger value="transactions">Transactions ({overview.transactions.total})</TabsTrigger>
          <TabsTrigger value="users">Users ({overview.users})</TabsTrigger>
          <TabsTrigger value="revenue">Revenue</TabsTrigger>
        </TabsList>

        {/* Transactions tab */}
        <TabsContent value="transactions">
          <div className="space-y-2">
            {txData?.transactions.map((tx) => (
              <Card key={tx.id} className="overflow-hidden">
                <CardContent className="p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <Badge className={statusColor[tx.status] || ""} variant="secondary">
                          {tx.status}
                        </Badge>
                        <span className="text-xs text-muted-foreground">#{tx.id}</span>
                        <span className="text-xs text-muted-foreground">
                          {new Date(tx.createdAt).toLocaleDateString()}
                        </span>
                      </div>
                      <p className="text-sm font-medium truncate">
                        {tx.book?.title || "Unknown book"} — {tx.book?.author}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {tx.buyer?.displayName} ({tx.buyer?.email}) → {tx.seller?.displayName} ({tx.seller?.email})
                      </p>
                      {tx.trackingNumber && (
                        <p className="text-xs text-muted-foreground mt-1">
                          Tracking: {tx.shippingCarrier} {tx.trackingNumber}
                        </p>
                      )}
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="font-bold text-sm">${tx.amount.toFixed(2)}</p>
                      <p className="text-[10px] text-green-600">Fee: ${tx.platformFee.toFixed(2)}</p>
                      <p className="text-[10px] text-muted-foreground">Payout: ${tx.sellerPayout.toFixed(2)}</p>
                      <div className="flex gap-1 mt-2">
                        {tx.status !== "disputed" && tx.status !== "refunded" && tx.status !== "completed" && (
                          <Button
                            size="sm" variant="outline" className="h-6 text-[10px] px-2"
                            onClick={() => disputeMutation.mutate(tx.id)}
                          >
                            <AlertTriangle className="h-3 w-3 mr-1" /> Dispute
                          </Button>
                        )}
                        {tx.status !== "refunded" && (
                          <Button
                            size="sm" variant="destructive" className="h-6 text-[10px] px-2"
                            onClick={() => refundMutation.mutate(tx.id)}
                          >
                            <RefreshCcw className="h-3 w-3 mr-1" /> Refund
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
            {(!txData?.transactions || txData.transactions.length === 0) && (
              <div className="text-center py-12 text-muted-foreground">
                <ShoppingCart className="h-8 w-8 mx-auto mb-3 opacity-30" />
                <p>No transactions yet</p>
              </div>
            )}
          </div>
        </TabsContent>

        {/* Users tab */}
        <TabsContent value="users">
          <div className="space-y-2">
            {usersData?.users.map((u) => (
              <Card key={u.id}>
                <CardContent className="p-3 flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="font-medium text-sm">{u.displayName}</p>
                      <span className="text-xs text-muted-foreground">@{u.username}</span>
                      {u.role === "admin" && <Badge variant="default" className="text-[10px]">Admin</Badge>}
                      {u.role === "suspended" && <Badge variant="destructive" className="text-[10px]">Suspended</Badge>}
                    </div>
                    <p className="text-xs text-muted-foreground">{u.email}</p>
                    <p className="text-[10px] text-muted-foreground">
                      {u.totalSales} sales · {u.totalPurchases} purchases · Joined {new Date(u.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                  {u.role !== "admin" && (
                    <Button
                      size="sm" variant={u.role === "suspended" ? "outline" : "destructive"}
                      className="text-xs"
                      onClick={() => suspendMutation.mutate(u.id)}
                    >
                      {u.role === "suspended" ? "Unsuspend" : "Suspend"}
                    </Button>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        {/* Revenue tab */}
        <TabsContent value="revenue">
          {revenueData?.pendingPayouts && (
            <Card className="mb-4 border-amber-200 bg-amber-50 dark:bg-amber-950/20">
              <CardContent className="pt-4 pb-3">
                <div className="flex items-center gap-2 mb-1">
                  <Clock className="h-4 w-4 text-amber-600" />
                  <span className="font-medium text-sm">Pending Seller Payouts</span>
                </div>
                <p className="font-serif text-xl font-bold text-amber-700">${revenueData.pendingPayouts.total}</p>
                <p className="text-xs text-muted-foreground">{revenueData.pendingPayouts.count} transactions awaiting completion</p>
              </CardContent>
            </Card>
          )}

          <h3 className="font-medium text-sm mb-3">Monthly Revenue</h3>
          {revenueData?.monthly?.length > 0 ? (
            <div className="space-y-2">
              {revenueData.monthly.map((m: any) => (
                <Card key={m.month}>
                  <CardContent className="p-3 flex items-center justify-between">
                    <div>
                      <p className="font-medium text-sm">{m.month}</p>
                      <p className="text-xs text-muted-foreground">{m.sales} sales</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-bold text-green-600">
                        +${Number(m.fees).toFixed(2)} <span className="text-[10px] font-normal text-muted-foreground">fees</span>
                      </p>
                      <p className="text-xs text-muted-foreground">
                        ${Number(m.revenue).toFixed(2)} total
                      </p>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No completed transactions yet.</p>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
