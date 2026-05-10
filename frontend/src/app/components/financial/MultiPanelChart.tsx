// Multi-Panel Trading Chart Layout
// TradingView-style multi-timeframe view

'use client';

import { useState } from 'react';
import { AdvancedPriceChart } from './AdvancedPriceChart';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { 
  LayoutGrid, 
  Maximize2, 
  Columns2,
  Grid2X2,
  Grid3X3,
  Rows3
} from 'lucide-react';
import { cn } from '../ui/utils';
import { CandlestickData } from 'lightweight-charts';

interface MultiPanelChartProps {
  symbol: string;
  data: CandlestickData[];
}

type LayoutType = '1x1' | '2x1' | '2x2' | '3x1';

export function MultiPanelChart({ symbol, data }: MultiPanelChartProps) {
  const [layout, setLayout] = useState<LayoutType>('2x2');

  const layouts = [
    { type: '1x1' as LayoutType, icon: Maximize2, label: 'Single' },
    { type: '2x1' as LayoutType, icon: Columns2, label: '2 Columns' },
    { type: '2x2' as LayoutType, icon: Grid2X2, label: '2x2 Grid' },
    { type: '3x1' as LayoutType, icon: Rows3, label: '3 Rows' },
  ];

  const timeframes = {
    '1x1': ['1D'],
    '2x1': ['1h', '1D'],
    '2x2': ['15m', '1h', '4h', '1D'],
    '3x1': ['1h', '4h', '1D'],
  };

  const getGridClass = () => {
    switch (layout) {
      case '1x1':
        return 'grid-cols-1';
      case '2x1':
        return 'grid-cols-1 lg:grid-cols-2';
      case '2x2':
        return 'grid-cols-1 lg:grid-cols-2';
      case '3x1':
        return 'grid-cols-1';
      default:
        return 'grid-cols-1';
    }
  };

  const getPanelHeight = () => {
    switch (layout) {
      case '1x1':
        return 600;
      case '2x1':
        return 500;
      case '2x2':
        return 380;
      case '3x1':
        return 320;
      default:
        return 500;
    }
  };

  return (
    <div className="space-y-4">
      {/* Layout Controls */}
      <Card className="border-[var(--color-border)] bg-[var(--color-bg-secondary)] shadow-none">
        <CardHeader className="border-b border-[var(--color-border)] px-5 py-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-[13px] font-semibold text-[var(--color-text-primary)]">
              Multi-Timeframe Analysis
            </CardTitle>
            
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-semibold uppercase text-[var(--color-text-tertiary)]">Layout:</span>
              {layouts.map((l) => (
                <Button
                  key={l.type}
                  variant="ghost"
                  size="sm"
                  className={cn(
                    'h-7 gap-2 px-2.5 text-[11px] font-semibold',
                    layout === l.type
                      ? 'bg-[var(--color-bg-tertiary)] text-[var(--color-text-primary)] ring-1 ring-[#30363d]'
                      : 'text-[var(--color-text-tertiary)] hover:bg-[var(--color-bg-tertiary)] hover:text-[var(--color-text-primary)]'
                  )}
                  onClick={() => setLayout(l.type)}
                >
                  <l.icon className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">{l.label}</span>
                </Button>
              ))}
            </div>
          </div>
        </CardHeader>
      </Card>

      {/* Chart Panels */}
      <div className={cn('grid gap-4', getGridClass())}>
        {timeframes[layout].map((tf, index) => (
          <div key={`${tf}-${index}`}>
            <AdvancedPriceChart
              symbol={symbol}
              data={data}
              interval={tf as any}
              height={getPanelHeight()}
              showVolume={layout === '1x1' || layout === '2x1'}
              showIndicators={true}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
