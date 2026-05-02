import { AlertCircle, Info, RefreshCw } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../ui/card";
import { Button } from "../ui/button";

interface StatePanelProps {
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
  variant?: "error" | "empty";
  compact?: boolean;
}

export function StatePanel({
  title,
  description,
  actionLabel = "Retry",
  onAction,
  variant = "error",
  compact = false,
}: StatePanelProps) {
  const Icon = variant === "error" ? AlertCircle : Info;

  return (
    <Card className="border-[var(--color-border)] bg-[var(--color-bg-secondary)] shadow-none">
      <CardHeader className={compact ? "pb-2" : undefined}>
        <CardTitle className="flex items-center gap-2 text-[var(--color-text-primary)]">
          <Icon className="h-5 w-5 text-amber-400" />
          {title}
        </CardTitle>
        <CardDescription className="text-[var(--color-text-secondary)]">{description}</CardDescription>
      </CardHeader>
      {onAction ? (
        <CardContent>
          <Button variant="outline" onClick={onAction} className="border-[var(--color-border)]">
            <RefreshCw className="mr-2 h-4 w-4" />
            {actionLabel}
          </Button>
        </CardContent>
      ) : null}
    </Card>
  );
}
