import { useEffect, useMemo, useState } from "react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { portfolioApi, watchlistApi } from "../../lib/api/services";
import type { PortfolioData, PortfolioPerformancePoint, PortfolioTransaction, Watchlist } from "../../lib/api/types";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "../components/ui/dialog";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/ui/table";
import { Textarea } from "../components/ui/textarea";
import { BriefcaseBusiness, Landmark, Loader2, Pencil, Plus, ShoppingBag, Trash2, TrendingDown, TrendingUp } from "lucide-react";

const emptyPortfolio: PortfolioData = {
  summary: {
    positionsCount: 0,
    transactionsCount: 0,
    costBasis: 0,
    marketValue: 0,
    unrealizedPl: 0,
    unrealizedPlPct: 0,
    realizedPl: 0,
    totalPl: 0,
  },
  positions: [],
  transactions: [],
};

const emptyWatchlist: Watchlist = { symbols: [], items: [] };

const defaultForm = () => ({
  symbol: "",
  txType: "buy" as "buy" | "sell",
  quantity: "",
  price: "",
  fees: "0",
  tradedAt: new Date().toISOString().slice(0, 10),
  notes: "",
});

function money(value: number) {
  return `Rs. ${value.toLocaleString("en-LK", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function compactDate(value?: string) {
  if (!value) return "—";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString("en-LK", { year: "numeric", month: "short", day: "numeric" });
}

function signedPercent(value: number) {
  return `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`;
}

export function Portfolio() {
  const [portfolio, setPortfolio] = useState<PortfolioData>(emptyPortfolio);
  const [watchlist, setWatchlist] = useState<Watchlist>(emptyWatchlist);
  const [performance, setPerformance] = useState<PortfolioPerformancePoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [chartLoading, setChartLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [chartDays, setChartDays] = useState(365);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState(defaultForm());

  const loadPortfolio = async () => {
    const [portfolioData, watchlistData] = await Promise.all([portfolioApi.get(), watchlistApi.get()]);
    setPortfolio(portfolioData);
    setWatchlist(watchlistData);
  };

  const loadPerformance = async (days: number) => {
    setChartLoading(true);
    try {
      const series = await portfolioApi.getPerformance(days);
      setPerformance(series);
    } finally {
      setChartLoading(false);
    }
  };

  useEffect(() => {
    Promise.all([loadPortfolio(), loadPerformance(chartDays)]).finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    loadPerformance(chartDays).catch(() => setPerformance([]));
  }, [chartDays]);

  const watchlistCandidates = useMemo(
    () => watchlist.items.filter((item) => !portfolio.positions.some((position) => position.symbol === item.symbol)).slice(0, 8),
    [watchlist.items, portfolio.positions]
  );

  const chartData = useMemo(
    () => performance.map((point) => ({ ...point, label: compactDate(point.date) })),
    [performance]
  );

  const resetDialog = () => {
    setDialogOpen(false);
    setEditingId(null);
    setError(null);
    setForm(defaultForm());
  };

  const openAddDialog = (symbol?: string) => {
    setEditingId(null);
    setError(null);
    setForm({ ...defaultForm(), symbol: symbol || "" });
    setDialogOpen(true);
  };

  const openEditDialog = (tx: PortfolioTransaction) => {
    setEditingId(tx.id);
    setError(null);
    setForm({
      symbol: tx.symbol,
      txType: tx.type,
      quantity: String(tx.quantity),
      price: String(tx.price),
      fees: String(tx.fees ?? 0),
      tradedAt: String(tx.tradedAt || new Date().toISOString().slice(0, 10)).slice(0, 10),
      notes: tx.notes || "",
    });
    setDialogOpen(true);
  };

  const submitTransaction = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const payload = {
        symbol: form.symbol.trim().toUpperCase(),
        txType: form.txType,
        quantity: Number(form.quantity),
        price: Number(form.price),
        fees: Number(form.fees || 0),
        tradedAt: form.tradedAt,
        notes: form.notes.trim() || undefined,
      };
      const updated = editingId ? await portfolioApi.updateTransaction(editingId, payload) : await portfolioApi.addTransaction(payload);
      setPortfolio(updated);
      await Promise.all([loadPerformance(chartDays), watchlistApi.get().then(setWatchlist)]);
      resetDialog();
    } catch (err: any) {
      setError(err?.message || "Could not save portfolio transaction");
    } finally {
      setSubmitting(false);
    }
  };

  const deleteTransaction = async (transactionId: string) => {
    const updated = await portfolioApi.deleteTransaction(transactionId);
    setPortfolio(updated);
    await loadPerformance(chartDays);
  };

  return (
    <div className="min-h-screen bg-[#08090c]">
      <div className="mx-auto max-w-[1680px] space-y-8 px-6 py-8 lg:px-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-1.5">
            <h1 className="text-[32px] font-bold leading-tight tracking-tight text-[#e6edf3]">Portfolio</h1>
            <p className="text-[13px] text-[#768390]">Track positions, edit trade mistakes safely, and see how your portfolio changed over time.</p>
          </div>
          <Dialog open={dialogOpen} onOpenChange={(open) => (open ? setDialogOpen(true) : resetDialog())}>
            <DialogTrigger asChild>
              <Button onClick={() => openAddDialog()} className="bg-emerald-600 text-white hover:bg-emerald-700"><Plus className="mr-2 h-4 w-4" />Add Transaction</Button>
            </DialogTrigger>
            <DialogContent className="border-[#30363d] bg-[#161b22] text-[#e6edf3] sm:max-w-lg">
              <DialogHeader>
                <DialogTitle>{editingId ? "Edit portfolio transaction" : "Add portfolio transaction"}</DialogTitle>
                <DialogDescription className="text-[#768390]">Record a buy or sell so holdings, cost basis, and profit/loss stay correct.</DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 py-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="symbol">Symbol</Label>
                  <Input id="symbol" value={form.symbol} onChange={(e) => setForm((prev) => ({ ...prev, symbol: e.target.value.toUpperCase() }))} placeholder="e.g., JKH.N0000" className="border-[#30363d] bg-[#0d1117] text-[#e6edf3]" />
                </div>
                <div className="space-y-2">
                  <Label>Type</Label>
                  <Select value={form.txType} onValueChange={(value: "buy" | "sell") => setForm((prev) => ({ ...prev, txType: value }))}>
                    <SelectTrigger className="border-[#30363d] bg-[#0d1117] text-[#e6edf3]"><SelectValue /></SelectTrigger>
                    <SelectContent className="border-[#30363d] bg-[#161b22]">
                      <SelectItem value="buy">Buy</SelectItem>
                      <SelectItem value="sell">Sell</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="quantity">Quantity</Label>
                  <Input id="quantity" type="number" min="0" step="0.0001" value={form.quantity} onChange={(e) => setForm((prev) => ({ ...prev, quantity: e.target.value }))} className="border-[#30363d] bg-[#0d1117] text-[#e6edf3]" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="price">Price per share</Label>
                  <Input id="price" type="number" min="0" step="0.01" value={form.price} onChange={(e) => setForm((prev) => ({ ...prev, price: e.target.value }))} className="border-[#30363d] bg-[#0d1117] text-[#e6edf3]" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="fees">Fees</Label>
                  <Input id="fees" type="number" min="0" step="0.01" value={form.fees} onChange={(e) => setForm((prev) => ({ ...prev, fees: e.target.value }))} className="border-[#30363d] bg-[#0d1117] text-[#e6edf3]" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="tradedAt">Trade date</Label>
                  <Input id="tradedAt" type="date" value={form.tradedAt} onChange={(e) => setForm((prev) => ({ ...prev, tradedAt: e.target.value }))} className="border-[#30363d] bg-[#0d1117] text-[#e6edf3]" />
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="notes">Notes</Label>
                  <Textarea id="notes" value={form.notes} onChange={(e) => setForm((prev) => ({ ...prev, notes: e.target.value }))} placeholder="Optional note" className="border-[#30363d] bg-[#0d1117] text-[#e6edf3]" />
                </div>
                {error && <p className="sm:col-span-2 text-sm text-red-400">{error}</p>}
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={resetDialog} className="border-[#30363d] text-[#768390] hover:bg-[#1c2128] hover:text-[#e6edf3]">Cancel</Button>
                <Button onClick={submitTransaction} disabled={submitting || !form.symbol || !form.quantity || !form.price} className="bg-emerald-600 text-white hover:bg-emerald-700">
                  {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : editingId ? <Pencil className="mr-2 h-4 w-4" /> : <Plus className="mr-2 h-4 w-4" />}
                  {editingId ? "Save Changes" : "Save Transaction"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Card className="border-[#30363d] bg-[#161b22]"><CardContent className="p-6"><div className="flex items-center gap-3"><div className="flex h-10 w-10 items-center justify-center rounded-md bg-blue-500/10"><BriefcaseBusiness className="h-5 w-5 text-blue-500" /></div><div><p className="text-[13px] text-[#768390]">Market value</p><p className="text-[24px] font-bold text-[#e6edf3]">{money(portfolio.summary.marketValue)}</p></div></div></CardContent></Card>
          <Card className="border-[#30363d] bg-[#161b22]"><CardContent className="p-6"><div className="flex items-center gap-3"><div className="flex h-10 w-10 items-center justify-center rounded-md bg-violet-500/10"><Landmark className="h-5 w-5 text-violet-500" /></div><div><p className="text-[13px] text-[#768390]">Cost basis</p><p className="text-[24px] font-bold text-[#e6edf3]">{money(portfolio.summary.costBasis)}</p></div></div></CardContent></Card>
          <Card className="border-[#30363d] bg-[#161b22]"><CardContent className="p-6"><div className="flex items-center gap-3"><div className={`flex h-10 w-10 items-center justify-center rounded-md ${portfolio.summary.unrealizedPl >= 0 ? "bg-emerald-500/10" : "bg-red-500/10"}`}>{portfolio.summary.unrealizedPl >= 0 ? <TrendingUp className="h-5 w-5 text-emerald-500" /> : <TrendingDown className="h-5 w-5 text-red-500" />}</div><div><p className="text-[13px] text-[#768390]">Unrealized P/L</p><p className={`text-[24px] font-bold ${portfolio.summary.unrealizedPl >= 0 ? "text-emerald-400" : "text-red-400"}`}>{money(portfolio.summary.unrealizedPl)}</p><p className="text-[12px] text-[#768390]">{signedPercent(portfolio.summary.unrealizedPlPct)}</p></div></div></CardContent></Card>
          <Card className="border-[#30363d] bg-[#161b22]"><CardContent className="p-6"><div className="flex items-center gap-3"><div className={`flex h-10 w-10 items-center justify-center rounded-md ${portfolio.summary.realizedPl >= 0 ? "bg-amber-500/10" : "bg-red-500/10"}`}>{portfolio.summary.realizedPl >= 0 ? <TrendingUp className="h-5 w-5 text-amber-500" /> : <TrendingDown className="h-5 w-5 text-red-500" />}</div><div><p className="text-[13px] text-[#768390]">Realized P/L</p><p className={`text-[24px] font-bold ${portfolio.summary.realizedPl >= 0 ? "text-amber-400" : "text-red-400"}`}>{money(portfolio.summary.realizedPl)}</p><p className="text-[12px] text-[#768390]">{portfolio.summary.positionsCount} open positions</p></div></div></CardContent></Card>
        </div>

        <div className="grid gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(320px,1fr)]">
          <Card className="border-[#30363d] bg-[#161b22]">
            <CardHeader className="flex flex-col gap-4 border-b border-[#30363d] sm:flex-row sm:items-center sm:justify-between">
              <div>
                <CardTitle className="text-[18px] text-[#e6edf3]">Portfolio performance</CardTitle>
                <CardDescription className="text-[13px] text-[#768390]">Market value versus cost basis using your saved trades and stored price history.</CardDescription>
              </div>
              <div className="flex flex-wrap gap-2">
                {[90, 180, 365, 730].map((days) => (
                  <Button key={days} variant={chartDays === days ? "default" : "outline"} onClick={() => setChartDays(days)} className={chartDays === days ? "bg-blue-600 text-white hover:bg-blue-700" : "border-[#30363d] text-[#768390] hover:bg-[#1c2128] hover:text-[#e6edf3]"}>{days >= 365 ? `${days / 365}Y` : `${days}D`}</Button>
                ))}
              </div>
            </CardHeader>
            <CardContent className="p-6">
              {chartLoading ? (
                <div className="flex h-[340px] items-center justify-center text-[#768390]"><Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading performance chart...</div>
              ) : chartData.length === 0 ? (
                <div className="flex h-[340px] items-center justify-center text-center text-[#768390]">Add portfolio trades first to unlock performance history.</div>
              ) : (
                <div className="h-[340px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={chartData} margin={{ top: 8, right: 12, left: -12, bottom: 0 }}>
                      <defs>
                        <linearGradient id="portfolioMarketValue" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#2563eb" stopOpacity={0.35} />
                          <stop offset="95%" stopColor="#2563eb" stopOpacity={0.02} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid stroke="#30363d" vertical={false} strokeDasharray="3 3" />
                      <XAxis dataKey="label" tick={{ fill: "#768390", fontSize: 11 }} axisLine={false} tickLine={false} minTickGap={24} />
                      <YAxis tick={{ fill: "#768390", fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={(value) => `Rs. ${Number(value).toLocaleString("en-LK")}`} width={92} />
                      <Tooltip
                        contentStyle={{ backgroundColor: "#0d1117", border: "1px solid #30363d", borderRadius: 12, color: "#e6edf3" }}
                        formatter={(value: number, name: string) => [money(Number(value)), name === "marketValue" ? "Market value" : "Cost basis"]}
                        labelFormatter={(_, payload) => payload?.[0]?.payload?.label || ""}
                      />
                      <Area type="monotone" dataKey="marketValue" stroke="#2563eb" fill="url(#portfolioMarketValue)" strokeWidth={2.5} />
                      <Area type="monotone" dataKey="costBasis" stroke="#f59e0b" fillOpacity={0} strokeWidth={2} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="border-[#30363d] bg-[#161b22]">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-[18px] text-[#e6edf3]"><ShoppingBag className="h-5 w-5 text-emerald-500" />Quick add from watchlist</CardTitle>
              <CardDescription className="text-[13px] text-[#768390]">Turn watched symbols into real holdings faster. We prefill the symbol and trade date for you.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {watchlistCandidates.length === 0 ? (
                <p className="text-[13px] text-[#768390]">Your current watchlist items are already in the portfolio, or the watchlist is still empty.</p>
              ) : (
                watchlistCandidates.map((item) => (
                  <div key={item.symbol} className="flex items-center justify-between gap-3 rounded-lg border border-[#30363d] bg-[#0d1117] p-3">
                    <div>
                      <p className="text-[13px] font-semibold text-[#e6edf3]">{item.symbol}</p>
                      <p className="text-[12px] text-[#768390]">{item.company}</p>
                      <p className="text-[12px] text-[#768390]">Last {money(item.lastPrice)}</p>
                    </div>
                    <Button onClick={() => openAddDialog(item.symbol)} className="bg-emerald-600 text-white hover:bg-emerald-700"><Plus className="mr-2 h-4 w-4" />Add buy</Button>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </div>

        <Card className="border-[#30363d] bg-[#161b22]">
          <CardHeader className="flex flex-row items-center justify-between gap-3">
            <div>
              <CardTitle className="text-[18px] text-[#e6edf3]">Holdings</CardTitle>
              <CardDescription className="text-[13px] text-[#768390]">Current open positions calculated from your buy and sell history.</CardDescription>
            </div>
            <Badge variant="outline" className="border-[#30363d] text-[#768390]">{portfolio.positions.length} holdings</Badge>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow className="border-[#30363d] hover:bg-transparent">
                  <TableHead className="text-[#768390]">Symbol</TableHead>
                  <TableHead className="text-[#768390]">Quantity</TableHead>
                  <TableHead className="text-[#768390]">Avg Cost</TableHead>
                  <TableHead className="text-[#768390]">Current</TableHead>
                  <TableHead className="text-[#768390]">Market Value</TableHead>
                  <TableHead className="text-[#768390]">Unrealized P/L</TableHead>
                  <TableHead className="text-[#768390]">Weight</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {portfolio.positions.map((position) => (
                  <TableRow key={position.symbol} className="border-[#30363d] hover:bg-[#1c2128]">
                    <TableCell>
                      <div className="font-medium text-[#e6edf3]">{position.symbol}</div>
                      <div className="text-[12px] text-[#768390]">{position.company}</div>
                    </TableCell>
                    <TableCell className="text-[#e6edf3]">{position.quantity.toLocaleString("en-LK")}</TableCell>
                    <TableCell className="text-[#e6edf3]">{money(position.avgCost)}</TableCell>
                    <TableCell className="text-[#e6edf3]">{money(position.currentPrice)}</TableCell>
                    <TableCell className="text-[#e6edf3]">{money(position.marketValue)}</TableCell>
                    <TableCell className={position.unrealizedPl >= 0 ? "text-emerald-400" : "text-red-400"}>{money(position.unrealizedPl)} <span className="ml-1 text-[12px]">({signedPercent(position.unrealizedPlPct)})</span></TableCell>
                    <TableCell className="text-[#e6edf3]">{position.weightPct.toFixed(2)}%</TableCell>
                  </TableRow>
                ))}
                {!loading && portfolio.positions.length === 0 && <TableRow><TableCell colSpan={7} className="py-8 text-center text-[#768390]">No holdings yet. Add your first buy transaction to start tracking your portfolio.</TableCell></TableRow>}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card className="border-[#30363d] bg-[#161b22]">
          <CardHeader>
            <CardTitle className="text-[18px] text-[#e6edf3]">Transaction history</CardTitle>
            <CardDescription className="text-[13px] text-[#768390]">Every trade used to calculate positions, cost basis, and performance. You can edit mistakes without re-entering everything.</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow className="border-[#30363d] hover:bg-transparent">
                  <TableHead className="text-[#768390]">Date</TableHead>
                  <TableHead className="text-[#768390]">Symbol</TableHead>
                  <TableHead className="text-[#768390]">Type</TableHead>
                  <TableHead className="text-[#768390]">Quantity</TableHead>
                  <TableHead className="text-[#768390]">Price</TableHead>
                  <TableHead className="text-[#768390]">Fees</TableHead>
                  <TableHead className="text-[#768390]">Notes</TableHead>
                  <TableHead className="text-right text-[#768390]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {portfolio.transactions.map((tx) => (
                  <TableRow key={tx.id} className="border-[#30363d] hover:bg-[#1c2128]">
                    <TableCell className="text-[#e6edf3]">{compactDate(tx.tradedAt || tx.createdAt)}</TableCell>
                    <TableCell className="font-medium text-[#e6edf3]">{tx.symbol}</TableCell>
                    <TableCell><Badge className={tx.type === "buy" ? "bg-emerald-600/20 text-emerald-400 border-emerald-500/30" : "bg-red-600/20 text-red-400 border-red-500/30"}>{tx.type.toUpperCase()}</Badge></TableCell>
                    <TableCell className="text-[#e6edf3]">{tx.quantity.toLocaleString("en-LK")}</TableCell>
                    <TableCell className="text-[#e6edf3]">{money(tx.price)}</TableCell>
                    <TableCell className="text-[#e6edf3]">{money(tx.fees)}</TableCell>
                    <TableCell className="max-w-[280px] text-[#768390]">{tx.notes || "—"}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button variant="outline" size="sm" onClick={() => openEditDialog(tx)} className="border-[#30363d] text-[#e6edf3] hover:bg-[#1c2128]"><Pencil className="mr-2 h-4 w-4" />Edit</Button>
                        <Button variant="outline" size="sm" onClick={() => deleteTransaction(tx.id)} className="border-red-500/30 text-red-400 hover:bg-red-500/10"><Trash2 className="mr-2 h-4 w-4" />Delete</Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
                {!loading && portfolio.transactions.length === 0 && <TableRow><TableCell colSpan={8} className="py-8 text-center text-[#768390]">No transactions recorded yet.</TableCell></TableRow>}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
