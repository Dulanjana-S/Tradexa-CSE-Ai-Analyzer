from __future__ import annotations

import csv
import hashlib
import io
import json
import math
import os
import re
from html import unescape
from collections import Counter, defaultdict
from dataclasses import dataclass
from datetime import date, datetime, timedelta, timezone
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



_FINBERT_PIPELINE = None
_FINBERT_ERROR: Optional[str] = None


def _finbert_enabled() -> bool:
    return str(os.getenv("FINBERT_ENABLED", "false")).lower() in {"1", "true", "yes", "on"}


def _run_finbert_sentiment(text: str) -> Optional[Dict[str, Any]]:
    """Optional FinBERT inference. Safe fallback if transformers/torch/model are unavailable.

    Set FINBERT_ENABLED=true and optionally FINBERT_MODEL=ProsusAI/finbert.
    The model is lazy-loaded on first use so normal app startup is not slowed or broken.
    """
    global _FINBERT_PIPELINE, _FINBERT_ERROR
    if not _finbert_enabled():
        return None
    if _FINBERT_ERROR:
        return None
    try:
        if _FINBERT_PIPELINE is None:
            from transformers import pipeline  # type: ignore
            model_name = os.getenv("FINBERT_MODEL", "ProsusAI/finbert")
            _FINBERT_PIPELINE = pipeline("sentiment-analysis", model=model_name, tokenizer=model_name, truncation=True)
        result = _FINBERT_PIPELINE(text[:1800])
        item = result[0] if isinstance(result, list) and result else result
        label_raw = str(item.get("label") or "neutral").lower()
        score = float(item.get("score") or 0.0)
        if "positive" in label_raw:
            label = "positive"
            signed = score
        elif "negative" in label_raw:
            label = "negative"
            signed = -score
        else:
            label = "neutral"
            signed = 0.0
        return {"sentiment_label": label, "sentiment_score": max(-1.0, min(1.0, signed)), "confidence": max(0.0, min(1.0, score)), "provider": "finbert"}
    except Exception as exc:
        _FINBERT_ERROR = str(exc)
        return None

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
    provider = "lexicon_event_rules"
    finbert = _run_finbert_sentiment(text)
    if finbert:
        # Blend domain model score with transparent event/keyword score instead of blindly replacing it.
        normalized = max(-1.0, min(1.0, 0.70 * float(finbert["sentiment_score"]) + 0.30 * normalized))
        if normalized >= 0.18:
            label = "positive"
        elif normalized <= -0.18:
            label = "negative"
        else:
            label = "neutral"
        confidence = max(confidence, float(finbert.get("confidence") or 0.0))
        provider = "finbert_plus_event_rules"

    return {
        "sentiment_score": round(normalized, 4),
        "sentiment_label": label,
        "impact_score": round(impact, 4),
        "event_type": event_type,
        "confidence": round(confidence, 4),
        "keywords": _extract_keywords(text),
        "sentiment_provider": provider,
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
                "meta": {"category": ann.get("category"), "sentiment_provider": info.get("sentiment_provider")},
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


# ---- Official CSE PDF / report intelligence ----
REPORT_KEYWORDS = (
    "annual report", "quarter", "quarterly", "interim", "financial statement", "financial statements",
    "dividend", "corporate disclosure", "rights issue", "bonus issue", "split", "subdivision", "sub-division",
)


def is_report_or_corporate_document(title: str, url: Optional[str] = None) -> bool:
    hay = f"{title or ''} {url or ''}".lower()
    return any(token in hay for token in REPORT_KEYWORDS) or hay.endswith(".pdf") or ".pdf" in hay


def make_stable_id(*parts: Any) -> str:
    raw = "|".join(str(x or "") for x in parts)
    return hashlib.sha256(raw.encode("utf-8", errors="ignore")).hexdigest()[:32]


def summarize_document_text(text: str, max_sentences: int = 4) -> str:
    cleaned = re.sub(r"\s+", " ", (text or "").strip())
    if not cleaned:
        return ""
    sentences = re.split(r"(?<=[.!?])\s+", cleaned)
    scored = []
    for sentence in sentences[:180]:
        s_l = sentence.lower()
        score = 0
        for term in list(POSITIVE_TERMS) + list(NEGATIVE_TERMS) + list(HIGH_IMPACT_TERMS):
            if term in s_l:
                score += 1
        if any(token in s_l for token in ("profit", "loss", "revenue", "earnings", "dividend", "rights", "quarter", "annual", "cash", "debt", "risk")):
            score += 1
        if 40 <= len(sentence) <= 260:
            scored.append((score, sentence.strip()))
    scored.sort(key=lambda item: item[0], reverse=True)
    picked = []
    for _, sentence in scored:
        if sentence and sentence not in picked:
            picked.append(sentence)
        if len(picked) >= max_sentences:
            break
    if not picked:
        picked = sentences[:max_sentences]
    return " ".join(picked).strip()[:1200]


def extract_pdf_text_from_bytes(payload: bytes, max_pages: int = 12) -> Dict[str, Any]:
    try:
        from pypdf import PdfReader
    except Exception as exc:
        return {"text": "", "pages_analyzed": 0, "error": f"pypdf unavailable: {exc}"}
    try:
        reader = PdfReader(io.BytesIO(payload))
        pages = []
        for page in reader.pages[:max_pages]:
            try:
                pages.append(page.extract_text() or "")
            except Exception:
                pages.append("")
        text = "\n".join(pages)
        return {"text": text, "pages_analyzed": min(len(reader.pages), max_pages), "total_pages": len(reader.pages), "error": None}
    except Exception as exc:
        return {"text": "", "pages_analyzed": 0, "total_pages": 0, "error": str(exc)}


def build_document_intelligence_row(announcement: Dict[str, Any], pdf_payload: bytes, max_pages: int = 12) -> Dict[str, Any]:
    extracted = extract_pdf_text_from_bytes(pdf_payload, max_pages=max_pages)
    title = str(announcement.get("title") or "")
    full_text = extracted.get("text") or title
    summary = summarize_document_text(full_text)
    combined = f"{title}. {summary}"
    sent = analyze_text_sentiment(combined, announcement.get("category"))
    doc_url = announcement.get("url") or announcement.get("source_url")
    ann_id = announcement.get("ann_id") or announcement.get("id") or make_stable_id(doc_url, title)
    doc_id = make_stable_id(ann_id, doc_url, title)
    return {
        "doc_id": doc_id,
        "ann_id": ann_id,
        "symbol": str(announcement.get("symbol") or "").upper() or None,
        "date": str(announcement.get("date") or "")[:10],
        "title": title,
        "document_url": doc_url,
        "document_type": sent.get("event_type") or detect_event_type(title, announcement.get("category")),
        "summary": summary,
        "extracted_text": (extracted.get("text") or "")[:20000],
        "pages_analyzed": extracted.get("pages_analyzed") or 0,
        "sentiment_score": sent["sentiment_score"],
        "sentiment_label": sent["sentiment_label"],
        "impact_score": sent["impact_score"],
        "event_type": sent["event_type"],
        "confidence": sent["confidence"],
        "keywords": sent["keywords"],
        "meta": {"category": announcement.get("category"), "pdf_error": extracted.get("error"), "total_pages": extracted.get("total_pages")},
    }


def document_row_to_sentiment(row: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "item_id": f"doc:{row.get('doc_id')}",
        "ann_id": row.get("ann_id"),
        "symbol": row.get("symbol"),
        "date": row.get("date"),
        "title": row.get("title"),
        "source_url": row.get("document_url"),
        "source_type": "cse_document",
        "sentiment_score": row.get("sentiment_score"),
        "sentiment_label": row.get("sentiment_label"),
        "impact_score": row.get("impact_score"),
        "event_type": row.get("event_type"),
        "confidence": row.get("confidence"),
        "keywords": row.get("keywords") or [],
        "meta": {"document_type": row.get("document_type"), "summary": row.get("summary")},
    }


# ---- Whitelisted selected Sri Lanka economy/business news ingestion ----
DEFAULT_NEWS_WHITELIST: List[Dict[str, Any]] = [
    {"source_name": "EconomyNext", "domain": "economynext.com", "base_url": "https://economynext.com/more-news/", "parser_kind": "html_links", "enabled": True, "scope_hint": "market"},
    {"source_name": "Daily FT", "domain": "ft.lk", "base_url": "https://www.ft.lk/business/34", "parser_kind": "html_links", "enabled": True, "scope_hint": "market"},
    {"source_name": "CBSL News", "domain": "cbsl.gov.lk", "base_url": "https://www.cbsl.gov.lk/en/news", "parser_kind": "html_links", "enabled": True, "scope_hint": "macro"},
    {"source_name": "CBSL Press Releases", "domain": "cbsl.gov.lk", "base_url": "https://www.cbsl.gov.lk/en/press-releases", "parser_kind": "html_links", "enabled": True, "scope_hint": "macro"},
]


def validate_whitelisted_url(url: str, domain: str) -> bool:
    from urllib.parse import urlparse
    parsed = urlparse(url)
    host = parsed.netloc.lower().replace("www.", "")
    domain = domain.lower().replace("www.", "")
    return host == domain or host.endswith("." + domain)


def extract_links_from_html(html: str, base_url: str, domain: str, source_name: str, limit: int = 40) -> List[Dict[str, Any]]:
    from urllib.parse import urljoin
    items: List[Dict[str, Any]] = []
    try:
        from bs4 import BeautifulSoup
        soup = BeautifulSoup(html, "html.parser")
        anchors = soup.find_all("a")
        for a in anchors:
            title = " ".join(a.get_text(" ", strip=True).split())
            href = a.get("href") or ""
            if len(title) < 12 or not href:
                continue
            url = urljoin(base_url, href)
            if not validate_whitelisted_url(url, domain):
                continue
            title_l = title.lower()
            if any(skip in title_l for skip in ("advertise", "privacy", "terms", "contact", "login", "subscribe")):
                continue
            item_id = make_stable_id(source_name, url, title)
            items.append({"item_id": item_id, "source_name": source_name, "source_domain": domain, "url": url, "title": unescape(title), "published_at": None, "published_date": datetime.now(timezone.utc).date().isoformat(), "raw": {}})
            if len(items) >= limit:
                break
    except Exception:
        # Regex fallback keeps ingestion usable if BeautifulSoup is unavailable.
        for m in re.finditer(r'<a[^>]+href=["\']([^"\']+)["\'][^>]*>(.*?)</a>', html, flags=re.I | re.S):
            href, raw_title = m.group(1), re.sub(r"<[^>]+>", " ", m.group(2))
            title = " ".join(unescape(raw_title).split())
            if len(title) < 12:
                continue
            url = urljoin(base_url, href)
            if not validate_whitelisted_url(url, domain):
                continue
            items.append({"item_id": make_stable_id(source_name, url, title), "source_name": source_name, "source_domain": domain, "url": url, "title": title, "published_at": None, "published_date": datetime.now(timezone.utc).date().isoformat(), "raw": {}})
            if len(items) >= limit:
                break
    # Deduplicate by URL/title.
    seen = set()
    out = []
    for item in items:
        key = (item["url"], item["title"].lower())
        if key in seen:
            continue
        seen.add(key)
        out.append(item)
    return out


def link_news_to_company(title: str, companies: Iterable[Dict[str, Any]]) -> Dict[str, Optional[str]]:
    text = _clean_text(title)
    best_symbol = None
    best_name = None
    best_score = 0
    for comp in companies:
        symbol = str(comp.get("symbol") or "").upper()
        name = str(comp.get("name") or comp.get("company") or "")
        terms = [symbol.lower().replace(".n0000", ""), symbol.lower(), name.lower()]
        terms += [w for w in re.split(r"[^a-z0-9]+", name.lower()) if len(w) >= 5]
        score = sum(1 for term in set(terms) if term and term in text)
        if score > best_score:
            best_score = score
            best_symbol = symbol
            best_name = name
    if best_score <= 0:
        return {"symbol": None, "company_name": None}
    return {"symbol": best_symbol, "company_name": best_name}


def enrich_external_news_item(item: Dict[str, Any], companies: Iterable[Dict[str, Any]]) -> Dict[str, Any]:
    link = link_news_to_company(item.get("title") or "", companies)
    sent = analyze_text_sentiment(item.get("title") or "", item.get("source_name"))
    scope = "symbol" if link.get("symbol") else "market"
    return {
        **item,
        "scope": scope,
        "symbol": link.get("symbol"),
        "company_name": link.get("company_name"),
        "sentiment_score": sent["sentiment_score"],
        "sentiment_label": sent["sentiment_label"],
        "impact_score": sent["impact_score"],
        "event_type": sent["event_type"],
        "confidence": sent["confidence"],
        "keywords": sent["keywords"],
    }


def external_news_to_sentiment_row(item: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "item_id": f"news:{item.get('item_id')}",
        "ann_id": None,
        "symbol": item.get("symbol"),
        "date": item.get("published_date"),
        "title": item.get("title"),
        "source_url": item.get("url"),
        "source_type": "external_news",
        "sentiment_score": item.get("sentiment_score"),
        "sentiment_label": item.get("sentiment_label"),
        "impact_score": item.get("impact_score"),
        "event_type": item.get("event_type"),
        "confidence": item.get("confidence"),
        "keywords": item.get("keywords") or [],
        "meta": {"source_name": item.get("source_name"), "source_domain": item.get("source_domain"), "scope": item.get("scope"), "company_name": item.get("company_name")},
    }
