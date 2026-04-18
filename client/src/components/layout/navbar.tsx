import { Link, useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { BookOpen, Menu, MessageSquare, Search, LayoutDashboard, User, LogOut, Sun, Moon, Info, Globe2, Shield, Library, Settings, Mail } from "lucide-react";
import { useState } from "react";
import { useI18n } from "@/i18n/use-i18n";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import type { Locale } from "@/i18n/translations";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { LucideIcon } from "lucide-react";

interface NavLink {
  href: string;
  label: string;
  icon: LucideIcon;
  badge?: number;
}

export default function Navbar() {
  const { user, logout } = useAuth();
  const [location] = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const { toast } = useToast();
  const [dark, setDark] = useState(() => {
    try {
      return localStorage.getItem("theme") === "dark";
    } catch {
      return document.documentElement.classList.contains("dark");
    }
  });
  const { t, locale, setLocale, locales } = useI18n();

  const toggleDark = () => {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle("dark", next);
    try {
      localStorage.setItem("theme", next ? "dark" : "light");
    } catch {}
  };

  const { data: unreadData } = useQuery<{ count: number }>({
    queryKey: ["/api/messages/unread/count"],
    enabled: !!user,
    refetchInterval: 15000,
  });

  const resendMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/auth/resend-verification");
      return await res.json();
    },
    onSuccess: () => {
      toast({ title: "Verification email sent", description: "Check your inbox for the verification link." });
    },
    onError: () => {
      toast({ title: "Failed to send", description: "Please try again later.", variant: "destructive" });
    },
  });

  const unreadCount = unreadData?.count || 0;

  const navLinks: NavLink[] = [
    { href: "/browse", label: "Browse", icon: Search },
    { href: "/catalog", label: "Catalog", icon: Library },
    { href: "/requests", label: "Requests", icon: BookOpen },
    { href: "/about", label: "About", icon: Info },
  ];

  const authLinks: NavLink[] = user
    ? [
        { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
        {
          href: "/dashboard/messages",
          label: "Messages",
          icon: MessageSquare,
          badge: unreadCount,
        },
        { href: `/user/${user.id}`, label: "Profile", icon: User },
        { href: "/dashboard/settings", label: "Settings", icon: Settings },
        // Admin link (only visible to admins)
        ...(user.role === "admin" ? [{ href: "/admin", label: "Admin", icon: Shield }] : []),
      ]
    : [];

  const isActive = (path: string) => location === path;

  return (
    <header className="sticky top-0 z-50 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80" data-testid="navbar">
      <nav className="container mx-auto flex h-14 items-center justify-between px-4">
        <Link href="/" className="flex items-center gap-2 mr-6" data-testid="nav-logo">
          <BookOpen className="h-5 w-5 text-primary" />
          <span className="font-serif text-lg font-bold tracking-tight">Unshelv'd</span>
        </Link>

        {/* Desktop nav */}
        <div className="hidden md:flex items-center gap-1 flex-1">
          {navLinks.map((link) => (
            <Link key={link.href} href={link.href}>
              <Button
                variant={isActive(link.href) ? "secondary" : "ghost"}
                size="sm"
                className="text-sm"
                data-testid={`nav-${link.label.toLowerCase()}`}
              >
                {link.label}
              </Button>
            </Link>
          ))}
        </div>

        <div className="hidden md:flex items-center gap-1">
          {/* Language selector */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8" data-testid="language-selector">
                <Globe2 className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="max-h-80 overflow-y-auto">
              {(Object.entries(locales) as [Locale, string][]).map(([code, name]) => (
                <DropdownMenuItem
                  key={code}
                  onClick={() => setLocale(code)}
                  className={locale === code ? "font-medium bg-muted" : ""}
                >
                  {name}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          <Button variant="ghost" size="icon" onClick={toggleDark} className="h-8 w-8" data-testid="theme-toggle">
            {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </Button>

          {authLinks.map((link) => (
            <Link key={link.href} href={link.href}>
              <Button
                variant={isActive(link.href) ? "secondary" : "ghost"}
                size="sm"
                className="relative text-sm"
                data-testid={`nav-${link.label.toLowerCase()}`}
              >
                <link.icon className="h-4 w-4 mr-1.5" />
                {link.label}
                {"badge" in link && link.badge ? (
                  <span className="absolute -top-1 -right-1 bg-primary text-primary-foreground text-[10px] font-bold rounded-full h-4 min-w-4 flex items-center justify-center px-1">
                    {link.badge}
                  </span>
                ) : null}
              </Button>
            </Link>
          ))}

          {user ? (
            <Button variant="ghost" size="sm" onClick={() => logout()} className="text-sm text-muted-foreground" data-testid="nav-logout">
              <LogOut className="h-4 w-4 mr-1.5" />
              Logout
            </Button>
          ) : (
            <div className="flex items-center gap-1">
              <Link href="/login">
                <Button variant="ghost" size="sm" className="text-sm" data-testid="nav-login">
                  Login
                </Button>
              </Link>
              <Link href="/register">
                <Button size="sm" className="text-sm" data-testid="nav-register">
                  Register
                </Button>
              </Link>
            </div>
          )}
        </div>

        {/* Mobile nav */}
        <div className="md:hidden flex items-center gap-1">
          <Button variant="ghost" size="icon" onClick={toggleDark} className="h-8 w-8">
            {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </Button>
          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8" data-testid="mobile-menu">
                <Menu className="h-5 w-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-72 p-6">
              <div className="flex flex-col gap-2 mt-6">
                {[...navLinks, ...authLinks].map((link) => (
                  <Link key={link.href} href={link.href} onClick={() => setMobileOpen(false)}>
                    <Button
                      variant={isActive(link.href) ? "secondary" : "ghost"}
                      className="w-full justify-start"
                    >
                      <link.icon className="h-4 w-4 mr-2" />
                      {link.label}
                      {"badge" in link && link.badge ? (
                        <span className="ml-auto bg-primary text-primary-foreground text-xs font-bold rounded-full h-5 min-w-5 flex items-center justify-center px-1">
                          {link.badge}
                        </span>
                      ) : null}
                    </Button>
                  </Link>
                ))}
                <div className="border-t my-2" />
                <div className="px-1">
                  <p className="text-xs font-medium text-muted-foreground mb-2">Language</p>
                  <select
                    value={locale}
                    onChange={(e) => setLocale(e.target.value as Locale)}
                    className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                    data-testid="mobile-language-selector"
                  >
                    {(Object.entries(locales) as [Locale, string][]).map(([code, name]) => (
                      <option key={code} value={code}>
                        {name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="border-t my-2" />
                {user ? (
                  <Button
                    variant="ghost"
                    className="w-full justify-start text-muted-foreground"
                    onClick={() => {
                      logout();
                      setMobileOpen(false);
                    }}
                  >
                    <LogOut className="h-4 w-4 mr-2" />
                    Logout
                  </Button>
                ) : (
                  <>
                    <Link href="/login" onClick={() => setMobileOpen(false)}>
                      <Button variant="ghost" className="w-full justify-start">Login</Button>
                    </Link>
                    <Link href="/register" onClick={() => setMobileOpen(false)}>
                      <Button className="w-full justify-start">Register</Button>
                    </Link>
                  </>
                )}
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </nav>
      {/* Email verification banner — shown to logged-in users who haven't verified yet */}
      {user && user.emailVerified === false && (
        <div className="bg-amber-50 dark:bg-amber-950/30 border-b border-amber-200 dark:border-amber-800 px-4 py-2">
          <div className="container mx-auto flex items-center justify-between gap-3 max-w-6xl">
            <div className="flex items-center gap-2 text-sm text-amber-800 dark:text-amber-300">
              <Mail className="h-4 w-4 flex-shrink-0" />
              <span>Please verify your email address to unlock all features.</span>
            </div>
            <Button
              size="sm"
              variant="outline"
              className="shrink-0 text-xs h-7 border-amber-400 text-amber-800 dark:text-amber-300 hover:bg-amber-100 dark:hover:bg-amber-900/30"
              onClick={() => resendMutation.mutate()}
              disabled={resendMutation.isPending}
            >
              Resend email
            </Button>
          </div>
        </div>
      )}
    </header>
  );
}
