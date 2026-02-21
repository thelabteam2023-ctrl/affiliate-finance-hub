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
import Index from "./pages/Index";
import Auth from "./pages/Auth";
import GestaoParceiros from "./pages/GestaoParceiros";
import GestaoBookmakers from "./pages/GestaoBookmakers";
import GestaoBancos from "./pages/GestaoBancos";
import GestaoInvestidores from "./pages/GestaoInvestidores";
import GestaoOperadores from "./pages/GestaoOperadores";
import GestaoProjetos from "./pages/GestaoProjetos";
import ProjetoDetalhe from "./pages/ProjetoDetalhe";
import ProgramaIndicacao from "./pages/ProgramaIndicacao";
import Caixa from "./pages/Caixa";
import Financeiro from "./pages/Financeiro";
import CentralOperacoes from "./pages/CentralOperacoes";
import Anotacoes from "./pages/Anotacoes";
import Testes from "./pages/Testes";
import Workspace from "./pages/Workspace";
import Comunidade from "./pages/Comunidade";
import ComunidadeDetalhe from "./pages/ComunidadeDetalhe";
import ComunidadeChatPopout from "./pages/ComunidadeChatPopout";
import SystemAdmin from "./pages/SystemAdmin";
import AcceptInvite from "./pages/AcceptInvite";
import ProtecaoProgressiva from "./pages/ProtecaoProgressiva";
import SurebetWindowPage from "./pages/SurebetWindowPage";
import ApostaWindowPage from "./pages/ApostaWindowPage";
import ApostaMultiplaWindowPage from "./pages/ApostaMultiplaWindowPage";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

// Layout component for authenticated routes with inactivity monitoring
function AuthenticatedLayout({ children }: { children: React.ReactNode }) {
  const { minutesUntilTimeout, showingWarning, resetActivity } = useInactivityTimeout();
  
  return (
    <TopBarProvider>
    <SidebarProvider defaultOpen={true}>
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
            {children}
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
      <div className="flex h-12 items-center gap-2 px-3">
        <SidebarTrigger className="text-muted-foreground/70 hover:text-muted-foreground hover:bg-accent/50 flex-shrink-0" />
        {content}
      </div>
    </header>
  );
}

const App = () => (
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
            <Route path="/accept-invite" element={<AcceptInvite />} />

            {/* Protected routes with layout */}
            {/* Central - Acessível por todos os roles autenticados */}
            <Route path="/" element={
              <ProtectedRoute>
                <AuthenticatedLayout>
                  <CentralOperacoes />
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
            
            {/* Testes - Requer role owner */}
            <Route path="/testes" element={
              <ProtectedRoute requiredRole={['owner']}>
                <AuthenticatedLayout>
                  <Testes />
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
            
            {/* Pop-out chat - no layout, standalone */}
            <Route path="/comunidade/chat" element={
              <ProtectedRoute>
                <ComunidadeChatPopout />
              </ProtectedRoute>
            } />
            
            {/* Proteção Progressiva - standalone, sem layout */}
            <Route path="/ferramentas/protecao-progressiva" element={
              <ProtectedRoute>
                <ProtecaoProgressiva />
              </ProtectedRoute>
            } />
            
            {/* Janela Surebet - standalone, para abrir em nova janela */}
            <Route path="/janela/surebet/novo" element={
              <ProtectedRoute>
                <SurebetWindowPage />
              </ProtectedRoute>
            } />
            <Route path="/janela/surebet/:id" element={
              <ProtectedRoute>
                <SurebetWindowPage />
              </ProtectedRoute>
            } />
            
            {/* Janela Aposta Simples - standalone, para abrir em nova janela */}
            <Route path="/janela/aposta/novo" element={
              <ProtectedRoute>
                <ApostaWindowPage />
              </ProtectedRoute>
            } />
            <Route path="/janela/aposta/:id" element={
              <ProtectedRoute>
                <ApostaWindowPage />
              </ProtectedRoute>
            } />
            
            {/* Janela Aposta Múltipla - standalone, para abrir em nova janela */}
            <Route path="/janela/multipla/novo" element={
              <ProtectedRoute>
                <ApostaMultiplaWindowPage />
              </ProtectedRoute>
            } />
            <Route path="/janela/multipla/:id" element={
              <ProtectedRoute>
                <ApostaMultiplaWindowPage />
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
);

export default App;
