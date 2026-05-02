import { Bell, X, TrendingUp, Info, CheckCircle2, Megaphone, Loader2 } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "../ui/sheet";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import { ScrollArea } from "../ui/scroll-area";
import { cn } from "../ui/utils";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router";
import { notificationsApi } from "../../../lib/api/services";
import type { Notification } from "../../../lib/api/types";

const notificationIcons = {
  price_alert: TrendingUp,
  announcement: Megaphone,
  system: Info,
  success: CheckCircle2,
};

const notificationColors = {
  price_alert: "text-yellow-500",
  announcement: "text-blue-500",
  system: "text-[#768390]",
  success: "text-emerald-500",
};

function normalizeType(type: string): keyof typeof notificationIcons {
  if (type === "price_alert" || type === "alert") return "price_alert";
  if (type === "announcement") return "announcement";
  if (type === "success") return "success";
  return "system";
}

function relativeTime(input?: string) {
  if (!input) return "Now";
  const value = new Date(input).getTime();
  if (Number.isNaN(value)) return input;
  const diffMs = Date.now() - value;
  const diffMin = Math.round(diffMs / 60000);
  if (diffMin < 1) return "Just now";
  if (diffMin < 60) return `${diffMin} minute${diffMin === 1 ? "" : "s"} ago`;
  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 24) return `${diffHr} hour${diffHr === 1 ? "" : "s"} ago`;
  const diffDay = Math.round(diffHr / 24);
  return `${diffDay} day${diffDay === 1 ? "" : "s"} ago`;
}

interface NotificationPanelProps {
  countOnly?: boolean;
}

export function NotificationPanel({ countOnly = false }: NotificationPanelProps) {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);

  const loadNotifications = async () => {
    setLoading(true);
    try {
      const rows = await notificationsApi.getAll();
      setNotifications(rows);
    } catch {
      setNotifications([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadNotifications();
    const timer = window.setInterval(loadNotifications, 60000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (open) loadNotifications();
  }, [open]);

  const unreadCount = useMemo(() => notifications.filter((item) => !item.isRead).length, [notifications]);

  const markAsRead = async (id: string) => {
    try {
      const rows = await notificationsApi.markAsRead(id);
      setNotifications(rows);
    } catch {
      setNotifications((prev) => prev.map((item) => (item.id === id ? { ...item, isRead: true } : item)));
    }
  };

  const markAllAsRead = async () => {
    try {
      const rows = await notificationsApi.markAllAsRead();
      setNotifications(rows);
    } catch {
      setNotifications((prev) => prev.map((item) => ({ ...item, isRead: true })));
    }
  };

  const trigger = (
    <Button
      variant="ghost"
      size="icon"
      className={cn(
        "relative text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-secondary)] hover:text-[var(--color-text-primary)]",
        countOnly ? "h-9 w-9" : "h-8 w-8 text-[#768390] hover:bg-[#161b22] hover:text-[#e6edf3]"
      )}
      title="Notifications"
    >
      <Bell className={countOnly ? "h-5 w-5" : "h-4 w-4"} />
      {unreadCount > 0 && (
        <Badge className={cn(
          "absolute -right-0.5 -top-0.5 flex items-center justify-center rounded-full bg-emerald-500 p-0 text-[11px] font-bold text-white hover:bg-emerald-500",
          countOnly ? "h-5 w-5" : "h-4 w-4 border-2 border-[#0d1117] text-[9px]"
        )}>
          {unreadCount > 99 ? "99+" : unreadCount}
        </Badge>
      )}
    </Button>
  );

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>{trigger}</SheetTrigger>
      <SheetContent className="w-full border-l border-[#30363d] bg-[#0d1117] p-0 sm:max-w-md">
        <SheetHeader className="border-b border-[#30363d] p-6">
          <div className="flex items-center justify-between">
            <SheetTitle className="text-[18px] font-bold text-[#e6edf3]">Notifications</SheetTitle>
            {unreadCount > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={markAllAsRead}
                className="h-7 text-[11px] text-emerald-500 hover:bg-[#161b22] hover:text-emerald-400"
              >
                Mark all read
              </Button>
            )}
          </div>
          {unreadCount > 0 && (
            <p className="text-[13px] text-[#768390]">
              You have {unreadCount} unread notification{unreadCount !== 1 ? "s" : ""}
            </p>
          )}
        </SheetHeader>

        <ScrollArea className="h-[calc(100vh-120px)]">
          <div className="divide-y divide-[#30363d]">
            {loading ? (
              <div className="flex flex-col items-center justify-center gap-3 py-16 text-[#768390]">
                <Loader2 className="h-8 w-8 animate-spin" />
                <p className="text-[13px]">Loading notifications...</p>
              </div>
            ) : notifications.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-3 py-16">
                <Bell className="h-12 w-12 text-[#545d68]" />
                <p className="text-[13px] text-[#768390]">No notifications</p>
              </div>
            ) : (
              notifications.map((notification) => {
                const normalizedType = normalizeType(notification.type);
                const Icon = notificationIcons[normalizedType];
                const iconColor = notificationColors[normalizedType];
                const linkTo = notification.link || (notification.symbol ? `/stock/${notification.symbol}` : "/alerts");

                return (
                  <div
                    key={notification.id}
                    className={cn(
                      "group relative flex gap-3 p-4 transition-colors hover:bg-[#161b22]",
                      !notification.isRead && "bg-[#161b22]/50"
                    )}
                  >
                    {!notification.isRead && <div className="absolute left-0 top-0 h-full w-1 bg-emerald-500" />}

                    <div className={cn("flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-md bg-[#0d1117]", iconColor)}>
                      <Icon className="h-4 w-4" />
                    </div>

                    <div className="flex-1 space-y-1">
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-[13px] font-semibold text-[#e6edf3]">{notification.title}</p>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => markAsRead(notification.id)}
                          className="h-6 w-6 opacity-0 transition-opacity group-hover:opacity-100"
                        >
                          <X className="h-3 w-3 text-[#768390]" />
                        </Button>
                      </div>
                      <p className="text-[12px] text-[#768390]">{notification.message}</p>
                      <div className="flex items-center gap-3">
                        <span className="text-[11px] text-[#545d68]">{relativeTime(notification.createdAt)}</span>
                        {!notification.isRead && (
                          <button onClick={() => markAsRead(notification.id)} className="text-[11px] text-emerald-500 hover:text-emerald-400">
                            Mark as read
                          </button>
                        )}
                        <Link to={linkTo} className="text-[11px] text-blue-400 hover:text-blue-300">
                          Open
                        </Link>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}
