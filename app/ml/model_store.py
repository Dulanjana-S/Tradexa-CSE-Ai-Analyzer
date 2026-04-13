from __future__ import annotations

import json
import shutil
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, Optional

import joblib


@dataclass
class ModelBundle:
    mean: Any
    q10: Any
    q90: Any
    up: Any
    feature_names: list[str]
    meta: Dict[str, Any]
    path: Optional[Path] = None


def _load_bundle_from_dir(bundle_dir: Path) -> Optional[ModelBundle]:
    meta_path = bundle_dir / 'metadata.json'
    if not meta_path.exists():
        return None
    with meta_path.open('r', encoding='utf-8') as f:
        meta = json.load(f)
    feature_names = meta.get('feature_names') or []
    try:
        mean = joblib.load(bundle_dir / 'model_mean.pkl')
        q10 = joblib.load(bundle_dir / 'model_q10.pkl')
        q90 = joblib.load(bundle_dir / 'model_q90.pkl')
        up = joblib.load(bundle_dir / 'model_up.pkl')
    except Exception:
        return None
    return ModelBundle(mean=mean, q10=q10, q90=q90, up=up, feature_names=feature_names, meta=meta, path=bundle_dir)


def _active_pointer(model_dir: Path) -> Optional[Path]:
    pointer = model_dir / 'active_model.json'
    if not pointer.exists():
        return None
    try:
        info = json.loads(pointer.read_text(encoding='utf-8'))
        rel = info.get('path')
        if rel:
            p = (model_dir / rel).resolve()
            if p.exists():
                return p
    except Exception:
        return None
    return None


def latest_bundle(model_dir: Path) -> Optional[ModelBundle]:
    model_dir = Path(model_dir)
    active = _active_pointer(model_dir)
    if active:
        bundle = _load_bundle_from_dir(active)
        if bundle is not None:
            return bundle
    latest = model_dir / 'latest'
    if latest.exists():
        bundle = _load_bundle_from_dir(latest)
        if bundle is not None:
            return bundle
    runs = sorted([p for p in model_dir.iterdir() if p.is_dir() and p.name.startswith('model_')], reverse=True) if model_dir.exists() else []
    for run in runs:
        bundle = _load_bundle_from_dir(run)
        if bundle is not None:
            return bundle
    return None


def save_bundle(
    model_dir: Path,
    *,
    mean: Any,
    q10: Any,
    q90: Any,
    up: Any,
    meta: Dict[str, Any],
) -> Path:
    model_dir = Path(model_dir)
    model_dir.mkdir(parents=True, exist_ok=True)
    model_id = meta.get('model_id') or f"model_{datetime.now(timezone.utc).strftime('%Y%m%d%H%M%S')}"
    run_dir = model_dir / str(model_id)
    run_dir.mkdir(parents=True, exist_ok=True)
    joblib.dump(mean, run_dir / 'model_mean.pkl')
    joblib.dump(q10, run_dir / 'model_q10.pkl')
    joblib.dump(q90, run_dir / 'model_q90.pkl')
    joblib.dump(up, run_dir / 'model_up.pkl')
    with (run_dir / 'metadata.json').open('w', encoding='utf-8') as f:
        json.dump({**meta, 'model_id': model_id}, f, indent=2)
    latest = model_dir / 'latest'
    if latest.exists():
        shutil.rmtree(latest)
    shutil.copytree(run_dir, latest)
    (model_dir / 'active_model.json').write_text(json.dumps({'path': run_dir.name}, indent=2), encoding='utf-8')
    return run_dir


def activate_bundle(model_dir: Path, model_id: str) -> bool:
    model_dir = Path(model_dir)
    run_dir = model_dir / model_id
    if not run_dir.exists():
        return False
    (model_dir / 'active_model.json').write_text(json.dumps({'path': run_dir.name}, indent=2), encoding='utf-8')
    latest = model_dir / 'latest'
    if latest.exists():
        shutil.rmtree(latest)
    shutil.copytree(run_dir, latest)
    return True
