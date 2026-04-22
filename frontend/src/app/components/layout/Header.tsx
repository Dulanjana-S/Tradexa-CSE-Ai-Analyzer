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
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<Stock[]>([]);
  const [searchOpen, setSearchOpen] = useState(false);
  const trimmedQuery = useMemo(() => searchQuery.trim(), [searchQuery]);

  useEffect(() => {
    let alive = true;

    const refreshStatus = () => {
      marketApi
        .getOverview()
        .then((overview) => {
          if (alive) setMarketStatus(overview.marketStatus);
        })
        .catch(() => {
          if (alive) setMarketStatus("closed");
        });
    };

    refreshStatus();
    const intervalId = window.setInterval(refreshStatus, 30000);

    return () => {
      alive = false;
      window.clearInterval(intervalId);
    };
  }, []);

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

      <div className="flex min-w-[200px] items-center gap-2.5">
        <div className="flex h-7 w-7 items-center justify-center rounded-md bg-gradient-to-br from-emerald-500 to-emerald-600">
          <TrendingUp className="h-3.5 w-3.5 text-white" />
        </div>
        <span className="text-[15px] font-bold tracking-tight text-[var(--color-text-primary)]">TradexaLK</span>
      </div>

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

      <div className="flex items-center gap-3">
        <div className="hidden items-center gap-2 lg:flex">
          <div className="flex h-1.5 w-1.5 items-center justify-center">
            <div className={`h-1.5 w-1.5 rounded-full ${marketStatus === "open" ? "animate-pulse bg-emerald-500" : "bg-red-500"}`} />
          </div>
          <span className="text-[13px] font-medium text-[var(--color-text-secondary)]">
            Market {marketStatus === "open" ? "Open" : "Closed"}
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
                    <p className="text-[11px] font-normal text-[var(--color-text-tertiary)]">{user?.email || user?.username}</p>
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
                {user?.role === "admin" && (
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
            <Button asChild size="sm" className="h-8 bg-emerald-600 text-[13px] text-white hover:bg-emerald-700">
              <Link to="/register">Sign up</Link>
            </Button>
          </>
        )}
      </div>
    </header>
  );
}
