import { useState } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { BookOpen, Loader2, Check, X, Eye, EyeOff } from "lucide-react";
import { Link } from "wouter";
import { getPasswordStrength } from "@shared/password-policy";

/** Checks all minimum password requirements */
function meetsMinimumRequirements(password: string): boolean {
  return (
    password.length >= 12 &&
    /[A-Z\p{Lu}]/u.test(password) &&
    /[a-z\p{Ll}]/u.test(password) &&
    /\d/.test(password) &&
    /[^a-zA-Z0-9\s]/.test(password)
  );
}

export function LoginPage() {
  const { login } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await login(email, password);
      setLocation("/dashboard");
    } catch (err: any) {
      const msg = err.message?.replace(/^\d+:\s*/, "") || "Invalid email or password.";
      setError(msg);
      toast({ title: "Login failed", description: msg, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-[80vh] flex items-center justify-center px-4" data-testid="login-page">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          <BookOpen className="h-8 w-8 text-primary mx-auto mb-2" />
          <CardTitle className="font-serif text-2xl">Welcome back</CardTitle>
          <p className="text-sm text-muted-foreground">Sign in to your Unshelv'd account</p>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <p className="text-sm text-destructive bg-destructive/10 rounded-md px-3 py-2" data-testid="login-error">
                {error}
              </p>
            )}
            <div>
              <label className="text-sm font-medium mb-1 block">Email</label>
              <Input
                type="email"
                value={email}
                onChange={(e) => { setEmail(e.target.value); setError(""); }}
                placeholder="you@example.com"
                required
                autoComplete="email"
                data-testid="login-email"
              />
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Password</label>
              <div className="relative">
                <Input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => { setPassword(e.target.value); setError(""); }}
                  placeholder="Your password"
                  required
                  autoComplete="current-password"
                  className="pr-10"
                  data-testid="login-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
            <Button type="submit" className="w-full" disabled={loading} data-testid="login-submit">
              {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Sign In
            </Button>
          </form>
          <p className="text-sm text-center text-muted-foreground mt-4">
            Don't have an account?{" "}
            <Link href="/register" className="text-primary hover:underline" data-testid="link-register">
              Register
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

export function RegisterPage() {
  const { register } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [form, setForm] = useState({ username: "", displayName: "", email: "", password: "" });
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const passwordsMatch = form.password === confirmPassword;
  const passwordOk = meetsMinimumRequirements(form.password);
  const canSubmit =
    !loading &&
    form.username.trim().length >= 3 &&
    form.displayName.trim().length >= 1 &&
    form.email.includes("@") &&
    passwordOk &&
    passwordsMatch;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setError("");
    setLoading(true);
    try {
      await register(form);
      setLocation("/dashboard");
    } catch (err: any) {
      const msg = err.message?.replace(/^\d+:\s*/, "") || "Registration failed. Please try again.";
      setError(msg);
      toast({ title: "Registration failed", description: msg, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const strength = getPasswordStrength(form.password);

  return (
    <div className="min-h-[80vh] flex items-center justify-center px-4 py-8" data-testid="register-page">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          <BookOpen className="h-8 w-8 text-primary mx-auto mb-2" />
          <CardTitle className="font-serif text-2xl">Join Unshelv'd</CardTitle>
          <p className="text-sm text-muted-foreground">Create your account and start trading books</p>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <p className="text-sm text-destructive bg-destructive/10 rounded-md px-3 py-2" data-testid="register-error">
                {error}
              </p>
            )}
            <div>
              <label className="text-sm font-medium mb-1 block">Username</label>
              <Input
                value={form.username}
                onChange={(e) => { setForm({ ...form, username: e.target.value }); setError(""); }}
                placeholder="booklover42"
                required
                autoComplete="username"
                minLength={3}
                maxLength={30}
                data-testid="register-username"
              />
              {form.username.length > 0 && form.username.length < 3 && (
                <p className="text-[11px] text-destructive mt-1">At least 3 characters</p>
              )}
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Display Name</label>
              <Input
                value={form.displayName}
                onChange={(e) => { setForm({ ...form, displayName: e.target.value }); setError(""); }}
                placeholder="Jane Doe"
                required
                autoComplete="name"
                data-testid="register-displayname"
              />
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Email</label>
              <Input
                type="email"
                value={form.email}
                onChange={(e) => { setForm({ ...form, email: e.target.value }); setError(""); }}
                placeholder="you@example.com"
                required
                autoComplete="email"
                data-testid="register-email"
              />
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Password</label>
              <div className="relative">
                <Input
                  type={showPassword ? "text" : "password"}
                  value={form.password}
                  onChange={(e) => { setForm({ ...form, password: e.target.value }); setError(""); }}
                  placeholder="At least 12 characters"
                  required
                  autoComplete="new-password"
                  className="pr-10"
                  data-testid="register-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {/* Password strength bar + requirements */}
              {form.password.length > 0 && (
                <div className="mt-2 space-y-1">
                  <div className="flex gap-1">
                    {[0, 1, 2, 3].map((i) => (
                      <div
                        key={i}
                        className={`h-1 flex-1 rounded-full transition-colors ${
                          i < strength.score ? "bg-primary" : "bg-muted"
                        }`}
                      />
                    ))}
                  </div>
                  <p className={`text-[10px] ${strength.color}`}>{strength.label}</p>
                  <ul className="text-[10px] text-muted-foreground space-y-0.5">
                    {[
                      { label: "12+ characters", ok: form.password.length >= 12 },
                      { label: "Uppercase letter", ok: /[A-Z\p{Lu}]/u.test(form.password) },
                      { label: "Lowercase letter", ok: /[a-z\p{Ll}]/u.test(form.password) },
                      { label: "Number", ok: /\d/.test(form.password) },
                      { label: "Symbol (!@#$%^&*)", ok: /[^a-zA-Z0-9\s]/.test(form.password) },
                    ].map(({ label, ok }) => (
                      <li key={label} className={ok ? "text-green-600" : ""}>
                        {ok
                          ? <Check className="h-2.5 w-2.5 inline mr-1" />
                          : <X className="h-2.5 w-2.5 inline mr-1" />}
                        {label}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Confirm Password</label>
              <div className="relative">
                <Input
                  type={showConfirm ? "text" : "password"}
                  value={confirmPassword}
                  onChange={(e) => { setConfirmPassword(e.target.value); setError(""); }}
                  placeholder="Re-enter your password"
                  required
                  autoComplete="new-password"
                  className="pr-10"
                  data-testid="register-confirm-password"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirm((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  aria-label={showConfirm ? "Hide password" : "Show password"}
                  tabIndex={-1}
                >
                  {showConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {confirmPassword.length > 0 && !passwordsMatch && (
                <p className="text-[11px] text-destructive mt-1">Passwords do not match</p>
              )}
            </div>
            <Button
              type="submit"
              className="w-full"
              disabled={!canSubmit}
              data-testid="register-submit"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Create Account
            </Button>
          </form>
          <p className="text-sm text-center text-muted-foreground mt-4">
            Already have an account?{" "}
            <Link href="/login" className="text-primary hover:underline" data-testid="link-login">
              Sign in
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
