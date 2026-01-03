import * as React from "react";
import * as TabsPrimitive from "@radix-ui/react-tabs";
import { ChevronRight, MoreHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
  DropdownMenuPortal,
} from "@/components/ui/dropdown-menu";

interface TabItem {
  value: string;
  label: string;
  icon?: React.ReactNode;
}

interface TabGroup {
  label: string;
  icon?: React.ReactNode;
  items: TabItem[];
}

interface ResponsiveTabsListProps
  extends React.ComponentPropsWithoutRef<typeof TabsPrimitive.List> {
  tabs: TabItem[];
  activeTab: string;
  onTabChange: (value: string) => void;
  accentColor?: string;
  /** Extra content to render after tabs (e.g., dropdown menus) */
  extraContent?: React.ReactNode;
  /** Groups that appear as dropdowns - when in overflow, become submenus */
  tabGroups?: TabGroup[];
  /** Minimum tabs to always show before overflow */
  minVisibleTabs?: number;
}

const OVERFLOW_TRIGGER_RESERVED_PX = 72; // used only when overflow exists
const TAB_GAP_PX = 32; // matches gap-8

const ResponsiveTabsList = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.List>,
  ResponsiveTabsListProps
>(
  (
    {
      className,
      tabs,
      activeTab,
      onTabChange,
      accentColor = "bg-primary",
      extraContent,
      tabGroups = [],
      minVisibleTabs = 3,
      ...props
    },
    ref,
  ) => {
    const containerRef = React.useRef<HTMLDivElement>(null);
    const measureRef = React.useRef<HTMLDivElement>(null);
    const extraRef = React.useRef<HTMLDivElement>(null);

    const [visibleCount, setVisibleCount] = React.useState(() =>
      Math.min(tabs.length, minVisibleTabs),
    );
    const [showGroups, setShowGroups] = React.useState(true);
    const [underlineStyle, setUnderlineStyle] = React.useState({ left: 0, width: 0 });

    // Check if active tab is in any group
    const activeGroupItem = tabGroups.flatMap(g => g.items).find(item => item.value === activeTab);

    const calculateVisibleTabs = React.useCallback(() => {
      if (!containerRef.current || !measureRef.current) return;

      const containerWidth = containerRef.current.offsetWidth;
      const children = measureRef.current.children;
      const extraWidth = extraContent ? (extraRef.current?.offsetWidth ?? 0) : 0;
      
      // Estimate group dropdown widths (approx 100px each)
      const groupsWidth = tabGroups.length * 100;

      const computeCount = (availableWidth: number, includeGroups: boolean) => {
        let totalWidth = includeGroups ? groupsWidth : 0;
        let count = 0;

        for (let i = 0; i < children.length && i < tabs.length; i++) {
          const child = children[i] as HTMLElement;
          const width = child.offsetWidth + TAB_GAP_PX;

          if (count < minVisibleTabs || totalWidth + width <= availableWidth) {
            totalWidth += width;
            count++;
          } else {
            break;
          }
        }

        return Math.min(Math.max(count, minVisibleTabs), tabs.length);
      };

      // Pass 1: assume there is NO overflow trigger, groups visible
      const availableNoOverflow = Math.max(0, containerWidth - extraWidth);
      const countNoOverflow = computeCount(availableNoOverflow, true);

      if (countNoOverflow >= tabs.length) {
        setVisibleCount(tabs.length);
        setShowGroups(true);
        return;
      }

      // Pass 2: overflow exists, reserve space for "Mais", still try to show groups
      const availableWithOverflow = Math.max(
        0,
        containerWidth - extraWidth - OVERFLOW_TRIGGER_RESERVED_PX,
      );
      const countWithGroups = computeCount(availableWithOverflow, true);
      
      // Pass 3: if still not enough, hide groups too
      const countWithoutGroups = computeCount(availableWithOverflow, false);
      
      if (countWithGroups >= minVisibleTabs) {
        setVisibleCount(countWithGroups);
        setShowGroups(true);
      } else {
        setVisibleCount(countWithoutGroups);
        setShowGroups(false);
      }
    }, [tabs.length, extraContent, tabGroups.length, minVisibleTabs]);

    const updateUnderline = React.useCallback(() => {
      if (!containerRef.current) return;

      const activeElement = containerRef.current.querySelector('[data-state="active"]');
      if (!activeElement) return;

      const containerRect = containerRef.current.getBoundingClientRect();
      const tabRect = activeElement.getBoundingClientRect();
      setUnderlineStyle({
        left: tabRect.left - containerRect.left,
        width: tabRect.width,
      });
    }, []);

    // UseLayoutEffect to avoid any first-paint horizontal overflow/drag
    React.useLayoutEffect(() => {
      calculateVisibleTabs();
      updateUnderline();

      const resizeObserver = new ResizeObserver(() => {
        calculateVisibleTabs();
        updateUnderline();
      });

      if (containerRef.current) resizeObserver.observe(containerRef.current);
      if (extraRef.current) resizeObserver.observe(extraRef.current);

      return () => resizeObserver.disconnect();
    }, [calculateVisibleTabs, updateUnderline]);

    React.useLayoutEffect(() => {
      updateUnderline();
    }, [activeTab, visibleCount, updateUnderline]);

    const visibleTabs = tabs.slice(0, visibleCount);
    const overflowTabs = tabs.slice(visibleCount);
    const hasOverflow = overflowTabs.length > 0 || (!showGroups && tabGroups.length > 0);
    const activeInOverflow = overflowTabs.some((t) => t.value === activeTab) || 
      (!showGroups && activeGroupItem);

    return (
      <>
        {/* Hidden measure container (offscreen so it NEVER creates horizontal scroll) */}
        <div
          ref={measureRef}
          className="fixed left-[-10000px] top-0 opacity-0 pointer-events-none flex gap-8"
          style={{ contain: "layout size style" }}
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

        <TabsPrimitive.List
          ref={(node) => {
            containerRef.current = node;
            if (typeof ref === "function") ref(node);
            else if (ref) ref.current = node;
          }}
          className={cn(
            "flex h-12 w-full min-w-0 items-center justify-start gap-8 border-b border-border relative flex-nowrap",
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

          {/* Tab groups as dropdowns - only when there's space */}
          {showGroups && tabGroups.map((group) => {
            const isGroupActive = group.items.some(item => item.value === activeTab);
            return (
              <DropdownMenu key={group.label}>
                <DropdownMenuTrigger asChild>
                  <button
                    className={cn(
                      "inline-flex items-center justify-center whitespace-nowrap rounded-sm px-3 py-1.5 text-sm font-medium ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 shrink-0",
                      isGroupActive
                        ? "bg-background text-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    {group.icon}
                    <span className="ml-2">{group.label}</span>
                    <ChevronRight className="h-3 w-3 ml-1 rotate-90" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="min-w-[140px]">
                  {group.items.map((item) => (
                    <DropdownMenuItem
                      key={item.value}
                      onClick={() => onTabChange(item.value)}
                      className={cn(
                        "flex items-center gap-2 cursor-pointer",
                        activeTab === item.value && "bg-accent"
                      )}
                    >
                      {item.icon}
                      {item.label}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            );
          })}

          {/* Overflow menu - only exists when needed */}
          {hasOverflow && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  className={cn(
                    "inline-flex items-center justify-center gap-1.5 whitespace-nowrap px-3 py-2 text-sm font-medium transition-colors shrink-0 rounded-md",
                    activeInOverflow
                      ? "text-foreground bg-accent"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted/50",
                  )}
                >
                  <MoreHorizontal className="h-4 w-4" />
                  <span>Mais</span>
                  {activeInOverflow && (
                    <span className="ml-1 text-xs bg-primary/20 text-primary px-1.5 py-0.5 rounded">
                      {overflowTabs.find((t) => t.value === activeTab)?.label || activeGroupItem?.label}
                    </span>
                  )}
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" sideOffset={8} className="min-w-[160px] bg-popover">
                {/* Regular overflow tabs */}
                {overflowTabs.map((tab) => (
                  <DropdownMenuItem
                    key={tab.value}
                    onClick={() => onTabChange(tab.value)}
                    className={cn(
                      "flex items-center gap-2 cursor-pointer",
                      activeTab === tab.value && "bg-accent font-medium",
                    )}
                  >
                    {tab.icon}
                    {tab.label}
                  </DropdownMenuItem>
                ))}

                {/* Groups as submenus when not shown inline */}
                {!showGroups && tabGroups.map((group) => {
                  const isGroupActive = group.items.some(item => item.value === activeTab);
                  return (
                    <DropdownMenuSub key={group.label}>
                      <DropdownMenuSubTrigger
                        className={cn(
                          "flex items-center gap-2",
                          isGroupActive && "bg-accent font-medium"
                        )}
                      >
                        {group.icon}
                        {group.label}
                      </DropdownMenuSubTrigger>
                      <DropdownMenuPortal>
                        <DropdownMenuSubContent className="min-w-[140px]">
                          {group.items.map((item) => (
                            <DropdownMenuItem
                              key={item.value}
                              onClick={() => onTabChange(item.value)}
                              className={cn(
                                "flex items-center gap-2 cursor-pointer",
                                activeTab === item.value && "bg-accent"
                              )}
                            >
                              {item.icon}
                              {item.label}
                            </DropdownMenuItem>
                          ))}
                        </DropdownMenuSubContent>
                      </DropdownMenuPortal>
                    </DropdownMenuSub>
                  );
                })}
              </DropdownMenuContent>
            </DropdownMenu>
          )}

          {extraContent && (
            <div ref={extraRef} className="shrink-0">
              {extraContent}
            </div>
          )}

          {/* Animated underline - only when active tab is visible */}
          {!activeInOverflow && (
            <span
              className={cn(
                "absolute bottom-0 h-0.5 transition-all duration-300 ease-out",
                accentColor,
              )}
              style={{
                left: `${underlineStyle.left}px`,
                width: `${underlineStyle.width}px`,
              }}
            />
          )}
        </TabsPrimitive.List>
      </>
    );
  },
);

ResponsiveTabsList.displayName = "ResponsiveTabsList";

export { ResponsiveTabsList };
export type { TabItem, TabGroup };
