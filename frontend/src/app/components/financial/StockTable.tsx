import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../ui/table";
import { Badge } from "../ui/badge";
import { TrendingUp, TrendingDown } from "lucide-react";
import { cn } from "../ui/utils";
import { Link } from "react-router";

export interface StockData {
  symbol: string;
  company: string;
  sector?: string;
  lastPrice: number;
  change: number;
  changePercent: number;
  volume?: number;
  signal?: "bullish" | "bearish" | "neutral";
  confidence?: number;
}

interface StockTableProps {
  stocks: StockData[];
  loading?: boolean;
  onRowClick?: (symbol: string) => void;
  compact?: boolean;
}

export function StockTable({ stocks, loading, onRowClick, compact = false }: StockTableProps) {
  if (loading) {
    return (
      <div className="overflow-hidden rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-secondary)]">
        <Table>
          <TableHeader>
            <TableRow className="border-[var(--border-subtle)] hover:bg-transparent">
              <TableHead className="h-9 text-[11px] font-semibold uppercase tracking-[0.06em] text-[var(--color-text-tertiary)]">Symbol</TableHead>
              <TableHead className="hidden h-9 text-[11px] font-semibold uppercase tracking-[0.06em] text-[var(--color-text-tertiary)] sm:table-cell">Company</TableHead>
              <TableHead className="h-9 text-right text-[11px] font-semibold uppercase tracking-[0.06em] text-[var(--color-text-tertiary)]">Last Price</TableHead>
              <TableHead className="h-9 text-right text-[11px] font-semibold uppercase tracking-[0.06em] text-[var(--color-text-tertiary)]">Change</TableHead>
              <TableHead className="hidden h-9 text-right text-[11px] font-semibold uppercase tracking-[0.06em] text-[var(--color-text-tertiary)] md:table-cell">Volume</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {[1, 2, 3, 4, 5].map((i) => (
              <TableRow key={i} className="border-[var(--border-subtle)]">
                <TableCell className="py-3">
                  <div className="h-4 w-20 animate-pulse rounded bg-[var(--color-bg-tertiary)]" />
                </TableCell>
                <TableCell className="hidden py-3 sm:table-cell">
                  <div className="h-4 w-36 animate-pulse rounded bg-[var(--color-bg-tertiary)]" />
                </TableCell>
                <TableCell className="py-3">
                  <div className="ml-auto h-4 w-16 animate-pulse rounded bg-[var(--color-bg-tertiary)]" />
                </TableCell>
                <TableCell className="py-3">
                  <div className="ml-auto h-4 w-16 animate-pulse rounded bg-[var(--color-bg-tertiary)]" />
                </TableCell>
                <TableCell className="hidden py-3 md:table-cell">
                  <div className="ml-auto h-4 w-20 animate-pulse rounded bg-[var(--color-bg-tertiary)]" />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    );
  }

  if (stocks.length === 0) {
    return (
      <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-secondary)] p-12 text-center">
        <p className="text-sm text-[var(--color-text-secondary)]">No stocks found</p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden">
      {/* Desktop/Tablet Table View */}
      <div className="hidden overflow-x-auto sm:block">
        <Table>
          <TableHeader>
            <TableRow className="border-[var(--border-subtle)] hover:bg-transparent">
              <TableHead className="h-9 text-[11px] font-semibold uppercase tracking-[0.06em] text-[var(--color-text-tertiary)]">
                Symbol
              </TableHead>
              {!compact && (
                <TableHead className="h-9 text-[11px] font-semibold uppercase tracking-[0.06em] text-[var(--color-text-tertiary)]">
                  Company
                </TableHead>
              )}
              {!compact && (
                <TableHead className="hidden h-9 text-[11px] font-semibold uppercase tracking-[0.06em] text-[var(--color-text-tertiary)] lg:table-cell">
                  Sector
                </TableHead>
              )}
              <TableHead className="h-9 text-right text-[11px] font-semibold uppercase tracking-[0.06em] text-[var(--color-text-tertiary)]">
                Last Price
              </TableHead>
              <TableHead className="h-9 text-right text-[11px] font-semibold uppercase tracking-[0.06em] text-[var(--color-text-tertiary)]">
                Change
              </TableHead>
              {!compact && (
                <TableHead className="hidden h-9 text-right text-[11px] font-semibold uppercase tracking-[0.06em] text-[var(--color-text-tertiary)] md:table-cell">
                  Volume
                </TableHead>
              )}
              {!compact && (
                <TableHead className="hidden h-9 text-[11px] font-semibold uppercase tracking-[0.06em] text-[var(--color-text-tertiary)] xl:table-cell">
                  Signal
                </TableHead>
              )}
            </TableRow>
          </TableHeader>
          <TableBody>
            {stocks.map((stock) => (
              <TableRow
                key={stock.symbol}
                className="cursor-pointer border-[var(--border-subtle)] transition-colors hover:bg-[var(--hover-bg)]"
                onClick={() => onRowClick?.(stock.symbol)}
              >
                <TableCell className="py-2.5 font-semibold text-[var(--color-text-primary)]">
                  <Link to={`/stock/${stock.symbol}`} className="transition-colors hover:text-emerald-500">
                    {stock.symbol}
                  </Link>
                </TableCell>
                {!compact && (
                  <TableCell className="max-w-xs truncate py-2.5 text-[13px] text-[var(--color-text-secondary)]">
                    {stock.company}
                  </TableCell>
                )}
                {!compact && (
                  <TableCell className="hidden py-2.5 text-[12px] text-[var(--color-text-tertiary)] lg:table-cell">
                    {stock.sector || "—"}
                  </TableCell>
                )}
                <TableCell className="py-2.5 text-right font-semibold tabular-nums text-[var(--color-text-primary)]">
                  {stock.lastPrice.toFixed(2)}
                </TableCell>
                <TableCell className="py-2.5 text-right">
                  <div className="flex items-center justify-end gap-1.5">
                    {stock.changePercent > 0 ? (
                      <TrendingUp className="h-3 w-3 text-emerald-500" />
                    ) : stock.changePercent < 0 ? (
                      <TrendingDown className="h-3 w-3 text-red-500" />
                    ) : null}
                    <span
                      className={cn(
                        "text-[13px] font-semibold tabular-nums",
                        stock.changePercent > 0
                          ? "text-emerald-500"
                          : stock.changePercent < 0
                          ? "text-red-500"
                          : "text-[var(--color-text-tertiary)]"
                      )}
                    >
                      {stock.changePercent > 0 ? "+" : ""}
                      {stock.changePercent.toFixed(2)}%
                    </span>
                  </div>
                </TableCell>
                {!compact && (
                  <TableCell className="hidden py-2.5 text-right font-mono text-[12px] tabular-nums text-[var(--color-text-tertiary)] md:table-cell">
                    {stock.volume ? stock.volume.toLocaleString() : "—"}
                  </TableCell>
                )}
                {!compact && (
                  <TableCell className="hidden py-2.5 xl:table-cell">
                    {stock.signal && (
                      <Badge
                        variant={
                          stock.signal === "bullish"
                            ? "default"
                            : stock.signal === "bearish"
                            ? "destructive"
                            : "secondary"
                        }
                        className={cn(
                          "text-[11px] font-semibold",
                          stock.signal === "bullish" && "bg-emerald-600 hover:bg-emerald-700",
                          stock.signal === "neutral" && "bg-[var(--color-bg-tertiary)] text-[var(--color-text-secondary)] hover:bg-[var(--border-hover)]"
                        )}
                      >
                        {stock.signal}
                        {stock.confidence && ` ${(stock.confidence * 100).toFixed(0)}%`}
                      </Badge>
                    )}
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Mobile Card View */}
      <div className="divide-y divide-[var(--border-subtle)] sm:hidden">
        {stocks.map((stock) => (
          <Link
            key={stock.symbol}
            to={`/stock/${stock.symbol}`}
            className="block p-4 transition-colors hover:bg-[var(--hover-bg)]"
            onClick={() => onRowClick?.(stock.symbol)}
          >
            <div className="mb-2 flex items-start justify-between">
              <div className="flex-1">
                <div className="mb-1 font-bold text-[var(--color-text-primary)]">{stock.symbol}</div>
                {!compact && (
                  <div className="truncate pr-4 text-[12px] text-[var(--color-text-tertiary)]">{stock.company}</div>
                )}
              </div>
              <div className="text-right">
                <div className="text-base font-bold tabular-nums text-[var(--color-text-primary)]">
                  {stock.lastPrice.toFixed(2)}
                </div>
                <div className={cn(
                  "flex items-center justify-end gap-1 text-[13px] font-semibold tabular-nums",
                  stock.changePercent > 0 ? "text-emerald-500" : stock.changePercent < 0 ? "text-red-500" : "text-[var(--color-text-tertiary)]"
                )}>
                  {stock.changePercent > 0 ? (
                    <TrendingUp className="h-3 w-3" />
                  ) : stock.changePercent < 0 ? (
                    <TrendingDown className="h-3 w-3" />
                  ) : null}
                  <span>
                    {stock.changePercent > 0 ? "+" : ""}
                    {stock.changePercent.toFixed(2)}%
                  </span>
                </div>
              </div>
            </div>
            {!compact && stock.volume && (
              <div className="mt-2 flex items-center justify-between border-t border-[var(--border-subtle)] pt-2 text-[12px] text-[var(--color-text-tertiary)]">
                <span>Volume: {stock.volume.toLocaleString()}</span>
                {stock.sector && <span>{stock.sector}</span>}
              </div>
            )}
          </Link>
        ))}
      </div>
    </div>
  );
}
