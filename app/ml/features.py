from __future__ import annotations

from typing import Dict, List, Optional, Tuple

import numpy as np
import pandas as pd


def _rsi(close: pd.Series, period: int = 14) -> pd.Series:
    delta = close.diff()
    gain = delta.where(delta > 0, 0.0)
    loss = (-delta).where(delta < 0, 0.0)
    avg_gain = gain.rolling(period).mean()
    avg_loss = loss.rolling(period).mean()
    rs = avg_gain / (avg_loss.replace(0, np.nan))
    return (100 - (100 / (1 + rs))).fillna(50.0)


def _ema(s: pd.Series, span: int) -> pd.Series:
    return s.ewm(span=span, adjust=False).mean()


def make_feature_frame(
    prices: List[Dict],
    index_series: Optional[List[Dict]] = None,
    symbol: Optional[str] = None,
    horizon_days: int = 1,
) -> Tuple[pd.DataFrame, List[str]]:
    if not prices or len(prices) < 80:
        return pd.DataFrame(), []
    df = pd.DataFrame(prices).copy()
    df["date"] = pd.to_datetime(df["date"])
    df = df.sort_values("date")
    for col in ["open", "high", "low", "close", "volume"]:
        if col in df.columns:
            df[col] = pd.to_numeric(df[col], errors="coerce")

    close = df["close"]
    open_ = df.get("open", close)
    high = df.get("high", close)
    low = df.get("low", close)
    vol = pd.to_numeric(df.get("volume"), errors="coerce") if "volume" in df.columns else None
    prev_close = close.shift(1)

    ret1 = close.pct_change(1)
    df["ret_1d"] = ret1
    df["ret_5d"] = close.pct_change(5)
    df["ret_20d"] = close.pct_change(20)
    df["ret_60d"] = close.pct_change(60)
    df["trend_20d"] = close / close.shift(20) - 1.0
    df["vol_20d"] = ret1.rolling(20).std()
    df["vol_60d"] = ret1.rolling(60).std()

    df["gap_1d"] = open_ / prev_close - 1.0
    df["range_pct"] = (high - low) / close.replace(0, np.nan)
    df["close_to_high"] = close / high.replace(0, np.nan) - 1.0
    df["close_to_low"] = close / low.replace(0, np.nan) - 1.0
    df["breakout_20"] = close / high.rolling(20).max().replace(0, np.nan) - 1.0
    df["drawdown_60"] = close / close.rolling(60).max().replace(0, np.nan) - 1.0

    tr_parts = pd.concat([(high - low).abs(), (high - prev_close).abs(), (low - prev_close).abs()], axis=1)
    df["atr_14_ratio"] = tr_parts.max(axis=1).rolling(14).mean() / close.replace(0, np.nan)

    for w in [5, 10, 20, 50]:
        df[f"sma_{w}"] = close.rolling(w).mean()
        df[f"sma_ratio_{w}"] = close / df[f"sma_{w}"] - 1.0
        df[f"ema_{w}"] = _ema(close, w)
        df[f"ema_ratio_{w}"] = close / df[f"ema_{w}"] - 1.0

    df["rsi_14"] = _rsi(close, 14)
    ema12 = _ema(close, 12)
    ema26 = _ema(close, 26)
    macd = ema12 - ema26
    signal = _ema(macd, 9)
    df["macd"] = macd
    df["macd_signal"] = signal
    df["macd_hist"] = macd - signal

    mid = close.rolling(20).mean()
    std = close.rolling(20).std()
    upper = mid + 2 * std
    lower = mid - 2 * std
    df["bb_pct"] = (close - lower) / (upper - lower)
    df["bb_width"] = (upper - lower) / (mid.replace(0, np.nan))

    if vol is not None:
        df["vol_chg"] = vol.pct_change(1)
        df["vol_z_20"] = (vol - vol.rolling(20).mean()) / vol.rolling(20).std()
        df["turnover_proxy"] = close * vol
        df["turnover_trend_5"] = df["turnover_proxy"].pct_change(5)
        df["liquidity_ratio_20"] = vol / vol.rolling(20).mean().replace(0, np.nan)
        df["zero_vol"] = (vol.fillna(0) <= 0).astype(float)
        df["zero_vol_20"] = df["zero_vol"].rolling(20).mean()
    else:
        for c in ["vol_chg", "vol_z_20", "turnover_proxy", "turnover_trend_5", "liquidity_ratio_20", "zero_vol_20"]:
            df[c] = np.nan

    idx_feature_cols: List[str] = []
    if index_series:
        idx = pd.DataFrame(index_series).copy()
        if "date" in idx.columns and "value" in idx.columns:
            idx["date"] = pd.to_datetime(idx["date"])
            idx = idx.sort_values("date")
            idx["idx_ret_1d"] = idx["value"].pct_change(1)
            idx["idx_ret_5d"] = idx["value"].pct_change(5)
            idx["idx_ret_20d"] = idx["value"].pct_change(20)
            idx["idx_trend"] = idx["value"] / idx["value"].rolling(50).mean() - 1.0
            idx["idx_vol_20"] = idx["idx_ret_1d"].rolling(20).std()
            df = df.merge(idx[["date", "idx_ret_1d", "idx_ret_5d", "idx_ret_20d", "idx_trend", "idx_vol_20"]], on="date", how="left")
            df["rel_ret_20d"] = df["ret_20d"] - df["idx_ret_20d"]
            df["rel_ret_5d"] = df["ret_5d"] - df["idx_ret_5d"]
            df["rel_vol_20"] = df["vol_20d"] - df["idx_vol_20"]
            cov = ret1.rolling(60).cov(df["idx_ret_1d"])
            var = df["idx_ret_1d"].rolling(60).var().replace(0, np.nan)
            df["beta_60"] = cov / var
            idx_feature_cols = [
                "idx_ret_1d",
                "idx_ret_5d",
                "idx_ret_20d",
                "idx_trend",
                "idx_vol_20",
                "rel_ret_20d",
                "rel_ret_5d",
                "rel_vol_20",
                "beta_60",
            ]

    df["target_return"] = close.shift(-horizon_days) / close - 1.0
    df["target_up"] = (df["target_return"] > 0).astype(int)
    df["symbol"] = symbol
    df = df.replace([np.inf, -np.inf], np.nan)

    feature_cols = [
        "ret_1d", "ret_5d", "ret_20d", "ret_60d", "trend_20d",
        "vol_20d", "vol_60d", "gap_1d", "range_pct", "close_to_high", "close_to_low",
        "breakout_20", "drawdown_60", "atr_14_ratio", "rsi_14", "macd", "macd_signal",
        "macd_hist", "bb_pct", "bb_width", "vol_chg", "vol_z_20", "turnover_proxy",
        "turnover_trend_5", "liquidity_ratio_20", "zero_vol_20",
    ]
    for w in [5, 10, 20, 50]:
        feature_cols.extend([f"sma_ratio_{w}", f"ema_ratio_{w}"])
    if idx_feature_cols:
        # Ignore index-derived features when the merged index history is too sparse,
        # otherwise all rows can be dropped during feature cleaning.
        coverage = float(df[idx_feature_cols].notna().mean().mean())
        if coverage >= 0.6:
            feature_cols.extend([c for c in idx_feature_cols if c in df.columns])

    df = df.dropna(subset=["target_return"])
    df = df.dropna(subset=feature_cols, how="any")
    return df, feature_cols
