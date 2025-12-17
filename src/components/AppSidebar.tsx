import { Bell, Users, Landmark, Wallet, Building2, TrendingUp, UserPlus, PieChart, Briefcase, FolderKanban, FlaskConical, Settings, LogOut } from "lucide-react";
import { NavLink } from "@/components/NavLink";
import { useLocation, useNavigate } from "react-router-dom";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useAuth } from "@/hooks/useAuth";
import { useRole } from "@/hooks/useRole";
import { usePermission } from "@/hooks/usePermission";
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
  SidebarSeparator,
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

// Menu principal - Operações
const mainMenuItems: MenuItem[] = [
  { title: "Central", url: "/", icon: Bell },
  { title: "Parceiros", url: "/parceiros", icon: Users, permission: "partners:view" },
  { title: "Investidores", url: "/investidores", icon: TrendingUp, permission: "investors:view" },
  { title: "Bancos", url: "/bancos", icon: Landmark, permission: "finance:view" },
  { title: "Caixa", url: "/caixa", icon: Wallet, permission: "cash:view" },
  { title: "Casas", url: "/bookmakers", icon: Building2, permission: "bookmakers:view" },
  { title: "Financeiro", url: "/financeiro", icon: PieChart, permission: "finance:view" },
];

// Menu de Operadores e Projetos
const operacoesMenuItems: MenuItem[] = [
  { title: "Operadores", url: "/operadores", icon: Briefcase, permission: "operators:view" },
  { title: "Projetos", url: "/projetos", icon: FolderKanban, permission: "projects:view" },
];

// Menu de Captação
const captacaoMenuItems: MenuItem[] = [
  { title: "Captação de Parceiros", url: "/programa-indicacao", icon: UserPlus, permission: "acquisition:view" },
];

// Menu de Administração
const adminMenuItems: MenuItem[] = [
  { title: "Workspace", url: "/workspace", icon: Settings, roles: ["owner", "admin", "master"] },
];

// Menu de Desenvolvimento
const devMenuItems: MenuItem[] = [
  { title: "Testes", url: "/testes", icon: FlaskConical, roles: ["owner", "master"] },
];

export function AppSidebar() {
  const { state } = useSidebar();
  const location = useLocation();
  const navigate = useNavigate();
  const { user, signOut, role } = useAuth();
  const { canManageWorkspace, isMaster, isOwner } = useRole();
  const currentPath = location.pathname;
  
  const isCollapsed = state === "collapsed";
  const isActive = (path: string) => currentPath === path;

  // Function to check if user can see a menu item
  const canSeeItem = (item: MenuItem): boolean => {
    // If no restrictions, show to all
    if (!item.permission && !item.roles) return true;

    // Owner and master can see everything
    if (role === 'owner' || role === 'master') return true;

    // Check role restriction
    if (item.roles && item.roles.length > 0) {
      if (!role || !item.roles.includes(role)) return false;
    }

    // For permission-based items, admin can see everything
    if (item.permission && role === 'admin') return true;

    // For specific permissions, we'd need async check
    // For now, show all permission-based items and let the route handle it
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
    );
  };

  const filteredMainMenu = mainMenuItems.filter(canSeeItem);
  const filteredOperacoesMenu = operacoesMenuItems.filter(canSeeItem);
  const filteredCaptacaoMenu = captacaoMenuItems.filter(canSeeItem);
  const filteredAdminMenu = adminMenuItems.filter(canSeeItem);
  const filteredDevMenu = devMenuItems.filter(canSeeItem);

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

        {/* Menu Principal */}
        {filteredMainMenu.length > 0 && (
          <SidebarGroup>
            <SidebarGroupLabel className={isCollapsed ? 'sr-only' : ''}>
              Menu Principal
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {filteredMainMenu.map(renderMenuItem)}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}

        {filteredOperacoesMenu.length > 0 && (
          <>
            <SidebarSeparator />
            <SidebarGroup>
              <SidebarGroupLabel className={isCollapsed ? 'sr-only' : ''}>
                Operações
              </SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {filteredOperacoesMenu.map(renderMenuItem)}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          </>
        )}

        {filteredCaptacaoMenu.length > 0 && (
          <>
            <SidebarSeparator />
            <SidebarGroup>
              <SidebarGroupLabel className={isCollapsed ? 'sr-only' : ''}>
                Captação
              </SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {filteredCaptacaoMenu.map(renderMenuItem)}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          </>
        )}

        {filteredAdminMenu.length > 0 && (
          <>
            <SidebarSeparator />
            <SidebarGroup>
              <SidebarGroupLabel className={isCollapsed ? 'sr-only' : ''}>
                Administração
              </SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {filteredAdminMenu.map(renderMenuItem)}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          </>
        )}

        {filteredDevMenu.length > 0 && (
          <>
            <SidebarSeparator />
            <SidebarGroup>
              <SidebarGroupLabel className={isCollapsed ? 'sr-only' : ''}>
                Desenvolvimento
              </SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {filteredDevMenu.map(renderMenuItem)}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          </>
        )}
      </SidebarContent>

      {/* User footer */}
      <SidebarFooter className="border-t border-border">
        <div className={`p-2 ${isCollapsed ? 'flex justify-center' : ''}`}>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className={`flex items-center gap-3 w-full p-2 rounded-lg hover:bg-accent/50 transition-colors ${isCollapsed ? 'justify-center' : ''}`}>
                <Avatar className="h-8 w-8">
                  <AvatarFallback className="bg-primary/10 text-primary text-sm">
                    {getUserInitials()}
                  </AvatarFallback>
                </Avatar>
                {!isCollapsed && (
                  <div className="flex-1 text-left overflow-hidden">
                    <p className="text-sm font-medium truncate">{user?.email}</p>
                    <p className="text-xs text-muted-foreground capitalize">{role || 'usuário'}</p>
                  </div>
                )}
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <div className="px-2 py-1.5">
                <p className="text-sm font-medium">{user?.email}</p>
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
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
