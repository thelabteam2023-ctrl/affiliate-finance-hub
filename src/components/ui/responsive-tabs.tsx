import * as React from "react";
import * as TabsPrimitive from "@radix-ui/react-tabs";
import { MoreHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

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

  // Measure available space and tab widths
  const calculateVisibleTabs = React.useCallback(() => {
    if (!containerRef.current || !measureRef.current) return;

    const containerWidth = containerRef.current.offsetWidth;
    const children = measureRef.current.children;
    
    // Reserve space for overflow button (approx 80px) and extra content (approx 120px)
    const reservedSpace = extraContent ? 200 : 80;
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
        className="absolute opacity-0 pointer-events-none flex gap-8 -z-10"
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
          "inline-flex h-12 items-center justify-start gap-8 border-b border-border relative",
          className,
        )}
        {...props}
      >
        {visibleTabs.map((tab) => (
          <TabsPrimitive.Trigger
            key={tab.value}
            value={tab.value}
            className="inline-flex items-center justify-center gap-2 whitespace-nowrap px-4 py-3 text-sm font-medium text-muted-foreground transition-colors duration-200 hover:text-foreground relative data-[state=active]:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 shrink-0"
          >
            {tab.icon}
            {tab.label}
          </TabsPrimitive.Trigger>
        ))}

        {/* Overflow menu - simple dropdown, NO scroll */}
        {hasOverflow && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                className={cn(
                  "inline-flex items-center justify-center gap-1.5 whitespace-nowrap px-3 py-2 text-sm font-medium transition-colors shrink-0 rounded-md",
                  activeInOverflow 
                    ? "text-foreground bg-accent" 
                    : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                )}
              >
                <MoreHorizontal className="h-4 w-4" />
                <span>Mais</span>
                {activeInOverflow && (
                  <span className="ml-1 text-xs bg-primary/20 text-primary px-1.5 py-0.5 rounded">
                    {overflowTabs.find(t => t.value === activeTab)?.label}
                  </span>
                )}
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent 
              align="end" 
              sideOffset={8}
              className="min-w-[160px] bg-popover"
            >
              {overflowTabs.map((tab) => (
                <DropdownMenuItem
                  key={tab.value}
                  onClick={() => onTabChange(tab.value)}
                  className={cn(
                    "flex items-center gap-2 cursor-pointer",
                    activeTab === tab.value && "bg-accent font-medium"
                  )}
                >
                  {tab.icon}
                  {tab.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
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
