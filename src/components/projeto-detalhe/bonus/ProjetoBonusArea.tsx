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
    <div className="space-y-6">
      {/* Slim contextual navigation - premium design */}
      <Tabs defaultValue="visao-geral" className="space-y-6">
        <TabsList className="bg-transparent border-b border-border/50 rounded-none p-0 h-auto gap-6">
          <TabsTrigger 
            value="visao-geral" 
            className="bg-transparent border-0 rounded-none px-1 pb-3 pt-1 h-auto shadow-none data-[state=active]:bg-transparent data-[state=active]:shadow-none text-muted-foreground/70 data-[state=active]:text-foreground transition-colors"
          >
            <LayoutDashboard className="h-4 w-4 mr-2 opacity-60" />
            Visão Geral
          </TabsTrigger>
          <TabsTrigger 
            value="bookmakers" 
            className="bg-transparent border-0 rounded-none px-1 pb-3 pt-1 h-auto shadow-none data-[state=active]:bg-transparent data-[state=active]:shadow-none text-muted-foreground/70 data-[state=active]:text-foreground transition-colors"
          >
            <Building2 className="h-4 w-4 mr-2 opacity-60" />
            Bookmakers
            {bookmakersInBonusMode.length > 0 && (
              <span className="ml-1.5 text-xs font-medium text-muted-foreground/60 data-[state=active]:text-accent">
                ({bookmakersInBonusMode.length})
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger 
            value="apostas" 
            className="bg-transparent border-0 rounded-none px-1 pb-3 pt-1 h-auto shadow-none data-[state=active]:bg-transparent data-[state=active]:shadow-none text-muted-foreground/70 data-[state=active]:text-foreground transition-colors"
          >
            <Target className="h-4 w-4 mr-2 opacity-60" />
            Apostas
          </TabsTrigger>
          <TabsTrigger 
            value="historico" 
            className="bg-transparent border-0 rounded-none px-1 pb-3 pt-1 h-auto shadow-none data-[state=active]:bg-transparent data-[state=active]:shadow-none text-muted-foreground/70 data-[state=active]:text-foreground transition-colors"
          >
            <History className="h-4 w-4 mr-2 opacity-60" />
            Histórico
          </TabsTrigger>
        </TabsList>

        <TabsContent value="visao-geral" className="mt-0">
          <BonusVisaoGeralTab projetoId={projetoId} />
        </TabsContent>

        <TabsContent value="bookmakers" className="mt-0">
          <BonusBookmakersTab projetoId={projetoId} />
        </TabsContent>

        <TabsContent value="apostas" className="mt-0">
          <BonusApostasTab projetoId={projetoId} />
        </TabsContent>

        <TabsContent value="historico" className="mt-0">
          <BonusHistoricoTab projetoId={projetoId} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
