import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../../components/ui/card";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { Switch } from "../../components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../../components/ui/tabs";
import { Shield, Database, Bell, Globe, Lock, Save, Loader2, Gauge, Settings2 } from "lucide-react";
import { Separator } from "../../components/ui/separator";
import { adminApi } from "../../../lib/api/services";

const defaultSettings = {
  siteName: "TradexaLK",
  supportEmail: "support@tradexalk.com",
  timezone: "Asia/Colombo",
  maintenanceMode: false,
  sessionTimeout: "30",
  maxLoginAttempts: "5",
  passwordMinLength: "8",
  requireTwoFactor: false,
  autoSync: true,
  syncInterval: "60",
  maxRetries: "3",
  syncNotifications: true,
  emailNotifications: true,
  pushNotifications: false,
  smsNotifications: false,
  notificationDelay: "5",
  userAlertsEnabled: true,
  alertEvaluationIntervalSeconds: "60",
  notificationDeliveryBatchSize: "50",
  cacheEnabled: true,
  cacheDuration: "3600",
  rateLimitPerMinute: "60",
  apiTimeout: "30",
  provider: "hybrid",
};

function AdminToggle({ title, description, checked, onChange }: { title: string; description: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return (
    <div className="flex items-start justify-between gap-4 rounded-xl border border-[#30363d] bg-[#0d1117] p-4">
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <Label className="text-[13px] font-semibold text-[#e6edf3]">{title}</Label>
          <Badge className={checked ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300" : "border-[#3a4450] bg-[#111927] text-[#9da7b3]"}>{checked ? "Enabled" : "Disabled"}</Badge>
        </div>
        <p className="text-[12px] text-[#768390]">{description}</p>
      </div>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  );
}

export function SystemSettings() {
  const [settings, setSettings] = useState<any>(defaultSettings);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    adminApi.getSystemSettings().then((response) => {
      setSettings({ ...defaultSettings, ...(response?.settings || {}) });
    }).finally(() => setLoading(false));
  }, []);

  const handleSave = async () => {
    setSaving(true);
    setMessage(null);
    try {
      const response = await adminApi.saveSystemSettings(settings);
      setSettings({ ...defaultSettings, ...(response?.settings || settings) });
      setMessage("System settings saved successfully.");
    } catch (error: any) {
      setMessage(error?.message || "Failed to save settings.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#08090c]">
      <div className="mx-auto max-w-[1500px] px-6 py-8 lg:px-8">
        <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-1.5">
            <h1 className="text-[32px] font-bold leading-tight tracking-tight text-[#e6edf3]">System Settings</h1>
            <p className="text-[13px] text-[#768390]">Control global platform behavior, user alert policy, delivery channels, and runtime limits.</p>
            {message && <p className="text-[13px] text-emerald-400">{message}</p>}
          </div>
          <Button onClick={handleSave} disabled={saving} className="bg-emerald-600 text-white hover:bg-emerald-700">
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />} Save Changes
          </Button>
        </div>

        <div className="mb-6 grid gap-4 md:grid-cols-4">
          <Card className="border-[#30363d] bg-[#161b22]"><CardContent className="p-5"><div className="text-[12px] text-[#768390]">User alerts</div><div className="mt-2 text-[26px] font-bold text-[#e6edf3]">{settings.userAlertsEnabled ? "On" : "Off"}</div></CardContent></Card>
          <Card className="border-[#30363d] bg-[#161b22]"><CardContent className="p-5"><div className="text-[12px] text-[#768390]">Email delivery</div><div className="mt-2 text-[26px] font-bold text-[#e6edf3]">{settings.emailNotifications ? "On" : "Off"}</div></CardContent></Card>
          <Card className="border-[#30363d] bg-[#161b22]"><CardContent className="p-5"><div className="text-[12px] text-[#768390]">External push delivery</div><div className="mt-2 text-[26px] font-bold text-[#e6edf3]">{settings.pushNotifications ? "On" : "Off"}</div></CardContent></Card>
          <Card className="border-[#30363d] bg-[#161b22]"><CardContent className="p-5"><div className="text-[12px] text-[#768390]">Provider</div><div className="mt-2 text-[26px] font-bold text-[#e6edf3]">{String(settings.provider || "hybrid")}</div></CardContent></Card>
        </div>

        {loading && <p className="mb-4 text-[13px] text-[#768390]">Loading saved system settings...</p>}

        <Tabs defaultValue="notifications" className="space-y-6">
          <TabsList>
            <TabsTrigger value="notifications">Notifications</TabsTrigger>
            <TabsTrigger value="general">General</TabsTrigger>
            <TabsTrigger value="security">Security</TabsTrigger>
            <TabsTrigger value="sync">Data Sync</TabsTrigger>
            <TabsTrigger value="performance">Performance</TabsTrigger>
          </TabsList>

          <TabsContent value="notifications">
            <Card className="border-[#30363d] bg-[#161b22]">
              <CardHeader>
                <div className="flex items-center gap-3">
                  <Bell className="h-5 w-5 text-yellow-500" />
                  <div>
                    <CardTitle className="text-[18px] text-[#e6edf3]">Notification & Alert Controls</CardTitle>
                    <CardDescription className="text-[13px] text-[#768390]">These are real backend controls. They affect user alert creation, scheduled evaluation, and delivery behavior.</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid gap-6 lg:grid-cols-2">
                  <AdminToggle title="User-created alerts" description="Allow normal investors to create personal price, move, volume, and announcement alerts." checked={Boolean(settings.userAlertsEnabled)} onChange={(checked) => setSettings({ ...settings, userAlertsEnabled: checked })} />
                  <AdminToggle title="Email notifications" description="Master backend switch for email delivery. Turn this off to suppress all email fan-out." checked={Boolean(settings.emailNotifications)} onChange={(checked) => setSettings({ ...settings, emailNotifications: checked })} />
                  <AdminToggle title="External push delivery" description="Master backend switch for advanced external push/webhook delivery." checked={Boolean(settings.pushNotifications)} onChange={(checked) => setSettings({ ...settings, pushNotifications: checked })} />
                  <AdminToggle title="SMS notifications" description="Reserved for future SMS delivery integration." checked={Boolean(settings.smsNotifications)} onChange={(checked) => setSettings({ ...settings, smsNotifications: checked })} />
                </div>

                <Separator className="bg-[#30363d]" />

                <div className="grid gap-6 md:grid-cols-3">
                  <div className="space-y-2">
                    <Label htmlFor="notificationDelay" className="text-[13px] text-[#e6edf3]">Notification Delay (seconds)</Label>
                    <Input id="notificationDelay" type="number" value={settings.notificationDelay} onChange={(e) => setSettings({ ...settings, notificationDelay: e.target.value })} className="border-[#30363d] bg-[#08090c] text-[#e6edf3]" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="alertEvaluationIntervalSeconds" className="text-[13px] text-[#e6edf3]">Alert Evaluation Interval (seconds)</Label>
                    <Input id="alertEvaluationIntervalSeconds" type="number" value={settings.alertEvaluationIntervalSeconds} onChange={(e) => setSettings({ ...settings, alertEvaluationIntervalSeconds: e.target.value })} className="border-[#30363d] bg-[#08090c] text-[#e6edf3]" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="notificationDeliveryBatchSize" className="text-[13px] text-[#e6edf3]">Delivery Batch Size</Label>
                    <Input id="notificationDeliveryBatchSize" type="number" value={settings.notificationDeliveryBatchSize} onChange={(e) => setSettings({ ...settings, notificationDeliveryBatchSize: e.target.value })} className="border-[#30363d] bg-[#08090c] text-[#e6edf3]" />
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="general">
            <Card className="border-[#30363d] bg-[#161b22]">
              <CardHeader>
                <div className="flex items-center gap-3"><Globe className="h-5 w-5 text-blue-500" /><div><CardTitle className="text-[18px] text-[#e6edf3]">General Settings</CardTitle><CardDescription className="text-[13px] text-[#768390]">Basic system configuration.</CardDescription></div></div>
              </CardHeader>
              <CardContent className="grid gap-6 md:grid-cols-2">
                <div className="space-y-2"><Label htmlFor="siteName" className="text-[13px] text-[#e6edf3]">Site Name</Label><Input id="siteName" value={settings.siteName} onChange={(e) => setSettings({ ...settings, siteName: e.target.value })} className="border-[#30363d] bg-[#0d1117] text-[#e6edf3]" /></div>
                <div className="space-y-2"><Label htmlFor="supportEmail" className="text-[13px] text-[#e6edf3]">Support Email</Label><Input id="supportEmail" type="email" value={settings.supportEmail} onChange={(e) => setSettings({ ...settings, supportEmail: e.target.value })} className="border-[#30363d] bg-[#0d1117] text-[#e6edf3]" /></div>
                <div className="space-y-2"><Label htmlFor="timezone" className="text-[13px] text-[#e6edf3]">Timezone</Label><Select value={settings.timezone} onValueChange={(value) => setSettings({ ...settings, timezone: value })}><SelectTrigger className="border-[#30363d] bg-[#0d1117] text-[#e6edf3]"><SelectValue /></SelectTrigger><SelectContent className="border-[#30363d] bg-[#161b22]"><SelectItem value="Asia/Colombo">Asia/Colombo</SelectItem><SelectItem value="UTC">UTC</SelectItem></SelectContent></Select></div>
                <div className="space-y-2"><Label htmlFor="provider" className="text-[13px] text-[#e6edf3]">Active Provider</Label><Select value={String(settings.provider || "hybrid")} onValueChange={(value) => setSettings({ ...settings, provider: value })}><SelectTrigger className="border-[#30363d] bg-[#0d1117] text-[#e6edf3]"><SelectValue /></SelectTrigger><SelectContent className="border-[#30363d] bg-[#161b22]"><SelectItem value="hybrid">Hybrid</SelectItem><SelectItem value="cse">CSE</SelectItem><SelectItem value="db">DB</SelectItem></SelectContent></Select></div>
                <div className="md:col-span-2"><AdminToggle title="Maintenance Mode" description="Disable normal public access for maintenance windows." checked={Boolean(settings.maintenanceMode)} onChange={(checked) => setSettings({ ...settings, maintenanceMode: checked })} /></div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="security">
            <Card className="border-[#30363d] bg-[#161b22]">
              <CardHeader>
                <div className="flex items-center gap-3"><Lock className="h-5 w-5 text-red-500" /><div><CardTitle className="text-[18px] text-[#e6edf3]">Security Settings</CardTitle><CardDescription className="text-[13px] text-[#768390]">Authentication and access control.</CardDescription></div></div>
              </CardHeader>
              <CardContent className="grid gap-6 md:grid-cols-3">
                <div className="space-y-2"><Label htmlFor="sessionTimeout" className="text-[13px] text-[#e6edf3]">Session Timeout (minutes)</Label><Input id="sessionTimeout" type="number" value={settings.sessionTimeout} onChange={(e) => setSettings({ ...settings, sessionTimeout: e.target.value })} className="border-[#30363d] bg-[#0d1117] text-[#e6edf3]" /></div>
                <div className="space-y-2"><Label htmlFor="maxLoginAttempts" className="text-[13px] text-[#e6edf3]">Max Login Attempts</Label><Input id="maxLoginAttempts" type="number" value={settings.maxLoginAttempts} onChange={(e) => setSettings({ ...settings, maxLoginAttempts: e.target.value })} className="border-[#30363d] bg-[#0d1117] text-[#e6edf3]" /></div>
                <div className="space-y-2"><Label htmlFor="passwordMinLength" className="text-[13px] text-[#e6edf3]">Min Password Length</Label><Input id="passwordMinLength" type="number" value={settings.passwordMinLength} onChange={(e) => setSettings({ ...settings, passwordMinLength: e.target.value })} className="border-[#30363d] bg-[#0d1117] text-[#e6edf3]" /></div>
                <div className="md:col-span-3"><AdminToggle title="Require Two-Factor Authentication" description="Reserve and enforce 2FA policy for admin users when enabled by the auth stack." checked={Boolean(settings.requireTwoFactor)} onChange={(checked) => setSettings({ ...settings, requireTwoFactor: checked })} /></div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="sync">
            <Card className="border-[#30363d] bg-[#161b22]">
              <CardHeader>
                <div className="flex items-center gap-3"><Database className="h-5 w-5 text-emerald-500" /><div><CardTitle className="text-[18px] text-[#e6edf3]">Data Sync Settings</CardTitle><CardDescription className="text-[13px] text-[#768390]">Automatic data synchronization controls.</CardDescription></div></div>
              </CardHeader>
              <CardContent className="space-y-6">
                <AdminToggle title="Enable Auto Sync" description="Run automated sync jobs at the configured interval." checked={Boolean(settings.autoSync)} onChange={(checked) => setSettings({ ...settings, autoSync: checked })} />
                <div className="grid gap-6 md:grid-cols-3">
                  <div className="space-y-2"><Label htmlFor="syncInterval" className="text-[13px] text-[#e6edf3]">Sync Interval (minutes)</Label><Input id="syncInterval" type="number" value={settings.syncInterval} onChange={(e) => setSettings({ ...settings, syncInterval: e.target.value })} className="border-[#30363d] bg-[#0d1117] text-[#e6edf3]" disabled={!settings.autoSync} /></div>
                  <div className="space-y-2"><Label htmlFor="maxRetries" className="text-[13px] text-[#e6edf3]">Max Retry Attempts</Label><Input id="maxRetries" type="number" value={settings.maxRetries} onChange={(e) => setSettings({ ...settings, maxRetries: e.target.value })} className="border-[#30363d] bg-[#0d1117] text-[#e6edf3]" /></div>
                  <div className="space-y-2"><Label htmlFor="apiTimeout" className="text-[13px] text-[#e6edf3]">API Timeout (seconds)</Label><Input id="apiTimeout" type="number" value={settings.apiTimeout} onChange={(e) => setSettings({ ...settings, apiTimeout: e.target.value })} className="border-[#30363d] bg-[#0d1117] text-[#e6edf3]" /></div>
                </div>
                <AdminToggle title="Sync Notifications" description="Create admin notifications when sync jobs complete or fail." checked={Boolean(settings.syncNotifications)} onChange={(checked) => setSettings({ ...settings, syncNotifications: checked })} />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="performance">
            <Card className="border-[#30363d] bg-[#161b22]">
              <CardHeader>
                <div className="flex items-center gap-3"><Gauge className="h-5 w-5 text-cyan-500" /><div><CardTitle className="text-[18px] text-[#e6edf3]">Performance & Limits</CardTitle><CardDescription className="text-[13px] text-[#768390]">Runtime cache and API guardrails.</CardDescription></div></div>
              </CardHeader>
              <CardContent className="space-y-6">
                <AdminToggle title="Cache Enabled" description="Use runtime cache for frequently accessed market data and summaries." checked={Boolean(settings.cacheEnabled)} onChange={(checked) => setSettings({ ...settings, cacheEnabled: checked })} />
                <div className="grid gap-6 md:grid-cols-3">
                  <div className="space-y-2"><Label htmlFor="cacheDuration" className="text-[13px] text-[#e6edf3]">Cache Duration (seconds)</Label><Input id="cacheDuration" type="number" value={settings.cacheDuration} onChange={(e) => setSettings({ ...settings, cacheDuration: e.target.value })} className="border-[#30363d] bg-[#0d1117] text-[#e6edf3]" /></div>
                  <div className="space-y-2"><Label htmlFor="rateLimitPerMinute" className="text-[13px] text-[#e6edf3]">Rate Limit / Minute</Label><Input id="rateLimitPerMinute" type="number" value={settings.rateLimitPerMinute} onChange={(e) => setSettings({ ...settings, rateLimitPerMinute: e.target.value })} className="border-[#30363d] bg-[#0d1117] text-[#e6edf3]" /></div>
                  <div className="rounded-xl border border-[#30363d] bg-[#0d1117] p-4 text-[13px] text-[#9da7b3]"><div className="mb-1 flex items-center gap-2 text-[#e6edf3]"><Settings2 className="h-4 w-4" /> Runtime note</div>These fields affect backend behavior only after they are read by the corresponding services/jobs. They are not cosmetic UI switches.</div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
