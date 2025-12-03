import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { IndicadoresTab } from "@/components/programa-indicacao/IndicadoresTab";
import { ParceriasTab } from "@/components/programa-indicacao/ParceriasTab";
import { PromocoesTab } from "@/components/programa-indicacao/PromocoesTab";
import { UserPlus, Handshake, Gift } from "lucide-react";

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
        <h1 className="text-3xl font-bold tracking-tight">Programa de Indicação</h1>
        <p className="text-muted-foreground">
          Gerencie indicadores, parcerias e promoções de indicação
        </p>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="indicadores" className="space-y-6">
        <TabsList className="grid w-full max-w-lg grid-cols-3">
          <TabsTrigger value="indicadores" className="flex items-center gap-2">
            <UserPlus className="h-4 w-4" />
            <span className="hidden sm:inline">Indicadores</span>
          </TabsTrigger>
          <TabsTrigger value="parcerias" className="flex items-center gap-2">
            <Handshake className="h-4 w-4" />
            <span className="hidden sm:inline">Parcerias</span>
          </TabsTrigger>
          <TabsTrigger value="promocoes" className="flex items-center gap-2">
            <Gift className="h-4 w-4" />
            <span className="hidden sm:inline">Promoções</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="indicadores">
          <IndicadoresTab />
        </TabsContent>

        <TabsContent value="parcerias">
          <ParceriasTab />
        </TabsContent>

        <TabsContent value="promocoes">
          <PromocoesTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
