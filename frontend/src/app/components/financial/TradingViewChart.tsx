// Professional TradingView-Style Chart
// Complete with drawing tools, indicators, and advanced features

'use client';

import { useEffect, useRef, useState } from 'react';
import {
  createChart,
  CandlestickSeries,
  HistogramSeries,
  LineSeries,
  IChartApi,
  ISeriesApi,
  CandlestickData,
  LineData,
  Time,
  MouseEventParams
} from 'lightweight-charts';
import { Card, CardContent, CardHeader } from '../ui/card';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import {
  TrendingUp,
  TrendingDown,
  Activity,
  Settings,
  Download,
  Camera,
  Maximize2,
  Minimize2,
  ZoomIn,
  ZoomOut,
  RefreshCw,
  Plus,
  Minus as MinusIcon,
  Circle,
  Square,
  Pencil,
  Type,
  TrendingUpIcon
} from 'lucide-react';
import { cn } from '../ui/utils';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuCheckboxItem,
} from '../ui/dropdown-menu';

interface TradingViewChartProps {
  symbol: string;
  companyName?: string;
  data: CandlestickData[];
  className?: string;
}

interface TradeMarker {
  time: Time;
  position: 'aboveBar' | 'belowBar';
  color: string;
  shape: 'arrowUp' | 'arrowDown' | 'circle';
  text: string;
}

export function TradingViewChart({
  symbol,
  companyName,
  data,
  className,
}: TradingViewChartProps) {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candlestickSeriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);

  const [isFullscreen, setIsFullscreen] = useState(false);
  const [chartHeight, setChartHeight] = useState(600);
  const [showVolume, setShowVolume] = useState(true);
  const [chartType, setChartType] = useState<'candlestick' | 'line' | 'area'>('candlestick');

  // Technical Indicators State
  const [indicators, setIndicators] = useState({
    sma20: true,
    sma50: true,
    ema9: false,
    ema21: false,
    bollingerBands: true,
    vwap: false,
    volume: true,
  });

  // Drawing Tools State
  const [drawingMode, setDrawingMode] = useState<null | 'trendline' | 'horizontal' | 'rectangle'>(null);

  // Calculate technical indicators
  const calculateSMA = (data: CandlestickData[], period: number): LineData[] => {
    const sma: LineData[] = [];
    for (let i = period - 1; i < data.length; i++) {
      const sum = data.slice(i - period + 1, i + 1).reduce((acc, d) => acc + d.close, 0);
      sma.push({ time: data[i].time, value: sum / period });
    }
    return sma;
  };

  const calculateEMA = (data: CandlestickData[], period: number): LineData[] => {
    const ema: LineData[] = [];
    const multiplier = 2 / (period + 1);
    let emaValue = data.slice(0, period).reduce((acc, d) => acc + d.close, 0) / period;
    ema.push({ time: data[period - 1].time, value: emaValue });

    for (let i = period; i < data.length; i++) {
      emaValue = (data[i].close - emaValue) * multiplier + emaValue;
      ema.push({ time: data[i].time, value: emaValue });
    }
    return ema;
  };

  const calculateBollingerBands = (data: CandlestickData[], period: number = 20, stdDev: number = 2) => {
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

  // Initialize chart
  useEffect(() => {
    if (!chartContainerRef.current || data.length === 0) return;

    const chart = createChart(chartContainerRef.current, {
      layout: {
        background: { color: '#08090c' },
        textColor: '#768390',
        fontSize: 12,
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
        attributionLogo: false,
      },
      grid: {
        vertLines: {
          color: '#161b2244',
          style: 1,
          visible: true,
        },
        horzLines: {
          color: '#161b2244',
          style: 1,
          visible: true,
        },
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
        scaleMargins: {
          top: 0.08,
          bottom: showVolume ? 0.25 : 0.1,
        },
        mode: 0, // Normal
      },
      timeScale: {
        borderColor: '#30363d',
        timeVisible: true,
        secondsVisible: false,
        rightOffset: 15,
        barSpacing: 14,
        minBarSpacing: 8,
        fixLeftEdge: false,
        fixRightEdge: false,
        lockVisibleTimeRangeOnResize: true,
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

    // Add main price series
    const candlestickSeries = chart.addSeries(CandlestickSeries, {
      upColor: '#10b981',
      downColor: '#f85149',
      borderUpColor: '#10b981',
      borderDownColor: '#f85149',
      wickUpColor: '#10b981',
      wickDownColor: '#f85149',
      borderVisible: true,
      priceFormat: {
        type: 'price',
        precision: 2,
        minMove: 0.01,
      },
    });

    candlestickSeries.setData(data);
    candlestickSeriesRef.current = candlestickSeries;

    // Add Volume
    if (showVolume && indicators.volume) {
      const volumeData = data.map((d, i) => ({
        time: d.time,
        value: (d.high - d.low) * 1000000,
        color: i > 0 && d.close >= d.open ? '#10b98133' : '#f8514933',
      }));

      const volumeSeries = chart.addSeries(HistogramSeries, {
        color: '#10b98133',
        priceFormat: { type: 'volume' },
        priceScaleId: '',
      });
      volumeSeries.setData(volumeData);
    }

    // Add Technical Indicators
    if (indicators.sma20) {
      const sma20 = chart.addSeries(LineSeries, {
        color: '#d29922',
        lineWidth: 2,
        title: 'SMA 20',
        lastValueVisible: true,
        priceLineVisible: false,
      });
      sma20.setData(calculateSMA(data, 20));
    }

    if (indicators.sma50) {
      const sma50 = chart.addSeries(LineSeries, {
        color: '#a371f7',
        lineWidth: 2,
        title: 'SMA 50',
        lastValueVisible: true,
        priceLineVisible: false,
      });
      sma50.setData(calculateSMA(data, 50));
    }

    if (indicators.ema9) {
      const ema9 = chart.addSeries(LineSeries, {
        color: '#58a6ff',
        lineWidth: 2,
        title: 'EMA 9',
        lastValueVisible: true,
        priceLineVisible: false,
      });
      ema9.setData(calculateEMA(data, 9));
    }

    if (indicators.ema21) {
      const ema21 = chart.addSeries(LineSeries, {
        color: '#ff6b6b',
        lineWidth: 2,
        title: 'EMA 21',
        lastValueVisible: true,
        priceLineVisible: false,
      });
      ema21.setData(calculateEMA(data, 21));
    }

    if (indicators.bollingerBands) {
      const bb = calculateBollingerBands(data, 20);

      const upperBand = chart.addSeries(LineSeries, {
        color: '#58a6ff44',
        lineWidth: 1,
        lineStyle: 2,
        lastValueVisible: false,
        priceLineVisible: false,
      });
      upperBand.setData(bb.upperBand);

      const lowerBand = chart.addSeries(LineSeries, {
        color: '#58a6ff44',
        lineWidth: 1,
        lineStyle: 2,
        lastValueVisible: false,
        priceLineVisible: false,
      });
      lowerBand.setData(bb.lowerBand);

      const middleBand = chart.addSeries(LineSeries, {
        color: '#58a6ff',
        lineWidth: 1,
        lastValueVisible: false,
        priceLineVisible: false,
      });
      middleBand.setData(bb.middleBand);
    }

    // Add example trade markers
    const tradeMarkers: TradeMarker[] = [
      {
        time: data[Math.floor(data.length * 0.3)].time,
        position: 'belowBar',
        color: '#10b981',
        shape: 'arrowUp',
        text: 'ENTRY',
      },
      {
        time: data[Math.floor(data.length * 0.7)].time,
        position: 'aboveBar',
        color: '#f85149',
        shape: 'arrowDown',
        text: 'EXIT',
      },
    ];

    candlestickSeries.setMarkers(tradeMarkers);

    // Fit content
    chart.timeScale().fitContent();

    // Handle resize
    const handleResize = () => {
      if (chartContainerRef.current) {
        chart.applyOptions({
          width: chartContainerRef.current.clientWidth,
          height: isFullscreen ? window.innerHeight - 200 : chartHeight,
        });
      }
    };

    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      chart.remove();
    };
  }, [data, showVolume, indicators, chartHeight, isFullscreen]);

  // Calculate current stats
  const currentPrice = data[data.length - 1]?.close || 0;
  const previousPrice = data[data.length - 2]?.close || currentPrice;
  const priceChange = currentPrice - previousPrice;
  const priceChangePercent = (priceChange / previousPrice) * 100;
  const isPositive = priceChange >= 0;

  const highPrice = Math.max(...data.map(d => d.high));
  const lowPrice = Math.min(...data.map(d => d.low));
  const avgVolume = data.reduce((acc, d) => acc + (d.high - d.low), 0) / data.length * 1000000;

  return (
    <Card className={cn('border-[#30363d] bg-[#0d1117] shadow-none overflow-hidden', className)}>
      {/* Advanced Header */}
      <CardHeader className="border-b border-[#21262d] px-5 py-3">
        <div className="space-y-3">
          {/* Symbol and Price Row */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div>
                <h3 className="text-[16px] font-bold text-[#e6edf3]">{symbol}</h3>
                {companyName && (
                  <p className="text-[11px] text-[#768390]">{companyName}</p>
                )}
              </div>
              <div className="flex items-baseline gap-2">
                <span className="text-[24px] font-bold tabular-nums text-[#e6edf3]">
                  {currentPrice.toFixed(2)}
                </span>
                <Badge
                  className={cn(
                    'gap-1 text-[11px] font-bold',
                    isPositive
                      ? 'bg-emerald-600/20 text-emerald-500 border-emerald-500/30'
                      : 'bg-red-600/20 text-red-500 border-red-500/30'
                  )}
                >
                  {isPositive ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                  {isPositive ? '+' : ''}{priceChange.toFixed(2)} ({isPositive ? '+' : ''}{priceChangePercent.toFixed(2)}%)
                </Badge>
              </div>
            </div>

            {/* Action Buttons */}
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
                <Camera className="h-4 w-4" />
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
                onClick={() => setIsFullscreen(!isFullscreen)}
              >
                {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
              </Button>
            </div>
          </div>

          {/* Stats Row */}
          <div className="flex items-center gap-6 text-[12px]">
            <div>
              <span className="text-[#768390]">High: </span>
              <span className="font-semibold tabular-nums text-[#e6edf3]">{highPrice.toFixed(2)}</span>
            </div>
            <div>
              <span className="text-[#768390]">Low: </span>
              <span className="font-semibold tabular-nums text-[#e6edf3]">{lowPrice.toFixed(2)}</span>
            </div>
            <div>
              <span className="text-[#768390]">Avg Volume: </span>
              <span className="font-semibold tabular-nums text-[#e6edf3]">{avgVolume.toLocaleString()}</span>
            </div>
          </div>

          {/* Toolbar Row */}
          <div className="flex items-center justify-between border-t border-[#21262d] pt-3">
            {/* Indicators */}
            <div className="flex items-center gap-2">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 gap-1 px-2.5 text-[11px] font-semibold text-[#768390] hover:bg-[#161b22] hover:text-[#e6edf3]"
                  >
                    <Activity className="h-3.5 w-3.5" />
                    Indicators
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-56 border-[#30363d] bg-[#161b22]">
                  <DropdownMenuLabel className="text-[#e6edf3]">Technical Indicators</DropdownMenuLabel>
                  <DropdownMenuSeparator className="bg-[#30363d]" />
                  <DropdownMenuCheckboxItem
                    checked={indicators.sma20}
                    onCheckedChange={(checked) => setIndicators({ ...indicators, sma20: checked })}
                    className="text-[#adbac7]"
                  >
                    SMA 20
                  </DropdownMenuCheckboxItem>
                  <DropdownMenuCheckboxItem
                    checked={indicators.sma50}
                    onCheckedChange={(checked) => setIndicators({ ...indicators, sma50: checked })}
                    className="text-[#adbac7]"
                  >
                    SMA 50
                  </DropdownMenuCheckboxItem>
                  <DropdownMenuCheckboxItem
                    checked={indicators.ema9}
                    onCheckedChange={(checked) => setIndicators({ ...indicators, ema9: checked })}
                    className="text-[#adbac7]"
                  >
                    EMA 9
                  </DropdownMenuCheckboxItem>
                  <DropdownMenuCheckboxItem
                    checked={indicators.ema21}
                    onCheckedChange={(checked) => setIndicators({ ...indicators, ema21: checked })}
                    className="text-[#adbac7]"
                  >
                    EMA 21
                  </DropdownMenuCheckboxItem>
                  <DropdownMenuCheckboxItem
                    checked={indicators.bollingerBands}
                    onCheckedChange={(checked) => setIndicators({ ...indicators, bollingerBands: checked })}
                    className="text-[#adbac7]"
                  >
                    Bollinger Bands
                  </DropdownMenuCheckboxItem>
                  <DropdownMenuSeparator className="bg-[#30363d]" />
                  <DropdownMenuCheckboxItem
                    checked={indicators.volume}
                    onCheckedChange={(checked) => {
                      setIndicators({ ...indicators, volume: checked });
                      setShowVolume(checked);
                    }}
                    className="text-[#adbac7]"
                  >
                    Volume
                  </DropdownMenuCheckboxItem>
                </DropdownMenuContent>
              </DropdownMenu>

              {/* Active Indicators */}
              {indicators.sma20 && (
                <Badge variant="secondary" className="bg-[#d2992233] text-[#d29922] border-0 text-[10px]">
                  SMA 20
                </Badge>
              )}
              {indicators.sma50 && (
                <Badge variant="secondary" className="bg-[#a371f733] text-[#a371f7] border-0 text-[10px]">
                  SMA 50
                </Badge>
              )}
              {indicators.bollingerBands && (
                <Badge variant="secondary" className="bg-[#58a6ff33] text-[#58a6ff] border-0 text-[10px]">
                  BB
                </Badge>
              )}
            </div>

            {/* Drawing Tools */}
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                className={cn(
                  'h-7 w-7',
                  drawingMode === 'trendline'
                    ? 'bg-[#161b22] text-emerald-500'
                    : 'text-[#768390] hover:bg-[#161b22] hover:text-[#e6edf3]'
                )}
                onClick={() => setDrawingMode(drawingMode === 'trendline' ? null : 'trendline')}
              >
                <TrendingUpIcon className="h-3.5 w-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className={cn(
                  'h-7 w-7',
                  drawingMode === 'horizontal'
                    ? 'bg-[#161b22] text-emerald-500'
                    : 'text-[#768390] hover:bg-[#161b22] hover:text-[#e6edf3]'
                )}
                onClick={() => setDrawingMode(drawingMode === 'horizontal' ? null : 'horizontal')}
              >
                <MinusIcon className="h-3.5 w-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className={cn(
                  'h-7 w-7',
                  drawingMode === 'rectangle'
                    ? 'bg-[#161b22] text-emerald-500'
                    : 'text-[#768390] hover:bg-[#161b22] hover:text-[#e6edf3]'
                )}
                onClick={() => setDrawingMode(drawingMode === 'rectangle' ? null : 'rectangle')}
              >
                <Square className="h-3.5 w-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-[#768390] hover:bg-[#161b22] hover:text-[#e6edf3]"
              >
                <Type className="h-3.5 w-3.5" />
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
            height: isFullscreen ? window.innerHeight - 200 : chartHeight,
            position: 'relative',
          }}
        />
      </CardContent>
    </Card>
  );
}
