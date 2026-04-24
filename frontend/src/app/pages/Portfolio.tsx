import { useEffect, useMemo, useState } from "react";
import { Area, AreaChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { marketApi, portfolioApi, watchlistApi } from "../../lib/api/services";
import type { PortfolioAnalytics, PortfolioData, PortfolioPerformancePoint, PortfolioTransaction, Stock, Watchlist } from "../../lib/api/types";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "../components/ui/dialog";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/ui/table";
import { Textarea } from "../components/ui/textarea";
import { BarChart3, BriefcaseBusiness, FileUp, Landmark, Loader2, Pencil, PieChart, Plus, ShieldAlert, ShoppingBag, Trash2, TrendingDown, TrendingUp, Wallet } from "lucide-react";

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
  recentActions: [],
};

const emptyWatchlist: Watchlist = { symbols: [], items: [] };

const emptyAnalytics: PortfolioAnalytics = {
  days: 365,
  sectorAllocation: [],
  topGainers: [],
  topLosers: [],
  diversification: { score: 0, label: "Concentrated", effectiveHoldings: 0, sectorCount: 0, largestPositionPct: 0 },
  performanceBreakdown: { realizedPl: 0, unrealizedPl: 0, dividendIncome: 0, totalReturn: 0, realizedSharePct: 0, unrealizedSharePct: 0, dividendSharePct: 0 },
  dividendSummary: { totalIncome: 0, yieldOnCostPct: 0, payingPositionsCount: 0, topPositions: [] },
  risk: { score: 0, label: "Low", annualizedVolatilityPct: 0, weightedBeta: 1, largestPositionPct: 0, largestSectorPct: 0 },
  benchmark: { periodDays: 365, portfolioReturnPct: 0, aspiReturnPct: 0, sp20ReturnPct: 0, alphaVsAspiPct: 0, alphaVsSp20Pct: 0, series: [] },
};

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
  const [analytics, setAnalytics] = useState<PortfolioAnalytics>(emptyAnalytics);
  const [loading, setLoading] = useState(true);
  const [chartLoading, setChartLoading] = useState(true);
  const [analyticsLoading, setAnalyticsLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [chartDays, setChartDays] = useState(365);
  const [error, setError] = useState<string | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [importingCsv, setImportingCsv] = useState(false);
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [csvPreview, setCsvPreview] = useState<any | null>(null);
  const [form, setForm] = useState(defaultForm());
  const [symbolSuggestions, setSymbolSuggestions] = useState<Stock[]>([]);
  const [symbolSearchOpen, setSymbolSearchOpen] = useState(false);
  const [symbolSearchLoading, setSymbolSearchLoading] = useState(false);

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

  const loadAnalytics = async (days: number) => {
    setAnalyticsLoading(true);
    try {
      const payload = await portfolioApi.getAnalytics(days);
      setAnalytics(payload);
    } finally {
      setAnalyticsLoading(false);
    }
  };

  useEffect(() => {
    Promise.all([loadPortfolio(), loadPerformance(chartDays), loadAnalytics(chartDays)]).finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    Promise.all([loadPerformance(chartDays).catch(() => setPerformance([])), loadAnalytics(chartDays).catch(() => setAnalytics(emptyAnalytics))]);
  }, [chartDays]);

  useEffect(() => {
    let alive = true;
    const query = form.symbol.trim();
    if (!dialogOpen || query.length < 1) {
      setSymbolSuggestions([]);
      setSymbolSearchOpen(false);
      setSymbolSearchLoading(false);
      return;
    }
    setSymbolSearchLoading(true);
    const timer = window.setTimeout(() => {
      marketApi
        .searchCompanies(query)
        .then((results) => {
          if (!alive) return;
          setSymbolSuggestions(results.slice(0, 8));
          setSymbolSearchOpen(true);
        })
        .catch(() => {
          if (!alive) return;
          setSymbolSuggestions([]);
          setSymbolSearchOpen(true);
        })
        .finally(() => {
          if (alive) setSymbolSearchLoading(false);
        });
    }, 160);

    return () => {
      alive = false;
      window.clearTimeout(timer);
    };
  }, [dialogOpen, form.symbol]);

  const watchlistCandidates = useMemo(
    () => watchlist.items.filter((item) => !portfolio.positions.some((position) => position.symbol === item.symbol)).slice(0, 8),
    [watchlist.items, portfolio.positions]
  );

  const chartData = useMemo(
    () => performance.map((point) => ({ ...point, label: compactDate(point.date) })),
    [performance]
  );

  const benchmarkChartData = useMemo(
    () => (analytics.benchmark.series || []).map((point) => ({ ...point, label: compactDate(point.date) })),
    [analytics]
  );

  const resetDialog = () => {
    setDialogOpen(false);
    setEditingId(null);
    setError(null);
    setForm(defaultForm());
    setSymbolSuggestions([]);
    setSymbolSearchOpen(false);
  };

  const openAddDialog = (symbol?: string) => {
    setEditingId(null);
    setError(null);
    setForm({ ...defaultForm(), symbol: symbol || "" });
    setSymbolSuggestions([]);
    setSymbolSearchOpen(Boolean(symbol));
    setDialogOpen(true);
  };

  const openEditDialog = (tx: PortfolioTransaction) => {
    setEditingId(tx.id);
    setError(null);
    setSymbolSuggestions([]);
    setSymbolSearchOpen(false);
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
      await Promise.all([loadPerformance(chartDays), loadAnalytics(chartDays), watchlistApi.get().then(setWatchlist)]);
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
    await Promise.all([loadPerformance(chartDays), loadAnalytics(chartDays)]);
  };

  const previewCsvImport = async (file: File) => {
    setImportError(null);
    try {
      const response = await portfolioApi.previewImport(file);
      setCsvPreview(response?.preview || null);
    } catch (err: any) {
      setImportError(err?.message || "Could not preview transaction CSV");
      setCsvPreview(null);
    }
  };

  const importCsvTransactions = async () => {
    if (!csvFile) return;
    setImportingCsv(true);
    setImportError(null);
    try {
      const updated = await portfolioApi.importTransactions(csvFile);
      setPortfolio(updated);
      await Promise.all([loadPerformance(chartDays), loadAnalytics(chartDays)]);
      setCsvFile(null);
      setCsvPreview(null);
    } catch (err: any) {
      setImportError(err?.message || "Could not import transaction CSV");
    } finally {
      setImportingCsv(false);
    }
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
                  <div className="relative">
                    <Input
                      id="symbol"
                      value={form.symbol}
                      onChange={(e) => setForm((prev) => ({ ...prev, symbol: e.target.value.toUpperCase() }))}
                      onFocus={() => form.symbol.trim() && setSymbolSearchOpen(true)}
                      onBlur={() => window.setTimeout(() => setSymbolSearchOpen(false), 120)}
                      placeholder="Search symbol or company"
                      className="border-[#30363d] bg-[#0d1117] text-[#e6edf3]"
                    />
                    {symbolSearchOpen && (
                      <div className="absolute left-0 right-0 top-11 z-20 overflow-hidden rounded-md border border-[#30363d] bg-[#161b22] shadow-2xl">
                        {symbolSearchLoading ? (
                          <div className="px-3 py-2 text-[12px] text-[#768390]">Searching symbols…</div>
                        ) : symbolSuggestions.length ? (
                          <div className="max-h-56 overflow-y-auto py-1">
                            {symbolSuggestions.map((item) => (
                              <button
                                key={item.symbol}
                                type="button"
                                onMouseDown={(event) => event.preventDefault()}
                                onClick={() => {
                                  setForm((prev) => ({ ...prev, symbol: item.symbol }));
                                  setSymbolSearchOpen(false);
                                }}
                                className="flex w-full items-start justify-between gap-3 px-3 py-2 text-left hover:bg-[#1c2128]"
                              >
                                <div>
                                  <div className="text-[13px] font-semibold text-[#e6edf3]">{item.symbol}</div>
                                  <div className="text-[12px] text-[#768390]">{item.company}</div>
                                </div>
                                <div className="text-[11px] text-[#768390]">{item.sector || "—"}</div>
                              </button>
                            ))}
                          </div>
                        ) : (
                          <div className="px-3 py-2 text-[12px] text-[#768390]">No matching symbols found.</div>
                        )}
                      </div>
                    )}
                  </div>
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

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
          <Card className="border-[#30363d] bg-[#161b22]"><CardContent className="p-6"><div className="flex items-center gap-3"><div className="flex h-10 w-10 items-center justify-center rounded-md bg-cyan-500/10"><PieChart className="h-5 w-5 text-cyan-400" /></div><div><p className="text-[13px] text-[#768390]">Diversification</p><p className="text-[24px] font-bold text-[#e6edf3]">{analytics.diversification.score}/100</p><p className="text-[12px] text-[#768390]">{analytics.diversification.label} · {analytics.diversification.sectorCount} sectors</p></div></div></CardContent></Card>
          <Card className="border-[#30363d] bg-[#161b22]"><CardContent className="p-6"><div className="flex items-center gap-3"><div className="flex h-10 w-10 items-center justify-center rounded-md bg-rose-500/10"><ShieldAlert className="h-5 w-5 text-rose-400" /></div><div><p className="text-[13px] text-[#768390]">Portfolio risk</p><p className="text-[24px] font-bold text-[#e6edf3]">{analytics.risk.score}/100</p><p className="text-[12px] text-[#768390]">{analytics.risk.label} · Vol {analytics.risk.annualizedVolatilityPct.toFixed(1)}%</p></div></div></CardContent></Card>
          <Card className="border-[#30363d] bg-[#161b22]"><CardContent className="p-6"><div className="flex items-center gap-3"><div className="flex h-10 w-10 items-center justify-center rounded-md bg-amber-500/10"><Wallet className="h-5 w-5 text-amber-400" /></div><div><p className="text-[13px] text-[#768390]">Dividend income</p><p className="text-[24px] font-bold text-[#e6edf3]">{money(analytics.dividendSummary.totalIncome)}</p><p className="text-[12px] text-[#768390]">Yield on cost {signedPercent(analytics.dividendSummary.yieldOnCostPct)}</p></div></div></CardContent></Card>
          <Card className="border-[#30363d] bg-[#161b22]"><CardContent className="p-6"><div className="flex items-center gap-3"><div className="flex h-10 w-10 items-center justify-center rounded-md bg-indigo-500/10"><BarChart3 className="h-5 w-5 text-indigo-400" /></div><div><p className="text-[13px] text-[#768390]">Vs ASPI</p><p className={`text-[24px] font-bold ${analytics.benchmark.alphaVsAspiPct >= 0 ? "text-emerald-400" : "text-red-400"}`}>{signedPercent(analytics.benchmark.alphaVsAspiPct)}</p><p className="text-[12px] text-[#768390]">{chartDays >= 365 ? `${chartDays / 365}Y` : `${chartDays}D`} alpha</p></div></div></CardContent></Card>
        </div>

        <div className="grid gap-6 xl:grid-cols-3">
          <Card className="border-[#30363d] bg-[#161b22]">
            <CardHeader>
              <CardTitle className="text-[18px] text-[#e6edf3]">Sector allocation</CardTitle>
              <CardDescription className="text-[13px] text-[#768390]">How your current holdings are distributed across sectors.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {(analytics.sectorAllocation || []).length ? analytics.sectorAllocation.map((item) => (
                <div key={item.sector} className="space-y-2">
                  <div className="flex items-center justify-between gap-3 text-[13px]">
                    <div>
                      <div className="font-medium text-[#e6edf3]">{item.sector}</div>
                      <div className="text-[#768390]">{item.positionsCount} holding{item.positionsCount === 1 ? "" : "s"}</div>
                    </div>
                    <div className="text-right">
                      <div className="font-medium text-[#e6edf3]">{item.weightPct.toFixed(1)}%</div>
                      <div className="text-[#768390]">{money(item.marketValue)}</div>
                    </div>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-[#0d1117]"><div className="h-full rounded-full bg-blue-500" style={{ width: `${Math.min(100, item.weightPct)}%` }} /></div>
                </div>
              )) : <p className="text-[13px] text-[#768390]">Add positions to see sector allocation.</p>}
            </CardContent>
          </Card>

          <Card className="border-[#30363d] bg-[#161b22]">
            <CardHeader>
              <CardTitle className="text-[18px] text-[#e6edf3]">Top gainers and losers</CardTitle>
              <CardDescription className="text-[13px] text-[#768390]">Best and weakest current holdings by unrealized return.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="space-y-3">
                <div className="text-[13px] font-semibold uppercase tracking-wide text-emerald-400">Top gainers</div>
                {(analytics.topGainers || []).length ? analytics.topGainers.map((item) => (
                  <div key={`g-${item.symbol}`} className="flex items-center justify-between gap-3 rounded-lg border border-[#30363d] bg-[#0d1117] p-3">
                    <div>
                      <div className="font-medium text-[#e6edf3]">{item.symbol}</div>
                      <div className="text-[12px] text-[#768390]">{item.company}</div>
                    </div>
                    <div className="text-right">
                      <div className="font-medium text-emerald-400">{signedPercent(item.returnPct)}</div>
                      <div className="text-[12px] text-[#768390]">{money(item.profit)}</div>
                    </div>
                  </div>
                )) : <p className="text-[13px] text-[#768390]">No gainers yet.</p>}
              </div>
              <div className="space-y-3">
                <div className="text-[13px] font-semibold uppercase tracking-wide text-red-400">Top losers</div>
                {(analytics.topLosers || []).length ? analytics.topLosers.map((item) => (
                  <div key={`l-${item.symbol}`} className="flex items-center justify-between gap-3 rounded-lg border border-[#30363d] bg-[#0d1117] p-3">
                    <div>
                      <div className="font-medium text-[#e6edf3]">{item.symbol}</div>
                      <div className="text-[12px] text-[#768390]">{item.company}</div>
                    </div>
                    <div className="text-right">
                      <div className="font-medium text-red-400">{signedPercent(item.returnPct)}</div>
                      <div className="text-[12px] text-[#768390]">{money(item.profit)}</div>
                    </div>
                  </div>
                )) : <p className="text-[13px] text-[#768390]">No losers yet.</p>}
              </div>
            </CardContent>
          </Card>

          <Card className="border-[#30363d] bg-[#161b22]">
            <CardHeader>
              <CardTitle className="text-[18px] text-[#e6edf3]">Performance and income mix</CardTitle>
              <CardDescription className="text-[13px] text-[#768390]">Break down realized profits, unrealized gains, and dividend income.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {[
                { label: "Unrealized", value: analytics.performanceBreakdown.unrealizedPl, pct: analytics.performanceBreakdown.unrealizedSharePct, tone: analytics.performanceBreakdown.unrealizedPl >= 0 ? "bg-emerald-500" : "bg-red-500" },
                { label: "Realized", value: analytics.performanceBreakdown.realizedPl, pct: analytics.performanceBreakdown.realizedSharePct, tone: analytics.performanceBreakdown.realizedPl >= 0 ? "bg-amber-500" : "bg-red-500" },
                { label: "Dividends", value: analytics.performanceBreakdown.dividendIncome, pct: analytics.performanceBreakdown.dividendSharePct, tone: "bg-blue-500" },
              ].map((item) => (
                <div key={item.label} className="space-y-2">
                  <div className="flex items-center justify-between text-[13px]">
                    <span className="font-medium text-[#e6edf3]">{item.label}</span>
                    <span className="text-[#768390]">{money(item.value)} · {item.pct.toFixed(1)}%</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-[#0d1117]"><div className={`h-full rounded-full ${item.tone}`} style={{ width: `${Math.min(100, item.pct)}%` }} /></div>
                </div>
              ))}
              <div className="rounded-lg border border-[#30363d] bg-[#0d1117] p-4 text-[13px]">
                <div className="flex items-center justify-between"><span className="text-[#768390]">Total return</span><span className={analytics.performanceBreakdown.totalReturn >= 0 ? "font-semibold text-emerald-400" : "font-semibold text-red-400"}>{money(analytics.performanceBreakdown.totalReturn)}</span></div>
                <div className="mt-3 flex items-center justify-between"><span className="text-[#768390]">Dividend-paying positions</span><span className="font-medium text-[#e6edf3]">{analytics.dividendSummary.payingPositionsCount}</span></div>
                <div className="mt-2 flex items-center justify-between"><span className="text-[#768390]">Yield on cost</span><span className="font-medium text-[#e6edf3]">{signedPercent(analytics.dividendSummary.yieldOnCostPct)}</span></div>
              </div>
              {(analytics.dividendSummary.topPositions || []).length ? (
                <div className="space-y-2">
                  <div className="text-[13px] font-semibold text-[#e6edf3]">Top dividend contributors</div>
                  {analytics.dividendSummary.topPositions.map((item) => (
                    <div key={item.symbol} className="flex items-center justify-between text-[13px]">
                      <span className="text-[#768390]">{item.symbol}</span>
                      <span className="text-[#e6edf3]">{money(item.dividendIncome)}</span>
                    </div>
                  ))}
                </div>
              ) : null}
            </CardContent>
          </Card>
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
              <CardTitle className="text-[18px] text-[#e6edf3]">Benchmark comparison</CardTitle>
              <CardDescription className="text-[13px] text-[#768390]">Current holdings basket compared against ASPI and S&P SL20 on a normalized 100-base chart.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 p-6">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div className="rounded-lg border border-[#30363d] bg-[#0d1117] p-3">
                  <div className="text-[12px] text-[#768390]">Portfolio</div>
                  <div className={`text-[18px] font-semibold ${analytics.benchmark.portfolioReturnPct >= 0 ? "text-emerald-400" : "text-red-400"}`}>{signedPercent(analytics.benchmark.portfolioReturnPct)}</div>
                </div>
                <div className="rounded-lg border border-[#30363d] bg-[#0d1117] p-3">
                  <div className="text-[12px] text-[#768390]">ASPI</div>
                  <div className={`text-[18px] font-semibold ${analytics.benchmark.aspiReturnPct >= 0 ? "text-emerald-400" : "text-red-400"}`}>{signedPercent(analytics.benchmark.aspiReturnPct)}</div>
                </div>
                <div className="rounded-lg border border-[#30363d] bg-[#0d1117] p-3">
                  <div className="text-[12px] text-[#768390]">S&P SL20</div>
                  <div className={`text-[18px] font-semibold ${analytics.benchmark.sp20ReturnPct >= 0 ? "text-emerald-400" : "text-red-400"}`}>{signedPercent(analytics.benchmark.sp20ReturnPct)}</div>
                </div>
              </div>
              {analyticsLoading ? (
                <div className="flex h-[260px] items-center justify-center text-[#768390]"><Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading benchmark comparison...</div>
              ) : benchmarkChartData.length === 0 ? (
                <div className="flex h-[260px] items-center justify-center text-center text-[#768390]">Add positions with price history to compare against the market benchmarks.</div>
              ) : (
                <div className="h-[260px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={benchmarkChartData} margin={{ top: 8, right: 12, left: -12, bottom: 0 }}>
                      <CartesianGrid stroke="#30363d" vertical={false} strokeDasharray="3 3" />
                      <XAxis dataKey="label" tick={{ fill: "#768390", fontSize: 11 }} axisLine={false} tickLine={false} minTickGap={24} />
                      <YAxis tick={{ fill: "#768390", fontSize: 11 }} axisLine={false} tickLine={false} width={62} />
                      <Tooltip
                        contentStyle={{ backgroundColor: "#0d1117", border: "1px solid #30363d", borderRadius: 12, color: "#e6edf3" }}
                        formatter={(value: number, name: string) => [Number(value).toFixed(2), name === "portfolio" ? "Portfolio" : name === "aspi" ? "ASPI" : "S&P SL20"]}
                        labelFormatter={(_, payload) => payload?.[0]?.payload?.label || ""}
                      />
                      <Line type="monotone" dataKey="portfolio" stroke="#60a5fa" strokeWidth={2.5} dot={false} />
                      <Line type="monotone" dataKey="aspi" stroke="#f59e0b" strokeWidth={2} dot={false} />
                      <Line type="monotone" dataKey="sp20" stroke="#10b981" strokeWidth={2} dot={false} />
                    </LineChart>
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
            <CardTitle className="text-[18px] text-[#e6edf3]">Recent corporate actions</CardTitle>
            <CardDescription className="text-[13px] text-[#768390]">Dividends, splits, and bonus issues stored in the system and used in portfolio calculations.</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow className="border-[#30363d] hover:bg-transparent">
                  <TableHead className="text-[#768390]">Ex date</TableHead>
                  <TableHead className="text-[#768390]">Symbol</TableHead>
                  <TableHead className="text-[#768390]">Type</TableHead>
                  <TableHead className="text-[#768390]">Details</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(portfolio.recentActions || []).slice(0, 8).map((action) => (
                  <TableRow key={action.id} className="border-[#30363d] hover:bg-[#1c2128]">
                    <TableCell className="text-[#e6edf3]">{compactDate(action.exDate)}</TableCell>
                    <TableCell className="font-medium text-[#e6edf3]">{action.symbol}</TableCell>
                    <TableCell className="text-[#e6edf3]">{action.actionType}</TableCell>
                    <TableCell className="text-[#768390]">{action.amount ? money(action.amount) : action.ratioNumerator && action.ratioDenominator ? `${action.ratioNumerator}:${action.ratioDenominator}` : action.description || "—"}</TableCell>
                  </TableRow>
                ))}
                {!(portfolio.recentActions || []).length && <TableRow><TableCell colSpan={4} className="py-8 text-center text-[#768390]">No corporate actions stored yet.</TableCell></TableRow>}
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
