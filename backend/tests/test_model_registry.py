from __future__ import annotations

import tempfile
from pathlib import Path

from app.ml.model_store import activate_bundle, delete_bundle, save_bundle
from app.ml.train import _require_family_available
from app.storage import Storage


def test_strict_model_family_validation_missing_optional():
    # This should always raise cleanly when optional engine is not present.
    # If the engine is installed in the environment, the function should simply return.
    try:
        _require_family_available("lightgbm")
    except RuntimeError as exc:
        assert "LightGBM is not installed" in str(exc)


def test_model_archive_delete_workflow():
    with tempfile.TemporaryDirectory() as tmp:
        db_path = f"sqlite:///{Path(tmp) / 'test.db'}"
        model_dir = Path(tmp) / "models"
        storage = Storage(db_path)
        storage.init()

        meta = {
            "model_id": "beta_baseline_1d_test",
            "display_name": "BASELINE 1D Test",
            "lifecycle_status": "beta",
            "feature_blocks": {"price": True, "sentiment": True, "macro": False, "finbert_ready": False},
        }
        run_dir = save_bundle(model_dir, mean={"m": 1}, q10={"m": 2}, q90={"m": 3}, up={"m": 4}, meta=meta, activate=False)
        storage.register_model(model_id=meta["model_id"], path=run_dir.name, meta=meta, is_active=False)

        listed = storage.list_models()
        assert listed[0]["meta"]["lifecycle_status"] == "beta"

        assert storage.archive_model(meta["model_id"]) is True
        listed = storage.list_models()
        assert listed[0]["meta"]["lifecycle_status"] == "archived"

        assert storage.delete_model(meta["model_id"]) is True
        assert delete_bundle(model_dir, meta["model_id"]) is True
        assert storage.list_models() == []


def test_active_model_cannot_be_deleted():
    with tempfile.TemporaryDirectory() as tmp:
        db_path = f"sqlite:///{Path(tmp) / 'test.db'}"
        model_dir = Path(tmp) / "models"
        storage = Storage(db_path)
        storage.init()

        meta = {"model_id": "beta_baseline_active_test", "lifecycle_status": "active"}
        run_dir = save_bundle(model_dir, mean={"m": 1}, q10={"m": 2}, q90={"m": 3}, up={"m": 4}, meta=meta, activate=False)
        storage.register_model(model_id=meta["model_id"], path=run_dir.name, meta=meta, is_active=False)
        assert activate_bundle(model_dir, meta["model_id"]) is True
        assert storage.activate_model(meta["model_id"]) is True
        assert storage.delete_model(meta["model_id"]) is False
        assert delete_bundle(model_dir, meta["model_id"]) is False
