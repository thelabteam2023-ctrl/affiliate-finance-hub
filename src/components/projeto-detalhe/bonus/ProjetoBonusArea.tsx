import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { LayoutDashboard, Building2, Target, History, Coins } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { BonusVisaoGeralTab } from "./BonusVisaoGeralTab";
import { BonusCasasTab } from "./BonusCasasTab";
import { BonusApostasTab } from "./BonusApostasTab";
import { BonusHistoricoTab } from "./BonusHistoricoTab";
import { useProjectBonuses } from "@/hooks/useProjectBonuses";

interface ProjetoBonusAreaProps {
  projetoId: string;
}

export function ProjetoBonusArea({ projetoId }: ProjetoBonusAreaProps) {
  const { getSummary, getBookmakersWithActiveBonus } = useProjectBonuses({ projectId: projetoId });
  const summary = getSummary();
  const bookmakersInBonusMode = getBookmakersWithActiveBonus();

  return (
    <div className="space-y-4">
      {/* Header with Bonus Mode indicator */}
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-full bg-amber-500/20 flex items-center justify-center">
          <Coins className="h-5 w-5 text-amber-400" />
        </div>
        <div>
          <h3 className="text-lg font-semibold flex items-center gap-2">
            Área de Bônus
            <Badge className="bg-amber-500/20 text-amber-400 border-amber-500/30">
              {bookmakersInBonusMode.length} casa{bookmakersInBonusMode.length !== 1 ? 's' : ''} em modo bônus
            </Badge>
          </h3>
          <p className="text-sm text-muted-foreground">
            Gerencie bônus ativos, acompanhe rollover e registre apostas de bônus
          </p>
        </div>
      </div>

      {/* Sub-tabs */}
      <Tabs defaultValue="visao-geral" className="space-y-4">
        <TabsList className="bg-amber-500/5 border border-amber-500/20">
          <TabsTrigger value="visao-geral" className="flex items-center gap-2 data-[state=active]:bg-amber-500/20 data-[state=active]:text-amber-400">
            <LayoutDashboard className="h-4 w-4" />
            Visão Geral
          </TabsTrigger>
          <TabsTrigger value="casas" className="flex items-center gap-2 data-[state=active]:bg-amber-500/20 data-[state=active]:text-amber-400">
            <Building2 className="h-4 w-4" />
            Casas ({bookmakersInBonusMode.length})
          </TabsTrigger>
          <TabsTrigger value="apostas" className="flex items-center gap-2 data-[state=active]:bg-amber-500/20 data-[state=active]:text-amber-400">
            <Target className="h-4 w-4" />
            Apostas
          </TabsTrigger>
          <TabsTrigger value="historico" className="flex items-center gap-2 data-[state=active]:bg-amber-500/20 data-[state=active]:text-amber-400">
            <History className="h-4 w-4" />
            Histórico
          </TabsTrigger>
        </TabsList>

        <TabsContent value="visao-geral">
          <BonusVisaoGeralTab projetoId={projetoId} />
        </TabsContent>

        <TabsContent value="casas">
          <BonusCasasTab projetoId={projetoId} />
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
