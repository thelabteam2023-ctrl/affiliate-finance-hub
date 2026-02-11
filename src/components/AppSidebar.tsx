import { Bell, Users, Users2, Landmark, Wallet, Building2, TrendingUp, UserPlus, PieChart, Briefcase, FolderKanban, FlaskConical, Settings, LogOut, Star, Shield, Calculator, StickyNote, ShieldCheck, ChevronUp, ChevronDown } from "lucide-react";
import { NavLink } from "@/components/NavLink";
import { useLocation, useNavigate } from "react-router-dom";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useAuth } from "@/hooks/useAuth";
import { useRole } from "@/hooks/useRole";
import { useFavorites } from "@/hooks/useFavorites";
import { useProjectFavorites } from "@/hooks/useProjectFavorites";
import { useModuleAccess } from "@/hooks/useModuleAccess";
import { useCentralAlertsCount } from "@/hooks/useCentralAlertsCount";
import { useUserWorkspaces } from "@/hooks/useUserWorkspaces";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
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
import { WorkspaceSwitcher } from "@/components/workspace/WorkspaceSwitcher";
import { supabase } from "@/integrations/supabase/client";
import { useEffect, useState, useRef, useCallback } from "react";
import { useWorkspace } from "@/hooks/useWorkspace";

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

interface ProjectInfo {
  id: string;
  nome: string;
}

// Icon mapping for favorites
const iconMap: Record<string, any> = {
  Bell, Users, Users2, Landmark, Wallet, Building2, TrendingUp, 
  UserPlus, PieChart, Briefcase, FolderKanban, FlaskConical, Settings, Star, Shield, Calculator, StickyNote
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
      { title: "Parceiros", url: "/parceiros", icon: Users, iconName: "Users", moduleKey: "parceiros" },
      { title: "Projetos", url: "/projetos", icon: FolderKanban, iconName: "FolderKanban", moduleKey: "projetos" },
      { title: "Bookmakers", url: "/bookmakers", icon: Building2, iconName: "Building2", moduleKey: "bookmakers" },
      { title: "Anotações", url: "/anotacoes", icon: StickyNote, iconName: "StickyNote", moduleKey: "central" },
    ],
  },
  {
    label: "FINANCEIRO",
    items: [
      { title: "Caixa", url: "/caixa", icon: Wallet, iconName: "Wallet", moduleKey: "caixa" },
      { title: "Financeiro", url: "/financeiro", icon: PieChart, iconName: "PieChart", moduleKey: "financeiro" },
      { title: "Captação", url: "/programa-indicacao", icon: UserPlus, iconName: "UserPlus", moduleKey: "captacao" },
    ],
  },
  {
    label: "FERRAMENTAS",
    items: [
      { title: "Prot. Progressiva", url: "#calculadora-lay", icon: Calculator, iconName: "Calculator", moduleKey: "ferramentas" },
    ],
  },
  {
    label: "COMUNIDADE",
    items: [
      { title: "Comunidade", url: "/comunidade", icon: Users2, iconName: "Users2", moduleKey: "comunidade" },
    ],
  },
  {
    label: "CONFIGURAÇÕES",
    items: [
      { title: "Bancos", url: "/bancos", icon: Landmark, iconName: "Landmark", moduleKey: "bancos" },
      { title: "Investidores", url: "/investidores", icon: TrendingUp, iconName: "TrendingUp", moduleKey: "investidores" },
      { title: "Operadores", url: "/operadores", icon: Briefcase, iconName: "Briefcase", moduleKey: "operadores" },
      
    ],
  },
  {
    label: "TESTES",
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
  const { favorites: projectFavorites } = useProjectFavorites();
  const { workspace, workspaceId } = useWorkspace();
  const { canAccess } = useModuleAccess();
  const { count: alertsCount } = useCentralAlertsCount();
  const { 
    workspaces: userWorkspaces, 
    pendingInvites, 
    loading: workspacesLoading,
    switching: workspaceSwitching,
    switchWorkspace,
    acceptInvite 
  } = useUserWorkspaces();
  const currentPath = location.pathname;
  
  // State for project names
  const [projectNames, setProjectNames] = useState<Record<string, string>>({});
  
  const isCollapsed = state === "collapsed";
  const isActive = (path: string) => currentPath === path;

  // Scroll overflow detection for collapsed sidebar
  const scrollRef = useRef<HTMLDivElement>(null);
  const [canScrollUp, setCanScrollUp] = useState(false);
  const [canScrollDown, setCanScrollDown] = useState(false);

  const checkScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    setCanScrollUp(el.scrollTop > 4);
    setCanScrollDown(el.scrollTop + el.clientHeight < el.scrollHeight - 4);
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    checkScroll();
    el.addEventListener("scroll", checkScroll, { passive: true });
    const ro = new ResizeObserver(checkScroll);
    ro.observe(el);
    return () => {
      el.removeEventListener("scroll", checkScroll);
      ro.disconnect();
    };
  }, [checkScroll, isCollapsed]);

  // Load project names for favorites
  useEffect(() => {
    const loadProjectNames = async () => {
      if (projectFavorites.length === 0) return;
      
      const projectIds = projectFavorites.map(f => f.project_id);
      const { data } = await supabase
        .from('projetos')
        .select('id, nome')
        .in('id', projectIds);
      
      if (data) {
        const names: Record<string, string> = {};
        data.forEach(p => {
          names[p.id] = p.nome;
        });
        setProjectNames(names);
      }
    };
    
    loadProjectNames();
  }, [projectFavorites]);

  // Function to check if user can see a menu item using the new module access system
  const canSeeItem = (item: MenuItem): boolean => {
    return canAccess(item.moduleKey);
  };

  const handleSignOut = async () => {
    await signOut();
    navigate("/auth");
  };

  // Abre calculadora em janela externa
  const handleMenuItemClick = (item: MenuItem, e: React.MouseEvent) => {
    if (item.url === '#calculadora-lay') {
      e.preventDefault();
      const width = 900;
      const height = 750;
      const left = Math.max(0, (window.screen.width - width) / 2);
      const top = Math.max(0, (window.screen.height - height) / 2);
      window.open(
        '/ferramentas/protecao-progressiva',
        'calculadora-protecao',
        `width=${width},height=${height},left=${left},top=${top},resizable=yes,scrollbars=yes`
      );
    }
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

  // Check if user has access to projects module
  const hasProjectAccess = canAccess("projetos");

  // Combine page favorites and project favorites
  const hasAnyFavorites = visibleFavorites.length > 0 || (hasProjectAccess && projectFavorites.length > 0);

  const renderMenuItem = (item: MenuItem) => {
    if (!canSeeItem(item)) return null;
    // Badge de alertas só aparece na Central (URL "/"), não em outros itens com moduleKey "central"
    const isCentralPage = item.url === "/";
    const showBadge = isCentralPage && alertsCount > 0;
    const isToolLink = item.url.startsWith('#');

    // Para links de ferramentas (que abrem popups), usamos button ao invés de NavLink
    if (isToolLink) {
      return (
        <SidebarMenuItem key={item.title}>
          {isCollapsed ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <SidebarMenuButton asChild>
                  <button 
                    onClick={(e) => handleMenuItemClick(item, e)}
                    className="flex items-center justify-center h-9 w-9 rounded-md transition-colors hover:bg-primary/10"
                  >
                    <item.icon className="h-4 w-4" />
                  </button>
                </SidebarMenuButton>
              </TooltipTrigger>
              <TooltipContent side="right" className="font-medium">
                {item.title}
              </TooltipContent>
            </Tooltip>
          ) : (
            <SidebarMenuButton asChild>
              <button 
                onClick={(e) => handleMenuItemClick(item, e)}
                className="flex items-center gap-3 px-3 py-2 rounded-md transition-colors hover:bg-primary/10 w-full text-left"
              >
                <item.icon className="h-4 w-4 shrink-0" />
                <span className="text-sm flex-1">{item.title}</span>
              </button>
            </SidebarMenuButton>
          )}
        </SidebarMenuItem>
      );
    }

    return (
      <SidebarMenuItem key={item.title}>
        {isCollapsed ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <SidebarMenuButton asChild isActive={isActive(item.url)}>
                <NavLink 
                  to={item.url} 
                  end 
                  className="relative flex items-center justify-center h-9 w-9 rounded-md transition-colors hover:bg-primary/10"
                  activeClassName="bg-primary/10 text-primary"
                >
                  <item.icon className="h-4 w-4" />
                  {showBadge && (
                    <Badge 
                      variant="destructive" 
                      className="absolute -top-1 -right-1 h-4 min-w-4 px-1 text-[10px] font-bold flex items-center justify-center"
                    >
                      {alertsCount > 99 ? "99+" : alertsCount}
                    </Badge>
                  )}
                </NavLink>
              </SidebarMenuButton>
            </TooltipTrigger>
            <TooltipContent side="right" className="font-medium">
              {item.title}
              {showBadge && ` (${alertsCount})`}
            </TooltipContent>
          </Tooltip>
        ) : (
          <SidebarMenuButton asChild isActive={isActive(item.url)}>
            <NavLink 
              to={item.url} 
              end 
              className="flex items-center gap-3 px-3 py-2 rounded-md transition-colors hover:bg-primary/10"
              activeClassName="bg-primary/10 text-primary font-medium"
            >
              <item.icon className="h-4 w-4 shrink-0" />
              <span className="text-sm flex-1">{item.title}</span>
              {showBadge && (
                <Badge 
                  variant="destructive" 
                  className="h-5 min-w-5 px-1.5 text-[10px] font-bold"
                >
                  {alertsCount > 99 ? "99+" : alertsCount}
                </Badge>
              )}
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
                  className="flex items-center justify-center h-9 w-9 rounded-md transition-colors hover:bg-primary/10"
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
              className="flex items-center gap-3 px-3 py-2 rounded-md transition-colors hover:bg-primary/10"
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

  const renderProjectFavoriteItem = (projectFavorite: { project_id: string }) => {
    const projectPath = `/projeto/${projectFavorite.project_id}`;
    const projectName = projectNames[projectFavorite.project_id] || "Projeto";

    return (
      <SidebarMenuItem key={projectFavorite.project_id}>
        {isCollapsed ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <SidebarMenuButton asChild isActive={currentPath === projectPath}>
                <NavLink 
                  to={projectPath}
                  className="flex items-center justify-center h-9 w-9 rounded-md transition-colors hover:bg-primary/10"
                  activeClassName="bg-primary/10 text-primary"
                >
                  <FolderKanban className="h-4 w-4" />
                </NavLink>
              </SidebarMenuButton>
            </TooltipTrigger>
            <TooltipContent side="right" className="font-medium">
              {projectName}
            </TooltipContent>
          </Tooltip>
        ) : (
          <SidebarMenuButton asChild isActive={currentPath === projectPath}>
            <NavLink 
              to={projectPath}
              className="flex items-center gap-3 px-3 py-2 rounded-md transition-colors hover:bg-primary/10"
              activeClassName="bg-primary/10 text-primary font-medium"
            >
              <FolderKanban className="h-4 w-4 shrink-0" />
              <span className="text-sm truncate">{projectName}</span>
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
      className={isCollapsed ? "w-16" : "w-56"}
      collapsible="icon"
    >
      <SidebarContent className="relative py-4 flex flex-col overflow-hidden">
        {/* Logo/Brand Section */}
        <div className="flex items-center justify-center px-3 pb-4 bg-transparent shrink-0">
          {isCollapsed ? (
            <img src="/favicon.png" alt="LABBET" className="h-10 w-10 bg-transparent" />
          ) : (
            <img src="/logo-horizontal.png" alt="LABBET" className="h-9 bg-transparent" />
          )}
        </div>

        {/* Workspace Switcher */}
        <div className={`px-2 pb-4 shrink-0 ${isCollapsed ? 'px-1' : ''}`}>
          <WorkspaceSwitcher
            workspaces={userWorkspaces}
            pendingInvites={pendingInvites}
            currentWorkspaceId={workspaceId}
            onSwitch={switchWorkspace}
            onAcceptInvite={acceptInvite}
            isCollapsed={isCollapsed}
            loading={workspacesLoading}
            switching={workspaceSwitching}
          />
        </div>

        <div className="mx-3 border-t border-border/50 mb-4 shrink-0" />

        {/* Scrollable area with overflow indicators */}
        <div className="relative flex-1 min-h-0">
          {/* Top scroll indicator */}
          {isCollapsed && canScrollUp && (
            <div 
              className="absolute top-0 left-0 right-0 z-10 flex justify-center py-0.5 bg-gradient-to-b from-sidebar to-transparent cursor-pointer"
              onClick={() => scrollRef.current?.scrollBy({ top: -80, behavior: 'smooth' })}
            >
              <ChevronUp className="h-3.5 w-3.5 text-muted-foreground animate-pulse" />
            </div>
          )}

          <div 
            ref={scrollRef} 
            className="h-full overflow-y-auto overflow-x-hidden scrollbar-none"
            style={{ scrollbarWidth: 'none' }}
          >
            {/* Favorites Section */}
            {hasAnyFavorites && (
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
                    {hasProjectAccess && projectFavorites.map(renderProjectFavoriteItem)}
                  </SidebarMenu>
                </SidebarGroupContent>
              </SidebarGroup>
            )}

            {hasAnyFavorites && (
              <div className="my-4 mx-3 border-t border-border/50" />
            )}

            {/* Menu Groups */}
            <div className="px-2">
              {menuGroups.map((group, index) => renderMenuGroup(group, index))}
            </div>
          </div>

          {/* Bottom scroll indicator */}
          {isCollapsed && canScrollDown && (
            <div 
              className="absolute bottom-0 left-0 right-0 z-10 flex justify-center py-0.5 bg-gradient-to-t from-sidebar to-transparent cursor-pointer"
              onClick={() => scrollRef.current?.scrollBy({ top: 80, behavior: 'smooth' })}
            >
              <ChevronDown className="h-3.5 w-3.5 text-muted-foreground animate-pulse" />
            </div>
          )}
        </div>
      </SidebarContent>

      {/* User footer */}
      <SidebarFooter className="border-t border-border/50 p-2">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className={`
              flex items-center gap-3 w-full p-2 rounded-lg 
              hover:bg-primary/10 transition-colors
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
            {isSystemOwner && (
              <DropdownMenuItem onClick={() => navigate("/admin")}>
                <ShieldCheck className="mr-2 h-4 w-4" />
                Administração do Sistema
              </DropdownMenuItem>
            )}
            {canManageWorkspace && (
              <DropdownMenuItem onClick={() => navigate("/workspace")}>
                <Settings className="mr-2 h-4 w-4" />
                Workspace
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
