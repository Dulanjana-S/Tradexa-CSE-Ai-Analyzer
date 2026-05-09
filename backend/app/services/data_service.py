from __future__ import annotations

import csv
import io
import importlib.util
import json
import math
import os
import statistics
from datetime import date, timedelta, datetime
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional, Tuple

from fastapi import HTTPException, UploadFile

from ..config import settings
from ..intelligence import DEFAULT_NEWS_WHITELIST, build_document_intelligence_row, build_sentiment_rows, document_row_to_sentiment, enrich_external_news_item, external_news_to_sentiment_row, extract_links_from_html, is_report_or_corporate_document, preview_macro_rows, summarize_sentiment, validate_whitelisted_url
from ..mock_data import DEMO_SYMBOLS, demo_prediction
from ..ml.model_store import activate_bundle, delete_bundle, inspect_model_store, latest_bundle
from ..ml.predict import predict_next
from ..providers.base import MarketDataProvider
from ..providers.cse_provider import CSEProvider
from ..providers.db_provider import DBProvider
from ..providers.hybrid_provider import HybridProvider
from ..providers.mock_provider import MockProvider
from ..providers.yfinance_provider import YFinanceProvider
from ..storage import Storage
from .cache import TTLCache

BASE_DIR = Path(__file__).resolve().parent.parent.parent
DATA_DIR = BASE_DIR / "data" / "mock"
_storage = Storage(settings.database_url)
_storage.init()
_cache = TTLCache(ttl_seconds=settings.cache_ttl_seconds)
_market_live_cache = TTLCache(ttl_seconds=max(1, settings.market_live_cache_ttl_seconds))
_provider: Optional[MarketDataProvider] = None
_provider_key: Optional[str] = None


def _json_safe(value: Any) -> Any:
    if isinstance(value, dict):
        return {str(key): _json_safe(item) for key, item in value.items()}
    if isinstance(value, list):
        return [_json_safe(item) for item in value]
    if isinstance(value, tuple):
        return [_json_safe(item) for item in value]
    if isinstance(value, float) and not math.isfinite(value):
        return None
    return value


def clear_runtime_cache() -> None:
    _cache.clear()
    _market_live_cache.clear()


def get_effective_provider_name() -> str:
    configured = (_storage.get_meta("active_provider") or settings.data_provider or "hybrid").lower()
    if configured not in {"db", "mock", "cse", "hybrid", "yfinance"}:
        return settings.data_provider
    return configured


def set_effective_provider_name(name: str) -> str:
    normalized = (name or "").lower().strip()
    if normalized not in {"db", "mock", "cse", "hybrid", "yfinance"}:
        raise HTTPException(status_code=400, detail="Invalid provider")
    _storage.set_meta("active_provider", normalized)
    clear_runtime_cache()
    global _provider, _provider_key
    _provider = None
    _provider_key = None
    return normalized


def get_provider() -> MarketDataProvider:
    global _provider, _provider_key
    p = get_effective_provider_name()
    if _provider is not None and _provider_key == p:
        return _provider
    _provider_key = p
    if p == "db":
        _provider = DBProvider(_storage)
        return _provider
    if p == "mock":
        _provider = MockProvider(DATA_DIR)
        return _provider
    cse = CSEProvider(
        base_url=settings.cse_api_base,
        timeout=settings.cse_timeout_seconds,
        chart_id=settings.cse_chart_id,
        chart_period=settings.cse_chart_period,
        company_chart_period=settings.cse_company_chart_period,
    )
    yfin_provider: Optional[YFinanceProvider] = None
    try:
        yfin_provider = YFinanceProvider(exchange_suffix=settings.yahoo_exchange_suffix)
    except Exception:
        yfin_provider = None
    if p == "cse":
        _provider = cse
    elif p == "yfinance":
        if yfin_provider is None:
            _provider = cse
        else:
            _provider = yfin_provider
    elif p == "hybrid":
        if yfin_provider is None:
            _provider = cse
        else:
            _provider = HybridProvider(cse=cse, yfin=yfin_provider)
    else:
        _provider = DBProvider(_storage)
    return _provider


def _to_float(v: Any) -> Optional[float]:
    if v is None:
        return None
    if isinstance(v, (int, float)):
        try:
            return float(v)
        except Exception:
            return None
    if isinstance(v, str):
        s = v.strip().replace(",", "")
        for token in ("LKR", "Rs", "rs"):
            s = s.replace(token, "")
        s = s.replace(" ", "")
        try:
            return float(s)
        except Exception:
            return None
    return None


def _status_text(x: Any) -> str:
    if isinstance(x, str):
        return x
    if isinstance(x, dict):
        return str(x.get("status") or x.get("marketStatus") or x.get("market_status") or x.get("state") or "Unknown")
    return "Unknown"


def _normalize_market_overview(raw: Any, prov_name: str) -> Dict[str, Any]:
    raw = raw if isinstance(raw, dict) else {}
    summary = raw.get("summary") if isinstance(raw.get("summary"), dict) else {}
    daily = raw.get("daily") if isinstance(raw.get("daily"), dict) else {}

    turnover = summary.get("marketTurnover") or summary.get("equityTurnover") or summary.get("turnOver") or summary.get("turnover") or summary.get("turnOverValue") or summary.get("equityTurnOver") or summary.get("totalTurnOver") or summary.get("totalTurnover")
    turnover = turnover or daily.get("marketTurnover") or daily.get("equityTurnover") or daily.get("turnOverValue") or daily.get("equityTurnOver") or daily.get("totalTurnOver") or daily.get("totalTurnover")
    trades = summary.get("marketTrades") or summary.get("tradeCount") or summary.get("trades") or summary.get("noOfTrades") or summary.get("totalTrades") or summary.get("tradesNo") or summary.get("numberOfTrades")
    trades = trades or daily.get("marketTrades") or daily.get("tradesNo") or daily.get("noOfTrades") or daily.get("totalTrades") or daily.get("tradeCount") or daily.get("numberOfTrades")
    mcap = summary.get("marketCap") or summary.get("marketCapitalization") or summary.get("mktCap") or summary.get("totalMarketCap") or daily.get("marketCap") or daily.get("marketCapitalization") or daily.get("mktCap") or daily.get("totalMarketCap")

    # --- Live index values from CSE aspiData / snpData endpoints ---
    # Actual CSE fields: {value, change, percentage, lowValue, highValue, ...}
    aspi_raw = raw.get("aspi") if isinstance(raw.get("aspi"), dict) else {}
    sl20_raw = raw.get("snp_sl20") if isinstance(raw.get("snp_sl20"), dict) else {}
    aspi_value = _to_float(
        aspi_raw.get("value") or daily.get("asi")
    )
    aspi_change = _to_float(
        aspi_raw.get("change") or daily.get("asiChange")
    )
    aspi_change_pct = _to_float(
        aspi_raw.get("percentage") or daily.get("asiChangePct")
    )
    sl20_value = _to_float(
        sl20_raw.get("value") or daily.get("spp")
    )
    sl20_change = _to_float(
        sl20_raw.get("change") or daily.get("sppChange")
    )
    sl20_change_pct = _to_float(
        sl20_raw.get("percentage") or daily.get("sppChangePct")
    )

    def movers(items: Any) -> List[Dict[str, Any]]:
        out: List[Dict[str, Any]] = []
        if not isinstance(items, list):
            return out
        for it in items:
            if not isinstance(it, dict):
                continue
            sym = (it.get("symbol") or it.get("securityCode") or "").upper()
            if not sym:
                continue
            last = it.get("last") or it.get("price") or it.get("lastTradedPrice")
            ch = it.get("change")
            cp = it.get("change_pct") or it.get("changePercentage") or it.get("changePct")
            out.append({"symbol": sym, "price": _to_float(last), "last": _to_float(last), "change": _to_float(ch), "change_pct": _to_float(cp)})
        return out

    return {
        "status": _status_text(raw.get("status")),
        "as_of": raw.get("updated_at") or raw.get("as_of") or raw.get("updatedAt") or None,
        "turnover_lkr": _to_float(turnover),
        "trades": int(_to_float(trades) or 0) if trades is not None else None,
        "market_cap_lkr": _to_float(mcap),
        "aspi_value": aspi_value,
        "aspi_change": aspi_change,
        "aspi_change_pct": aspi_change_pct,
        "sl20_value": sl20_value,
        "sl20_change": sl20_change,
        "sl20_change_pct": sl20_change_pct,
        "top_gainers": movers(raw.get("top_gainers")),
        "top_losers": movers(raw.get("top_losers")),
        "most_active": movers(raw.get("most_active")),
        "source": raw.get("source") or prov_name,
    }


def provider_health() -> Dict[str, Any]:
    prov = get_provider()
    try:
        mkt = market_overview()
        ok = bool(mkt.get("status")) and mkt.get("status") != "Unavailable"
        return {"name": prov.name, "ok": ok, "last_error": mkt.get("error"), "status": mkt.get("status")}
    except Exception as e:
        return {"name": prov.name, "ok": False, "last_error": str(getattr(e, "detail", e)), "status": "Unavailable"}


def market_overview() -> Dict[str, Any]:
    prov = get_provider()

    def _factory():
        try:
            raw = prov.get_market_overview()
            return _normalize_market_overview(raw, prov.name)
        except Exception as e:
            return {
                "status": "Unavailable",
                "as_of": None,
                "turnover_lkr": None,
                "trades": None,
                "market_cap_lkr": None,
                "top_gainers": [],
                "top_losers": [],
                "most_active": [],
                "source": prov.name,
                "error": str(getattr(e, "detail", e)),
            }

    cache = _market_live_cache if prov.name in {"cse", "hybrid", "yfinance"} else _cache
    return cache.get_or_set(("market_overview", prov.name), _factory)


def indices() -> Dict[str, Any]:
    prov = get_provider()

    def _prefer_cached_history(series_name: str, live_series: Any) -> List[Dict[str, Any]]:
        def _clean(rows: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
            cleaned: List[Dict[str, Any]] = []
            for row in rows:
                try:
                    value = float(row.get("value"))
                except Exception:
                    continue
                if value <= 100:
                    continue
                cleaned.append({"date": row.get("date"), "value": value})
            return cleaned

        rows = _clean(live_series if isinstance(live_series, list) else [])
        if len(rows) >= 2 or not settings.db_cache_enabled:
            return rows
        cached = _clean(_storage.get_index_series(series_name, limit=400))
        return cached if len(cached) > len(rows) else rows

    def _factory():
        out: Dict[str, Any] = {"ASPI": [], "S&P SL20": [], "source": getattr(prov, "name", "")}
        try:
            idx = prov.get_indices() or {}
        except Exception:
            idx = {}
        if isinstance(idx, dict):
            out["ASPI"] = _prefer_cached_history("ASPI", idx.get("ASPI") or [])
            out["S&P SL20"] = _prefer_cached_history("S&P SL20", idx.get("S&P SL20") or idx.get("SNP_SL20") or idx.get("SNP SL20") or [])
            out["source"] = idx.get("source") or prov.name
        if settings.db_cache_enabled and prov.name not in {"mock", "db"}:
            try:
                _storage.upsert_index_series("ASPI", out["ASPI"] if isinstance(out.get("ASPI"), list) else [])
                _storage.upsert_index_series("S&P SL20", out["S&P SL20"] if isinstance(out.get("S&P SL20"), list) else [])
            except Exception:
                pass
        return out

    # For live-capable providers, prefer fresh provider data and only fall
    # back to DB when provider data is unavailable.
    if prov.name in {"db", "mock"}:
        if settings.db_cache_enabled:
            aspi = _storage.get_index_series("ASPI", limit=400)
            sl20 = _storage.get_index_series("S&P SL20", limit=400)
            if aspi or sl20:
                return {"ASPI": aspi or [], "S&P SL20": sl20 or [], "source": "db"}
        return _cache.get_or_set(("indices", prov.name), _factory)

    live = _market_live_cache.get_or_set(("indices", prov.name), _factory)
    aspi_live = live.get("ASPI") if isinstance(live, dict) else []
    sl20_live = live.get("S&P SL20") if isinstance(live, dict) else []
    if (isinstance(aspi_live, list) and aspi_live) or (isinstance(sl20_live, list) and sl20_live):
        return live

    if settings.db_cache_enabled:
        aspi = _storage.get_index_series("ASPI", limit=400)
        sl20 = _storage.get_index_series("S&P SL20", limit=400)
        if aspi or sl20:
            return {"ASPI": aspi or [], "S&P SL20": sl20 or [], "source": "db"}
    return live


def _merge_latest_bar(target: Dict[str, Any], bar: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    if not bar:
        return target
    out = dict(target)
    out["eod_date"] = bar.get("date")
    out["eod_close"] = bar.get("close")
    out["eod_open"] = bar.get("open")
    out["eod_high"] = bar.get("high")
    out["eod_low"] = bar.get("low")
    out["eod_volume"] = bar.get("volume")
    for k in ("open", "high", "low"):
        if out.get(k) is None and bar.get(k) is not None:
            out[k] = bar.get(k)
    if out.get("volume") in (None, 0) and bar.get("volume") is not None:
        out["volume"] = bar.get("volume")
    if out.get("last") is None and bar.get("close") is not None:
        out["last"] = bar.get("close")
    return out


def companies() -> List[Dict[str, Any]]:
    prov = get_provider()

    def _factory():
        if settings.db_cache_enabled:
            _storage.ensure_price_symbols_as_companies()
        comps: List[Dict[str, Any]] = []
        try:
            comps = prov.list_companies() or []
        except Exception:
            comps = []
        if comps:
            if settings.db_cache_enabled and prov.name not in {"mock", "db"}:
                try:
                    _storage.upsert_companies(comps)
                except Exception:
                    pass
            return comps
        db_comps = _storage.list_companies(limit=5000) if settings.db_cache_enabled else []
        if db_comps:
            return db_comps
        if prov.name == "mock":
            return [
                {"symbol": s, "name": n, "sector": sec, "industry_group": None, "market_cap": None, "beta": None, "logo_url": None}
                for (s, n, sec) in DEMO_SYMBOLS
            ]
        return []

    return _cache.get_or_set(("companies", prov.name), _factory)


def company_search(q: str, limit: int = 20) -> List[Dict[str, Any]]:
    if settings.db_cache_enabled:
        hits = _storage.search_companies(q, limit=limit)
        if hits:
            return hits
    comps = companies()
    uq = (q or "").strip().upper()
    if not uq:
        return []
    out = []
    for c in comps:
        sym = (c.get("symbol") or "").upper()
        name = c.get("name") or ""
        if uq in sym or uq in name.upper():
            out.append({"symbol": sym, "name": name, "sector": c.get("sector"), "industry_group": c.get("industry_group")})
        if len(out) >= limit:
            break
    return out


def stock(symbol: str) -> Dict[str, Any]:
    prov = get_provider()
    sym = symbol.upper()

    def _factory():
        if settings.db_cache_enabled:
            _storage.ensure_price_symbols_as_companies()
        comp = _storage.get_company(sym) if settings.db_cache_enabled else None
        try:
            s = prov.get_stock(sym)
        except Exception as e:
            if comp:
                s = {"symbol": sym, **comp, "provider_error": str(getattr(e, "detail", e))}
                bar = _storage.get_latest_bar(sym) if settings.db_cache_enabled else None
                s = _merge_latest_bar(s, bar)
                if bar and bar.get("close") is not None:
                    s.setdefault("last", bar.get("close"))
                if s.get("last") is None and s.get("eod_close") is not None:
                    s["last"] = s.get("eod_close")
            else:
                raise HTTPException(status_code=404, detail=f"Symbol not found or provider error: {sym}")
        if isinstance(comp, dict):
            for k in ("name", "sector", "industry_group", "market_cap", "beta", "logo_url", "shares"):
                if s.get(k) in (None, "", "—") and comp.get(k) not in (None, "", "—"):
                    s[k] = comp.get(k)
                if comp.get(k) in (None, "", "—", 0) and s.get(k) not in (None, "", "—"):
                    comp[k] = s.get(k)
            try:
                _storage.upsert_companies([comp])
            except Exception:
                pass
        elif settings.db_cache_enabled:
            try:
                _storage.upsert_companies([s])
            except Exception:
                pass
        if settings.db_cache_enabled:
            s = _merge_latest_bar(s, _storage.get_latest_bar(sym))
        return s

    return _cache.get_or_set(("stock", prov.name, sym), _factory)


def stock_snapshots(symbols: Optional[Iterable[str]] = None, limit: Optional[int] = None) -> List[Dict[str, Any]]:
    prov = get_provider()
    comps = companies()
    if not comps and settings.db_cache_enabled:
        _storage.ensure_price_symbols_as_companies()
        comps = _storage.list_companies(limit=5000)
    use_comps = comps
    if symbols:
        wanted = {str(s).upper() for s in symbols}
        use_comps = [c for c in comps if (c.get("symbol") or "").upper() in wanted]
    elif limit:
        use_comps = use_comps[:limit]
    bars = _storage.get_latest_bars([c.get("symbol") for c in use_comps]) if settings.db_cache_enabled else {}
    rows: List[Dict[str, Any]] = []
    for c in use_comps:
        sym = (c.get("symbol") or "").upper()
        row = dict(c)
        bar = bars.get(sym)

        # When live-capable providers already supplied snapshot fields,
        # keep those as primary and attach DB EOD context only as fallback.
        live_last = row.get("last") if row.get("last") is not None else row.get("price")
        if prov.name in {"cse", "hybrid", "yfinance"} and live_last is not None:
            if bar:
                rows.append(_merge_latest_bar(row, bar))
            else:
                rows.append(row)
            continue

        if bar:
            prev_hist = _storage.get_price_history(sym, limit=2)
            change = None
            change_pct = None
            if len(prev_hist) >= 2 and prev_hist[-2].get("close") not in (None, 0) and prev_hist[-1].get("close") is not None:
                try:
                    prev_close = float(prev_hist[-2]["close"])
                    curr_close = float(prev_hist[-1]["close"])
                    change = curr_close - prev_close
                    change_pct = (curr_close / prev_close - 1.0) * 100.0
                except Exception:
                    pass
            row.update(
                {
                    "last": bar.get("close"),
                    "price": bar.get("close"),
                    "open": bar.get("open"),
                    "high": bar.get("high"),
                    "low": bar.get("low"),
                    "volume": bar.get("volume"),
                    "as_of": bar.get("date"),
                    "change": change,
                    "change_pct": change_pct,
                }
            )
            rows.append(_merge_latest_bar(row, bar))
            continue
        try:
            rows.append(stock(sym))
        except HTTPException:
            rows.append(row)
    return rows


def _detect_price_scale(symbol: str, last_close: Optional[float]) -> Tuple[float, Optional[str]]:
    if last_close is None or last_close <= 0:
        return 1.0, None
    try:
        s = stock(symbol)
        live_last = float(s.get("last")) if s.get("last") is not None else None
    except Exception:
        live_last = None
    if live_last is None or live_last <= 0:
        return 1.0, None
    ratio = live_last / float(last_close)
    if abs(ratio - 1.0) < 0.30:
        return 1.0, None
    candidates = [0.25, 1 / 3, 0.5, 2.0, 3.0, 4.0]
    for c in candidates:
        if abs(ratio - c) / c < 0.05:
            return ratio, "Possible corporate action (split/adjustment) detected; scaling candles/prediction to match live price."
    return 1.0, None


def stock_history(symbol: str, days: int) -> List[Dict[str, Any]]:
    prov = get_provider()
    sym = symbol.upper()
    if settings.db_cache_enabled:
        hist = _storage.get_price_history(sym, limit=days)
        if hist:
            return hist

    def _factory():
        h = prov.get_stock_history(sym, days)
        if settings.db_cache_enabled and prov.name not in {"mock", "db"}:
            try:
                _storage.upsert_prices(sym, h)
            except Exception:
                pass
        return h

    return _cache.get_or_set(("history", prov.name, sym, days), _factory)


def stock_history_chart(symbol: str, days: int) -> Dict[str, Any]:
    hist = stock_history(symbol, days=days)
    if not hist:
        return {"symbol": symbol.upper(), "available": False, "reason": "No historical OHLCV data is stored for this symbol yet.", "history": [], "scale_factor": 1.0, "scale_reason": None}
    factor, reason = (1.0, None)
    last_close = hist[-1].get("close")
    try:
        last_close_f = float(last_close) if last_close is not None else None
    except Exception:
        last_close_f = None
    factor, reason = _detect_price_scale(symbol, last_close_f)
    if factor != 1.0:
        scaled = []
        for r in hist:
            rr = dict(r)
            for k in ("open", "high", "low", "close"):
                if rr.get(k) is None:
                    continue
                try:
                    rr[k] = float(rr[k]) * factor
                except Exception:
                    pass
            scaled.append(rr)
        hist = scaled
    return {"symbol": symbol.upper(), "available": True, "reason": None, "history": hist, "scale_factor": factor, "scale_reason": reason}


def announcements(symbol: Optional[str], limit: int) -> List[Dict[str, Any]]:
    prov = get_provider()
    sym = (symbol or "").upper()
    if settings.db_cache_enabled:
        cached = _storage.get_announcements(sym or None, limit=limit)
        if cached:
            return cached

    def _factory():
        anns = prov.get_announcements(symbol, limit)
        if settings.db_cache_enabled and prov.name not in {"mock", "db"}:
            try:
                _storage.upsert_announcements(anns)
            except Exception:
                pass
        return anns

    return _cache.get_or_set(("announcements", prov.name, sym, limit), _factory)




def _official_cse_profile_url(symbol: str) -> str:
    return f"https://www.cse.lk/pages/company-profile/company-profile.component.html?symbol={(symbol or '').upper()}"




def refresh_sentiment_scores(limit: int = 1200) -> Dict[str, Any]:
    anns = _storage.get_announcements(None, limit=limit)
    rows = build_sentiment_rows(anns)
    inserted = _storage.upsert_news_sentiment(rows)
    _storage.set_meta("last_sentiment_refresh_utc", date.today().isoformat())
    return {
        "announcements_scanned": len(anns),
        "sentiment_rows_upserted": inserted,
        "symbols": len({str(r.get("symbol") or "") for r in rows if r.get("symbol")}),
    }


def sentiment_summary(symbol: str, days: int = 90) -> Dict[str, Any]:
    rows = _storage.get_news_sentiment(symbol=symbol.upper(), limit=max(50, days * 4))
    summary = summarize_sentiment(rows, days=days)
    summary["symbol"] = symbol.upper()
    return summary


def macro_snapshot(limit: int = 800) -> Dict[str, Any]:
    rows = _storage.get_macro_series(limit=limit)
    latest: Dict[str, Dict[str, Any]] = {}
    for row in rows:
        key = str(row.get("indicator_key") or "")
        if key and key not in latest:
            latest[key] = row
    return {"count": len(rows), "latest": latest, "rows": rows[-30:]}


def import_macro_rows(rows: List[Dict[str, Any]]) -> Dict[str, Any]:
    inserted = _storage.upsert_macro_indicators(rows)
    _storage.set_meta("last_macro_import_utc", date.today().isoformat())
    preview = preview_macro_rows(rows)
    return {"inserted": inserted, "preview": preview}

def refresh_documents(limit: int = 120, symbol: Optional[str] = None, force: bool = False, max_pages: int = 12) -> Dict[str, Any]:
    import requests

    anns = _storage.get_announcements(symbol.upper() if symbol else None, limit=max(limit * 3, limit))
    existing = {str(row.get("ann_id") or "") for row in _storage.get_document_intelligence(symbol=symbol, limit=5000)} if not force else set()
    rows: List[Dict[str, Any]] = []
    errors: List[Dict[str, Any]] = []
    session = requests.Session()
    session.headers.update({"User-Agent": "TradexaLK/1.0 document-intelligence"})
    for ann in anns:
        if len(rows) >= limit:
            break
        ann_id = str(ann.get("ann_id") or ann.get("id") or "")
        title = str(ann.get("title") or "")
        url = ann.get("url")
        if not url or not is_report_or_corporate_document(title, url):
            continue
        if ann_id in existing:
            continue
        try:
            res = session.get(url, timeout=25)
            res.raise_for_status()
            payload = res.content
            if not payload or ("pdf" not in str(res.headers.get("content-type", "")).lower() and not str(url).lower().endswith(".pdf")):
                # Some CSE endpoints return PDFs without content-type; keep .pdf URLs only.
                if not str(url).lower().endswith(".pdf"):
                    continue
            row = build_document_intelligence_row(ann, payload, max_pages=max_pages)
            rows.append(row)
        except Exception as exc:
            errors.append({"ann_id": ann_id, "symbol": ann.get("symbol"), "url": url, "error": str(exc)[:300]})
    inserted = _storage.upsert_document_intelligence(rows, force=force)
    sentiment_rows = [document_row_to_sentiment(row) for row in rows]
    sentiment_inserted = _storage.upsert_news_sentiment(sentiment_rows)
    _storage.set_meta("last_document_refresh_utc", datetime.utcnow().isoformat(timespec="seconds"))
    return {
        "announcements_scanned": len(anns),
        "documents_analyzed": inserted,
        "sentiment_rows_upserted": sentiment_inserted,
        "errors": errors[:20],
        "symbol": symbol.upper() if symbol else None,
        "max_pages": max_pages,
    }


def stock_documents(symbol: str, limit: int = 50) -> Dict[str, Any]:
    rows = _storage.get_document_intelligence(symbol=symbol.upper(), limit=limit)
    return {"symbol": symbol.upper(), "documents": rows, "count": len(rows)}


def seed_news_whitelist() -> Dict[str, Any]:
    inserted = _storage.upsert_source_whitelist(DEFAULT_NEWS_WHITELIST)
    return {"sources_upserted": inserted, "sources": _storage.list_source_whitelist(enabled_only=False)}


def refresh_selected_news(lookback_days: int = 30, max_per_source: int = 40) -> Dict[str, Any]:
    import requests

    sources = _storage.list_source_whitelist(enabled_only=True)
    if not sources:
        _storage.upsert_source_whitelist(DEFAULT_NEWS_WHITELIST)
        sources = _storage.list_source_whitelist(enabled_only=True)
    companies_list = companies()
    cutoff = (date.today() - timedelta(days=lookback_days)).isoformat()
    rows: List[Dict[str, Any]] = []
    source_stats: List[Dict[str, Any]] = []
    session = requests.Session()
    session.headers.update({"User-Agent": "TradexaLK/1.0 selected-news-ingestion"})
    for source in sources:
        base_url = str(source.get("base_url") or "")
        domain = str(source.get("domain") or "")
        if not validate_whitelisted_url(base_url, domain):
            source_stats.append({"source_name": source.get("source_name"), "error": "base_url is outside whitelisted domain"})
            continue
        try:
            res = session.get(base_url, timeout=25)
            res.raise_for_status()
            raw_items = extract_links_from_html(res.text, base_url, domain, str(source.get("source_name") or domain), limit=max_per_source)
            enriched = []
            for item in raw_items:
                if str(item.get("published_date") or "") < cutoff:
                    continue
                item = {**item, "source_name": source.get("source_name"), "source_domain": domain, "scope_hint": source.get("scope_hint")}
                enriched.append(enrich_external_news_item(item, companies_list))
            rows.extend(enriched)
            source_stats.append({"source_name": source.get("source_name"), "items": len(enriched)})
        except Exception as exc:
            source_stats.append({"source_name": source.get("source_name"), "error": str(exc)[:300]})
    inserted = _storage.upsert_external_news_items(rows)
    symbol_sentiment = [external_news_to_sentiment_row(row) for row in rows if row.get("symbol")]
    sentiment_inserted = _storage.upsert_news_sentiment(symbol_sentiment)

    # Broader market/economy news is converted into dated macro-style indicators so the existing feature pipeline can train on it.
    by_date: Dict[str, List[Dict[str, Any]]] = {}
    for row in rows:
        dt = str(row.get("published_date") or "")[:10]
        if dt:
            by_date.setdefault(dt, []).append(row)
    macro_rows: List[Dict[str, Any]] = []
    for dt, bucket in by_date.items():
        scores = [float(x.get("sentiment_score") or 0.0) for x in bucket]
        impacts = [float(x.get("impact_score") or 0.0) for x in bucket]
        macro_rows.extend([
            {"indicator_key": "news_market_sentiment", "date": dt, "value": sum(scores) / max(1, len(scores)), "source": "selected_news", "label": "Selected news sentiment", "category": "news"},
            {"indicator_key": "news_market_impact", "date": dt, "value": sum(impacts), "source": "selected_news", "label": "Selected news impact", "category": "news"},
            {"indicator_key": "news_market_count", "date": dt, "value": len(bucket), "source": "selected_news", "label": "Selected news count", "category": "news"},
        ])
    macro_inserted = _storage.upsert_macro_indicators(macro_rows)
    _storage.set_meta("last_selected_news_refresh_utc", datetime.utcnow().isoformat(timespec="seconds"))
    return {
        "sources": source_stats,
        "news_items_upserted": inserted,
        "symbol_sentiment_rows_upserted": sentiment_inserted,
        "market_feature_points_upserted": macro_inserted,
        "symbol_items": sum(1 for row in rows if row.get("symbol")),
        "market_items": sum(1 for row in rows if not row.get("symbol")),
    }


def stock_news(symbol: str, limit: int = 40) -> Dict[str, Any]:
    rows = _storage.get_external_news_items(symbol=symbol.upper(), limit=limit)
    market = [row for row in _storage.get_external_news_items(limit=limit) if not row.get("symbol")][:limit]
    return {"symbol": symbol.upper(), "linked_news": rows, "market_context": market}


def compare_news_models(symbols: Optional[List[str]] = None, horizon_days: int = 1, max_symbols: int = 40) -> Dict[str, Any]:
    from ..ml.compare import compare_official_vs_news

    result = compare_official_vs_news(settings.database_url, symbols=symbols, horizon_days=horizon_days, max_symbols=max_symbols)
    _storage.set_meta("last_news_model_comparison_utc", datetime.utcnow().isoformat(timespec="seconds"))
    _storage.record_job_run(
        job_name="model_comparison",
        status="completed",
        details=result,
        started_at=datetime.utcnow().isoformat(timespec="seconds"),
        finished_at=datetime.utcnow().isoformat(timespec="seconds"),
    )
    return result

def stock_resources(symbol: str) -> Dict[str, Any]:
    sym = (symbol or '').upper()
    docs = []
    for ann in announcements(sym, 120):
        title = str(ann.get('title') or '')
        url = ann.get('url')
        if not url:
            continue
        title_l = title.lower()
        report_type = None
        if 'annual report' in title_l:
            report_type = 'annual_report'
        elif any(token in title_l for token in ('quarter', 'quarterly', 'interim', 'financial statement', 'financial statements')):
            report_type = 'quarterly_earnings'
        elif any(token in title_l for token in ('dividend', 'split', 'bonus', 'rights')):
            report_type = 'corporate_action'
        if report_type:
            docs.append({
                'id': ann.get('ann_id') or ann.get('id') or title,
                'title': title,
                'date': ann.get('date'),
                'url': url,
                'category': ann.get('category'),
                'report_type': report_type,
            })
    seen = set()
    unique_docs = []
    for doc in docs:
        key = (doc.get('title'), doc.get('url'))
        if key in seen:
            continue
        seen.add(key)
        unique_docs.append(doc)
    annual_reports = [d for d in unique_docs if d.get('report_type') == 'annual_report'][:8]
    quarterly_reports = [d for d in unique_docs if d.get('report_type') == 'quarterly_earnings'][:12]
    corporate_docs = [d for d in unique_docs if d.get('report_type') == 'corporate_action'][:12]
    return {
        'symbol': sym,
        'official_profile_url': _official_cse_profile_url(sym),
        'official_announcements': [
            {'id': ann.get('ann_id') or ann.get('id') or ann.get('title'), 'title': ann.get('title'), 'date': ann.get('date'), 'url': ann.get('url'), 'category': ann.get('category')}
            for ann in announcements(sym, 25) if ann.get('url')
        ],
        'annual_reports': annual_reports,
        'quarterly_reports': quarterly_reports,
        'corporate_documents': corporate_docs,
    }
def prediction(symbol: str) -> Dict[str, Any]:
    hist = stock_history(symbol, days=320)
    if len(hist) < 120 or hist[-1].get("close") is None:
        return _json_safe({
            "available": False,
            "symbol": symbol.upper(),
            "reason": "Insufficient end-of-day price history for this symbol. Import more data before showing a model signal.",
            "required_history_points": 120,
            "history_points": len(hist),
        })
    bundle = latest_bundle(Path(settings.model_dir))
    if bundle is not None:
        try:
            pred = predict_next(symbol=symbol, database_url=settings.database_url, model_dir=settings.model_dir, horizon_days=int(bundle.meta.get("horizon_days") or 1))
            return _json_safe({"available": True, **pred})
        except Exception as e:
            return _json_safe({"available": False, "symbol": symbol.upper(), "reason": f"Prediction failed: {getattr(e, 'detail', e)}", "history_points": len(hist)})
    if not settings.allow_prediction_fallback:
        return _json_safe({"available": False, "symbol": symbol.upper(), "reason": "Model not trained yet. Run training before showing predictions.", "history_points": len(hist)})
    try:
        idx = indices().get("ASPI")
        pred = demo_prediction(hist, index_series=idx if isinstance(idx, list) else None)
        pred["available"] = True
        pred.setdefault("model", {"version": "heuristic"})
        pred.setdefault("quality_flags", []).append("heuristic_fallback")
        return _json_safe(pred)
    except Exception as e:
        return _json_safe({"available": False, "symbol": symbol.upper(), "reason": f"Fallback prediction failed: {getattr(e, 'detail', e)}", "history_points": len(hist)})


def top_signals(limit: int = 5) -> List[Dict[str, Any]]:
    rows = []
    for snap in stock_snapshots(limit=80):
        sym = snap.get("symbol")
        if not sym:
            continue
        pred = prediction(sym)
        if not pred.get("available"):
            continue
        conf = pred.get("confidence") or {}
        rows.append(
            {
                "symbol": sym,
                "name": snap.get("name"),
                "sector": snap.get("sector"),
                "signal": pred.get("signal"),
                "up_probability": pred.get("up_probability"),
                "predicted_return": pred.get("predicted_return"),
                "confidence": conf.get("score"),
                "confidence_label": conf.get("label"),
                "history_points": pred.get("history_points"),
            }
        )
    rows.sort(key=lambda x: ((x.get("confidence") or 0.0), abs(x.get("predicted_return") or 0.0)), reverse=True)
    return rows[:limit]


def model_status() -> Dict[str, Any]:
    store_info = inspect_model_store(Path(settings.model_dir))
    active = store_info.get("active") or {}
    if active and not active.get("loadable"):
        meta = dict(active.get("meta") or {})
        status = {
            "available": False,
            "status": "incompatible_active_model",
            "model_version": meta.get("model_version"),
            "active_model": {
                "model_id": meta.get("model_id") or active.get("name"),
                "path": active.get("name"),
                "saved_runtime": active.get("saved_runtime") or {},
                "runtime": store_info.get("runtime") or {},
                "load_error": active.get("load_error"),
                "compatibility": active.get("compatibility") or {},
            },
            "reason": "The active saved model cannot be loaded in the current runtime. Retrain a fresh model with this environment or reinstall the saved model's scikit-learn/joblib versions.",
        }
        latest_loadable = store_info.get("latest_loadable") or {}
        if latest_loadable:
            latest_meta = dict(latest_loadable.get("meta") or {})
            status["latest_loadable_model"] = {
                "model_id": latest_meta.get("model_id") or latest_loadable.get("name"),
                "path": latest_loadable.get("name"),
                "is_active": bool(latest_loadable.get("is_active")),
            }
        return _json_safe(status)

    bundle = latest_bundle(Path(settings.model_dir))
    if bundle is None:
        return {"available": False, "model_version": None, "status": "missing"}
    metrics = bundle.meta.get("metrics_holdout") or {}
    quality = "experimental"
    auc = metrics.get("auc_up")
    if isinstance(auc, (int, float)):
        if auc >= 0.60:
            quality = "promising"
        elif auc >= 0.55:
            quality = "watch"
    return _json_safe({"available": True, "quality": quality, **bundle.meta})


def get_watchlist(profile: str = "default") -> Dict[str, Any]:
    symbols = _storage.list_watchlist(profile=profile)
    items = []
    if symbols:
        snap_map = {r.get("symbol"): r for r in stock_snapshots(symbols)}
        items = [snap_map.get(sym, {"symbol": sym}) for sym in symbols]
    return {"profile": profile, "symbols": symbols, "items": items}


def update_watchlist(symbol: str, add: bool, profile: str = "default") -> Dict[str, Any]:
    if add:
        _storage.add_watchlist_symbol(symbol, profile=profile)
    else:
        _storage.remove_watchlist_symbol(symbol, profile=profile)
    return get_watchlist(profile)


def get_preferences(profile: str = "default") -> Dict[str, Any]:
    return {"profile": profile, "preferences": _storage.get_preferences(profile=profile)}


def set_preferences(values: Dict[str, Any], profile: str = "default") -> Dict[str, Any]:
    for k, v in (values or {}).items():
        _storage.set_preference(k, v, profile=profile)
    return get_preferences(profile)


def _system_setting(key: str, default: Any = None) -> Any:
    prefs = _storage.get_preferences(profile="__system__")
    return prefs.get(key, default)


def _filesystem_models() -> List[Dict[str, Any]]:
    model_dir = Path(settings.model_dir)
    active_path: Optional[str] = None
    pointer = model_dir / "active_model.json"
    if pointer.exists():
        try:
            import json
            active_path = str((model_dir / json.loads(pointer.read_text(encoding="utf-8")).get("path", "")).resolve())
        except Exception:
            active_path = None
    out: List[Dict[str, Any]] = []
    if not model_dir.exists():
        return out
    for run_dir in sorted([p for p in model_dir.iterdir() if p.is_dir() and p.name.startswith("model_")], reverse=True):
        meta_path = run_dir / "metadata.json"
        if not meta_path.exists():
            continue
        try:
            import json
            meta = json.loads(meta_path.read_text(encoding="utf-8"))
        except Exception:
            meta = {}
        created_at = meta.get("trained_at_utc")
        if not created_at:
            try:
                created_at = run_dir.stat().st_mtime
            except Exception:
                created_at = None
        out.append({
            "model_id": str(meta.get("model_id") or run_dir.name),
            "path": run_dir.name,
            "created_at": created_at if isinstance(created_at, str) else None,
            "is_active": bool(active_path and str(run_dir.resolve()) == active_path),
            "meta": meta,
        })
    return out




def _infer_model_family(meta: Dict[str, Any]) -> str:
    requested = str(meta.get("model_family_requested") or "").strip()
    if requested:
        return requested
    models = meta.get("models") or {}
    direction = str(models.get("direction") or "").strip()
    mean = str(models.get("mean") or "").strip()
    if direction == "RandomForestClassifier" and mean == "GradientBoostingRegressor":
        return "legacy_boosted"
    if direction == "LogisticRegression" and mean == "Ridge":
        return "baseline"
    if direction in {"XGBoost", "XGBClassifier"} or mean in {"XGBoost", "XGBRegressor"}:
        return "xgboost"
    if direction == "CatBoost" or mean == "CatBoost":
        return "catboost"
    if direction in {"LightGBM", "LGBMClassifier"} or mean in {"LightGBM", "LGBMRegressor"}:
        return "lightgbm"
    if direction in {"SklearnGBC", "GradientBoostingClassifier", "RandomForest"} or mean in {"SklearnGBR", "GradientBoostingRegressor"}:
        return "sklearn_gbdt"
    return "unknown"


def _model_display_name(meta: Dict[str, Any], default_id: str) -> str:
    display = str(meta.get("display_name") or "").strip()
    if display:
        return display
    family = _infer_model_family(meta)
    if family == "legacy_boosted":
        return f"Legacy boosted 1D ({default_id})"
    return default_id

def list_models() -> List[Dict[str, Any]]:
    db_rows = {str(item.get("model_id") or item.get("id")): dict(item) for item in _storage.list_models()}
    for item in _filesystem_models():
        model_id = str(item.get("model_id") or "")
        if not model_id:
            continue
        existing = db_rows.get(model_id)
        if existing:
            merged = dict(existing)
            if not merged.get("path"):
                merged["path"] = item.get("path")
            if not merged.get("meta") and item.get("meta"):
                merged["meta"] = item.get("meta")
            if item.get("is_active"):
                merged["is_active"] = True
            if not merged.get("created_at"):
                merged["created_at"] = item.get("created_at")
            db_rows[model_id] = merged
        else:
            db_rows[model_id] = item

    rows = list(db_rows.values())
    for row in rows:
        meta = dict(row.get("meta") or {})
        lifecycle = str(meta.get("lifecycle_status") or ("active" if row.get("is_active") else "beta")).lower()
        if row.get("is_active"):
            lifecycle = "active"
        row["lifecycle_status"] = lifecycle
        meta["lifecycle_status"] = lifecycle
        row["meta"] = meta
        blocks = meta.get("feature_blocks") or {}
        row["summary"] = {
            "family": _infer_model_family(meta),
            "direction_model": (meta.get("models") or {}).get("direction"),
            "sentiment": bool(blocks.get("sentiment")),
            "macro": bool(blocks.get("macro")),
            "finbert_ready": bool(blocks.get("finbert_ready")),
            "validation": meta.get("validation_summary") or {},
        }
    rows.sort(key=lambda x: str(x.get("created_at") or ""), reverse=True)
    return rows


def get_active_model_record() -> Optional[Dict[str, Any]]:
    models = list_models()
    for model in models:
        if model.get("is_active"):
            return model
    return models[0] if models else None


def activate_model(model_id: str) -> bool:
    ok_fs = activate_bundle(Path(settings.model_dir), model_id)
    ok_db = _storage.activate_model(model_id)
    if ok_fs and not ok_db:
        match = next((item for item in _filesystem_models() if str(item.get("model_id")) == model_id), None)
        if match is not None:
            meta = dict(match.get("meta") or {})
            meta["lifecycle_status"] = "active"
            _storage.register_model(model_id=model_id, path=str(match.get("path") or model_id), meta=meta, is_active=True)
            ok_db = True
    return bool(ok_fs and ok_db)


def archive_model(model_id: str) -> bool:
    return _storage.archive_model(model_id)


def delete_model(model_id: str) -> bool:
    model = next((m for m in list_models() if str(m.get("model_id") or m.get("id")) == model_id), None)
    if not model or bool(model.get("is_active")):
        return False
    ok_db = _storage.delete_model(model_id)
    ok_fs = delete_bundle(Path(settings.model_dir), model_id)
    return bool(ok_db and ok_fs)


def compare_models(model_a_id: str, model_b_id: str) -> Dict[str, Any]:
    models = {str(item.get("model_id") or item.get("id")): item for item in list_models()}
    left = models.get(model_a_id)
    right = models.get(model_b_id)
    if not left or not right:
        raise HTTPException(status_code=404, detail="Model not found")
    def summary(item: Dict[str, Any]) -> Dict[str, Any]:
        meta = item.get("meta") or {}
        metrics = meta.get("metrics_holdout") or {}
        blocks = meta.get("feature_blocks") or {}
        return {
            "model_id": item.get("model_id") or item.get("id"),
            "display_name": _model_display_name(meta, str(item.get("model_id") or item.get("id") or "Model")),
            "family": _infer_model_family(meta),
            "status": item.get("lifecycle_status") or meta.get("lifecycle_status") or "beta",
            "metrics": {
                "auc_up": metrics.get("auc_up"),
                "acc_up": metrics.get("acc_up"),
                "baseline_acc_up": metrics.get("baseline_acc_up"),
                "strong_signal_acc_up": metrics.get("strong_signal_acc_up"),
                "strong_signal_coverage": metrics.get("strong_signal_coverage"),
            },
            "feature_blocks": {
                "price": bool(blocks.get("price")),
                "index": bool(blocks.get("index")),
                "sentiment": bool(blocks.get("sentiment")),
                "macro": bool(blocks.get("macro")),
                "finbert_ready": bool(blocks.get("finbert_ready")),
            },
            "validation_summary": meta.get("validation_summary") or {},
            "trained_at_utc": meta.get("trained_at_utc"),
        }
    return {"left": summary(left), "right": summary(right)}




def list_portfolios(username: str) -> List[Dict[str, Any]]:
    _storage.ensure_default_portfolio(username)
    portfolios = _storage.list_portfolios(username)
    for pf in portfolios:
        pf["summary"] = get_portfolio(username, pf["portfolio_id"])["summary"]
    return portfolios


def create_portfolio_account(username: str, payload: Dict[str, Any]) -> Dict[str, Any]:
    name = str(payload.get("name") or "Portfolio").strip()
    if len(name) < 2:
        raise HTTPException(status_code=400, detail="Portfolio name is required")
    pf = _storage.create_portfolio_account(username, name=name, description=str(payload.get("description") or "").strip() or None, currency=str(payload.get("currency") or "LKR"))
    return {"portfolio": pf, "portfolios": list_portfolios(username)}


def update_portfolio_account(username: str, portfolio_id: str, payload: Dict[str, Any]) -> Dict[str, Any]:
    if not _storage.get_portfolio_account(username, portfolio_id):
        raise HTTPException(status_code=404, detail="Portfolio not found")
    is_default = payload.get("is_default") if "is_default" in payload else None
    is_archived = payload.get("is_archived") if "is_archived" in payload else None
    if is_archived and (_storage.get_portfolio_account(username, portfolio_id) or {}).get("is_default"):
        raise HTTPException(status_code=400, detail="Default portfolio cannot be archived")
    _storage.update_portfolio_account(username, portfolio_id, name=payload.get("name"), description=payload.get("description"), is_default=is_default, is_archived=is_archived)
    return {"portfolio": _storage.get_portfolio_account(username, portfolio_id), "portfolios": list_portfolios(username)}


def create_cash_movement(username: str, payload: Dict[str, Any], portfolio_id: Optional[str] = None) -> Dict[str, Any]:
    portfolio_id = _resolve_portfolio_id(username, portfolio_id or payload.get("portfolio_id"))
    movement_type = str(payload.get("movement_type") or payload.get("type") or "deposit").lower().strip()
    if movement_type not in {"deposit", "withdrawal"}:
        raise HTTPException(status_code=400, detail="Cash movement type must be deposit or withdrawal")
    amount = _to_float(payload.get("amount"))
    if amount is None or amount <= 0:
        raise HTTPException(status_code=400, detail="Cash amount must be greater than zero")
    movement_date = str(payload.get("movement_date") or payload.get("date") or "").strip() or None
    if movement_date:
        try:
            date.fromisoformat(movement_date[:10])
        except Exception as exc:
            raise HTTPException(status_code=400, detail="Cash movement date must be YYYY-MM-DD") from exc
    _storage.create_cash_movement(username, portfolio_id, movement_type, float(amount), movement_date=movement_date, notes=str(payload.get("notes") or "").strip() or None)
    return get_portfolio(username, portfolio_id)


def delete_cash_movement(username: str, cash_id: str, portfolio_id: Optional[str] = None) -> Dict[str, Any]:
    portfolio_id = _resolve_portfolio_id(username, portfolio_id)
    if not _storage.delete_cash_movement(username, cash_id, portfolio_id=portfolio_id):
        raise HTTPException(status_code=404, detail="Cash movement not found")
    return get_portfolio(username, portfolio_id)


def _resolve_portfolio_id(username: str, portfolio_id: Optional[str] = None) -> str:
    if portfolio_id:
        pf = _storage.get_portfolio_account(username, portfolio_id)
        if not pf or pf.get("is_archived"):
            raise HTTPException(status_code=404, detail="Portfolio not found")
        return portfolio_id
    return _storage.ensure_default_portfolio(username)["portfolio_id"]


def list_portfolio_transactions(username: str, portfolio_id: Optional[str] = None) -> List[Dict[str, Any]]:
    return _storage.list_portfolio_transactions(username, _resolve_portfolio_id(username, portfolio_id))


def corporate_actions(symbol: Optional[str] = None, limit: int = 100) -> List[Dict[str, Any]]:
    return _storage.list_corporate_actions(symbol=symbol, limit=limit)


def _portfolio_sort_key(item: Dict[str, Any]) -> Tuple[str, str, str]:
    return (
        str(item.get("traded_at") or item.get("created_at") or ""),
        str(item.get("created_at") or ""),
        str(item.get("tx_id") or item.get("id") or ""),
    )


def _action_ratio(action: Dict[str, Any]) -> float:
    numerator = _to_float(action.get("ratio_numerator"))
    denominator = _to_float(action.get("ratio_denominator"))
    if numerator and denominator and denominator != 0:
        return float(numerator / denominator)
    return 1.0


def _load_actions_by_symbol(symbols: List[str]) -> Dict[str, List[Dict[str, Any]]]:
    grouped: Dict[str, List[Dict[str, Any]]] = {}
    if not symbols:
        return grouped
    for symbol in sorted({s.upper() for s in symbols if s}):
        grouped[symbol] = sorted(_storage.list_corporate_actions(symbol=symbol, limit=500), key=lambda item: (str(item.get("ex_date") or ""), str(item.get("action_id") or "")))
    return grouped


def _state_event_key(item: Dict[str, Any], kind: str) -> Tuple[str, int, str]:
    if kind == "action":
        return (str(item.get("ex_date") or item.get("date") or ""), 0, str(item.get("action_id") or ""))
    return (str(item.get("traded_at") or item.get("created_at") or ""), 1, str(item.get("tx_id") or item.get("id") or ""))


def _portfolio_position_state_from_rows(rows: List[Dict[str, Any]], *, strict: bool = False, actions_by_symbol: Optional[Dict[str, List[Dict[str, Any]]]] = None) -> Dict[str, Dict[str, Any]]:
    ordered = sorted(rows, key=_portfolio_sort_key)
    symbols = sorted({str(tx.get("symbol") or "").upper().strip() for tx in ordered if tx.get("symbol")})
    action_map = actions_by_symbol if actions_by_symbol is not None else _load_actions_by_symbol(symbols)
    state: Dict[str, Dict[str, Any]] = {}
    for symbol in symbols:
        events: List[Tuple[str, Dict[str, Any]]] = []
        for action in action_map.get(symbol, []):
            events.append(("action", action))
        for tx in [item for item in ordered if str(item.get("symbol") or "").upper().strip() == symbol]:
            events.append(("tx", tx))
        events.sort(key=lambda pair: _state_event_key(pair[1], pair[0]))
        info = state.setdefault(symbol, {"quantity": 0.0, "cost_total": 0.0, "realized_pl": 0.0, "dividend_income": 0.0})
        for kind, item in events:
            if kind == "action":
                action_type = str(item.get("action_type") or "").lower().strip()
                quantity = float(info.get("quantity") or 0.0)
                if quantity <= 0:
                    continue
                if action_type == "dividend":
                    amount = float(_to_float(item.get("amount")) or 0.0)
                    if amount:
                        info["dividend_income"] += quantity * amount
                elif action_type in {"split", "bonus"}:
                    ratio = _action_ratio(item)
                    if ratio > 0 and abs(ratio - 1.0) > 1e-9:
                        info["quantity"] = quantity * ratio
                continue
            tx_type = str(item.get("tx_type") or item.get("type") or "buy").lower().strip()
            quantity = float(item.get("quantity") or 0.0)
            price = float(item.get("price") or 0.0)
            fees = float(item.get("fees") or 0.0)
            if tx_type == "buy":
                info["quantity"] += quantity
                info["cost_total"] += quantity * price + fees
            elif tx_type == "sell":
                held_qty = float(info.get("quantity") or 0.0)
                if strict and held_qty + 1e-9 < quantity:
                    tx_label = item.get("traded_at") or item.get("created_at") or "this transaction"
                    raise HTTPException(
                        status_code=400,
                        detail=f"Cannot sell {quantity:.4f} shares of {symbol} on {tx_label}; current holding is {held_qty:.4f}",
                    )
                avg_cost = (float(info.get("cost_total") or 0.0) / held_qty) if held_qty > 0 else 0.0
                info["realized_pl"] += quantity * (price - avg_cost) - fees
                info["quantity"] = max(0.0, held_qty - quantity)
                info["cost_total"] = max(0.0, float(info.get("cost_total") or 0.0) - avg_cost * quantity)
        state[symbol] = info
    return state


def _portfolio_position_state(username: str, portfolio_id: Optional[str] = None) -> Dict[str, Dict[str, Any]]:
    return _portfolio_position_state_from_rows(_storage.list_portfolio_transactions(username, _resolve_portfolio_id(username, portfolio_id)))


def _validate_portfolio_transaction_payload(payload: Dict[str, Any]) -> Dict[str, Any]:
    symbol = str(payload.get("symbol") or "").upper().strip()
    tx_type = str(payload.get("tx_type") or payload.get("type") or "buy").lower().strip()
    quantity = _to_float(payload.get("quantity"))
    price = _to_float(payload.get("price"))
    fees = _to_float(payload.get("fees")) or 0.0
    traded_at = str(payload.get("traded_at") or payload.get("date") or "").strip() or None
    notes = str(payload.get("notes") or "").strip() or None
    if not symbol:
        raise HTTPException(status_code=400, detail="Symbol is required")
    if tx_type not in {"buy", "sell"}:
        raise HTTPException(status_code=400, detail="Transaction type must be buy or sell")
    if quantity is None or quantity <= 0:
        raise HTTPException(status_code=400, detail="Quantity must be greater than zero")
    if price is None or price <= 0:
        raise HTTPException(status_code=400, detail="Price must be greater than zero")
    if traded_at:
        try:
            date.fromisoformat(traded_at[:10])
        except Exception as exc:
            raise HTTPException(status_code=400, detail="Trade date must be in YYYY-MM-DD format") from exc
    return {
        "symbol": symbol,
        "tx_type": tx_type,
        "quantity": float(quantity),
        "price": float(price),
        "fees": float(fees),
        "traded_at": traded_at,
        "notes": notes,
    }


def _validate_portfolio_sequence(next_rows: List[Dict[str, Any]]) -> None:
    actions = _load_actions_by_symbol([str(item.get("symbol") or "") for item in next_rows])
    _portfolio_position_state_from_rows(next_rows, strict=True, actions_by_symbol=actions)


def get_portfolio(username: str, portfolio_id: Optional[str] = None) -> Dict[str, Any]:
    portfolio_id = _resolve_portfolio_id(username, portfolio_id)
    account = _storage.get_portfolio_account(username, portfolio_id) or {}
    transactions = _storage.list_portfolio_transactions(username, portfolio_id)
    cash_movements = _storage.list_cash_movements(username, portfolio_id)
    state = _portfolio_position_state_from_rows(transactions)
    open_symbols = [symbol for symbol, item in state.items() if float(item.get("quantity") or 0.0) > 0]
    snapshots = {item.get("symbol"): item for item in stock_snapshots(open_symbols)} if open_symbols else {}
    recent_actions = _storage.list_corporate_actions(limit=100)
    positions: List[Dict[str, Any]] = []
    total_market_value = 0.0
    total_cost_basis = 0.0
    total_realized = 0.0
    total_dividend_income = 0.0
    for symbol in sorted(open_symbols):
        item = state[symbol]
        quantity = float(item.get("quantity") or 0.0)
        cost_basis = float(item.get("cost_total") or 0.0)
        avg_cost = (cost_basis / quantity) if quantity > 0 else 0.0
        snap = snapshots.get(symbol) or {}
        current_price = _to_float(snap.get("last"))
        if current_price is None:
            bar = _storage.get_latest_bar(symbol)
            current_price = _to_float((bar or {}).get("close")) or 0.0
        market_value = quantity * float(current_price or 0.0)
        unrealized = market_value - cost_basis
        dividend_income = float(item.get("dividend_income") or 0.0)
        total_market_value += market_value
        total_cost_basis += cost_basis
        total_realized += float(item.get("realized_pl") or 0.0)
        total_dividend_income += dividend_income
        positions.append({
            "symbol": symbol,
            "company": snap.get("name") or symbol,
            "sector": snap.get("sector") or "—",
            "quantity": quantity,
            "avg_cost": avg_cost,
            "cost_basis": cost_basis,
            "current_price": float(current_price or 0.0),
            "market_value": market_value,
            "unrealized_pl": unrealized,
            "unrealized_pl_pct": (unrealized / cost_basis * 100.0) if cost_basis > 0 else 0.0,
            "realized_pl": float(item.get("realized_pl") or 0.0),
            "dividend_income": dividend_income,
        })
    for row in positions:
        row["weight_pct"] = (row["market_value"] / total_market_value * 100.0) if total_market_value > 0 else 0.0
    cash_deposits = sum(float(x.get("amount") or 0.0) for x in cash_movements if str(x.get("movement_type") or "").lower() == "deposit")
    cash_withdrawals = sum(float(x.get("amount") or 0.0) for x in cash_movements if str(x.get("movement_type") or "").lower() == "withdrawal")
    buy_cash_out = sum(float(tx.get("quantity") or 0.0) * float(tx.get("price") or 0.0) + float(tx.get("fees") or 0.0) for tx in transactions if str(tx.get("tx_type") or "").lower() == "buy")
    sell_cash_in = sum(float(tx.get("quantity") or 0.0) * float(tx.get("price") or 0.0) - float(tx.get("fees") or 0.0) for tx in transactions if str(tx.get("tx_type") or "").lower() == "sell")
    cash_balance = cash_deposits - cash_withdrawals - buy_cash_out + sell_cash_in + total_dividend_income
    net_contributions = cash_deposits - cash_withdrawals
    total_equity = total_market_value + cash_balance
    summary = {
        "portfolio_id": portfolio_id,
        "portfolio_name": account.get("name") or "Main Portfolio",
        "cash_balance": cash_balance,
        "cash_deposits": cash_deposits,
        "cash_withdrawals": cash_withdrawals,
        "net_contributions": net_contributions,
        "total_equity": total_equity,
        "positions_count": len(positions),
        "transactions_count": len(transactions),
        "cash_movements_count": len(cash_movements),
        "cost_basis": total_cost_basis,
        "market_value": total_market_value,
        "unrealized_pl": total_market_value - total_cost_basis,
        "unrealized_pl_pct": ((total_market_value - total_cost_basis) / total_cost_basis * 100.0) if total_cost_basis > 0 else 0.0,
        "realized_pl": total_realized,
        "dividend_income": total_dividend_income,
        "total_pl": (total_market_value - total_cost_basis) + total_realized,
        "total_return": (total_market_value - total_cost_basis) + total_realized + total_dividend_income,
    }
    transactions_sorted = sorted(transactions, key=_portfolio_sort_key, reverse=True)
    return {
        "portfolio": account,
        "summary": summary,
        "positions": positions,
        "transactions": transactions_sorted,
        "cash_movements": cash_movements,
        "recent_actions": recent_actions,
    }


def get_portfolio_performance(username: str, days: int = 365, portfolio_id: Optional[str] = None) -> Dict[str, Any]:
    portfolio_id = _resolve_portfolio_id(username, portfolio_id)
    days = max(1, int(days or 365))
    transactions = _storage.list_portfolio_transactions(username, portfolio_id)
    cash_movements = _storage.list_cash_movements(username, portfolio_id)
    if not transactions and not cash_movements:
        return {"days": days, "series": []}

    ordered_txs = sorted(transactions, key=_portfolio_sort_key)
    symbols = sorted({str(item.get("symbol") or "").upper() for item in ordered_txs if item.get("symbol")})
    action_map = _load_actions_by_symbol(symbols)
    histories: Dict[str, Dict[str, float]] = {}
    history_dates: List[date] = []
    for symbol in symbols:
        price_rows = _storage.get_price_history(symbol, limit=max(days + 120, 2400))
        price_map: Dict[str, float] = {}
        for row in price_rows:
            date_key = str(row.get("date") or "")[:10]
            close_value = _to_float(row.get("close"))
            if date_key and close_value is not None:
                price_map[date_key] = float(close_value)
                try:
                    history_dates.append(date.fromisoformat(date_key))
                except Exception:
                    pass
        if price_map:
            histories[symbol] = price_map
    if symbols and not histories:
        return {"days": days, "series": []}

    def _item_date(item: Dict[str, Any], *keys: str) -> Optional[date]:
        for key in keys:
            raw = str(item.get(key) or "")[:10]
            if raw:
                try:
                    return date.fromisoformat(raw)
                except Exception:
                    continue
        return None

    tx_dates = [d for d in (_item_date(item, "traded_at", "created_at") for item in ordered_txs) if d]
    action_dates = [d for d in (_item_date(item, "ex_date") for rows in action_map.values() for item in rows) if d]
    cash_dates = [d for d in (_item_date(item, "movement_date", "created_at") for item in cash_movements) if d]
    if history_dates:
        latest_history_date = max(history_dates)
    else:
        latest_history_date = max(tx_dates + cash_dates) if (tx_dates or cash_dates) else date.today()
    event_dates = tx_dates + action_dates + cash_dates
    earliest_event_date = min(event_dates) if event_dates else latest_history_date
    start_date = max(earliest_event_date, latest_history_date - timedelta(days=max(days - 1, 0)))

    if histories:
        market_dates = sorted({d for d in history_dates if d >= start_date})
    else:
        # cash-only portfolio: build a simple daily series over the requested window
        market_dates = [start_date + timedelta(days=i) for i in range((latest_history_date - start_date).days + 1)] or [latest_history_date]
    if not market_dates:
        return {"days": days, "series": []}

    tx_by_date: Dict[date, List[Dict[str, Any]]] = {}
    for tx in ordered_txs:
        d = _item_date(tx, "traded_at", "created_at")
        if d:
            tx_by_date.setdefault(d, []).append(tx)
    actions_by_date: Dict[date, List[Dict[str, Any]]] = {}
    for rows in action_map.values():
        for action in rows:
            d = _item_date(action, "ex_date")
            if d:
                actions_by_date.setdefault(d, []).append(action)
    cash_by_date: Dict[date, List[Dict[str, Any]]] = {}
    for movement in cash_movements:
        d = _item_date(movement, "movement_date", "created_at")
        if d:
            cash_by_date.setdefault(d, []).append(movement)

    positions: Dict[str, Dict[str, float]] = {}
    cash_balance = 0.0

    def _apply_cash(movement: Dict[str, Any]) -> None:
        nonlocal cash_balance
        amount = float(movement.get("amount") or 0.0)
        movement_type = str(movement.get("movement_type") or "deposit").lower().strip()
        if movement_type == "withdrawal":
            cash_balance -= amount
        else:
            cash_balance += amount

    def _apply_action(action: Dict[str, Any]) -> None:
        symbol = str(action.get("symbol") or "").upper().strip()
        if not symbol:
            return
        pos = positions.setdefault(symbol, {"quantity": 0.0, "cost_total": 0.0, "realized_pl": 0.0, "dividend_income": 0.0})
        held_qty = float(pos.get("quantity") or 0.0)
        if held_qty <= 0:
            return
        action_type = str(action.get("action_type") or "").lower().strip()
        if action_type == "dividend":
            amount = float(_to_float(action.get("amount")) or 0.0)
            if amount:
                dividend = held_qty * amount
                pos["dividend_income"] += dividend
                cash_balance_add[0] += dividend
        elif action_type in {"split", "bonus"}:
            ratio = _action_ratio(action)
            if ratio > 0 and abs(ratio - 1.0) > 1e-9:
                pos["quantity"] = held_qty * ratio

    def _apply_tx(tx: Dict[str, Any]) -> None:
        nonlocal cash_balance
        symbol = str(tx.get("symbol") or "").upper().strip()
        if not symbol:
            return
        tx_type = str(tx.get("tx_type") or tx.get("type") or "buy").lower().strip()
        quantity = float(tx.get("quantity") or 0.0)
        price = float(tx.get("price") or 0.0)
        fees = float(tx.get("fees") or 0.0)
        pos = positions.setdefault(symbol, {"quantity": 0.0, "cost_total": 0.0, "realized_pl": 0.0, "dividend_income": 0.0})
        if tx_type == "buy":
            pos["quantity"] += quantity
            pos["cost_total"] += quantity * price + fees
            cash_balance -= quantity * price + fees
        elif tx_type == "sell":
            held_qty = float(pos.get("quantity") or 0.0)
            avg_cost = (float(pos.get("cost_total") or 0.0) / held_qty) if held_qty > 0 else 0.0
            pos["realized_pl"] += quantity * (price - avg_cost) - fees
            pos["quantity"] = max(0.0, held_qty - quantity)
            pos["cost_total"] = max(0.0, float(pos.get("cost_total") or 0.0) - avg_cost * quantity)
            cash_balance += quantity * price - fees

    # Seed state before the visible period so short ranges like 1D and 1W still show existing holdings.
    cash_balance_add = [0.0]
    for d in sorted(set([*tx_by_date.keys(), *actions_by_date.keys(), *cash_by_date.keys()])):
        if d >= start_date:
            continue
        for movement in sorted(cash_by_date.get(d, []), key=lambda item: str(item.get("created_at") or "")):
            _apply_cash(movement)
        for action in sorted(actions_by_date.get(d, []), key=lambda item: (str(item.get("symbol") or ""), str(item.get("action_id") or ""))):
            cash_balance_add[0] = 0.0
            _apply_action(action)
            cash_balance += cash_balance_add[0]
        for tx in sorted(tx_by_date.get(d, []), key=_portfolio_sort_key):
            _apply_tx(tx)

    last_close: Dict[str, float] = {}
    for symbol, price_map in histories.items():
        previous = [(date.fromisoformat(day), close) for day, close in price_map.items() if date.fromisoformat(day) < start_date]
        if previous:
            last_close[symbol] = float(sorted(previous, key=lambda item: item[0])[-1][1])

    series: List[Dict[str, Any]] = []
    for market_day in market_dates:
        for movement in sorted(cash_by_date.get(market_day, []), key=lambda item: str(item.get("created_at") or "")):
            _apply_cash(movement)
        for action in sorted(actions_by_date.get(market_day, []), key=lambda item: (str(item.get("symbol") or ""), str(item.get("action_id") or ""))):
            cash_balance_add[0] = 0.0
            _apply_action(action)
            cash_balance += cash_balance_add[0]
        for tx in sorted(tx_by_date.get(market_day, []), key=_portfolio_sort_key):
            _apply_tx(tx)

        total_market_value = 0.0
        total_cost_basis = 0.0
        total_realized = 0.0
        total_dividends = 0.0
        for symbol, price_map in histories.items():
            date_key = market_day.isoformat()
            if date_key in price_map:
                last_close[symbol] = float(price_map[date_key])
            pos = positions.get(symbol)
            if not pos:
                continue
            quantity = float(pos.get("quantity") or 0.0)
            total_realized += float(pos.get("realized_pl") or 0.0)
            total_dividends += float(pos.get("dividend_income") or 0.0)
            if quantity <= 0:
                continue
            close_value = float(last_close.get(symbol) or 0.0)
            total_market_value += quantity * close_value
            total_cost_basis += float(pos.get("cost_total") or 0.0)
        unrealized = total_market_value - total_cost_basis
        total_return = unrealized + total_realized + total_dividends
        total_equity = total_market_value + cash_balance
        net_contributions = sum(float(m.get("amount") or 0.0) * (-1.0 if str(m.get("movement_type") or "").lower() == "withdrawal" else 1.0) for d, rows in cash_by_date.items() for m in rows if d <= market_day)
        invested_capital = max(abs(net_contributions), total_cost_basis, 1e-9)
        series.append({
            "date": market_day.isoformat(),
            "market_value": round(total_market_value, 4),
            "cash_balance": round(cash_balance, 4),
            "total_equity": round(total_equity, 4),
            "net_contributions": round(net_contributions, 4),
            "cost_basis": round(total_cost_basis, 4),
            "realized_pl": round(total_realized, 4),
            "unrealized_pl": round(unrealized, 4),
            "dividend_income": round(total_dividends, 4),
            "total_pl": round(unrealized + total_realized, 4),
            "total_return": round(total_return, 4),
            "return_pct": round((total_return / invested_capital) * 100.0, 4) if invested_capital else 0.0,
        })
    return {"days": days, "series": series}


def _safe_pct(numerator: float, denominator: float) -> float:
    if abs(denominator) < 1e-9:
        return 0.0
    return (numerator / denominator) * 100.0


def _score_label(score: float, bands: Tuple[int, int] = (40, 70), labels: Tuple[str, str, str] = ("Low", "Moderate", "High")) -> str:
    low_band, high_band = bands
    if score < low_band:
        return labels[0]
    if score < high_band:
        return labels[1]
    return labels[2]


def _normalized_index_series(price_map: Dict[str, float], start_date: date) -> Dict[str, float]:
    points = []
    for raw_date, value in price_map.items():
        try:
            parsed = date.fromisoformat(str(raw_date)[:10])
        except Exception:
            continue
        if parsed >= start_date and value not in (None, 0):
            points.append((parsed, float(value)))
    points.sort(key=lambda item: item[0])
    if not points:
        return {}
    base = points[0][1]
    if abs(base) < 1e-9:
        return {}
    return {d.isoformat(): (v / base) * 100.0 for d, v in points}


def _build_holdings_comparison_series(positions: List[Dict[str, Any]], days: int) -> Dict[str, Any]:
    if not positions:
        return {"series": [], "portfolio_return_pct": 0.0}

    total_market_value = sum(float(p.get("market_value") or 0.0) for p in positions)
    if total_market_value <= 0:
        return {"series": [], "portfolio_return_pct": 0.0}

    today = date.today()
    start_date = today - timedelta(days=max(days - 1, 0))
    symbol_weights: Dict[str, float] = {}
    symbol_norms: Dict[str, Dict[str, float]] = {}
    date_pool: set[str] = set()

    for position in positions:
        symbol = str(position.get("symbol") or "").upper().strip()
        weight = float(position.get("market_value") or 0.0) / total_market_value if total_market_value > 0 else 0.0
        if not symbol or weight <= 0:
            continue
        history = _storage.get_price_history(symbol, limit=max(days + 40, 600))
        price_map: Dict[str, float] = {}
        for row in history:
            key = str(row.get("date") or "")[:10]
            close_value = _to_float(row.get("close"))
            if key and close_value not in (None, 0):
                price_map[key] = float(close_value)
        normalized = _normalized_index_series(price_map, start_date)
        if normalized:
            symbol_weights[symbol] = weight
            symbol_norms[symbol] = normalized
            date_pool.update(normalized.keys())

    if not symbol_norms:
        return {"series": [], "portfolio_return_pct": 0.0}

    ordered_dates = sorted(date_pool)
    last_seen = {symbol: next(iter(series.values())) for symbol, series in symbol_norms.items()}
    portfolio_series: List[Dict[str, Any]] = []
    for day_key in ordered_dates:
        total = 0.0
        active_weight = 0.0
        for symbol, weight in symbol_weights.items():
            series = symbol_norms.get(symbol) or {}
            if day_key in series:
                last_seen[symbol] = float(series[day_key])
            if symbol in last_seen:
                total += weight * float(last_seen[symbol])
                active_weight += weight
        if active_weight > 0:
            portfolio_series.append({"date": day_key, "portfolio": round(total / active_weight, 4)})

    portfolio_return = 0.0
    if len(portfolio_series) >= 2:
        first_value = float(portfolio_series[0]["portfolio"] or 0.0)
        last_value = float(portfolio_series[-1]["portfolio"] or 0.0)
        portfolio_return = _safe_pct(last_value - first_value, first_value)

    return {"series": portfolio_series, "portfolio_return_pct": round(portfolio_return, 2)}


def _benchmark_series(name: str, start_date: date, days: int) -> Dict[str, Any]:
    rows = _storage.get_index_series(name, limit=max(days + 40, 800))
    price_map: Dict[str, float] = {}
    for row in rows:
        key = str(row.get("date") or "")[:10]
        value = _to_float(row.get("value"))
        if key and value not in (None, 0):
            price_map[key] = float(value)
    normalized = _normalized_index_series(price_map, start_date)
    ordered = [{"date": key, "value": round(float(value), 4)} for key, value in sorted(normalized.items())]
    ret = 0.0
    if len(ordered) >= 2:
        ret = _safe_pct(ordered[-1]["value"] - ordered[0]["value"], ordered[0]["value"])
    return {"name": name, "series": ordered, "return_pct": round(ret, 2)}


def _merge_benchmark_lines(portfolio_series: List[Dict[str, Any]], benchmarks: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    date_map: Dict[str, Dict[str, Any]] = {}
    for point in portfolio_series:
        key = str(point.get("date") or "")[:10]
        if not key:
            continue
        date_map.setdefault(key, {"date": key})["portfolio"] = point.get("portfolio")
    for benchmark in benchmarks:
        field_name = "aspi" if benchmark.get("name") == "ASPI" else "sp20"
        for point in benchmark.get("series") or []:
            key = str(point.get("date") or "")[:10]
            if not key:
                continue
            date_map.setdefault(key, {"date": key})[field_name] = point.get("value")
    merged = [date_map[key] for key in sorted(date_map)]
    return merged


def get_portfolio_analytics(username: str, days: int = 365, portfolio_id: Optional[str] = None) -> Dict[str, Any]:
    portfolio = get_portfolio(username, portfolio_id=portfolio_id)
    positions = portfolio.get("positions") or []
    summary = portfolio.get("summary") or {}

    total_market_value = float(summary.get("market_value") or 0.0)
    total_cost_basis = float(summary.get("cost_basis") or 0.0)
    total_unrealized = float(summary.get("unrealized_pl") or 0.0)
    total_realized = float(summary.get("realized_pl") or 0.0)
    total_dividends = float(summary.get("dividend_income") or 0.0)
    total_return = float(summary.get("total_return") or (total_unrealized + total_realized + total_dividends))

    sector_map: Dict[str, Dict[str, Any]] = {}
    for position in positions:
        sector = str(position.get("sector") or "Unclassified").strip() or "Unclassified"
        entry = sector_map.setdefault(sector, {"sector": sector, "market_value": 0.0, "positions_count": 0})
        entry["market_value"] += float(position.get("market_value") or 0.0)
        entry["positions_count"] += 1
    sector_allocation = []
    for entry in sorted(sector_map.values(), key=lambda item: float(item.get("market_value") or 0.0), reverse=True):
        mv = float(entry.get("market_value") or 0.0)
        sector_allocation.append({
            **entry,
            "market_value": round(mv, 2),
            "weight_pct": round(_safe_pct(mv, total_market_value), 2),
        })

    positions_sorted = sorted(positions, key=lambda item: float(item.get("unrealized_pl_pct") or 0.0), reverse=True)
    top_gainers = []
    top_losers = []
    for item in positions_sorted[:5]:
        top_gainers.append({
            "symbol": item.get("symbol"),
            "company": item.get("company"),
            "sector": item.get("sector"),
            "market_value": round(float(item.get("market_value") or 0.0), 2),
            "return_pct": round(float(item.get("unrealized_pl_pct") or 0.0), 2),
            "profit": round(float(item.get("unrealized_pl") or 0.0), 2),
        })
    for item in sorted(positions, key=lambda row: float(row.get("unrealized_pl_pct") or 0.0))[:5]:
        top_losers.append({
            "symbol": item.get("symbol"),
            "company": item.get("company"),
            "sector": item.get("sector"),
            "market_value": round(float(item.get("market_value") or 0.0), 2),
            "return_pct": round(float(item.get("unrealized_pl_pct") or 0.0), 2),
            "profit": round(float(item.get("unrealized_pl") or 0.0), 2),
        })

    weights = [float(item.get("weight_pct") or 0.0) / 100.0 for item in positions if float(item.get("market_value") or 0.0) > 0]
    hhi = sum(weight * weight for weight in weights)
    effective_holdings = (1.0 / hhi) if hhi > 1e-9 else 0.0
    sector_weights = [float(item.get("weight_pct") or 0.0) / 100.0 for item in sector_allocation if float(item.get("weight_pct") or 0.0) > 0]
    sector_hhi = sum(weight * weight for weight in sector_weights)
    largest_position_pct = max((float(item.get("weight_pct") or 0.0) for item in positions), default=0.0)
    effective_score = min(1.0, effective_holdings / 8.0)
    sector_score = min(1.0, len(sector_allocation) / 5.0)
    concentration_score = max(0.0, min(1.0, 1.0 - ((largest_position_pct / 100.0 - 0.1) / 0.45)))
    diversification_score = round(max(0.0, min(100.0, 100.0 * (0.45 * effective_score + 0.25 * sector_score + 0.30 * concentration_score))))
    diversification = {
        "score": diversification_score,
        "label": _score_label(diversification_score, bands=(45, 75), labels=("Concentrated", "Balanced", "Well diversified")),
        "effective_holdings": round(effective_holdings, 2),
        "sector_count": len(sector_allocation),
        "largest_position_pct": round(largest_position_pct, 2),
        "position_concentration_hhi": round(hhi, 4),
        "sector_concentration_hhi": round(sector_hhi, 4),
    }

    contribution_denominator = abs(total_realized) + abs(total_unrealized) + abs(total_dividends)
    performance_breakdown = {
        "realized_pl": round(total_realized, 2),
        "unrealized_pl": round(total_unrealized, 2),
        "dividend_income": round(total_dividends, 2),
        "total_return": round(total_return, 2),
        "realized_share_pct": round(_safe_pct(abs(total_realized), contribution_denominator), 2) if contribution_denominator > 0 else 0.0,
        "unrealized_share_pct": round(_safe_pct(abs(total_unrealized), contribution_denominator), 2) if contribution_denominator > 0 else 0.0,
        "dividend_share_pct": round(_safe_pct(abs(total_dividends), contribution_denominator), 2) if contribution_denominator > 0 else 0.0,
    }

    dividend_positions = [item for item in positions if float(item.get("dividend_income") or 0.0) > 0]
    dividend_summary = {
        "total_income": round(total_dividends, 2),
        "yield_on_cost_pct": round(_safe_pct(total_dividends, total_cost_basis), 2),
        "paying_positions_count": len(dividend_positions),
        "top_positions": [
            {
                "symbol": item.get("symbol"),
                "company": item.get("company"),
                "dividend_income": round(float(item.get("dividend_income") or 0.0), 2),
                "yield_on_position_cost_pct": round(_safe_pct(float(item.get("dividend_income") or 0.0), float(item.get("cost_basis") or 0.0)), 2),
            }
            for item in sorted(dividend_positions, key=lambda row: float(row.get("dividend_income") or 0.0), reverse=True)[:5]
        ],
    }

    comparison = _build_holdings_comparison_series(positions, days)
    today = date.today()
    start_date = today - timedelta(days=max(days - 1, 0))
    aspi = _benchmark_series("ASPI", start_date, days)
    sp20 = _benchmark_series("S&P SL20", start_date, days)
    merged_bench = _merge_benchmark_lines(comparison.get("series") or [], [aspi, sp20])

    portfolio_line = [float(item.get("portfolio") or 0.0) for item in merged_bench if item.get("portfolio") is not None]
    daily_returns = []
    for prev, curr in zip(portfolio_line, portfolio_line[1:]):
        if prev not in (None, 0):
            daily_returns.append((curr / prev) - 1.0)
    annualized_vol_pct = 0.0
    if len(daily_returns) >= 2:
        try:
            annualized_vol_pct = statistics.stdev(daily_returns) * math.sqrt(252) * 100.0
        except statistics.StatisticsError:
            annualized_vol_pct = 0.0

    beta_values = []
    for position in positions:
        company = _storage.get_company(str(position.get("symbol") or "")) or {}
        beta = _to_float(company.get("beta"))
        if beta is not None:
            beta_values.append((float(position.get("weight_pct") or 0.0) / 100.0, beta))
    weighted_beta = sum(weight * beta for weight, beta in beta_values) if beta_values else 1.0
    largest_sector_pct = max((float(item.get("weight_pct") or 0.0) for item in sector_allocation), default=0.0)
    beta_component = min(1.0, max(0.0, (weighted_beta - 0.8) / 0.8))
    concentration_component = min(1.0, largest_position_pct / 35.0)
    sector_component = min(1.0, largest_sector_pct / 50.0)
    vol_component = min(1.0, annualized_vol_pct / 35.0)
    risk_score = round(max(0.0, min(100.0, 100.0 * (0.30 * concentration_component + 0.25 * sector_component + 0.30 * vol_component + 0.15 * beta_component))))
    risk = {
        "score": risk_score,
        "label": _score_label(risk_score),
        "annualized_volatility_pct": round(annualized_vol_pct, 2),
        "weighted_beta": round(weighted_beta, 2),
        "largest_position_pct": round(largest_position_pct, 2),
        "largest_sector_pct": round(largest_sector_pct, 2),
    }

    benchmark = {
        "period_days": days,
        "portfolio_return_pct": round(float(comparison.get("portfolio_return_pct") or 0.0), 2),
        "aspi_return_pct": round(float(aspi.get("return_pct") or 0.0), 2),
        "sp20_return_pct": round(float(sp20.get("return_pct") or 0.0), 2),
        "alpha_vs_aspi_pct": round(float(comparison.get("portfolio_return_pct") or 0.0) - float(aspi.get("return_pct") or 0.0), 2),
        "alpha_vs_sp20_pct": round(float(comparison.get("portfolio_return_pct") or 0.0) - float(sp20.get("return_pct") or 0.0), 2),
        "series": merged_bench,
    }

    return {
        "days": days,
        "sector_allocation": sector_allocation,
        "top_gainers": top_gainers,
        "top_losers": top_losers,
        "diversification": diversification,
        "performance_breakdown": performance_breakdown,
        "dividend_summary": dividend_summary,
        "risk": risk,
        "benchmark": benchmark,
    }


def get_portfolio_period_performance(username: str, portfolio_id: Optional[str] = None) -> Dict[str, Any]:
    portfolio_id = _resolve_portfolio_id(username, portfolio_id)
    txs = _storage.list_portfolio_transactions(username, portfolio_id)
    days_needed = 1825
    if txs:
        dates = [str(tx.get("traded_at") or tx.get("created_at") or "")[:10] for tx in txs]
        dates = [d for d in dates if d]
        if dates:
            try:
                earliest = min(date.fromisoformat(d) for d in dates)
                days_needed = min(3650, max(30, (date.today() - earliest).days + 30))
            except Exception:
                pass
    series = get_portfolio_performance(username, days=days_needed, portfolio_id=portfolio_id).get("series") or []
    if not series:
        periods = []
    else:
        latest = series[-1]
        latest_date = date.fromisoformat(str(latest.get("date"))[:10])
        defs = [("1D", 1), ("1W", 7), ("1M", 30), ("3M", 90), ("6M", 180), ("1Y", 365), ("Since inception", None)]
        periods = []
        for label, delta_days in defs:
            if delta_days is None:
                start = series[0]
            else:
                cutoff = latest_date - timedelta(days=delta_days)
                eligible = [p for p in series if date.fromisoformat(str(p.get("date"))[:10]) <= cutoff]
                start = eligible[-1] if eligible else series[0]
            start_val = float(start.get("total_equity") or start.get("market_value") or 0.0)
            end_val = float(latest.get("total_equity") or latest.get("market_value") or 0.0)
            if abs(start_val) < 1e-9:
                start_ret = float(start.get("return_pct") or 0.0)
                end_ret = float(latest.get("return_pct") or 0.0)
                ret = end_ret - start_ret
            else:
                ret = _safe_pct(end_val - start_val, start_val)
            benchmark_days = delta_days or max(30, (latest_date - date.fromisoformat(str(start.get("date"))[:10])).days)
            aspi = _benchmark_series("ASPI", latest_date - timedelta(days=benchmark_days), benchmark_days + 1)
            sp20 = _benchmark_series("S&P SL20", latest_date - timedelta(days=benchmark_days), benchmark_days + 1)
            periods.append({
                "label": label,
                "start_date": start.get("date"),
                "end_date": latest.get("date"),
                "portfolio_return_pct": round(ret, 2),
                "aspi_return_pct": round(float(aspi.get("return_pct") or 0.0), 2),
                "sp20_return_pct": round(float(sp20.get("return_pct") or 0.0), 2),
                "alpha_vs_aspi_pct": round(ret - float(aspi.get("return_pct") or 0.0), 2),
                "alpha_vs_sp20_pct": round(ret - float(sp20.get("return_pct") or 0.0), 2),
            })
    return {"portfolio_id": portfolio_id, "periods": periods}




def _status_from_fit_score(score: float) -> str:
    if score >= 75:
        return "suitable"
    if score >= 60:
        return "watch"
    if score >= 40:
        return "need_attention"
    return "high_risk"


def _attention_label(label: str) -> str:
    return {
        "suitable": "Suitable",
        "watch": "Watch",
        "need_attention": "Need Attention",
        "high_risk": "High Risk",
    }.get(label, "Watch")


def _status_severity(label: str) -> str:
    return {
        "suitable": "low",
        "watch": "medium",
        "need_attention": "high",
        "high_risk": "critical",
    }.get(label, "medium")


def _position_price_risk(symbol: str) -> Dict[str, Any]:
    rows = _storage.get_price_history(symbol.upper(), limit=140)
    closes = [float(_to_float(row.get("close")) or 0.0) for row in rows if _to_float(row.get("close")) is not None and float(_to_float(row.get("close")) or 0) > 0]
    vols = [float(_to_float(row.get("volume")) or 0.0) for row in rows if _to_float(row.get("volume")) is not None]
    returns = []
    for prev, curr in zip(closes, closes[1:]):
        if prev > 0:
            returns.append((curr / prev) - 1.0)
    volatility = 0.0
    if len(returns) > 2:
        try:
            volatility = statistics.stdev(returns) * math.sqrt(252) * 100.0
        except statistics.StatisticsError:
            volatility = 0.0
    drawdown = 0.0
    if closes:
        peak = max(closes)
        if peak > 0:
            drawdown = (closes[-1] / peak - 1.0) * 100.0
    avg_volume = sum(vols[-30:]) / max(1, len(vols[-30:])) if vols else 0.0
    risk_points = 0.0
    reasons: List[str] = []
    if volatility >= 45:
        risk_points += 22
        reasons.append(f"High annualized volatility around {volatility:.1f}%")
    elif volatility >= 28:
        risk_points += 12
        reasons.append(f"Moderate volatility around {volatility:.1f}%")
    if drawdown <= -25:
        risk_points += 18
        reasons.append(f"Large drawdown from recent high ({drawdown:.1f}%)")
    elif drawdown <= -12:
        risk_points += 9
        reasons.append(f"Recent price drawdown is {drawdown:.1f}%")
    if avg_volume > 0 and avg_volume < 2500:
        risk_points += 12
        reasons.append("Low recent trading volume may make exits harder")
    return {"volatility_pct": round(volatility, 2), "drawdown_pct": round(drawdown, 2), "avg_volume_30d": round(avg_volume, 0), "risk_points": risk_points, "reasons": reasons}


def _symbol_sentiment_risk(symbol: str) -> Dict[str, Any]:
    try:
        rows = _storage.get_news_sentiment(symbol=symbol.upper(), limit=30)
    except Exception:
        rows = []
    if not rows:
        return {"score_30d": 0.0, "impact_30d": 0.0, "negative_count": 0, "risk_points": 0.0, "reasons": []}
    scores = [float(row.get("sentiment_score") or 0.0) for row in rows]
    impact = sum(float(row.get("impact_score") or 0.0) for row in rows[:30])
    negative_count = sum(1 for row in rows[:30] if str(row.get("sentiment_label") or "").lower() == "negative")
    risk_points = 0.0
    reasons: List[str] = []
    avg_score = sum(scores[:30]) / max(1, len(scores[:30]))
    if avg_score <= -0.25:
        risk_points += 18
        reasons.append("Recent official/news sentiment is negative")
    elif avg_score <= -0.08:
        risk_points += 8
        reasons.append("Recent sentiment has weakened")
    if negative_count >= 2:
        risk_points += 10
        reasons.append(f"{negative_count} negative sentiment items were detected recently")
    if impact >= 3.0 and avg_score < 0:
        risk_points += 8
        reasons.append("High-impact negative events require attention")
    return {"score_30d": round(avg_score, 4), "impact_30d": round(impact, 4), "negative_count": negative_count, "risk_points": risk_points, "reasons": reasons}


def _cash_management(summary: Dict[str, Any], risk_score: float = 50.0) -> Dict[str, Any]:
    total_equity = float(summary.get("total_equity") or 0.0)
    cash_balance = float(summary.get("cash_balance") or 0.0)
    cash_pct = _safe_pct(cash_balance, total_equity) if total_equity > 0 else 0.0
    target_min = 5.0
    target_max = 20.0
    if risk_score >= 70:
        target_min = 10.0
        target_max = 25.0
    elif risk_score <= 35:
        target_min = 3.0
        target_max = 18.0
    reasons: List[str] = []
    suggestions: List[str] = []
    if cash_balance < 0:
        label = "cash_deficit"
        score = 15
        reasons.append("Cash balance is negative after recorded trades and withdrawals")
        suggestions.append("Add a deposit or review transaction/cash entries before adding more buys")
    elif cash_pct < target_min:
        label = "low_cash"
        score = max(25, 55 - (target_min - cash_pct) * 5)
        reasons.append(f"Cash is only {cash_pct:.1f}% of total equity")
        suggestions.append(f"Keep at least {target_min:.0f}% cash buffer for flexibility and risk control")
    elif cash_pct > 35:
        label = "high_idle_cash"
        score = 66
        reasons.append(f"Cash is high at {cash_pct:.1f}% of total equity")
        suggestions.append("Review whether idle cash should be deployed gradually or kept for your strategy")
    elif cash_pct > target_max:
        label = "above_target_cash"
        score = 78
        reasons.append(f"Cash is above the suggested range at {cash_pct:.1f}%")
        suggestions.append("Consider staged entry plans instead of deploying all cash at once")
    else:
        label = "healthy_cash"
        score = 92
        reasons.append(f"Cash buffer is within the suggested range ({cash_pct:.1f}%)")
        suggestions.append("Cash level looks suitable for normal portfolio flexibility")
    recommended_min_cash = total_equity * target_min / 100.0
    recommended_max_cash = total_equity * target_max / 100.0
    return {
        "label": label,
        "score": round(float(score), 0),
        "cash_balance": round(cash_balance, 2),
        "cash_pct": round(cash_pct, 2),
        "target_min_pct": target_min,
        "target_max_pct": target_max,
        "recommended_min_cash": round(recommended_min_cash, 2),
        "recommended_max_cash": round(recommended_max_cash, 2),
        "reasons": reasons,
        "suggestions": suggestions,
    }


def _score_holding(symbol: str, company: str, sector: str, weight_pct: float, sector_weight_pct: float, unrealized_pct: float, *, cash_after_trade: Optional[float] = None, trade_context: bool = False) -> Dict[str, Any]:
    score = 88.0
    risk_score = 15.0
    reasons: List[str] = []
    suggestions: List[str] = []
    if weight_pct >= 30:
        score -= 32
        risk_score += 34
        reasons.append(f"Single-stock exposure would be very high at {weight_pct:.1f}%")
        suggestions.append("Reduce quantity or split capital across more holdings")
    elif weight_pct >= 22:
        score -= 22
        risk_score += 24
        reasons.append(f"Single-stock exposure is high at {weight_pct:.1f}%")
        suggestions.append("Keep this holding below roughly 15–20% unless it is a deliberate high-conviction allocation")
    elif weight_pct >= 15:
        score -= 10
        risk_score += 12
        reasons.append(f"Stock weight is becoming meaningful at {weight_pct:.1f}%")
        suggestions.append("Monitor concentration if adding more later")
    else:
        reasons.append(f"Single-stock exposure is manageable at {weight_pct:.1f}%")
    if sector_weight_pct >= 50:
        score -= 25
        risk_score += 28
        reasons.append(f"Sector exposure would be very concentrated at {sector_weight_pct:.1f}%")
        suggestions.append("Balance this with holdings from other sectors")
    elif sector_weight_pct >= 38:
        score -= 16
        risk_score += 18
        reasons.append(f"Sector exposure is high at {sector_weight_pct:.1f}%")
        suggestions.append("Avoid adding too much more to the same sector")
    elif sector_weight_pct >= 28:
        score -= 7
        risk_score += 8
        reasons.append(f"Sector exposure is moderate at {sector_weight_pct:.1f}%")
    if unrealized_pct <= -20:
        score -= 12
        risk_score += 12
        reasons.append(f"Holding has a large unrealized loss ({unrealized_pct:.1f}%)")
        suggestions.append("Review thesis, stop-loss, and latest disclosures before increasing exposure")
    elif unrealized_pct <= -10:
        score -= 6
        risk_score += 6
        reasons.append(f"Holding is down {unrealized_pct:.1f}% from cost")
    price_risk = _position_price_risk(symbol)
    sentiment_risk = _symbol_sentiment_risk(symbol)
    score -= float(price_risk.get("risk_points") or 0.0)
    risk_score += float(price_risk.get("risk_points") or 0.0)
    reasons.extend(price_risk.get("reasons") or [])
    score -= float(sentiment_risk.get("risk_points") or 0.0)
    risk_score += float(sentiment_risk.get("risk_points") or 0.0)
    reasons.extend(sentiment_risk.get("reasons") or [])
    if cash_after_trade is not None and cash_after_trade < 0:
        score -= 28
        risk_score += 30
        reasons.append("This trade would make portfolio cash negative")
        suggestions.append("Record a deposit first or reduce trade size")
    if not suggestions and score >= 75:
        suggestions.append("Position looks suitable, but keep monitoring reports, sentiment and allocation")
    elif score < 60 and not any("Reduce" in s or "review" in s.lower() for s in suggestions):
        suggestions.append("Review this position before adding more capital")
    label = _status_from_fit_score(max(0.0, min(100.0, score)))
    return {
        "symbol": symbol.upper(),
        "company": company or symbol.upper(),
        "sector": sector or "Unclassified",
        "status": label,
        "status_label": _attention_label(label),
        "severity": _status_severity(label),
        "fit_score": round(max(0.0, min(100.0, score)), 0),
        "risk_score": round(max(0.0, min(100.0, risk_score)), 0),
        "weight_pct": round(weight_pct, 2),
        "sector_weight_pct": round(sector_weight_pct, 2),
        "volatility_pct": price_risk.get("volatility_pct", 0.0),
        "drawdown_pct": price_risk.get("drawdown_pct", 0.0),
        "sentiment_score_30d": sentiment_risk.get("score_30d", 0.0),
        "negative_sentiment_count": sentiment_risk.get("negative_count", 0),
        "reasons": reasons[:8],
        "suggestions": suggestions[:6],
        "trade_context": trade_context,
    }


def get_portfolio_intelligence(username: str, portfolio_id: Optional[str] = None) -> Dict[str, Any]:
    portfolio_id = _resolve_portfolio_id(username, portfolio_id)
    portfolio = get_portfolio(username, portfolio_id)
    analytics = get_portfolio_analytics(username, portfolio_id=portfolio_id)
    positions = portfolio.get("positions") or []
    summary = portfolio.get("summary") or {}
    sector_weights = {str(item.get("sector") or "Unclassified"): float(item.get("weight_pct") or 0.0) for item in analytics.get("sector_allocation") or []}
    holdings = []
    for pos in positions:
        sector = str(pos.get("sector") or "Unclassified")
        holdings.append(_score_holding(
            str(pos.get("symbol") or ""),
            str(pos.get("company") or pos.get("symbol") or ""),
            sector,
            float(pos.get("weight_pct") or 0.0),
            float(sector_weights.get(sector, 0.0)),
            float(pos.get("unrealized_pl_pct") or 0.0),
        ))
    risk_score = float((analytics.get("risk") or {}).get("score") or 0.0)
    cash = _cash_management(summary, risk_score=risk_score)
    attention = [item for item in holdings if item.get("status") in {"need_attention", "high_risk"}]
    watch = [item for item in holdings if item.get("status") == "watch"]
    diversification_score = float((analytics.get("diversification") or {}).get("score") or 0.0)
    cash_score = float(cash.get("score") or 0.0)
    attention_penalty = min(25.0, len(attention) * 8.0 + len(watch) * 3.0)
    benchmark = analytics.get("benchmark") or {}
    alpha = float(benchmark.get("alpha_vs_aspi_pct") or 0.0)
    alpha_score = max(0.0, min(100.0, 55.0 + alpha * 2.0))
    health_score = round(max(0.0, min(100.0, 0.34 * diversification_score + 0.24 * (100.0 - risk_score) + 0.22 * cash_score + 0.10 * alpha_score + 0.10 * max(0.0, 100.0 - attention_penalty))))
    health_label = _score_label(health_score, bands=(45, 70), labels=("Needs attention", "Healthy", "Strong"))
    suggestions: List[str] = []
    if attention:
        suggestions.append(f"Review {len(attention)} holding(s) marked Need Attention or High Risk")
    if cash.get("label") in {"cash_deficit", "low_cash"}:
        suggestions.extend(cash.get("suggestions") or [])
    largest = (analytics.get("diversification") or {}).get("largest_position_pct") or 0
    if float(largest or 0) >= 22:
        suggestions.append("Reduce single-stock concentration before adding more to the largest holding")
    largest_sector = (analytics.get("risk") or {}).get("largest_sector_pct") or 0
    if float(largest_sector or 0) >= 38:
        suggestions.append("Avoid adding more to the largest sector until allocation is more balanced")
    if not suggestions:
        suggestions.append("Portfolio looks manageable. Keep monitoring cash, concentration, news and disclosures")
    return {
        "portfolio_id": portfolio_id,
        "health": {"score": health_score, "label": health_label, "attention_count": len(attention), "watch_count": len(watch)},
        "cash_management": cash,
        "holdings": holdings,
        "attention_items": attention[:10],
        "suggestions": suggestions[:8],
        "thresholds": {"single_stock_watch_pct": 15, "single_stock_attention_pct": 22, "single_stock_high_risk_pct": 30, "sector_attention_pct": 38, "sector_high_risk_pct": 50},
    }


def preview_trade_fit(username: str, payload: Dict[str, Any], portfolio_id: Optional[str] = None) -> Dict[str, Any]:
    portfolio_id = _resolve_portfolio_id(username, portfolio_id or payload.get("portfolio_id"))
    clean = _validate_portfolio_transaction_payload(payload)
    portfolio = get_portfolio(username, portfolio_id)
    summary = portfolio.get("summary") or {}
    positions = portfolio.get("positions") or []
    symbol = clean["symbol"].upper()
    trade_value = float(clean["quantity"]) * float(clean["price"]) + float(clean.get("fees") or 0.0)
    if clean["tx_type"] == "sell":
        trade_value = -1.0 * (float(clean["quantity"]) * float(clean["price"]) - float(clean.get("fees") or 0.0))
    current_market_value = float(summary.get("market_value") or 0.0)
    total_equity = float(summary.get("total_equity") or 0.0)
    cash_balance = float(summary.get("cash_balance") or 0.0)
    snapshots = {item.get("symbol"): item for item in stock_snapshots([symbol])}
    snap = snapshots.get(symbol) or {}
    company = snap.get("name") or symbol
    sector = snap.get("sector") or (_storage.get_company(symbol) or {}).get("sector") or "Unclassified"
    existing = next((item for item in positions if str(item.get("symbol") or "").upper() == symbol), None)
    existing_market = float((existing or {}).get("market_value") or 0.0)
    existing_unreal = float((existing or {}).get("unrealized_pl_pct") or 0.0)
    if clean["tx_type"] == "buy":
        new_symbol_market = existing_market + trade_value
        new_market_value = current_market_value + trade_value
        cash_after = cash_balance - trade_value
    else:
        sell_value = abs(trade_value)
        new_symbol_market = max(0.0, existing_market - sell_value)
        new_market_value = max(0.0, current_market_value - sell_value)
        cash_after = cash_balance + sell_value
    new_total_equity = max(0.0, total_equity - float(clean.get("fees") or 0.0)) if total_equity > 0 else max(new_market_value + cash_after, 0.0)
    denominator = new_total_equity if new_total_equity > 0 else max(new_market_value, 1.0)
    new_stock_weight = _safe_pct(new_symbol_market, denominator)
    old_sector_value = sum(float(item.get("market_value") or 0.0) for item in positions if str(item.get("sector") or "Unclassified") == sector)
    if clean["tx_type"] == "buy":
        new_sector_value = old_sector_value + trade_value
    else:
        new_sector_value = max(0.0, old_sector_value - abs(trade_value))
    new_sector_weight = _safe_pct(new_sector_value, denominator)
    scoring = _score_holding(symbol, str(company), str(sector), new_stock_weight, new_sector_weight, existing_unreal, cash_after_trade=cash_after, trade_context=True)
    cash_eval = _cash_management({"cash_balance": cash_after, "total_equity": denominator}, risk_score=float(scoring.get("risk_score") or 50.0))
    return {
        "portfolio_id": portfolio_id,
        "symbol": symbol,
        "tx_type": clean["tx_type"],
        "trade_value": round(abs(trade_value), 2),
        "cash_before": round(cash_balance, 2),
        "cash_after": round(cash_after, 2),
        "current_stock_weight_pct": round(_safe_pct(existing_market, max(total_equity, 1.0)), 2),
        "new_stock_weight_pct": round(new_stock_weight, 2),
        "new_sector_weight_pct": round(new_sector_weight, 2),
        "status": scoring.get("status"),
        "status_label": scoring.get("status_label"),
        "fit_score": scoring.get("fit_score"),
        "risk_score": scoring.get("risk_score"),
        "reasons": scoring.get("reasons") or [],
        "suggestions": list(dict.fromkeys((scoring.get("suggestions") or []) + (cash_eval.get("suggestions") or [])))[:8],
        "cash_management": cash_eval,
    }

def create_portfolio_transaction(username: str, payload: Dict[str, Any], portfolio_id: Optional[str] = None) -> Dict[str, Any]:
    portfolio_id = _resolve_portfolio_id(username, portfolio_id or payload.get("portfolio_id"))
    clean = _validate_portfolio_transaction_payload(payload)
    current_rows = _storage.list_portfolio_transactions(username, portfolio_id)
    next_rows = list(current_rows) + [clean]
    _validate_portfolio_sequence(next_rows)
    _storage.create_portfolio_transaction(username, clean["symbol"], clean["tx_type"], clean["quantity"], clean["price"], fees=clean["fees"], traded_at=clean["traded_at"], notes=clean["notes"], portfolio_id=portfolio_id)
    return get_portfolio(username, portfolio_id)


def update_portfolio_transaction(username: str, tx_id: str, payload: Dict[str, Any], portfolio_id: Optional[str] = None) -> Dict[str, Any]:
    portfolio_id = _resolve_portfolio_id(username, portfolio_id or payload.get("portfolio_id"))
    clean = _validate_portfolio_transaction_payload(payload)
    current_rows = _storage.list_portfolio_transactions(username, portfolio_id)
    found = False
    next_rows: List[Dict[str, Any]] = []
    for row in current_rows:
        current_id = str(row.get("tx_id") or row.get("id") or "")
        if current_id == tx_id:
            found = True
            replacement = dict(row)
            replacement.update(clean)
            replacement["tx_id"] = tx_id
            replacement["portfolio_id"] = portfolio_id
            next_rows.append(replacement)
        else:
            next_rows.append(dict(row))
    if not found:
        raise HTTPException(status_code=404, detail="Portfolio transaction not found")
    _validate_portfolio_sequence(next_rows)
    updated = _storage.update_portfolio_transaction(tx_id, username, clean["symbol"], clean["tx_type"], clean["quantity"], clean["price"], fees=clean["fees"], traded_at=clean["traded_at"], notes=clean["notes"], portfolio_id=portfolio_id)
    if not updated:
        raise HTTPException(status_code=404, detail="Portfolio transaction not found")
    return get_portfolio(username, portfolio_id)


def delete_portfolio_transaction(username: str, tx_id: str, portfolio_id: Optional[str] = None) -> Dict[str, Any]:
    portfolio_id = _resolve_portfolio_id(username, portfolio_id)
    if not _storage.delete_portfolio_transaction(tx_id, username, portfolio_id=portfolio_id):
        raise HTTPException(status_code=404, detail="Portfolio transaction not found")
    return get_portfolio(username, portfolio_id)


def _normalize_tx_type_token(raw: Any) -> str:
    token = str(raw or "buy").strip().lower()
    mapping = {
        "b": "buy", "buy": "buy", "bought": "buy", "purchase": "buy", "trade buy": "buy",
        "s": "sell", "sell": "sell", "sold": "sell", "dispose": "sell", "trade sell": "sell",
    }
    return mapping.get(token, token)


def _detect_broker_statement(file_name: str, headers: List[str]) -> Dict[str, Any]:
    normalized = {str(h or '').strip().lower().replace(' ', '_') for h in headers}
    name = (file_name or '').lower()
    broker = None
    fmt = 'generic_csv'
    if {'symbol', 'quantity', 'price'}.issubset(normalized):
        fmt = 'tradexalk_generic'
    if {'trade_date', 'settlement_date', 'side', 'rate'}.intersection(normalized):
        fmt = 'broker_statement'
    if 'reference_no' in normalized or 'contract_no' in normalized or 'contract note' in name:
        fmt = 'contract_note'
    if 'cdax' in name or 'central depository' in name:
        broker = 'CDAX'
    if 'softlogic' in name:
        broker = 'Softlogic Stockbrokers'
    elif 'sampath' in name:
        broker = 'Sampath Securities'
    elif 'capital' in name and 'trust' in name:
        broker = 'CT CLSA / Capital Alliance'
    elif 'asia securities' in name or 'asiasecurities' in name:
        broker = 'Asia Securities'
    elif 'first capital' in name:
        broker = 'First Capital'
    elif 'ndb' in name:
        broker = 'NDB Securities'
    return {'format': fmt, 'broker': broker or 'Detected automatically'}


def _parse_portfolio_csv_with_meta(file: UploadFile) -> Tuple[List[Dict[str, Any]], Dict[str, Any]]:
    if hasattr(file.file, "seek"):
        file.file.seek(0)
    payload = file.file.read()
    text = payload.decode("utf-8", errors="replace") if isinstance(payload, (bytes, bytearray)) else str(payload)
    reader = csv.DictReader(io.StringIO(text))
    headers = list(reader.fieldnames or [])
    meta = _detect_broker_statement(file.filename or '', headers)
    rows: List[Dict[str, Any]] = []
    for row in reader:
        symbol = str(row.get("symbol") or row.get("Symbol") or row.get("ticker") or row.get("Ticker") or row.get("instrument") or row.get("Instrument") or row.get("security") or row.get("Security") or "").upper().strip()
        tx_type = _normalize_tx_type_token(row.get("tx_type") or row.get("type") or row.get("Type") or row.get("side") or row.get("Side") or row.get("transaction_type") or row.get("Transaction Type"))
        quantity = _to_float(row.get("quantity") or row.get("Quantity") or row.get("qty") or row.get("Qty") or row.get("trade_qty") or row.get("Trade Qty") or row.get("executed_qty") or row.get("Executed Qty"))
        price = _to_float(row.get("price") or row.get("Price") or row.get("rate") or row.get("Rate") or row.get("avg_price") or row.get("Average Price") or row.get("trade_price") or row.get("Trade Price"))
        fees = _to_float(row.get("fees") or row.get("Fees") or row.get("commission") or row.get("Commission") or row.get("charges") or row.get("Charges") or row.get("brokerage") or row.get("Brokerage") or 0)
        traded_at = str(row.get("traded_at") or row.get("trade_date") or row.get("Trade Date") or row.get("date") or row.get("Date") or row.get("contract_date") or row.get("Contract Date") or "").strip() or None
        notes_parts = []
        for key in ("notes", "Notes", "reference_no", "Reference No", "contract_no", "Contract No"):
            val = str(row.get(key) or '').strip()
            if val:
                notes_parts.append(f"{key}: {val}")
        rows.append({
            "symbol": symbol,
            "tx_type": tx_type,
            "quantity": quantity,
            "price": price,
            "fees": fees,
            "traded_at": traded_at,
            "notes": " | ".join(notes_parts) or None,
        })
    meta['headers'] = headers
    meta['rows'] = len(rows)
    return rows, meta


def _parse_portfolio_csv(file: UploadFile) -> List[Dict[str, Any]]:
    rows, _ = _parse_portfolio_csv_with_meta(file)
    return rows


def preview_portfolio_import(file: UploadFile) -> Dict[str, Any]:
    rows, detected = _parse_portfolio_csv_with_meta(file)
    valid_rows: List[Dict[str, Any]] = []
    errors: List[Dict[str, Any]] = []
    for idx, row in enumerate(rows, start=2):
        try:
            clean = _validate_portfolio_transaction_payload(row)
            valid_rows.append(clean)
        except HTTPException as exc:
            errors.append({"row": idx, "error": exc.detail, "symbol": row.get("symbol")})
    preview = {
        "file": file.filename,
        "rows": len(rows),
        "valid_rows": len(valid_rows),
        "invalid_rows": len(errors),
        "symbols": sorted({str(item.get("symbol") or "") for item in valid_rows if item.get("symbol")}),
        "sample": valid_rows[:20],
        "errors": errors[:50],
        "detected_format": detected.get("format"),
        "detected_broker": detected.get("broker"),
        "headers": detected.get("headers") or [],
    }
    return {"ok": len(errors) == 0, "preview": preview}


def import_portfolio_transactions(username: str, file: UploadFile, portfolio_id: Optional[str] = None) -> Dict[str, Any]:
    portfolio_id = _resolve_portfolio_id(username, portfolio_id)
    preview = preview_portfolio_import(file)
    valid_rows = list(preview.get("preview", {}).get("sample") or [])
    if preview.get("preview", {}).get("valid_rows") != len(valid_rows):
        rows = _parse_portfolio_csv(file)
        valid_rows = []
        for row in rows:
            try:
                valid_rows.append(_validate_portfolio_transaction_payload(row))
            except HTTPException:
                pass
    if preview.get("preview", {}).get("invalid_rows"):
        raise HTTPException(status_code=400, detail="Fix invalid rows before importing portfolio transactions")
    existing = _storage.list_portfolio_transactions(username, portfolio_id)
    next_rows = list(existing) + valid_rows
    _validate_portfolio_sequence(next_rows)
    imported = 0
    for row in valid_rows:
        _storage.create_portfolio_transaction(username, row["symbol"], row["tx_type"], row["quantity"], row["price"], fees=row["fees"], traded_at=row["traded_at"], notes=row["notes"], portfolio_id=portfolio_id)
        imported += 1
    result = get_portfolio(username, portfolio_id)
    result["imported_rows"] = imported
    return result



# ---- Alerts / Notifications / Announcement logic ----
import smtplib
from email.message import EmailMessage
from urllib import request as urllib_request

ALERT_TYPES = {"above_price", "below_price", "pct_move", "volume_spike", "important_announcement", "reminder"}
ALERT_TYPE_ALIASES = {
    "above": "above_price",
    "price_above": "above_price",
    "price-up": "above_price",
    "below": "below_price",
    "price_below": "below_price",
    "price-down": "below_price",
    "percentage_move": "pct_move",
    "%move": "pct_move",
    "move_pct": "pct_move",
    "move": "pct_move",
    "volume": "volume_spike",
    "announcement": "important_announcement",
    "important-announcement": "important_announcement",
}

NOTIFICATION_DEFAULTS = {
    "theme": "dark",
    "default_timeframe": "6M",
    "email_notifications": False,
    "push_notifications": False,
    "alert_notifications": True,
    "announcement_notifications": True,
    "market_status_notifications": True,
    "watchlist_notifications": False,
    "email_alert_notifications": True,
    "email_announcement_notifications": True,
    "email_market_status_notifications": False,
    "email_watchlist_notifications": False,
    "push_alert_notifications": True,
    "push_announcement_notifications": True,
    "push_market_status_notifications": False,
    "push_watchlist_notifications": False,
    "push_webhook_url": "",
    "notification_email": "",
}


def _normalize_setting_value(key: str, value: Any) -> Any:
    bool_keys = {
        "email_notifications", "push_notifications", "alert_notifications", "announcement_notifications",
        "market_status_notifications", "watchlist_notifications", "email_alert_notifications",
        "email_announcement_notifications", "email_market_status_notifications", "email_watchlist_notifications",
        "push_alert_notifications", "push_announcement_notifications", "push_market_status_notifications",
        "push_watchlist_notifications",
    }
    if key in bool_keys:
        if isinstance(value, bool):
            return value
        return str(value).strip().lower() in {"1", "true", "yes", "on"}
    return value


def _category_pref_key(category: str) -> str:
    cat = str(category or "system").lower()
    if cat in {"alert", "price_alert"}:
        return "alert_notifications"
    if cat in {"announcement", "document", "report"}:
        return "announcement_notifications"
    if cat in {"market", "market_status", "job"}:
        return "market_status_notifications"
    if cat in {"watchlist"}:
        return "watchlist_notifications"
    return ""


def _channel_category_pref_key(channel: str, category: str) -> str:
    cat = str(category or "system").lower()
    prefix = "email" if channel == "email" else "push"
    if cat in {"alert", "price_alert"}:
        return f"{prefix}_alert_notifications"
    if cat in {"announcement", "document", "report"}:
        return f"{prefix}_announcement_notifications"
    if cat in {"market", "market_status", "job"}:
        return f"{prefix}_market_status_notifications"
    if cat in {"watchlist"}:
        return f"{prefix}_watchlist_notifications"
    return ""


def _notification_preferences(username: str) -> Dict[str, Any]:
    prefs = get_user_settings(username).get("settings") or {}
    merged = dict(NOTIFICATION_DEFAULTS)
    merged.update(prefs)
    return merged


def _notification_allowed(username: str, category: str) -> bool:
    prefs = _notification_preferences(username)
    key = _category_pref_key(category)
    return bool(prefs.get(key, True)) if key else True


def _notification_channel_allowed(username: str, category: str, channel: str) -> bool:
    prefs = _notification_preferences(username)
    if channel == "email":
        if not bool(prefs.get("email_notifications", False)):
            return False
    elif channel == "push":
        if not bool(prefs.get("push_notifications", False)):
            return False
    else:
        return False
    key = _channel_category_pref_key(channel, category)
    return bool(prefs.get(key, True)) if key else True


def _notification_delivery_targets(username: str, category: str) -> Dict[str, Any]:
    prefs = _notification_preferences(username)
    user = _storage.get_user(username) or {}
    email_target = str(prefs.get("notification_email") or user.get("email") or "").strip()
    push_target = str(prefs.get("push_webhook_url") or "").strip()
    return {
        "email": email_target if _notification_channel_allowed(username, category, "email") and email_target else None,
        "push": push_target if _notification_channel_allowed(username, category, "push") and push_target else None,
    }


def _send_email_notification(username: str, notification: Dict[str, Any], recipient: str) -> Tuple[bool, str]:
    if not settings.smtp_host:
        return False, "SMTP is not configured"
    if not recipient:
        return False, "Recipient email is missing"
    msg = EmailMessage()
    msg["Subject"] = str(notification.get("title") or "TradexaLK notification")
    msg["From"] = settings.smtp_from_email
    msg["To"] = recipient
    body = str(notification.get("message") or "")
    if notification.get("link"):
        body += f"\n\nLink: {notification.get('link')}"
    msg.set_content(body or "TradexaLK notification")
    with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=20) as server:
        if settings.smtp_use_tls:
            server.starttls()
        if settings.smtp_username:
            server.login(settings.smtp_username, settings.smtp_password)
        server.send_message(msg)
    return True, "sent"


def _send_push_notification(username: str, notification: Dict[str, Any], webhook_url: str) -> Tuple[bool, str]:
    if not webhook_url:
        return False, "Push webhook URL is missing"
    payload = json.dumps({
        "username": username,
        "title": notification.get("title"),
        "message": notification.get("message"),
        "link": notification.get("link"),
        "symbol": notification.get("symbol"),
        "severity": notification.get("severity"),
        "category": notification.get("category"),
    }).encode("utf-8")
    req = urllib_request.Request(webhook_url, data=payload, headers={"Content-Type": "application/json"}, method="POST")
    with urllib_request.urlopen(req, timeout=10) as resp:  # nosec - admin/user configured webhook only
        if int(getattr(resp, "status", 200)) >= 300:
            return False, f"Push endpoint returned {getattr(resp, 'status', 0)}"
    return True, "sent"


def _find_notification(username: str, notification_id: str) -> Optional[Dict[str, Any]]:
    for item in _storage.list_notifications(username):
        if str(item.get("notification_id")) == str(notification_id):
            return item
    return None


def process_notification_dispatch_queue(limit: int = 100) -> Dict[str, Any]:
    due = _storage.get_due_notification_dispatches(limit=limit)
    processed = sent = failed = skipped = 0
    retry_limit = max(1, int(_to_float(_system_setting("maxRetries", 3)) or 3))
    for item in due:
        processed += 1
        queue_id = str(item.get("queue_id") or "")
        username = str(item.get("username") or "")
        channel = str(item.get("channel") or "")
        attempts = int(item.get("attempts") or 0) + 1
        notification = _find_notification(username, str(item.get("notification_id") or ""))
        if not notification:
            _storage.update_notification_dispatch(queue_id, status="failed", attempts=attempts, error="Notification no longer exists")
            failed += 1
            continue
        try:
            targets = _notification_delivery_targets(username, str(notification.get("category") or "system"))
            if channel == "email":
                ok, msg = _send_email_notification(username, notification, str(targets.get("email") or ""))
            elif channel == "push":
                ok, msg = _send_push_notification(username, notification, str(targets.get("push") or ""))
            else:
                ok, msg = False, f"Unsupported channel: {channel}"
            if ok:
                _storage.update_notification_dispatch(queue_id, status="sent", attempts=attempts, sent_at=datetime.now().astimezone().astimezone().replace(microsecond=0).isoformat(), error=None)
                sent += 1
            else:
                if "missing" in msg.lower() or "not configured" in msg.lower():
                    _storage.update_notification_dispatch(queue_id, status="skipped", attempts=attempts, error=msg)
                    skipped += 1
                elif attempts >= retry_limit:
                    _storage.update_notification_dispatch(queue_id, status="failed", attempts=attempts, error=msg)
                    failed += 1
                else:
                    retry_at = (datetime.now().astimezone().replace(microsecond=0) + timedelta(minutes=5 * attempts)).isoformat()
                    _storage.update_notification_dispatch(queue_id, status="retry", attempts=attempts, next_attempt_at=retry_at, error=msg)
        except Exception as exc:
            if attempts >= retry_limit:
                _storage.update_notification_dispatch(queue_id, status="failed", attempts=attempts, error=str(exc))
                failed += 1
            else:
                retry_at = (datetime.now().astimezone().replace(microsecond=0) + timedelta(minutes=5 * attempts)).isoformat()
                _storage.update_notification_dispatch(queue_id, status="retry", attempts=attempts, next_attempt_at=retry_at, error=str(exc))
    return {"processed": processed, "sent": sent, "failed": failed, "skipped": skipped}


def evaluate_all_users_alerts(limit_users: Optional[int] = None) -> Dict[str, Any]:
    users = _storage.list_users()
    if limit_users:
        users = users[:limit_users]
    total_users = 0
    total_triggered = 0
    for user in users:
        uname = str(user.get("username") or "")
        if not uname:
            continue
        total_users += 1
        total_triggered += len(evaluate_alerts(uname))
    return {"users": total_users, "triggered": total_triggered}


def _ensure_notification(username: str, category: str, title: str, message: str, *, symbol: Optional[str] = None, severity: str = "info", link: Optional[str] = None, dedupe_key: Optional[str] = None, meta: Optional[Dict[str, Any]] = None) -> Optional[Dict[str, Any]]:
    if not _notification_allowed(username, category):
        return None
    existing = _storage.list_notifications(username)
    if dedupe_key:
        for n in existing:
            n_meta = n.get("meta") or {}
            if n_meta.get("dedupe_key") == dedupe_key:
                return n
    payload = dict(meta or {})
    if dedupe_key:
        payload["dedupe_key"] = dedupe_key
    channels = _notification_delivery_targets(username, category)
    payload.setdefault("channels", {
        "in_app": True,
        "email": bool(channels.get("email")),
        "push": bool(channels.get("push")),
    })
    created = _storage.create_notification(username, category, title, message, symbol=symbol, severity=severity, link=link, meta=payload)
    delay_minutes = max(0, int(_to_float(_system_setting("notificationDelay", 5)) or 5))
    next_attempt_at = (datetime.now().astimezone().replace(microsecond=0) + timedelta(minutes=delay_minutes)).isoformat()
    if channels.get("email"):
        _storage.enqueue_notification_delivery(username, created["notification_id"], "email", payload={"recipient": channels.get("email")}, next_attempt_at=next_attempt_at)
    if channels.get("push"):
        _storage.enqueue_notification_delivery(username, created["notification_id"], "push", payload={"webhook_url": channels.get("push")}, next_attempt_at=next_attempt_at)
    return created


def _latest_close_and_prev(symbol: str) -> Tuple[Optional[float], Optional[float], Optional[float], Optional[str]]:
    hist = _storage.get_price_history(symbol.upper(), limit=21)
    if not hist:
        return None, None, None, None
    latest_row = hist[-1]
    latest = _to_float(latest_row.get("close"))
    prev = _to_float(hist[-2].get("close")) if len(hist) >= 2 else None
    latest_date = str(latest_row.get("date") or "")[:10] or None
    avg_vol = None
    vols = [_to_float(r.get("volume")) for r in hist[-20:] if _to_float(r.get("volume")) is not None]
    if vols:
        avg_vol = sum(vols) / len(vols)
    return latest, prev, avg_vol, latest_date


def _parse_alert_payload(payload: Dict[str, Any]) -> Tuple[Optional[str], str, Optional[float], Dict[str, Any]]:
    raw_type = str(payload.get("alert_type") or payload.get("condition") or "above_price").strip().lower()
    alert_type = ALERT_TYPE_ALIASES.get(raw_type, raw_type)
    if alert_type not in ALERT_TYPES:
        raise HTTPException(status_code=400, detail="Unsupported alert type")
    symbol = str(payload.get("symbol") or "").strip().upper() or None
    if alert_type not in {"important_announcement", "reminder"} and not symbol:
        raise HTTPException(status_code=400, detail="Symbol is required for this alert type")
    raw_target = payload.get("target_value", payload.get("targetPrice"))
    target = _to_float(raw_target)
    if alert_type in {"above_price", "below_price", "pct_move", "volume_spike"} and target is None:
        raise HTTPException(status_code=400, detail="Target value is required")
    if alert_type in {"above_price", "below_price"} and (target is None or target <= 0):
        raise HTTPException(status_code=400, detail="Price target must be greater than 0")
    if alert_type == "pct_move" and (target is None or target <= 0):
        raise HTTPException(status_code=400, detail="Percentage move must be greater than 0")
    if alert_type == "volume_spike" and (target is None or target < 1):
        raise HTTPException(status_code=400, detail="Volume spike multiple must be at least 1")
    meta = payload.get("meta") if isinstance(payload.get("meta"), dict) else {}
    meta = dict(meta or {})
    if "recurring" in payload:
        meta["recurring"] = bool(payload.get("recurring"))
    meta["recurring"] = bool(meta.get("recurring", False))
    cooldown_value = int(_to_float(payload.get("cooldown_minutes") or meta.get("cooldown_minutes") or 1440) or 1440)
    meta["cooldown_minutes"] = max(1, min(10080, cooldown_value))
    meta["created_from"] = str(payload.get("created_from") or meta.get("created_from") or "user")
    meta.setdefault("armed", True)
    meta.setdefault("last_condition_met", False)
    meta.setdefault("rearm_after_clear", bool(meta.get("recurring", False)))
    meta.setdefault("cycle", 0)
    return symbol, alert_type, target, meta


def _sync_important_announcement_notifications(username: str) -> None:
    if not _notification_allowed(username, "announcement"):
        return
    watched = set(_storage.list_watchlist(profile=username))
    symbol_specific = set()
    has_watchlist_alert = False
    for a in _storage.list_alerts(username):
        if not a.get("is_enabled"):
            continue
        if a.get("alert_type") == "important_announcement":
            if a.get("symbol"):
                symbol_specific.add(str(a["symbol"]).upper())
            else:
                has_watchlist_alert = True
    watched.update(symbol_specific)
    if not watched and not has_watchlist_alert:
        return
    recent = announcements(None, limit=100)
    for ann in recent:
        sym = (ann.get("symbol") or "").upper()
        if not sym or (watched and sym not in watched and not has_watchlist_alert):
            continue
        if not ann.get("is_important"):
            continue
        dedupe_key = f"important-ann:{ann.get('ann_id')}:{sym}"
        _ensure_notification(username, "announcement", f"Important announcement for {sym}", ann.get("title") or "Important announcement", symbol=sym, severity="warning", link=ann.get("url"), dedupe_key=dedupe_key, meta={"ann_id": ann.get("ann_id"), "importance": ann.get("importance")})


def _cooldown_elapsed(alert: Dict[str, Any]) -> bool:
    meta = alert.get("meta") or {}
    last_triggered_at = str(alert.get("last_triggered_at") or "")
    if not last_triggered_at:
        return True
    cooldown = int(_to_float(meta.get("cooldown_minutes") or 1440) or 1440)
    try:
        last_dt = datetime.fromisoformat(last_triggered_at.replace("Z", "+00:00"))
    except Exception:
        return True
    now_dt = datetime.now(last_dt.tzinfo)
    return (now_dt - last_dt).total_seconds() >= cooldown * 60


def evaluate_alerts(username: str) -> List[Dict[str, Any]]:
    alerts = _storage.list_alerts(username)
    triggered = []
    for alert in alerts:
        if not alert.get("is_enabled"):
            continue
        symbol = (alert.get("symbol") or "").upper()
        latest, prev, avg_vol, latest_date = _latest_close_and_prev(symbol) if symbol else (None, None, None, None)
        alert_type = str(alert.get("alert_type") or "")
        meta = dict(alert.get("meta") or {})
        current_condition = False
        message = None
        severity = "info"
        if alert_type == "above_price" and latest is not None and alert.get("target_value") is not None:
            current_condition = latest >= float(alert["target_value"])
            if current_condition:
                message = f"{symbol} moved above {float(alert['target_value']):.2f}. Latest price is {latest:.2f}."
                severity = "success"
        elif alert_type == "below_price" and latest is not None and alert.get("target_value") is not None:
            current_condition = latest <= float(alert["target_value"])
            if current_condition:
                message = f"{symbol} moved below {float(alert['target_value']):.2f}. Latest price is {latest:.2f}."
                severity = "warning"
        elif alert_type == "pct_move" and latest is not None and prev not in (None, 0) and alert.get("target_value") is not None:
            pct = abs((latest / prev - 1.0) * 100.0)
            current_condition = pct >= float(alert["target_value"])
            if current_condition:
                direction = "up" if latest >= prev else "down"
                message = f"{symbol} moved {direction} {pct:.2f}% today."
                severity = "warning"
        elif alert_type == "volume_spike" and symbol:
            bar = _storage.get_latest_bar(symbol)
            vol = _to_float((bar or {}).get("volume"))
            multiple = float(alert.get("target_value") or 2.0)
            current_condition = bool(vol is not None and avg_vol not in (None, 0) and vol >= avg_vol * multiple)
            if current_condition:
                message = f"{symbol} volume spiked to {int(vol or 0)} against a recent average of {int(avg_vol or 0)}."
                severity = "warning"
        elif alert_type == "reminder" and alert.get("target_value") is not None:
            import time
            current_time = time.time()
            current_condition = current_time >= float(alert["target_value"])
            if current_condition:
                message = str(meta.get("note") or f"Reminder triggered for {symbol or 'portfolio'}")
                severity = "info"
        if meta.get("last_condition_met") != current_condition:
            meta["last_condition_met"] = current_condition
            _storage.update_alert(str(alert.get("alert_id")), username, meta=meta)
        if not current_condition:
            if bool(meta.get("recurring", False)) and (alert.get("is_triggered") or meta.get("armed") is False):
                meta["armed"] = True
                meta["cycle"] = int(meta.get("cycle") or 0) + 1
                meta.pop("last_fire_key", None)
                _storage.update_alert(str(alert.get("alert_id")), username, meta=meta)
                _storage.reset_alert_triggered(str(alert.get("alert_id")), username)
            continue
        if alert_type == "important_announcement":
            continue
        can_fire = True
        if not bool(meta.get("recurring", False)) and alert.get("is_triggered"):
            can_fire = False
        if bool(meta.get("recurring", False)):
            if meta.get("armed") is False:
                can_fire = False
            if not _cooldown_elapsed(alert):
                can_fire = False
        if not can_fire:
            continue
        if message:
            dedupe = f"alert:{alert.get('alert_id')}:{latest_date or 'na'}:{alert_type}:{int(meta.get('cycle') or 0)}"
            _ensure_notification(username, "alert", f"Alert triggered for {symbol or 'market'}" if alert_type != "reminder" else "Reminder", message, symbol=symbol or None, severity=severity, link=f"/stock/{symbol}" if symbol else "/alerts", dedupe_key=dedupe, meta={"alert_id": alert.get("alert_id"), "alert_type": alert_type})
            meta["last_fire_key"] = latest_date or datetime.now().astimezone().astimezone().replace(microsecond=0).isoformat()
            meta["armed"] = False if bool(meta.get("recurring", False)) else meta.get("armed", False)
            _storage.update_alert(str(alert.get("alert_id")), username, meta=meta)
            _storage.mark_alert_triggered(str(alert.get("alert_id")))
            triggered.append(alert)
    _sync_important_announcement_notifications(username)
    return triggered


def list_alerts(username: str) -> List[Dict[str, Any]]:
    evaluate_alerts(username)
    return _storage.list_alerts(username)


def create_alert(username: str, payload: Dict[str, Any]) -> Dict[str, Any]:
    symbol, alert_type, target, meta = _parse_alert_payload(payload)
    alert = _storage.create_alert(username, symbol, alert_type, target, meta=meta)
    return {"alert": alert, "alerts": list_alerts(username)}


def update_alert(username: str, alert_id: str, payload: Dict[str, Any]) -> Dict[str, Any]:
    existing = next((a for a in _storage.list_alerts(username) if str(a.get("alert_id")) == str(alert_id)), None)
    if not existing:
        raise HTTPException(status_code=404, detail="Alert not found")
    symbol = existing.get("symbol")
    target = existing.get("target_value")
    meta = dict(existing.get("meta") or {})
    changed_trigger_basis = False
    if "symbol" in payload:
        symbol = str(payload.get("symbol") or "").upper() or None
        changed_trigger_basis = True
    if "target_value" in payload or "targetPrice" in payload:
        target = _to_float(payload.get("target_value", payload.get("targetPrice")))
        changed_trigger_basis = True
    if isinstance(payload.get("meta"), dict):
        meta.update(payload.get("meta") or {})
    if "recurring" in payload:
        meta["recurring"] = bool(payload.get("recurring"))
    if "cooldown_minutes" in payload:
        meta["cooldown_minutes"] = int(_to_float(payload.get("cooldown_minutes")) or 1440)
    symbol, _parsed_type, target, validated_meta = _parse_alert_payload({"symbol": symbol, "alert_type": existing.get("alert_type"), "target_value": target, "meta": meta})
    rearm_required = bool(payload.get("is_enabled") is True or changed_trigger_basis or any(k in payload for k in ("meta", "recurring", "cooldown_minutes")))
    if rearm_required:
        validated_meta["armed"] = True
        validated_meta["last_condition_met"] = False
        validated_meta["cycle"] = int(validated_meta.get("cycle") or 0) + 1
        validated_meta.pop("last_fire_key", None)
    ok = _storage.update_alert(
        alert_id,
        username,
        symbol=symbol if "symbol" in payload else None,
        target_value=target if ("target_value" in payload or "targetPrice" in payload) else None,
        is_enabled=payload.get("is_enabled") if isinstance(payload.get("is_enabled"), bool) else None,
        meta=validated_meta if rearm_required else (validated_meta if any(k in payload for k in ("meta", "recurring", "cooldown_minutes")) else None),
    )
    if not ok:
        raise HTTPException(status_code=404, detail="Alert not found")
    if rearm_required:
        _storage.reset_alert_triggered(alert_id, username)
    return {"ok": True, "alerts": list_alerts(username)}


def delete_alert(username: str, alert_id: str) -> Dict[str, Any]:
    if not _storage.delete_alert(alert_id, username):
        raise HTTPException(status_code=404, detail="Alert not found")
    return {"ok": True, "alerts": list_alerts(username)}


def list_notifications(username: str, unread_only: bool = False) -> List[Dict[str, Any]]:
    evaluate_alerts(username)
    return _storage.list_notifications(username, unread_only=unread_only)


def mark_notification_read(username: str, notification_id: str) -> Dict[str, Any]:
    if not _storage.mark_notification_read(notification_id, username):
        raise HTTPException(status_code=404, detail="Notification not found")
    return {"ok": True, "notifications": list_notifications(username)}


def mark_all_notifications_read(username: str) -> Dict[str, Any]:
    _storage.mark_all_notifications_read(username)
    return {"ok": True, "notifications": list_notifications(username)}


def export_user_account_data(username: str) -> Dict[str, Any]:
    user = _storage.get_user(username) or {"username": username}
    watchlist_symbols = _storage.list_watchlist(profile=username)
    portfolios = list_portfolios(username)
    portfolio_ids = [str(pf.get("portfolio_id") or "") for pf in portfolios if pf.get("portfolio_id")]
    portfolio_payload = []
    for pf in portfolios:
        pid = str(pf.get("portfolio_id") or "")
        portfolio_payload.append({
            "portfolio": pf,
            "details": get_portfolio(username, pid),
            "transactions": _storage.list_portfolio_transactions(username, pid),
            "cash_movements": _storage.list_cash_movements(username, pid),
        })
    alerts = list_alerts(username)
    notifications = _storage.list_notifications(username, unread_only=False)
    notification_preview = notifications[:200]
    return {
        "exported_at": datetime.utcnow().isoformat() + "Z",
        "user": {
            "username": user.get("username"),
            "role": user.get("role"),
            "display_name": user.get("display_name"),
            "email": user.get("email"),
            "created_at": user.get("created_at"),
            "last_login_at": user.get("last_login_at"),
        },
        "settings": get_user_settings(username).get("settings") or {},
        "watchlist": {
            "symbols": watchlist_symbols,
            "items": get_watchlist(username).get("items") if username else [],
        },
        "portfolios": portfolio_payload,
        "alerts": alerts,
        "notifications": {
            "count": len(notifications),
            "preview": notification_preview,
        },
    }


def get_user_settings(username: str) -> Dict[str, Any]:
    prefs = _storage.get_preferences(profile=username)
    defaults = dict(NOTIFICATION_DEFAULTS)
    defaults.update(prefs)
    normalized = {k: _normalize_setting_value(k, defaults.get(k)) for k in defaults}
    return {"profile": username, "settings": normalized}


def update_user_settings(username: str, values: Dict[str, Any]) -> Dict[str, Any]:
    for k, v in (values or {}).items():
        _storage.set_preference(k, _normalize_setting_value(k, v), profile=username)
    return get_user_settings(username)


def admin_alerts() -> List[Dict[str, Any]]:
    return _storage.list_alerts()


def admin_notifications() -> List[Dict[str, Any]]:
    return _storage.list_notifications(None)


def admin_notification_queue(limit: int = 200) -> List[Dict[str, Any]]:
    return _storage.list_notification_dispatch_queue(limit=limit)


def announcements_filtered(symbol: Optional[str], limit: int = 50, important_only: bool = False, categories: Optional[List[str]] = None, include_hidden: bool = False) -> List[Dict[str, Any]]:
    rows = announcements(symbol, limit)
    if not include_hidden:
        rows = [r for r in rows if str(r.get('review_status') or '').lower() != "hidden"]
    if important_only:
        rows = [r for r in rows if r.get('is_important')]
    if categories:
        wanted = {c.lower() for c in categories}
        rows = [r for r in rows if str(r.get('category') or '').lower() in wanted or str(r.get('importance') or '').lower() in wanted]
    return rows


def review_announcement(ann_id: str, *, importance: Optional[str], review_status: Optional[str], tags: Optional[List[str]], review_notes: Optional[str], reviewed_by: str) -> Dict[str, Any]:
    normalized_status = (str(review_status or "").strip().lower() or None)
    if normalized_status in {"approved", "rejected"}:
        normalized_status = "reviewed"
    _storage.set_announcement_meta(ann_id, importance=importance, review_status=normalized_status, tags=tags or [], review_notes=review_notes, reviewed_by=reviewed_by)
    # notify users who watch the symbol if the announcement became important
    anns = _storage.get_announcements(None, limit=500)
    ann = next((a for a in anns if str(a.get('ann_id')) == ann_id), None)
    if ann and ann.get('is_important') and ann.get('symbol') and normalized_status != "hidden":
        sym = str(ann['symbol']).upper()
        for user in _storage.list_users():
            uname = str(user.get('username'))
            if sym in _storage.list_watchlist(profile=uname):
                _ensure_notification(uname, 'announcement', f"Important announcement for {sym}", ann.get('title') or 'Important announcement', symbol=sym, severity='warning', link=ann.get('url'), dedupe_key=f"important-ann:{ann_id}:{sym}", meta={'ann_id': ann_id})
    return {'ok': True, 'announcement': ann}


def admin_jobs(limit: int = 100) -> List[Dict[str, Any]]:
    return _storage.list_job_runs(limit=limit)


def admin_alerts() -> List[Dict[str, Any]]:
    evaluate_all_users_alerts()
    return _storage.list_alerts()


def admin_notifications() -> List[Dict[str, Any]]:
    return _storage.list_notifications(None)


def get_provider_settings() -> Dict[str, Any]:
    return {'active_provider': get_effective_provider_name(), 'configured_provider': settings.data_provider}


def event_calendar(symbol: Optional[str] = None, portfolio_id: Optional[str] = None, username: Optional[str] = None, days: int = 120) -> Dict[str, Any]:
    today = date.today()
    since = today - timedelta(days=max(days, 30))
    symbols: List[str] = []
    if symbol:
        symbols = [symbol.upper()]
    elif username:
        pf = get_portfolio(username, portfolio_id=portfolio_id)
        symbols = [str(p.get('symbol') or '').upper() for p in (pf.get('positions') or []) if p.get('symbol')]
    symbols = sorted({s for s in symbols if s})
    events: List[Dict[str, Any]] = []
    def add_event(raw_date: Optional[str], symbol_val: str, title: str, event_type: str, source_type: str, meta: Optional[Dict[str, Any]] = None):
        dt = str(raw_date or '')[:10]
        if not dt:
            return
        try:
            d = date.fromisoformat(dt)
        except Exception:
            return
        if d < since:
            return
        days_from_now = (d - today).days
        events.append({
            'date': dt,
            'symbol': symbol_val,
            'title': title,
            'event_type': event_type,
            'source_type': source_type,
            'days_from_now': days_from_now,
            'status': 'upcoming' if days_from_now > 0 else 'today' if days_from_now == 0 else 'past',
            'meta': meta or {},
        })
    for sym in symbols or []:
        for action in _storage.list_corporate_actions(sym, limit=80):
            label = str(action.get('action_type') or 'corporate_action').replace('_', ' ').title()
            detail = str(action.get('description') or '')
            add_event(action.get('ex_date'), sym, f"{label} {detail}".strip(), str(action.get('action_type') or 'corporate_action'), 'corporate_action', {'amount': action.get('amount')})
        for doc in _storage.get_document_intelligence(sym, limit=80):
            d_type = str(doc.get('document_type') or doc.get('event_type') or 'report')
            add_event(doc.get('date'), sym, str(doc.get('title') or 'Report document'), d_type, 'document', {'url': doc.get('document_url')})
        for ann in announcements(sym, 80):
            title = str(ann.get('title') or '')
            title_l = title.lower()
            if any(token in title_l for token in ('agm', 'egm', 'board meeting', 'results', 'interim', 'annual report', 'dividend')):
                e_type = 'event_notice'
                if 'dividend' in title_l:
                    e_type = 'dividend_notice'
                elif any(t in title_l for t in ('results','interim','annual report')):
                    e_type = 'earnings_report'
                add_event(ann.get('date'), sym, title, e_type, 'announcement', {'url': ann.get('url')})
    events.sort(key=lambda x: (x['date'], x['symbol'], x['title']))
    upcoming = [e for e in events if e['days_from_now'] >= 0][:50]
    recent = [e for e in events if e['days_from_now'] < 0][-50:]
    return {'symbols': symbols, 'upcoming': upcoming, 'recent': list(reversed(recent)), 'count': len(events)}


def _model_capabilities() -> Dict[str, Any]:
    def _module_available(name: str) -> bool:
        try:
            return importlib.util.find_spec(name) is not None
        except Exception:
            return False

    available = {
        "baseline": True,
        "sklearn_gbdt": True,
        "lightgbm": _module_available("lightgbm"),
        "xgboost": _module_available("xgboost"),
        "catboost": _module_available("catboost"),
        "finbert_enabled": str(os.getenv("FINBERT_ENABLED", "false")).lower() in {"1", "true", "yes", "on"},
        "finbert_available": _module_available("transformers") and _module_available("torch"),
        "finbert_model": os.getenv("FINBERT_MODEL", "ProsusAI/finbert"),
    }
    notes = []
    available["auto_candidates"] = [name for name, ok in [("baseline", True), ("sklearn_gbdt", True), ("lightgbm", available["lightgbm"]), ("xgboost", available["xgboost"]), ("catboost", available["catboost"])] if ok]
    available["workflow"] = {
        "sync": "Fetches and stores market data into the database.",
        "train": "Trains a model using data already stored in the database.",
        "sync_train": "Runs sync first, then rebuilds intelligence and trains.",
        "activate": "Makes one trained model live on stock pages.",
    }
    if not available["finbert_enabled"]:
        notes.append("FinBERT is optional and currently disabled by environment setting.")
    elif available["finbert_enabled"] and not available["finbert_available"]:
        notes.append("FinBERT is enabled in config but transformers is not installed, so rule-based sentiment will be used.")
    available["notes"] = notes
    return available


def admin_model_health() -> Dict[str, Any]:
    model = model_status()
    latest_compare = None
    for row in _storage.list_job_runs(job_name='model_comparison', limit=10):
        latest_compare = row
        break
    coverage = _storage.data_coverage()
    sentiment_count = len(_storage.get_news_sentiment(limit=5000))
    docs_count = len(_storage.get_document_intelligence(limit=5000))
    news_count = len(_storage.get_external_news_items(limit=5000))
    macro_count = len(_storage.get_macro_series(limit=8000))
    capabilities = _model_capabilities()
    score = 0
    if model.get('available'):
        score += 35
    if coverage.get('symbols_ready_for_prediction'):
        score += min(25, int(coverage.get('symbols_ready_for_prediction') or 0))
    if sentiment_count:
        score += 10
    if docs_count:
        score += 10
    if news_count:
        score += 10
    if macro_count:
        score += 10
    return {
        'model': model,
        'latest_comparison': latest_compare,
        'feature_store': {
            'sentiment_items': sentiment_count,
            'document_intelligence': docs_count,
            'selected_news_items': news_count,
            'macro_points': macro_count,
        },
        'coverage': coverage,
        'capabilities': capabilities,
        'health_score': min(100, score),
        'health_label': 'healthy' if score >= 75 else 'warming_up' if score >= 50 else 'needs_attention',
        'note': 'Use Sync to fetch/store data. Use Train to build a model from stored data. Activate one trained model to make it live on stock pages.',
    }

def admin_status() -> Dict[str, Any]:
    coverage = _storage.data_coverage()
    last_sync = _storage.get_meta("last_sync_utc")
    meta = _storage.list_meta(prefix="last_")
    health = provider_health()
    models = list_models()
    active_model = get_active_model_record()
    status = {
        "provider": health,
        "database": {"url": settings.database_url, "enabled": settings.db_cache_enabled, "reachable": True},
        "coverage": coverage,
        "freshness": {
            "last_sync_utc": last_sync,
            "latest_price_date": coverage.get("latest_price_date"),
            "latest_history_date": coverage.get("latest_price_date"),
            "latest_announcements_sync": meta.get("last_announcements_sync_utc") or last_sync,
            "last_sentiment_refresh_utc": _storage.get_meta("last_sentiment_refresh_utc"),
            "last_macro_import_utc": _storage.get_meta("last_macro_import_utc"),
            "last_document_refresh_utc": _storage.get_meta("last_document_refresh_utc"),
            "last_selected_news_refresh_utc": _storage.get_meta("last_selected_news_refresh_utc"),
            "last_news_model_comparison_utc": _storage.get_meta("last_news_model_comparison_utc"),
            "meta": meta,
        },
        "counts": {
            "companies": len(companies()),
            "watchlist_symbols": len(_storage.list_watchlist()),
            "job_runs": len(_storage.list_job_runs(limit=20)),
            "users": len(_storage.list_users()),
            "models": len(models),
            "alerts": len(_storage.list_alerts()),
            "notifications": len(_storage.list_notifications(None)),
            "sentiment_items": len(_storage.get_news_sentiment(limit=2000)),
            "macro_points": len(_storage.get_macro_series(limit=5000)),
            "document_intelligence": len(_storage.get_document_intelligence(limit=2000)),
            "selected_news_items": len(_storage.get_external_news_items(limit=5000)),
        },
        "model": model_status(),
        "model_capabilities": _model_capabilities(),
        "models": models,
        "active_model": active_model,
        "users": _storage.list_users(),
        "jobs": _storage.list_job_runs(limit=20),
        "provider_settings": get_provider_settings(),
        "alerts": admin_alerts()[:100],
        "notifications": admin_notifications()[:100],
        "watchlist": get_watchlist(),
        "top_signals": top_signals(limit=5),
        "symbols_needing_history": [r for r in coverage.get("rows", []) if (r.get("rows") or 0) < 120][:20],
        "admin_protected": bool(settings.admin_api_key),
    }
    return status


def system_status() -> Dict[str, Any]:
    a = admin_status()
    ready = bool(a["coverage"].get("symbols_with_history")) and bool(a["database"].get("reachable"))
    return {
        "provider": a["provider"]["name"],
        "provider_health": a["provider"],
        "database": a["database"],
        "counts": a["counts"],
        "coverage": {k: a["coverage"].get(k) for k in ("symbols", "symbols_with_history", "symbols_ready_for_prediction", "latest_price_date")},
        "freshness": a["freshness"],
        "model": a["model"],
        "model_capabilities": a.get("model_capabilities"),
        "ready": ready,
    }
