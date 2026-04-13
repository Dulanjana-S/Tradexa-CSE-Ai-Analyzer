
"""
Mock data generator for the CSE AI .

"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime, timedelta
import json
import math
import random
import statistics
from pathlib import Path
from typing import Dict, List, Optional, Tuple, Any


SEED = 7  # reproducible demo

DEMO_SYMBOLS = [
    ("LOLC.N0000", "LOLC Holdings PLC", "Financials"),
    ("COMB.N0000", "Commercial Bank of Ceylon PLC", "Financials"),
    ("JKH.N0000", "John Keells Holdings PLC", "Diversified"),
    ("DIPD.N0000", "Dipped Products PLC", "Manufacturing"),
    ("HAYL.N0000", "Hayleys PLC", "Diversified"),
    ("DFCC.N0000", "DFCC Bank PLC", "Financials"),
    ("LIOC.N0000", "Lanka IOC PLC", "Energy"),
    ("CARG.N0000", "Cargills (Ceylon) PLC", "Consumer"),
    ("CTC.N0000", "Ceylon Tobacco Company PLC", "Consumer"),
    ("MELS.N0000", "Melstacorp PLC", "Consumer"),
    ("RICH.N0000", "Richard Pieris & Company PLC", "Industrials"),
    ("HNB.N0000", "Hatton National Bank PLC", "Financials"),
    ("BFL.N0000", "Browns Investments PLC", "Diversified"),
    ("TKYO.N0000", "Tokyo Cement Company (Lanka) PLC", "Materials"),
    ("LFIN.N0000", "LB Finance PLC", "Financials"),
]

ANN_TYPES = ["Financial", "Corporate Action", "Press Release", "Board Decision", "Disclosure"]


def business_days(end: date, n: int) -> List[date]:
    """Get the last n weekday dates (Mon-Fri)."""
    out: List[date] = []
    d = end
    while len(out) < n:
        if d.weekday() < 5:
            out.append(d)
        d -= timedelta(days=1)
    return list(reversed(out))


def _gen_ohlcv_series(
    dates: List[date],
    start_price: float,
    drift: float,
    vol: float,
    base_volume: int,
    rng: random.Random,
) -> List[dict]:
    """
    Synthetic OHLCV. Not intended for realism; just 'plausible enough' for a UI demo.
    """
    series: List[dict] = []
    prev_close = start_price
    for d in dates:
        # daily return
        r = rng.gauss(drift, vol)
        open_p = max(0.5, prev_close * (1 + rng.gauss(0, vol / 5)))
        close_p = max(0.5, open_p * (1 + r))

        hi = max(open_p, close_p) * (1 + abs(rng.gauss(0, vol / 3)))
        lo = min(open_p, close_p) * (1 - abs(rng.gauss(0, vol / 3)))
        lo = max(0.5, lo)

        volume = int(max(0, rng.gauss(base_volume, base_volume * 0.35)))
        trades = int(max(1, volume / max(1, rng.randint(200, 1200))))
        vwap = (open_p + close_p + hi + lo) / 4

        series.append(
            {
                "date": d.isoformat(),
                "open": round(open_p, 2),
                "high": round(hi, 2),
                "low": round(lo, 2),
                "close": round(close_p, 2),
                "volume": int(volume),
                "trades": int(trades),
                "vwap": round(vwap, 2),
            }
        )
        prev_close = close_p
    return series


def _pct_change(a: float, b: float) -> float:
    return (a - b) / b if b != 0 else 0.0


def _sma(values: List[float], window: int) -> List[Optional[float]]:
    out: List[Optional[float]] = [None] * len(values)
    if window <= 0:
        return out
    s = 0.0
    q: List[float] = []
    for i, v in enumerate(values):
        q.append(v)
        s += v
        if len(q) > window:
            s -= q.pop(0)
        if len(q) == window:
            out[i] = s / window
    return out


def _rsi(values: List[float], period: int = 14) -> List[Optional[float]]:
    """
    Simple RSI implementation (Wilder's smoothing).
    Returns list aligned with values, first period entries are None.
    """
    out: List[Optional[float]] = [None] * len(values)
    if len(values) < period + 1:
        return out

    gains: List[float] = []
    losses: List[float] = []
    for i in range(1, period + 1):
        ch = values[i] - values[i - 1]
        gains.append(max(0.0, ch))
        losses.append(max(0.0, -ch))

    avg_gain = sum(gains) / period
    avg_loss = sum(losses) / period

    def rs_to_rsi(rs: float) -> float:
        return 100 - (100 / (1 + rs))

    if avg_loss == 0:
        out[period] = 100.0
    else:
        out[period] = rs_to_rsi(avg_gain / avg_loss)

    for i in range(period + 1, len(values)):
        ch = values[i] - values[i - 1]
        gain = max(0.0, ch)
        loss = max(0.0, -ch)
        avg_gain = (avg_gain * (period - 1) + gain) / period
        avg_loss = (avg_loss * (period - 1) + loss) / period
        if avg_loss == 0:
            out[i] = 100.0
        else:
            out[i] = rs_to_rsi(avg_gain / avg_loss)

    return out


def _zscore(values: List[float], window: int) -> List[Optional[float]]:
    out: List[Optional[float]] = [None] * len(values)
    for i in range(len(values)):
        if i + 1 < window:
            continue
        chunk = values[i + 1 - window : i + 1]
        mu = statistics.mean(chunk)
        sd = statistics.pstdev(chunk)
        if sd == 0:
            out[i] = 0.0
        else:
            out[i] = (values[i] - mu) / sd
    return out


def generate_dataset(days: int = 260) -> Dict[str, Any]:
    """
    Returns dict containing:
      - companies
      - indices
      - prices_by_symbol
      - announcements
      - market_overview (computed from latest day)
    """
    rng = random.Random(SEED)
    end = date.today()
    dates = business_days(end, days)

    # Indices (two synthetic indices)
    aspi = _gen_ohlcv_series(dates, start_price=9000, drift=0.00025, vol=0.007, base_volume=10_000_000, rng=rng)
    sl20 = _gen_ohlcv_series(dates, start_price=3200, drift=0.00020, vol=0.008, base_volume=6_000_000, rng=rng)

    indices = {
        "ASPI": [{"date": x["date"], "value": x["close"]} for x in aspi],
        "S&P SL20": [{"date": x["date"], "value": x["close"]} for x in sl20],
    }

    # Companies + per-stock series
    companies: List[dict] = []
    prices_by_symbol: Dict[str, List[dict]] = {}

    for sym, name, sector in DEMO_SYMBOLS:
        start = rng.uniform(25, 2200)
        drift = rng.uniform(-0.0002, 0.0009)
        vol = rng.uniform(0.010, 0.035)
        base_volume = rng.randint(50_000, 3_500_000)

        series = _gen_ohlcv_series(dates, start, drift, vol, base_volume, rng)
        prices_by_symbol[sym] = series

        shares = rng.randint(50_000_000, 7_000_000_000)
        last_close = series[-1]["close"]
        mcap = int(last_close * shares)

        companies.append(
            {
                "symbol": sym,
                "name": name,
                "sector": sector,
                "shares": shares,
                "market_cap": mcap,
            }
        )

    # Announcements (synthetic)
    announcements: List[dict] = []
    for _ in range(65):
        sym, name, sector = rng.choice(DEMO_SYMBOLS)
        d = rng.choice(dates[-120:])  # last ~6 months
        ann_type = rng.choice(ANN_TYPES)
        title = {
            "Financial": f"{name}: Quarterly Results Announcement",
            "Corporate Action": f"{name}: Dividend / Corporate Action Notice",
            "Press Release": f"{name}: Media Release",
            "Board Decision": f"{name}: Board Meeting Decisions",
            "Disclosure": f"{name}: Disclosure / Material Information",
        }[ann_type]
        announcements.append(
            {
                "id": f"ANN-{sym}-{d.isoformat()}-{rng.randint(1000,9999)}",
                "date": d.isoformat(),
                "symbol": sym,
                "type": ann_type,
                "title": title,
                "url": "#",
            }
        )
    announcements.sort(key=lambda x: x["date"], reverse=True)

    # Market overview from latest day
    latest_date = dates[-1].isoformat()

    def last_snapshot(sym: str) -> dict:
        s = prices_by_symbol[sym]
        last, prev = s[-1], s[-2]
        chg = last["close"] - prev["close"]
        chg_pct = _pct_change(last["close"], prev["close"]) * 100
        return {
            "symbol": sym,
            "name": next(c["name"] for c in companies if c["symbol"] == sym),
            "price": last["close"],
            "change": round(chg, 2),
            "change_pct": round(chg_pct, 2),
            "volume": last["volume"],
            "turnover": int(last["close"] * last["volume"]),
        }

    snapshots = [last_snapshot(sym) for sym, _, _ in DEMO_SYMBOLS]
    gainers = sorted(snapshots, key=lambda x: x["change_pct"], reverse=True)[:7]
    losers = sorted(snapshots, key=lambda x: x["change_pct"])[:7]
    active = sorted(snapshots, key=lambda x: x["turnover"], reverse=True)[:7]

    turnover = sum(x["turnover"] for x in snapshots)
    trades = sum(prices_by_symbol[sym][-1]["trades"] for sym, _, _ in DEMO_SYMBOLS)
    mcap_total = sum(c["market_cap"] for c in companies)

    market_overview = {
        "status": "CLOSED",
        "as_of": datetime.now().strftime("%Y-%m-%d %H:%M"),
        "date": latest_date,
        "turnover_lkr": turnover,
        "trades": trades,
        "market_cap_lkr": mcap_total,
        "top_gainers": gainers,
        "top_losers": losers,
        "most_active": active,
    }

    return {
        "companies": companies,
        "indices": indices,
        "prices_by_symbol": prices_by_symbol,
        "announcements": announcements,
        "market_overview": market_overview,
    }


def save_dataset(ds: Dict[str, Any], folder: Path) -> None:
    folder.mkdir(parents=True, exist_ok=True)

    (folder / "companies.json").write_text(json.dumps(ds["companies"], indent=2), encoding="utf-8")
    (folder / "indices.json").write_text(json.dumps(ds["indices"], indent=2), encoding="utf-8")
    (folder / "announcements.json").write_text(json.dumps(ds["announcements"], indent=2), encoding="utf-8")
    (folder / "market.json").write_text(json.dumps(ds["market_overview"], indent=2), encoding="utf-8")

    prices_folder = folder / "prices"
    prices_folder.mkdir(parents=True, exist_ok=True)
    for sym, series in ds["prices_by_symbol"].items():
        (prices_folder / f"{sym}.json").write_text(json.dumps(series, indent=2), encoding="utf-8")


def load_dataset(folder: Path) -> Optional[Dict[str, Any]]:
    """
    Load dataset from disk if present.
    Returns None if any critical file is missing.
    """
    companies_f = folder / "companies.json"
    indices_f = folder / "indices.json"
    ann_f = folder / "announcements.json"
    market_f = folder / "market.json"
    prices_folder = folder / "prices"

    if not (companies_f.exists() and indices_f.exists() and ann_f.exists() and market_f.exists() and prices_folder.exists()):
        return None

    companies = json.loads(companies_f.read_text(encoding="utf-8"))
    indices = json.loads(indices_f.read_text(encoding="utf-8"))
    announcements = json.loads(ann_f.read_text(encoding="utf-8"))
    market_overview = json.loads(market_f.read_text(encoding="utf-8"))

    prices_by_symbol: Dict[str, List[dict]] = {}
    for sym, _, _ in DEMO_SYMBOLS:
        f = prices_folder / f"{sym}.json"
        if not f.exists():
            return None
        prices_by_symbol[sym] = json.loads(f.read_text(encoding="utf-8"))

    return {
        "companies": companies,
        "indices": indices,
        "announcements": announcements,
        "market_overview": market_overview,
        "prices_by_symbol": prices_by_symbol,
    }


def demo_prediction(prices: List[dict], index_series: Optional[List[dict]] = None) -> dict:
    """
    A lightweight, explainable 'demo' predictor.
    Outputs:
      - predicted_return (next-day)
      - up_probability
      - band (p10/p90)
      - explanations (top feature contributions)
    """
    closes = [p["close"] for p in prices]
    volumes = [p["volume"] for p in prices]

    if len(closes) < 60:
        # not enough history
        last = closes[-1] if closes else 0.0
        return {
            "predicted_return": 0.0,
            "up_probability": 0.5,
            "band": {"p10": -0.02, "p90": 0.02},
            "features": [
                {"name": "history", "value": "insufficient", "impact": 0.0},
            ],
            "disclaimer": "Demo model. Not financial advice.",
        }

    # Features
    r1 = (closes[-1] / closes[-2]) - 1
    r5 = (closes[-1] / closes[-6]) - 1
    r20 = (closes[-1] / closes[-21]) - 1

    # Volatility (20d)
    rets = [(closes[i] / closes[i - 1] - 1) for i in range(1, len(closes))]
    vol20 = statistics.pstdev(rets[-20:])

    # RSI
    rsi14 = _rsi(closes, 14)[-1]
    if rsi14 is None:
        rsi14 = 50.0

    # Volume z-score (20d)
    vz = _zscore([float(v) for v in volumes], 20)[-1]
    if vz is None:
        vz = 0.0

    # Market relative (simple beta-ish)
    mkt_trend = 0.0
    if index_series and len(index_series) >= 21:
        idx = [x["value"] for x in index_series]
        mkt_trend = (idx[-1] / idx[-21]) - 1

    # Score (hand-tuned weights for plausible behaviour)
    # - momentum helps
    # - excessive vol hurts
    # - RSI too high reduces return expectation (mean reversion)
    # - volume spike adds a bit (attention)
    score = (
        0.90 * r20
        + 0.35 * r5
        + 0.10 * r1
        + 0.25 * mkt_trend
        - 1.25 * vol20
        - 0.015 * max(0.0, rsi14 - 60) / 10
        + 0.02 * max(0.0, vz)
    )

    # Map score to predicted return (cap)
    predicted_return = max(-0.08, min(0.08, score))

    # Probability via logistic mapping
    up_probability = 1 / (1 + math.exp(-predicted_return * 18))

    # Uncertainty band (wider if vol is high)
    base = 0.015 + 2.2 * vol20
    p10 = predicted_return - base
    p90 = predicted_return + base

    # Explanations: approximate contributions
    features = [
        {"name": "20D momentum", "value": round(r20 * 100, 2), "impact": round(0.90 * r20 * 100, 2)},
        {"name": "5D momentum", "value": round(r5 * 100, 2), "impact": round(0.35 * r5 * 100, 2)},
        {"name": "20D volatility", "value": round(vol20 * 100, 2), "impact": round(-1.25 * vol20 * 100, 2)},
        {"name": "RSI(14)", "value": round(float(rsi14), 1), "impact": round(-0.015 * max(0.0, rsi14 - 60) / 10 * 100, 2)},
        {"name": "Volume z(20)", "value": round(float(vz), 2), "impact": round(0.02 * max(0.0, vz) * 100, 2)},
    ]
    if index_series:
        features.insert(3, {"name": "Market trend (ASPI 20D)", "value": round(mkt_trend * 100, 2), "impact": round(0.25 * mkt_trend * 100, 2)})

    # Sort by absolute impact desc
    features = sorted(features, key=lambda x: abs(x["impact"]), reverse=True)[:5]

    return {
        "predicted_return": round(predicted_return, 4),
        "up_probability": round(float(up_probability), 4),
        "band": {"p10": round(p10, 4), "p90": round(p90, 4)},
        "features": features,
        "disclaimer": "Demo model (synthetic). Not financial advice.",
    }
