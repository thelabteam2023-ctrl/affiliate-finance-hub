import * as React from "react";
import { ChevronRight, LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarGroupLabel,
  SidebarMenu,
  useSidebar,
} from "@/components/ui/sidebar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuPortal,
} from "@/components/ui/dropdown-menu";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { NavLink } from "@/components/NavLink";
import { SidebarItem as SidebarItemType } from "./types";
import { useLocation } from "react-router-dom";
import { useSidebarStore } from "@/store/sidebar-store";

interface SidebarFlyoutMenuProps {
  item: SidebarItemType;
  isActive?: boolean;
  onItemClick?: (item: SidebarItemType, e: React.MouseEvent) => void;
  level?: number;
}

export const SidebarFlyoutMenu: React.FC<SidebarFlyoutMenuProps> = ({ 
  item, 
  isActive: propActive,
  onItemClick,
  level = 1
}) => {
  const { isMobile, state: sidebarState } = useSidebar();
  const location = useLocation();
  const isCollapsed = sidebarState === "collapsed";
  
  const { 
    activeFlyoutId, 
    pinnedFlyoutId, 
    state: globalState,
    setOpening,
    setHoverPreview,
    pin,
    close,
    startClosing,
    clearActive
  } = useSidebarStore();

  const isOpen = activeFlyoutId === item.id;
  const isPinned = pinnedFlyoutId === item.id;
  const isOpening = globalState === 'opening' && isOpen;
  const isClosing = globalState === 'closing-delay' && isOpen;
  
  const timeoutRef = React.useRef<NodeJS.Timeout | null>(null);

  // Check if any child is active
  const isChildActive = React.useMemo(() => {
    const checkActive = (items: SidebarItemType[]): boolean => {
      return items.some(child => {
        if (child.href && location.pathname === child.href) return true;
        if (child.children) return checkActive(child.children);
        return false;
      });
    };
    return item.children ? checkActive(item.children) : false;
  }, [item.children, location.pathname]);

  const isActive = propActive || isChildActive;

  const handleMouseEnter = () => {
    if (isMobile) return;
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    
    // If already open or pinned, just ensure it stays open
    if (isOpen) {
      setHoverPreview(item.id);
      return;
    }

    setOpening(item.id);
    
    // Open Delay: ~120ms
    timeoutRef.current = setTimeout(() => {
      setHoverPreview(item.id);
    }, 120);
  };

  const handleMouseLeave = () => {
    if (isMobile || isPinned) return;
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    
    startClosing();
    
    // Close Delay: ~450ms (generous to avoid flickering)
    timeoutRef.current = setTimeout(() => {
      clearActive();
    }, 450);
  };

  const handleClick = (e: React.MouseEvent) => {
    if (isMobile) return;
    e.preventDefault();
    e.stopPropagation();
    
    if (isPinned) {
      close();
    } else {
      pin(item.id);
    }
  };

  // Listen for clicks outside to close pinned flyout
  React.useEffect(() => {
    if (!isPinned) return;

    const handleOutsideClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      // Use data attribute to identify sidebar items and flyouts
      if (!target.closest(`[data-sidebar-item="${item.id}"]`) && !target.closest('.sidebar-flyout-content')) {
        close();
      }
    };

    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, [isPinned, item.id, close]);

  // Handle ESC key
  React.useEffect(() => {
    if (!isOpen) return;
    
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        close();
      }
    };
    
    document.addEventListener('keydown', handleEsc);
    return () => document.removeEventListener('keydown', handleEsc);
  }, [isOpen, close]);

  // Cleanup timeout on unmount
  React.useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  // Desktop Flyout
  if (!isMobile) {
    const isActuallyOpen = isOpen || isPinned || isClosing;
    
    return (
      <SidebarMenuItem 
        data-sidebar-item={item.id}
        data-flyout-state={isPinned ? "pinned" : (isClosing ? "closing" : (isOpen ? "open" : "closed"))}
        data-flyout-mode={isPinned ? "pinned" : "hover"}
        data-sidebar-active={isActive ? "true" : "false"}
        data-sidebar-level={level}
        data-sidebar-type="flyout"
        data-pinned={isPinned}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        className="relative"
      >
        <DropdownMenu open={isActuallyOpen} onOpenChange={(open) => { if (!open && !isPinned && !isClosing) close(); }}>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton 
              isActive={isActive}
              onClick={handleClick}
              className={cn(
                "group/flyout w-full transition-all duration-200 relative z-20",
                isActive && "bg-primary/5 text-primary font-semibold",
                isPinned && "ring-1 ring-primary/30 bg-primary/10",
                "px-3 py-2 h-auto min-h-[40px]" // Larger hitbox
              )}
              aria-haspopup="true"
              aria-expanded={isActuallyOpen}
            >
              {item.icon && <item.icon className={cn("h-4 w-4 shrink-0 transition-transform", isActuallyOpen && "scale-110")} />}
              {!isCollapsed && (
                <>
                  <span className="flex-1 text-sm truncate pr-2">{item.label}</span>
                  <ChevronRight className={cn(
                    "h-4 w-4 transition-all duration-200 opacity-50",
                    isActuallyOpen && "rotate-90 opacity-100"
                  )} />
                </>
              )}
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          
          {/* HOVER BRIDGE: Expanding the bridge between trigger and content */}
          {isActuallyOpen && !isMobile && (
            <div 
              className="absolute top-0 -right-4 w-6 h-full z-10 bg-transparent cursor-default pointer-events-auto"
              data-hover-bridge="true"
              onMouseEnter={handleMouseEnter}
            />
          )}

          <DropdownMenuPortal>
            <DropdownMenuContent 
              side="right" 
              align="start" 
              sideOffset={10}
              // forceMount helps keep it in DOM for transitions if we handle animations manually, 
              // but here we rely on isActuallyOpen to keep Radix Content mounted.
              className={cn(
                "min-w-[240px] p-1 shadow-2xl bg-popover/98 backdrop-blur-xl border-border/50 z-[100] sidebar-flyout-content",
                "animate-in fade-in zoom-in-95 slide-in-from-left-2 duration-200",
                isPinned && "border-primary/40 shadow-primary/10 ring-1 ring-primary/10",
                isClosing && "animate-out fade-out zoom-out-95 slide-out-to-left-2 duration-300"
              )}
              onMouseEnter={handleMouseEnter}
              onMouseLeave={handleMouseLeave}
            >
              <div className="px-3 py-2 text-[10px] uppercase tracking-widest font-black text-muted-foreground/40 border-b border-border/30 mb-1 flex justify-between items-center bg-muted/20">
                <span className="flex items-center gap-2">
                  {item.icon && <item.icon className="h-3 w-3" />}
                  {item.label}
                </span>
                {isPinned && (
                  <div className="flex items-center gap-1">
                    <span className="text-[8px] font-bold text-primary/60">FIXADO</span>
                    <div className="h-1.5 w-1.5 rounded-full bg-primary shadow-[0_0_8px_rgba(var(--primary),0.6)]" />
                  </div>
                )}
              </div>
              <div className="max-h-[75vh] overflow-y-auto custom-scrollbar pr-1 py-1">
                {item.children?.map((child) => (
                  child.children ? (
                    <SidebarFlyoutMenu 
                      key={child.id} 
                      item={child} 
                      onItemClick={onItemClick} 
                      level={level + 1}
                    />
                  ) : (
                    <SidebarFlyoutItem 
                      key={child.id} 
                      item={child} 
                      onItemClick={onItemClick}
                    />
                  )
                ))}
              </div>
            </DropdownMenuContent>
          </DropdownMenuPortal>
        </DropdownMenu>
      </SidebarMenuItem>
    );
  }

  // Mobile Accordion
  const [mobileOpen, setMobileOpen] = React.useState(false);
  return (
    <SidebarMenuItem 
      data-sidebar-item={item.id}
      data-sidebar-active={isActive ? "true" : "false"}
      data-sidebar-level={level}
      data-sidebar-type="accordion"
    >
      <Collapsible open={mobileOpen} onOpenChange={setMobileOpen}>
        <CollapsibleTrigger asChild>
          <SidebarMenuButton 
            isActive={isActive}
            aria-expanded={mobileOpen}
          >
            {item.icon && <item.icon className="h-4 w-4 shrink-0" />}
            <span className="flex-1 text-sm text-left font-medium">{item.label}</span>
            <ChevronRight className={cn(
              "h-4 w-4 transition-transform duration-200",
              mobileOpen && "rotate-90"
            )} />
          </SidebarMenuButton>
        </CollapsibleTrigger>
        <CollapsibleContent className="pl-4 mt-1 border-l border-border/50 ml-4 space-y-1 animate-in fade-in slide-in-from-top-1 duration-200">
          {item.children?.map((child) => (
            child.children ? (
              <SidebarFlyoutMenu 
                key={child.id} 
                item={child} 
                onItemClick={onItemClick}
                level={level + 1}
              />
            ) : (
              <SidebarFlyoutItem 
                key={child.id} 
                item={child} 
                onItemClick={onItemClick}
              />
            )
          ))}
        </CollapsibleContent>
      </Collapsible>
    </SidebarMenuItem>
  );
};

interface SidebarFlyoutItemProps {
  item: SidebarItemType;
  onItemClick?: (item: SidebarItemType, e: React.MouseEvent) => void;
}

export const SidebarFlyoutItem: React.FC<SidebarFlyoutItemProps> = ({ item, onItemClick }) => {
  const { isMobile } = useSidebar();
  const location = useLocation();
  const isActive = item.href ? location.pathname === item.href : false;
  
  const content = (
    <div className="flex items-center gap-2 w-full">
      {item.icon && <item.icon className={cn("h-4 w-4 shrink-0 opacity-60", isActive && "opacity-100 text-primary")} />}
      <span className={cn("truncate", isActive && "font-semibold text-primary")}>{item.label}</span>
      {item.badgeCount ? (
        <span className="ml-auto bg-destructive text-destructive-foreground text-[10px] font-bold px-1.5 py-0.5 rounded-full">
          {item.badgeCount}
        </span>
      ) : null}
    </div>
  );

  if (item.isTool) {
    return (
      <DropdownMenuItem 
        asChild 
        className="cursor-pointer focus:bg-primary/10 focus:text-primary rounded-md transition-colors"
        data-sidebar-item={item.id}
        data-sidebar-active={isActive ? "true" : "false"}
      >
        <button 
          onClick={(e) => onItemClick?.(item, e)}
          className="flex w-full items-center gap-2 px-2 py-1.5 text-sm outline-none"
        >
          {content}
        </button>
      </DropdownMenuItem>
    );
  }

  if (isMobile) {
    return (
      <div data-sidebar-item={item.id} className="w-full">
        <NavLink
          to={item.href || "#"}
          className={cn(
            "flex items-center gap-3 px-3 py-2 rounded-md transition-all duration-200 text-sm",
            "hover:bg-primary/5 hover:translate-x-1"
          )}
          activeClassName="bg-primary/10 text-primary font-bold shadow-sm"
        >
          {content}
        </NavLink>
      </div>
    );
  }

  return (
    <DropdownMenuItem 
      asChild 
      className="cursor-pointer focus:bg-primary/10 focus:text-primary rounded-md transition-all duration-200"
      data-sidebar-item={item.id}
      data-sidebar-active={isActive ? "true" : "false"}
    >
      <NavLink
        to={item.href || "#"}
        className="flex items-center gap-2 px-2 py-1.5 text-sm"
        activeClassName="bg-primary/10 text-primary font-bold"
      >
        {content}
      </NavLink>
    </DropdownMenuItem>
  );
};

interface SidebarDynamicGroupProps {
  label: string;
  items: SidebarItemType[];
  icon?: LucideIcon;
  id: string;
  onItemClick?: (item: SidebarItemType, e: React.MouseEvent) => void;
  emptyLabel?: string;
}

export const SidebarDynamicGroup: React.FC<SidebarDynamicGroupProps> = ({ 
  label, 
  items, 
  icon,
  id,
  onItemClick,
  emptyLabel = "Nenhum item"
}) => {
  const { state: sidebarState } = useSidebar();
  const isCollapsed = sidebarState === "collapsed";

  const children = items.length > 0 ? items : [
    { id: `${id}-empty`, label: emptyLabel, href: "#", icon: undefined }
  ];

  return (
    <div 
      className="space-y-1 py-1" 
      data-sidebar-group={id}
      data-favorites-count={items.length}
    >
      {!isCollapsed && (
        <SidebarGroupLabel className="px-4 text-[10px] uppercase tracking-widest text-muted-foreground/40 font-black mb-1">
          {label}
        </SidebarGroupLabel>
      )}
      <SidebarMenu>
        <SidebarFlyoutMenu 
          item={{
            id: `submenu-${id}`,
            label: label,
            icon: icon,
            children: children
          }}
          onItemClick={onItemClick}
        />
      </SidebarMenu>
    </div>
  );
};
