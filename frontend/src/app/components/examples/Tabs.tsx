import { ReactNode } from "react";
import { cn } from "../ui/utils";

interface TabsProps {
  value: string;
  onValueChange: (value: string) => void;
  children: ReactNode;
  className?: string;
}

interface TabsListProps {
  children: ReactNode;
  className?: string;
}

interface TabsTriggerProps {
  value: string;
  children: ReactNode;
  className?: string;
}

interface TabsContentProps {
  value: string;
  children: ReactNode;
  className?: string;
}

/**
 * Tabs Component System
 * 
 * A complete tabs implementation following TradexaLK Design System.
 * Fully composable and accessible.
 * 
 * @example
 * ```tsx
 * const [activeTab, setActiveTab] = useState("overview");
 * 
 * <Tabs value={activeTab} onValueChange={setActiveTab}>
 *   <TabsList>
 *     <TabsTrigger value="overview">Overview</TabsTrigger>
 *     <TabsTrigger value="analysis">Analysis</TabsTrigger>
 *     <TabsTrigger value="financials">Financials</TabsTrigger>
 *   </TabsList>
 *   <TabsContent value="overview">
 *     <p>Overview content...</p>
 *   </TabsContent>
 *   <TabsContent value="analysis">
 *     <p>Analysis content...</p>
 *   </TabsContent>
 *   <TabsContent value="financials">
 *     <p>Financials content...</p>
 *   </TabsContent>
 * </Tabs>
 * ```
 */

// Context to share state between components
import { createContext, useContext } from "react";

const TabsContext = createContext<{
  value: string;
  onValueChange: (value: string) => void;
} | null>(null);

function useTabsContext() {
  const context = useContext(TabsContext);
  if (!context) {
    throw new Error("Tabs components must be used within a Tabs provider");
  }
  return context;
}

/**
 * Tabs Root Component
 */
export function Tabs({ value, onValueChange, children, className }: TabsProps) {
  return (
    <TabsContext.Provider value={{ value, onValueChange }}>
      <div className={cn("w-full", className)}>{children}</div>
    </TabsContext.Provider>
  );
}

/**
 * TabsList Component
 * 
 * Container for tab triggers.
 */
export function TabsList({ children, className }: TabsListProps) {
  return (
    <div
      role="tablist"
      className={cn("border-b border-[var(--color-border)] flex gap-1 overflow-x-auto", className)}
    >
      {children}
    </div>
  );
}

/**
 * TabsTrigger Component
 * 
 * Individual tab button.
 */
export function TabsTrigger({ value, children, className }: TabsTriggerProps) {
  const { value: activeValue, onValueChange } = useTabsContext();
  const isActive = activeValue === value;

  return (
    <button
      role="tab"
      aria-selected={isActive}
      onClick={() => onValueChange(value)}
      className={cn(
        "px-4 py-2.5 text-sm font-semibold transition-colors whitespace-nowrap",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0a0e14]",
        isActive
          ? "text-emerald-500 border-b-2 border-emerald-500 bg-[var(--color-border)]/30"
          : "text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-border)]/50 rounded-t-lg",
        className
      )}
    >
      {children}
    </button>
  );
}

/**
 * TabsContent Component
 * 
 * Content panel for each tab.
 */
export function TabsContent({ value, children, className }: TabsContentProps) {
  const { value: activeValue } = useTabsContext();

  if (activeValue !== value) {
    return null;
  }

  return (
    <div role="tabpanel" className={cn("pt-6", className)}>
      {children}
    </div>
  );
}
