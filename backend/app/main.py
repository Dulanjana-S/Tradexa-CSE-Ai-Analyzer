from __future__ import annotations

import json

import shutil
import tempfile
import zipfile
from pathlib import Path
from typing import Any, Dict, List, Optional

from fastapi import BackgroundTasks, Body, Depends, FastAPI, File, Form, Header, HTTPException, Query, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.openapi.utils import get_openapi
from fastapi.responses import JSONResponse, Response
from fastapi.encoders import jsonable_encoder


from .config import settings
from .import_tools import persist_upload_zip, preview_dataset
from .intelligence import parse_macro_csv_bytes, preview_macro_rows
from .jobs import enqueue_daily_pipeline, enqueue_import, enqueue_sync, enqueue_sync_train, run_train_now, start_job_system
from .services import data_service
from .services.assistant_service import chat_assistant
from .services.auth_service import SESSION_COOKIE, change_password, complete_password_reset, create_user, current_user_from_request, ensure_bootstrap_admin, is_staff_role, list_users, login, logout, require_user, set_role, start_password_reset, update_profile
from .rate_limit import rate_limit_auth, generate_captcha, verify_captcha

BASE_DIR = Path(__file__).resolve().parent.parent

app = FastAPI(
    title="TradexaLK — CSE AI Analytics",
    description="Professional AI analytics platform for the Colombo Stock Exchange. Live market data, ML predictions, portfolio management, and alerts.",
    version="1.0.0",
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
ensure_bootstrap_admin()
start_job_system()




def _find_user_by_email(email: str) -> Optional[Dict[str, Any]]:
    wanted = (email or '').strip().lower()
    if not wanted:
        return None
    for user in list_users():
        if str(user.get('email') or '').strip().lower() == wanted:
            return user
    return None


def _find_user(identifier: str) -> Optional[Dict[str, Any]]:
    ident = (identifier or '').strip().lower()
    if not ident:
        return None
    if '@' in ident:
        return _find_user_by_email(ident)
    for user in list_users():
        if str(user.get('username') or '').strip().lower() == ident:
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
        'dailyPipelineEnabled': True,
        'dailyPipelineTime': '18:10',
        'dailyPipelineTrain': True,
        'dailyPipelineTopN': '80',
        'dailyPipelineDays': '520',
        'dailyPipelineAnnouncements': '100',
        'dailyPipelineHorizonDays': '1',
        'dailyPipelineSleepMs': '250',
        'dailyPipelineIncludeStoredSymbols': True,
        'syncNotifications': True,
        'emailNotifications': True,
        'pushNotifications': False,
        'smsNotifications': False,
        'notificationDelay': '5',
        'userAlertsEnabled': True,
        'alertEvaluationIntervalSeconds': '60',
        'notificationDeliveryBatchSize': '50',
        'cacheEnabled': True,
        'cacheDuration': '3600',
        'rateLimitPerMinute': '60',
        'apiTimeout': '30',
        'provider': data_service.get_effective_provider_name() if hasattr(data_service, 'get_effective_provider_name') else settings.data_provider,
    }


def _normalize_system_setting_value(key: str, value: Any, default: Any) -> Any:
    bool_keys = {
        'maintenanceMode', 'requireTwoFactor', 'autoSync', 'dailyPipelineEnabled', 'dailyPipelineTrain',
        'syncNotifications', 'emailNotifications', 'pushNotifications', 'smsNotifications',
        'cacheEnabled', 'userAlertsEnabled',
    }
    if key in bool_keys:
        return _to_bool(value, bool(default))
    return value


def _system_settings() -> Dict[str, Any]:
    raw_values = data_service.get_preferences('__system__') or {}
    values = raw_values.get('preferences') if isinstance(raw_values.get('preferences'), dict) else raw_values
    defaults = _system_settings_defaults()
    merged = dict(defaults)
    for key, default in defaults.items():
        merged[key] = _normalize_system_setting_value(key, values.get(key, default), default)
    merged['provider'] = values.get('provider') or merged.get('provider')
    return merged



def _to_bool(value: Any, default: bool = False) -> bool:
    if value is None:
        return default
    if isinstance(value, bool):
        return value
    return str(value).strip().lower() in {"1", "true", "yes", "on"}


def _latest_job_by_name(job_name: str) -> Optional[Dict[str, Any]]:
    jobs = data_service.admin_jobs(limit=200)
    for job in jobs:
        if str(job.get("job_name") or "").lower() == job_name.lower():
            return job
    return None


def _normalize_uploaded_dataset(files: List[UploadFile], work_dir: Path) -> tuple[Path, Dict[str, Any]]:
    if not files:
        raise HTTPException(status_code=400, detail="Upload at least one CSV or ZIP file")

    csv_names: List[str] = []
    zip_names: List[str] = []
    for upload in files:
        name = Path(upload.filename or "upload").name
        suffix = Path(name).suffix.lower()
        if suffix == ".csv":
            csv_names.append(name)
        elif suffix == ".zip":
            zip_names.append(name)
        else:
            raise HTTPException(status_code=400, detail=f"Unsupported file type: {name}. Use CSV or ZIP only.")

    if zip_names and csv_names:
        raise HTTPException(status_code=400, detail="Upload either one ZIP or one or more CSV files, not both together")
    if len(zip_names) > 1:
        raise HTTPException(status_code=400, detail="Upload a single ZIP file at a time")

    if zip_names:
        upload = files[0]
        zip_path = work_dir / Path(upload.filename or "dataset.zip").name
        with zip_path.open("wb") as fh:
            shutil.copyfileobj(upload.file, fh)
        return zip_path, {"mode": "zip", "files": zip_names, "csv_count": 0}

    zip_path = work_dir / "uploaded_dataset.zip"
    with zipfile.ZipFile(zip_path, "w", compression=zipfile.ZIP_DEFLATED) as zf:
        for upload in files:
            name = Path(upload.filename or "dataset.csv").name
            payload = upload.file.read()
            if not payload:
                continue
            zf.writestr(name, payload)
    return zip_path, {"mode": "csv_bundle", "files": csv_names, "csv_count": len(csv_names)}


def _uploads_dir() -> Path:
    uploads = BASE_DIR / "data" / "uploads"
    uploads.mkdir(parents=True, exist_ok=True)
    return uploads


def _check_admin_access(request: Request, x_admin_key: Optional[str] = None) -> Dict[str, Any]:
    user = current_user_from_request(request)
    if user and is_staff_role(user.get("role")):
        return user
    required = settings.admin_api_key
    provided = x_admin_key or request.headers.get("X-Admin-Key")
    if required and provided == required:
        return {"username": "api-key-admin", "role": "admin"}
    raise HTTPException(status_code=401, detail="Admin access required")


def _audit_admin_action(request: Request, actor: Dict[str, Any], action: str, *, target_type: Optional[str] = None, target_id: Optional[str] = None, status: str = 'success', details: Optional[Dict[str, Any]] = None) -> None:
    try:
        data_service._storage.record_audit_log(
            username=str(actor.get('username') or ''),
            role=str(actor.get('role') or ''),
            action=action,
            target_type=target_type,
            target_id=target_id,
            status=status,
            ip_address=(request.client.host if request.client else None),
            details=details or {},
        )
    except Exception:
        pass





# ---- API: auth ----
@app.get("/api/auth/captcha")
def api_auth_captcha():
    return generate_captcha()


@app.get("/api/auth/me")
def api_auth_me(request: Request):
    user = current_user_from_request(request)
    return {"authenticated": bool(user), "user": user}


@app.post("/api/auth/register", dependencies=[Depends(rate_limit_auth)])
def api_auth_register(payload: Dict[str, Any] = Body(...), background_tasks: BackgroundTasks = BackgroundTasks()):
    # captcha_id = payload.get("captcha_id")
    # captcha_answer = payload.get("captcha_answer")
    # if not verify_captcha(captcha_id, captcha_answer):
    #     raise HTTPException(status_code=400, detail="Invalid CAPTCHA")

    username = _derive_username(payload)
    display_name = payload.get('display_name') or payload.get('name') or username
    user = create_user(username, str(payload.get("password") or ""), role="user", display_name=display_name, email=payload.get("email"))
    if user.get("email"):
        from .services.auth_service import send_welcome_email
        background_tasks.add_task(send_welcome_email, str(user.get("email")), display_name)
    return jsonable_encoder({"ok": True, "user": user})


@app.post("/api/auth/login", dependencies=[Depends(rate_limit_auth)])
def api_auth_login(payload: Dict[str, Any] = Body(...)):
    # captcha_answer = payload.get("captcha_answer")
    # if not verify_captcha(None, captcha_answer):
    #     raise HTTPException(status_code=400, detail="Invalid CAPTCHA")

    identifier = str(payload.get("username") or payload.get('email') or "").strip()
    resolved = identifier
    if '@' in identifier:
        matched = _find_user_by_email(identifier)
        if matched and matched.get('username'):
            resolved = str(matched['username'])
        else:
            resolved = identifier.split('@', 1)[0]

    result = login(resolved, str(payload.get("password") or ""))

    content = jsonable_encoder({
        "ok": True,
        "user": result["user"],
        "expires_at": result["expires_at"],
    })

    resp = JSONResponse(content=content)
    resp.set_cookie(
        SESSION_COOKIE, result["session_id"],
        httponly=True,
        samesite=settings.session_cookie_samesite,
        secure=settings.session_cookie_secure,
        max_age=settings.session_ttl_days * 86400,
    )
    return resp

@app.post("/api/auth/logout")
def api_auth_logout(request: Request):
    sid = request.cookies.get(SESSION_COOKIE)
    logout(sid)
    resp = JSONResponse({"ok": True})
    resp.delete_cookie(SESSION_COOKIE)
    return resp


@app.post("/api/auth/forgot-password", dependencies=[Depends(rate_limit_auth)])
def api_auth_forgot_password(payload: Dict[str, Any] = Body(...)):
    identifier = str(payload.get("email") or payload.get("username") or "").strip()
    user = _find_user(identifier)
    if not user:
        return {"ok": True, "message": "If an account exists for that email, a reset link has been prepared."}
    
    result = start_password_reset(user)
    response = {"ok": True, "sent": result.get("sent", False)}
    
    if result.get("sent"):
        response["message"] = "A password reset link has been sent to your email address."
    else:
        response["message"] = "A password reset link has been prepared."
        # Only expose the link in API if explicitly allowed in config (dev mode)
        if settings.allow_password_reset_preview and result.get("preview_reset_link"):
            response["preview_reset_link"] = result.get("preview_reset_link")
            
    if result.get("expires_at"):
        response["expires_at"] = result.get("expires_at")
        
    return response


@app.post("/api/auth/reset-password")
def api_auth_reset_password(payload: Dict[str, Any] = Body(...)):
    token = str(payload.get("token") or "").strip()
    new_password = str(payload.get("new_password") or "")
    
    if not token:
        raise HTTPException(status_code=400, detail="Reset token is missing.")
    if len(new_password) < 6:
        raise HTTPException(status_code=400, detail="Password must be at least 6 characters.")
        
    success = complete_password_reset(token, new_password)
    if not success:
        raise HTTPException(
            status_code=400, 
            detail="Failed to reset password. The link may have expired or already been used."
        )
        
    return {"ok": True, "message": "Password has been reset successfully."}


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

@app.post("/api/contact")
def api_contact_submit(payload: Dict[str, Any] = Body(...), background_tasks: BackgroundTasks = BackgroundTasks()):
    name = str(payload.get("name", "")).strip()
    email = str(payload.get("email", "")).strip()
    subject = str(payload.get("subject", "")).strip()
    message = str(payload.get("message", "")).strip()
    
    if not name or not email or not message:
        raise HTTPException(status_code=400, detail="Name, email, and message are required")
    
    from .services.auth_service import send_contact_email
    background_tasks.add_task(send_contact_email, name, email, subject, message)
    
    return {"ok": True}


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
@app.get("/api/admin/model-status")
def api_model_status():
    return data_service.model_status()


@app.get("/api/system/status")
def api_system_status():
    return data_service.system_status()


@app.get("/api/admin/status")
def api_admin_status(request: Request, x_admin_key: Optional[str] = Header(default=None)):
    _check_admin_access(request, x_admin_key)
    return data_service.admin_status()


@app.get("/api/admin/model-health")
def api_admin_model_health(request: Request, x_admin_key: Optional[str] = Header(default=None)):
    _check_admin_access(request, x_admin_key)
    return data_service.admin_model_health()


@app.get("/api/admin/audit-logs")
def api_admin_audit_logs(request: Request, x_admin_key: Optional[str] = Header(default=None), limit: int = Query(200, ge=1, le=1000)):
    _check_admin_access(request, x_admin_key)
    return {"logs": data_service._storage.list_audit_logs(limit=limit)}


@app.get("/api/admin/models")
def api_admin_models(request: Request, x_admin_key: Optional[str] = Header(default=None)):
    _check_admin_access(request, x_admin_key)
    return {"models": data_service.list_models(), "active_model": data_service.get_active_model_record()}


@app.post("/api/admin/models/{model_id}/activate")
def api_admin_activate_model(model_id: str, request: Request, x_admin_key: Optional[str] = Header(default=None)):
    _check_admin_access(request, x_admin_key)
    if not data_service.activate_model(model_id):
        raise HTTPException(status_code=404, detail="Model not found")
    return {"ok": True, "active_model": model_id}


@app.post("/api/admin/models/{model_id}/archive")
def api_admin_archive_model(model_id: str, request: Request, x_admin_key: Optional[str] = Header(default=None)):
    _check_admin_access(request, x_admin_key)
    if not data_service.archive_model(model_id):
        raise HTTPException(status_code=400, detail="Only inactive models can be archived")
    return {"ok": True, "model_id": model_id}


@app.delete("/api/admin/models/{model_id}")
def api_admin_delete_model(model_id: str, request: Request, x_admin_key: Optional[str] = Header(default=None)):
    _check_admin_access(request, x_admin_key)
    if not data_service.delete_model(model_id):
        raise HTTPException(status_code=400, detail="Only inactive models can be deleted")
    return {"ok": True, "model_id": model_id}


@app.get("/api/admin/models/compare")
def api_admin_compare_models(request: Request, model_a: str = Query(...), model_b: str = Query(...), x_admin_key: Optional[str] = Header(default=None)):
    _check_admin_access(request, x_admin_key)
    return data_service.compare_models(model_a, model_b)


@app.get("/api/admin/users")
def api_admin_users(request: Request, x_admin_key: Optional[str] = Header(default=None)):
    _check_admin_access(request, x_admin_key)
    return {"users": list_users()}


@app.post("/api/admin/users/{username}/role")
def api_admin_set_role(username: str, request: Request, payload: Dict[str, Any] = Body(...), x_admin_key: Optional[str] = Header(default=None)):
    actor = _check_admin_access(request, x_admin_key)
    if actor.get("username") == "api-key-admin":
        raise HTTPException(status_code=403, detail="Role changes require the signed-in main Admin account")
    set_role(str(actor.get("username") or ""), username, str(payload.get("role") or "user"))
    return {"ok": True, "users": list_users()}


@app.post("/api/admin/actions/sync")
def api_admin_run_sync(request: Request, payload: Dict[str, Any] = Body(default={}), x_admin_key: Optional[str] = Header(default=None)):
    actor = _check_admin_access(request, x_admin_key)
    job = enqueue_sync({
        "symbols": payload.get("symbols"),
        "top_n": int(payload.get("top_n") or 50),
        "days": int(payload.get("days") or 520),
        "announcements": int(payload.get("announcements") or 100),
        "skip_prices": bool(payload.get("skip_prices", False)),
        "sleep_ms": int(payload.get("sleep_ms") or 250),
    })
    _audit_admin_action(request, actor, 'data.sync', target_type='job', target_id=str(job.get('run_id') or 'sync'), details=payload)
    return {"ok": True, "job": job}


@app.post("/api/admin/actions/train")
def api_admin_run_train(request: Request, payload: Dict[str, Any] = Body(default={}), x_admin_key: Optional[str] = Header(default=None)):
    actor = _check_admin_access(request, x_admin_key)
    job = run_train_now({"symbols": payload.get("symbols"), "horizon_days": int(payload.get("horizon_days") or 1), "model_family": payload.get("model_family") or "auto"})
    _audit_admin_action(request, actor, 'model.train', target_type='job', target_id=str(job.get('run_id') or 'train'), details=payload)
    return {"ok": True, "job": job}


@app.post("/api/admin/actions/sync-train")
def api_admin_run_sync_train(request: Request, payload: Dict[str, Any] = Body(default={}), x_admin_key: Optional[str] = Header(default=None)):
    actor = _check_admin_access(request, x_admin_key)
    job = enqueue_sync_train({
        "symbols": payload.get("symbols"),
        "top_n": int(payload.get("top_n") or 50),
        "days": int(payload.get("days") or 520),
        "announcements": int(payload.get("announcements") or 100),
        "skip_prices": bool(payload.get("skip_prices", False)),
        "sleep_ms": int(payload.get("sleep_ms") or 250),
        "train_symbols": payload.get("train_symbols") or payload.get("symbols"),
        "horizon_days": int(payload.get("horizon_days") or 1),
        "model_family": payload.get("model_family") or "auto",
        "train_after_sync": True,
    })
    _audit_admin_action(request, actor, 'data.sync_train', target_type='job', target_id=str(job.get('run_id') or 'sync-train'), details=payload)
    return {"ok": True, "job": job}


@app.post("/api/admin/actions/daily-pipeline")
def api_admin_run_daily_pipeline(request: Request, payload: Dict[str, Any] = Body(default={}), x_admin_key: Optional[str] = Header(default=None)):
    actor = _check_admin_access(request, x_admin_key)
    job = enqueue_daily_pipeline({
        "symbols": payload.get("symbols"),
        "top_n": int(payload.get("top_n") or 80),
        "days": int(payload.get("days") or 520),
        "announcements": int(payload.get("announcements") or 100),
        "sleep_ms": int(payload.get("sleep_ms") or 250),
        "horizon_days": int(payload.get("horizon_days") or 1),
        "model_family": payload.get("model_family") or "auto",
        "train_after_sync": _to_bool(payload.get("train_after_sync"), True),
    })
    _audit_admin_action(request, actor, 'pipeline.daily_run', target_type='job', target_id=str(job.get('run_id') or 'daily-pipeline'), details=payload)
    return {"ok": True, "job": job}


@app.post("/api/admin/actions/refresh-sentiment")
def api_admin_refresh_sentiment(request: Request, payload: Dict[str, Any] = Body(default={}), x_admin_key: Optional[str] = Header(default=None)):
    actor = _check_admin_access(request, x_admin_key)
    result = data_service.refresh_sentiment_scores(limit=int(payload.get("limit") or 1200))
    _audit_admin_action(request, actor, 'sentiment.refresh', details={'limit': int(payload.get('limit') or 1200), 'result': result})
    return {"ok": True, "result": result}


@app.post("/api/admin/actions/refresh-documents")
def api_admin_refresh_documents(request: Request, payload: Dict[str, Any] = Body(default={}), x_admin_key: Optional[str] = Header(default=None)):
    actor = _check_admin_access(request, x_admin_key)
    result = data_service.refresh_documents(
        limit=int(payload.get("limit") or 120),
        symbol=payload.get("symbol"),
        force=_to_bool(payload.get("force"), False),
        max_pages=int(payload.get("max_pages") or 12),
    )
    _audit_admin_action(request, actor, 'documents.refresh', details={**payload, 'result': result})
    return {"ok": True, "result": result}


@app.post("/api/admin/actions/seed-news-whitelist")
def api_admin_seed_news_whitelist(request: Request, x_admin_key: Optional[str] = Header(default=None)):
    actor = _check_admin_access(request, x_admin_key)
    result = data_service.seed_news_whitelist()
    _audit_admin_action(request, actor, 'news.seed_whitelist', details=result)
    return {"ok": True, "result": result}


@app.post("/api/admin/actions/refresh-selected-news")
def api_admin_refresh_selected_news(request: Request, payload: Dict[str, Any] = Body(default={}), x_admin_key: Optional[str] = Header(default=None)):
    actor = _check_admin_access(request, x_admin_key)
    result = data_service.refresh_selected_news(
        lookback_days=int(payload.get("lookback_days") or 30),
        max_per_source=int(payload.get("max_per_source") or 40),
    )
    _audit_admin_action(request, actor, 'news.refresh_selected', details={**payload, 'result': result})
    return {"ok": True, "result": result}


@app.post("/api/admin/actions/compare-news-models")
def api_admin_compare_news_models(request: Request, payload: Dict[str, Any] = Body(default={}), x_admin_key: Optional[str] = Header(default=None)):
    actor = _check_admin_access(request, x_admin_key)
    result = data_service.compare_news_models(
        symbols=payload.get("symbols"),
        horizon_days=int(payload.get("horizon_days") or 1),
        max_symbols=int(payload.get("max_symbols") or 40),
    )
    _audit_admin_action(request, actor, 'model.compare_news', details={**payload, 'result': result})
    return {"ok": True, "result": result}


@app.post("/api/admin/macro/preview")
def api_admin_macro_preview(request: Request, file: UploadFile = File(...), x_admin_key: Optional[str] = Header(default=None)):
    _check_admin_access(request, x_admin_key)
    rows = parse_macro_csv_bytes(file.file.read())
    return {"ok": True, "preview": preview_macro_rows(rows)}


@app.post("/api/admin/macro/import")
def api_admin_macro_import(request: Request, file: UploadFile = File(...), x_admin_key: Optional[str] = Header(default=None)):
    actor = _check_admin_access(request, x_admin_key)
    rows = parse_macro_csv_bytes(file.file.read())
    result = data_service.import_macro_rows(rows)
    _audit_admin_action(request, actor, 'macro.import', details={'file': file.filename, 'rows': len(rows), 'result': result})
    return {"ok": True, **result}


@app.post("/api/admin/data/preview")
def api_admin_preview_data(
    request: Request,
    files: List[UploadFile] = File(...),
    x_admin_key: Optional[str] = Header(default=None),
):
    _check_admin_access(request, x_admin_key)
    with tempfile.TemporaryDirectory(prefix="tradexa_preview_") as td:
        zip_path, upload_meta = _normalize_uploaded_dataset(files, Path(td))
        preview = preview_dataset(zip_path)
    return {"ok": True, "upload": upload_meta, "preview": preview}


@app.post("/api/admin/data/upload")
def api_admin_upload_data(
    request: Request,
    files: List[UploadFile] = File(...),
    train_after_import: str = Form("false"),
    horizon_days: str = Form("1"),
    x_admin_key: Optional[str] = Header(default=None),
):
    _check_admin_access(request, x_admin_key)
    with tempfile.TemporaryDirectory(prefix="tradexa_upload_") as td:
        zip_path, upload_meta = _normalize_uploaded_dataset(files, Path(td))
        preview = preview_dataset(zip_path)
        persisted_zip = persist_upload_zip(zip_path, _uploads_dir())
    job = enqueue_import({
        "zip_path": str(persisted_zip),
        "train_after_import": _to_bool(train_after_import, False),
        "horizon_days": max(1, int(horizon_days or "1")),
    }, preview=preview)
    return {"ok": True, "upload": upload_meta, "preview": preview, "job": job}


# ---- API: Market ----
@app.get("/api/market/overview")
def api_market_overview():
    result = data_service.market_overview()
    # Ensure live ASPI/SL20 values are always present.
    # The normalized output should include them, but if missing (e.g. during
    # hot-reload), we enrich from the raw provider data on the fly.
    if result.get("aspi_value") is None or result.get("sl20_value") is None:
        try:
            prov = data_service.get_provider()
            raw = prov.get_market_overview() if hasattr(prov, "get_market_overview") else {}
            daily = raw.get("daily") if isinstance(raw.get("daily"), dict) else {}
            aspi_raw = raw.get("aspi") if isinstance(raw.get("aspi"), dict) else {}
            sl20_raw = raw.get("snp_sl20") if isinstance(raw.get("snp_sl20"), dict) else {}

            def _f(v):
                try:
                    return float(v) if v is not None else None
                except (ValueError, TypeError):
                    return None

            if result.get("aspi_value") is None:
                result["aspi_value"] = _f(
                    aspi_raw.get("value") or daily.get("asi")
                )
                result["aspi_change"] = _f(
                    aspi_raw.get("change") or daily.get("asiChange")
                )
                result["aspi_change_pct"] = _f(
                    aspi_raw.get("percentage") or daily.get("asiChangePct")
                )
            if result.get("sl20_value") is None:
                result["sl20_value"] = _f(
                    sl20_raw.get("value") or daily.get("spp")
                )
                result["sl20_change"] = _f(
                    sl20_raw.get("change") or daily.get("sppChange")
                )
                result["sl20_change_pct"] = _f(
                    sl20_raw.get("percentage") or daily.get("sppChangePct")
                )
        except Exception:
            pass
    return result


@app.post("/api/assistant/chat")
def api_assistant_chat(request: Request, payload: Dict[str, Any] = Body(...)):
    user = current_user_from_request(request)
    message = str(payload.get("message") or payload.get("query") or "")
    portfolio_id = payload.get("portfolio_id") or payload.get("portfolioId")
    response = chat_assistant(message, user=user, portfolio_id=str(portfolio_id) if portfolio_id else None)
    return response


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


@app.get("/api/stocks/{symbol}/resources")
def api_stock_resources(symbol: str):
    return data_service.stock_resources(symbol)


@app.get("/api/stocks/{symbol}/sentiment")
def api_stock_sentiment(symbol: str, days: int = Query(90, ge=7, le=365)):
    return data_service.sentiment_summary(symbol, days=days)


@app.get("/api/stocks/{symbol}/documents")
def api_stock_documents(symbol: str, limit: int = Query(50, ge=1, le=200)):
    return data_service.stock_documents(symbol, limit=limit)


@app.get("/api/stocks/{symbol}/news")
def api_stock_news(symbol: str, limit: int = Query(40, ge=1, le=120)):
    return data_service.stock_news(symbol, limit=limit)


@app.get("/api/stock/{symbol}")
def api_stock(symbol: str):
    return data_service.stock(symbol)


@app.get("/api/stock/{symbol}/history")
def api_stock_history(symbol: str, days: int = Query(180, ge=20, le=780)):
    return data_service.stock_history_chart(symbol, days=days)


@app.get("/api/calendar/events")
def api_calendar_events(request: Request, symbol: Optional[str] = Query(None), portfolio_id: Optional[str] = Query(None), days: int = Query(120, ge=30, le=730)):
    user = current_user_from_request(request)
    username = user.get('username') if user else None
    return data_service.event_calendar(symbol=symbol, portfolio_id=portfolio_id, username=username, days=days)


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


@app.get("/api/account/export")
def api_account_export(request: Request):
    user = require_user(request)
    payload = data_service.export_user_account_data(user['username'])
    filename = f"tradexalk-account-export-{user['username']}.json"
    return Response(
        content=json.dumps(payload, indent=2, default=str),
        media_type="application/json",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@app.get("/api/portfolios")
def api_portfolios(request: Request):
    user = require_user(request)
    return {"portfolios": data_service.list_portfolios(user['username'])}


@app.post("/api/portfolios")
def api_create_portfolio(request: Request, payload: Dict[str, Any] = Body(...)):
    user = require_user(request)
    return data_service.create_portfolio_account(user['username'], payload)


@app.patch("/api/portfolios/{portfolio_id}")
def api_update_portfolio(portfolio_id: str, request: Request, payload: Dict[str, Any] = Body(...)):
    user = require_user(request)
    return data_service.update_portfolio_account(user['username'], portfolio_id, payload)


@app.get("/api/portfolio")
def api_portfolio(request: Request, portfolio_id: Optional[str] = Query(None)):
    user = require_user(request)
    return data_service.get_portfolio(user['username'], portfolio_id=portfolio_id)


@app.get("/api/portfolio/performance")
def api_portfolio_performance(request: Request, portfolio_id: Optional[str] = Query(None), days: int = Query(365, ge=1, le=1825)):
    user = require_user(request)
    return data_service.get_portfolio_performance(user['username'], days=days, portfolio_id=portfolio_id)


@app.get("/api/portfolio/period-performance")
def api_portfolio_period_performance(request: Request, portfolio_id: Optional[str] = Query(None)):
    user = require_user(request)
    return data_service.get_portfolio_period_performance(user['username'], portfolio_id=portfolio_id)


@app.get("/api/portfolio/analytics")
def api_portfolio_analytics(request: Request, portfolio_id: Optional[str] = Query(None), days: int = Query(365, ge=1, le=1825)):
    user = require_user(request)
    return data_service.get_portfolio_analytics(user['username'], days=days, portfolio_id=portfolio_id)


@app.get("/api/portfolio/intelligence")
def api_portfolio_intelligence(request: Request, portfolio_id: Optional[str] = Query(None)):
    user = require_user(request)
    return data_service.get_portfolio_intelligence(user['username'], portfolio_id=portfolio_id)


@app.post("/api/portfolio/trade-preview")
def api_portfolio_trade_preview(request: Request, payload: Dict[str, Any] = Body(...), portfolio_id: Optional[str] = Query(None)):
    user = require_user(request)
    return data_service.preview_trade_fit(user['username'], payload, portfolio_id=portfolio_id)


@app.post("/api/portfolio/cash")
def api_portfolio_create_cash(request: Request, payload: Dict[str, Any] = Body(...), portfolio_id: Optional[str] = Query(None)):
    user = require_user(request)
    return data_service.create_cash_movement(user['username'], payload, portfolio_id=portfolio_id)


@app.delete("/api/portfolio/cash/{cash_id}")
def api_portfolio_delete_cash(cash_id: str, request: Request, portfolio_id: Optional[str] = Query(None)):
    user = require_user(request)
    return data_service.delete_cash_movement(user['username'], cash_id, portfolio_id=portfolio_id)


@app.post("/api/portfolio/transactions")
def api_portfolio_create_transaction(request: Request, payload: Dict[str, Any] = Body(...), portfolio_id: Optional[str] = Query(None)):
    user = require_user(request)
    return data_service.create_portfolio_transaction(user['username'], payload, portfolio_id=portfolio_id)


@app.patch("/api/portfolio/transactions/{tx_id}")
def api_portfolio_update_transaction(tx_id: str, request: Request, payload: Dict[str, Any] = Body(...), portfolio_id: Optional[str] = Query(None)):
    user = require_user(request)
    return data_service.update_portfolio_transaction(user['username'], tx_id, payload, portfolio_id=portfolio_id)


@app.delete("/api/portfolio/transactions/{tx_id}")
def api_portfolio_delete_transaction(tx_id: str, request: Request, portfolio_id: Optional[str] = Query(None)):
    user = require_user(request)
    return data_service.delete_portfolio_transaction(user['username'], tx_id, portfolio_id=portfolio_id)


@app.post("/api/portfolio/import/preview")
def api_portfolio_import_preview(request: Request, file: UploadFile = File(...)):
    user = require_user(request)
    _ = user
    return data_service.preview_portfolio_import(file)


@app.post("/api/portfolio/import")
def api_portfolio_import(request: Request, file: UploadFile = File(...), portfolio_id: Optional[str] = Query(None)):
    user = require_user(request)
    return data_service.import_portfolio_transactions(user['username'], file, portfolio_id=portfolio_id)


@app.post("/api/portfolio/import/broker-preview")
def api_portfolio_broker_preview(request: Request, file: UploadFile = File(...)):
    user = require_user(request)
    _ = user
    return data_service.preview_portfolio_import(file)


@app.post("/api/portfolio/import/broker")
def api_portfolio_broker_import(request: Request, file: UploadFile = File(...), portfolio_id: Optional[str] = Query(None)):
    user = require_user(request)
    return data_service.import_portfolio_transactions(user['username'], file, portfolio_id=portfolio_id)


@app.get("/api/corporate-actions")
def api_corporate_actions(symbol: Optional[str] = Query(None), limit: int = Query(100, ge=1, le=500)):
    return {"actions": data_service.corporate_actions(symbol=symbol, limit=limit)}


@app.get("/api/alerts")
def api_alerts(request: Request):
    user = require_user(request)
    return {'alerts': data_service.list_alerts(user['username']), 'user_alerts_enabled': bool(_system_settings().get('userAlertsEnabled', True))}


@app.post("/api/alerts")
def api_alerts_create(request: Request, payload: Dict[str, Any] = Body(...)):
    user = require_user(request)
    if not bool(_system_settings().get('userAlertsEnabled', True)):
        raise HTTPException(status_code=403, detail="User-created alerts are disabled by system settings")
    return data_service.create_alert(user['username'], payload)


@app.patch("/api/alerts/{alert_id}")
def api_alerts_update(alert_id: str, request: Request, payload: Dict[str, Any] = Body(...)):
    user = require_user(request)
    if not bool(_system_settings().get('userAlertsEnabled', True)):
        disallowed = any(k in payload for k in ('symbol','alert_type','target_value','targetPrice','meta','recurring','cooldown_minutes'))
        reenable = payload.get('is_enabled') is True
        if disallowed or reenable:
            raise HTTPException(status_code=403, detail="User-created alerts are disabled by system settings")
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
    actor = _check_admin_access(request, x_admin_key)
    active = data_service.set_effective_provider_name(str(payload.get('provider') or 'hybrid'))
    data_service.clear_runtime_cache()
    _audit_admin_action(request, actor, 'provider.change', details={'provider': active})
    return {'ok': True, 'active_provider': active}


@app.get("/api/admin/alerts")
def api_admin_alerts(request: Request, x_admin_key: Optional[str] = Header(default=None)):
    _check_admin_access(request, x_admin_key)
    return {'alerts': data_service.admin_alerts()}


@app.get("/api/admin/notifications")
def api_admin_notifications(request: Request, x_admin_key: Optional[str] = Header(default=None)):
    _check_admin_access(request, x_admin_key)
    return {'notifications': data_service.admin_notifications()}


@app.get("/api/admin/notification-queue")
def api_admin_notification_queue(request: Request, x_admin_key: Optional[str] = Header(default=None), limit: int = Query(200, ge=1, le=500)):
    _check_admin_access(request, x_admin_key)
    return {'queue': data_service.admin_notification_queue(limit=limit)}


@app.get("/api/admin/announcements/review")
def api_admin_ann_review(request: Request, x_admin_key: Optional[str] = Header(default=None), limit: int = Query(100, ge=1, le=500), important_only: bool = Query(False), include_hidden: bool = Query(False)):
    _check_admin_access(request, x_admin_key)
    return {'announcements': data_service.announcements_filtered(None, limit, important_only=important_only, include_hidden=include_hidden)}


@app.get("/api/admin/announcements/triage")
def api_admin_ann_triage(request: Request, x_admin_key: Optional[str] = Header(default=None), limit: int = Query(100, ge=1, le=500), important_only: bool = Query(False), include_hidden: bool = Query(False)):
    _check_admin_access(request, x_admin_key)
    return {'announcements': data_service.announcements_filtered(None, limit, important_only=important_only, include_hidden=include_hidden)}


@app.patch("/api/admin/announcements/{ann_id}")
def api_admin_ann_update(ann_id: str, request: Request, payload: Dict[str, Any] = Body(...), x_admin_key: Optional[str] = Header(default=None)):
    admin = _check_admin_access(request, x_admin_key)
    tags = payload.get('tags') if isinstance(payload.get('tags'), list) else None
    result = data_service.review_announcement(ann_id, importance=payload.get('importance'), review_status=payload.get('review_status'), tags=tags, review_notes=payload.get('review_notes'), reviewed_by=str(admin.get('username') or 'admin'))
    _audit_admin_action(request, admin, 'announcement.review', target_type='announcement', target_id=ann_id, details=payload)
    return result




@app.get('/api/admin/system-settings')
def api_admin_system_settings(request: Request, x_admin_key: Optional[str] = Header(default=None)):
    _check_admin_access(request, x_admin_key)
    return {'settings': _system_settings()}


@app.post('/api/admin/system-settings')
def api_admin_system_settings_update(request: Request, payload: Dict[str, Any] = Body(...), x_admin_key: Optional[str] = Header(default=None)):
    actor = _check_admin_access(request, x_admin_key)
    values = payload.get('settings') if isinstance(payload.get('settings'), dict) else payload
    current = _system_settings()
    incoming = values or {}
    for key, value in incoming.items():
        current[key] = _normalize_system_setting_value(key, value, current.get(key))
    provider = str(current.get('provider') or settings.data_provider)
    try:
        active = data_service.set_effective_provider_name(provider)
        current['provider'] = active
    except Exception:
        pass
    data_service.set_preferences(current, profile='__system__')
    _audit_admin_action(request, actor, 'system.settings_update', details={'keys': sorted(list((values or {}).keys()))})
    return {'ok': True, 'settings': _system_settings()}

def _safe_num(v: Any) -> Optional[float]:
    try:
        return float(v) if v is not None else None
    except Exception:
        return None
