from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, List, Optional

from fastapi import HTTPException

from ..storage import Storage
from .base import MarketDataProvider


class DBProvider(MarketDataProvider):
    """Provider that serves market data purely from the local database.

    This is the recommended provider when the user has imported real EOD/company
    data and wants a stable offline/test environment with no live-network
    dependency.
    """

    def __init__(self, storage: Storage):
        self.storage = storage

    @property
    def name(self) -> str:
        return "db"

    def _company_rows(self) -> List[Dict[str, Any]]:
        self.storage.ensure_price_symbols_as_companies()
        return self.storage.list_companies(limit=100000)

    def get_market_overview(self) -> Dict[str, Any]:
        companies = self._company_rows()
        bars = self.storage.get_latest_bars([c.get("symbol") for c in companies])
        movers: List[Dict[str, Any]] = []
        most_active: List[Dict[str, Any]] = []
        latest_dates: List[str] = []
        turnover = 0.0
        market_cap = 0.0
        for comp in companies:
            sym = str(comp.get("symbol") or "").upper()
            bar = bars.get(sym)
            if not bar or bar.get("close") is None:
                continue
            latest_dates.append(str(bar.get("date")))
            try:
                last = float(bar.get("close"))
            except Exception:
                continue
            prev_hist = self.storage.get_price_history(sym, limit=2)
            prev_close = None
            if len(prev_hist) >= 2:
                try:
                    prev_close = float(prev_hist[-2].get("close"))
                except Exception:
                    prev_close = None
            change = (last - prev_close) if prev_close not in (None, 0) else None
            change_pct = ((last / prev_close - 1.0) * 100.0) if prev_close not in (None, 0) else None
            vol = float(bar.get("volume") or 0.0)
            turnover_proxy = last * vol
            turnover += turnover_proxy
            try:
                if comp.get("market_cap") is not None:
                    market_cap += float(comp.get("market_cap") or 0.0)
            except Exception:
                pass
            row = {
                "symbol": sym,
                "price": last,
                "last": last,
                "change": change,
                "change_pct": change_pct,
                "volume": vol,
                "turnoverProxy": turnover_proxy,
            }
            movers.append(row)
            most_active.append(dict(row))

        top_gainers = [r for r in movers if r.get("change_pct") is not None]
        top_gainers.sort(key=lambda x: x.get("change_pct") or 0.0, reverse=True)
        top_losers = [r for r in movers if r.get("change_pct") is not None]
        top_losers.sort(key=lambda x: x.get("change_pct") or 0.0)
        most_active.sort(key=lambda x: x.get("turnoverProxy") or 0.0, reverse=True)

        return {
            "status": {"status": "Database"},
            "summary": {
                "marketTurnover": turnover if turnover > 0 else None,
                "marketCap": market_cap if market_cap > 0 else None,
                "marketTrades": None,
            },
            "daily": None,
            "aspi": {},
            "snp_sl20": {},
            "top_gainers": top_gainers[:10],
            "top_losers": top_losers[:10],
            "most_active": most_active[:10],
            "updated_at": max(latest_dates) if latest_dates else datetime.now().isoformat(timespec="seconds"),
            "source": self.name,
        }

    def get_indices(self) -> Dict[str, List[Dict[str, Any]]]:
        return {
            "ASPI": self.storage.get_index_series("ASPI", limit=400),
            "S&P SL20": self.storage.get_index_series("S&P SL20", limit=400),
            "source": self.name,
        }

    def list_companies(self) -> List[Dict[str, Any]]:
        return self._company_rows()

    def get_stock(self, symbol: str) -> Dict[str, Any]:
        sym = symbol.upper()
        self.storage.ensure_price_symbols_as_companies()
        comp = self.storage.get_company(sym) or {"symbol": sym, "name": sym, "sector": "Imported"}
        bar = self.storage.get_latest_bar(sym)
        if not bar:
            raise HTTPException(status_code=404, detail=f"No stored data for {sym}")
        hist = self.storage.get_price_history(sym, limit=2)
        prev_close = None
        if len(hist) >= 2:
            try:
                prev_close = float(hist[-2].get("close"))
            except Exception:
                prev_close = None
        last = float(bar.get("close")) if bar.get("close") is not None else None
        change = (last - prev_close) if (last is not None and prev_close not in (None, 0)) else None
        change_pct = ((last / prev_close - 1.0) * 100.0) if (last is not None and prev_close not in (None, 0)) else None
        return {
            "symbol": sym,
            "name": comp.get("name") or sym,
            "sector": comp.get("sector") or "Imported",
            "industry_group": comp.get("industry_group"),
            "market_cap": comp.get("market_cap"),
            "beta": comp.get("beta"),
            "logo_url": comp.get("logo_url"),
            "shares": comp.get("shares"),
            "date": bar.get("date"),
            "last": last,
            "open": bar.get("open"),
            "high": bar.get("high"),
            "low": bar.get("low"),
            "volume": bar.get("volume"),
            "trades": None,
            "vwap": None,
            "change": change,
            "change_pct": change_pct,
            "source": self.name,
        }

    def get_stock_history(self, symbol: str, days: int) -> List[Dict[str, Any]]:
        hist = self.storage.get_price_history(symbol, limit=days)
        if not hist:
            raise HTTPException(status_code=404, detail=f"No stored history for {symbol.upper()}")
        return hist

    def get_announcements(self, symbol: Optional[str], limit: int) -> List[Dict[str, Any]]:
        return self.storage.get_announcements(symbol.upper() if symbol else None, limit=limit)
