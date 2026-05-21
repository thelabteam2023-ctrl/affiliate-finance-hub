import * as React from "react";
import { ChevronRight, LucideIcon, MoreHorizontal } from "lucide-react";
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
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

interface SidebarFlyoutMenuProps {
  item: SidebarItemType;
  isActive?: boolean;
  onItemClick?: (item: SidebarItemType, e: React.MouseEvent) => void;
}

export const SidebarFlyoutMenu: React.FC<SidebarFlyoutMenuProps> = ({ 
  item, 
  isActive: groupActive,
  onItemClick 
}) => {
  const { isMobile, state } = useSidebar();
  const [isOpen, setIsOpen] = React.useState(false);
  const isCollapsed = state === "collapsed";
  
  // Desktop Flyout (Hover)
  if (!isMobile) {
    return (
      <SidebarMenuItem 
        data-sidebar-item={item.id}
        data-flyout-state={isOpen ? "open" : "closed"}
        onMouseEnter={() => setIsOpen(true)}
        onMouseLeave={() => setIsOpen(false)}
      >
        <DropdownMenu open={isOpen} onOpenChange={setIsOpen}>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton 
              isActive={groupActive}
              className="group/flyout w-full"
            >
              {item.icon && <item.icon className="h-4 w-4 shrink-0" />}
              {!isCollapsed && (
                <>
                  <span className="flex-1 text-sm">{item.label}</span>
                  <ChevronRight className={cn(
                    "h-4 w-4 transition-transform duration-200",
                    isOpen && "rotate-90"
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
              className="min-w-[180px] p-1 shadow-xl bg-popover border-border/50 animate-in slide-in-from-left-1 duration-200"
              onMouseEnter={() => setIsOpen(true)}
              onMouseLeave={() => setIsOpen(false)}
            >
              <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground border-b border-border/50 mb-1">
                {item.label}
              </div>
              {item.children?.map((child) => (
                <SidebarFlyoutItem 
                  key={child.id} 
                  item={child} 
                  onItemClick={onItemClick}
                />
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
    >
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <CollapsibleTrigger asChild>
          <SidebarMenuButton isActive={groupActive}>
            {item.icon && <item.icon className="h-4 w-4 shrink-0" />}
            <span className="flex-1 text-sm text-left">{item.label}</span>
            <ChevronRight className={cn(
              "h-4 w-4 transition-transform duration-200",
              isOpen && "rotate-90"
            )} />
          </SidebarMenuButton>
        </CollapsibleTrigger>
        <CollapsibleContent className="pl-6 pt-1 space-y-1">
          {item.children?.map((child) => (
            <SidebarFlyoutItem 
              key={child.id} 
              item={child} 
              onItemClick={onItemClick}
            />
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
  
  const content = (
    <div className="flex items-center gap-2 w-full">
      {item.icon && <item.icon className="h-4 w-4 shrink-0 opacity-70" />}
      <span className="truncate">{item.label}</span>
    </div>
  );

  if (item.isTool) {
    return (
      <DropdownMenuItem 
        asChild 
        className="cursor-pointer focus:bg-primary/10 focus:text-primary rounded-md"
        data-sidebar-item={item.id}
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
          className="flex items-center gap-3 px-3 py-2 rounded-md transition-colors hover:bg-primary/10 text-sm"
          activeClassName="bg-primary/10 text-primary font-medium"
        >
          {content}
        </NavLink>
      </div>
    );
  }

  return (
    <DropdownMenuItem 
      asChild 
      className="cursor-pointer focus:bg-primary/10 focus:text-primary rounded-md"
      data-sidebar-item={item.id}
    >
      <NavLink
        to={item.href || "#"}
        className="flex items-center gap-2 px-2 py-1.5 text-sm"
        activeClassName="bg-primary/10 text-primary font-medium"
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
}

export const SidebarDynamicGroup: React.FC<SidebarDynamicGroupProps> = ({ 
  label, 
  items, 
  icon,
  id,
  onItemClick 
}) => {
  const { state } = useSidebar();
  const isCollapsed = state === "collapsed";

  if (items.length === 0) return null;

  return (
    <div 
      className="space-y-1 py-2" 
      data-sidebar-group={id}
      data-favorites-count={items.length}
    >
      {!isCollapsed && (
        <SidebarGroupLabel className="px-4 text-[10px] uppercase tracking-wider text-muted-foreground/60 font-bold mb-1">
          {label}
        </SidebarGroupLabel>
      )}
      <SidebarMenu>
        <SidebarFlyoutMenu 
          item={{
            id: `submenu-${id}`,
            label: label,
            icon: icon,
            children: items
          }}
          onItemClick={onItemClick}
        />
      </SidebarMenu>
    </div>
  );
};

export const SidebarNestedMenu: React.FC<{
  label: string;
  items: SidebarItemType[];
  id: string;
  onItemClick?: (item: SidebarItemType, e: React.MouseEvent) => void;
}> = ({ label, items, id, onItemClick }) => {
  return (
    <SidebarFlyoutMenu 
      item={{
        id,
        label,
        children: items
      }}
      onItemClick={onItemClick}
    />
  );
};
