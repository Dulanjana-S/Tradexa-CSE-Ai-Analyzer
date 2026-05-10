import { AlertCircle, CheckCircle2, Info, X, XCircle } from "lucide-react";
import { cn } from "../ui/utils";

type AlertVariant = "info" | "success" | "warning" | "danger";

interface AlertProps {
  variant?: AlertVariant;
  title?: string;
  message: string;
  dismissible?: boolean;
  onDismiss?: () => void;
  className?: string;
}

/**
 * Alert Component
 * 
 * A reusable alert banner component for displaying notifications and messages.
 * Follows TradexaLK Design System specifications.
 * 
 * @example
 * ```tsx
 * <Alert
 *   variant="success"
 *   title="Success"
 *   message="Your changes have been saved successfully."
 *   dismissible
 *   onDismiss={() => setShowAlert(false)}
 * />
 * ```
 */
export function Alert({
  variant = "info",
  title,
  message,
  dismissible = false,
  onDismiss,
  className,
}: AlertProps) {
  const variants = {
    info: {
      container: "bg-[var(--info-bg)] border border-[var(--info-border)]",
      icon: "text-[var(--info-text)]",
      title: "text-[var(--info-text)] opacity-90",
      message: "text-[var(--info-text)] opacity-80",
      IconComponent: Info,
    },
    success: {
      container: "bg-[var(--success-bg)] border border-[var(--success-border)]",
      icon: "text-[var(--success-text)]",
      title: "text-[var(--success-text)] opacity-90",
      message: "text-[var(--success-text)] opacity-80",
      IconComponent: CheckCircle2,
    },
    warning: {
      container: "bg-[var(--warning-bg)] border border-[var(--warning-border)]",
      icon: "text-[var(--warning-text)]",
      title: "text-[var(--warning-text)] opacity-90",
      message: "text-[var(--warning-text)] opacity-80",
      IconComponent: AlertCircle,
    },
    danger: {
      container: "bg-[var(--danger-bg)] border border-[var(--danger-border)]",
      icon: "text-[var(--danger-text)]",
      title: "text-[var(--danger-text)] opacity-90",
      message: "text-[var(--danger-text)] opacity-80",
      IconComponent: XCircle,
    },
  };

  const variantStyles = variants[variant];
  const IconComponent = variantStyles.IconComponent;

  return (
    <div className={cn(variantStyles.container, "rounded-lg p-4 flex items-start gap-3", className)}>
      <IconComponent className={cn("h-5 w-5 flex-shrink-0 mt-0.5", variantStyles.icon)} />
      <div className="flex-1 min-w-0">
        {title && (
          <h4 className={cn("text-sm font-semibold mb-1", variantStyles.title)}>
            {title}
          </h4>
        )}
        <p className={cn("text-sm", variantStyles.message)}>{message}</p>
      </div>
      {dismissible && onDismiss && (
        <button
          onClick={onDismiss}
          className="ml-auto -mt-0.5 -mr-1 p-1 rounded hover:bg-white/10 transition-colors flex-shrink-0"
          aria-label="Dismiss alert"
        >
          <X className="w-4 h-4" />
        </button>
      )}
    </div>
  );
}
