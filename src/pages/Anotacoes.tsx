import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { StickyNote, GitBranch } from "lucide-react";
import { FluxoTab } from "@/components/anotacoes/FluxoTab";

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

  return (
    <div className="h-full flex flex-col bg-background">
      {/* Header minimalista */}
      <div className="shrink-0 px-6 pt-6 pb-4">
        <h1 className="text-xl font-semibold text-foreground tracking-tight">
          Anotações
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Organize suas ideias e pensamentos
        </p>
      </div>

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
              disabled
            >
              <StickyNote className="h-3.5 w-3.5" />
              Livre
              <span className="text-[10px] text-muted-foreground ml-1">(em breve)</span>
            </TabsTrigger>
          </TabsList>
        </div>

        {/* Content area - flex-1 para ocupar todo espaço */}
        <TabsContent 
          value="fluxo" 
          className="flex-1 min-h-0 mt-4 focus-visible:ring-0 focus-visible:ring-offset-0"
        >
          <FluxoTab />
        </TabsContent>

        <TabsContent 
          value="livre" 
          className="flex-1 min-h-0 mt-4 focus-visible:ring-0 focus-visible:ring-offset-0"
        >
          <div className="flex items-center justify-center h-full text-muted-foreground">
            Em desenvolvimento...
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
