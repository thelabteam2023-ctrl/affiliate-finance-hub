import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AuthProvider } from "@/contexts/AuthContext";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { AppSidebar } from "@/components/AppSidebar";
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
import Testes from "./pages/Testes";
import Workspace from "./pages/Workspace";
import Comunidade from "./pages/Comunidade";
import ComunidadeDetalhe from "./pages/ComunidadeDetalhe";
import ComunidadeChatPopout from "./pages/ComunidadeChatPopout";
import SystemAdmin from "./pages/SystemAdmin";
import AcceptInvite from "./pages/AcceptInvite";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

// Layout component for authenticated routes
function AuthenticatedLayout({ children }: { children: React.ReactNode }) {
  return (
    <SidebarProvider defaultOpen={true}>
      <div className="min-h-screen flex w-full">
        <AppSidebar />
        
        <div className="flex-1 flex flex-col">
          {/* Header com trigger da sidebar */}
          <header className="sticky top-0 z-40 w-full border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
            <div className="flex h-14 items-center px-4">
              <SidebarTrigger className="hover:bg-accent hover:text-accent-foreground" />
            </div>
          </header>

          {/* Main content */}
          <main className="flex-1">
            {children}
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <AuthProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Routes>
            {/* Public routes - no layout */}
            <Route path="/landing" element={<Index />} />
            <Route path="/auth" element={<Auth />} />
            <Route path="/accept-invite" element={<AcceptInvite />} />

            {/* Protected routes with layout */}
            <Route path="/" element={
              <ProtectedRoute>
                <AuthenticatedLayout>
                  <CentralOperacoes />
                </AuthenticatedLayout>
              </ProtectedRoute>
            } />
            
            <Route path="/parceiros" element={
              <ProtectedRoute requiredPermission="partners:view">
                <AuthenticatedLayout>
                  <GestaoParceiros />
                </AuthenticatedLayout>
              </ProtectedRoute>
            } />
            
            <Route path="/bookmakers" element={
              <ProtectedRoute requiredPermission="bookmakers:view">
                <AuthenticatedLayout>
                  <GestaoBookmakers />
                </AuthenticatedLayout>
              </ProtectedRoute>
            } />
            
            <Route path="/bancos" element={
              <ProtectedRoute requiredPermission="finance:view">
                <AuthenticatedLayout>
                  <GestaoBancos />
                </AuthenticatedLayout>
              </ProtectedRoute>
            } />
            
            <Route path="/investidores" element={
              <ProtectedRoute requiredPermission="investors:view">
                <AuthenticatedLayout>
                  <GestaoInvestidores />
                </AuthenticatedLayout>
              </ProtectedRoute>
            } />
            
            <Route path="/operadores" element={
              <ProtectedRoute requiredPermission="operators:view">
                <AuthenticatedLayout>
                  <GestaoOperadores />
                </AuthenticatedLayout>
              </ProtectedRoute>
            } />
            
            <Route path="/projetos" element={
              <ProtectedRoute requiredPermission="projects:view">
                <AuthenticatedLayout>
                  <GestaoProjetos />
                </AuthenticatedLayout>
              </ProtectedRoute>
            } />
            
            <Route path="/projeto/:id" element={
              <ProtectedRoute requiredPermission="projects:view">
                <AuthenticatedLayout>
                  <ProjetoDetalhe />
                </AuthenticatedLayout>
              </ProtectedRoute>
            } />
            
            <Route path="/programa-indicacao" element={
              <ProtectedRoute requiredPermission="acquisition:view">
                <AuthenticatedLayout>
                  <ProgramaIndicacao />
                </AuthenticatedLayout>
              </ProtectedRoute>
            } />
            
            <Route path="/caixa" element={
              <ProtectedRoute requiredPermission="cash:view">
                <AuthenticatedLayout>
                  <Caixa />
                </AuthenticatedLayout>
              </ProtectedRoute>
            } />
            
            <Route path="/financeiro" element={
              <ProtectedRoute requiredPermission="finance:view">
                <AuthenticatedLayout>
                  <Financeiro />
                </AuthenticatedLayout>
              </ProtectedRoute>
            } />
            
            <Route path="/workspace" element={
              <ProtectedRoute requiredRole={['owner', 'admin', 'master']}>
                <AuthenticatedLayout>
                  <Workspace />
                </AuthenticatedLayout>
              </ProtectedRoute>
            } />
            
            <Route path="/testes" element={
              <ProtectedRoute requiredRole={['owner', 'master']}>
                <AuthenticatedLayout>
                  <Testes />
                </AuthenticatedLayout>
              </ProtectedRoute>
            } />
            
            <Route path="/admin" element={
              <ProtectedRoute requireSystemOwner>
                <AuthenticatedLayout>
                  <SystemAdmin />
                </AuthenticatedLayout>
              </ProtectedRoute>
            } />
            
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
            
            {/* Catch-all route */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
