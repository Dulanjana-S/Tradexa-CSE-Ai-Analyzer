import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { Button } from "../ui/button";

interface ErrorStateProps {
  title?: string;
  message: string;
  onRetry?: () => void;
  variant?: "card" | "inline";
}

export function ErrorState({
  title = "Error Loading Data",
  message,
  onRetry,
  variant = "card",
}: ErrorStateProps) {
  if (variant === "inline") {
    return (
      <div className="p-4 rounded-lg bg-red-500/10 border border-red-500/30 flex items-start gap-3">
        <AlertTriangle className="h-5 w-5 text-red-500 flex-shrink-0 mt-0.5" />
        <div className="flex-1">
          <p className="text-sm font-semibold text-red-400">{title}</p>
          <p className="text-sm text-red-400/90 mt-1">{message}</p>
        </div>
        {onRetry && (
          <Button
            variant="outline"
            size="sm"
            onClick={onRetry}
            className="border-red-500/40 text-red-400 hover:bg-red-500/10 hover:border-red-500/50 h-8"
          >
            <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
            Retry
          </Button>
        )}
      </div>
    );
  }

  return (
    <Card className="bg-[#111823] border-red-700/40 shadow-sm">
      <CardHeader className="pb-4">
        <CardTitle className="flex items-center gap-2.5 text-red-400 text-lg">
          <AlertTriangle className="h-5 w-5" />
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-slate-300 text-sm">{message}</p>
        {onRetry && (
          <Button
            onClick={onRetry}
            variant="outline"
            className="border-red-700/40 text-red-400 hover:bg-red-500/10 hover:border-red-700/50 h-9"
          >
            <RefreshCw className="h-4 w-4 mr-2" />
            Try Again
          </Button>
        )}
      </CardContent>
    </Card>
  );
}