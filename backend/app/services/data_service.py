from __future__ import annotations

import csv
import io
import math
import statistics
from datetime import date, timedelta
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional, Tuple

from fastapi import HTTPException, UploadFile

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




def _official_cse_profile_url(symbol: str) -> str:
    return f"https://www.cse.lk/pages/company-profile/company-profile.component.html?symbol={(symbol or '').upper()}"


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


def get_portfolio(username: str) -> Dict[str, Any]:
    transactions = _storage.list_portfolio_transactions(username)
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
    summary = {
        "positions_count": len(positions),
        "transactions_count": len(transactions),
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
        "summary": summary,
        "positions": positions,
        "transactions": transactions_sorted,
        "recent_actions": recent_actions,
    }


def get_portfolio_performance(username: str, days: int = 365) -> Dict[str, Any]:
    transactions = _storage.list_portfolio_transactions(username)
    if not transactions:
        return {"days": days, "series": []}

    ordered_txs = sorted(transactions, key=_portfolio_sort_key)
    symbols = sorted({str(item.get("symbol") or "").upper() for item in ordered_txs if item.get("symbol")})
    action_map = _load_actions_by_symbol(symbols)
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
    action_dates = [date.fromisoformat(str(item.get("ex_date") or "")[:10]) for rows in action_map.values() for item in rows if str(item.get("ex_date") or "")[:10]]

    latest_history_date = max(history_dates)
    earliest_event_date = min(tx_dates + action_dates) if action_dates else min(tx_dates)
    start_date = max(earliest_event_date, latest_history_date - timedelta(days=max(days - 1, 0)))
    market_dates = sorted({d for d in history_dates if d >= start_date})
    if not market_dates:
        return {"days": days, "series": []}

    tx_by_date: Dict[date, List[Dict[str, Any]]] = {}
    for tx in ordered_txs:
        raw_day = str(tx.get("traded_at") or tx.get("created_at") or "")[:10]
        if raw_day:
            tx_by_date.setdefault(date.fromisoformat(raw_day), []).append(tx)
    actions_by_date: Dict[date, List[Dict[str, Any]]] = {}
    for rows in action_map.values():
        for action in rows:
            raw_day = str(action.get("ex_date") or "")[:10]
            if raw_day:
                actions_by_date.setdefault(date.fromisoformat(raw_day), []).append(action)

    positions: Dict[str, Dict[str, float]] = {}
    last_close: Dict[str, float] = {}
    series: List[Dict[str, Any]] = []
    for market_day in market_dates:
        for action in sorted(actions_by_date.get(market_day, []), key=lambda item: (str(item.get("symbol") or ""), str(item.get("action_id") or ""))):
            symbol = str(action.get("symbol") or "").upper().strip()
            pos = positions.setdefault(symbol, {"quantity": 0.0, "cost_total": 0.0, "realized_pl": 0.0, "dividend_income": 0.0})
            held_qty = float(pos.get("quantity") or 0.0)
            if held_qty <= 0:
                continue
            action_type = str(action.get("action_type") or "").lower().strip()
            if action_type == "dividend":
                amount = float(_to_float(action.get("amount")) or 0.0)
                pos["dividend_income"] += held_qty * amount
            elif action_type in {"split", "bonus"}:
                ratio = _action_ratio(action)
                if ratio > 0 and abs(ratio - 1.0) > 1e-9:
                    pos["quantity"] = held_qty * ratio
        for tx in sorted(tx_by_date.get(market_day, []), key=_portfolio_sort_key):
            symbol = str(tx.get("symbol") or "").upper().strip()
            if not symbol:
                continue
            tx_type = str(tx.get("tx_type") or tx.get("type") or "buy").lower().strip()
            quantity = float(tx.get("quantity") or 0.0)
            price = float(tx.get("price") or 0.0)
            fees = float(tx.get("fees") or 0.0)
            pos = positions.setdefault(symbol, {"quantity": 0.0, "cost_total": 0.0, "realized_pl": 0.0, "dividend_income": 0.0})
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
        series.append({
            "date": market_day.isoformat(),
            "market_value": round(total_market_value, 4),
            "cost_basis": round(total_cost_basis, 4),
            "realized_pl": round(total_realized, 4),
            "unrealized_pl": round(unrealized, 4),
            "dividend_income": round(total_dividends, 4),
            "total_pl": round(unrealized + total_realized, 4),
            "total_return": round(unrealized + total_realized + total_dividends, 4),
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


def get_portfolio_analytics(username: str, days: int = 365) -> Dict[str, Any]:
    portfolio = get_portfolio(username)
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
            next_rows.append(dict(row))
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


def _parse_portfolio_csv(file: UploadFile) -> List[Dict[str, Any]]:
    if hasattr(file.file, "seek"):
        file.file.seek(0)
    payload = file.file.read()
    text = payload.decode("utf-8", errors="replace") if isinstance(payload, (bytes, bytearray)) else str(payload)
    reader = csv.DictReader(io.StringIO(text))
    rows: List[Dict[str, Any]] = []
    for row in reader:
        symbol = str(row.get("symbol") or row.get("Symbol") or row.get("ticker") or row.get("Ticker") or "").upper().strip()
        tx_type = str(row.get("tx_type") or row.get("type") or row.get("Type") or row.get("side") or row.get("Side") or "buy").lower().strip()
        if tx_type in {"b", "buy"}:
            tx_type = "buy"
        elif tx_type in {"s", "sell"}:
            tx_type = "sell"
        rows.append({
            "symbol": symbol,
            "tx_type": tx_type,
            "quantity": _to_float(row.get("quantity") or row.get("Quantity") or row.get("qty") or row.get("Qty")),
            "price": _to_float(row.get("price") or row.get("Price") or row.get("rate") or row.get("Rate")),
            "fees": _to_float(row.get("fees") or row.get("Fees") or row.get("commission") or row.get("Commission") or 0),
            "traded_at": str(row.get("traded_at") or row.get("trade_date") or row.get("Trade Date") or row.get("date") or row.get("Date") or "").strip() or None,
            "notes": str(row.get("notes") or row.get("Notes") or "").strip() or None,
        })
    return rows


def preview_portfolio_import(file: UploadFile) -> Dict[str, Any]:
    rows = _parse_portfolio_csv(file)
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
    }
    return {"ok": len(errors) == 0, "preview": preview}


def import_portfolio_transactions(username: str, file: UploadFile) -> Dict[str, Any]:
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
    existing = _storage.list_portfolio_transactions(username)
    next_rows = list(existing) + valid_rows
    _validate_portfolio_sequence(next_rows)
    imported = 0
    for row in valid_rows:
        _storage.create_portfolio_transaction(username, row["symbol"], row["tx_type"], row["quantity"], row["price"], fees=row["fees"], traded_at=row["traded_at"], notes=row["notes"])
        imported += 1
    result = get_portfolio(username)
    result["imported_rows"] = imported
    return result



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
