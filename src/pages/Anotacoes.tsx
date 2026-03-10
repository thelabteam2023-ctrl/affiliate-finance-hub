import { useState, useEffect } from "react";
import { useWorkspaceResetKey } from "@/hooks/useWorkspaceCacheClear";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { StickyNote, GitBranch } from "lucide-react";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { FluxoTab } from "@/components/anotacoes/FluxoTab";
import { LivreTab } from "@/components/anotacoes/LivreTab";
import { useTopBar } from "@/contexts/TopBarContext";

/**
 * Página Anotações - Sistema pessoal de notas e organização de ideias
 * 
 * SEGURANÇA: Todas as anotações são estritamente individuais.
 * - Vinculadas ao user_id e workspace_id
 * - Nenhuma anotação é compartilhada entre usuários ou workspaces
 * - RLS no backend garante isolamento completo
 */
export default function Anotacoes() {
  const [activeTab, setActiveTab] = useState<string>("fluxo");
  const { setContent: setTopBarContent } = useTopBar();
  
  // SEGURANÇA: resetKey incrementa quando workspace muda, forçando remount dos componentes filhos
  const resetKey = useWorkspaceResetKey();

  useEffect(() => {
    setTopBarContent(
      <div className="flex items-center gap-2">
        <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10">
          <StickyNote className="h-4 w-4 text-primary" />
        </div>
        <span className="font-semibold text-sm">Anotações</span>
      </div>
    );
    return () => setTopBarContent(null);
  }, [setTopBarContent]);

  return (
    <div className="h-full flex flex-col bg-background">

      {/* Tabs */}
      <Tabs 
        value={activeTab} 
        onValueChange={setActiveTab}
        className="flex-1 flex flex-col min-h-0"
      >
        <div className="shrink-0 px-6">
          <TabsList className="h-9 bg-muted/30">
            <TabsTrigger 
              value="fluxo" 
              className="gap-2 text-xs data-[state=active]:bg-background"
            >
              <GitBranch className="h-3.5 w-3.5" />
              Fluxo
            </TabsTrigger>
            <TabsTrigger 
              value="livre" 
              className="gap-2 text-xs data-[state=active]:bg-background"
            >
              <StickyNote className="h-3.5 w-3.5" />
              Livre
            </TabsTrigger>
          </TabsList>
        </div>

        {/* Content area - flex-1 para ocupar todo espaço */}
        {/* key=resetKey força remount completo quando workspace muda */}
        <TabsContent 
          value="fluxo" 
          className="flex-1 min-h-0 mt-4 focus-visible:ring-0 focus-visible:ring-offset-0"
        >
          <FluxoTab key={`fluxo-${resetKey}`} />
        </TabsContent>

        <TabsContent 
          value="livre" 
          className="flex-1 min-h-0 mt-4 focus-visible:ring-0 focus-visible:ring-offset-0"
        >
          <LivreTab key={`livre-${resetKey}`} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
