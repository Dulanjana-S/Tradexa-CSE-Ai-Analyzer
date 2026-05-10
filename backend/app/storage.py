from __future__ import annotations

import json
import secrets
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
        inspect,
        MetaData,
        String,
        Table,
        Text,
        create_engine,
        or_,
        select,
    )
    from sqlalchemy.engine import Engine
except Exception:  # pragma: no cover
    Column = Date = DateTime = Float = Integer = MetaData = String = Table = Text = None  # type: ignore
    create_engine = or_ = select = inspect = None  # type: ignore
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

    audit_logs_t = Table(
        "audit_logs",
        metadata,
        Column("audit_id", String(128), primary_key=True),
        Column("username", String(64), nullable=True, index=True),
        Column("role", String(32), nullable=True),
        Column("action", String(128), nullable=False, index=True),
        Column("target_type", String(64), nullable=True),
        Column("target_id", String(128), nullable=True),
        Column("status", String(32), nullable=True),
        Column("ip_address", String(64), nullable=True),
        Column("details", Text, nullable=True),
        Column("created_at", DateTime, nullable=True),
    )

    users_t = Table(
        "users",
        metadata,
        Column("username", String(64), primary_key=True),
        Column("password_hash", Text, nullable=False),
        Column("role", String(32), nullable=False),
        Column("display_name", Text, nullable=True),
        Column("email", Text, nullable=True),
        Column("created_at", DateTime, nullable=True),
        Column("last_login_at", DateTime, nullable=True),
    )

    sessions_t = Table(
        "sessions",
        metadata,
        Column("session_id", String(128), primary_key=True),
        Column("username", String(64), nullable=False),
        Column("created_at", DateTime, nullable=True),
        Column("expires_at", DateTime, nullable=True),
    )

    password_reset_tokens_t = Table(
        "password_reset_tokens",
        metadata,
        Column("token", String(128), primary_key=True),
        Column("username", String(64), nullable=False),
        Column("created_at", DateTime, nullable=True),
        Column("expires_at", DateTime, nullable=True),
        Column("used_at", DateTime, nullable=True),
    )

    model_registry_t = Table(
        "model_registry",
        metadata,
        Column("model_id", String(128), primary_key=True),
        Column("path", Text, nullable=False),
        Column("created_at", DateTime, nullable=True),
        Column("is_active", Integer, nullable=False),
        Column("meta", Text, nullable=True),
    )

    alerts_t = Table(
        "alerts",
        metadata,
        Column("alert_id", String(128), primary_key=True),
        Column("username", String(64), nullable=False, index=True),
        Column("symbol", String(32), nullable=True, index=True),
        Column("alert_type", String(64), nullable=False),
        Column("target_value", Float, nullable=True),
        Column("is_enabled", Integer, nullable=False),
        Column("is_triggered", Integer, nullable=False),
        Column("last_triggered_at", DateTime, nullable=True),
        Column("created_at", DateTime, nullable=True),
        Column("updated_at", DateTime, nullable=True),
        Column("meta", Text, nullable=True),
    )

    notifications_t = Table(
        "notifications",
        metadata,
        Column("notification_id", String(128), primary_key=True),
        Column("username", String(64), nullable=False, index=True),
        Column("category", String(64), nullable=False),
        Column("title", Text, nullable=False),
        Column("message", Text, nullable=True),
        Column("symbol", String(32), nullable=True, index=True),
        Column("severity", String(32), nullable=True),
        Column("link", Text, nullable=True),
        Column("is_read", Integer, nullable=False),
        Column("created_at", DateTime, nullable=True),
        Column("meta", Text, nullable=True),
    )


    notification_dispatch_queue_t = Table(
        "notification_dispatch_queue",
        metadata,
        Column("queue_id", String(128), primary_key=True),
        Column("username", String(64), nullable=False, index=True),
        Column("notification_id", String(128), nullable=False, index=True),
        Column("channel", String(32), nullable=False),
        Column("status", String(32), nullable=False),
        Column("attempts", Integer, nullable=False),
        Column("next_attempt_at", DateTime, nullable=True),
        Column("sent_at", DateTime, nullable=True),
        Column("error", Text, nullable=True),
        Column("payload", Text, nullable=True),
        Column("created_at", DateTime, nullable=True),
        Column("updated_at", DateTime, nullable=True),
    )

    portfolio_accounts_t = Table(
        "portfolio_accounts",
        metadata,
        Column("portfolio_id", String(128), primary_key=True),
        Column("username", String(64), nullable=False, index=True),
        Column("name", String(128), nullable=False),
        Column("description", Text, nullable=True),
        Column("currency", String(16), nullable=True),
        Column("is_default", Integer, nullable=False),
        Column("is_archived", Integer, nullable=False),
        Column("created_at", DateTime, nullable=True),
        Column("updated_at", DateTime, nullable=True),
    )

    portfolio_cash_movements_t = Table(
        "portfolio_cash_movements",
        metadata,
        Column("cash_id", String(128), primary_key=True),
        Column("portfolio_id", String(128), nullable=False, index=True),
        Column("username", String(64), nullable=False, index=True),
        Column("movement_type", String(32), nullable=False),
        Column("amount", Float, nullable=False),
        Column("movement_date", String(32), nullable=True),
        Column("notes", Text, nullable=True),
        Column("created_at", DateTime, nullable=True),
    )

    portfolio_transactions_t = Table(
        "portfolio_transactions",
        metadata,
        Column("tx_id", String(128), primary_key=True),
        Column("portfolio_id", String(128), nullable=True, index=True),
        Column("username", String(64), nullable=False, index=True),
        Column("symbol", String(32), nullable=False, index=True),
        Column("tx_type", String(16), nullable=False),
        Column("quantity", Float, nullable=False),
        Column("price", Float, nullable=False),
        Column("fees", Float, nullable=True),
        Column("traded_at", String(32), nullable=True),
        Column("notes", Text, nullable=True),
        Column("created_at", DateTime, nullable=True),
    )

    announcement_meta_t = Table(
        "announcement_meta",
        metadata,
        Column("ann_id", String(128), primary_key=True),
        Column("importance", String(32), nullable=True),
        Column("review_status", String(32), nullable=True),
        Column("tags", Text, nullable=True),
        Column("review_notes", Text, nullable=True),
        Column("reviewed_by", String(64), nullable=True),
        Column("reviewed_at", DateTime, nullable=True),
    )

    corporate_actions_t = Table(
        "corporate_actions",
        metadata,
        Column("action_id", String(128), primary_key=True),
        Column("symbol", String(32), nullable=False, index=True),
        Column("ex_date", String(32), nullable=False, index=True),
        Column("action_type", String(64), nullable=False),
        Column("amount", Float, nullable=True),
        Column("ratio_numerator", Float, nullable=True),
        Column("ratio_denominator", Float, nullable=True),
        Column("description", Text, nullable=True),
        Column("source", Text, nullable=True),
        Column("created_at", DateTime, nullable=True),
    )


    news_sentiment_t = Table(
        "news_sentiment",
        metadata,
        Column("item_id", String(128), primary_key=True),
        Column("ann_id", String(128), nullable=True, index=True),
        Column("symbol", String(32), nullable=True, index=True),
        Column("date", String(32), nullable=True, index=True),
        Column("title", Text, nullable=True),
        Column("source_url", Text, nullable=True),
        Column("source_type", String(64), nullable=True),
        Column("sentiment_score", Float, nullable=True),
        Column("sentiment_label", String(32), nullable=True),
        Column("impact_score", Float, nullable=True),
        Column("event_type", String(64), nullable=True),
        Column("confidence", Float, nullable=True),
        Column("keywords", Text, nullable=True),
        Column("meta", Text, nullable=True),
        Column("created_at", DateTime, nullable=True),
    )

    macro_indicators_t = Table(
        "macro_indicators",
        metadata,
        Column("indicator_key", String(64), primary_key=True),
        Column("date", String(32), primary_key=True),
        Column("value", Float, nullable=False),
        Column("source", Text, nullable=True),
        Column("label", Text, nullable=True),
        Column("category", String(64), nullable=True),
        Column("created_at", DateTime, nullable=True),
    )

    document_intelligence_t = Table(
        "document_intelligence",
        metadata,
        Column("doc_id", String(128), primary_key=True),
        Column("ann_id", String(128), nullable=True, index=True),
        Column("symbol", String(32), nullable=True, index=True),
        Column("date", String(32), nullable=True, index=True),
        Column("title", Text, nullable=True),
        Column("document_url", Text, nullable=True),
        Column("document_type", String(64), nullable=True),
        Column("summary", Text, nullable=True),
        Column("extracted_text", Text, nullable=True),
        Column("pages_analyzed", Float, nullable=True),
        Column("sentiment_score", Float, nullable=True),
        Column("sentiment_label", String(32), nullable=True),
        Column("impact_score", Float, nullable=True),
        Column("event_type", String(64), nullable=True),
        Column("confidence", Float, nullable=True),
        Column("keywords", Text, nullable=True),
        Column("meta", Text, nullable=True),
        Column("created_at", DateTime, nullable=True),
        Column("updated_at", DateTime, nullable=True),
    )

    source_whitelist_t = Table(
        "source_whitelist",
        metadata,
        Column("source_name", String(128), primary_key=True),
        Column("domain", String(128), nullable=False),
        Column("base_url", Text, nullable=False),
        Column("enabled", Float, nullable=False),
        Column("parser_kind", String(64), nullable=False),
        Column("scope_hint", String(64), nullable=True),
        Column("meta", Text, nullable=True),
        Column("created_at", DateTime, nullable=True),
    )

    external_news_items_t = Table(
        "external_news_items",
        metadata,
        Column("item_id", String(128), primary_key=True),
        Column("source_name", String(128), nullable=False, index=True),
        Column("source_domain", String(128), nullable=False),
        Column("url", Text, nullable=False),
        Column("title", Text, nullable=False),
        Column("published_at", String(64), nullable=True),
        Column("published_date", String(32), nullable=True, index=True),
        Column("scope", String(32), nullable=True),
        Column("symbol", String(32), nullable=True, index=True),
        Column("company_name", Text, nullable=True),
        Column("sentiment_score", Float, nullable=True),
        Column("sentiment_label", String(32), nullable=True),
        Column("impact_score", Float, nullable=True),
        Column("event_type", String(64), nullable=True),
        Column("confidence", Float, nullable=True),
        Column("keywords", Text, nullable=True),
        Column("raw", Text, nullable=True),
        Column("created_at", DateTime, nullable=True),
    )
else:  # pragma: no cover
    companies_t = prices_t = indices_t = announcements_t = meta_t = watchlists_t = preferences_t = job_runs_t = users_t = sessions_t = password_reset_tokens_t = model_registry_t = alerts_t = notifications_t = notification_dispatch_queue_t = portfolio_accounts_t = portfolio_cash_movements_t = portfolio_transactions_t = announcement_meta_t = corporate_actions_t = news_sentiment_t = macro_indicators_t = document_intelligence_t = source_whitelist_t = external_news_items_t = audit_logs_t = None  # type: ignore


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

    def _ensure_sql_schema_compat(self) -> None:
        """Lightweight production migration for existing PostgreSQL tables.

        metadata.create_all() creates missing tables but it does not add columns to
        tables that already exist. Azure deployments can therefore keep an older
        users/sessions schema and then fail during registration/login. This helper
        adds any missing nullable columns defined in SQLAlchemy metadata.
        """
        if self._is_sqlite() or metadata is None or inspect is None:
            return
        engine = self.engine()
        if engine.dialect.name != "postgresql":
            return
        inspector = inspect(engine)
        existing_tables = set(inspector.get_table_names())
        with engine.begin() as conn:
            for table in metadata.sorted_tables:
                if table.name not in existing_tables:
                    continue
                existing_columns = {col["name"] for col in inspector.get_columns(table.name)}
                for column in table.columns:
                    if column.name in existing_columns:
                        continue
                    col_type = column.type.compile(dialect=engine.dialect)
                    table_name = table.name.replace('"', '""')
                    column_name = column.name.replace('"', '""')
                    conn.exec_driver_sql(f'ALTER TABLE "{table_name}" ADD COLUMN IF NOT EXISTS "{column_name}" {col_type}')

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
                    CREATE TABLE IF NOT EXISTS audit_logs (
                        audit_id TEXT PRIMARY KEY,
                        username TEXT,
                        role TEXT,
                        action TEXT NOT NULL,
                        target_type TEXT,
                        target_id TEXT,
                        status TEXT,
                        ip_address TEXT,
                        details TEXT,
                        created_at TEXT
                    );
                    CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON audit_logs(created_at DESC);
                    CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action, created_at DESC);
                    CREATE INDEX IF NOT EXISTS idx_audit_logs_username ON audit_logs(username, created_at DESC);
                    CREATE TABLE IF NOT EXISTS users (
                        username TEXT PRIMARY KEY,
                        password_hash TEXT NOT NULL,
                        role TEXT NOT NULL,
                        display_name TEXT,
                        email TEXT,
                        created_at TEXT,
                        last_login_at TEXT
                    );
                    CREATE TABLE IF NOT EXISTS sessions (
                        session_id TEXT PRIMARY KEY,
                        username TEXT NOT NULL,
                        created_at TEXT,
                        expires_at TEXT
                    );
                    CREATE TABLE IF NOT EXISTS password_reset_tokens (
                        token TEXT PRIMARY KEY,
                        username TEXT NOT NULL,
                        created_at TEXT,
                        expires_at TEXT,
                        used_at TEXT
                    );
                    CREATE INDEX IF NOT EXISTS idx_password_reset_username ON password_reset_tokens(username, expires_at DESC);
                    CREATE TABLE IF NOT EXISTS model_registry (
                        model_id TEXT PRIMARY KEY,
                        path TEXT NOT NULL,
                        created_at TEXT,
                        is_active INTEGER NOT NULL DEFAULT 0,
                        meta TEXT
                    );
                    CREATE TABLE IF NOT EXISTS alerts (
                        alert_id TEXT PRIMARY KEY,
                        username TEXT NOT NULL,
                        symbol TEXT,
                        alert_type TEXT NOT NULL,
                        target_value REAL,
                        is_enabled INTEGER NOT NULL,
                        is_triggered INTEGER NOT NULL,
                        last_triggered_at TEXT,
                        created_at TEXT,
                        updated_at TEXT,
                        meta TEXT
                    );
                    CREATE INDEX IF NOT EXISTS idx_alerts_username ON alerts(username);
                    CREATE INDEX IF NOT EXISTS idx_alerts_symbol ON alerts(symbol);
                    CREATE TABLE IF NOT EXISTS notifications (
                        notification_id TEXT PRIMARY KEY,
                        username TEXT NOT NULL,
                        category TEXT NOT NULL,
                        title TEXT NOT NULL,
                        message TEXT,
                        symbol TEXT,
                        severity TEXT,
                        link TEXT,
                        is_read INTEGER NOT NULL,
                        created_at TEXT,
                        meta TEXT
                    );
                    CREATE INDEX IF NOT EXISTS idx_notifications_username ON notifications(username);
                    CREATE INDEX IF NOT EXISTS idx_notifications_symbol ON notifications(symbol);
                    CREATE TABLE IF NOT EXISTS notification_dispatch_queue (
                        queue_id TEXT PRIMARY KEY,
                        username TEXT NOT NULL,
                        notification_id TEXT NOT NULL,
                        channel TEXT NOT NULL,
                        status TEXT NOT NULL,
                        attempts INTEGER NOT NULL DEFAULT 0,
                        next_attempt_at TEXT,
                        sent_at TEXT,
                        error TEXT,
                        payload TEXT,
                        created_at TEXT,
                        updated_at TEXT
                    );
                    CREATE INDEX IF NOT EXISTS idx_notification_dispatch_status ON notification_dispatch_queue(status, next_attempt_at);
                    CREATE INDEX IF NOT EXISTS idx_notification_dispatch_username ON notification_dispatch_queue(username, created_at DESC);
                    CREATE TABLE IF NOT EXISTS portfolio_accounts (
                        portfolio_id TEXT PRIMARY KEY,
                        username TEXT NOT NULL,
                        name TEXT NOT NULL,
                        description TEXT,
                        currency TEXT,
                        is_default INTEGER NOT NULL DEFAULT 0,
                        is_archived INTEGER NOT NULL DEFAULT 0,
                        created_at TEXT,
                        updated_at TEXT
                    );
                    CREATE INDEX IF NOT EXISTS idx_portfolio_accounts_username ON portfolio_accounts(username, is_archived, is_default);
                    CREATE TABLE IF NOT EXISTS portfolio_cash_movements (
                        cash_id TEXT PRIMARY KEY,
                        portfolio_id TEXT NOT NULL,
                        username TEXT NOT NULL,
                        movement_type TEXT NOT NULL,
                        amount REAL NOT NULL,
                        movement_date TEXT,
                        notes TEXT,
                        created_at TEXT
                    );
                    CREATE INDEX IF NOT EXISTS idx_portfolio_cash_portfolio ON portfolio_cash_movements(portfolio_id, movement_date DESC);
                    CREATE TABLE IF NOT EXISTS portfolio_transactions (
                        tx_id TEXT PRIMARY KEY,
                        portfolio_id TEXT,
                        username TEXT NOT NULL,
                        symbol TEXT NOT NULL,
                        tx_type TEXT NOT NULL,
                        quantity REAL NOT NULL,
                        price REAL NOT NULL,
                        fees REAL,
                        traded_at TEXT,
                        notes TEXT,
                        created_at TEXT
                    );
                    CREATE INDEX IF NOT EXISTS idx_portfolio_transactions_username ON portfolio_transactions(username);
                    CREATE INDEX IF NOT EXISTS idx_portfolio_transactions_symbol ON portfolio_transactions(symbol);
                    CREATE TABLE IF NOT EXISTS announcement_meta (
                        ann_id TEXT PRIMARY KEY,
                        importance TEXT,
                        review_status TEXT,
                        tags TEXT,
                        review_notes TEXT,
                        reviewed_by TEXT,
                        reviewed_at TEXT
                    );
                    CREATE TABLE IF NOT EXISTS corporate_actions (
                        action_id TEXT PRIMARY KEY,
                        symbol TEXT NOT NULL,
                        ex_date TEXT NOT NULL,
                        action_type TEXT NOT NULL,
                        amount REAL,
                        ratio_numerator REAL,
                        ratio_denominator REAL,
                        description TEXT,
                        source TEXT,
                        created_at TEXT
                    );
                    CREATE INDEX IF NOT EXISTS idx_corporate_actions_symbol ON corporate_actions(symbol, ex_date DESC);
                    CREATE TABLE IF NOT EXISTS news_sentiment (
                        item_id TEXT PRIMARY KEY,
                        ann_id TEXT,
                        symbol TEXT,
                        date TEXT,
                        title TEXT,
                        source_url TEXT,
                        source_type TEXT,
                        sentiment_score REAL,
                        sentiment_label TEXT,
                        impact_score REAL,
                        event_type TEXT,
                        confidence REAL,
                        keywords TEXT,
                        meta TEXT,
                        created_at TEXT
                    );
                    CREATE INDEX IF NOT EXISTS idx_news_sentiment_symbol_date ON news_sentiment(symbol, date DESC);
                    CREATE INDEX IF NOT EXISTS idx_news_sentiment_ann ON news_sentiment(ann_id);
                    CREATE TABLE IF NOT EXISTS macro_indicators (
                        indicator_key TEXT NOT NULL,
                        date TEXT NOT NULL,
                        value REAL NOT NULL,
                        source TEXT,
                        label TEXT,
                        category TEXT,
                        created_at TEXT,
                        PRIMARY KEY(indicator_key, date)
                    );
                    CREATE INDEX IF NOT EXISTS idx_macro_indicators_key_date ON macro_indicators(indicator_key, date DESC);
                    CREATE TABLE IF NOT EXISTS document_intelligence (
                        doc_id TEXT PRIMARY KEY,
                        ann_id TEXT,
                        symbol TEXT,
                        date TEXT,
                        title TEXT,
                        document_url TEXT,
                        document_type TEXT,
                        summary TEXT,
                        extracted_text TEXT,
                        pages_analyzed REAL,
                        sentiment_score REAL,
                        sentiment_label TEXT,
                        impact_score REAL,
                        event_type TEXT,
                        confidence REAL,
                        keywords TEXT,
                        meta TEXT,
                        created_at TEXT,
                        updated_at TEXT
                    );
                    CREATE INDEX IF NOT EXISTS idx_document_intelligence_symbol_date ON document_intelligence(symbol, date DESC);
                    CREATE INDEX IF NOT EXISTS idx_document_intelligence_ann ON document_intelligence(ann_id);
                    CREATE TABLE IF NOT EXISTS source_whitelist (
                        source_name TEXT PRIMARY KEY,
                        domain TEXT NOT NULL,
                        base_url TEXT NOT NULL,
                        enabled REAL NOT NULL DEFAULT 1,
                        parser_kind TEXT NOT NULL,
                        scope_hint TEXT,
                        meta TEXT,
                        created_at TEXT
                    );
                    CREATE TABLE IF NOT EXISTS external_news_items (
                        item_id TEXT PRIMARY KEY,
                        source_name TEXT NOT NULL,
                        source_domain TEXT NOT NULL,
                        url TEXT NOT NULL UNIQUE,
                        title TEXT NOT NULL,
                        published_at TEXT,
                        published_date TEXT,
                        scope TEXT,
                        symbol TEXT,
                        company_name TEXT,
                        sentiment_score REAL,
                        sentiment_label TEXT,
                        impact_score REAL,
                        event_type TEXT,
                        confidence REAL,
                        keywords TEXT,
                        raw TEXT,
                        created_at TEXT
                    );
                    CREATE INDEX IF NOT EXISTS idx_external_news_symbol_date ON external_news_items(symbol, published_date DESC);
                    CREATE INDEX IF NOT EXISTS idx_external_news_source_date ON external_news_items(source_name, published_date DESC);
                    CREATE INDEX IF NOT EXISTS idx_prices_symbol_date ON prices(symbol, date DESC);
                    CREATE INDEX IF NOT EXISTS idx_indices_name_date ON indices(name, date DESC);
                    CREATE INDEX IF NOT EXISTS idx_job_runs_job_name ON job_runs(job_name, started_at DESC);
                    """
                )
                cols = {row[1] for row in conn.execute("PRAGMA table_info(portfolio_transactions)").fetchall()}
                if "portfolio_id" not in cols:
                    conn.execute("ALTER TABLE portfolio_transactions ADD COLUMN portfolio_id TEXT")
                conn.execute("CREATE INDEX IF NOT EXISTS idx_portfolio_transactions_portfolio ON portfolio_transactions(portfolio_id, traded_at DESC)")
                tx_rows = conn.execute("SELECT DISTINCT username FROM portfolio_transactions WHERE portfolio_id IS NULL OR portfolio_id = ''").fetchall()
                for row in tx_rows:
                    uname = str(row[0]).lower()
                    pid = f"pf_{uname}_default".replace("@", "_").replace(".", "_")
                    now = _utc_now()
                    conn.execute(
                        """
                        INSERT OR IGNORE INTO portfolio_accounts (portfolio_id, username, name, description, currency, is_default, is_archived, created_at, updated_at)
                        VALUES (?, ?, 'Main Portfolio', 'Default portfolio', 'LKR', 1, 0, ?, ?)
                        """,
                        (pid, uname, now, now),
                    )
                    conn.execute("UPDATE portfolio_transactions SET portfolio_id=? WHERE username=? AND (portfolio_id IS NULL OR portfolio_id='')", (pid, uname))
            return

        if metadata is None:
            raise RuntimeError("SQLAlchemy metadata is unavailable")
        metadata.create_all(self.engine())
        self._ensure_sql_schema_compat()

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
            out = [dict(r) for r in rows]
        else:
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
                out = [dict(r) for r in rows]
        meta = self.list_announcement_meta()
        for r in out:
            m = meta.get(str(r.get('ann_id')))
            if m:
                r['importance'] = m.get('importance')
                r['review_status'] = m.get('review_status')
                r['tags'] = m.get('tags') or []
                r['review_notes'] = m.get('review_notes')
                r['reviewed_by'] = m.get('reviewed_by')
                r['reviewed_at'] = m.get('reviewed_at')
                r['is_important'] = bool((m.get('importance') or '').lower() in {'important','high','critical'})
            else:
                r['importance'] = None
                r['review_status'] = None
                r['tags'] = []
                r['review_notes'] = None
                r['reviewed_by'] = None
                r['reviewed_at'] = None
                r['is_important'] = False
        return out

    # ---- Sentiment & Macro ----
    def upsert_news_sentiment(self, rows: List[Dict[str, Any]]) -> int:
        payload = []
        for row in rows:
            item_id = str(row.get("item_id") or row.get("ann_id") or "").strip()
            if not item_id:
                continue
            payload.append({
                "item_id": item_id,
                "ann_id": row.get("ann_id"),
                "symbol": (row.get("symbol") or "").upper() or None,
                "date": str(row.get("date") or "")[:10] or None,
                "title": row.get("title"),
                "source_url": row.get("source_url"),
                "source_type": row.get("source_type"),
                "sentiment_score": row.get("sentiment_score"),
                "sentiment_label": row.get("sentiment_label"),
                "impact_score": row.get("impact_score"),
                "event_type": row.get("event_type"),
                "confidence": row.get("confidence"),
                "keywords": _json_dumps(row.get("keywords") or []),
                "meta": _json_dumps(row.get("meta") or {}),
                "created_at": _utc_now(),
            })
        if not payload:
            return 0
        if self._is_sqlite():
            with self._sqlite() as conn:
                conn.executemany(
                    """
                    INSERT OR REPLACE INTO news_sentiment
                    (item_id, ann_id, symbol, date, title, source_url, source_type, sentiment_score, sentiment_label, impact_score, event_type, confidence, keywords, meta, created_at)
                    VALUES (:item_id, :ann_id, :symbol, :date, :title, :source_url, :source_type, :sentiment_score, :sentiment_label, :impact_score, :event_type, :confidence, :keywords, :meta, :created_at)
                    """,
                    payload,
                )
            return len(payload)
        with self.engine().begin() as conn:
            from sqlalchemy.dialects.postgresql import insert as pg_insert
            stmt = pg_insert(news_sentiment_t).values(payload)
            update_cols = {c.name: getattr(stmt.excluded, c.name) for c in news_sentiment_t.c if c.name != "item_id"}
            conn.execute(stmt.on_conflict_do_update(index_elements=[news_sentiment_t.c.item_id], set_=update_cols))
        return len(payload)

    def get_news_sentiment(self, symbol: Optional[str] = None, limit: int = 200, source_types: Optional[List[str]] = None) -> List[Dict[str, Any]]:
        source_types = [str(x) for x in (source_types or []) if x]
        if self._is_sqlite():
            clauses = []
            params: List[Any] = []
            if symbol:
                clauses.append("symbol = ?")
                params.append(symbol.upper())
            if source_types:
                placeholders = ",".join("?" for _ in source_types)
                clauses.append(f"source_type IN ({placeholders})")
                params.extend(source_types)
            where = f"WHERE {' AND '.join(clauses)}" if clauses else ""
            with self._sqlite() as conn:
                rows = conn.execute(
                    f"SELECT item_id, ann_id, symbol, date, title, source_url, source_type, sentiment_score, sentiment_label, impact_score, event_type, confidence, keywords, meta, created_at FROM news_sentiment {where} ORDER BY date DESC, created_at DESC LIMIT ?",
                    (*params, limit),
                ).fetchall()
            out = [dict(r) for r in rows]
        else:
            with self.engine().connect() as conn:
                stmt = select(
                    news_sentiment_t.c.item_id, news_sentiment_t.c.ann_id, news_sentiment_t.c.symbol, news_sentiment_t.c.date, news_sentiment_t.c.title,
                    news_sentiment_t.c.source_url, news_sentiment_t.c.source_type, news_sentiment_t.c.sentiment_score, news_sentiment_t.c.sentiment_label,
                    news_sentiment_t.c.impact_score, news_sentiment_t.c.event_type, news_sentiment_t.c.confidence, news_sentiment_t.c.keywords, news_sentiment_t.c.meta, news_sentiment_t.c.created_at
                )
                if symbol:
                    stmt = stmt.where(news_sentiment_t.c.symbol == symbol.upper())
                if source_types:
                    stmt = stmt.where(news_sentiment_t.c.source_type.in_(source_types))
                stmt = stmt.order_by(news_sentiment_t.c.date.desc(), news_sentiment_t.c.created_at.desc()).limit(limit)
                out = [dict(r) for r in conn.execute(stmt).mappings().all()]
        for row in out:
            for key in ("keywords", "meta"):
                value = row.get(key)
                if isinstance(value, str):
                    try:
                        row[key] = json.loads(value)
                    except Exception:
                        row[key] = [] if key == "keywords" else {}
        return out

    def get_sentiment_feature_series(self, symbol: str, limit: int = 1500, source_types: Optional[List[str]] = None) -> List[Dict[str, Any]]:
        rows = self.get_news_sentiment(symbol=symbol, limit=limit, source_types=source_types)
        grouped: Dict[str, Dict[str, Any]] = {}
        for row in rows:
            dt = str(row.get("date") or "")[:10]
            if not dt:
                continue
            bucket = grouped.setdefault(dt, {
                "date": dt,
                "sentiment_score": 0.0,
                "impact_score": 0.0,
                "doc_count": 0,
                "positive_count": 0,
                "negative_count": 0,
                "neutral_count": 0,
                "dividend_count": 0,
                "earnings_count": 0,
                "corporate_action_count": 0,
                "regulatory_count": 0,
            })
            bucket["sentiment_score"] += float(row.get("sentiment_score") or 0.0)
            bucket["impact_score"] += float(row.get("impact_score") or 0.0)
            bucket["doc_count"] += 1
            label = str(row.get("sentiment_label") or "neutral")
            bucket[f"{label}_count"] = bucket.get(f"{label}_count", 0) + 1
            event = str(row.get("event_type") or "general")
            if event in {"dividend", "earnings", "corporate_action", "regulatory"}:
                bucket[f"{event}_count"] = bucket.get(f"{event}_count", 0) + 1
        out = []
        for dt in sorted(grouped):
            bucket = grouped[dt]
            docs = max(1, int(bucket["doc_count"]))
            bucket["sentiment_score"] = float(bucket["sentiment_score"]) / docs
            out.append(bucket)
        return out[-limit:]

    def upsert_macro_indicators(self, rows: List[Dict[str, Any]]) -> int:
        payload = []
        for row in rows:
            key = str(row.get("indicator_key") or "").strip().lower()
            dt = str(row.get("date") or "")[:10]
            if not key or not dt:
                continue
            payload.append({
                "indicator_key": key,
                "date": dt,
                "value": row.get("value"),
                "source": row.get("source"),
                "label": row.get("label"),
                "category": row.get("category"),
                "created_at": _utc_now(),
            })
        if not payload:
            return 0
        if self._is_sqlite():
            with self._sqlite() as conn:
                conn.executemany(
                    """
                    INSERT OR REPLACE INTO macro_indicators
                    (indicator_key, date, value, source, label, category, created_at)
                    VALUES (:indicator_key, :date, :value, :source, :label, :category, :created_at)
                    """,
                    payload,
                )
            return len(payload)
        with self.engine().begin() as conn:
            from sqlalchemy.dialects.postgresql import insert as pg_insert
            stmt = pg_insert(macro_indicators_t).values(payload)
            conn.execute(stmt.on_conflict_do_update(index_elements=[macro_indicators_t.c.indicator_key, macro_indicators_t.c.date], set_={
                "value": stmt.excluded.value,
                "source": stmt.excluded.source,
                "label": stmt.excluded.label,
                "category": stmt.excluded.category,
                "created_at": stmt.excluded.created_at,
            }))
        return len(payload)

    def get_macro_series(self, keys: Optional[List[str]] = None, limit: int = 5000) -> List[Dict[str, Any]]:
        key_list = [k.strip().lower() for k in (keys or []) if k]
        if self._is_sqlite():
            with self._sqlite() as conn:
                if key_list:
                    placeholders = ",".join("?" for _ in key_list)
                    rows = conn.execute(
                        f"SELECT indicator_key, date, value, source, label, category, created_at FROM macro_indicators WHERE indicator_key IN ({placeholders}) ORDER BY date DESC LIMIT ?",
                        (*key_list, limit),
                    ).fetchall()
                else:
                    rows = conn.execute(
                        "SELECT indicator_key, date, value, source, label, category, created_at FROM macro_indicators ORDER BY date DESC LIMIT ?",
                        (limit,),
                    ).fetchall()
            out = [dict(r) for r in rows]
        else:
            with self.engine().connect() as conn:
                stmt = select(macro_indicators_t.c.indicator_key, macro_indicators_t.c.date, macro_indicators_t.c.value, macro_indicators_t.c.source, macro_indicators_t.c.label, macro_indicators_t.c.category, macro_indicators_t.c.created_at)
                if key_list:
                    stmt = stmt.where(macro_indicators_t.c.indicator_key.in_(key_list))
                stmt = stmt.order_by(macro_indicators_t.c.date.desc()).limit(limit)
                out = [dict(r) for r in conn.execute(stmt).mappings().all()]
        out.reverse()
        return out

    # ---- Document intelligence & selected news ----
    def upsert_document_intelligence(self, rows: List[Dict[str, Any]], *, force: bool = True) -> int:
        payload = []
        for row in rows:
            doc_id = str(row.get("doc_id") or "").strip()
            if not doc_id:
                continue
            payload.append({
                "doc_id": doc_id,
                "ann_id": row.get("ann_id"),
                "symbol": (row.get("symbol") or "").upper() or None,
                "date": str(row.get("date") or "")[:10] or None,
                "title": row.get("title"),
                "document_url": row.get("document_url"),
                "document_type": row.get("document_type"),
                "summary": row.get("summary"),
                "extracted_text": row.get("extracted_text"),
                "pages_analyzed": row.get("pages_analyzed"),
                "sentiment_score": row.get("sentiment_score"),
                "sentiment_label": row.get("sentiment_label"),
                "impact_score": row.get("impact_score"),
                "event_type": row.get("event_type"),
                "confidence": row.get("confidence"),
                "keywords": _json_dumps(row.get("keywords") or []),
                "meta": _json_dumps(row.get("meta") or {}),
                "created_at": _utc_now(),
                "updated_at": _utc_now(),
            })
        if not payload:
            return 0
        if self._is_sqlite():
            with self._sqlite() as conn:
                conn.executemany(
                    """
                    INSERT OR REPLACE INTO document_intelligence
                    (doc_id, ann_id, symbol, date, title, document_url, document_type, summary, extracted_text, pages_analyzed, sentiment_score, sentiment_label, impact_score, event_type, confidence, keywords, meta, created_at, updated_at)
                    VALUES (:doc_id, :ann_id, :symbol, :date, :title, :document_url, :document_type, :summary, :extracted_text, :pages_analyzed, :sentiment_score, :sentiment_label, :impact_score, :event_type, :confidence, :keywords, :meta, :created_at, :updated_at)
                    """,
                    payload,
                )
            return len(payload)
        with self.engine().begin() as conn:
            from sqlalchemy.dialects.postgresql import insert as pg_insert
            stmt = pg_insert(document_intelligence_t).values(payload)
            update_cols = {c.name: getattr(stmt.excluded, c.name) for c in document_intelligence_t.c if c.name != "doc_id"}
            conn.execute(stmt.on_conflict_do_update(index_elements=[document_intelligence_t.c.doc_id], set_=update_cols))
        return len(payload)

    def get_document_intelligence(self, symbol: Optional[str] = None, limit: int = 200) -> List[Dict[str, Any]]:
        if self._is_sqlite():
            clauses = []
            params: List[Any] = []
            if symbol:
                clauses.append("symbol = ?")
                params.append(symbol.upper())
            where = f"WHERE {' AND '.join(clauses)}" if clauses else ""
            with self._sqlite() as conn:
                rows = conn.execute(
                    f"SELECT * FROM document_intelligence {where} ORDER BY date DESC, updated_at DESC LIMIT ?",
                    (*params, limit),
                ).fetchall()
            out = [dict(r) for r in rows]
        else:
            with self.engine().connect() as conn:
                stmt = select(document_intelligence_t).order_by(document_intelligence_t.c.date.desc(), document_intelligence_t.c.updated_at.desc()).limit(limit)
                if symbol:
                    stmt = stmt.where(document_intelligence_t.c.symbol == symbol.upper())
                out = [dict(r) for r in conn.execute(stmt).mappings().all()]
        for row in out:
            for key in ("keywords", "meta"):
                value = row.get(key)
                if isinstance(value, str):
                    try:
                        row[key] = json.loads(value)
                    except Exception:
                        row[key] = [] if key == "keywords" else {}
        return out

    def upsert_source_whitelist(self, rows: List[Dict[str, Any]]) -> int:
        payload = []
        for row in rows:
            name = str(row.get("source_name") or "").strip()
            domain = str(row.get("domain") or "").strip().lower()
            base_url = str(row.get("base_url") or "").strip()
            if not name or not domain or not base_url:
                continue
            payload.append({
                "source_name": name,
                "domain": domain,
                "base_url": base_url,
                "enabled": 1 if bool(row.get("enabled", True)) else 0,
                "parser_kind": row.get("parser_kind") or "html_links",
                "scope_hint": row.get("scope_hint") or "market",
                "meta": _json_dumps(row.get("meta") or {}),
                "created_at": _utc_now(),
            })
        if not payload:
            return 0
        if self._is_sqlite():
            with self._sqlite() as conn:
                conn.executemany(
                    """
                    INSERT OR REPLACE INTO source_whitelist
                    (source_name, domain, base_url, enabled, parser_kind, scope_hint, meta, created_at)
                    VALUES (:source_name, :domain, :base_url, :enabled, :parser_kind, :scope_hint, :meta, :created_at)
                    """,
                    payload,
                )
            return len(payload)
        with self.engine().begin() as conn:
            from sqlalchemy.dialects.postgresql import insert as pg_insert
            stmt = pg_insert(source_whitelist_t).values(payload)
            update_cols = {c.name: getattr(stmt.excluded, c.name) for c in source_whitelist_t.c if c.name != "source_name"}
            conn.execute(stmt.on_conflict_do_update(index_elements=[source_whitelist_t.c.source_name], set_=update_cols))
        return len(payload)

    def list_source_whitelist(self, enabled_only: bool = True) -> List[Dict[str, Any]]:
        if self._is_sqlite():
            query = "SELECT * FROM source_whitelist"
            params: Tuple[Any, ...] = ()
            if enabled_only:
                query += " WHERE enabled = 1"
            query += " ORDER BY source_name"
            with self._sqlite() as conn:
                rows = conn.execute(query, params).fetchall()
            out = [dict(r) for r in rows]
        else:
            with self.engine().connect() as conn:
                stmt = select(source_whitelist_t).order_by(source_whitelist_t.c.source_name)
                if enabled_only:
                    stmt = stmt.where(source_whitelist_t.c.enabled == 1)
                out = [dict(r) for r in conn.execute(stmt).mappings().all()]
        for row in out:
            if isinstance(row.get("meta"), str):
                try:
                    row["meta"] = json.loads(row.get("meta") or "{}")
                except Exception:
                    row["meta"] = {}
            row["enabled"] = bool(row.get("enabled"))
        return out

    def upsert_external_news_items(self, rows: List[Dict[str, Any]]) -> int:
        payload = []
        for row in rows:
            item_id = str(row.get("item_id") or "").strip()
            if not item_id:
                continue
            payload.append({
                "item_id": item_id,
                "source_name": row.get("source_name"),
                "source_domain": row.get("source_domain"),
                "url": row.get("url"),
                "title": row.get("title"),
                "published_at": row.get("published_at"),
                "published_date": str(row.get("published_date") or "")[:10] or None,
                "scope": row.get("scope") or "market",
                "symbol": (row.get("symbol") or "").upper() or None,
                "company_name": row.get("company_name"),
                "sentiment_score": row.get("sentiment_score"),
                "sentiment_label": row.get("sentiment_label"),
                "impact_score": row.get("impact_score"),
                "event_type": row.get("event_type"),
                "confidence": row.get("confidence"),
                "keywords": _json_dumps(row.get("keywords") or []),
                "raw": _json_dumps(row.get("raw") or {}),
                "created_at": _utc_now(),
            })
        if not payload:
            return 0
        if self._is_sqlite():
            with self._sqlite() as conn:
                conn.executemany(
                    """
                    INSERT OR REPLACE INTO external_news_items
                    (item_id, source_name, source_domain, url, title, published_at, published_date, scope, symbol, company_name, sentiment_score, sentiment_label, impact_score, event_type, confidence, keywords, raw, created_at)
                    VALUES (:item_id, :source_name, :source_domain, :url, :title, :published_at, :published_date, :scope, :symbol, :company_name, :sentiment_score, :sentiment_label, :impact_score, :event_type, :confidence, :keywords, :raw, :created_at)
                    """,
                    payload,
                )
            return len(payload)
        with self.engine().begin() as conn:
            from sqlalchemy.dialects.postgresql import insert as pg_insert
            stmt = pg_insert(external_news_items_t).values(payload)
            update_cols = {c.name: getattr(stmt.excluded, c.name) for c in external_news_items_t.c if c.name != "item_id"}
            conn.execute(stmt.on_conflict_do_update(index_elements=[external_news_items_t.c.item_id], set_=update_cols))
        return len(payload)

    def get_external_news_items(self, symbol: Optional[str] = None, limit: int = 200) -> List[Dict[str, Any]]:
        if self._is_sqlite():
            if symbol:
                query = "SELECT * FROM external_news_items WHERE symbol = ? ORDER BY published_date DESC, created_at DESC LIMIT ?"
                params: Tuple[Any, ...] = (symbol.upper(), limit)
            else:
                query = "SELECT * FROM external_news_items ORDER BY published_date DESC, created_at DESC LIMIT ?"
                params = (limit,)
            with self._sqlite() as conn:
                rows = conn.execute(query, params).fetchall()
            out = [dict(r) for r in rows]
        else:
            with self.engine().connect() as conn:
                stmt = select(external_news_items_t).order_by(external_news_items_t.c.published_date.desc(), external_news_items_t.c.created_at.desc()).limit(limit)
                if symbol:
                    stmt = stmt.where(external_news_items_t.c.symbol == symbol.upper())
                out = [dict(r) for r in conn.execute(stmt).mappings().all()]
        for row in out:
            for key in ("keywords", "raw"):
                value = row.get(key)
                if isinstance(value, str):
                    try:
                        row[key] = json.loads(value)
                    except Exception:
                        row[key] = [] if key == "keywords" else {}
        return out

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
        normalized_status = str(status or "").lower()
        terminal = normalized_status in {"completed", "failed", "ok"}
        row = {
            "run_id": rid,
            "job_name": job_name,
            "started_at": started_at or _utc_now(),
            "finished_at": finished_at if finished_at is not None else (_utc_now() if terminal else None),
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

    def get_job_run(self, run_id: str) -> Optional[Dict[str, Any]]:
        rows = self.list_job_runs(limit=500)
        for row in rows:
            if str(row.get("run_id") or row.get("id") or "") == run_id:
                return row
        return None

    # ---- Audit Logs ----
    def record_audit_log(
        self,
        *,
        username: Optional[str],
        role: Optional[str],
        action: str,
        target_type: Optional[str] = None,
        target_id: Optional[str] = None,
        status: str = "success",
        ip_address: Optional[str] = None,
        details: Optional[Dict[str, Any]] = None,
        audit_id: Optional[str] = None,
    ) -> str:
        aid = audit_id or f"audit_{datetime.now(timezone.utc).strftime('%Y%m%d%H%M%S%f')}"
        row = {
            "audit_id": aid,
            "username": username,
            "role": role,
            "action": action,
            "target_type": target_type,
            "target_id": target_id,
            "status": status,
            "ip_address": ip_address,
            "details": _json_dumps(details or {}),
            "created_at": _utc_now(),
        }
        if self._is_sqlite():
            with self._sqlite() as conn:
                conn.execute(
                    """
                    INSERT OR REPLACE INTO audit_logs
                    (audit_id, username, role, action, target_type, target_id, status, ip_address, details, created_at)
                    VALUES (:audit_id, :username, :role, :action, :target_type, :target_id, :status, :ip_address, :details, :created_at)
                    """,
                    row,
                )
            return aid
        with self.engine().begin() as conn:
            from sqlalchemy.dialects.postgresql import insert as pg_insert
            stmt = pg_insert(audit_logs_t).values(row)
            conn.execute(stmt.on_conflict_do_update(index_elements=[audit_logs_t.c.audit_id], set_={c.name: getattr(stmt.excluded, c.name) for c in audit_logs_t.c if c.name != 'audit_id'}))
        return aid

    def list_audit_logs(self, limit: int = 200, username: Optional[str] = None, action: Optional[str] = None) -> List[Dict[str, Any]]:
        if self._is_sqlite():
            clauses = []
            params = []
            if username:
                clauses.append('username = ?')
                params.append(username)
            if action:
                clauses.append('action = ?')
                params.append(action)
            where = f"WHERE {' AND '.join(clauses)}" if clauses else ''
            with self._sqlite() as conn:
                rows = conn.execute(f"SELECT audit_id, username, role, action, target_type, target_id, status, ip_address, details, created_at FROM audit_logs {where} ORDER BY created_at DESC LIMIT ?", (*params, limit)).fetchall()
            out = [dict(r) for r in rows]
        else:
            stmt = select(audit_logs_t.c.audit_id, audit_logs_t.c.username, audit_logs_t.c.role, audit_logs_t.c.action, audit_logs_t.c.target_type, audit_logs_t.c.target_id, audit_logs_t.c.status, audit_logs_t.c.ip_address, audit_logs_t.c.details, audit_logs_t.c.created_at).order_by(audit_logs_t.c.created_at.desc()).limit(limit)
            if username:
                stmt = stmt.where(audit_logs_t.c.username == username)
            if action:
                stmt = stmt.where(audit_logs_t.c.action == action)
            with self.engine().connect() as conn:
                out = [dict(r) for r in conn.execute(stmt).mappings().all()]
        for r in out:
            if hasattr(r.get('created_at'), 'isoformat'):
                r['created_at'] = r['created_at'].isoformat()
            try:
                r['details'] = json.loads(r.get('details') or '{}')
            except Exception:
                r['details'] = {'raw': r.get('details')}
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


    # ---- Users / Sessions ----
    def upsert_user(self, username: str, password_hash: str, role: str = "user", display_name: Optional[str] = None, email: Optional[str] = None) -> None:
        row = {
            "username": username.lower(),
            "password_hash": password_hash,
            "role": role,
            "display_name": display_name or username,
            "email": email,
            "created_at": _utc_now(),
            "last_login_at": None,
        }
        if self._is_sqlite():
            with self._sqlite() as conn:
                conn.execute(
                    """
                    INSERT OR REPLACE INTO users (username, password_hash, role, display_name, email, created_at, last_login_at)
                    VALUES (:username, :password_hash, :role, :display_name, :email, COALESCE((SELECT created_at FROM users WHERE username=:username), :created_at), COALESCE((SELECT last_login_at FROM users WHERE username=:username), :last_login_at))
                    """,
                    row,
                )
            return
        with self.engine().begin() as conn:
            from sqlalchemy.dialects.postgresql import insert as pg_insert
            stmt = pg_insert(users_t).values(row)
            conn.execute(stmt.on_conflict_do_update(index_elements=[users_t.c.username], set_={"password_hash": stmt.excluded.password_hash, "role": stmt.excluded.role, "display_name": stmt.excluded.display_name, "email": stmt.excluded.email}))

    def get_user(self, username: str) -> Optional[Dict[str, Any]]:
        uname = username.lower()
        if self._is_sqlite():
            with self._sqlite() as conn:
                row = conn.execute("SELECT username, password_hash, role, display_name, email, created_at, last_login_at FROM users WHERE username=?", (uname,)).fetchone()
            return dict(row) if row else None
        with self.engine().connect() as conn:
            r = conn.execute(select(users_t).where(users_t.c.username == uname)).mappings().first()
            return dict(r) if r else None

    def list_users(self) -> List[Dict[str, Any]]:
        if self._is_sqlite():
            with self._sqlite() as conn:
                rows = conn.execute("SELECT username, role, display_name, email, created_at, last_login_at FROM users ORDER BY username").fetchall()
            return [dict(r) for r in rows]
        with self.engine().connect() as conn:
            return [dict(r) for r in conn.execute(select(users_t.c.username, users_t.c.role, users_t.c.display_name, users_t.c.email, users_t.c.created_at, users_t.c.last_login_at).order_by(users_t.c.username)).mappings().all()]

    def set_user_role(self, username: str, role: str) -> None:
        uname = username.lower()
        if self._is_sqlite():
            with self._sqlite() as conn:
                conn.execute("UPDATE users SET role=? WHERE username=?", (role, uname))
            return
        with self.engine().begin() as conn:
            conn.execute(users_t.update().where(users_t.c.username == uname).values(role=role))

    def touch_last_login(self, username: str) -> None:
        uname = username.lower()
        now = _utc_now()
        if self._is_sqlite():
            with self._sqlite() as conn:
                conn.execute("UPDATE users SET last_login_at=? WHERE username=?", (now, uname))
            return
        with self.engine().begin() as conn:
            conn.execute(users_t.update().where(users_t.c.username == uname).values(last_login_at=now))

    def create_session(self, username: str, expires_at: str) -> str:
        sid = secrets.token_urlsafe(32)
        row = {"session_id": sid, "username": username.lower(), "created_at": _utc_now(), "expires_at": expires_at}
        if self._is_sqlite():
            with self._sqlite() as conn:
                conn.execute("INSERT OR REPLACE INTO sessions (session_id, username, created_at, expires_at) VALUES (:session_id, :username, :created_at, :expires_at)", row)
            return sid
        with self.engine().begin() as conn:
            from sqlalchemy.dialects.postgresql import insert as pg_insert
            stmt = pg_insert(sessions_t).values(row)
            conn.execute(stmt.on_conflict_do_update(index_elements=[sessions_t.c.session_id], set_={"username": stmt.excluded.username, "created_at": stmt.excluded.created_at, "expires_at": stmt.excluded.expires_at}))
        return sid

    def get_session(self, session_id: str) -> Optional[Dict[str, Any]]:
        if not session_id:
            return None
        if self._is_sqlite():
            with self._sqlite() as conn:
                row = conn.execute("SELECT session_id, username, created_at, expires_at FROM sessions WHERE session_id=?", (session_id,)).fetchone()
            return dict(row) if row else None
        with self.engine().connect() as conn:
            r = conn.execute(select(sessions_t).where(sessions_t.c.session_id == session_id)).mappings().first()
            return dict(r) if r else None

    def delete_session(self, session_id: str) -> None:
        if not session_id:
            return
        if self._is_sqlite():
            with self._sqlite() as conn:
                conn.execute("DELETE FROM sessions WHERE session_id=?", (session_id,))
            return
        with self.engine().begin() as conn:
            conn.execute(sessions_t.delete().where(sessions_t.c.session_id == session_id))

    def cleanup_sessions(self) -> int:
        now = _utc_now()
        if self._is_sqlite():
            with self._sqlite() as conn:
                cur = conn.execute("DELETE FROM sessions WHERE expires_at < ?", (now,))
                return cur.rowcount or 0
        with self.engine().begin() as conn:
            res = conn.execute(sessions_t.delete().where(sessions_t.c.expires_at < now))
            return res.rowcount or 0

    # ---- Models ----
    def register_model(self, model_id: str, path: str, meta: Dict[str, Any], is_active: bool = False) -> None:
        row = {"model_id": model_id, "path": path, "created_at": _utc_now(), "is_active": 1 if is_active else 0, "meta": _json_dumps(meta)}
        if self._is_sqlite():
            with self._sqlite() as conn:
                if is_active:
                    conn.execute("UPDATE model_registry SET is_active=0")
                conn.execute("INSERT OR REPLACE INTO model_registry (model_id, path, created_at, is_active, meta) VALUES (:model_id, :path, COALESCE((SELECT created_at FROM model_registry WHERE model_id=:model_id), :created_at), :is_active, :meta)", row)
            return
        with self.engine().begin() as conn:
            if is_active:
                conn.execute(model_registry_t.update().values(is_active=0))
            from sqlalchemy.dialects.postgresql import insert as pg_insert
            stmt = pg_insert(model_registry_t).values(row)
            conn.execute(stmt.on_conflict_do_update(index_elements=[model_registry_t.c.model_id], set_={"path": stmt.excluded.path, "is_active": stmt.excluded.is_active, "meta": stmt.excluded.meta}))

    def list_models(self) -> List[Dict[str, Any]]:
        if self._is_sqlite():
            with self._sqlite() as conn:
                rows = conn.execute("SELECT model_id, path, created_at, is_active, meta FROM model_registry ORDER BY created_at DESC").fetchall()
            out = [dict(r) for r in rows]
        else:
            with self.engine().connect() as conn:
                out = [dict(r) for r in conn.execute(select(model_registry_t).order_by(model_registry_t.c.created_at.desc())).mappings().all()]
        for r in out:
            try:
                r["meta"] = json.loads(r.get("meta") or "{}")
            except Exception:
                r["meta"] = {}
            r["is_active"] = bool(r.get("is_active"))
        return out

    def get_active_model(self) -> Optional[Dict[str, Any]]:
        models = self.list_models()
        for m in models:
            if m.get("is_active"):
                return m
        return models[0] if models else None

    def activate_model(self, model_id: str) -> bool:
        found = False
        if self._is_sqlite():
            with self._sqlite() as conn:
                conn.execute("UPDATE model_registry SET is_active=0")
                cur = conn.execute("UPDATE model_registry SET is_active=1 WHERE model_id=?", (model_id,))
                found = (cur.rowcount or 0) > 0
                if found:
                    row = conn.execute("SELECT meta FROM model_registry WHERE model_id=?", (model_id,)).fetchone()
                    if row:
                        try:
                            meta = json.loads(row['meta'] or '{}')
                        except Exception:
                            meta = {}
                        meta['lifecycle_status'] = 'active'
                        conn.execute("UPDATE model_registry SET meta=? WHERE model_id=?", (_json_dumps(meta), model_id))
                    rows = conn.execute("SELECT model_id, meta FROM model_registry WHERE model_id <> ?", (model_id,)).fetchall()
                    for r in rows:
                        try:
                            meta = json.loads(r['meta'] or '{}')
                        except Exception:
                            meta = {}
                        if str(meta.get('lifecycle_status') or '').lower() == 'active':
                            meta['lifecycle_status'] = 'beta'
                            conn.execute("UPDATE model_registry SET meta=? WHERE model_id=?", (_json_dumps(meta), r['model_id']))
            return found
        with self.engine().begin() as conn:
            conn.execute(model_registry_t.update().values(is_active=0))
            res = conn.execute(model_registry_t.update().where(model_registry_t.c.model_id == model_id).values(is_active=1))
            found = (res.rowcount or 0) > 0
            if found:
                row = conn.execute(select(model_registry_t.c.meta).where(model_registry_t.c.model_id == model_id)).mappings().first()
                if row:
                    try:
                        meta = json.loads(row.get('meta') or '{}')
                    except Exception:
                        meta = {}
                    meta['lifecycle_status'] = 'active'
                    conn.execute(model_registry_t.update().where(model_registry_t.c.model_id == model_id).values(meta=_json_dumps(meta)))
        return found

    def update_model_meta(self, model_id: str, meta: Dict[str, Any]) -> bool:
        if self._is_sqlite():
            with self._sqlite() as conn:
                cur = conn.execute("UPDATE model_registry SET meta=? WHERE model_id=?", (_json_dumps(meta), model_id))
                return (cur.rowcount or 0) > 0
        with self.engine().begin() as conn:
            res = conn.execute(model_registry_t.update().where(model_registry_t.c.model_id == model_id).values(meta=_json_dumps(meta)))
            return (res.rowcount or 0) > 0

    def archive_model(self, model_id: str) -> bool:
        model = next((m for m in self.list_models() if str(m.get('model_id')) == model_id), None)
        if not model or bool(model.get('is_active')):
            return False
        meta = dict(model.get('meta') or {})
        meta['lifecycle_status'] = 'archived'
        return self.update_model_meta(model_id, meta)

    def delete_model(self, model_id: str) -> bool:
        model = next((m for m in self.list_models() if str(m.get('model_id')) == model_id), None)
        if not model or bool(model.get('is_active')):
            return False
        if self._is_sqlite():
            with self._sqlite() as conn:
                cur = conn.execute("DELETE FROM model_registry WHERE model_id=?", (model_id,))
                return (cur.rowcount or 0) > 0
        with self.engine().begin() as conn:
            res = conn.execute(model_registry_t.delete().where(model_registry_t.c.model_id == model_id))
            return (res.rowcount or 0) > 0


    # ---- Corporate actions ----
    def upsert_corporate_actions(self, rows: Iterable[Dict[str, Any]]) -> int:
        payload = []
        for row in rows:
            symbol = str(row.get("symbol") or "").upper().strip()
            ex_date = str(row.get("ex_date") or "").strip()
            action_type = str(row.get("action_type") or "").strip().lower()
            if not symbol or not ex_date or not action_type:
                continue
            payload.append({
                "action_id": str(row.get("action_id") or f"{symbol}:{ex_date}:{action_type}"),
                "symbol": symbol,
                "ex_date": ex_date,
                "action_type": action_type,
                "amount": row.get("amount"),
                "ratio_numerator": row.get("ratio_numerator"),
                "ratio_denominator": row.get("ratio_denominator"),
                "description": row.get("description"),
                "source": row.get("source"),
                "created_at": _utc_now(),
            })
        if not payload:
            return 0
        if self._is_sqlite():
            with self._sqlite() as conn:
                conn.executemany(
                    """
                    INSERT OR REPLACE INTO corporate_actions
                    (action_id, symbol, ex_date, action_type, amount, ratio_numerator, ratio_denominator, description, source, created_at)
                    VALUES (:action_id, :symbol, :ex_date, :action_type, :amount, :ratio_numerator, :ratio_denominator, :description, :source, COALESCE((SELECT created_at FROM corporate_actions WHERE action_id=:action_id), :created_at))
                    """,
                    payload,
                )
            return len(payload)
        with self.engine().begin() as conn:
            from sqlalchemy.dialects.postgresql import insert as pg_insert
            stmt = pg_insert(corporate_actions_t).values(payload)
            conn.execute(stmt.on_conflict_do_update(index_elements=[corporate_actions_t.c.action_id], set_={
                "symbol": stmt.excluded.symbol,
                "ex_date": stmt.excluded.ex_date,
                "action_type": stmt.excluded.action_type,
                "amount": stmt.excluded.amount,
                "ratio_numerator": stmt.excluded.ratio_numerator,
                "ratio_denominator": stmt.excluded.ratio_denominator,
                "description": stmt.excluded.description,
                "source": stmt.excluded.source,
            }))
        return len(payload)

    def list_corporate_actions(self, symbol: Optional[str] = None, limit: int = 200) -> List[Dict[str, Any]]:
        if self._is_sqlite():
            with self._sqlite() as conn:
                if symbol:
                    rows = conn.execute(
                        "SELECT action_id, symbol, ex_date, action_type, amount, ratio_numerator, ratio_denominator, description, source, created_at FROM corporate_actions WHERE symbol = ? ORDER BY ex_date DESC, action_type ASC LIMIT ?",
                        (symbol.upper(), limit),
                    ).fetchall()
                else:
                    rows = conn.execute(
                        "SELECT action_id, symbol, ex_date, action_type, amount, ratio_numerator, ratio_denominator, description, source, created_at FROM corporate_actions ORDER BY ex_date DESC, symbol ASC LIMIT ?",
                        (limit,),
                    ).fetchall()
            return [dict(r) for r in rows]
        stmt = select(corporate_actions_t)
        if symbol:
            stmt = stmt.where(corporate_actions_t.c.symbol == symbol.upper())
        stmt = stmt.order_by(corporate_actions_t.c.ex_date.desc(), corporate_actions_t.c.symbol.asc()).limit(limit)
        with self.engine().connect() as conn:
            return [dict(r) for r in conn.execute(stmt).mappings().all()]


    # ---- Profile / Settings helpers ----
    def update_user_profile(self, username: str, *, display_name: Optional[str] = None, email: Optional[str] = None) -> None:
        uname = username.lower()
        if self._is_sqlite():
            with self._sqlite() as conn:
                conn.execute("UPDATE users SET display_name=COALESCE(?, display_name), email=COALESCE(?, email) WHERE username=?", (display_name, email, uname))
            return
        with self.engine().begin() as conn:
            values = {}
            if display_name is not None:
                values['display_name'] = display_name
            if email is not None:
                values['email'] = email
            if values:
                conn.execute(users_t.update().where(users_t.c.username == uname).values(**values))

    def set_user_password_hash(self, username: str, password_hash: str) -> None:
        uname = username.lower()
        if self._is_sqlite():
            with self._sqlite() as conn:
                conn.execute("UPDATE users SET password_hash=? WHERE username=?", (password_hash, uname))
            return
        with self.engine().begin() as conn:
            conn.execute(users_t.update().where(users_t.c.username == uname).values(password_hash=password_hash))

    def create_password_reset_token(self, username: str, token: str, expires_at: str) -> None:
        row = {"token": token, "username": username.lower(), "created_at": _utc_now(), "expires_at": expires_at, "used_at": None}
        if self._is_sqlite():
            with self._sqlite() as conn:
                conn.execute("DELETE FROM password_reset_tokens WHERE username=? OR expires_at < ?", (username.lower(), _utc_now()))
                conn.execute("INSERT OR REPLACE INTO password_reset_tokens (token, username, created_at, expires_at, used_at) VALUES (:token, :username, :created_at, :expires_at, :used_at)", row)
            return
        with self.engine().begin() as conn:
            from sqlalchemy.dialects.postgresql import insert as pg_insert
            conn.execute(password_reset_tokens_t.delete().where(password_reset_tokens_t.c.username == username.lower()))
            stmt = pg_insert(password_reset_tokens_t).values(row)
            conn.execute(stmt.on_conflict_do_update(index_elements=[password_reset_tokens_t.c.token], set_={"username": stmt.excluded.username, "created_at": stmt.excluded.created_at, "expires_at": stmt.excluded.expires_at, "used_at": None}))

    def get_password_reset_token(self, token: str) -> Optional[Dict[str, Any]]:
        now = _utc_now()
        if self._is_sqlite():
            with self._sqlite() as conn:
                row = conn.execute("SELECT token, username, created_at, expires_at, used_at FROM password_reset_tokens WHERE token=? AND used_at IS NULL AND expires_at >= ?", (token, now)).fetchone()
            return dict(row) if row else None
        with self.engine().connect() as conn:
            row = conn.execute(select(password_reset_tokens_t).where(password_reset_tokens_t.c.token == token, password_reset_tokens_t.c.used_at.is_(None), password_reset_tokens_t.c.expires_at >= now)).mappings().first()
            return dict(row) if row else None

    def consume_password_reset_token(self, token: str) -> Optional[Dict[str, Any]]:
        row = self.get_password_reset_token(token)
        if not row:
            return None
        now = _utc_now()
        if self._is_sqlite():
            with self._sqlite() as conn:
                conn.execute("UPDATE password_reset_tokens SET used_at=? WHERE token=?", (now, token))
            row["used_at"] = now
            return row
        with self.engine().begin() as conn:
            conn.execute(password_reset_tokens_t.update().where(password_reset_tokens_t.c.token == token).values(used_at=now))
        row["used_at"] = now
        return row

    # ---- Announcement metadata ----
    def list_announcement_meta(self) -> Dict[str, Dict[str, Any]]:
        if self._is_sqlite():
            with self._sqlite() as conn:
                rows = conn.execute("SELECT ann_id, importance, review_status, tags, review_notes, reviewed_by, reviewed_at FROM announcement_meta").fetchall()
            out = [dict(r) for r in rows]
        else:
            with self.engine().connect() as conn:
                out = [dict(r) for r in conn.execute(select(announcement_meta_t)).mappings().all()]
        result = {}
        for r in out:
            try:
                r['tags'] = json.loads(r.get('tags') or '[]')
            except Exception:
                r['tags'] = []
            result[str(r.get('ann_id'))] = r
        return result

    def set_announcement_meta(self, ann_id: str, *, importance: Optional[str] = None, review_status: Optional[str] = None, tags: Optional[List[str]] = None, review_notes: Optional[str] = None, reviewed_by: Optional[str] = None) -> None:
        row = {
            'ann_id': ann_id,
            'importance': importance,
            'review_status': review_status,
            'tags': _json_dumps(tags or []),
            'review_notes': review_notes,
            'reviewed_by': reviewed_by,
            'reviewed_at': _utc_now(),
        }
        if self._is_sqlite():
            with self._sqlite() as conn:
                conn.execute(
                    """
                    INSERT OR REPLACE INTO announcement_meta (ann_id, importance, review_status, tags, review_notes, reviewed_by, reviewed_at)
                    VALUES (:ann_id, COALESCE(:importance, (SELECT importance FROM announcement_meta WHERE ann_id=:ann_id)), COALESCE(:review_status, (SELECT review_status FROM announcement_meta WHERE ann_id=:ann_id)), COALESCE(:tags, (SELECT tags FROM announcement_meta WHERE ann_id=:ann_id)), COALESCE(:review_notes, (SELECT review_notes FROM announcement_meta WHERE ann_id=:ann_id)), COALESCE(:reviewed_by, (SELECT reviewed_by FROM announcement_meta WHERE ann_id=:ann_id)), :reviewed_at)
                    """,
                    row,
                )
            return
        with self.engine().begin() as conn:
            from sqlalchemy.dialects.postgresql import insert as pg_insert
            stmt = pg_insert(announcement_meta_t).values(row)
            conn.execute(stmt.on_conflict_do_update(index_elements=[announcement_meta_t.c.ann_id], set_={
                'importance': stmt.excluded.importance,
                'review_status': stmt.excluded.review_status,
                'tags': stmt.excluded.tags,
                'review_notes': stmt.excluded.review_notes,
                'reviewed_by': stmt.excluded.reviewed_by,
                'reviewed_at': stmt.excluded.reviewed_at,
            }))

    # ---- Alerts ----
    def list_alerts(self, username: Optional[str] = None) -> List[Dict[str, Any]]:
        if self._is_sqlite():
            with self._sqlite() as conn:
                if username:
                    rows = conn.execute("SELECT alert_id, username, symbol, alert_type, target_value, is_enabled, is_triggered, last_triggered_at, created_at, updated_at, meta FROM alerts WHERE username=? ORDER BY created_at DESC", (username.lower(),)).fetchall()
                else:
                    rows = conn.execute("SELECT alert_id, username, symbol, alert_type, target_value, is_enabled, is_triggered, last_triggered_at, created_at, updated_at, meta FROM alerts ORDER BY created_at DESC").fetchall()
            out = [dict(r) for r in rows]
        else:
            stmt = select(alerts_t)
            if username:
                stmt = stmt.where(alerts_t.c.username == username.lower())
            stmt = stmt.order_by(alerts_t.c.created_at.desc())
            with self.engine().connect() as conn:
                out = [dict(r) for r in conn.execute(stmt).mappings().all()]
        for r in out:
            try:
                r['meta'] = json.loads(r.get('meta') or '{}')
            except Exception:
                r['meta'] = {}
            r['is_enabled'] = bool(r.get('is_enabled'))
            r['is_triggered'] = bool(r.get('is_triggered'))
        return out

    def create_alert(self, username: str, symbol: Optional[str], alert_type: str, target_value: Optional[float], meta: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        row = {
            'alert_id': f"alt_{secrets.token_urlsafe(9)}",
            'username': username.lower(),
            'symbol': symbol.upper() if symbol else None,
            'alert_type': alert_type,
            'target_value': target_value,
            'is_enabled': 1,
            'is_triggered': 0,
            'last_triggered_at': None,
            'created_at': _utc_now(),
            'updated_at': _utc_now(),
            'meta': _json_dumps(meta or {}),
        }
        if self._is_sqlite():
            with self._sqlite() as conn:
                conn.execute("INSERT INTO alerts (alert_id, username, symbol, alert_type, target_value, is_enabled, is_triggered, last_triggered_at, created_at, updated_at, meta) VALUES (:alert_id,:username,:symbol,:alert_type,:target_value,:is_enabled,:is_triggered,:last_triggered_at,:created_at,:updated_at,:meta)", row)
        else:
            with self.engine().begin() as conn:
                conn.execute(alerts_t.insert().values(**row))
        return row

    def update_alert(self, alert_id: str, username: str, *, symbol: Optional[str] = None, target_value: Optional[float] = None, is_enabled: Optional[bool] = None, meta: Optional[Dict[str, Any]] = None) -> bool:
        values = {'updated_at': _utc_now()}
        if symbol is not None:
            values['symbol'] = symbol.upper() if symbol else None
        if target_value is not None:
            values['target_value'] = target_value
        if is_enabled is not None:
            values['is_enabled'] = 1 if is_enabled else 0
        if meta is not None:
            values['meta'] = _json_dumps(meta)
        if self._is_sqlite():
            with self._sqlite() as conn:
                cur = conn.execute(f"UPDATE alerts SET {', '.join([k+'=?' for k in values])} WHERE alert_id=? AND username=?", tuple(values.values()) + (alert_id, username.lower()))
                return (cur.rowcount or 0) > 0
        with self.engine().begin() as conn:
            res = conn.execute(alerts_t.update().where((alerts_t.c.alert_id == alert_id) & (alerts_t.c.username == username.lower())).values(**values))
            return (res.rowcount or 0) > 0

    def mark_alert_triggered(self, alert_id: str) -> None:
        values = {'is_triggered': 1, 'last_triggered_at': _utc_now(), 'updated_at': _utc_now()}
        if self._is_sqlite():
            with self._sqlite() as conn:
                conn.execute("UPDATE alerts SET is_triggered=1, last_triggered_at=?, updated_at=? WHERE alert_id=?", (values['last_triggered_at'], values['updated_at'], alert_id))
            return
        with self.engine().begin() as conn:
            conn.execute(alerts_t.update().where(alerts_t.c.alert_id == alert_id).values(**values))

    def reset_alert_triggered(self, alert_id: str, username: str) -> None:
        if self._is_sqlite():
            with self._sqlite() as conn:
                conn.execute("UPDATE alerts SET is_triggered=0, last_triggered_at=NULL, updated_at=? WHERE alert_id=? AND username=?", (_utc_now(), alert_id, username.lower()))
            return
        with self.engine().begin() as conn:
            conn.execute(alerts_t.update().where((alerts_t.c.alert_id == alert_id) & (alerts_t.c.username == username.lower())).values(is_triggered=0, last_triggered_at=None, updated_at=_utc_now()))

    def delete_alert(self, alert_id: str, username: str) -> bool:
        if self._is_sqlite():
            with self._sqlite() as conn:
                cur = conn.execute("DELETE FROM alerts WHERE alert_id=? AND username=?", (alert_id, username.lower()))
                return (cur.rowcount or 0) > 0
        with self.engine().begin() as conn:
            res = conn.execute(alerts_t.delete().where((alerts_t.c.alert_id == alert_id) & (alerts_t.c.username == username.lower())))
            return (res.rowcount or 0) > 0

    # ---- Notifications ----
    # ---- Portfolio ----
    def _default_portfolio_id(self, username: str) -> str:
        return f"pf_{username.lower()}_default".replace("@", "_").replace(".", "_")

    def ensure_default_portfolio(self, username: str) -> Dict[str, Any]:
        uname = username.lower()
        existing = self.list_portfolios(uname, include_archived=False)
        default = next((p for p in existing if p.get("is_default")), None)
        if default:
            return default
        pid = self._default_portfolio_id(uname)
        row = {
            "portfolio_id": pid,
            "username": uname,
            "name": "Main Portfolio",
            "description": "Default portfolio",
            "currency": "LKR",
            "is_default": 1,
            "is_archived": 0,
            "created_at": _utc_now(),
            "updated_at": _utc_now(),
        }
        if self._is_sqlite():
            with self._sqlite() as conn:
                conn.execute(
                    """
                    INSERT OR IGNORE INTO portfolio_accounts
                    (portfolio_id, username, name, description, currency, is_default, is_archived, created_at, updated_at)
                    VALUES (:portfolio_id, :username, :name, :description, :currency, :is_default, :is_archived, :created_at, :updated_at)
                    """,
                    row,
                )
                conn.execute("UPDATE portfolio_transactions SET portfolio_id=? WHERE username=? AND (portfolio_id IS NULL OR portfolio_id='')", (pid, uname))
        else:
            with self.engine().begin() as conn:
                if conn.execute(select(portfolio_accounts_t).where(portfolio_accounts_t.c.portfolio_id == pid)).mappings().first() is None:
                    conn.execute(portfolio_accounts_t.insert().values(row))
                conn.execute(portfolio_transactions_t.update().where((portfolio_transactions_t.c.username == uname) & ((portfolio_transactions_t.c.portfolio_id == None) | (portfolio_transactions_t.c.portfolio_id == ''))).values(portfolio_id=pid))
        return self.get_portfolio_account(uname, pid) or row

    def list_portfolios(self, username: str, include_archived: bool = False) -> List[Dict[str, Any]]:
        uname = username.lower()
        if self._is_sqlite():
            with self._sqlite() as conn:
                if include_archived:
                    rows = conn.execute("SELECT portfolio_id, username, name, description, currency, is_default, is_archived, created_at, updated_at FROM portfolio_accounts WHERE username=? ORDER BY is_default DESC, created_at ASC", (uname,)).fetchall()
                else:
                    rows = conn.execute("SELECT portfolio_id, username, name, description, currency, is_default, is_archived, created_at, updated_at FROM portfolio_accounts WHERE username=? AND is_archived=0 ORDER BY is_default DESC, created_at ASC", (uname,)).fetchall()
            out = [dict(r) for r in rows]
        else:
            stmt = select(portfolio_accounts_t).where(portfolio_accounts_t.c.username == uname)
            if not include_archived:
                stmt = stmt.where(portfolio_accounts_t.c.is_archived == 0)
            stmt = stmt.order_by(portfolio_accounts_t.c.is_default.desc(), portfolio_accounts_t.c.created_at.asc())
            with self.engine().connect() as conn:
                out = [dict(r) for r in conn.execute(stmt).mappings().all()]
        for row in out:
            row["is_default"] = bool(row.get("is_default"))
            row["is_archived"] = bool(row.get("is_archived"))
        return out

    def get_portfolio_account(self, username: str, portfolio_id: str) -> Optional[Dict[str, Any]]:
        uname = username.lower()
        if self._is_sqlite():
            with self._sqlite() as conn:
                row = conn.execute("SELECT portfolio_id, username, name, description, currency, is_default, is_archived, created_at, updated_at FROM portfolio_accounts WHERE username=? AND portfolio_id=?", (uname, portfolio_id)).fetchone()
            if not row:
                return None
            out = dict(row)
        else:
            with self.engine().connect() as conn:
                row = conn.execute(select(portfolio_accounts_t).where((portfolio_accounts_t.c.username == uname) & (portfolio_accounts_t.c.portfolio_id == portfolio_id))).mappings().first()
            if not row:
                return None
            out = dict(row)
        out["is_default"] = bool(out.get("is_default"))
        out["is_archived"] = bool(out.get("is_archived"))
        return out

    def create_portfolio_account(self, username: str, name: str, description: Optional[str] = None, currency: str = "LKR") -> Dict[str, Any]:
        uname = username.lower()
        self.ensure_default_portfolio(uname)
        row = {
            "portfolio_id": f"pf_{secrets.token_hex(8)}",
            "username": uname,
            "name": (name or "Portfolio").strip()[:128],
            "description": description,
            "currency": (currency or "LKR").upper()[:16],
            "is_default": 0,
            "is_archived": 0,
            "created_at": _utc_now(),
            "updated_at": _utc_now(),
        }
        if self._is_sqlite():
            with self._sqlite() as conn:
                conn.execute("INSERT INTO portfolio_accounts (portfolio_id, username, name, description, currency, is_default, is_archived, created_at, updated_at) VALUES (:portfolio_id, :username, :name, :description, :currency, :is_default, :is_archived, :created_at, :updated_at)", row)
        else:
            with self.engine().begin() as conn:
                conn.execute(portfolio_accounts_t.insert().values(row))
        return self.get_portfolio_account(uname, row["portfolio_id"]) or row

    def update_portfolio_account(self, username: str, portfolio_id: str, *, name: Optional[str] = None, description: Optional[str] = None, is_default: Optional[bool] = None, is_archived: Optional[bool] = None) -> bool:
        uname = username.lower()
        values = {"updated_at": _utc_now()}
        if name is not None:
            values["name"] = name.strip()[:128] or "Portfolio"
        if description is not None:
            values["description"] = description
        if is_default is not None:
            values["is_default"] = 1 if is_default else 0
        if is_archived is not None:
            values["is_archived"] = 1 if is_archived else 0
        if self._is_sqlite():
            with self._sqlite() as conn:
                if is_default:
                    conn.execute("UPDATE portfolio_accounts SET is_default=0 WHERE username=?", (uname,))
                cur = conn.execute(f"UPDATE portfolio_accounts SET {', '.join(k+'=:'+k for k in values)} WHERE username=:username AND portfolio_id=:portfolio_id", {**values, "username": uname, "portfolio_id": portfolio_id})
                return (cur.rowcount or 0) > 0
        with self.engine().begin() as conn:
            if is_default:
                conn.execute(portfolio_accounts_t.update().where(portfolio_accounts_t.c.username == uname).values(is_default=0))
            res = conn.execute(portfolio_accounts_t.update().where((portfolio_accounts_t.c.username == uname) & (portfolio_accounts_t.c.portfolio_id == portfolio_id)).values(**values))
        return (res.rowcount or 0) > 0

    def list_portfolio_transactions(self, username: str, portfolio_id: Optional[str] = None) -> List[Dict[str, Any]]:
        uname = username.lower()
        pid = portfolio_id or self.ensure_default_portfolio(uname)["portfolio_id"]
        if self._is_sqlite():
            with self._sqlite() as conn:
                rows = conn.execute(
                    """
                    SELECT tx_id, portfolio_id, username, symbol, tx_type, quantity, price, fees, traded_at, notes, created_at
                    FROM portfolio_transactions
                    WHERE username = ? AND portfolio_id = ?
                    ORDER BY COALESCE(traded_at, created_at) DESC, created_at DESC
                    """,
                    (uname, pid),
                ).fetchall()
            return [dict(r) for r in rows]
        with self.engine().connect() as conn:
            rows = conn.execute(
                select(portfolio_transactions_t)
                .where((portfolio_transactions_t.c.username == uname) & (portfolio_transactions_t.c.portfolio_id == pid))
                .order_by(portfolio_transactions_t.c.traded_at.desc(), portfolio_transactions_t.c.created_at.desc())
            ).mappings().all()
        return [dict(r) for r in rows]

    def create_portfolio_transaction(self, username: str, symbol: str, tx_type: str, quantity: float, price: float, *, fees: float = 0.0, traded_at: Optional[str] = None, notes: Optional[str] = None, portfolio_id: Optional[str] = None) -> Dict[str, Any]:
        uname = username.lower()
        pid = portfolio_id or self.ensure_default_portfolio(uname)["portfolio_id"]
        row = {
            "tx_id": secrets.token_hex(12),
            "portfolio_id": pid,
            "username": uname,
            "symbol": symbol.upper(),
            "tx_type": tx_type.lower(),
            "quantity": float(quantity),
            "price": float(price),
            "fees": float(fees or 0.0),
            "traded_at": traded_at,
            "notes": notes,
            "created_at": _utc_now(),
        }
        if self._is_sqlite():
            with self._sqlite() as conn:
                conn.execute("INSERT INTO portfolio_transactions (tx_id, portfolio_id, username, symbol, tx_type, quantity, price, fees, traded_at, notes, created_at) VALUES (:tx_id, :portfolio_id, :username, :symbol, :tx_type, :quantity, :price, :fees, :traded_at, :notes, :created_at)", row)
            return row
        with self.engine().begin() as conn:
            conn.execute(portfolio_transactions_t.insert().values(row))
        return row

    def update_portfolio_transaction(self, tx_id: str, username: str, symbol: str, tx_type: str, quantity: float, price: float, *, fees: float = 0.0, traded_at: Optional[str] = None, notes: Optional[str] = None, portfolio_id: Optional[str] = None) -> bool:
        uname = username.lower()
        values = {"symbol": symbol.upper(), "tx_type": tx_type.lower(), "quantity": float(quantity), "price": float(price), "fees": float(fees or 0.0), "traded_at": traded_at, "notes": notes}
        pid_filter = portfolio_id
        if self._is_sqlite():
            with self._sqlite() as conn:
                sql = "UPDATE portfolio_transactions SET symbol=:symbol, tx_type=:tx_type, quantity=:quantity, price=:price, fees=:fees, traded_at=:traded_at, notes=:notes WHERE tx_id=:tx_id AND username=:username"
                params = {**values, "tx_id": tx_id, "username": uname}
                if pid_filter:
                    sql += " AND portfolio_id=:portfolio_id"
                    params["portfolio_id"] = pid_filter
                cur = conn.execute(sql, params)
                return (cur.rowcount or 0) > 0
        with self.engine().begin() as conn:
            where = (portfolio_transactions_t.c.tx_id == tx_id) & (portfolio_transactions_t.c.username == uname)
            if pid_filter:
                where = where & (portfolio_transactions_t.c.portfolio_id == pid_filter)
            res = conn.execute(portfolio_transactions_t.update().where(where).values(**values))
        return (res.rowcount or 0) > 0

    def delete_portfolio_transaction(self, tx_id: str, username: str, portfolio_id: Optional[str] = None) -> bool:
        uname = username.lower()
        if self._is_sqlite():
            with self._sqlite() as conn:
                if portfolio_id:
                    cur = conn.execute("DELETE FROM portfolio_transactions WHERE tx_id=? AND username=? AND portfolio_id=?", (tx_id, uname, portfolio_id))
                else:
                    cur = conn.execute("DELETE FROM portfolio_transactions WHERE tx_id=? AND username=?", (tx_id, uname))
                return (cur.rowcount or 0) > 0
        with self.engine().begin() as conn:
            where = (portfolio_transactions_t.c.tx_id == tx_id) & (portfolio_transactions_t.c.username == uname)
            if portfolio_id:
                where = where & (portfolio_transactions_t.c.portfolio_id == portfolio_id)
            res = conn.execute(portfolio_transactions_t.delete().where(where))
        return (res.rowcount or 0) > 0

    def list_cash_movements(self, username: str, portfolio_id: Optional[str] = None) -> List[Dict[str, Any]]:
        uname = username.lower()
        pid = portfolio_id or self.ensure_default_portfolio(uname)["portfolio_id"]
        if self._is_sqlite():
            with self._sqlite() as conn:
                rows = conn.execute("SELECT cash_id, portfolio_id, username, movement_type, amount, movement_date, notes, created_at FROM portfolio_cash_movements WHERE username=? AND portfolio_id=? ORDER BY COALESCE(movement_date, created_at) DESC, created_at DESC", (uname, pid)).fetchall()
            return [dict(r) for r in rows]
        with self.engine().connect() as conn:
            rows = conn.execute(select(portfolio_cash_movements_t).where((portfolio_cash_movements_t.c.username == uname) & (portfolio_cash_movements_t.c.portfolio_id == pid)).order_by(portfolio_cash_movements_t.c.movement_date.desc(), portfolio_cash_movements_t.c.created_at.desc())).mappings().all()
        return [dict(r) for r in rows]

    def create_cash_movement(self, username: str, portfolio_id: str, movement_type: str, amount: float, movement_date: Optional[str] = None, notes: Optional[str] = None) -> Dict[str, Any]:
        row = {"cash_id": secrets.token_hex(12), "portfolio_id": portfolio_id, "username": username.lower(), "movement_type": movement_type.lower(), "amount": float(amount), "movement_date": movement_date, "notes": notes, "created_at": _utc_now()}
        if self._is_sqlite():
            with self._sqlite() as conn:
                conn.execute("INSERT INTO portfolio_cash_movements (cash_id, portfolio_id, username, movement_type, amount, movement_date, notes, created_at) VALUES (:cash_id, :portfolio_id, :username, :movement_type, :amount, :movement_date, :notes, :created_at)", row)
            return row
        with self.engine().begin() as conn:
            conn.execute(portfolio_cash_movements_t.insert().values(row))
        return row

    def delete_cash_movement(self, username: str, cash_id: str, portfolio_id: Optional[str] = None) -> bool:
        uname = username.lower()
        if self._is_sqlite():
            with self._sqlite() as conn:
                if portfolio_id:
                    cur = conn.execute("DELETE FROM portfolio_cash_movements WHERE username=? AND cash_id=? AND portfolio_id=?", (uname, cash_id, portfolio_id))
                else:
                    cur = conn.execute("DELETE FROM portfolio_cash_movements WHERE username=? AND cash_id=?", (uname, cash_id))
                return (cur.rowcount or 0) > 0
        with self.engine().begin() as conn:
            where = (portfolio_cash_movements_t.c.username == uname) & (portfolio_cash_movements_t.c.cash_id == cash_id)
            if portfolio_id:
                where = where & (portfolio_cash_movements_t.c.portfolio_id == portfolio_id)
            res = conn.execute(portfolio_cash_movements_t.delete().where(where))
        return (res.rowcount or 0) > 0

    def list_notifications(self, username: Optional[str] = None, unread_only: bool = False) -> List[Dict[str, Any]]:
        if self._is_sqlite():
            with self._sqlite() as conn:
                q = "SELECT notification_id, username, category, title, message, symbol, severity, link, is_read, created_at, meta FROM notifications"
                params = []
                clauses = []
                if username:
                    clauses.append("username=?")
                    params.append(username.lower())
                if unread_only:
                    clauses.append("is_read=0")
                if clauses:
                    q += " WHERE " + " AND ".join(clauses)
                q += " ORDER BY created_at DESC"
                rows = conn.execute(q, tuple(params)).fetchall()
            out = [dict(r) for r in rows]
        else:
            stmt = select(notifications_t)
            if username:
                stmt = stmt.where(notifications_t.c.username == username.lower())
            if unread_only:
                stmt = stmt.where(notifications_t.c.is_read == 0)
            stmt = stmt.order_by(notifications_t.c.created_at.desc())
            with self.engine().connect() as conn:
                out = [dict(r) for r in conn.execute(stmt).mappings().all()]
        for r in out:
            try:
                r['meta'] = json.loads(r.get('meta') or '{}')
            except Exception:
                r['meta'] = {}
            r['is_read'] = bool(r.get('is_read'))
        return out

    def create_notification(self, username: str, category: str, title: str, message: str, *, symbol: Optional[str] = None, severity: str = 'info', link: Optional[str] = None, meta: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        row = {
            'notification_id': f"ntf_{secrets.token_urlsafe(10)}",
            'username': username.lower(),
            'category': category,
            'title': title,
            'message': message,
            'symbol': symbol.upper() if symbol else None,
            'severity': severity,
            'link': link,
            'is_read': 0,
            'created_at': _utc_now(),
            'meta': _json_dumps(meta or {}),
        }
        if self._is_sqlite():
            with self._sqlite() as conn:
                conn.execute("INSERT INTO notifications (notification_id, username, category, title, message, symbol, severity, link, is_read, created_at, meta) VALUES (:notification_id,:username,:category,:title,:message,:symbol,:severity,:link,:is_read,:created_at,:meta)", row)
        else:
            with self.engine().begin() as conn:
                conn.execute(notifications_t.insert().values(**row))
        return row

    def enqueue_notification_delivery(self, username: str, notification_id: str, channel: str, *, payload: Optional[Dict[str, Any]] = None, next_attempt_at: Optional[str] = None) -> Dict[str, Any]:
        row = {
            'queue_id': f"ndq_{secrets.token_urlsafe(10)}",
            'username': username.lower(),
            'notification_id': notification_id,
            'channel': channel,
            'status': 'queued',
            'attempts': 0,
            'next_attempt_at': next_attempt_at or _utc_now(),
            'sent_at': None,
            'error': None,
            'payload': _json_dumps(payload or {}),
            'created_at': _utc_now(),
            'updated_at': _utc_now(),
        }
        if self._is_sqlite():
            with self._sqlite() as conn:
                conn.execute("INSERT INTO notification_dispatch_queue (queue_id, username, notification_id, channel, status, attempts, next_attempt_at, sent_at, error, payload, created_at, updated_at) VALUES (:queue_id,:username,:notification_id,:channel,:status,:attempts,:next_attempt_at,:sent_at,:error,:payload,:created_at,:updated_at)", row)
        else:
            with self.engine().begin() as conn:
                conn.execute(notification_dispatch_queue_t.insert().values(**row))
        return row

    def list_notification_dispatch_queue(self, status: Optional[str] = None, limit: int = 200) -> List[Dict[str, Any]]:
        if self._is_sqlite():
            with self._sqlite() as conn:
                if status:
                    rows = conn.execute("SELECT queue_id, username, notification_id, channel, status, attempts, next_attempt_at, sent_at, error, payload, created_at, updated_at FROM notification_dispatch_queue WHERE status=? ORDER BY created_at DESC LIMIT ?", (status, limit)).fetchall()
                else:
                    rows = conn.execute("SELECT queue_id, username, notification_id, channel, status, attempts, next_attempt_at, sent_at, error, payload, created_at, updated_at FROM notification_dispatch_queue ORDER BY created_at DESC LIMIT ?", (limit,)).fetchall()
            out=[dict(r) for r in rows]
        else:
            stmt = select(notification_dispatch_queue_t)
            if status:
                stmt = stmt.where(notification_dispatch_queue_t.c.status == status)
            stmt = stmt.order_by(notification_dispatch_queue_t.c.created_at.desc()).limit(limit)
            with self.engine().connect() as conn:
                out=[dict(r) for r in conn.execute(stmt).mappings().all()]
        for r in out:
            try:
                r['payload'] = json.loads(r.get('payload') or '{}')
            except Exception:
                r['payload'] = {}
        return out

    def get_due_notification_dispatches(self, now_iso: Optional[str] = None, limit: int = 100) -> List[Dict[str, Any]]:
        now_iso = now_iso or _utc_now()
        if self._is_sqlite():
            with self._sqlite() as conn:
                rows = conn.execute(
                    "SELECT queue_id, username, notification_id, channel, status, attempts, next_attempt_at, sent_at, error, payload, created_at, updated_at FROM notification_dispatch_queue WHERE status IN ('queued','retry') AND (next_attempt_at IS NULL OR next_attempt_at <= ?) ORDER BY created_at ASC LIMIT ?",
                    (now_iso, limit),
                ).fetchall()
            out = [dict(r) for r in rows]
        else:
            stmt = select(notification_dispatch_queue_t).where(notification_dispatch_queue_t.c.status.in_(['queued','retry']))
            stmt = stmt.where(or_(notification_dispatch_queue_t.c.next_attempt_at.is_(None), notification_dispatch_queue_t.c.next_attempt_at <= now_iso)).order_by(notification_dispatch_queue_t.c.created_at.asc()).limit(limit)
            with self.engine().connect() as conn:
                out=[dict(r) for r in conn.execute(stmt).mappings().all()]
        for r in out:
            try:
                r['payload'] = json.loads(r.get('payload') or '{}')
            except Exception:
                r['payload'] = {}
        return out

    def update_notification_dispatch(self, queue_id: str, *, status: str, attempts: Optional[int] = None, next_attempt_at: Optional[str] = None, sent_at: Optional[str] = None, error: Optional[str] = None, payload: Optional[Dict[str, Any]] = None) -> bool:
        values: Dict[str, Any] = {'status': status, 'updated_at': _utc_now()}
        if attempts is not None:
            values['attempts'] = attempts
        if next_attempt_at is not None:
            values['next_attempt_at'] = next_attempt_at
        if sent_at is not None:
            values['sent_at'] = sent_at
        if error is not None:
            values['error'] = error
        if payload is not None:
            values['payload'] = _json_dumps(payload)
        if self._is_sqlite():
            with self._sqlite() as conn:
                cur = conn.execute(f"UPDATE notification_dispatch_queue SET {', '.join([k+'=?' for k in values])} WHERE queue_id=?", tuple(values.values()) + (queue_id,))
                return (cur.rowcount or 0) > 0
        with self.engine().begin() as conn:
            res = conn.execute(notification_dispatch_queue_t.update().where(notification_dispatch_queue_t.c.queue_id == queue_id).values(**values))
            return (res.rowcount or 0) > 0

    def mark_notification_read(self, notification_id: str, username: str) -> bool:
        if self._is_sqlite():
            with self._sqlite() as conn:
                cur = conn.execute("UPDATE notifications SET is_read=1 WHERE notification_id=? AND username=?", (notification_id, username.lower()))
                return (cur.rowcount or 0) > 0
        with self.engine().begin() as conn:
            res = conn.execute(notifications_t.update().where((notifications_t.c.notification_id == notification_id) & (notifications_t.c.username == username.lower())).values(is_read=1))
            return (res.rowcount or 0) > 0

    def mark_all_notifications_read(self, username: str) -> int:
        if self._is_sqlite():
            with self._sqlite() as conn:
                cur = conn.execute("UPDATE notifications SET is_read=1 WHERE username=?", (username.lower(),))
                return cur.rowcount or 0
        with self.engine().begin() as conn:
            res = conn.execute(notifications_t.update().where(notifications_t.c.username == username.lower()).values(is_read=1))
            return res.rowcount or 0
