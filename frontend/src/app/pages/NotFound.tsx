import { useNavigate } from "react-router";
import { Home, Search, TrendingUp, ArrowLeft } from "lucide-react";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";

/**
 * NotFound (404) Page
 * 
 * Displayed when users navigate to a non-existent route.
 * Provides helpful navigation options to get back on track.
 */
export function NotFound() {
  const navigate = useNavigate();

  const popularPages = [
    { name: "Dashboard", path: "/", icon: Home },
    { name: "Markets", path: "/markets", icon: TrendingUp },
    { name: "Stock Screener", path: "/screener", icon: Search },
    { name: "Watchlist", path: "/watchlist", icon: TrendingUp },
  ];

  return (
    <div className="min-h-screen bg-[var(--color-bg-primary)] flex items-center justify-center p-4">
      <div className="max-w-2xl w-full text-center space-y-8">
        {/* 404 Visual */}
        <div className="space-y-4">
          <div className="flex items-center justify-center gap-4">
            <div className="text-8xl sm:text-9xl font-bold text-slate-800 tracking-tighter">
              4
            </div>
            <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-gradient-to-br from-emerald-500 to-emerald-600 flex items-center justify-center animate-pulse">
              <TrendingUp className="h-8 w-8 sm:h-10 sm:w-10 text-white" />
            </div>
            <div className="text-8xl sm:text-9xl font-bold text-slate-800 tracking-tighter">
              4
            </div>
          </div>
          
          <h1 className="text-2xl sm:text-3xl font-bold text-slate-50">
            Page Not Found
          </h1>
          <p className="text-sm sm:text-base text-[var(--color-text-tertiary)] max-w-md mx-auto">
            The page you're looking for doesn't exist or has been moved. Let's get you back on track.
          </p>
        </div>

        {/* Search */}
        <div className="max-w-md mx-auto">
          <div className="relative">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
            <Input
              type="text"
              placeholder="Search for stocks, sectors, companies..."
              className="pl-10 bg-[var(--color-bg-secondary)] border-[var(--color-border)] h-11"
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  navigate("/screener");
                }
              }}
            />
          </div>
        </div>

        {/* Actions */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
          <Button
            onClick={() => navigate(-1)}
            variant="outline"
            className="w-full sm:w-auto"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Go Back
          </Button>
          <Button
            onClick={() => navigate("/")}
            className="bg-emerald-600 hover:bg-emerald-700 w-full sm:w-auto"
          >
            <Home className="h-4 w-4 mr-2" />
            Go to Dashboard
          </Button>
        </div>

        {/* Popular Pages */}
        <div className="pt-8 border-t border-[var(--color-border)]">
          <h3 className="text-sm font-semibold text-[var(--color-text-tertiary)] uppercase tracking-wider mb-4">
            Popular Pages
          </h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {popularPages.map((page) => {
              const Icon = page.icon;
              return (
                <button
                  key={page.path}
                  onClick={() => navigate(page.path)}
                  className="flex flex-col items-center gap-2 p-4 rounded-lg bg-[var(--color-bg-secondary)] border border-[var(--color-border)] hover:bg-[var(--color-border)] hover:border-emerald-600/30 transition-colors group"
                >
                  <Icon className="h-5 w-5 text-[var(--color-text-tertiary)] group-hover:text-emerald-500 transition-colors" />
                  <span className="text-xs font-semibold text-[var(--color-text-secondary)] group-hover:text-[var(--color-text-primary)]">
                    {page.name}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Help Text */}
        <p className="text-xs text-slate-600">
          If you believe this is an error, please contact support.
        </p>
      </div>
    </div>
  );
}
