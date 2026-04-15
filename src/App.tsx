import { Suspense, lazy } from "react";
import { ThemeProvider } from "next-themes";
import { TopBarProvider, useTopBar } from "@/contexts/TopBarContext";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { CalculadoraProvider } from "@/contexts/CalculadoraContext";
import { ApostaPopupProvider } from "@/contexts/ApostaPopupContext";
import { ApostaPopupContainer } from "@/components/popups/ApostaPopupContainer";
import { ExchangeRatesProvider } from "@/contexts/ExchangeRatesContext";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AuthProvider } from "@/contexts/AuthContext";
import { PermissionsProvider } from "@/contexts/PermissionsContext";
import { PresenceProvider } from "@/contexts/PresenceContext";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { AppSidebar } from "@/components/AppSidebar";
import { InactivityWarningBanner } from "@/components/InactivityWarningBanner";
import { useInactivityTimeout } from "@/hooks/useInactivityTimeout";
import { Loader2 } from "lucide-react";

// ─── Eager imports: lightweight pages / public routes ───
import Index from "./pages/Index";
import Auth from "./pages/Auth";
import ResetPassword from "./pages/ResetPassword";
import AcceptInvite from "./pages/AcceptInvite";
import NotFound from "./pages/NotFound";

// ─── Lazy imports: heavy authenticated pages ───
const GestaoParceiros = lazy(() => import("./pages/GestaoParceiros"));
const GestaoBookmakers = lazy(() => import("./pages/GestaoBookmakers"));
const GestaoBancos = lazy(() => import("./pages/GestaoBancos"));
const GestaoInvestidores = lazy(() => import("./pages/GestaoInvestidores"));
const GestaoOperadores = lazy(() => import("./pages/GestaoOperadores"));
const GestaoProjetos = lazy(() => import("./pages/GestaoProjetos"));
const ProjetoDetalhe = lazy(() => import("./pages/ProjetoDetalhe"));
const ProgramaIndicacao = lazy(() => import("./pages/ProgramaIndicacao"));
const Caixa = lazy(() => import("./pages/Caixa"));
const Financeiro = lazy(() => import("./pages/Financeiro"));
const CentralOperacoes = lazy(() => import("./pages/CentralOperacoes"));
const Anotacoes = lazy(() => import("./pages/Anotacoes"));

const Workspace = lazy(() => import("./pages/Workspace"));
const Comunidade = lazy(() => import("./pages/Comunidade"));
const ComunidadeDetalhe = lazy(() => import("./pages/ComunidadeDetalhe"));
const ComunidadeTopico = lazy(() => import("./pages/ComunidadeTopico"));
const ComunidadeChatPopout = lazy(() => import("./pages/ComunidadeChatPopout"));
const SystemAdmin = lazy(() => import("./pages/SystemAdmin"));
const ProtecaoProgressiva = lazy(() => import("./pages/ProtecaoProgressiva"));
const CalculadoraEV = lazy(() => import("./pages/CalculadoraEV"));
const CalculadoraExtracao = lazy(() => import("./pages/CalculadoraExtracao"));
const SurebetWindowPage = lazy(() => import("./pages/SurebetWindowPage"));
const ApostaWindowPage = lazy(() => import("./pages/ApostaWindowPage"));
const ApostaMultiplaWindowPage = lazy(() => import("./pages/ApostaMultiplaWindowPage"));
const SharedProject = lazy(() => import("./pages/SharedProject"));
const SupplierPortal = lazy(() => import("./pages/SupplierPortal"));
const FornecedoresPortal = lazy(() => import("./pages/FornecedoresPortal"));
const Solicitacoes = lazy(() => import("./pages/Solicitacoes"));

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
    <TopBarProvider>
    <SidebarProvider defaultOpen={false}>
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
          {/* Header com trigger da sidebar + conteúdo contextual */}
          <TopBarHeader />

          {/* Main content - flex-1 + min-h-0 + overflow-auto para scroll correto */}
          <main className="flex-1 min-h-0 overflow-auto">
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
  return (
    <header className="shrink-0 z-40 w-full border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
      <div className="relative flex h-12 items-center px-3">
        <SidebarTrigger className="text-muted-foreground/70 hover:text-muted-foreground hover:bg-accent/50 flex-shrink-0 z-10" />
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="pointer-events-auto [&_span.font-semibold]:text-base">{content}</div>
        </div>
      </div>
    </header>
  );
}

const App = () => (
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
            
            {/* Proteção Progressiva - standalone, sem layout */}
            <Route path="/ferramentas/protecao-progressiva" element={
              <ProtectedRoute>
                <Suspense fallback={<PageLoader />}>
                  <ProtecaoProgressiva />
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
);

export default App;
