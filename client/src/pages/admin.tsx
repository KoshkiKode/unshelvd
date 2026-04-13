import { useAuth } from "@/hooks/use-auth";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
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
  CreditCard,
  Wallet,
  Settings,
  Save,
  Eye,
  EyeOff,
  ToggleLeft,
  ToggleRight,
  Mail,
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
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
import { useState, useEffect } from "react";

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

interface AdminTransaction {
  id: number;
  amount: number;
  platformFee: number;
  sellerPayout: number;
  status: string;
  createdAt: string | null;
  buyer: { id: number; username: string; displayName: string; email: string } | null;
  seller: { id: number; username: string; displayName: string; email: string } | null;
  book: { id: number; title: string; author: string } | null;
}

interface AdminUser {
  id: number;
  username: string;
  displayName: string;
  email: string;
  role: string | null;
  rating: number | null;
  totalSales: number | null;
  totalPurchases: number | null;
  createdAt: string | null;
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
  const { data: txData, isLoading: txLoading } = useQuery<{ transactions: AdminTransaction[]; total: number }>({
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

  // ── Dispute resolution ──
  const [resolveDisputeTx, setResolveDisputeTx] = useState<AdminTransaction | null>(null);
  const resolveDisputeMutation = useMutation({
    mutationFn: async ({ id, resolution }: { id: number; resolution: "refund_buyer" | "release_to_seller" }) => {
      const res = await apiRequest("POST", `/api/admin/disputes/${id}/resolve`, { resolution });
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/transactions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/overview"] });
      setResolveDisputeTx(null);
      toast({ title: data.message });
    },
    onError: (err: Error) => toast({ title: "Resolve failed", description: err.message, variant: "destructive" }),
  });

  // ── Users ──
  const [userPage, setUserPage] = useState(0);
  const USER_LIMIT = 25;
  const { data: usersData, isLoading: usersLoading } = useQuery<{ users: AdminUser[]; total: number }>({
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

  // ── Platform Settings / Integrations ──
  const { data: settingsData, isLoading: settingsLoading } = useQuery<Record<string, string | null>>({
    queryKey: ["/api/admin/settings"],
    enabled: user?.role === "admin",
  });

  // Local form state for integrations (initialised once settings load)
  const [stripeEnabled, setStripeEnabled] = useState(false);
  const [stripePublishableKey, setStripePublishableKey] = useState("");
  const [stripeSecretKey, setStripeSecretKey] = useState("");
  const [stripeWebhookSecret, setStripeWebhookSecret] = useState("");

  const [paypalEnabled, setPaypalEnabled] = useState(false);
  const [paypalClientId, setPaypalClientId] = useState("");
  const [paypalClientSecret, setPaypalClientSecret] = useState("");
  const [paypalMode, setPaypalMode] = useState("sandbox");
  const [paypalWebhookId, setPaypalWebhookId] = useState("");

  const [emailEnabled, setEmailEnabled] = useState(true);
  const [emailSmtpHost, setEmailSmtpHost] = useState("");
  const [emailSmtpPort, setEmailSmtpPort] = useState("587");
  const [emailSmtpUser, setEmailSmtpUser] = useState("");
  const [emailSmtpPass, setEmailSmtpPass] = useState("");
  const [emailFrom, setEmailFrom] = useState("");

  const [platformFee, setPlatformFee] = useState("10");
  const [maintenanceMode, setMaintenanceMode] = useState(false);
  const [registrationsEnabled, setRegistrationsEnabled] = useState(true);

  // Populate form fields when settings arrive (use useEffect to avoid rendering side-effects)
  useEffect(() => {
    if (!settingsData) return;
    setStripeEnabled(settingsData.stripe_enabled === "true");
    setStripePublishableKey(settingsData.stripe_publishable_key ?? "");
    setStripeSecretKey(settingsData.stripe_secret_key ?? "");
    setStripeWebhookSecret(settingsData.stripe_webhook_secret ?? "");
    setPaypalEnabled(settingsData.paypal_enabled === "true");
    setPaypalClientId(settingsData.paypal_client_id ?? "");
    setPaypalClientSecret(settingsData.paypal_client_secret ?? "");
    setPaypalMode(settingsData.paypal_mode ?? "sandbox");
    setPaypalWebhookId(settingsData.paypal_webhook_id ?? "");
    setEmailEnabled(settingsData.email_enabled !== "false");
    setEmailSmtpHost(settingsData.email_smtp_host ?? "");
    setEmailSmtpPort(settingsData.email_smtp_port ?? "587");
    setEmailSmtpUser(settingsData.email_smtp_user ?? "");
    setEmailSmtpPass(settingsData.email_smtp_pass ?? "");
    setEmailFrom(settingsData.email_from ?? "");
    setPlatformFee(settingsData.platform_fee_percent ?? "10");
    setMaintenanceMode(settingsData.maintenance_mode === "true");
    setRegistrationsEnabled(settingsData.registrations_enabled !== "false");
  }, [settingsData]);

  // Show/hide secret fields
  const [showStripeSecret, setShowStripeSecret] = useState(false);
  const [showStripeWebhook, setShowStripeWebhook] = useState(false);
  const [showPaypalSecret, setShowPaypalSecret] = useState(false);
  const [showEmailPass, setShowEmailPass] = useState(false);

  const saveSettingsMutation = useMutation({
    mutationFn: async (payload: Record<string, string>) => {
      const res = await apiRequest("PUT", "/api/admin/settings", payload);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/settings"] });
      toast({ title: "Settings saved" });
    },
    onError: (err: Error) => toast({ title: "Save failed", description: err.message, variant: "destructive" }),
  });

  const handleSaveStripe = () => {
    saveSettingsMutation.mutate({
      stripe_enabled: String(stripeEnabled),
      stripe_publishable_key: stripePublishableKey,
      stripe_secret_key: stripeSecretKey,
      stripe_webhook_secret: stripeWebhookSecret,
    });
  };

  const handleSavePayPal = () => {
    saveSettingsMutation.mutate({
      paypal_enabled: String(paypalEnabled),
      paypal_client_id: paypalClientId,
      paypal_client_secret: paypalClientSecret,
      paypal_mode: paypalMode,
      paypal_webhook_id: paypalWebhookId,
    });
  };

  const handleSaveEmail = () => {
    saveSettingsMutation.mutate({
      email_enabled: String(emailEnabled),
      email_smtp_host: emailSmtpHost,
      email_smtp_port: emailSmtpPort,
      email_smtp_user: emailSmtpUser,
      email_smtp_pass: emailSmtpPass,
      email_from: emailFrom,
    });
  };

  const handleSavePlatform = () => {
    saveSettingsMutation.mutate({
      platform_fee_percent: platformFee,
      maintenance_mode: String(maintenanceMode),
      registrations_enabled: String(registrationsEnabled),
    });
  };

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
          <TabsTrigger value="integrations">Integrations</TabsTrigger>
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
                      {" · "}Buyer: {tx.buyer?.username ?? tx.buyer?.id}
                      {" · "}Seller: {tx.seller?.username ?? tx.seller?.id}
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
                    {tx.status === "disputed" && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-xs h-7 text-blue-600 border-blue-200 hover:bg-blue-50"
                        onClick={() => setResolveDisputeTx(tx)}
                        disabled={resolveDisputeMutation.isPending}
                      >
                        <CheckCircle className="h-3 w-3 mr-1" />
                        Resolve
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

        {/* ─── INTEGRATIONS ─── */}
        <TabsContent value="integrations">
          {settingsLoading ? (
            <div className="space-y-4">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-48" />)}</div>
          ) : (
            <div className="space-y-6">

              {/* ── Stripe ── */}
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <CreditCard className="h-5 w-5 text-indigo-500" />
                      <CardTitle>Stripe</CardTitle>
                    </div>
                    <div className="flex items-center gap-2">
                      <Label htmlFor="stripe-toggle" className="text-sm text-muted-foreground">
                        {stripeEnabled ? "Enabled" : "Disabled"}
                      </Label>
                      <Switch
                        id="stripe-toggle"
                        checked={stripeEnabled}
                        onCheckedChange={setStripeEnabled}
                      />
                    </div>
                  </div>
                  <CardDescription>
                    Accept credit and debit card payments via Stripe Connect.
                    Keys entered here override the environment variables set at deploy time.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <Label htmlFor="stripe-pk" className="text-xs font-medium">Publishable Key</Label>
                    <Input
                      id="stripe-pk"
                      placeholder="pk_live_... or pk_test_..."
                      value={stripePublishableKey}
                      onChange={(e) => setStripePublishableKey(e.target.value)}
                      className="mt-1 font-mono text-xs"
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                      Safe to expose in the browser. Also update your deployment's <code>_STRIPE_PK</code> build arg for the baked-in fallback.
                    </p>
                  </div>
                  <div>
                    <Label htmlFor="stripe-sk" className="text-xs font-medium">Secret Key</Label>
                    <div className="relative mt-1">
                      <Input
                        id="stripe-sk"
                        type={showStripeSecret ? "text" : "password"}
                        placeholder="sk_live_... or sk_test_..."
                        value={stripeSecretKey}
                        onChange={(e) => setStripeSecretKey(e.target.value)}
                        className="font-mono text-xs pr-10"
                      />
                      <button
                        type="button"
                        onClick={() => setShowStripeSecret((v) => !v)}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      >
                        {showStripeSecret ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      Leave blank to keep the existing key. The current key is shown masked.
                    </p>
                  </div>
                  <div>
                    <Label htmlFor="stripe-wh" className="text-xs font-medium">Webhook Secret</Label>
                    <div className="relative mt-1">
                      <Input
                        id="stripe-wh"
                        type={showStripeWebhook ? "text" : "password"}
                        placeholder="whsec_..."
                        value={stripeWebhookSecret}
                        onChange={(e) => setStripeWebhookSecret(e.target.value)}
                        className="font-mono text-xs pr-10"
                      />
                      <button
                        type="button"
                        onClick={() => setShowStripeWebhook((v) => !v)}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      >
                        {showStripeWebhook ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>
                  <Button
                    onClick={handleSaveStripe}
                    disabled={saveSettingsMutation.isPending}
                    className="mt-2"
                  >
                    {saveSettingsMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
                    Save Stripe Settings
                  </Button>
                </CardContent>
              </Card>

              {/* ── PayPal ── */}
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Wallet className="h-5 w-5 text-blue-500" />
                      <CardTitle>PayPal</CardTitle>
                    </div>
                    <div className="flex items-center gap-2">
                      <Label htmlFor="paypal-toggle" className="text-sm text-muted-foreground">
                        {paypalEnabled ? "Enabled" : "Disabled"}
                      </Label>
                      <Switch
                        id="paypal-toggle"
                        checked={paypalEnabled}
                        onCheckedChange={setPaypalEnabled}
                      />
                    </div>
                  </div>
                  <CardDescription>
                    Accept payments via PayPal. Uses the PayPal Orders v2 REST API.
                    Create an app at <a href="https://developer.paypal.com" target="_blank" rel="noreferrer" className="underline">developer.paypal.com</a>.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <Label htmlFor="paypal-mode" className="text-xs font-medium">Mode</Label>
                    <Select value={paypalMode} onValueChange={setPaypalMode}>
                      <SelectTrigger id="paypal-mode" className="mt-1 w-40">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="sandbox">Sandbox (testing)</SelectItem>
                        <SelectItem value="live">Live (production)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label htmlFor="paypal-cid" className="text-xs font-medium">Client ID</Label>
                    <Input
                      id="paypal-cid"
                      placeholder="AXxx..."
                      value={paypalClientId}
                      onChange={(e) => setPaypalClientId(e.target.value)}
                      className="mt-1 font-mono text-xs"
                    />
                  </div>
                  <div>
                    <Label htmlFor="paypal-csecret" className="text-xs font-medium">Client Secret</Label>
                    <div className="relative mt-1">
                      <Input
                        id="paypal-csecret"
                        type={showPaypalSecret ? "text" : "password"}
                        placeholder="EHxx..."
                        value={paypalClientSecret}
                        onChange={(e) => setPaypalClientSecret(e.target.value)}
                        className="font-mono text-xs pr-10"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPaypalSecret((v) => !v)}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      >
                        {showPaypalSecret ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">Leave blank to keep the existing secret.</p>
                  </div>
                  <div>
                    <Label htmlFor="paypal-webhook-id" className="text-xs font-medium">Webhook ID</Label>
                    <Input
                      id="paypal-webhook-id"
                      placeholder="From PayPal developer dashboard → Webhooks"
                      value={paypalWebhookId}
                      onChange={(e) => setPaypalWebhookId(e.target.value)}
                      className="mt-1 font-mono text-xs"
                    />
                    <p className="text-xs text-muted-foreground mt-1">Required for PayPal webhook signature verification.</p>
                  </div>
                  <Button
                    onClick={handleSavePayPal}
                    disabled={saveSettingsMutation.isPending}
                    className="mt-2"
                  >
                    {saveSettingsMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
                    Save PayPal Settings
                  </Button>
                </CardContent>
              </Card>

              {/* ── Email (SMTP) ── */}
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Mail className="h-5 w-5 text-orange-500" />
                      <CardTitle>Email</CardTitle>
                    </div>
                    <div className="flex items-center gap-2">
                      <Label htmlFor="email-toggle" className="text-sm text-muted-foreground">
                        {emailEnabled ? "Enabled" : "Disabled"}
                      </Label>
                      <Switch
                        id="email-toggle"
                        checked={emailEnabled}
                        onCheckedChange={setEmailEnabled}
                      />
                    </div>
                  </div>
                  <CardDescription>
                    Transactional emails (password resets, offers, shipping updates).
                    Supports any SMTP provider — Amazon SES is recommended since the domain is on Route 53.
                    When disabled or unconfigured, emails are printed to server logs only.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="col-span-2 sm:col-span-1">
                      <Label htmlFor="smtp-host" className="text-xs font-medium">SMTP Host</Label>
                      <Input
                        id="smtp-host"
                        placeholder="email-smtp.us-east-1.amazonaws.com"
                        value={emailSmtpHost}
                        onChange={(e) => setEmailSmtpHost(e.target.value)}
                        className="mt-1 font-mono text-xs"
                      />
                    </div>
                    <div className="col-span-2 sm:col-span-1">
                      <Label htmlFor="smtp-port" className="text-xs font-medium">SMTP Port</Label>
                      <Input
                        id="smtp-port"
                        placeholder="587"
                        value={emailSmtpPort}
                        onChange={(e) => setEmailSmtpPort(e.target.value)}
                        className="mt-1 font-mono text-xs w-28"
                      />
                      <p className="text-xs text-muted-foreground mt-1">587 (STARTTLS) or 465 (SSL)</p>
                    </div>
                  </div>
                  <div>
                    <Label htmlFor="smtp-user" className="text-xs font-medium">SMTP Username</Label>
                    <Input
                      id="smtp-user"
                      placeholder="AKIAIOSFODNN7EXAMPLE"
                      value={emailSmtpUser}
                      onChange={(e) => setEmailSmtpUser(e.target.value)}
                      className="mt-1 font-mono text-xs"
                    />
                  </div>
                  <div>
                    <Label htmlFor="smtp-pass" className="text-xs font-medium">SMTP Password</Label>
                    <div className="relative mt-1">
                      <Input
                        id="smtp-pass"
                        type={showEmailPass ? "text" : "password"}
                        placeholder="SES SMTP password"
                        value={emailSmtpPass}
                        onChange={(e) => setEmailSmtpPass(e.target.value)}
                        className="font-mono text-xs pr-10"
                      />
                      <button
                        type="button"
                        onClick={() => setShowEmailPass((v) => !v)}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      >
                        {showEmailPass ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">Leave blank to keep the existing password.</p>
                  </div>
                  <div>
                    <Label htmlFor="email-from" className="text-xs font-medium">From Address</Label>
                    <Input
                      id="email-from"
                      placeholder="Unshelv'd <noreply@koshkikode.com>"
                      value={emailFrom}
                      onChange={(e) => setEmailFrom(e.target.value)}
                      className="mt-1 font-mono text-xs"
                    />
                    <p className="text-xs text-muted-foreground mt-1">Must be a verified sender in your SMTP provider.</p>
                  </div>
                  <Button
                    onClick={handleSaveEmail}
                    disabled={saveSettingsMutation.isPending}
                    className="mt-2"
                  >
                    {saveSettingsMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
                    Save Email Settings
                  </Button>
                </CardContent>
              </Card>

              {/* ── Platform Feature Flags ── */}
              <Card>
                <CardHeader>
                  <div className="flex items-center gap-2">
                    <Settings className="h-5 w-5 text-gray-500" />
                    <CardTitle>Platform Settings</CardTitle>
                  </div>
                  <CardDescription>
                    Control platform behaviour without redeploying.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-5">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium">Maintenance Mode</p>
                      <p className="text-xs text-muted-foreground">
                        Shows a maintenance message to non-admin users. Admin access is unaffected.
                      </p>
                    </div>
                    <Switch
                      checked={maintenanceMode}
                      onCheckedChange={setMaintenanceMode}
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium">New Registrations</p>
                      <p className="text-xs text-muted-foreground">
                        Allow new users to create accounts.
                      </p>
                    </div>
                    <Switch
                      checked={registrationsEnabled}
                      onCheckedChange={setRegistrationsEnabled}
                    />
                  </div>
                  <div>
                    <Label htmlFor="platform-fee" className="text-xs font-medium">Platform Fee (%)</Label>
                    <div className="flex items-center gap-2 mt-1">
                      <Input
                        id="platform-fee"
                        type="number"
                        min={0}
                        max={100}
                        step={0.5}
                        value={platformFee}
                        onChange={(e) => setPlatformFee(e.target.value)}
                        className="w-28"
                      />
                      <span className="text-sm text-muted-foreground">% taken from each sale</span>
                    </div>
                  </div>
                  <Button
                    onClick={handleSavePlatform}
                    disabled={saveSettingsMutation.isPending}
                    className="mt-2"
                  >
                    {saveSettingsMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
                    Save Platform Settings
                  </Button>
                </CardContent>
              </Card>

            </div>
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

      {/* ── Resolve Dispute Dialog ── */}
      {resolveDisputeTx && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-background rounded-lg shadow-lg p-6 w-full max-w-md mx-4">
            <h2 className="text-lg font-semibold mb-1">Resolve Dispute</h2>
            <p className="text-sm text-muted-foreground mb-4">
              Transaction #{resolveDisputeTx.id} — <strong>{resolveDisputeTx.book?.title ?? "Unknown book"}</strong>
              <br />
              Buyer: {resolveDisputeTx.buyer?.username ?? resolveDisputeTx.buyer?.id}
              {" · "}
              Seller: {resolveDisputeTx.seller?.username ?? resolveDisputeTx.seller?.id}
              {" · "}
              <span className="text-green-700 font-medium">${resolveDisputeTx.amount?.toFixed(2)}</span>
            </p>
            <div className="flex flex-col gap-2">
              <Button
                variant="outline"
                className="justify-start text-left h-auto py-3 px-4"
                disabled={resolveDisputeMutation.isPending}
                onClick={() => resolveDisputeMutation.mutate({ id: resolveDisputeTx.id, resolution: "refund_buyer" })}
              >
                <RefreshCw className="h-4 w-4 mr-2 shrink-0 text-blue-600" />
                <div>
                  <div className="font-medium">Refund buyer</div>
                  <div className="text-xs text-muted-foreground">Issue a full refund to the buyer</div>
                </div>
              </Button>
              <Button
                variant="outline"
                className="justify-start text-left h-auto py-3 px-4"
                disabled={resolveDisputeMutation.isPending}
                onClick={() => resolveDisputeMutation.mutate({ id: resolveDisputeTx.id, resolution: "release_to_seller" })}
              >
                <CheckCircle className="h-4 w-4 mr-2 shrink-0 text-green-600" />
                <div>
                  <div className="font-medium">Release to seller</div>
                  <div className="text-xs text-muted-foreground">Release the payment to the seller</div>
                </div>
              </Button>
            </div>
            <div className="flex justify-end mt-4">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setResolveDisputeTx(null)}
                disabled={resolveDisputeMutation.isPending}
              >
                Cancel
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
