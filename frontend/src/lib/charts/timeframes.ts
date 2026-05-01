export type ChartTimeframe = "1D" | "1W" | "1M" | "3M" | "6M" | "1Y" | "2Y" | "MAX";

const TRADING_DAY_WINDOW: Record<ChartTimeframe, number | null> = {
  "1D": 2,
  "1W": 5,
  "1M": 21,
  "3M": 63,
  "6M": 126,
  "1Y": 252,
  "2Y": 504,
  "MAX": null,
};

export interface DatedChartRow {
  date: string;
}

function parseDate(value?: string): number | null {
  if (!value) return null;
  const time = Date.parse(value);
  return Number.isFinite(time) ? time : null;
}

export function dateGapInDays(previous?: string, next?: string): number {
  const prevMs = parseDate(previous);
  const nextMs = parseDate(next);
  if (prevMs === null || nextMs === null) return Number.POSITIVE_INFINITY;
  return Math.abs(nextMs - prevMs) / 86_400_000;
}

export function sliceSeriesByTimeframe<T>(rows: T[], timeframe: ChartTimeframe): T[] {
  const limit = TRADING_DAY_WINDOW[timeframe];
  if (!rows.length || limit === null || rows.length <= limit) {
    return rows;
  }
  return rows.slice(-limit);
}

export function newestContinuousSegment<T extends DatedChartRow>(rows: T[], maxGapDays = 14): T[] {
  if (rows.length <= 1) return rows;

  let startIndex = rows.length - 1;
  while (startIndex > 0) {
    const gapDays = dateGapInDays(rows[startIndex - 1]?.date, rows[startIndex]?.date);
    if (!Number.isFinite(gapDays) || gapDays > maxGapDays) {
      break;
    }
    startIndex -= 1;
  }

  return rows.slice(startIndex);
}

export function lastComparablePair<T extends DatedChartRow>(rows: T[], maxGapDays = 14): [T, T] | null {
  const segment = newestContinuousSegment(rows, maxGapDays);
  if (segment.length < 2) return null;
  return [segment[segment.length - 2], segment[segment.length - 1]];
}

export function firstChartTimeframe<T>(rows: T[], preferred: ChartTimeframe[], fallback: ChartTimeframe): ChartTimeframe {
  for (const option of preferred) {
    const sliced = sliceSeriesByTimeframe(rows, option);
    if (sliced.length >= 2) {
      return option;
    }
  }
  return fallback;
}
