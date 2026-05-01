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
import { User, Bell, Shield, Palette, Database, CreditCard, Loader2, Mail, Radio, CheckCircle2, AlertTriangle } from "lucide-react";
import { authApi, settingsApi, systemApi } from "../../lib/api/services";
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
    <div className={`flex items-start justify-between gap-4 rounded-xl border p-4 ${disabled ? "border-[#2a313b] bg-[#0f1319]/70 opacity-70" : "border-[#30363d] bg-[#0d1117]"}`}>
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <Label className="text-[13px] font-semibold text-[#e6edf3]">{title}</Label>
          <Badge className={checked ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300" : "border-[#3a4450] bg-[#111927] text-[#9da7b3]"}>
            {checked ? "On" : "Off"}
          </Badge>
        </div>
        <p className="text-[12px] text-[#768390]">{description}</p>
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
      setLoading(true);
      try {
        const [me, userSettings, status] = await Promise.all([
          authApi.me(),
          settingsApi.getUserSettings(),
          systemApi.getStatus().catch(() => null),
        ]);
        setSystemStatus(status);
        setProfile({ name: me.name || "", email: me.email || "", phone: String(userSettings.settings?.phone || "") });
        const merged = { ...defaultSettings, ...(userSettings.settings || {}) };
        setSettings(merged);
        if (merged.theme === "light" || merged.theme === "dark") {
          setTheme(merged.theme);
        }
      } catch {
        setProfile({ name: user?.name || "", email: user?.email || "", phone: "" });
        setSettings(defaultSettings);
      } finally {
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
      pushCount: ["push_alert_notifications", "push_announcement_notifications", "push_market_status_notifications", "push_watchlist_notifications"].filter((key) => Boolean(settings[key])).length,
    };
  }, [settings]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#08090c] text-[#768390]">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading settings...
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#08090c]">
      <div className="mx-auto max-w-[1200px] px-6 py-8 lg:px-8">
        <div className="mb-8 space-y-1.5">
          <h1 className="text-[32px] font-bold leading-tight tracking-tight text-[#e6edf3]">Settings</h1>
          <p className="text-[13px] text-[#768390]">Manage your account settings, delivery channels, and portfolio experience.</p>
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
            <Card className="border-[#30363d] bg-[#161b22]">
              <CardHeader>
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-md bg-emerald-500/10"><User className="h-5 w-5 text-emerald-500" /></div>
                  <div>
                    <CardTitle className="text-[18px] text-[#e6edf3]">Profile Information</CardTitle>
                    <CardDescription className="text-[13px] text-[#768390]">Update your account profile information.</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid gap-6 md:grid-cols-2">
                  <div className="space-y-2 md:col-span-2">
                    <Label htmlFor="fullName" className="text-[#e6edf3]">Full Name</Label>
                    <Input id="fullName" value={profile.name} onChange={(e) => setProfile((prev) => ({ ...prev, name: e.target.value }))} className="border-[#30363d] bg-[#0d1117] text-[#e6edf3]" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="email" className="text-[#e6edf3]">Email Address</Label>
                    <Input id="email" type="email" value={profile.email} onChange={(e) => setProfile((prev) => ({ ...prev, email: e.target.value }))} className="border-[#30363d] bg-[#0d1117] text-[#e6edf3]" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="phone" className="text-[#e6edf3]">Phone Number</Label>
                    <Input id="phone" value={profile.phone} onChange={(e) => setProfile((prev) => ({ ...prev, phone: e.target.value }))} className="border-[#30363d] bg-[#0d1117] text-[#e6edf3]" />
                  </div>
                </div>
                <Separator className="bg-[#30363d]" />
                <div className="flex justify-end gap-3">
                  <Button variant="outline" className="border-[#30363d] text-[#768390] hover:bg-[#1c2128] hover:text-[#e6edf3]" onClick={() => window.location.reload()}>
                    Cancel
                  </Button>
                  <Button className="bg-emerald-600 text-white hover:bg-emerald-700" onClick={saveProfile} disabled={saving}>Save Profile</Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="notifications" className="space-y-6">
            <div className="grid gap-4 lg:grid-cols-3">
              <Card className="border-[#30363d] bg-[#161b22]"><CardContent className="p-5"><div className="text-[12px] text-[#768390]">In-app categories enabled</div><div className="mt-2 text-[26px] font-bold text-[#e6edf3]">{deliverySummary.inAppCount}/4</div></CardContent></Card>
              <Card className="border-[#30363d] bg-[#161b22]"><CardContent className="p-5"><div className="text-[12px] text-[#768390]">Email categories enabled</div><div className="mt-2 text-[26px] font-bold text-[#e6edf3]">{settings.email_notifications ? `${deliverySummary.emailCount}/4` : "Off"}</div></CardContent></Card>
              <Card className="border-[#30363d] bg-[#161b22]"><CardContent className="p-5"><div className="text-[12px] text-[#768390]">Push categories enabled</div><div className="mt-2 text-[26px] font-bold text-[#e6edf3]">{settings.push_notifications ? `${deliverySummary.pushCount}/4` : "Off"}</div></CardContent></Card>
            </div>

            {!userAlertsEnabled && (
              <Card className="border-amber-500/30 bg-amber-500/10">
                <CardContent className="flex items-start gap-3 p-4 text-amber-100">
                  <AlertTriangle className="mt-0.5 h-5 w-5" />
                  <div>
                    <div className="font-semibold">User-created alerts are currently disabled by the administrator</div>
                    <p className="mt-1 text-[13px] text-amber-200/80">You can still manage your notification preferences, but new personal price alerts will stay unavailable until the system setting is re-enabled.</p>
                  </div>
                </CardContent>
              </Card>
            )}

            <Card className="border-[#30363d] bg-[#161b22]">
              <CardHeader>
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-md bg-blue-500/10"><Bell className="h-5 w-5 text-blue-500" /></div>
                  <div>
                    <CardTitle className="text-[18px] text-[#e6edf3]">Notification Preferences</CardTitle>
                    <CardDescription className="text-[13px] text-[#768390]">Choose what you receive in-app, by email, and through webhook-based push delivery.</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid gap-4 lg:grid-cols-2">
                  <ToggleRow title="Price Alerts" description="Personal alert triggers for symbols you track." checked={Boolean(settings.alert_notifications)} disabled={!userAlertsEnabled} onChange={(checked) => setSettings((prev) => ({ ...prev, alert_notifications: checked }))} />
                  <ToggleRow title="Market Announcements" description="Important CSE announcements and report-related updates." checked={Boolean(settings.announcement_notifications)} onChange={(checked) => setSettings((prev) => ({ ...prev, announcement_notifications: checked }))} />
                  <ToggleRow title="Market Status" description="Sync, job, and market system status messages." checked={Boolean(settings.market_status_notifications)} onChange={(checked) => setSettings((prev) => ({ ...prev, market_status_notifications: checked }))} />
                  <ToggleRow title="Watchlist Updates" description="Changes that matter for stocks you are following." checked={Boolean(settings.watchlist_notifications)} onChange={(checked) => setSettings((prev) => ({ ...prev, watchlist_notifications: checked }))} />
                </div>

                <Separator className="bg-[#30363d]" />

                <div className="grid gap-6 lg:grid-cols-2">
                  <div className="space-y-4 rounded-xl border border-[#30363d] bg-[#0d1117] p-5">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2"><Mail className="h-4 w-4 text-emerald-400" /><div><div className="text-[13px] font-semibold text-[#e6edf3]">Email delivery</div><div className="text-[12px] text-[#768390]">Route selected categories to an email inbox.</div></div></div>
                      <Switch checked={Boolean(settings.email_notifications)} onCheckedChange={(checked) => setSettings((prev) => ({ ...prev, email_notifications: checked }))} />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-[#e6edf3]">Notification email</Label>
                      <Input type="email" value={settings.notification_email || ""} onChange={(e) => setSettings((prev) => ({ ...prev, notification_email: e.target.value }))} placeholder="Leave blank to use your account email" className="border-[#30363d] bg-[#08090c] text-[#e6edf3]" disabled={!settings.email_notifications} />
                    </div>
                    <div className="space-y-3">
                      <ToggleRow title="Alert emails" description="Send personal price-alert triggers by email." checked={Boolean(settings.email_alert_notifications)} disabled={!settings.email_notifications || !userAlertsEnabled} onChange={(checked) => setSettings((prev) => ({ ...prev, email_alert_notifications: checked }))} />
                      <ToggleRow title="Announcement emails" description="Send important announcement/report events by email." checked={Boolean(settings.email_announcement_notifications)} disabled={!settings.email_notifications} onChange={(checked) => setSettings((prev) => ({ ...prev, email_announcement_notifications: checked }))} />
                      <ToggleRow title="Market status emails" description="Send job, sync, and system status updates by email." checked={Boolean(settings.email_market_status_notifications)} disabled={!settings.email_notifications} onChange={(checked) => setSettings((prev) => ({ ...prev, email_market_status_notifications: checked }))} />
                      <ToggleRow title="Watchlist emails" description="Send watchlist-specific updates by email." checked={Boolean(settings.email_watchlist_notifications)} disabled={!settings.email_notifications} onChange={(checked) => setSettings((prev) => ({ ...prev, email_watchlist_notifications: checked }))} />
                    </div>
                  </div>

                  <div className="space-y-4 rounded-xl border border-[#30363d] bg-[#0d1117] p-5">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2"><Radio className="h-4 w-4 text-violet-400" /><div><div className="text-[13px] font-semibold text-[#e6edf3]">Push / webhook delivery</div><div className="text-[12px] text-[#768390]">Send events to your configured webhook endpoint.</div></div></div>
                      <Switch checked={Boolean(settings.push_notifications)} onCheckedChange={(checked) => setSettings((prev) => ({ ...prev, push_notifications: checked }))} />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-[#e6edf3]">Push webhook URL</Label>
                      <Input value={settings.push_webhook_url || ""} onChange={(e) => setSettings((prev) => ({ ...prev, push_webhook_url: e.target.value }))} placeholder="https://your-endpoint.example/notify" className="border-[#30363d] bg-[#08090c] text-[#e6edf3]" disabled={!settings.push_notifications} />
                    </div>
                    <div className="space-y-3">
                      <ToggleRow title="Alert push notifications" description="Send personal alert triggers to your webhook endpoint." checked={Boolean(settings.push_alert_notifications)} disabled={!settings.push_notifications || !userAlertsEnabled} onChange={(checked) => setSettings((prev) => ({ ...prev, push_alert_notifications: checked }))} />
                      <ToggleRow title="Announcement push notifications" description="Send important announcement/report events to your webhook endpoint." checked={Boolean(settings.push_announcement_notifications)} disabled={!settings.push_notifications} onChange={(checked) => setSettings((prev) => ({ ...prev, push_announcement_notifications: checked }))} />
                      <ToggleRow title="Market status push notifications" description="Send job and market status updates to your webhook endpoint." checked={Boolean(settings.push_market_status_notifications)} disabled={!settings.push_notifications} onChange={(checked) => setSettings((prev) => ({ ...prev, push_market_status_notifications: checked }))} />
                      <ToggleRow title="Watchlist push notifications" description="Send watchlist-related updates to your webhook endpoint." checked={Boolean(settings.push_watchlist_notifications)} disabled={!settings.push_notifications} onChange={(checked) => setSettings((prev) => ({ ...prev, push_watchlist_notifications: checked }))} />
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
            <Card className="border-[#30363d] bg-[#161b22]">
              <CardHeader>
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-md bg-violet-500/10"><Palette className="h-5 w-5 text-violet-500" /></div>
                  <div>
                    <CardTitle className="text-[18px] text-[#e6edf3]">Display Preferences</CardTitle>
                    <CardDescription className="text-[13px] text-[#768390]">Personalize how charts and tables behave.</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="grid gap-6 md:grid-cols-2">
                <div className="space-y-2">
                  <Label className="text-[#e6edf3]">Theme</Label>
                  <Select value={theme} onValueChange={(value) => { setTheme(value as "light" | "dark"); setSettings((prev) => ({ ...prev, theme: value })); }}>
                    <SelectTrigger className="border-[#30363d] bg-[#0d1117] text-[#e6edf3]"><SelectValue /></SelectTrigger>
                    <SelectContent className="border-[#30363d] bg-[#161b22]">
                      <SelectItem value="dark">Dark Mode</SelectItem>
                      <SelectItem value="light">Light Mode</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label className="text-[#e6edf3]">Default Timeframe</Label>
                  <Select value={String(settings.default_timeframe || "6M")} onValueChange={(value) => setSettings((prev) => ({ ...prev, default_timeframe: value }))}>
                    <SelectTrigger className="border-[#30363d] bg-[#0d1117] text-[#e6edf3]"><SelectValue /></SelectTrigger>
                    <SelectContent className="border-[#30363d] bg-[#161b22]">
                      <SelectItem value="1D">1D</SelectItem><SelectItem value="1W">1W</SelectItem><SelectItem value="1M">1M</SelectItem><SelectItem value="3M">3M</SelectItem><SelectItem value="6M">6M</SelectItem><SelectItem value="1Y">1Y</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label className="text-[#e6edf3]">Date Format</Label>
                  <Select value={String(settings.date_format || "dd-mm-yyyy")} onValueChange={(value) => setSettings((prev) => ({ ...prev, date_format: value }))}>
                    <SelectTrigger className="border-[#30363d] bg-[#0d1117] text-[#e6edf3]"><SelectValue /></SelectTrigger>
                    <SelectContent className="border-[#30363d] bg-[#161b22]">
                      <SelectItem value="dd-mm-yyyy">DD/MM/YYYY</SelectItem><SelectItem value="mm-dd-yyyy">MM/DD/YYYY</SelectItem><SelectItem value="yyyy-mm-dd">YYYY-MM-DD</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label className="text-[#e6edf3]">Chart Type</Label>
                  <Select value={String(settings.chart_type || "candlestick")} onValueChange={(value) => setSettings((prev) => ({ ...prev, chart_type: value }))}>
                    <SelectTrigger className="border-[#30363d] bg-[#0d1117] text-[#e6edf3]"><SelectValue /></SelectTrigger>
                    <SelectContent className="border-[#30363d] bg-[#161b22]">
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
            <Card className="border-[#30363d] bg-[#161b22]">
              <CardHeader>
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-md bg-red-500/10"><Shield className="h-5 w-5 text-red-500" /></div>
                  <div>
                    <CardTitle className="text-[18px] text-[#e6edf3]">Security</CardTitle>
                    <CardDescription className="text-[13px] text-[#768390]">Change your password and secure your account.</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="grid gap-6 md:grid-cols-2">
                <div className="space-y-2 md:col-span-2"><Label className="text-[#e6edf3]">Current Password</Label><Input type="password" value={passwords.current} onChange={(e) => setPasswords((prev) => ({ ...prev, current: e.target.value }))} className="border-[#30363d] bg-[#0d1117] text-[#e6edf3]" /></div>
                <div className="space-y-2"><Label className="text-[#e6edf3]">New Password</Label><Input type="password" value={passwords.next} onChange={(e) => setPasswords((prev) => ({ ...prev, next: e.target.value }))} className="border-[#30363d] bg-[#0d1117] text-[#e6edf3]" /></div>
                <div className="space-y-2"><Label className="text-[#e6edf3]">Confirm New Password</Label><Input type="password" value={passwords.confirm} onChange={(e) => setPasswords((prev) => ({ ...prev, confirm: e.target.value }))} className="border-[#30363d] bg-[#0d1117] text-[#e6edf3]" /></div>
                <div className="md:col-span-2 flex justify-end"><Button className="bg-emerald-600 text-white hover:bg-emerald-700" onClick={updatePassword} disabled={saving}>Update Password</Button></div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="data" className="space-y-6">
            <Card className="border-[#30363d] bg-[#161b22]">
              <CardHeader>
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-md bg-cyan-500/10"><Database className="h-5 w-5 text-cyan-500" /></div>
                  <div>
                    <CardTitle className="text-[18px] text-[#e6edf3]">Data & Sync</CardTitle>
                    <CardDescription className="text-[13px] text-[#768390]">Overview of the data services connected to your account.</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4 text-[13px] text-[#9da7b3]">
                <div className="rounded-xl border border-[#30363d] bg-[#0d1117] p-4">Market data, portfolio analytics, and notification preferences are saved to your account profile automatically when you press save.</div>
                <div className="rounded-xl border border-[#30363d] bg-[#0d1117] p-4">Your personal settings do not change global admin/system settings. Delivery channels like email or webhook push only work if the backend is configured for them.</div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="billing" className="space-y-6">
            <Card className="border-[#30363d] bg-[#161b22]">
              <CardHeader>
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-md bg-amber-500/10"><CreditCard className="h-5 w-5 text-amber-500" /></div>
                  <div>
                    <CardTitle className="text-[18px] text-[#e6edf3]">Billing</CardTitle>
                    <CardDescription className="text-[13px] text-[#768390]">Billing features are not enabled in this build.</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="rounded-xl border border-[#30363d] bg-[#0d1117] p-4 text-[13px] text-[#9da7b3]">This area is reserved for future subscription and billing controls.</div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
