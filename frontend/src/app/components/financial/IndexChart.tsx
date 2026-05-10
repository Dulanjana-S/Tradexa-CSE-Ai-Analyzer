import { useEffect, useMemo, useRef, useState } from 'react';
import { createChart, LineSeries, type IChartApi, type LineData } from 'lightweight-charts';
import { Card, CardHeader } from '../ui/card';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { TrendingUp, TrendingDown, RefreshCw, Maximize2, Activity } from 'lucide-react';
import { useTheme } from '../../contexts/ThemeContext';

interface IndexChartProps {
  title: string;
  symbol: string;
  currentValue: number;
  change: number;
  changePercent: number;
  color?: string;
  height?: number;
  data?: Array<{ date: string; value: number }>;
}

function createFallbackSeries(currentValue: number, change: number) {
  const today = new Date();
  const base = Math.max(1, currentValue - change * 20);
  return Array.from({ length: 60 }).map((_, index) => {
    const date = new Date(today);
    date.setDate(today.getDate() - (59 - index));
    return {
      date: date.toISOString().split('T')[0],
      value: base + (currentValue - base) * (index / 59),
    };
  });
}

export function IndexChart({
  title,
  symbol,
  currentValue,
  change,
  changePercent,
  color = '#10b981',
  height = 320,
  data,
}: IndexChartProps) {
  const { theme } = useTheme();
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const lineSeriesRef = useRef<any>(null);
  const [timeframe, setTimeframe] = useState('ALL');
  const isPositive = change >= 0;
  const series = useMemo<LineData[]>(() => {
    const rows = (data && data.length > 0 ? data : createFallbackSeries(currentValue, change)).map((item) => ({
      time: item.date,
      value: item.value,
    }));
    return rows;
  }, [change, currentValue, data]);

  useEffect(() => {
    if (!chartRef.current || series.length === 0) return;
    const timeScale = chartRef.current.timeScale();

    if (timeframe === 'ALL') {
      timeScale.fitContent();
      return;
    }

    let rangeInBars = 120;
    switch (timeframe) {
      case '1M': rangeInBars = 120; break;
      case '3M': rangeInBars = 250; break;
      case '6M': rangeInBars = 400; break;
      case '1Y': rangeInBars = 600; break;
      default: rangeInBars = 120;
    }

    const lastIndex = series.length - 1;
    timeScale.setVisibleLogicalRange({
      from: lastIndex - rangeInBars,
      to: lastIndex + 5,
    });

    // Dynamic Color Update
    if (lineSeriesRef.current) {
      const visibleRange = timeScale.getVisibleLogicalRange();
      if (visibleRange) {
        const from = Math.max(0, Math.floor(visibleRange.from));
        const to = Math.min(series.length - 1, Math.floor(visibleRange.to));
        if (to > from) {
          const isUp = series[to].value >= series[from].value;
          lineSeriesRef.current.applyOptions({
            color: isUp ? '#10b981' : '#ef4444'
          });
        }
      }
    }
  }, [timeframe, series]);

  useEffect(() => {
    if (!chartContainerRef.current || series.length === 0) return;

    const chart = createChart(chartContainerRef.current, {
      layout: {
        background: { type: 0, color: 'transparent' },
        textColor: theme === 'light' ? '#4b5563' : '#adbac7',
        attributionLogo: false,
      },
      grid: {
        vertLines: { color: 'rgba(118, 131, 144, 0.1)' },
        horzLines: { color: 'rgba(118, 131, 144, 0.1)' },
      },
      rightPriceScale: { borderColor: 'rgba(118, 131, 144, 0.2)' },
      timeScale: {
        borderColor: 'rgba(118, 131, 144, 0.2)',
        timeVisible: true,
        secondsVisible: false,
      },
    });

    chartRef.current = chart;
    const lineSeries = chart.addSeries(LineSeries, {
      color: color,
      lineWidth: 2,
      priceLineVisible: false,
    });
    lineSeriesRef.current = lineSeries;
    lineSeries.setData(series);
    chart.timeScale().fitContent();

    const handleResize = () => {
      if (chartContainerRef.current) {
        chart.applyOptions({ width: chartContainerRef.current.clientWidth });
      }
    };

    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
      chart.remove();
    };
  }, [color, series]);

  return (
    <Card className="border-[var(--color-border)] bg-[var(--color-bg-primary)] shadow-none overflow-hidden">
      <CardHeader className="border-b border-[var(--color-border)] px-5 py-3">
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div>
                <h3 className="text-base font-bold text-[var(--color-text-primary)]">{title}</h3>
                <p className="text-[11px] text-[var(--color-text-tertiary)]">{symbol}</p>
              </div>
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-bold tabular-nums text-[var(--color-text-primary)]">
                  {currentValue.toFixed(2)}
                </span>
                <Badge
                  className={`gap-1 text-[11px] font-bold ${isPositive
                    ? 'bg-emerald-600/20 text-emerald-500 border-emerald-500/30'
                    : 'bg-red-600/20 text-red-500 border-red-500/30'
                    }`}
                >
                  {isPositive ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                  {isPositive ? '+' : ''}{change.toFixed(2)} ({isPositive ? '+' : ''}{changePercent.toFixed(2)}%)
                </Badge>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-[var(--color-text-tertiary)] hover:bg-[var(--color-bg-tertiary)] hover:text-[var(--color-text-primary)]"
                onClick={() => chartRef.current?.timeScale().fitContent()}
              >
                <RefreshCw className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="icon" className="h-8 w-8 text-[var(--color-text-tertiary)] hover:bg-[var(--color-bg-tertiary)] hover:text-[var(--color-text-primary)]">
                <Maximize2 className="h-4 w-4" />
              </Button>
            </div>
          </div>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-0.5 bg-[var(--color-bg-primary)] rounded-lg p-0.5 border border-[var(--color-border)]">
              {['1M', '3M', '6M', '1Y', 'ALL'].map((tf) => (
                <Button
                  key={tf}
                  variant="ghost"
                  size="sm"
                  className={`h-7 px-3 text-[11px] font-semibold transition-all ${timeframe === tf
                    ? 'bg-emerald-600 text-white shadow-sm'
                    : 'text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-bg-tertiary)]'
                    }`}
                  onClick={() => setTimeframe(tf)}
                >
                  {tf}
                </Button>
              ))}
            </div>
            <div className="flex items-center gap-1 text-[11px] font-semibold text-[var(--color-text-tertiary)]">
              <Activity className="h-3 w-3" /> Live index trend
            </div>
          </div>
        </div>
      </CardHeader>
      {series.length > 0 ? (
        <div ref={chartContainerRef} className="w-full" style={{ height: `${height}px` }} />
      ) : (
        <div className="flex h-[320px] items-center justify-center text-sm text-[var(--color-text-tertiary)]">
          No index data available.
        </div>
      )}
    </Card>
  );
}
