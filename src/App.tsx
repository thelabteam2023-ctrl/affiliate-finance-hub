import { Suspense, lazy, useCallback, useEffect, useRef, useState } from "react";
import type { ComponentType } from "react";
import { ThemeProvider } from "next-themes";
import { TopBarProvider, useTopBar } from "@/contexts/TopBarContext";
import { NotesDrawer } from "@/components/NotesDrawer";
import { ChatDrawer } from "@/components/ChatDrawer";
import { ChatNotificationManager } from "@/components/chat/ChatNotificationManager";
import { Toaster } from "@/components/ui/toaster";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
import { useChatNotifications } from "@/hooks/useChatNotifications";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { CalculadoraProvider } from "@/contexts/CalculadoraContext";
import { ApostaPopupProvider } from "@/contexts/ApostaPopupContext";
import { ApostaPopupContainer } from "@/components/popups/ApostaPopupContainer";
import { ExchangeRatesProvider } from "@/contexts/ExchangeRatesContext";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, useLocation } from "react-router-dom";
import { SidebarProvider, SidebarTrigger, useSidebar } from "@/components/ui/sidebar";
import { useEdgeSwipeToOpenSidebar } from "@/hooks/useEdgeSwipeToOpenSidebar";
import { AuthProvider } from "@/contexts/AuthContext";
import { PermissionsProvider } from "@/contexts/PermissionsContext";
import { PresenceProvider } from "@/contexts/PresenceContext";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { AppSidebar } from "@/components/AppSidebar";
import { InactivityWarningBanner } from "@/components/InactivityWarningBanner";
import { useInactivityTimeout } from "@/hooks/useInactivityTimeout";
import { Loader2, NotebookPen, MessageCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { installRpcInterceptor } from "@/lib/dev/rpcInterceptor";
import { GlobalErrorBoundary } from "@/components/GlobalErrorBoundary";
import { ErrorMonitorPanel } from "@/components/ErrorMonitorPanel";

// Install RPC interceptor for the system-owner Ledger Monitor (no-op for everyone else)
installRpcInterceptor();

// ─── Eager imports: lightweight pages / public routes ───
import Index from "./pages/Index";
import Auth from "./pages/Auth";
import ResetPassword from "./pages/ResetPassword";
import AcceptInvite from "./pages/AcceptInvite";
import NotFound from "./pages/NotFound";

function lazyWithChunkRetry<T extends { default: ComponentType<any> }>(factory: () => Promise<T>) {
  return lazy(async () => {
    try {
      const mod = await factory();
      sessionStorage.removeItem("stakesync:chunk-reload");
      return mod;
    } catch (error: any) {
      const message = String(error?.message ?? error ?? "");
      const isChunkError =
        message.includes("Failed to fetch dynamically imported module") ||
        message.includes("Importing a module script failed") ||
        message.includes("ChunkLoadError");

      if (isChunkError && sessionStorage.getItem("stakesync:chunk-reload") !== "1") {
        sessionStorage.setItem("stakesync:chunk-reload", "1");
        window.location.reload();
        return new Promise<T>(() => undefined);
      }

      throw error;
    }
  });
}

// ─── Lazy imports: heavy authenticated pages ───
const GestaoParceiros = lazyWithChunkRetry(() => import("./pages/GestaoParceiros"));
const GestaoBookmakers = lazyWithChunkRetry(() => import("./pages/GestaoBookmakers"));
const GestaoBancos = lazyWithChunkRetry(() => import("./pages/GestaoBancos"));
const GestaoInvestidores = lazyWithChunkRetry(() => import("./pages/GestaoInvestidores"));
const GestaoOperadores = lazyWithChunkRetry(() => import("./pages/GestaoOperadores"));
const GestaoProjetos = lazyWithChunkRetry(() => import("./pages/GestaoProjetos"));
const ProjetoDetalhe = lazyWithChunkRetry(() => import("./pages/ProjetoDetalhe"));
const ProgramaIndicacao = lazyWithChunkRetry(() => import("./pages/ProgramaIndicacao"));
const Caixa = lazyWithChunkRetry(() => import("./pages/Caixa"));
const Financeiro = lazyWithChunkRetry(() => import("./pages/Financeiro"));
const CentralOperacoes = lazyWithChunkRetry(() => import("./pages/CentralOperacoes"));
const Anotacoes = lazyWithChunkRetry(() => import("./pages/Anotacoes"));

const Workspace = lazyWithChunkRetry(() => import("./pages/Workspace"));
const Comunidade = lazyWithChunkRetry(() => import("./pages/Comunidade"));
const ComunidadeDetalhe = lazyWithChunkRetry(() => import("./pages/ComunidadeDetalhe"));
const ComunidadeTopico = lazyWithChunkRetry(() => import("./pages/ComunidadeTopico"));
const ComunidadeChatPopout = lazyWithChunkRetry(() => import("./pages/ComunidadeChatPopout"));
const SystemAdmin = lazyWithChunkRetry(() => import("./pages/SystemAdmin"));

const CalculadoraEV = lazyWithChunkRetry(() => import("./pages/CalculadoraEV"));
const CalculadoraExtracao = lazyWithChunkRetry(() => import("./pages/CalculadoraExtracao"));
const PlanejamentoCampanhas = lazyWithChunkRetry(() => import("./pages/PlanejamentoCampanhas"));
const CalculadoraPontoFuturo = lazyWithChunkRetry(() => import("./pages/CalculadoraPontoFuturo"));
const CalculadoraHedgeProbabilistica = lazyWithChunkRetry(() => import("./pages/CalculadoraHedgeProbabilistica"));
const CalculadoraExtracaoBonus = lazyWithChunkRetry(() => import("./pages/ferramentas/CalculadoraExtracaoBonus"));
const SurebetWindowPage = lazyWithChunkRetry(() => import("./pages/SurebetWindowPage"));
const ApostaWindowPage = lazyWithChunkRetry(() => import("./pages/ApostaWindowPage"));
const ApostaMultiplaWindowPage = lazyWithChunkRetry(() => import("./pages/ApostaMultiplaWindowPage"));
const SharedProject = lazyWithChunkRetry(() => import("./pages/SharedProject"));
const SupplierPortal = lazyWithChunkRetry(() => import("./pages/SupplierPortal"));
const FornecedoresPortal = lazyWithChunkRetry(() => import("./pages/FornecedoresPortal"));
const Solicitacoes = lazyWithChunkRetry(() => import("./pages/Solicitacoes"));
const DevLedgerMonitor = lazyWithChunkRetry(() => import("./pages/DevLedgerMonitor"));
const LedgerAnomalies = lazyWithChunkRetry(() => import("./pages/LedgerAnomalies"));
const LaboratorioValueBet = lazyWithChunkRetry(() => import("./pages/LaboratorioValueBet"));
const ApiExplorer = lazyWithChunkRetry(() => import("./pages/ApiExplorer"));

// ─── QueryClient com defaults globais de performance ───
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30 * 1000,       // 30s — dados frescos, sem refetch desnecessário
      gcTime: 10 * 60 * 1000,     // 10min — manter cache na memória
      refetchOnWindowFocus: false, // Evitar refetch ao alternar abas
      retry: 1,                    // Apenas 1 retry em caso de erro
    },
  },
});

// Fallback de loading para Suspense (lazy pages)
function PageLoader() {
  return (
    <div className="flex-1 flex items-center justify-center min-h-[200px]">
      <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
    </div>
  );
}

// Layout component for authenticated routes with inactivity monitoring
function AuthenticatedLayout({ children }: { children: React.ReactNode }) {
  const { minutesUntilTimeout, showingWarning, resetActivity } = useInactivityTimeout();

  return (
    <AuthenticatedLayoutInner
      minutesUntilTimeout={minutesUntilTimeout}
      showingWarning={showingWarning}
      resetActivity={resetActivity}
    >
      {children}
    </AuthenticatedLayoutInner>
  );
}

// Inner component so we can use hooks below SidebarProvider context indirectly
function AuthenticatedLayoutInner({
  children,
  minutesUntilTimeout,
  showingWarning,
  resetActivity,
}: {
  children: React.ReactNode;
  minutesUntilTimeout: number | null;
  showingWarning: boolean;
  resetActivity: () => void;
}) {
  const [isNotesOpen, setIsNotesOpen] = useState(false);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const location = useLocation();
  const mainRef = useRef<HTMLElement>(null);

  useEffect(() => {
    mainRef.current?.scrollTo({ top: 0, left: 0 });
  }, [location.pathname]);
  
  return (
    <TopBarProvider>
    <SidebarProvider defaultOpen={false}>
      {/* Global Chat Notification Manager */}
      <ChatNotificationManager isChatOpen={isChatOpen} />

      {/* Banner de aviso de inatividade */}
      {showingWarning && minutesUntilTimeout !== null && minutesUntilTimeout <= 5 && (
        <InactivityWarningBanner 
          minutesRemaining={minutesUntilTimeout} 
          onDismiss={resetActivity} 
        />
      )}
      
      <div className="h-screen flex w-full overflow-hidden">
        <AppSidebar />
        
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
          <SidebarAutoCollapse mainRef={mainRef} />
          {/* Header com trigger da sidebar + conteúdo contextual */}
          <TopBarHeader />

          {/* Floating Buttons */}
          <FloatingNotesButton 
            onClick={() => {
              setIsNotesOpen(!isNotesOpen);
              if (!isNotesOpen) setIsChatOpen(false);
            }} 
            isOpen={isNotesOpen || isChatOpen} 
          />
          
          <FloatingChatButton 
            onClick={() => {
              setIsChatOpen(!isChatOpen);
              if (!isChatOpen) setIsNotesOpen(false);
            }} 
            isOpen={isChatOpen || isNotesOpen} 
          />

          {/* Side Drawers */}
          <NotesDrawer isOpen={isNotesOpen} onClose={() => setIsNotesOpen(false)} />
          <ChatDrawer isOpen={isChatOpen} onClose={() => setIsChatOpen(false)} />

          {/* Main content: scroll local do viewport autenticado, sem depender do body */}
          <main ref={mainRef} className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden">
            <Suspense fallback={<PageLoader />}>
              {children}
            </Suspense>
          </main>
        </div>
      </div>
    </SidebarProvider>
    </TopBarProvider>
  );
}

/** TopBar renderiza trigger + conteúdo contextual injetado pela página */
function TopBarHeader() {
  const { content } = useTopBar();
  const { isMobile } = useSidebar();
  return (
    <header className="shrink-0 z-40 w-full border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
      <div className="relative flex h-12 items-center px-3">
        {isMobile && (
          <SidebarTrigger
            aria-label="Abrir menu"
            className="relative z-10 h-10 w-10 shrink-0 -ml-1"
          />
        )}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="pointer-events-auto [&_span.font-semibold]:text-base">{content}</div>
        </div>
      </div>
    </header>
  );
}

/**
 * Auto-collapse: clique fora da sidebar (dentro do <main>) ou ESC recolhem a sidebar
 * quando expandida. Ignora portais (modais, dropdowns, popovers, context menus, tooltips)
 * e operações de drag-and-drop.
 */
function SidebarAutoCollapse({ mainRef }: { mainRef: React.RefObject<HTMLElement> }) {
  const { open, setOpen, isMobile, setOpenMobile } = useSidebar();

  // Swipe da borda esquerda abre a sidebar em mobile
  useEdgeSwipeToOpenSidebar(isMobile, useCallback(() => setOpenMobile(true), [setOpenMobile]));

  useEffect(() => {
    if (!open || isMobile) return;
    const el = mainRef.current;
    if (!el) return;

    const shouldIgnore = (target: EventTarget | null) => {
      if (!(target instanceof HTMLElement)) return false;
      // Drag em andamento (dnd-kit / HTML5) — não recolher
      if (document.body.hasAttribute("data-dragging") || document.querySelector("[data-dnd-kit-overlay]")) return true;
      // Elementos opt-out explícito
      return !!target.closest(
        '[data-no-sidebar-collapse],[role="dialog"],[data-radix-popper-content-wrapper],[data-radix-portal]'
      );
    };

    const onMouseDown = (e: MouseEvent) => {
      if (e.button !== 0) return;
      if (shouldIgnore(e.target)) return;
      setOpen(false);
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      // Se há modal/popover aberto, deixa o ESC nativo fechar primeiro
      if (document.querySelector('[role="dialog"][data-state="open"], [data-radix-popper-content-wrapper]')) return;
      setOpen(false);
    };

    el.addEventListener("mousedown", onMouseDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      el.removeEventListener("mousedown", onMouseDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open, isMobile, setOpen, mainRef]);

  return null;
}

/** Global floating button for Notes */
function FloatingNotesButton({ onClick, isOpen }: { onClick: () => void, isOpen: boolean }) {
  const { user } = useAuth();
  if (!user || isOpen) return null;

  return (
    <button
      onClick={onClick}
      title="Anotações"
      className={cn(
        "fixed bottom-6 right-6 z-[9999] flex items-center justify-center w-[52px] h-[52px] rounded-full transition-all duration-150 shadow-[0_4px_20px_rgba(0,200,83,0.4)] active:scale-95 bg-[#00c853] text-black hover:brightness-110 hover:scale-[1.08]"
      )}
    >
      <NotebookPen className="w-[22px] h-[22px]" />
    </button>
  );
}

/** Global floating button for Chat */
function FloatingChatButton({ onClick, isOpen }: { onClick: () => void, isOpen: boolean }) {
  const { user, workspace, loading, initialized } = useAuth();
  const [hasMention, setHasMention] = useState(false);
  const { unreadCount, incrementUnread, playNotificationSound } = useChatNotifications();
  
  // Notification logic moved to ChatNotificationManager for robustness
  
  // Don't show while loading, if chat is already open, or if no workspace is resolved yet
  if (loading || !initialized || !user || isOpen || !workspace?.id) return null;

  return (
    <button
      onClick={onClick}
      title="Chat"
      className={cn(
        "fixed bottom-[88px] right-6 z-[9999] flex items-center justify-center w-[52px] h-[52px] rounded-full transition-all duration-150 shadow-[0_4px_20px_rgba(0,0,0,0.4)] active:scale-95 bg-[#1e2128] border border-[#2a2d35] text-white hover:border-[#00c853] hover:text-[#00c853] hover:scale-[1.08]",
        hasMention && "animate-[mention-pulse_1.2s_ease-out_infinite] border-[#00c853] text-[#00c853]"
      )}
    >
      <MessageCircle className="w-[22px] h-[22px]" />
      {unreadCount > 0 && (
        <span className="absolute -top-1 -right-1 flex h-[18px] min-w-[18px] px-1 items-center justify-center rounded-full bg-[#ef4444] text-[10px] font-bold text-white shadow-sm border border-[#1e2128]">
          {unreadCount}
        </span>
      )}
      <style>{`
        @keyframes mention-pulse {
          0%   { box-shadow: 0 0 0 0 rgba(0, 200, 83, 0.7); }
          70%  { box-shadow: 0 0 0 12px rgba(0, 200, 83, 0); }
          100% { box-shadow: 0 0 0 0 rgba(0, 200, 83, 0); }
        }
      `}</style>
    </button>
  );
}

const App = () => (
  <GlobalErrorBoundary>
  <ThemeProvider attribute="class" defaultTheme="dark" storageKey="stakesync-theme">
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <AuthProvider>
        <PresenceProvider>
          <PermissionsProvider>
            <ExchangeRatesProvider>
              <CalculadoraProvider>
                <ApostaPopupProvider>
                  <Toaster />
                  <Sonner />
                  <ApostaPopupContainer />
                  <ErrorMonitorPanel />
                  <BrowserRouter>
            <Routes>
            {/* Public routes - no layout */}
            <Route path="/landing" element={<Index />} />
            <Route path="/auth" element={<Auth />} />
            <Route path="/reset-password" element={<ResetPassword />} />
            <Route path="/accept-invite" element={<AcceptInvite />} />
            <Route path="/shared/:token" element={
              <Suspense fallback={<PageLoader />}>
                <SharedProject />
              </Suspense>
            } />
            <Route path="/portal/fornecedor" element={
              <Suspense fallback={<PageLoader />}>
                <SupplierPortal />
              </Suspense>
            } />

            {/* Protected routes with layout */}
            {/* Central - Acessível por todos os roles autenticados */}
            <Route path="/" element={
              <ProtectedRoute>
                <AuthenticatedLayout>
                  <CentralOperacoes />
                </AuthenticatedLayout>
              </ProtectedRoute>
            } />
            
            {/* Solicitações - Página independente */}
            <Route path="/solicitacoes" element={
              <ProtectedRoute>
                <AuthenticatedLayout>
                  <Suspense fallback={<PageLoader />}><Solicitacoes /></Suspense>
                </AuthenticatedLayout>
              </ProtectedRoute>
            } />
            
            {/* Anotações - Pessoal, qualquer usuário autenticado */}
            <Route path="/anotacoes" element={
              <ProtectedRoute>
                <AuthenticatedLayout>
                  <Anotacoes />
                </AuthenticatedLayout>
              </ProtectedRoute>
            } />
            
            {/* Parceiros - Usa permission key do banco */}
            <Route path="/parceiros" element={
              <ProtectedRoute requiredPermission="parceiros.read">
                <AuthenticatedLayout>
                  <GestaoParceiros />
                </AuthenticatedLayout>
              </ProtectedRoute>
            } />
            
            {/* Bookmakers - Usa permission key do banco */}
            <Route path="/bookmakers" element={
              <ProtectedRoute requiredPermission="bookmakers.catalog.read">
                <AuthenticatedLayout>
                  <GestaoBookmakers />
                </AuthenticatedLayout>
              </ProtectedRoute>
            } />
            
            {/* Bancos - Usa permission key do banco (financeiro.read) */}
            <Route path="/bancos" element={
              <ProtectedRoute requiredPermission="financeiro.read">
                <AuthenticatedLayout>
                  <GestaoBancos />
                </AuthenticatedLayout>
              </ProtectedRoute>
            } />
            
            {/* Investidores - Usa permission key do banco */}
            <Route path="/investidores" element={
              <ProtectedRoute requiredPermission="investidores.read">
                <AuthenticatedLayout>
                  <GestaoInvestidores />
                </AuthenticatedLayout>
              </ProtectedRoute>
            } />
            
            {/* Operadores - Usa permission key do banco */}
            <Route path="/operadores" element={
              <ProtectedRoute requiredPermission="operadores.read">
                <AuthenticatedLayout>
                  <GestaoOperadores />
                </AuthenticatedLayout>
              </ProtectedRoute>
            } />
            
            {/* Projetos - Aceita projetos.read OU projetos.read_vinculados (operadores) */}
            <Route path="/projetos" element={
              <ProtectedRoute requiredPermission={["projetos.read", "projetos.read_vinculados"]}>
                <AuthenticatedLayout>
                  <GestaoProjetos />
                </AuthenticatedLayout>
              </ProtectedRoute>
            } />
            
            {/* Projeto Detalhe - Aceita projetos.read OU projetos.read_vinculados (operadores) */}
            <Route path="/projeto/:id" element={
              <ProtectedRoute requiredPermission={["projetos.read", "projetos.read_vinculados"]}>
                <AuthenticatedLayout>
                  <ProjetoDetalhe />
                </AuthenticatedLayout>
              </ProtectedRoute>
            } />
            
            {/* Programa de Indicação - Usa permission key do banco */}
            <Route path="/programa-indicacao" element={
              <ProtectedRoute requiredPermission="captacao.read">
                <AuthenticatedLayout>
                  <ProgramaIndicacao />
                </AuthenticatedLayout>
              </ProtectedRoute>
            } />
            
            {/* Portal do Fornecedor (admin) */}
            <Route path="/fornecedores-portal" element={
              <ProtectedRoute requiredPermission="captacao.read">
                <AuthenticatedLayout>
                  <FornecedoresPortal />
                </AuthenticatedLayout>
              </ProtectedRoute>
            } />
            
            {/* Caixa - Usa permission key do banco */}
            <Route path="/caixa" element={
              <ProtectedRoute requiredPermission="caixa.read">
                <AuthenticatedLayout>
                  <Caixa />
                </AuthenticatedLayout>
              </ProtectedRoute>
            } />
            
            <Route path="/laboratorio/valuebet" element={
              <ProtectedRoute>
                <AuthenticatedLayout>
                  <LaboratorioValueBet />
                </AuthenticatedLayout>
              </ProtectedRoute>
            } />
            
            {/* Monitor de APIs / Explorador de Dados */}
            <Route path="/admin/api-explorer" element={
              <ProtectedRoute>
                <AuthenticatedLayout>
                  <ApiExplorer />
                </AuthenticatedLayout>
              </ProtectedRoute>
            } />
            
            {/* Financeiro - Usa permission key do banco */}
            <Route path="/financeiro" element={
              <ProtectedRoute requiredPermission="financeiro.read">
                <AuthenticatedLayout>
                  <Financeiro />
                </AuthenticatedLayout>
              </ProtectedRoute>
            } />
            
            {/* Workspace - Requer role owner ou admin */}
            <Route path="/workspace" element={
              <ProtectedRoute requiredRole={['owner', 'admin']}>
                <AuthenticatedLayout>
                  <Workspace />
                </AuthenticatedLayout>
              </ProtectedRoute>
            } />
            
            
            {/* Admin do Sistema - Requer System Owner */}
            <Route path="/admin" element={
              <ProtectedRoute requireSystemOwner>
                <AuthenticatedLayout>
                  <SystemAdmin />
                </AuthenticatedLayout>
              </ProtectedRoute>
            } />
            
            {/* Comunidade - Verificação de plano é feita internamente */}
            <Route path="/comunidade" element={
              <ProtectedRoute>
                <AuthenticatedLayout>
                  <Comunidade />
                </AuthenticatedLayout>
              </ProtectedRoute>
            } />
            
            <Route path="/comunidade/:id" element={
              <ProtectedRoute>
                <AuthenticatedLayout>
                  <ComunidadeDetalhe />
                </AuthenticatedLayout>
              </ProtectedRoute>
            } />

            <Route path="/comunidade/topico/:id" element={
              <ProtectedRoute>
                <AuthenticatedLayout>
                  <ComunidadeTopico />
                </AuthenticatedLayout>
              </ProtectedRoute>
            } />
            
            {/* Pop-out chat - no layout, standalone */}
            <Route path="/comunidade/chat" element={
              <ProtectedRoute>
                <Suspense fallback={<PageLoader />}>
                  <ComunidadeChatPopout />
                </Suspense>
              </ProtectedRoute>
            } />
            
            
            {/* Calculadora EV - standalone */}
            <Route path="/ferramentas/calculadora-ev" element={
              <ProtectedRoute>
                <Suspense fallback={<PageLoader />}>
                  <CalculadoraEV />
                </Suspense>
              </ProtectedRoute>
            } />
            
            {/* Calculadora de Extração - standalone */}
            <Route path="/ferramentas/calculadora-extracao" element={
              <ProtectedRoute>
                <Suspense fallback={<PageLoader />}>
                  <CalculadoraExtracao />
                </Suspense>
              </ProtectedRoute>
            } />

            {/* Calculadora de Hedge Probabilístico - standalone */}
            <Route path="/ferramentas/calculadora-hedge-probabilistica" element={
              <ProtectedRoute>
                <Suspense fallback={<PageLoader />}>
                  <CalculadoraHedgeProbabilistica />
                </Suspense>
              </ProtectedRoute>
            } />

            {/* Ponto de Edge Futuro - standalone */}
            <Route path="/ferramentas/calculadora-ponto-futuro" element={
              <ProtectedRoute>
                <Suspense fallback={<PageLoader />}>
                  <CalculadoraPontoFuturo />
                </Suspense>
              </ProtectedRoute>
            } />

            {/* Extração de Bônus - standalone */}
            <Route path="/ferramentas/extracao-bonus" element={
              <ProtectedRoute>
                <Suspense fallback={<PageLoader />}>
                  <CalculadoraExtracaoBonus />
                </Suspense>
              </ProtectedRoute>
            } />

            {/* Planejamento de Campanhas - com layout (sub-aba de Ferramentas) */}
            <Route path="/ferramentas/planejamento" element={
              <ProtectedRoute>
                <AuthenticatedLayout>
                  <Suspense fallback={<PageLoader />}><PlanejamentoCampanhas /></Suspense>
                </AuthenticatedLayout>
              </ProtectedRoute>
            } />
            
            {/* Janela Surebet - standalone, para abrir em nova janela */}
            <Route path="/janela/surebet/novo" element={
              <ProtectedRoute>
                <Suspense fallback={<PageLoader />}>
                  <SurebetWindowPage />
                </Suspense>
              </ProtectedRoute>
            } />
            <Route path="/janela/surebet/:id" element={
              <ProtectedRoute>
                <Suspense fallback={<PageLoader />}>
                  <SurebetWindowPage />
                </Suspense>
              </ProtectedRoute>
            } />
            
            {/* Janela Aposta Simples - standalone, para abrir em nova janela */}
            <Route path="/janela/aposta/novo" element={
              <ProtectedRoute>
                <Suspense fallback={<PageLoader />}>
                  <ApostaWindowPage />
                </Suspense>
              </ProtectedRoute>
            } />
            <Route path="/janela/aposta/:id" element={
              <ProtectedRoute>
                <Suspense fallback={<PageLoader />}>
                  <ApostaWindowPage />
                </Suspense>
              </ProtectedRoute>
            } />
            
            {/* Janela Aposta Múltipla - standalone, para abrir em nova janela */}
            <Route path="/janela/multipla/novo" element={
              <ProtectedRoute>
                <Suspense fallback={<PageLoader />}>
                  <ApostaMultiplaWindowPage />
                </Suspense>
              </ProtectedRoute>
            } />
            <Route path="/janela/multipla/:id" element={
              <ProtectedRoute>
                <Suspense fallback={<PageLoader />}>
                  <ApostaMultiplaWindowPage />
                </Suspense>
              </ProtectedRoute>
            } />
            
             {/* Dev — Ledger Monitor (System Owner OR Owners/Admins of authorized workspaces) */}
             <Route path="/dev/ledger-monitor" element={
               <ProtectedRoute 
                 requiredRole={['owner', 'admin']}
                 requireSystemOwner={false}
               >
                 <AuthenticatedLayout>
                   <DevLedgerMonitor />
                 </AuthenticatedLayout>
               </ProtectedRoute>
             } />

            <Route path="/admin/ledger-anomalies" element={
              <ProtectedRoute requiredRole={['owner', 'admin']} requireSystemOwner={false}>
                <AuthenticatedLayout>
                  <Suspense fallback={<PageLoader />}>
                    <LedgerAnomalies />
                  </Suspense>
                </AuthenticatedLayout>
              </ProtectedRoute>
            } />

            {/* Catch-all route */}
            <Route path="*" element={<NotFound />} />
            </Routes>
            </BrowserRouter>
                </ApostaPopupProvider>
              </CalculadoraProvider>
            </ExchangeRatesProvider>
          </PermissionsProvider>
        </PresenceProvider>
      </AuthProvider>
    </TooltipProvider>
  </QueryClientProvider>
  </ThemeProvider>
  </GlobalErrorBoundary>
);

export default App;
