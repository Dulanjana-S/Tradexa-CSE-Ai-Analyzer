import { useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { ArrowLeft, Loader2, Lock, AlertCircle, CheckCircle2 } from "lucide-react";
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
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return setError("Reset token is missing from the link.");
    if (password.length < 6) return setError("Password must be at least 6 characters.");
    if (password !== confirmPassword) return setError("Passwords do not match.");
    setLoading(true);
    setError(null);
    try {
      await authApi.resetPassword(token, password);
      setSuccess("Password reset successful. You can sign in now.");
      setTimeout(() => navigate("/login"), 1200);
    } catch (err: any) {
      setError(err?.message || "Unable to reset password.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--background)] p-4">
      <div className="w-full max-w-md">
        <Button variant="ghost" size="sm" onClick={() => navigate("/login")} className="mb-6 text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]">
          <ArrowLeft className="mr-2 h-4 w-4" /> Back to Login
        </Button>
        <Card className="border-[var(--color-border)] bg-[var(--color-bg-secondary)]">
          <CardHeader>
            <CardTitle className="text-[20px] text-[var(--color-text-primary)]">Reset password</CardTitle>
            <CardDescription className="text-[13px] text-[var(--color-text-secondary)]">Choose a new password for your account.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              {error && <Alert variant="destructive"><AlertCircle className="h-4 w-4" /><AlertDescription>{error}</AlertDescription></Alert>}
              {success && <Alert className="border-emerald-500/30 bg-emerald-500/10 text-emerald-200"><CheckCircle2 className="h-4 w-4" /><AlertDescription>{success}</AlertDescription></Alert>}
              <div className="space-y-2">
                <Label htmlFor="password">New password</Label>
                <div className="relative"><Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-text-tertiary)]" /><Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} className="pl-10" required /></div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirm">Confirm password</Label>
                <div className="relative"><Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-text-tertiary)]" /><Input id="confirm" type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} className="pl-10" required /></div>
              </div>
              <Button type="submit" className="w-full bg-emerald-600 text-white hover:bg-emerald-700" disabled={loading}>
                {loading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Resetting...</> : "Reset password"}
              </Button>
            </form>
            <div className="mt-6 text-center text-[13px] text-[var(--color-text-secondary)]">
              <Link to="/login" className="text-emerald-400 hover:text-emerald-300">Back to sign in</Link>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
