import { useEffect, useMemo, useState } from "react";
import { Area, AreaChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { alertsApi, marketApi, portfolioApi, watchlistApi } from "../../lib/api/services";
import type { EventCalendar, PortfolioAccount, PortfolioAnalytics, PortfolioData, PortfolioIntelligence, TradeFitPreview, PortfolioPerformancePoint, PortfolioPeriodPerformance, PortfolioTransaction, Stock, Watchlist } from "../../lib/api/types";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "../components/ui/dialog";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/ui/table";
import { Textarea } from "../components/ui/textarea";
import { BarChart3, BriefcaseBusiness, FileUp, Landmark, Loader2, Pencil, PieChart, Plus, ShieldAlert, ShoppingBag, Trash2, TrendingDown, TrendingUp, Wallet, ShieldCheck, Lightbulb, BrainCircuit, CheckCircle2, AlertTriangle, Clock } from "lucide-react";

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
    cashBalance: 0,
    cashDeposits: 0,
    cashWithdrawals: 0,
    netContributions: 0,
    totalEquity: 0,
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

const emptyCalendar: EventCalendar = { symbols: [], upcoming: [], recent: [], count: 0 };

const emptyIntelligence: PortfolioIntelligence = {
  portfolioId: "",
  health: { score: 0, label: "Needs attention", attentionCount: 0, watchCount: 0 },
  cashManagement: { label: "healthy_cash", score: 0, cashBalance: 0, cashPct: 0, targetMinPct: 5, targetMaxPct: 20, recommendedMinCash: 0, recommendedMaxCash: 0, reasons: [], suggestions: [] },
  holdings: [],
  attentionItems: [],
  suggestions: [],
};

function statusBadgeClass(status?: string) {
  switch (status) {
    case "suitable": return "border-emerald-500/30 bg-emerald-500/10 text-emerald-300";
    case "watch": return "border-blue-500/30 bg-blue-500/10 text-blue-300";
    case "need_attention": return "border-amber-500/30 bg-amber-500/10 text-amber-300";
    case "high_risk": return "border-red-500/30 bg-red-500/10 text-red-300";
    default: return "border-[#30363d] bg-[#0d1117] text-[#768390]";
  }
}

const defaultForm = () => ({
  symbol: "",
  txType: "buy" as "buy" | "sell",
  quantity: "",
  price: "",
  fees: "0",
  tradedAt: new Date().toISOString().slice(0, 10),
  notes: "",
});

type PortfolioPanel = "cash" | "smart" | "analytics" | "performance" | "holdings" | "events" | "import" | "transactions" | "journal";

type NoteItem = {
  id: string;
  text: string;
  createdAt: string;
  reminderAt?: string;
};

const portfolioPanels: Array<{ key: PortfolioPanel; label: string; description: string }> = [
  { key: "cash", label: "Cash", description: "cash balance, deposits and withdrawals" },
  { key: "smart", label: "AI Guidance", description: "fully automated ai intelligence, risk monitoring and guidance" },
  { key: "analytics", label: "Analytics", description: "sectors, gainers, losers and income mix" },
  { key: "performance", label: "Performance", description: "charts, periods and benchmarks" },
  { key: "holdings", label: "Holdings", description: "open positions and smart status" },
  { key: "events", label: "Events", description: "corporate actions and held-stock calendar" },
  { key: "import", label: "Import", description: "broker statements and CSV import" },
  { key: "transactions", label: "Transactions", description: "trade history and corrections" },
  { key: "journal", label: "Journal", description: "trader notes and strategy" },
];

const timeframeOptions = [
  { label: "1D", days: 1 },
  { label: "1W", days: 7 },
  { label: "1M", days: 30 },
  { label: "3M", days: 90 },
  { label: "6M", days: 180 },
  { label: "1Y", days: 365 },
  { label: "2Y", days: 730 },
  { label: "5Y", days: 1825 },
];

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
  const [periodPerformance, setPeriodPerformance] = useState<PortfolioPeriodPerformance[]>([]);
  const [analytics, setAnalytics] = useState<PortfolioAnalytics>(emptyAnalytics);
  const [intelligence, setIntelligence] = useState<PortfolioIntelligence>(emptyIntelligence);
  const [tradePreview, setTradePreview] = useState<TradeFitPreview | null>(null);
  const [calendar, setCalendar] = useState<EventCalendar>(emptyCalendar);
  const [tradePreviewLoading, setTradePreviewLoading] = useState(false);
  const [portfolios, setPortfolios] = useState<PortfolioAccount[]>([]);
  const [selectedPortfolioId, setSelectedPortfolioId] = useState<string>("");
  const [newPortfolioName, setNewPortfolioName] = useState("");
  const [cashForm, setCashForm] = useState({ movementType: "deposit" as "deposit" | "withdrawal", amount: "", movementDate: new Date().toISOString().slice(0, 10), notes: "" });
  const [loading, setLoading] = useState(true);
  const [chartLoading, setChartLoading] = useState(true);
  const [analyticsLoading, setAnalyticsLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [chartDays, setChartDays] = useState(365);
  const [activePanel, setActivePanel] = useState<PortfolioPanel>("performance");
  const [error, setError] = useState<string | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [importingCsv, setImportingCsv] = useState(false);
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [csvPreview, setCsvPreview] = useState<any | null>(null);
  const [form, setForm] = useState(defaultForm());
  const [symbolSuggestions, setSymbolSuggestions] = useState<Stock[]>([]);
  const [notes, setNotes] = useState<NoteItem[]>([]);
  const [newNoteText, setNewNoteText] = useState("");
  const [isSavingJournal, setIsSavingJournal] = useState(false);
  const [reminderTime, setReminderTime] = useState("");

  useEffect(() => {
    if (portfolio?.portfolio) {
      try {
        const desc = portfolio.portfolio.description || "";
        if (desc.startsWith("[") && desc.endsWith("]")) {
          setNotes(JSON.parse(desc));
        } else if (desc.trim() !== "") {
          setNotes([{ id: Date.now().toString(), text: desc, createdAt: new Date().toISOString() }]);
        } else {
          setNotes([]);
        }
      } catch (e) {
        setNotes([{ id: Date.now().toString(), text: portfolio.portfolio.description || "", createdAt: new Date().toISOString() }]);
      }
    }
  }, [portfolio?.portfolio]);

  const handleAddNote = async () => {
    if (!newNoteText.trim() || !portfolio?.portfolio) {
      setError("Please write a note first.");
      return;
    }
    setIsSavingJournal(true);

    let targetTimestamp: number | undefined;
    if (reminderTime) {
      targetTimestamp = new Date(reminderTime).getTime() / 1000;
      if (targetTimestamp <= Date.now() / 1000) {
        setError("Reminder time must be in the future.");
        setIsSavingJournal(false);
        return;
      }
    }

    const noteId = Date.now().toString();
    const newNote: NoteItem = {
      id: noteId,
      text: newNoteText,
      createdAt: new Date().toISOString(),
      reminderAt: reminderTime || undefined,
    };

    const updatedNotes = [newNote, ...notes];

    try {
      await portfolioApi.updatePortfolio(portfolio.portfolio.portfolioId, { description: JSON.stringify(updatedNotes) });
      if (targetTimestamp) {
        await alertsApi.create({
          alertType: "reminder",
          targetPrice: targetTimestamp,
          meta: { note: newNoteText.slice(0, 200), noteId }
        });
      }
      setPortfolio((prev) => prev ? { ...prev, portfolio: { ...prev.portfolio!, description: JSON.stringify(updatedNotes) } } : prev);
      setNewNoteText("");
      setReminderTime("");
      setError(null);
    } catch (err) {
      setError("Failed to add note");
    } finally {
      setIsSavingJournal(false);
    }
  };

  const handleDeleteNote = async (id: string) => {
    if (!portfolio?.portfolio) return;
    const updatedNotes = notes.filter(n => n.id !== id);
    try {
      await portfolioApi.updatePortfolio(portfolio.portfolio.portfolioId, { description: JSON.stringify(updatedNotes) });
      setPortfolio((prev) => prev ? { ...prev, portfolio: { ...prev.portfolio!, description: JSON.stringify(updatedNotes) } } : prev);
      setNotes(updatedNotes);
    } catch (err) {
      setError("Failed to delete note");
    }
  };

  const [symbolSearchOpen, setSymbolSearchOpen] = useState(false);
  const [symbolSearchLoading, setSymbolSearchLoading] = useState(false);

  const loadPortfolio = async (portfolioId = selectedPortfolioId) => {
    const [portfolioRows, watchlistData] = await Promise.all([portfolioApi.listPortfolios(), watchlistApi.get()]);
    setPortfolios(portfolioRows);
    const activeId = portfolioId || portfolioRows.find((item) => item.isDefault)?.portfolioId || portfolioRows[0]?.portfolioId || "";
    if (activeId && activeId !== selectedPortfolioId) setSelectedPortfolioId(activeId);
    const portfolioData = await portfolioApi.get(activeId || undefined);
    setPortfolio(portfolioData);
    setWatchlist(watchlistData);
    return activeId;
  };

  const loadPerformance = async (days: number, portfolioId = selectedPortfolioId) => {
    setChartLoading(true);
    try {
      const [series, periods] = await Promise.all([portfolioApi.getPerformance(days, portfolioId || undefined), portfolioApi.getPeriodPerformance(portfolioId || undefined)]);
      setPerformance(series);
      setPeriodPerformance(periods);
    } finally {
      setChartLoading(false);
    }
  };

  const loadAnalytics = async (days: number, portfolioId = selectedPortfolioId) => {
    setAnalyticsLoading(true);
    try {
      const payload = await portfolioApi.getAnalytics(days, portfolioId || undefined);
      setAnalytics(payload);
    } finally {
      setAnalyticsLoading(false);
    }
  };

  const loadIntelligence = async (portfolioId = selectedPortfolioId) => {
    const payload = await portfolioApi.getIntelligence(portfolioId || undefined);
    setIntelligence(payload);
  };

  const loadCalendar = async (portfolioId = selectedPortfolioId) => {
    const payload = await marketApi.getCalendar({ portfolioId: portfolioId || undefined, days: 180 });
    setCalendar(payload);
  };

  useEffect(() => {
    (async () => {
      const activeId = await loadPortfolio();
      await Promise.all([loadPerformance(chartDays, activeId), loadAnalytics(chartDays, activeId), loadIntelligence(activeId)]);
    })().finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!selectedPortfolioId) return;
    Promise.all([loadPortfolio(selectedPortfolioId), loadPerformance(chartDays, selectedPortfolioId).catch(() => setPerformance([])), loadAnalytics(chartDays, selectedPortfolioId).catch(() => setAnalytics(emptyAnalytics)), loadIntelligence(selectedPortfolioId).catch(() => setIntelligence(emptyIntelligence))]);
  }, [selectedPortfolioId, chartDays]);

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

  useEffect(() => {
    const symbol = form.symbol.trim().toUpperCase();
    const quantity = Number(form.quantity || 0);
    const price = Number(form.price || 0);
    if (!dialogOpen || editingId || !symbol || quantity <= 0 || price <= 0) {
      setTradePreview(null);
      setTradePreviewLoading(false);
      return;
    }
    let alive = true;
    setTradePreviewLoading(true);
    const timer = window.setTimeout(() => {
      portfolioApi.previewTradeFit({
        symbol,
        txType: form.txType,
        quantity,
        price,
        fees: Number(form.fees || 0),
        tradedAt: form.tradedAt,
        notes: form.notes || undefined,
      }, selectedPortfolioId || undefined)
        .then((payload) => { if (alive) setTradePreview(payload); })
        .catch(() => { if (alive) setTradePreview(null); })
        .finally(() => { if (alive) setTradePreviewLoading(false); });
    }, 350);
    return () => { alive = false; window.clearTimeout(timer); };
  }, [dialogOpen, editingId, form.symbol, form.txType, form.quantity, form.price, form.fees, form.tradedAt, form.notes, selectedPortfolioId]);

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
    setTradePreview(null);
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
      const updated = editingId ? await portfolioApi.updateTransaction(editingId, payload, selectedPortfolioId || undefined) : await portfolioApi.addTransaction(payload, selectedPortfolioId || undefined);
      setPortfolio(updated);
      await Promise.all([loadPerformance(chartDays, selectedPortfolioId), loadAnalytics(chartDays, selectedPortfolioId), watchlistApi.get().then(setWatchlist), loadPortfolio(selectedPortfolioId), loadIntelligence(selectedPortfolioId), loadCalendar(selectedPortfolioId)]);
      resetDialog();
    } catch (err: any) {
      setError(err?.message || "Could not save portfolio transaction");
    } finally {
      setSubmitting(false);
    }
  };

  const deleteTransaction = async (transactionId: string) => {
    const updated = await portfolioApi.deleteTransaction(transactionId, selectedPortfolioId || undefined);
    setPortfolio(updated);
    await Promise.all([loadPerformance(chartDays, selectedPortfolioId), loadAnalytics(chartDays, selectedPortfolioId), loadPortfolio(selectedPortfolioId), loadIntelligence(selectedPortfolioId), loadCalendar(selectedPortfolioId)]);
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

  const createPortfolio = async () => {
    const name = newPortfolioName.trim();
    if (!name) return;
    setSubmitting(true);
    setError(null);
    try {
      const result = await portfolioApi.createPortfolio({ name });
      setPortfolios(result.portfolios);
      setSelectedPortfolioId(result.portfolio.portfolioId);
      setNewPortfolioName("");
    } catch (err: any) {
      setError(err?.message || "Failed to create portfolio");
    } finally {
      setSubmitting(false);
    }
  };

  const setDefaultPortfolio = async () => {
    if (!selectedPortfolioId) return;
    setSubmitting(true);
    setError(null);
    try {
      const result = await portfolioApi.updatePortfolio(selectedPortfolioId, { isDefault: true });
      setPortfolios(result.portfolios);
    } catch (err: any) {
      setError(err?.message || "Failed to set default portfolio");
    } finally {
      setSubmitting(false);
    }
  };

  const archivePortfolio = async () => {
    if (!selectedPortfolioId) return;
    const active = portfolios.find((item) => item.portfolioId === selectedPortfolioId);
    if (active?.isDefault) {
      setError("Cannot archive the default portfolio. Set another portfolio as default first.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const result = await portfolioApi.updatePortfolio(selectedPortfolioId, { isArchived: true });
      setPortfolios(result.portfolios);
      setSelectedPortfolioId(result.portfolios.find((item) => item.isDefault)?.portfolioId || result.portfolios[0]?.portfolioId || "");
    } catch (err: any) {
      setError(err?.message || "Failed to archive portfolio");
    } finally {
      setSubmitting(false);
    }
  };

  const addCashMovement = async () => {
    const amount = Number(cashForm.amount || 0);
    if (!amount || amount <= 0) return;
    const updated = await portfolioApi.addCashMovement({ movementType: cashForm.movementType, amount, movementDate: cashForm.movementDate, notes: cashForm.notes || undefined }, selectedPortfolioId || undefined);
    setPortfolio(updated);
    setCashForm({ movementType: "deposit", amount: "", movementDate: new Date().toISOString().slice(0, 10), notes: "" });
    await Promise.all([loadPerformance(chartDays, selectedPortfolioId), loadAnalytics(chartDays, selectedPortfolioId), loadPortfolio(selectedPortfolioId), loadIntelligence(selectedPortfolioId), loadCalendar(selectedPortfolioId)]);
  };

  const importCsvTransactions = async () => {
    if (!csvFile) return;
    setImportingCsv(true);
    setImportError(null);
    try {
      const updated = await portfolioApi.importTransactions(csvFile, selectedPortfolioId || undefined);
      setPortfolio(updated);
      await Promise.all([loadPerformance(chartDays, selectedPortfolioId), loadAnalytics(chartDays, selectedPortfolioId), loadPortfolio(selectedPortfolioId), loadIntelligence(selectedPortfolioId), loadCalendar(selectedPortfolioId)]);
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
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div className="space-y-1.5">
            <h1 className="text-[32px] font-bold leading-tight tracking-tight text-[#e6edf3]">Portfolio</h1>
            <p className="text-[13px] text-[#768390]">Track multiple portfolios, cash, performance periods, and benchmark alpha.</p>
          </div>
          <div className="flex flex-col gap-3 md:flex-row md:items-center">
            <Select value={selectedPortfolioId} onValueChange={setSelectedPortfolioId}>
              <SelectTrigger className="w-[220px] border-[#30363d] bg-[#0d1117] text-[#e6edf3]"><SelectValue placeholder="Select portfolio" /></SelectTrigger>
              <SelectContent className="border-[#30363d] bg-[#161b22]">
                {portfolios.map((item) => <SelectItem key={item.portfolioId} value={item.portfolioId}>{item.name}{item.isDefault ? " · Default" : ""}</SelectItem>)}
              </SelectContent>
            </Select>
            <Input value={newPortfolioName} onChange={(e) => setNewPortfolioName(e.target.value)} placeholder="New portfolio name" className="w-[210px] border-[#30363d] bg-[#0d1117] text-[#e6edf3]" />
            <Button variant="outline" onClick={createPortfolio} disabled={submitting || !newPortfolioName.trim()} className="border-[#30363d] text-[#e6edf3]">
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Create"}
            </Button>
            <Button variant="outline" onClick={setDefaultPortfolio} disabled={submitting || !selectedPortfolioId} className="border-[#30363d] text-[#e6edf3]">Set Default</Button>
            <Button variant="outline" onClick={archivePortfolio} disabled={submitting || !selectedPortfolioId || portfolios.find((item) => item.portfolioId === selectedPortfolioId)?.isDefault} className="border-[#30363d] text-[#e6edf3]">Archive</Button>
          </div>
          {error && activePanel === "performance" && (
            <div className="mx-auto max-w-[1680px] px-6 lg:px-8 mt-4">
              <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-sm text-red-400 flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                {error}
                <Button variant="ghost" size="sm" onClick={() => setError(null)} className="ml-auto h-auto p-0 text-red-400 hover:text-red-300">Dismiss</Button>
              </div>
            </div>
          )}
          <Dialog open={dialogOpen} onOpenChange={(open) => (open ? setDialogOpen(true) : resetDialog())}>
            <DialogTrigger asChild>
              <Button onClick={() => openAddDialog()} className="bg-emerald-600 text-white hover:bg-emerald-700"><Plus className="mr-2 h-4 w-4" />Add Transaction</Button>
            </DialogTrigger>
            <DialogContent className="border-[#30363d] bg-[#0d1117] text-[#e6edf3] sm:max-w-[1000px] p-0 overflow-hidden">
              <div className="flex flex-col md:flex-row h-full max-h-[90vh]">
                {/* Left Side: Form */}
                <div className="flex-1 p-6 overflow-y-auto border-r border-[#30363d]">
                  <DialogHeader className="mb-6">
                    <DialogTitle className="text-2xl font-bold">{editingId ? "Edit transaction" : "Add transaction"}</DialogTitle>
                    <DialogDescription className="text-[#768390]">Update your holdings and cost basis with trade details.</DialogDescription>
                  </DialogHeader>
                  
                  <div className="grid gap-5">
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="space-y-2">
                        <Label htmlFor="symbol" className="text-[13px] font-medium text-[#768390]">Symbol</Label>
                        <div className="relative">
                          <Input
                            id="symbol"
                            value={form.symbol}
                            onChange={(e) => setForm((prev) => ({ ...prev, symbol: e.target.value.toUpperCase() }))}
                            onFocus={() => form.symbol.trim() && setSymbolSearchOpen(true)}
                            onBlur={() => window.setTimeout(() => setSymbolSearchOpen(false), 120)}
                            placeholder="e.g. DIAL.N0000"
                            className="border-[#30363d] bg-[#161b22] text-[#e6edf3] h-11 focus:ring-blue-500/20"
                          />
                          {symbolSearchOpen && (
                            <div className="absolute left-0 right-0 top-12 z-50 overflow-hidden rounded-xl border border-[#30363d] bg-[#161b22] shadow-2xl backdrop-blur-xl">
                              {symbolSearchLoading ? (
                                <div className="px-4 py-3 text-[12px] text-[#768390] flex items-center gap-2">
                                  <Loader2 className="h-3 w-3 animate-spin" /> Searching symbols…
                                </div>
                              ) : symbolSuggestions.length ? (
                                <div className="max-h-60 overflow-y-auto py-1">
                                  {symbolSuggestions.map((item) => (
                                    <button
                                      key={item.symbol}
                                      type="button"
                                      onMouseDown={(event) => event.preventDefault()}
                                      onClick={() => {
                                        setForm((prev) => ({ ...prev, symbol: item.symbol }));
                                        setSymbolSearchOpen(false);
                                      }}
                                      className="flex w-full items-start justify-between gap-3 px-4 py-2.5 text-left hover:bg-blue-600/10 transition-colors"
                                    >
                                      <div>
                                        <div className="text-[14px] font-bold text-[#e6edf3]">{item.symbol}</div>
                                        <div className="text-[12px] text-[#768390]">{item.company}</div>
                                      </div>
                                      <div className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-[#30363d] text-[#768390]">{item.sector || "—"}</div>
                                    </button>
                                  ))}
                                </div>
                              ) : (
                                <div className="px-4 py-3 text-[12px] text-[#768390]">No matching symbols found.</div>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="space-y-2">
                        <Label className="text-[13px] font-medium text-[#768390]">Trade Type</Label>
                        <Select value={form.txType} onValueChange={(value: "buy" | "sell") => setForm((prev) => ({ ...prev, txType: value }))}>
                          <SelectTrigger className="border-[#30363d] bg-[#161b22] text-[#e6edf3] h-11"><SelectValue /></SelectTrigger>
                          <SelectContent className="border-[#30363d] bg-[#1c2128]">
                            <SelectItem value="buy" className="text-emerald-400">Buy / Long</SelectItem>
                            <SelectItem value="sell" className="text-red-400">Sell / Close</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="space-y-2">
                        <Label htmlFor="quantity" className="text-[13px] font-medium text-[#768390]">Quantity</Label>
                        <Input id="quantity" type="number" min="0" step="0.0001" value={form.quantity} onChange={(e) => setForm((prev) => ({ ...prev, quantity: e.target.value }))} className="border-[#30363d] bg-[#161b22] text-[#e6edf3] h-11" />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="price" className="text-[13px] font-medium text-[#768390]">Price per share</Label>
                        <Input id="price" type="number" min="0" step="0.01" value={form.price} onChange={(e) => setForm((prev) => ({ ...prev, price: e.target.value }))} className="border-[#30363d] bg-[#161b22] text-[#e6edf3] h-11" />
                      </div>
                    </div>

                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="space-y-2">
                        <Label htmlFor="fees" className="text-[13px] font-medium text-[#768390]">Broker Fees</Label>
                        <Input id="fees" type="number" min="0" step="0.01" value={form.fees} onChange={(e) => setForm((prev) => ({ ...prev, fees: e.target.value }))} className="border-[#30363d] bg-[#161b22] text-[#e6edf3] h-11" />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="tradedAt" className="text-[13px] font-medium text-[#768390]">Trade Date</Label>
                        <Input id="tradedAt" type="date" value={form.tradedAt} onChange={(e) => setForm((prev) => ({ ...prev, tradedAt: e.target.value }))} className="border-[#30363d] bg-[#161b22] text-[#e6edf3] h-11" />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="notes" className="text-[13px] font-medium text-[#768390]">Notes (Strategy or Rationale)</Label>
                      <Textarea id="notes" value={form.notes} onChange={(e) => setForm((prev) => ({ ...prev, notes: e.target.value }))} placeholder="Why are you making this trade?" className="border-[#30363d] bg-[#161b22] text-[#e6edf3] min-h-[80px]" />
                    </div>
                  </div>

                  {error && (
                    <div className="mt-4 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-sm text-red-400 flex items-center gap-2">
                      <AlertTriangle className="h-4 w-4 shrink-0" />
                      {error}
                    </div>
                  )}

                  <div className="mt-8 flex items-center justify-end gap-3">
                    <Button variant="outline" onClick={resetDialog} className="border-[#30363d] text-[#768390] hover:bg-[#1c2128] hover:text-[#e6edf3] px-6">Cancel</Button>
                    <Button 
                      onClick={submitTransaction} 
                      disabled={submitting || !form.symbol || !form.quantity || !form.price} 
                      className={`px-8 h-11 font-bold shadow-lg transition-all active:scale-[0.98] ${form.txType === 'buy' ? 'bg-emerald-600 hover:bg-emerald-500 text-white' : 'bg-red-600 hover:bg-red-500 text-white'}`}
                    >
                      {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : editingId ? <Pencil className="mr-2 h-4 w-4" /> : <Plus className="mr-2 h-4 w-4" />}
                      {editingId ? "Save Changes" : "Save Transaction"}
                    </Button>
                  </div>
                </div>

                {/* Right Side: AI Intelligence */}
                <div className="w-full md:w-[420px] bg-[#161b22] p-6 overflow-y-auto border-l border-[#30363d] relative">
                  <div className="absolute inset-0 bg-gradient-to-br from-blue-600/5 via-transparent to-emerald-600/5 pointer-events-none" />
                  
                  <div className="relative z-10 space-y-6">
                    <div className="flex items-center gap-2 mb-2">
                      <div className="p-1.5 rounded-lg bg-blue-500/20">
                        <BrainCircuit className="h-5 w-5 text-blue-400" />
                      </div>
                      <h3 className="text-lg font-bold text-white tracking-tight">Smart Trade Check</h3>
                    </div>

                    {!form.symbol || !form.quantity || !form.price ? (
                      <div className="flex flex-col items-center justify-center py-12 text-center space-y-4">
                        <div className="w-20 h-20 rounded-full bg-[#30363d]/30 flex items-center justify-center mb-2">
                          <Clock className="h-10 w-10 text-[#30363d]" />
                        </div>
                        <p className="text-[#768390] text-sm max-w-[200px]">Fill in the trade details to see AI-powered portfolio impact.</p>
                      </div>
                    ) : tradePreviewLoading ? (
                      <div className="flex flex-col items-center justify-center py-12 text-center space-y-4">
                        <Loader2 className="h-10 w-10 text-blue-500 animate-spin" />
                        <p className="text-blue-400 font-medium">Analyzing portfolio fit...</p>
                        <p className="text-[#768390] text-xs">Simulating allocations and risk profiles</p>
                      </div>
                    ) : tradePreview ? (
                      <div className="animate-in fade-in slide-in-from-right-4 duration-500 space-y-6">
                        <div className="relative flex flex-col items-center p-6 rounded-2xl bg-[#0d1117] border border-[#30363d] shadow-xl">
                          <div className="absolute top-4 right-4">
                            <Badge variant="outline" className={`${statusBadgeClass(tradePreview.status)} border-current bg-transparent px-3 py-1 font-bold uppercase tracking-wider text-[10px]`}>
                              {tradePreview.statusLabel}
                            </Badge>
                          </div>
                          
                          <div className="relative flex items-center justify-center w-32 h-32 mb-4">
                            <svg className="w-full h-full -rotate-90">
                              <circle cx="64" cy="64" r="58" stroke="currentColor" strokeWidth="8" fill="transparent" className="text-[#1c2128]" />
                              <circle 
                                cx="64" cy="64" r="58" stroke="currentColor" strokeWidth="8" fill="transparent" 
                                strokeDasharray={364.4}
                                strokeDashoffset={364.4 - (364.4 * tradePreview.fitScore) / 100}
                                className={`${tradePreview.fitScore >= 75 ? 'text-emerald-500' : tradePreview.fitScore >= 50 ? 'text-blue-500' : 'text-amber-500'} transition-all duration-1000 ease-out`}
                                strokeLinecap="round"
                              />
                            </svg>
                            <div className="absolute inset-0 flex flex-col items-center justify-center">
                              <span className="text-3xl font-black text-white">{tradePreview.fitScore}</span>
                              <span className="text-[10px] text-[#768390] font-bold uppercase">Fit Score</span>
                            </div>
                          </div>

                          <div className="w-full grid grid-cols-2 gap-3 mt-2">
                            <div className="p-3 rounded-xl bg-[#1c2128] border border-[#30363d]">
                              <p className="text-[11px] text-[#768390] font-medium uppercase mb-1">Stock Weight</p>
                              <div className="flex items-baseline gap-1">
                                <span className="text-lg font-bold text-white">{tradePreview.newStockWeightPct.toFixed(1)}%</span>
                                <span className="text-[10px] text-[#768390]">({tradePreview.currentStockWeightPct.toFixed(1)}% →)</span>
                              </div>
                            </div>
                            <div className="p-3 rounded-xl bg-[#1c2128] border border-[#30363d]">
                              <p className="text-[11px] text-[#768390] font-medium uppercase mb-1">Cash After</p>
                              <div className={`text-lg font-bold ${tradePreview.cashAfter < 0 ? "text-red-400" : "text-white"}`}>
                                {money(tradePreview.cashAfter).replace('Rs. ', '')}
                              </div>
                            </div>
                          </div>
                        </div>

                        <div className="space-y-4">
                          <h4 className="text-sm font-bold text-[#768390] uppercase tracking-widest flex items-center gap-2">
                            <ShieldCheck className="h-4 w-4 text-emerald-400" /> Real-World Impact
                          </h4>
                          <div className="space-y-3">
                            {tradePreview.reasons.map((reason, idx) => (
                              <div key={idx} className="flex gap-3 p-3 rounded-xl bg-blue-500/5 border border-blue-500/10 group hover:border-blue-500/30 transition-colors">
                                <div className="mt-1 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-blue-500/20">
                                  <div className="h-1.5 w-1.5 rounded-full bg-blue-400" />
                                </div>
                                <p className="text-[13px] leading-relaxed text-[#e6edf3]">{reason}</p>
                              </div>
                            ))}
                          </div>
                        </div>

                        {tradePreview.suggestions.length > 0 && (
                          <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/20">
                            <div className="flex items-center gap-2 mb-2">
                              <Lightbulb className="h-4 w-4 text-amber-400" />
                              <span className="text-xs font-bold text-amber-400 uppercase tracking-wider">AI Suggestion</span>
                            </div>
                            <p className="text-[13px] text-amber-200/80 italic leading-relaxed">
                              "{tradePreview.suggestions[0]}"
                            </p>
                          </div>
                        )}

                        <div className="pt-2">
                          <div className="flex items-center gap-3 p-4 rounded-xl border border-[#30363d] bg-gradient-to-r from-violet-600/10 to-blue-600/10">
                            <div className="shrink-0 p-2 rounded-lg bg-violet-600/20">
                              <TrendingUp className="h-4 w-4 text-violet-400" />
                            </div>
                            <div>
                              <p className="text-[11px] font-bold text-violet-400 uppercase">Pro Tip</p>
                              <p className="text-[12px] text-[#768390]">This {tradePreview.txType} will result in a {tradePreview.newStockWeightPct > 15 ? 'concentrated' : 'balanced'} position in your portfolio.</p>
                            </div>
                          </div>
                        </div>
                      </div>
                    ) : null}
                  </div>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Card className="border-[#30363d] bg-[#161b22]"><CardContent className="p-6"><div className="flex items-center gap-3"><div className="flex h-10 w-10 items-center justify-center rounded-md bg-blue-500/10"><BriefcaseBusiness className="h-5 w-5 text-blue-500" /></div><div><p className="text-[13px] text-[#768390]">Market value</p><p className="text-[24px] font-bold text-[#e6edf3]">{money(portfolio.summary.marketValue)}</p></div></div></CardContent></Card>
          <Card className="border-[#30363d] bg-[#161b22]"><CardContent className="p-6"><div className="flex items-center gap-3"><div className="flex h-10 w-10 items-center justify-center rounded-md bg-violet-500/10"><Landmark className="h-5 w-5 text-violet-500" /></div><div><p className="text-[13px] text-[#768390]">Cost basis</p><p className="text-[24px] font-bold text-[#e6edf3]">{money(portfolio.summary.costBasis)}</p></div></div></CardContent></Card>
          <Card className="border-[#30363d] bg-[#161b22]"><CardContent className="p-6"><div className="flex items-center gap-3"><div className={`flex h-10 w-10 items-center justify-center rounded-md ${portfolio.summary.unrealizedPl >= 0 ? "bg-emerald-500/10" : "bg-red-500/10"}`}>{portfolio.summary.unrealizedPl >= 0 ? <TrendingUp className="h-5 w-5 text-emerald-500" /> : <TrendingDown className="h-5 w-5 text-red-500" />}</div><div><p className="text-[13px] text-[#768390]">Unrealized P/L</p><p className={`text-[24px] font-bold ${portfolio.summary.unrealizedPl >= 0 ? "text-emerald-400" : "text-red-400"}`}>{money(portfolio.summary.unrealizedPl)}</p><p className="text-[12px] text-[#768390]">{signedPercent(portfolio.summary.unrealizedPlPct)}</p></div></div></CardContent></Card>
          <Card className="border-[#30363d] bg-[#161b22]"><CardContent className="p-6"><div className="flex items-center gap-3"><div className={`flex h-10 w-10 items-center justify-center rounded-md ${portfolio.summary.realizedPl >= 0 ? "bg-amber-500/10" : "bg-red-500/10"}`}>{portfolio.summary.realizedPl >= 0 ? <TrendingUp className="h-5 w-5 text-amber-500" /> : <TrendingDown className="h-5 w-5 text-red-500" />}</div><div><p className="text-[13px] text-[#768390]">Realized P/L</p><p className={`text-[24px] font-bold ${portfolio.summary.realizedPl >= 0 ? "text-amber-400" : "text-red-400"}`}>{money(portfolio.summary.realizedPl)}</p><p className="text-[12px] text-[#768390]">{portfolio.summary.positionsCount} open positions</p></div></div></CardContent></Card>
        </div>

        <Card className="sticky top-0 z-10 border-[#30363d] bg-[#0d1117]/95 backdrop-blur">
          <CardContent className="p-3">
            <div className="flex gap-2 overflow-x-auto pb-1">
              {portfolioPanels.map((panel) => (
                <button
                  key={panel.key}
                  type="button"
                  onClick={() => setActivePanel(panel.key)}
                  title={panel.description}
                  className={activePanel === panel.key ? "whitespace-nowrap rounded-md bg-blue-600 px-4 py-2 text-[13px] font-semibold text-white" : "whitespace-nowrap rounded-md border border-[#30363d] bg-[#161b22] px-4 py-2 text-[13px] text-[#9da7b3] hover:bg-[#1c2128] hover:text-[#e6edf3]"}
                >
                  {panel.label}
                </button>
              ))}
            </div>
            <div className="mt-2 px-1 text-[12px] text-[#768390]">{portfolioPanels.find((panel) => panel.key === activePanel)?.description}</div>
          </CardContent>
        </Card>

        <div className={activePanel === "cash" ? "grid gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(320px,1fr)]" : "hidden"}>
          <Card className="border-[#30363d] bg-[#161b22] xl:col-span-2">
            <CardHeader><CardTitle className="text-[18px] text-[#e6edf3]">Cash management</CardTitle><CardDescription className="text-[13px] text-[#768390]">Deposits, withdrawals, and available cash for this portfolio.</CardDescription></CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
                <div className="rounded-lg border border-[#30363d] bg-[#0d1117] p-4"><p className="text-[12px] text-[#768390]">Cash balance</p><p className="text-[20px] font-bold text-[#e6edf3]">{money(portfolio.summary.cashBalance || 0)}</p></div>
                <div className="rounded-lg border border-[#30363d] bg-[#0d1117] p-4"><p className="text-[12px] text-[#768390]">Total equity</p><p className="text-[20px] font-bold text-[#e6edf3]">{money(portfolio.summary.totalEquity || portfolio.summary.marketValue)}</p></div>
                <div className="rounded-lg border border-[#30363d] bg-[#0d1117] p-4"><p className="text-[12px] text-[#768390]">Deposits</p><p className="text-[20px] font-bold text-emerald-400">{money(portfolio.summary.cashDeposits || 0)}</p></div>
                <div className="rounded-lg border border-[#30363d] bg-[#0d1117] p-4"><p className="text-[12px] text-[#768390]">Withdrawals</p><p className="text-[20px] font-bold text-red-400">{money(portfolio.summary.cashWithdrawals || 0)}</p></div>
              </div>
              <div className="grid gap-3 md:grid-cols-5">
                <Select value={cashForm.movementType} onValueChange={(value: "deposit" | "withdrawal") => setCashForm((prev) => ({ ...prev, movementType: value }))}><SelectTrigger className="border-[#30363d] bg-[#0d1117] text-[#e6edf3]"><SelectValue /></SelectTrigger><SelectContent className="border-[#30363d] bg-[#161b22]"><SelectItem value="deposit">Deposit</SelectItem><SelectItem value="withdrawal">Withdrawal</SelectItem></SelectContent></Select>
                <Input type="number" value={cashForm.amount} onChange={(e) => setCashForm((prev) => ({ ...prev, amount: e.target.value }))} placeholder="Amount" className="border-[#30363d] bg-[#0d1117] text-[#e6edf3]" />
                <Input type="date" value={cashForm.movementDate} onChange={(e) => setCashForm((prev) => ({ ...prev, movementDate: e.target.value }))} className="border-[#30363d] bg-[#0d1117] text-[#e6edf3]" />
                <Input value={cashForm.notes} onChange={(e) => setCashForm((prev) => ({ ...prev, notes: e.target.value }))} placeholder="Note" className="border-[#30363d] bg-[#0d1117] text-[#e6edf3]" />
                <Button onClick={addCashMovement} className="bg-blue-600 text-white hover:bg-blue-700">Add Cash</Button>
              </div>
              <div className="max-h-52 overflow-y-auto rounded-lg border border-[#30363d]">
                {(portfolio.cashMovements || []).length ? (portfolio.cashMovements || []).map((item) => <div key={item.id} className="flex items-center justify-between border-b border-[#30363d] px-4 py-3 text-[13px] last:border-b-0"><div><div className="font-medium text-[#e6edf3] capitalize">{item.movementType}</div><div className="text-[#768390]">{item.movementDate || item.createdAt || "—"} {item.notes ? `· ${item.notes}` : ""}</div></div><div className={item.movementType === "deposit" ? "font-semibold text-emerald-400" : "font-semibold text-red-400"}>{item.movementType === "deposit" ? "+" : "-"}{money(item.amount)}</div></div>) : <div className="px-4 py-6 text-center text-[13px] text-[#768390]">No cash movements yet.</div>}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* The performance tab is now consolidated below */}

        <div className={activePanel === "smart" ? "flex flex-col gap-6" : "hidden"}>
          {/* AI Banner */}
          <div className="flex items-center gap-4 rounded-xl border border-blue-500/30 bg-blue-500/5 p-6">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-blue-600/20 shadow-[0_0_15px_rgba(37,99,235,0.5)]">
              <BrainCircuit className="h-6 w-6 text-blue-400" />
            </div>
            <div>
              <h2 className="text-[20px] font-bold text-[#e6edf3]">TradexaLK AI Intelligence</h2>
              <p className="text-[13px] text-[#768390]">Fully automated monitoring of your broker statements and trades. We analyze risk, cash management, and provide continuous guidance.</p>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <Card className="border-[#30363d] bg-[#161b22]"><CardContent className="p-6"><div className="flex items-center gap-3"><div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-emerald-500/10"><ShieldCheck className="h-5 w-5 text-emerald-400" /></div><div><p className="text-[13px] text-[#768390]">Portfolio health</p><p className="text-[24px] font-bold text-[#e6edf3]">{intelligence.health.score}/100</p><p className="text-[12px] text-[#768390]">{intelligence.health.label} · {intelligence.health.attentionCount} need attention</p></div></div></CardContent></Card>
            <Card className="border-[#30363d] bg-[#161b22]"><CardContent className="p-6"><div className="flex items-center gap-3"><div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-amber-500/10"><Wallet className="h-5 w-5 text-amber-400" /></div><div><p className="text-[13px] text-[#768390]">Cash management</p><p className="text-[24px] font-bold text-[#e6edf3]">{intelligence.cashManagement.cashPct.toFixed(1)}%</p><p className="text-[12px] text-[#768390]">Target {intelligence.cashManagement.targetMinPct.toFixed(0)}–{intelligence.cashManagement.targetMaxPct.toFixed(0)}%</p></div></div></CardContent></Card>
            <Card className="border-[#30363d] bg-[#161b22]"><CardContent className="p-6"><div className="flex items-center gap-3"><div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-violet-500/10"><ShieldAlert className="h-5 w-5 text-violet-400" /></div><div><p className="text-[13px] text-[#768390]">Risk exposure</p><p className="text-[24px] font-bold text-[#e6edf3]">{analytics.risk.score}/100</p><p className="text-[12px] text-[#768390]">{analytics.risk.label} risk level</p></div></div></CardContent></Card>
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            {/* What's Good */}
            <Card className="border-[#30363d] bg-[#161b22]">
              <CardHeader className="border-b border-[#30363d] pb-4">
                <CardTitle className="flex items-center gap-2 text-[18px] text-emerald-400">
                  <CheckCircle2 className="h-5 w-5" />
                  What's Good
                </CardTitle>
                <CardDescription className="text-[13px] text-[#768390]">Strengths and healthy indicators in your current portfolio.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4 pt-4">
                {intelligence.health.score >= 70 && <div className="flex items-start gap-3"><div className="mt-1 h-2 w-2 shrink-0 rounded-full bg-emerald-500" /><div><p className="text-[13px] font-medium text-[#e6edf3]">Strong Overall Health</p><p className="text-[12px] text-[#768390]">Your portfolio score is {intelligence.health.score}, indicating a well-balanced strategy.</p></div></div>}
                {intelligence.cashManagement.label === "healthy_cash" && <div className="flex items-start gap-3"><div className="mt-1 h-2 w-2 shrink-0 rounded-full bg-emerald-500" /><div><p className="text-[13px] font-medium text-[#e6edf3]">Optimal Cash Buffer</p><p className="text-[12px] text-[#768390]">Cash is at {intelligence.cashManagement.cashPct.toFixed(1)}%, providing excellent flexibility for future opportunities.</p></div></div>}
                {analytics.diversification.score >= 60 && <div className="flex items-start gap-3"><div className="mt-1 h-2 w-2 shrink-0 rounded-full bg-emerald-500" /><div><p className="text-[13px] font-medium text-[#e6edf3]">Good Diversification</p><p className="text-[12px] text-[#768390]">Your capital is spread across {analytics.diversification.sectorCount} sectors.</p></div></div>}
                {analytics.benchmark.alphaVsAspiPct > 0 && <div className="flex items-start gap-3"><div className="mt-1 h-2 w-2 shrink-0 rounded-full bg-emerald-500" /><div><p className="text-[13px] font-medium text-[#e6edf3]">Outperforming Market</p><p className="text-[12px] text-[#768390]">Portfolio is generating {signedPercent(analytics.benchmark.alphaVsAspiPct)} alpha compared to ASPI.</p></div></div>}
                {intelligence.holdings.filter((h) => h.status === "suitable").slice(0, 3).map((h) => (
                  <div key={`good-${h.symbol}`} className="flex items-start gap-3"><div className="mt-1 h-2 w-2 shrink-0 rounded-full bg-emerald-500" /><div><p className="text-[13px] font-medium text-[#e6edf3]">{h.symbol} looks solid</p><p className="text-[12px] text-[#768390]">High AI fit score of {h.fitScore}/100 with manageable risk.</p></div></div>
                ))}
                {(!intelligence.holdings.some((h) => h.status === "suitable") && intelligence.health.score < 50 && analytics.diversification.score < 50) && (
                  <p className="text-[13px] text-[#768390]">Import more trades or add funds to see strengths.</p>
                )}
              </CardContent>
            </Card>

            {/* Risk & Attention */}
            <Card className="border-[#30363d] bg-[#161b22]">
              <CardHeader className="border-b border-[#30363d] pb-4">
                <CardTitle className="flex items-center gap-2 text-[18px] text-amber-400">
                  <AlertTriangle className="h-5 w-5" />
                  Risks & Attention Required
                </CardTitle>
                <CardDescription className="text-[13px] text-[#768390]">Areas where the AI detected elevated risk or suboptimal allocations.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4 pt-4">
                {intelligence.cashManagement.label !== "healthy_cash" && (
                  <div className="flex items-start gap-3 rounded-md bg-amber-500/10 p-3"><div className="mt-1 h-2 w-2 shrink-0 rounded-full bg-amber-500" /><div><p className="text-[13px] font-medium text-amber-400">Cash Management Warning</p><p className="text-[12px] text-amber-200/70">{intelligence.cashManagement.reasons[0]}</p></div></div>
                )}
                {intelligence.attentionItems.map((item) => (
                  <div key={`attn-${item.symbol}`} className="flex items-start gap-3 rounded-md border border-[#30363d] p-3">
                    <div className="mt-1 h-2 w-2 shrink-0 rounded-full bg-red-500" />
                    <div className="flex-1 space-y-1">
                      <div className="flex items-center justify-between">
                        <p className="text-[13px] font-medium text-[#e6edf3]">{item.symbol} Risk</p>
                        <Badge variant="outline" className={statusBadgeClass(item.status)}>{item.statusLabel}</Badge>
                      </div>
                      <p className="text-[12px] text-[#768390]">{item.reasons[0]}</p>
                    </div>
                  </div>
                ))}
                {intelligence.attentionItems.length === 0 && intelligence.cashManagement.label === "healthy_cash" && (
                  <p className="text-[13px] text-[#768390]">No immediate risks detected. Your portfolio looks clean.</p>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Overall AI Guidance */}
          <Card className="border border-blue-500/20 bg-[#0d1117]">
            <CardHeader>
              <CardTitle className="text-[18px] text-[#e6edf3]">AI Trader Guidance</CardTitle>
              <CardDescription className="text-[13px] text-[#768390]">Actionable suggestions based on your entire imported trade history.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {intelligence.suggestions.map((suggestion, i) => (
                  <div key={i} className="flex items-center gap-3 rounded-lg border border-[#30363d] bg-[#161b22] p-4 transition-colors hover:bg-[#1c2128]">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-500/10">
                      <Lightbulb className="h-4 w-4 text-blue-400" />
                    </div>
                    <p className="text-[13px] text-[#e6edf3]">{suggestion}</p>
                  </div>
                ))}
                {intelligence.holdings.filter((h) => h.suggestions && h.suggestions.length > 0).slice(0, 3).map((h) => (
                  <div key={`sug-${h.symbol}`} className="flex items-center gap-3 rounded-lg border border-[#30363d] bg-[#161b22] p-4 transition-colors hover:bg-[#1c2128]">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-500/10">
                      <Lightbulb className="h-4 w-4 text-blue-400" />
                    </div>
                    <p className="text-[13px] text-[#e6edf3]"><span className="font-semibold">{h.symbol}:</span> {h.suggestions[0]}</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        <div className={activePanel === "analytics" ? "grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4" : "hidden"}>
          <Card className="border-[#30363d] bg-[#161b22]"><CardContent className="p-6"><div className="flex items-center gap-3"><div className="flex h-10 w-10 items-center justify-center rounded-md bg-cyan-500/10"><PieChart className="h-5 w-5 text-cyan-400" /></div><div><p className="text-[13px] text-[#768390]">Diversification</p><p className="text-[24px] font-bold text-[#e6edf3]">{analytics.diversification.score}/100</p><p className="text-[12px] text-[#768390]">{analytics.diversification.label} · {analytics.diversification.sectorCount} sectors</p></div></div></CardContent></Card>
          <Card className="border-[#30363d] bg-[#161b22]"><CardContent className="p-6"><div className="flex items-center gap-3"><div className="flex h-10 w-10 items-center justify-center rounded-md bg-rose-500/10"><ShieldAlert className="h-5 w-5 text-rose-400" /></div><div><p className="text-[13px] text-[#768390]">Portfolio risk</p><p className="text-[24px] font-bold text-[#e6edf3]">{analytics.risk.score}/100</p><p className="text-[12px] text-[#768390]">{analytics.risk.label} · Vol {analytics.risk.annualizedVolatilityPct.toFixed(1)}%</p></div></div></CardContent></Card>
          <Card className="border-[#30363d] bg-[#161b22]"><CardContent className="p-6"><div className="flex items-center gap-3"><div className="flex h-10 w-10 items-center justify-center rounded-md bg-amber-500/10"><Wallet className="h-5 w-5 text-amber-400" /></div><div><p className="text-[13px] text-[#768390]">Dividend income</p><p className="text-[24px] font-bold text-[#e6edf3]">{money(analytics.dividendSummary.totalIncome)}</p><p className="text-[12px] text-[#768390]">Yield on cost {signedPercent(analytics.dividendSummary.yieldOnCostPct)}</p></div></div></CardContent></Card>
          <Card className="border-[#30363d] bg-[#161b22]"><CardContent className="p-6"><div className="flex items-center gap-3"><div className="flex h-10 w-10 items-center justify-center rounded-md bg-indigo-500/10"><BarChart3 className="h-5 w-5 text-indigo-400" /></div><div><p className="text-[13px] text-[#768390]">Vs ASPI</p><p className={`text-[24px] font-bold ${analytics.benchmark.alphaVsAspiPct >= 0 ? "text-emerald-400" : "text-red-400"}`}>{signedPercent(analytics.benchmark.alphaVsAspiPct)}</p><p className="text-[12px] text-[#768390]">{chartDays >= 365 ? `${chartDays / 365}Y` : `${chartDays}D`} alpha</p></div></div></CardContent></Card>
        </div>

        <div className={activePanel === "analytics" ? "grid gap-6 xl:grid-cols-3" : "hidden"}>
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

        {activePanel === "performance" && (
          <div className="space-y-6">
            {/* Performance by period grid */}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7">
              {periodPerformance.map((row) => (
                <Card key={row.label} className="border-[#30363d] bg-[#161b22] hover:border-blue-500/30 transition-colors">
                  <CardContent className="p-4">
                    <div className="text-[12px] font-medium text-[#768390] mb-1">{row.label}</div>
                    <div className={`text-[18px] font-bold ${row.portfolioReturnPct >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                      {signedPercent(row.portfolioReturnPct)}
                    </div>
                    <div className="mt-3 space-y-1.5 border-t border-[#30363d] pt-2">
                      <div className="flex items-center justify-between text-[10px]">
                        <span className="text-[#768390]">Vs ASPI</span>
                        <span className={row.alphaVsAspiPct >= 0 ? "text-emerald-400" : "text-red-400"}>{signedPercent(row.alphaVsAspiPct)}</span>
                      </div>
                      <div className="flex items-center justify-between text-[10px]">
                        <span className="text-[#768390]">Vs SL20</span>
                        <span className={row.alphaVsSp20Pct >= 0 ? "text-emerald-400" : "text-red-400"}>{signedPercent(row.alphaVsSp20Pct)}</span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
              {periodPerformance.length === 0 && (
                <div className="col-span-full py-4 text-center text-[13px] text-[#768390]">
                  Add positions to calculate period performance metrics.
                </div>
              )}
            </div>

            <div className="grid gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(320px,1fr)]">
              <Card className="border-[#30363d] bg-[#161b22]">
                <CardHeader className="flex flex-col gap-4 border-b border-[#30363d] sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <CardTitle className="text-[18px] text-[#e6edf3]">Portfolio performance</CardTitle>
                    <CardDescription className="text-[13px] text-[#768390]">Total equity and cost basis using trades, cash movements, and stored price history.</CardDescription>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {timeframeOptions.map((option) => (
                      <Button 
                        key={option.label} 
                        variant={chartDays === option.days ? "default" : "outline"} 
                        onClick={() => setChartDays(option.days)} 
                        className={chartDays === option.days ? "bg-blue-600 text-white hover:bg-blue-700" : "border-[#30363d] text-[#768390] hover:bg-[#1c2128] hover:text-[#e6edf3]"}
                      >
                        {option.label}
                      </Button>
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
                            formatter={(value: number, name: string) => [money(Number(value)), name === "totalEquity" ? "Total equity" : name === "marketValue" ? "Market value" : "Cost basis"]}
                            labelFormatter={(_, payload) => payload?.[0]?.payload?.label || ""}
                          />
                          <Area type="monotone" dataKey="totalEquity" stroke="#2563eb" fill="url(#portfolioMarketValue)" strokeWidth={2.5} />
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
            </div>
          </div>
        )}

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

        <Card className={activePanel === "holdings" ? "border-[#30363d] bg-[#161b22]" : "hidden"}>
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
                  <TableHead className="text-[#768390]">Smart Status</TableHead>
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
                    <TableCell>{(() => { const item = intelligence.holdings.find((h) => h.symbol === position.symbol); return item ? <div className="space-y-1"><Badge variant="outline" className={statusBadgeClass(item.status)}>{item.statusLabel}</Badge><div className="text-[11px] text-[#768390]">Fit {item.fitScore}/100 · Risk {item.riskScore}/100</div></div> : <span className="text-[#768390]">—</span>; })()}</TableCell>
                  </TableRow>
                ))}
                {!loading && portfolio.positions.length === 0 && <TableRow><TableCell colSpan={8} className="py-8 text-center text-[#768390]">No holdings yet. Add your first buy transaction to start tracking your portfolio.</TableCell></TableRow>}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card className={activePanel === "events" ? "border-[#30363d] bg-[#161b22]" : "hidden"}>
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

        <Card className={activePanel === "import" ? "border-[#30363d] bg-[#161b22]" : "hidden"}>
          <CardHeader>
            <CardTitle className="text-[18px] text-[#e6edf3]">Broker statement import</CardTitle>
            <CardDescription className="text-[13px] text-[#768390]">Import broker contract notes / statement CSVs or your TradexaLK transaction CSV. We auto-detect common broker statement formats.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
              <div className="space-y-3">
                <Input type="file" accept=".csv,text/csv" onChange={(e) => { const file = e.target.files?.[0] || null; setCsvFile(file); if (file) previewCsvImport(file); else setCsvPreview(null); }} className="border-[#30363d] bg-[#0d1117] text-[#e6edf3]" />
                {importError ? <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-[13px] text-red-300">{importError}</div> : null}
                <div className="text-[12px] text-[#768390]">Supported columns include generic fields like <span className="text-[#e6edf3]">symbol, type, quantity, price, fees, date</span> and broker statement fields like <span className="text-[#e6edf3]">trade date, side, rate, brokerage, contract no</span>.</div>
              </div>
              <div className="rounded-lg border border-[#30363d] bg-[#0d1117] p-4 text-[13px]">
                <div className="mb-2 font-semibold text-[#e6edf3]">Preview</div>
                {csvPreview ? <div className="space-y-2 text-[#768390]"><div className="flex justify-between"><span>Detected broker</span><span className="text-[#e6edf3]">{csvPreview.detected_broker || 'Auto'}</span></div><div className="flex justify-between"><span>Detected format</span><span className="text-[#e6edf3]">{csvPreview.detected_format || 'generic_csv'}</span></div><div className="flex justify-between"><span>Rows</span><span className="text-[#e6edf3]">{csvPreview.rows || 0}</span></div><div className="flex justify-between"><span>Valid rows</span><span className="text-emerald-400">{csvPreview.valid_rows || 0}</span></div><div className="flex justify-between"><span>Invalid rows</span><span className={(csvPreview.invalid_rows || 0) > 0 ? 'text-red-400' : 'text-[#e6edf3]'}>{csvPreview.invalid_rows || 0}</span></div>{(csvPreview.symbols || []).length ? <div><div className="mb-1 text-[#768390]">Symbols</div><div className="text-[#e6edf3]">{csvPreview.symbols.slice(0, 8).join(', ')}{csvPreview.symbols.length > 8 ? '…' : ''}</div></div> : null}</div> : <div className="text-[#768390]">Choose a statement CSV to preview the mapped trades.</div>}
              </div>
            </div>
            <div className="flex gap-3">
              <Button onClick={importCsvTransactions} disabled={!csvFile || importingCsv} className="bg-blue-600 text-white hover:bg-blue-700">{importingCsv ? 'Importing…' : 'Import broker statement'}</Button>
              {csvPreview?.invalid_rows ? <div className="self-center text-[12px] text-red-400">Fix invalid rows before importing.</div> : null}
            </div>
          </CardContent>
        </Card>

        <Card className={activePanel === "events" ? "border-[#30363d] bg-[#161b22]" : "hidden"}>
          <CardHeader>
            <CardTitle className="text-[18px] text-[#e6edf3]">Earnings / dividend / event calendar</CardTitle>
            <CardDescription className="text-[13px] text-[#768390]">Upcoming and recent event markers for symbols currently held in this portfolio.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-6 lg:grid-cols-2">
              <div className="space-y-3">
                <div className="text-[13px] font-semibold uppercase tracking-wide text-emerald-400">Upcoming</div>
                {calendar.upcoming.length ? calendar.upcoming.slice(0, 10).map((item, idx) => <div key={`up-${idx}-${item.date}-${item.symbol}`} className="rounded-lg border border-[#30363d] bg-[#0d1117] p-3"><div className="flex items-center justify-between gap-3"><div><div className="font-medium text-[#e6edf3]">{item.symbol} · {item.title}</div><div className="text-[12px] text-[#768390]">{compactDate(item.date)} · {item.eventType}</div></div><div className="text-[12px] text-emerald-400">{item.daysFromNow === 0 ? 'Today' : `${item.daysFromNow}d`}</div></div></div>) : <div className="text-[13px] text-[#768390]">No upcoming held-stock events stored yet.</div>}
              </div>
              <div className="space-y-3">
                <div className="text-[13px] font-semibold uppercase tracking-wide text-blue-400">Recent</div>
                {calendar.recent.length ? calendar.recent.slice(0, 10).map((item, idx) => <div key={`rc-${idx}-${item.date}-${item.symbol}`} className="rounded-lg border border-[#30363d] bg-[#0d1117] p-3"><div className="font-medium text-[#e6edf3]">{item.symbol} · {item.title}</div><div className="text-[12px] text-[#768390]">{compactDate(item.date)} · {item.eventType} · {item.sourceType}</div></div>) : <div className="text-[13px] text-[#768390]">No recent held-stock events stored yet.</div>}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className={activePanel === "transactions" ? "border-[#30363d] bg-[#161b22]" : "hidden"}>
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

        {/* Journal Panel */}
        <div className={activePanel === "journal" ? "block space-y-4" : "hidden"}>
          <Card className="border-[#30363d] bg-[#161b22]">
            <CardHeader className="border-b border-[#30363d] pb-4">
              <CardTitle className="text-[18px] text-[#e6edf3]">Trading Journal</CardTitle>
              <CardDescription className="text-[13px] text-[#768390]">Keep track of multiple notes, strategies, and market thoughts over time.</CardDescription>
            </CardHeader>
            <CardContent className="pt-4 space-y-6">

              {/* Add Note Section */}
              <div className="space-y-3 rounded-lg border border-[#30363d] bg-[#0d1117] p-4">
                <Textarea
                  value={newNoteText}
                  onChange={(e) => setNewNoteText(e.target.value)}
                  placeholder="What's your strategy? Did you learn anything today?"
                  className="min-h-[100px] border-none bg-transparent focus-visible:ring-0 p-0 text-[#e6edf3] placeholder:text-[#768390] resize-none"
                />
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-t border-[#30363d] pt-3">
                  <div className="flex items-center gap-2">
                    <Clock className="h-4 w-4 text-[#768390]" />
                    <input
                      type="datetime-local"
                      value={reminderTime}
                      onChange={(e) => setReminderTime(e.target.value)}
                      className="bg-transparent text-[13px] text-[#e6edf3] outline-none"
                      style={{ colorScheme: 'dark' }}
                    />
                    {reminderTime && <span className="text-[11px] text-amber-400">Reminder will be set</span>}
                  </div>
                  <Button
                    onClick={handleAddNote}
                    disabled={isSavingJournal || !newNoteText.trim()}
                    className="bg-blue-600 text-white hover:bg-blue-700 h-8"
                  >
                    {isSavingJournal ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : "Add Note"}
                  </Button>
                </div>
              </div>

              {/* Notes List */}
              <div className="space-y-4">
                {notes.length === 0 ? (
                  <div className="py-8 text-center text-[#768390]">No notes yet. Add your first note above.</div>
                ) : (
                  notes.map(note => (
                    <div key={note.id} className="relative rounded-lg border border-[#30363d] bg-[#0d1117]/50 p-4 group">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="absolute top-2 right-2 h-6 w-6 text-[#768390] opacity-0 group-hover:opacity-100 hover:text-red-400 hover:bg-red-500/10 transition-opacity"
                        onClick={() => handleDeleteNote(note.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                      <div className="flex items-center gap-3 mb-2">
                        <span className="text-[12px] font-medium text-[#768390]">{new Date(note.createdAt).toLocaleString()}</span>
                        {note.reminderAt && (() => {
                          const isTriggered = new Date(note.reminderAt).getTime() <= Date.now();
                          return (
                            <Badge variant="outline" className={isTriggered ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400 text-[10px] px-1.5 py-0" : "border-amber-500/30 bg-amber-500/10 text-amber-300 text-[10px] px-1.5 py-0"}>
                              {isTriggered ? <CheckCircle2 className="mr-1 h-3 w-3" /> : <Clock className="mr-1 h-3 w-3" />}
                              {isTriggered ? 'Reminder triggered' : `Reminder: ${new Date(note.reminderAt).toLocaleString()}`}
                            </Badge>
                          );
                        })()}
                      </div>
                      <div className="whitespace-pre-wrap text-[14px] text-[#e6edf3]">
                        {note.text}
                      </div>
                    </div>
                  ))
                )}
              </div>

            </CardContent>
          </Card>
        </div>

      </div>
    </div>
  );
}
