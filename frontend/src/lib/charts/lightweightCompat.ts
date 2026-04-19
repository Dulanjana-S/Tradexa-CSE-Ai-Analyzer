import * as LightweightCharts from 'lightweight-charts';

export const createChart = LightweightCharts.createChart;
export type IChartApi = LightweightCharts.IChartApi;
export type ISeriesApi<T = unknown> = any;
export type CandlestickData = LightweightCharts.CandlestickData;
export type HistogramData = LightweightCharts.HistogramData;
export type LineData = LightweightCharts.LineData;
export type AreaData = LightweightCharts.AreaData;
export type Time = LightweightCharts.Time;
export type MouseEventParams = LightweightCharts.MouseEventParams;

type SeriesKind = 'Area' | 'Line' | 'Candlestick' | 'Histogram';

function addSeriesCompat(chart: any, kind: SeriesKind, options: any) {
  const legacyMethod = `add${kind}Series`;
  if (typeof chart?.[legacyMethod] === 'function') {
    return chart[legacyMethod](options);
  }

  const modernCtor = (LightweightCharts as any)[`${kind}Series`];
  if (typeof chart?.addSeries === 'function' && modernCtor) {
    return chart.addSeries(modernCtor, options);
  }

  throw new Error(`Unsupported lightweight-charts series API for ${kind}`);
}

export function addAreaSeries(chart: any, options: any) {
  return addSeriesCompat(chart, 'Area', options);
}

export function addLineSeries(chart: any, options: any) {
  return addSeriesCompat(chart, 'Line', options);
}

export function addCandlestickSeries(chart: any, options: any) {
  return addSeriesCompat(chart, 'Candlestick', options);
}

export function addHistogramSeries(chart: any, options: any) {
  return addSeriesCompat(chart, 'Histogram', options);
}
