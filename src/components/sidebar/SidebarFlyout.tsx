import * as React from "react";
import { ChevronRight, LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarGroupLabel,
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
  const [isOpen, setIsOpen] = React.useState(false);
  const isCollapsed = sidebarState === "collapsed";
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
    setIsOpen(true);
  };

  const handleMouseLeave = () => {
    if (isMobile) return;
    // Closing delay (180ms) for premium UX and "hover bridge" effect
    timeoutRef.current = setTimeout(() => {
      setIsOpen(false);
    }, 180);
  };

  // Cleanup timeout on unmount
  React.useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  // Keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowRight") {
      setIsOpen(true);
    } else if (e.key === "ArrowLeft") {
      setIsOpen(false);
    } else if (e.key === "Escape") {
      setIsOpen(false);
    }
  };

  // Desktop Flyout
  if (!isMobile) {
    return (
      <SidebarMenuItem 
        data-sidebar-item={item.id}
        data-flyout-state={isOpen ? "open" : "closed"}
        data-sidebar-active={isActive ? "true" : "false"}
        data-sidebar-level={level}
        data-sidebar-type="flyout"
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        onKeyDown={handleKeyDown}
      >
        <DropdownMenu open={isOpen} onOpenChange={setIsOpen}>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton 
              isActive={isActive}
              className={cn(
                "group/flyout w-full transition-all duration-200",
                isActive && "bg-primary/5 text-primary font-semibold"
              )}
              aria-haspopup="true"
              aria-expanded={isOpen}
            >
              {item.icon && <item.icon className={cn("h-4 w-4 shrink-0 transition-transform", isOpen && "scale-110")} />}
              {!isCollapsed && (
                <>
                  <span className="flex-1 text-sm">{item.label}</span>
                  <ChevronRight className={cn(
                    "h-4 w-4 transition-all duration-200 opacity-50",
                    isOpen && "rotate-90 opacity-100"
                  )} />
                </>
              )}
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuPortal>
            <DropdownMenuContent 
              side="right" 
              align="start" 
              sideOffset={12}
              className={cn(
                "min-w-[200px] p-1 shadow-2xl bg-popover/95 backdrop-blur-sm border-border/50 animate-in slide-in-from-left-1 duration-200 z-[100]",
                "before:absolute before:inset-y-0 before:-left-3 before:w-3 before:content-['']" // Hover Bridge Area
              )}
              onMouseEnter={handleMouseEnter}
              onMouseLeave={handleMouseLeave}
            >
              <div className="px-2 py-1.5 text-[10px] uppercase tracking-widest font-bold text-muted-foreground/50 border-b border-border/30 mb-1">
                {item.label}
              </div>
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
            </DropdownMenuContent>
          </DropdownMenuPortal>
        </DropdownMenu>
      </SidebarMenuItem>
    );
  }

  // Mobile Accordion
  return (
    <SidebarMenuItem 
      data-sidebar-item={item.id}
      data-flyout-state={isOpen ? "open" : "closed"}
      data-sidebar-active={isActive ? "true" : "false"}
      data-sidebar-level={level}
      data-sidebar-type="accordion"
    >
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <CollapsibleTrigger asChild>
          <SidebarMenuButton 
            isActive={isActive}
            aria-expanded={isOpen}
          >
            {item.icon && <item.icon className="h-4 w-4 shrink-0" />}
            <span className="flex-1 text-sm text-left font-medium">{item.label}</span>
            <ChevronRight className={cn(
              "h-4 w-4 transition-transform duration-200",
              isOpen && "rotate-90"
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
