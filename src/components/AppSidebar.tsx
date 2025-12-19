import { Bell, Users, Users2, Landmark, Wallet, Building2, TrendingUp, UserPlus, PieChart, Briefcase, FolderKanban, FlaskConical, Settings, LogOut, Star, Shield } from "lucide-react";
import { NavLink } from "@/components/NavLink";
import { useLocation, useNavigate } from "react-router-dom";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useAuth } from "@/hooks/useAuth";
import { useRole } from "@/hooks/useRole";
import { useFavorites } from "@/hooks/useFavorites";
import { useModuleAccess } from "@/hooks/useModuleAccess";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { getRoleLabel } from "@/lib/roleLabels";
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
  iconName: string;
  moduleKey: string; // Key for module access check
}

interface MenuGroup {
  label: string;
  items: MenuItem[];
}

// Icon mapping for favorites
const iconMap: Record<string, any> = {
  Bell, Users, Users2, Landmark, Wallet, Building2, TrendingUp, 
  UserPlus, PieChart, Briefcase, FolderKanban, FlaskConical, Settings, Star, Shield
};

// Menu structure organized by functional domain
// moduleKey is used to check access via useModuleAccess
const menuGroups: MenuGroup[] = [
  {
    label: "VISÃO GERAL",
    items: [
      { title: "Central", url: "/", icon: Bell, iconName: "Bell", moduleKey: "central" },
    ],
  },
  {
    label: "OPERAÇÃO",
    items: [
      { title: "Projetos", url: "/projetos", icon: FolderKanban, iconName: "FolderKanban", moduleKey: "projetos" },
      { title: "Bookmakers", url: "/bookmakers", icon: Building2, iconName: "Building2", moduleKey: "bookmakers" },
    ],
  },
  {
    label: "FINANCEIRO",
    items: [
      { title: "Caixa", url: "/caixa", icon: Wallet, iconName: "Wallet", moduleKey: "caixa" },
      { title: "Financeiro", url: "/financeiro", icon: PieChart, iconName: "PieChart", moduleKey: "financeiro" },
      { title: "Bancos", url: "/bancos", icon: Landmark, iconName: "Landmark", moduleKey: "bancos" },
      { title: "Investidores", url: "/investidores", icon: TrendingUp, iconName: "TrendingUp", moduleKey: "investidores" },
    ],
  },
  {
    label: "RELACIONAMENTOS",
    items: [
      { title: "Parceiros", url: "/parceiros", icon: Users, iconName: "Users", moduleKey: "parceiros" },
      { title: "Operadores", url: "/operadores", icon: Briefcase, iconName: "Briefcase", moduleKey: "operadores" },
    ],
  },
  {
    label: "CRESCIMENTO",
    items: [
      { title: "Captação", url: "/programa-indicacao", icon: UserPlus, iconName: "UserPlus", moduleKey: "captacao" },
    ],
  },
  {
    label: "COMUNIDADE",
    items: [
      { title: "Comunidade", url: "/comunidade", icon: Users2, iconName: "Users2", moduleKey: "comunidade" },
    ],
  },
  {
    label: "ADMINISTRAÇÃO",
    items: [
      { title: "Workspace", url: "/workspace", icon: Settings, iconName: "Settings", moduleKey: "workspace" },
      { title: "Admin Sistema", url: "/admin", icon: Shield, iconName: "Shield", moduleKey: "admin" },
    ],
  },
  {
    label: "DESENVOLVIMENTO",
    items: [
      { title: "Testes", url: "/testes", icon: FlaskConical, iconName: "FlaskConical", moduleKey: "testes" },
    ],
  },
];

// Flatten all items for permission check
const allMenuItems = menuGroups.flatMap(g => g.items);

export function AppSidebar() {
  const { state } = useSidebar();
  const location = useLocation();
  const navigate = useNavigate();
  const { user, signOut, role, isSystemOwner, publicId } = useAuth();
  const { canManageWorkspace } = useRole();
  const { favorites } = useFavorites();
  const { canAccess } = useModuleAccess();
  const currentPath = location.pathname;
  
  const isCollapsed = state === "collapsed";
  const isActive = (path: string) => currentPath === path;

  // Function to check if user can see a menu item using the new module access system
  const canSeeItem = (item: MenuItem): boolean => {
    return canAccess(item.moduleKey);
  };

  const handleSignOut = async () => {
    await signOut();
    navigate("/auth");
  };

  const getUserInitials = () => {
    if (!user?.email) return "U";
    return user.email.charAt(0).toUpperCase();
  };

  // Filter favorites to only show those the user has access to
  const visibleFavorites = favorites.filter(fav => {
    const menuItem = allMenuItems.find(item => item.url === fav.page_path);
    return menuItem ? canSeeItem(menuItem) : false;
  });

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

  const renderFavoriteItem = (favorite: { page_path: string; page_title: string; page_icon: string }) => {
    const IconComponent = iconMap[favorite.page_icon] || Star;

    return (
      <SidebarMenuItem key={favorite.page_path}>
        {isCollapsed ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <SidebarMenuButton asChild isActive={isActive(favorite.page_path)}>
                <NavLink 
                  to={favorite.page_path} 
                  end 
                  className="flex items-center justify-center h-9 w-9 rounded-md transition-colors hover:bg-accent/50"
                  activeClassName="bg-primary/10 text-primary"
                >
                  <IconComponent className="h-4 w-4" />
                </NavLink>
              </SidebarMenuButton>
            </TooltipTrigger>
            <TooltipContent side="right" className="font-medium">
              {favorite.page_title}
            </TooltipContent>
          </Tooltip>
        ) : (
          <SidebarMenuButton asChild isActive={isActive(favorite.page_path)}>
            <NavLink 
              to={favorite.page_path} 
              end 
              className="flex items-center gap-3 px-3 py-2 rounded-md transition-colors hover:bg-accent/50"
              activeClassName="bg-primary/10 text-primary font-medium"
            >
              <IconComponent className="h-4 w-4 shrink-0" />
              <span className="text-sm">{favorite.page_title}</span>
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
            {visibleItems.map(item => renderMenuItem(item))}
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

        {/* Favorites Section - Only shown if there are favorites */}
        {visibleFavorites.length > 0 && (
          <SidebarGroup>
            <SidebarGroupLabel 
              className={`
                text-[10px] font-semibold tracking-widest text-muted-foreground/70 
                uppercase mb-2 px-3
                ${isCollapsed ? 'sr-only' : ''}
              `}
            >
              ATALHOS
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu className="space-y-0.5">
                {visibleFavorites.map(renderFavoriteItem)}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}

        {/* Separator after favorites */}
        {visibleFavorites.length > 0 && (
          <div className="my-4 mx-3 border-t border-border/50" />
        )}

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
                  <p className="text-[10px] text-muted-foreground">
                    {publicId && <span>ID: {publicId} • </span>}
                    <span>{isSystemOwner ? getRoleLabel('system_owner') : getRoleLabel(role)}</span>
                  </p>
                </div>
              )}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <div className="px-2 py-1.5">
              <p className="text-sm font-medium truncate">{user?.email}</p>
              <p className="text-xs text-muted-foreground">
                {publicId && <span className="font-mono">ID: {publicId}</span>}
                {publicId && " • "}
                <span>{isSystemOwner ? getRoleLabel('system_owner') : getRoleLabel(role)}</span>
              </p>
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
