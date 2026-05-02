import { LucideIcon } from "lucide-react";
import { Button } from "../ui/button";

interface EmptyStateProps {
  icon?: LucideIcon;
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
  size?: "sm" | "md" | "lg";
}

/**
 * EmptyState Component
 * 
 * A reusable empty state component for displaying when no data is available.
 * Follows TradexaLK Design System specifications.
 * 
 * @example
 * ```tsx
 * import { FileX } from "lucide-react";
 * 
 * <EmptyState
 *   icon={FileX}
 *   title="No stocks found"
 *   description="Try adjusting your filters to see more results"
 *   actionLabel="Reset Filters"
 *   onAction={() => resetFilters()}
 * />
 * ```
 */
export function EmptyState({
  icon: Icon,
  title,
  description,
  actionLabel,
  onAction,
  size = "md",
}: EmptyStateProps) {
  const sizeClasses = {
    sm: {
      container: "py-8 sm:py-12",
      iconContainer: "w-10 h-10 sm:w-12 sm:h-12",
      icon: "w-5 h-5 sm:w-6 sm:h-6",
      title: "text-base sm:text-lg",
      description: "text-xs sm:text-sm",
    },
    md: {
      container: "py-12 sm:py-16 lg:py-20",
      iconContainer: "w-12 h-12 sm:w-16 sm:h-16",
      icon: "w-6 h-6 sm:w-8 sm:h-8",
      title: "text-lg sm:text-xl",
      description: "text-sm",
    },
    lg: {
      container: "py-16 sm:py-20 lg:py-24",
      iconContainer: "w-16 h-16 sm:w-20 sm:h-20",
      icon: "w-8 h-8 sm:w-10 sm:h-10",
      title: "text-xl sm:text-2xl",
      description: "text-base",
    },
  };

  const classes = sizeClasses[size];

  return (
    <div className={`flex flex-col items-center justify-center ${classes.container}`}>
      {Icon && (
        <div
          className={`${classes.iconContainer} rounded-full bg-[#1e2938] flex items-center justify-center mb-4`}
        >
          <Icon className={`${classes.icon} text-slate-500`} />
        </div>
      )}
      <h3 className={`${classes.title} font-semibold text-slate-300 mb-2`}>
        {title}
      </h3>
      <p className={`${classes.description} text-slate-500 text-center max-w-sm mb-6`}>
        {description}
      </p>
      {actionLabel && onAction && (
        <Button
          onClick={onAction}
          className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg font-semibold"
        >
          {actionLabel}
        </Button>
      )}
    </div>
  );
}
