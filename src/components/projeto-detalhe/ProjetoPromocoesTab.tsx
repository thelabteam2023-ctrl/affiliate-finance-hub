import { useState, useEffect } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Gift, Dices } from "lucide-react";
import { ProjetoFreebetsTab } from "./ProjetoFreebetsTab";
import { ProjetoGirosGratisTab } from "./ProjetoGirosGratisTab";
import { useProjectModules } from "@/hooks/useProjectModules";

interface ProjetoPromocoesTabProps {
  projetoId: string;
  onDataChange?: () => void;
  refreshTrigger?: number;
  formatCurrency?: (value: number) => string;
}

export function ProjetoPromocoesTab({ 
  projetoId, 
  onDataChange, 
  refreshTrigger,
  formatCurrency 
}: ProjetoPromocoesTabProps) {
  const { isModuleActive, loading } = useProjectModules(projetoId);
  
  // Determine which modules are active
  const freebetsAtivo = isModuleActive("freebets");
  const girosGratisAtivo = isModuleActive("giros_gratis");
  
  // Set default active sub-tab based on what's available
  const [activeSubTab, setActiveSubTab] = useState<string>("");
  
  // Update active tab when modules load
  useEffect(() => {
    if (!loading && !activeSubTab) {
      if (freebetsAtivo) {
        setActiveSubTab("freebets");
      } else if (girosGratisAtivo) {
        setActiveSubTab("giros-gratis");
      }
    }
  }, [freebetsAtivo, girosGratisAtivo, loading, activeSubTab]);
  
  // Both modules inactive - shouldn't happen but handle gracefully
  if (!freebetsAtivo && !girosGratisAtivo && !loading) {
    return (
      <div className="text-center text-muted-foreground py-8">
        Nenhum módulo de promoções ativo.
      </div>
    );
  }
  
  // Only one module active - render directly without tabs
  if (freebetsAtivo && !girosGratisAtivo) {
    return (
      <ProjetoFreebetsTab
        projetoId={projetoId}
        onDataChange={onDataChange}
        refreshTrigger={refreshTrigger}
        formatCurrency={formatCurrency}
      />
    );
  }
  
  if (!freebetsAtivo && girosGratisAtivo) {
    return <ProjetoGirosGratisTab projetoId={projetoId} />;
  }

  // Both modules active - show tabs
  return (
    <div className="space-y-4">
      <Tabs value={activeSubTab} onValueChange={setActiveSubTab}>
        <TabsList className="grid w-full max-w-md grid-cols-2">
          <TabsTrigger value="freebets" className="flex items-center gap-2">
            <Gift className="h-4 w-4" />
            Freebets
          </TabsTrigger>
          <TabsTrigger value="giros-gratis" className="flex items-center gap-2">
            <Dices className="h-4 w-4" />
            Giros Grátis
          </TabsTrigger>
        </TabsList>

        <TabsContent value="freebets" className="mt-4">
          <ProjetoFreebetsTab
            projetoId={projetoId}
            onDataChange={onDataChange}
            refreshTrigger={refreshTrigger}
            formatCurrency={formatCurrency}
          />
        </TabsContent>

        <TabsContent value="giros-gratis" className="mt-4">
          <ProjetoGirosGratisTab projetoId={projetoId} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
