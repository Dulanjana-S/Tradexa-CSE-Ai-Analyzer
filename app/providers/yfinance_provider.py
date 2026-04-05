from __future__ import annotations

from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional

from fastapi import HTTPException

try:
    import yfinance as yf
except Exception:  # pragma: no cover
    yf = None  # type: ignore


from .base import MarketDataProvider


def cse_to_yahoo_symbol(cse_symbol: str, exchange_suffix: str = ".CM") -> str:
    # Common mapping on Yahoo Finance:
    #   "JKH.N0000" -> "JKH-N0000.CM"
    #   "LOLC.N0000" -> "LOLC-N0000.CM"
    return cse_symbol.upper().replace(".", "-") + exchange_suffix


class YFinanceProvider(MarketDataProvider):
    """Yahoo Finance via yfinance (live).

    yfinance is an unofficial wrapper around Yahoo's public endpoints and can be rate-limited.
    """

    def __init__(self, exchange_suffix: str = ".CM"):
        self.exchange_suffix = exchange_suffix
        if yf is None:
            raise RuntimeError("yfinance is not installed. Add it to requirements.txt")

    @property
    def name(self) -> str:
        return "yfinance"

    # Market-level data is not really available for ASPI/SL20 reliably via yfinance,
    # so we return minimal objects (UI will still render, but with fewer widgets).
    def get_market_overview(self) -> Dict[str, Any]:
        return {
            "status": {"status": "Unknown"},
            "summary": {},
            "aspi": {},
            "snp_sl20": {},
            "top_gainers": [],
            "top_losers": [],
            "most_active": [],
            "updated_at": datetime.now().isoformat(timespec="seconds"),
            "source": self.name,
        }

    def get_indices(self) -> Dict[str, List[Dict[str, Any]]]:
        return {"ASPI": [], "SNP_SL20": [], "source": self.name}

    def list_companies(self) -> List[Dict[str, Any]]:
        # Yahoo doesn't offer an easy "all CSE listings" endpoint.
        # Keep this empty; the UI uses /api/stocks which we handle by
        # returning the demo symbols list in the API layer when needed.
        return []

    def get_stock(self, symbol: str) -> Dict[str, Any]:
        symbol = symbol.upper()
        ysym = cse_to_yahoo_symbol(symbol, self.exchange_suffix)
        t = yf.Ticker(ysym)

        # Use last 5d daily history to compute snapshot
        hist = t.history(period="7d", interval="1d")
        if hist is None or hist.empty:
            raise HTTPException(status_code=404, detail=f"No Yahoo Finance data for {ysym}")

        last_row = hist.iloc[-1]
        prev_row = hist.iloc[-2] if len(hist) >= 2 else last_row

        last = float(last_row["Close"])
        prev = float(prev_row["Close"])
        change = last - prev
        change_pct = ((last / prev) - 1) * 100 if prev else 0.0

        # Basic metadata (can be slow / blocked; so optional)
        name = symbol
        sector = "—"
        logo = None
        try:
            info = t.fast_info if hasattr(t, "fast_info") else {}
            # yfinance sometimes includes longName in .info (heavier call) — skip by default
        except Exception:
            pass

        return {
            "symbol": symbol,
            "name": name,
            "sector": sector,
            "industry_group": None,
            "market_cap": None,
            "beta": None,
            "logo_url": logo,
            "date": last_row.name.date().isoformat() if hasattr(last_row.name, "date") else datetime.now().date().isoformat(),
            "last": round(last, 4),
            "open": float(last_row["Open"]) if "Open" in last_row else None,
            "high": float(last_row["High"]) if "High" in last_row else None,
            "low": float(last_row["Low"]) if "Low" in last_row else None,
            "volume": int(last_row["Volume"]) if "Volume" in last_row and last_row["Volume"] is not None else 0,
            "trades": 0,
            "vwap": None,
            "change": round(change, 4),
            "change_pct": round(change_pct, 4),
            "source": self.name,
            "yahoo_symbol": ysym,
        }

    def get_stock_history(self, symbol: str, days: int) -> List[Dict[str, Any]]:
        symbol = symbol.upper()
        ysym = cse_to_yahoo_symbol(symbol, self.exchange_suffix)
        t = yf.Ticker(ysym)

        # Fetch enough data (days+buffer) since Yahoo can skip holidays/weekends
        period_days = max(30, min(3650, days + 30))
        hist = t.history(period=f"{period_days}d", interval="1d")
        if hist is None or hist.empty:
            raise HTTPException(status_code=404, detail=f"No Yahoo Finance history for {ysym}")

        rows: List[Dict[str, Any]] = []
        for idx, r in hist.iterrows():
            # idx is Timestamp
            d = idx.date().isoformat()
            rows.append(
                {
                    "date": d,
                    "open": float(r["Open"]) if r.get("Open") is not None else None,
                    "high": float(r["High"]) if r.get("High") is not None else None,
                    "low": float(r["Low"]) if r.get("Low") is not None else None,
                    "close": float(r["Close"]) if r.get("Close") is not None else None,
                    "volume": int(r["Volume"]) if r.get("Volume") is not None else 0,
                    "trades": 0,
                    "vwap": None,
                }
            )

        rows.sort(key=lambda x: x["date"])
        return rows[-days:]

    def get_announcements(self, symbol: Optional[str], limit: int) -> List[Dict[str, Any]]:
        # Yahoo news is not consistent and often blocked; keep empty for demo.
        return []
