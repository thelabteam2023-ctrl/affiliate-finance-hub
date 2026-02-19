import { useState } from 'react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { OcorrenciasVisaoGeral } from './OcorrenciasVisaoGeral';
import { OcorrenciasList } from './OcorrenciasList';
import { NovaOcorrenciaDialog } from './NovaOcorrenciaDialog';
import { Plus } from 'lucide-react';

type SubTab = 'visao-geral' | 'fila' | 'minhas' | 'historico';

export function OcorrenciasModule() {
  const [subTab, setSubTab] = useState<SubTab>('visao-geral');
  const [novaOpen, setNovaOpen] = useState(false);

  return (
    <div className="space-y-4">
      {/* Header do módulo */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Ocorrências Operacionais</h2>
          <p className="text-sm text-muted-foreground">
            Gerencie incidentes, solicitações e problemas da equipe
          </p>
        </div>
        <Button onClick={() => setNovaOpen(true)} className="gap-2">
          <Plus className="h-4 w-4" />
          Nova Ocorrência
        </Button>
      </div>

      {/* Sub-navegação */}
      <Tabs value={subTab} onValueChange={(v) => setSubTab(v as SubTab)}>
        <TabsList className="w-full justify-start">
          <TabsTrigger value="visao-geral">Visão Geral</TabsTrigger>
          <TabsTrigger value="fila">Fila</TabsTrigger>
          <TabsTrigger value="minhas">Minhas</TabsTrigger>
          <TabsTrigger value="historico">Histórico</TabsTrigger>
        </TabsList>

        <TabsContent value="visao-geral" className="mt-4">
          <OcorrenciasVisaoGeral
            onFiltrarFila={() => setSubTab('fila')}
          />
        </TabsContent>

        <TabsContent value="fila" className="mt-4">
          <OcorrenciasList
            statusFilter={['aberto', 'em_andamento', 'aguardando_terceiro']}
            emptyMessage="Nenhuma ocorrência em aberto. Tudo em dia! 🎉"
          />
        </TabsContent>

        <TabsContent value="minhas" className="mt-4">
          <OcorrenciasList
            statusFilter={['aberto', 'em_andamento', 'aguardando_terceiro']}
            modoMinhas
            emptyMessage="Você não possui ocorrências ativas atribuídas a você."
          />
        </TabsContent>

        <TabsContent value="historico" className="mt-4">
          <OcorrenciasList
            statusFilter={['resolvido', 'cancelado']}
            emptyMessage="Nenhuma ocorrência resolvida ou cancelada."
          />
        </TabsContent>
      </Tabs>

      <NovaOcorrenciaDialog open={novaOpen} onOpenChange={setNovaOpen} />
    </div>
  );
}
