from __future__ import annotations

import csv
import io
import os
import re
import shutil
import zipfile
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional, Tuple

from .storage import Storage


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def parse_eod_date(raw: str) -> Optional[str]:
    value = (raw or "").strip()
    if not value:
        return None
    for fmt in ("%d %b %Y", "%Y-%m-%d", "%d/%m/%Y", "%m/%d/%Y"):
        try:
            return datetime.strptime(value, fmt).date().isoformat()
        except Exception:
            continue
    return None


def _to_float(value: Any) -> Optional[float]:
    if value in (None, ""):
        return None
    if isinstance(value, (int, float)):
        return float(value)
    text = str(value).strip().replace(",", "")
    if not text or text.lower() in {"n/a", "na", "null", "none", "-", "--"}:
        return None
    try:
        return float(text)
    except Exception:
        return None


def _to_int(value: Any) -> int:
    parsed = _to_float(value)
    return int(parsed or 0)


def _pick(row: Dict[str, Any], *keys: str) -> Any:
    for key in keys:
        if key in row and row[key] not in (None, ""):
            return row[key]
    return None


def _normalize_header_name(name: str) -> str:
    return re.sub(r"[^a-z0-9]+", "_", (name or "").strip().lower()).strip("_")


def _normalized_header_set(fieldnames: Iterable[str]) -> set[str]:
    return {_normalize_header_name(name) for name in fieldnames if name}


def _is_corporate_actions_file(filename: str, headers: set[str]) -> bool:
    file_hint = any(token in filename.lower() for token in ("corporate", "dividend", "actions", "split", "bonus"))
    header_hint = bool(headers & {"action_type", "type", "ex_date", "dividend", "cash_dividend", "ratio", "split_ratio", "bonus_ratio"})
    return file_hint or header_hint


def _is_portfolio_transactions_file(filename: str, headers: set[str]) -> bool:
    file_hint = any(token in filename.lower() for token in ("portfolio", "transactions", "trades", "holdings_import"))
    header_hint = {"symbol", "type", "quantity", "price"}.issubset(headers) and bool(headers & {"date", "trade_date", "traded_at"})
    return file_hint or header_hint


def _price_row_from_csv(row: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    iso = parse_eod_date(str(_pick(row, "Date", "date", "Trade Date", "trade_date") or ""))
    if not iso:
        return None
    return {
        "date": iso,
        "open": _to_float(_pick(row, "Open", "Open (Rs.)", "open", "open_price")),
        "high": _to_float(_pick(row, "High (Rs.)", "High", "high", "high_price")),
        "low": _to_float(_pick(row, "Low (Rs.)", "Low", "low", "low_price")),
        "close": _to_float(_pick(row, "Close (Rs.)", "Close", "close", "close_price")),
        "volume": _to_int(_pick(row, "Share Volume", "share_volume", "Volume", "volume")),
    }


def read_price_csv_text(text: str) -> List[Dict[str, Any]]:
    reader = csv.DictReader(io.StringIO(text))
    rows: List[Dict[str, Any]] = []
    for row in reader:
        clean = _price_row_from_csv(row)
        if clean:
            rows.append(clean)
    rows.sort(key=lambda item: item["date"])
    return rows


def _parse_ratio(value: Any) -> Tuple[Optional[float], Optional[float]]:
    if value in (None, ""):
        return None, None
    text = str(value).strip().lower().replace("x", ":")
    for sep in (":", "/"):
        if sep in text:
            left, right = text.split(sep, 1)
            return _to_float(left), _to_float(right)
    numeric = _to_float(text)
    return (numeric, 1.0) if numeric else (None, None)


def read_corporate_actions_csv_text(text: str, filename: str = "corporate_actions.csv") -> List[Dict[str, Any]]:
    reader = csv.DictReader(io.StringIO(text))
    actions: List[Dict[str, Any]] = []
    for idx, row in enumerate(reader, start=1):
        symbol = str(_pick(row, "symbol", "Symbol", "ticker", "Ticker") or "").upper().strip()
        ex_date = parse_eod_date(str(_pick(row, "ex_date", "Ex Date", "date", "Date") or ""))
        if not symbol or not ex_date:
            continue
        action_type = str(_pick(row, "action_type", "Action Type", "type", "Type") or "").strip().lower()
        amount = _to_float(_pick(row, "amount", "Amount", "cash_dividend", "Cash Dividend", "dividend", "Dividend"))
        numerator = _to_float(_pick(row, "ratio_numerator", "Ratio Numerator", "numerator", "Numerator"))
        denominator = _to_float(_pick(row, "ratio_denominator", "Ratio Denominator", "denominator", "Denominator"))
        if numerator is None or denominator is None:
            rn, rd = _parse_ratio(_pick(row, "ratio", "Ratio", "split_ratio", "Split Ratio", "bonus_ratio", "Bonus Ratio"))
            numerator = numerator or rn
            denominator = denominator or rd
        if not action_type:
            if amount is not None:
                action_type = "dividend"
            elif (numerator or 0) > 0 and (denominator or 0) > 0:
                action_type = "split"
            else:
                action_type = "corporate_action"
        action_id = str(_pick(row, "action_id", "Action ID") or f"{Path(filename).stem}:{symbol}:{ex_date}:{action_type}:{idx}")
        actions.append(
            {
                "action_id": action_id,
                "symbol": symbol,
                "ex_date": ex_date,
                "action_type": action_type,
                "amount": amount,
                "ratio_numerator": numerator,
                "ratio_denominator": denominator,
                "description": str(_pick(row, "description", "Description", "notes", "Notes") or "").strip() or None,
                "source": Path(filename).name,
            }
        )
    actions.sort(key=lambda item: (item["ex_date"], item["symbol"], item["action_type"]))
    return actions


def preview_dataset(zip_path: Path) -> Dict[str, Any]:
    preview_entries: List[Dict[str, Any]] = []
    totals = {"files": 0, "price_symbols": 0, "price_rows": 0, "indices": 0, "corporate_actions": 0, "warnings": 0}
    warnings: List[str] = []
    with zipfile.ZipFile(zip_path, "r") as archive:
        names = [name for name in archive.namelist() if name.lower().endswith(".csv")]
        if not names:
            return {"ok": False, "error": "Zip contains no CSV files", "files": []}
        for name in sorted(names):
            totals["files"] += 1
            with archive.open(name, "r") as handle:
                text = handle.read().decode("utf-8", errors="replace")
            reader = csv.DictReader(io.StringIO(text))
            fieldnames = list(reader.fieldnames or [])
            headers = _normalized_header_set(fieldnames)
            base = os.path.basename(name)
            stem = Path(base).stem.upper().strip()
            if _is_corporate_actions_file(base, headers):
                actions = read_corporate_actions_csv_text(text, base)
                action_types = sorted({str(item.get("action_type") or "") for item in actions if item.get("action_type")})
                entry = {
                    "file": base,
                    "kind": "corporate_actions",
                    "rows": len(actions),
                    "symbols": sorted({str(item.get("symbol") or "") for item in actions if item.get("symbol")}),
                    "start_date": actions[0]["ex_date"] if actions else None,
                    "end_date": actions[-1]["ex_date"] if actions else None,
                    "action_types": action_types,
                }
                totals["corporate_actions"] += len(actions)
            else:
                history = read_price_csv_text(text)
                dates = [item["date"] for item in history]
                duplicates = sum(count - 1 for count in Counter(dates).values() if count > 1)
                missing_close = sum(1 for item in history if item.get("close") is None)
                if stem in {"ASPI", "SL20", "SPSL20", "SP_SL20", "SNP_SL20"}:
                    entry = {
                        "file": base,
                        "kind": "index",
                        "symbol": "ASPI" if stem == "ASPI" else "S&P SL20",
                        "rows": len(history),
                        "start_date": history[0]["date"] if history else None,
                        "end_date": history[-1]["date"] if history else None,
                        "duplicates": duplicates,
                        "missing_close": missing_close,
                    }
                    totals["indices"] += 1
                else:
                    entry = {
                        "file": base,
                        "kind": "price_history",
                        "symbol": stem,
                        "rows": len(history),
                        "start_date": history[0]["date"] if history else None,
                        "end_date": history[-1]["date"] if history else None,
                        "duplicates": duplicates,
                        "missing_close": missing_close,
                    }
                    totals["price_symbols"] += 1
                    totals["price_rows"] += len(history)
                if duplicates:
                    warning = f"{base}: {duplicates} duplicate date rows detected"
                    warnings.append(warning)
                    totals["warnings"] += 1
                if missing_close:
                    warning = f"{base}: {missing_close} rows missing close values"
                    warnings.append(warning)
                    totals["warnings"] += 1
            preview_entries.append(entry)
    return {"ok": True, "zip_name": zip_path.name, "files": preview_entries, "totals": totals, "warnings": warnings[:50]}


def import_dataset(zip_path: Path, *, storage: Storage) -> Dict[str, Any]:
    storage.init()
    price_rows = 0
    price_symbols = 0
    indices: Dict[str, int] = {}
    corporate_actions = 0
    imported_symbols: List[str] = []
    action_sources: List[str] = []
    with zipfile.ZipFile(zip_path, "r") as archive:
        names = [name for name in archive.namelist() if name.lower().endswith(".csv")]
        if not names:
            raise ValueError("Zip contains no CSV files")
        for name in sorted(names):
            base = os.path.basename(name)
            stem = Path(base).stem.upper().strip()
            with archive.open(name, "r") as handle:
                text = handle.read().decode("utf-8", errors="replace")
            reader = csv.DictReader(io.StringIO(text))
            headers = _normalized_header_set(reader.fieldnames or [])
            if _is_corporate_actions_file(base, headers):
                actions = read_corporate_actions_csv_text(text, base)
                corporate_actions += storage.upsert_corporate_actions(actions)
                if actions:
                    action_sources.append(base)
                continue
            history = read_price_csv_text(text)
            if not history:
                continue
            if stem in {"ASPI", "SL20", "SPSL20", "SP_SL20", "SNP_SL20"}:
                idx_name = "ASPI" if stem == "ASPI" else "S&P SL20"
                idx_series = [{"date": row["date"], "value": row.get("close")} for row in history if row.get("close") is not None]
                indices[idx_name] = storage.upsert_index_series(idx_name, idx_series)
                continue
            price_rows += storage.upsert_prices(stem, history)
            price_symbols += 1
            imported_symbols.append(stem)
    auto_companies = storage.ensure_price_symbols_as_companies() if imported_symbols else 0
    storage.set_meta("last_sync_utc", utc_now())
    return {
        "symbols": price_symbols,
        "rows": price_rows,
        "indices": indices,
        "auto_companies": auto_companies,
        "corporate_actions": corporate_actions,
        "action_sources": action_sources,
    }


def persist_upload_zip(source_zip: Path, uploads_dir: Path) -> Path:
    uploads_dir.mkdir(parents=True, exist_ok=True)
    target = uploads_dir / f"upload_{datetime.now(timezone.utc).strftime('%Y%m%d%H%M%S')}_{source_zip.name}"
    shutil.copy2(source_zip, target)
    return target
