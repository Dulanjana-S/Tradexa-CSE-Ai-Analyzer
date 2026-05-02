import { useEffect, useMemo, useRef, useState } from 'react';
import { createChart, CandlestickSeries, HistogramSeries, LineSeries, type IChartApi, type CandlestickData, type HistogramData, type LineData } from 'lightweight-charts';
import { Card, CardHeader } from '../ui/card';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { TrendingUp, TrendingDown, Maximize2, RefreshCw, Activity } from 'lucide-react';
import type { HistoricalDataPoint } from '../../../lib/api/types';

interface ProfessionalChartProps {
  symbol?: string;
  companyName?: string;
  data?: HistoricalDataPoint[];
}

function toCandles(rows: HistoricalDataPoint[]): CandlestickData[] {
  return rows.map((item) => ({
    time: item.date,
    open: item.open,
    high: item.high,
    low: item.low,
    close: item.close,
  }));
}

function calculateSMA(data: CandlestickData[], period: number) {
  const out: LineData[] = [];
  for (let i = period - 1; i < data.length; i += 1) {
    const slice = data.slice(i - period + 1, i + 1);
    const sum = slice.reduce((acc, row) => acc + row.close, 0);
    out.push({ time: String(data[i].time), value: sum / period });
  }
  return out;
}

export function ProfessionalChart({
  symbol = 'JKH.N0000',
  companyName = 'John Keells Holdings PLC',
  data = [],
}: ProfessionalChartProps) {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const [timeframe, setTimeframe] = useState('1D');
  const [showIndicators, setShowIndicators] = useState(true);

  const candles = useMemo(() => toCandles(data), [data]);
  const currentPrice = candles[candles.length - 1]?.close || 0;
  const previousPrice = candles[candles.length - 2]?.close || currentPrice || 1;
  const priceChange = currentPrice - previousPrice;
  const priceChangePercent = previousPrice ? (priceChange / previousPrice) * 100 : 0;
  const isPositive = priceChange >= 0;

  useEffect(() => {
    if (!chartContainerRef.current || candles.length === 0) return;

    const chart = createChart(chartContainerRef.current, {
      layout: {
        background: { color: '#08090c' },
        textColor: '#768390',
        attributionLogo: false,
      },
      grid: {
        vertLines: { color: '#161b2244' },
        horzLines: { color: '#161b2244' },
      },
      crosshair: {
        mode: 1,
        vertLine: {
          width: 1,
          color: '#484f58',
          style: 0,
          labelBackgroundColor: '#10b981',
        },
        horzLine: {
          width: 1,
          color: '#484f58',
          style: 0,
          labelBackgroundColor: '#10b981',
        },
      },
      rightPriceScale: {
        borderColor: '#30363d',
      },
      timeScale: {
        borderColor: '#30363d',
        timeVisible: true,
        secondsVisible: false,
      },
      width: chartContainerRef.current.clientWidth,
      height: 500,
    });

    chartRef.current = chart;

    const candlestickSeries = chart.addSeries(CandlestickSeries, {
      upColor: '#10b981',
      downColor: '#f85149',
      borderUpColor: '#10b981',
      borderDownColor: '#f85149',
      wickUpColor: '#10b981',
      wickDownColor: '#f85149',
    });
    candlestickSeries.setData(candles);

    if (showIndicators) {
      if (candles.length >= 20) {
        const sma20 = chart.addSeries(LineSeries, { color: '#d29922', lineWidth: 2, priceLineVisible: false });
        sma20.setData(calculateSMA(candles, 20));
      }
      if (candles.length >= 50) {
        const sma50 = chart.addSeries(LineSeries, { color: '#a371f7', lineWidth: 2, priceLineVisible: false });
        sma50.setData(calculateSMA(candles, 50));
      }
    }

    const volumeData: HistogramData[] = data.map((row, index) => ({
      time: row.date,
      value: row.volume || Math.max(1, (row.high - row.low) * 10000),
      color: index > 0 && row.close >= row.open ? '#10b98133' : '#f8514933',
    }));

    const volumeSeries = chart.addSeries(HistogramSeries, {
      color: '#10b98133',
      priceFormat: { type: 'volume' },
      priceScaleId: '',
    });
    volumeSeries.setData(volumeData);

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
  }, [candles, data, showIndicators]);

  const timeframes = ['1m', '5m', '15m', '1h', '4h', '1D', '1W', '1M'];

  return (
    <Card className="border-[#30363d] bg-[#0d1117] shadow-none overflow-hidden">
      <CardHeader className="border-b border-[#21262d] px-5 py-3">
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div>
                <h3 className="text-base font-bold text-[#e6edf3]">{symbol}</h3>
                <p className="text-[11px] text-[#768390]">{companyName}</p>
              </div>
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-bold tabular-nums text-[#e6edf3]">
                  {currentPrice.toFixed(2)}
                </span>
                <Badge
                  className={`gap-1 text-[11px] font-bold ${
                    isPositive
                      ? 'bg-emerald-600/20 text-emerald-500 border-emerald-500/30'
                      : 'bg-red-600/20 text-red-500 border-red-500/30'
                  }`}
                >
                  {isPositive ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                  {isPositive ? '+' : ''}{priceChange.toFixed(2)} ({isPositive ? '+' : ''}{priceChangePercent.toFixed(2)}%)
                </Badge>
              </div>
            </div>

            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-[#768390] hover:bg-[#161b22] hover:text-[#e6edf3]"
                onClick={() => chartRef.current?.timeScale().fitContent()}
              >
                <RefreshCw className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-[#768390] hover:bg-[#161b22] hover:text-[#e6edf3]"
              >
                <Maximize2 className="h-4 w-4" />
              </Button>
            </div>
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1">
              {timeframes.map((tf) => (
                <Button
                  key={tf}
                  variant="ghost"
                  size="sm"
                  className={`h-7 px-3 text-[11px] font-semibold ${
                    timeframe === tf
                      ? 'bg-[#161b22] text-[#e6edf3] ring-1 ring-[#30363d]'
                      : 'text-[#768390] hover:bg-[#161b22] hover:text-[#e6edf3]'
                  }`}
                  onClick={() => setTimeframe(tf)}
                >
                  {tf}
                </Button>
              ))}
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                className={`h-7 px-2.5 text-[11px] font-semibold ${
                  showIndicators
                    ? 'bg-[#161b22] text-[#e6edf3] ring-1 ring-[#30363d]'
                    : 'text-[#768390] hover:bg-[#161b22] hover:text-[#e6edf3]'
                }`}
                onClick={() => setShowIndicators((value) => !value)}
              >
                <Activity className="mr-1 h-3 w-3" />
                Indicators
              </Button>
            </div>
          </div>
        </div>
      </CardHeader>
      <div className="p-0">
        {candles.length > 0 ? (
          <div ref={chartContainerRef} className="w-full" style={{ height: '500px' }} />
        ) : (
          <div className="flex h-[500px] items-center justify-center text-sm text-[#768390]">
            No historical chart data available.
          </div>
        )}
      </div>
    </Card>
  );
}
