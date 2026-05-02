from __future__ import annotations

import argparse
import queue
import threading
import traceback
from datetime import datetime, time as dt_time
from pathlib import Path
from typing import Any, Dict, Optional
from zoneinfo import ZoneInfo

from .config import settings
from .import_tools import import_dataset, utc_now
from .storage import Storage

_worker_queue: "queue.Queue[Dict[str, Any]]" = queue.Queue()
_started = False
_start_lock = threading.Lock()


def _storage() -> Storage:
    st = Storage(settings.database_url)
    st.init()
    return st


def _default_scheduler_settings() -> Dict[str, Any]:
    return {
        "dailyPipelineEnabled": True,
        "dailyPipelineTime": "18:10",
        "dailyPipelineTrain": True,
        "dailyPipelineTopN": 80,
        "dailyPipelineDays": 520,
        "dailyPipelineAnnouncements": 100,
        "dailyPipelineHorizonDays": 1,
        "dailyPipelineSleepMs": 250,
    }


def _system_settings() -> Dict[str, Any]:
    st = _storage()
    values = st.get_preferences("__system__")
    merged = _default_scheduler_settings()
    merged.update(values)
    return merged


def _record(run_id: str, job_name: str, status: str, details: Dict[str, Any], *, started_at: Optional[str] = None, finished_at: Optional[str] = None) -> None:
    _storage().record_job_run(job_name=job_name, status=status, details=details, run_id=run_id, started_at=started_at, finished_at=finished_at)


def _get_job(run_id: str) -> Optional[Dict[str, Any]]:
    return _storage().get_job_run(run_id)


def _notify_admins(category: str, title: str, message: str, *, severity: str = "info", link: str = "/admin/jobs", meta: Optional[Dict[str, Any]] = None) -> None:
    try:
        cfg = _system_settings()
        if category in {"sync", "job", "train"} and str(cfg.get("syncNotifications", True)).lower() not in {"1", "true", "yes", "on"}:
            return
        from .services import data_service
        st = _storage()
        for user in st.list_users():
            if str(user.get("role") or "").lower() in {"admin", "co_admin", "owner"}:
                data_service._ensure_notification(str(user.get("username")), category, title, message, severity=severity, link=link, meta=meta or {})
    except Exception:
        return


def enqueue_job(job_name: str, params: Dict[str, Any], *, details: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    st = _storage()
    started = utc_now()
    payload = details.copy() if details else {}
    payload["params"] = params
    run_id = st.record_job_run(job_name=job_name, status="queued", details=payload, started_at=started, finished_at=None)
    _worker_queue.put({"run_id": run_id, "job_name": job_name, "params": params, "started_at": started})
    return _get_job(run_id) or {"run_id": run_id, "job_name": job_name, "status": "queued", "started_at": started, "details": payload}


def enqueue_sync(params: Dict[str, Any]) -> Dict[str, Any]:
    return enqueue_job("sync", params)


def enqueue_train(params: Dict[str, Any]) -> Dict[str, Any]:
    return enqueue_job("train", params)


def enqueue_sync_train(params: Dict[str, Any]) -> Dict[str, Any]:
    return enqueue_job("daily_pipeline", {**params, "train_after_sync": True})


def enqueue_import(params: Dict[str, Any], *, preview: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    details = {"preview": preview} if preview else None
    return enqueue_job("import_dataset", params, details=details)


def enqueue_daily_pipeline(params: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    merged = _default_scheduler_settings()
    merged.update(params or {})
    return enqueue_job("daily_pipeline", merged)


def run_sync_now(params: Dict[str, Any]) -> Dict[str, Any]:
    run_id = _storage().record_job_run(job_name="sync", status="running", details={"params": params}, started_at=utc_now(), finished_at=None)
    _run_sync(params, run_id)
    return _get_job(run_id) or {"run_id": run_id, "job_name": "sync", "status": "completed"}


def run_train_now(params: Dict[str, Any]) -> Dict[str, Any]:
    run_id = _storage().record_job_run(job_name="train", status="running", details={"params": params}, started_at=utc_now(), finished_at=None)
    _run_train(params, run_id)
    return _get_job(run_id) or {"run_id": run_id, "job_name": "train", "status": "completed"}


def run_import_now(params: Dict[str, Any], *, preview: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    details = {"params": params}
    if preview:
        details["preview"] = preview
    run_id = _storage().record_job_run(job_name="import_dataset", status="running", details=details, started_at=utc_now(), finished_at=None)
    _run_import(params, run_id)
    return _get_job(run_id) or {"run_id": run_id, "job_name": "import_dataset", "status": "completed"}


def run_daily_pipeline_now(params: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    merged = _default_scheduler_settings()
    merged.update(params or {})
    run_id = _storage().record_job_run(job_name="daily_pipeline", status="running", details={"params": merged}, started_at=utc_now(), finished_at=None)
    _run_daily_pipeline(merged, run_id)
    return _get_job(run_id) or {"run_id": run_id, "job_name": "daily_pipeline", "status": "completed"}


def _run_sync(params: Dict[str, Any], run_id: str) -> None:
    from .cli import cmd_sync

    args = argparse.Namespace(
        symbols=params.get("symbols"),
        top_n=int(params.get("top_n") or 80),
        days=int(params.get("days") or 520),
        announcements=int(params.get("announcements") or 100),
        skip_prices=bool(params.get("skip_prices", False)),
        sleep_ms=int(params.get("sleep_ms") or 250),
        run_id=run_id,
    )
    cmd_sync(args)


def _run_train(params: Dict[str, Any], run_id: str) -> None:
    from .cli import cmd_train

    args = argparse.Namespace(
        symbols=params.get("symbols"),
        horizon_days=int(params.get("horizon_days") or 1),
        model_family=params.get("model_family") or "auto",
        run_id=run_id,
    )
    cmd_train(args)


def _run_import(params: Dict[str, Any], run_id: str) -> None:
    from .services import data_service

    st = _storage()
    zip_path = Path(str(params.get("zip_path") or "")).resolve()
    if not zip_path.exists():
        raise FileNotFoundError(f"Uploaded dataset no longer exists: {zip_path}")
    started = params.get("started_at") or utc_now()
    _record(run_id, "import_dataset", "running", {"zip_path": str(zip_path), **params}, started_at=started, finished_at=None)
    details = import_dataset(zip_path, storage=st)
    details.update({"zip_path": str(zip_path)})
    if bool(params.get("train_after_import")):
        _record(run_id, "import_dataset", "running", {**details, "training": "queued"}, started_at=started, finished_at=None)
        train_job = enqueue_train({"horizon_days": int(params.get("horizon_days") or 1)})
        details["train_job_id"] = train_job.get("run_id") or train_job.get("id")
    data_service.clear_runtime_cache()
    _record(run_id, "import_dataset", "completed", details, started_at=started, finished_at=utc_now())


def _run_daily_pipeline(params: Dict[str, Any], run_id: str) -> None:
    st = _storage()
    started = params.get("started_at") or utc_now()
    details: Dict[str, Any] = {"steps": []}
    _record(run_id, "daily_pipeline", "running", details, started_at=started, finished_at=None)
    _run_sync({
        "symbols": params.get("symbols"),
        "top_n": int(params.get("top_n") or params.get("dailyPipelineTopN") or 80),
        "days": int(params.get("days") or params.get("dailyPipelineDays") or 520),
        "announcements": int(params.get("announcements") or params.get("dailyPipelineAnnouncements") or 100),
        "skip_prices": bool(params.get("skip_prices", False)),
        "sleep_ms": int(params.get("sleep_ms") or params.get("dailyPipelineSleepMs") or 250),
    }, f"{run_id}:sync")
    details["steps"].append("sync")
    try:
        from .services import data_service
        sentiment_result = data_service.refresh_sentiment_scores(limit=max(400, int(params.get("announcements") or params.get("dailyPipelineAnnouncements") or 100) * 4))
        details["sentiment"] = sentiment_result
        details["steps"].append("sentiment")
        doc_result = data_service.refresh_documents(limit=int(params.get("document_limit") or 80), max_pages=int(params.get("document_max_pages") or 8))
        details["documents"] = doc_result
        details["steps"].append("documents")
        news_result = data_service.refresh_selected_news(lookback_days=int(params.get("news_lookback_days") or 30), max_per_source=int(params.get("news_max_per_source") or 30))
        details["selected_news"] = news_result
        details["steps"].append("selected_news")
    except Exception as exc:
        details["intelligence_error"] = str(exc)
    if bool(params.get("train_after_sync", params.get("dailyPipelineTrain", True))):
        _run_train({
            "symbols": params.get("train_symbols") or params.get("symbols"),
            "horizon_days": int(params.get("horizon_days") or params.get("dailyPipelineHorizonDays") or 1),
            "model_family": params.get("model_family") or params.get("dailyPipelineModelFamily") or "auto",
        }, f"{run_id}:train")
        details["steps"].append("train")
    st.set_meta("last_daily_pipeline_utc", utc_now())
    st.set_meta("last_daily_pipeline_date", datetime.now(ZoneInfo("Asia/Colombo")).date().isoformat())
    _record(run_id, "daily_pipeline", "completed", details, started_at=started, finished_at=utc_now())


def _execute_job(job_name: str, params: Dict[str, Any], run_id: str) -> None:
    if job_name == "sync":
        _run_sync(params, run_id)
    elif job_name == "train":
        _run_train(params, run_id)
    elif job_name == "import_dataset":
        _run_import(params, run_id)
    elif job_name == "daily_pipeline":
        _run_daily_pipeline(params, run_id)
    else:
        raise RuntimeError(f"Unknown job type: {job_name}")


def _worker_loop() -> None:
    while True:
        item = _worker_queue.get()
        run_id = str(item.get("run_id") or "")
        job_name = str(item.get("job_name") or "job")
        params = dict(item.get("params") or {})
        started = str(item.get("started_at") or utc_now())
        try:
            _record(run_id, job_name, "running", {"params": params}, started_at=started, finished_at=None)
            _execute_job(job_name, {**params, "started_at": started}, run_id)
            existing = _get_job(run_id)
            if existing and str(existing.get("status") or "") not in {"completed", "failed"}:
                _record(run_id, job_name, "completed", existing.get("details") or {"params": params}, started_at=started, finished_at=utc_now())
            if job_name in {"daily_pipeline", "sync", "train"}:
                _notify_admins("job", f"{job_name.replace('_', ' ').title()} completed", f"Job {run_id} completed successfully.", severity="success", meta={"run_id": run_id, "job_name": job_name})
        except Exception as exc:
            _record(run_id, job_name, "failed", {"params": params, "error": str(exc), "traceback": traceback.format_exc(limit=10)}, started_at=started, finished_at=utc_now())
            _notify_admins("job", f"{job_name.replace('_', ' ').title()} failed", str(exc), severity="error", meta={"run_id": run_id, "job_name": job_name})
        finally:
            _worker_queue.task_done()


def _scheduler_loop() -> None:
    tz = ZoneInfo("Asia/Colombo")
    while True:
        try:
            cfg = _system_settings()
            enabled = str(cfg.get("dailyPipelineEnabled", True)).lower() in {"1", "true", "yes", "on"}
            time_value = str(cfg.get("dailyPipelineTime") or "18:10")
            hour, minute = [int(part) for part in time_value.split(":", 1)] if ":" in time_value else (18, 10)
            now = datetime.now(tz)
            today = now.date().isoformat()
            st = _storage()
            last_date = st.get_meta("last_daily_pipeline_date")
            trigger_at = datetime.combine(now.date(), dt_time(hour=hour, minute=minute), tzinfo=tz)
            if enabled and now >= trigger_at and last_date != today:
                enqueue_daily_pipeline(cfg)
                st.set_meta("last_daily_pipeline_date", today)

            from .services import data_service
            eval_interval = max(30, int(float(cfg.get("alertEvaluationIntervalSeconds") or 60)))
            last_eval = st.get_meta("last_alert_evaluation_utc") or ""
            should_eval = True
            if last_eval:
                try:
                    should_eval = (datetime.now(tz) - datetime.fromisoformat(last_eval)).total_seconds() >= eval_interval
                except Exception:
                    should_eval = True
            if should_eval:
                data_service.evaluate_all_users_alerts()
                st.set_meta("last_alert_evaluation_utc", datetime.now(tz).replace(microsecond=0).isoformat())

            data_service.process_notification_dispatch_queue(limit=max(10, int(float(cfg.get("notificationDeliveryBatchSize") or 50))))
        except Exception:
            pass
        finally:
            threading.Event().wait(30)


def start_job_system() -> None:
    global _started
    with _start_lock:
        if _started:
            return
        worker = threading.Thread(target=_worker_loop, name="tradexa-job-worker", daemon=True)
        worker.start()
        scheduler = threading.Thread(target=_scheduler_loop, name="tradexa-job-scheduler", daemon=True)
        scheduler.start()
        _started = True
