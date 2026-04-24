import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../components/ui/card";
import { Label } from "../components/ui/label";
import { Input } from "../components/ui/input";
import { Button } from "../components/ui/button";
import { Switch } from "../components/ui/switch";
import { Separator } from "../components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../components/ui/tabs";
import { User, Bell, Shield, Palette, Database, CreditCard, Loader2 } from "lucide-react";
import { authApi, settingsApi } from "../../lib/api/services";
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
};

export function Settings() {
  const { user, refreshUser } = useAuth();
  const { theme, setTheme } = useTheme();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [profile, setProfile] = useState({ name: "", email: "", phone: "" });
  const [settings, setSettings] = useState<Record<string, any>>(defaultSettings);
  const [passwords, setPasswords] = useState({ current: "", next: "", confirm: "" });

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const [me, userSettings] = await Promise.all([authApi.me(), settingsApi.getUserSettings()]);
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
  }, [user?.email, user?.name]);

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

  if (loading) {
    return (
      <div className="min-h-screen bg-[#08090c] flex items-center justify-center text-[#768390]">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading settings...
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#08090c]">
      <div className="mx-auto max-w-[1200px] px-6 py-8 lg:px-8">
        <div className="mb-8 space-y-1.5">
          <h1 className="text-[32px] font-bold leading-tight tracking-tight text-[#e6edf3]">Settings</h1>
          <p className="text-[13px] text-[#768390]">Manage your account settings and preferences</p>
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
                    <CardDescription className="text-[13px] text-[#768390]">Update your account profile information</CardDescription>
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
                  <Button className="bg-emerald-600 text-white hover:bg-emerald-700" onClick={saveProfile} disabled={saving}>
                    {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                    Save Changes
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="notifications" className="space-y-6">
            <Card className="border-[#30363d] bg-[#161b22]">
              <CardHeader>
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-md bg-blue-500/10"><Bell className="h-5 w-5 text-blue-500" /></div>
                  <div>
                    <CardTitle className="text-[18px] text-[#e6edf3]">Notification Preferences</CardTitle>
                    <CardDescription className="text-[13px] text-[#768390]">Choose what notifications you want to receive</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-6">
                {[
                  ["Price Alerts", "Get notified when stocks reach your target prices", "alert_notifications"],
                  ["Market Announcements", "Corporate announcements and market news", "announcement_notifications"],
                  ["Market Opening/Closing", "Daily market status updates", "market_status_notifications"],
                  ["Watchlist Updates", "Significant changes to stocks in your watchlist", "watchlist_notifications"],
                  ["Email Notifications", "Receive notifications via email", "email_notifications"],
                  ["Push Notifications", "Receive browser/device push alerts", "push_notifications"],
                ].map(([title, desc, key], idx) => (
                  <div key={String(key)}>
                    {idx > 0 && <Separator className="bg-[#30363d] mb-4" />}
                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <Label className="text-[13px] font-semibold text-[#e6edf3]">{title}</Label>
                        <p className="text-[12px] text-[#768390]">{desc}</p>
                      </div>
                      <Switch checked={Boolean(settings[key])} onCheckedChange={(checked) => setSettings((prev) => ({ ...prev, [key]: checked }))} />
                    </div>
                  </div>
                ))}
                <Separator className="bg-[#30363d]" />
                <div className="flex justify-end">
                  <Button className="bg-emerald-600 text-white hover:bg-emerald-700" onClick={savePreferences} disabled={saving}>Save Preferences</Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="preferences" className="space-y-6">
            <Card className="border-[#30363d] bg-[#161b22]">
              <CardHeader>
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-md bg-purple-500/10"><Palette className="h-5 w-5 text-purple-500" /></div>
                  <div>
                    <CardTitle className="text-[18px] text-[#e6edf3]">Display Preferences</CardTitle>
                    <CardDescription className="text-[13px] text-[#768390]">Customize the way market data appears</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid gap-6 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label className="text-[#e6edf3]">Currency</Label>
                    <Select value={settings.currency} onValueChange={(value) => setSettings((prev) => ({ ...prev, currency: value }))}>
                      <SelectTrigger className="border-[#30363d] bg-[#0d1117] text-[#e6edf3]"><SelectValue /></SelectTrigger>
                      <SelectContent className="border-[#30363d] bg-[#161b22]">
                        <SelectItem value="lkr">LKR - Sri Lankan Rupee</SelectItem>
                        <SelectItem value="usd">USD - US Dollar</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-[#e6edf3]">Date Format</Label>
                    <Select value={settings.date_format} onValueChange={(value) => setSettings((prev) => ({ ...prev, date_format: value }))}>
                      <SelectTrigger className="border-[#30363d] bg-[#0d1117] text-[#e6edf3]"><SelectValue /></SelectTrigger>
                      <SelectContent className="border-[#30363d] bg-[#161b22]">
                        <SelectItem value="dd-mm-yyyy">DD/MM/YYYY</SelectItem>
                        <SelectItem value="mm-dd-yyyy">MM/DD/YYYY</SelectItem>
                        <SelectItem value="yyyy-mm-dd">YYYY-MM-DD</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
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
                    <Label className="text-[#e6edf3]">Default Chart Type</Label>
                    <Select value={settings.chart_type} onValueChange={(value) => setSettings((prev) => ({ ...prev, chart_type: value }))}>
                      <SelectTrigger className="border-[#30363d] bg-[#0d1117] text-[#e6edf3]"><SelectValue /></SelectTrigger>
                      <SelectContent className="border-[#30363d] bg-[#161b22]">
                        <SelectItem value="candlestick">Candlestick</SelectItem>
                        <SelectItem value="line">Line</SelectItem>
                        <SelectItem value="area">Area</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-[#e6edf3]">Default Time Range</Label>
                    <Select value={settings.default_timeframe} onValueChange={(value) => setSettings((prev) => ({ ...prev, default_timeframe: value }))}>
                      <SelectTrigger className="border-[#30363d] bg-[#0d1117] text-[#e6edf3]"><SelectValue /></SelectTrigger>
                      <SelectContent className="border-[#30363d] bg-[#161b22]">
                        <SelectItem value="1M">1 Month</SelectItem>
                        <SelectItem value="3M">3 Months</SelectItem>
                        <SelectItem value="6M">6 Months</SelectItem>
                        <SelectItem value="1Y">1 Year</SelectItem>
                        <SelectItem value="ALL">All Time</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <Separator className="bg-[#30363d]" />
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label className="text-[13px] font-semibold text-[#e6edf3]">Show Advanced Metrics</Label>
                    <p className="text-[12px] text-[#768390]">Display technical indicators and advanced analytics</p>
                  </div>
                  <Switch checked={Boolean(settings.advanced_metrics)} onCheckedChange={(checked) => setSettings((prev) => ({ ...prev, advanced_metrics: checked }))} />
                </div>
                <Separator className="bg-[#30363d]" />
                <div className="flex justify-end gap-3">
                  <Button variant="outline" className="border-[#30363d] text-[#768390] hover:bg-[#1c2128] hover:text-[#e6edf3]" onClick={() => setSettings(defaultSettings)}>
                    Reset to Default
                  </Button>
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
                    <CardTitle className="text-[18px] text-[#e6edf3]">Security Settings</CardTitle>
                    <CardDescription className="text-[13px] text-[#768390]">Manage your account security</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-2">
                  <Label htmlFor="currentPassword" className="text-[#e6edf3]">Current Password</Label>
                  <Input id="currentPassword" type="password" value={passwords.current} onChange={(e) => setPasswords((prev) => ({ ...prev, current: e.target.value }))} className="border-[#30363d] bg-[#0d1117] text-[#e6edf3]" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="newPassword" className="text-[#e6edf3]">New Password</Label>
                  <Input id="newPassword" type="password" value={passwords.next} onChange={(e) => setPasswords((prev) => ({ ...prev, next: e.target.value }))} className="border-[#30363d] bg-[#0d1117] text-[#e6edf3]" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="confirmPassword" className="text-[#e6edf3]">Confirm New Password</Label>
                  <Input id="confirmPassword" type="password" value={passwords.confirm} onChange={(e) => setPasswords((prev) => ({ ...prev, confirm: e.target.value }))} className="border-[#30363d] bg-[#0d1117] text-[#e6edf3]" />
                </div>
                <Separator className="bg-[#30363d]" />
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label className="text-[13px] font-semibold text-[#e6edf3]">Two-Factor Authentication</Label>
                    <p className="text-[12px] text-[#768390]">Add an extra layer of security to your account</p>
                  </div>
                  <Button variant="outline" className="border-[#30363d] text-[#768390] hover:bg-[#1c2128] hover:text-[#e6edf3]">Enable</Button>
                </div>
                <Separator className="bg-[#30363d]" />
                <div className="flex justify-end gap-3">
                  <Button variant="outline" className="border-[#30363d] text-[#768390] hover:bg-[#1c2128] hover:text-[#e6edf3]" onClick={() => setPasswords({ current: "", next: "", confirm: "" })}>Cancel</Button>
                  <Button className="bg-emerald-600 text-white hover:bg-emerald-700" onClick={updatePassword} disabled={saving}>Update Password</Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="data" className="space-y-6">
            <Card className="border-[#30363d] bg-[#161b22]">
              <CardHeader>
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-md bg-yellow-500/10"><Database className="h-5 w-5 text-yellow-500" /></div>
                  <div>
                    <CardTitle className="text-[18px] text-[#e6edf3]">Data Management</CardTitle>
                    <CardDescription className="text-[13px] text-[#768390]">Export or delete your data</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-4">
                  <div className="flex items-center justify-between rounded-md border border-[#30363d] bg-[#0d1117] p-4">
                    <div className="space-y-0.5">
                      <Label className="text-[13px] font-semibold text-[#e6edf3]">Export Your Data</Label>
                      <p className="text-[12px] text-[#768390]">Download your watchlists, alerts, and settings</p>
                    </div>
                    <Button variant="outline" className="border-[#30363d] text-[#768390] hover:bg-[#1c2128] hover:text-[#e6edf3]">Export</Button>
                  </div>
                  <div className="flex items-center justify-between rounded-md border border-red-500/30 bg-red-500/5 p-4">
                    <div className="space-y-0.5">
                      <Label className="text-[13px] font-semibold text-red-400">Delete Account</Label>
                      <p className="text-[12px] text-red-400/70">Permanently delete your account and all data</p>
                    </div>
                    <Button variant="outline" className="border-red-500/30 text-red-400 hover:bg-red-500/10 hover:text-red-300">Delete</Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="billing" className="space-y-6">
            <Card className="border-[#30363d] bg-[#161b22]">
              <CardHeader>
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-md bg-green-500/10"><CreditCard className="h-5 w-5 text-green-500" /></div>
                  <div>
                    <CardTitle className="text-[18px] text-[#e6edf3]">Billing & Subscription</CardTitle>
                    <CardDescription className="text-[13px] text-[#768390]">Manage your subscription and payment methods</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="rounded-md border border-[#30363d] bg-[#0d1117] p-6">
                  <div className="mb-4 flex items-start justify-between">
                    <div>
                      <h3 className="text-[15px] font-semibold text-[#e6edf3]">Pro Plan</h3>
                      <p className="text-[13px] text-[#768390]">Full access to all features</p>
                    </div>
                    <div className="text-right">
                      <p className="text-[24px] font-bold text-emerald-500">LKR 2,500</p>
                      <p className="text-[11px] text-[#768390]">per month</p>
                    </div>
                  </div>
                  <Separator className="mb-4 bg-[#30363d]" />
                  <div className="space-y-2 text-[12px] text-[#768390]">
                    <p>Next billing date: April 15, 2026</p>
                    <p>Payment method: •••• •••• •••• 4242</p>
                  </div>
                </div>
                <div className="flex justify-end gap-3">
                  <Button variant="outline" className="border-[#30363d] text-[#768390] hover:bg-[#1c2128] hover:text-[#e6edf3]">Update Payment Method</Button>
                  <Button className="bg-emerald-600 text-white hover:bg-emerald-700">Manage Subscription</Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
