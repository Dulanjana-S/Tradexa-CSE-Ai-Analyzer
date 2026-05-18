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
          <div className="mt-2 text-xs text-slate-500 font-medium">
            Current: Rs. {currentPrice.toFixed(2)}
          </div>
        </div>

        {/* Expected Range */}
        <div>
          <div className="flex justify-between items-center mb-3">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Expected Range</span>
            <span className="text-sm text-[var(--color-text-secondary)] font-semibold tabular-nums">
              Rs. {expectedRange.low.toFixed(2)} - Rs. {expectedRange.high.toFixed(2)}
            </span>
          </div>
          <div className="relative h-2 bg-[var(--color-bg-primary)] rounded-full overflow-hidden border border-[var(--color-border)]">
            <div
              className="absolute h-full bg-gradient-to-r from-red-500 via-amber-500 to-emerald-500"
              style={{
                left: `${Math.max(0, Math.min(100, ((expectedRange.low - currentPrice) / (currentPrice || 1)) * 100 + 50))}%`,
                right: `${Math.max(0, Math.min(100, 50 - ((expectedRange.high - currentPrice) / (currentPrice || 1)) * 100))}%`,
              }}
            />
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