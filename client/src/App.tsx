import { lazy, Suspense } from "react";
import { Switch, Route, Router } from "wouter";
import { useHashLocation } from "wouter/use-hash-location";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/hooks/use-auth";
import { I18nProvider } from "@/i18n/use-i18n";
import Navbar from "@/components/layout/navbar";
import Footer from "@/components/layout/footer";
import ConnectivityGuard from "@/components/connectivity-guard";
import { Loader2 } from "lucide-react";

function PageLoader() {
  return (
    <div className="flex items-center justify-center min-h-[50vh]">
      <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
    </div>
  );
}

const Home = lazy(() => import("@/pages/home"));
const Browse = lazy(() => import("@/pages/browse"));
const Catalog = lazy(() => import("@/pages/catalog"));
const BookDetail = lazy(() => import("@/pages/book-detail"));
const UserProfile = lazy(() => import("@/pages/user-profile"));
const Requests = lazy(() => import("@/pages/requests"));
const Dashboard = lazy(() => import("@/pages/dashboard"));
const AddBook = lazy(() => import("@/pages/add-book"));
const Messages = lazy(() => import("@/pages/messages"));
const Offers = lazy(() => import("@/pages/offers"));
const WorkPage = lazy(() => import("@/pages/work"));
const About = lazy(() => import("@/pages/about"));
const AdminDashboard = lazy(() => import("@/pages/admin"));
const NotFound = lazy(() => import("@/pages/not-found"));
const Settings = lazy(() => import("@/pages/settings"));
const PayPalReturn = lazy(() => import("@/pages/paypal-return"));
const PayPalCancel = lazy(() => import("@/pages/paypal-cancel"));
const PrivacyPolicy = lazy(() => import("@/pages/privacy"));
const TermsOfService = lazy(() => import("@/pages/terms"));

// Auth pages share one chunk since they're usually visited together
const LoginPage = lazy(() =>
  import("@/pages/auth").then((m) => ({ default: m.LoginPage }))
);
const RegisterPage = lazy(() =>
  import("@/pages/auth").then((m) => ({ default: m.RegisterPage }))
);
const ForgotPasswordPage = lazy(() =>
  import("@/pages/auth").then((m) => ({ default: m.ForgotPasswordPage }))
);
const ResetPasswordPage = lazy(() =>
  import("@/pages/auth").then((m) => ({ default: m.ResetPasswordPage }))
);

function AppRouter() {
  return (
    <>
      <Navbar />
      <main>
        <Suspense fallback={<PageLoader />}>
          <Switch>
            <Route path="/" component={Home} />
            <Route path="/browse" component={Browse} />
            <Route path="/catalog" component={Catalog} />
            <Route path="/book/:id" component={BookDetail} />
            <Route path="/work/:id" component={WorkPage} />
            <Route path="/about" component={About} />
            <Route path="/privacy" component={PrivacyPolicy} />
            <Route path="/terms" component={TermsOfService} />
            <Route path="/user/:id" component={UserProfile} />
            <Route path="/requests" component={Requests} />
            <Route path="/dashboard" component={Dashboard} />
            <Route path="/dashboard/add-book" component={AddBook} />
            <Route path="/dashboard/settings" component={Settings} />
            <Route path="/dashboard/messages" component={Messages} />
            <Route path="/dashboard/offers" component={Offers} />
            <Route path="/admin" component={AdminDashboard} />
            <Route path="/login" component={LoginPage} />
            <Route path="/register" component={RegisterPage} />
            <Route path="/forgot-password" component={ForgotPasswordPage} />
            <Route path="/reset-password" component={ResetPasswordPage} />
            <Route path="/paypal/return" component={PayPalReturn} />
            <Route path="/paypal/cancel" component={PayPalCancel} />
            <Route component={NotFound} />
          </Switch>
        </Suspense>
      </main>
      <Footer />
    </>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <I18nProvider>
        <TooltipProvider>
          <Toaster />
          <Router hook={useHashLocation}>
            <ConnectivityGuard>
              <AuthProvider>
                <AppRouter />
              </AuthProvider>
            </ConnectivityGuard>
          </Router>
        </TooltipProvider>
      </I18nProvider>
    </QueryClientProvider>
  );
}

export default App;
