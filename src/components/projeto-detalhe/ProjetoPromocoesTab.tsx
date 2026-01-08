import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Gift, Dices } from "lucide-react";
import { ProjetoFreebetsTab } from "./ProjetoFreebetsTab";
import { ProjetoGirosGratisTab } from "./ProjetoGirosGratisTab";

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
  const [activeSubTab, setActiveSubTab] = useState("freebets");

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
