import { Bell, Users, Landmark, Wallet, Building2, TrendingUp, UserPlus, PieChart, Briefcase, FolderKanban, FlaskConical, Settings, LogOut } from "lucide-react";
import { NavLink } from "@/components/NavLink";
import { useLocation, useNavigate } from "react-router-dom";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useAuth } from "@/hooks/useAuth";
import { useRole } from "@/hooks/useRole";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarFooter,
  useSidebar,
} from "@/components/ui/sidebar";

interface MenuItem {
  title: string;
  url: string;
  icon: any;
  permission?: string;
  roles?: string[];
}

interface MenuGroup {
  label: string;
  items: MenuItem[];
}

// Menu structure organized by functional domain
const menuGroups: MenuGroup[] = [
  {
    label: "VISÃO GERAL",
    items: [
      { title: "Central", url: "/", icon: Bell },
    ],
  },
  {
    label: "OPERAÇÃO",
    items: [
      { title: "Projetos", url: "/projetos", icon: FolderKanban, permission: "projects:view" },
      { title: "Casas", url: "/bookmakers", icon: Building2, permission: "bookmakers:view" },
    ],
  },
  {
    label: "FINANCEIRO",
    items: [
      { title: "Caixa", url: "/caixa", icon: Wallet, permission: "cash:view" },
      { title: "Financeiro", url: "/financeiro", icon: PieChart, permission: "finance:view" },
      { title: "Bancos", url: "/bancos", icon: Landmark, permission: "finance:view" },
      { title: "Investidores", url: "/investidores", icon: TrendingUp, permission: "investors:view" },
    ],
  },
  {
    label: "RELACIONAMENTOS",
    items: [
      { title: "Parceiros", url: "/parceiros", icon: Users, permission: "partners:view" },
      { title: "Operadores", url: "/operadores", icon: Briefcase, permission: "operators:view" },
    ],
  },
  {
    label: "CRESCIMENTO",
    items: [
      { title: "Captação", url: "/programa-indicacao", icon: UserPlus, permission: "acquisition:view" },
    ],
  },
  {
    label: "ADMINISTRAÇÃO",
    items: [
      { title: "Workspace", url: "/workspace", icon: Settings, roles: ["owner", "admin", "master"] },
    ],
  },
  {
    label: "DESENVOLVIMENTO",
    items: [
      { title: "Testes", url: "/testes", icon: FlaskConical, roles: ["owner", "master"] },
    ],
  },
];

export function AppSidebar() {
  const { state } = useSidebar();
  const location = useLocation();
  const navigate = useNavigate();
  const { user, signOut, role } = useAuth();
  const { canManageWorkspace } = useRole();
  const currentPath = location.pathname;
  
  const isCollapsed = state === "collapsed";
  const isActive = (path: string) => currentPath === path;

  // Function to check if user can see a menu item
  const canSeeItem = (item: MenuItem): boolean => {
    if (!item.permission && !item.roles) return true;
    if (role === 'owner' || role === 'master') return true;
    if (item.roles && item.roles.length > 0) {
      if (!role || !item.roles.includes(role)) return false;
    }
    if (item.permission && role === 'admin') return true;
    return true;
  };

  const handleSignOut = async () => {
    await signOut();
    navigate("/auth");
  };

  const getUserInitials = () => {
    if (!user?.email) return "U";
    return user.email.charAt(0).toUpperCase();
  };

  const renderMenuItem = (item: MenuItem) => {
    if (!canSeeItem(item)) return null;

    return (
      <SidebarMenuItem key={item.title}>
        {isCollapsed ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <SidebarMenuButton asChild isActive={isActive(item.url)}>
                <NavLink 
                  to={item.url} 
                  end 
                  className="flex items-center justify-center h-9 w-9 rounded-md transition-colors hover:bg-accent/50"
                  activeClassName="bg-primary/10 text-primary"
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
              className="flex items-center gap-3 px-3 py-2 rounded-md transition-colors hover:bg-accent/50"
              activeClassName="bg-primary/10 text-primary font-medium"
            >
              <item.icon className="h-4 w-4 shrink-0" />
              <span className="text-sm">{item.title}</span>
            </NavLink>
          </SidebarMenuButton>
        )}
      </SidebarMenuItem>
    );
  };

  const renderMenuGroup = (group: MenuGroup, index: number) => {
    const visibleItems = group.items.filter(canSeeItem);
    if (visibleItems.length === 0) return null;

    return (
      <SidebarGroup key={group.label} className={index > 0 ? "mt-6" : ""}>
        <SidebarGroupLabel 
          className={`
            text-[10px] font-semibold tracking-widest text-muted-foreground/70 
            uppercase mb-2 px-3
            ${isCollapsed ? 'sr-only' : ''}
          `}
        >
          {group.label}
        </SidebarGroupLabel>
        <SidebarGroupContent>
          <SidebarMenu className="space-y-0.5">
            {visibleItems.map(renderMenuItem)}
          </SidebarMenu>
        </SidebarGroupContent>
      </SidebarGroup>
    );
  };

  return (
    <Sidebar
      className={isCollapsed ? "w-14" : "w-56"}
      collapsible="icon"
    >
      <SidebarContent className="py-4">
        {/* Logo/Brand Section */}
        <div className={`flex items-center gap-3 px-4 pb-6 ${isCollapsed ? 'justify-center' : ''}`}>
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-primary shrink-0">
            <Wallet className="h-4 w-4 text-white" />
          </div>
          {!isCollapsed && (
            <span className="text-base font-bold tracking-tight">Labbet One</span>
          )}
        </div>

        {/* Menu Groups */}
        <div className="flex-1 px-2">
          {menuGroups.map((group, index) => renderMenuGroup(group, index))}
        </div>
      </SidebarContent>

      {/* User footer */}
      <SidebarFooter className="border-t border-border/50 p-2">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className={`
              flex items-center gap-3 w-full p-2 rounded-lg 
              hover:bg-accent/50 transition-colors
              ${isCollapsed ? 'justify-center' : ''}
            `}>
              <Avatar className="h-7 w-7">
                <AvatarFallback className="bg-primary/10 text-primary text-xs">
                  {getUserInitials()}
                </AvatarFallback>
              </Avatar>
              {!isCollapsed && (
                <div className="flex-1 text-left overflow-hidden">
                  <p className="text-xs font-medium truncate">{user?.email}</p>
                  <p className="text-[10px] text-muted-foreground capitalize">{role || 'usuário'}</p>
                </div>
              )}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <div className="px-2 py-1.5">
              <p className="text-sm font-medium truncate">{user?.email}</p>
              <p className="text-xs text-muted-foreground capitalize">Role: {role || 'usuário'}</p>
            </div>
            <DropdownMenuSeparator />
            {canManageWorkspace && (
              <DropdownMenuItem onClick={() => navigate("/workspace")}>
                <Settings className="mr-2 h-4 w-4" />
                Configurações
              </DropdownMenuItem>
            )}
            <DropdownMenuItem onClick={handleSignOut} className="text-destructive focus:text-destructive">
              <LogOut className="mr-2 h-4 w-4" />
              Sair
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
