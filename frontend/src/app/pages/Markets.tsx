import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { StockTable } from "../components/financial/StockTable";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../components/ui/tabs";
import { ChartCard } from "../components/financial/ChartCard";
import { Badge } from "../components/ui/badge";
import { marketApi } from "../../lib/api/services";
import type { MarketOverview, Stock } from "../../lib/api/types";

export function Markets() {
  const [stocks, setStocks] = useState<Stock[]>([]);
  const [overview, setOverview] = useState<MarketOverview | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    Promise.all([marketApi.getStocks(300), marketApi.getOverview()])
      .then(([stockRows, marketOverview]) => {
        if (!alive) return;
        setStocks(stockRows);
        setOverview(marketOverview);
      })
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, []);

  const banking = useMemo(() => stocks.filter((s) => s.sector.toLowerCase().includes("bank")), [stocks]);
  const telecom = useMemo(() => stocks.filter((s) => s.sector.toLowerCase().includes("tele")), [stocks]);
  const diversified = useMemo(() => stocks.filter((s) => s.sector.toLowerCase().includes("divers")), [stocks]);

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-slate-100">Markets Overview</h1>
        <p className="text-slate-400 mt-1">Comprehensive view of Colombo Stock Exchange market activity</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ChartCard
          title="ASPI Index"
          data={(overview?.aspi.series || []).map((d) => ({ date: d.date, value: d.value }))}
          description="All Share Price Index"
          type="area"
        />
        <ChartCard
          title="S&P SL20 Index"
          data={(overview?.sp20.series || []).map((d) => ({ date: d.date, value: d.value }))}
          description="S&P Sri Lanka 20 Index"
          type="line"
        />
      </div>

      <Tabs defaultValue="all" className="w-full">
        <TabsList className="bg-slate-900 border border-slate-800">
          <TabsTrigger value="all" className="data-[state=active]:bg-emerald-600">All Stocks</TabsTrigger>
          <TabsTrigger value="banking" className="data-[state=active]:bg-emerald-600">Banking</TabsTrigger>
          <TabsTrigger value="telecom" className="data-[state=active]:bg-emerald-600">Telecommunications</TabsTrigger>
          <TabsTrigger value="diversified" className="data-[state=active]:bg-emerald-600">Diversified</TabsTrigger>
        </TabsList>

        <TabsContent value="all" className="mt-6">
          <Card className="bg-slate-900 border-slate-800">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>All Listed Stocks</CardTitle>
                <Badge variant="secondary" className="bg-slate-800 text-slate-300">{stocks.length} stocks</Badge>
              </div>
            </CardHeader>
            <CardContent>
              <StockTable stocks={stocks} loading={loading} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="banking" className="mt-6">
          <Card className="bg-slate-900 border-slate-800"><CardHeader><CardTitle>Banking Sector</CardTitle></CardHeader><CardContent><StockTable stocks={banking} loading={loading} /></CardContent></Card>
        </TabsContent>
        <TabsContent value="telecom" className="mt-6">
          <Card className="bg-slate-900 border-slate-800"><CardHeader><CardTitle>Telecommunications Sector</CardTitle></CardHeader><CardContent><StockTable stocks={telecom} loading={loading} /></CardContent></Card>
        </TabsContent>
        <TabsContent value="diversified" className="mt-6">
          <Card className="bg-slate-900 border-slate-800"><CardHeader><CardTitle>Diversified Holdings Sector</CardTitle></CardHeader><CardContent><StockTable stocks={diversified} loading={loading} /></CardContent></Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
