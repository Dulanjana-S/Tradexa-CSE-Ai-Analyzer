from __future__ import annotations

import time
from dataclasses import dataclass
from typing import Any, Callable, Dict, Hashable, Tuple


@dataclass
class _Entry:
    value: Any
    expires_at: float


class TTLCache:
    """Tiny TTL cache (in-memory). Good enough for demos."""

    def __init__(self, ttl_seconds: int = 300):
        self.ttl_seconds = ttl_seconds
        self._store: Dict[Hashable, _Entry] = {}

    def get_or_set(self, key: Hashable, factory: Callable[[], Any]) -> Any:
        now = time.time()
        entry = self._store.get(key)
        if entry and entry.expires_at > now:
            return entry.value

        value = factory()
        self._store[key] = _Entry(value=value, expires_at=now + self.ttl_seconds)
        return value
