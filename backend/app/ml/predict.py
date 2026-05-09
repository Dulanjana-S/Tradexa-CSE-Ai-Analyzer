from __future__ import annotations

from pathlib import Path
from typing import Any, Dict, List

import numpy as np

from ..storage import Storage
from .features import make_feature_frame
from .model_store import latest_bundle


def _extract_model_importances(model: Any, n_features: int) -> np.ndarray:
    obj = model
    if hasattr(obj, "named_steps"):
        for step in reversed(list(obj.named_steps.values())):
            if hasattr(step, "feature_importances_") or hasattr(step, "coef_"):
                obj = step
                break
    if hasattr(obj, "feature_importances_"):
        arr = np.asarray(getattr(obj, "feature_importances_"), dtype=float).flatten()
    elif hasattr(obj, "coef_"):
        arr = np.asarray(getattr(obj, "coef_"), dtype=float).flatten()
    else:
        arr = np.ones(n_features, dtype=float)
    if arr.size != n_features:
        arr = np.resize(arr, n_features)
    arr = np.nan_to_num(np.abs(arr), nan=0.0)
    total = float(arr.sum())
    return arr / total if total > 0 else np.ones(n_features, dtype=float) / max(1, n_features)


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


def _feature_plain_name(name: str) -> str:
    n = name.lower()
    friendly = {
        "turnover_proxy": "Trading activity",
        "turnover_trend_5": "Recent trading activity",
        "liquidity_ratio_20": "Liquidity versus recent average",
        "zero_vol_20": "Days with no trading",
        "close_to_high": "Price near the day's high",
        "close_to_low": "Price near the day's low",
        "ret_1d": "1-day price move",
        "ret_5d": "5-day price move",
        "ret_20d": "20-day price move",
        "ret_60d": "60-day price move",
        "vol_20d": "20-day volatility",
        "vol_60d": "60-day volatility",
        "gap_1d": "Overnight price gap",
        "range_pct": "Daily price range",
        "breakout_20": "Move versus recent resistance",
        "drawdown_60": "Pullback from recent high",
        "atr_14_ratio": "Recent price swing size",
        "rsi_14": "Momentum balance (RSI)",
        "macd": "Momentum trend",
        "macd_signal": "Momentum signal line",
        "macd_hist": "Momentum gap",
        "bb_pct": "Position within recent trading band",
        "bb_width": "Width of the recent trading band",
    }
    if n in friendly:
        return friendly[n]
    if n.startswith("sent_"):
        return n.replace("sent_", "Sentiment ").replace("_", " ").title()
    if n.startswith("macro_"):
        return n.replace("macro_", "Macro ").replace("_", " ").title()
    return name.replace("_", " ").strip().title()


def _driver_plain_text(name: str, group: str, direction: str) -> str:
    display_name = _feature_plain_name(name)
    n = name.lower()

    if "vol" in n or "liquidity" in n or "turnover" in n:
        if direction == "supports upside":
            return f"{display_name} suggests more trading activity, so the stock is easier for buyers and sellers to move in and out of."
        if direction == "supports downside":
            return f"{display_name} suggests lighter trading, which can make the price less stable and harder to exit quickly."
        return f"{display_name} looks normal, so it is not giving the price a strong push either way."

    if "ret" in n or "trend" in n or "breakout" in n or "drawdown" in n or "close_to_high" in n or "close_to_low" in n:
        if direction == "supports upside":
            return f"{display_name} shows the stock has been holding up well recently, and that usually keeps buyers interested."
        if direction == "supports downside":
            return f"{display_name} shows recent weakness, so sellers may still have the upper hand for now."
        return f"{display_name} is mixed, so it is not giving a clear market edge right now."

    if "sent_" in n:
        if direction == "supports upside":
            return f"Recent announcements and news around {display_name.lower()} are generally positive, which can help sentiment."
        if direction == "supports downside":
            return f"Recent announcements and news around {display_name.lower()} are leaning negative, which can put pressure on the stock."
        return f"Recent announcements and news around {display_name.lower()} are mixed, so the market is waiting for a clearer signal."

    if "macro_" in n or "idx_" in n or "rel_" in n or "beta" in n:
        if direction == "supports upside":
            return f"The wider market is giving this stock a small tailwind."
        if direction == "supports downside":
            return f"The wider market is acting like a small drag on this stock right now."
        return f"The wider market is not clearly helping or hurting this stock."

    if direction == "supports upside":
        return f"{display_name} is leaning positive in the current snapshot."
    if direction == "supports downside":
        return f"{display_name} is leaning negative in the current snapshot."
    return f"{display_name} is mixed in the current snapshot."


def _signal_label(pred_ret: float, up_prob: float, action_probability: float | None = None) -> str:
    if action_probability is not None and action_probability < 0.45:
        return "neutral"
    if up_prob >= 0.65 and pred_ret > 0:
        return "bullish"
    if up_prob <= 0.35 and pred_ret < 0:
        return "bearish"
    return "neutral"


def _confidence(up_prob: float, p10: float, p90: float, action_probability: float | None = None) -> Dict[str, Any]:
    direction_strength = min(1.0, abs(up_prob - 0.5) * 2.0)
    band_width = max(0.0, float(p90) - float(p10))
    tightness = max(0.0, 1.0 - min(1.0, band_width / 0.12))
    meta = 0.5 if action_probability is None else max(0.0, min(1.0, float(action_probability)))
    score = round(0.45 * direction_strength + 0.30 * tightness + 0.25 * meta, 4)
    if score >= 0.72:
        label = "high"
    elif score >= 0.48:
        label = "moderate"
    else:
        label = "low"
    return {"score": score, "label": label, "band_width": round(band_width, 6), "action_probability": None if action_probability is None else round(float(action_probability), 4)}


def _explain_prediction(signal: str, pred_ret: float, up_prob: float, conf: Dict[str, Any], drivers: List[Dict[str, Any]], sentiment_count: int, macro_count: int) -> Dict[str, Any]:
    direction = "up" if signal == "bullish" else "down" if signal == "bearish" else "sideways"
    direction_label = "more likely to rise" if signal == "bullish" else "more likely to fall" if signal == "bearish" else "likely to move sideways"
    strength = "strong" if conf.get("label") == "high" else "moderate" if conf.get("label") == "moderate" else "weak"
    reasons = []
    for driver in drivers[:6]:
        name = str(driver.get("name") or "feature")
        impact = float(driver.get("impact") or 0.0)
        reason_direction = "supports upside" if impact > 0 else "supports downside" if impact < 0 else "neutral"
        reasons.append({
            "feature": name,
            "featureLabel": _feature_plain_name(name),
            "group": _feature_label(name),
            "direction": reason_direction,
            "impact": round(impact, 4),
            "text": _driver_plain_text(name, _feature_label(name), reason_direction),
        })
    plain = f"In simple market terms, this stock looks {direction_label}. The call is {strength}, with a {up_prob*100:.0f}% chance of going up and an expected return of {pred_ret*100:.2f}%."
    if conf.get("action_probability") is not None:
        plain += f" There is also a {float(conf.get('action_probability'))*100:.0f}% chance this is a useful signal to act on."
    if sentiment_count:
        plain += f" It also takes into account {sentiment_count} recent disclosures and news items."
    if macro_count:
        plain += f" It also looks at {macro_count} broader market data points."
    if conf.get("label") == "low":
        plain += " Confidence is low, so treat this as a watch signal rather than a strong forecast."
    plain += " This view comes from price action, trading volume, news, and the wider market backdrop."
    return {"direction": direction, "direction_label": direction_label, "summary": plain, "reasons": reasons}


def _reliability_summary(model_meta: Dict[str, Any], conf: Dict[str, Any], flags: List[str]) -> Dict[str, Any]:
    metrics = model_meta.get("metrics_holdout") or {}
    auc = metrics.get("auc_up")
    acc = metrics.get("acc_up")
    baseline = metrics.get("baseline_acc_up")
    strong_acc = metrics.get("strong_signal_acc_up")
    coverage = metrics.get("strong_signal_coverage")
    edge = float(acc) - float(baseline) if isinstance(acc, (int, float)) and isinstance(baseline, (int, float)) else None
    note = "Prediction quality should be judged with confidence, holdout metrics, data freshness, and filtered-signal coverage."
    if conf.get("label") == "low":
        note += " Current signal confidence is low."
    if flags:
        note += " Quality flags: " + ", ".join(flags[:4]) + "."
    return {
        "holdout_auc": float(auc) if isinstance(auc, (int, float)) else None,
        "holdout_accuracy": float(acc) if isinstance(acc, (int, float)) else None,
        "baseline_accuracy": float(baseline) if isinstance(baseline, (int, float)) else None,
        "edge_vs_baseline": round(edge, 4) if isinstance(edge, float) else None,
        "strong_signal_accuracy": float(strong_acc) if isinstance(strong_acc, (int, float)) else None,
        "strong_signal_coverage": float(coverage) if isinstance(coverage, (int, float)) else None,
        "confidence_label": conf.get("label"),
        "note": note,
    }


def _meta_action_probability(meta_model: Any, x: np.ndarray, up_prob: float) -> float | None:
    if meta_model is None:
        return None
    try:
        meta_x = np.column_stack([x.reshape(1, -1), np.array([[up_prob, abs(up_prob - 0.5) * 2.0]])])
        if hasattr(meta_model, "predict_proba"):
            return float(meta_model.predict_proba(meta_x)[0, 1])
        return float(meta_model.predict(meta_x)[0])
    except Exception:
        return None


def predict_next(*, symbol: str, database_url: str, model_dir: str, horizon_days: int = 1) -> Dict[str, Any]:
    storage = Storage(database_url)
    storage.init()

    bundle = latest_bundle(Path(model_dir))
    if bundle is None:
        raise FileNotFoundError("No trained model found. Run: python -m app.cli train")

    hist = storage.get_price_history(symbol, limit=900)
    if len(hist) < 120:
        raise ValueError("Not enough stored history for prediction. Sync more data.")

    aspi = storage.get_index_series("ASPI", limit=1200)
    idx_series = aspi if aspi else None
    sentiment_series = storage.get_sentiment_feature_series(symbol.upper(), limit=2000)
    macro_series = storage.get_macro_series(limit=10000)
    df, feat_cols = make_feature_frame(hist, index_series=idx_series, symbol=symbol.upper(), horizon_days=horizon_days, sentiment_series=sentiment_series, macro_series=macro_series)
    if df.empty:
        raise ValueError("Not enough clean rows after feature engineering.")

    missing = [f for f in bundle.feature_names if f not in df.columns]
    if missing:
        raise ValueError("The active model expects features that are not available for this symbol. Retrain after refreshing data/intelligence.")
    feat_cols = bundle.feature_names or feat_cols
    last = df.iloc[-1]
    X = last[feat_cols].values.reshape(1, -1)

    pred_ret = float(bundle.mean.predict(X)[0])
    p10 = float(bundle.q10.predict(X)[0])
    p90 = float(bundle.q90.predict(X)[0])
    up_prob = float(bundle.up.predict_proba(X)[0, 1])
    action_prob = _meta_action_probability(bundle.meta_model, X.flatten(), up_prob)

    last_close = float(last["close"])
    pred_price = last_close * (1.0 + pred_ret)
    price_band = {"p10": last_close * (1.0 + p10), "p90": last_close * (1.0 + p90)}

    importances = _extract_model_importances(bundle.up, len(feat_cols))
    drivers = _top_drivers(feat_cols, X.flatten(), importances, k=8)
    conf = _confidence(up_prob, p10, p90, action_probability=action_prob)
    flags: List[str] = []
    if len(hist) < 180:
        flags.append("limited_history")
    if conf["band_width"] > 0.08:
        flags.append("wide_prediction_band")
    if conf["label"] == "low":
        flags.append("low_confidence")
    if action_prob is not None and action_prob < 0.45:
        flags.append("meta_filter_low_actionability")

    blocks = bundle.meta.get("feature_blocks") or {}
    signal = _signal_label(pred_ret, up_prob, action_prob)
    explanation = _explain_prediction(signal, pred_ret, up_prob, conf, drivers, len(sentiment_series), len(macro_series))
    reliability = _reliability_summary(bundle.meta, conf, flags)
    return {
        "symbol": symbol.upper(),
        "as_of": str(last["date"].date()),
        "predicted_return": pred_ret,
        "band": {"p10": p10, "p90": p90},
        "up_probability": up_prob,
        "action_probability": action_prob,
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
            "finbert_ready": bool(blocks.get("finbert_ready")),
            "latest_sentiment_items": len(sentiment_series),
            "latest_macro_points": len(macro_series),
        },
        "reliability": reliability,
        "model": {
            "version": bundle.meta.get("model_version", "v1"),
            "model_family_requested": bundle.meta.get("model_family_requested"),
            "models": bundle.meta.get("models"),
            "trained_at_utc": bundle.meta.get("trained_at_utc"),
            "horizon_days": bundle.meta.get("horizon_days"),
            "metrics": bundle.meta.get("metrics_holdout"),
            "train_period": bundle.meta.get("train_period"),
            "test_period": bundle.meta.get("test_period"),
        },
        "disclaimer": "Predictions are probabilistic and may be wrong. Not investment advice.",
    }
