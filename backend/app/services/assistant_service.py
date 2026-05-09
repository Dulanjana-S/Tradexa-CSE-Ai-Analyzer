from __future__ import annotations

import os
import re
from typing import Any, Dict, List, Optional, Tuple

from fastapi import HTTPException

from ..config import settings
from . import data_service


DISCLAIMER = "This is not financial advice."

HELP_TOPICS = {
    "watchlist": "Open Watchlist, search for a stock, then use Add to Watchlist.",
    "portfolio": "Go to Portfolio, then create a new portfolio or import transactions from a broker CSV.",
    "prediction": "Open a stock page and check the Prediction panel for direction, range, confidence, and model details.",
    "announcements": "Use the Announcements page or the stock page resources to review recent company disclosures.",
    "alerts": "Open Alerts, create a price, volume, or announcement alert, and save it from the form.",
}


def _clean_text(value: Any) -> str:
    return re.sub(r"\s+", " ", str(value or "")).strip()


def _intent_examples(intent: str) -> List[str]:
    return {
        "website_help": [
            "How do I add a stock to watchlist?",
            "How do I create a portfolio?",
            "How do I read the prediction page?",
            "Where can I see announcements?",
            "How do I set alerts?",
        ],
        "stock_explanation": [
            "Analyze a Symbol",
            "What happened to this stock today?",
            "Why is this stock moving?",
            "Explain the stock summary",
            "Is the volume high?",
        ],
        "prediction_explanation": [
            "Why is this stock predicted to go up?",
            "What does the prediction mean?",
            "How confident is the model?",
            "What features affected the prediction?",
            "Is this prediction reliable?",
        ],
        "portfolio_assistant": [
            "How is my portfolio performing?",
            "Which stock has the biggest loss?",
            "Which stock has the biggest gain?",
            "What is my portfolio risk?",
            "Am I too concentrated in one stock?",
        ],
        "alert_assistant": [
            "How do I set a price alert?",
            "Set an alert for a stock",
            "Show my active alerts",
            "Why did this alert trigger?",
        ],
        "market_summary": [
            "How is the market today?",
            "Summarize CSE today",
            "What are top gainers?",
            "What are top losers?",
            "Which sectors are positive?",
        ],
    }.get(intent, [])


def _detect_intent(message: str) -> str:
    text = message.lower()
    if any(token in text for token in ("set an alert", "create an alert", "show my active alerts", "delete alert", "remove alert", "triggered alert", "alert")):
        return "alert_assistant"
    if any(token in text for token in ("portfolio", "holdings", "concentration", "risk", "largest loss", "largest gain", "portfolio value", "how is my portfolio")):
        return "portfolio_assistant"
    if any(token in text for token in ("prediction", "predicted", "confidence", "q10", "q90", "model version", "feature", "reliable")):
        return "prediction_explanation"
    if any(token in text for token in ("market today", "summarize cse", "top gainers", "top losers", "sectors are positive", "market summary")):
        return "market_summary"
    if any(token in text for token in ("tell me about", "what happened to this stock", "why is this stock moving", "stock summary", "volume high", "about ", "analyze", "symbol")):
        return "stock_explanation"
    if any(token in text for token in ("watchlist", "how do i", "where can i", "website usage", "help")):
        return "website_help"
    if re.search(r"\b[a-z0-9]{2,10}\.[a-z0-9]{4,6}\b", text, re.IGNORECASE):
        return "stock_explanation"
    return "market_summary"


def _extract_symbol(message: str) -> Optional[str]:
    candidates: List[str] = []
    for match in re.findall(r"\b[A-Z0-9]{2,10}\.[A-Z0-9]{4,6}\b", message.upper()):
        candidates.append(match)
    for match in re.findall(r"\b[A-Z]{2,8}\b", message.upper()):
        if match in {"HOW", "WHAT", "WHY", "THE", "AND", "FOR", "WITH", "THIS", "THAT", "TODAY", "ABOUT", "PLEASE"}:
            continue
        if len(match) < 3:
            continue
        candidates.append(match)
    for symbol in candidates:
        try:
            data_service.stock(symbol)
            return symbol.upper()
        except Exception:
            continue
    try:
        hits = data_service.company_search(message, limit=1)
    except Exception:
        hits = []
    if hits:
        symbol = str((hits[0] or {}).get("symbol") or "").upper().strip()
        if symbol:
            return symbol
    return None


def _latest_history_stats(symbol: str) -> Dict[str, Any]:
    history: List[Dict[str, Any]] = []
    try:
        history = data_service.stock_history(symbol, days=365)
    except Exception:
        try:
            history = data_service.stock_history(symbol, days=180)
        except Exception:
            history = []
    closes = [float(row.get("close") or 0.0) for row in history if row.get("close") is not None]
    highs = [float(row.get("high") or 0.0) for row in history if row.get("high") is not None]
    lows = [float(row.get("low") or 0.0) for row in history if row.get("low") is not None]
    latest_date = history[-1].get("date") if history else None
    return {
        "history_points": len(history),
        "latest_data_date": latest_date,
        "52w_high": max(highs) if highs else None,
        "52w_low": min(lows) if lows else None,
        "average_close": (sum(closes) / len(closes)) if closes else None,
    }


def _format_lkr(value: Any) -> str:
    try:
        number = float(value)
    except Exception:
        return "n/a"
    return f"LKR {number:,.2f}"


def _format_pct(value: Any, *, digits: int = 2) -> str:
    try:
        return f"{float(value):.{digits}f}%"
    except Exception:
        return "n/a"


def _sanitize_output(text: str) -> str:
    cleaned = _clean_text(text)
    replacements = {
        "buy this stock": "review exposure/risk",
        "buy the stock": "review exposure/risk",
        "sell this stock": "review exposure/risk",
        "sell the stock": "review exposure/risk",
        "you should buy": "you may review exposure/risk",
        "you should sell": "you may review exposure/risk",
    }
    for old, new in replacements.items():
        cleaned = re.sub(old, new, cleaned, flags=re.IGNORECASE)
    if DISCLAIMER.lower() not in cleaned.lower():
        cleaned = f"{cleaned.rstrip()} {DISCLAIMER}"
    return cleaned.strip()


def _gemini_enabled() -> bool:
    return bool(os.getenv("GOOGLE_API_KEY") or os.getenv("GEMINI_API_KEY"))


def _llm_rewrite(answer: str, *, intent: str, context: Dict[str, Any], user_message: str) -> Tuple[str, bool]:
    if not _gemini_enabled():
        return _sanitize_output(answer), False
    try:
        import google.generativeai as genai  # type: ignore

        genai.configure(api_key=os.getenv("GOOGLE_API_KEY") or os.getenv("GEMINI_API_KEY"))
        model = genai.GenerativeModel(
            os.getenv("ASSISTANT_LLM_MODEL", "gemini-1.5-flash"),
            generation_config={"temperature": 0.2, "max_output_tokens": 512},
        )
        prompt = (
            "You are Tradexa Assistant, a premium AI Market Intelligence expert for the Colombo Stock Exchange. "
            "Your tone is professional, sophisticated, and insightful. "
            "Use only the provided context. Do not give financial advice or buy/sell recommendations. "
            f"Always include the exact sentence: {DISCLAIMER} "
            "If the context lacks specific data, explain that politely while providing what is available.\n\n"
            f"Intent: {intent}\n"
            f"User question: {user_message}\n"
            f"Context JSON: {context}\n\n"
            "Rewrite the response in 4-6 concise, high-quality sentences. Keep all numbers and dates exactly as provided. "
            "If an action (like alert creation) was performed, confirm it clearly at the beginning."
        )
        response = model.generate_content(prompt)
        text = getattr(response, "text", None) or ""
        return _sanitize_output(text or answer), True
    except Exception:
        return _sanitize_output(answer), False


def _help_answer(message: str) -> Dict[str, Any]:
    text = message.lower()
    answers = []
    if "watchlist" in text:
        answers.append(HELP_TOPICS["watchlist"])
    if "portfolio" in text or "create" in text:
        answers.append(HELP_TOPICS["portfolio"])
    if "prediction" in text:
        answers.append(HELP_TOPICS["prediction"])
    if "announcement" in text:
        answers.append(HELP_TOPICS["announcements"])
    if "alert" in text:
        answers.append(HELP_TOPICS["alerts"])
    if not answers:
        answers = [HELP_TOPICS[key] for key in ("watchlist", "portfolio", "prediction", "announcements", "alerts")]
    answer = " ".join(answers) + f" {DISCLAIMER}"
    return {
        "answer": answer,
        "sources": [{"type": "website_help", "title": "Website usage", "summary": "Guidance based on TradexaLK product workflows."}],
        "suggested_questions": _intent_examples("website_help"),
        "actions": [],
    }


def _market_answer() -> Dict[str, Any]:
    overview = data_service.market_overview()
    top_gainers = overview.get("topGainers") or overview.get("top_gainers") or []
    top_losers = overview.get("topLosers") or overview.get("top_losers") or []
    active = overview.get("mostActive") or overview.get("most_active") or []
    aspi = overview.get("aspi") or {}
    sp20 = overview.get("sp20") or {}
    answer = (
        f"The market is currently {overview.get('marketStatus') or 'mixed'}. "
        f"ASPI is at {_format_lkr(aspi.get('value')) if aspi else 'n/a'} and S&P SL20 is at {_format_lkr(sp20.get('value')) if sp20 else 'n/a'}. "
        f"Top gainers include {', '.join(str(item.get('symbol') or '') for item in top_gainers[:3] if item.get('symbol')) or 'n/a'}. "
        f"Top losers include {', '.join(str(item.get('symbol') or '') for item in top_losers[:3] if item.get('symbol')) or 'n/a'}. "
        f"Most active counters include {', '.join(str(item.get('symbol') or '') for item in active[:3] if item.get('symbol')) or 'n/a'}. "
        f"{DISCLAIMER}"
    )
    return {
        "answer": answer,
        "sources": [{"type": "market_overview", "title": "Market overview", "summary": str(overview.get("marketStatus") or "mixed"), "data": overview}],
        "suggested_questions": _intent_examples("market_summary"),
        "actions": [],
    }


def _stock_answer(symbol: str) -> Dict[str, Any]:
    stock = data_service.stock(symbol)
    sentiment = data_service.sentiment_summary(symbol, days=90)
    announcements = data_service.announcements_filtered(symbol, limit=5, important_only=False)
    prediction = data_service.prediction(symbol)
    stats = _latest_history_stats(symbol)
    volume = float(stock.get("volume") or 0.0)
    sentiment_summary = sentiment.get("summary") if isinstance(sentiment.get("summary"), dict) else {}
    sentiment_score = sentiment_summary.get("average_sentiment_score")
    recent_titles = [str(item.get("title") or "") for item in announcements[:3] if item.get("title")]
    pred_price = prediction.get("predicted_price")
    pred_return = prediction.get("predicted_return")
    band = prediction.get("band") or {}
    model_info = prediction.get("model") or {}
    explain = prediction.get("explanation") or {}
    main_line = (
        f"{stock.get('symbol')} is currently trading at {_format_lkr(stock.get('last'))} with a daily change of {_format_pct(stock.get('change_pct'))}. "
        f"Volume is {int(volume):,} and the recent 52-week range in stored data is {_format_lkr(stats.get('52w_low'))} to {_format_lkr(stats.get('52w_high'))}. "
        f"Sector: {stock.get('sector') or 'n/a'}."
    )
    follow_up = (
        f"Recent sentiment is {sentiment_score if sentiment_score is not None else 'n/a'} and recent announcements include {', '.join(recent_titles) or 'none'}. "
        f"Prediction output points to a predicted price of {_format_lkr(pred_price)} with a predicted return of {_format_pct((pred_return or 0) * 100, digits=2)}, an up probability of {_format_pct((prediction.get('up_probability') or 0) * 100, digits=1)}, and a q10/q90 range of {_format_lkr(band.get('p10'))} to {_format_lkr(band.get('p90'))}. "
        f"Model version {model_info.get('version') or model_info.get('model_version') or prediction.get('model_version') or 'n/a'} was trained at {model_info.get('trained_at_utc') or prediction.get('trained_at_utc') or 'n/a'}. "
        f"Latest data date: {prediction.get('latest_data_date') or stats.get('latest_data_date') or 'n/a'}. {DISCLAIMER}"
    )
    answer = f"{main_line} {follow_up}"
    if explain.get("summary"):
        answer = f"{answer} {str(explain.get('summary'))}"
    return {
        "answer": answer,
        "sources": [
            {"type": "stock", "title": f"Stock data for {symbol}", "symbol": symbol, "summary": f"Last {_format_lkr(stock.get('last'))} / {_format_pct(stock.get('change_pct'))}", "data": stock},
            {"type": "sentiment", "title": f"Sentiment for {symbol}", "symbol": symbol, "summary": str(sentiment_summary or {}), "data": sentiment},
            {"type": "announcements", "title": f"Recent announcements for {symbol}", "symbol": symbol, "summary": f"{len(announcements)} recent items", "data": announcements},
            {"type": "prediction", "title": f"Prediction for {symbol}", "symbol": symbol, "summary": f"Up probability {_format_pct((prediction.get('up_probability') or 0) * 100, digits=1)}", "data": prediction},
        ],
        "suggested_questions": _intent_examples("stock_explanation"),
        "actions": [],
    }


def confidence_label(prediction: Dict[str, Any]) -> str:
    confidence = prediction.get("confidence") or {}
    if isinstance(confidence, dict):
        return str(confidence.get("label") or "n/a")
    return "n/a"


def _prediction_answer(symbol: str) -> Dict[str, Any]:
    stock = data_service.stock(symbol)
    prediction = data_service.prediction(symbol)
    stats = _latest_history_stats(symbol)
    model_info = prediction.get("model") or {}
    explain = prediction.get("explanation") or {}
    band = prediction.get("band") or {}
    reliability = prediction.get("reliability") or {}
    answer = (
        f"The prediction for {symbol} is based on the latest stored market snapshot and model output. "
        f"Predicted price: {_format_lkr(prediction.get('predicted_price'))}. Predicted return: {_format_pct((prediction.get('predicted_return') or 0) * 100, digits=2)}. "
        f"Up probability: {_format_pct((prediction.get('up_probability') or 0) * 100, digits=1)}. q10/q90 range: {_format_lkr(band.get('p10'))} to {_format_lkr(band.get('p90'))}. "
        f"Confidence: {reliability.get('confidence_label') or confidence_label(prediction)}. "
        f"Model version: {model_info.get('version') or prediction.get('model_version') or 'n/a'}. Training date: {model_info.get('trained_at_utc') or prediction.get('trained_at_utc') or 'n/a'}. "
        f"Latest data date: {prediction.get('latest_data_date') or stats.get('latest_data_date') or 'n/a'}. {DISCLAIMER}"
    )
    if explain.get("summary"):
        answer = f"{answer} {str(explain.get('summary'))}"
    return {
        "answer": answer,
        "sources": [
            {"type": "prediction", "title": f"Prediction for {symbol}", "symbol": symbol, "summary": f"Predicted price {_format_lkr(prediction.get('predicted_price'))}", "data": prediction},
            {"type": "stock", "title": f"Latest stock snapshot for {symbol}", "symbol": symbol, "summary": f"Latest price {_format_lkr(stock.get('last'))}", "data": stock},
        ],
        "suggested_questions": _intent_examples("prediction_explanation"),
        "actions": [],
    }


def _portfolio_answer(user: Dict[str, Any], portfolio_id: Optional[str]) -> Dict[str, Any]:
    portfolio = data_service.get_portfolio(user["username"], portfolio_id=portfolio_id)
    analytics = data_service.get_portfolio_analytics(user["username"], days=365, portfolio_id=portfolio_id)
    intelligence = data_service.get_portfolio_intelligence(user["username"], portfolio_id=portfolio_id)
    watchlist = data_service.get_watchlist(user["username"])
    alerts = data_service.list_alerts(user["username"])
    summary = portfolio.get("summary") or {}
    positions = portfolio.get("positions") or []
    biggest_gain = max(positions, key=lambda item: float(item.get("unrealized_pl") or 0.0), default=None)
    biggest_loss = min(positions, key=lambda item: float(item.get("unrealized_pl") or 0.0), default=None)
    sector_allocation = analytics.get("sectorAllocation") or []
    largest_sector = sector_allocation[0] if sector_allocation else None
    answer = (
        f"Your portfolio value is {_format_lkr(summary.get('total_equity'))}. Unrealized P/L is {_format_lkr(summary.get('unrealized_pl'))} and realized P/L is {_format_lkr(summary.get('realized_pl'))}. "
        f"The diversification score is {int((analytics.get('diversification') or {}).get('score') or 0)} and the risk score is {int((analytics.get('risk') or {}).get('score') or 0)}. "
        f"{(biggest_gain or {}).get('symbol') or 'No open positions'} currently has the biggest gain, while {(biggest_loss or {}).get('symbol') or 'No open positions'} currently has the biggest loss. "
        f"Largest sector exposure is {largest_sector.get('sector') if largest_sector else 'n/a'} at {largest_sector.get('weightPct') if largest_sector else 'n/a'}%. "
        f"Watchlist items: {len(watchlist.get('symbols') or [])}. Active alerts: {len(alerts)}. "
        f"For next steps, you may review exposure/risk, cash levels, concentration, and sector balance. {DISCLAIMER}"
    )
    if intelligence.get("suggestions"):
        answer = f"{answer} {str(intelligence.get('suggestions')[0])}"
    return {
        "answer": answer,
        "sources": [
            {"type": "portfolio", "title": "Portfolio summary", "summary": f"Value {_format_lkr(summary.get('total_equity'))}", "data": portfolio},
            {"type": "portfolio_analytics", "title": "Portfolio analytics", "summary": f"Risk {int((analytics.get('risk') or {}).get('score') or 0)} / Diversification {int((analytics.get('diversification') or {}).get('score') or 0)}", "data": analytics},
            {"type": "portfolio_intelligence", "title": "Portfolio intelligence", "summary": str(intelligence.get("health") or {}), "data": intelligence},
        ],
        "suggested_questions": _intent_examples("portfolio_assistant"),
        "actions": [],
    }


def _alert_matches(alerts: List[Dict[str, Any]], symbol: Optional[str], alert_type: Optional[str], target_value: Optional[float]) -> List[Dict[str, Any]]:
    symbol_u = symbol.upper() if symbol else None
    matches = []
    for alert in alerts:
        if symbol_u and str(alert.get("symbol") or "").upper() != symbol_u:
            continue
        if alert_type and str(alert.get("alert_type") or "").lower() != alert_type.lower():
            continue
        if target_value is not None:
            try:
                existing_target = float(alert.get("target_value") or 0.0)
            except Exception:
                existing_target = None
            if existing_target is None or abs(existing_target - target_value) > 0.0001:
                continue
        matches.append(alert)
    return matches


def _parse_alert_request(message: str) -> Dict[str, Any]:
    text = message.lower()
    symbol = _extract_symbol(message)
    target = None
    alert_type = None
    action = "list" if any(token in text for token in ("show my active alerts", "list alerts", "show alerts", "active alerts")) else "create"
    if any(token in text for token in ("delete alert", "remove alert", "cancel alert", "delete the alert")):
        action = "delete"
    if any(token in text for token in ("triggered alert", "why did this alert trigger", "explain this alert")):
        action = "explain"

    price_match = re.search(r"(?:above|over|higher than|goes above|go above|less than|below|drops below|goes below|under)\s*lkr?\s*([0-9]+(?:\.[0-9]+)?)", text, re.IGNORECASE)
    if price_match:
        target = float(price_match.group(1))
    else:
        number_match = re.search(r"(?:above|over|higher than|below|under|drops below|goes above|goes below)\s*([0-9]+(?:\.[0-9]+)?)", text, re.IGNORECASE)
        if number_match:
            target = float(number_match.group(1))

    if any(token in text for token in ("volume spike", "volume goes above", "volume above")):
        alert_type = "volume_spike"
        target = target or 2.0
    elif any(token in text for token in ("drop below", "below", "under", "less than")):
        alert_type = "below_price"
    elif any(token in text for token in ("above", "over", "goes above", "higher than")):
        alert_type = "above_price"
    return {"action": action, "symbol": symbol, "alert_type": alert_type, "target_value": target}


def _alert_answer(user: Dict[str, Any], message: str) -> Dict[str, Any]:
    parsed = _parse_alert_request(message)
    if parsed["action"] == "list":
        alerts = data_service.list_alerts(user["username"])
        answer = f"You currently have {len(alerts)} active alerts. "
        if alerts:
            active = []
            for alert in alerts[:5]:
                active.append(f"{alert.get('symbol') or 'Market'} {alert.get('alert_type') or 'alert'} at {alert.get('target_value')}")
            answer += "Top alerts: " + "; ".join(active) + ". "
        answer += DISCLAIMER
        return {"answer": answer, "sources": [{"type": "alerts", "title": "Active alerts", "summary": f"{len(alerts)} alerts", "data": alerts}], "suggested_questions": _intent_examples("alert_assistant"), "actions": [{"type": "list_alerts", "status": "ok", "message": f"Found {len(alerts)} alerts."}]}

    if parsed["action"] == "delete":
        alerts = data_service.list_alerts(user["username"])
        matches = _alert_matches(alerts, parsed.get("symbol"), parsed.get("alert_type"), parsed.get("target_value"))
        if len(matches) != 1:
            answer = f"I found {len(matches)} matching alerts, so I need one exact target or alert ID before deleting. {DISCLAIMER}" if len(matches) > 1 else f"I could not find one exact alert to delete. Please include the symbol and target price, or use the alert ID. {DISCLAIMER}"
            return {"answer": answer, "sources": [{"type": "alerts", "title": "Matched alerts", "summary": f"{len(matches)} matches", "data": matches}], "suggested_questions": _intent_examples("alert_assistant"), "actions": [{"type": "delete_alert", "status": "needs_clarification", "message": "Need one exact matching alert."}]}
        deleted = data_service.delete_alert(user["username"], str(matches[0].get("alert_id") or ""))
        answer = f"I deleted the alert for {matches[0].get('symbol') or 'the selected stock'}. {DISCLAIMER}"
        return {"answer": answer, "sources": [{"type": "alerts", "title": "Remaining alerts", "summary": f"{len(deleted.get('alerts') or [])} alerts", "data": deleted}], "suggested_questions": _intent_examples("alert_assistant"), "actions": [{"type": "delete_alert", "status": "ok", "message": "Alert deleted."}]}

    if parsed["action"] == "explain":
        alerts = data_service.list_alerts(user["username"])
        matches = _alert_matches(alerts, parsed.get("symbol"), parsed.get("alert_type"), parsed.get("target_value"))
        if not matches:
            answer = f"I could not find the alert you are referring to. {DISCLAIMER}"
            return {"answer": answer, "sources": [{"type": "alerts", "title": "Alerts", "summary": "No direct match", "data": alerts}], "suggested_questions": _intent_examples("alert_assistant"), "actions": []}
        alert = matches[0]
        symbol = str(alert.get("symbol") or "").upper()
        latest = None
        avg_vol = None
        try:
            latest, _, avg_vol, _ = data_service._latest_close_and_prev(symbol)  # type: ignore[attr-defined]
        except Exception:
            pass
        answer = f"The alert for {symbol or 'your selected stock'} triggered because the current market data matched the alert condition. Latest price is {_format_lkr(latest)} and the alert target is {_format_lkr(alert.get('target_value'))}. If this was a volume alert, recent average volume was {int(avg_vol or 0):,}. {DISCLAIMER}"
        return {"answer": answer, "sources": [{"type": "alerts", "title": "Triggered alert", "summary": str(alert), "data": alert}], "suggested_questions": _intent_examples("alert_assistant"), "actions": [{"type": "explain_alert", "status": "ok", "message": "Explained triggered alert."}]}

    if parsed["action"] == "create":
        symbol = parsed.get("symbol")
        target = parsed.get("target_value")
        alert_type = parsed.get("alert_type") or "above_price"
        if not symbol or target is None:
            return {"answer": f"I need a symbol and a target value before I can create an alert. {DISCLAIMER}", "sources": [], "suggested_questions": _intent_examples("alert_assistant"), "actions": [{"type": "create_alert", "status": "needs_clarification", "message": "Missing symbol or target value."}]}
        payload = {"symbol": symbol, "alert_type": alert_type, "target_value": target}
        result = data_service.create_alert(user["username"], payload)
        created = result.get("alert") or {}
        answer = f"I created an alert for {symbol} when the price goes above {_format_lkr(target)}. {DISCLAIMER}"
        if alert_type == "below_price":
            answer = f"I created an alert for {symbol} when the price goes below {_format_lkr(target)}. {DISCLAIMER}"
        elif alert_type == "volume_spike":
            answer = f"I created an alert for {symbol} when volume moves above a recent multiple of {float(target):.2f}x. {DISCLAIMER}"
        return {"answer": answer, "sources": [{"type": "alerts", "title": "Created alert", "summary": str(created), "data": result}], "suggested_questions": _intent_examples("alert_assistant"), "actions": [{"type": "create_alert", "status": "ok", "message": "Alert created."}]}

    return {"answer": f"I can help with alerts, but I could not understand the action clearly. {DISCLAIMER}", "sources": [{"type": "alerts", "title": "Alerts help", "summary": "Use create, list, delete, or explain alert requests.", "data": {}}], "suggested_questions": _intent_examples("alert_assistant"), "actions": []}


def chat_assistant(message: str, *, user: Optional[Dict[str, Any]] = None, portfolio_id: Optional[str] = None) -> Dict[str, Any]:
    cleaned = _clean_text(message)
    if not cleaned:
        raise HTTPException(status_code=400, detail="Message is required")

    intent = _detect_intent(cleaned)
    symbol = _extract_symbol(cleaned)
    context: Dict[str, Any] = {"intent": intent, "message": cleaned, "symbol": symbol, "portfolio_id": portfolio_id}

    if intent == "website_help":
        base = _help_answer(cleaned)
    elif intent == "market_summary":
        base = _market_answer()
    elif intent == "alert_assistant":
        if user is None and any(token in cleaned.lower() for token in ("create", "delete", "show", "list")):
            return {"intent": intent, "answer": f"You need to log in for alert actions. {DISCLAIMER}", "sources": [], "actions": [{"type": "auth", "status": "required", "message": "Login required."}], "suggested_questions": _intent_examples(intent), "disclaimer": DISCLAIMER, "llm_used": False, "needs_auth": True}
        if user is None:
            return {"intent": intent, "answer": f"I can explain alerts, but you need to log in to create, delete, or list your personal alerts. {DISCLAIMER}", "sources": [], "actions": [{"type": "auth", "status": "required", "message": "Login required."}], "suggested_questions": _intent_examples(intent), "disclaimer": DISCLAIMER, "llm_used": False, "needs_auth": True}
        base = _alert_answer(user, cleaned)
    elif intent == "portfolio_assistant":
        if user is None:
            return {"intent": intent, "answer": f"I can explain portfolio concepts, but you need to log in to read your own portfolio data. {DISCLAIMER}", "sources": [], "actions": [{"type": "auth", "status": "required", "message": "Login required."}], "suggested_questions": _intent_examples(intent), "disclaimer": DISCLAIMER, "llm_used": False, "needs_auth": True}
        base = _portfolio_answer(user, portfolio_id)
    elif intent == "prediction_explanation":
        if not symbol:
            return {"intent": intent, "answer": f"Please include a stock symbol so I can explain the prediction. {DISCLAIMER}", "sources": [], "actions": [], "suggested_questions": _intent_examples(intent), "disclaimer": DISCLAIMER, "llm_used": False}
        base = _prediction_answer(symbol)
    elif intent == "stock_explanation":
        if not symbol:
            return {"intent": intent, "answer": f"Please include a stock symbol and I’ll explain the price, sentiment, announcements, and prediction. {DISCLAIMER}", "sources": [], "actions": [], "suggested_questions": _intent_examples(intent), "disclaimer": DISCLAIMER, "llm_used": False}
        base = _stock_answer(symbol)
    else:
        base = _market_answer()

    answer, llm_used = _llm_rewrite(base.get("answer", ""), intent=intent, context={**context, "sources": base.get("sources")}, user_message=cleaned)
    base.update({"intent": intent, "answer": answer, "disclaimer": DISCLAIMER, "llm_used": llm_used, "needs_auth": bool(base.get("needs_auth", False))})
    return base
