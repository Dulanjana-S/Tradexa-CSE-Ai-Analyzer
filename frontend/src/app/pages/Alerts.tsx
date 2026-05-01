import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "../components/ui/dialog";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { Switch } from "../components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/ui/table";
import { Bell, Plus, TrendingUp, TrendingDown, Trash2, Activity, Megaphone, Volume2, Percent, Loader2 } from "lucide-react";
import { alertsApi } from "../../lib/api/services";
import type { Alert } from "../../lib/api/types";

type AlertType = Alert["alertType"];

const alertTypeMeta: Record<AlertType, { label: string; description: string; icon: any; targetLabel: string; targetPlaceholder: string; needsTarget: boolean }> = {
  above_price: { label: "Price above", description: "Notify when price reaches or rises above a target", icon: TrendingUp, targetLabel: "Target price (LKR)", targetPlaceholder: "120.00", needsTarget: true },
  below_price: { label: "Price below", description: "Notify when price falls to or below a target", icon: TrendingDown, targetLabel: "Target price (LKR)", targetPlaceholder: "90.00", needsTarget: true },
  pct_move: { label: "Daily % move", description: "Notify when daily absolute move exceeds a percentage", icon: Percent, targetLabel: "Move threshold (%)", targetPlaceholder: "5", needsTarget: true },
  volume_spike: { label: "Volume spike", description: "Notify when volume exceeds recent average by a multiple", icon: Volume2, targetLabel: "Volume multiple", targetPlaceholder: "2", needsTarget: true },
  important_announcement: { label: "Important announcement", description: "Notify when an important CSE announcement is detected", icon: Megaphone, targetLabel: "No target needed", targetPlaceholder: "", needsTarget: false },
};

function alertStatus(alert: Alert) {
  if (!alert.enabled) return { label: "Disabled", className: "bg-[#1c2128] text-[#768390] border-[#30363d]" };
  if (alert.triggered) return { label: alert.recurring ? "Triggered / recurring" : "Triggered", className: "bg-amber-600/20 text-amber-400 border-amber-500/30" };
  return { label: "Active", className: "bg-emerald-600/20 text-emerald-400 border-emerald-500/30" };
}

function conditionText(alert: Alert) {
  const meta = alertTypeMeta[alert.alertType] || alertTypeMeta.above_price;
  if (alert.alertType === "important_announcement") return alert.symbol ? `Important announcements for ${alert.symbol}` : "Important announcements for watchlist";
  if (alert.alertType === "pct_move") return `Moves by ${alert.targetPrice.toFixed(2)}% or more`;
  if (alert.alertType === "volume_spike") return `Volume >= ${alert.targetPrice.toFixed(2)}x average`;
  return `${meta.label} Rs. ${alert.targetPrice.toFixed(2)}`;
}

export function Alerts() {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [newAlert, setNewAlert] = useState({ symbol: "", alertType: "above_price" as AlertType, targetPrice: "", recurring: false, cooldownMinutes: "1440" });

  const load = async () => {
    setLoading(true);
    try {
      setAlerts(await alertsApi.getAll());
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    const timer = window.setInterval(() => alertsApi.getAll().then(setAlerts).catch(() => null), 60000);
    return () => window.clearInterval(timer);
  }, []);

  const activeAlerts = useMemo(() => alerts.filter((a) => a.enabled && !a.triggered).length, [alerts]);
  const triggeredAlerts = useMemo(() => alerts.filter((a) => a.triggered).length, [alerts]);
  const recurringAlerts = useMemo(() => alerts.filter((a) => a.recurring).length, [alerts]);

  const toggleAlert = async (id: string, enabled: boolean) => {
    setAlerts(await alertsApi.update(id, { enabled }));
  };

  const deleteAlert = async (id: string) => {
    setAlerts(await alertsApi.delete(id));
  };

  const createAlert = async () => {
    const meta = alertTypeMeta[newAlert.alertType];
    const target = meta.needsTarget ? Number(newAlert.targetPrice) : undefined;
    setSaving(true);
    try {
      const updated = await alertsApi.create({
        symbol: newAlert.symbol || undefined,
        alertType: newAlert.alertType,
        targetPrice: target,
        recurring: newAlert.recurring,
        cooldownMinutes: Number(newAlert.cooldownMinutes || 1440),
      });
      setAlerts(updated);
      setDialogOpen(false);
      setNewAlert({ symbol: "", alertType: "above_price", targetPrice: "", recurring: false, cooldownMinutes: "1440" });
    } finally {
      setSaving(false);
    }
  };

  const selectedMeta = alertTypeMeta[newAlert.alertType];
  const canCreate = (newAlert.alertType === "important_announcement" || Boolean(newAlert.symbol)) && (!selectedMeta.needsTarget || Number(newAlert.targetPrice) > 0);

  return (
    <div className="min-h-screen bg-[#08090c]">
      <div className="mx-auto max-w-[1680px] px-6 py-8 lg:px-8">
        <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-1.5">
            <h1 className="text-[32px] font-bold leading-tight tracking-tight text-[#e6edf3]">Alerts & Monitoring</h1>
            <p className="text-[13px] text-[#768390]">Track prices, daily moves, volume spikes, and important CSE announcements.</p>
          </div>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button className="flex items-center gap-2 bg-emerald-600 text-white hover:bg-emerald-700"><Plus className="h-4 w-4" />Create Alert</Button>
            </DialogTrigger>
            <DialogContent className="border-[#30363d] bg-[#161b22] text-[#e6edf3] sm:max-w-lg">
              <DialogHeader><DialogTitle>Create Smart Alert</DialogTitle><DialogDescription className="text-[#768390]">Choose what condition should create an in-app notification.</DialogDescription></DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2"><Label className="text-[#e6edf3]">Alert Type</Label><Select value={newAlert.alertType} onValueChange={(value: AlertType) => setNewAlert((p) => ({ ...p, alertType: value, targetPrice: value === "important_announcement" ? "" : p.targetPrice }))}><SelectTrigger className="border-[#30363d] bg-[#0d1117] text-[#e6edf3]"><SelectValue /></SelectTrigger><SelectContent className="border-[#30363d] bg-[#161b22]">{Object.entries(alertTypeMeta).map(([value, meta]) => <SelectItem key={value} value={value}>{meta.label}</SelectItem>)}</SelectContent></Select><p className="text-[12px] text-[#768390]">{selectedMeta.description}</p></div>
                <div className="space-y-2"><Label htmlFor="symbol" className="text-[#e6edf3]">Stock Symbol {newAlert.alertType === "important_announcement" ? "(optional)" : ""}</Label><Input id="symbol" placeholder={newAlert.alertType === "important_announcement" ? "blank = watchlist announcements" : "e.g., JKH.N0000"} value={newAlert.symbol} onChange={(e) => setNewAlert((p) => ({ ...p, symbol: e.target.value.toUpperCase() }))} className="border-[#30363d] bg-[#0d1117] text-[#e6edf3]" /></div>
                {selectedMeta.needsTarget && <div className="space-y-2"><Label htmlFor="targetPrice" className="text-[#e6edf3]">{selectedMeta.targetLabel}</Label><Input id="targetPrice" type="number" step="0.01" placeholder={selectedMeta.targetPlaceholder} value={newAlert.targetPrice} onChange={(e) => setNewAlert((p) => ({ ...p, targetPrice: e.target.value }))} className="border-[#30363d] bg-[#0d1117] text-[#e6edf3]" /></div>}
                <div className="rounded-md border border-[#30363d] bg-[#0d1117] p-4 space-y-4">
                  <div className="flex items-center justify-between gap-4"><div><Label className="text-[#e6edf3]">Recurring alert</Label><p className="text-[12px] text-[#768390]">If enabled, the same alert can notify again on a later trading day.</p></div><Switch checked={newAlert.recurring} onCheckedChange={(checked) => setNewAlert((p) => ({ ...p, recurring: checked }))} /></div>
                  {newAlert.recurring && <div className="space-y-2"><Label className="text-[#e6edf3]">Cooldown minutes</Label><Input type="number" min="60" value={newAlert.cooldownMinutes} onChange={(e) => setNewAlert((p) => ({ ...p, cooldownMinutes: e.target.value }))} className="border-[#30363d] bg-[#08090c] text-[#e6edf3]" /></div>}
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setDialogOpen(false)} className="border-[#30363d] text-[#768390] hover:bg-[#1c2128] hover:text-[#e6edf3]">Cancel</Button>
                <Button onClick={createAlert} className="bg-emerald-600 text-white hover:bg-emerald-700" disabled={!canCreate || saving}>{saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}Create Alert</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-4">
          <Card className="border-[#30363d] bg-[#161b22]"><CardContent className="p-6"><div className="flex items-center gap-3"><div className="flex h-10 w-10 items-center justify-center rounded-md bg-emerald-500/10"><Bell className="h-5 w-5 text-emerald-500" /></div><div><p className="text-[13px] text-[#768390]">Active Alerts</p><p className="text-[24px] font-bold text-[#e6edf3]">{activeAlerts}</p></div></div></CardContent></Card>
          <Card className="border-[#30363d] bg-[#161b22]"><CardContent className="p-6"><div className="flex items-center gap-3"><div className="flex h-10 w-10 items-center justify-center rounded-md bg-amber-500/10"><TrendingUp className="h-5 w-5 text-amber-500" /></div><div><p className="text-[13px] text-[#768390]">Triggered</p><p className="text-[24px] font-bold text-[#e6edf3]">{triggeredAlerts}</p></div></div></CardContent></Card>
          <Card className="border-[#30363d] bg-[#161b22]"><CardContent className="p-6"><div className="flex items-center gap-3"><div className="flex h-10 w-10 items-center justify-center rounded-md bg-blue-500/10"><Activity className="h-5 w-5 text-blue-500" /></div><div><p className="text-[13px] text-[#768390]">Recurring</p><p className="text-[24px] font-bold text-[#e6edf3]">{recurringAlerts}</p></div></div></CardContent></Card>
          <Card className="border-[#30363d] bg-[#161b22]"><CardContent className="p-6"><div className="flex items-center gap-3"><div className="flex h-10 w-10 items-center justify-center rounded-md bg-purple-500/10"><Megaphone className="h-5 w-5 text-purple-500" /></div><div><p className="text-[13px] text-[#768390]">Announcement Alerts</p><p className="text-[24px] font-bold text-[#e6edf3]">{alerts.filter((a) => a.alertType === "important_announcement").length}</p></div></div></CardContent></Card>
        </div>

        <Card className="border-[#30363d] bg-[#161b22]">
          <CardHeader><CardTitle className="text-[18px] text-[#e6edf3]">Your Alerts</CardTitle><CardDescription className="text-[#768390]">Alerts are evaluated when you open alerts, notifications, or when the admin monitor checks them.</CardDescription></CardHeader>
          <CardContent>
            {loading ? (
              <div className="py-16 text-center text-[#768390]"><Loader2 className="mr-2 inline h-5 w-5 animate-spin" /> Loading alerts...</div>
            ) : alerts.length === 0 ? (
              <div className="py-16 text-center text-[#768390]">No alerts yet. Create your first alert above.</div>
            ) : (
              <Table>
                <TableHeader><TableRow className="border-[#30363d] hover:bg-transparent"><TableHead className="text-[#768390]">Alert</TableHead><TableHead className="text-[#768390]">Condition</TableHead><TableHead className="text-[#768390]">Current</TableHead><TableHead className="text-[#768390]">Status</TableHead><TableHead className="text-[#768390]">Recurring</TableHead><TableHead className="text-right text-[#768390]">Actions</TableHead></TableRow></TableHeader>
                <TableBody>
                  {alerts.map((alert) => {
                    const status = alertStatus(alert);
                    const meta = alertTypeMeta[alert.alertType] || alertTypeMeta.above_price;
                    const Icon = meta.icon;
                    return (
                      <TableRow key={alert.id} className="border-[#30363d]">
                        <TableCell><div className="flex items-center gap-3"><div className="flex h-9 w-9 items-center justify-center rounded-md bg-[#0d1117]"><Icon className="h-4 w-4 text-emerald-500" /></div><div><div className="font-medium text-[#e6edf3]">{alert.symbol || "Watchlist"}</div><div className="text-[12px] text-[#768390]">{meta.label}</div></div></div></TableCell>
                        <TableCell className="text-[13px] text-[#768390]">{conditionText(alert)}</TableCell>
                        <TableCell className="text-[13px] text-[#e6edf3]">{alert.alertType === "important_announcement" ? "—" : `Rs. ${alert.currentPrice.toFixed(2)}`}</TableCell>
                        <TableCell><Badge className={status.className}>{status.label}</Badge></TableCell>
                        <TableCell className="text-[13px] text-[#768390]">{alert.recurring ? `Yes (${alert.cooldownMinutes || 1440}m)` : "No"}</TableCell>
                        <TableCell className="text-right"><div className="flex items-center justify-end gap-2"><Switch checked={alert.enabled} onCheckedChange={(checked) => toggleAlert(alert.id, checked)} /><Button variant="ghost" size="icon" onClick={() => deleteAlert(alert.id)} className="text-red-400 hover:bg-red-500/10 hover:text-red-300"><Trash2 className="h-4 w-4" /></Button></div></TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
