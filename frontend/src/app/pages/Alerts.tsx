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
import { Bell, Plus, TrendingUp, TrendingDown, Trash2 } from "lucide-react";
import { alertsApi } from "../../lib/api/services";
import type { Alert } from "../../lib/api/types";

export function Alerts() {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [newAlert, setNewAlert] = useState({ symbol: "", condition: "above" as "above" | "below", targetPrice: "" });

  useEffect(() => {
    alertsApi.getAll().then(setAlerts).finally(() => setLoading(false));
  }, []);

  const activeAlerts = useMemo(() => alerts.filter((a) => a.enabled && !a.triggered).length, [alerts]);
  const triggeredAlerts = useMemo(() => alerts.filter((a) => a.triggered).length, [alerts]);

  const toggleAlert = async (id: string, enabled: boolean) => {
    setAlerts(await alertsApi.update(id, { enabled }));
  };

  const deleteAlert = async (id: string) => {
    setAlerts(await alertsApi.delete(id));
  };

  const createAlert = async () => {
    const updated = await alertsApi.create({ symbol: newAlert.symbol, condition: newAlert.condition, targetPrice: Number(newAlert.targetPrice) });
    setAlerts(updated);
    setDialogOpen(false);
    setNewAlert({ symbol: "", condition: "above", targetPrice: "" });
  };

  return (
    <div className="min-h-screen bg-[#08090c]">
      <div className="mx-auto max-w-[1680px] px-6 py-8 lg:px-8">
        <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-1.5">
            <h1 className="text-[32px] font-bold leading-tight tracking-tight text-[#e6edf3]">Price Alerts</h1>
            <p className="text-[13px] text-[#768390]">Get notified when stocks reach your target prices</p>
          </div>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button className="flex items-center gap-2 bg-emerald-600 text-white hover:bg-emerald-700"><Plus className="h-4 w-4" />Create Alert</Button>
            </DialogTrigger>
            <DialogContent className="border-[#30363d] bg-[#161b22] text-[#e6edf3] sm:max-w-md">
              <DialogHeader><DialogTitle>Create Price Alert</DialogTitle><DialogDescription className="text-[#768390]">Set up a new price alert for a stock</DialogDescription></DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2"><Label htmlFor="symbol" className="text-[#e6edf3]">Stock Symbol</Label><Input id="symbol" placeholder="e.g., JKH.N0000" value={newAlert.symbol} onChange={(e) => setNewAlert((p) => ({ ...p, symbol: e.target.value.toUpperCase() }))} className="border-[#30363d] bg-[#0d1117] text-[#e6edf3]" /></div>
                <div className="space-y-2"><Label htmlFor="condition" className="text-[#e6edf3]">Condition</Label><Select value={newAlert.condition} onValueChange={(value: "above" | "below") => setNewAlert((p) => ({ ...p, condition: value }))}><SelectTrigger className="border-[#30363d] bg-[#0d1117] text-[#e6edf3]"><SelectValue /></SelectTrigger><SelectContent className="border-[#30363d] bg-[#161b22]"><SelectItem value="above">Price goes above</SelectItem><SelectItem value="below">Price goes below</SelectItem></SelectContent></Select></div>
                <div className="space-y-2"><Label htmlFor="targetPrice" className="text-[#e6edf3]">Target Price (LKR)</Label><Input id="targetPrice" type="number" step="0.01" placeholder="0.00" value={newAlert.targetPrice} onChange={(e) => setNewAlert((p) => ({ ...p, targetPrice: e.target.value }))} className="border-[#30363d] bg-[#0d1117] text-[#e6edf3]" /></div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setDialogOpen(false)} className="border-[#30363d] text-[#768390] hover:bg-[#1c2128] hover:text-[#e6edf3]">Cancel</Button>
                <Button onClick={createAlert} className="bg-emerald-600 text-white hover:bg-emerald-700" disabled={!newAlert.symbol || !newAlert.targetPrice}>Create Alert</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Card className="border-[#30363d] bg-[#161b22]"><CardContent className="p-6"><div className="flex items-center gap-3"><div className="flex h-10 w-10 items-center justify-center rounded-md bg-emerald-500/10"><Bell className="h-5 w-5 text-emerald-500" /></div><div><p className="text-[13px] text-[#768390]">Active Alerts</p><p className="text-[24px] font-bold text-[#e6edf3]">{activeAlerts}</p></div></div></CardContent></Card>
          <Card className="border-[#30363d] bg-[#161b22]"><CardContent className="p-6"><div className="flex items-center gap-3"><div className="flex h-10 w-10 items-center justify-center rounded-md bg-yellow-500/10"><TrendingUp className="h-5 w-5 text-yellow-500" /></div><div><p className="text-[13px] text-[#768390]">Triggered Today</p><p className="text-[24px] font-bold text-[#e6edf3]">{triggeredAlerts}</p></div></div></CardContent></Card>
          <Card className="border-[#30363d] bg-[#161b22]"><CardContent className="p-6"><div className="flex items-center gap-3"><div className="flex h-10 w-10 items-center justify-center rounded-md bg-blue-500/10"><TrendingDown className="h-5 w-5 text-blue-500" /></div><div><p className="text-[13px] text-[#768390]">Total Alerts</p><p className="text-[24px] font-bold text-[#e6edf3]">{alerts.length}</p></div></div></CardContent></Card>
        </div>

        <Card className="border-[#30363d] bg-[#161b22]">
          <CardHeader><CardTitle className="text-[18px] text-[#e6edf3]">Your Price Alerts</CardTitle><CardDescription className="text-[13px] text-[#768390]">Manage your stock price notifications</CardDescription></CardHeader>
          <CardContent>
            <Table>
              <TableHeader><TableRow className="border-[#30363d] hover:bg-transparent"><TableHead className="text-[11px] uppercase text-[#768390]">Stock</TableHead><TableHead className="text-[11px] uppercase text-[#768390]">Condition</TableHead><TableHead className="text-[11px] uppercase text-[#768390]">Target Price</TableHead><TableHead className="text-[11px] uppercase text-[#768390]">Current Price</TableHead><TableHead className="text-[11px] uppercase text-[#768390]">Status</TableHead><TableHead className="text-[11px] uppercase text-[#768390]">Created</TableHead><TableHead className="text-[11px] uppercase text-[#768390]">Enabled</TableHead><TableHead className="text-right text-[11px] uppercase text-[#768390]">Actions</TableHead></TableRow></TableHeader>
              <TableBody>
                {alerts.map((alert) => (
                  <TableRow key={alert.id} className="border-[#30363d] text-[13px] hover:bg-[#1c2128]">
                    <TableCell><div><div className="font-semibold text-[#e6edf3]">{alert.symbol}</div><div className="text-[11px] text-[#768390]">{alert.companyName}</div></div></TableCell>
                    <TableCell><Badge variant="outline" className="border-slate-700 text-slate-300">{alert.condition === "above" ? "Above" : "Below"}</Badge></TableCell>
                    <TableCell className="text-[#e6edf3]">Rs. {alert.targetPrice.toFixed(2)}</TableCell>
                    <TableCell className="text-[#e6edf3]">Rs. {alert.currentPrice.toFixed(2)}</TableCell>
                    <TableCell><Badge className={alert.triggered ? "bg-yellow-500/10 text-yellow-400 border-yellow-500/30" : "bg-emerald-500/10 text-emerald-400 border-emerald-500/30"}>{alert.triggered ? "Triggered" : "Active"}</Badge></TableCell>
                    <TableCell className="text-[#768390]">{alert.createdAt ? new Date(alert.createdAt).toLocaleDateString("en-LK") : "—"}</TableCell>
                    <TableCell><Switch checked={alert.enabled} onCheckedChange={(checked) => toggleAlert(alert.id, checked)} /></TableCell>
                    <TableCell className="text-right"><Button variant="ghost" size="sm" className="text-red-400 hover:bg-[#1c2128] hover:text-red-300" onClick={() => deleteAlert(alert.id)}><Trash2 className="h-4 w-4" /></Button></TableCell>
                  </TableRow>
                ))}
                {!loading && alerts.length === 0 && <TableRow><TableCell colSpan={8} className="text-center text-[#768390] py-8">No alerts created yet</TableCell></TableRow>}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
