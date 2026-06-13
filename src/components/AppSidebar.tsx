import { Bell, Users, Users2, Landmark, Wallet, Building2, TrendingUp, UserPlus, PieChart, Briefcase, FolderKanban, Settings, LogOut, Star, Shield, Calculator, StickyNote, ShieldCheck, ChevronUp, ChevronDown, Sun, Moon, Target, Layers, ArrowLeftRight, Zap, Truck, ClipboardList, CalendarDays, Activity, X, ArrowDownToLine, ArrowUpFromLine, HandCoins, Clock, MessageCircle, Globe, Beaker } from "lucide-react";
import { useSolicitacoesKpis } from "@/hooks/useSolicitacoes";
import { NavLink } from "@/components/NavLink";
import { useLocation, useNavigate } from "react-router-dom";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useAuth } from "@/hooks/useAuth";
import { useRole } from "@/hooks/useRole";
import { useFavorites } from "@/hooks/useFavorites";
import { useProjectFavorites } from "@/hooks/useProjectFavorites";
import { useModuleAccess } from "@/hooks/useModuleAccess";
import { useCentralAlertsCount } from "@/hooks/useCentralAlertsCount";
import { useChatNotifications } from "@/hooks/useChatNotifications";
import { useUserWorkspaces } from "@/hooks/useUserWorkspaces";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuSeparator, ContextMenuTrigger } from "@/components/ui/context-menu";
import { openApostaWindow, openApostaMultiplaWindow, openSurebetWindow } from "@/lib/windowHelper";
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
import { SidebarFlyoutMenu, SidebarFlyoutItem, SidebarDynamicGroup } from "./sidebar/SidebarFlyout";
import { SidebarItem as SidebarItemType } from "./sidebar/types";
import { supabase } from "@/integrations/supabase/client";
import { useEffect, useState, useRef, useCallback, useMemo } from "react";
import { useTheme } from "next-themes";
import { ContextMenu as RadixCtxMenu, ContextMenuContent as RadixCtxContent, ContextMenuItem as RadixCtxItem, ContextMenuTrigger as RadixCtxTrigger } from "@/components/ui/context-menu";

/** Single favorite shortcut row in the sidebar (ATALHOS) */
function FavoriteShortcutItem({
  fav,
  icon: Icon,
  isCollapsed,
  isActive,
  onRemove,
}: {
  fav: { id: string; page_path: string; page_title: string; page_icon: string };
  icon: any;
  isCollapsed: boolean;
  isActive: boolean;
  onRemove: () => void;
}) {
  const button = isCollapsed ? (
    <Tooltip>
      <TooltipTrigger asChild>
        <SidebarMenuButton asChild isActive={isActive}>
          <NavLink
            to={fav.page_path}
            end
            className={cn(
              "flex items-center justify-center h-9 w-9 rounded-[7px] transition-all duration-120 hover:bg-white/5",
              isActive && "bg-primary/10"
            )}
            activeClassName="text-primary"
          >
            <Icon className={cn("h-[15px] w-[15px] transition-all", isActive ? "text-primary opacity-100" : "opacity-35 hover:opacity-60")} />
          </NavLink>
        </SidebarMenuButton>
      </TooltipTrigger>
      <TooltipContent side="right" className="font-medium">
        {fav.page_title}
      </TooltipContent>
    </Tooltip>
  ) : (
    <SidebarMenuButton asChild isActive={isActive}>
      <NavLink
        to={fav.page_path}
        end
        className={cn(
          "group/fav flex items-center gap-3 px-3 py-2 rounded-[7px] transition-all duration-120 hover:bg-white/5",
          isActive && "bg-primary/10"
        )}
        activeClassName="text-white font-medium"
      >
        <Icon className={cn("h-[15px] w-[15px] shrink-0 transition-all", isActive ? "text-primary opacity-100" : "opacity-35 group-hover/fav:opacity-60")} />
        <span className={cn("text-[13px] flex-1 truncate transition-colors", isActive ? "text-white font-medium" : "text-white/50 group-hover/fav:text-white/80")}>{fav.page_title}</span>
        <button
          type="button"
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); onRemove(); }}
          className="opacity-0 group-hover/fav:opacity-100 transition-opacity p-0.5 rounded hover:bg-destructive/20 hover:text-destructive"
          aria-label="Remover dos atalhos"
          title="Remover dos atalhos"
        >
          <X className="h-3 w-3" />
        </button>
      </NavLink>
    </SidebarMenuButton>
  );

  return (
    <SidebarMenuItem
      data-sidebar-item={fav.page_path}
      data-sidebar-origin="favorite"
      data-favorite-type="page"
      data-sidebar-active={isActive ? "true" : "false"}
    >
      <RadixCtxMenu>
        <RadixCtxTrigger asChild>
          <div className="w-full relative group">
            {isActive && (
              <div className="absolute left-[8px] top-1/2 -translate-y-1/2 w-[2.5px] h-3/5 bg-primary rounded-r-full z-30" />
            )}
            {button}
          </div>
        </RadixCtxTrigger>
        <RadixCtxContent>
          <RadixCtxItem onClick={onRemove} className="text-destructive focus:text-destructive">
            <X className="mr-2 h-4 w-4" />
            Remover dos atalhos
          </RadixCtxItem>
        </RadixCtxContent>
      </RadixCtxMenu>
    </SidebarMenuItem>
  );
}

/** Menu item for theme toggle inside the profile dropdown */
function ThemeMenuItem() {
  const { theme, setTheme } = useTheme();
  const isDark = theme === "dark";
  return (
    <DropdownMenuItem
      onClick={(e) => {
        e.preventDefault();
        setTheme(isDark ? "light" : "dark");
      }}
    >
      {isDark ? <Sun className="mr-2 h-4 w-4" /> : <Moon className="mr-2 h-4 w-4" />}
      {isDark ? "Tema Claro" : "Tema Escuro"}
    </DropdownMenuItem>
  );
}
import { useWorkspace } from "@/hooks/useWorkspace";

interface MenuItem {
  title: string;
  url: string;
  icon: any;
  iconName: string;
  moduleKey: string;
  children?: MenuItem[];
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
  UserPlus, PieChart, Briefcase, FolderKanban, Settings, Star, Shield, Calculator, StickyNote, Truck, ClipboardList, Clock
};

// Menu structure organized by functional domain
// moduleKey is used to check access via useModuleAccess
const menuGroups: MenuGroup[] = [
  {
    label: "VISÃO GERAL",
    items: [
      { title: "Central", url: "/", icon: Bell, iconName: "Bell", moduleKey: "central" },
      { title: "Solicitações", url: "/solicitacoes", icon: ClipboardList, iconName: "ClipboardList", moduleKey: "central" },
      { title: "Comunidade", url: "/comunidade", icon: Users2, iconName: "Users2", moduleKey: "comunidade" },
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
      {
        title: "Caixa",
        url: "#caixa-menu",
        icon: Wallet,
        iconName: "Wallet",
        moduleKey: "caixa",
        children: [
          { title: "Abrir Caixa", url: "/caixa", icon: Wallet, iconName: "Wallet", moduleKey: "caixa" },
          { title: "Transferência", url: "#caixa-transferencia", icon: ArrowLeftRight, iconName: "ArrowLeftRight", moduleKey: "caixa" },
          { title: "Depósito", url: "#caixa-deposito", icon: ArrowDownToLine, iconName: "ArrowDownToLine", moduleKey: "caixa" },
          { title: "Saque", url: "#caixa-saque", icon: ArrowUpFromLine, iconName: "ArrowUpFromLine", moduleKey: "caixa" },
          { title: "Aporte / Liquidação", url: "#caixa-aporte", icon: HandCoins, iconName: "HandCoins", moduleKey: "caixa" },
        ],
      },
      { title: "Financeiro", url: "/financeiro", icon: PieChart, iconName: "PieChart", moduleKey: "financeiro" },
      { title: "Captação", url: "/programa-indicacao", icon: UserPlus, iconName: "UserPlus", moduleKey: "captacao" },
      { title: "Fornecedores", url: "/fornecedores-portal", icon: Truck, iconName: "Truck", moduleKey: "captacao" },
    ],
  },
  {
    label: "LABORATÓRIO",
    items: [
      {
        title: "Analyzer",
        url: "#laboratorio-analyzer",
        icon: Layers,
        iconName: "Layers",
        moduleKey: "ferramentas",
        children: [
          { title: "ValueBet", url: "/laboratorio/valuebet", icon: Activity, iconName: "Activity", moduleKey: "ferramentas" },
        ]
      }
    ]
  },
  {
    label: "FERRAMENTAS",
    items: [
      { 
        title: "Calculadoras", 
        url: "#calculadoras", 
        icon: Calculator, 
        iconName: "Calculator", 
        moduleKey: "ferramentas",
        children: [
          { title: "Calculadora EV", url: "#calculadora-ev", icon: Calculator, iconName: "Calculator", moduleKey: "ferramentas" },
          { title: "Calculadora Extração", url: "#calculadora-extracao", icon: Calculator, iconName: "Calculator", moduleKey: "ferramentas" },
          { title: "Hedge Probabilístico", url: "#calculadora-hedge-prob", icon: Target, iconName: "Target", moduleKey: "ferramentas" },
          { title: "Ponto de Edge Futuro", url: "#calculadora-ponto-futuro", icon: Clock, iconName: "Clock", moduleKey: "ferramentas" },
          { title: "Extração de Bônus", url: "#calculadora-extracao-bonus", icon: Zap, iconName: "Zap", moduleKey: "ferramentas" },
        ]
      },
      { title: "Planejamento", url: "/ferramentas/planejamento", icon: CalendarDays, iconName: "CalendarDays", moduleKey: "ferramentas" },
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
];

// Flatten all items for permission check
const allMenuItems = menuGroups.flatMap(g => g.items);

export function AppSidebar() {
  const { state } = useSidebar();
  const location = useLocation();
  const navigate = useNavigate();
   const { user, signOut, role, isSystemOwner, publicId, workspaceId } = useAuth();
  const { canManageWorkspace } = useRole();
  const { favorites, removeFavorite } = useFavorites();
  const { favorites: projectFavorites, removeFavorite: removeProjectFavorite } = useProjectFavorites();
   const { workspace } = useWorkspace();
  const { canAccess } = useModuleAccess();
  const { count: alertsCount } = useCentralAlertsCount();
  const { unreadCount: chatUnreadCount } = useChatNotifications();
  const { data: kpisSolicitacoes } = useSolicitacoesKpis();
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
  const [projectDefaultTabs, setProjectDefaultTabs] = useState<Record<string, string>>({});
  
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
    const loadProjectData = async () => {
      if (projectFavorites.length === 0) return;
      
      const projectIds = projectFavorites.map(f => f.project_id);
      
      // Load names and default tabs in parallel
      const [namesResult, tabsResult] = await Promise.all([
        supabase.from('projetos').select('id, nome').in('id', projectIds),
        user ? supabase.from('project_user_preferences').select('project_id, default_tab').eq('user_id', user.id).in('project_id', projectIds) : Promise.resolve({ data: null }),
      ]);
      
      if (namesResult.data) {
        const names: Record<string, string> = {};
        namesResult.data.forEach(p => { names[p.id] = p.nome; });
        setProjectNames(names);
      }
      
      if (tabsResult.data) {
        const tabs: Record<string, string> = {};
        tabsResult.data.forEach((p: any) => { tabs[p.project_id] = p.default_tab; });
        setProjectDefaultTabs(tabs);
      }
    };
    
    loadProjectData();
  }, [projectFavorites, user]);

  // Function to check if user can see a menu item using the new module access system
  const canSeeItem = (item: MenuItem): boolean => {
    return canAccess(item.moduleKey);
  };

  const handleSignOut = async () => {
    await signOut();
    navigate("/auth");
  };

  // Abre calculadora em janela externa
  const handleMenuItemClick = (item: MenuItem | SidebarItemType, e: React.MouseEvent) => {
    const url = 'url' in item ? item.url : item.href;
    if (!url) return;

    const toolMap: Record<string, { url: string; name: string }> = {
      '#calculadora-ev': { url: '/ferramentas/calculadora-ev', name: 'calculadora-ev' },
      '#calculadora-extracao': { url: '/ferramentas/calculadora-extracao', name: 'calculadora-extracao' },
      '#calculadora-hedge-prob': { url: '/ferramentas/calculadora-hedge-probabilistica', name: 'calculadora-hedge-probabilistica' },
      '#calculadora-ponto-futuro': { url: '/ferramentas/calculadora-ponto-futuro', name: 'calculadora-ponto-futuro' },
      '#calculadora-extracao-bonus': { url: '/ferramentas/extracao-bonus', name: 'calculadora-extracao-bonus' },
    };

    // Caixa quick actions → navega para /caixa abrindo o dialog correto
    const caixaActionMap: Record<string, string> = {
      '#caixa-transferencia': 'TRANSFERENCIA',
      '#caixa-deposito': 'DEPOSITO',
      '#caixa-saque': 'SAQUE',
      '#caixa-aporte': 'APORTE_FINANCEIRO',
    };
    const caixaAction = caixaActionMap[url];
    if (caixaAction) {
      e.preventDefault();
      navigate('/caixa', { state: { openDialog: true, tipoTransacao: caixaAction } });
      return;
    }

    const tool = toolMap[url];
    if (tool) {
      e.preventDefault();
      const width = url === '#calculadora-ev' ? 420 : (url === '#calculadora-extracao' || url === '#calculadora-ponto-futuro' || url === '#calculadora-extracao-bonus') ? 1000 : 900;
      if (url === '#calculadora-hedge-prob') {
        const w = 1100;
        const h = 850;
        const l = Math.max(0, (window.screen.width - w) / 2);
        const t = Math.max(0, (window.screen.height - h) / 2);
        window.open(tool.url, tool.name, `width=${w},height=${h},left=${l},top=${t},resizable=yes,scrollbars=yes`);
        return;
      }
      const height = url === '#calculadora-ev' ? 580 : (url === '#calculadora-extracao' || url === '#calculadora-ponto-futuro' || url === '#calculadora-extracao-bonus') ? 800 : 750;
      const left = Math.max(0, (window.screen.width - width) / 2);
      const top = Math.max(0, (window.screen.height - height) / 2);
      window.open(
        tool.url,
        tool.name,
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

    const isCentralPage = item.url === "/";
    const isSolicitacoesPage = item.url === "/solicitacoes";
    const isComunidadePage = item.url === "/comunidade";
    const solicitacoesPendentes = kpisSolicitacoes?.pendentes ?? 0;
    
    const showBadge = (isCentralPage && alertsCount > 0) || 
                     (isSolicitacoesPage && solicitacoesPendentes > 0) ||
                     (isComunidadePage && chatUnreadCount > 0);
                     
    const badgeCount = isSolicitacoesPage ? solicitacoesPendentes : 
                      isComunidadePage ? chatUnreadCount : alertsCount;
    const isToolLink = item.url.startsWith('#');

    // Estilos comuns para itens de menu
    const getBadgeStyle = (pageUrl: string) => {
      if (pageUrl === "/") return "bg-green-500/15 text-green-500"; // Central (Verde)
      if (pageUrl === "/solicitacoes") return "bg-red-500/15 text-red-500"; // Solicitações (Vermelho)
      return "bg-white/7 text-white/30"; // Outros (Neutro)
    };

    const sidebarItem: SidebarItemType = {
      id: item.url,
      label: item.title,
      href: item.url,
      icon: item.icon,
      isTool: isToolLink,
      badgeCount: showBadge ? badgeCount : undefined,
      children: item.children?.filter(canSeeItem).map(child => ({
        id: child.url,
        label: child.title,
        href: child.url,
        icon: child.icon,
        isTool: child.url.startsWith('#'),
      }))
    };

    if (item.children && item.children.length > 0) {
      return (
        <SidebarFlyoutMenu 
          key={item.title} 
          item={sidebarItem} 
          onItemClick={handleMenuItemClick}
        />
      );
    }

    const itemIsActive = isActive(item.url);

    if (isToolLink) {
      return (
        <SidebarMenuItem key={item.title} data-sidebar-item={item.url}>
          {isCollapsed ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <SidebarMenuButton asChild>
                  <button 
                    onClick={(e) => handleMenuItemClick(item, e)}
                    className="flex items-center justify-center h-9 w-9 rounded-[7px] transition-all duration-120 hover:bg-white/5"
                  >
                    <item.icon className="h-[15px] w-[15px] opacity-35 group-hover:opacity-60 transition-opacity" />
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
                className="group flex items-center gap-3 px-3 py-2 rounded-[7px] transition-all duration-120 hover:bg-white/5 w-full text-left"
              >
                <item.icon className="h-[15px] w-[15px] shrink-0 opacity-35 group-hover:opacity-60 transition-opacity" />
                <span className="text-[13px] flex-1 text-white/50 group-hover:text-white/80 transition-colors">{item.title}</span>
              </button>
            </SidebarMenuButton>
          )}
        </SidebarMenuItem>
      );
    }

    return (
      <SidebarMenuItem key={item.title} data-sidebar-item={item.url} data-sidebar-active={itemIsActive ? "true" : "false"}>
        {isCollapsed ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <SidebarMenuButton asChild isActive={itemIsActive}>
                <NavLink 
                  to={item.url} 
                  end 
                  className={cn(
                    "relative flex items-center justify-center h-9 w-9 rounded-[7px] transition-all duration-120 hover:bg-white/5",
                    itemIsActive && "bg-primary/10"
                  )}
                  activeClassName="text-primary"
                >
                  <item.icon className={cn("h-[15px] w-[15px] transition-all", itemIsActive ? "text-primary opacity-100" : "opacity-35 hover:opacity-60")} />
                  {showBadge && (
                    <div className={cn(
                      "absolute -top-1 -right-1 h-[18px] min-w-[18px] px-1 text-[10px] font-semibold flex items-center justify-center rounded-[5px]",
                      getBadgeStyle(item.url)
                    )}>
                      {badgeCount > 99 ? "99+" : badgeCount}
                    </div>
                  )}
                </NavLink>
              </SidebarMenuButton>
            </TooltipTrigger>
            <TooltipContent side="right" className="font-medium">
              {item.title}
              {showBadge && ` (${badgeCount})`}
            </TooltipContent>
          </Tooltip>
        ) : (
          <SidebarMenuButton asChild isActive={itemIsActive}>
            <NavLink 
              to={item.url} 
              end 
              className={cn(
                "group flex items-center gap-3 px-3 py-2 rounded-[7px] transition-all duration-120 hover:bg-white/5 relative",
                itemIsActive && "bg-primary/10"
              )}
              activeClassName="text-white font-medium"
            >
              {itemIsActive && (
                <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[2.5px] h-3/5 bg-primary rounded-r-full" />
              )}
              <item.icon className={cn("h-[15px] w-[15px] shrink-0 transition-all", itemIsActive ? "text-primary opacity-100" : "opacity-35 group-hover:opacity-60")} />
              <span className={cn("text-[13px] flex-1 transition-colors", itemIsActive ? "text-white font-medium" : "text-white/50 group-hover:text-white/80")}>
                {item.title}
              </span>
              {showBadge && (
                <div className={cn(
                  "h-[18px] min-w-[18px] px-1.5 text-[10px] font-semibold flex items-center justify-center rounded-[5px]",
                  getBadgeStyle(item.url)
                )}>
                  {badgeCount > 99 ? "99+" : badgeCount}
                </div>
              )}
            </NavLink>
          </SidebarMenuButton>
        )}
      </SidebarMenuItem>
    );
  };


  return (
    <Sidebar
      className={isCollapsed ? "w-[72px]" : "w-56"}
      collapsible="icon"
      data-sidebar-expanded={!isCollapsed ? "true" : "false"}
    >
      <SidebarContent className="relative py-4 flex flex-col overflow-hidden">
        {/* Logo/Brand Section — clique alterna expandir/recolher */}
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={toggleSidebar}
              aria-label={isCollapsed ? "Expandir menu" : "Recolher menu"}
              aria-expanded={!isCollapsed}
              className="group flex items-center justify-center px-3 pb-4 bg-transparent shrink-0 cursor-pointer rounded-md outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring hover:bg-sidebar-accent/30 transition-colors"
            >
              {isCollapsed ? (
                <img src="/favicon-sidebar.png" alt="LABBET" className="h-12 w-12 shrink-0 object-contain" />
              ) : (
                <img src="/logo-horizontal.png" alt="LABBET" className="h-9 bg-transparent" />
              )}
            </button>
          </TooltipTrigger>
          <TooltipContent side="right" sideOffset={8}>
            {isCollapsed ? "Expandir menu" : "Recolher menu"}
          </TooltipContent>
        </Tooltip>

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

        <div className="mx-3 border-t border-white/5 mb-4 shrink-0" />

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
            {/* ATALHOS / Favoritos Section */}
            {hasAnyFavorites && (
              <div className="space-y-1 py-1" data-sidebar-group="atalhos">
                {!isCollapsed && (
                  <SidebarGroupLabel className="px-4 text-[10px] uppercase tracking-[0.08em] text-white/22 font-semibold mb-1">
                    ATALHOS
                  </SidebarGroupLabel>
                )}
                
                <SidebarMenu className="px-2 space-y-0.5">
                  {/* Projetos Favoritos as Flyout */}
                  {hasProjectAccess && projectFavorites.length > 0 && (
                    <div
                      data-sidebar-origin="favorite"
                      data-favorite-type="project"
                      data-favorites-count={projectFavorites.length}
                    >
                      <SidebarFlyoutMenu
                        item={{
                          id: "projetos-favoritos",
                          label: "Projetos Favoritos",
                          icon: Star,
                          children: projectFavorites.map(pf => ({
                            id: pf.project_id,
                            label: projectNames[pf.project_id] || "Carregando...",
                            href: `/projeto/${pf.project_id}`,
                            icon: FolderKanban,
                            metadata: { favoriteType: "project", projectId: pf.project_id },
                          }))
                        }}
                        onItemClick={handleMenuItemClick}
                        onItemRemove={(child) => {
                          const pid = child.metadata?.projectId as string | undefined;
                          if (pid) removeProjectFavorite(pid);
                        }}
                      />
                    </div>
                  )}

                  {/* Other common favorites as flat items */}
                  {visibleFavorites.map(fav => (
                    <FavoriteShortcutItem
                      key={fav.id}
                      fav={fav}
                      icon={iconMap[fav.page_icon] || Star}
                      isCollapsed={isCollapsed}
                      isActive={isActive(fav.page_path)}
                      onRemove={() => removeFavorite(fav.page_path)}
                    />
                  ))}
                </SidebarMenu>
              </div>
            )}

            {hasAnyFavorites && (
              <div className="my-2 mx-3 border-t border-white/5" />
            )}

            {/* Menu Groups */}
            <div className="px-2">
              {menuGroups.map((group, index) => {
                const visibleItems = group.items.filter(canSeeItem);
                if (visibleItems.length === 0) return null;

                return (
                  <SidebarGroup key={group.label} className={index > 0 ? "mt-4" : ""}>
                    {!isCollapsed && (
                      <SidebarGroupLabel 
                        className="text-[10px] font-semibold tracking-[0.08em] text-white/22 uppercase mb-2 px-3"
                      >
                        {group.label}
                      </SidebarGroupLabel>
                    )}
                    <SidebarGroupContent>
                      <SidebarMenu className="space-y-0.5">
                        {visibleItems.map(item => renderMenuItem(item))}
                      </SidebarMenu>
                    </SidebarGroupContent>
                  </SidebarGroup>
                );
              })}
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
      <SidebarFooter className="border-t border-white/5 p-2">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className={`
              flex items-center gap-3 w-full p-2 rounded-lg 
              hover:bg-white/5 transition-all
              ${isCollapsed ? 'justify-center' : ''}
            `}>
              <div className="relative">
                <Avatar className="h-7 w-7 rounded-full overflow-hidden border border-white/5">
                  <AvatarFallback className="bg-primary text-white text-[10px] font-bold">
                    {getUserInitials()}
                  </AvatarFallback>
                </Avatar>
                {(alertsCount > 0) && (
                  <span className="absolute -top-0.5 -right-0.5 h-[7px] w-[7px] bg-red-500 rounded-full border border-sidebar" />
                )}
              </div>
              {!isCollapsed && (
                <div className="flex-1 text-left overflow-hidden pr-2">
                  <p className="text-[12px] font-medium truncate text-white/55 leading-tight">{user?.email?.split('@')[0] || 'Usuário'}</p>
                  <p className="text-[11px] text-white/20 leading-tight">
                    {isSystemOwner ? getRoleLabel('system_owner') : getRoleLabel(role)}
                  </p>
                </div>
              )}
              {!isCollapsed && <LogOut className="h-3.5 w-3.5 text-white/20 ml-auto shrink-0" />}
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
             {/* Ledger Monitor for specific workspaces or system owners */}
             {(isSystemOwner || 
               ((workspaceId === 'f8b6f7ce-92b9-4d26-899a-0f0eeb1324cd' || workspaceId === 'feee9758-a7f4-474c-b2b1-679b66ec1cd9') && 
                (role === 'owner' || role === 'admin'))
             ) && (
               <DropdownMenuItem
                 onClick={() =>
                   window.open("/dev/ledger-monitor", "_blank", "noopener,noreferrer")
                 }
               >
                 <Activity className="mr-2 h-4 w-4" />
                 Ledger Monitor
               </DropdownMenuItem>
             )}
            {isSystemOwner && (
              <DropdownMenuItem onClick={() => navigate("/admin/api-explorer")}>
                <Globe className="mr-2 h-4 w-4" />
                Explorador de Dados
                <Badge variant="secondary" className="ml-auto text-[8px] h-3 px-1">novo</Badge>
              </DropdownMenuItem>
            )}
            {canManageWorkspace && (
              <DropdownMenuItem onClick={() => navigate("/workspace")}>
                <Settings className="mr-2 h-4 w-4" />
                Workspace
              </DropdownMenuItem>
            )}
            <ThemeMenuItem />
            <DropdownMenuSeparator />
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
