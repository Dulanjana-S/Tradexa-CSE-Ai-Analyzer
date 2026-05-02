import { Card, CardContent } from "../ui/card";
import { AlertCircle, FileX, Search } from "lucide-react";
import { Button } from "../ui/button";

interface EmptyStateProps {
  title?: string;
  description?: string;
  icon?: "search" | "empty" | "error";
  action?: {
    label: string;
    onClick: () => void;
  };
}

export function EmptyState({
  title = "No data available",
  description = "There is no data to display at this time.",
  icon = "empty",
  action,
}: EmptyStateProps) {
  const getIcon = () => {
    switch (icon) {
      case "search":
        return <Search className="h-12 w-12 text-slate-600" />;
      case "error":
        return <AlertCircle className="h-12 w-12 text-red-500" />;
      default:
        return <FileX className="h-12 w-12 text-slate-600" />;
    }
  };

  return (
    <Card className="bg-[#111823] border-[#1e2938] shadow-sm">
      <CardContent className="flex flex-col items-center justify-center py-16">
        <div className="w-20 h-20 rounded-full bg-[#0a0e14] border border-[#1e2938] flex items-center justify-center mb-4">
          {getIcon()}
        </div>
        <h3 className="text-lg font-semibold text-slate-300">{title}</h3>
        <p className="mt-2 text-sm text-slate-500 max-w-md text-center leading-relaxed">
          {description}
        </p>
        {action && (
          <Button
            onClick={action.onClick}
            className="mt-6 bg-emerald-600 hover:bg-emerald-700 text-white h-9 font-semibold"
          >
            {action.label}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}