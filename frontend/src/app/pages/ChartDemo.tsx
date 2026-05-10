// Chart Demo Page - Shows all professional chart features
import { ProfessionalChart } from '../components/financial/ProfessionalChart';
import { IndexChart } from '../components/financial/IndexChart';
import { MetricCard } from '../components/financial/MetricCard';

export function ChartDemo() {
  return (
    <div className="min-h-screen bg-[var(--color-bg-primary)] px-6 py-8">
      <div className="mx-auto max-w-[1680px]">
        {/* Page Header */}
        <div className="mb-8">
          <h1 className="text-[32px] font-bold leading-tight tracking-tight text-[var(--color-text-primary)]">
            Professional Trading Charts
          </h1>
          <p className="mt-2 text-[13px] text-[var(--color-text-tertiary)]">
            TradingView-style charts with technical indicators
          </p>
        </div>

        {/* Key Metrics */}
        <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
          <MetricCard
            title="Open"
            value="143.20"
            subtitle="Today"
          />
          <MetricCard
            title="High"
            value="148.75"
            subtitle="Today"
          />
          <MetricCard
            title="Low"
            value="142.80"
            subtitle="Today"
          />
          <MetricCard
            title="Volume"
            value="2.4M"
            subtitle="Shares"
          />
          <MetricCard
            title="Market Cap"
            value="Rs. 254B"
            subtitle="LKR"
          />
          <MetricCard
            title="P/E Ratio"
            value="18.4"
            subtitle="TTM"
          />
        </div>

        {/* Professional Candlestick Chart */}
        <div className="mb-8">
          <h2 className="mb-4 text-[17px] font-semibold text-[var(--color-text-primary)]">
            Candlestick Chart (Stock Price)
          </h2>
          <ProfessionalChart 
            symbol="JKH.N0000"
            companyName="John Keells Holdings PLC"
          />
        </div>

        {/* Index Charts */}
        <div className="mb-8">
          <h2 className="mb-4 text-[17px] font-semibold text-[var(--color-text-primary)]">
            Index Charts (Area/Line)
          </h2>
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <IndexChart
              title="ASPI Index"
              symbol="ASPI"
              currentValue={11245.67}
              change={125.43}
              changePercent={1.13}
              color="#10b981"
            />
            <IndexChart
              title="S&P SL20 Index"
              symbol="S&P SL20"
              currentValue={3456.89}
              change={-12.34}
              changePercent={-0.36}
              color="#f85149"
            />
          </div>
        </div>

        {/* Features List */}
        <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-secondary)] p-6">
          <h2 className="mb-4 text-[15px] font-semibold text-[var(--color-text-primary)]">
            Chart Features
          </h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Feature
              title="Candlestick Charts"
              description="Professional OHLC candlestick visualization for stocks"
            />
            <Feature
              title="Area/Line Charts"
              description="Smooth gradient area charts for indices"
            />
            <Feature
              title="Technical Indicators"
              description="SMA 20, SMA 50 with color coding"
            />
            <Feature
              title="Volume Display"
              description="Volume histogram with color-coded bars"
            />
            <Feature
              title="Multiple Timeframes"
              description="1m, 5m, 15m, 1h, 4h, 1D, 1W, 1M"
            />
            <Feature
              title="Interactive Controls"
              description="Zoom, pan, and crosshair navigation"
            />
            <Feature
              title="Moving Averages"
              description="MA20 and MA50 for trend analysis"
            />
            <Feature
              title="Professional Theme"
              description="Dark theme optimized for financial data"
            />
            <Feature
              title="Real-time Updates"
              description="Live price display with change indicators"
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function Feature({ title, description }: { title: string; description: string }) {
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2">
        <div className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
        <h3 className="text-[13px] font-semibold text-[var(--color-text-primary)]">{title}</h3>
      </div>
      <p className="text-[12px] text-[var(--color-text-tertiary)]">{description}</p>
    </div>
  );
}