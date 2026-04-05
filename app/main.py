from __future__ import annotations

from pathlib import Path
from typing import Any, Dict, Optional

from fastapi import Body, FastAPI, Header, HTTPException, Query, Request
from fastapi.openapi.utils import get_openapi
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates

from .config import settings
from .services import data_service

BASE_DIR = Path(__file__).resolve().parent.parent

app = FastAPI(
    title="CSE AI Analyzer",
    description="CSE market analytics backend with  real-data support, admin status, watchlists, and ML prediction.",
    version="0.5.0",
)


def _custom_openapi() -> Dict[str, Any]:
    if app.openapi_schema:
        return app.openapi_schema
    app.openapi_schema = get_openapi(
        title="CSE AI Analyzer",
        version=app.version,
        description=app.description,
        routes=app.routes,
    )
    return app.openapi_schema


app.openapi = _custom_openapi

app.mount("/static", StaticFiles(directory=Path(__file__).resolve().parent / "static"), name="static")
templates = Jinja2Templates(directory=str(Path(__file__).resolve().parent / "templates"))


def _check_admin_key(request: Request, x_admin_key: Optional[str] = None) -> None:
    required = settings.admin_api_key
    if not required:
        return
    provided = x_admin_key or request.headers.get("X-Admin-Key") or request.query_params.get("admin_key")
    if provided != required:
        raise HTTPException(status_code=401, detail="Admin key required")


# ---- Pages ----
@app.get("/", response_class=HTMLResponse)
def page_home(request: Request):
    comps = data_service.companies()
    symbols = [c["symbol"] for c in comps][:80]
    return templates.TemplateResponse(request, "index.html", {"title": "Dashboard", "symbols": symbols})


@app.get("/stock/{symbol}", response_class=HTMLResponse)
def page_stock(symbol: str, request: Request):
    company = data_service.stock(symbol)
    return templates.TemplateResponse(
        request,
        "stock.html",
        {"title": f"{company.get('symbol', symbol.upper())} — {company.get('name','Stock')}", "company": company},
    )


@app.get("/screener", response_class=HTMLResponse)
def page_screener(request: Request):
    return templates.TemplateResponse(request, "screener.html", {"title": "Screener"})


@app.get("/announcements", response_class=HTMLResponse)
def page_announcements(request: Request):
    return templates.TemplateResponse(request, "announcements.html", {"title": "Announcements"})


@app.get("/admin/status", response_class=HTMLResponse)
def page_admin_status(request: Request, x_admin_key: Optional[str] = Header(default=None)):
    _check_admin_key(request, x_admin_key)
    return templates.TemplateResponse(request, "admin_status.html", {"title": "Admin status", "admin_protected": bool(settings.admin_api_key)})


# ---- API: health ----
@app.get("/healthz")
def healthz():
    return {"ok": True, "service": "cse-ai-analyzer", "version": app.version}


@app.get("/readyz")
def readyz():
    status = data_service.system_status()
    return {"ok": bool(status.get("ready")), **status}


# ---- API: Meta ----
@app.get("/api/provider")
def api_provider():
    return {"provider": data_service.get_provider().name}


@app.get("/api/model/status")
def api_model_status():
    return data_service.model_status()


@app.get("/api/system/status")
def api_system_status():
    return data_service.system_status()


@app.get("/api/admin/status")
def api_admin_status(request: Request, x_admin_key: Optional[str] = Header(default=None)):
    _check_admin_key(request, x_admin_key)
    return data_service.admin_status()


# ---- API: Market ----
@app.get("/api/market/overview")
def api_market_overview():
    return data_service.market_overview()


@app.get("/api/indices")
def api_indices():
    return data_service.indices()


# ---- API: Stocks ----
@app.get("/api/stocks")
def api_stocks(limit: int = Query(500, ge=1, le=5000)):
    return {"stocks": data_service.stock_snapshots(limit=limit)}


@app.get("/api/companies/search")
def api_company_search(q: str = Query("", min_length=0, max_length=50), limit: int = Query(20, ge=1, le=50)):
    return {"results": data_service.company_search(q, limit=limit)}


@app.get("/api/stock/{symbol}")
def api_stock(symbol: str):
    return data_service.stock(symbol)


@app.get("/api/stock/{symbol}/history")
def api_stock_history(symbol: str, days: int = Query(180, ge=20, le=780)):
    return data_service.stock_history_chart(symbol, days=days)


@app.get("/api/stock/{symbol}/prediction")
def api_stock_prediction(symbol: str, horizon: str = Query("1D")):
    pred = data_service.prediction(symbol)
    if not pred.get("available"):
        return {"symbol": symbol.upper(), **pred, "horizon": "1D", "horizon_days": 1}

    h_days = 1

    def _compound(r: float, n: int) -> float:
        rr = max(float(r), -0.95)
        return (1.0 + rr) ** n - 1.0

    r = _compound(pred["predicted_return"], h_days)
    p10 = _compound(pred["band"]["p10"], h_days)
    p90 = _compound(pred["band"]["p90"], h_days)
    hist1 = data_service.stock_history(symbol, days=5)
    last_close = hist1[-1]["close"] if hist1 else None
    scale_factor, scale_reason = data_service._detect_price_scale(symbol, float(last_close) if last_close is not None else None)  # type: ignore[attr-defined]
    price = (float(last_close) * (1.0 + r)) if last_close is not None else None
    price_band = {
        "p10": (float(last_close) * (1.0 + p10)) if last_close is not None else None,
        "p90": (float(last_close) * (1.0 + p90)) if last_close is not None else None,
    }
    if price is not None and scale_factor != 1.0:
        price *= scale_factor
    if price_band["p10"] is not None and scale_factor != 1.0:
        price_band["p10"] *= scale_factor
    if price_band["p90"] is not None and scale_factor != 1.0:
        price_band["p90"] *= scale_factor

    return {
        "symbol": symbol.upper(),
        **pred,
        "horizon": horizon if str(horizon).upper() == "1D" else "1D",
        "horizon_days": h_days,
        "predicted_return": round(r, 6),
        "band": {"p10": round(p10, 6), "p90": round(p90, 6)},
        "predicted_price": None if price is None else round(price, 4),
        "price_band": {"p10": None if price_band["p10"] is None else round(price_band["p10"], 4), "p90": None if price_band["p90"] is None else round(price_band["p90"], 4)},
        "scale_factor": scale_factor,
        "scale_reason": scale_reason,
    }


@app.get("/api/signals/top")
def api_top_signals(limit: int = Query(5, ge=1, le=50)):
    return {"signals": data_service.top_signals(limit=limit)}


# ---- API: Screener ----
@app.get("/api/screener")
def api_screener(
    sector: Optional[str] = None,
    min_volume: int = Query(0, ge=0),
    min_change_pct: float = Query(-100.0, ge=-100.0, le=100.0),
    max_change_pct: float = Query(100.0, ge=-100.0, le=100.0),
):
    rows = []
    for snap in data_service.stock_snapshots():
        if sector and (snap.get("sector") or "").lower() != sector.lower():
            continue
        if (_safe_num(snap.get("volume")) or 0) < min_volume:
            continue
        cp = _safe_num(snap.get("change_pct"))
        if cp is None:
            continue
        if not (min_change_pct <= cp <= max_change_pct):
            continue
        rows.append(snap)
    rows.sort(key=lambda x: (_safe_num(x.get("last")) or 0) * (_safe_num(x.get("volume")) or 0), reverse=True)
    return {"count": len(rows), "results": rows}


@app.get("/api/announcements")
def api_announcements(symbol: Optional[str] = None, limit: int = Query(50, ge=1, le=200)):
    anns = data_service.announcements(symbol, limit)
    return {"count": min(len(anns), limit), "announcements": anns[:limit]}


# ---- API: User state ----
@app.get("/api/watchlist")
def api_watchlist(profile: str = Query("default")):
    return data_service.get_watchlist(profile)


@app.post("/api/watchlist")
def api_watchlist_update(payload: Dict[str, Any] = Body(...)):
    symbol = str(payload.get("symbol") or "").upper().strip()
    add = bool(payload.get("add", True))
    profile = str(payload.get("profile") or "default")
    if not symbol:
        return {"error": "symbol is required", **data_service.get_watchlist(profile)}
    return data_service.update_watchlist(symbol=symbol, add=add, profile=profile)


@app.get("/api/preferences")
def api_preferences(profile: str = Query("default")):
    return data_service.get_preferences(profile)


@app.post("/api/preferences")
def api_preferences_update(payload: Dict[str, Any] = Body(...)):
    profile = str(payload.get("profile") or "default")
    values = payload.get("preferences") if isinstance(payload.get("preferences"), dict) else {}
    return data_service.set_preferences(values=values, profile=profile)


def _safe_num(v: Any) -> Optional[float]:
    try:
        return float(v) if v is not None else None
    except Exception:
        return None
