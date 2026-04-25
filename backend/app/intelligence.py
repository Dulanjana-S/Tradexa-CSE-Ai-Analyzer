from __future__ import annotations

import csv
import io
import json
import math
import re
from collections import Counter, defaultdict
from dataclasses import dataclass
from datetime import date, datetime
from typing import Any, Dict, Iterable, List, Optional, Tuple

POSITIVE_TERMS = {
    "profit": 1.4,
    "profits": 1.4,
    "growth": 1.1,
    "record": 0.9,
    "expansion": 0.8,
    "award": 0.4,
    "dividend": 1.2,
    "interim dividend": 1.4,
    "final dividend": 1.5,
    "rights issue": 0.2,
    "bonus": 0.7,
    "acquisition": 0.4,
    "agreement": 0.3,
    "approval": 0.3,
    "increases": 0.8,
    "improved": 0.9,
    "surge": 1.1,
    "strong": 0.8,
    "positive": 0.8,
    "listing": 0.5,
    "wins": 0.6,
    "earnings": 0.8,
}

NEGATIVE_TERMS = {
    "loss": -1.5,
    "losses": -1.5,
    "drop": -0.8,
    "decline": -0.9,
    "downturn": -1.0,
    "suspend": -1.2,
    "suspension": -1.4,
    "penalty": -0.8,
    "default": -1.8,
    "downgrade": -1.1,
    "warning": -0.8,
    "fraud": -2.0,
    "litigation": -0.9,
    "resignation": -0.4,
    "delay": -0.5,
    "decrease": -0.7,
    "fall": -0.8,
    "negative": -0.8,
    "impairment": -1.0,
    "loss-making": -1.3,
    "bankruptcy": -2.2,
}

EVENT_PATTERNS: List[Tuple[str, Tuple[str, ...]]] = [
    ("dividend", ("dividend",)),
    ("earnings", ("quarter", "quarterly", "annual report", "interim", "financial statement", "earnings", "results")),
    ("corporate_action", ("split", "bonus", "rights issue", "rights", "sub division", "sub-division")),
    ("governance", ("board", "director", "ceo", "cfo", "chairman", "appointment", "resignation")),
    ("regulatory", ("suspension", "listing", "delisting", "mandatory offer", "takeover", "court", "regulatory")),
    ("macro", ("policy rate", "exchange rate", "inflation", "gdp", "budget", "tax")),
]

HIGH_IMPACT_TERMS = {
    "dividend": 0.6,
    "final dividend": 0.7,
    "interim dividend": 0.7,
    "rights issue": 0.8,
    "bonus": 0.6,
    "split": 0.7,
    "suspension": 0.9,
    "mandatory offer": 0.8,
    "acquisition": 0.7,
    "merger": 0.8,
    "default": 1.0,
    "fraud": 1.0,
    "annual report": 0.45,
    "quarterly": 0.5,
    "earnings": 0.55,
    "board": 0.35,
}

DEFAULT_MACRO_TEMPLATES = [
    {"indicator_key": "usd_lkr", "label": "USD/LKR", "category": "fx"},
    {"indicator_key": "policy_rate", "label": "Policy rate", "category": "rates"},
    {"indicator_key": "ccpi_yoy", "label": "CCPI YoY", "category": "inflation"},
    {"indicator_key": "ncpi_yoy", "label": "NCPI YoY", "category": "inflation"},
    {"indicator_key": "oil_brent", "label": "Brent Oil", "category": "global"},
    {"indicator_key": "gold_usd", "label": "Gold USD", "category": "global"},
    {"indicator_key": "sp500", "label": "S&P 500", "category": "global"},
    {"indicator_key": "dxy", "label": "US Dollar Index", "category": "global"},
]


def _clean_text(value: str) -> str:
    return re.sub(r"\s+", " ", (value or "").strip()).lower()


def _extract_keywords(text: str) -> List[str]:
    text_l = _clean_text(text)
    hits: List[str] = []
    for term in list(POSITIVE_TERMS) + list(NEGATIVE_TERMS) + list(HIGH_IMPACT_TERMS):
        if term in text_l and term not in hits:
            hits.append(term)
    return hits[:8]


def detect_event_type(title: str, category: Optional[str] = None) -> str:
    hay = f"{title or ''} {category or ''}".lower()
    for event_type, patterns in EVENT_PATTERNS:
        if any(pattern in hay for pattern in patterns):
            return event_type
    return "general"


def analyze_text_sentiment(title: str, category: Optional[str] = None) -> Dict[str, Any]:
    text = _clean_text(f"{title or ''} {category or ''}")
    score = 0.0
    weight_hits = 0
    for term, weight in POSITIVE_TERMS.items():
        if term in text:
            score += weight
            weight_hits += 1
    for term, weight in NEGATIVE_TERMS.items():
        if term in text:
            score += weight
            weight_hits += 1

    event_type = detect_event_type(title, category)
    impact = 0.2
    for term, extra in HIGH_IMPACT_TERMS.items():
        if term in text:
            impact += extra
    if event_type in {"earnings", "dividend", "corporate_action", "regulatory"}:
        impact += 0.15
    impact = max(0.0, min(1.0, impact))

    normalized = max(-1.0, min(1.0, score / max(1.0, 2.2 + 0.4 * weight_hits)))
    if normalized >= 0.2:
        label = "positive"
    elif normalized <= -0.2:
        label = "negative"
    else:
        label = "neutral"

    confidence = min(0.95, 0.45 + 0.08 * weight_hits + 0.15 * impact)
    return {
        "sentiment_score": round(normalized, 4),
        "sentiment_label": label,
        "impact_score": round(impact, 4),
        "event_type": event_type,
        "confidence": round(confidence, 4),
        "keywords": _extract_keywords(text),
    }


def build_sentiment_rows(announcements: Iterable[Dict[str, Any]]) -> List[Dict[str, Any]]:
    rows: List[Dict[str, Any]] = []
    for ann in announcements:
        ann_id = str(ann.get("ann_id") or ann.get("id") or "").strip()
        title = str(ann.get("title") or "").strip()
        if not ann_id or not title:
            continue
        info = analyze_text_sentiment(title, ann.get("category"))
        rows.append(
            {
                "item_id": ann_id,
                "ann_id": ann_id,
                "symbol": str(ann.get("symbol") or "").upper() or None,
                "date": str(ann.get("date") or "")[:10],
                "title": title,
                "source_url": ann.get("url"),
                "source_type": "cse_announcement",
                "sentiment_score": info["sentiment_score"],
                "sentiment_label": info["sentiment_label"],
                "impact_score": info["impact_score"],
                "event_type": info["event_type"],
                "confidence": info["confidence"],
                "keywords": info["keywords"],
                "meta": {"category": ann.get("category")},
            }
        )
    return rows


def summarize_sentiment(rows: List[Dict[str, Any]], days: int = 90) -> Dict[str, Any]:
    if not rows:
        return {
            "available": False,
            "latest_label": "neutral",
            "latest_score": 0.0,
            "trend": "flat",
            "coverage_days": days,
            "items": [],
            "event_breakdown": [],
            "timeline": [],
            "score_7d": 0.0,
            "score_30d": 0.0,
            "impact_30d": 0.0,
        }
    filtered = sorted(rows, key=lambda r: (str(r.get("date") or ""), str(r.get("item_id") or "")), reverse=True)
    latest = filtered[0]
    timeline_map: Dict[str, List[Dict[str, Any]]] = defaultdict(list)
    event_counts: Counter[str] = Counter()
    for row in filtered:
        dt = str(row.get("date") or "")[:10]
        if dt:
            timeline_map[dt].append(row)
        event_counts[str(row.get("event_type") or "general")] += 1
    timeline = []
    for dt in sorted(timeline_map):
        bucket = timeline_map[dt]
        timeline.append(
            {
                "date": dt,
                "score": round(sum(float(x.get("sentiment_score") or 0.0) for x in bucket) / max(1, len(bucket)), 4),
                "impact": round(sum(float(x.get("impact_score") or 0.0) for x in bucket), 4),
                "count": len(bucket),
            }
        )
    last7 = timeline[-7:]
    last30 = timeline[-30:]
    score7 = round(sum(item["score"] for item in last7) / max(1, len(last7)), 4)
    score30 = round(sum(item["score"] for item in last30) / max(1, len(last30)), 4)
    impact30 = round(sum(item["impact"] for item in last30), 4)
    trend = "flat"
    if len(last30) >= 6:
        first = sum(item["score"] for item in last30[: max(1, len(last30)//2)]) / max(1, len(last30)//2)
        second = sum(item["score"] for item in last30[max(1, len(last30)//2):]) / max(1, len(last30) - max(1, len(last30)//2))
        delta = second - first
        if delta > 0.08:
            trend = "improving"
        elif delta < -0.08:
            trend = "deteriorating"
    return {
        "available": True,
        "latest_label": latest.get("sentiment_label") or "neutral",
        "latest_score": float(latest.get("sentiment_score") or 0.0),
        "latest_event_type": latest.get("event_type") or "general",
        "trend": trend,
        "coverage_days": days,
        "items": filtered[:12],
        "event_breakdown": [{"event_type": key, "count": int(val)} for key, val in event_counts.most_common()],
        "timeline": timeline[-90:],
        "score_7d": score7,
        "score_30d": score30,
        "impact_30d": impact30,
        "documents_30d": sum(item["count"] for item in last30),
    }


def parse_macro_csv_bytes(payload: bytes) -> List[Dict[str, Any]]:
    text = payload.decode("utf-8-sig")
    reader = csv.DictReader(io.StringIO(text))
    rows: List[Dict[str, Any]] = []
    for idx, row in enumerate(reader, start=2):
        date_raw = str(row.get("date") or row.get("Date") or "").strip()
        key_raw = str(row.get("indicator_key") or row.get("indicator") or row.get("key") or "").strip().lower()
        value_raw = str(row.get("value") or row.get("Value") or "").strip()
        if not date_raw or not key_raw or value_raw == "":
            continue
        try:
            dt = datetime.fromisoformat(date_raw.replace("Z", "+00:00")).date().isoformat() if "-" in date_raw else datetime.strptime(date_raw, "%d/%m/%Y").date().isoformat()
        except Exception:
            raise ValueError(f"Invalid date at row {idx}: {date_raw}")
        try:
            value = float(value_raw.replace(",", ""))
        except Exception:
            raise ValueError(f"Invalid value at row {idx}: {value_raw}")
        rows.append(
            {
                "indicator_key": key_raw,
                "date": dt,
                "value": value,
                "source": str(row.get("source") or row.get("Source") or "manual_csv").strip() or "manual_csv",
                "label": str(row.get("label") or row.get("Label") or key_raw.replace("_", " ").title()).strip(),
                "category": str(row.get("category") or row.get("Category") or "macro").strip() or "macro",
            }
        )
    return rows


def preview_macro_rows(rows: List[Dict[str, Any]]) -> Dict[str, Any]:
    by_key: Dict[str, List[Dict[str, Any]]] = defaultdict(list)
    for row in rows:
        by_key[str(row.get("indicator_key") or "unknown")].append(row)
    indicators = []
    for key, items in sorted(by_key.items()):
        dates = sorted(str(item.get("date") or "") for item in items if item.get("date"))
        indicators.append(
            {
                "indicator_key": key,
                "label": items[0].get("label") or key,
                "category": items[0].get("category") or "macro",
                "rows": len(items),
                "start_date": dates[0] if dates else None,
                "end_date": dates[-1] if dates else None,
                "source": items[0].get("source") or "manual_csv",
            }
        )
    return {
        "totals": {"rows": len(rows), "indicators": len(indicators)},
        "indicators": indicators,
        "templates": DEFAULT_MACRO_TEMPLATES,
    }
