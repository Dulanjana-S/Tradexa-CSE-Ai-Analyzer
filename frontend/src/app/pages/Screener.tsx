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
import { Filter, Download, Save, X, Search, Loader2 } from "lucide-react";
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

  const sectors = useMemo(() => {
    const values = Array.from(new Set(allStocks.map((stock) => stock.sector).filter(Boolean)));
    return ["All Sectors", ...values.sort()];
  }, [allStocks]);

  const filteredStocks = useMemo(() => {
    return allStocks.filter((stock) => {
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        if (!stock.symbol.toLowerCase().includes(q) && !stock.company.toLowerCase().includes(q)) {
          return false;
        }
      }
      if (selectedSector !== "All Sectors" && stock.sector !== selectedSector) return false;
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

  return (
    <div className="min-h-screen bg-[#0a0e14] p-4 sm:p-6 lg:p-8">
      <div className="max-w-[1600px] mx-auto space-y-6 sm:space-y-8">
        <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
          <div className="space-y-1">
            <h1 className="text-2xl sm:text-3xl font-bold text-slate-50 tracking-tight">Stock Screener</h1>
            <p className="text-xs sm:text-sm text-slate-500">
              Filter and analyze stocks based on technical and fundamental criteria
            </p>
          </div>
          <div className="flex items-center gap-2 sm:gap-3">
            <Button
              variant="outline"
              className="border-[#1e2938] text-slate-300 hover:bg-[#1e2938] hover:text-slate-100 h-9"
            >
              <Save className="h-4 w-4 sm:mr-2" />
              <span className="hidden sm:inline">Save Filter</span>
            </Button>
            <Button
              variant="outline"
              className="border-[#1e2938] text-slate-300 hover:bg-[#1e2938] hover:text-slate-100 h-9"
              onClick={exportCsv}
            >
              <Download className="h-4 w-4 sm:mr-2" />
              <span className="hidden sm:inline">Export CSV</span>
            </Button>
          </div>
        </div>

        <Card className="bg-[#111823] border-[#1e2938] shadow-sm">
          <CardHeader className="pb-4">
            <CardTitle className="text-sm sm:text-base">Saved Filter Presets</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {savedPresets.map((preset, idx) => (
                <Button
                  key={idx}
                  variant="outline"
                  size="sm"
                  onClick={() => applyPreset(preset)}
                  className="border-[#1e2938] text-slate-300 hover:bg-[#1e2938] hover:text-slate-100 h-auto py-2 px-3 flex-col sm:flex-row items-start sm:items-center gap-1.5"
                >
                  <span className="text-xs sm:text-sm font-semibold">{preset.name}</span>
                  <Badge variant="secondary" className="bg-[#1e2938] text-slate-400 text-xs sm:ml-2">
                    {preset.sector === "All Sectors" ? `Volume > ${preset.minVolume.toLocaleString()}` : `Sector: ${preset.sector}`}
                  </Badge>
                </Button>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card className="bg-[#111823] border-[#1e2938] shadow-sm">
          <CardHeader className="pb-4 border-b border-[#1e2938]">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-1 h-5 bg-emerald-500 rounded-full" />
                <CardTitle className="text-sm sm:text-base">Filters</CardTitle>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowFilters(!showFilters)}
                className="text-slate-400 hover:text-slate-100 hover:bg-[#1e2938] h-8"
              >
                {showFilters ? <X className="h-4 w-4" /> : <Filter className="h-4 w-4" />}
              </Button>
            </div>
          </CardHeader>
          {showFilters && (
            <CardContent className="space-y-6 pt-6">
              <div className="grid gap-6 lg:grid-cols-4">
                <div className="space-y-2">
                  <Label className="text-slate-300">Search</Label>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                    <Input
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Symbol or company"
                      className="h-10 bg-[#0a0e14] border-[#1e2938] text-slate-200 pl-10"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label className="text-slate-300">Sector</Label>
                  <Select value={selectedSector} onValueChange={setSelectedSector}>
                    <SelectTrigger className="h-10 bg-[#0a0e14] border-[#1e2938] text-slate-200">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-[#111823] border-[#1e2938]">
                      {sectors.map((sector) => (
                        <SelectItem key={sector} value={sector} className="text-slate-200 focus:bg-[#1e2938] focus:text-slate-100">
                          {sector}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Label className="text-slate-300">Min Volume</Label>
                    <span className="text-xs text-slate-400">{minVolume[0].toLocaleString()}</span>
                  </div>
                  <Slider value={minVolume} onValueChange={setMinVolume} max={5000000} step={50000} />
                </div>

                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Label className="text-slate-300">Change % Range</Label>
                    <span className="text-xs text-slate-400">
                      {priceChangeRange[0]}% to {priceChangeRange[1]}%
                    </span>
                  </div>
                  <Slider value={priceChangeRange} onValueChange={setPriceChangeRange} min={-20} max={20} step={0.5} />
                </div>
              </div>

              <div className="flex flex-wrap gap-3">
                <Button
                  variant="outline"
                  className="border-[#1e2938] text-slate-300 hover:bg-[#1e2938] hover:text-slate-100"
                  onClick={() => {
                    setSearchQuery("");
                    setSelectedSector("All Sectors");
                    setMinVolume([0]);
                    setPriceChangeRange([-100, 100]);
                  }}
                >
                  Reset Filters
                </Button>
                <Badge variant="secondary" className="bg-[#1e2938] text-slate-300">
                  {filteredStocks.length} results
                </Badge>
              </div>
            </CardContent>
          )}
        </Card>

        <Card className="bg-[#111823] border-[#1e2938] shadow-sm">
          <CardHeader className="border-b border-[#1e2938]">
            <CardTitle className="text-sm sm:text-base">Screening Results</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            {loading ? (
              <div className="flex items-center justify-center py-16 text-slate-400">
                <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading stocks...
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
