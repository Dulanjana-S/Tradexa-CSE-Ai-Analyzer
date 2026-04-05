from __future__ import annotations

import json
import sqlite3
from contextlib import contextmanager
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional, Tuple

from .data_quality import audit_history, clean_price_history

try:  # Optional dependency; SQLite mode works without it.
    from sqlalchemy import (
        Column,
        Date,
        DateTime,
        Float,
        Integer,
        MetaData,
        String,
        Table,
        Text,
        create_engine,
        select,
    )
    from sqlalchemy.engine import Engine
except Exception:  # pragma: no cover
    Column = Date = DateTime = Float = Integer = MetaData = String = Table = Text = None  # type: ignore
    create_engine = select = None  # type: ignore
    Engine = Any  # type: ignore


metadata = MetaData() if MetaData is not None else None

if metadata is not None:
    companies_t = Table(
        "companies",
        metadata,
        Column("symbol", String(32), primary_key=True),
        Column("name", Text, nullable=True),
        Column("sector", Text, nullable=True),
        Column("industry_group", Text, nullable=True),
        Column("shares", Integer, nullable=True),
        Column("logo_url", Text, nullable=True),
        Column("market_cap", Float, nullable=True),
        Column("beta", Float, nullable=True),
        Column("last_updated", DateTime, nullable=True),
    )

    prices_t = Table(
        "prices",
        metadata,
        Column("symbol", String(32), primary_key=True),
        Column("date", Date, primary_key=True),
        Column("open", Float, nullable=True),
        Column("high", Float, nullable=True),
        Column("low", Float, nullable=True),
        Column("close", Float, nullable=True),
        Column("volume", Float, nullable=True),
    )

    indices_t = Table(
        "indices",
        metadata,
        Column("name", String(64), primary_key=True),
        Column("date", Date, primary_key=True),
        Column("value", Float, nullable=False),
    )

    announcements_t = Table(
        "announcements",
        metadata,
        Column("ann_id", String(128), primary_key=True),
        Column("symbol", String(32), nullable=True, index=True),
        Column("date", String(32), nullable=True, index=True),
        Column("title", Text, nullable=True),
        Column("url", Text, nullable=True),
        Column("category", String(64), nullable=True),
    )

    meta_t = Table(
        "meta",
        metadata,
        Column("key", String(128), primary_key=True),
        Column("value", Text, nullable=True),
    )

    watchlists_t = Table(
        "watchlists",
        metadata,
        Column("profile", String(64), primary_key=True),
        Column("symbol", String(32), primary_key=True),
        Column("created_at", DateTime, nullable=True),
    )

    preferences_t = Table(
        "preferences",
        metadata,
        Column("profile", String(64), primary_key=True),
        Column("key", String(128), primary_key=True),
        Column("value", Text, nullable=True),
        Column("updated_at", DateTime, nullable=True),
    )

    job_runs_t = Table(
        "job_runs",
        metadata,
        Column("run_id", String(64), primary_key=True),
        Column("job_name", String(64), nullable=False),
        Column("started_at", DateTime, nullable=True),
        Column("finished_at", DateTime, nullable=True),
        Column("status", String(32), nullable=True),
        Column("details", Text, nullable=True),
    )
else:  # pragma: no cover
    companies_t = prices_t = indices_t = announcements_t = meta_t = watchlists_t = preferences_t = job_runs_t = None  # type: ignore


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def _json_dumps(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, sort_keys=True)


@dataclass
class Storage:
    database_url: str

    _engine: Optional[Engine] = None

    def _is_sqlite(self) -> bool:
        return str(self.database_url).startswith("sqlite")

    def _resolve_sqlite_path(self) -> Path:
        url = str(self.database_url)
        if url == "sqlite:///:memory:":
            return Path(":memory:")
        prefix = "sqlite:///"
        if not url.startswith(prefix):
            raise RuntimeError(f"Unsupported SQLite URL: {url}")
        raw = url[len(prefix):]
        path = Path(raw)
        if not path.is_absolute():
            path = Path.cwd() / path
        return path

    @contextmanager
    def _sqlite(self):
        path = self._resolve_sqlite_path()
        if str(path) != ":memory:":
            path.parent.mkdir(parents=True, exist_ok=True)
        conn = sqlite3.connect(str(path), check_same_thread=False)
        conn.row_factory = sqlite3.Row
        try:
            yield conn
            conn.commit()
        finally:
            conn.close()

    def engine(self) -> Engine:
        if self._is_sqlite():
            raise RuntimeError("SQLAlchemy engine is not used in SQLite fallback mode")
        if create_engine is None:
            raise RuntimeError(
                "SQLAlchemy is required for non-SQLite databases. Install sqlalchemy and the DB driver, or use SQLite."
            )
        if self._engine is None:
            self._engine = create_engine(self.database_url, future=True, pool_pre_ping=True)
        return self._engine

    def init(self) -> None:
        if self._is_sqlite():
            with self._sqlite() as conn:
                conn.executescript(
                    """
                    CREATE TABLE IF NOT EXISTS companies (
                        symbol TEXT PRIMARY KEY,
                        name TEXT,
                        sector TEXT,
                        industry_group TEXT,
                        shares INTEGER,
                        logo_url TEXT,
                        market_cap REAL,
                        beta REAL,
                        last_updated TEXT
                    );
                    CREATE TABLE IF NOT EXISTS prices (
                        symbol TEXT NOT NULL,
                        date TEXT NOT NULL,
                        open REAL,
                        high REAL,
                        low REAL,
                        close REAL,
                        volume REAL,
                        PRIMARY KEY(symbol, date)
                    );
                    CREATE TABLE IF NOT EXISTS indices (
                        name TEXT NOT NULL,
                        date TEXT NOT NULL,
                        value REAL NOT NULL,
                        PRIMARY KEY(name, date)
                    );
                    CREATE TABLE IF NOT EXISTS announcements (
                        ann_id TEXT PRIMARY KEY,
                        symbol TEXT,
                        date TEXT,
                        title TEXT,
                        url TEXT,
                        category TEXT
                    );
                    CREATE INDEX IF NOT EXISTS idx_ann_symbol ON announcements(symbol);
                    CREATE INDEX IF NOT EXISTS idx_ann_date ON announcements(date);
                    CREATE TABLE IF NOT EXISTS meta (
                        key TEXT PRIMARY KEY,
                        value TEXT
                    );
                    CREATE TABLE IF NOT EXISTS watchlists (
                        profile TEXT NOT NULL,
                        symbol TEXT NOT NULL,
                        created_at TEXT,
                        PRIMARY KEY(profile, symbol)
                    );
                    CREATE TABLE IF NOT EXISTS preferences (
                        profile TEXT NOT NULL,
                        key TEXT NOT NULL,
                        value TEXT,
                        updated_at TEXT,
                        PRIMARY KEY(profile, key)
                    );
                    CREATE TABLE IF NOT EXISTS job_runs (
                        run_id TEXT PRIMARY KEY,
                        job_name TEXT NOT NULL,
                        started_at TEXT,
                        finished_at TEXT,
                        status TEXT,
                        details TEXT
                    );
                    CREATE INDEX IF NOT EXISTS idx_prices_symbol_date ON prices(symbol, date DESC);
                    CREATE INDEX IF NOT EXISTS idx_indices_name_date ON indices(name, date DESC);
                    CREATE INDEX IF NOT EXISTS idx_job_runs_job_name ON job_runs(job_name, started_at DESC);
                    """
                )
            return

        if metadata is None:
            raise RuntimeError("SQLAlchemy metadata is unavailable")
        metadata.create_all(self.engine())

    # ---- Companies ----
    def upsert_companies(self, rows: Iterable[Dict[str, Any]]) -> int:
        now = _utc_now()
        payload = []
        for r in rows:
            sym = (r.get("symbol") or "").upper()
            if not sym:
                continue
            payload.append(
                {
                    "symbol": sym,
                    "name": r.get("name"),
                    "sector": r.get("sector"),
                    "industry_group": r.get("industry_group"),
                    "shares": r.get("shares"),
                    "logo_url": r.get("logo_url"),
                    "market_cap": r.get("market_cap"),
                    "beta": r.get("beta"),
                    "last_updated": now,
                }
            )
        if not payload:
            return 0
        if self._is_sqlite():
            with self._sqlite() as conn:
                conn.executemany(
                    """
                    INSERT OR REPLACE INTO companies
                    (symbol, name, sector, industry_group, shares, logo_url, market_cap, beta, last_updated)
                    VALUES (:symbol, :name, :sector, :industry_group, :shares, :logo_url, :market_cap, :beta, :last_updated)
                    """,
                    payload,
                )
            return len(payload)
        eng = self.engine()
        with eng.begin() as conn:
            from sqlalchemy.dialects.postgresql import insert as pg_insert

            stmt = pg_insert(companies_t).values(payload)
            update_cols = {c.name: getattr(stmt.excluded, c.name) for c in companies_t.c if c.name != "symbol"}
            conn.execute(stmt.on_conflict_do_update(index_elements=[companies_t.c.symbol], set_=update_cols))
        return len(payload)

    def list_companies(self, limit: int = 5000) -> List[Dict[str, Any]]:
        if self._is_sqlite():
            with self._sqlite() as conn:
                rows = conn.execute(
                    """
                    SELECT symbol, name, sector, industry_group, shares, logo_url, market_cap, beta, last_updated
                    FROM companies ORDER BY symbol LIMIT ?
                    """,
                    (limit,),
                ).fetchall()
            return [dict(r) for r in rows]
        with self.engine().connect() as conn:
            rows = conn.execute(
                select(
                    companies_t.c.symbol,
                    companies_t.c.name,
                    companies_t.c.sector,
                    companies_t.c.industry_group,
                    companies_t.c.shares,
                    companies_t.c.logo_url,
                    companies_t.c.market_cap,
                    companies_t.c.beta,
                    companies_t.c.last_updated,
                ).order_by(companies_t.c.symbol).limit(limit)
            ).mappings().all()
            return [dict(r) for r in rows]

    def get_company(self, symbol: str) -> Optional[Dict[str, Any]]:
        sym = (symbol or "").upper()
        if not sym:
            return None
        if self._is_sqlite():
            with self._sqlite() as conn:
                row = conn.execute(
                    """
                    SELECT symbol, name, sector, industry_group, shares, logo_url, market_cap, beta, last_updated
                    FROM companies WHERE symbol = ?
                    """,
                    (sym,),
                ).fetchone()
            return dict(row) if row else None
        with self.engine().connect() as conn:
            r = conn.execute(
                select(
                    companies_t.c.symbol,
                    companies_t.c.name,
                    companies_t.c.sector,
                    companies_t.c.industry_group,
                    companies_t.c.shares,
                    companies_t.c.logo_url,
                    companies_t.c.market_cap,
                    companies_t.c.beta,
                    companies_t.c.last_updated,
                ).where(companies_t.c.symbol == sym)
            ).mappings().first()
            return dict(r) if r else None

    def search_companies(self, q: str, limit: int = 20) -> List[Dict[str, Any]]:
        q = (q or "").strip()
        if not q:
            return []
        uq = q.upper()
        if self._is_sqlite():
            with self._sqlite() as conn:
                rows = conn.execute(
                    """
                    SELECT symbol, name, sector, industry_group
                    FROM companies
                    WHERE UPPER(symbol) LIKE ? OR UPPER(COALESCE(name, '')) LIKE ?
                    ORDER BY symbol LIMIT ?
                    """,
                    (f"%{uq}%", f"%{uq}%", limit),
                ).fetchall()
            return [dict(r) for r in rows]
        with self.engine().connect() as conn:
            rows = conn.execute(
                select(companies_t.c.symbol, companies_t.c.name, companies_t.c.sector, companies_t.c.industry_group)
                .where((companies_t.c.symbol.ilike(f"%{uq}%")) | (companies_t.c.name.ilike(f"%{q}%")))
                .order_by(companies_t.c.symbol)
                .limit(limit)
            ).mappings().all()
            return [dict(r) for r in rows]

    # ---- Prices ----
    def upsert_prices(self, symbol: str, history: List[Dict[str, Any]]) -> int:
        sym = (symbol or "").upper()
        if not sym:
            return 0
        cleaned, report = clean_price_history(sym, history, normalize_splits=True)
        payload = []
        for d in cleaned:
            iso = str(d.get("date") or "")[:10]
            if len(iso) != 10:
                continue
            payload.append(
                {
                    "symbol": sym,
                    "date": iso,
                    "open": d.get("open"),
                    "high": d.get("high"),
                    "low": d.get("low"),
                    "close": d.get("close"),
                    "volume": d.get("volume"),
                }
            )
        if not payload:
            self.set_meta(f"audit:prices:{sym}", _json_dumps(report.__dict__))
            return 0
        if self._is_sqlite():
            with self._sqlite() as conn:
                conn.executemany(
                    """
                    INSERT OR REPLACE INTO prices (symbol, date, open, high, low, close, volume)
                    VALUES (:symbol, :date, :open, :high, :low, :close, :volume)
                    """,
                    payload,
                )
        else:
            with self.engine().begin() as conn:
                from sqlalchemy.dialects.postgresql import insert as pg_insert

                stmt = pg_insert(prices_t).values(payload)
                update_cols = {c.name: getattr(stmt.excluded, c.name) for c in prices_t.c if c.name not in ("symbol", "date")}
                conn.execute(stmt.on_conflict_do_update(index_elements=[prices_t.c.symbol, prices_t.c.date], set_=update_cols))
        audit = audit_history(payload)
        audit.update({"clean_report": report.__dict__})
        self.set_meta(f"audit:prices:{sym}", _json_dumps(audit))
        return len(payload)

    def get_price_history(self, symbol: str, limit: int = 260) -> List[Dict[str, Any]]:
        sym = symbol.upper()
        if self._is_sqlite():
            with self._sqlite() as conn:
                rows = conn.execute(
                    """
                    SELECT date, open, high, low, close, volume
                    FROM prices WHERE symbol = ? ORDER BY date DESC LIMIT ?
                    """,
                    (sym, limit),
                ).fetchall()
            out = [dict(r) for r in rows]
        else:
            with self.engine().connect() as conn:
                rows = conn.execute(
                    select(prices_t.c.date, prices_t.c.open, prices_t.c.high, prices_t.c.low, prices_t.c.close, prices_t.c.volume)
                    .where(prices_t.c.symbol == sym)
                    .order_by(prices_t.c.date.desc())
                    .limit(limit)
                ).mappings().all()
                out = [dict(r) for r in rows]
        out.reverse()
        for r in out:
            if hasattr(r["date"], "isoformat"):
                r["date"] = r["date"].isoformat()
        return out

    def get_latest_close(self, symbol: str) -> Optional[Tuple[str, float]]:
        sym = symbol.upper()
        if self._is_sqlite():
            with self._sqlite() as conn:
                r = conn.execute("SELECT date, close FROM prices WHERE symbol = ? ORDER BY date DESC LIMIT 1", (sym,)).fetchone()
            if not r or r[1] is None:
                return None
            return (str(r[0]), float(r[1]))
        with self.engine().connect() as conn:
            r = conn.execute(
                select(prices_t.c.date, prices_t.c.close).where(prices_t.c.symbol == sym).order_by(prices_t.c.date.desc()).limit(1)
            ).first()
            if not r or r[1] is None:
                return None
            d, c = r
            return (d.isoformat(), float(c))

    def get_latest_bar(self, symbol: str) -> Optional[Dict[str, Any]]:
        sym = symbol.upper()
        if self._is_sqlite():
            with self._sqlite() as conn:
                row = conn.execute(
                    """
                    SELECT date, open, high, low, close, volume
                    FROM prices WHERE symbol = ? ORDER BY date DESC LIMIT 1
                    """,
                    (sym,),
                ).fetchone()
            return dict(row) if row else None
        with self.engine().connect() as conn:
            row = conn.execute(
                select(prices_t.c.date, prices_t.c.open, prices_t.c.high, prices_t.c.low, prices_t.c.close, prices_t.c.volume)
                .where(prices_t.c.symbol == sym)
                .order_by(prices_t.c.date.desc())
                .limit(1)
            ).mappings().first()
            if not row:
                return None
            r = dict(row)
            if hasattr(r["date"], "isoformat"):
                r["date"] = r["date"].isoformat()
            return r

    def get_latest_bars(self, symbols: Iterable[str]) -> Dict[str, Dict[str, Any]]:
        out: Dict[str, Dict[str, Any]] = {}
        for sym in [str(s).upper() for s in symbols if s]:
            bar = self.get_latest_bar(sym)
            if bar:
                out[sym] = bar
        return out

    def history_summary(self, symbol: str) -> Dict[str, Any]:
        raw = self.get_meta(f"audit:prices:{symbol.upper()}")
        if raw:
            try:
                return json.loads(raw)
            except Exception:
                pass
        hist = self.get_price_history(symbol, limit=4000)
        return audit_history(hist)

    def list_price_symbols(self) -> List[str]:
        if self._is_sqlite():
            with self._sqlite() as conn:
                rows = conn.execute("SELECT DISTINCT symbol FROM prices ORDER BY symbol").fetchall()
            return [str(r[0]) for r in rows]
        with self.engine().connect() as conn:
            rows = conn.execute(select(prices_t.c.symbol).distinct().order_by(prices_t.c.symbol)).all()
            return [str(r[0]) for r in rows]

    def ensure_price_symbols_as_companies(self) -> int:
        existing = {str(c.get("symbol") or "").upper() for c in self.list_companies(limit=100000)}
        payload = []
        for sym in self.list_price_symbols():
            usym = str(sym).upper()
            if not usym or usym in existing:
                continue
            payload.append({"symbol": usym, "name": usym, "sector": "Imported", "industry_group": None, "shares": None, "logo_url": None, "market_cap": None, "beta": None})
        if payload:
            return self.upsert_companies(payload)
        return 0

    # ---- Indices ----
    def upsert_index_series(self, name: str, series: List[Dict[str, Any]]) -> int:
        payload = []
        for p in series:
            d = str(p.get("date") or "")[:10]
            v = p.get("value")
            if len(d) != 10 or v is None:
                continue
            try:
                fv = float(v)
            except Exception:
                continue
            payload.append({"name": name, "date": d, "value": fv})
        if not payload:
            return 0
        if self._is_sqlite():
            with self._sqlite() as conn:
                conn.executemany("INSERT OR REPLACE INTO indices (name, date, value) VALUES (:name, :date, :value)", payload)
            return len(payload)
        with self.engine().begin() as conn:
            from sqlalchemy.dialects.postgresql import insert as pg_insert

            stmt = pg_insert(indices_t).values(payload)
            conn.execute(stmt.on_conflict_do_update(index_elements=[indices_t.c.name, indices_t.c.date], set_={"value": stmt.excluded.value}))
        return len(payload)

    def get_index_series(self, name: str, limit: int = 400) -> List[Dict[str, Any]]:
        if self._is_sqlite():
            with self._sqlite() as conn:
                rows = conn.execute(
                    "SELECT date, value FROM indices WHERE name = ? ORDER BY date DESC LIMIT ?",
                    (name, limit),
                ).fetchall()
            out = [dict(r) for r in rows]
        else:
            with self.engine().connect() as conn:
                rows = conn.execute(
                    select(indices_t.c.date, indices_t.c.value).where(indices_t.c.name == name).order_by(indices_t.c.date.desc()).limit(limit)
                ).mappings().all()
                out = [dict(r) for r in rows]
        out.reverse()
        for r in out:
            if hasattr(r["date"], "isoformat"):
                r["date"] = r["date"].isoformat()
        return out

    # ---- Announcements ----
    def upsert_announcements(self, anns: List[Dict[str, Any]]) -> int:
        payload = []
        for a in anns:
            ann_id = str(a.get("ann_id") or a.get("id") or (a.get("symbol", "") + "|" + str(a.get("date")) + "|" + str(a.get("title"))))
            payload.append(
                {
                    "ann_id": ann_id,
                    "symbol": (a.get("symbol") or "").upper() or None,
                    "date": str(a.get("date") or ""),
                    "title": a.get("title"),
                    "url": a.get("url"),
                    "category": a.get("category") or a.get("type"),
                }
            )
        if not payload:
            return 0
        if self._is_sqlite():
            with self._sqlite() as conn:
                conn.executemany(
                    """
                    INSERT OR REPLACE INTO announcements (ann_id, symbol, date, title, url, category)
                    VALUES (:ann_id, :symbol, :date, :title, :url, :category)
                    """,
                    payload,
                )
            return len(payload)
        with self.engine().begin() as conn:
            from sqlalchemy.dialects.postgresql import insert as pg_insert

            stmt = pg_insert(announcements_t).values(payload)
            update_cols = {c.name: getattr(stmt.excluded, c.name) for c in announcements_t.c if c.name != "ann_id"}
            conn.execute(stmt.on_conflict_do_update(index_elements=[announcements_t.c.ann_id], set_=update_cols))
        return len(payload)

    def get_announcements(self, symbol: Optional[str], limit: int = 100) -> List[Dict[str, Any]]:
        if self._is_sqlite():
            with self._sqlite() as conn:
                if symbol:
                    rows = conn.execute(
                        """
                        SELECT ann_id, symbol, date, title, url, category
                        FROM announcements WHERE symbol = ? ORDER BY date DESC LIMIT ?
                        """,
                        (symbol.upper(), limit),
                    ).fetchall()
                else:
                    rows = conn.execute(
                        """
                        SELECT ann_id, symbol, date, title, url, category
                        FROM announcements ORDER BY date DESC LIMIT ?
                        """,
                        (limit,),
                    ).fetchall()
            return [dict(r) for r in rows]
        with self.engine().connect() as conn:
            stmt = select(
                announcements_t.c.ann_id,
                announcements_t.c.symbol,
                announcements_t.c.date,
                announcements_t.c.title,
                announcements_t.c.url,
                announcements_t.c.category,
            )
            if symbol:
                stmt = stmt.where(announcements_t.c.symbol == symbol.upper())
            stmt = stmt.order_by(announcements_t.c.date.desc()).limit(limit)
            rows = conn.execute(stmt).mappings().all()
            return [dict(r) for r in rows]

    # ---- User state ----
    def list_watchlist(self, profile: str = "default") -> List[str]:
        if self._is_sqlite():
            with self._sqlite() as conn:
                rows = conn.execute("SELECT symbol FROM watchlists WHERE profile = ? ORDER BY symbol", (profile,)).fetchall()
            return [str(r[0]) for r in rows]
        with self.engine().connect() as conn:
            rows = conn.execute(
                select(watchlists_t.c.symbol).where(watchlists_t.c.profile == profile).order_by(watchlists_t.c.symbol)
            ).all()
            return [str(r[0]) for r in rows]

    def add_watchlist_symbol(self, symbol: str, profile: str = "default") -> None:
        row = {"profile": profile, "symbol": symbol.upper(), "created_at": _utc_now()}
        if self._is_sqlite():
            with self._sqlite() as conn:
                conn.execute(
                    "INSERT OR REPLACE INTO watchlists (profile, symbol, created_at) VALUES (:profile, :symbol, :created_at)",
                    row,
                )
            return
        with self.engine().begin() as conn:
            from sqlalchemy.dialects.postgresql import insert as pg_insert

            stmt = pg_insert(watchlists_t).values(row)
            conn.execute(stmt.on_conflict_do_nothing(index_elements=[watchlists_t.c.profile, watchlists_t.c.symbol]))

    def remove_watchlist_symbol(self, symbol: str, profile: str = "default") -> None:
        sym = symbol.upper()
        if self._is_sqlite():
            with self._sqlite() as conn:
                conn.execute("DELETE FROM watchlists WHERE profile = ? AND symbol = ?", (profile, sym))
            return
        with self.engine().begin() as conn:
            conn.execute(watchlists_t.delete().where((watchlists_t.c.profile == profile) & (watchlists_t.c.symbol == sym)))

    def set_preference(self, key: str, value: Any, profile: str = "default") -> None:
        row = {"profile": profile, "key": key, "value": _json_dumps(value), "updated_at": _utc_now()}
        if self._is_sqlite():
            with self._sqlite() as conn:
                conn.execute(
                    "INSERT OR REPLACE INTO preferences (profile, key, value, updated_at) VALUES (:profile, :key, :value, :updated_at)",
                    row,
                )
            return
        with self.engine().begin() as conn:
            from sqlalchemy.dialects.postgresql import insert as pg_insert

            stmt = pg_insert(preferences_t).values(row)
            conn.execute(
                stmt.on_conflict_do_update(
                    index_elements=[preferences_t.c.profile, preferences_t.c.key],
                    set_={"value": stmt.excluded.value, "updated_at": stmt.excluded.updated_at},
                )
            )

    def get_preferences(self, profile: str = "default") -> Dict[str, Any]:
        if self._is_sqlite():
            with self._sqlite() as conn:
                rows = conn.execute("SELECT key, value FROM preferences WHERE profile = ?", (profile,)).fetchall()
            pairs = [(str(r[0]), r[1]) for r in rows]
        else:
            with self.engine().connect() as conn:
                rows = conn.execute(select(preferences_t.c.key, preferences_t.c.value).where(preferences_t.c.profile == profile)).all()
            pairs = [(str(r[0]), r[1]) for r in rows]
        out = {}
        for k, v in pairs:
            try:
                out[k] = json.loads(v) if v is not None else None
            except Exception:
                out[k] = v
        return out

    # ---- Jobs ----
    def record_job_run(
        self,
        *,
        job_name: str,
        status: str,
        details: Optional[Dict[str, Any]] = None,
        run_id: Optional[str] = None,
        started_at: Optional[str] = None,
        finished_at: Optional[str] = None,
    ) -> str:
        rid = run_id or f"{job_name}-{datetime.now(timezone.utc).strftime('%Y%m%d%H%M%S')}"
        row = {
            "run_id": rid,
            "job_name": job_name,
            "started_at": started_at or _utc_now(),
            "finished_at": finished_at or _utc_now(),
            "status": status,
            "details": _json_dumps(details or {}),
        }
        if self._is_sqlite():
            with self._sqlite() as conn:
                conn.execute(
                    """
                    INSERT OR REPLACE INTO job_runs (run_id, job_name, started_at, finished_at, status, details)
                    VALUES (:run_id, :job_name, :started_at, :finished_at, :status, :details)
                    """,
                    row,
                )
            return rid
        with self.engine().begin() as conn:
            from sqlalchemy.dialects.postgresql import insert as pg_insert

            stmt = pg_insert(job_runs_t).values(row)
            conn.execute(
                stmt.on_conflict_do_update(
                    index_elements=[job_runs_t.c.run_id],
                    set_={
                        "job_name": stmt.excluded.job_name,
                        "started_at": stmt.excluded.started_at,
                        "finished_at": stmt.excluded.finished_at,
                        "status": stmt.excluded.status,
                        "details": stmt.excluded.details,
                    },
                )
            )
        return rid

    def list_job_runs(self, job_name: Optional[str] = None, limit: int = 20) -> List[Dict[str, Any]]:
        if self._is_sqlite():
            with self._sqlite() as conn:
                if job_name:
                    rows = conn.execute(
                        "SELECT run_id, job_name, started_at, finished_at, status, details FROM job_runs WHERE job_name = ? ORDER BY started_at DESC LIMIT ?",
                        (job_name, limit),
                    ).fetchall()
                else:
                    rows = conn.execute(
                        "SELECT run_id, job_name, started_at, finished_at, status, details FROM job_runs ORDER BY started_at DESC LIMIT ?",
                        (limit,),
                    ).fetchall()
            out = [dict(r) for r in rows]
        else:
            stmt = select(job_runs_t.c.run_id, job_runs_t.c.job_name, job_runs_t.c.started_at, job_runs_t.c.finished_at, job_runs_t.c.status, job_runs_t.c.details)
            if job_name:
                stmt = stmt.where(job_runs_t.c.job_name == job_name)
            stmt = stmt.order_by(job_runs_t.c.started_at.desc()).limit(limit)
            with self.engine().connect() as conn:
                out = [dict(r) for r in conn.execute(stmt).mappings().all()]
        for r in out:
            if hasattr(r.get("started_at"), "isoformat"):
                r["started_at"] = r["started_at"].isoformat()
            if hasattr(r.get("finished_at"), "isoformat"):
                r["finished_at"] = r["finished_at"].isoformat()
            try:
                r["details"] = json.loads(r.get("details") or "{}")
            except Exception:
                r["details"] = {"raw": r.get("details")}
        return out

    # ---- Meta ----
    def set_meta(self, key: str, value: str) -> None:
        if self._is_sqlite():
            with self._sqlite() as conn:
                conn.execute("INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)", (key, value))
            return
        with self.engine().begin() as conn:
            from sqlalchemy.dialects.postgresql import insert as pg_insert

            row = {"key": key, "value": value}
            stmt = pg_insert(meta_t).values(row)
            conn.execute(stmt.on_conflict_do_update(index_elements=[meta_t.c.key], set_={"value": stmt.excluded.value}))

    def get_meta(self, key: str) -> Optional[str]:
        if self._is_sqlite():
            with self._sqlite() as conn:
                row = conn.execute("SELECT value FROM meta WHERE key = ?", (key,)).fetchone()
            return str(row[0]) if row else None
        with self.engine().connect() as conn:
            r = conn.execute(select(meta_t.c.value).where(meta_t.c.key == key)).first()
            return r[0] if r else None

    def list_meta(self, prefix: Optional[str] = None) -> Dict[str, str]:
        if self._is_sqlite():
            with self._sqlite() as conn:
                if prefix:
                    rows = conn.execute("SELECT key, value FROM meta WHERE key LIKE ?", (f"{prefix}%",)).fetchall()
                else:
                    rows = conn.execute("SELECT key, value FROM meta").fetchall()
            return {str(r[0]): str(r[1]) for r in rows}
        stmt = select(meta_t.c.key, meta_t.c.value)
        if prefix:
            stmt = stmt.where(meta_t.c.key.like(f"{prefix}%"))
        with self.engine().connect() as conn:
            rows = conn.execute(stmt).all()
            return {str(r[0]): str(r[1]) for r in rows}

    def data_coverage(self) -> Dict[str, Any]:
        company_map = {str(c.get("symbol") or "").upper(): c for c in self.list_companies(limit=100000)}
        symbols = sorted(set(company_map) | set(self.list_price_symbols()))
        rows = []
        latest = None
        for sym in symbols:
            c = company_map.get(sym, {"symbol": sym, "name": sym, "sector": "Imported"})
            audit = self.history_summary(sym)
            bar = self.get_latest_bar(sym)
            latest_date = str(bar.get("date")) if bar and bar.get("date") else audit.get("last_date")
            if latest_date:
                latest = max(latest or latest_date, latest_date)
            rows.append(
                {
                    "symbol": sym,
                    "name": c.get("name"),
                    "sector": c.get("sector"),
                    "rows": audit.get("rows", 0),
                    "first_date": audit.get("first_date"),
                    "last_date": audit.get("last_date"),
                    "zero_volume_rows": audit.get("zero_volume_rows", 0),
                    "missing_close": audit.get("missing_close", 0),
                    "suspicious_ranges": audit.get("suspicious_ranges", 0),
                    "latest_bar_date": latest_date,
                }
            )
        rows.sort(key=lambda x: ((x.get("rows") or 0), x.get("symbol") or ""))
        return {
            "symbols": len(rows),
            "symbols_with_history": sum(1 for r in rows if (r.get("rows") or 0) > 0),
            "symbols_ready_for_prediction": sum(1 for r in rows if (r.get("rows") or 0) >= 120),
            "latest_price_date": latest,
            "rows": rows,
        }
