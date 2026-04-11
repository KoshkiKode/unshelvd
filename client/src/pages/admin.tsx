import { useAuth } from "@/hooks/use-auth";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Shield,
  Users,
  Book,
  Library,
  ShoppingCart,
  DollarSign,
  AlertTriangle,
  TrendingUp,
  RefreshCw,
  Ban,
  CheckCircle,
  Loader2,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useState } from "react";

interface StatCardProps {
  title: string;
  value: string | number;
  icon: React.ElementType;
  color: string;
  sub?: string;
}

function StatCard({ title, value, icon: Icon, color, sub }: StatCardProps) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        <Icon className={`h-4 w-4 text-muted-foreground ${color}`} />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
        {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
      </CardContent>
    </Card>
  );
}

interface AdminOverview {
  users: number;
  newUsersLast7Days: number;
  books: number;
  activeListings: number;
  catalog: number;
  works: number;
  requests: number;
  messages: number;
  transactions: {
    total: number;
    completed: number;
    pending: number;
    paid: number;
    shipped: number;
    disputed: number;
  };
  revenue: {
    totalSales: string;
    platformFees: string;
    sellerPayouts: string;
  };
}

const TX_STATUS_COLORS: Record<string, string> = {
  pending: "bg-yellow-100 text-yellow-800",
  paid: "bg-blue-100 text-blue-800",
  shipped: "bg-purple-100 text-purple-800",
  completed: "bg-green-100 text-green-800",
  disputed: "bg-red-100 text-red-800",
  refunded: "bg-gray-100 text-gray-700",
  failed: "bg-red-50 text-red-600",
};

export default function AdminDashboard() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // ── Overview ──
  const { data: overview, isLoading: overviewLoading } = useQuery<AdminOverview>({
    queryKey: ["/api/admin/overview"],
    enabled: user?.role === "admin",
  });

  // ── Transactions ──
  const [txStatus, setTxStatus] = useState("all");
  const [txPage, setTxPage] = useState(0);
  const TX_LIMIT = 25;
  const { data: txData, isLoading: txLoading } = useQuery<{ transactions: any[]; total: number }>({
    queryKey: [`/api/admin/transactions?limit=${TX_LIMIT}&offset=${txPage * TX_LIMIT}${txStatus !== "all" ? `&status=${txStatus}` : ""}`],
    enabled: user?.role === "admin",
  });

  const disputeMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest("POST", `/api/admin/transactions/${id}/dispute`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/transactions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/overview"] });
      toast({ title: "Transaction marked as disputed" });
    },
    onError: (err: Error) => toast({ title: "Failed", description: err.message, variant: "destructive" }),
  });

  const refundMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest("POST", `/api/admin/transactions/${id}/refund`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/transactions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/overview"] });
      toast({ title: "Transaction refunded" });
    },
    onError: (err: Error) => toast({ title: "Refund failed", description: err.message, variant: "destructive" }),
  });

  // ── Users ──
  const [userPage, setUserPage] = useState(0);
  const USER_LIMIT = 25;
  const { data: usersData, isLoading: usersLoading } = useQuery<{ users: any[]; total: number }>({
    queryKey: [`/api/admin/users?limit=${USER_LIMIT}&offset=${userPage * USER_LIMIT}`],
    enabled: user?.role === "admin",
  });

  const suspendMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest("POST", `/api/admin/users/${id}/suspend`);
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      toast({ title: data.message });
    },
    onError: (err: Error) => toast({ title: "Failed", description: err.message, variant: "destructive" }),
  });

  // ── Revenue ──
  const { data: revenueData, isLoading: revenueLoading } = useQuery<{
    monthly: { month: string; sales: number; revenue: number; fees: number; payouts: number }[];
    pendingPayouts: { count: number; total: string };
  }>({
    queryKey: ["/api/admin/revenue"],
    enabled: user?.role === "admin",
  });

  // ── Seeder ──
  const [seedQueries, setSeedQueries] = useState("");
  const [seeding, setSeeding] = useState(false);

  const handleSeed = async () => {
    const lines = seedQueries.split("\n").map((l) => l.trim()).filter(Boolean);
    if (lines.length === 0) {
      toast({ title: "Please enter at least one query", variant: "destructive" });
      return;
    }
    setSeeding(true);
    try {
      const res = await apiRequest("POST", "/api/admin/seed", { queries: lines });
      const data = await res.json();
      toast({ title: "Seeder started", description: data.message });
    } catch (err: any) {
      toast({ title: "Seeder failed", description: err.message, variant: "destructive" });
    } finally {
      setSeeding(false);
    }
  };

  if (user?.role !== "admin") {
    return (
      <div className="container mx-auto max-w-2xl py-16 text-center">
        <Shield className="h-12 w-12 mx-auto text-destructive mb-4" />
        <h1 className="font-serif text-2xl font-bold">Access Denied</h1>
        <p className="text-muted-foreground">
          You do not have permission to view this page.
        </p>
      </div>
    );
  }

  return (
    <div className="container mx-auto max-w-5xl py-8 px-4">
      <h1 className="font-serif text-3xl font-bold mb-6">Admin Dashboard</h1>

      <Tabs defaultValue="overview">
        <TabsList className="mb-6 flex-wrap h-auto gap-1">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="transactions">Transactions</TabsTrigger>
          <TabsTrigger value="users">Users</TabsTrigger>
          <TabsTrigger value="revenue">Revenue</TabsTrigger>
          <TabsTrigger value="seeder">Catalog Seeder</TabsTrigger>
        </TabsList>

        {/* ─── OVERVIEW ─── */}
        <TabsContent value="overview">
          {overviewLoading ? (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-28" />)}
            </div>
          ) : overview ? (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              <StatCard title="Total Users" value={overview.users} icon={Users} color="text-blue-500" sub={`+${overview.newUsersLast7Days} this week`} />
              <StatCard title="Active Listings" value={overview.activeListings} icon={ShoppingCart} color="text-green-500" sub={`${overview.books} total books`} />
              <StatCard title="Catalog Entries" value={overview.catalog.toLocaleString()} icon={Library} color="text-purple-500" />
              <StatCard title="Total Works" value={overview.works.toLocaleString()} icon={Book} color="text-indigo-500" />
              <StatCard title="Total Sales" value={`$${overview.revenue.totalSales}`} icon={DollarSign} color="text-emerald-500" />
              <StatCard title="Platform Fees" value={`$${overview.revenue.platformFees}`} icon={TrendingUp} color="text-teal-500" />
              <StatCard title="Pending Payouts" value={`$${overview.revenue.sellerPayouts}`} icon={DollarSign} color="text-amber-500" />
              <StatCard title="Disputed" value={overview.transactions.disputed} icon={AlertTriangle} color="text-red-500" sub={`${overview.transactions.total} total transactions`} />
            </div>
          ) : (
            <p className="text-muted-foreground">Could not load overview data.</p>
          )}
        </TabsContent>

        {/* ─── TRANSACTIONS ─── */}
        <TabsContent value="transactions">
          <div className="flex items-center gap-3 mb-4">
            <Select value={txStatus} onValueChange={(v) => { setTxStatus(v); setTxPage(0); }}>
              <SelectTrigger className="w-40">
                <SelectValue placeholder="All statuses" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="paid">Paid</SelectItem>
                <SelectItem value="shipped">Shipped</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
                <SelectItem value="disputed">Disputed</SelectItem>
                <SelectItem value="refunded">Refunded</SelectItem>
              </SelectContent>
            </Select>
            {txData && <span className="text-sm text-muted-foreground">{txData.total} total</span>}
          </div>

          {txLoading ? (
            <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}</div>
          ) : txData?.transactions.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">No transactions found.</p>
          ) : (
            <div className="space-y-2">
              {txData!.transactions.map((tx) => (
                <div key={tx.id} className="flex items-center gap-3 p-3 border rounded-lg bg-card text-sm">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium">#{tx.id}</span>
                      <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${TX_STATUS_COLORS[tx.status] ?? "bg-gray-100 text-gray-700"}`}>
                        {tx.status}
                      </span>
                      <span className="font-semibold text-green-700">${tx.amount?.toFixed(2)}</span>
                    </div>
                    <p className="text-xs text-muted-foreground truncate">
                      {tx.book?.title ?? "Unknown book"}
                      {" · "}Buyer: {tx.buyer?.username ?? tx.buyerId}
                      {" · "}Seller: {tx.seller?.username ?? tx.sellerId}
                    </p>
                    <p className="text-[10px] text-muted-foreground">
                      {tx.createdAt ? new Date(tx.createdAt).toLocaleDateString() : ""}
                    </p>
                  </div>
                  <div className="flex gap-1.5 shrink-0">
                    {tx.status !== "disputed" && tx.status !== "refunded" && tx.status !== "completed" && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-xs h-7 text-red-600 border-red-200 hover:bg-red-50"
                        onClick={() => disputeMutation.mutate(tx.id)}
                        disabled={disputeMutation.isPending}
                      >
                        <AlertTriangle className="h-3 w-3 mr-1" />
                        Dispute
                      </Button>
                    )}
                    {["pending", "paid", "shipped", "disputed"].includes(tx.status) && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-xs h-7"
                        onClick={() => refundMutation.mutate(tx.id)}
                        disabled={refundMutation.isPending}
                      >
                        <RefreshCw className="h-3 w-3 mr-1" />
                        Refund
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Pagination */}
          {txData && txData.total > TX_LIMIT && (
            <div className="flex items-center justify-between mt-4">
              <Button size="sm" variant="outline" disabled={txPage === 0} onClick={() => setTxPage((p) => p - 1)}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="text-sm text-muted-foreground">
                Page {txPage + 1} of {Math.ceil(txData.total / TX_LIMIT)}
              </span>
              <Button size="sm" variant="outline" disabled={(txPage + 1) * TX_LIMIT >= txData.total} onClick={() => setTxPage((p) => p + 1)}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          )}
        </TabsContent>

        {/* ─── USERS ─── */}
        <TabsContent value="users">
          {usersLoading ? (
            <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}</div>
          ) : usersData?.users.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">No users found.</p>
          ) : (
            <div className="space-y-2">
              {usersData!.users.map((u) => (
                <div key={u.id} className="flex items-center gap-3 p-3 border rounded-lg bg-card text-sm">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium">{u.displayName}</span>
                      <span className="text-muted-foreground">@{u.username}</span>
                      {u.role === "admin" && <Badge variant="secondary" className="text-[10px] h-4">admin</Badge>}
                      {u.role === "suspended" && <Badge variant="destructive" className="text-[10px] h-4">suspended</Badge>}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {u.email}
                      {" · "}⭐ {u.rating?.toFixed(1) ?? "0.0"}
                      {" · "}{u.totalSales ?? 0} sales
                      {" · "}Joined {u.createdAt ? new Date(u.createdAt).toLocaleDateString() : "—"}
                    </p>
                  </div>
                  {u.role !== "admin" && (
                    <Button
                      size="sm"
                      variant="outline"
                      className={`text-xs h-7 shrink-0 ${u.role === "suspended" ? "text-green-600 border-green-200 hover:bg-green-50" : "text-red-600 border-red-200 hover:bg-red-50"}`}
                      onClick={() => suspendMutation.mutate(u.id)}
                      disabled={suspendMutation.isPending}
                    >
                      {u.role === "suspended" ? (
                        <><CheckCircle className="h-3 w-3 mr-1" />Unsuspend</>
                      ) : (
                        <><Ban className="h-3 w-3 mr-1" />Suspend</>
                      )}
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Pagination */}
          {usersData && usersData.total > USER_LIMIT && (
            <div className="flex items-center justify-between mt-4">
              <Button size="sm" variant="outline" disabled={userPage === 0} onClick={() => setUserPage((p) => p - 1)}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="text-sm text-muted-foreground">
                Page {userPage + 1} of {Math.ceil(usersData.total / USER_LIMIT)}
              </span>
              <Button size="sm" variant="outline" disabled={(userPage + 1) * USER_LIMIT >= usersData.total} onClick={() => setUserPage((p) => p + 1)}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          )}
        </TabsContent>

        {/* ─── REVENUE ─── */}
        <TabsContent value="revenue">
          {revenueLoading ? (
            <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
          ) : revenueData ? (
            <div className="space-y-6">
              {/* Pending payouts summary */}
              <Card>
                <CardContent className="pt-4">
                  <p className="text-sm font-medium mb-1">Pending Seller Payouts</p>
                  <p className="text-2xl font-bold">${revenueData.pendingPayouts.total}</p>
                  <p className="text-xs text-muted-foreground">{revenueData.pendingPayouts.count} transaction{revenueData.pendingPayouts.count !== 1 ? "s" : ""} awaiting delivery confirmation</p>
                </CardContent>
              </Card>

              {/* Monthly breakdown table */}
              {revenueData.monthly.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">No completed transactions yet.</p>
              ) : (
                <div className="overflow-x-auto rounded-lg border">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-muted/50 text-left">
                        <th className="px-4 py-2 font-medium">Month</th>
                        <th className="px-4 py-2 font-medium text-right">Sales</th>
                        <th className="px-4 py-2 font-medium text-right">Revenue</th>
                        <th className="px-4 py-2 font-medium text-right">Platform Fees</th>
                        <th className="px-4 py-2 font-medium text-right">Seller Payouts</th>
                      </tr>
                    </thead>
                    <tbody>
                      {revenueData.monthly.map((row) => (
                        <tr key={row.month} className="border-t">
                          <td className="px-4 py-2 font-mono">{row.month}</td>
                          <td className="px-4 py-2 text-right">{row.sales}</td>
                          <td className="px-4 py-2 text-right">${Number(row.revenue).toFixed(2)}</td>
                          <td className="px-4 py-2 text-right text-green-700">${Number(row.fees).toFixed(2)}</td>
                          <td className="px-4 py-2 text-right text-amber-700">${Number(row.payouts).toFixed(2)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          ) : (
            <p className="text-muted-foreground">Could not load revenue data.</p>
          )}
        </TabsContent>

        {/* ─── SEEDER ─── */}
        <TabsContent value="seeder">
          <Card>
            <CardHeader>
              <CardTitle>Catalog Seeder</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground mb-4">
                Enter a list of search queries (one per line) to seed the master
                book catalog from Open Library. This process runs in the background.
              </p>
              <Textarea
                placeholder={"e.g.\nancient greek philosophy\nsanskrit texts\n17th century manuscripts"}
                className="min-h-[120px] font-mono text-sm"
                value={seedQueries}
                onChange={(e) => setSeedQueries(e.target.value)}
              />
              <Button className="mt-4" onClick={handleSeed} disabled={seeding}>
                {seeding ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Library className="h-4 w-4 mr-2" />
                )}
                {seeding ? "Starting..." : "Run Seeder"}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
