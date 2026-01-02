import * as React from "react";
import * as TabsPrimitive from "@radix-ui/react-tabs";
import { MoreHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";

interface TabItem {
  value: string;
  label: string;
  icon?: React.ReactNode;
}

interface ResponsiveTabsListProps extends React.ComponentPropsWithoutRef<typeof TabsPrimitive.List> {
  tabs: TabItem[];
  activeTab: string;
  onTabChange: (value: string) => void;
  accentColor?: string;
  /** Extra content to render after tabs (e.g., dropdown menus) */
  extraContent?: React.ReactNode;
  /** Minimum tabs to always show before overflow */
  minVisibleTabs?: number;
}

const ResponsiveTabsList = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.List>,
  ResponsiveTabsListProps
>(({ 
  className, 
  tabs, 
  activeTab, 
  onTabChange, 
  accentColor = "bg-primary",
  extraContent,
  minVisibleTabs = 3,
  ...props 
}, ref) => {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const measureRef = React.useRef<HTMLDivElement>(null);
  const [visibleCount, setVisibleCount] = React.useState(tabs.length);
  const [underlineStyle, setUnderlineStyle] = React.useState({ left: 0, width: 0 });
  const [overflowOpen, setOverflowOpen] = React.useState(false);

  // Measure available space and tab widths
  const calculateVisibleTabs = React.useCallback(() => {
    if (!containerRef.current || !measureRef.current) return;

    const containerWidth = containerRef.current.offsetWidth;
    const children = measureRef.current.children;
    
    // Reserve space for overflow button (approx 60px) and extra content (approx 120px)
    const reservedSpace = extraContent ? 180 : 60;
    const availableWidth = containerWidth - reservedSpace;
    
    let totalWidth = 0;
    let count = 0;
    
    for (let i = 0; i < children.length && i < tabs.length; i++) {
      const child = children[i] as HTMLElement;
      const width = child.offsetWidth + 32; // Add gap
      
      if (totalWidth + width <= availableWidth || count < minVisibleTabs) {
        totalWidth += width;
        count++;
      } else {
        break;
      }
    }
    
    setVisibleCount(Math.max(minVisibleTabs, Math.min(count, tabs.length)));
  }, [tabs.length, extraContent, minVisibleTabs]);

  // Update underline position
  const updateUnderline = React.useCallback(() => {
    if (!containerRef.current) return;
    
    const activeElement = containerRef.current.querySelector('[data-state="active"]');
    if (activeElement) {
      const containerRect = containerRef.current.getBoundingClientRect();
      const tabRect = activeElement.getBoundingClientRect();
      setUnderlineStyle({
        left: tabRect.left - containerRect.left,
        width: tabRect.width,
      });
    }
  }, []);

  // Recalculate on mount and resize
  React.useEffect(() => {
    calculateVisibleTabs();
    
    const resizeObserver = new ResizeObserver(() => {
      calculateVisibleTabs();
      updateUnderline();
    });
    
    if (containerRef.current) {
      resizeObserver.observe(containerRef.current);
    }
    
    window.addEventListener('resize', calculateVisibleTabs);
    
    return () => {
      resizeObserver.disconnect();
      window.removeEventListener('resize', calculateVisibleTabs);
    };
  }, [calculateVisibleTabs, updateUnderline]);

  // Update underline when active tab changes
  React.useEffect(() => {
    // Delay to ensure DOM is updated
    const timeout = setTimeout(updateUnderline, 50);
    return () => clearTimeout(timeout);
  }, [activeTab, visibleCount, updateUnderline]);

  const visibleTabs = tabs.slice(0, visibleCount);
  const overflowTabs = tabs.slice(visibleCount);
  const hasOverflow = overflowTabs.length > 0;

  // Check if active tab is in overflow
  const activeInOverflow = overflowTabs.some(t => t.value === activeTab);

  return (
    <>
      {/* Hidden measure container */}
      <div 
        ref={measureRef} 
        className="absolute opacity-0 pointer-events-none flex gap-8"
        aria-hidden="true"
      >
        {tabs.map((tab) => (
          <span
            key={tab.value}
            className="inline-flex items-center gap-2 whitespace-nowrap px-4 py-3 text-sm font-medium"
          >
            {tab.icon}
            {tab.label}
          </span>
        ))}
      </div>

      {/* Actual tabs container */}
      <TabsPrimitive.List
        ref={(node) => {
          containerRef.current = node;
          if (typeof ref === 'function') ref(node);
          else if (ref) ref.current = node;
        }}
        className={cn(
          "inline-flex h-12 items-center justify-start gap-8 border-b border-border relative overflow-hidden",
          className,
        )}
        {...props}
      >
        {visibleTabs.map((tab) => (
          <TabsPrimitive.Trigger
            key={tab.value}
            value={tab.value}
            className={cn(
              "inline-flex items-center justify-center gap-2 whitespace-nowrap px-4 py-3 text-sm font-medium text-muted-foreground transition-colors duration-200 hover:text-foreground relative data-[state=active]:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 shrink-0"
            )}
          >
            {tab.icon}
            {tab.label}
          </TabsPrimitive.Trigger>
        ))}

        {/* Overflow menu */}
        {hasOverflow && (
          <Popover open={overflowOpen} onOpenChange={setOverflowOpen}>
            <PopoverTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className={cn(
                  "h-9 px-3 gap-1 text-sm font-medium shrink-0",
                  activeInOverflow 
                    ? "text-foreground" 
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                <MoreHorizontal className="h-4 w-4" />
                <span className="hidden sm:inline">Mais</span>
                {activeInOverflow && (
                  <span className="ml-1 text-xs bg-primary/20 text-primary px-1.5 py-0.5 rounded">
                    {overflowTabs.find(t => t.value === activeTab)?.label}
                  </span>
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent 
              align="end" 
              className="w-48 p-1 bg-popover"
              sideOffset={8}
            >
              <div className="flex flex-col">
                {overflowTabs.map((tab) => (
                  <button
                    key={tab.value}
                    onClick={() => {
                      onTabChange(tab.value);
                      setOverflowOpen(false);
                    }}
                    className={cn(
                      "flex items-center gap-2 w-full px-3 py-2 text-sm rounded-md transition-colors text-left",
                      activeTab === tab.value
                        ? "bg-accent text-accent-foreground font-medium"
                        : "text-muted-foreground hover:text-foreground hover:bg-muted"
                    )}
                  >
                    {tab.icon}
                    {tab.label}
                  </button>
                ))}
              </div>
            </PopoverContent>
          </Popover>
        )}

        {/* Extra content (dropdowns, etc) */}
        {extraContent}

        {/* Animated underline - only show if active tab is visible */}
        {!activeInOverflow && (
          <span
            className={cn("absolute bottom-0 h-0.5 transition-all duration-300 ease-out", accentColor)}
            style={{
              left: `${underlineStyle.left}px`,
              width: `${underlineStyle.width}px`,
            }}
          />
        )}
      </TabsPrimitive.List>
    </>
  );
});

ResponsiveTabsList.displayName = "ResponsiveTabsList";

export { ResponsiveTabsList };
export type { TabItem };
