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
};

export type SidebarGroup = {
  id: string;
  label: string;
  icon?: LucideIcon;
  children: SidebarItem[];
};
