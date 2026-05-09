import { useEffect, useState } from "react";
import { MetricCard } from "../components/financial/MetricCard";
import { StockTable } from "../components/financial/StockTable";
import { IndexChart } from "../components/financial/IndexChart";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { TrendingUp, TrendingDown, Activity, DollarSign, BarChart3 } from "lucide-react";
import { Badge } from "../components/ui/badge";
import { dashboardApi } from "../../lib/api/services";
import type { MarketOverview, Watchlist } from "../../lib/api/types";

const emptyOverview: MarketOverview = {
  marketStatus: "closed",
  lastUpdated: new Date().toISOString(),
  turnover: 0,
  trades: 0,
  marketCap: 0,
  aspi: { value: 0, change: 0, changePercent: 0, series: [] },
  sp20: { value: 0, change: 0, changePercent: 0, series: [] },
  topGainers: [],
  topLosers: [],
  mostActive: [],
};

export function Dashboard() {
  const [overview, setOverview] = useState<MarketOverview>(emptyOverview);
  const [watchlist, setWatchlist] = useState<Watchlist>({ symbols: [], items: [] });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    const fetchData = () => {
      dashboardApi
        .getData()
        .then((data) => {
          if (!alive) return;
          setOverview(data.overview);
          setWatchlist(data.watchlist);
        })
        .finally(() => {
          if (alive) setLoading(false);
        });
    };

    fetchData();
    const intervalId = window.setInterval(fetchData, 30000);

    return () => {
      alive = false;
      window.clearInterval(intervalId);
    };
  }, []);

  return (
    <div className="min-h-screen bg-[var(--background)]">
      <div className="mx-auto max-w-[1680px] px-6 py-8 lg:px-8">
        <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-1.5">
            <h1 className="text-[24px] sm:text-[32px] font-bold leading-tight tracking-tight text-[var(--color-text-primary)]">
              Market Overview
            </h1>
            <p className="text-[13px] text-[var(--color-text-secondary)]">
              Last updated: {new Date(overview.lastUpdated).toLocaleString("en-LK", { dateStyle: "medium", timeStyle: "short" })}
            </p>
          </div>
          <div className="flex items-center gap-2.5 rounded-full border border-[#bf953f]/30 bg-[#bf953f]/5 px-4 py-1.5 backdrop-blur-md transition-all hover:border-[#bf953f]/60 hover:bg-[#bf953f]/10 shadow-[0_0_15px_-5px_rgba(191,149,63,0.2)]">
            <div className="h-1.5 w-1.5 rounded-full bg-[#bf953f] animate-pulse shadow-[0_0_10px_#bf953f]" />
            <span className="text-[9px] sm:text-[10px] font-bold uppercase tracking-[0.25em] text-[#bf953f]">
              Trade With Confidence
            </span>
          </div>
        </div>

        <div className="mb-8 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-5">
          <MetricCard
            title="ASPI Index"
            value={overview.aspi.value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            change={overview.aspi.change}
            changePercent={overview.aspi.changePercent}
            trend={overview.aspi.changePercent > 0 ? "up" : overview.aspi.changePercent < 0 ? "down" : "neutral"}
            icon={<TrendingUp className="h-4 w-4" />}
            loading={loading}
            center
          />
          <MetricCard
            title="S&P SL20"
            value={overview.sp20.value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            change={overview.sp20.change}
            changePercent={overview.sp20.changePercent}
            trend={overview.sp20.changePercent > 0 ? "up" : overview.sp20.changePercent < 0 ? "down" : "neutral"}
            icon={<TrendingDown className="h-4 w-4" />}
            loading={loading}
            center
          />
          <MetricCard
            title="Turnover"
            value={`Rs. ${(overview.turnover / 1e9).toFixed(2)}B`}
            subtitle="Today"
            icon={<DollarSign className="h-4 w-4" />}
            loading={loading}
            center
          />
          <MetricCard
            title="Trades"
            value={overview.trades.toLocaleString()}
            subtitle="Today"
            icon={<Activity className="h-4 w-4" />}
            loading={loading}
            center
          />
          <MetricCard
            title="Market Cap"
            value={`Rs. ${(overview.marketCap / 1e12).toFixed(2)}T`}
            subtitle="Total"
            icon={<BarChart3 className="h-4 w-4" />}
            loading={loading}
            center
            className="col-span-2 sm:col-span-1 lg:col-span-1"
          />
        </div>

        <div className="mb-8 grid grid-cols-1 gap-6 lg:grid-cols-2">
          <IndexChart
            title="ASPI Index"
            symbol="ASPI"
            currentValue={overview.aspi.value}
            change={overview.aspi.change}
            changePercent={overview.aspi.changePercent}
            data={overview.aspi.series}
          />
          <IndexChart
            title="S&P SL20 Index"
            symbol="S&P SL20"
            currentValue={overview.sp20.value}
            change={overview.sp20.change}
            changePercent={overview.sp20.changePercent}
            data={overview.sp20.series}
          />
        </div>

        <div className="mb-8">
          <h2 className="mb-4 text-[15px] font-semibold tracking-tight text-[var(--color-text-primary)]">
            Market Movers
          </h2>
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            <Card className="overflow-hidden border-[var(--color-border)] bg-[var(--color-bg-secondary)] shadow-none">
              <CardHeader className="border-b border-[var(--border-subtle)] px-5 py-4">
                <CardTitle className="flex items-center gap-2.5 text-[13px] font-semibold tracking-tight text-[var(--color-text-primary)]">
                  <div className="h-1 w-1 rounded-full bg-emerald-500" />
                  Top Gainers
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <StockTable stocks={overview.topGainers} compact loading={loading} />
              </CardContent>
            </Card>

            <Card className="overflow-hidden border-[var(--color-border)] bg-[var(--color-bg-secondary)] shadow-none">
              <CardHeader className="border-b border-[var(--border-subtle)] px-5 py-4">
                <CardTitle className="flex items-center gap-2.5 text-[13px] font-semibold tracking-tight text-[var(--color-text-primary)]">
                  <div className="h-1 w-1 rounded-full bg-red-500" />
                  Top Losers
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <StockTable stocks={overview.topLosers} compact loading={loading} />
              </CardContent>
            </Card>

            <Card className="overflow-hidden border-[var(--color-border)] bg-[var(--color-bg-secondary)] shadow-none">
              <CardHeader className="border-b border-[var(--border-subtle)] px-5 py-4">
                <CardTitle className="flex items-center gap-2.5 text-[13px] font-semibold tracking-tight text-[var(--color-text-primary)]">
                  <div className="h-1 w-1 rounded-full bg-blue-500" />
                  Most Active
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <StockTable stocks={overview.mostActive} compact loading={loading} />
              </CardContent>
            </Card>
          </div>
        </div>

        <div>
          <h2 className="mb-4 text-[15px] font-semibold tracking-tight text-[var(--color-text-primary)]">
            Your Watchlist
          </h2>
          <Card className="border-[var(--color-border)] bg-[var(--color-bg-secondary)] shadow-none">
            <CardHeader className="border-b border-[var(--border-subtle)] px-5 py-4">
              <div className="flex items-center justify-between">
                <CardTitle className="text-[13px] font-semibold tracking-tight text-[var(--color-text-primary)]">
                  Monitored Securities
                </CardTitle>
                <Badge
                  variant="secondary"
                  className="bg-[var(--color-bg-tertiary)] text-[var(--color-text-secondary)] text-[11px] font-semibold"
                >
                  {watchlist.items.length} stocks
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <StockTable stocks={watchlist.items} loading={loading} />
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
