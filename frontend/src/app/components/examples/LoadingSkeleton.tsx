import { cn } from "../ui/utils";

interface SkeletonProps {
  className?: string;
}

/**
 * Skeleton Base Component
 * 
 * A simple skeleton loader for content placeholders.
 * Follows TradexaLK Design System specifications.
 */
export function Skeleton({ className }: SkeletonProps) {
  return (
    <div className={cn("bg-slate-800 animate-pulse rounded", className)} />
  );
}

/**
 * TextLineSkeleton Component
 * 
 * Skeleton for text lines with configurable width.
 * 
 * @example
 * ```tsx
 * <TextLineSkeleton width="full" />
 * <TextLineSkeleton width="3/4" />
 * ```
 */
export function TextLineSkeleton({ width = "full" }: { width?: "full" | "3/4" | "1/2" | "1/4" }) {
  const widthClasses = {
    full: "w-full",
    "3/4": "w-3/4",
    "1/2": "w-1/2",
    "1/4": "w-1/4",
  };

  return <Skeleton className={cn("h-4", widthClasses[width])} />;
}

/**
 * ParagraphSkeleton Component
 * 
 * Skeleton for a paragraph with multiple lines.
 * 
 * @example
 * ```tsx
 * <ParagraphSkeleton lines={3} />
 * ```
 */
export function ParagraphSkeleton({ lines = 3 }: { lines?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton
          key={i}
          className={cn(
            "h-4",
            i === lines - 1 ? "w-2/3" : "w-full"
          )}
        />
      ))}
    </div>
  );
}

/**
 * MetricCardSkeleton Component
 * 
 * Skeleton for financial metric cards.
 * 
 * @example
 * ```tsx
 * <MetricCardSkeleton />
 * ```
 */
export function MetricCardSkeleton() {
  return (
    <div className="bg-[#111823] border border-[#1e2938] rounded-lg p-6">
      <Skeleton className="h-3 w-16 mb-3" />
      <Skeleton className="h-8 w-24 mb-2" />
      <Skeleton className="h-3 w-20" />
    </div>
  );
}

/**
 * CardSkeleton Component
 * 
 * Skeleton for content cards.
 * 
 * @example
 * ```tsx
 * <CardSkeleton />
 * ```
 */
export function CardSkeleton() {
  return (
    <div className="bg-[#111823] border border-[#1e2938] rounded-lg p-6">
      <Skeleton className="h-6 w-32 mb-4" />
      <div className="space-y-2">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-5/6" />
      </div>
    </div>
  );
}

/**
 * TableRowSkeleton Component
 * 
 * Skeleton for table rows.
 * 
 * @example
 * ```tsx
 * <table>
 *   <tbody>
 *     <TableRowSkeleton columns={5} />
 *     <TableRowSkeleton columns={5} />
 *   </tbody>
 * </table>
 * ```
 */
export function TableRowSkeleton({ columns = 5 }: { columns?: number }) {
  return (
    <tr className="border-b border-[#1e2938]">
      {Array.from({ length: columns }).map((_, i) => (
        <td key={i} className="px-4 py-3">
          <Skeleton className={cn("h-4", i === 0 ? "w-20" : i === columns - 1 ? "w-16" : "w-32")} />
        </td>
      ))}
    </tr>
  );
}

/**
 * StockTableSkeleton Component
 * 
 * Skeleton for complete stock tables.
 * 
 * @example
 * ```tsx
 * <StockTableSkeleton rows={5} />
 * ```
 */
export function StockTableSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="rounded-lg border border-[#1e2938] bg-[#0a0e14] overflow-hidden">
      <table className="w-full">
        <thead className="border-b border-[#1e2938] bg-[#0f1419]">
          <tr>
            <th className="text-left px-4 py-3">
              <Skeleton className="h-3 w-16" />
            </th>
            <th className="text-left px-4 py-3">
              <Skeleton className="h-3 w-20" />
            </th>
            <th className="text-right px-4 py-3">
              <Skeleton className="h-3 w-16 ml-auto" />
            </th>
            <th className="text-right px-4 py-3">
              <Skeleton className="h-3 w-16 ml-auto" />
            </th>
            <th className="text-right px-4 py-3">
              <Skeleton className="h-3 w-16 ml-auto" />
            </th>
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: rows }).map((_, i) => (
            <TableRowSkeleton key={i} columns={5} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * ChartSkeleton Component
 * 
 * Skeleton for chart components.
 * 
 * @example
 * ```tsx
 * <ChartSkeleton height="h-64" />
 * ```
 */
export function ChartSkeleton({ height = "h-64" }: { height?: string }) {
  return (
    <div className="bg-[#111823] border border-[#1e2938] rounded-lg p-6">
      <Skeleton className="h-6 w-32 mb-4" />
      <Skeleton className={cn("w-full", height)} />
    </div>
  );
}
