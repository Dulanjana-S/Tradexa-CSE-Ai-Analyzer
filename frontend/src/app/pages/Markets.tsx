import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { StockTable } from "../components/financial/StockTable";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../components/ui/tabs";
import { ChartCard } from "../components/financial/ChartCard";
import { Badge } from "../components/ui/badge";
import { marketApi } from "../../lib/api/services";
import { Input } from "../components/ui/input";
import { Search } from "lucide-react";
import { useSearchParams } from "react-router";
import type { MarketOverview, Stock } from "../../lib/api/types";

export function Markets() {
  const [stocks, setStocks] = useState<Stock[]>([]);
  const [overview, setOverview] = useState<MarketOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchParams, setSearchParams] = useSearchParams();
  const searchQuery = searchParams.get("search") || "";

  useEffect(() => {
    let alive = true;
    const fetchData = () => {
      Promise.all([marketApi.getStocks(300), marketApi.getOverview()])
        .then(([stockRows, marketOverview]) => {
          if (!alive) return;
          setStocks(stockRows);
          setOverview(marketOverview);
        })
        .finally(() => alive && setLoading(false));
    };

    fetchData();
    const intervalId = window.setInterval(fetchData, 30000);

    return () => {
      alive = false;
      window.clearInterval(intervalId);
    };
  }, []);

  const filteredStocks = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return stocks;
    return stocks.filter((stock) => [stock.symbol, stock.company, stock.sector].join(" ").toLowerCase().includes(q));
  }, [stocks, searchQuery]);

  const getEffectiveSector = (s: Stock) => {
    const text = [s.symbol, s.name, s.sector].join(" ").toLowerCase();
    return text;
  };

  const banking = useMemo(() => filteredStocks.filter((s) => {
    const text = getEffectiveSector(s);
    return text.includes("bank") || text.includes("finance") || text.includes("leasing");
  }), [filteredStocks]);

  const telecom = useMemo(() => filteredStocks.filter((s) => {
    const text = getEffectiveSector(s);
    return text.includes("tele") || text.includes("dialog") || text.includes("mobitel") || text.includes("slt");
  }), [filteredStocks]);

  const diversified = useMemo(() => filteredStocks.filter((s) => {
    const text = getEffectiveSector(s);
    return text.includes("divers") || text.includes("conglom") || text.includes("holding") || text.includes("invest");
  }), [filteredStocks]);

  const manufacturing = useMemo(() => filteredStocks.filter((s) => {
    const text = getEffectiveSector(s);
    return text.includes("manufac") || text.includes("indust") || text.includes("cable") || text.includes("plastic") || text.includes("print");
  }), [filteredStocks]);

  const insurance = useMemo(() => filteredStocks.filter((s) => {
    const text = getEffectiveSector(s);
    return text.includes("insur");
  }), [filteredStocks]);

  const energy = useMemo(() => filteredStocks.filter((s) => {
    const text = getEffectiveSector(s);
    return text.includes("ener") || text.includes("utili") || text.includes("power") || text.includes("lanka ioc");
  }), [filteredStocks]);

  return (
    <div className="p-6 space-y-6">
      <div className="space-y-4">
        <div>
          <h1 className="text-3xl font-bold text-[var(--color-text-primary)]">Markets Overview</h1>
          <p className="text-[var(--color-text-tertiary)] mt-1">Comprehensive view of Colombo Stock Exchange market activity</p>
        </div>
        <Card className="bg-[var(--color-bg-secondary)] border-[var(--color-border)] shadow-sm">
          <CardContent className="pt-6">
            <div className="relative max-w-xl">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-text-tertiary)]" />
              <Input
                value={searchQuery}
                onChange={(e) => {
                  const next = e.target.value;
                  const params = new URLSearchParams(searchParams);
                  if (next.trim()) params.set("search", next); else params.delete("search");
                  setSearchParams(params, { replace: true });
                }}
                placeholder="Search by symbol, company, or sector..."
                className="pl-9 bg-[var(--color-bg-primary)] border-[var(--color-border)] text-[var(--color-text-primary)]"
              />
            </div>
            {searchQuery && <p className="mt-3 text-sm text-[var(--color-text-tertiary)]">Showing <span className="text-[var(--color-text-primary)] font-medium">{filteredStocks.length}</span> matches for “{searchQuery}”.</p>}
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ChartCard
          title="ASPI Index"
          data={(overview?.aspi.series || []).map((d) => ({ date: d.date, value: d.value }))}
          description="All Share Price Index"
          type="area"
          color="#10b981"
        />
        <ChartCard
          title="S&P SL20 Index"
          data={(overview?.sp20.series || []).map((d) => ({ date: d.date, value: d.value }))}
          description="S&P Sri Lanka 20 Index"
          type="area"
          color="#10b981"
        />
      </div>

      <Tabs defaultValue="all" className="w-full">
        <div className="overflow-x-auto pb-2">
          <TabsList className="bg-[var(--color-bg-primary)] border border-[var(--color-border)] w-fit">
            <TabsTrigger value="all" className="data-[state=active]:bg-emerald-600">All Stocks</TabsTrigger>
            <TabsTrigger value="banking" className="data-[state=active]:bg-blue-600">Banking</TabsTrigger>
            <TabsTrigger value="telecom" className="data-[state=active]:bg-indigo-600">Telecom</TabsTrigger>
            <TabsTrigger value="diversified" className="data-[state=active]:bg-amber-600">Diversified</TabsTrigger>
            <TabsTrigger value="manufacturing" className="data-[state=active]:bg-pink-600">Manufacturing</TabsTrigger>
            <TabsTrigger value="insurance" className="data-[state=active]:bg-orange-600">Insurance</TabsTrigger>
            <TabsTrigger value="energy" className="data-[state=active]:bg-cyan-600">Energy & Utilities</TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="all" className="mt-6">
          <Card className="bg-[var(--color-bg-secondary)] border-[var(--color-border)] shadow-sm">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>{searchQuery ? "Search Results" : "All Listed Stocks"}</CardTitle>
                <Badge variant="secondary" className="bg-[var(--color-bg-secondary)] text-[var(--color-text-secondary)]">{filteredStocks.length} stocks</Badge>
              </div>
            </CardHeader>
            <CardContent>
              <StockTable stocks={filteredStocks} loading={loading} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="banking" className="mt-6">
          <Card className="bg-[var(--color-bg-primary)] border-[var(--color-border)]"><CardHeader><CardTitle>Banking Sector</CardTitle></CardHeader><CardContent><StockTable stocks={banking} loading={loading} /></CardContent></Card>
        </TabsContent>
        <TabsContent value="telecom" className="mt-6">
          <Card className="bg-[var(--color-bg-primary)] border-[var(--color-border)]"><CardHeader><CardTitle>Telecommunications Sector</CardTitle></CardHeader><CardContent><StockTable stocks={telecom} loading={loading} /></CardContent></Card>
        </TabsContent>
        <TabsContent value="diversified" className="mt-6">
          <Card className="bg-[var(--color-bg-primary)] border-[var(--color-border)]"><CardHeader><CardTitle>Diversified & Conglomerates</CardTitle></CardHeader><CardContent><StockTable stocks={diversified} loading={loading} /></CardContent></Card>
        </TabsContent>
        <TabsContent value="manufacturing" className="mt-6">
          <Card className="bg-[var(--color-bg-primary)] border-[var(--color-border)]"><CardHeader><CardTitle>Manufacturing & Industrial</CardTitle></CardHeader><CardContent><StockTable stocks={manufacturing} loading={loading} /></CardContent></Card>
        </TabsContent>
        <TabsContent value="insurance" className="mt-6">
          <Card className="bg-[var(--color-bg-primary)] border-[var(--color-border)]"><CardHeader><CardTitle>Insurance Sector</CardTitle></CardHeader><CardContent><StockTable stocks={insurance} loading={loading} /></CardContent></Card>
        </TabsContent>
        <TabsContent value="energy" className="mt-6">
          <Card className="bg-[var(--color-bg-primary)] border-[var(--color-border)]"><CardHeader><CardTitle>Energy & Utilities Sector</CardTitle></CardHeader><CardContent><StockTable stocks={energy} loading={loading} /></CardContent></Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
