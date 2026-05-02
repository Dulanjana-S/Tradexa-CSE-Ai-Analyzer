from __future__ import annotations

import argparse
import csv
import io
import json
import os
import time
import zipfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, List, Optional, Tuple

from fastapi.testclient import TestClient

from .config import settings
from .intelligence import parse_macro_csv_bytes
from .mock_data import generate_dataset, load_dataset
from .ml.train import train_from_db
from .ml.model_store import activate_bundle, inspect_model_store
from .storage import Storage
from .services.auth_service import ensure_bootstrap_admin


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def _get_app():
    from .main import app

    return app


def _pick_smoke_symbol(st: Storage) -> Optional[str]:
    coverage = st.data_coverage()
    rows = sorted(coverage.get("rows") or [], key=lambda r: ((r.get("rows") or 0), r.get("symbol") or ""), reverse=True)
    if rows:
        return rows[0].get("symbol")
    comps = st.list_companies(limit=1)
    if comps:
        return comps[0].get("symbol")
    syms = st.list_price_symbols()
    return syms[0] if syms else None


def cmd_init_db(args: argparse.Namespace) -> None:
    st = Storage(settings.database_url)
    st.init()
    ensure_bootstrap_admin()
    print(f"OK: initialized {settings.database_url}")


def _read_companies_file(path: str) -> List[Dict[str, object]]:
    p = Path(path)
    if not p.exists():
        raise SystemExit(f"File not found: {path}")
    if p.suffix.lower() == ".json":
        data = json.loads(p.read_text(encoding="utf-8"))
        if not isinstance(data, list):
            raise SystemExit("Company file JSON must be a list of objects")
        rows = data
    else:
        with p.open("r", encoding="utf-8-sig", newline="") as fh:
            rows = list(csv.DictReader(fh))
    out: List[Dict[str, object]] = []
    for r in rows:
        if not isinstance(r, dict):
            continue
        sym = str(r.get("symbol") or r.get("Symbol") or r.get("ticker") or r.get("Ticker") or "").upper().strip()
        if not sym:
            continue

        def _num(name1: str, name2: str = ""):
            raw = r.get(name1) if name1 in r else (r.get(name2) if name2 and name2 in r else None)
            if raw in (None, ""):
                return None
            try:
                return float(str(raw).replace(",", ""))
            except Exception:
                return None

        shares = _num("shares", "Shares")
        if shares is not None:
            shares = int(shares)
        out.append(
            {
                "symbol": sym,
                "name": r.get("name") or r.get("Name") or sym,
                "sector": r.get("sector") or r.get("Sector") or "Imported",
                "industry_group": r.get("industry_group") or r.get("Industry Group") or r.get("industry") or r.get("Industry"),
                "shares": shares,
                "logo_url": r.get("logo_url") or r.get("Logo URL"),
                "market_cap": _num("market_cap", "Market Cap"),
                "beta": _num("beta", "Beta"),
            }
        )
    return out


def cmd_import_companies(args: argparse.Namespace) -> None:
    from .services import data_service

    st = Storage(settings.database_url)
    st.init()
    rows = _read_companies_file(args.file)
    count = st.upsert_companies(rows)
    data_service.clear_runtime_cache()
    print(f"Imported companies: {count}")


def cmd_sync(args: argparse.Namespace) -> None:
    from .services import data_service

    st = Storage(settings.database_url)
    st.init()
    prov = data_service.get_provider()
    started = _utc_now()
    run_id = getattr(args, "run_id", None) or st.record_job_run(job_name="sync", status="running", details={"provider": prov.name}, started_at=started)
    if getattr(args, "run_id", None):
        st.record_job_run(job_name="sync", status="running", details={"provider": prov.name}, run_id=run_id, started_at=started, finished_at=None)
    details = {"provider": prov.name, "companies": 0, "indices": {}, "announcements": 0, "price_symbols": 0, "price_rows": 0, "failed_symbols": []}
    try:
        print(f"Provider: {prov.name}")
        try:
            comps = prov.list_companies() or []
        except Exception as e:
            comps = st.list_companies(limit=args.top_n) if st.list_companies(limit=1) else []
            details["company_error"] = str(e)
            print(f"Companies: FAILED ({e})")
        if comps:
            details["companies"] = st.upsert_companies(comps)
            print(f"Companies: {len(comps)}")
        else:
            print("Companies: none available")

        try:
            idx = prov.get_indices() or {}
        except Exception as e:
            idx = {}
            details["indices_error"] = str(e)
            print(f"Indices: FAILED ({e})")
        for k, v in idx.items():
            if isinstance(v, list):
                name = str(k)
                uk = name.upper().replace(" ", "")
                if uk in {"SNP_SL20", "SNPSL20", "S&PSL20", "SL20"}:
                    name = "S&P SL20"
                elif uk == "ASPI":
                    name = "ASPI"
                count = st.upsert_index_series(name, v)
                details["indices"][name] = count
                print(f"Index {name}: {count}")

        try:
            anns = prov.get_announcements(None, limit=min(args.announcements, 200))
        except Exception as e:
            anns = []
            details["announcements_error"] = str(e)
            print(f"Announcements: FAILED ({e})")
        if anns:
            count = st.upsert_announcements(anns)
            details["announcements"] = count
            st.set_meta("last_announcements_sync_utc", _utc_now())
            print(f"Announcements: {count}")

        if args.symbols:
            symbols = [s.upper() for s in args.symbols]
        else:
            symbols = [c.get("symbol") for c in comps[: args.top_n] if c.get("symbol")] if comps else []
        if not symbols:
            print("No symbols selected for price sync.")
        elif args.skip_prices:
            print("Skipping price history sync (--skip-prices).")
        else:
            for i, s in enumerate(symbols, start=1):
                try:
                    hist = prov.get_stock_history(s, days=args.days)
                    count = st.upsert_prices(s, hist)
                    details["price_symbols"] += 1
                    details["price_rows"] += count
                    print(f"Prices {s}: {count}")
                except Exception as e:
                    details["failed_symbols"].append({"symbol": s, "error": str(e)})
                    print(f"Prices {s}: FAILED ({e})")
                if args.sleep_ms and args.sleep_ms > 0 and i < len(symbols):
                    time.sleep(args.sleep_ms / 1000.0)

        st.ensure_price_symbols_as_companies()
        st.set_meta("last_sync_utc", _utc_now())
        data_service.clear_runtime_cache()
        st.record_job_run(job_name="sync", status="completed", details=details, run_id=run_id, started_at=started, finished_at=_utc_now())
        print("Sync complete.")
        if details["failed_symbols"]:
            print("Failed symbols:")
            for item in details["failed_symbols"]:
                print(f"  - {item['symbol']}: {item['error']}")
    except Exception as e:
        details["error"] = str(e)
        st.record_job_run(job_name="sync", status="failed", details=details, run_id=run_id, started_at=started, finished_at=_utc_now())
        raise


def cmd_seed_mock_db(args: argparse.Namespace) -> None:
    from .services import data_service

    st = Storage(settings.database_url)
    st.init()
    ds = load_dataset(Path("data/mock"))
    if ds is None or args.days != 260:
        ds = generate_dataset(days=args.days)
    st.upsert_companies(ds["companies"])
    st.upsert_index_series("ASPI", ds["indices"].get("ASPI") or [])
    st.upsert_index_series("S&P SL20", ds["indices"].get("S&P SL20") or [])
    st.upsert_announcements(ds["announcements"])
    total_rows = 0
    for sym, hist in ds["prices_by_symbol"].items():
        total_rows += st.upsert_prices(sym, hist)
    st.set_meta("seeded_mock_days", str(args.days))
    st.set_meta("last_sync_utc", _utc_now())
    data_service.clear_runtime_cache()
    print(f"Seeded mock DB: companies={len(ds['companies'])}, price_rows={total_rows}, announcements={len(ds['announcements'])}")


def cmd_train(args: argparse.Namespace) -> None:
    st = Storage(settings.database_url)
    st.init()
    started = _utc_now()
    run_id = getattr(args, "run_id", None) or st.record_job_run(job_name="train", status="running", details={}, started_at=started)
    if getattr(args, "run_id", None):
        st.record_job_run(job_name="train", status="running", details={}, run_id=run_id, started_at=started, finished_at=None)
    details = {"symbols": args.symbols or None, "horizon_days": args.horizon_days, "model_family": getattr(args, "model_family", "auto")}
    try:
        res = train_from_db(database_url=settings.database_url, model_dir=settings.model_dir, symbols=[s.upper() for s in args.symbols] if args.symbols else None, horizon_days=args.horizon_days, model_family=getattr(args, "model_family", "auto"))
        meta = {}
        try:
            meta = json.loads((Path(res.model_path) / "metadata.json").read_text(encoding="utf-8"))
        except Exception:
            meta = {"metrics_holdout": res.metrics}
        model_id = meta.get("model_id") or Path(res.model_path).name
        store_info = inspect_model_store(Path(settings.model_dir))
        active_info = store_info.get("active") or {}
        active_unavailable = not bool(active_info) or not bool(active_info.get("loadable"))
        auto_activate = st.get_active_model() is None or active_unavailable
        if auto_activate:
            meta["lifecycle_status"] = "active"
            activate_bundle(Path(settings.model_dir), model_id)
        else:
            meta.setdefault("lifecycle_status", "beta")
        st.register_model(model_id=model_id, path=Path(res.model_path).name, meta=meta, is_active=auto_activate)
        details.update({"rows": res.rows, "symbols_count": res.symbols, "metrics": res.metrics, "model_path": str(res.model_path), "model_id": model_id, "lifecycle_status": meta.get("lifecycle_status"), "auto_activated": auto_activate, "replaced_incompatible_active_model": bool(active_info) and not bool(active_info.get("loadable"))})
        st.record_job_run(job_name="train", status="completed", details=details, run_id=run_id, started_at=started, finished_at=_utc_now())
        print("Training complete")
        print(f"Rows: {res.rows} | Symbols: {res.symbols}")
        print(f"Metrics: {res.metrics}")
        print(f"Saved to: {res.model_path}")
    except Exception as e:
        details["error"] = str(e)
        st.record_job_run(job_name="train", status="failed", details=details, run_id=run_id, started_at=started, finished_at=_utc_now())
        raise


def _parse_eod_date(s: str) -> str:
    s = (s or "").strip()
    return datetime.strptime(s, "%d %b %Y").date().isoformat()


def _read_symbol_csv(fp: io.TextIOBase) -> List[dict]:
    reader = csv.DictReader(fp)
    out: List[dict] = []
    for r in reader:
        if not r:
            continue
        d = r.get("Date") or r.get("date")
        if not d:
            continue
        try:
            iso = _parse_eod_date(str(d))
        except Exception:
            continue

        def fkey(*keys):
            for k in keys:
                if k in r and r[k] not in (None, ""):
                    return r[k]
            return None

        def to_float(v):
            if v is None:
                return None
            if isinstance(v, (int, float)):
                return float(v)
            s = str(v).strip().replace(",", "")
            if not s or s.lower() in {"n/a", "na", "null", "none", "-", "--"}:
                return None
            try:
                return float(s)
            except ValueError:
                return None

        def to_int(v):
            if v is None:
                return 0
            if isinstance(v, (int, float)):
                return int(v)
            s = str(v).strip().replace(",", "")
            if not s or s.lower() in {"n/a", "na", "null", "none", "-", "--"}:
                return 0
            try:
                return int(float(s))
            except ValueError:
                return 0

        out.append(
            {
                "date": iso,
                "open": to_float(fkey("Open", "Open (Rs.)", "open", "open_price")),
                "high": to_float(fkey("High (Rs.)", "High", "high", "high_price")),
                "low": to_float(fkey("Low (Rs.)", "Low", "low", "low_price")),
                "close": to_float(fkey("Close (Rs.)", "Close", "close", "close_price")),
                "volume": to_int(fkey("Share Volume", "share_volume", "Volume", "volume")),
            }
        )
    out.sort(key=lambda x: x["date"])
    return out


def cmd_import_eod_zip(args: argparse.Namespace) -> None:
    from .services import data_service

    st = Storage(settings.database_url)
    st.init()
    zpath = args.file
    if not os.path.exists(zpath):
        raise SystemExit(f"File not found: {zpath}")
    started = _utc_now()
    run_id = getattr(args, "run_id", None) or st.record_job_run(job_name="import_eod_zip", status="running", details={"file": zpath}, started_at=started)
    if getattr(args, "run_id", None):
        st.record_job_run(job_name="import_eod_zip", status="running", details={"file": zpath}, run_id=run_id, started_at=started, finished_at=None)

    total_rows = 0
    symbols = 0
    indices = {}
    imported_symbols: List[str] = []
    with zipfile.ZipFile(zpath, "r") as z:
        names = [n for n in z.namelist() if n.lower().endswith(".csv")]
        if not names:
            raise SystemExit("Zip contains no .csv files")
        for name in sorted(names):
            base = os.path.basename(name)
            sym = os.path.splitext(base)[0].upper().strip()
            if not sym:
                continue
            with z.open(name, "r") as fh:
                txt = io.TextIOWrapper(fh, encoding="utf-8", errors="replace")
                hist = _read_symbol_csv(txt)
            if not hist:
                print(f"{sym}: 0 rows (skipped)")
                continue
            if sym in {"ASPI", "SL20", "SPSL20", "SP_SL20", "SNP_SL20"}:
                idx_name = "ASPI" if sym == "ASPI" else "S&P SL20"
                idx_series = [{"date": r["date"], "value": r.get("close")} for r in hist if r.get("close") is not None]
                count = st.upsert_index_series(idx_name, idx_series)
                indices[idx_name] = count
                print(f"Index {idx_name}: {count} rows")
                continue
            count = st.upsert_prices(sym, hist)
            imported_symbols.append(sym)
            total_rows += count
            symbols += 1
            print(f"{sym}: {count} rows")

    auto_companies = 0
    if imported_symbols:
        auto_companies = st.ensure_price_symbols_as_companies()
    st.set_meta("last_sync_utc", _utc_now())
    data_service.clear_runtime_cache()
    st.record_job_run(
        job_name="import_eod_zip",
        status="completed",
        details={"file": zpath, "symbols": symbols, "rows": total_rows, "indices": indices, "auto_companies": auto_companies},
        run_id=run_id,
        started_at=started,
        finished_at=_utc_now(),
    )
    print(f"Imported EOD: symbols={symbols}, rows={total_rows}, indices={indices}, auto_companies={auto_companies}")


def cmd_audit_db(args: argparse.Namespace) -> None:
    st = Storage(settings.database_url)
    st.init()
    coverage = st.data_coverage()
    print(json.dumps(coverage, indent=2))


def cmd_verify_real_data(args: argparse.Namespace) -> None:
    st = Storage(settings.database_url)
    st.init()
    st.ensure_price_symbols_as_companies()
    coverage = st.data_coverage()
    symbol = args.symbol.upper() if args.symbol else _pick_smoke_symbol(st)
    summary = {
        "database_url": settings.database_url,
        "provider": settings.data_provider,
        "symbols": coverage.get("symbols"),
        "symbols_with_history": coverage.get("symbols_with_history"),
        "symbols_ready_for_prediction": coverage.get("symbols_ready_for_prediction"),
        "latest_price_date": coverage.get("latest_price_date"),
        "smoke_symbol": symbol,
        "checks": [],
    }
    ok = True
    if not coverage.get("symbols_with_history"):
        ok = False
        summary["checks"].append({"name": "history_present", "ok": False, "detail": "No imported price history found."})
    else:
        summary["checks"].append({"name": "history_present", "ok": True, "detail": f"{coverage.get('symbols_with_history')} symbols have history."})
    if symbol:
        app = _get_app()
        client = TestClient(app)
        for path in [f"/api/stock/{symbol}", f"/api/stock/{symbol}/history?days=120", "/api/stocks?limit=20", "/api/system/status", "/readyz"]:
            r = client.get(path)
            passed = r.status_code == 200
            ok = ok and passed
            summary["checks"].append({"name": path, "ok": passed, "status_code": r.status_code})
        pred = client.get(f"/api/stock/{symbol}/prediction?horizon=1D")
        passed = pred.status_code == 200
        ok = ok and passed
        detail = pred.json() if passed else pred.text[:200]
        summary["checks"].append({"name": f"/api/stock/{symbol}/prediction?horizon=1D", "ok": passed, "detail": detail})
    else:
        ok = False
        summary["checks"].append({"name": "smoke_symbol", "ok": False, "detail": "No symbol available to verify."})
    print(json.dumps(summary, indent=2))
    if not ok:
        raise SystemExit(1)


def cmd_run_scheduler(args: argparse.Namespace) -> None:
    once = bool(args.once)
    interval = max(5, int(args.interval_minutes))
    while True:
        if args.sync:
            sync_args = argparse.Namespace(symbols=None, top_n=args.top_n, days=args.days, announcements=args.announcements, skip_prices=False, sleep_ms=args.sleep_ms)
            cmd_sync(sync_args)
        if args.train:
            train_args = argparse.Namespace(symbols=None, horizon_days=args.horizon_days)
            try:
                cmd_train(train_args)
            except Exception as e:
                print(f"Train failed during scheduler run: {e}")
        if once:
            break
        print(f"Scheduler sleeping for {interval} minutes...")
        time.sleep(interval * 60)


def cmd_smoke_test(args: argparse.Namespace) -> None:
    st = Storage(settings.database_url)
    st.init()
    symbol = args.symbol.upper() if args.symbol else _pick_smoke_symbol(st)
    if not symbol:
        raise SystemExit("No symbol available for smoke test. Import or sync real data first.")

    app = _get_app()
    paths = [
        "/",
        "/healthz",
        "/readyz",
        "/admin/status",
        "/api/provider",
        "/api/model/status",
        "/api/system/status",
        "/api/market/overview",
        "/api/indices",
        "/api/stocks?limit=20",
        f"/api/companies/search?q={symbol.split('.')[0]}",
        f"/api/stock/{symbol}",
        f"/api/stock/{symbol}/history?days=120",
        f"/api/stock/{symbol}/prediction?horizon=1D",
        "/api/announcements",
        "/api/watchlist",
        "/api/preferences",
        "/api/signals/top",
    ]
    client = TestClient(app)
    try:
        client.post("/api/auth/login", json={"username": settings.bootstrap_admin_username, "password": settings.bootstrap_admin_password})
    except Exception:
        pass
    ok = True
    for path in paths:
        r = client.get(path)
        if r.status_code != 200:
            ok = False
            print(f"FAIL {path}: {r.status_code} {r.text[:200]}")
        else:
            print(f"OK   {path}")
    r = client.post("/api/watchlist", json={"symbol": symbol, "add": True})
    if r.status_code == 200 and symbol in (r.json().get("symbols") or []):
        print("OK   POST /api/watchlist add")
    else:
        ok = False
        print(f"FAIL POST /api/watchlist add: {r.status_code} {r.text[:200]}")
    r = client.post("/api/preferences", json={"preferences": {"default_history_days": 120}})
    if r.status_code == 200:
        print("OK   POST /api/preferences")
    else:
        ok = False
        print(f"FAIL POST /api/preferences: {r.status_code} {r.text[:200]}")
    if not ok:
        raise SystemExit(1)
    print(f"Smoke test passed using symbol {symbol}.")




def cmd_refresh_sentiment(args: argparse.Namespace) -> None:
    from .services import data_service

    result = data_service.refresh_sentiment_scores(limit=args.limit)
    print(json.dumps(result, indent=2))


def cmd_import_macro_csv(args: argparse.Namespace) -> None:
    from .services import data_service

    payload = Path(args.file).read_bytes()
    rows = parse_macro_csv_bytes(payload)
    result = data_service.import_macro_rows(rows)
    print(json.dumps(result, indent=2))

def cmd_refresh_documents(args: argparse.Namespace) -> None:
    from .services import data_service

    result = data_service.refresh_documents(limit=args.limit, symbol=args.symbol, force=args.force, max_pages=args.max_pages)
    print(json.dumps(result, indent=2))


def cmd_seed_news_whitelist(args: argparse.Namespace) -> None:
    from .services import data_service

    print(json.dumps(data_service.seed_news_whitelist(), indent=2))


def cmd_refresh_selected_news(args: argparse.Namespace) -> None:
    from .services import data_service

    print(json.dumps(data_service.refresh_selected_news(lookback_days=args.lookback_days, max_per_source=args.max_per_source), indent=2))


def cmd_compare_news_models(args: argparse.Namespace) -> None:
    from .services import data_service

    print(json.dumps(data_service.compare_news_models(symbols=args.symbols, horizon_days=args.horizon_days, max_symbols=args.max_symbols), indent=2))

def cmd_bootstrap_real_data(args: argparse.Namespace) -> None:
    st = Storage(settings.database_url)
    st.init()
    if args.companies_file:
        rows = _read_companies_file(args.companies_file)
        imported = st.upsert_companies(rows)
        print(f"Imported company metadata: {imported}")
    eod_args = argparse.Namespace(file=args.eod_zip)
    cmd_import_eod_zip(eod_args)
    if args.train:
        train_args = argparse.Namespace(symbols=args.symbols, horizon_days=args.horizon_days)
        cmd_train(train_args)
    verify_args = argparse.Namespace(symbol=args.verify_symbol)
    cmd_verify_real_data(verify_args)


def main(argv: Optional[List[str]] = None) -> None:
    p = argparse.ArgumentParser(prog="cse-ai", description="CSE AI Analyzer - real-data import, sync, and training")
    sub = p.add_subparsers(dest="cmd", required=True)

    s0 = sub.add_parser("init-db", help="Initialize database schema")
    s0.set_defaults(func=cmd_init_db)

    scomp = sub.add_parser("import-companies", help="Import company metadata from CSV or JSON")
    scomp.add_argument("--file", required=True, help="Path to company list CSV/JSON")
    scomp.set_defaults(func=cmd_import_companies)

    sseed = sub.add_parser("seed-mock-db", help="Fill the database with reproducible offline mock market data")
    sseed.add_argument("--days", type=int, default=260, help="Business days of mock history to generate")
    sseed.set_defaults(func=cmd_seed_mock_db)

    s1 = sub.add_parser("sync", help="Sync market data into the database from the configured live provider")
    s1.add_argument("--symbols", nargs="*", help="Symbols to sync")
    s1.add_argument("--top-n", type=int, default=50, help="If --symbols not provided, sync first N companies")
    s1.add_argument("--days", type=int, default=520, help="How many days of history to fetch per symbol")
    s1.add_argument("--announcements", type=int, default=100, help="How many announcements to fetch")
    s1.add_argument("--skip-prices", action="store_true", help="Sync companies/indices/announcements only")
    s1.add_argument("--sleep-ms", type=int, default=250, help="Delay between symbol history requests (ms)")
    s1.set_defaults(func=cmd_sync)

    s2 = sub.add_parser("train", help="Train ML model from the database")
    s2.add_argument("--symbols", nargs="*", help="Train using specific symbols only")
    s2.add_argument("--horizon-days", type=int, default=1, help="Prediction horizon in trading days")
    s2.add_argument("--model-family", choices=["auto", "baseline", "sklearn_gbdt", "lightgbm", "xgboost", "catboost"], default="auto", help="Model family to train. auto compares all installed candidates.")
    s2.set_defaults(func=cmd_train)

    ssent = sub.add_parser("refresh-sentiment", help="Analyze stored CSE announcements into sentiment/event features")
    ssent.add_argument("--limit", type=int, default=1200)
    ssent.set_defaults(func=cmd_refresh_sentiment)

    smacro = sub.add_parser("import-macro-csv", help="Import macro / global indicator rows from CSV")
    smacro.add_argument("--file", required=True)
    smacro.set_defaults(func=cmd_import_macro_csv)

    sdoc = sub.add_parser("refresh-documents", help="Extract official CSE PDF/report intelligence")
    sdoc.add_argument("--limit", type=int, default=120)
    sdoc.add_argument("--symbol", help="Optional symbol such as LOLC.N0000")
    sdoc.add_argument("--force", action="store_true", help="Reprocess documents already in the DB")
    sdoc.add_argument("--max-pages", type=int, default=12)
    sdoc.set_defaults(func=cmd_refresh_documents)

    snewsseed = sub.add_parser("seed-news-whitelist", help="Seed selected Sri Lanka news source whitelist")
    snewsseed.set_defaults(func=cmd_seed_news_whitelist)

    snews = sub.add_parser("refresh-selected-news", help="Ingest selected whitelisted Sri Lanka economy/business news")
    snews.add_argument("--lookback-days", type=int, default=30)
    snews.add_argument("--max-per-source", type=int, default=40)
    snews.set_defaults(func=cmd_refresh_selected_news)

    scompnews = sub.add_parser("compare-news-models", help="Compare official-CSE-only model vs CSE + selected-news feature set")
    scompnews.add_argument("--symbols", nargs="*", help="Optional symbols")
    scompnews.add_argument("--horizon-days", type=int, default=1)
    scompnews.add_argument("--max-symbols", type=int, default=40)
    scompnews.set_defaults(func=cmd_compare_news_models)

    s3 = sub.add_parser("import-eod-zip", help="Import vendor EOD CSVs from a .zip (one CSV per symbol)")
    s3.add_argument("--file", required=True, help="Path to zip file")
    s3.set_defaults(func=cmd_import_eod_zip)

    s4 = sub.add_parser("smoke-test", help="Run a local API smoke test against the current database")
    s4.add_argument("--symbol", help="Symbol to use for stock/prediction endpoints")
    s4.set_defaults(func=cmd_smoke_test)

    s5 = sub.add_parser("audit-db", help="Print DB coverage / data quality summary")
    s5.set_defaults(func=cmd_audit_db)

    sverify = sub.add_parser("verify-real-data", help="Verify that imported real data is ready for app usage")
    sverify.add_argument("--symbol", help="Symbol to use during API verification")
    sverify.set_defaults(func=cmd_verify_real_data)

    sboot = sub.add_parser("bootstrap-real-data", help="One-shot setup for real company metadata + EOD zip + train + verify")
    sboot.add_argument("--companies-file", help="Optional CSV/JSON file with company metadata")
    sboot.add_argument("--eod-zip", required=True, help="Zip containing one CSV per symbol")
    sboot.add_argument("--train", action="store_true", help="Train after import")
    sboot.add_argument("--horizon-days", type=int, default=1)
    sboot.add_argument("--symbols", nargs="*", help="Optional subset of symbols to train")
    sboot.add_argument("--verify-symbol", help="Optional symbol to use in final verification")
    sboot.set_defaults(func=cmd_bootstrap_real_data)


    susers = sub.add_parser("list-users", help="List users and roles")
    susers.set_defaults(func=lambda args: print(json.dumps(Storage(settings.database_url).list_users(), indent=2)))
    s6 = sub.add_parser("run-scheduler", help="Run periodic sync and optional train jobs")
    s6.add_argument("--once", action="store_true", help="Run one cycle and exit")
    s6.add_argument("--interval-minutes", type=int, default=1440)
    s6.add_argument("--top-n", type=int, default=50)
    s6.add_argument("--days", type=int, default=520)
    s6.add_argument("--announcements", type=int, default=100)
    s6.add_argument("--sleep-ms", type=int, default=250)
    s6.add_argument("--sync", action="store_true", help="Run sync during each cycle")
    s6.add_argument("--train", action="store_true", help="Run train during each cycle")
    s6.add_argument("--horizon-days", type=int, default=1)
    s6.set_defaults(func=cmd_run_scheduler)

    args = p.parse_args(argv)
    args.func(args)


if __name__ == "__main__":
    main()
