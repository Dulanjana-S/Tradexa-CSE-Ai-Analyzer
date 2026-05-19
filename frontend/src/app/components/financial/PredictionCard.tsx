import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";
import { Badge } from "../ui/badge";
import { TrendingUp, TrendingDown, AlertTriangle, Brain } from "lucide-react";
import { cn } from "../ui/utils";
import { Progress } from "../ui/progress";

interface PredictionCardProps {
  predictedPrice: number;
  currentPrice: number;
  predictedReturn: number;
  upProbability: number;
  signal: "bullish" | "bearish" | "neutral";
  confidence: number;
  expectedRange: { low: number; high: number };
  topFeatures: Array<{ feature: string; importance: number }>;
  lastUpdated: string;
  loading?: boolean;
  error?: string;
}

export function PredictionCard({
  predictedPrice,
  currentPrice,
  predictedReturn,
  upProbability,
  signal,
  confidence,
  expectedRange,
  topFeatures,
  lastUpdated,
  loading,
  error,
}: PredictionCardProps) {
  if (loading) {
    return (
      <Card className="bg-[var(--color-bg-secondary)] border-[var(--color-border)] shadow-sm">
        <CardHeader className="pb-4">
          <div className="flex items-center gap-2">
            <Brain className="h-5 w-5 text-emerald-500" />
            <CardTitle className="text-lg">AI Prediction</CardTitle>
          </div>
          <CardDescription className="text-sm">Loading prediction model...</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="h-24 bg-[var(--color-bg-primary)] animate-pulse rounded-lg" />
          <div className="h-16 bg-[var(--color-bg-primary)] animate-pulse rounded-lg" />
          <div className="h-20 bg-[var(--color-bg-primary)] animate-pulse rounded-lg" />
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="bg-[var(--color-bg-secondary)] border-[var(--warning-border)] shadow-sm">
        <CardHeader className="pb-4">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-[var(--warning-text)]" />
            <CardTitle className="text-lg">AI Prediction Unavailable</CardTitle>
          </div>
          <CardDescription className="text-[var(--warning-text)] text-sm">{error}</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const getSignalColor = () => {
    if (signal === "bullish") return "bg-emerald-600 hover:bg-emerald-600 text-white";
    if (signal === "bearish") return "bg-red-600 hover:bg-red-600 text-white";
    return "bg-slate-700 hover:bg-slate-700 text-white";
  };

  // Compute display scale and percentages for the expected-range bar
  const displayMin = Math.min(expectedRange.low, currentPrice, expectedRange.high);
  const displayMax = Math.max(expectedRange.low, currentPrice, expectedRange.high);
  const span = displayMax - displayMin || Math.max(1, Math.abs(displayMin) * 0.01);
  const toPct = (v: number) => ((v - displayMin) / span) * 100;
  const lowPct = Math.max(0, Math.min(100, toPct(expectedRange.low)));
  const highPct = Math.max(0, Math.min(100, toPct(expectedRange.high)));
  const currentPct = Math.max(0, Math.min(100, toPct(currentPrice)));

  return (
    <Card className="bg-[var(--color-bg-secondary)] border-[var(--color-border)] hover:border-[#2d3748] transition-all duration-200 shadow-sm">
      <CardHeader className="pb-4 border-b border-[var(--color-border)]">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-1 h-5 bg-emerald-500 rounded-full" />
            <CardTitle className="text-lg">AI Prediction</CardTitle>
          </div>
          <Badge className={cn("font-semibold text-xs", getSignalColor())}>{signal.toUpperCase()}</Badge>
        </div>
        <CardDescription className="text-sm text-slate-500">
          Next trading day forecast • Updated {lastUpdated}
        </CardDescription>
      </CardHeader>
      <CardContent className="pt-6 space-y-6">
        {/* Main Prediction */}
        <div className="p-4 rounded-lg bg-[var(--color-bg-primary)] border border-[var(--color-border)]">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Predicted Price</span>
            <div className="flex items-center gap-1">
              {predictedReturn > 0 ? (
                <TrendingUp className="h-4 w-4 text-emerald-500" />
              ) : (
                <TrendingDown className="h-4 w-4 text-red-500" />
              )}
            </div>
          </div>
          <div className="flex items-baseline gap-3">
            <span className="text-3xl font-semibold text-slate-50 tracking-tight">
              Rs. {predictedPrice.toFixed(2)}
            </span>
            <span
              className={cn(
                "text-lg font-semibold tabular-nums",
                predictedReturn > 0 ? "text-emerald-500" : "text-red-500"
              )}
            >
              {predictedReturn > 0 ? "+" : ""}
              {predictedReturn.toFixed(2)}%
            </span>
          </div>
          
        </div>

        {/* Expected Range */}
        <div>
          <div className="flex justify-between items-center mb-3">
            <span className="text-sm font-semibold uppercase tracking-wider text-slate-400">Expected Range</span>
            <span className="text-base text-[var(--color-text-secondary)] font-semibold tabular-nums">
              Rs. {expectedRange.low.toFixed(2)} - Rs. {expectedRange.high.toFixed(2)}
            </span>
          </div>

          <div className="relative">
            <div className="relative h-6 bg-[var(--color-bg-primary)] rounded-full border border-[var(--color-border)] overflow-hidden shadow-inner" style={{ boxShadow: '0 8px 20px rgba(0,0,0,0.6), inset 0 6px 18px rgba(246,180,60,0.06)' }}>
              {/* full saturated gradient background */}
              <div className="absolute inset-0 bg-gradient-to-r from-red-500 via-amber-400 to-emerald-500" style={{ filter: 'saturate(130%)', height: '100%' }} />

              {/* highlighted expected band (darker overlay to emphasize) */}
              <div
                className="absolute top-0 h-full rounded-full bg-[rgba(0,0,0,0.28)] transition-all"
                style={{ left: `${lowPct}%`, width: `${Math.max(0.6, highPct - lowPct)}%` }}
              />

              {/* low tick */}
              <div
                className="absolute top-1/2 -translate-y-1/2"
                style={{ left: `${lowPct}%`, transform: 'translateX(-50%)' }}
                title={`Low: Rs. ${expectedRange.low.toFixed(2)}`}
              >
                <div className="w-[2px] h-5 bg-white/80 rounded-sm" />
              </div>

              {/* high tick */}
              <div
                className="absolute top-1/2 -translate-y-1/2"
                style={{ left: `${highPct}%`, transform: 'translateX(-50%)' }}
                title={`High: Rs. ${expectedRange.high.toFixed(2)}`}
              >
                <div className="w-[2px] h-5 bg-white/80 rounded-sm" />
              </div>

              {/* current price marker with badge */}
              <div className="absolute top-0 left-0 bottom-0 flex items-center" style={{ left: `${currentPct}%`, transform: 'translateX(-50%)' }}>
                <div className="flex flex-col items-center -mt-2">
                  <div className="text-[11px] bg-[#0f1724] border border-white/10 text-white px-2 py-0.5 rounded-lg shadow-2xl ring-2 ring-yellow-300/40">Rs. {currentPrice.toFixed(2)}</div>
                  <div className="w-[2px] h-6 bg-white rounded-sm mt-1" />
                </div>
              </div>
            </div>

            <div className="flex justify-between items-center mt-2 text-sm text-slate-200 font-semibold">
              <div className="flex items-center gap-3">
                <span className="w-3 h-3 rounded-full bg-red-500 inline-block" />
                <span className="tabular-nums">Rs. {expectedRange.low.toFixed(2)}</span>
              </div>

              <div className="flex items-center gap-3">
                <span className="text-xs text-slate-400">Current</span>
                  <span className="px-2 py-0.5 rounded bg-yellow-400 text-black tabular-nums font-semibold shadow-md">Rs. {currentPrice.toFixed(2)}</span>
              </div>

              <div className="flex items-center gap-3">
                <span className="tabular-nums">Rs. {expectedRange.high.toFixed(2)}</span>
                <span className="w-3 h-3 rounded-full bg-emerald-400 inline-block" />
              </div>
            </div>
          </div>
        </div>

        {/* Probability & Confidence */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <div className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">
              Upward Probability
            </div>
            <div className="text-2xl font-semibold text-slate-50 tabular-nums">
              {(upProbability * 100).toFixed(0)}%
            </div>
            <Progress
              value={upProbability * 100}
              className="mt-2 h-2 bg-[var(--color-bg-primary)] border border-[var(--color-border)] [&>div]:bg-emerald-600"
            />
          </div>
          <div>
            <div className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">
              Model Confidence
            </div>
            <div className="text-2xl font-semibold text-slate-50 tabular-nums">
              {(confidence * 100).toFixed(0)}%
            </div>
            <Progress
              value={confidence * 100}
              className="mt-2 h-2 bg-[var(--color-bg-primary)] border border-[var(--color-border)] [&>div]:bg-emerald-600"
            />
          </div>
        </div>

        {/* Top Features */}
        <div>
          <div className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-3">
            Key Prediction Drivers
          </div>
          <div className="space-y-3">
            {topFeatures.map((feature, idx) => (
              <div key={idx} className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[var(--color-border)]/30 sm:border-none pb-2 sm:pb-0">
                <span className="text-sm text-[var(--color-text-tertiary)] break-all">{feature.feature}</span>
                <div className="flex items-center gap-2 shrink-0">
                  <div className="w-24 h-1.5 bg-[var(--color-bg-primary)] border border-[var(--color-border)] rounded-full overflow-hidden">
                    <div
                      className="h-full bg-emerald-600 rounded-full"
                      style={{ width: `${feature.importance * 100}%` }}
                    />
                  </div>
                  <span className="text-xs text-slate-500 font-medium w-10 text-right tabular-nums">
                    {(feature.importance * 100).toFixed(0)}%
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Disclaimer */}
        <div className="p-3 rounded-lg bg-[var(--warning-bg)] border border-[var(--warning-border)]">
          <p className="text-xs text-[var(--warning-text)] leading-relaxed flex items-start gap-1.5">
            <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" />
            <span>
              Predictions are for informational purposes only. Not financial advice. Past
              performance does not guarantee future results. Always conduct your own research.
            </span>
          </p>
        </div>
      </CardContent>
    </Card>
  );
}