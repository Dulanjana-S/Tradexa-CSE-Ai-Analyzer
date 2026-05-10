import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { Badge } from "../../components/ui/badge";
import { Separator } from "../../components/ui/separator";
import { Loader2, Database, Cpu, Users, Bell, RefreshCw, ShieldCheck, BriefcaseBusiness } from "lucide-react";
import { adminApi } from "../../../lib/api/services";
import { isStaffRole, normalizeRole, roleLabel } from "../../../lib/auth/roles";
import type { AdminStatus, Job, Model, AdminUser, Alert, Notification } from "../../../lib/api/types";

export function AdminDashboard() {
  const [status, setStatus] = useState<AdminStatus | null>(null);
  const [models, setModels] = useState<Model[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const [statusData, modelData, jobsData, usersData, alertsData, notificationsData] = await Promise.all([
        adminApi.getStatus(),
        adminApi.getModels(),
        adminApi.getJobs(),
        adminApi.getUsers(),
        adminApi.getAllAlerts(),
        adminApi.getAllNotifications(),
      ]);
      setStatus(statusData);
      setModels(modelData.models);
      setJobs(jobsData);
      setUsers(usersData);
      setAlerts(alertsData);
      setNotifications(notificationsData);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load().catch(() => setLoading(false));
    const timer = window.setInterval(() => {
      load().catch(() => undefined);
    }, 5000);
    return () => window.clearInterval(timer);
  }, []);

  const stats = useMemo(() => ({
    activeModels: models.filter((m) => m.isActive).length,
    runningJobs: jobs.filter((j) => String(j.status).toLowerCase() === "running").length,
    adminUsers: users.filter((u) => isStaffRole(u.role)).length,
    unreadNotifications: notifications.filter((n) => !n.isRead).length,
  }), [jobs, models, notifications, users]);

  if (loading) {
    return (
      <div className="min-h-screen bg-[var(--color-bg-primary)] flex items-center justify-center text-[var(--color-text-tertiary)]">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading admin dashboard...
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--color-bg-primary)]">
      <div className="mx-auto max-w-[1680px] px-6 py-8 lg:px-8 space-y-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-1.5">
            <h1 className="text-[32px] font-bold leading-tight tracking-tight text-[var(--color-text-primary)]">Administrative Console</h1>
            <p className="text-[13px] text-[var(--color-text-tertiary)]">Operational overview of system infrastructure, staff privileges, and predictive intelligence.</p>
          </div>
          <Button onClick={() => load()} className="bg-emerald-600 text-white hover:bg-emerald-700">
            <RefreshCw className="mr-2 h-4 w-4" /> Refresh
          </Button>
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {[
            { title: "Provider", value: String(status?.provider?.name || "unknown").toUpperCase(), icon: Database, tone: "text-emerald-500" },
            { title: "Active Models", value: String(stats.activeModels), icon: Cpu, tone: "text-blue-500" },
            { title: "Admin Users", value: String(stats.adminUsers), icon: Users, tone: "text-purple-500" },
            { title: "Unread Notifications", value: String(stats.unreadNotifications), icon: Bell, tone: "text-yellow-500" },
          ].map((item) => (
            <Card key={item.title} className="border-[var(--color-border)] bg-[var(--color-bg-tertiary)]">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardDescription className="text-[13px] text-[var(--color-text-tertiary)]">{item.title}</CardDescription>
                  <item.icon className={`h-5 w-5 ${item.tone}`} />
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-[28px] font-bold text-[var(--color-text-primary)]">{item.value}</div>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="grid gap-6 xl:grid-cols-3">
          <Card className="border-[var(--color-border)] bg-[var(--color-bg-tertiary)] xl:col-span-2">
            <CardHeader>
              <CardTitle className="text-[18px] text-[var(--color-text-primary)]">System Overview</CardTitle>
              <CardDescription className="text-[13px] text-[var(--color-text-tertiary)]">Live backend status and data coverage</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="rounded-md border border-[var(--color-border)] bg-[var(--color-bg-secondary)] p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[13px] text-[var(--color-text-tertiary)]">Provider Status</span>
                    <Badge className="bg-emerald-600/20 text-emerald-400 border-emerald-500/30">{String(status?.provider?.status || "unknown")}</Badge>
                  </div>
                  <div className="text-[13px] text-[var(--color-text-primary)]">Configured Provider: {String(status?.provider?.name || "—")}</div>
                  <div className="text-[12px] text-[var(--color-text-tertiary)]">Database reachable: {status?.database?.reachable ? "Yes" : "No"}</div>
                </div>
                <div className="rounded-md border border-[var(--color-border)] bg-[var(--color-bg-secondary)] p-4 space-y-2">
                  <div className="text-[13px] text-[var(--color-text-tertiary)]">Coverage</div>
                  <div className="text-[13px] text-[var(--color-text-primary)]">Companies: {status?.counts?.companies ?? 0}</div>
                  <div className="text-[13px] text-[var(--color-text-primary)]">Symbols with history: {status?.coverage?.symbols_with_history ?? 0}</div>
                  <div className="text-[12px] text-[var(--color-text-tertiary)]">Latest history date: {status?.freshness?.latest_history_date || "—"}</div>
                </div>
              </div>
              <Separator className="bg-[var(--color-border)]" />
              <div className="grid gap-4 md:grid-cols-3">
                <div className="rounded-md border border-[var(--color-border)] bg-[var(--color-bg-secondary)] p-4">
                  <div className="mb-1 text-[12px] text-[var(--color-text-tertiary)]">Job Queue</div>
                  <div className="text-xl font-bold text-[var(--color-text-primary)]">{jobs.length}</div>
                  <div className="text-[12px] text-[var(--color-text-tertiary)]">{stats.runningJobs} running now</div>
                </div>
                <div className="rounded-md border border-[var(--color-border)] bg-[var(--color-bg-secondary)] p-4">
                  <div className="mb-1 text-[12px] text-[var(--color-text-tertiary)]">Active Alerts</div>
                  <div className="text-xl font-bold text-[var(--color-text-primary)]">{alerts.filter((a) => a.enabled).length}</div>
                  <div className="text-[12px] text-[var(--color-text-tertiary)]">Across all users</div>
                </div>
                <div className="rounded-md border border-[var(--color-border)] bg-[var(--color-bg-secondary)] p-4">
                  <div className="mb-1 text-[12px] text-[var(--color-text-tertiary)]">Pending Review</div>
                  <div className="text-xl font-bold text-[var(--color-text-primary)]">{status?.counts?.announcement_review ?? 0}</div>
                  <div className="text-[12px] text-[var(--color-text-tertiary)]">Announcements awaiting review</div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-[var(--color-border)] bg-[var(--color-bg-tertiary)]">
            <CardHeader>
              <CardTitle className="text-[18px] text-[var(--color-text-primary)]">Quick Actions</CardTitle>
              <CardDescription className="text-[13px] text-[var(--color-text-tertiary)]">Jump into common admin workflows</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {[
                ["/admin/sync", "Infrastructure Sync", BriefcaseBusiness],
                ["/admin/models", "Predictive Intelligence", Cpu],
                ["/admin/users", "Access Control", Users],
                ["/admin/settings", "Security & System", ShieldCheck],
              ].map(([to, label, Icon]: any) => (
                <Button key={to} asChild variant="outline" className="w-full justify-start border-[var(--color-border)] text-[var(--color-text-primary)] hover:bg-[var(--color-bg-elevated)]">
                  <Link to={to}><Icon className="mr-2 h-4 w-4" /> {label}</Link>
                </Button>
              ))}
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-6 xl:grid-cols-3">
          <Card className="border-[var(--color-border)] bg-[var(--color-bg-tertiary)]">
            <CardHeader>
              <CardTitle className="text-[18px] text-[var(--color-text-primary)]">Recent Jobs</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {jobs.slice(0, 5).map((job) => (
                <div key={job.id} className="rounded-md border border-[var(--color-border)] bg-[var(--color-bg-secondary)] p-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="text-[13px] font-semibold text-[var(--color-text-primary)]">{job.name}</div>
                      <div className="text-[12px] text-[var(--color-text-tertiary)]">{job.type}</div>
                    </div>
                    <Badge variant="outline" className="border-[var(--color-border)] text-[var(--color-text-tertiary)]">{job.status}</Badge>
                  </div>
                </div>
              ))}
              {jobs.length === 0 && <p className="text-[13px] text-[var(--color-text-tertiary)]">No jobs recorded yet.</p>}
            </CardContent>
          </Card>

          <Card className="border-[var(--color-border)] bg-[var(--color-bg-tertiary)]">
            <CardHeader>
              <CardTitle className="text-[18px] text-[var(--color-text-primary)]">Recent Users</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {users.slice(0, 5).map((user) => (
                <div key={user.username} className="rounded-md border border-[var(--color-border)] bg-[var(--color-bg-secondary)] p-3 flex items-center justify-between gap-3">
                  <div>
                    <div className="text-[13px] font-semibold text-[var(--color-text-primary)]">{user.name}</div>
                    <div className="text-[12px] text-[var(--color-text-tertiary)]">{user.email || user.username}</div>
                  </div>
                  <Badge className={normalizeRole(user.role) === "admin" ? "bg-amber-600/20 text-amber-300 border-amber-500/30" : normalizeRole(user.role) === "co_admin" ? "bg-purple-600/20 text-purple-300 border-purple-500/30" : "bg-[var(--color-bg-elevated)] text-[var(--color-text-tertiary)] border-[var(--color-border)]"}>{roleLabel(user.role)}</Badge>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card className="border-[var(--color-border)] bg-[var(--color-bg-tertiary)]">
            <CardHeader>
              <CardTitle className="text-[18px] text-[var(--color-text-primary)]">Notifications</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {notifications.slice(0, 5).map((item) => (
                <div key={item.id} className="rounded-md border border-[var(--color-border)] bg-[var(--color-bg-secondary)] p-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="text-[13px] font-semibold text-[var(--color-text-primary)]">{item.title}</div>
                      <div className="text-[12px] text-[var(--color-text-tertiary)] line-clamp-2">{item.message}</div>
                    </div>
                    {!item.isRead && <Badge className="bg-emerald-600/20 text-emerald-400 border-emerald-500/30">Unread</Badge>}
                  </div>
                </div>
              ))}
              {notifications.length === 0 && <p className="text-[13px] text-[var(--color-text-tertiary)]">No notifications available.</p>}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
