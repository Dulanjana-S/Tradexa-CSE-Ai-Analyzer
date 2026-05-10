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
  className?: string;
  center?: boolean;
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
  className,
  center,
}: MetricCardProps) {
  const getTrendIcon = () => {
    if (trend === "up") return <TrendingUp className="h-3.5 w-3.5 sm:h-4 sm:w-4" />;
    if (trend === "down") return <TrendingDown className="h-3.5 w-3.5 sm:h-4 sm:w-4" />;
    return <Minus className="h-3.5 w-3.5 sm:h-4 sm:w-4" />;
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
    <Card className={cn(
      "group relative overflow-hidden bg-[var(--color-bg-secondary)] border-[var(--color-border)] transition-all duration-300 shadow-none rounded-xl hover:border-[#bf953f]/55 hover:shadow-[0_0_25px_-5px_rgba(191,149,63,0.15)]",
      className
    )}>
      {/* Dynamic background glow based on trend */}
      <div className={cn(
        "absolute -right-8 -top-8 h-24 w-24 rounded-full blur-[40px] opacity-[0.03] transition-opacity group-hover:opacity-[0.07]",
        trend === "up" ? "bg-emerald-500" : trend === "down" ? "bg-red-500" : "bg-slate-500"
      )} />
      <div className="absolute left-0 top-0 bottom-0 w-[2px] bg-[var(--color-border)] transition-colors group-hover:bg-[#bf953f]/55" />
      <CardHeader className={cn(
        "flex flex-row items-start justify-between space-y-0 pb-1.5 px-3 pt-3 sm:px-4 sm:pt-4",
        center && "flex-col items-center justify-center text-center gap-2"
      )}>
        <CardTitle className={cn(
          "text-[14px] sm:text-[15px] font-extrabold uppercase tracking-[0.22em] text-[var(--color-text-primary)] transition-colors group-hover:text-[var(--color-text-primary)]",
          center && "text-center"
        )}>
          {title}
        </CardTitle>
        {icon && (
          <div className={cn(
            "text-[var(--color-text-muted)] opacity-60 transition-all group-hover:opacity-100 group-hover:text-emerald-600",
            center && "absolute right-4 top-4"
          )}>
            {icon}
          </div>
        )}
      </CardHeader>
      <CardContent className={cn(
        "px-3 pb-4 pt-0 sm:px-5 sm:pb-5",
        center && "flex flex-col items-center justify-center text-center"
      )}>
        <div className={cn(
          "flex flex-col gap-1.5 sm:gap-2",
          center && "items-center"
        )}>
          <div className={cn(
            "text-[24px] sm:text-[32px] font-bold text-[var(--color-text-primary)] tracking-tight leading-none tabular-nums transition-colors group-hover:text-[var(--color-text-primary)]",
            center && "text-center"
          )}>
            {value}
          </div>
          {(change !== undefined || changePercent !== undefined || subtitle) && (
            <div className={cn(
              "flex items-center gap-2",
              center && "justify-center"
            )}>
              {trend && (
                <span
                  className={cn(
                    "inline-flex items-center gap-1.5 text-[14px] sm:text-[16px] font-mono font-bold tabular-nums transition-all",
                    center && "justify-center",
                    trend === "up" ? "text-emerald-400" : trend === "down" ? "text-red-400" : "text-[var(--color-text-tertiary)]"
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
                <span className="text-[13px] sm:text-[14px] font-bold uppercase tracking-wider text-[var(--color-text-tertiary)] transition-colors group-hover:text-[var(--color-text-secondary)]">
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