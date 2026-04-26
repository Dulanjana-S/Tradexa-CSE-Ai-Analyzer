from __future__ import annotations

from pathlib import Path
from typing import Any, Dict, List

import numpy as np

from ..storage import Storage
from .features import make_feature_frame
from .model_store import latest_bundle


def _top_drivers(feature_names: List[str], x: np.ndarray, importances: np.ndarray, k: int = 8) -> List[Dict[str, Any]]:
    x = x.astype(float)
    if x.size == 0:
        return []
    z = (x - np.nanmean(x)) / (np.nanstd(x) + 1e-9)
    impact = z * importances
    idx = np.argsort(np.abs(impact))[::-1][:k]
    out = []
    for i in idx:
        out.append({"name": feature_names[i], "value": float(x[i]), "impact": float(impact[i])})
    return out



def _feature_label(name: str) -> str:
    n = name.lower()
    if n.startswith("sent_"):
        return "Sentiment / disclosures"
    if n.startswith("macro_"):
        return "Macro / economy"
    if "idx" in n or "rel_" in n or "beta" in n:
        return "Market benchmark"
    if "vol" in n or "liquidity" in n or "turnover" in n:
        return "Volume / liquidity"
    if "rsi" in n or "macd" in n or "sma" in n or "ema" in n or "trend" in n or "ret" in n:
        return "Price momentum"
    return "Model feature"


def _explain_prediction(signal: str, pred_ret: float, up_prob: float, conf: Dict[str, Any], drivers: List[Dict[str, Any]], sentiment_count: int, macro_count: int) -> Dict[str, Any]:
    direction = "up" if signal == "bullish" else "down" if signal == "bearish" else "sideways / uncertain"
    strength = "strong" if conf.get("label") == "high" else "moderate" if conf.get("label") == "moderate" else "weak"
    reasons = []
    for driver in drivers[:6]:
        name = str(driver.get("name") or "feature")
        impact = float(driver.get("impact") or 0.0)
        reasons.append({
            "feature": name,
            "group": _feature_label(name),
            "direction": "supports upside" if impact > 0 else "supports downside" if impact < 0 else "neutral",
            "impact": round(impact, 4),
            "text": f"{_feature_label(name)} signal `{name}` is {'positive' if impact > 0 else 'negative' if impact < 0 else 'mixed'} in the current model snapshot.",
        })
    plain = f"The model currently expects the stock to move {direction}. The signal strength is {strength}, with an up probability of {up_prob*100:.0f}% and an expected return of {pred_ret*100:.2f}%."
    if sentiment_count:
        plain += f" Recent disclosure/news sentiment is included using {sentiment_count} stored sentiment items."
    if macro_count:
        plain += f" Macro context is included using {macro_count} stored macro points."
    if conf.get("label") == "low":
        plain += " Confidence is low, so treat this as a watch signal rather than a high-conviction forecast."
    return {"direction": direction, "summary": plain, "reasons": reasons}



def _reliability_summary(model_meta: Dict[str, Any], conf: Dict[str, Any], flags: List[str]) -> Dict[str, Any]:
    metrics = model_meta.get("metrics_holdout") or {}
    auc = metrics.get("auc_up")
    acc = metrics.get("acc_up")
    baseline = metrics.get("baseline_acc_up")
    note = "Prediction quality should be judged with confidence, holdout metrics, and data freshness."
    if isinstance(acc, (int, float)) and isinstance(baseline, (int, float)):
        edge = float(acc) - float(baseline)
    else:
        edge = None
    if conf.get("label") == "low":
        note += " Current signal confidence is low."
    if flags:
        note += " Quality flags: " + ", ".join(flags[:4]) + "."
    return {
        "holdout_auc": float(auc) if isinstance(auc, (int, float)) else None,
        "holdout_accuracy": float(acc) if isinstance(acc, (int, float)) else None,
        "baseline_accuracy": float(baseline) if isinstance(baseline, (int, float)) else None,
        "edge_vs_baseline": round(edge, 4) if isinstance(edge, float) else None,
        "confidence_label": conf.get("label"),
        "note": note,
    }

def _signal_label(pred_ret: float, up_prob: float) -> str:
    if up_prob >= 0.65 and pred_ret > 0:
        return "bullish"
    if up_prob <= 0.35 and pred_ret < 0:
        return "bearish"
    return "neutral"


def _confidence(up_prob: float, p10: float, p90: float) -> Dict[str, Any]:
    direction_strength = min(1.0, abs(up_prob - 0.5) * 2.0)
    band_width = max(0.0, float(p90) - float(p10))
    tightness = max(0.0, 1.0 - min(1.0, band_width / 0.12))
    score = round(0.6 * direction_strength + 0.4 * tightness, 4)
    if score >= 0.72:
        label = "high"
    elif score >= 0.48:
        label = "moderate"
    else:
        label = "low"
    return {"score": score, "label": label, "band_width": round(band_width, 6)}


def predict_next(
    *,
    symbol: str,
    database_url: str,
    model_dir: str,
    horizon_days: int = 1,
) -> Dict[str, Any]:
    storage = Storage(database_url)
    storage.init()

    bundle = latest_bundle(Path(model_dir))
    if bundle is None:
        raise FileNotFoundError("No trained model found. Run: python -m app.cli train")

    hist = storage.get_price_history(symbol, limit=780)
    if len(hist) < 120:
        raise ValueError("Not enough stored history for prediction. Sync more data.")

    aspi = storage.get_index_series("ASPI", limit=900)
    idx_series = aspi if aspi else None
    sentiment_series = storage.get_sentiment_feature_series(symbol.upper(), limit=1600)
    macro_series = storage.get_macro_series(limit=8000)
    df, feat_cols = make_feature_frame(
        hist,
        index_series=idx_series,
        symbol=symbol.upper(),
        horizon_days=horizon_days,
        sentiment_series=sentiment_series,
        macro_series=macro_series,
    )
    if df.empty:
        raise ValueError("Not enough clean rows after feature engineering.")

    last = df.iloc[-1]
    X = last[feat_cols].values.reshape(1, -1)

    pred_ret = float(bundle.mean.predict(X)[0])
    p10 = float(bundle.q10.predict(X)[0])
    p90 = float(bundle.q90.predict(X)[0])
    up_prob = float(bundle.up.predict_proba(X)[0, 1])

    last_close = float(last["close"])
    pred_price = last_close * (1.0 + pred_ret)
    price_band = {"p10": last_close * (1.0 + p10), "p90": last_close * (1.0 + p90)}

    importances = getattr(bundle.mean, "feature_importances_", None)
    if importances is None:
        importances = np.ones(len(feat_cols), dtype=float) / max(1, len(feat_cols))
    drivers = _top_drivers(feat_cols, X.flatten(), np.array(importances, dtype=float), k=8)

    conf = _confidence(up_prob, p10, p90)
    flags: List[str] = []
    if len(hist) < 180:
        flags.append("limited_history")
    if conf["band_width"] > 0.08:
        flags.append("wide_prediction_band")
    if conf["label"] == "low":
        flags.append("low_confidence")

    if conf["label"] == "low":
        flags.append("experimental")

    blocks = bundle.meta.get("feature_blocks") or {}
    signal = _signal_label(pred_ret, up_prob)
    explanation = _explain_prediction(signal, pred_ret, up_prob, conf, drivers, len(sentiment_series), len(macro_series))
    reliability = _reliability_summary(bundle.meta, conf, flags)
    return {
        "symbol": symbol.upper(),
        "as_of": str(last["date"].date()),
        "predicted_return": pred_ret,
        "band": {"p10": p10, "p90": p90},
        "up_probability": up_prob,
        "predicted_price": pred_price,
        "price_band": price_band,
        "signal": signal,
        "explanation": explanation,
        "confidence": conf,
        "quality_flags": flags,
        "history_points": int(len(hist)),
        "features": drivers,
        "intelligence": {
            "sentiment_enabled": bool(blocks.get("sentiment")),
            "macro_enabled": bool(blocks.get("macro")),
            "latest_sentiment_items": len(sentiment_series),
            "latest_macro_points": len(macro_series),
        },
        "reliability": reliability,
        "model": {
            "version": bundle.meta.get("model_version", "v1"),
            "trained_at_utc": bundle.meta.get("trained_at_utc"),
            "horizon_days": bundle.meta.get("horizon_days"),
            "metrics": bundle.meta.get("metrics_holdout"),
            "train_period": bundle.meta.get("train_period"),
            "test_period": bundle.meta.get("test_period"),
        },
        "disclaimer": "Predictions are probabilistic and may be wrong. Not investment advice.",
    }
