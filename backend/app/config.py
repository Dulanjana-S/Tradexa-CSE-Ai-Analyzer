from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path

try:
    from dotenv import load_dotenv  # type: ignore
    # Load backend/.env regardless of current working directory.
    load_dotenv(Path(__file__).resolve().parent.parent / ".env", override=False)
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
    market_live_cache_ttl_seconds: int = int(os.getenv("MARKET_LIVE_CACHE_TTL_SECONDS", "15"))
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
    # Set this explicitly in .env — empty string disables bootstrap admin creation.
    bootstrap_admin_password: str = os.getenv("BOOTSTRAP_ADMIN_PASSWORD", "")
    frontend_origins: str = os.getenv(
        "FRONTEND_ORIGINS",
        "http://localhost:5173,http://127.0.0.1:5173,http://localhost:5174,http://127.0.0.1:5174",
    )
    frontend_public_url: str = os.getenv("FRONTEND_PUBLIC_URL", "http://localhost:5173")

    # Cookie security — set SESSION_COOKIE_SECURE=true in production (HTTPS).
    session_cookie_secure: bool = os.getenv("SESSION_COOKIE_SECURE", "false").lower() in {"1", "true", "yes"}
    session_cookie_samesite: str = os.getenv("SESSION_COOKIE_SAMESITE", "lax")

    password_reset_ttl_minutes: int = int(os.getenv("PASSWORD_RESET_TTL_MINUTES", "30"))
    smtp_host: str = os.getenv("SMTP_HOST", "")
    smtp_port: int = int(os.getenv("SMTP_PORT", "587"))
    smtp_username: str = os.getenv("SMTP_USERNAME", "")
    smtp_password: str = os.getenv("SMTP_PASSWORD", "")
    smtp_from_email: str = os.getenv("SMTP_FROM_EMAIL", "no-reply@tradexalk.local")
    smtp_use_tls: bool = os.getenv("SMTP_USE_TLS", "true").lower() in {"1", "true", "yes"}


settings = Settings()
