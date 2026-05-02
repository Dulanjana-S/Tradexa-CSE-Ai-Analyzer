import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router";
import { TrendingUp, Mail, Lock, Loader2, AlertCircle, ArrowLeft } from "lucide-react";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../components/ui/card";
import { Alert, AlertDescription } from "../../components/ui/alert";
import { useAuth } from "../../../lib/auth/AuthContext";
import type { APIError } from "../../../lib/api/client";

export function Login() {
  const { login, isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Redirect if already logged in
  useEffect(() => {
    if (isAuthenticated) {
      navigate("/");
    }
  }, [isAuthenticated, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      await login({ email, password });
    } catch (err) {
      const apiError = err as APIError;
      setError(apiError.message || "Login failed. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--background)] p-4">
      <div className="w-full max-w-md">
        {/* Back Button */}
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate("/")}
          className="mb-6 text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]"
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Dashboard
        </Button>

        {/* Logo */}
        <div className="mb-8 flex items-center justify-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-emerald-500 to-emerald-600">
            <TrendingUp className="h-5 w-5 text-white" />
          </div>
          <span className="text-2xl font-bold tracking-tight text-[var(--color-text-primary)]">TradexaLK</span>
        </div>

        {/* Login Card */}
        <Card className="border-[var(--color-border)] bg-[var(--color-bg-secondary)]">
          <CardHeader className="space-y-1">
            <CardTitle className="text-[20px] text-[var(--color-text-primary)]">
              Sign in to your account
            </CardTitle>
            <CardDescription className="text-[13px] text-[var(--color-text-secondary)]">
              Enter your credentials to access the platform
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              {error && (
                <Alert variant="destructive" className="border-red-500/30 bg-red-500/10">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription className="text-[13px]">{error}</AlertDescription>
                </Alert>
              )}

              <div className="space-y-2">
                <Label htmlFor="email" className="text-[13px] text-[var(--color-text-primary)]">
                  Email or username
                </Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-text-tertiary)]" />
                  <Input
                    id="email"
                    type="text"
                    placeholder="you@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="border-[var(--color-border)] bg-[var(--color-bg-primary)] pl-10 text-[var(--color-text-primary)]"
                    required
                    autoFocus
                  />
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="password" className="text-[13px] text-[var(--color-text-primary)]">
                    Password
                  </Label>
                  <Link to="/forgot-password" className="text-[12px] text-emerald-400 hover:text-emerald-300">Forgot password?</Link>
                </div>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-text-tertiary)]" />
                  <Input
                    id="password"
                    type="password"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="border-[var(--color-border)] bg-[var(--color-bg-primary)] pl-10 text-[var(--color-text-primary)]"
                    required
                  />
                </div>
              </div>

              <Button
                type="submit"
                className="w-full bg-emerald-600 text-white hover:bg-emerald-700"
                disabled={isLoading}
              >
                {isLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Signing in...
                  </>
                ) : (
                  "Sign in"
                )}
              </Button>
            </form>

            <div className="mt-6 text-center text-[13px] text-[var(--color-text-secondary)]">
              Don't have an account?{" "}
              <Link
                to="/register"
                className="font-semibold text-emerald-600 hover:text-emerald-500"
              >
                Create account
              </Link>
            </div>
          </CardContent>
        </Card>

        {/* Demo Credentials */}
        <Card className="border-[var(--color-border)] bg-[var(--color-bg-secondary)]">
          <CardContent className="pt-6">
            <div className="space-y-2 text-[12px] text-[var(--color-text-tertiary)]">
              <p className="font-semibold text-[var(--color-text-secondary)]">Demo Credentials:</p>
              <p>Admin: admin@tradexalk.com / admin123</p>
              <p>User: user@tradexalk.com / user123</p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}