from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Dict, Iterable, List, Optional, Tuple

SPLIT_CANDIDATES = [0.25, 1.0 / 3.0, 0.5, 2.0, 3.0, 4.0]


@dataclass
class CleanReport:
    symbol: str
    rows_in: int
    rows_out: int
    dropped_invalid: int
    dropped_duplicates: int
    adjusted_points: int
    adjustments: List[Dict[str, Any]]
    first_date: Optional[str]
    last_date: Optional[str]
    latest_close: Optional[float]

    def to_dict(self) -> Dict[str, Any]:
        return {
            "symbol": self.symbol,
            "rows_in": self.rows_in,
            "rows_out": self.rows_out,
            "dropped_invalid": self.dropped_invalid,
            "dropped_duplicates": self.dropped_duplicates,
            "adjusted_points": self.adjusted_points,
            "adjustments": self.adjustments,
            "first_date": self.first_date,
            "last_date": self.last_date,
            "latest_close": self.latest_close,
        }


def _f(v: Any) -> Optional[float]:
    if v in (None, ""):
        return None
    if isinstance(v, (int, float)):
        return float(v)
    s = str(v).strip().replace(",", "")
    if not s:
        return None
    try:
        return float(s)
    except Exception:
        return None


def _normalize_bar(raw: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    d = str(raw.get("date") or "")[:10]
    if len(d) != 10:
        return None
    close = _f(raw.get("close"))
    if close is None or close <= 0:
        return None
    open_ = _f(raw.get("open")) or close
    high = _f(raw.get("high")) or max(open_, close)
    low = _f(raw.get("low")) or min(open_, close)
    vol = _f(raw.get("volume")) or 0.0
    high = max(high, open_, close)
    low = min(low, open_, close)
    return {"date": d, "open": float(open_), "high": float(high), "low": float(low), "close": float(close), "volume": float(max(0.0, vol))}


def normalize_split_history(rows: Iterable[Dict[str, Any]]) -> Tuple[List[Dict[str, Any]], List[Dict[str, Any]]]:
    out = [dict(r) for r in rows]
    adjustments: List[Dict[str, Any]] = []
    if len(out) < 3:
        return out, adjustments
    for i in range(len(out) - 2, -1, -1):
        prev_close = float(out[i]["close"])
        next_close = float(out[i + 1]["close"])
        if prev_close <= 0 or next_close <= 0:
            continue
        ratio = next_close / prev_close
        matched = None
        for candidate in SPLIT_CANDIDATES:
            if abs(ratio - candidate) / candidate <= 0.04:
                matched = candidate
                break
        if matched is None or 0.65 <= ratio <= 1.35:
            continue
        adjustments.append({"effective_date": out[i + 1]["date"], "factor": round(ratio, 6), "reason": "split_like_gap"})
        for j in range(0, i + 1):
            for key in ("open", "high", "low", "close"):
                out[j][key] = round(float(out[j][key]) * ratio, 6)
    return out, adjustments


def clean_price_history(symbol: str, history: List[Dict[str, Any]], normalize_splits: bool = True) -> Tuple[List[Dict[str, Any]], CleanReport]:
    rows_in = len(history)
    by_date: Dict[str, Dict[str, Any]] = {}
    dropped_invalid = 0
    for raw in history:
        bar = _normalize_bar(raw)
        if bar is None:
            dropped_invalid += 1
            continue
        by_date[bar["date"]] = bar
    rows = [by_date[d] for d in sorted(by_date)]
    dropped_duplicates = max(0, rows_in - dropped_invalid - len(rows))
    adjustments: List[Dict[str, Any]] = []
    if normalize_splits and rows:
        rows, adjustments = normalize_split_history(rows)
    report = CleanReport(
        symbol=symbol.upper(),
        rows_in=rows_in,
        rows_out=len(rows),
        dropped_invalid=dropped_invalid,
        dropped_duplicates=dropped_duplicates,
        adjusted_points=len(adjustments),
        adjustments=adjustments,
        first_date=rows[0]["date"] if rows else None,
        last_date=rows[-1]["date"] if rows else None,
        latest_close=float(rows[-1]["close"]) if rows else None,
    )
    return rows, report


def audit_history(rows: List[Dict[str, Any]]) -> Dict[str, Any]:
    if not rows:
        return {"rows": 0, "first_date": None, "last_date": None, "missing_close": 0, "zero_volume_rows": 0, "suspicious_ranges": 0}
    zero_volume = 0
    suspicious_ranges = 0
    missing_close = 0
    for row in rows:
        close = _f(row.get("close"))
        if close is None or close <= 0:
            missing_close += 1
            continue
        vol = _f(row.get("volume")) or 0.0
        if vol <= 0:
            zero_volume += 1
        high = _f(row.get("high")) or close
        low = _f(row.get("low")) or close
        if high < low or (high - low) / close > 0.5:
            suspicious_ranges += 1
    return {
        "rows": len(rows),
        "first_date": str(rows[0].get("date")) if rows else None,
        "last_date": str(rows[-1].get("date")) if rows else None,
        "missing_close": missing_close,
        "zero_volume_rows": zero_volume,
        "suspicious_ranges": suspicious_ranges,
    }
