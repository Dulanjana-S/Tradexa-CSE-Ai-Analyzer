export interface User {
  username: string;
  email: string;
  name: string;
  displayName?: string;
  role: "co_admin" | "admin" | "user";
  createdAt?: string;
  lastLoginAt?: string;
}

export interface AuthResponse {
  user: User;
  expiresAt?: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface ForgotPasswordRequest {
  email: string;
}

export interface RegisterRequest {
  email: string;
  password: string;
  name: string;
}

export interface Stock {
  symbol: string;
  name: string;
  company: string;
  sector: string;
  lastPrice: number;
  change: number;
  changePercent: number;
  volume: number;
  marketCap?: number;
  open?: number;
  high?: number;
  low?: number;
  previousClose?: number;
  vwap?: number;
  trades?: number;
  asOf?: string;
}

export interface HistoricalDataPoint {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface PredictionExplanationReason {
  feature: string;
  featureLabel?: string;
  group: string;
  direction: string;
  impact: number;
  text: string;
}

export interface PredictionExplanation {
  direction: string;
  summary: string;
  reasons: PredictionExplanationReason[];
}

export interface PredictionCardData {
  predictedPrice: number;
  currentPrice: number;
  predictedReturn: number;
  upProbability: number;
  signal: "bullish" | "bearish" | "neutral";
  confidence: number;
  expectedRange: { low: number; high: number };
  topFeatures: Array<{ feature: string; importance: number }>;
  lastUpdated: string;
  explanation?: PredictionExplanation;
  reliability?: {
    holdoutAuc?: number | null;
    holdoutAccuracy?: number | null;
    baselineAccuracy?: number | null;
    edgeVsBaseline?: number | null;
    confidenceLabel?: string;
    note?: string;
  };
  error?: string;
}

export interface MarketOverview {
  marketStatus: string;
  lastUpdated: string;
  turnover: number;
  trades: number;
  marketCap: number;
  aspi: { value: number; change: number; changePercent: number; series: Array<{ date: string; value: number }> };
  sp20: { value: number; change: number; changePercent: number; series: Array<{ date: string; value: number }> };
  topGainers: Stock[];
  topLosers: Stock[];
  mostActive: Stock[];
}

export interface Announcement {
  id: string;
  symbol: string;
  company: string;
  title: string;
  category: string;
  date: string;
  preview: string;
  important?: boolean;
  importance?: string;
  status?: string;
  url?: string;
  reviewNotes?: string;
  tags?: string[];
}

export interface Watchlist {
  symbols: string[];
  items: Stock[];
}

export interface PortfolioTransaction {
  id: string;
  symbol: string;
  type: "buy" | "sell";
  quantity: number;
  price: number;
  fees: number;
  tradedAt?: string;
  notes?: string;
  createdAt?: string;
}

export interface PortfolioPosition {
  symbol: string;
  company: string;
  sector?: string;
  quantity: number;
  avgCost: number;
  costBasis: number;
  currentPrice: number;
  marketValue: number;
  unrealizedPl: number;
  unrealizedPlPct: number;
  realizedPl: number;
  dividendIncome?: number;
  weightPct: number;
}

export interface PortfolioAccount {
  portfolioId: string;
  name: string;
  description?: string;
  currency?: string;
  isDefault: boolean;
  isArchived?: boolean;
  summary?: PortfolioSummary;
}

export interface PortfolioCashMovement {
  id: string;
  portfolioId: string;
  movementType: "deposit" | "withdrawal";
  amount: number;
  movementDate?: string;
  notes?: string;
  createdAt?: string;
}

export interface PortfolioSummary {
  portfolioId?: string;
  portfolioName?: string;
  cashBalance?: number;
  cashDeposits?: number;
  cashWithdrawals?: number;
  netContributions?: number;
  totalEquity?: number;
  positionsCount: number;
  transactionsCount: number;
  cashMovementsCount?: number;
  costBasis: number;
  marketValue: number;
  unrealizedPl: number;
  unrealizedPlPct: number;
  realizedPl: number;
  dividendIncome?: number;
  totalPl: number;
  totalReturn?: number;
  returnPct?: number;
}

export interface CorporateAction {
  id: string;
  symbol: string;
  exDate: string;
  actionType: string;
  amount?: number;
  ratioNumerator?: number;
  ratioDenominator?: number;
  description?: string;
  source?: string;
}

export interface PortfolioData {
  portfolio?: PortfolioAccount;
  summary: PortfolioSummary;
  positions: PortfolioPosition[];
  transactions: PortfolioTransaction[];
  cashMovements?: PortfolioCashMovement[];
  recentActions?: CorporateAction[];
}

export interface PortfolioPeriodPerformance {
  label: string;
  startDate?: string;
  endDate?: string;
  portfolioReturnPct: number;
  aspiReturnPct: number;
  sp20ReturnPct: number;
  alphaVsAspiPct: number;
  alphaVsSp20Pct: number;
}

export interface CalendarEvent {
  date: string;
  symbol: string;
  title: string;
  eventType: string;
  sourceType: string;
  daysFromNow: number;
  status: string;
  meta?: Record<string, any>;
}

export interface EventCalendar {
  symbols: string[];
  upcoming: CalendarEvent[];
  recent: CalendarEvent[];
  count: number;
}

export interface AuditLog {
  auditId: string;
  username?: string;
  role?: string;
  action: string;
  targetType?: string;
  targetId?: string;
  status?: string;
  ipAddress?: string;
  details?: Record<string, any>;
  createdAt?: string;
}

export interface AdminModelCapabilities {
  baseline: boolean;
  sklearnGbdt: boolean;
  lightgbm: boolean;
  xgboost: boolean;
  catboost: boolean;
  finbertEnabled: boolean;
  finbertAvailable: boolean;
  finbertModel?: string;
  autoCandidates?: string[];
  workflow?: Record<string, string>;
  notes?: string[];
}

export interface AdminModelHealth {
  healthScore: number;
  healthLabel: string;
  note: string;
  model: Record<string, any>;
  latestComparison?: any;
  featureStore: Record<string, number>;
  coverage: Record<string, any>;
  capabilities?: AdminModelCapabilities;
}

export interface PortfolioPerformancePoint {
  date: string;
  marketValue: number;
  cashBalance?: number;
  totalEquity?: number;
  netContributions?: number;
  costBasis: number;
  realizedPl: number;
  unrealizedPl: number;
  dividendIncome?: number;
  totalPl: number;
  totalReturn?: number;
  returnPct?: number;
}

export interface PortfolioAnalyticsSector {
  sector: string;
  marketValue: number;
  positionsCount: number;
  weightPct: number;
}

export interface PortfolioAnalyticsMover {
  symbol: string;
  company: string;
  sector?: string;
  marketValue: number;
  returnPct: number;
  profit: number;
}

export interface PortfolioDiversification {
  score: number;
  label: string;
  effectiveHoldings: number;
  sectorCount: number;
  largestPositionPct: number;
}

export interface PortfolioPerformanceBreakdown {
  realizedPl: number;
  unrealizedPl: number;
  dividendIncome: number;
  totalReturn: number;
  realizedSharePct: number;
  unrealizedSharePct: number;
  dividendSharePct: number;
}

export interface PortfolioDividendPosition {
  symbol: string;
  company: string;
  dividendIncome: number;
  yieldOnPositionCostPct: number;
}

export interface PortfolioDividendSummary {
  totalIncome: number;
  yieldOnCostPct: number;
  payingPositionsCount: number;
  topPositions: PortfolioDividendPosition[];
}

export interface PortfolioRisk {
  score: number;
  label: string;
  annualizedVolatilityPct: number;
  weightedBeta: number;
  largestPositionPct: number;
  largestSectorPct: number;
}

export interface PortfolioBenchmarkPoint {
  date: string;
  portfolio?: number;
  aspi?: number;
  sp20?: number;
}

export interface PortfolioBenchmarkComparison {
  periodDays: number;
  portfolioReturnPct: number;
  aspiReturnPct: number;
  sp20ReturnPct: number;
  alphaVsAspiPct: number;
  alphaVsSp20Pct: number;
  series: PortfolioBenchmarkPoint[];
}

export interface PortfolioAnalytics {
  days: number;
  sectorAllocation: PortfolioAnalyticsSector[];
  topGainers: PortfolioAnalyticsMover[];
  topLosers: PortfolioAnalyticsMover[];
  diversification: PortfolioDiversification;
  performanceBreakdown: PortfolioPerformanceBreakdown;
  dividendSummary: PortfolioDividendSummary;
  risk: PortfolioRisk;
  benchmark: PortfolioBenchmarkComparison;
}

export interface HoldingAttention {
  symbol: string;
  company: string;
  sector?: string;
  status: "suitable" | "watch" | "need_attention" | "high_risk";
  statusLabel: string;
  severity: string;
  fitScore: number;
  riskScore: number;
  weightPct: number;
  sectorWeightPct: number;
  volatilityPct?: number;
  drawdownPct?: number;
  sentimentScore30d?: number;
  negativeSentimentCount?: number;
  reasons: string[];
  suggestions: string[];
}

export interface CashManagementInsight {
  label: string;
  score: number;
  cashBalance: number;
  cashPct: number;
  targetMinPct: number;
  targetMaxPct: number;
  recommendedMinCash: number;
  recommendedMaxCash: number;
  reasons: string[];
  suggestions: string[];
}

export interface PortfolioIntelligence {
  portfolioId: string;
  health: { score: number; label: string; attentionCount: number; watchCount: number };
  cashManagement: CashManagementInsight;
  holdings: HoldingAttention[];
  attentionItems: HoldingAttention[];
  suggestions: string[];
  thresholds?: Record<string, number>;
}

export interface TradeFitPreview {
  portfolioId: string;
  symbol: string;
  txType: "buy" | "sell";
  tradeValue: number;
  cashBefore: number;
  cashAfter: number;
  currentStockWeightPct: number;
  newStockWeightPct: number;
  newSectorWeightPct: number;
  status: "suitable" | "watch" | "need_attention" | "high_risk";
  statusLabel: string;
  fitScore: number;
  riskScore: number;
  reasons: string[];
  suggestions: string[];
  cashManagement: CashManagementInsight;
}

export interface Alert {
  id: string;
  username?: string;
  symbol: string;
  companyName: string;
  alertType: "above_price" | "below_price" | "pct_move" | "volume_spike" | "important_announcement";
  condition: "above" | "below" | "pct_move" | "volume_spike" | "important_announcement";
  targetPrice: number;
  currentPrice: number;
  enabled: boolean;
  createdAt: string;
  triggered: boolean;
  triggeredAt?: string;
  recurring?: boolean;
  cooldownMinutes?: number;
}

export interface Notification {
  id: string;
  type: string;
  title: string;
  message: string;
  priority: string;
  isRead: boolean;
  createdAt: string;
  symbol?: string;
  link?: string;
}

export interface UserSettings {
  profile: string;
  settings: Record<string, any>;
}

export interface AdminStatus {
  provider: any;
  database: any;
  coverage: any;
  freshness: any;
  counts: any;
  model: any;
  models: any[];
  active_model?: any;
  users: any[];
  jobs: any[];
  provider_settings?: any;
  alerts: any[];
  notifications: any[];
  watchlist?: any;
  top_signals?: any[];
}

export interface Model {
  id: string;
  name: string;
  status: string;
  accuracy?: number;
  createdAt?: string;
  isActive?: boolean;
  lifecycleStatus?: string;
  summary?: {
    family?: string;
    directionModel?: string;
    sentiment?: boolean;
    macro?: boolean;
    finbertReady?: boolean;
    validation?: Record<string, any>;
  };
  meta?: Record<string, any>;
  path?: string;
}

export interface Job {
  id: string;
  name: string;
  type: string;
  status: string;
  startedAt?: string;
  completedAt?: string;
  details?: unknown;
}

export interface AdminUser {
  username: string;
  email: string;
  name: string;
  role: "co_admin" | "admin" | "user";
  createdAt?: string;
  lastLogin?: string;
  status: string;
}


export interface StockResourceLink {
  id: string;
  title: string;
  date?: string;
  url?: string;
  category?: string;
  reportType?: string;
}


export interface SentimentTimelinePoint {
  date: string;
  score: number;
  impact: number;
  count: number;
}

export interface SentimentItem {
  itemId: string;
  annId?: string;
  symbol?: string;
  date: string;
  title: string;
  sourceUrl?: string;
  sentimentScore: number;
  sentimentLabel: "positive" | "neutral" | "negative";
  impactScore: number;
  eventType: string;
  confidence: number;
  keywords: string[];
}

export interface SentimentSummary {
  symbol: string;
  available: boolean;
  latestLabel: string;
  latestScore: number;
  latestEventType?: string;
  trend: string;
  score7d: number;
  score30d: number;
  impact30d: number;
  documents30d: number;
  items: SentimentItem[];
  eventBreakdown: Array<{ eventType: string; count: number }>;
  timeline: SentimentTimelinePoint[];
}

export interface StockResources {
  symbol: string;
  officialProfileUrl: string;
  officialAnnouncements: StockResourceLink[];
  annualReports: StockResourceLink[];
  quarterlyReports: StockResourceLink[];
  corporateDocuments: StockResourceLink[];
}

export interface DocumentIntelligence {
  docId: string;
  annId?: string;
  symbol?: string;
  date?: string;
  title: string;
  documentUrl?: string;
  documentType?: string;
  summary?: string;
  pagesAnalyzed?: number;
  sentimentScore?: number;
  sentimentLabel?: string;
  impactScore?: number;
  eventType?: string;
  confidence?: number;
  keywords?: string[];
}

export interface StockDocuments {
  symbol: string;
  count: number;
  documents: DocumentIntelligence[];
}

export interface ExternalNewsItem {
  itemId: string;
  sourceName: string;
  sourceDomain: string;
  url: string;
  title: string;
  publishedDate?: string;
  scope?: string;
  symbol?: string;
  companyName?: string;
  sentimentScore?: number;
  sentimentLabel?: string;
  impactScore?: number;
  eventType?: string;
  confidence?: number;
  keywords?: string[];
}

export interface StockNews {
  symbol: string;
  linkedNews: ExternalNewsItem[];
  marketContext: ExternalNewsItem[];
}


export interface ModelComparisonSide {
  modelId: string;
  displayName: string;
  family: string;
  status: string;
  metrics: Record<string, number | null>;
  featureBlocks: Record<string, boolean>;
  validationSummary?: Record<string, any>;
  trainedAtUtc?: string;
}

export interface ModelComparison {
  left: ModelComparisonSide;
  right: ModelComparisonSide;
}
