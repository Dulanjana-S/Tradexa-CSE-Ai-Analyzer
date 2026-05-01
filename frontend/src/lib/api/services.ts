import { api } from "./client";
import { normalizeRole } from "../auth/roles";
import type {
  AdminStatus,
  AdminUser,
  Alert,
  Announcement,
  AuthResponse,
  HistoricalDataPoint,
  Job,
  LoginRequest,
  MarketOverview,
  Model,
  Notification,
  PredictionCardData,
  RegisterRequest,
  Stock,
  StockDocuments,
  StockNews,
  StockResources,
  User,
  UserSettings,
  Watchlist,
  PortfolioData,
  PortfolioPerformancePoint,
  PortfolioPosition,
  CorporateAction,
  PortfolioSummary,
  PortfolioTransaction,
  PortfolioAnalytics,
  PortfolioIntelligence,
  TradeFitPreview,
  SentimentSummary,
  EventCalendar,
  AuditLog,
  AdminModelHealth,
} from "./types";

function num(value: any, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function formatRelativeTime(value?: string): string {
  if (!value) return "just now";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const diffMs = Date.now() - date.getTime();
  const diffMinutes = Math.max(1, Math.round(diffMs / 60000));
  if (diffMinutes < 60) return `${diffMinutes} minute${diffMinutes === 1 ? "" : "s"} ago`;
  const diffHours = Math.round(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours} hour${diffHours === 1 ? "" : "s"} ago`;
  const diffDays = Math.round(diffHours / 24);
  return `${diffDays} day${diffDays === 1 ? "" : "s"} ago`;
}

function mapUser(raw: any): User {
  return {
    username: String(raw?.username || ""),
    email: String(raw?.email || ""),
    name: String(raw?.display_name || raw?.name || raw?.username || "User"),
    displayName: String(raw?.display_name || raw?.name || raw?.username || "User"),
    role: normalizeRole(raw?.role),
    createdAt: raw?.created_at,
    lastLoginAt: raw?.last_login_at,
  };
}

function mapStock(raw: any): Stock {
  const last = num(raw?.last ?? raw?.price);
  const change = num(raw?.change);
  return {
    symbol: String(raw?.symbol || ""),
    name: String(raw?.name || raw?.company || raw?.symbol || ""),
    company: String(raw?.name || raw?.company || raw?.symbol || ""),
    sector: String(raw?.sector || "—"),
    lastPrice: last,
    change,
    changePercent: num(raw?.change_pct ?? raw?.changePercent),
    volume: num(raw?.volume),
    marketCap: num(raw?.market_cap),
    open: num(raw?.open),
    high: num(raw?.high),
    low: num(raw?.low),
    previousClose: last - change,
    vwap: raw?.vwap !== undefined ? num(raw?.vwap) : undefined,
    trades: raw?.trades !== undefined ? num(raw?.trades) : undefined,
    asOf: raw?.date,
  };
}

function mapAnnouncement(raw: any): Announcement {
  const category = String(raw?.category || raw?.type || "General");
  const title = String(raw?.title || "Announcement");
  return {
    id: String(raw?.id || raw?.ann_id || raw?.notification_id || title),
    symbol: String(raw?.symbol || ""),
    company: String(raw?.company || raw?.companyName || raw?.symbol || ""),
    title,
    category,
    date: String(raw?.date || raw?.publishedAt || raw?.created_at || new Date().toISOString()),
    preview: String(raw?.preview || raw?.message || raw?.content || title),
    important: Boolean(raw?.is_important || raw?.important || String(raw?.importance || "").toLowerCase() === "high"),
    importance: raw?.importance,
    status: raw?.review_status || raw?.status,
    url: raw?.url,
    reviewNotes: raw?.review_notes,
    tags: Array.isArray(raw?.tags) ? raw.tags : [],
  };
}

function mapCorporateAction(raw: any): CorporateAction {
  return {
    id: String(raw?.action_id || raw?.id || ""),
    symbol: String(raw?.symbol || ""),
    exDate: String(raw?.ex_date || raw?.exDate || ""),
    actionType: String(raw?.action_type || raw?.actionType || "corporate_action"),
    amount: raw?.amount !== undefined ? num(raw?.amount) : undefined,
    ratioNumerator: raw?.ratio_numerator !== undefined ? num(raw?.ratio_numerator) : undefined,
    ratioDenominator: raw?.ratio_denominator !== undefined ? num(raw?.ratio_denominator) : undefined,
    description: raw?.description || undefined,
    source: raw?.source || undefined,
  };
}

function mapStockResources(raw: any): StockResources {
  const mapLink = (item: any) => ({
    id: String(item?.id || item?.title || item?.url || ""),
    title: String(item?.title || "Document"),
    date: item?.date ? String(item.date) : undefined,
    url: item?.url ? String(item.url) : undefined,
    category: item?.category ? String(item.category) : undefined,
    reportType: item?.report_type ? String(item.report_type) : undefined,
  });
  return {
    symbol: String(raw?.symbol || ""),
    officialProfileUrl: String(raw?.official_profile_url || ""),
    officialAnnouncements: Array.isArray(raw?.official_announcements) ? raw.official_announcements.map(mapLink) : [],
    annualReports: Array.isArray(raw?.annual_reports) ? raw.annual_reports.map(mapLink) : [],
    quarterlyReports: Array.isArray(raw?.quarterly_reports) ? raw.quarterly_reports.map(mapLink) : [],
    corporateDocuments: Array.isArray(raw?.corporate_documents) ? raw.corporate_documents.map(mapLink) : [],
  };
}

function mapPortfolioAccount(raw: any): PortfolioAccount {
  return {
    portfolioId: String(raw?.portfolio_id || raw?.portfolioId || ""),
    name: String(raw?.name || "Portfolio"),
    description: raw?.description || undefined,
    currency: raw?.currency || "LKR",
    isDefault: Boolean(raw?.is_default ?? raw?.isDefault),
    isArchived: Boolean(raw?.is_archived ?? raw?.isArchived),
    summary: raw?.summary ? mapPortfolioSummary(raw.summary) : undefined,
  };
}

function mapPortfolioCashMovement(raw: any): PortfolioCashMovement {
  return {
    id: String(raw?.cash_id || raw?.id || ""),
    portfolioId: String(raw?.portfolio_id || raw?.portfolioId || ""),
    movementType: String(raw?.movement_type || raw?.movementType || "deposit").toLowerCase() === "withdrawal" ? "withdrawal" : "deposit",
    amount: num(raw?.amount),
    movementDate: raw?.movement_date || raw?.movementDate,
    notes: raw?.notes || undefined,
    createdAt: raw?.created_at || raw?.createdAt,
  };
}

function mapPortfolioTransaction(raw: any): PortfolioTransaction {
  return {
    id: String(raw?.tx_id || raw?.id || ""),
    symbol: String(raw?.symbol || ""),
    type: String(raw?.tx_type || raw?.type || "buy").toLowerCase() === "sell" ? "sell" : "buy",
    quantity: num(raw?.quantity),
    price: num(raw?.price),
    fees: num(raw?.fees),
    tradedAt: raw?.traded_at || raw?.tradedAt,
    notes: raw?.notes || undefined,
    createdAt: raw?.created_at || raw?.createdAt,
  };
}

function mapPortfolioPosition(raw: any): PortfolioPosition {
  return {
    symbol: String(raw?.symbol || ""),
    company: String(raw?.company || raw?.name || raw?.symbol || ""),
    sector: raw?.sector || undefined,
    quantity: num(raw?.quantity),
    avgCost: num(raw?.avg_cost ?? raw?.avgCost),
    costBasis: num(raw?.cost_basis ?? raw?.costBasis),
    currentPrice: num(raw?.current_price ?? raw?.currentPrice),
    marketValue: num(raw?.market_value ?? raw?.marketValue),
    unrealizedPl: num(raw?.unrealized_pl ?? raw?.unrealizedPl),
    unrealizedPlPct: num(raw?.unrealized_pl_pct ?? raw?.unrealizedPlPct),
    realizedPl: num(raw?.realized_pl ?? raw?.realizedPl),
    dividendIncome: raw?.dividend_income !== undefined ? num(raw?.dividend_income) : undefined,
    weightPct: num(raw?.weight_pct ?? raw?.weightPct),
  };
}

function mapPortfolioSummary(raw: any): PortfolioSummary {
  return {
    portfolioId: raw?.portfolio_id || raw?.portfolioId,
    portfolioName: raw?.portfolio_name || raw?.portfolioName,
    cashBalance: raw?.cash_balance !== undefined ? num(raw?.cash_balance) : undefined,
    cashDeposits: raw?.cash_deposits !== undefined ? num(raw?.cash_deposits) : undefined,
    cashWithdrawals: raw?.cash_withdrawals !== undefined ? num(raw?.cash_withdrawals) : undefined,
    netContributions: raw?.net_contributions !== undefined ? num(raw?.net_contributions) : undefined,
    totalEquity: raw?.total_equity !== undefined ? num(raw?.total_equity) : undefined,
    positionsCount: num(raw?.positions_count ?? raw?.positionsCount),
    transactionsCount: num(raw?.transactions_count ?? raw?.transactionsCount),
    cashMovementsCount: raw?.cash_movements_count !== undefined ? num(raw?.cash_movements_count) : undefined,
    costBasis: num(raw?.cost_basis ?? raw?.costBasis),
    marketValue: num(raw?.market_value ?? raw?.marketValue),
    unrealizedPl: num(raw?.unrealized_pl ?? raw?.unrealizedPl),
    unrealizedPlPct: num(raw?.unrealized_pl_pct ?? raw?.unrealizedPlPct),
    realizedPl: num(raw?.realized_pl ?? raw?.realizedPl),
    dividendIncome: raw?.dividend_income !== undefined ? num(raw?.dividend_income) : undefined,
    totalPl: num(raw?.total_pl ?? raw?.totalPl),
    totalReturn: raw?.total_return !== undefined ? num(raw?.total_return) : undefined,
    returnPct: raw?.return_pct !== undefined ? num(raw?.return_pct) : undefined,
  };
}

function mapPortfolioData(raw: any): PortfolioData {
  return {
    portfolio: raw?.portfolio ? mapPortfolioAccount(raw.portfolio) : undefined,
    summary: mapPortfolioSummary(raw?.summary || {}),
    positions: Array.isArray(raw?.positions) ? raw.positions.map(mapPortfolioPosition) : [],
    transactions: Array.isArray(raw?.transactions) ? raw.transactions.map(mapPortfolioTransaction) : [],
    cashMovements: Array.isArray(raw?.cash_movements) ? raw.cash_movements.map(mapPortfolioCashMovement) : [],
    recentActions: Array.isArray(raw?.recent_actions) ? raw.recent_actions.map(mapCorporateAction) : [],
  };
}

function mapPortfolioPerformancePoint(raw: any): PortfolioPerformancePoint {
  return {
    date: String(raw?.date || ""),
    marketValue: num(raw?.market_value ?? raw?.marketValue),
    cashBalance: raw?.cash_balance !== undefined ? num(raw?.cash_balance ?? raw?.cashBalance) : undefined,
    totalEquity: raw?.total_equity !== undefined ? num(raw?.total_equity ?? raw?.totalEquity) : undefined,
    netContributions: raw?.net_contributions !== undefined ? num(raw?.net_contributions ?? raw?.netContributions) : undefined,
    costBasis: num(raw?.cost_basis ?? raw?.costBasis),
    realizedPl: num(raw?.realized_pl ?? raw?.realizedPl),
    unrealizedPl: num(raw?.unrealized_pl ?? raw?.unrealizedPl),
    dividendIncome: raw?.dividend_income !== undefined ? num(raw?.dividend_income) : undefined,
    totalPl: num(raw?.total_pl ?? raw?.totalPl),
    totalReturn: raw?.total_return !== undefined ? num(raw?.total_return) : undefined,
    returnPct: raw?.return_pct !== undefined ? num(raw?.return_pct) : undefined,
  };
}

function mapHoldingAttention(item: any) {
  return {
    symbol: String(item?.symbol || ""),
    company: String(item?.company || item?.symbol || ""),
    sector: item?.sector || undefined,
    status: String(item?.status || "watch") as any,
    statusLabel: String(item?.status_label || item?.statusLabel || "Watch"),
    severity: String(item?.severity || "medium"),
    fitScore: num(item?.fit_score ?? item?.fitScore),
    riskScore: num(item?.risk_score ?? item?.riskScore),
    weightPct: num(item?.weight_pct ?? item?.weightPct),
    sectorWeightPct: num(item?.sector_weight_pct ?? item?.sectorWeightPct),
    volatilityPct: num(item?.volatility_pct ?? item?.volatilityPct),
    drawdownPct: num(item?.drawdown_pct ?? item?.drawdownPct),
    sentimentScore30d: num(item?.sentiment_score_30d ?? item?.sentimentScore30d),
    negativeSentimentCount: num(item?.negative_sentiment_count ?? item?.negativeSentimentCount),
    reasons: Array.isArray(item?.reasons) ? item.reasons.map(String) : [],
    suggestions: Array.isArray(item?.suggestions) ? item.suggestions.map(String) : [],
  };
}

function mapCashManagement(raw: any) {
  return {
    label: String(raw?.label || "healthy_cash"),
    score: num(raw?.score),
    cashBalance: num(raw?.cash_balance ?? raw?.cashBalance),
    cashPct: num(raw?.cash_pct ?? raw?.cashPct),
    targetMinPct: num(raw?.target_min_pct ?? raw?.targetMinPct),
    targetMaxPct: num(raw?.target_max_pct ?? raw?.targetMaxPct),
    recommendedMinCash: num(raw?.recommended_min_cash ?? raw?.recommendedMinCash),
    recommendedMaxCash: num(raw?.recommended_max_cash ?? raw?.recommendedMaxCash),
    reasons: Array.isArray(raw?.reasons) ? raw.reasons.map(String) : [],
    suggestions: Array.isArray(raw?.suggestions) ? raw.suggestions.map(String) : [],
  };
}

function mapPortfolioIntelligence(raw: any): PortfolioIntelligence {
  return {
    portfolioId: String(raw?.portfolio_id || raw?.portfolioId || ""),
    health: {
      score: num(raw?.health?.score),
      label: String(raw?.health?.label || "Healthy"),
      attentionCount: num(raw?.health?.attention_count ?? raw?.health?.attentionCount),
      watchCount: num(raw?.health?.watch_count ?? raw?.health?.watchCount),
    },
    cashManagement: mapCashManagement(raw?.cash_management || raw?.cashManagement || {}),
    holdings: Array.isArray(raw?.holdings) ? raw.holdings.map(mapHoldingAttention) : [],
    attentionItems: Array.isArray(raw?.attention_items) ? raw.attention_items.map(mapHoldingAttention) : [],
    suggestions: Array.isArray(raw?.suggestions) ? raw.suggestions.map(String) : [],
    thresholds: raw?.thresholds || {},
  };
}

function mapTradeFitPreview(raw: any): TradeFitPreview {
  return {
    portfolioId: String(raw?.portfolio_id || raw?.portfolioId || ""),
    symbol: String(raw?.symbol || ""),
    txType: String(raw?.tx_type || raw?.txType || "buy") as any,
    tradeValue: num(raw?.trade_value ?? raw?.tradeValue),
    cashBefore: num(raw?.cash_before ?? raw?.cashBefore),
    cashAfter: num(raw?.cash_after ?? raw?.cashAfter),
    currentStockWeightPct: num(raw?.current_stock_weight_pct ?? raw?.currentStockWeightPct),
    newStockWeightPct: num(raw?.new_stock_weight_pct ?? raw?.newStockWeightPct),
    newSectorWeightPct: num(raw?.new_sector_weight_pct ?? raw?.newSectorWeightPct),
    status: String(raw?.status || "watch") as any,
    statusLabel: String(raw?.status_label || raw?.statusLabel || "Watch"),
    fitScore: num(raw?.fit_score ?? raw?.fitScore),
    riskScore: num(raw?.risk_score ?? raw?.riskScore),
    reasons: Array.isArray(raw?.reasons) ? raw.reasons.map(String) : [],
    suggestions: Array.isArray(raw?.suggestions) ? raw.suggestions.map(String) : [],
    cashManagement: mapCashManagement(raw?.cash_management || raw?.cashManagement || {}),
  };
}

function mapPortfolioAnalytics(raw: any): PortfolioAnalytics {
  return {
    days: num(raw?.days),
    sectorAllocation: Array.isArray(raw?.sector_allocation)
      ? raw.sector_allocation.map((item: any) => ({
          sector: String(item?.sector || "Unclassified"),
          marketValue: num(item?.market_value ?? item?.marketValue),
          positionsCount: num(item?.positions_count ?? item?.positionsCount),
          weightPct: num(item?.weight_pct ?? item?.weightPct),
        }))
      : [],
    topGainers: Array.isArray(raw?.top_gainers)
      ? raw.top_gainers.map((item: any) => ({
          symbol: String(item?.symbol || ""),
          company: String(item?.company || item?.symbol || ""),
          sector: item?.sector || undefined,
          marketValue: num(item?.market_value ?? item?.marketValue),
          returnPct: num(item?.return_pct ?? item?.returnPct),
          profit: num(item?.profit),
        }))
      : [],
    topLosers: Array.isArray(raw?.top_losers)
      ? raw.top_losers.map((item: any) => ({
          symbol: String(item?.symbol || ""),
          company: String(item?.company || item?.symbol || ""),
          sector: item?.sector || undefined,
          marketValue: num(item?.market_value ?? item?.marketValue),
          returnPct: num(item?.return_pct ?? item?.returnPct),
          profit: num(item?.profit),
        }))
      : [],
    diversification: {
      score: num(raw?.diversification?.score),
      label: String(raw?.diversification?.label || "Balanced"),
      effectiveHoldings: num(raw?.diversification?.effective_holdings ?? raw?.diversification?.effectiveHoldings),
      sectorCount: num(raw?.diversification?.sector_count ?? raw?.diversification?.sectorCount),
      largestPositionPct: num(raw?.diversification?.largest_position_pct ?? raw?.diversification?.largestPositionPct),
    },
    performanceBreakdown: {
      realizedPl: num(raw?.performance_breakdown?.realized_pl ?? raw?.performanceBreakdown?.realizedPl),
      unrealizedPl: num(raw?.performance_breakdown?.unrealized_pl ?? raw?.performanceBreakdown?.unrealizedPl),
      dividendIncome: num(raw?.performance_breakdown?.dividend_income ?? raw?.performanceBreakdown?.dividendIncome),
      totalReturn: num(raw?.performance_breakdown?.total_return ?? raw?.performanceBreakdown?.totalReturn),
      realizedSharePct: num(raw?.performance_breakdown?.realized_share_pct ?? raw?.performanceBreakdown?.realizedSharePct),
      unrealizedSharePct: num(raw?.performance_breakdown?.unrealized_share_pct ?? raw?.performanceBreakdown?.unrealizedSharePct),
      dividendSharePct: num(raw?.performance_breakdown?.dividend_share_pct ?? raw?.performanceBreakdown?.dividendSharePct),
    },
    dividendSummary: {
      totalIncome: num(raw?.dividend_summary?.total_income ?? raw?.dividendSummary?.totalIncome),
      yieldOnCostPct: num(raw?.dividend_summary?.yield_on_cost_pct ?? raw?.dividendSummary?.yieldOnCostPct),
      payingPositionsCount: num(raw?.dividend_summary?.paying_positions_count ?? raw?.dividendSummary?.payingPositionsCount),
      topPositions: Array.isArray(raw?.dividend_summary?.top_positions)
        ? raw.dividend_summary.top_positions.map((item: any) => ({
            symbol: String(item?.symbol || ""),
            company: String(item?.company || item?.symbol || ""),
            dividendIncome: num(item?.dividend_income ?? item?.dividendIncome),
            yieldOnPositionCostPct: num(item?.yield_on_position_cost_pct ?? item?.yieldOnPositionCostPct),
          }))
        : [],
    },
    risk: {
      score: num(raw?.risk?.score),
      label: String(raw?.risk?.label || "Moderate"),
      annualizedVolatilityPct: num(raw?.risk?.annualized_volatility_pct ?? raw?.risk?.annualizedVolatilityPct),
      weightedBeta: num(raw?.risk?.weighted_beta ?? raw?.risk?.weightedBeta, 1),
      largestPositionPct: num(raw?.risk?.largest_position_pct ?? raw?.risk?.largestPositionPct),
      largestSectorPct: num(raw?.risk?.largest_sector_pct ?? raw?.risk?.largestSectorPct),
    },
    benchmark: {
      periodDays: num(raw?.benchmark?.period_days ?? raw?.benchmark?.periodDays),
      portfolioReturnPct: num(raw?.benchmark?.portfolio_return_pct ?? raw?.benchmark?.portfolioReturnPct),
      aspiReturnPct: num(raw?.benchmark?.aspi_return_pct ?? raw?.benchmark?.aspiReturnPct),
      sp20ReturnPct: num(raw?.benchmark?.sp20_return_pct ?? raw?.benchmark?.sp20ReturnPct),
      alphaVsAspiPct: num(raw?.benchmark?.alpha_vs_aspi_pct ?? raw?.benchmark?.alphaVsAspiPct),
      alphaVsSp20Pct: num(raw?.benchmark?.alpha_vs_sp20_pct ?? raw?.benchmark?.alphaVsSp20Pct),
      series: Array.isArray(raw?.benchmark?.series)
        ? raw.benchmark.series.map((item: any) => ({
            date: String(item?.date || ""),
            portfolio: item?.portfolio !== undefined ? num(item?.portfolio) : undefined,
            aspi: item?.aspi !== undefined ? num(item?.aspi) : undefined,
            sp20: item?.sp20 !== undefined ? num(item?.sp20) : undefined,
          }))
        : [],
    },
  };
}

function mapAlert(raw: any, currentPrice = 0): Alert {
  const type = String(raw?.alert_type || raw?.condition || "above_price").toLowerCase() as Alert["alertType"];
  let condition: Alert["condition"] = "above";
  if (type === "below_price") condition = "below";
  else if (type === "pct_move") condition = "pct_move";
  else if (type === "volume_spike") condition = "volume_spike";
  else if (type === "important_announcement") condition = "important_announcement";
  const meta = raw?.meta || {};

  return {
    id: String(raw?.alert_id || raw?.id || ""),
    username: raw?.username,
    symbol: String(raw?.symbol || ""),
    companyName: String(raw?.companyName || raw?.symbol || (type === "important_announcement" ? "Watchlist / announcements" : "Unknown Company")),
    alertType: type,
    condition,
    targetPrice: num(raw?.target_value ?? raw?.targetPrice),
    currentPrice,
    enabled: Boolean(raw?.is_enabled ?? raw?.enabled ?? true),
    createdAt: String(raw?.created_at || raw?.createdAt || ""),
    triggered: Boolean(raw?.is_triggered ?? raw?.triggered),
    triggeredAt: raw?.last_triggered_at || raw?.triggeredAt,
    recurring: Boolean(meta?.recurring),
    cooldownMinutes: num(meta?.cooldown_minutes, 1440),
  };
}

function mapNotification(raw: any): Notification {
  return {
    id: String(raw?.notification_id || raw?.id || ""),
    type: String(raw?.category || raw?.type || "system"),
    title: String(raw?.title || "Notification"),
    message: String(raw?.message || ""),
    priority: String(raw?.severity || raw?.priority || "info"),
    isRead: Boolean(raw?.is_read ?? raw?.isRead),
    createdAt: String(raw?.created_at || raw?.createdAt || ""),
    symbol: raw?.symbol,
    link: raw?.link,
  };
}

function mapModel(raw: any): Model {
  const meta = raw?.meta || {};
  const metrics = meta?.metrics_holdout || {};
  const accuracy =
    typeof metrics?.auc_up === "number"
      ? metrics.auc_up
      : typeof metrics?.direction_accuracy === "number"
      ? metrics.direction_accuracy
      : undefined;
  return {
    id: String(raw?.model_id || raw?.id || ""),
    name: String(raw?.model_id || raw?.name || "Model"),
    status: raw?.is_active ? "active" : "inactive",
    accuracy,
    createdAt: raw?.created_at || meta?.trained_at_utc,
    isActive: Boolean(raw?.is_active),
    meta,
    path: raw?.path,
  };
}

function mapJob(raw: any): Job {
  const rawStatus = String(raw?.status || "unknown").toLowerCase();
  return {
    id: String(raw?.run_id || raw?.id || ""),
    name: String(raw?.job_name || raw?.name || raw?.type || "Job"),
    type: String(raw?.job_name || raw?.type || "job"),
    status: rawStatus === "ok" ? "completed" : rawStatus,
    startedAt: raw?.started_at,
    completedAt: raw?.finished_at,
    details: raw?.details,
  };
}

function mapAdminUser(raw: any): AdminUser {
  return {
    username: String(raw?.username || ""),
    email: String(raw?.email || ""),
    name: String(raw?.display_name || raw?.name || raw?.username || "User"),
    role: normalizeRole(raw?.role),
    createdAt: raw?.created_at,
    lastLogin: raw?.last_login_at,
    status: "active",
  };
}

function mapCalendarEvent(raw: any): EventCalendar {
  const mapItem = (item: any) => ({
    date: String(item?.date || ""),
    symbol: String(item?.symbol || ""),
    title: String(item?.title || ""),
    eventType: String(item?.event_type || item?.eventType || "event"),
    sourceType: String(item?.source_type || item?.sourceType || "system"),
    daysFromNow: num(item?.days_from_now ?? item?.daysFromNow),
    status: String(item?.status || "past"),
    meta: item?.meta || {},
  });
  return {
    symbols: Array.isArray(raw?.symbols) ? raw.symbols.map(String) : [],
    upcoming: Array.isArray(raw?.upcoming) ? raw.upcoming.map(mapItem) : [],
    recent: Array.isArray(raw?.recent) ? raw.recent.map(mapItem) : [],
    count: num(raw?.count),
  };
}

function mapAuditLog(raw: any): AuditLog {
  return {
    auditId: String(raw?.audit_id || raw?.auditId || ''),
    username: raw?.username || undefined,
    role: raw?.role || undefined,
    action: String(raw?.action || ''),
    targetType: raw?.target_type || raw?.targetType,
    targetId: raw?.target_id || raw?.targetId,
    status: raw?.status || undefined,
    ipAddress: raw?.ip_address || raw?.ipAddress,
    details: raw?.details || {},
    createdAt: raw?.created_at || raw?.createdAt,
  };
}

function mapSentimentSummary(raw: any): SentimentSummary {
  return {
    symbol: String(raw?.symbol || ""),
    available: Boolean(raw?.available),
    latestLabel: String(raw?.latest_label || raw?.latestLabel || "neutral"),
    latestScore: num(raw?.latest_score ?? raw?.latestScore),
    latestEventType: raw?.latest_event_type || raw?.latestEventType,
    trend: String(raw?.trend || "flat"),
    score7d: num(raw?.score_7d ?? raw?.score7d),
    score30d: num(raw?.score_30d ?? raw?.score30d),
    impact30d: num(raw?.impact_30d ?? raw?.impact30d),
    documents30d: num(raw?.documents_30d ?? raw?.documents30d),
    items: Array.isArray(raw?.items)
      ? raw.items.map((item: any) => ({
          itemId: String(item?.item_id || item?.itemId || item?.ann_id || item?.id || ""),
          annId: item?.ann_id || item?.annId,
          symbol: item?.symbol,
          date: String(item?.date || ""),
          title: String(item?.title || "Announcement"),
          sourceUrl: item?.source_url || item?.sourceUrl,
          sentimentScore: num(item?.sentiment_score ?? item?.sentimentScore),
          sentimentLabel: String(item?.sentiment_label || item?.sentimentLabel || "neutral") as any,
          impactScore: num(item?.impact_score ?? item?.impactScore),
          eventType: String(item?.event_type || item?.eventType || "general"),
          confidence: num(item?.confidence),
          keywords: Array.isArray(item?.keywords) ? item.keywords.map(String) : [],
        }))
      : [],
    eventBreakdown: Array.isArray(raw?.event_breakdown)
      ? raw.event_breakdown.map((item: any) => ({ eventType: String(item?.event_type || item?.eventType || "general"), count: num(item?.count) }))
      : [],
    timeline: Array.isArray(raw?.timeline)
      ? raw.timeline.map((item: any) => ({ date: String(item?.date || ""), score: num(item?.score), impact: num(item?.impact), count: num(item?.count) }))
      : [],
  };
}

function mapDocumentIntelligence(item: any) {
  return {
    docId: String(item?.doc_id || item?.docId || ""),
    annId: item?.ann_id || item?.annId,
    symbol: item?.symbol,
    date: item?.date,
    title: String(item?.title || "Document"),
    documentUrl: item?.document_url || item?.documentUrl,
    documentType: item?.document_type || item?.documentType,
    summary: item?.summary,
    pagesAnalyzed: num(item?.pages_analyzed ?? item?.pagesAnalyzed),
    sentimentScore: num(item?.sentiment_score ?? item?.sentimentScore),
    sentimentLabel: item?.sentiment_label || item?.sentimentLabel,
    impactScore: num(item?.impact_score ?? item?.impactScore),
    eventType: item?.event_type || item?.eventType,
    confidence: num(item?.confidence),
    keywords: Array.isArray(item?.keywords) ? item.keywords.map(String) : [],
  };
}

function mapExternalNewsItem(item: any) {
  return {
    itemId: String(item?.item_id || item?.itemId || ""),
    sourceName: String(item?.source_name || item?.sourceName || ""),
    sourceDomain: String(item?.source_domain || item?.sourceDomain || ""),
    url: String(item?.url || ""),
    title: String(item?.title || "News"),
    publishedDate: item?.published_date || item?.publishedDate,
    scope: item?.scope,
    symbol: item?.symbol,
    companyName: item?.company_name || item?.companyName,
    sentimentScore: num(item?.sentiment_score ?? item?.sentimentScore),
    sentimentLabel: item?.sentiment_label || item?.sentimentLabel,
    impactScore: num(item?.impact_score ?? item?.impactScore),
    eventType: item?.event_type || item?.eventType,
    confidence: num(item?.confidence),
    keywords: Array.isArray(item?.keywords) ? item.keywords.map(String) : [],
  };
}

function mapPrediction(raw: any, currentPrice = 0): PredictionCardData {
  if (!raw?.available) {
    return {
      predictedPrice: currentPrice,
      currentPrice,
      predictedReturn: 0,
      upProbability: 0.5,
      signal: "neutral",
      confidence: 0,
      expectedRange: { low: currentPrice, high: currentPrice },
      topFeatures: [],
      lastUpdated: "—",
      error: String(raw?.reason || "Prediction unavailable"),
    };
  }

  const band = raw?.price_band || raw?.band || {};
  const features = Array.isArray(raw?.top_features)
    ? raw.top_features.map((item: any) => ({
        feature: String(item?.feature || item?.name || "Feature"),
        importance: Math.min(1, Math.max(0, num(item?.importance, 0))),
      }))
    : [
        { feature: "Price momentum", importance: 0.78 },
        { feature: "Volume trend", importance: 0.62 },
        { feature: "Market regime", importance: 0.48 },
      ];

  const upProbability = num(raw?.up_probability, 0.5);
  const confidenceScore = typeof raw?.confidence === "number"
    ? raw.confidence
    : typeof raw?.confidence?.score === "number"
    ? raw.confidence.score
    : 0.5;

  return {
    predictedPrice: num(raw?.predicted_price, currentPrice),
    currentPrice,
    predictedReturn: num(raw?.predicted_return) * 100,
    upProbability,
    signal: raw?.signal === "bullish" || raw?.signal === "bearish" ? raw.signal : "neutral",
    confidence: confidenceScore,
    expectedRange: {
      low: num(band?.p10, currentPrice),
      high: num(band?.p90, currentPrice),
    },
    topFeatures: features,
    lastUpdated: raw?.as_of || raw?.created_at || formatRelativeTime(new Date().toISOString()),
    explanation: raw?.explanation
      ? {
          direction: String(raw.explanation.direction || "uncertain"),
          summary: String(raw.explanation.summary || ""),
          reasons: Array.isArray(raw.explanation.reasons)
            ? raw.explanation.reasons.map((item: any) => ({
                feature: String(item?.feature || ""),
                group: String(item?.group || "Model feature"),
                direction: String(item?.direction || "neutral"),
                impact: num(item?.impact),
                text: String(item?.text || ""),
              }))
            : [],
        }
      : undefined,
  };
}

async function getOptionalCurrentUser(): Promise<User | null> {
  try {
    return await authApi.me();
  } catch {
    return null;
  }
}

async function getPriceMap(symbols: string[]): Promise<Record<string, Stock>> {
  if (symbols.length === 0) return {};
  const rows = await marketApi.getStocks(Math.max(symbols.length, 50));
  return rows.reduce<Record<string, Stock>>((acc, item) => {
    acc[item.symbol] = item;
    return acc;
  }, {});
}

export const authApi = {
  login: async (data: LoginRequest): Promise<AuthResponse> => {
    const response = await api.post<any>("/api/auth/login", data);
    return {
      user: mapUser(response.user),
      expiresAt: response.expires_at,
    };
  },

  register: async (data: RegisterRequest): Promise<AuthResponse> => {
    const response = await api.post<any>("/api/auth/register", {
      email: data.email,
      password: data.password,
      name: data.name,
      display_name: data.name,
    });
    await authApi.login({ email: data.email, password: data.password });
    return { user: mapUser(response.user) };
  },

  logout: () => api.post<void>("/api/auth/logout"),

  me: async (): Promise<User> => {
    const response = await api.get<any>("/api/auth/me");
    if (!response?.authenticated || !response?.user) {
      throw new Error("Not authenticated");
    }
    return mapUser(response.user);
  },

  updateProfile: async (payload: { display_name?: string; email?: string }) => {
    const response = await api.post<any>("/api/profile", payload);
    return mapUser(response.user);
  },

  changePassword: async (currentPassword: string, newPassword: string) =>
    api.post<any>("/api/auth/change-password", {
      current_password: currentPassword,
      new_password: newPassword,
    }),

  forgotPassword: (email: string) => api.post<any>("/api/auth/forgot-password", { email }),

  resetPassword: (token: string, newPassword: string) =>
    api.post<any>("/api/auth/reset-password", { token, new_password: newPassword }),
};

export const marketApi = {
  getOverview: async (): Promise<MarketOverview> => {
    const [overviewRaw, indicesRaw] = await Promise.all([
      api.get<any>("/api/market/overview"),
      api.get<any>("/api/indices"),
    ]);

    const aspiSeries = Array.isArray(indicesRaw?.ASPI) ? indicesRaw.ASPI : [];
    const sp20Series = Array.isArray(indicesRaw?.SP_SL20 || indicesRaw?.SP20 || indicesRaw?.["S&P SL20"]) 
      ? (indicesRaw.SP_SL20 || indicesRaw.SP20 || indicesRaw["S&P SL20"])
      : [];

    const aspiLast = aspiSeries.at(-1) || { value: 0 };
    const aspiPrev = aspiSeries.at(-2) || aspiLast;
    const sp20Last = sp20Series.at(-1) || { value: 0 };
    const sp20Prev = sp20Series.at(-2) || sp20Last;

    const aspiChange = num(aspiLast.value) - num(aspiPrev.value);
    const sp20Change = num(sp20Last.value) - num(sp20Prev.value);

    return {
      marketStatus: String(overviewRaw?.status || "CLOSED").toLowerCase(),
      lastUpdated: String(overviewRaw?.as_of || new Date().toISOString()),
      turnover: num(overviewRaw?.turnover_lkr),
      trades: num(overviewRaw?.trades),
      marketCap: num(overviewRaw?.market_cap_lkr),
      aspi: {
        value: num(aspiLast.value),
        change: aspiChange,
        changePercent: num(aspiPrev.value) ? (aspiChange / num(aspiPrev.value)) * 100 : 0,
        series: aspiSeries.map((item: any) => ({ date: item.date, value: num(item.value) })),
      },
      sp20: {
        value: num(sp20Last.value),
        change: sp20Change,
        changePercent: num(sp20Prev.value) ? (sp20Change / num(sp20Prev.value)) * 100 : 0,
        series: sp20Series.map((item: any) => ({ date: item.date, value: num(item.value) })),
      },
      topGainers: Array.isArray(overviewRaw?.top_gainers) ? overviewRaw.top_gainers.map(mapStock) : [],
      topLosers: Array.isArray(overviewRaw?.top_losers) ? overviewRaw.top_losers.map(mapStock) : [],
      mostActive: Array.isArray(overviewRaw?.most_active) ? overviewRaw.most_active.map(mapStock) : [],
    };
  },

  getStocks: async (limit = 200): Promise<Stock[]> => {
    const response = await api.get<any>(`/api/stocks?limit=${limit}`);
    const rows = Array.isArray(response?.stocks) ? response.stocks : [];
    return rows.map(mapStock);
  },

  searchCompanies: async (query: string): Promise<Stock[]> => {
    const response = await api.get<any>(`/api/companies/search?q=${encodeURIComponent(query)}`);
    const rows = Array.isArray(response?.results) ? response.results : [];
    return rows.map(mapStock);
  },

  getStock: async (symbol: string): Promise<Stock> => {
    const response = await api.get<any>(`/api/stock/${encodeURIComponent(symbol)}`);
    return mapStock(response);
  },

  getStockHistory: async (symbol: string, days = 180): Promise<HistoricalDataPoint[]> => {
    const safeDays = Math.max(20, days);
    const response = await api.get<any>(`/api/stock/${encodeURIComponent(symbol)}/history?days=${safeDays}`);
    const rows = Array.isArray(response?.history) ? response.history : [];
    return rows.map((item: any) => ({
      date: item.date,
      open: num(item.open),
      high: num(item.high),
      low: num(item.low),
      close: num(item.close),
      volume: num(item.volume),
    }));
  },

  getStockResources: async (symbol: string): Promise<StockResources> => {
    const response = await api.get<any>(`/api/stocks/${encodeURIComponent(symbol)}/resources`);
    return mapStockResources(response);
  },

  getStockPrediction: async (symbol: string, currentPrice = 0): Promise<PredictionCardData> => {
    const response = await api.get<any>(`/api/stock/${encodeURIComponent(symbol)}/prediction`);
    return mapPrediction(response, currentPrice);
  },

  getStockSentiment: async (symbol: string, days = 90): Promise<SentimentSummary> => {
    const response = await api.get<any>(`/api/stocks/${encodeURIComponent(symbol)}/sentiment?days=${encodeURIComponent(String(days))}`);
    return mapSentimentSummary(response);
  },

  getStockDocuments: async (symbol: string, limit = 50): Promise<StockDocuments> => {
    const response = await api.get<any>(`/api/stocks/${encodeURIComponent(symbol)}/documents?limit=${encodeURIComponent(String(limit))}`);
    return { symbol: String(response?.symbol || symbol), count: num(response?.count), documents: Array.isArray(response?.documents) ? response.documents.map(mapDocumentIntelligence) : [] };
  },

  getStockNews: async (symbol: string, limit = 40): Promise<StockNews> => {
    const response = await api.get<any>(`/api/stocks/${encodeURIComponent(symbol)}/news?limit=${encodeURIComponent(String(limit))}`);
    return { symbol: String(response?.symbol || symbol), linkedNews: Array.isArray(response?.linked_news) ? response.linked_news.map(mapExternalNewsItem) : [], marketContext: Array.isArray(response?.market_context) ? response.market_context.map(mapExternalNewsItem) : [] };
  },

  getCalendar: async (params?: { symbol?: string; portfolioId?: string; days?: number }): Promise<EventCalendar> => {
    const query = new URLSearchParams();
    if (params?.symbol) query.set('symbol', params.symbol);
    if (params?.portfolioId) query.set('portfolio_id', params.portfolioId);
    if (params?.days) query.set('days', String(params.days));
    const response = await api.get<any>(`/api/calendar/events${query.toString() ? `?${query.toString()}` : ''}`);
    return mapCalendarEvent(response);
  },
};

export const screenerApi = {
  filter: async (filters: Record<string, any>) => {
    const stocks = await marketApi.getStocks(500);
    const results = stocks.filter((stock) => {
      if (filters.minPrice && stock.lastPrice < Number(filters.minPrice)) return false;
      if (filters.maxPrice && stock.lastPrice > Number(filters.maxPrice)) return false;
      if (filters.minVolume && stock.volume < Number(filters.minVolume)) return false;
      if (filters.minMarketCap && num(stock.marketCap) < Number(filters.minMarketCap)) return false;
      if (filters.maxMarketCap && num(stock.marketCap) > Number(filters.maxMarketCap)) return false;
      if (Array.isArray(filters.sectors) && filters.sectors.length > 0 && !filters.sectors.includes(stock.sector)) return false;
      if (filters.minChangePercent && stock.changePercent < Number(filters.minChangePercent)) return false;
      if (filters.maxChangePercent && stock.changePercent > Number(filters.maxChangePercent)) return false;
      return true;
    });
    return { stocks: results, total: results.length };
  },
};

export const announcementsApi = {
  getAll: async (params?: { limit?: number; category?: string; symbol?: string; importantOnly?: boolean }) => {
    const search = new URLSearchParams();
    if (params?.limit) search.set("limit", String(params.limit));
    if (params?.category && params.category !== "All Categories") search.set("category", params.category);
    if (params?.symbol) search.set("symbol", params.symbol);
    if (params?.importantOnly) search.set("important_only", "true");
    const response = await api.get<any>(`/api/announcements${search.toString() ? `?${search.toString()}` : ""}`);
    const rows = Array.isArray(response?.announcements) ? response.announcements : [];
    return rows.map(mapAnnouncement);
  },
};

export const watchlistApi = {
  get: async (): Promise<Watchlist> => {
    const response = await api.get<any>("/api/watchlist");
    return {
      symbols: Array.isArray(response?.symbols) ? response.symbols : [],
      items: Array.isArray(response?.items) ? response.items.map(mapStock) : [],
    };
  },

  add: async (symbol: string): Promise<Watchlist> => {
    const response = await api.post<any>("/api/watchlist", { symbol, add: true });
    return {
      symbols: Array.isArray(response?.symbols) ? response.symbols : [],
      items: Array.isArray(response?.items) ? response.items.map(mapStock) : [],
    };
  },

  remove: async (symbol: string): Promise<Watchlist> => {
    const response = await api.post<any>("/api/watchlist", { symbol, add: false });
    return {
      symbols: Array.isArray(response?.symbols) ? response.symbols : [],
      items: Array.isArray(response?.items) ? response.items.map(mapStock) : [],
    };
  },
};

export const portfolioApi = {
  listPortfolios: async (): Promise<PortfolioAccount[]> => {
    const response = await api.get<any>("/api/portfolios");
    return Array.isArray(response?.portfolios) ? response.portfolios.map(mapPortfolioAccount) : [];
  },

  createPortfolio: async (payload: { name: string; description?: string; currency?: string }) => {
    const response = await api.post<any>("/api/portfolios", payload);
    return { portfolio: mapPortfolioAccount(response?.portfolio || {}), portfolios: Array.isArray(response?.portfolios) ? response.portfolios.map(mapPortfolioAccount) : [] };
  },

  updatePortfolio: async (portfolioId: string, payload: { name?: string; description?: string; isDefault?: boolean; isArchived?: boolean }) => {
    const response = await api.patch<any>(`/api/portfolios/${encodeURIComponent(portfolioId)}`, {
      name: payload.name,
      description: payload.description,
      is_default: payload.isDefault,
      is_archived: payload.isArchived,
    });
    return { portfolio: mapPortfolioAccount(response?.portfolio || {}), portfolios: Array.isArray(response?.portfolios) ? response.portfolios.map(mapPortfolioAccount) : [] };
  },

  get: async (portfolioId?: string): Promise<PortfolioData> => mapPortfolioData(await api.get<any>(`/api/portfolio${portfolioId ? `?portfolio_id=${encodeURIComponent(portfolioId)}` : ""}`)),

  getPerformance: async (days = 365, portfolioId?: string): Promise<PortfolioPerformancePoint[]> => {
    const response = await api.get<any>(`/api/portfolio/performance?days=${encodeURIComponent(String(days))}${portfolioId ? `&portfolio_id=${encodeURIComponent(portfolioId)}` : ""}`);
    return Array.isArray(response?.series) ? response.series.map(mapPortfolioPerformancePoint) : [];
  },

  getPeriodPerformance: async (portfolioId?: string): Promise<PortfolioPeriodPerformance[]> => {
    const response = await api.get<any>(`/api/portfolio/period-performance${portfolioId ? `?portfolio_id=${encodeURIComponent(portfolioId)}` : ""}`);
    return Array.isArray(response?.periods) ? response.periods.map((item: any) => ({
      label: String(item?.label || ""),
      startDate: item?.start_date || item?.startDate,
      endDate: item?.end_date || item?.endDate,
      portfolioReturnPct: num(item?.portfolio_return_pct ?? item?.portfolioReturnPct),
      aspiReturnPct: num(item?.aspi_return_pct ?? item?.aspiReturnPct),
      sp20ReturnPct: num(item?.sp20_return_pct ?? item?.sp20ReturnPct),
      alphaVsAspiPct: num(item?.alpha_vs_aspi_pct ?? item?.alphaVsAspiPct),
      alphaVsSp20Pct: num(item?.alpha_vs_sp20_pct ?? item?.alphaVsSp20Pct),
    })) : [];
  },

  getAnalytics: async (days = 365, portfolioId?: string): Promise<PortfolioAnalytics> =>
    mapPortfolioAnalytics(await api.get<any>(`/api/portfolio/analytics?days=${encodeURIComponent(String(days))}${portfolioId ? `&portfolio_id=${encodeURIComponent(portfolioId)}` : ""}`)),

  getIntelligence: async (portfolioId?: string): Promise<PortfolioIntelligence> =>
    mapPortfolioIntelligence(await api.get<any>(`/api/portfolio/intelligence${portfolioId ? `?portfolio_id=${encodeURIComponent(portfolioId)}` : ""}`)),

  previewTradeFit: async (payload: { symbol: string; txType: "buy" | "sell"; quantity: number; price: number; fees?: number; tradedAt?: string; notes?: string }, portfolioId?: string): Promise<TradeFitPreview> =>
    mapTradeFitPreview(await api.post<any>(`/api/portfolio/trade-preview${portfolioId ? `?portfolio_id=${encodeURIComponent(portfolioId)}` : ""}`, {
      symbol: payload.symbol,
      tx_type: payload.txType,
      quantity: payload.quantity,
      price: payload.price,
      fees: payload.fees,
      traded_at: payload.tradedAt,
      notes: payload.notes,
    })),

  addCashMovement: async (payload: { movementType: "deposit" | "withdrawal"; amount: number; movementDate?: string; notes?: string }, portfolioId?: string): Promise<PortfolioData> =>
    mapPortfolioData(await api.post<any>(`/api/portfolio/cash${portfolioId ? `?portfolio_id=${encodeURIComponent(portfolioId)}` : ""}`, {
      movement_type: payload.movementType,
      amount: payload.amount,
      movement_date: payload.movementDate,
      notes: payload.notes,
    })),

  deleteCashMovement: async (cashId: string, portfolioId?: string): Promise<PortfolioData> =>
    mapPortfolioData(await api.delete<any>(`/api/portfolio/cash/${encodeURIComponent(cashId)}${portfolioId ? `?portfolio_id=${encodeURIComponent(portfolioId)}` : ""}`)),

  addTransaction: async (payload: {
    symbol: string;
    txType: "buy" | "sell";
    quantity: number;
    price: number;
    fees?: number;
    tradedAt?: string;
    notes?: string;
  }, portfolioId?: string): Promise<PortfolioData> =>
    mapPortfolioData(
      await api.post<any>(`/api/portfolio/transactions${portfolioId ? `?portfolio_id=${encodeURIComponent(portfolioId)}` : ""}`, {
        symbol: payload.symbol,
        tx_type: payload.txType,
        quantity: payload.quantity,
        price: payload.price,
        fees: payload.fees,
        traded_at: payload.tradedAt,
        notes: payload.notes,
      })
    ),

  updateTransaction: async (transactionId: string, payload: {
    symbol: string;
    txType: "buy" | "sell";
    quantity: number;
    price: number;
    fees?: number;
    tradedAt?: string;
    notes?: string;
  }, portfolioId?: string): Promise<PortfolioData> =>
    mapPortfolioData(
      await api.patch<any>(`/api/portfolio/transactions/${encodeURIComponent(transactionId)}${portfolioId ? `?portfolio_id=${encodeURIComponent(portfolioId)}` : ""}`, {
        symbol: payload.symbol,
        tx_type: payload.txType,
        quantity: payload.quantity,
        price: payload.price,
        fees: payload.fees,
        traded_at: payload.tradedAt,
        notes: payload.notes,
      })
    ),

  deleteTransaction: async (transactionId: string, portfolioId?: string): Promise<PortfolioData> =>
    mapPortfolioData(await api.delete<any>(`/api/portfolio/transactions/${encodeURIComponent(transactionId)}${portfolioId ? `?portfolio_id=${encodeURIComponent(portfolioId)}` : ""}`)),

  previewImport: async (file: File) => {
    const form = new FormData();
    form.append("file", file);
    return api.post<any>("/api/portfolio/import/preview", form);
  },

  importTransactions: async (file: File, portfolioId?: string): Promise<PortfolioData & { importedRows?: number }> => {
    const form = new FormData();
    form.append("file", file);
    const response = await api.post<any>(`/api/portfolio/import${portfolioId ? `?portfolio_id=${encodeURIComponent(portfolioId)}` : ""}`, form);
    const mapped = mapPortfolioData(response) as PortfolioData & { importedRows?: number };
    mapped.importedRows = response?.imported_rows;
    return mapped;
  },
};

export const corporateActionsApi = {
  getAll: async (symbol?: string): Promise<CorporateAction[]> => {
    const query = symbol ? `?symbol=${encodeURIComponent(symbol)}` : "";
    const response = await api.get<any>(`/api/corporate-actions${query}`);
    return Array.isArray(response?.actions) ? response.actions.map(mapCorporateAction) : [];
  },
};

export const alertsApi = {
  getAll: async (): Promise<Alert[]> => {
    const response = await api.get<any>("/api/alerts");
    const rows = Array.isArray(response?.alerts) ? response.alerts : [];
    const priceMap = await getPriceMap(rows.map((row: any) => row.symbol).filter(Boolean));
    return rows.map((row: any) => mapAlert(row, priceMap[row.symbol]?.lastPrice || 0));
  },

  create: async (payload: { symbol?: string; alertType?: Alert["alertType"]; condition?: Alert["condition"]; targetPrice?: number; recurring?: boolean; cooldownMinutes?: number }) => {
    const alertType = payload.alertType || (payload.condition === "below" ? "below_price" : payload.condition === "pct_move" ? "pct_move" : payload.condition === "volume_spike" ? "volume_spike" : payload.condition === "important_announcement" ? "important_announcement" : "above_price");
    const response = await api.post<any>("/api/alerts", {
      symbol: payload.symbol,
      alert_type: alertType,
      target_value: payload.targetPrice,
      recurring: Boolean(payload.recurring),
      cooldown_minutes: payload.cooldownMinutes || 1440,
    });
    const rows = Array.isArray(response?.alerts) ? response.alerts : [];
    const priceMap = await getPriceMap(rows.map((row: any) => row.symbol).filter(Boolean));
    return rows.map((row: any) => mapAlert(row, priceMap[row.symbol]?.lastPrice || 0));
  },

  update: async (id: string, payload: { enabled?: boolean; targetPrice?: number; symbol?: string; recurring?: boolean; cooldownMinutes?: number }) => {
    const response = await api.patch<any>(`/api/alerts/${id}`, {
      is_enabled: payload.enabled,
      target_value: payload.targetPrice,
      symbol: payload.symbol,
      recurring: payload.recurring,
      cooldown_minutes: payload.cooldownMinutes,
    });
    const rows = Array.isArray(response?.alerts) ? response.alerts : [];
    const priceMap = await getPriceMap(rows.map((row: any) => row.symbol).filter(Boolean));
    return rows.map((row: any) => mapAlert(row, priceMap[row.symbol]?.lastPrice || 0));
  },

  delete: async (id: string) => {
    const response = await api.delete<any>(`/api/alerts/${id}`);
    const rows = Array.isArray(response?.alerts) ? response.alerts : [];
    const priceMap = await getPriceMap(rows.map((row: any) => row.symbol).filter(Boolean));
    return rows.map((row: any) => mapAlert(row, priceMap[row.symbol]?.lastPrice || 0));
  },
};

export const notificationsApi = {
  getAll: async (unreadOnly = false): Promise<Notification[]> => {
    const response = await api.get<any>(`/api/notifications${unreadOnly ? "?unread_only=true" : ""}`);
    const rows = Array.isArray(response?.notifications) ? response.notifications : [];
    return rows.map(mapNotification);
  },

  markAsRead: async (id: string) => {
    const response = await api.patch<any>(`/api/notifications/${id}/read`, {});
    const rows = Array.isArray(response?.notifications) ? response.notifications : [];
    return rows.map(mapNotification);
  },

  markAllAsRead: async () => {
    const response = await api.post<any>("/api/notifications/read-all", {});
    const rows = Array.isArray(response?.notifications) ? response.notifications : [];
    return rows.map(mapNotification);
  },
};

export const settingsApi = {
  getUserSettings: async (): Promise<UserSettings> => api.get<UserSettings>("/api/settings"),
  saveUserSettings: async (settings: Record<string, any>): Promise<UserSettings> =>
    api.post<UserSettings>("/api/settings", { settings }),
};


export const systemApi = {
  getStatus: async () => api.get<any>("/api/system/status"),
};

export const dashboardApi = {
  getData: async () => {
    const [overview, user] = await Promise.all([marketApi.getOverview(), getOptionalCurrentUser()]);
    let watchlist: Watchlist = { symbols: [], items: [] };
    if (user) {
      try {
        watchlist = await watchlistApi.get();
      } catch {
        watchlist = { symbols: [], items: [] };
      }
    }
    return { overview, user, watchlist };
  },
};

export const adminApi = {
  getStatus: () => api.get<AdminStatus>("/api/admin/status"),

  getModels: async (): Promise<{ models: Model[]; activeModel?: string }> => {
    const response = await api.get<any>("/api/admin/models");
    const active = response?.active_model;
    return {
      models: Array.isArray(response?.models) ? response.models.map(mapModel) : [],
      activeModel: typeof active === "string" ? active : active?.model_id || active?.id,
    };
  },

  activateModel: (modelId: string) => api.post<any>(`/api/admin/models/${encodeURIComponent(modelId)}/activate`, {}),

  triggerSync: (payload?: { symbols?: string[]; top_n?: number; days?: number; announcements?: number }) =>
    api.post<any>("/api/admin/actions/sync", payload || {}),

  triggerTraining: (payload?: { symbols?: string[]; horizon_days?: number }) =>
    api.post<any>("/api/admin/actions/train", payload || {}),

  triggerSyncTraining: (payload?: { symbols?: string[]; top_n?: number; days?: number; announcements?: number; horizon_days?: number }) =>
    api.post<any>("/api/admin/actions/sync-train", payload || {}),

  triggerDailyPipeline: (payload?: { symbols?: string[]; top_n?: number; days?: number; announcements?: number; horizon_days?: number; train_after_sync?: boolean }) =>
    api.post<any>("/api/admin/actions/daily-pipeline", payload || {}),

  previewHistoricalData: async (files: File[]) => {
    const form = new FormData();
    files.forEach((file) => form.append("files", file));
    return api.post<any>("/api/admin/data/preview", form);
  },

  uploadHistoricalData: async (files: File[], options?: { trainAfterImport?: boolean; horizonDays?: number }) => {
    const form = new FormData();
    files.forEach((file) => form.append("files", file));
    form.append("train_after_import", String(Boolean(options?.trainAfterImport)));
    form.append("horizon_days", String(options?.horizonDays || 1));
    return api.post<any>("/api/admin/data/upload", form);
  },

  refreshSentiment: (limit = 1200) => api.post<any>("/api/admin/actions/refresh-sentiment", { limit }),

  refreshDocuments: (payload?: { limit?: number; symbol?: string; force?: boolean; max_pages?: number }) => api.post<any>("/api/admin/actions/refresh-documents", payload || {}),

  seedNewsWhitelist: () => api.post<any>("/api/admin/actions/seed-news-whitelist", {}),

  refreshSelectedNews: (payload?: { lookback_days?: number; max_per_source?: number }) => api.post<any>("/api/admin/actions/refresh-selected-news", payload || {}),

  compareNewsModels: (payload?: { symbols?: string[]; horizon_days?: number; max_symbols?: number }) => api.post<any>("/api/admin/actions/compare-news-models", payload || {}),

  previewMacroData: async (file: File) => {
    const form = new FormData();
    form.append("file", file);
    return api.post<any>("/api/admin/macro/preview", form);
  },

  importMacroData: async (file: File) => {
    const form = new FormData();
    form.append("file", file);
    return api.post<any>("/api/admin/macro/import", form);
  },

  getJobs: async (): Promise<Job[]> => {
    const response = await api.get<any>("/api/admin/jobs");
    return Array.isArray(response?.jobs) ? response.jobs.map(mapJob) : [];
  },

  getUsers: async (): Promise<AdminUser[]> => {
    const response = await api.get<any>("/api/admin/users");
    return Array.isArray(response?.users) ? response.users.map(mapAdminUser) : [];
  },

  updateUserRole: async (username: string, role: "co_admin" | "user") => {
    const response = await api.post<any>(`/api/admin/users/${encodeURIComponent(username)}/role`, { role });
    return Array.isArray(response?.users) ? response.users.map(mapAdminUser) : [];
  },

  getAnnouncementTriage: async (params?: { includeHidden?: boolean; importantOnly?: boolean }) => {
    const query = new URLSearchParams();
    if (params?.includeHidden) query.set("include_hidden", "true");
    if (params?.importantOnly) query.set("important_only", "true");
    const response = await api.get<any>(`/api/admin/announcements/triage${query.toString() ? `?${query.toString()}` : ""}`);
    return Array.isArray(response?.announcements) ? response.announcements.map(mapAnnouncement) : [];
  },

  getPendingAnnouncements: async () => {
    const response = await api.get<any>("/api/admin/announcements/review");
    return Array.isArray(response?.announcements) ? response.announcements.map(mapAnnouncement) : [];
  },

  reviewAnnouncement: async (id: string, payload: { importance?: string; review_status?: string; review_notes?: string; tags?: string[] }) => {
    const response = await api.patch<any>(`/api/admin/announcements/${encodeURIComponent(id)}`, payload);
    return response;
  },

  getAllAlerts: async (): Promise<Alert[]> => {
    const response = await api.get<any>("/api/admin/alerts");
    const rows = Array.isArray(response?.alerts) ? response.alerts : [];
    const priceMap = await getPriceMap(rows.map((row: any) => row.symbol).filter(Boolean));
    return rows.map((row: any) => mapAlert(row, priceMap[row.symbol]?.lastPrice || 0));
  },

  getAllNotifications: async (): Promise<Notification[]> => {
    const response = await api.get<any>("/api/admin/notifications");
    return Array.isArray(response?.notifications) ? response.notifications.map(mapNotification) : [];
  },

  getAuditLogs: async (limit = 200): Promise<AuditLog[]> => {
    const response = await api.get<any>(`/api/admin/audit-logs?limit=${encodeURIComponent(String(limit))}`);
    return Array.isArray(response?.logs) ? response.logs.map(mapAuditLog) : [];
  },

  getModelHealth: async (): Promise<AdminModelHealth> => {
    const response = await api.get<any>("/api/admin/model-health");
    return {
      healthScore: num(response?.health_score ?? response?.healthScore),
      healthLabel: String(response?.health_label || response?.healthLabel || 'needs_attention'),
      note: String(response?.note || ''),
      model: response?.model || {},
      latestComparison: response?.latest_comparison || response?.latestComparison,
      featureStore: response?.feature_store || response?.featureStore || {},
      coverage: response?.coverage || {},
    };
  },

  getProviderSettings: () => api.get<any>("/api/admin/provider"),
  setProvider: (provider: string) => api.post<any>("/api/admin/provider", { provider }),
  getSystemSettings: () => api.get<any>("/api/admin/system-settings"),
  saveSystemSettings: (settings: Record<string, any>) => api.post<any>("/api/admin/system-settings", { settings }),
};
