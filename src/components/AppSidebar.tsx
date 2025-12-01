import { Home, Users, Landmark, Wallet, Building2, Link2, TrendingUp } from "lucide-react";
import { NavLink } from "@/components/NavLink";
import { useLocation } from "react-router-dom";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";

const menuItems = [
  { title: "Home", url: "/", icon: Home },
  { title: "Parceiros", url: "/parceiros", icon: Users },
  { title: "Investidores", url: "/investidores", icon: TrendingUp },
  { title: "Bancos", url: "/bancos", icon: Landmark },
  { title: "Caixa", url: "/caixa", icon: Wallet },
  { title: "Casas", url: "/bookmakers", icon: Building2 },
  { title: "Vínculos", url: "/vinculos", icon: Link2 },
];

export function AppSidebar() {
  const { state } = useSidebar();
  const location = useLocation();
  const currentPath = location.pathname;
  
  const isCollapsed = state === "collapsed";
  const isActive = (path: string) => currentPath === path;

  return (
    <Sidebar
      className={isCollapsed ? "w-14" : "w-60"}
      collapsible="icon"
    >
      <SidebarContent>
        {/* Logo/Brand Section */}
        <div className={`flex items-center gap-3 px-4 py-6 ${isCollapsed ? 'justify-center' : ''}`}>
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-primary shrink-0">
            <Wallet className="h-5 w-5 text-white" />
          </div>
          {!isCollapsed && (
            <span className="text-lg font-bold tracking-tight">Labbet One</span>
          )}
        </div>

        <SidebarGroup>
          <SidebarGroupLabel className={isCollapsed ? 'sr-only' : ''}>
            Menu Principal
          </SidebarGroupLabel>

          <SidebarGroupContent>
            <SidebarMenu>
              {menuItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  {isCollapsed ? (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <SidebarMenuButton asChild isActive={isActive(item.url)}>
                          <NavLink 
                            to={item.url} 
                            end 
                            className="hover:bg-accent/50 transition-colors"
                            activeClassName="bg-primary/10 text-primary font-medium border-l-2 border-primary"
                          >
                            <item.icon className="h-4 w-4" />
                          </NavLink>
                        </SidebarMenuButton>
                      </TooltipTrigger>
                      <TooltipContent side="right" className="font-medium">
                        {item.title}
                      </TooltipContent>
                    </Tooltip>
                  ) : (
                    <SidebarMenuButton asChild isActive={isActive(item.url)}>
                      <NavLink 
                        to={item.url} 
                        end 
                        className="hover:bg-accent/50 transition-colors"
                        activeClassName="bg-primary/10 text-primary font-medium border-l-2 border-primary"
                      >
                        <item.icon className="h-4 w-4 mr-2" />
                        <span>{item.title}</span>
                      </NavLink>
                    </SidebarMenuButton>
                  )}
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}
