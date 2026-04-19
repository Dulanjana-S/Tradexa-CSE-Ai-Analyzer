from __future__ import annotations

import argparse
from pathlib import Path
from typing import Any, Dict, Optional

from fastapi import Body, FastAPI, Header, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.openapi.utils import get_openapi
from fastapi.responses import HTMLResponse, JSONResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates

from .cli import cmd_sync, cmd_train
from .config import settings
from .services import data_service
from .services.auth_service import SESSION_COOKIE, change_password, create_user, current_user_from_request, ensure_bootstrap_admin, list_users, login, logout, require_admin, require_user, set_role, update_profile

BASE_DIR = Path(__file__).resolve().parent.parent

app = FastAPI(
    title="CSE AI Analyzer",
    description="CSE market analytics backend with live data support, auth, admin controls, and ML prediction.",
    version="0.7.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in settings.frontend_origins.split(',') if o.strip()],
    allow_credentials=True,
    allow_methods=['*'],
    allow_headers=['*'],
)


def _custom_openapi() -> Dict[str, Any]:
    if app.openapi_schema:
        return app.openapi_schema
    app.openapi_schema = get_openapi(title=app.title, version=app.version, description=app.description, routes=app.routes)
    return app.openapi_schema


app.openapi = _custom_openapi
app.mount("/static", StaticFiles(directory=Path(__file__).resolve().parent / "static"), name="static")
templates = Jinja2Templates(directory=str(Path(__file__).resolve().parent / "templates"))
ensure_bootstrap_admin()


def _render(request: Request, template: str, context: Optional[Dict[str, Any]] = None, status_code: int = 200):
    user = current_user_from_request(request)
    base = {"request": request, "current_user": user, "is_admin": bool(user and user.get("role") == "admin")}
    if context:
        base.update(context)
    return templates.TemplateResponse(request, template, base, status_code=status_code)




def _find_user_by_email(email: str) -> Optional[Dict[str, Any]]:
    wanted = (email or '').strip().lower()
    if not wanted:
        return None
    for user in list_users():
        if str(user.get('email') or '').strip().lower() == wanted:
            return user
    return None


def _derive_username(payload: Dict[str, Any]) -> str:
    username = str(payload.get('username') or '').strip().lower()
    if username:
        return username
    email = str(payload.get('email') or '').strip().lower()
    if email and '@' in email:
        base = ''.join(ch for ch in email.split('@', 1)[0] if ch.isalnum() or ch in {'_', '-'}) or 'user'
    else:
        name = str(payload.get('name') or payload.get('display_name') or '').strip().lower()
        base = ''.join(ch for ch in name.replace(' ', '_') if ch.isalnum() or ch in {'_', '-'}) or 'user'
    existing = {str(u.get('username') or '').lower() for u in list_users()}
    if base not in existing:
        return base
    idx = 2
    while f"{base}{idx}" in existing:
        idx += 1
    return f"{base}{idx}"


def _system_settings_defaults() -> Dict[str, Any]:
    return {
        'siteName': 'TradexaLK',
        'supportEmail': 'support@tradexalk.com',
        'timezone': 'Asia/Colombo',
        'maintenanceMode': False,
        'sessionTimeout': '30',
        'maxLoginAttempts': '5',
        'passwordMinLength': '8',
        'requireTwoFactor': False,
        'autoSync': True,
        'syncInterval': '60',
        'maxRetries': '3',
        'syncNotifications': True,
        'emailNotifications': True,
        'pushNotifications': False,
        'smsNotifications': False,
        'notificationDelay': '5',
        'cacheEnabled': True,
        'cacheDuration': '3600',
        'rateLimitPerMinute': '60',
        'apiTimeout': '30',
        'provider': data_service.get_effective_provider_name() if hasattr(data_service, 'get_effective_provider_name') else settings.data_provider,
    }


def _system_settings() -> Dict[str, Any]:
    values = data_service.get_preferences('__system__').get('preferences') or {}
    defaults = _system_settings_defaults()
    defaults.update(values)
    defaults['provider'] = values.get('provider') or defaults.get('provider')
    return defaults

def _check_admin_access(request: Request, x_admin_key: Optional[str] = None) -> Dict[str, Any]:
    user = current_user_from_request(request)
    if user and user.get("role") == "admin":
        return user
    required = settings.admin_api_key
    provided = x_admin_key or request.headers.get("X-Admin-Key") or request.query_params.get("admin_key")
    if required and provided == required:
        return {"username": "api-key-admin", "role": "admin"}
    raise HTTPException(status_code=401, detail="Admin access required")


# ---- Pages ----
@app.get("/", response_class=HTMLResponse)
def page_home(request: Request):
    comps = data_service.companies()
    symbols = [c["symbol"] for c in comps][:80]
    return _render(request, "index.html", {"title": "Dashboard", "symbols": symbols})


@app.get("/login", response_class=HTMLResponse)
def page_login(request: Request):
    if current_user_from_request(request):
        return RedirectResponse(url="/", status_code=302)
    return _render(request, "login.html", {"title": "Login"})


@app.get("/register", response_class=HTMLResponse)
def page_register(request: Request):
    if current_user_from_request(request):
        return RedirectResponse(url="/", status_code=302)
    return _render(request, "register.html", {"title": "Register"})


@app.get("/profile", response_class=HTMLResponse)
def page_profile(request: Request):
    user = require_user(request)
    prefs = data_service.get_preferences(user["username"])
    return _render(request, "profile.html", {"title": "Profile", "profile_user": user, "preferences": prefs.get("preferences") or {}})


@app.get("/watchlist", response_class=HTMLResponse)
def page_watchlist(request: Request):
    user = require_user(request)
    return _render(request, "watchlist.html", {"title": "Watchlist", "watchlist_profile": user["username"]})


@app.get("/stock/{symbol}", response_class=HTMLResponse)
def page_stock(symbol: str, request: Request):
    company = data_service.stock(symbol)
    return _render(request, "stock.html", {"title": f"{company.get('symbol', symbol.upper())} — {company.get('name','Stock')}", "company": company})


@app.get("/screener", response_class=HTMLResponse)
def page_screener(request: Request):
    return _render(request, "screener.html", {"title": "Screener"})


@app.get("/announcements", response_class=HTMLResponse)
def page_announcements(request: Request):
    return _render(request, "announcements.html", {"title": "Announcements"})


@app.get("/admin/status", response_class=HTMLResponse)
def page_admin_status(request: Request, x_admin_key: Optional[str] = Header(default=None)):
    _check_admin_access(request, x_admin_key)
    return _render(request, "admin_status.html", {"title": "Admin status", "admin_protected": True})


# ---- API: auth ----
@app.get("/api/auth/me")
def api_auth_me(request: Request):
    user = current_user_from_request(request)
    return {"authenticated": bool(user), "user": user}


@app.post("/api/auth/register")
def api_auth_register(payload: Dict[str, Any] = Body(...)):
    username = _derive_username(payload)
    display_name = payload.get('display_name') or payload.get('name') or username
    user = create_user(username, str(payload.get("password") or ""), role="user", display_name=display_name, email=payload.get("email"))
    return {"ok": True, "user": user}


@app.post("/api/auth/login")
def api_auth_login(payload: Dict[str, Any] = Body(...)):
    identifier = str(payload.get("username") or payload.get('email') or "").strip()
    resolved = identifier
    if '@' in identifier:
        matched = _find_user_by_email(identifier)
        if matched and matched.get('username'):
            resolved = str(matched['username'])
        else:
            resolved = identifier.split('@', 1)[0]
    result = login(resolved, str(payload.get("password") or ""))
    resp = JSONResponse({"ok": True, "user": result["user"], "expires_at": result["expires_at"]})
    resp.set_cookie(SESSION_COOKIE, result["session_id"], httponly=True, samesite="lax", secure=False, max_age=settings.session_ttl_days * 86400)
    return resp


@app.post("/api/auth/logout")
def api_auth_logout(request: Request):
    sid = request.cookies.get(SESSION_COOKIE)
    logout(sid)
    resp = JSONResponse({"ok": True})
    resp.delete_cookie(SESSION_COOKIE)
    return resp


@app.post("/api/auth/change-password")
def api_auth_change_password(request: Request, payload: Dict[str, Any] = Body(...)):
    user = require_user(request)
    change_password(user['username'], str(payload.get('current_password') or ''), str(payload.get('new_password') or ''))
    return {'ok': True}


@app.post("/api/profile")
def api_profile_update(request: Request, payload: Dict[str, Any] = Body(...)):
    user = require_user(request)
    updated = update_profile(user['username'], display_name=payload.get('display_name'), email=payload.get('email'))
    return {'ok': True, 'user': updated}


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
    _check_admin_access(request, x_admin_key)
    return data_service.admin_status()


@app.get("/api/admin/models")
def api_admin_models(request: Request, x_admin_key: Optional[str] = Header(default=None)):
    _check_admin_access(request, x_admin_key)
    return {"models": data_service.list_models(), "active_model": data_service.admin_status().get("active_model")}


@app.post("/api/admin/models/{model_id}/activate")
def api_admin_activate_model(model_id: str, request: Request, x_admin_key: Optional[str] = Header(default=None)):
    _check_admin_access(request, x_admin_key)
    if not data_service.activate_model(model_id):
        raise HTTPException(status_code=404, detail="Model not found")
    return {"ok": True, "active_model": model_id}


@app.get("/api/admin/users")
def api_admin_users(request: Request, x_admin_key: Optional[str] = Header(default=None)):
    _check_admin_access(request, x_admin_key)
    return {"users": list_users()}


@app.post("/api/admin/users/{username}/role")
def api_admin_set_role(username: str, request: Request, payload: Dict[str, Any] = Body(...), x_admin_key: Optional[str] = Header(default=None)):
    _check_admin_access(request, x_admin_key)
    set_role(username, str(payload.get("role") or "user"))
    return {"ok": True, "users": list_users()}


@app.post("/api/admin/actions/sync")
def api_admin_run_sync(request: Request, payload: Dict[str, Any] = Body(default={}), x_admin_key: Optional[str] = Header(default=None)):
    _check_admin_access(request, x_admin_key)
    args = argparse.Namespace(symbols=payload.get("symbols"), top_n=int(payload.get("top_n") or 50), days=int(payload.get("days") or 520), announcements=int(payload.get("announcements") or 100), skip_prices=bool(payload.get("skip_prices", False)), sleep_ms=int(payload.get("sleep_ms") or 250))
    cmd_sync(args)
    return {"ok": True, "admin_status": data_service.admin_status()}


@app.post("/api/admin/actions/train")
def api_admin_run_train(request: Request, payload: Dict[str, Any] = Body(default={}), x_admin_key: Optional[str] = Header(default=None)):
    _check_admin_access(request, x_admin_key)
    args = argparse.Namespace(symbols=payload.get("symbols"), horizon_days=int(payload.get("horizon_days") or 1))
    cmd_train(args)
    return {"ok": True, "model": data_service.model_status(), "models": data_service.list_models()}


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
    price_band = {"p10": (float(last_close) * (1.0 + p10)) if last_close is not None else None, "p90": (float(last_close) * (1.0 + p90)) if last_close is not None else None}
    if price is not None and scale_factor != 1.0:
        price *= scale_factor
    if price_band["p10"] is not None and scale_factor != 1.0:
        price_band["p10"] *= scale_factor
    if price_band["p90"] is not None and scale_factor != 1.0:
        price_band["p90"] *= scale_factor

    return {"symbol": symbol.upper(), **pred, "horizon": horizon if str(horizon).upper() == "1D" else "1D", "horizon_days": h_days, "predicted_return": round(r, 6), "band": {"p10": round(p10, 6), "p90": round(p90, 6)}, "predicted_price": None if price is None else round(price, 4), "price_band": {"p10": None if price_band["p10"] is None else round(price_band["p10"], 4), "p90": None if price_band["p90"] is None else round(price_band["p90"], 4)}, "scale_factor": scale_factor, "scale_reason": scale_reason}


@app.get("/api/signals/top")
def api_top_signals(limit: int = Query(5, ge=1, le=50)):
    return {"signals": data_service.top_signals(limit=limit)}


# ---- API: Screener ----
@app.get("/api/screener")
def api_screener(sector: Optional[str] = None, min_volume: int = Query(0, ge=0), min_change_pct: float = Query(-100.0, ge=-100.0, le=100.0), max_change_pct: float = Query(100.0, ge=-100.0, le=100.0)):
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
def api_announcements(symbol: Optional[str] = None, limit: int = Query(50, ge=1, le=200), important_only: bool = Query(False), category: Optional[str] = Query(None)):
    categories = [category] if category else None
    anns = data_service.announcements_filtered(symbol, limit, important_only=important_only, categories=categories)
    return {"count": min(len(anns), limit), "announcements": anns[:limit]}


# ---- API: User state ----
@app.get("/api/watchlist")
def api_watchlist(request: Request, profile: Optional[str] = Query(None)):
    user = current_user_from_request(request)
    resolved = profile or (user["username"] if user else "default")
    return data_service.get_watchlist(resolved)


@app.post("/api/watchlist")
def api_watchlist_update(request: Request, payload: Dict[str, Any] = Body(...)):
    user = current_user_from_request(request)
    resolved_profile = str(payload.get("profile") or (user["username"] if user else "default"))
    symbol = str(payload.get("symbol") or "").upper().strip()
    add = bool(payload.get("add", True))
    if not symbol:
        return {"error": "symbol is required", **data_service.get_watchlist(resolved_profile)}
    return data_service.update_watchlist(symbol=symbol, add=add, profile=resolved_profile)


@app.get("/api/preferences")
def api_preferences(request: Request, profile: Optional[str] = Query(None)):
    user = current_user_from_request(request)
    resolved = profile or (user["username"] if user else "default")
    return data_service.get_preferences(resolved)


@app.post("/api/preferences")
def api_preferences_update(request: Request, payload: Dict[str, Any] = Body(...)):
    user = current_user_from_request(request)
    profile = str(payload.get("profile") or (user["username"] if user else "default"))
    values = payload.get("preferences") if isinstance(payload.get("preferences"), dict) else {}
    return data_service.set_preferences(values=values, profile=profile)


@app.get("/api/settings")
def api_settings(request: Request):
    user = require_user(request)
    return data_service.get_user_settings(user['username'])


@app.post("/api/settings")
def api_settings_update(request: Request, payload: Dict[str, Any] = Body(...)):
    user = require_user(request)
    values = payload.get('settings') if isinstance(payload.get('settings'), dict) else payload
    return data_service.update_user_settings(user['username'], values)


@app.get("/api/alerts")
def api_alerts(request: Request):
    user = require_user(request)
    return {'alerts': data_service.list_alerts(user['username'])}


@app.post("/api/alerts")
def api_alerts_create(request: Request, payload: Dict[str, Any] = Body(...)):
    user = require_user(request)
    return data_service.create_alert(user['username'], payload)


@app.patch("/api/alerts/{alert_id}")
def api_alerts_update(alert_id: str, request: Request, payload: Dict[str, Any] = Body(...)):
    user = require_user(request)
    return data_service.update_alert(user['username'], alert_id, payload)


@app.delete("/api/alerts/{alert_id}")
def api_alerts_delete(alert_id: str, request: Request):
    user = require_user(request)
    return data_service.delete_alert(user['username'], alert_id)


@app.get("/api/notifications")
def api_notifications(request: Request, unread_only: bool = Query(False)):
    user = require_user(request)
    return {'notifications': data_service.list_notifications(user['username'], unread_only=unread_only)}


@app.patch("/api/notifications/{notification_id}/read")
def api_notifications_read(notification_id: str, request: Request):
    user = require_user(request)
    return data_service.mark_notification_read(user['username'], notification_id)


@app.post("/api/notifications/read-all")
def api_notifications_read_all(request: Request):
    user = require_user(request)
    return data_service.mark_all_notifications_read(user['username'])


@app.get("/api/admin/jobs")
def api_admin_jobs(request: Request, x_admin_key: Optional[str] = Header(default=None), limit: int = Query(100, ge=1, le=500)):
    _check_admin_access(request, x_admin_key)
    return {'jobs': data_service.admin_jobs(limit)}


@app.get("/api/admin/provider")
def api_admin_provider(request: Request, x_admin_key: Optional[str] = Header(default=None)):
    _check_admin_access(request, x_admin_key)
    return data_service.get_provider_settings()


@app.post("/api/admin/provider")
def api_admin_provider_set(request: Request, payload: Dict[str, Any] = Body(...), x_admin_key: Optional[str] = Header(default=None)):
    _check_admin_access(request, x_admin_key)
    active = data_service.set_effective_provider_name(str(payload.get('provider') or 'hybrid'))
    data_service.clear_runtime_cache()
    return {'ok': True, 'active_provider': active}


@app.get("/api/admin/alerts")
def api_admin_alerts(request: Request, x_admin_key: Optional[str] = Header(default=None)):
    _check_admin_access(request, x_admin_key)
    return {'alerts': data_service.admin_alerts()}


@app.get("/api/admin/notifications")
def api_admin_notifications(request: Request, x_admin_key: Optional[str] = Header(default=None)):
    _check_admin_access(request, x_admin_key)
    return {'notifications': data_service.admin_notifications()}


@app.get("/api/admin/announcements/review")
def api_admin_ann_review(request: Request, x_admin_key: Optional[str] = Header(default=None), limit: int = Query(100, ge=1, le=500), important_only: bool = Query(False)):
    _check_admin_access(request, x_admin_key)
    return {'announcements': data_service.announcements_filtered(None, limit, important_only=important_only)}


@app.patch("/api/admin/announcements/{ann_id}")
def api_admin_ann_update(ann_id: str, request: Request, payload: Dict[str, Any] = Body(...), x_admin_key: Optional[str] = Header(default=None)):
    admin = _check_admin_access(request, x_admin_key)
    tags = payload.get('tags') if isinstance(payload.get('tags'), list) else None
    return data_service.review_announcement(ann_id, importance=payload.get('importance'), review_status=payload.get('review_status'), tags=tags, review_notes=payload.get('review_notes'), reviewed_by=str(admin.get('username') or 'admin'))




@app.get('/api/admin/system-settings')
def api_admin_system_settings(request: Request, x_admin_key: Optional[str] = Header(default=None)):
    _check_admin_access(request, x_admin_key)
    return {'settings': _system_settings()}


@app.post('/api/admin/system-settings')
def api_admin_system_settings_update(request: Request, payload: Dict[str, Any] = Body(...), x_admin_key: Optional[str] = Header(default=None)):
    _check_admin_access(request, x_admin_key)
    values = payload.get('settings') if isinstance(payload.get('settings'), dict) else payload
    current = _system_settings()
    current.update(values or {})
    provider = str(current.get('provider') or settings.data_provider)
    try:
        active = data_service.set_effective_provider_name(provider)
        current['provider'] = active
    except Exception:
        pass
    data_service.set_preferences(current, profile='__system__')
    return {'ok': True, 'settings': _system_settings()}

def _safe_num(v: Any) -> Optional[float]:
    try:
        return float(v) if v is not None else None
    except Exception:
        return None
