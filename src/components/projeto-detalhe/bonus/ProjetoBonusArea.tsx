import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { LayoutDashboard, Building2, Target, History } from "lucide-react";
import { BonusVisaoGeralTab } from "./BonusVisaoGeralTab";
import { BonusBookmakersTab } from "./BonusBookmakersTab";
import { BonusApostasTab } from "./BonusApostasTab";
import { BonusHistoricoTab } from "./BonusHistoricoTab";
import { useProjectBonuses } from "@/hooks/useProjectBonuses";

interface ProjetoBonusAreaProps {
  projetoId: string;
}

export function ProjetoBonusArea({ projetoId }: ProjetoBonusAreaProps) {
  const { getBookmakersWithActiveBonus } = useProjectBonuses({ projectId: projetoId });
  const bookmakersInBonusMode = getBookmakersWithActiveBonus();

  return (
    <div className="space-y-4">
      {/* Sub-tabs - Clean premium design */}
      <Tabs defaultValue="visao-geral" className="space-y-4">
        <TabsList className="bg-muted/50 border border-border">
          <TabsTrigger value="visao-geral" className="flex items-center gap-2 data-[state=active]:bg-background data-[state=active]:shadow-sm">
            <LayoutDashboard className="h-4 w-4" />
            Visão Geral
          </TabsTrigger>
          <TabsTrigger value="bookmakers" className="flex items-center gap-2 data-[state=active]:bg-background data-[state=active]:shadow-sm">
            <Building2 className="h-4 w-4" />
            Bookmakers ({bookmakersInBonusMode.length})
          </TabsTrigger>
          <TabsTrigger value="apostas" className="flex items-center gap-2 data-[state=active]:bg-background data-[state=active]:shadow-sm">
            <Target className="h-4 w-4" />
            Apostas
          </TabsTrigger>
          <TabsTrigger value="historico" className="flex items-center gap-2 data-[state=active]:bg-background data-[state=active]:shadow-sm">
            <History className="h-4 w-4" />
            Histórico
          </TabsTrigger>
        </TabsList>

        <TabsContent value="visao-geral">
          <BonusVisaoGeralTab projetoId={projetoId} />
        </TabsContent>

        <TabsContent value="bookmakers">
          <BonusBookmakersTab projetoId={projetoId} />
        </TabsContent>

        <TabsContent value="apostas">
          <BonusApostasTab projetoId={projetoId} />
        </TabsContent>

        <TabsContent value="historico">
          <BonusHistoricoTab projetoId={projetoId} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
