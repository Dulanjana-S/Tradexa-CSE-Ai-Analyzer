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
    if (trend === "up") return <TrendingUp className="h-3 w-3" />;
    if (trend === "down") return <TrendingDown className="h-3 w-3" />;
    return <Minus className="h-3 w-3" />;
  };

  const getTrendColor = () => {
    if (trend === "up") return "text-emerald-500";
    if (trend === "down") return "text-red-500";
    return "text-slate-500";
  };

  if (loading) {
    return (
      <Card className="bg-[var(--color-bg-secondary)] border-[var(--color-border)] shadow-none">
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
    <Card className="group relative overflow-hidden bg-[#0d1117] border-[#30363d] hover:border-[#444c56] transition-all duration-200 shadow-none rounded-md">
      <div className="absolute left-0 top-0 bottom-0 w-[2px] bg-[#30363d] group-hover:bg-[#bf953f]/40 transition-colors" />
      <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-1.5 px-4 pt-4">
        <CardTitle className="text-[10px] font-medium uppercase tracking-[0.2em] text-[#768390]">
          {title}
        </CardTitle>
        {icon && (
          <div className="text-[#484f58] opacity-60 group-hover:opacity-100 transition-opacity">
            {icon}
          </div>
        )}
      </CardHeader>
      <CardContent className="px-4 pb-4 pt-0">
        <div className="flex flex-col gap-1.5">
          <div className="text-[24px] font-medium text-[#e6edf3] tracking-tight leading-none tabular-nums">
            {value}
          </div>
          {(change !== undefined || changePercent !== undefined || subtitle) && (
            <div className="flex items-center gap-2">
              {trend && (
                <span
                  className={cn(
                    "inline-flex items-center gap-1 text-[11px] font-mono font-medium tabular-nums px-1.5 py-0.5 rounded-sm",
                    trend === "up" ? "bg-emerald-500/10 text-emerald-400" : trend === "down" ? "bg-red-500/10 text-red-400" : "bg-slate-500/10 text-slate-400"
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
                <span className="text-[11px] text-[#768390] font-medium uppercase tracking-wider">
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