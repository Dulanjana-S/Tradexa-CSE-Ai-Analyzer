// Advanced Professional Trading Chart Component
// TradingView-style chart with technical indicators

'use client';

import { useEffect, useRef, useState } from 'react';
import { createChart, CandlestickSeries, HistogramSeries, LineSeries, IChartApi, ISeriesApi, CandlestickData, LineData, HistogramData } from 'lightweight-charts';
import { Card, CardContent, CardHeader } from '../ui/card';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import {
  TrendingUp,
  TrendingDown,
  BarChart3,
  Activity,
  Maximize2,
  Settings,
  Download,
  Plus
} from 'lucide-react';
import { cn } from '../ui/utils';

interface AdvancedPriceChartProps {
  symbol: string;
  data: CandlestickData[];
  interval?: '1m' | '5m' | '15m' | '1h' | '4h' | '1D' | '1W' | '1M';
  height?: number;
  showVolume?: boolean;
  showIndicators?: boolean;
  className?: string;
}

interface TechnicalIndicators {
  sma20: boolean;
  sma50: boolean;
  ema12: boolean;
  ema26: boolean;
  bollingerBands: boolean;
  rsi: boolean;
}

export function AdvancedPriceChart({
  symbol,
  data,
  interval = '1D',
  height = 600,
  showVolume = true,
  showIndicators = true,
  className,
}: AdvancedPriceChartProps) {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candlestickSeriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const volumeSeriesRef = useRef<ISeriesApi<'Histogram'> | null>(null);

  const [indicators, setIndicators] = useState<TechnicalIndicators>({
    sma20: true,
    sma50: true,
    ema12: false,
    ema26: false,
    bollingerBands: true,
    rsi: false,
  });

  const [timeframe, setTimeframe] = useState('ALL' as any);
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Calculate SMA
  const calculateSMA = (data: CandlestickData[], period: number): LineData[] => {
    const sma: LineData[] = [];
    for (let i = period - 1; i < data.length; i++) {
      const sum = data.slice(i - period + 1, i + 1).reduce((acc, d) => acc + d.close, 0);
      sma.push({
        time: data[i].time,
        value: sum / period,
      });
    }
    return sma;
  };

  // Calculate EMA
  const calculateEMA = (data: CandlestickData[], period: number): LineData[] => {
    const ema: LineData[] = [];
    const multiplier = 2 / (period + 1);

    // First EMA = SMA
    let emaValue = data.slice(0, period).reduce((acc, d) => acc + d.close, 0) / period;
    ema.push({ time: data[period - 1].time, value: emaValue });

    // Calculate rest
    for (let i = period; i < data.length; i++) {
      emaValue = (data[i].close - emaValue) * multiplier + emaValue;
      ema.push({ time: data[i].time, value: emaValue });
    }
    return ema;
  };

  // Calculate Bollinger Bands
  const calculateBollingerBands = (data: CandlestickData[], period: number, stdDev: number = 2) => {
    const upperBand: LineData[] = [];
    const lowerBand: LineData[] = [];
    const middleBand: LineData[] = [];

    for (let i = period - 1; i < data.length; i++) {
      const slice = data.slice(i - period + 1, i + 1);
      const sma = slice.reduce((acc, d) => acc + d.close, 0) / period;
      const variance = slice.reduce((acc, d) => acc + Math.pow(d.close - sma, 2), 0) / period;
      const std = Math.sqrt(variance);

      middleBand.push({ time: data[i].time, value: sma });
      upperBand.push({ time: data[i].time, value: sma + stdDev * std });
      lowerBand.push({ time: data[i].time, value: sma - stdDev * std });
    }

    return { upperBand, middleBand, lowerBand };
  };

  // Calculate Volume Data
  const calculateVolume = (data: CandlestickData[]): HistogramData[] => {
    return data.map((d, i) => ({
      time: d.time,
      value: (d.high - d.low) * 1000000, // Derived volume
      color: i > 0 && d.close >= d.open ? '#10b98166' : '#f8514966',
    }));
  };

  useEffect(() => {
    if (!chartContainerRef.current || data.length === 0) return;

    // Create chart
    const chart = createChart(chartContainerRef.current, {
      layout: {
        background: { color: '#08090c' },
        textColor: '#768390',
        fontSize: 12,
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
        attributionLogo: false,
      },
      grid: {
        vertLines: { color: '#161b2233' },
        horzLines: { color: '#161b2233' },
      },
      crosshair: {
        mode: 1,
        vertLine: {
          width: 1,
          color: '#484f58',
          style: 2,
          labelBackgroundColor: '#10b981',
        },
        horzLine: {
          width: 1,
          color: '#484f58',
          style: 2,
          labelBackgroundColor: '#10b981',
        },
      },
      rightPriceScale: {
        borderColor: '#30363d',
        scaleMargins: {
          top: 0.1,
          bottom: showVolume ? 0.25 : 0.1,
        },
      },
      timeScale: {
        borderColor: '#30363d',
        timeVisible: true,
        secondsVisible: false,
        rightOffset: 12,
        barSpacing: 12,
        minBarSpacing: 8,
      },
      handleScroll: {
        mouseWheel: true,
        pressedMouseMove: true,
        horzTouchDrag: true,
        vertTouchDrag: true,
      },
      handleScale: {
        axisPressedMouseMove: true,
        mouseWheel: true,
        pinch: true,
      },
    });

    chartRef.current = chart;

    // Add Candlestick Series
    const candlestickSeries = chart.addSeries(CandlestickSeries, {
      upColor: '#10b981',
      downColor: '#f85149',
      borderUpColor: '#10b981',
      borderDownColor: '#f85149',
      wickUpColor: '#10b981',
      wickDownColor: '#f85149',
      priceFormat: {
        type: 'price',
        precision: 2,
        minMove: 0.01,
      },
    });

    candlestickSeries.setData(data);
    candlestickSeriesRef.current = candlestickSeries;

    // Add Volume if enabled
    if (showVolume) {
      const volumeSeries = chart.addSeries(HistogramSeries, {
        color: '#10b98166',
        priceFormat: {
          type: 'volume',
        },
        priceScaleId: '',
      });

      volumeSeries.setData(calculateVolume(data));
      volumeSeriesRef.current = volumeSeries;
    }

    // Add Technical Indicators
    if (showIndicators) {
      // SMA 20
      if (indicators.sma20) {
        const sma20Series = chart.addSeries(LineSeries, {
          color: '#d29922',
          lineWidth: 2,
          title: 'SMA 20',
          lastValueVisible: true,
          priceLineVisible: false,
        });
        sma20Series.setData(calculateSMA(data, 20));
      }

      // SMA 50
      if (indicators.sma50) {
        const sma50Series = chart.addSeries(LineSeries, {
          color: '#a371f7',
          lineWidth: 2,
          title: 'SMA 50',
          lastValueVisible: true,
          priceLineVisible: false,
        });
        sma50Series.setData(calculateSMA(data, 50));
      }

      // EMA 12
      if (indicators.ema12) {
        const ema12Series = chart.addSeries(LineSeries, {
          color: '#58a6ff',
          lineWidth: 2,
          title: 'EMA 12',
          lastValueVisible: true,
          priceLineVisible: false,
        });
        ema12Series.setData(calculateEMA(data, 12));
      }

      // EMA 26
      if (indicators.ema26) {
        const ema26Series = chart.addSeries(LineSeries, {
          color: '#ff6b6b',
          lineWidth: 2,
          title: 'EMA 26',
          lastValueVisible: true,
          priceLineVisible: false,
        });
        ema26Series.setData(calculateEMA(data, 26));
      }

      // Bollinger Bands
      if (indicators.bollingerBands) {
        const bb = calculateBollingerBands(data, 20);

        const upperBandSeries = chart.addSeries(LineSeries, {
          color: '#58a6ff66',
          lineWidth: 1,
          lineStyle: 2,
          title: 'BB Upper',
          lastValueVisible: false,
          priceLineVisible: false,
        });
        upperBandSeries.setData(bb.upperBand);

        const lowerBandSeries = chart.addSeries(LineSeries, {
          color: '#58a6ff66',
          lineWidth: 1,
          lineStyle: 2,
          title: 'BB Lower',
          lastValueVisible: false,
          priceLineVisible: false,
        });
        lowerBandSeries.setData(bb.lowerBand);

        const middleBandSeries = chart.addSeries(LineSeries, {
          color: '#58a6ff',
          lineWidth: 1,
          title: 'BB Middle',
          lastValueVisible: true,
          priceLineVisible: false,
        });
        middleBandSeries.setData(bb.middleBand);
      }
    }

    // Fit content
    chart.timeScale().fitContent();

    // Handle resize
    const handleResize = () => {
      if (chartContainerRef.current) {
        chart.applyOptions({
          width: chartContainerRef.current.clientWidth,
          height: isFullscreen ? window.innerHeight - 100 : height,
        });
      }
    };

    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      chart.remove();
    };
  }, [data, showVolume, showIndicators, indicators, height, isFullscreen]);

  const toggleIndicator = (indicator: keyof TechnicalIndicators) => {
    setIndicators(prev => ({ ...prev, [indicator]: !prev[indicator] }));
  };

  const timeframes = ['1m', '5m', '15m', '1h', '4h', '1D', '1W', '1M', 'ALL'];

  useEffect(() => {
    if (!chartRef.current || data.length === 0) return;
    const timeScale = chartRef.current.timeScale();

    if (timeframe === 'ALL') {
      timeScale.fitContent();
      return;
    }

    let rangeInBars = 60;
    switch (timeframe) {
      case '1m': rangeInBars = 15; break;
      case '5m': rangeInBars = 30; break;
      case '15m': rangeInBars = 45; break;
      case '1h': rangeInBars = 60; break;
      case '4h': rangeInBars = 90; break;
      case '1D': rangeInBars = 120; break;
      case '1W': rangeInBars = 250; break;
      case '1M': rangeInBars = 500; break;
      default: rangeInBars = 120;
    }

    const lastIndex = data.length - 1;
    timeScale.setVisibleLogicalRange({
      from: lastIndex - rangeInBars,
      to: lastIndex + 5,
    });
  }, [timeframe, data]);

  // Calculate current price and change
  const currentPrice = data[data.length - 1]?.close || 0;
  const previousPrice = data[data.length - 2]?.close || currentPrice;
  const priceChange = currentPrice - previousPrice;
  const priceChangePercent = ((priceChange / previousPrice) * 100);
  const isPositive = priceChange >= 0;

  return (
    <Card className={cn('border-[#30363d] bg-[#0d1117] shadow-none overflow-hidden', className)}>
      {/* Chart Header */}
      <CardHeader className="border-b border-[#21262d] px-5 py-3">
        <div className="flex flex-col gap-4">
          {/* Top Row - Symbol and Price */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <h3 className="text-[15px] font-bold text-[#e6edf3]">{symbol}</h3>
              <div className="flex items-baseline gap-2">
                <span className="text-[20px] font-bold tabular-nums text-[#e6edf3]">
                  {currentPrice.toFixed(2)}
                </span>
                <Badge
                  variant={isPositive ? 'default' : 'destructive'}
                  className={cn(
                    'gap-1 text-[11px] font-semibold',
                    isPositive ? 'bg-emerald-600/20 text-emerald-500 border-emerald-500/30' : 'bg-red-600/20 text-red-500 border-red-500/30'
                  )}
                >
                  {isPositive ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                  {isPositive ? '+' : ''}{priceChange.toFixed(2)} ({isPositive ? '+' : ''}{priceChangePercent.toFixed(2)}%)
                </Badge>
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-[#768390] hover:bg-[#161b22] hover:text-[#e6edf3]"
                onClick={() => setIsFullscreen(!isFullscreen)}
              >
                <Maximize2 className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-[#768390] hover:bg-[#161b22] hover:text-[#e6edf3]"
              >
                <Download className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-[#768390] hover:bg-[#161b22] hover:text-[#e6edf3]"
              >
                <Settings className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Bottom Row - Timeframe and Indicators */}
          <div className="flex items-center justify-between">
            {/* Timeframe Selector */}
            <div className="flex items-center gap-0.5 bg-[#0a0e14] rounded-lg p-0.5 border border-[#1e2938]">
              {timeframes.map((tf) => (
                <Button
                  key={tf}
                  variant="ghost"
                  size="sm"
                  className={cn(
                    'h-7 px-3 text-[11px] font-semibold transition-all',
                    timeframe === tf
                      ? 'bg-emerald-600 text-white shadow-sm'
                      : 'text-[#768390] hover:text-[#e6edf3] hover:bg-[#161b22]'
                  )}
                  onClick={() => setTimeframe(tf as any)}
                >
                  {tf}
                </Button>
              ))}
            </div>

            {/* Indicator Toggles */}
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-semibold uppercase text-[#768390]">Indicators:</span>
              <Button
                variant="ghost"
                size="sm"
                className={cn(
                  'h-7 px-2.5 text-[11px] font-semibold',
                  indicators.sma20 ? 'bg-[#d2992233] text-[#d29922]' : 'text-[#768390]'
                )}
                onClick={() => toggleIndicator('sma20')}
              >
                SMA 20
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className={cn(
                  'h-7 px-2.5 text-[11px] font-semibold',
                  indicators.sma50 ? 'bg-[#a371f733] text-[#a371f7]' : 'text-[#768390]'
                )}
                onClick={() => toggleIndicator('sma50')}
              >
                SMA 50
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className={cn(
                  'h-7 px-2.5 text-[11px] font-semibold',
                  indicators.bollingerBands ? 'bg-[#58a6ff33] text-[#58a6ff]' : 'text-[#768390]'
                )}
                onClick={() => toggleIndicator('bollingerBands')}
              >
                BB
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-[#768390] hover:bg-[#161b22] hover:text-[#e6edf3]"
              >
                <Plus className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        </div>
      </CardHeader>

      {/* Chart */}
      <CardContent className="p-0">
        <div
          ref={chartContainerRef}
          style={{
            width: '100%',
            height: isFullscreen ? window.innerHeight - 100 : height,
            position: 'relative'
          }}
        />
      </CardContent>
    </Card>
  );
}
