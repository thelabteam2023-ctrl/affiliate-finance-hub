import { useEffect, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PageHeader } from "@/components/PageHeader";
import { DashboardTab } from "@/components/programa-indicacao/DashboardTab";
import { FontesCaptacaoTab } from "@/components/programa-indicacao/FontesCaptacaoTab";
import { ParceriasTab } from "@/components/programa-indicacao/ParceriasTab";
import { FinanceiroTab } from "@/components/programa-indicacao/FinanceiroTab";
import { BarChart3, Users, Handshake, Wallet } from "lucide-react";

export default function ProgramaIndicacao() {
  const navigate = useNavigate();
  const location = useLocation();
  const [activeTab, setActiveTab] = useState("dashboard");

  useEffect(() => {
    checkAuth();
  }, []);

  // State for pre-selected partner from navigation
  const [preSelectedParceiroId, setPreSelectedParceiroId] = useState<string | null>(null);

  // Handle navigation state for initial tab and pre-selected partner
  useEffect(() => {
    const state = location.state as { tab?: string; parceiroId?: string } | null;
    if (state?.tab) {
      // Map old tab names to new ones
      const tabMap: Record<string, string> = {
        indicadores: "fontes",
        fornecedores: "fontes",
      };
      setActiveTab(tabMap[state.tab] || state.tab);
    }
    if (state?.parceiroId) {
      setPreSelectedParceiroId(state.parceiroId);
    }
    // Clear the state to avoid persisting on refresh
    if (state?.tab || state?.parceiroId) {
      window.history.replaceState({}, document.title);
    }
  }, [location.state]);

  const checkAuth = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      navigate("/auth");
    }
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <PageHeader
        title="Captação de Parceiros"
        description="Gerencie fontes de captação, parcerias e financeiro"
        pagePath="/programa-indicacao"
        pageIcon="UserPlus"
      />

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="grid w-full max-w-2xl grid-cols-4">
          <TabsTrigger value="dashboard" className="flex items-center gap-2">
            <BarChart3 className="h-4 w-4" />
            <span className="hidden sm:inline">Dashboard</span>
          </TabsTrigger>
          <TabsTrigger value="fontes" className="flex items-center gap-2">
            <Users className="h-4 w-4" />
            <span className="hidden sm:inline">Fontes</span>
          </TabsTrigger>
          <TabsTrigger value="parcerias" className="flex items-center gap-2">
            <Handshake className="h-4 w-4" />
            <span className="hidden sm:inline">Parcerias</span>
          </TabsTrigger>
          <TabsTrigger value="financeiro" className="flex items-center gap-2">
            <Wallet className="h-4 w-4" />
            <span className="hidden sm:inline">Financeiro</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="dashboard">
          <DashboardTab />
        </TabsContent>

        <TabsContent value="fontes">
          <FontesCaptacaoTab />
        </TabsContent>

        <TabsContent value="parcerias">
          <ParceriasTab 
            preSelectedParceiroId={preSelectedParceiroId} 
            onPreSelectedHandled={() => setPreSelectedParceiroId(null)}
          />
        </TabsContent>

        <TabsContent value="financeiro">
          <FinanceiroTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
