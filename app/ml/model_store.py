from __future__ import annotations

import json
from dataclasses import dataclass
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


def latest_bundle(model_dir: Path) -> Optional[ModelBundle]:
    """Load the latest model bundle if available."""
    model_dir = Path(model_dir)
    latest = model_dir / "latest"
    meta_path = latest / "metadata.json"
    if not meta_path.exists():
        return None

    with meta_path.open("r", encoding="utf-8") as f:
        meta = json.load(f)

    feature_names = meta.get("feature_names") or []
    try:
        mean = joblib.load(latest / "model_mean.pkl")
        q10 = joblib.load(latest / "model_q10.pkl")
        q90 = joblib.load(latest / "model_q90.pkl")
        up = joblib.load(latest / "model_up.pkl")
    except Exception:
        return None

    return ModelBundle(mean=mean, q10=q10, q90=q90, up=up, feature_names=feature_names, meta=meta)


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
    latest = model_dir / "latest"
    latest.mkdir(parents=True, exist_ok=True)
    joblib.dump(mean, latest / "model_mean.pkl")
    joblib.dump(q10, latest / "model_q10.pkl")
    joblib.dump(q90, latest / "model_q90.pkl")
    joblib.dump(up, latest / "model_up.pkl")
    with (latest / "metadata.json").open("w", encoding="utf-8") as f:
        json.dump(meta, f, indent=2)
    return latest
