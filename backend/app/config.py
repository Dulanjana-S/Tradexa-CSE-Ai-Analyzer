from __future__ import annotations

import os
from dataclasses import dataclass

try:
    from dotenv import load_dotenv  # type: ignore
    load_dotenv()
except Exception:
    pass


@dataclass(frozen=True)
class Settings:
    # Data providers:
    # - db     : serve everything purely from imported/stored database data
    # - cse    : Colombo Stock Exchange unofficial web API
    # - hybrid : CSE for market/metadata + yfinance as fallback for OHLCV
    # - yfinance: Yahoo Finance only
    # - mock   : bundled demo dataset (kept for developer testing only)
    data_provider: str = os.getenv("DATA_PROVIDER", "hybrid").lower()

    cse_api_base: str = os.getenv("CSE_API_BASE", "https://www.cse.lk/api")
    cse_timeout_seconds: int = int(os.getenv("CSE_TIMEOUT_SECONDS", "25"))
    cse_chart_id: int = int(os.getenv("CSE_CHART_ID", "1"))
    cse_chart_period: int = int(os.getenv("CSE_CHART_PERIOD", "1"))
    cse_company_chart_period: int = int(os.getenv("CSE_COMPANY_CHART_PERIOD", "1"))
    cache_ttl_seconds: int = int(os.getenv("CACHE_TTL_SECONDS", "120"))
    yahoo_exchange_suffix: str = os.getenv("YF_EXCHANGE_SUFFIX", ".CM")

    database_url: str = os.getenv("DATABASE_URL", "sqlite:///data/cse_real.db")
    db_cache_enabled: bool = os.getenv("DB_CACHE_ENABLED", "true").lower() in {"1", "true", "yes"}

    model_dir: str = os.getenv("MODEL_DIR", "models")
    allow_prediction_fallback: bool = os.getenv("ALLOW_PREDICTION_FALLBACK", "false").lower() in {"1", "true", "yes"}

    # Optional admin protection. When set, /admin/* endpoints require this key
    # via X-Admin-Key header or ?admin_key= query parameter.
    admin_api_key: str = os.getenv("ADMIN_API_KEY", "")
    session_cookie_name: str = os.getenv("SESSION_COOKIE_NAME", "cse_session")
    session_ttl_days: int = int(os.getenv("SESSION_TTL_DAYS", "7"))
    bootstrap_admin_username: str = os.getenv("BOOTSTRAP_ADMIN_USERNAME", "admin")
    bootstrap_admin_password: str = os.getenv("BOOTSTRAP_ADMIN_PASSWORD", "admin123")
    frontend_origins: str = os.getenv("FRONTEND_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173")


settings = Settings()
