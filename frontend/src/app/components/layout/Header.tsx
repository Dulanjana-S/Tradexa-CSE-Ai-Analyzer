import { Menu, Search, TrendingUp, User, Sun, Moon } from "lucide-react";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu";
import { NotificationPanel } from "../notifications/NotificationPanel";
import { Link, useNavigate } from "react-router";
import { useTheme } from "../../contexts/ThemeContext";
import { useAuth } from "../../../lib/auth/AuthContext";
import { isStaffRole, roleLabel } from "../../../lib/auth/roles";
import { useEffect, useMemo, useState } from "react";
import { marketApi } from "../../../lib/api/services";
import type { Stock } from "../../../lib/api/types";

interface HeaderProps {
  onMenuClick: () => void;
}

export function Header({ onMenuClick }: HeaderProps) {
  const { theme, toggleTheme } = useTheme();
  const { user, logout, isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const [marketStatus, setMarketStatus] = useState("closed");
  const [clockNow, setClockNow] = useState(() => Date.now());
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<Stock[]>([]);
  const [searchOpen, setSearchOpen] = useState(false);
  const trimmedQuery = useMemo(() => searchQuery.trim(), [searchQuery]);
  const normalizedStatus = marketStatus.toLowerCase();
  const isFastStatus = /open|pre|auction|session|trading/.test(normalizedStatus);
  const pollMs = isFastStatus ? 10000 : 30000;
  const statusBadge = useMemo(() => {
    const normalized = marketStatus.toLowerCase();
    if (normalized.includes("pre")) {
      return {
        label: marketStatus,
        dotClass: "bg-amber-500",
        badgeClass: "border-amber-400/60 bg-amber-500/10 text-amber-600 dark:text-amber-400 shadow-[0_0_14px_rgba(245,158,11,0.2)]",
      };
    }
    if (normalized.includes("halt") || normalized.includes("suspend")) {
      return {
        label: marketStatus,
        dotClass: "bg-orange-500",
        badgeClass: "border-orange-400/60 bg-orange-500/10 text-orange-600 dark:text-orange-400 shadow-[0_0_14px_rgba(249,115,22,0.2)]",
      };
    }
    if (normalized.includes("open") || normalized.includes("trading") || normalized.includes("session")) {
      return {
        label: marketStatus,
        dotClass: "bg-emerald-500 animate-pulse",
        badgeClass: "border-emerald-400/60 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 shadow-[0_0_14px_rgba(16,185,129,0.2)]",
      };
    }
    if (normalized.includes("close") || normalized.includes("holiday")) {
      return {
        label: marketStatus,
        dotClass: "bg-rose-500",
        badgeClass: "border-rose-400/60 bg-rose-500/10 text-rose-600 dark:text-rose-400 shadow-[0_0_14px_rgba(244,63,94,0.2)]",
      };
    }
    return {
      label: marketStatus,
      dotClass: "bg-slate-400",
      badgeClass: "border-slate-400/60 bg-slate-500/20 text-white shadow-[0_0_14px_rgba(148,163,184,0.28)]",
    };
  }, [marketStatus]);

  const cseClockLabel = useMemo(() => {
    return new Date(clockNow).toLocaleTimeString("en-LK", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
      timeZone: "Asia/Colombo",
    });
  }, [clockNow]);

  useEffect(() => {
    const tickId = window.setInterval(() => setClockNow(Date.now()), 1000);
    return () => window.clearInterval(tickId);
  }, []);

  useEffect(() => {
    let alive = true;

    const refreshStatus = () => {
      marketApi
        .getOverview()
        .then((overview) => {
          if (!alive) return;
          setMarketStatus(overview.marketStatus);
        })
        .catch(() => {
          if (!alive) return;
          setMarketStatus("Unavailable");
        });
    };

    refreshStatus();
    const intervalId = window.setInterval(refreshStatus, pollMs);

    return () => {
      alive = false;
      window.clearInterval(intervalId);
    };
  }, [pollMs]);

  useEffect(() => {
    let alive = true;
    if (trimmedQuery.length < 1) {
      setSearchResults([]);
      setSearchOpen(false);
      return;
    }
    const timer = window.setTimeout(() => {
      marketApi
        .searchCompanies(trimmedQuery)
        .then((results) => {
          if (!alive) return;
          setSearchResults(results.slice(0, 8));
          setSearchOpen(true);
        })
        .catch(() => {
          if (!alive) return;
          setSearchResults([]);
          setSearchOpen(true);
        });
    }, 180);

    return () => {
      alive = false;
      window.clearTimeout(timer);
    };
  }, [trimmedQuery]);

  const goToStock = (symbol: string) => {
    setSearchOpen(false);
    setSearchQuery("");
    navigate(`/stock/${symbol}`);
  };

  const handleSearchSubmit = () => {
    if (!trimmedQuery) return;
    const exact = searchResults.find((item) => item.symbol.toLowerCase() === trimmedQuery.toLowerCase());
    if (exact) {
      goToStock(exact.symbol);
      return;
    }
    if (searchResults.length === 1) {
      goToStock(searchResults[0].symbol);
      return;
    }
    setSearchOpen(false);
    navigate(`/markets?search=${encodeURIComponent(trimmedQuery)}`);
  };

  return (
    <header className="sticky top-0 z-50 flex h-14 items-center gap-4 border-b border-[var(--color-border)] bg-[var(--color-bg-primary)]/95 px-6 shadow-sm backdrop-blur-lg">
      <Button
        variant="ghost"
        size="icon"
        onClick={onMenuClick}
        className="text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-secondary)] hover:text-[var(--color-text-primary)] lg:hidden"
      >
        <Menu className="h-5 w-5" />
      </Button>

      <Link to="/" className="flex shrink-0 items-center gap-2.5">
        <img 
          src="/logo.png" 
          alt="Tradexa.lk" 
          className="h-9 w-auto object-contain sm:h-11 transition-all" 
          style={{ 
            filter: theme === 'light' ? 'invert(1) hue-rotate(180deg) brightness(0.2)' : 'none' 
          }}
        />
      </Link>

      <div className="relative hidden max-w-2xl flex-1 md:block">
        <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--color-text-secondary)]" />
        <Input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          onFocus={() => trimmedQuery && setSearchOpen(true)}
          onBlur={() => window.setTimeout(() => setSearchOpen(false), 120)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              handleSearchSubmit();
            }
          }}
          placeholder="Search stocks, sectors, companies..."
          className="h-8 border-[var(--color-border)] bg-[var(--color-bg-primary)] pl-9 pr-14 text-[13px] text-[var(--color-text-primary)] placeholder:text-[var(--color-text-tertiary)] focus-visible:border-emerald-500 focus-visible:ring-1 focus-visible:ring-emerald-500"
        />
        <Button type="button" size="sm" variant="ghost" onClick={handleSearchSubmit} className="absolute right-1 top-1 h-6 px-2 text-[11px] text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-secondary)] hover:text-[var(--color-text-primary)]">Go</Button>
        {searchOpen && (
          <div className="absolute left-0 right-0 top-10 overflow-hidden rounded-md border border-[var(--color-border)] bg-[var(--color-bg-secondary)] shadow-2xl">
            {searchResults.length > 0 ? (
              <div className="max-h-80 overflow-y-auto py-1">
                {searchResults.map((item) => (
                  <button
                    key={item.symbol}
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => goToStock(item.symbol)}
                    className="flex w-full items-start justify-between gap-3 px-3 py-2 text-left hover:bg-[var(--color-bg-tertiary)]"
                  >
                    <div>
                      <div className="text-[13px] font-semibold text-[var(--color-text-primary)]">{item.symbol}</div>
                      <div className="text-[12px] text-[var(--color-text-secondary)]">{item.company}</div>
                    </div>
                    <div className="text-[11px] text-[var(--color-text-tertiary)]">{item.sector || "—"}</div>
                  </button>
                ))}
                <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={handleSearchSubmit} className="w-full border-t border-[var(--color-border)] px-3 py-2 text-left text-[12px] text-emerald-400 hover:bg-[var(--color-bg-tertiary)]">Show all matching results for “{trimmedQuery}”</button>
              </div>
            ) : (
              <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={handleSearchSubmit} className="w-full px-3 py-3 text-left text-[12px] text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-tertiary)]">No direct symbol match. Search the market list for “{trimmedQuery}”.</button>
            )}
          </div>
        )}
      </div>

      <div className="ml-auto flex items-center gap-2 sm:gap-3">
        <div className="flex items-center gap-2">
          <div className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-1 text-[10px] font-bold tracking-wide backdrop-blur sm:gap-2.5 sm:px-3 sm:py-1.5 sm:text-[12px] ${statusBadge.badgeClass}`}>
            <div className="flex h-2 w-2 items-center justify-center">
              <div className={`h-1.5 w-1.5 rounded-full sm:h-2 sm:w-2 ${statusBadge.dotClass}`} />
            </div>
            <span className="hidden min-[450px]:inline sm:inline">{statusBadge.label}</span>
          </div>
          <span className="hidden md:inline text-[14px] font-bold tabular-nums text-[var(--color-text-primary)] lg:text-[15px]">
            {cseClockLabel}
          </span>
        </div>

        <Button
          variant="ghost"
          size="icon"
          onClick={toggleTheme}
          className="h-8 w-8 text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-secondary)] hover:text-[var(--color-text-primary)]"
          title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
        >
          {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </Button>

        {isAuthenticated ? (
          <>
            <NotificationPanel countOnly />

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-9 w-9 rounded-full text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-secondary)] hover:text-[var(--color-text-primary)]"
                >
                  <User className="h-5 w-5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56 border-[var(--color-border)] bg-[var(--color-bg-secondary)]">
                <DropdownMenuLabel className="text-[var(--color-text-primary)]">
                  <div>
                    <p className="text-[13px] font-semibold">{user?.name || "User"}</p>
                    <p className="text-[11px] font-normal text-[var(--color-text-tertiary)]">{user?.email || user?.username} · {roleLabel(user?.role)}</p>
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator className="bg-[var(--color-border)]" />
                <DropdownMenuItem asChild className="text-[var(--color-text-secondary)] focus:bg-[var(--color-bg-tertiary)] focus:text-[var(--color-text-primary)]">
                  <Link to="/watchlist">Watchlist</Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild className="text-[var(--color-text-secondary)] focus:bg-[var(--color-bg-tertiary)] focus:text-[var(--color-text-primary)]">
                  <Link to="/portfolio">Portfolio</Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild className="text-[var(--color-text-secondary)] focus:bg-[var(--color-bg-tertiary)] focus:text-[var(--color-text-primary)]">
                  <Link to="/alerts">Price Alerts</Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild className="text-[var(--color-text-secondary)] focus:bg-[var(--color-bg-tertiary)] focus:text-[var(--color-text-primary)]">
                  <Link to="/settings">Settings</Link>
                </DropdownMenuItem>
                {isStaffRole(user?.role) && (
                  <DropdownMenuItem asChild className="text-[var(--color-text-secondary)] focus:bg-[var(--color-bg-tertiary)] focus:text-[var(--color-text-primary)]">
                    <Link to="/admin">Admin</Link>
                  </DropdownMenuItem>
                )}
                <DropdownMenuSeparator className="bg-[var(--color-border)]" />
                <DropdownMenuItem onClick={() => logout()} className="text-red-500 focus:bg-[var(--color-bg-tertiary)] focus:text-red-400">
                  Sign Out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        ) : (
          <>
            <Button asChild variant="ghost" size="sm" className="h-8 text-[13px] text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-secondary)] hover:text-[var(--color-text-primary)]">
              <Link to="/login">Sign in</Link>
            </Button>
            {/* Hidden on mobile, shown on sm and up */}
            <Button asChild size="sm" className="hidden sm:inline-flex h-8 bg-emerald-600 text-[13px] text-white hover:bg-emerald-700">
              <Link to="/register">Sign up</Link>
            </Button>
          </>
        )}
      </div>
    </header>
  );
}
