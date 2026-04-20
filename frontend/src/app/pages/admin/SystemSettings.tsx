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
import {
  Shield,
  Database,
  Bell,
  Mail,
  Globe,
  Lock,
  CheckCircle2,
  Save,
  Loader2,
} from "lucide-react";
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
  cacheEnabled: true,
  cacheDuration: "3600",
  rateLimitPerMinute: "60",
  apiTimeout: "30",
};

export function SystemSettings() {
  const [settings, setSettings] = useState(defaultSettings);
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
      setMessage("Settings saved successfully.");
    } catch (error: any) {
      setMessage(error?.message || "Failed to save settings.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#08090c]">
      <div className="mx-auto max-w-[1680px] px-6 py-8 lg:px-8">
        {/* Header */}
        <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-1.5">
            <h1 className="text-[32px] font-bold leading-tight tracking-tight text-[#e6edf3]">
              System Settings
            </h1>
            <p className="text-[13px] text-[#768390]">
              Configure system-wide settings and preferences
            </p>
          </div>
          <Button onClick={handleSave} disabled={saving} className="bg-emerald-600 text-white hover:bg-emerald-700">
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
            Save Changes
          </Button>
        </div>
        {message && <p className="mb-4 text-[13px] text-emerald-400">{message}</p>}
        {loading && <p className="mb-4 text-[13px] text-[#768390]">Loading saved system settings...</p>}

        <Tabs defaultValue="general" className="space-y-6">
          <TabsList>
            <TabsTrigger value="general">General</TabsTrigger>
            <TabsTrigger value="security">Security</TabsTrigger>
            <TabsTrigger value="sync">Data Sync</TabsTrigger>
            <TabsTrigger value="notifications">Notifications</TabsTrigger>
            <TabsTrigger value="performance">Performance</TabsTrigger>
          </TabsList>

          {/* General Settings */}
          <TabsContent value="general">
            <Card className="border-[#30363d] bg-[#161b22]">
              <CardHeader>
                <div className="flex items-center gap-3">
                  <Globe className="h-5 w-5 text-blue-500" />
                  <div>
                    <CardTitle className="text-[18px] text-[#e6edf3]">General Settings</CardTitle>
                    <CardDescription className="text-[13px] text-[#768390]">
                      Basic system configuration
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-2">
                  <Label htmlFor="siteName" className="text-[13px] text-[#e6edf3]">
                    Site Name
                  </Label>
                  <Input
                    id="siteName"
                    value={settings.siteName}
                    onChange={(e) => setSettings({ ...settings, siteName: e.target.value })}
                    className="border-[#30363d] bg-[#0d1117] text-[#e6edf3]"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="supportEmail" className="text-[13px] text-[#e6edf3]">
                    Support Email
                  </Label>
                  <Input
                    id="supportEmail"
                    type="email"
                    value={settings.supportEmail}
                    onChange={(e) => setSettings({ ...settings, supportEmail: e.target.value })}
                    className="border-[#30363d] bg-[#0d1117] text-[#e6edf3]"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="timezone" className="text-[13px] text-[#e6edf3]">
                    Default Timezone
                  </Label>
                  <Select
                    value={settings.timezone}
                    onValueChange={(value) => setSettings({ ...settings, timezone: value })}
                  >
                    <SelectTrigger className="border-[#30363d] bg-[#0d1117] text-[#e6edf3]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="border-[#30363d] bg-[#161b22]">
                      <SelectItem value="Asia/Colombo">Asia/Colombo (UTC+5:30)</SelectItem>
                      <SelectItem value="UTC">UTC</SelectItem>
                      <SelectItem value="America/New_York">America/New_York (EST)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <Separator className="bg-[#30363d]" />

                <div className="flex items-center justify-between rounded-md border border-[#30363d] bg-[#0d1117] p-4">
                  <div className="space-y-0.5">
                    <Label className="text-[13px] font-semibold text-[#e6edf3]">
                      Maintenance Mode
                    </Label>
                    <p className="text-[12px] text-[#768390]">
                      Disable public access for system maintenance
                    </p>
                  </div>
                  <Switch
                    checked={settings.maintenanceMode}
                    onCheckedChange={(checked) =>
                      setSettings({ ...settings, maintenanceMode: checked })
                    }
                  />
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Security Settings */}
          <TabsContent value="security">
            <Card className="border-[#30363d] bg-[#161b22]">
              <CardHeader>
                <div className="flex items-center gap-3">
                  <Lock className="h-5 w-5 text-red-500" />
                  <div>
                    <CardTitle className="text-[18px] text-[#e6edf3]">Security Settings</CardTitle>
                    <CardDescription className="text-[13px] text-[#768390]">
                      Authentication and access control
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-2">
                  <Label htmlFor="sessionTimeout" className="text-[13px] text-[#e6edf3]">
                    Session Timeout (minutes)
                  </Label>
                  <Input
                    id="sessionTimeout"
                    type="number"
                    value={settings.sessionTimeout}
                    onChange={(e) => setSettings({ ...settings, sessionTimeout: e.target.value })}
                    className="border-[#30363d] bg-[#0d1117] text-[#e6edf3]"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="maxLoginAttempts" className="text-[13px] text-[#e6edf3]">
                    Max Login Attempts
                  </Label>
                  <Input
                    id="maxLoginAttempts"
                    type="number"
                    value={settings.maxLoginAttempts}
                    onChange={(e) => setSettings({ ...settings, maxLoginAttempts: e.target.value })}
                    className="border-[#30363d] bg-[#0d1117] text-[#e6edf3]"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="passwordMinLength" className="text-[13px] text-[#e6edf3]">
                    Minimum Password Length
                  </Label>
                  <Input
                    id="passwordMinLength"
                    type="number"
                    value={settings.passwordMinLength}
                    onChange={(e) =>
                      setSettings({ ...settings, passwordMinLength: e.target.value })
                    }
                    className="border-[#30363d] bg-[#0d1117] text-[#e6edf3]"
                  />
                </div>

                <Separator className="bg-[#30363d]" />

                <div className="flex items-center justify-between rounded-md border border-[#30363d] bg-[#0d1117] p-4">
                  <div className="space-y-0.5">
                    <Label className="text-[13px] font-semibold text-[#e6edf3]">
                      Require Two-Factor Authentication
                    </Label>
                    <p className="text-[12px] text-[#768390]">
                      Enforce 2FA for all admin users
                    </p>
                  </div>
                  <Switch
                    checked={settings.requireTwoFactor}
                    onCheckedChange={(checked) =>
                      setSettings({ ...settings, requireTwoFactor: checked })
                    }
                  />
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Data Sync Settings */}
          <TabsContent value="sync">
            <Card className="border-[#30363d] bg-[#161b22]">
              <CardHeader>
                <div className="flex items-center gap-3">
                  <Database className="h-5 w-5 text-emerald-500" />
                  <div>
                    <CardTitle className="text-[18px] text-[#e6edf3]">
                      Data Sync Settings
                    </CardTitle>
                    <CardDescription className="text-[13px] text-[#768390]">
                      Configure automatic data synchronization
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="flex items-center justify-between rounded-md border border-[#30363d] bg-[#0d1117] p-4">
                  <div className="space-y-0.5">
                    <Label className="text-[13px] font-semibold text-[#e6edf3]">
                      Enable Auto Sync
                    </Label>
                    <p className="text-[12px] text-[#768390]">
                      Automatically sync data at specified intervals
                    </p>
                  </div>
                  <Switch
                    checked={settings.autoSync}
                    onCheckedChange={(checked) =>
                      setSettings({ ...settings, autoSync: checked })
                    }
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="syncInterval" className="text-[13px] text-[#e6edf3]">
                    Sync Interval (minutes)
                  </Label>
                  <Input
                    id="syncInterval"
                    type="number"
                    value={settings.syncInterval}
                    onChange={(e) => setSettings({ ...settings, syncInterval: e.target.value })}
                    className="border-[#30363d] bg-[#0d1117] text-[#e6edf3]"
                    disabled={!settings.autoSync}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="maxRetries" className="text-[13px] text-[#e6edf3]">
                    Max Retry Attempts
                  </Label>
                  <Input
                    id="maxRetries"
                    type="number"
                    value={settings.maxRetries}
                    onChange={(e) => setSettings({ ...settings, maxRetries: e.target.value })}
                    className="border-[#30363d] bg-[#0d1117] text-[#e6edf3]"
                  />
                </div>

                <Separator className="bg-[#30363d]" />

                <div className="flex items-center justify-between rounded-md border border-[#30363d] bg-[#0d1117] p-4">
                  <div className="space-y-0.5">
                    <Label className="text-[13px] font-semibold text-[#e6edf3]">
                      Sync Notifications
                    </Label>
                    <p className="text-[12px] text-[#768390]">
                      Send notifications on sync completion or errors
                    </p>
                  </div>
                  <Switch
                    checked={settings.syncNotifications}
                    onCheckedChange={(checked) =>
                      setSettings({ ...settings, syncNotifications: checked })
                    }
                  />
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Notification Settings */}
          <TabsContent value="notifications">
            <Card className="border-[#30363d] bg-[#161b22]">
              <CardHeader>
                <div className="flex items-center gap-3">
                  <Bell className="h-5 w-5 text-yellow-500" />
                  <div>
                    <CardTitle className="text-[18px] text-[#e6edf3]">
                      Notification Settings
                    </CardTitle>
                    <CardDescription className="text-[13px] text-[#768390]">
                      Configure user notification channels
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="flex items-center justify-between rounded-md border border-[#30363d] bg-[#0d1117] p-4">
                  <div className="space-y-0.5">
                    <Label className="text-[13px] font-semibold text-[#e6edf3]">
                      Email Notifications
                    </Label>
                    <p className="text-[12px] text-[#768390]">
                      Send alerts and updates via email
                    </p>
                  </div>
                  <Switch
                    checked={settings.emailNotifications}
                    onCheckedChange={(checked) =>
                      setSettings({ ...settings, emailNotifications: checked })
                    }
                  />
                </div>

                <div className="flex items-center justify-between rounded-md border border-[#30363d] bg-[#0d1117] p-4">
                  <div className="space-y-0.5">
                    <Label className="text-[13px] font-semibold text-[#e6edf3]">
                      Push Notifications
                    </Label>
                    <p className="text-[12px] text-[#768390]">
                      Send real-time browser notifications
                    </p>
                  </div>
                  <Switch
                    checked={settings.pushNotifications}
                    onCheckedChange={(checked) =>
                      setSettings({ ...settings, pushNotifications: checked })
                    }
                  />
                </div>

                <div className="flex items-center justify-between rounded-md border border-[#30363d] bg-[#0d1117] p-4">
                  <div className="space-y-0.5">
                    <Label className="text-[13px] font-semibold text-[#e6edf3]">
                      SMS Notifications
                    </Label>
                    <p className="text-[12px] text-[#768390]">
                      Send critical alerts via SMS (premium feature)
                    </p>
                  </div>
                  <Switch
                    checked={settings.smsNotifications}
                    onCheckedChange={(checked) =>
                      setSettings({ ...settings, smsNotifications: checked })
                    }
                  />
                </div>

                <Separator className="bg-[#30363d]" />

                <div className="space-y-2">
                  <Label htmlFor="notificationDelay" className="text-[13px] text-[#e6edf3]">
                    Notification Delay (seconds)
                  </Label>
                  <Input
                    id="notificationDelay"
                    type="number"
                    value={settings.notificationDelay}
                    onChange={(e) =>
                      setSettings({ ...settings, notificationDelay: e.target.value })
                    }
                    className="border-[#30363d] bg-[#0d1117] text-[#e6edf3]"
                  />
                  <p className="text-[11px] text-[#545d68]">
                    Delay before sending notifications to prevent spam
                  </p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Performance Settings */}
          <TabsContent value="performance">
            <Card className="border-[#30363d] bg-[#161b22]">
              <CardHeader>
                <div className="flex items-center gap-3">
                  <Shield className="h-5 w-5 text-purple-500" />
                  <div>
                    <CardTitle className="text-[18px] text-[#e6edf3]">
                      Performance Settings
                    </CardTitle>
                    <CardDescription className="text-[13px] text-[#768390]">
                      Optimize system performance and caching
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="flex items-center justify-between rounded-md border border-[#30363d] bg-[#0d1117] p-4">
                  <div className="space-y-0.5">
                    <Label className="text-[13px] font-semibold text-[#e6edf3]">
                      Enable Caching
                    </Label>
                    <p className="text-[12px] text-[#768390]">
                      Cache frequently accessed data for faster response times
                    </p>
                  </div>
                  <Switch
                    checked={settings.cacheEnabled}
                    onCheckedChange={(checked) =>
                      setSettings({ ...settings, cacheEnabled: checked })
                    }
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="cacheDuration" className="text-[13px] text-[#e6edf3]">
                    Cache Duration (seconds)
                  </Label>
                  <Input
                    id="cacheDuration"
                    type="number"
                    value={settings.cacheDuration}
                    onChange={(e) => setSettings({ ...settings, cacheDuration: e.target.value })}
                    className="border-[#30363d] bg-[#0d1117] text-[#e6edf3]"
                    disabled={!settings.cacheEnabled}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="rateLimitPerMinute" className="text-[13px] text-[#e6edf3]">
                    Rate Limit (requests per minute)
                  </Label>
                  <Input
                    id="rateLimitPerMinute"
                    type="number"
                    value={settings.rateLimitPerMinute}
                    onChange={(e) =>
                      setSettings({ ...settings, rateLimitPerMinute: e.target.value })
                    }
                    className="border-[#30363d] bg-[#0d1117] text-[#e6edf3]"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="apiTimeout" className="text-[13px] text-[#e6edf3]">
                    API Timeout (seconds)
                  </Label>
                  <Input
                    id="apiTimeout"
                    type="number"
                    value={settings.apiTimeout}
                    onChange={(e) => setSettings({ ...settings, apiTimeout: e.target.value })}
                    className="border-[#30363d] bg-[#0d1117] text-[#e6edf3]"
                  />
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
