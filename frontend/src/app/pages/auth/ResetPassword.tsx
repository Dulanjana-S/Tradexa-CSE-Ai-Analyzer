import { useState, useMemo, useEffect } from "react";
import { useNavigate, useSearchParams, Link } from "react-router";
import { Lock, ArrowLeft, Loader2, CheckCircle2, AlertCircle, ShieldCheck, Eye, EyeOff } from "lucide-react";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../components/ui/card";
import { Alert, AlertDescription } from "../../components/ui/alert";
import { authApi } from "../../../lib/api/services";

export function ResetPassword() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const token = useMemo(() => params.get("token") || "", [params]);

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Immediate token validation feedback
  useEffect(() => {
    if (!token) {
      setError("The reset token is missing. Please check your link or request a new one.");
    }
  }, [token]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return setError("Reset token is missing.");
    if (password.length < 6) return setError("Password must be at least 6 characters.");
    if (password !== confirmPassword) return setError("Passwords do not match.");

    setIsLoading(true);
    setError(null);

    try {
      await authApi.resetPassword(token, password);
      setSuccess("Your password has been reset successfully. You will be redirected to the login page shortly.");
      setTimeout(() => navigate("/login"), 2500);
    } catch (err: any) {
      setError(err?.message || "Failed to reset password. The link may have expired or is invalid.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--background)] p-4 relative overflow-hidden">
      {/* Decorative background elements */}
      <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-blue-500/5 rounded-full blur-[120px]" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-emerald-500/5 rounded-full blur-[120px]" />

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
          <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-blue-500 to-emerald-500" />

          <CardHeader className="space-y-1 pb-4">
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-blue-500/10 text-blue-500">
              <Lock className="h-6 w-6" />
            </div>
            <CardTitle className="text-2xl font-bold tracking-tight text-[var(--color-text-primary)]">
              Create New Password
            </CardTitle>
            <CardDescription className="text-[14px] text-[var(--color-text-secondary)]">
              Your new password must be different from previous passwords
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-6">
            {success ? (
              <div className="space-y-6 animate-in zoom-in-95 duration-500">
                <div className="flex flex-col items-center justify-center py-6 text-center">
                  <div className="mb-4 h-16 w-16 bg-emerald-500/20 text-emerald-500 rounded-full flex items-center justify-center">
                    <CheckCircle2 className="h-10 w-10" />
                  </div>
                  <h3 className="text-xl font-bold text-emerald-400 mb-2">Success!</h3>
                  <p className="text-[var(--color-text-secondary)]">{success}</p>
                </div>
                
                <div className="h-1 w-full bg-emerald-500/10 rounded-full overflow-hidden">
                  <div className="h-full bg-emerald-500 animate-progress origin-left" />
                </div>
                
                <Button className="w-full" onClick={() => navigate("/login")}>
                  Go to Login
                </Button>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                {error && (
                  <Alert variant="destructive" className="border-red-500/30 bg-red-500/10 backdrop-blur-sm">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription className="text-sm font-medium">{error}</AlertDescription>
                  </Alert>
                )}

                <div className="space-y-2">
                  <Label htmlFor="password" title="At least 6 characters" className="text-sm font-medium text-[var(--color-text-primary)]">
                    New Password
                  </Label>
                  <div className="relative group">
                    <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-text-tertiary)] group-focus-within:text-blue-500 transition-colors" />
                    <Input
                      id="password"
                      type={showPassword ? "text" : "password"}
                      placeholder="••••••••"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="border-[var(--color-border)] bg-[var(--color-bg-primary)]/50 pl-10 pr-10 h-11 text-[var(--color-text-primary)] focus-visible:ring-blue-500/50 transition-all"
                      required
                      autoFocus
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)] transition-colors"
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="confirm-password" title="Must match" className="text-sm font-medium text-[var(--color-text-primary)]">
                    Confirm New Password
                  </Label>
                  <div className="relative group">
                    <ShieldCheck className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-text-tertiary)] group-focus-within:text-blue-500 transition-colors" />
                    <Input
                      id="confirm-password"
                      type={showPassword ? "text" : "password"}
                      placeholder="••••••••"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      className="border-[var(--color-border)] bg-[var(--color-bg-primary)]/50 pl-10 h-11 text-[var(--color-text-primary)] focus-visible:ring-blue-500/50 transition-all"
                      required
                    />
                  </div>
                </div>

                <Button
                  type="submit"
                  className="w-full h-11 bg-blue-600 text-white hover:bg-blue-700 font-semibold shadow-lg shadow-blue-900/20 transition-all active:scale-[0.98] mt-2"
                  disabled={isLoading || !token}
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Updating Password...
                    </>
                  ) : (
                    "Reset Password"
                  )}
                </Button>
              </form>
            )}
          </CardContent>
        </Card>
        
        <p className="mt-8 text-center text-xs text-[var(--color-text-tertiary)] uppercase tracking-widest font-medium opacity-50">
          TradexaLK Secure Access
        </p>
      </div>
      
      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes progress {
          from { transform: scaleX(0); }
          to { transform: scaleX(1); }
        }
        .animate-progress {
          animation: progress 2.5s linear forwards;
        }
      `}} />
    </div>
  );
}
