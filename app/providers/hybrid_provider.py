from __future__ import annotations

from typing import Any, Dict, List, Optional

from fastapi import HTTPException

from .base import MarketDataProvider
from .cse_provider import CSEProvider
from .yfinance_provider import YFinanceProvider


class HybridProvider(MarketDataProvider):
    """Hybrid provider: CSE unofficial API for market/metadata + CSE chart history,
    with yfinance as a *fallback* when available.

    Rationale: yfinance coverage for CSE share classes is incomplete.
    """

    def __init__(self, cse: CSEProvider, yfin: YFinanceProvider):
        self.cse = cse
        self.yfin = yfin

    @property
    def name(self) -> str:
        return "hybrid"

    def get_market_overview(self) -> Dict[str, Any]:
        out = self.cse.get_market_overview()
        out["source"] = self.name
        out["source_components"] = {"market": "cse"}
        return out

    def get_indices(self) -> Dict[str, List[Dict[str, Any]]]:
        out = self.cse.get_indices()
        out["source"] = self.name
        out["source_components"] = {"indices": "cse"}
        return out

    def list_companies(self) -> List[Dict[str, Any]]:
        return self.cse.list_companies()

    def get_stock(self, symbol: str) -> Dict[str, Any]:
        # Prefer CSE metadata/live snapshot; use yfinance only when useful.
        try:
            cse_stock = self.cse.get_stock(symbol)
        except HTTPException:
            cse_stock = {}

        yf_stock: Dict[str, Any] = {}
        need_yahoo = (not cse_stock) or (isinstance(cse_stock, dict) and cse_stock.get("last") is None)
        if need_yahoo:
            try:
                yf_stock = self.yfin.get_stock(symbol)
            except HTTPException:
                yf_stock = {}

        if not cse_stock and not yf_stock:
            raise HTTPException(status_code=404, detail="Unknown symbol")

        # Merge (prefer CSE name/logo; prefer yfinance OHLC/volume if present)
        out = {**cse_stock, **yf_stock}
        for k in ("name", "sector", "logo_url"):
            if cse_stock.get(k):
                out[k] = cse_stock[k]
        for k in ("last", "open", "high", "low", "volume", "change", "change_pct", "date"):
            if yf_stock.get(k) is not None:
                out[k] = yf_stock[k]

        out["source"] = self.name
        out["source_components"] = {"stock_meta": "cse" if cse_stock else None, "snapshot": "yfinance" if yf_stock else "cse"}
        return out

    def get_stock_history(self, symbol: str, days: int) -> List[Dict[str, Any]]:
        # Prefer CSE chart history (better coverage for CSE share classes).
        try:
            h = self.cse.get_stock_history(symbol, days)
            if h:
                return h
        except HTTPException:
            pass
        # Fallback to yfinance
        return self.yfin.get_stock_history(symbol, days)

    def get_announcements(self, symbol: Optional[str], limit: int) -> List[Dict[str, Any]]:
        return self.cse.get_announcements(symbol, limit)
