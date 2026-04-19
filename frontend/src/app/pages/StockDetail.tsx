import { useEffect, useMemo, useState } from "react";
import { useParams, Link } from "react-router";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../components/ui/card";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../components/ui/tabs";
import { PredictionCard } from "../components/financial/PredictionCard";
import { ProfessionalChart } from "../components/financial/ProfessionalChart";
import { TrendingUp, TrendingDown, Star, ArrowLeft, ExternalLink } from "lucide-react";
import { cn } from "../components/ui/utils";
import { announcementsApi, marketApi, watchlistApi } from "../../lib/api/services";
import type { Announcement, HistoricalDataPoint, PredictionCardData, Stock } from "../../lib/api/types";

const emptyStock: Stock = { symbol: "", name: "", company: "", sector: "", lastPrice: 0, change: 0, changePercent: 0, volume: 0 };
const emptyPrediction: PredictionCardData = { predictedPrice: 0, currentPrice: 0, predictedReturn: 0, upProbability: 0.5, signal: "neutral", confidence: 0, expectedRange: { low: 0, high: 0 }, topFeatures: [], lastUpdated: "—", error: "Prediction unavailable" };

export function StockDetail() {
  const { symbol = "" } = useParams<{ symbol: string }>();
  const [stock, setStock] = useState<Stock>(emptyStock);
  const [history, setHistory] = useState<HistoricalDataPoint[]>([]);
  const [prediction, setPrediction] = useState<PredictionCardData>(emptyPrediction);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [watching, setWatching] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      const stockData = await marketApi.getStock(symbol);
      const [historyData, predictionData, announcementData] = await Promise.all([
        marketApi.getStockHistory(symbol, 180),
        marketApi.getStockPrediction(symbol, stockData.lastPrice),
        announcementsApi.getAll({ symbol, limit: 20 }),
      ]);
      if (!alive) return;
      setStock(stockData);
      setHistory(historyData);
      setPrediction(predictionData);
      setAnnouncements(announcementData);
      try {
        const watchlist = await watchlistApi.get();
        if (!alive) return;
        setWatching(watchlist.symbols.includes(symbol));
      } catch {}
    })();
    return () => {
      alive = false;
    };
  }, [symbol]);

  const toggleWatchlist = async () => {
    const updated = watching ? await watchlistApi.remove(symbol) : await watchlistApi.add(symbol);
    setWatching(updated.symbols.includes(symbol));
  };

  const technicals = useMemo(() => {
    const closes = history.map((h) => h.close).filter((v) => Number.isFinite(v));
    const sma = (period: number) => {
      if (closes.length < period) return 0;
      const slice = closes.slice(-period);
      return slice.reduce((sum, value) => sum + value, 0) / slice.length;
    };
    const high = history.length ? Math.max(...history.map((h) => h.high)) : 0;
    const low = history.length ? Math.min(...history.map((h) => h.low)) : 0;
    return { sma20: sma(20), sma50: sma(50), rangeLow: low, rangeHigh: high };
  }, [history]);

  return (
    <div className="p-6 space-y-6">
      <Link to="/"><Button variant="ghost" size="sm" className="text-slate-400 hover:text-slate-100"><ArrowLeft className="h-4 w-4 mr-2" />Back to Dashboard</Button></Link>

      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <div className="flex items-center gap-3 mb-2"><h1 className="text-3xl font-bold text-slate-100">{stock.symbol}</h1><Badge variant="outline" className="text-slate-300 border-slate-700">{stock.sector}</Badge></div>
          <p className="text-lg text-slate-400">{stock.company}</p>
          <p className="text-sm text-slate-500 mt-1">Market Cap: Rs. {((stock.marketCap || 0) / 1e9).toFixed(2)}B</p>
        </div>
        <div className="flex items-center gap-3"><Button variant="outline" className="border-slate-700 text-slate-300 hover:bg-slate-800" onClick={toggleWatchlist}><Star className="h-4 w-4 mr-2" />{watching ? "Remove from Watchlist" : "Add to Watchlist"}</Button></div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-6 gap-4">
        <Card className="col-span-2 bg-slate-900 border-slate-800"><CardHeader className="pb-3"><CardTitle className="text-sm font-medium text-slate-400">Last Traded Price</CardTitle></CardHeader><CardContent><div className="flex items-baseline gap-3"><span className="text-4xl font-bold text-slate-100">Rs. {stock.lastPrice.toFixed(2)}</span><div className="flex items-center gap-1">{stock.changePercent > 0 ? <TrendingUp className="h-5 w-5 text-emerald-500" /> : <TrendingDown className="h-5 w-5 text-red-500" />}<span className={cn("text-lg font-semibold", stock.changePercent > 0 ? "text-emerald-500" : "text-red-500")}>{stock.change > 0 ? "+" : ""}{stock.change.toFixed(2)} ({stock.changePercent > 0 ? "+" : ""}{stock.changePercent.toFixed(2)}%)</span></div></div><p className="text-xs text-slate-500 mt-2">As of {stock.asOf ? new Date(stock.asOf).toLocaleString("en-LK") : "—"}</p></CardContent></Card>
        <Card className="bg-slate-900 border-slate-800"><CardHeader className="pb-3"><CardTitle className="text-sm font-medium text-slate-400">Open</CardTitle></CardHeader><CardContent><div className="text-xl font-semibold text-slate-100">{(stock.open || 0).toFixed(2)}</div></CardContent></Card>
        <Card className="bg-slate-900 border-slate-800"><CardHeader className="pb-3"><CardTitle className="text-sm font-medium text-slate-400">High</CardTitle></CardHeader><CardContent><div className="text-xl font-semibold text-emerald-500">{(stock.high || 0).toFixed(2)}</div></CardContent></Card>
        <Card className="bg-slate-900 border-slate-800"><CardHeader className="pb-3"><CardTitle className="text-sm font-medium text-slate-400">Low</CardTitle></CardHeader><CardContent><div className="text-xl font-semibold text-red-500">{(stock.low || 0).toFixed(2)}</div></CardContent></Card>
        <Card className="bg-slate-900 border-slate-800"><CardHeader className="pb-3"><CardTitle className="text-sm font-medium text-slate-400">Volume</CardTitle></CardHeader><CardContent><div className="text-xl font-semibold text-slate-100 font-mono">{stock.volume.toLocaleString()}</div></CardContent></Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6"><div className="lg:col-span-2"><ProfessionalChart symbol={stock.symbol} companyName={stock.company} data={history} /></div><div><PredictionCard {...prediction} /></div></div>

      <Tabs defaultValue="overview" className="w-full">
        <TabsList className="bg-slate-900 border border-slate-800"><TabsTrigger value="overview" className="data-[state=active]:bg-emerald-600">Overview</TabsTrigger><TabsTrigger value="technicals" className="data-[state=active]:bg-emerald-600">Technicals</TabsTrigger><TabsTrigger value="predictions" className="data-[state=active]:bg-emerald-600">Predictions</TabsTrigger><TabsTrigger value="announcements" className="data-[state=active]:bg-emerald-600">Announcements</TabsTrigger></TabsList>
        <TabsContent value="overview" className="mt-6"><Card className="bg-slate-900 border-slate-800"><CardHeader><CardTitle>Company Overview</CardTitle></CardHeader><CardContent className="space-y-4"><div className="grid grid-cols-2 md:grid-cols-4 gap-4"><div><div className="text-sm text-slate-400">Previous Close</div><div className="text-lg font-semibold text-slate-100">Rs. {(stock.previousClose || 0).toFixed(2)}</div></div><div><div className="text-sm text-slate-400">VWAP</div><div className="text-lg font-semibold text-slate-100">Rs. {(stock.vwap || 0).toFixed(2)}</div></div><div><div className="text-sm text-slate-400">Volume</div><div className="text-lg font-semibold text-slate-100 font-mono">{stock.volume.toLocaleString()}</div></div><div><div className="text-sm text-slate-400">Sector</div><div className="text-lg font-semibold text-slate-100">{stock.sector}</div></div></div></CardContent></Card></TabsContent>
        <TabsContent value="technicals" className="mt-6"><Card className="bg-slate-900 border-slate-800"><CardHeader><CardTitle>Technical Indicators</CardTitle><CardDescription>Key technical analysis metrics</CardDescription></CardHeader><CardContent><div className="grid grid-cols-1 md:grid-cols-2 gap-6"><div className="space-y-3"><div className="flex justify-between"><span className="text-slate-400">SMA (20)</span><span className="text-slate-100 font-medium">{technicals.sma20.toFixed(2)}</span></div><div className="flex justify-between"><span className="text-slate-400">SMA (50)</span><span className="text-slate-100 font-medium">{technicals.sma50.toFixed(2)}</span></div></div><div className="space-y-3"><div className="flex justify-between"><span className="text-slate-400">Range Low</span><span className="text-slate-100 font-medium">{technicals.rangeLow.toFixed(2)}</span></div><div className="flex justify-between"><span className="text-slate-400">Range High</span><span className="text-slate-100 font-medium">{technicals.rangeHigh.toFixed(2)}</span></div></div></div></CardContent></Card></TabsContent>
        <TabsContent value="predictions" className="mt-6"><div className="grid grid-cols-1 lg:grid-cols-2 gap-6"><PredictionCard {...prediction} /><Card className="bg-slate-900 border-slate-800"><CardHeader><CardTitle>Prediction Summary</CardTitle><CardDescription>Latest model output for the next trading day</CardDescription></CardHeader><CardContent><div className="space-y-3"><div className="flex justify-between"><span className="text-slate-400">Signal</span><Badge className="bg-emerald-600">{prediction.signal.toUpperCase()}</Badge></div><div className="flex justify-between"><span className="text-slate-400">Expected range</span><span className="text-slate-100">Rs. {prediction.expectedRange.low.toFixed(2)} - Rs. {prediction.expectedRange.high.toFixed(2)}</span></div><div className="flex justify-between"><span className="text-slate-400">Confidence</span><span className="text-slate-100">{(prediction.confidence * 100).toFixed(0)}%</span></div></div></CardContent></Card></div></TabsContent>
        <TabsContent value="announcements" className="mt-6"><Card className="bg-slate-900 border-slate-800"><CardHeader><CardTitle>Recent Announcements</CardTitle><CardDescription>Latest company disclosures and updates</CardDescription></CardHeader><CardContent><div className="space-y-4">{announcements.map((announcement) => <div key={announcement.id} className="p-4 rounded-lg bg-slate-800 border border-slate-700 hover:border-slate-600 transition-colors"><div className="flex items-start justify-between gap-4"><div className="flex-1"><h4 className="font-medium text-slate-100 mb-1">{announcement.title}</h4><div className="flex items-center gap-2 mt-2"><Badge variant="outline" className="text-slate-400 border-slate-600">{announcement.category}</Badge><span className="text-sm text-slate-500">{new Date(announcement.date).toLocaleDateString("en-LK")}</span></div></div><Button variant="ghost" size="sm" className="text-emerald-500" asChild>{announcement.url ? <a href={announcement.url} target="_blank" rel="noreferrer"><ExternalLink className="h-4 w-4" /></a> : <span><ExternalLink className="h-4 w-4" /></span>}</Button></div></div>)}</div></CardContent></Card></TabsContent>
      </Tabs>
    </div>
  );
}
