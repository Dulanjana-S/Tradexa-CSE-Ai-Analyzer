import { useState } from "react";
import { Link, useNavigate } from "react-router";
import { ArrowLeft, Loader2, Mail, AlertCircle, CheckCircle2 } from "lucide-react";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../components/ui/card";
import { Alert, AlertDescription } from "../../components/ui/alert";
import { authApi } from "../../../lib/api/services";

export function ForgotPassword() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [previewLink, setPreviewLink] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setMessage(null);
    setPreviewLink(null);
    try {
      const response = await authApi.forgotPassword(email);
      setMessage(response?.message || "If an account exists for that email, a reset link has been prepared.");
      setPreviewLink(response?.preview_reset_link || null);
    } catch (err: any) {
      setError(err?.message || "Unable to start password reset.");
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
            <CardTitle className="text-[20px] text-[var(--color-text-primary)]">Forgot password</CardTitle>
            <CardDescription className="text-[13px] text-[var(--color-text-secondary)]">Enter your email and we will send you a reset link.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              {error && <Alert variant="destructive"><AlertCircle className="h-4 w-4" /><AlertDescription>{error}</AlertDescription></Alert>}
              {message && <Alert className="border-emerald-500/30 bg-emerald-500/10 text-emerald-200"><CheckCircle2 className="h-4 w-4" /><AlertDescription>{message}</AlertDescription></Alert>}
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-text-tertiary)]" />
                  <Input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="pl-10" placeholder="you@example.com" />
                </div>
              </div>
              {previewLink && <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-200">Email is not configured yet. For local testing, open: <a className="underline" href={previewLink}>{previewLink}</a></div>}
              <Button type="submit" className="w-full bg-emerald-600 text-white hover:bg-emerald-700" disabled={loading}>
                {loading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Sending reset link...</> : "Send reset link"}
              </Button>
            </form>
            <div className="mt-6 text-center text-[13px] text-[var(--color-text-secondary)]">
              Remembered your password? <Link to="/login" className="text-emerald-400 hover:text-emerald-300">Sign in</Link>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
