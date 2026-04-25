from __future__ import annotations

from typing import Any, Dict, List, Optional, Tuple

import numpy as np
import pandas as pd
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import accuracy_score, roc_auc_score
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler

from ..storage import Storage
from .features import make_feature_frame


def _date_holdout_split(df: pd.DataFrame, holdout_ratio: float = 0.15) -> Tuple[pd.DataFrame, pd.DataFrame]:
    dates = sorted(pd.to_datetime(df["date"]).dt.normalize().unique())
    if len(dates) < 20:
        split_idx = max(1, int(len(df) * (1.0 - holdout_ratio)))
        return df.iloc[:split_idx].copy(), df.iloc[split_idx:].copy()
    cutoff_idx = max(1, int(len(dates) * (1.0 - holdout_ratio)))
    cutoff_date = dates[cutoff_idx]
    train = df[pd.to_datetime(df["date"]).dt.normalize() < cutoff_date].copy()
    test = df[pd.to_datetime(df["date"]).dt.normalize() >= cutoff_date].copy()
    if train.empty or test.empty:
        split_idx = max(1, int(len(df) * (1.0 - holdout_ratio)))
        return df.iloc[:split_idx].copy(), df.iloc[split_idx:].copy()
    return train, test


def _fit_eval(df: pd.DataFrame, feature_cols: List[str]) -> Dict[str, Any]:
    train, test = _date_holdout_split(df)
    if len(train) < 100 or len(test) < 20:
        raise RuntimeError("Not enough rows for comparison after time split")
    X_train = train[feature_cols].values
    y_train = train["target_up"].values
    X_test = test[feature_cols].values
    y_test = test["target_up"].values
    model = Pipeline([
        ("scale", StandardScaler()),
        ("clf", LogisticRegression(max_iter=800, class_weight="balanced", solver="lbfgs")),
    ])
    model.fit(X_train, y_train)
    prob = model.predict_proba(X_test)[:, 1]
    pred = (prob >= 0.5).astype(int)
    return {
        "rows_train": int(len(train)),
        "rows_test": int(len(test)),
        "features": int(len(feature_cols)),
        "acc_up": float(accuracy_score(y_test, pred)),
        "auc_up": float(roc_auc_score(y_test, prob)) if len(np.unique(y_test)) > 1 else None,
        "feature_columns": feature_cols,
    }


def _collect_frame(storage: Storage, symbols: List[str], *, official_only: bool, horizon_days: int) -> Tuple[pd.DataFrame, List[str]]:
    aspi = storage.get_index_series("ASPI", limit=1500)
    index_series = aspi if aspi else None
    macro_all = storage.get_macro_series(limit=8000)
    if official_only:
        macro_series = [row for row in macro_all if not str(row.get("indicator_key") or "").startswith("news_market_")]
    else:
        macro_series = macro_all
    frames = []
    feature_cols: List[str] = []
    source_types = ["cse_announcement", "cse_document"] if official_only else None
    for sym in symbols:
        hist = storage.get_price_history(sym, limit=1200)
        if len(hist) < 160:
            continue
        sentiment_series = storage.get_sentiment_feature_series(sym, limit=1600, source_types=source_types)
        df, feats = make_feature_frame(
            hist,
            index_series=index_series,
            symbol=sym.upper(),
            horizon_days=horizon_days,
            sentiment_series=sentiment_series,
            macro_series=macro_series,
        )
        if not df.empty:
            frames.append(df)
            feature_cols = feats
    if not frames:
        return pd.DataFrame(), []
    return pd.concat(frames, ignore_index=True).sort_values(["date", "symbol"]).reset_index(drop=True), feature_cols


def compare_official_vs_news(database_url: str, symbols: Optional[List[str]] = None, horizon_days: int = 1, max_symbols: int = 40) -> Dict[str, Any]:
    storage = Storage(database_url)
    storage.init()
    if symbols:
        use_symbols = [str(s).upper() for s in symbols][:max_symbols]
    else:
        use_symbols = [c["symbol"] for c in storage.list_companies() if c.get("symbol")][:max_symbols]
    official_df, official_cols = _collect_frame(storage, use_symbols, official_only=True, horizon_days=horizon_days)
    combined_df, combined_cols = _collect_frame(storage, use_symbols, official_only=False, horizon_days=horizon_days)
    if official_df.empty:
        raise RuntimeError("Official-CSE-only comparison frame is empty. Sync/import data and refresh sentiment/documents first.")
    if combined_df.empty:
        raise RuntimeError("Combined comparison frame is empty. Ingest selected news and rebuild features first.")
    official = _fit_eval(official_df, official_cols)
    combined = _fit_eval(combined_df, combined_cols)
    official_auc = official.get("auc_up")
    combined_auc = combined.get("auc_up")
    return {
        "horizon_days": horizon_days,
        "symbols": use_symbols,
        "official_cse_only": {k: v for k, v in official.items() if k != "feature_columns"},
        "official_cse_plus_selected_news": {k: v for k, v in combined.items() if k != "feature_columns"},
        "deltas": {
            "acc_up": round(float(combined["acc_up"]) - float(official["acc_up"]), 6),
            "auc_up": None if official_auc is None or combined_auc is None else round(float(combined_auc) - float(official_auc), 6),
            "added_features": len(set(combined_cols) - set(official_cols)),
        },
        "added_feature_columns": sorted(list(set(combined_cols) - set(official_cols))),
        "recommendation": "activate_selected_news_features" if float(combined["acc_up"]) >= float(official["acc_up"]) else "keep_official_cse_only_baseline",
    }
