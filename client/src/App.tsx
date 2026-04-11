import { Switch, Route, Router } from "wouter";
import { useHashLocation } from "wouter/use-hash-location";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/hooks/use-auth";
import { I18nProvider } from "@/i18n/use-i18n";
import Navbar from "@/components/layout/navbar";
import Home from "@/pages/home";
import Browse from "@/pages/browse";
import Catalog from "@/pages/catalog";
import BookDetail from "@/pages/book-detail";
import UserProfile from "@/pages/user-profile";
import Requests from "@/pages/requests";
import Dashboard from "@/pages/dashboard";
import AddBook from "@/pages/add-book";
import Messages from "@/pages/messages";
import Offers from "@/pages/offers";
import { LoginPage, RegisterPage, ForgotPasswordPage, ResetPasswordPage } from "@/pages/auth";
import WorkPage from "@/pages/work";
import About from "@/pages/about";
import AdminDashboard from "@/pages/admin";
import NotFound from "@/pages/not-found";
import ConnectivityGuard from "@/components/connectivity-guard";
import Settings from "@/pages/settings";

function AppRouter() {
  return (
    <>
      <Navbar />
      <main>
        <Switch>
          <Route path="/" component={Home} />
          <Route path="/browse" component={Browse} />
          <Route path="/catalog" component={Catalog} />
          <Route path="/book/:id" component={BookDetail} />
          <Route path="/work/:id" component={WorkPage} />
          <Route path="/about" component={About} />
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
          <Route component={NotFound} />
        </Switch>
      </main>
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
