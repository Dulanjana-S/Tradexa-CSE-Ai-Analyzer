import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";
import { Button } from "../ui/button";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { LineChart, Line } from "recharts";
import { TrendingUp } from "lucide-react";
import { useState } from "react";

interface ChartDataPoint {
  date: string;
  value: number;
  volume?: number;
}

interface ChartCardProps {
  title: string;
  data: ChartDataPoint[];
  timeframe?: string;
  description?: string;
  showVolume?: boolean;
  loading?: boolean;
  onTimeframeChange?: (timeframe: string) => void;
  type?: "area" | "line" | "candlestick";
  color?: string;
}

export function ChartCard({
  title,
  data,
  timeframe = "1M",
  description,
  showVolume = false,
  loading,
  onTimeframeChange,
  type = "area",
  color = "#10b981",
}: ChartCardProps) {
  const [selectedTimeframe, setSelectedTimeframe] = useState('ALL');

  const timeframes = ['1M', '3M', '6M', '1Y', 'ALL'];

  const handleTimeframeChange = (tf: string) => {
    setSelectedTimeframe(tf);
    onTimeframeChange?.(tf);
  };

  const filteredData = (() => {
    if (selectedTimeframe === "ALL") return data;

    let count = 30;
    switch (selectedTimeframe) {
      case "1M": count = 30; break;
      case "3M": count = 90; break;
      case "6M": count = 180; break;
      case "1Y": count = 365; break;
      default: count = data.length;
    }

    return data.slice(-count);
  })();

  const isTrendingUp = filteredData.length >= 2
    ? filteredData[filteredData.length - 1].value >= filteredData[0].value
    : true;

  const trendColor = isTrendingUp ? "#10b981" : "#ef4444";

  if (loading) {
    return (
      <Card className="bg-[var(--color-bg-secondary)] border-[var(--color-border)] shadow-sm">
        <CardHeader className="pb-4">
          <CardTitle>{title}</CardTitle>
          {description && <CardDescription>{description}</CardDescription>}
        </CardHeader>
        <CardContent>
          <div className="h-80 bg-[var(--color-bg-primary)] animate-pulse rounded-lg" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-[var(--color-bg-secondary)] border-[var(--color-border)] shadow-sm overflow-hidden">
      <CardHeader className="pb-4 border-b border-[var(--color-border)]">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1 flex-1">
            <CardTitle className="flex items-center gap-2 text-lg">
              <div className="w-1 h-5 bg-emerald-500 rounded-full" />
              {title}
            </CardTitle>
            {description && (
              <CardDescription className="text-sm text-slate-500">
                {description}
              </CardDescription>
            )}
          </div>
          <div className="flex items-center gap-0.5 bg-[var(--color-bg-primary)] rounded-lg p-0.5 border border-[var(--color-border)]">
            {timeframes.map((tf) => (
              <Button
                key={tf}
                variant="ghost"
                size="sm"
                onClick={() => handleTimeframeChange(tf)}
                className={`h-7 px-3 text-[11px] font-semibold transition-all ${selectedTimeframe === tf
                    ? 'bg-emerald-600 text-white shadow-sm'
                    : 'text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-bg-tertiary)]'
                  }`}
              >
                {tf}
              </Button>
            ))}
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-6 pb-4 bg-[var(--color-bg-primary)]">
        <ResponsiveContainer width="100%" height={320}>
          {type === "area" ? (
            <AreaChart data={filteredData} margin={{ top: 0, right: 8, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id={`colorValue-${title.replace(/\s+/g, '-')}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={trendColor} stopOpacity={0.3} />
                  <stop offset="95%" stopColor={trendColor} stopOpacity={0} />
                </linearGradient>
              </defs>
               <CartesianGrid 
                strokeDasharray="3 3" 
                stroke="var(--color-border)" 
                vertical={false}
                strokeOpacity={0.5}
              />
              <XAxis
                dataKey="date"
                stroke="#6b7280"
                fontSize={11}
                tickLine={false}
                axisLine={false}
                dy={8}
              />
              <YAxis
                stroke="#6b7280"
                fontSize={11}
                tickLine={false}
                axisLine={false}
                tickFormatter={(value) => value.toLocaleString()}
                domain={['auto', 'auto']}
                dx={-8}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: "#111823",
                  border: "1px solid #2d3748",
                  borderRadius: "8px",
                  color: "#e4e7eb",
                  padding: "8px 12px",
                  fontSize: "12px",
                  boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.3)",
                }}
                labelStyle={{ color: "#9ca3af", marginBottom: "4px", fontSize: "11px" }}
              />
              <Area
                type="monotone"
                dataKey="value"
                stroke={trendColor}
                strokeWidth={2.5}
                fillOpacity={1}
                fill={`url(#colorValue-${title.replace(/\s+/g, '-')})`}
              />
            </AreaChart>
          ) : (
            <LineChart data={filteredData} margin={{ top: 0, right: 8, left: -20, bottom: 0 }}>
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="#1e2938"
                vertical={false}
                strokeOpacity={0.5}
              />
              <XAxis
                dataKey="date"
                stroke="#6b7280"
                fontSize={11}
                tickLine={false}
                axisLine={false}
                dy={8}
              />
              <YAxis
                stroke="#6b7280"
                fontSize={11}
                tickLine={false}
                axisLine={false}
                tickFormatter={(value) => value.toLocaleString()}
                domain={['auto', 'auto']}
                dx={-8}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: "#111823",
                  border: "1px solid #2d3748",
                  borderRadius: "8px",
                  color: "#e4e7eb",
                  padding: "8px 12px",
                  fontSize: "12px",
                  boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.3)",
                }}
                labelStyle={{ color: "#9ca3af", marginBottom: "4px", fontSize: "11px" }}
              />
              <Line
                type="monotone"
                dataKey="value"
                stroke={trendColor}
                strokeWidth={2.5}
                dot={false}
              />
            </LineChart>
          )}
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}