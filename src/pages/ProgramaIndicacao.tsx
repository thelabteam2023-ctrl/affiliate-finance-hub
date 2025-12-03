import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DashboardTab } from "@/components/programa-indicacao/DashboardTab";
import { IndicadoresTab } from "@/components/programa-indicacao/IndicadoresTab";
import { FornecedoresTab } from "@/components/programa-indicacao/FornecedoresTab";
import { ParceriasTab } from "@/components/programa-indicacao/ParceriasTab";
import { FinanceiroTab } from "@/components/programa-indicacao/FinanceiroTab";
import { BarChart3, UserPlus, Truck, Handshake, Wallet } from "lucide-react";

export default function ProgramaIndicacao() {
  const navigate = useNavigate();

  useEffect(() => {
    checkAuth();
  }, []);

  const checkAuth = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      navigate("/auth");
    }
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Captação de Parceiros</h1>
        <p className="text-muted-foreground">
          Gerencie indicadores, fornecedores e parcerias de aquisição
        </p>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="dashboard" className="space-y-6">
        <TabsList className="grid w-full max-w-3xl grid-cols-5">
          <TabsTrigger value="dashboard" className="flex items-center gap-2">
            <BarChart3 className="h-4 w-4" />
            <span className="hidden sm:inline">Dashboard</span>
          </TabsTrigger>
          <TabsTrigger value="indicadores" className="flex items-center gap-2">
            <UserPlus className="h-4 w-4" />
            <span className="hidden sm:inline">Indicadores</span>
          </TabsTrigger>
          <TabsTrigger value="fornecedores" className="flex items-center gap-2">
            <Truck className="h-4 w-4" />
            <span className="hidden sm:inline">Fornecedores</span>
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

        <TabsContent value="indicadores">
          <IndicadoresTab />
        </TabsContent>

        <TabsContent value="fornecedores">
          <FornecedoresTab />
        </TabsContent>

        <TabsContent value="parcerias">
          <ParceriasTab />
        </TabsContent>

        <TabsContent value="financeiro">
          <FinanceiroTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
