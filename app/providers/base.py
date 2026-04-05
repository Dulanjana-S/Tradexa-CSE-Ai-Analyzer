from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Any, Dict, List, Optional


class MarketDataProvider(ABC):
    """Small interface your FastAPI app can use, regardless of data source."""

    @property
    @abstractmethod
    def name(self) -> str: ...

    # --- Market-level ---
    @abstractmethod
    def get_market_overview(self) -> Dict[str, Any]: ...

    @abstractmethod
    def get_indices(self) -> Dict[str, List[Dict[str, Any]]]: ...

    # --- Stocks ---
    @abstractmethod
    def list_companies(self) -> List[Dict[str, Any]]: ...

    @abstractmethod
    def get_stock(self, symbol: str) -> Dict[str, Any]: ...

    @abstractmethod
    def get_stock_history(self, symbol: str, days: int) -> List[Dict[str, Any]]: ...

    # --- Announcements ---
    @abstractmethod
    def get_announcements(self, symbol: Optional[str], limit: int) -> List[Dict[str, Any]]: ...
