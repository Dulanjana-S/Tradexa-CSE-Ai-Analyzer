export interface User {
  username: string;
  email: string;
  name: string;
  displayName?: string;
  role: "admin" | "user";
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
  weightPct: number;
}

export interface PortfolioSummary {
  positionsCount: number;
  transactionsCount: number;
  costBasis: number;
  marketValue: number;
  unrealizedPl: number;
  unrealizedPlPct: number;
  realizedPl: number;
  totalPl: number;
}

export interface PortfolioData {
  summary: PortfolioSummary;
  positions: PortfolioPosition[];
  transactions: PortfolioTransaction[];
}

export interface Alert {
  id: string;
  username?: string;
  symbol: string;
  companyName: string;
  condition: "above" | "below" | "pct_move" | "volume_spike";
  targetPrice: number;
  currentPrice: number;
  enabled: boolean;
  createdAt: string;
  triggered: boolean;
  triggeredAt?: string;
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
  role: string;
  createdAt?: string;
  lastLogin?: string;
  status: string;
}
