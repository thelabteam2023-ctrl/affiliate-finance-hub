import { LucideIcon } from "lucide-react";

export type SidebarItem = {
  id: string;
  label: string;
  href?: string;
  icon?: LucideIcon;
  iconName?: string;
  moduleKey?: string;
  children?: SidebarItem[];
  isTool?: boolean;
  badgeCount?: number;
  metadata?: Record<string, any>;
};

export type SidebarGroup = {
  id: string;
  label: string;
  icon?: LucideIcon;
  children: SidebarItem[];
};

export type SidebarNavigationState = {
  activeFlyout?: string;
  activeItem?: string;
  isMobileOpen?: boolean;
};
