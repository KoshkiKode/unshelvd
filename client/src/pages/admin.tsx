import { useAuth } from "@/hooks/use-auth";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Shield,
  Users,
  Book,
  Library,
  ShoppingCart,
  DollarSign,
  AlertTriangle,
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

interface StatCardProps {
  title: string;
  value: string | number;
  icon: React.ElementType;
  color: string;
}

function StatCard({ title, value, icon: Icon, color }: StatCardProps) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        <Icon className={`h-4 w-4 text-muted-foreground ${color}`} />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
      </CardContent>
    </Card>
  );
}

export default function AdminDashboard() {
  const { user } = useAuth();
  const { data, isLoading } = useQuery({
    queryKey: ["/api/admin/overview"],
    enabled: user?.role === "admin",
  });

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
    <div className="container mx-auto max-w-4xl py-8">
      <h1 className="font-serif text-3xl font-bold mb-6">Admin Dashboard</h1>

      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Skeleton className="h-28" />
          <Skeleton className="h-28" />
          <Skeleton className="h-28" />
          <Skeleton className="h-28" />
        </div>
      ) : data ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <StatCard
            title="Total Users"
            value={data.users}
            icon={Users}
            color="text-blue-500"
          />
          <StatCard
            title="Active Listings"
            value={data.activeListings}
            icon={ShoppingCart}
            color="text-green-500"
          />
          <StatCard
            title="Catalog Entries"
            value={data.catalog.toLocaleString()}
            icon={Library}
            color="text-purple-500"
          />
          <StatCard
            title="Total Works"
            value={data.works.toLocaleString()}
            icon={Book}
            color="text-indigo-500"
          />
          <StatCard
            title="Total Sales"
            value={`$${data.revenue.totalSales}`}
            icon={DollarSign}
            color="text-emerald-500"
          />
          <StatCard
            title="Platform Fees"
            value={`$${data.revenue.platformFees}`}
            icon={DollarSign}
            color="text-teal-500"
          />
          <StatCard
            title="Pending Payouts"
            value={`$${data.revenue.sellerPayouts}`}
            icon={DollarSign}
            color="text-amber-500"
          />
          <StatCard
            title="Disputed Transactions"
            value={data.transactions.disputed}
            icon={AlertTriangle}
            color="text-red-500"
          />
        </div>
      ) : (
        <p>Could not load admin overview data.</p>
      )}

      {/* Catalog Seeder */}
      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Catalog Seeder</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground mb-4">
            Enter a list of search queries (one per line) to seed the master
            book catalog from Open Library. This process will run in the
            background.
          </p>
          <Textarea
            placeholder="e.g.&#10;ancient greek philosophy&#10;sanskrit texts&#10;17th century manuscripts"
            className="min-h-[120px] font-mono text-sm"
          />
          <Button className="mt-4">
            <Library className="h-4 w-4 mr-2" />
            Run Seeder
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
