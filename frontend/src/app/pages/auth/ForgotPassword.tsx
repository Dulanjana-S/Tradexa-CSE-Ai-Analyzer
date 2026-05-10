import { useState } from "react";
import { useNavigate, Link } from "react-router";
import { Mail, ArrowLeft, Loader2, CheckCircle2, AlertCircle, ExternalLink, ShieldCheck } from "lucide-react";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../components/ui/card";
import { Alert, AlertDescription } from "../../components/ui/alert";
import { authApi } from "../../../lib/api/services";
import { useTheme } from "../../contexts/ThemeContext";

export function ForgotPassword() {
  const { theme } = useTheme();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [previewLink, setPreviewLink] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);
    setPreviewLink(null);

    try {
      const response = await authApi.forgotPassword(email);
      setSent(response?.sent || false);
      setMessage(response?.message || "If an account exists for that email, a reset link has been prepared.");
      if (response?.preview_reset_link) {
        setPreviewLink(response.preview_reset_link);
      }
    } catch (err: any) {
      setError(err?.message || "Something went wrong. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--background)] p-4 relative overflow-hidden">
      {/* Decorative background elements */}
      <div className="absolute top-[-10%] right-[-10%] w-[40%] h-[40%] bg-emerald-500/5 rounded-full blur-[120px]" />
      <div className="absolute bottom-[-10%] left-[-10%] w-[40%] h-[40%] bg-blue-500/5 rounded-full blur-[120px]" />

      <div className="w-full max-w-md relative z-10">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate("/login")}
          className="mb-6 text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-white/5 transition-all"
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Login
        </Button>

        <Card className="border-[var(--color-border)] bg-[var(--color-bg-secondary)]/80 backdrop-blur-xl shadow-2xl overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-emerald-500 to-blue-500" />
          
          <CardHeader className="space-y-1 pb-4">
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-500">
              <ShieldCheck className="h-6 w-6" />
            </div>
            <CardTitle className="text-2xl font-bold tracking-tight text-[var(--color-text-primary)]">
              Reset Password
            </CardTitle>
            <CardDescription className="text-[14px] text-[var(--color-text-secondary)]">
              Enter your email and we'll send you a link to reset your account
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-6">
            {!message ? (
              <form onSubmit={handleSubmit} className="space-y-4">
                {error && (
                  <Alert variant="destructive" className="border-red-500/30 bg-red-500/10 backdrop-blur-sm">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription className="text-sm font-medium">{error}</AlertDescription>
                  </Alert>
                )}

                <div className="space-y-2">
                  <Label htmlFor="email" className="text-sm font-medium text-[var(--color-text-primary)]">
                    Email Address
                  </Label>
                  <div className="relative group">
                    <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-text-tertiary)] group-focus-within:text-emerald-500 transition-colors" />
                    <Input
                      id="email"
                      type="email"
                      placeholder="name@example.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="border-[var(--color-border)] bg-[var(--color-bg-primary)]/50 pl-10 h-11 text-[var(--color-text-primary)] focus-visible:ring-emerald-500/50 transition-all"
                      required
                      autoFocus
                    />
                  </div>
                </div>

                <Button
                  type="submit"
                  className="w-full h-11 bg-emerald-600 text-white hover:bg-emerald-700 font-semibold shadow-lg shadow-emerald-900/20 transition-all active:scale-[0.98]"
                  disabled={isLoading}
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Sending Link...
                    </>
                  ) : (
                    "Send Reset Link"
                  )}
                </Button>
              </form>
            ) : (
              <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-500">
                <Alert className="border-emerald-500/30 bg-emerald-500/10 text-emerald-200 py-4 backdrop-blur-sm">
                  <CheckCircle2 className="h-5 w-5 text-emerald-400" />
                  <AlertDescription className="text-[14px] leading-relaxed ml-2">
                    {message}
                  </AlertDescription>
                </Alert>

                {previewLink && (
                  <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4 text-sm text-amber-200/90 backdrop-blur-sm">
                    <div className="flex items-center gap-2 mb-2 font-semibold text-amber-400">
                      <ExternalLink className="h-4 w-4" />
                      <span>Developer Preview</span>
                    </div>
                    <p className="mb-3 text-xs leading-relaxed opacity-80">
                      Email is not configured in this environment. You can use the link below to continue the test:
                    </p>
                    <a 
                      href={previewLink}
                      className="inline-flex items-center px-3 py-2 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 font-medium text-xs break-all transition-colors underline-none"
                    >
                      {previewLink}
                    </a>
                  </div>
                )}

                <Button
                  variant="outline"
                  className="w-full h-11 border-[var(--color-border)] text-[var(--color-text-primary)] hover:bg-[var(--color-bg-primary)]"
                  onClick={() => {
                    setMessage(null);
                    setSent(false);
                    setPreviewLink(null);
                  }}
                >
                  Try another email
                </Button>
              </div>
            )}

            <div className="pt-2 text-center text-sm text-[var(--color-text-secondary)]">
              Remember your password?{" "}
              <Link
                to="/login"
                className="font-semibold text-emerald-500 hover:text-emerald-400 underline-offset-4 hover:underline transition-all"
              >
                Sign in
              </Link>
            </div>
          </CardContent>
        </Card>
        
        <p className="mt-8 text-center text-xs text-[var(--color-text-tertiary)] uppercase tracking-widest font-medium opacity-50">
          TradexaLK Secure Access
        </p>
      </div>
    </div>
  );
}
