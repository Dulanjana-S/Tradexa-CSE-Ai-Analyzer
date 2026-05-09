import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import { cn } from "../ui/utils";

interface MetricCardProps {
  title: string;
  value: string | number;
  change?: number;
  changePercent?: number;
  subtitle?: string;
  icon?: React.ReactNode;
  trend?: "up" | "down" | "neutral";
  loading?: boolean;
}

export function MetricCard({
  title,
  value,
  change,
  changePercent,
  subtitle,
  icon,
  trend,
  loading,
}: MetricCardProps) {
  const getTrendIcon = () => {
    if (trend === "up") return <TrendingUp className="h-4 w-4" />;
    if (trend === "down") return <TrendingDown className="h-4 w-4" />;
    return <Minus className="h-4 w-4" />;
  };

  const getTrendColor = () => {
    if (trend === "up") return "text-emerald-500";
    if (trend === "down") return "text-red-500";
    return "text-slate-500";
  };

  if (loading) {
    return (
      <Card className="bg-[var(--color-bg-secondary)] border-[var(--color-border)] shadow-none transition-all duration-200 hover:border-[#bf953f]/45 hover:shadow-[0_0_0_1px_rgba(191,149,63,0.10),0_10px_24px_rgba(0,0,0,0.20)]">
        <CardHeader className="pb-3 px-5 pt-5">
          <div className="h-3 w-20 bg-[var(--color-bg-tertiary)] animate-pulse rounded" />
        </CardHeader>
        <CardContent className="px-5 pb-5 space-y-2.5">
          <div className="h-7 w-32 bg-[var(--color-bg-tertiary)] animate-pulse rounded" />
          <div className="h-3.5 w-24 bg-[var(--color-bg-tertiary)] animate-pulse rounded" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="group relative overflow-hidden bg-[#0d1117] border-[#30363d] transition-all duration-200 shadow-none rounded-md hover:border-[#bf953f]/55 hover:shadow-[0_0_0_1px_rgba(191,149,63,0.10),0_14px_28px_rgba(0,0,0,0.30)]">
      <div className="absolute left-0 top-0 bottom-0 w-[2px] bg-[#30363d] transition-colors group-hover:bg-[#bf953f]/55" />
      <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-1.5 px-4 pt-4">
        <CardTitle className="text-[11px] font-bold uppercase tracking-[0.18em] text-[#e6edf3] transition-colors group-hover:text-[#f5efe2]">
          {title}
        </CardTitle>
        {icon && (
          <div className="text-[#484f58] opacity-60 transition-all group-hover:opacity-100 group-hover:text-[#bf953f]">
            {icon}
          </div>
        )}
      </CardHeader>
      <CardContent className="px-4 pb-4 pt-0">
        <div className="flex flex-col gap-1.5">
          <div className="text-[28px] font-bold text-[#e6edf3] tracking-tight leading-none tabular-nums transition-colors group-hover:text-[#f5efe2]">
            {value}
          </div>
          {(change !== undefined || changePercent !== undefined || subtitle) && (
            <div className="flex items-center gap-2">
              {trend && (
                <span
                  className={cn(
                    "inline-flex items-center gap-1 text-[14px] font-mono font-bold tabular-nums transition-all",
                    trend === "up" ? "text-emerald-400" : trend === "down" ? "text-red-400" : "text-slate-400"
                  )}
                >
                  {getTrendIcon()}
                  {changePercent !== undefined && (
                    <span>
                      {changePercent > 0 ? "+" : ""}
                      {changePercent.toFixed(2)}%
                    </span>
                  )}
                  {change !== undefined && !changePercent && (
                    <span>
                      {change > 0 ? "+" : ""}
                      {change.toFixed(2)}
                    </span>
                  )}
                </span>
              )}
              {subtitle && (
                <span className="text-[11px] font-semibold uppercase tracking-wider text-[#8f98a3] transition-colors group-hover:text-[#f0d9a8]">
                  {subtitle}
                </span>
              )}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}