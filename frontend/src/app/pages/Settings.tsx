import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../components/ui/card";
import { Label } from "../components/ui/label";
import { Input } from "../components/ui/input";
import { Button } from "../components/ui/button";
import { Switch } from "../components/ui/switch";
import { Separator } from "../components/ui/separator";
import { Badge } from "../components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../components/ui/tabs";
import { User, Bell, Shield, Palette, Database, CreditCard, Loader2, Mail, CheckCircle2, AlertTriangle } from "lucide-react";
import { authApi, settingsApi, systemApi } from "../../lib/api/services";
import { API_BASE_URL } from "../../lib/api/client";
import { useAuth } from "../../lib/auth/AuthContext";
import { useTheme } from "../contexts/ThemeContext";

const defaultSettings = {
  theme: "dark",
  currency: "lkr",
  date_format: "dd-mm-yyyy",
  chart_type: "candlestick",
  default_timeframe: "6M",
  advanced_metrics: true,
  email_notifications: true,
  push_notifications: false,
  alert_notifications: true,
  announcement_notifications: true,
  market_status_notifications: true,
  watchlist_notifications: false,
  email_alert_notifications: true,
  email_announcement_notifications: true,
  email_market_status_notifications: false,
  email_watchlist_notifications: false,
  push_alert_notifications: true,
  push_announcement_notifications: true,
  push_market_status_notifications: false,
  push_watchlist_notifications: false,
  notification_email: "",
  push_webhook_url: "",
};

type NotificationKey = keyof typeof defaultSettings;

function ToggleRow({
  title,
  description,
  checked,
  disabled,
  onChange,
}: {
  title: string;
  description: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <div className={`flex items-start justify-between gap-4 rounded-xl border p-4 ${disabled ? "border-[var(--color-border)] bg-[var(--color-bg-primary)]/70 opacity-70" : "border-[var(--color-border)] bg-[var(--color-bg-secondary)]"}`}>
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <Label className="text-[13px] font-semibold text-[var(--color-text-primary)]">{title}</Label>
          <Badge className={checked ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300" : "border-[var(--color-border)] bg-[var(--color-bg-secondary)] text-[var(--color-text-muted)]"}>
            {checked ? "On" : "Off"}
          </Badge>
        </div>
        <p className="text-[12px] text-[var(--color-text-tertiary)]">{description}</p>
      </div>
      <Switch checked={checked} onCheckedChange={onChange} disabled={disabled} />
    </div>
  );
}

export function Settings() {
  const { user, refreshUser } = useAuth();
  const { theme, setTheme } = useTheme();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [systemStatus, setSystemStatus] = useState<any>(null);
  const [profile, setProfile] = useState({ name: "", email: "", phone: "" });
  const [settings, setSettings] = useState<Record<string, any>>(defaultSettings);
  const [passwords, setPasswords] = useState({ current: "", next: "", confirm: "" });

  const userAlertsEnabled = Boolean(systemStatus?.features?.user_alerts_enabled ?? true);

  useEffect(() => {
    const load = async () => {
      // Safety timeout: if backend is extremely slow, don't keep user stuck
      const timeoutId = setTimeout(() => {
        setLoading(false);
      }, 3000);

      setLoading(true);
      try {
        // Load sequentially or with individual catches to prevent hanging entire page
        const me = await authApi.me().catch(() => ({ name: user?.name || "User", email: user?.email || "" }));
        const userSettings = await settingsApi.getUserSettings().catch(() => ({ settings: defaultSettings }));
        const status = await systemApi.getStatus().catch(() => null);
        
        setSystemStatus(status);
        setProfile({ 
          name: me.name || "", 
          email: me.email || "", 
          phone: String(userSettings?.settings?.phone || "") 
        });
        
        const merged = { ...defaultSettings, ...(userSettings?.settings || {}) };
        setSettings(merged);
        
        if (merged.theme === "light" || merged.theme === "dark") {
          setTheme(merged.theme);
        }
      } catch (err) {
        console.error("Settings load error:", err);
        setProfile({ name: user?.name || "", email: user?.email || "", phone: "" });
        setSettings(defaultSettings);
      } finally {
        clearTimeout(timeoutId);
        setLoading(false);
      }
    };
    load();
  }, [setTheme, user?.email, user?.name]);

  const saveProfile = async () => {
    setSaving(true);
    setMessage(null);
    try {
      await authApi.updateProfile({ display_name: profile.name, email: profile.email });
      await settingsApi.saveUserSettings({ ...settings, phone: profile.phone });
      await refreshUser();
      setMessage("Profile updated successfully.");
    } catch (error: any) {
      setMessage(error?.message || "Failed to update profile.");
    } finally {
      setSaving(false);
    }
  };

  const savePreferences = async () => {
    setSaving(true);
    setMessage(null);
    try {
      await settingsApi.saveUserSettings({ ...settings, phone: profile.phone });
      setMessage("Preferences saved successfully.");
    } catch (error: any) {
      setMessage(error?.message || "Failed to save settings.");
    } finally {
      setSaving(false);
    }
  };

  const updatePassword = async () => {
    if (!passwords.current || !passwords.next) {
      setMessage("Enter your current and new password.");
      return;
    }
    if (passwords.next !== passwords.confirm) {
      setMessage("New passwords do not match.");
      return;
    }
    setSaving(true);
    setMessage(null);
    try {
      await authApi.changePassword(passwords.current, passwords.next);
      setPasswords({ current: "", next: "", confirm: "" });
      setMessage("Password updated successfully.");
    } catch (error: any) {
      setMessage(error?.message || "Failed to update password.");
    } finally {
      setSaving(false);
    }
  };

  const deliverySummary = useMemo(() => {
    return {
      inAppCount: ["alert_notifications", "announcement_notifications", "market_status_notifications", "watchlist_notifications"].filter((key) => Boolean(settings[key])).length,
      emailCount: ["email_alert_notifications", "email_announcement_notifications", "email_market_status_notifications", "email_watchlist_notifications"].filter((key) => Boolean(settings[key])).length,
    };
  }, [settings]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--color-bg-primary)] text-[var(--color-text-tertiary)]">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading settings...
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--color-bg-primary)]">
      <div className="mx-auto max-w-[1200px] px-6 py-8 lg:px-8">
        <div className="mb-8 space-y-1.5">
          <h1 className="text-[32px] font-bold leading-tight tracking-tight text-[var(--color-text-primary)]">Settings</h1>
          <p className="text-[13px] text-[var(--color-text-tertiary)]">Manage your account settings, delivery channels, and portfolio experience.</p>
          {message && <p className="text-[13px] text-emerald-400">{message}</p>}
        </div>

        <Tabs defaultValue="profile" className="space-y-6">
          <TabsList className="grid w-full grid-cols-3 lg:w-auto lg:grid-cols-6">
            <TabsTrigger value="profile">Profile</TabsTrigger>
            <TabsTrigger value="notifications">Notifications</TabsTrigger>
            <TabsTrigger value="preferences">Preferences</TabsTrigger>
            <TabsTrigger value="security">Security</TabsTrigger>
            <TabsTrigger value="data">Data</TabsTrigger>
            <TabsTrigger value="billing">Billing</TabsTrigger>
          </TabsList>

          <TabsContent value="profile" className="space-y-6">
            <Card className="border-[var(--color-border)] bg-[var(--color-bg-tertiary)]">
              <CardHeader>
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-md bg-emerald-500/10"><User className="h-5 w-5 text-emerald-500" /></div>
                  <div>
                    <CardTitle className="text-[18px] text-[var(--color-text-primary)]">Profile Information</CardTitle>
                    <CardDescription className="text-[13px] text-[var(--color-text-tertiary)]">Update your account profile information.</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid gap-6 md:grid-cols-2">
                  <div className="space-y-2 md:col-span-2">
                    <Label htmlFor="fullName" className="text-[var(--color-text-primary)]">Full Name</Label>
                    <Input id="fullName" value={profile.name} onChange={(e) => setProfile((prev) => ({ ...prev, name: e.target.value }))} className="border-[var(--color-border)] bg-[var(--color-bg-secondary)] text-[var(--color-text-primary)]" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="email" className="text-[var(--color-text-primary)]">Email Address</Label>
                    <Input id="email" type="email" value={profile.email} onChange={(e) => setProfile((prev) => ({ ...prev, email: e.target.value }))} className="border-[var(--color-border)] bg-[var(--color-bg-secondary)] text-[var(--color-text-primary)]" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="phone" className="text-[var(--color-text-primary)]">Phone Number</Label>
                    <Input id="phone" value={profile.phone} onChange={(e) => setProfile((prev) => ({ ...prev, phone: e.target.value }))} className="border-[var(--color-border)] bg-[var(--color-bg-secondary)] text-[var(--color-text-primary)]" />
                  </div>
                </div>
                <Separator className="bg-[var(--color-border)]" />
                <div className="flex justify-end gap-3">
                  <Button variant="outline" className="border-[var(--color-border)] text-[var(--color-text-tertiary)] hover:bg-[var(--color-bg-elevated)] hover:text-[var(--color-text-primary)]" onClick={() => window.location.reload()}>
                    Cancel
                  </Button>
                  <Button className="bg-emerald-600 text-white hover:bg-emerald-700" onClick={saveProfile} disabled={saving}>Save Profile</Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="notifications" className="space-y-6">
            <Card className="border-[var(--color-border)] bg-[var(--color-bg-tertiary)]">
              <CardHeader>
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-md bg-blue-500/10"><Bell className="h-5 w-5 text-blue-500" /></div>
                  <div>
                    <CardTitle className="text-[18px] text-[var(--color-text-primary)]">Notification Preferences</CardTitle>
                    <CardDescription className="text-[13px] text-[var(--color-text-tertiary)]">Control your in-app notifications and optional email delivery. Advanced webhook delivery has been removed from the user settings page to keep this experience simple and clear.</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-6">
                {!userAlertsEnabled ? (
                  <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-[12px] text-amber-100">
                    <div className="mb-1 flex items-center gap-2 font-semibold"><AlertTriangle className="h-4 w-4" /> Personal alerts are currently undergoing system optimization.</div>
                    <div>You can still review existing alerts and notifications, but new personal alert triggers are temporarily unavailable.</div>
                  </div>
                ) : (
                  <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] p-4 text-[12px] text-[var(--color-text-muted)]">Personal alerts are enabled. Use the Alerts page to create price, move, volume, or announcement alerts for your own portfolio and watchlist.</div>
                )}

                <div className="grid gap-4 md:grid-cols-3">
                  <Card className="border-[var(--color-border)] bg-[var(--color-bg-secondary)]"><CardContent className="p-4"><div className="text-[12px] text-[var(--color-text-tertiary)]">In-app categories on</div><div className="mt-2 text-[24px] font-bold text-[var(--color-text-primary)]">{deliverySummary.inAppCount}/4</div></CardContent></Card>
                  <Card className="border-[var(--color-border)] bg-[var(--color-bg-secondary)]"><CardContent className="p-4"><div className="text-[12px] text-[var(--color-text-tertiary)]">Email delivery</div><div className="mt-2 text-[24px] font-bold text-[var(--color-text-primary)]">{settings.email_notifications ? "On" : "Off"}</div></CardContent></Card>
                  <Card className="border-[var(--color-border)] bg-[var(--color-bg-secondary)]"><CardContent className="p-4"><div className="text-[12px] text-[var(--color-text-tertiary)]">Email categories on</div><div className="mt-2 text-[24px] font-bold text-[var(--color-text-primary)]">{deliverySummary.emailCount}/4</div></CardContent></Card>
                </div>

                <div className="space-y-4">
                  <div className="text-[13px] font-semibold text-[var(--color-text-primary)]">In-app notifications</div>
                  <ToggleRow title="Price alerts" description="Get notified when a personal stock alert condition triggers." checked={Boolean(settings.alert_notifications)} disabled={!userAlertsEnabled} onChange={(checked) => setSettings((prev) => ({ ...prev, alert_notifications: checked }))} />
                  <ToggleRow title="Market announcements" description="Receive important CSE announcement and report-related updates." checked={Boolean(settings.announcement_notifications)} onChange={(checked) => setSettings((prev) => ({ ...prev, announcement_notifications: checked }))} />
                  <ToggleRow title="Market status" description="Receive job, sync, and market status messages from the backend." checked={Boolean(settings.market_status_notifications)} onChange={(checked) => setSettings((prev) => ({ ...prev, market_status_notifications: checked }))} />
                  <ToggleRow title="Watchlist updates" description="Receive important changes for symbols you are tracking." checked={Boolean(settings.watchlist_notifications)} onChange={(checked) => setSettings((prev) => ({ ...prev, watchlist_notifications: checked }))} />
                </div>

                <Separator className="bg-[var(--color-border)]" />

                <div className="grid gap-6 lg:grid-cols-[1.25fr_0.75fr]">
                  <div className="space-y-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] p-5">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2"><Mail className="h-4 w-4 text-emerald-400" /><div className="text-[13px] font-semibold text-[var(--color-text-primary)]">Email delivery</div></div>
                      <Switch checked={Boolean(settings.email_notifications)} onCheckedChange={(checked) => setSettings((prev) => ({ ...prev, email_notifications: checked }))} />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-[var(--color-text-primary)]">Notification email</Label>
                      <Input type="email" value={settings.notification_email || ""} onChange={(e) => setSettings((prev) => ({ ...prev, notification_email: e.target.value }))} placeholder="Leave blank to use your account email" className="border-[var(--color-border)] bg-[var(--color-bg-primary)] text-[var(--color-text-primary)]" disabled={!settings.email_notifications} />
                    </div>
                    <div className="grid gap-3 md:grid-cols-2">
                      <ToggleRow title="Email price alerts" description="Send your personal alert triggers to email." checked={Boolean(settings.email_alert_notifications)} disabled={!settings.email_notifications || !userAlertsEnabled} onChange={(checked) => setSettings((prev) => ({ ...prev, email_alert_notifications: checked }))} />
                      <ToggleRow title="Email announcements" description="Send important announcement/report events to email." checked={Boolean(settings.email_announcement_notifications)} disabled={!settings.email_notifications} onChange={(checked) => setSettings((prev) => ({ ...prev, email_announcement_notifications: checked }))} />
                      <ToggleRow title="Email market status" description="Send job and market status updates to email." checked={Boolean(settings.email_market_status_notifications)} disabled={!settings.email_notifications} onChange={(checked) => setSettings((prev) => ({ ...prev, email_market_status_notifications: checked }))} />
                      <ToggleRow title="Email watchlist updates" description="Send watchlist-related updates to email." checked={Boolean(settings.email_watchlist_notifications)} disabled={!settings.email_notifications} onChange={(checked) => setSettings((prev) => ({ ...prev, email_watchlist_notifications: checked }))} />
                    </div>
                  </div>
                  <div className="space-y-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] p-5">
                    <div className="text-[13px] font-semibold text-[var(--color-text-primary)]">How this works</div>
                    <div className="space-y-3 text-[12px] text-[var(--color-text-muted)]">
                      <p>In-app notifications always appear inside the TradexaLK notification center when the matching category is enabled.</p>
                      <p>Email notifications provide automated daily summaries and instant breakout alerts.</p>
                      <p>Advanced webhook-style delivery was removed from the normal user settings page to keep this screen focused on investor-friendly controls.</p>
                    </div>
                    <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-primary)] p-4 text-[12px] text-[var(--color-text-muted)]">
                      <div className="mb-2 font-semibold text-[var(--color-text-primary)]">Recommendation</div>
                      Keep <span className="text-emerald-300">in-app notifications</span> enabled for all categories you care about, and turn on email only for alerts you truly want outside the app.
                    </div>
                  </div>
                </div>

                <div className="flex justify-end">
                  <Button className="bg-emerald-600 text-white hover:bg-emerald-700" onClick={savePreferences} disabled={saving}>{saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />} Save Notification Settings</Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
          <TabsContent value="preferences" className="space-y-6">
            <Card className="border-[var(--color-border)] bg-[var(--color-bg-tertiary)]">
              <CardHeader>
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-md bg-violet-500/10"><Palette className="h-5 w-5 text-violet-500" /></div>
                  <div>
                    <CardTitle className="text-[18px] text-[var(--color-text-primary)]">Display Preferences</CardTitle>
                    <CardDescription className="text-[13px] text-[var(--color-text-tertiary)]">Personalize how charts and tables behave.</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="grid gap-6 md:grid-cols-2">
                <div className="space-y-2">
                  <Label className="text-[var(--color-text-primary)]">Theme</Label>
                  <Select value={theme} onValueChange={(value) => { setTheme(value as "light" | "dark"); setSettings((prev) => ({ ...prev, theme: value })); }}>
                    <SelectTrigger className="border-[var(--color-border)] bg-[var(--color-bg-secondary)] text-[var(--color-text-primary)]"><SelectValue /></SelectTrigger>
                    <SelectContent className="border-[var(--color-border)] bg-[var(--color-bg-tertiary)]">
                      <SelectItem value="dark">Dark Mode</SelectItem>
                      <SelectItem value="light">Light Mode</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label className="text-[var(--color-text-primary)]">Default Timeframe</Label>
                  <Select value={String(settings.default_timeframe || "6M")} onValueChange={(value) => setSettings((prev) => ({ ...prev, default_timeframe: value }))}>
                    <SelectTrigger className="border-[var(--color-border)] bg-[var(--color-bg-secondary)] text-[var(--color-text-primary)]"><SelectValue /></SelectTrigger>
                    <SelectContent className="border-[var(--color-border)] bg-[var(--color-bg-tertiary)]">
                      <SelectItem value="1D">1D</SelectItem><SelectItem value="1W">1W</SelectItem><SelectItem value="1M">1M</SelectItem><SelectItem value="3M">3M</SelectItem><SelectItem value="6M">6M</SelectItem><SelectItem value="1Y">1Y</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label className="text-[var(--color-text-primary)]">Date Format</Label>
                  <Select value={String(settings.date_format || "dd-mm-yyyy")} onValueChange={(value) => setSettings((prev) => ({ ...prev, date_format: value }))}>
                    <SelectTrigger className="border-[var(--color-border)] bg-[var(--color-bg-secondary)] text-[var(--color-text-primary)]"><SelectValue /></SelectTrigger>
                    <SelectContent className="border-[var(--color-border)] bg-[var(--color-bg-tertiary)]">
                      <SelectItem value="dd-mm-yyyy">DD/MM/YYYY</SelectItem><SelectItem value="mm-dd-yyyy">MM/DD/YYYY</SelectItem><SelectItem value="yyyy-mm-dd">YYYY-MM-DD</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label className="text-[var(--color-text-primary)]">Chart Type</Label>
                  <Select value={String(settings.chart_type || "candlestick")} onValueChange={(value) => setSettings((prev) => ({ ...prev, chart_type: value }))}>
                    <SelectTrigger className="border-[var(--color-border)] bg-[var(--color-bg-secondary)] text-[var(--color-text-primary)]"><SelectValue /></SelectTrigger>
                    <SelectContent className="border-[var(--color-border)] bg-[var(--color-bg-tertiary)]">
                      <SelectItem value="candlestick">Candlestick</SelectItem><SelectItem value="line">Line</SelectItem><SelectItem value="area">Area</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="md:col-span-2">
                  <ToggleRow title="Advanced metrics" description="Show additional performance and intelligence blocks on portfolio and stock pages." checked={Boolean(settings.advanced_metrics)} onChange={(checked) => setSettings((prev) => ({ ...prev, advanced_metrics: checked }))} />
                </div>
                <div className="md:col-span-2 flex justify-end">
                  <Button className="bg-emerald-600 text-white hover:bg-emerald-700" onClick={savePreferences} disabled={saving}>Save Preferences</Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="security" className="space-y-6">
            <Card className="border-[var(--color-border)] bg-[var(--color-bg-tertiary)]">
              <CardHeader>
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-md bg-red-500/10"><Shield className="h-5 w-5 text-red-500" /></div>
                  <div>
                    <CardTitle className="text-[18px] text-[var(--color-text-primary)]">Security</CardTitle>
                    <CardDescription className="text-[13px] text-[var(--color-text-tertiary)]">Change your password and secure your account.</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="grid gap-6 md:grid-cols-2">
                <div className="space-y-2 md:col-span-2"><Label className="text-[var(--color-text-primary)]">Current Password</Label><Input type="password" value={passwords.current} onChange={(e) => setPasswords((prev) => ({ ...prev, current: e.target.value }))} className="border-[var(--color-border)] bg-[var(--color-bg-secondary)] text-[var(--color-text-primary)]" /></div>
                <div className="space-y-2"><Label className="text-[var(--color-text-primary)]">New Password</Label><Input type="password" value={passwords.next} onChange={(e) => setPasswords((prev) => ({ ...prev, next: e.target.value }))} className="border-[var(--color-border)] bg-[var(--color-bg-secondary)] text-[var(--color-text-primary)]" /></div>
                <div className="space-y-2"><Label className="text-[var(--color-text-primary)]">Confirm New Password</Label><Input type="password" value={passwords.confirm} onChange={(e) => setPasswords((prev) => ({ ...prev, confirm: e.target.value }))} className="border-[var(--color-border)] bg-[var(--color-bg-secondary)] text-[var(--color-text-primary)]" /></div>
                <div className="md:col-span-2 flex justify-end"><Button className="bg-emerald-600 text-white hover:bg-emerald-700" onClick={updatePassword} disabled={saving}>Update Password</Button></div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="data" className="space-y-6">
            <Card className="border-[var(--color-border)] bg-[var(--color-bg-tertiary)]">
              <CardHeader>
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-md bg-cyan-500/10"><Database className="h-5 w-5 text-cyan-500" /></div>
                  <div>
                    <CardTitle className="text-[18px] text-[var(--color-text-primary)]">Account Data</CardTitle>
                    <CardDescription className="text-[13px] text-[var(--color-text-tertiary)]">Review what is stored for your account and export a copy of your own data.</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid gap-4 md:grid-cols-3">
                  <Card className="border-[var(--color-border)] bg-[var(--color-bg-secondary)]"><CardContent className="p-4"><div className="text-[12px] text-[var(--color-text-tertiary)]">Saved settings</div><div className="mt-2 text-[24px] font-bold text-[var(--color-text-primary)]">{Object.keys(settings || {}).length}</div></CardContent></Card>
                  <Card className="border-[var(--color-border)] bg-[var(--color-bg-secondary)]"><CardContent className="p-4"><div className="text-[12px] text-[var(--color-text-tertiary)]">Primary email</div><div className="mt-2 text-[15px] font-semibold text-[var(--color-text-primary)] truncate">{profile.email || "Not set"}</div></CardContent></Card>
                  <Card className="border-[var(--color-border)] bg-[var(--color-bg-secondary)]"><CardContent className="p-4"><div className="text-[12px] text-[var(--color-text-tertiary)]">Theme</div><div className="mt-2 text-[24px] font-bold capitalize text-[var(--color-text-primary)]">{theme}</div></CardContent></Card>
                </div>

                <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] p-5">
                  <div className="mb-3 text-[14px] font-semibold text-[var(--color-text-primary)]">Export my account data</div>
                  <div className="space-y-3 text-[12px] text-[var(--color-text-muted)]">
                    <p>This export gives you a JSON snapshot of your account data stored in the application.</p>
                    <p>It includes your profile basics, saved settings, watchlist, portfolios, transactions, cash movements, alerts, and a preview of notifications.</p>
                  </div>
                  <div className="mt-4 flex flex-wrap items-center gap-3">
                    <Button className="bg-emerald-600 text-white hover:bg-emerald-700" disabled={saving} onClick={async () => {
                      try {
                        setSaving(true);
                        setMessage(null);
                        const response = await fetch(`${API_BASE_URL}/api/account/export`, {
                          method: "GET",
                          credentials: "include",
                        });
                        if (!response.ok) throw new Error('Export failed');
                        const data = await response.json();
                        
                        // Flatten data for CSV
                        const rows = [["Category", "Field", "Value", "Detail"]];
                        
                        // Profile
                        if (data.profile) {
                          Object.entries(data.profile).forEach(([k, v]) => rows.push(["Profile", k, String(v), ""]));
                        }
                        
                        // Settings
                        if (data.settings) {
                          Object.entries(data.settings).forEach(([k, v]) => rows.push(["Setting", k, String(v), ""]));
                        }
                        
                        // Watchlist
                        if (data.watchlist?.symbols) {
                          data.watchlist.symbols.forEach((s: string) => rows.push(["Watchlist", "Symbol", s, "Active Tracking"]));
                        }
                        
                        // Portfolio
                        if (data.portfolio?.positions) {
                          data.portfolio.positions.forEach((p: any) => {
                            rows.push(["Portfolio", "Holding", p.symbol, `Qty: ${p.quantity}, Avg Price: ${p.average_price}`]);
                          });
                        }
                        
                        const csvContent = rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
                        const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement('a');
                        a.href = url;
                        a.download = `tradexalk-export-${(user?.username || 'user')}.csv`;
                        document.body.appendChild(a);
                        a.click();
                        a.remove();
                        URL.revokeObjectURL(url);
                        setMessage('Excel/CSV export downloaded successfully.');
                      } catch (error: any) {
                        setMessage(error?.message || 'Failed to export to CSV.');
                      } finally {
                        setSaving(false);
                      }
                    }}>{saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Database className="mr-2 h-4 w-4" />} Export to Excel (CSV)</Button>

                    <Button variant="outline" className="border-[var(--color-border)] text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-elevated)]" disabled={saving} onClick={async () => {
                      try {
                        setSaving(true);
                        setMessage(null);
                        const blob = await settingsApi.exportAccountData();
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement('a');
                        a.href = url;
                        a.download = `tradexalk-account-export-${(user?.username || 'user')}.json`;
                        document.body.appendChild(a);
                        a.click();
                        a.remove();
                        URL.revokeObjectURL(url);
                        setMessage('JSON export downloaded successfully.');
                      } catch (error: any) {
                        setMessage(error?.message || 'Failed to export account data.');
                      } finally {
                        setSaving(false);
                      }
                    }}>JSON Data Dump</Button>
                  </div>
                </div>

                <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] p-5 text-[12px] text-[var(--color-text-muted)]">
                  <div className="mb-2 font-semibold text-[var(--color-text-primary)]">Data handling notes</div>
                  <ul className="list-disc space-y-2 pl-5">
                    <li>Preferences are saved to your secure profile.</li>
                    <li>Automated email delivery requires a verified email address.</li>
                    <li>Billing is not active in this build, so no payment data is stored in this settings area.</li>
                  </ul>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
          <TabsContent value="billing" className="space-y-6">
            <Card className="border-[var(--color-border)] bg-[var(--color-bg-tertiary)]">
              <CardHeader>
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-md bg-amber-500/10"><CreditCard className="h-5 w-5 text-amber-500" /></div>
                  <div>
                    <CardTitle className="text-[18px] text-[var(--color-text-primary)]">Billing</CardTitle>
                    <CardDescription className="text-[13px] text-[var(--color-text-tertiary)]">Billing features are not enabled in this build.</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] p-4 text-[13px] text-[var(--color-text-muted)]">This area is reserved for future subscription and billing controls.</div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
