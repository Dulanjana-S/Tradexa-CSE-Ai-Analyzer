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
import { Link } from "react-router";
import { useTheme } from "../../contexts/ThemeContext";
import { useAuth } from "../../../lib/auth/AuthContext";
import { useEffect, useState } from "react";
import { marketApi } from "../../../lib/api/services";

interface HeaderProps {
  onMenuClick: () => void;
}

export function Header({ onMenuClick }: HeaderProps) {
  const { theme, toggleTheme } = useTheme();
  const { user, logout, isAuthenticated } = useAuth();
  const [marketStatus, setMarketStatus] = useState("closed");

  useEffect(() => {
    marketApi.getOverview().then((overview) => setMarketStatus(overview.marketStatus)).catch(() => setMarketStatus("closed"));
  }, []);

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
          placeholder="Search stocks, sectors, companies..."
          className="h-8 border-[var(--color-border)] bg-[var(--color-bg-primary)] pl-9 text-[13px] text-[var(--color-text-primary)] placeholder:text-[var(--color-text-tertiary)] focus-visible:border-emerald-500 focus-visible:ring-1 focus-visible:ring-emerald-500"
        />
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
