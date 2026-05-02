from __future__ import annotations

import json
import platform
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
    meta_model: Any = None
    path: Optional[Path] = None


def runtime_versions() -> Dict[str, Optional[str]]:
    versions: Dict[str, Optional[str]] = {
        'python': platform.python_version(),
        'joblib': getattr(joblib, '__version__', None),
        'scikit_learn': None,
    }
    try:
        import sklearn  # type: ignore

        versions['scikit_learn'] = getattr(sklearn, '__version__', None)
    except Exception:
        versions['scikit_learn'] = None
    return versions


def _major_minor(version: Optional[str]) -> Optional[str]:
    value = str(version or '').strip()
    if not value:
        return None
    parts = value.split('.')
    if len(parts) >= 2:
        return '.'.join(parts[:2])
    return parts[0]


def inspect_bundle_dir(bundle_dir: Path) -> Dict[str, Any]:
    bundle_dir = Path(bundle_dir)
    info: Dict[str, Any] = {
        'path': str(bundle_dir),
        'name': bundle_dir.name,
        'exists': bundle_dir.exists(),
        'loadable': False,
        'load_error': None,
        'meta': {},
        'runtime': runtime_versions(),
        'saved_runtime': {},
        'compatibility': {
            'python_major_minor_match': None,
            'scikit_learn_major_minor_match': None,
            'joblib_major_minor_match': None,
        },
    }
    if not bundle_dir.exists() or not bundle_dir.is_dir():
        info['load_error'] = 'Bundle directory does not exist.'
        return info

    meta_path = bundle_dir / 'metadata.json'
    if not meta_path.exists():
        info['load_error'] = 'metadata.json is missing.'
        return info

    try:
        meta = json.loads(meta_path.read_text(encoding='utf-8'))
    except Exception as exc:
        info['load_error'] = f'Invalid metadata.json: {type(exc).__name__}: {exc}'
        return info

    info['meta'] = meta
    saved_runtime = dict(meta.get('runtime') or {})
    info['saved_runtime'] = saved_runtime

    current = info['runtime']
    info['compatibility'] = {
        'python_major_minor_match': None if not saved_runtime.get('python') else _major_minor(saved_runtime.get('python')) == _major_minor(current.get('python')),
        'scikit_learn_major_minor_match': None if not saved_runtime.get('scikit_learn') else _major_minor(saved_runtime.get('scikit_learn')) == _major_minor(current.get('scikit_learn')),
        'joblib_major_minor_match': None if not saved_runtime.get('joblib') else _major_minor(saved_runtime.get('joblib')) == _major_minor(current.get('joblib')),
    }

    try:
        _load_bundle_from_dir(bundle_dir)
        info['loadable'] = True
        return info
    except Exception as exc:
        info['load_error'] = f'{type(exc).__name__}: {exc}'
        return info


def inspect_model_store(model_dir: Path) -> Dict[str, Any]:
    model_dir = Path(model_dir)
    active_path = _active_pointer(model_dir)
    runs = []
    if model_dir.exists():
        for run_dir in sorted([p for p in model_dir.iterdir() if p.is_dir() and (p / 'metadata.json').exists()], reverse=True):
            item = inspect_bundle_dir(run_dir)
            item['is_active'] = bool(active_path and run_dir.resolve() == active_path.resolve())
            runs.append(item)
    active = next((item for item in runs if item.get('is_active')), None)
    latest_loadable = next((item for item in runs if item.get('loadable')), None)
    return {
        'model_dir': str(model_dir),
        'runtime': runtime_versions(),
        'active_path': str(active_path) if active_path else None,
        'active': active,
        'latest_loadable': latest_loadable,
        'runs': runs,
    }


def _load_bundle_from_dir(bundle_dir: Path) -> Optional[ModelBundle]:
    meta_path = bundle_dir / 'metadata.json'
    if not meta_path.exists():
        return None
    with meta_path.open('r', encoding='utf-8') as f:
        meta = json.load(f)
    feature_names = meta.get('feature_names') or []
    mean = joblib.load(bundle_dir / 'model_mean.pkl')
    q10 = joblib.load(bundle_dir / 'model_q10.pkl')
    q90 = joblib.load(bundle_dir / 'model_q90.pkl')
    up = joblib.load(bundle_dir / 'model_up.pkl')
    meta_model = None
    meta_model_path = bundle_dir / 'model_meta.pkl'
    if meta_model_path.exists():
        try:
            meta_model = joblib.load(meta_model_path)
        except Exception:
            meta_model = None
    return ModelBundle(mean=mean, q10=q10, q90=q90, up=up, feature_names=feature_names, meta=meta, meta_model=meta_model, path=bundle_dir)


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
        try:
            bundle = _load_bundle_from_dir(active)
            if bundle is not None:
                return bundle
        except Exception:
            pass
    latest = model_dir / 'latest'
    if latest.exists():
        try:
            bundle = _load_bundle_from_dir(latest)
            if bundle is not None and str((bundle.meta or {}).get('lifecycle_status') or '').lower() == 'active':
                return bundle
        except Exception:
            pass
    runs = sorted([p for p in model_dir.iterdir() if p.is_dir() and (p / 'metadata.json').exists()], reverse=True) if model_dir.exists() else []
    for run in runs:
        try:
            bundle = _load_bundle_from_dir(run)
        except Exception:
            continue
        if bundle is not None and str((bundle.meta or {}).get('lifecycle_status') or '').lower() == 'active':
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
    meta_model: Any = None,
    activate: bool = False,
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
    if meta_model is not None:
        joblib.dump(meta_model, run_dir / 'model_meta.pkl')
    with (run_dir / 'metadata.json').open('w', encoding='utf-8') as f:
        json.dump({**meta, 'model_id': model_id}, f, indent=2)
    if activate:
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
    meta_file = run_dir / 'metadata.json'
    if meta_file.exists():
        try:
            meta = json.loads(meta_file.read_text(encoding='utf-8'))
        except Exception:
            meta = {}
        meta['lifecycle_status'] = 'active'
        meta_file.write_text(json.dumps(meta, indent=2), encoding='utf-8')
    (model_dir / 'active_model.json').write_text(json.dumps({'path': run_dir.name}, indent=2), encoding='utf-8')
    latest = model_dir / 'latest'
    if latest.exists():
        shutil.rmtree(latest)
    shutil.copytree(run_dir, latest)
    return True


def delete_bundle(model_dir: Path, model_id: str) -> bool:
    model_dir = Path(model_dir)
    run_dir = model_dir / model_id
    if not run_dir.exists():
        return False
    active = _active_pointer(model_dir)
    if active and active.resolve() == run_dir.resolve():
        return False
    shutil.rmtree(run_dir, ignore_errors=True)
    return True
