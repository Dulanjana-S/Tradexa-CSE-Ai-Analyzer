import { NavLink } from "react-router";
import {
  LayoutDashboard,
  TrendingUp,
  Filter,
  Megaphone,
  Star,
  Bell,
  BriefcaseBusiness,
  Settings,
  Brain,
  Database,
  FileText,
  Users,
  Activity,
  Shield,
  BellRing,
} from "lucide-react";
import { cn } from "../ui/utils";
import { Separator } from "../ui/separator";
import { useAuth } from "../../../lib/auth/AuthContext";

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
}

// User navigation items
const userNavItems = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard },
  { to: "/markets", label: "Markets", icon: TrendingUp },
  { to: "/screener", label: "Screener", icon: Filter },
  { to: "/announcements", label: "Announcements", icon: Megaphone },
  { to: "/watchlist", label: "Watchlist", icon: Star },
  { to: "/portfolio", label: "Portfolio", icon: BriefcaseBusiness },
  { to: "/alerts", label: "Alerts", icon: Bell },
];

const userBottomItems = [
  { to: "/settings", label: "Settings", icon: Settings },
];

// Admin navigation items
const adminNavItems = [
  { to: "/admin", label: "Dashboard", icon: LayoutDashboard },
  { to: "/admin/models", label: "Models", icon: Brain },
  { to: "/admin/sync", label: "Sync / Training", icon: Database },
  { to: "/admin/jobs", label: "Jobs / Logs", icon: FileText },
  { to: "/admin/users", label: "Users", icon: Users },
  { to: "/admin/announcements", label: "Announcement Triage", icon: Megaphone },
  { to: "/admin/alerts", label: "Alert Monitor", icon: BellRing },
  { to: "/admin/settings", label: "System Settings", icon: Shield },
];

export function Sidebar({ isOpen, onClose }: SidebarProps) {
  const { isAdmin } = useAuth();

  return (
    <>
      {/* Mobile Overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/70 backdrop-blur-sm lg:hidden"
          onClick={onClose}
        />
      )}
      
      {/* Sidebar */}
      <aside
        className={cn(
          "fixed z-50 h-full w-56 overflow-y-auto border-r border-[var(--color-border)] bg-[var(--color-bg-primary)] shadow-xl transition-all duration-300 lg:relative",
          isOpen ? "translate-x-0" : "-translate-x-full lg:w-14 lg:translate-x-0"
        )}
      >
        <nav className="flex h-full flex-col gap-0.5 p-2">
          {/* User Navigation Section */}
          <div className={cn("px-3 py-3 transition-opacity", isOpen ? "opacity-100" : "opacity-0 lg:hidden")}>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--color-text-tertiary)]">
              Main Menu
            </p>
          </div>

          <div className="flex-1 space-y-0.5">
            {userNavItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === "/"}
                className={({ isActive }) =>
                  cn(
                    "group flex items-center gap-3 rounded-md px-3 py-2 text-[13px] font-semibold transition-all duration-150",
                    isActive
                      ? "bg-[var(--color-bg-secondary)] text-[var(--color-text-primary)] shadow-sm ring-1 ring-[var(--color-border)]"
                      : "text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-secondary)] hover:text-[var(--color-text-primary)]"
                  )
                }
              >
                <item.icon className="h-4 w-4 flex-shrink-0" />
                <span className={cn("whitespace-nowrap transition-opacity", isOpen ? "opacity-100" : "opacity-0 lg:hidden")}>
                  {item.label}
                </span>
              </NavLink>
            ))}
          </div>

          {/* Admin Navigation Section (only for admins) */}
          {isAdmin && (
            <>
              <Separator className="my-2 bg-[var(--color-border)]" />
              <div className={cn("px-3 py-3 transition-opacity", isOpen ? "opacity-100" : "opacity-0 lg:hidden")}>
                <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--color-text-tertiary)]">
                  Admin Panel
                </p>
              </div>
              <div className="space-y-0.5">
                {adminNavItems.map((item) => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    className={({ isActive }) =>
                      cn(
                        "group flex items-center gap-3 rounded-md px-3 py-2 text-[13px] font-semibold transition-all duration-150",
                        isActive
                          ? "bg-[var(--color-bg-secondary)] text-[var(--color-text-primary)] shadow-sm ring-1 ring-[var(--color-border)]"
                          : "text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-secondary)] hover:text-[var(--color-text-primary)]"
                      )
                    }
                  >
                    <item.icon className="h-4 w-4 flex-shrink-0" />
                    <span className={cn("whitespace-nowrap transition-opacity", isOpen ? "opacity-100" : "opacity-0 lg:hidden")}>
                      {item.label}
                    </span>
                  </NavLink>
                ))}
              </div>
            </>
          )}

          {/* Bottom Navigation (Settings) */}
          <Separator className="my-2 bg-[var(--color-border)]" />
          {userBottomItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                cn(
                  "group flex items-center gap-3 rounded-md px-3 py-2 text-[13px] font-semibold transition-all duration-150",
                  isActive
                    ? "bg-[var(--color-bg-secondary)] text-[var(--color-text-primary)] shadow-sm ring-1 ring-[var(--color-border)]"
                    : "text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-secondary)] hover:text-[var(--color-text-primary)]"
                )
              }
            >
              <item.icon className="h-4 w-4 flex-shrink-0" />
              <span className={cn("whitespace-nowrap transition-opacity", isOpen ? "opacity-100" : "opacity-0 lg:hidden")}>
                {item.label}
              </span>
            </NavLink>
          ))}
        </nav>
      </aside>
    </>
  );
}