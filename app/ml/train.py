from __future__ import annotations

import json
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, List, Optional, Tuple

import numpy as np
import pandas as pd
from sklearn.base import clone
from sklearn.ensemble import GradientBoostingRegressor, RandomForestClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import accuracy_score, mean_absolute_error, mean_squared_error, roc_auc_score

from ..storage import Storage
from .features import make_feature_frame
from .model_store import save_bundle


@dataclass
class TrainResult:
    rows: int
    symbols: int
    metrics: Dict[str, float]
    model_path: Path


def _collect_training_data(
    storage: Storage,
    symbols: List[str],
    index_series: Optional[List[Dict]] = None,
    horizon_days: int = 1,
) -> Tuple[pd.DataFrame, List[str]]:
    frames = []
    feature_names: List[str] = []
    for sym in symbols:
        hist = storage.get_price_history(sym, limit=1200)
        if len(hist) < 160:
            continue
        df, feats = make_feature_frame(hist, index_series=index_series, symbol=sym.upper(), horizon_days=horizon_days)
        if df.empty:
            continue
        frames.append(df)
        feature_names = feats
    if not frames:
        return pd.DataFrame(), []
    return pd.concat(frames, ignore_index=True), feature_names


def _date_holdout_split(df: pd.DataFrame, holdout_ratio: float = 0.15) -> Tuple[pd.DataFrame, pd.DataFrame]:
    dates = sorted(pd.to_datetime(df["date"]).dt.normalize().unique())
    if len(dates) < 30:
        split_idx = max(1, int(len(df) * (1.0 - holdout_ratio)))
        return df.iloc[:split_idx].copy(), df.iloc[split_idx:].copy()
    cutoff_idx = max(1, int(len(dates) * (1.0 - holdout_ratio)))
    cutoff_date = dates[cutoff_idx]
    train_df = df[pd.to_datetime(df["date"]).dt.normalize() < cutoff_date].copy()
    test_df = df[pd.to_datetime(df["date"]).dt.normalize() >= cutoff_date].copy()
    if train_df.empty or test_df.empty:
        split_idx = max(1, int(len(df) * (1.0 - holdout_ratio)))
        return df.iloc[:split_idx].copy(), df.iloc[split_idx:].copy()
    return train_df, test_df


def _clf_candidates() -> Dict[str, object]:
    out: Dict[str, object] = {
        "LogisticRegression": LogisticRegression(max_iter=1200, class_weight="balanced", solver="lbfgs", random_state=42),
        "RandomForestClassifier": RandomForestClassifier(random_state=42, n_estimators=80, max_depth=6, min_samples_leaf=4, n_jobs=-1),
    }
    return out


def _eval_classifier(clf, X_train, y_train, X_test, y_test) -> Dict[str, float]:
    model = clone(clf)
    model.fit(X_train, y_train)
    prob = model.predict_proba(X_test)[:, 1]
    pred = (prob >= 0.5).astype(int)
    return {
        "acc_up": float(accuracy_score(y_test, pred)),
        "auc_up": float(roc_auc_score(y_test, prob)) if len(np.unique(y_test)) > 1 else float("nan"),
        "pred_up_rate": float(np.mean(pred)),
        "model": model,
    }


def _walk_forward_report(df: pd.DataFrame, feat_cols: List[str], clf_template) -> List[Dict[str, float]]:
    dates = sorted(pd.to_datetime(df["date"]).dt.normalize().unique())
    if len(dates) < 90:
        return []
    folds = []
    for frac in [0.80]:
        cutoff = dates[int(len(dates) * frac)]
        train_df = df[pd.to_datetime(df["date"]).dt.normalize() < cutoff]
        test_df = df[pd.to_datetime(df["date"]).dt.normalize() >= cutoff]
        if len(train_df) < 200 or len(test_df) < 50:
            continue
        X_train = train_df[feat_cols].values
        y_train = train_df["target_up"].values
        X_test = test_df[feat_cols].values
        y_test = test_df["target_up"].values
        try:
            m = clone(clf_template)
            m.fit(X_train, y_train)
            prob = m.predict_proba(X_test)[:, 1]
            pred = (prob >= 0.5).astype(int)
            folds.append(
                {
                    "train_end": str(pd.to_datetime(train_df["date"]).max().date()),
                    "test_start": str(pd.to_datetime(test_df["date"]).min().date()),
                    "test_end": str(pd.to_datetime(test_df["date"]).max().date()),
                    "rows_train": int(len(train_df)),
                    "rows_test": int(len(test_df)),
                    "acc_up": float(accuracy_score(y_test, pred)),
                    "auc_up": float(roc_auc_score(y_test, prob)) if len(np.unique(y_test)) > 1 else float("nan"),
                }
            )
        except Exception:
            continue
    return folds


def _per_symbol_holdout(test_df: pd.DataFrame, pred_prob: np.ndarray, pred_ret: np.ndarray) -> List[Dict[str, float]]:
    tmp = test_df[["symbol", "target_up", "target_return"]].copy()
    tmp["pred_up_prob"] = pred_prob
    tmp["pred_return"] = pred_ret
    out = []
    for sym, g in tmp.groupby("symbol"):
        if len(g) < 3:
            continue
        pred = (g["pred_up_prob"] >= 0.5).astype(int)
        auc = float("nan")
        if len(np.unique(g["target_up"])) > 1:
            auc = float(roc_auc_score(g["target_up"], g["pred_up_prob"]))
        out.append(
            {
                "symbol": str(sym),
                "rows": int(len(g)),
                "acc_up": float(accuracy_score(g["target_up"], pred)),
                "auc_up": auc,
                "mae_return": float(mean_absolute_error(g["target_return"], g["pred_return"])),
                "avg_abs_return": float(np.mean(np.abs(g["target_return"]))),
            }
        )
    out.sort(key=lambda x: (x["rows"], x["acc_up"]), reverse=True)
    return out


def train_from_db(
    *,
    database_url: str,
    model_dir: str,
    symbols: Optional[List[str]] = None,
    horizon_days: int = 1,
) -> TrainResult:
    storage = Storage(database_url)
    storage.init()

    comps = storage.list_companies()
    all_symbols = [c["symbol"] for c in comps if c.get("symbol")]
    use_symbols = [s.upper() for s in symbols] if symbols else all_symbols

    aspi = storage.get_index_series("ASPI", limit=1500)
    index_series = aspi if aspi else None

    df, feat_cols = _collect_training_data(storage, use_symbols, index_series=index_series, horizon_days=horizon_days)
    if df.empty:
        raise RuntimeError("Not enough stored price history to train. Run sync/import first.")

    df = df.sort_values(["date", "symbol"]).reset_index(drop=True)
    train_df, test_df = _date_holdout_split(df, holdout_ratio=0.15)
    if train_df.empty or test_df.empty:
        raise RuntimeError("Training split failed: not enough time-separated history.")

    X_train = train_df[feat_cols].values
    y_train_r = train_df["target_return"].values
    y_train_u = train_df["target_up"].values
    X_test = test_df[feat_cols].values
    y_test_r = test_df["target_return"].values
    y_test_u = test_df["target_up"].values

    mean = GradientBoostingRegressor(random_state=42, n_estimators=240, learning_rate=0.05, max_depth=3, subsample=0.9)
    q10 = GradientBoostingRegressor(loss="quantile", alpha=0.10, random_state=42, n_estimators=200, learning_rate=0.05, max_depth=3, subsample=0.9)
    q90 = GradientBoostingRegressor(loss="quantile", alpha=0.90, random_state=42, n_estimators=200, learning_rate=0.05, max_depth=3, subsample=0.9)
    mean.fit(X_train, y_train_r)
    q10.fit(X_train, y_train_r)
    q90.fit(X_train, y_train_r)
    pred_r = mean.predict(X_test)

    comparison: Dict[str, Dict[str, float]] = {}
    best_name = None
    best_auc = -1.0
    best_model = None
    best_prob = None
    for name, clf in _clf_candidates().items():
        try:
            res = _eval_classifier(clf, X_train, y_train_u, X_test, y_test_u)
            comparison[name] = {k: float(v) for k, v in res.items() if k != "model"}
            auc = res.get("auc_up")
            score = auc if np.isfinite(auc) else res.get("acc_up", -1.0)
            if score > best_auc:
                best_auc = score
                best_name = name
                best_model = res["model"]
                best_prob = res["model"].predict_proba(X_test)[:, 1]
        except Exception as e:
            comparison[name] = {"error": str(e)}
    if best_model is None or best_prob is None:
        raise RuntimeError("No direction classifier trained successfully.")

    pred_u = (best_prob >= 0.5).astype(int)
    base_rate = float(np.mean(y_test_u)) if len(y_test_u) else float("nan")
    majority_class = int(base_rate >= 0.5) if not np.isnan(base_rate) else 0
    baseline_pred = np.full_like(y_test_u, majority_class)

    walk_forward = _walk_forward_report(df, feat_cols, LogisticRegression(max_iter=1200, class_weight="balanced", solver="lbfgs", random_state=42))
    per_symbol = _per_symbol_holdout(test_df, best_prob, pred_r)

    metrics = {
        "acc_up": float(accuracy_score(y_test_u, pred_u)),
        "auc_up": float(roc_auc_score(y_test_u, best_prob)) if len(np.unique(y_test_u)) > 1 else float("nan"),
        "mae_return": float(mean_absolute_error(y_test_r, pred_r)),
        "rmse_return": float(np.sqrt(mean_squared_error(y_test_r, pred_r))),
        "baseline_acc_up": float(accuracy_score(y_test_u, baseline_pred)),
        "test_up_rate": float(base_rate),
        "pred_up_rate": float(np.mean(pred_u)),
        "avg_abs_test_return": float(np.mean(np.abs(y_test_r))),
        "rows_train": int(len(train_df)),
        "rows_test": int(len(test_df)),
        "features": int(len(feat_cols)),
    }

    train_dates = pd.to_datetime(train_df["date"])
    test_dates = pd.to_datetime(test_df["date"])
    meta = {
        "model_version": "v5",
        "model_id": f"model_{datetime.now(timezone.utc).strftime('%Y%m%d%H%M%S')}",
        "trained_at_utc": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "horizon_days": horizon_days,
        "feature_names": feat_cols,
        "symbols": sorted(list(set(df["symbol"].dropna().astype(str).tolist()))),
        "metrics_holdout": metrics,
        "train_period": {"start": str(train_dates.min().date()), "end": str(train_dates.max().date())},
        "test_period": {"start": str(test_dates.min().date()), "end": str(test_dates.max().date())},
        "models": {"mean": "GradientBoostingRegressor", "quantiles": "GradientBoostingRegressor", "direction": best_name},
        "model_comparison": comparison,
        "walk_forward": walk_forward,
        "per_symbol_holdout": per_symbol[:25],
    }

    model_path = save_bundle(Path(model_dir), mean=mean, q10=q10, q90=q90, up=best_model, meta=meta)
    latest = Path(model_path)
    (latest / "model_report.json").write_text(json.dumps(meta, indent=2), encoding="utf-8")
    pd.DataFrame(per_symbol).to_csv(latest / "per_symbol_holdout.csv", index=False)
    pd.DataFrame(walk_forward).to_csv(latest / "walk_forward.csv", index=False)

    return TrainResult(rows=int(len(df)), symbols=len(meta["symbols"]), metrics=metrics, model_path=model_path)
