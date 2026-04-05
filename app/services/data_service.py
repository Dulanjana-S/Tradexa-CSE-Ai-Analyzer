from __future__ import annotations

from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional, Tuple

from fastapi import HTTPException

from ..config import settings
from ..mock_data import DEMO_SYMBOLS, demo_prediction
from ..ml.model_store import latest_bundle
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
_provider: Optional[MarketDataProvider] = None


def get_provider() -> MarketDataProvider:
    global _provider
    if _provider is not None:
        return _provider
    p = settings.data_provider
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
    if p == "cse":
        _provider = cse
    elif p == "yfinance":
        _provider = YFinanceProvider(exchange_suffix=settings.yahoo_exchange_suffix)
    elif p == "hybrid":
        _provider = HybridProvider(cse=cse, yfin=YFinanceProvider(exchange_suffix=settings.yahoo_exchange_suffix))
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

    turnover = summary.get("marketTurnover") or summary.get("equityTurnover") or summary.get("turnOver") or summary.get("turnover")
    turnover = turnover or daily.get("marketTurnover") or daily.get("equityTurnover")
    trades = summary.get("marketTrades") or summary.get("tradeCount") or summary.get("trades")
    trades = trades or daily.get("marketTrades") or daily.get("tradesNo")
    mcap = summary.get("marketCap") or summary.get("marketCapitalization") or daily.get("marketCap")

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

    return _cache.get_or_set(("market_overview", prov.name), _factory)


def indices() -> Dict[str, Any]:
    prov = get_provider()

    def _factory():
        out: Dict[str, Any] = {"ASPI": [], "S&P SL20": [], "source": getattr(prov, "name", "")}
        try:
            idx = prov.get_indices() or {}
        except Exception:
            idx = {}
        if isinstance(idx, dict):
            out["ASPI"] = idx.get("ASPI") or []
            out["S&P SL20"] = idx.get("S&P SL20") or idx.get("SNP_SL20") or idx.get("SNP SL20") or []
            out["source"] = idx.get("source") or prov.name
        if settings.db_cache_enabled and prov.name not in {"mock", "db"}:
            try:
                _storage.upsert_index_series("ASPI", out["ASPI"] if isinstance(out.get("ASPI"), list) else [])
                _storage.upsert_index_series("S&P SL20", out["S&P SL20"] if isinstance(out.get("S&P SL20"), list) else [])
            except Exception:
                pass
        return out

    if settings.db_cache_enabled:
        aspi = _storage.get_index_series("ASPI", limit=400)
        sl20 = _storage.get_index_series("S&P SL20", limit=400)
        if aspi or sl20:
            return {"ASPI": aspi or [], "S&P SL20": sl20 or [], "source": "db"}
    return _cache.get_or_set(("indices", prov.name), _factory)


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


def prediction(symbol: str) -> Dict[str, Any]:
    hist = stock_history(symbol, days=320)
    if len(hist) < 120 or hist[-1].get("close") is None:
        return {
            "available": False,
            "symbol": symbol.upper(),
            "reason": "Insufficient end-of-day price history for this symbol. Import more data before showing a model signal.",
            "required_history_points": 120,
            "history_points": len(hist),
        }
    bundle = latest_bundle(Path(settings.model_dir))
    if bundle is not None:
        try:
            pred = predict_next(symbol=symbol, database_url=settings.database_url, model_dir=settings.model_dir, horizon_days=int(bundle.meta.get("horizon_days") or 1))
            return {"available": True, **pred}
        except Exception as e:
            return {"available": False, "symbol": symbol.upper(), "reason": f"Prediction failed: {getattr(e, 'detail', e)}", "history_points": len(hist)}
    if not settings.allow_prediction_fallback:
        return {"available": False, "symbol": symbol.upper(), "reason": "Model not trained yet. Run training before showing predictions.", "history_points": len(hist)}
    try:
        idx = indices().get("ASPI")
        pred = demo_prediction(hist, index_series=idx if isinstance(idx, list) else None)
        pred["available"] = True
        pred.setdefault("model", {"version": "heuristic"})
        pred.setdefault("quality_flags", []).append("heuristic_fallback")
        return pred
    except Exception as e:
        return {"available": False, "symbol": symbol.upper(), "reason": f"Fallback prediction failed: {getattr(e, 'detail', e)}", "history_points": len(hist)}


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
    bundle = latest_bundle(Path(settings.model_dir))
    if bundle is None:
        return {"available": False, "model_version": None}
    metrics = bundle.meta.get("metrics_holdout") or {}
    quality = "experimental"
    auc = metrics.get("auc_up")
    if isinstance(auc, (int, float)):
        if auc >= 0.60:
            quality = "promising"
        elif auc >= 0.55:
            quality = "watch"
    return {"available": True, "quality": quality, **bundle.meta}


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


def admin_status() -> Dict[str, Any]:
    coverage = _storage.data_coverage()
    last_sync = _storage.get_meta("last_sync_utc")
    meta = _storage.list_meta(prefix="last_")
    health = provider_health()
    status = {
        "provider": health,
        "database": {"url": settings.database_url, "enabled": settings.db_cache_enabled, "reachable": True},
        "coverage": coverage,
        "freshness": {
            "last_sync_utc": last_sync,
            "latest_price_date": coverage.get("latest_price_date"),
            "latest_history_date": coverage.get("latest_price_date"),
            "latest_announcements_sync": meta.get("last_announcements_sync_utc") or last_sync,
            "meta": meta,
        },
        "counts": {
            "companies": len(companies()),
            "watchlist_symbols": len(_storage.list_watchlist()),
            "job_runs": len(_storage.list_job_runs(limit=20)),
        },
        "model": model_status(),
        "jobs": _storage.list_job_runs(limit=20),
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
        "ready": ready,
    }
