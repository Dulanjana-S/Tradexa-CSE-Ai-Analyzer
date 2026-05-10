import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Input } from "../components/ui/input";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";
import { StockTable, type StockData } from "../components/financial/StockTable";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../components/ui/select";
import { Filter, Download, X, Search, Loader2 } from "lucide-react";
import { Label } from "../components/ui/label";
import { Slider } from "../components/ui/slider";
import { marketApi } from "../../lib/api/services";
import type { Stock } from "../../lib/api/types";

const savedPresets = [
  { name: "High Volume Gainers", sector: "All Sectors", minVolume: 1000000, range: [5, 100] as number[] },
  { name: "Banking Sector", sector: "Banking", minVolume: 0, range: [-100, 100] as number[] },
  { name: "Top Movers", sector: "All Sectors", minVolume: 0, range: [2, 100] as number[] },
];

function mapStock(stock: Stock): StockData {
  let signal: StockData["signal"] = "neutral";
  if (stock.changePercent >= 2) signal = "bullish";
  if (stock.changePercent <= -2) signal = "bearish";
  return {
    symbol: stock.symbol,
    company: stock.company,
    sector: stock.sector,
    lastPrice: stock.lastPrice,
    change: stock.change,
    changePercent: stock.changePercent,
    volume: stock.volume,
    signal,
    confidence: Math.min(0.95, Math.abs(stock.changePercent) / 10 + 0.45),
  };
}

export function Screener() {
  const [allStocks, setAllStocks] = useState<StockData[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedSector, setSelectedSector] = useState("All Sectors");
  const [minVolume, setMinVolume] = useState([0]);
  const [priceChangeRange, setPriceChangeRange] = useState([-100, 100]);
  const [showFilters, setShowFilters] = useState(true);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    marketApi
      .getStocks(500)
      .then((rows) => setAllStocks(rows.map(mapStock)))
      .catch(() => setAllStocks([]))
      .finally(() => setLoading(false));
  }, []);

  const getEffectiveSector = (s: StockData) => {
    const text = [s.symbol, s.company, s.sector].join(" ").toLowerCase();
    if (text.includes("bank") || text.includes("finance") || text.includes("leasing")) return "Banking";
    if (text.includes("tele") || text.includes("dialog") || text.includes("mobitel") || text.includes("slt")) return "Telecom";
    if (text.includes("divers") || text.includes("conglom") || text.includes("holding") || text.includes("invest")) return "Diversified";
    if (text.includes("manufac") || text.includes("indust") || text.includes("cable") || text.includes("plastic") || text.includes("print")) return "Manufacturing";
    if (text.includes("insur")) return "Insurance";
    if (text.includes("ener") || text.includes("utili") || text.includes("power") || text.includes("lanka ioc")) return "Energy";
    return s.sector || "Other";
  };

  const sectors = useMemo(() => {
    return ["All Sectors", "Banking", "Telecom", "Diversified", "Manufacturing", "Insurance", "Energy", "Other"];
  }, []);

  const filteredStocks = useMemo(() => {
    return allStocks.filter((stock) => {
      const q = searchQuery.toLowerCase();
      if (q && !stock.symbol.toLowerCase().includes(q) && !stock.company.toLowerCase().includes(q)) return false;
      
      const effectiveSector = getEffectiveSector(stock);
      if (selectedSector !== "All Sectors" && effectiveSector !== selectedSector) return false;
      
      if ((stock.volume || 0) < minVolume[0]) return false;
      if (stock.changePercent < priceChangeRange[0] || stock.changePercent > priceChangeRange[1]) return false;
      
      return true;
    });
  }, [allStocks, minVolume, priceChangeRange, searchQuery, selectedSector]);

  const exportCsv = () => {
    const rows = [
      ["Symbol", "Company", "Sector", "Last Price", "Change", "Change %", "Volume"],
      ...filteredStocks.map((stock) => [
        stock.symbol,
        stock.company,
        stock.sector || "",
        stock.lastPrice,
        stock.change,
        stock.changePercent,
        stock.volume || 0,
      ]),
    ];
    const csv = rows.map((row) => row.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "screener-results.csv";
    link.click();
    URL.revokeObjectURL(url);
  };

  const applyPreset = (preset: typeof savedPresets[number]) => {
    setSelectedSector(preset.sector);
    setMinVolume([preset.minVolume]);
    setPriceChangeRange([...preset.range]);
  };

  const resetFilters = () => {
    setSearchQuery("");
    setSelectedSector("All Sectors");
    setMinVolume([0]);
    setPriceChangeRange([-20, 20]);
  };

  return (
    <div className="min-h-screen bg-[var(--color-bg-primary)] p-4 sm:p-6 lg:p-8">
      <div className="max-w-[1600px] mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-50">Stock Screener</h1>
            <p className="text-sm text-slate-500">Filter market data by technical criteria</p>
          </div>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={exportCsv} className="text-[var(--color-text-tertiary)] hover:text-white h-9">
              <Download className="h-4 w-4 mr-2" /> Export
            </Button>
          </div>
        </div>

        {/* Presets Row */}
        <div className="flex flex-wrap gap-2">
          <span className="text-xs font-semibold text-slate-600 uppercase tracking-wider self-center mr-2">Presets:</span>
          {savedPresets.map((preset, idx) => (
            <Button
              key={idx}
              variant="ghost"
              size="sm"
              onClick={() => applyPreset(preset)}
              className="h-8 px-3 rounded-full bg-[var(--color-bg-tertiary)] text-[var(--color-text-tertiary)] hover:text-emerald-400 border border-[var(--color-border)] text-[11px] font-medium"
            >
              {preset.name}
            </Button>
          ))}
        </div>

        {/* Simplified Filter Bar */}
        <Card className="bg-[var(--color-bg-secondary)] border-[var(--color-border)] shadow-sm">
          <CardContent className="p-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
              {/* Search */}
              <div className="space-y-2">
                <Label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Search</Label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-600" />
                  <Input
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Symbol or name..."
                    className="h-9 bg-[var(--color-bg-primary)] border-[var(--color-border)] text-[var(--color-text-primary)] pl-9 text-sm"
                  />
                </div>
              </div>

              {/* Sector */}
              <div className="space-y-2">
                <Label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Sector</Label>
                <Select value={selectedSector} onValueChange={setSelectedSector}>
                  <SelectTrigger className="h-9 bg-[var(--color-bg-primary)] border-[var(--color-border)] text-[var(--color-text-primary)] text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-[var(--color-bg-secondary)] border-[var(--color-border)] text-[var(--color-text-primary)]">
                    {sectors.map((sector) => (
                      <SelectItem key={sector} value={sector}>{sector}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Min Volume */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <Label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Min Volume</Label>
                  <span className="text-[10px] font-mono text-emerald-500">{minVolume[0].toLocaleString()}</span>
                </div>
                <Slider value={minVolume} onValueChange={setMinVolume} max={5000000} step={10000} />
              </div>

              {/* Change % */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <Label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Change %</Label>
                  <span className="text-[10px] font-mono text-[var(--color-text-secondary)]">{priceChangeRange[0]}% to {priceChangeRange[1]}%</span>
                </div>
                <Slider value={priceChangeRange} onValueChange={setPriceChangeRange} min={-20} max={20} step={0.1} />
              </div>
            </div>

            <div className="flex items-center justify-between mt-8 pt-6 border-t border-[var(--color-border)]">
              <div className="flex items-center gap-4">
                <Badge variant="secondary" className="bg-emerald-500/10 text-emerald-500 border-none px-3 py-1">
                  {filteredStocks.length} Results
                </Badge>
                <Button variant="link" onClick={resetFilters} className="text-slate-500 hover:text-[var(--color-text-secondary)] h-auto p-0 text-xs">
                  Reset all filters
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Results Table */}
        <Card className="bg-[var(--color-bg-secondary)] border-[var(--color-border)] shadow-sm">
          <CardContent className="p-0">
            {loading ? (
              <div className="flex items-center justify-center py-20 text-slate-500 gap-2">
                <Loader2 className="h-5 w-5 animate-spin" />
                <span className="text-sm">Scanning market...</span>
              </div>
            ) : (
              <StockTable stocks={filteredStocks} />
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
