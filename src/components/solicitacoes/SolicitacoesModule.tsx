import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Card, CardContent } from '@/components/ui/card';
import { SolicitacoesList } from './SolicitacoesList';
import { NovaSolicitacaoDialog } from './NovaSolicitacaoDialog';
import { useSolicitacoesKpis } from '@/hooks/useSolicitacoes';
import { useAuth } from '@/hooks/useAuth';
import {
  ClipboardList,
  Plus,
  Clock,
  PlayCircle,
  CheckCircle2,
  Zap,
} from 'lucide-react';

export function SolicitacoesModule() {
  const [novaOpen, setNovaOpen] = useState(false);
  const [subTab, setSubTab] = useState('fila');
  const { user } = useAuth();
  const { data: kpis } = useSolicitacoesKpis();

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <ClipboardList className="h-5 w-5 text-blue-400" />
            Solicitações
          </h2>
          <p className="text-sm text-muted-foreground">
            Delegue e acompanhe tarefas operacionais
          </p>
        </div>
        <Button onClick={() => setNovaOpen(true)} size="sm" className="gap-2">
          <Plus className="h-4 w-4" />
          Nova Solicitação
        </Button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card className="border-border/50">
          <CardContent className="p-4 flex items-center gap-3">
            <Clock className="h-8 w-8 text-yellow-400 flex-shrink-0" />
            <div>
              <p className="text-2xl font-bold">{kpis?.pendentes ?? 0}</p>
              <p className="text-xs text-muted-foreground">Pendentes</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-border/50">
          <CardContent className="p-4 flex items-center gap-3">
            <PlayCircle className="h-8 w-8 text-blue-400 flex-shrink-0" />
            <div>
              <p className="text-2xl font-bold">{kpis?.em_execucao ?? 0}</p>
              <p className="text-xs text-muted-foreground">Em Execução</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-border/50">
          <CardContent className="p-4 flex items-center gap-3">
            <Zap className="h-8 w-8 text-red-400 flex-shrink-0" />
            <div>
              <p className="text-2xl font-bold">{kpis?.urgentes ?? 0}</p>
              <p className="text-xs text-muted-foreground">Urgentes</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-border/50">
          <CardContent className="p-4 flex items-center gap-3">
            <CheckCircle2 className="h-8 w-8 text-emerald-400 flex-shrink-0" />
            <div>
              <p className="text-2xl font-bold">{kpis?.total_abertas ?? 0}</p>
              <p className="text-xs text-muted-foreground">Total Abertas</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Sub-tabs */}
      <Tabs value={subTab} onValueChange={setSubTab}>
        <TabsList>
          <TabsTrigger value="fila">Fila</TabsTrigger>
          <TabsTrigger value="minhas">Minhas</TabsTrigger>
          <TabsTrigger value="historico">Histórico</TabsTrigger>
        </TabsList>

        {/* Fila: abertas (pendente + em_execucao) */}
        <TabsContent value="fila" className="mt-4">
          <SolicitacoesList
            filtros={{ status: ['pendente', 'em_execucao'] }}
            emptyMessage="Nenhuma solicitação em aberto."
          />
        </TabsContent>

        {/* Minhas: onde sou executor ou requerente */}
        <TabsContent value="minhas" className="mt-4">
          <div className="space-y-6">
            <div>
              <h3 className="text-sm font-medium text-muted-foreground mb-3">
                Aguardando minha execução
              </h3>
              <SolicitacoesList
                filtros={{
                  status: ['pendente', 'em_execucao'],
                  executor_id: user?.id,
                }}
                emptyMessage="Nenhuma solicitação aguardando você."
              />
            </div>
            <div>
              <h3 className="text-sm font-medium text-muted-foreground mb-3">
                Minhas solicitações abertas
              </h3>
              <SolicitacoesList
                filtros={{
                  status: ['pendente', 'em_execucao'],
                  requerente_id: user?.id,
                }}
                emptyMessage="Você não tem solicitações abertas."
              />
            </div>
          </div>
        </TabsContent>

        {/* Histórico: concluídas e recusadas */}
        <TabsContent value="historico" className="mt-4">
          <SolicitacoesList
            filtros={{ status: ['concluida', 'recusada'] }}
            emptyMessage="Nenhuma solicitação concluída ou recusada ainda."
          />
        </TabsContent>
      </Tabs>

      <NovaSolicitacaoDialog open={novaOpen} onOpenChange={setNovaOpen} />
    </div>
  );
}
