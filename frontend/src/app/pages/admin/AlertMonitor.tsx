import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../components/ui/card";
import { Input } from "../../components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../components/ui/select";
import { Badge } from "../../components/ui/badge";
import { Search, Loader2 } from "lucide-react";
import { adminApi } from "../../../lib/api/services";
import type { Alert } from "../../../lib/api/types";

export function AlertMonitor() {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    adminApi.getAllAlerts().then(setAlerts).finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => alerts.filter((alert) => {
    const q = searchQuery.toLowerCase();
    const matchesQuery = !q || alert.symbol.toLowerCase().includes(q) || alert.companyName.toLowerCase().includes(q) || String(alert.username || "").toLowerCase().includes(q);
    const status = alert.triggered ? "triggered" : alert.enabled ? "active" : "disabled";
    const matchesStatus = statusFilter === "all" || status === statusFilter;
    const matchesType = typeFilter === "all" || alert.condition === typeFilter;
    return matchesQuery && matchesStatus && matchesType;
  }), [alerts, searchQuery, statusFilter, typeFilter]);

  return (
    <div className="min-h-screen bg-[var(--color-bg-primary)]">
      <div className="mx-auto max-w-[1680px] px-6 py-8 lg:px-8 space-y-8">
        <div className="space-y-1.5">
          <h1 className="text-[32px] font-bold leading-tight tracking-tight text-[var(--color-text-primary)]">Alert Monitor</h1>
          <p className="text-[13px] text-[var(--color-text-tertiary)]">Observe all user-created alerts and their current state</p>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <Card className="border-[var(--color-border)] bg-[var(--color-bg-tertiary)]"><CardHeader className="pb-2"><CardDescription className="text-[var(--color-text-tertiary)]">Total Alerts</CardDescription></CardHeader><CardContent><div className="text-[28px] font-bold text-[var(--color-text-primary)]">{alerts.length}</div></CardContent></Card>
          <Card className="border-[var(--color-border)] bg-[var(--color-bg-tertiary)]"><CardHeader className="pb-2"><CardDescription className="text-[var(--color-text-tertiary)]">Active</CardDescription></CardHeader><CardContent><div className="text-[28px] font-bold text-[var(--color-text-primary)]">{alerts.filter((a) => a.enabled && !a.triggered).length}</div></CardContent></Card>
          <Card className="border-[var(--color-border)] bg-[var(--color-bg-tertiary)]"><CardHeader className="pb-2"><CardDescription className="text-[var(--color-text-tertiary)]">Triggered</CardDescription></CardHeader><CardContent><div className="text-[28px] font-bold text-[var(--color-text-primary)]">{alerts.filter((a) => a.triggered).length}</div></CardContent></Card>
        </div>

        <Card className="border-[var(--color-border)] bg-[var(--color-bg-tertiary)]">
          <CardHeader>
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <CardTitle className="text-[18px] text-[var(--color-text-primary)]">Alerts</CardTitle>
                <CardDescription className="text-[13px] text-[var(--color-text-tertiary)]">Search by symbol, company, or username</CardDescription>
              </div>
              <div className="flex flex-col gap-3 sm:flex-row">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-text-tertiary)]" />
                  <Input value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Search alerts" className="w-full sm:w-64 border-[var(--color-border)] bg-[var(--color-bg-secondary)] pl-10 text-[var(--color-text-primary)]" />
                </div>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="h-10 w-full border-[var(--color-border)] bg-[var(--color-bg-secondary)] text-[13px] text-[var(--color-text-primary)] sm:w-40"><SelectValue /></SelectTrigger>
                  <SelectContent className="border-[var(--color-border)] bg-[var(--color-bg-tertiary)]">
                    <SelectItem value="all">All Status</SelectItem>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="triggered">Triggered</SelectItem>
                    <SelectItem value="disabled">Disabled</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={typeFilter} onValueChange={setTypeFilter}>
                  <SelectTrigger className="h-10 w-full border-[var(--color-border)] bg-[var(--color-bg-secondary)] text-[13px] text-[var(--color-text-primary)] sm:w-40"><SelectValue /></SelectTrigger>
                  <SelectContent className="border-[var(--color-border)] bg-[var(--color-bg-tertiary)]">
                    <SelectItem value="all">All Types</SelectItem>
                    <SelectItem value="above">Above</SelectItem>
                    <SelectItem value="below">Below</SelectItem>
                    <SelectItem value="pct_move">Pct Move</SelectItem>
                    <SelectItem value="volume_spike">Volume Spike</SelectItem>
                    <SelectItem value="important_announcement">Announcement</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {loading ? (
              <div className="py-16 text-center text-[var(--color-text-tertiary)]"><Loader2 className="mr-2 inline h-5 w-5 animate-spin" /> Loading alerts...</div>
            ) : filtered.length === 0 ? (
              <div className="py-16 text-center text-[var(--color-text-tertiary)]">No alerts found.</div>
            ) : filtered.map((alert) => {
              const status = alert.triggered ? "Triggered" : alert.enabled ? "Active" : "Disabled";
              return (
                <div key={alert.id} className="rounded-md border border-[var(--color-border)] bg-[var(--color-bg-secondary)] p-4">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="text-[14px] font-semibold text-[var(--color-text-primary)]">{alert.symbol}</h3>
                        <Badge variant="outline" className="border-[var(--color-border)] text-[var(--color-text-tertiary)]">{alert.condition.replace("_", " ")}</Badge>
                        <Badge className={status === "Triggered" ? "bg-amber-600/20 text-amber-400 border-amber-500/30" : status === "Active" ? "bg-emerald-600/20 text-emerald-400 border-emerald-500/30" : "bg-[var(--color-bg-elevated)] text-[var(--color-text-tertiary)] border-[var(--color-border)]"}>{status}</Badge>
                      </div>
                      <p className="text-[13px] text-[var(--color-text-tertiary)]">{alert.companyName} • User: {alert.username || "—"}</p>
                    </div>
                    <div className="grid grid-cols-2 gap-4 text-[13px] text-[var(--color-text-tertiary)]">
                      <div>Target: <span className="text-[var(--color-text-primary)]">{alert.alertType === "important_announcement" ? "—" : alert.alertType === "pct_move" ? `${alert.targetPrice.toFixed(2)}%` : alert.alertType === "volume_spike" ? `${alert.targetPrice.toFixed(2)}x` : alert.targetPrice.toFixed(2)}</span></div>
                      <div>Current: <span className="text-[var(--color-text-primary)]">{alert.currentPrice.toFixed(2)}</span></div>
                    </div>
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
