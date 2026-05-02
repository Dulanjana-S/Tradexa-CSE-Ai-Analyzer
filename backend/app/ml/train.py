from __future__ import annotations

import json
from functools import lru_cache
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import numpy as np
import pandas as pd
from sklearn.base import clone
from sklearn.ensemble import GradientBoostingClassifier, GradientBoostingRegressor, RandomForestClassifier
from sklearn.linear_model import LogisticRegression, Ridge
from sklearn.metrics import accuracy_score, mean_absolute_error, mean_squared_error, roc_auc_score
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler

from ..storage import Storage
from .features import make_feature_frame
from .model_store import runtime_versions, save_bundle


@dataclass
class TrainResult:
    rows: int
    symbols: int
    metrics: Dict[str, float]
    model_path: Path


@lru_cache(maxsize=1)
def _optional_import_models() -> Dict[str, Any]:
    libs: Dict[str, Any] = {}
    try:
        from lightgbm import LGBMClassifier, LGBMRegressor  # type: ignore
        libs["LightGBM"] = (LGBMClassifier, LGBMRegressor)
    except Exception:
        pass
    try:
        from xgboost import XGBClassifier, XGBRegressor  # type: ignore
        libs["XGBoost"] = (XGBClassifier, XGBRegressor)
    except Exception:
        pass
    try:
        from catboost import CatBoostClassifier, CatBoostRegressor  # type: ignore
        libs["CatBoost"] = (CatBoostClassifier, CatBoostRegressor)
    except Exception:
        pass
    return libs


def _normalize_family(value: Optional[str]) -> str:
    raw = str(value or "auto").strip().lower().replace("-", "_")
    aliases = {
        "baseline": "baseline",
        "ridge": "baseline",
        "linear": "baseline",
        "auto": "auto",
        "boosted": "auto",
        "auto_boosted": "auto",
        "lightgbm": "lightgbm",
        "lgbm": "lightgbm",
        "xgboost": "xgboost",
        "xgb": "xgboost",
        "catboost": "catboost",
        "cat": "catboost",
        "sklearn_gbdt": "sklearn_gbdt",
        "hist_gradient_boosting": "sklearn_gbdt",
        "legacy_boosted": "legacy_boosted",
        "legacy": "legacy_boosted",
        "rf_gbr": "legacy_boosted",
    }
    return aliases.get(raw, "auto")


def _neutral_threshold(horizon_days: int) -> float:
    # Daily CSE returns are noisy. This creates a realistic no-trade zone for meta filtering.
    return max(0.004, min(0.025, 0.006 * max(1, horizon_days) ** 0.5))


def _require_family_available(model_family: str) -> None:
    family = _normalize_family(model_family)
    optional = _optional_import_models()
    if family == "lightgbm" and "LightGBM" not in optional:
        raise RuntimeError("LightGBM is not installed. Install optional ML extras before training this model family.")
    if family == "xgboost" and "XGBoost" not in optional:
        raise RuntimeError("XGBoost is not installed. Install optional ML extras before training this model family.")
    if family == "catboost" and "CatBoost" not in optional:
        raise RuntimeError("CatBoost is not installed. Install optional ML extras before training this model family.")


def _collect_training_data(
    storage: Storage,
    symbols: List[str],
    index_series: Optional[List[Dict]] = None,
    horizon_days: int = 1,
) -> Tuple[pd.DataFrame, List[str]]:
    frames = []
    feature_names: List[str] = []
    for sym in symbols:
        hist = storage.get_price_history(sym, limit=1600)
        if len(hist) < 160:
            continue
        sentiment_series = storage.get_sentiment_feature_series(sym, limit=2000)
        macro_series = storage.get_macro_series(limit=10000)
        df, feats = make_feature_frame(
            hist,
            index_series=index_series,
            symbol=sym.upper(),
            horizon_days=horizon_days,
            sentiment_series=sentiment_series,
            macro_series=macro_series,
        )
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


def _regressor_candidates(model_family: str) -> Dict[str, object]:
    family = _normalize_family(model_family)
    optional = _optional_import_models()
    if family == "baseline":
        return {"RidgeBaseline": Pipeline([("scale", StandardScaler()), ("ridge", Ridge(alpha=1.0))])}
    if family == "sklearn_gbdt":
        return {"SklearnGBR": GradientBoostingRegressor(n_estimators=90, learning_rate=0.035, max_depth=3, min_samples_leaf=10, random_state=42)}
    if family == "legacy_boosted":
        return {"GradientBoostingRegressor": GradientBoostingRegressor(n_estimators=120, learning_rate=0.03, max_depth=3, min_samples_leaf=8, random_state=42)}
    if family == "lightgbm":
        _, LGBMRegressor = optional["LightGBM"]
        return {"LightGBM": LGBMRegressor(n_estimators=260, learning_rate=0.035, num_leaves=24, subsample=0.85, colsample_bytree=0.85, reg_alpha=0.05, reg_lambda=0.25, random_state=42, verbosity=-1)}
    if family == "xgboost":
        _, XGBRegressor = optional["XGBoost"]
        return {"XGBoost": XGBRegressor(n_estimators=260, max_depth=4, learning_rate=0.035, subsample=0.85, colsample_bytree=0.85, reg_lambda=1.0, objective="reg:squarederror", random_state=42, n_jobs=2)}
    if family == "catboost":
        _, CatBoostRegressor = optional["CatBoost"]
        return {"CatBoost": CatBoostRegressor(iterations=260, learning_rate=0.035, depth=5, loss_function="RMSE", random_seed=42, verbose=False)}
    candidates: Dict[str, object] = {
        "RidgeBaseline": Pipeline([("scale", StandardScaler()), ("ridge", Ridge(alpha=1.0))]),
        "SklearnGBR": GradientBoostingRegressor(n_estimators=90, learning_rate=0.035, max_depth=3, min_samples_leaf=10, random_state=42),
    }
    if "LightGBM" in optional:
        _, LGBMRegressor = optional["LightGBM"]
        candidates["LightGBM"] = LGBMRegressor(n_estimators=260, learning_rate=0.035, num_leaves=24, subsample=0.85, colsample_bytree=0.85, reg_alpha=0.05, reg_lambda=0.25, random_state=42, verbosity=-1)
    if "XGBoost" in optional:
        _, XGBRegressor = optional["XGBoost"]
        candidates["XGBoost"] = XGBRegressor(n_estimators=260, max_depth=4, learning_rate=0.035, subsample=0.85, colsample_bytree=0.85, reg_lambda=1.0, objective="reg:squarederror", random_state=42, n_jobs=2)
    if "CatBoost" in optional:
        _, CatBoostRegressor = optional["CatBoost"]
        candidates["CatBoost"] = CatBoostRegressor(iterations=260, learning_rate=0.035, depth=5, loss_function="RMSE", random_seed=42, verbose=False)
    return candidates


def _clf_candidates(model_family: str) -> Dict[str, object]:
    family = _normalize_family(model_family)
    optional = _optional_import_models()
    if family == "baseline":
        return {"LogisticRegressionBaseline": Pipeline([("scale", StandardScaler()), ("logreg", LogisticRegression(max_iter=900, class_weight="balanced", solver="lbfgs", random_state=42))])}
    if family == "sklearn_gbdt":
        return {
            "SklearnGBC": GradientBoostingClassifier(n_estimators=90, learning_rate=0.035, max_depth=3, min_samples_leaf=10, random_state=42),
            "RandomForest": RandomForestClassifier(n_estimators=120, max_depth=8, min_samples_leaf=8, class_weight="balanced_subsample", random_state=42, n_jobs=2),
        }
    if family == "legacy_boosted":
        return {
            "RandomForestClassifier": RandomForestClassifier(n_estimators=140, max_depth=8, min_samples_leaf=8, class_weight="balanced_subsample", random_state=42, n_jobs=2),
        }
    if family == "lightgbm":
        LGBMClassifier, _ = optional["LightGBM"]
        return {"LightGBM": LGBMClassifier(n_estimators=280, learning_rate=0.035, num_leaves=24, subsample=0.85, colsample_bytree=0.85, reg_alpha=0.05, reg_lambda=0.25, class_weight="balanced", random_state=42, verbosity=-1)}
    if family == "xgboost":
        XGBClassifier, _ = optional["XGBoost"]
        return {"XGBoost": XGBClassifier(n_estimators=280, max_depth=4, learning_rate=0.035, subsample=0.85, colsample_bytree=0.85, reg_lambda=1.0, objective="binary:logistic", eval_metric="logloss", random_state=42, n_jobs=2)}
    if family == "catboost":
        CatBoostClassifier, _ = optional["CatBoost"]
        return {"CatBoost": CatBoostClassifier(iterations=280, learning_rate=0.035, depth=5, loss_function="Logloss", random_seed=42, verbose=False)}
    candidates: Dict[str, object] = {
        "LogisticRegressionBaseline": Pipeline([("scale", StandardScaler()), ("logreg", LogisticRegression(max_iter=900, class_weight="balanced", solver="lbfgs", random_state=42))]),
        "SklearnGBC": GradientBoostingClassifier(n_estimators=90, learning_rate=0.035, max_depth=3, min_samples_leaf=10, random_state=42),
        "RandomForest": RandomForestClassifier(n_estimators=120, max_depth=8, min_samples_leaf=8, class_weight="balanced_subsample", random_state=42, n_jobs=2),
    }
    if "LightGBM" in optional:
        LGBMClassifier, _ = optional["LightGBM"]
        candidates["LightGBM"] = LGBMClassifier(n_estimators=280, learning_rate=0.035, num_leaves=24, subsample=0.85, colsample_bytree=0.85, reg_alpha=0.05, reg_lambda=0.25, class_weight="balanced", random_state=42, verbosity=-1)
    if "XGBoost" in optional:
        XGBClassifier, _ = optional["XGBoost"]
        candidates["XGBoost"] = XGBClassifier(n_estimators=280, max_depth=4, learning_rate=0.035, subsample=0.85, colsample_bytree=0.85, reg_lambda=1.0, objective="binary:logistic", eval_metric="logloss", random_state=42, n_jobs=2)
    if "CatBoost" in optional:
        CatBoostClassifier, _ = optional["CatBoost"]
        candidates["CatBoost"] = CatBoostClassifier(iterations=280, learning_rate=0.035, depth=5, loss_function="Logloss", random_seed=42, verbose=False)
    return candidates


def _classification_scores(y_true: np.ndarray, prob: np.ndarray, neutral: float, target_return: Optional[np.ndarray] = None) -> Dict[str, float]:
    pred = (prob >= 0.5).astype(int)
    out: Dict[str, float] = {
        "acc_up": float(accuracy_score(y_true, pred)),
        "auc_up": float(roc_auc_score(y_true, prob)) if len(np.unique(y_true)) > 1 else float("nan"),
        "pred_up_rate": float(np.mean(pred)),
    }
    strength = np.abs(prob - 0.5) * 2.0
    for thr in [0.55, 0.60, 0.65]:
        mask = strength >= (thr - 0.5) * 2.0
        out[f"coverage_p{int(thr*100)}"] = float(np.mean(mask)) if len(mask) else 0.0
        out[f"acc_p{int(thr*100)}"] = float(accuracy_score(y_true[mask], pred[mask])) if np.any(mask) else float("nan")
    if target_return is not None:
        action_mask = np.abs(target_return) >= neutral
        out["neutral_zone_threshold"] = float(neutral)
        out["actionable_rows_rate"] = float(np.mean(action_mask)) if len(action_mask) else 0.0
        out["actionable_acc_up"] = float(accuracy_score(y_true[action_mask], pred[action_mask])) if np.any(action_mask) else float("nan")
    return out


def _fit_best_regressor(candidates: Dict[str, object], X_train, y_train, X_test, y_test) -> Tuple[str, object, np.ndarray, Dict[str, Dict[str, float]]]:
    best_name = "RidgeBaseline"
    best_model = None
    best_pred = None
    best_mae = float("inf")
    comparison: Dict[str, Dict[str, float]] = {}
    for name, reg in candidates.items():
        try:
            model = clone(reg)
            model.fit(X_train, y_train)
            pred = np.asarray(model.predict(X_test), dtype=float)
            mae = float(mean_absolute_error(y_test, pred))
            rmse = float(np.sqrt(mean_squared_error(y_test, pred)))
            comparison[name] = {"mae_return": mae, "rmse_return": rmse}
            if mae < best_mae:
                best_mae = mae
                best_name = name
                best_model = model
                best_pred = pred
        except Exception as exc:
            comparison[name] = {"error": str(exc)}
    if best_model is None or best_pred is None:
        raise RuntimeError("No return regressor trained successfully.")
    return best_name, best_model, best_pred, comparison


def _fit_best_classifier(candidates: Dict[str, object], X_train, y_train, X_test, y_test, y_test_return, neutral: float) -> Tuple[str, object, np.ndarray, Dict[str, Dict[str, float]]]:
    best_name = "LogisticRegressionBaseline"
    best_model = None
    best_prob = None
    best_score = -1.0
    comparison: Dict[str, Dict[str, float]] = {}
    for name, clf in candidates.items():
        try:
            model = clone(clf)
            model.fit(X_train, y_train)
            prob = np.asarray(model.predict_proba(X_test)[:, 1], dtype=float)
            scores = _classification_scores(y_test, prob, neutral=neutral, target_return=y_test_return)
            comparison[name] = {k: float(v) for k, v in scores.items()}
            auc = scores.get("auc_up")
            acc60 = scores.get("acc_p60")
            score = (auc if np.isfinite(auc) else scores.get("acc_up", 0.0)) + 0.10 * (acc60 if np.isfinite(acc60) else 0.0)
            if score > best_score:
                best_score = float(score)
                best_name = name
                best_model = model
                best_prob = prob
        except Exception as exc:
            comparison[name] = {"error": str(exc)}
    if best_model is None or best_prob is None:
        raise RuntimeError("No direction classifier trained successfully.")
    return best_name, best_model, best_prob, comparison


def _fit_meta_model(base_model: object, X_train: np.ndarray, y_train_u: np.ndarray, y_train_r: np.ndarray, neutral: float):
    try:
        prob_train = np.asarray(base_model.predict_proba(X_train)[:, 1], dtype=float)
        pred_train = (prob_train >= 0.5).astype(int)
        useful = ((pred_train == y_train_u) & (np.abs(y_train_r) >= neutral)).astype(int)
        if len(np.unique(useful)) < 2:
            return None, {"enabled": False, "reason": "not_enough_meta_label_variation"}
        meta_X = np.column_stack([X_train, prob_train, np.abs(prob_train - 0.5) * 2.0])
        meta = Pipeline([
            ("scale", StandardScaler()),
            ("logreg", LogisticRegression(max_iter=700, class_weight="balanced", random_state=42)),
        ])
        meta.fit(meta_X, useful)
        return meta, {"enabled": True, "target": "correct_and_above_neutral_zone", "neutral_zone_threshold": neutral}
    except Exception as exc:
        return None, {"enabled": False, "error": str(exc)}


def _walk_forward_report(df: pd.DataFrame, feat_cols: List[str], clf_template) -> List[Dict[str, float]]:
    dates = sorted(pd.to_datetime(df["date"]).dt.normalize().unique())
    if len(dates) < 90:
        return []
    folds = []
    for frac in [0.70, 0.80]:
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
            prob = np.asarray(m.predict_proba(X_test)[:, 1], dtype=float)
            pred = (prob >= 0.5).astype(int)
            folds.append({
                "train_end": str(pd.to_datetime(train_df["date"]).max().date()),
                "test_start": str(pd.to_datetime(test_df["date"]).min().date()),
                "test_end": str(pd.to_datetime(test_df["date"]).max().date()),
                "rows_train": int(len(train_df)),
                "rows_test": int(len(test_df)),
                "acc_up": float(accuracy_score(y_test, pred)),
                "auc_up": float(roc_auc_score(y_test, prob)) if len(np.unique(y_test)) > 1 else float("nan"),
            })
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
        out.append({
            "symbol": str(sym),
            "rows": int(len(g)),
            "acc_up": float(accuracy_score(g["target_up"], pred)),
            "auc_up": auc,
            "mae_return": float(mean_absolute_error(g["target_return"], g["pred_return"])),
            "avg_abs_return": float(np.mean(np.abs(g["target_return"]))),
        })
    out.sort(key=lambda x: (x["rows"], x["acc_up"]), reverse=True)
    return out


def train_from_db(
    *,
    database_url: str,
    model_dir: str,
    symbols: Optional[List[str]] = None,
    horizon_days: int = 1,
    model_family: str = "auto",
) -> TrainResult:
    storage = Storage(database_url)
    storage.init()

    family = _normalize_family(model_family)
    _require_family_available(family)
    comps = storage.list_companies()
    all_symbols = [c["symbol"] for c in comps if c.get("symbol")]
    use_symbols = [s.upper() for s in symbols] if symbols else all_symbols

    aspi = storage.get_index_series("ASPI", limit=1800)
    index_series = aspi if aspi else None

    df, feat_cols = _collect_training_data(storage, use_symbols, index_series=index_series, horizon_days=horizon_days)
    if df.empty:
        raise RuntimeError("Not enough stored price history to train. Run sync/import first.")

    df = df.sort_values(["date", "symbol"]).reset_index(drop=True)
    neutral = _neutral_threshold(horizon_days)
    df["target_action"] = (df["target_return"].abs() >= neutral).astype(int)
    df["target_3class"] = np.where(df["target_return"] > neutral, 1, np.where(df["target_return"] < -neutral, -1, 0))

    train_df, test_df = _date_holdout_split(df, holdout_ratio=0.15)
    if train_df.empty or test_df.empty:
        raise RuntimeError("Training split failed: not enough time-separated history.")

    X_train = train_df[feat_cols].values
    y_train_r = train_df["target_return"].values
    y_train_u = train_df["target_up"].values
    X_test = test_df[feat_cols].values
    y_test_r = test_df["target_return"].values
    y_test_u = test_df["target_up"].values

    reg_name, mean, pred_r, reg_comparison = _fit_best_regressor(_regressor_candidates(family), X_train, y_train_r, X_test, y_test_r)
    pred_train_r = np.asarray(mean.predict(X_train), dtype=float)
    residuals = y_train_r - pred_train_r
    q10_offset = float(np.quantile(residuals, 0.10)) if len(residuals) else 0.0
    q90_offset = float(np.quantile(residuals, 0.90)) if len(residuals) else 0.0
    q10 = clone(mean)
    q10.fit(X_train, y_train_r + q10_offset)
    q90 = clone(mean)
    q90.fit(X_train, y_train_r + q90_offset)

    clf_candidates = _clf_candidates(family)
    best_name, best_model, best_prob, comparison = _fit_best_classifier(clf_candidates, X_train, y_train_u, X_test, y_test_u, y_test_r, neutral)
    meta_model, meta_info = _fit_meta_model(best_model, X_train, y_train_u, y_train_r, neutral)

    pred_u = (best_prob >= 0.5).astype(int)
    base_rate = float(np.mean(y_test_u)) if len(y_test_u) else float("nan")
    majority_class = int(base_rate >= 0.5) if not np.isnan(base_rate) else 0
    baseline_pred = np.full_like(y_test_u, majority_class)

    clf_for_walk = clf_candidates.get(best_name) or next(iter(clf_candidates.values()))
    walk_forward = _walk_forward_report(df, feat_cols, clf_for_walk)
    per_symbol = _per_symbol_holdout(test_df, best_prob, pred_r)
    strength = np.abs(best_prob - 0.5) * 2.0
    strong_mask = strength >= 0.30

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
        "residual_q10": q10_offset,
        "residual_q90": q90_offset,
        "neutral_zone_threshold": neutral,
        "target_action_rate": float(np.mean(test_df["target_action"].values)),
        "strong_signal_coverage": float(np.mean(strong_mask)) if len(strong_mask) else 0.0,
        "strong_signal_acc_up": float(accuracy_score(y_test_u[strong_mask], pred_u[strong_mask])) if np.any(strong_mask) else float("nan"),
    }

    train_dates = pd.to_datetime(train_df["date"])
    test_dates = pd.to_datetime(test_df["date"])
    installed_optional = sorted(list(_optional_import_models().keys()))
    meta = {
        "model_version": "v9-commercial-registry",
        "model_id": f"beta_{family}_{horizon_days}d_{datetime.now(timezone.utc).strftime('%Y%m%d_%H%M')}",
        "display_name": f"{family.upper()} {horizon_days}D {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M UTC')}",
        "lifecycle_status": "beta",
        "trained_at_utc": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "horizon_days": horizon_days,
        "model_family_requested": family,
        "feature_names": feat_cols,
        "symbols": sorted(list(set(df["symbol"].dropna().astype(str).tolist()))),
        "metrics_holdout": metrics,
        "train_period": {"start": str(train_dates.min().date()), "end": str(train_dates.max().date())},
        "test_period": {"start": str(test_dates.min().date()), "end": str(test_dates.max().date())},
        "models": {"mean": reg_name, "quantiles": "ResidualOffsetAroundMean", "direction": best_name, "meta_filter": bool(meta_model)},
        "validation_summary": {
            "primary_metric": "auc_up",
            "primary_value": metrics.get("auc_up"),
            "secondary_metric": "acc_up",
            "secondary_value": metrics.get("acc_up"),
            "strong_signal_metric": "strong_signal_acc_up",
            "strong_signal_value": metrics.get("strong_signal_acc_up"),
        },
        "feature_blocks": {
            "price": True,
            "index": bool(index_series),
            "sentiment": any(name.startswith("sent_") for name in feat_cols),
            "macro": any(name.startswith("macro_") for name in feat_cols),
            "finbert_ready": True,
        },
        "optional_model_libraries_available": installed_optional,
        "runtime": runtime_versions(),
        "regressor_comparison": reg_comparison,
        "model_comparison": comparison,
        "meta_model": meta_info,
        "walk_forward": walk_forward,
        "per_symbol_holdout": per_symbol[:25],
        "accuracy_note": "Use strong_signal_acc_up and coverage for filtered high-confidence predictions; acc_up is the broad all-row holdout metric.",
    }

    model_path = save_bundle(Path(model_dir), mean=mean, q10=q10, q90=q90, up=best_model, meta=meta, meta_model=meta_model, activate=False)
    latest = Path(model_path)
    (latest / "model_report.json").write_text(json.dumps(meta, indent=2), encoding="utf-8")
    pd.DataFrame(per_symbol).to_csv(latest / "per_symbol_holdout.csv", index=False)
    pd.DataFrame(walk_forward).to_csv(latest / "walk_forward.csv", index=False)
    pd.DataFrame.from_dict(comparison, orient="index").to_csv(latest / "model_comparison.csv")
    pd.DataFrame.from_dict(reg_comparison, orient="index").to_csv(latest / "regressor_comparison.csv")

    return TrainResult(rows=int(len(df)), symbols=len(meta["symbols"]), metrics=metrics, model_path=model_path)
