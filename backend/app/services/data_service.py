from __future__ import annotations

from datetime import date, timedelta
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional, Tuple

from fastapi import HTTPException

from ..config import settings
from ..mock_data import DEMO_SYMBOLS, demo_prediction
from ..ml.model_store import activate_bundle, latest_bundle
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
_provider_key: Optional[str] = None


def clear_runtime_cache() -> None:
    _cache.clear()


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
            _storage.register_model(model_id=model_id, path=str(match.get("path") or model_id), meta=match.get("meta") or {}, is_active=True)
            ok_db = True
    return bool(ok_fs and ok_db)




def list_portfolio_transactions(username: str) -> List[Dict[str, Any]]:
    return _storage.list_portfolio_transactions(username)


def _portfolio_sort_key(item: Dict[str, Any]) -> Tuple[str, str, str]:
    return (
        str(item.get("traded_at") or item.get("created_at") or ""),
        str(item.get("created_at") or ""),
        str(item.get("tx_id") or item.get("id") or ""),
    )


def _portfolio_position_state_from_rows(rows: List[Dict[str, Any]], *, strict: bool = False) -> Dict[str, Dict[str, Any]]:
    ordered = sorted(rows, key=_portfolio_sort_key)
    state: Dict[str, Dict[str, Any]] = {}
    for tx in ordered:
        symbol = str(tx.get("symbol") or "").upper().strip()
        if not symbol:
            continue
        tx_type = str(tx.get("tx_type") or tx.get("type") or "buy").lower().strip()
        quantity = float(tx.get("quantity") or 0.0)
        price = float(tx.get("price") or 0.0)
        fees = float(tx.get("fees") or 0.0)
        info = state.setdefault(symbol, {"quantity": 0.0, "cost_total": 0.0, "realized_pl": 0.0})
        if tx_type == "buy":
            info["quantity"] += quantity
            info["cost_total"] += quantity * price + fees
        elif tx_type == "sell":
            held_qty = float(info.get("quantity") or 0.0)
            if strict and held_qty + 1e-9 < quantity:
                tx_label = tx.get("traded_at") or tx.get("created_at") or "this transaction"
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


def _portfolio_position_state(username: str) -> Dict[str, Dict[str, Any]]:
    return _portfolio_position_state_from_rows(_storage.list_portfolio_transactions(username))


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
    _portfolio_position_state_from_rows(next_rows, strict=True)


def get_portfolio(username: str) -> Dict[str, Any]:
    transactions = _storage.list_portfolio_transactions(username)
    state = _portfolio_position_state_from_rows(transactions)
    open_symbols = [symbol for symbol, item in state.items() if float(item.get("quantity") or 0.0) > 0]
    snapshots = {item.get("symbol"): item for item in stock_snapshots(open_symbols)} if open_symbols else {}
    positions: List[Dict[str, Any]] = []
    total_market_value = 0.0
    total_cost_basis = 0.0
    total_realized = 0.0
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
        total_market_value += market_value
        total_cost_basis += cost_basis
        total_realized += float(item.get("realized_pl") or 0.0)
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
        })
    for row in positions:
        row["weight_pct"] = (row["market_value"] / total_market_value * 100.0) if total_market_value > 0 else 0.0
    summary = {
        "positions_count": len(positions),
        "transactions_count": len(transactions),
        "cost_basis": total_cost_basis,
        "market_value": total_market_value,
        "unrealized_pl": total_market_value - total_cost_basis,
        "unrealized_pl_pct": ((total_market_value - total_cost_basis) / total_cost_basis * 100.0) if total_cost_basis > 0 else 0.0,
        "realized_pl": total_realized,
        "total_pl": (total_market_value - total_cost_basis) + total_realized,
    }
    transactions_sorted = sorted(transactions, key=_portfolio_sort_key, reverse=True)
    return {"summary": summary, "positions": positions, "transactions": transactions_sorted}


def get_portfolio_performance(username: str, days: int = 365) -> Dict[str, Any]:
    transactions = _storage.list_portfolio_transactions(username)
    if not transactions:
        return {"days": days, "series": []}

    ordered_txs = sorted(transactions, key=_portfolio_sort_key)
    symbols = sorted({str(item.get("symbol") or "").upper() for item in ordered_txs if item.get("symbol")})
    histories: Dict[str, Dict[str, float]] = {}
    history_dates: List[date] = []
    for symbol in symbols:
        price_rows = _storage.get_price_history(symbol, limit=max(days + 40, 2000))
        price_map: Dict[str, float] = {}
        for row in price_rows:
            date_key = str(row.get("date") or "")[:10]
            close_value = _to_float(row.get("close"))
            if date_key and close_value is not None:
                price_map[date_key] = float(close_value)
                history_dates.append(date.fromisoformat(date_key))
        if price_map:
            histories[symbol] = price_map

    if not histories:
        return {"days": days, "series": []}

    tx_dates = [date.fromisoformat(str(item.get("traded_at") or item.get("created_at") or "")[:10]) for item in ordered_txs if str(item.get("traded_at") or item.get("created_at") or "")[:10]]
    if not tx_dates:
        return {"days": days, "series": []}

    latest_history_date = max(history_dates)
    start_date = max(min(tx_dates), latest_history_date - timedelta(days=max(days - 1, 0)))
    market_dates = sorted({d for d in history_dates if d >= start_date})
    if not market_dates:
        return {"days": days, "series": []}

    tx_by_date: Dict[date, List[Dict[str, Any]]] = {}
    for tx in ordered_txs:
        raw_day = str(tx.get("traded_at") or tx.get("created_at") or "")[:10]
        if not raw_day:
            continue
        tx_day = date.fromisoformat(raw_day)
        tx_by_date.setdefault(tx_day, []).append(tx)

    positions: Dict[str, Dict[str, float]] = {}
    last_close: Dict[str, float] = {}
    series: List[Dict[str, Any]] = []
    for market_day in market_dates:
        for tx in tx_by_date.get(market_day, []):
            symbol = str(tx.get("symbol") or "").upper().strip()
            if not symbol:
                continue
            tx_type = str(tx.get("tx_type") or tx.get("type") or "buy").lower().strip()
            quantity = float(tx.get("quantity") or 0.0)
            price = float(tx.get("price") or 0.0)
            fees = float(tx.get("fees") or 0.0)
            pos = positions.setdefault(symbol, {"quantity": 0.0, "cost_total": 0.0, "realized_pl": 0.0})
            if tx_type == "buy":
                pos["quantity"] += quantity
                pos["cost_total"] += quantity * price + fees
            elif tx_type == "sell":
                held_qty = float(pos.get("quantity") or 0.0)
                avg_cost = (float(pos.get("cost_total") or 0.0) / held_qty) if held_qty > 0 else 0.0
                pos["realized_pl"] += quantity * (price - avg_cost) - fees
                pos["quantity"] = max(0.0, held_qty - quantity)
                pos["cost_total"] = max(0.0, float(pos.get("cost_total") or 0.0) - avg_cost * quantity)

        total_market_value = 0.0
        total_cost_basis = 0.0
        total_realized = 0.0
        for symbol, price_map in histories.items():
            date_key = market_day.isoformat()
            if date_key in price_map:
                last_close[symbol] = float(price_map[date_key])
            pos = positions.get(symbol)
            if not pos:
                continue
            quantity = float(pos.get("quantity") or 0.0)
            if quantity <= 0:
                total_realized += float(pos.get("realized_pl") or 0.0)
                continue
            close_value = float(last_close.get(symbol) or 0.0)
            total_market_value += quantity * close_value
            total_cost_basis += float(pos.get("cost_total") or 0.0)
            total_realized += float(pos.get("realized_pl") or 0.0)
        unrealized = total_market_value - total_cost_basis
        series.append({
            "date": market_day.isoformat(),
            "market_value": round(total_market_value, 4),
            "cost_basis": round(total_cost_basis, 4),
            "realized_pl": round(total_realized, 4),
            "unrealized_pl": round(unrealized, 4),
            "total_pl": round(unrealized + total_realized, 4),
        })
    return {"days": days, "series": series}


def create_portfolio_transaction(username: str, payload: Dict[str, Any]) -> Dict[str, Any]:
    clean = _validate_portfolio_transaction_payload(payload)
    current_rows = _storage.list_portfolio_transactions(username)
    next_rows = list(current_rows) + [clean]
    _validate_portfolio_sequence(next_rows)
    _storage.create_portfolio_transaction(username, clean["symbol"], clean["tx_type"], clean["quantity"], clean["price"], fees=clean["fees"], traded_at=clean["traded_at"], notes=clean["notes"])
    return get_portfolio(username)


def update_portfolio_transaction(username: str, tx_id: str, payload: Dict[str, Any]) -> Dict[str, Any]:
    clean = _validate_portfolio_transaction_payload(payload)
    current_rows = _storage.list_portfolio_transactions(username)
    found = False
    next_rows: List[Dict[str, Any]] = []
    for row in current_rows:
        current_id = str(row.get("tx_id") or row.get("id") or "")
        if current_id == tx_id:
            found = True
            replacement = dict(row)
            replacement.update(clean)
            replacement["tx_id"] = tx_id
            next_rows.append(replacement)
        else:
            next_rows.append(row)
    if not found:
        raise HTTPException(status_code=404, detail="Portfolio transaction not found")
    _validate_portfolio_sequence(next_rows)
    updated = _storage.update_portfolio_transaction(tx_id, username, clean["symbol"], clean["tx_type"], clean["quantity"], clean["price"], fees=clean["fees"], traded_at=clean["traded_at"], notes=clean["notes"])
    if not updated:
        raise HTTPException(status_code=404, detail="Portfolio transaction not found")
    return get_portfolio(username)


def delete_portfolio_transaction(username: str, tx_id: str) -> Dict[str, Any]:
    if not _storage.delete_portfolio_transaction(tx_id, username):
        raise HTTPException(status_code=404, detail="Portfolio transaction not found")
    return get_portfolio(username)


# ---- Alerts / Notifications / Announcement logic ----
def _ensure_notification(username: str, category: str, title: str, message: str, *, symbol: Optional[str] = None, severity: str = 'info', link: Optional[str] = None, dedupe_key: Optional[str] = None, meta: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    existing = _storage.list_notifications(username)
    if dedupe_key:
        for n in existing:
            n_meta = n.get('meta') or {}
            if n_meta.get('dedupe_key') == dedupe_key:
                return n
    payload = dict(meta or {})
    if dedupe_key:
        payload['dedupe_key'] = dedupe_key
    return _storage.create_notification(username, category, title, message, symbol=symbol, severity=severity, link=link, meta=payload)


def _latest_close_and_prev(symbol: str) -> Tuple[Optional[float], Optional[float], Optional[float]]:
    hist = _storage.get_price_history(symbol.upper(), limit=21)
    if not hist:
        return None, None, None
    latest = _to_float(hist[-1].get('close'))
    prev = _to_float(hist[-2].get('close')) if len(hist) >= 2 else None
    avg_vol = None
    vols = [_to_float(r.get('volume')) for r in hist[-20:] if _to_float(r.get('volume')) is not None]
    if vols:
        avg_vol = sum(vols) / len(vols)
    return latest, prev, avg_vol


def _sync_important_announcement_notifications(username: str) -> None:
    watched = set(_storage.list_watchlist(profile=username))
    for a in _storage.list_alerts(username):
        if a.get('alert_type') == 'important_announcement' and a.get('symbol'):
            watched.add(str(a['symbol']).upper())
    if not watched:
        return
    recent = announcements(None, limit=100)
    for ann in recent:
        sym = (ann.get('symbol') or '').upper()
        if sym not in watched:
            continue
        if not ann.get('is_important'):
            continue
        dedupe_key = f"important-ann:{ann.get('ann_id')}:{sym}"
        _ensure_notification(username, 'announcement', f"Important announcement for {sym}", ann.get('title') or 'Important announcement', symbol=sym, severity='warning', link=ann.get('url'), dedupe_key=dedupe_key, meta={'ann_id': ann.get('ann_id'), 'importance': ann.get('importance')})


def evaluate_alerts(username: str) -> List[Dict[str, Any]]:
    alerts = _storage.list_alerts(username)
    triggered = []
    for alert in alerts:
        if not alert.get('is_enabled'):
            continue
        symbol = (alert.get('symbol') or '').upper()
        latest, prev, avg_vol = _latest_close_and_prev(symbol) if symbol else (None, None, None)
        fire = False
        message = None
        if alert.get('alert_type') == 'above_price' and latest is not None and alert.get('target_value') is not None:
            if latest >= float(alert['target_value']):
                fire = True
                message = f"{symbol} moved above {float(alert['target_value']):.2f}. Latest price is {latest:.2f}."
        elif alert.get('alert_type') == 'below_price' and latest is not None and alert.get('target_value') is not None:
            if latest <= float(alert['target_value']):
                fire = True
                message = f"{symbol} moved below {float(alert['target_value']):.2f}. Latest price is {latest:.2f}."
        elif alert.get('alert_type') == 'pct_move' and latest is not None and prev not in (None, 0) and alert.get('target_value') is not None:
            pct = abs((latest / prev - 1.0) * 100.0)
            if pct >= float(alert['target_value']):
                fire = True
                message = f"{symbol} moved {pct:.2f}% today."
        elif alert.get('alert_type') == 'volume_spike' and symbol:
            bar = _storage.get_latest_bar(symbol)
            vol = _to_float((bar or {}).get('volume'))
            multiple = float(alert.get('target_value') or 2.0)
            if vol is not None and avg_vol not in (None, 0) and vol >= avg_vol * multiple:
                fire = True
                message = f"{symbol} volume spiked to {int(vol)} against a recent average of {int(avg_vol or 0)}."
        if fire:
            _storage.mark_alert_triggered(str(alert['alert_id']))
            dedupe_key = f"alert:{alert.get('alert_id')}:{alert.get('last_triggered_at') or ''}"
            _ensure_notification(username, 'alert', f"Alert triggered for {symbol or 'market'}", message or 'Alert triggered', symbol=symbol or None, severity='info', dedupe_key=f"alert:{alert.get('alert_id')}", meta={'alert_id': alert.get('alert_id')})
            triggered.append(alert)
    _sync_important_announcement_notifications(username)
    return triggered


def list_alerts(username: str) -> List[Dict[str, Any]]:
    evaluate_alerts(username)
    return _storage.list_alerts(username)


def create_alert(username: str, payload: Dict[str, Any]) -> Dict[str, Any]:
    alert = _storage.create_alert(username, payload.get('symbol'), str(payload.get('alert_type') or 'above_price'), _to_float(payload.get('target_value')), meta=payload.get('meta') if isinstance(payload.get('meta'), dict) else {})
    return {'alert': alert, 'alerts': list_alerts(username)}


def update_alert(username: str, alert_id: str, payload: Dict[str, Any]) -> Dict[str, Any]:
    ok = _storage.update_alert(alert_id, username, symbol=payload.get('symbol'), target_value=_to_float(payload.get('target_value')) if payload.get('target_value') is not None else None, is_enabled=payload.get('is_enabled') if isinstance(payload.get('is_enabled'), bool) else None, meta=payload.get('meta') if isinstance(payload.get('meta'), dict) else None)
    if not ok:
        raise HTTPException(status_code=404, detail='Alert not found')
    return {'ok': True, 'alerts': list_alerts(username)}


def delete_alert(username: str, alert_id: str) -> Dict[str, Any]:
    if not _storage.delete_alert(alert_id, username):
        raise HTTPException(status_code=404, detail='Alert not found')
    return {'ok': True, 'alerts': list_alerts(username)}


def list_notifications(username: str, unread_only: bool = False) -> List[Dict[str, Any]]:
    evaluate_alerts(username)
    return _storage.list_notifications(username, unread_only=unread_only)


def mark_notification_read(username: str, notification_id: str) -> Dict[str, Any]:
    if not _storage.mark_notification_read(notification_id, username):
        raise HTTPException(status_code=404, detail='Notification not found')
    return {'ok': True, 'notifications': list_notifications(username)}


def mark_all_notifications_read(username: str) -> Dict[str, Any]:
    _storage.mark_all_notifications_read(username)
    return {'ok': True, 'notifications': list_notifications(username)}


def get_user_settings(username: str) -> Dict[str, Any]:
    prefs = _storage.get_preferences(profile=username)
    defaults = {
        'theme': 'dark',
        'default_timeframe': '6M',
        'email_notifications': False,
        'push_notifications': False,
        'alert_notifications': True,
        'announcement_notifications': True,
    }
    defaults.update(prefs)
    return {'profile': username, 'settings': defaults}


def update_user_settings(username: str, values: Dict[str, Any]) -> Dict[str, Any]:
    for k, v in (values or {}).items():
        _storage.set_preference(k, v, profile=username)
    return get_user_settings(username)


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
    # evaluate users before returning monitor data
    for user in _storage.list_users():
        evaluate_alerts(str(user.get('username')))
    return _storage.list_alerts()


def admin_notifications() -> List[Dict[str, Any]]:
    return _storage.list_notifications(None)


def get_provider_settings() -> Dict[str, Any]:
    return {'active_provider': get_effective_provider_name(), 'configured_provider': settings.data_provider}


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
        },
        "model": model_status(),
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
        "ready": ready,
    }
