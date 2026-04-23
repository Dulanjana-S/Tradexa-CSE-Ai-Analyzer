import { api } from "./client";
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
  User,
  UserSettings,
  Watchlist,
  PortfolioData,
  PortfolioPerformancePoint,
  PortfolioPosition,
  PortfolioSummary,
  PortfolioTransaction,
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
    role: raw?.role === "admin" ? "admin" : "user",
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
    weightPct: num(raw?.weight_pct ?? raw?.weightPct),
  };
}

function mapPortfolioSummary(raw: any): PortfolioSummary {
  return {
    positionsCount: num(raw?.positions_count ?? raw?.positionsCount),
    transactionsCount: num(raw?.transactions_count ?? raw?.transactionsCount),
    costBasis: num(raw?.cost_basis ?? raw?.costBasis),
    marketValue: num(raw?.market_value ?? raw?.marketValue),
    unrealizedPl: num(raw?.unrealized_pl ?? raw?.unrealizedPl),
    unrealizedPlPct: num(raw?.unrealized_pl_pct ?? raw?.unrealizedPlPct),
    realizedPl: num(raw?.realized_pl ?? raw?.realizedPl),
    totalPl: num(raw?.total_pl ?? raw?.totalPl),
  };
}

function mapPortfolioData(raw: any): PortfolioData {
  return {
    summary: mapPortfolioSummary(raw?.summary || {}),
    positions: Array.isArray(raw?.positions) ? raw.positions.map(mapPortfolioPosition) : [],
    transactions: Array.isArray(raw?.transactions) ? raw.transactions.map(mapPortfolioTransaction) : [],
  };
}

function mapPortfolioPerformancePoint(raw: any): PortfolioPerformancePoint {
  return {
    date: String(raw?.date || ""),
    marketValue: num(raw?.market_value ?? raw?.marketValue),
    costBasis: num(raw?.cost_basis ?? raw?.costBasis),
    realizedPl: num(raw?.realized_pl ?? raw?.realizedPl),
    unrealizedPl: num(raw?.unrealized_pl ?? raw?.unrealizedPl),
    totalPl: num(raw?.total_pl ?? raw?.totalPl),
  };
}

function mapAlert(raw: any, currentPrice = 0): Alert {
  const type = String(raw?.alert_type || raw?.condition || "above_price").toLowerCase();
  let condition: Alert["condition"] = "above";
  if (type.includes("below")) condition = "below";
  else if (type.includes("pct")) condition = "pct_move";
  else if (type.includes("volume")) condition = "volume_spike";

  return {
    id: String(raw?.alert_id || raw?.id || ""),
    username: raw?.username,
    symbol: String(raw?.symbol || ""),
    companyName: String(raw?.companyName || raw?.symbol || "Unknown Company"),
    condition,
    targetPrice: num(raw?.target_value ?? raw?.targetPrice),
    currentPrice,
    enabled: Boolean(raw?.is_enabled ?? raw?.enabled ?? true),
    createdAt: String(raw?.created_at || raw?.createdAt || ""),
    triggered: Boolean(raw?.is_triggered ?? raw?.triggered),
    triggeredAt: raw?.last_triggered_at || raw?.triggeredAt,
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
    role: String(raw?.role || "user"),
    createdAt: raw?.created_at,
    lastLogin: raw?.last_login_at,
    status: "active",
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

  getStockPrediction: async (symbol: string, currentPrice = 0): Promise<PredictionCardData> => {
    const response = await api.get<any>(`/api/stock/${encodeURIComponent(symbol)}/prediction`);
    return mapPrediction(response, currentPrice);
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
  get: async (): Promise<PortfolioData> => mapPortfolioData(await api.get<any>("/api/portfolio")),

  getPerformance: async (days = 365): Promise<PortfolioPerformancePoint[]> => {
    const response = await api.get<any>(`/api/portfolio/performance?days=${encodeURIComponent(String(days))}`);
    return Array.isArray(response?.series) ? response.series.map(mapPortfolioPerformancePoint) : [];
  },

  addTransaction: async (payload: {
    symbol: string;
    txType: "buy" | "sell";
    quantity: number;
    price: number;
    fees?: number;
    tradedAt?: string;
    notes?: string;
  }): Promise<PortfolioData> =>
    mapPortfolioData(
      await api.post<any>("/api/portfolio/transactions", {
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
  }): Promise<PortfolioData> =>
    mapPortfolioData(
      await api.patch<any>(`/api/portfolio/transactions/${encodeURIComponent(transactionId)}`, {
        symbol: payload.symbol,
        tx_type: payload.txType,
        quantity: payload.quantity,
        price: payload.price,
        fees: payload.fees,
        traded_at: payload.tradedAt,
        notes: payload.notes,
      })
    ),

  deleteTransaction: async (transactionId: string): Promise<PortfolioData> =>
    mapPortfolioData(await api.delete<any>(`/api/portfolio/transactions/${encodeURIComponent(transactionId)}`)),
};

export const alertsApi = {
  getAll: async (): Promise<Alert[]> => {
    const response = await api.get<any>("/api/alerts");
    const rows = Array.isArray(response?.alerts) ? response.alerts : [];
    const priceMap = await getPriceMap(rows.map((row: any) => row.symbol).filter(Boolean));
    return rows.map((row: any) => mapAlert(row, priceMap[row.symbol]?.lastPrice || 0));
  },

  create: async (payload: { symbol: string; condition: "above" | "below"; targetPrice: number }) => {
    const response = await api.post<any>("/api/alerts", {
      symbol: payload.symbol,
      alert_type: payload.condition === "above" ? "above_price" : "below_price",
      target_value: payload.targetPrice,
    });
    const rows = Array.isArray(response?.alerts) ? response.alerts : [];
    const priceMap = await getPriceMap(rows.map((row: any) => row.symbol).filter(Boolean));
    return rows.map((row: any) => mapAlert(row, priceMap[row.symbol]?.lastPrice || 0));
  },

  update: async (id: string, payload: { enabled?: boolean; targetPrice?: number; symbol?: string }) => {
    const response = await api.patch<any>(`/api/alerts/${id}`, {
      is_enabled: payload.enabled,
      target_value: payload.targetPrice,
      symbol: payload.symbol,
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

  uploadHistoricalData: async (files: File[], options?: { trainAfterImport?: boolean; horizonDays?: number }) => {
    const form = new FormData();
    files.forEach((file) => form.append("files", file));
    form.append("train_after_import", String(Boolean(options?.trainAfterImport)));
    form.append("horizon_days", String(options?.horizonDays || 1));
    return api.post<any>("/api/admin/data/upload", form);
  },

  getJobs: async (): Promise<Job[]> => {
    const response = await api.get<any>("/api/admin/jobs");
    return Array.isArray(response?.jobs) ? response.jobs.map(mapJob) : [];
  },

  getUsers: async (): Promise<AdminUser[]> => {
    const response = await api.get<any>("/api/admin/users");
    return Array.isArray(response?.users) ? response.users.map(mapAdminUser) : [];
  },

  updateUserRole: async (username: string, role: "admin" | "user") => {
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

  getProviderSettings: () => api.get<any>("/api/admin/provider"),
  setProvider: (provider: string) => api.post<any>("/api/admin/provider", { provider }),
  getSystemSettings: () => api.get<any>("/api/admin/system-settings"),
  saveSystemSettings: (settings: Record<string, any>) => api.post<any>("/api/admin/system-settings", { settings }),
};
