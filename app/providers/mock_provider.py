from __future__ import annotations

from pathlib import Path
from typing import Any, Dict, List, Optional

from fastapi import HTTPException

from .base import MarketDataProvider
from ..mock_data import generate_dataset, save_dataset, load_dataset, demo_prediction, DEMO_SYMBOLS


class MockProvider(MarketDataProvider):
    """Offline synthetic dataset provider (the current demo behaviour)."""

    def __init__(self, data_dir: Path):
        self._data_dir = data_dir
        self._ds: Dict[str, Any] = {}

    @property
    def name(self) -> str:
        return "mock"

    def _get_ds(self) -> Dict[str, Any]:
        if self._ds:
            return self._ds

        ds = load_dataset(self._data_dir)
        if ds is None:
            ds = generate_dataset(days=260)
            save_dataset(ds, self._data_dir)

        self._ds = ds
        return ds

    # --- helpers ---
    def _find_company(self, symbol: str, companies: List[dict]) -> Optional[dict]:
        symbol = symbol.upper()
        for c in companies:
            if c["symbol"].upper() == symbol:
                return c
        return None

    def _latest_snapshot(self, symbol: str, ds: Dict[str, Any]) -> dict:
        prices = ds["prices_by_symbol"].get(symbol)
        if not prices or len(prices) < 2:
            raise HTTPException(status_code=404, detail="No price history for symbol")
        last, prev = prices[-1], prices[-2]
        change = round(last["close"] - prev["close"], 2)
        change_pct = round(((last["close"] / prev["close"]) - 1) * 100, 2) if prev["close"] else 0.0
        return {
            "symbol": symbol,
            "date": last["date"],
            "last": last["close"],
            "open": last["open"],
            "high": last["high"],
            "low": last["low"],
            "volume": last["volume"],
            "trades": last["trades"],
            "vwap": last["vwap"],
            "change": change,
            "change_pct": change_pct,
        }

    # --- MarketDataProvider ---
    def get_market_overview(self) -> Dict[str, Any]:
        ds = self._get_ds()
        return ds["market_overview"]

    def get_indices(self) -> Dict[str, List[Dict[str, Any]]]:
        ds = self._get_ds()
        return ds["indices"]

    def list_companies(self) -> List[Dict[str, Any]]:
        ds = self._get_ds()
        return ds["companies"]

    def get_stock(self, symbol: str) -> Dict[str, Any]:
        ds = self._get_ds()
        company = self._find_company(symbol, ds["companies"])
        if not company:
            raise HTTPException(status_code=404, detail="Unknown symbol")
        snap = self._latest_snapshot(company["symbol"], ds)
        return {**company, **snap}

    def get_stock_history(self, symbol: str, days: int) -> List[Dict[str, Any]]:
        ds = self._get_ds()
        symbol = symbol.upper()
        series = ds["prices_by_symbol"].get(symbol)
        if not series:
            raise HTTPException(status_code=404, detail="Unknown symbol")
        return series[-days:]

    def get_announcements(self, symbol: Optional[str], limit: int) -> List[Dict[str, Any]]:
        ds = self._get_ds()
        anns = ds["announcements"]
        if symbol:
            symbol = symbol.upper()
            anns = [a for a in anns if a.get("symbol","").upper() == symbol]
        return anns[:limit]

    # --- demo prediction re-used by API layer ---
    def predict_demo(self, symbol: str) -> dict:
        ds = self._get_ds()
        symbol = symbol.upper()
        series = ds["prices_by_symbol"].get(symbol)
        if not series:
            raise HTTPException(status_code=404, detail="Unknown symbol")
        index_series = ds["indices"]["ASPI"]
        return demo_prediction(series, index_series=index_series)
