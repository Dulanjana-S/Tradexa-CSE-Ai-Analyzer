from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple
import logging
import time

import requests
from fastapi import HTTPException

from .base import MarketDataProvider


log = logging.getLogger(__name__)


def _ms_to_ymd(ms: int) -> str:
    dt = datetime.fromtimestamp(ms / 1000, tz=timezone.utc)
    return dt.date().isoformat()


def _safe_int(v: Any) -> Optional[int]:
    try:
        if v is None:
            return None
        return int(v)
    except Exception:
        return None


def _safe_float(v: Any) -> Optional[float]:
    try:
        if v is None:
            return None
        return float(v)
    except Exception:
        return None


@dataclass
class _ChartTry:
    endpoint: str
    payload: Dict[str, Any]
    label: str


class CSEProvider(MarketDataProvider):
    """Unofficial CSE website API provider.

    The GH0STH4CKER documentation lists the base URL and endpoint names.
    All calls are POST with form-encoded data.

    NOTE: This API is reverse-engineered from cse.lk and may change without notice.
    """

    def __init__(
        self,
        base_url: str = "https://www.cse.lk/api",
        timeout: int = 25,
        chart_id: int = 1,
        chart_period: int = 1,
        company_chart_period: int = 1,
        max_retries: int = 2,
    ):
        self.base_url = base_url.rstrip("/")
        self.timeout = timeout
        self.chart_id = chart_id
        self.chart_period = chart_period
        self.company_chart_period = company_chart_period
        self.max_retries = max_retries

        self.session = requests.Session()
        self.session.headers.update(
            {
                # Use browser-like headers. The CSE site sometimes blocks or
                # degrades responses for non-browser User-Agents.
                "Accept": "application/json,text/plain,*/*",
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0 Safari/537.36",
                "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
                "Origin": "https://www.cse.lk",
                "Referer": "https://www.cse.lk/",
                "X-Requested-With": "XMLHttpRequest",
                "Accept-Language": "en-US,en;q=0.9",
            }
        )

        self._stock_id_cache: Dict[str, int] = {}

    @property
    def name(self) -> str:
        return "cse"

    # ---- low-level ----
    def _post(self, endpoint: str, data: Optional[Dict[str, Any]] = None) -> Any:
        url = f"{self.base_url}/{endpoint.lstrip('/')}"
        payload = data or {}

        last_err: Optional[Exception] = None
        for attempt in range(self.max_retries + 1):
            try:
                r = self.session.post(url, data=payload, timeout=self.timeout)
                # retry some transient responses
                if r.status_code in (429, 502, 503, 504) and attempt < self.max_retries:
                    time.sleep(0.5 * (2**attempt))
                    continue
                r.raise_for_status()
                return r.json()
            except requests.HTTPError as e:
                last_err = e
                status = getattr(getattr(e, "response", None), "status_code", None) or 502
                raise HTTPException(status_code=status, detail=f"CSE API HTTP error on {endpoint}: {e}")
            except requests.RequestException as e:
                last_err = e
                if attempt < self.max_retries:
                    time.sleep(0.5 * (2**attempt))
                    continue
                raise HTTPException(status_code=502, detail=f"Failed to reach CSE API ({endpoint}): {e}")
            except ValueError as e:
                last_err = e
                raise HTTPException(status_code=502, detail=f"Non-JSON response from CSE API ({endpoint})")

        raise HTTPException(status_code=502, detail=f"CSE API error on {endpoint}: {last_err}")

    # ---- symbol -> stockId helpers ----
    def _extract_possible_id(self, it: Dict[str, Any]) -> Optional[int]:
        # Different endpoints can name it differently.
        for k in ("stockId", "stock_id", "securityId", "security_id", "id"):
            v = _safe_int(it.get(k))
            if v is not None:
                return v
        return None

    def _get_stock_id(self, symbol: str) -> Optional[int]:
        sym = symbol.upper()
        if sym in self._stock_id_cache:
            return self._stock_id_cache[sym]

        # 1) companyInfoSummery sometimes contains an id/securityId
        try:
            info = self._post("companyInfoSummery", {"symbol": sym})
            if isinstance(info, dict):
                sym_info = info.get("reqSymbolInfo") or {}
                if isinstance(sym_info, dict):
                    sid = self._extract_possible_id(sym_info)
                    if sid is not None:
                        self._stock_id_cache[sym] = sid
                        return sid
        except HTTPException:
            pass

        # 2) todaySharePrice is a flat list
        try:
            tsp = self._post("todaySharePrice")
            if isinstance(tsp, list):
                for it in tsp:
                    if isinstance(it, dict) and (it.get("symbol") or "").upper() == sym:
                        sid = self._extract_possible_id(it)
                        if sid is not None:
                            self._stock_id_cache[sym] = sid
                            return sid
        except HTTPException:
            pass

        # 3) tradeSummary is a nested list under reqTradeSummery
        try:
            ts = self._post("tradeSummary")
            items = ts.get("reqTradeSummery") if isinstance(ts, dict) else None
            if isinstance(items, list):
                for it in items:
                    if isinstance(it, dict) and (it.get("symbol") or "").upper() == sym:
                        sid = self._extract_possible_id(it)
                        if sid is not None:
                            self._stock_id_cache[sym] = sid
                            return sid
        except HTTPException:
            pass

        return None

    # ---- MarketDataProvider ----
    def get_market_overview(self) -> Dict[str, Any]:
        """Market overview for dashboard.

        Note: marketSummery is inconsistent for turnover/market cap.
        Prefer dailyMarketSummery for marketTurnover/marketCap/marketTrades.
        """

        status = self._post("marketStatus")
        summary = self._post("marketSummery")
        aspi = self._post("aspiData")
        sl20 = self._post("snpData")

        daily_latest: Optional[Dict[str, Any]] = None
        try:
            dms = self._post("dailyMarketSummery")
            if isinstance(dms, list) and dms:
                if isinstance(dms[0], list) and dms[0] and isinstance(dms[0][0], dict):
                    daily_latest = dms[0][0]
                elif isinstance(dms[0], dict):
                    daily_latest = dms[0]
            elif isinstance(dms, dict):
                for k in ("reqDailyMarketSummery", "dailyMarketSummery", "data"):
                    v = dms.get(k)
                    if isinstance(v, list) and v and isinstance(v[0], dict):
                        daily_latest = v[0]
                        break
        except Exception:
            daily_latest = None

        top_gainers = self._post("topGainers") or []
        top_losers = self._post("topLooses") or []

        # Derive most active from tradeSummary using turnover proxy (price*volume)
        most_active: List[Dict[str, Any]] = []
        try:
            ts = self._post("tradeSummary")
            items = ts.get("reqTradeSummery") if isinstance(ts, dict) else ts
            if isinstance(items, list):
                rows: List[Tuple[float, Dict[str, Any]]] = []
                for it in items:
                    if not isinstance(it, dict):
                        continue
                    sym = (it.get("symbol") or it.get("securityCode") or "").upper()
                    if not sym:
                        continue
                    price = _safe_float(it.get("price") or it.get("lastTradedPrice") or it.get("last")) or 0.0
                    vol = _safe_float(it.get("qty") or it.get("tradeVolume") or it.get("volume") or 0) or 0.0
                    turn = price * vol
                    rows.append((turn, {"symbol": sym, "price": price, "last": price, "change": _safe_float(it.get("change")), "change_pct": _safe_float(it.get("changePercentage") or it.get("changePct")), "volume": vol, "turnoverProxy": turn}))
                rows.sort(key=lambda t: t[0], reverse=True)
                most_active = [r for _, r in rows[:10]]
        except Exception:
            most_active = []

        return {
            "status": status,
            "summary": summary,
            "daily": daily_latest,
            "aspi": aspi,
            "snp_sl20": sl20,
            "top_gainers": top_gainers[:10],
            "top_losers": top_losers[:10],
            "most_active": most_active,
            "updated_at": datetime.now().isoformat(timespec="seconds"),
            "source": self.name,
        }

    def get_indices(self) -> Dict[str, List[Dict[str, Any]]]:
        raw = self._post("dailyMarketSummery")
        items: List[Dict[str, Any]] = []
        if isinstance(raw, list) and raw:
            if isinstance(raw[0], list):
                items = [x for x in raw[0] if isinstance(x, dict)]
            else:
                items = [x for x in raw if isinstance(x, dict)]

        aspi_series: List[Dict[str, Any]] = []
        sl20_series: List[Dict[str, Any]] = []
        for x in items:
            trade_ms = _safe_int(x.get("tradeDate"))
            if trade_ms is None:
                continue
            d = _ms_to_ymd(trade_ms)
            if x.get("asi") is not None:
                aspi_series.append({"date": d, "value": float(x["asi"])})
            if x.get("spp") is not None:
                sl20_series.append({"date": d, "value": float(x["spp"])})

        aspi_series.sort(key=lambda r: r["date"])
        sl20_series.sort(key=lambda r: r["date"])
        return {"ASPI": aspi_series, "SNP_SL20": sl20_series, "source": self.name}

    def list_companies(self) -> List[Dict[str, Any]]:
        raw = self._post("tradeSummary")
        items = raw.get("reqTradeSummery") if isinstance(raw, dict) else raw

        out: List[Dict[str, Any]] = []
        if isinstance(items, list):
            for it in items:
                if not isinstance(it, dict):
                    continue
                sym = (it.get("symbol") or it.get("securityCode") or "").upper()
                if not sym:
                    continue
                sid = self._extract_possible_id(it)
                if sid is not None:
                    self._stock_id_cache.setdefault(sym, sid)

                out.append(
                    {
                        "symbol": sym,
                        "name": it.get("name") or it.get("securityName") or sym,
                        "sector": it.get("sector") or it.get("sectorName") or "—",
                        "industry_group": it.get("industryGroup") or it.get("industryGroupName"),
                        "market_cap": it.get("marketCap") or it.get("marketCapitalization"),
                        "beta": it.get("beta") or it.get("betaValue"),
                        "logo_url": None,

                        # Snapshot-ish fields
                        "date": datetime.now().date().isoformat(),
                        "last": it.get("price") or it.get("lastTradedPrice") or it.get("last"),
                        "open": it.get("open"),
                        "high": it.get("high"),
                        "low": it.get("low"),
                        "volume": it.get("qty") or it.get("tradeVolume") or it.get("volume") or 0,
                        "trades": it.get("trades") or it.get("tradeCount") or 0,
                        "vwap": it.get("vwap"),
                        "change": it.get("change"),
                        "change_pct": it.get("changePercentage") or it.get("changePct") or it.get("change_percentage"),
                    }
                )
        return out

    def get_stock(self, symbol: str) -> Dict[str, Any]:
        sym = symbol.upper()
        raw = self._post("companyInfoSummery", {"symbol": sym})
        if not isinstance(raw, dict):
            raise HTTPException(status_code=502, detail="Unexpected response from companyInfoSummery")

        def _first_dict(v: Any) -> Dict[str, Any]:
            if isinstance(v, dict):
                return v
            if isinstance(v, list):
                for it in v:
                    if isinstance(it, dict):
                        return it
            return {}

        # CSE payloads are inconsistent: reqSymbolInfo may be dict/list/nested.
        sym_info = _first_dict(
            raw.get("reqSymbolInfo")
            or raw.get("reqSymbolInfoDto")
            or raw.get("reqSymbolInfoSummery")
            or raw.get("reqSymbolInfoSummary")
            or raw.get("symbolInfo")
            or raw.get("data")
        )
        beta_info = raw.get("reqSymbolBetaInfo") or {}
        logo = raw.get("reqLogo") or {}

        # stockId/securityId (needed for companyChartDataByStock)
        if isinstance(sym_info, dict):
            sid = self._extract_possible_id(sym_info)
            if sid is not None:
                self._stock_id_cache.setdefault(sym, sid)

        beta = None
        if isinstance(beta_info, dict):
            beta = beta_info.get("betaValueSPSL") or beta_info.get("betaValue")

        logo_path = logo.get("path") if isinstance(logo, dict) else None
        logo_url = f"https://www.cse.lk/{logo_path}" if logo_path else None

        last = sym_info.get("lastTradedPrice") or sym_info.get("price") or sym_info.get("last")
        chg = sym_info.get("change")
        chg_pct = sym_info.get("changePercentage")

        # Enrichment: todaySharePrice often contains better intraday fields
        # (open/high/low/volume/vwap) and sometimes even last price when
        # companyInfoSummery is missing or partial.
        needs_enrich = (
            last is None
            or sym_info.get("open") is None
            or sym_info.get("high") is None
            or sym_info.get("low") is None
            or sym_info.get("shareVolume") is None
            or sym_info.get("vwap") is None
            or sym_info.get("tradeCount") is None
        )
        if needs_enrich:
            try:
                tsp = self._post("todaySharePrice")
                if isinstance(tsp, list):
                    for it in tsp:
                        if not isinstance(it, dict):
                            continue
                        if (it.get("symbol") or "").upper() != sym:
                            continue
                        last = it.get("lastTradedPrice") or it.get("price") or it.get("last") or last
                        chg = it.get("change") if chg is None else chg
                        chg_pct = it.get("changePercentage") if chg_pct is None else chg_pct
                        # Enrich OHLCV if present
                        for k_src, k_dst in (
                            ("open", "open"),
                            ("high", "high"),
                            ("low", "low"),
                            ("shareVolume", "shareVolume"),
                            ("tradeVolume", "tradeVolume"),
                            ("qty", "qty"),
                            ("vwap", "vwap"),
                            ("tradeCount", "tradeCount"),
                        ):
                            if sym_info.get(k_dst) is None and it.get(k_src) is not None:
                                sym_info[k_dst] = it.get(k_src)
                        break
            except Exception:
                pass

        return {
            "symbol": sym,
            "name": sym_info.get("name") or sym,
            "sector": sym_info.get("sector") or "—",
            "industry_group": sym_info.get("industryGroup") or sym_info.get("industryGroupName"),
            "market_cap": sym_info.get("marketCap") or sym_info.get("market_cap"),
            "beta": beta,
            "logo_url": logo_url,
            "date": datetime.now().date().isoformat(),
            "last": _safe_float(last),
            "open": _safe_float(sym_info.get("open")),
            "high": _safe_float(sym_info.get("high")),
            "low": _safe_float(sym_info.get("low")),
            "volume": _safe_int(sym_info.get("shareVolume") or sym_info.get("volume")) or 0,
            "trades": _safe_int(sym_info.get("trades") or sym_info.get("tradeCount")) or 0,
            "vwap": _safe_float(sym_info.get("vwap")),
            "change": _safe_float(chg),
            "change_pct": _safe_float(chg_pct),
            "source": self.name,
        }

    def _parse_chart_rows(self, chart: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        rows: List[Dict[str, Any]] = []
        for it in chart:
            if not isinstance(it, dict):
                continue
            t = it.get("t") or it.get("time") or it.get("tradeDate")
            t_int = _safe_int(t)
            if t_int is None:
                continue
            # Some endpoints use epoch ms
            d = _ms_to_ymd(t_int) if t_int > 10_000_000_000 else datetime.fromtimestamp(t_int, tz=timezone.utc).date().isoformat()

            high = _safe_float(it.get("h") or it.get("high"))
            low = _safe_float(it.get("l") or it.get("low"))
            open_ = _safe_float(it.get("o") or it.get("open"))
            # In companyChartDataByStock payload, 'p' is close price.
            close = _safe_float(it.get("p") or it.get("close"))

            # In CSE chart payloads, 'q' is volume (see sample project).
            vol = _safe_int(it.get("q") or it.get("v") or it.get("volume")) or 0
            trades = _safe_int(it.get("n") or it.get("trades") or it.get("tradeCount")) or 0

            if close is None:
                continue
            if open_ is None:
                open_ = close
            if high is None:
                high = close
            if low is None:
                low = close

            rows.append(
                {
                    "date": d,
                    "open": open_,
                    "high": high,
                    "low": low,
                    "close": close,
                    "volume": vol,
                    "trades": trades,
                    "vwap": None,
                }
            )
        rows.sort(key=lambda r: r["date"])
        return rows

    def get_stock_history(self, symbol: str, days: int) -> List[Dict[str, Any]]:
        """Fetches OHLC history (best-effort).

        - First tries companyChartDataByStock (requires stockId + period).
        - Then falls back to chartData (symbol + chartId + period), which may 400 for some symbols.
        """

        sym = symbol.upper()
        sid = self._get_stock_id(sym)

        # Period values are not officially documented and can vary.
        # The community docs list many possible period values (1..23). To maximize
        # coverage (especially for illiquid counters), we try a small set of
        # "larger" periods first, then smaller ones.
        #
        # This mirrors the behavior of many community clients and prevents
        # "only a few candles" issues when a period is too narrow.
        if days <= 60:
            period_candidates = [6, 3, 1, 12, 23]
        elif days <= 180:
            period_candidates = [12, 6, 3, 1, 23]
        else:
            period_candidates = [23, 12, 6, 3, 1]

        tries: List[_ChartTry] = []
        if sid is not None:
            for period in period_candidates:
                tries.append(
                    _ChartTry(
                        endpoint="companyChartDataByStock",
                        payload={"stockId": sid, "period": period},
                        label=f"companyChartDataByStock(period={period})",
                    )
                )

        # Try a few chartId values for robustness (some counters behave differently)
        chart_ids = []
        for cid in (self.chart_id, 1, 2, 3, 4):
            if cid not in chart_ids:
                chart_ids.append(cid)
        for cid in chart_ids:
            for period in period_candidates:
                tries.append(
                    _ChartTry(
                        endpoint="chartData",
                        payload={"symbol": sym, "chartId": cid, "period": period},
                        label=f"chartData(chartId={cid},period={period})",
                    )
                )

        last_err: Optional[str] = None
        for t in tries:
            try:
                raw = self._post(t.endpoint, t.payload)
            except HTTPException as e:
                last_err = f"{t.label}: {e.detail}"
                continue

            # The docs show companyChartDataByStock returns reqTradeSummery.chartData.
            chart: Any = None
            if isinstance(raw, dict):
                rt = raw.get("reqTradeSummery") or raw.get("reqTradeSummary") or raw
                if isinstance(rt, dict):
                    chart = rt.get("chartData") or rt.get("reqChartData")
                elif isinstance(rt, list):
                    chart = rt
            elif isinstance(raw, list):
                chart = raw

            if not isinstance(chart, list):
                last_err = f"{t.label}: no chart list in response"
                continue

            rows = self._parse_chart_rows([x for x in chart if isinstance(x, dict)])
            if rows:
                return rows[-days:]

            last_err = f"{t.label}: chart list empty after parsing"

        raise HTTPException(status_code=502, detail=f"Could not fetch history for {sym}. Last error: {last_err}")

    def get_announcements(self, symbol: Optional[str], limit: int) -> List[Dict[str, Any]]:
        sym_filter = symbol.upper() if symbol else None

        def _full_url(u: Optional[str]) -> Optional[str]:
            if not u:
                return None
            u = str(u)
            if u.startswith("http://") or u.startswith("https://"):
                return u
            # most paths are relative on cse.lk
            return f"https://www.cse.lk/{u.lstrip('/')}"

        def _extract(items: Any, category: str) -> List[Dict[str, Any]]:
            out: List[Dict[str, Any]] = []
            if not isinstance(items, list):
                return out
            for it in items:
                if not isinstance(it, dict):
                    continue
                sym = (it.get("symbol") or it.get("securityCode") or it.get("ticker") or "")
                if sym_filter and sym and sym.upper() != sym_filter:
                    continue

                out.append(
                    {
                        "symbol": sym or (sym_filter or ""),
                        "company": it.get("company") or it.get("companyName") or "",
                        "title": it.get("fileText") or it.get("title") or it.get("subject") or it.get("description") or "",
                        "date": str(it.get("annDate") or it.get("date") or it.get("time") or it.get("createdDate") or ""),
                        "category": category,
                        "url": _full_url(it.get("filePath") or it.get("fileUrl") or it.get("url") or it.get("attachmentUrl")),
                        "raw": it,
                    }
                )
            return out

        # Endpoint names per docs
        endpoints: List[Tuple[str, str, str]] = [
            ("getNewListingsRelatedNoticesAnnouncements", "newListingRelatedAnnouncements", "Listings/Notices"),
            ("getBuyInBoardAnnouncements", "buyInBoardAnnouncements", "Buy-in Board"),
            ("approvedAnnouncement", "approvedAnnouncements", "Approved"),
            ("getCOVIDAnnouncements", "covidAnnouncements", "COVID"),
            ("getFinancialAnnouncement", "reqFinancialAnnouncemnets", "Financial"),
            ("circularAnnouncement", "reqCircularAnnouncement", "Circular"),
            ("directiveAnnouncement", "reqDirectiveAnnouncement", "Directive"),
            ("getNonComplianceAnnouncements", "nonComplianceAnnouncements", "Non-Compliance"),
        ]

        all_anns: List[Dict[str, Any]] = []
        for ep, key, label in endpoints:
            try:
                raw = self._post(ep)
            except HTTPException:
                continue
            items = raw.get(key) if isinstance(raw, dict) else None
            all_anns.extend(_extract(items, label))

        # Keep order (most endpoints already deliver newest-first)
        cleaned = [a for a in all_anns if a.get("title")]
        return cleaned[:limit]
