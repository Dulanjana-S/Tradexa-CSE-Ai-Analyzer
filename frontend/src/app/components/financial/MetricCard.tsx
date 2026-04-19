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
    <Card className="group bg-[var(--color-bg-secondary)] border-[var(--color-border)] hover:border-[var(--border-hover)] hover:bg-[var(--color-bg-tertiary)] transition-all duration-150 shadow-none">
      <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2 px-5 pt-5">
        <CardTitle className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[var(--color-text-tertiary)]">
          {title}
        </CardTitle>
        {icon && (
          <div className="text-[var(--color-text-tertiary)] opacity-50 group-hover:opacity-70 transition-opacity">
            {icon}
          </div>
        )}
      </CardHeader>
      <CardContent className="px-5 pb-5 pt-1">
        <div className="flex flex-col gap-2">
          <div className="text-[28px] font-bold text-[var(--color-text-primary)] tracking-tight leading-none tabular-nums">
            {value}
          </div>
          {(change !== undefined || changePercent !== undefined || subtitle) && (
            <div className="flex items-center gap-2">
              {trend && (
                <span
                  className={cn(
                    "inline-flex items-center gap-1 text-[13px] font-semibold tabular-nums",
                    getTrendColor()
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
                <span className="text-[13px] text-[var(--color-text-secondary)] font-normal">
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