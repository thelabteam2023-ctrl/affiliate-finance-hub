import { useState, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { SolicitacoesKanban } from './SolicitacoesKanban';
import { SolicitacoesList } from './SolicitacoesList';
import { NovaSolicitacaoDialog } from './NovaSolicitacaoDialog';
import { SolicitacaoLoteDialog } from './SolicitacaoLoteDialog';
import { useSolicitacoesKpis, useSolicitacoes } from '@/hooks/useSolicitacoes';
import { useAuth } from '@/hooks/useAuth';
import { useWorkspaceMembers } from '@/hooks/useWorkspaceMembers';
import { SOLICITACAO_TIPO_LABELS } from '@/types/solicitacoes';
import type { SolicitacaoTipo } from '@/types/solicitacoes';
import { getFirstLastName } from '@/lib/utils';
import {
  ClipboardList,
  Plus,
  Clock,
  PlayCircle,
  CheckCircle2,
  Zap,
  ClipboardPaste,
  Kanban,
  List,
  Users,
} from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

type ViewMode = 'kanban' | 'lista';
type FilterTab = 'fila' | 'minhas' | 'historico';

export function SolicitacoesModule() {
  const [novaOpen, setNovaOpen] = useState(false);
  const [loteOpen, setLoteOpen] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>('kanban');
  const [subTab, setSubTab] = useState<FilterTab>('fila');
  const [tipoFilter, setTipoFilter] = useState<SolicitacaoTipo | null>(null);
  const [responsavelFilter, setResponsavelFilter] = useState<string | null>(null);
  const { user } = useAuth();
  const { data: kpis } = useSolicitacoesKpis();
  const { data: members = [] } = useWorkspaceMembers();

  // Active solicitações for tipo breakdown
  const { data: activeSolicitacoes = [] } = useSolicitacoes({
    status: ['pendente', 'em_execucao'],
  });

  const tipoBreakdown = useMemo(() => {
    const map: Record<string, number> = {};
    activeSolicitacoes.forEach((s) => {
      map[s.tipo] = (map[s.tipo] || 0) + 1;
    });
    return map;
  }, [activeSolicitacoes]);

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
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="gap-2"
            onClick={() => setLoteOpen(true)}
          >
            <ClipboardPaste className="h-4 w-4" />
            Em Lote
          </Button>
          <Button onClick={() => setNovaOpen(true)} size="sm" className="gap-2">
            <Plus className="h-4 w-4" />
            Nova Solicitação
          </Button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-3 gap-3">
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
            <CheckCircle2 className="h-8 w-8 text-emerald-400 flex-shrink-0" />
            <div>
              <p className="text-2xl font-bold">{kpis?.total_abertas ?? 0}</p>
              <p className="text-xs text-muted-foreground">Total Abertas</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters bar */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        {/* Type filter chips */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <Badge
            variant={tipoFilter === null ? 'default' : 'outline'}
            className="cursor-pointer text-xs"
            onClick={() => setTipoFilter(null)}
          >
            Todos ({activeSolicitacoes.length})
          </Badge>
          {Object.entries(tipoBreakdown).map(([tipo, count]) => (
            <Badge
              key={tipo}
              variant={tipoFilter === tipo ? 'default' : 'outline'}
              className="cursor-pointer text-xs"
              onClick={() =>
                setTipoFilter(tipoFilter === tipo ? null : (tipo as SolicitacaoTipo))
              }
            >
              {SOLICITACAO_TIPO_LABELS[tipo as SolicitacaoTipo]} ({count})
            </Badge>
          ))}
        </div>

        {/* View toggle + responsável filter */}
        <div className="flex items-center gap-2">
          <Select
            value={responsavelFilter ?? 'todos'}
            onValueChange={(v) => setResponsavelFilter(v === 'todos' ? null : v)}
          >
            <SelectTrigger className="h-8 w-[160px] text-xs">
              <Users className="h-3.5 w-3.5 mr-1.5" />
              <SelectValue placeholder="Responsável" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos</SelectItem>
              {members.map((m) => (
                <SelectItem key={m.user_id} value={m.user_id}>
                  {m.full_name ? getFirstLastName(m.full_name) : m.email}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <div className="flex items-center border border-border rounded-md">
            <button
              onClick={() => setViewMode('kanban')}
              className={`p-1.5 rounded-l-md transition-colors ${
                viewMode === 'kanban'
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <Kanban className="h-4 w-4" />
            </button>
            <button
              onClick={() => setViewMode('lista')}
              className={`p-1.5 rounded-r-md transition-colors ${
                viewMode === 'lista'
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <List className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Content */}
      {viewMode === 'kanban' ? (
        <SolicitacoesKanban
          tipoFilter={tipoFilter}
          responsavelFilter={responsavelFilter}
        />
      ) : (
        <>
          {/* Sub-tabs for list view */}
          <div className="flex items-center gap-1 border-b border-border pb-0">
            {([
              { key: 'fila', label: 'Pendentes' },
              { key: 'minhas', label: 'Responsável' },
              { key: 'historico', label: 'Histórico' },
            ] as const).map((tab) => (
              <button
                key={tab.key}
                onClick={() => setSubTab(tab.key)}
                className={`px-3 py-2 text-sm font-medium border-b-2 transition-colors ${
                  subTab === tab.key
                    ? 'border-primary text-foreground'
                    : 'border-transparent text-muted-foreground hover:text-foreground'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {subTab === 'fila' && (
            <SolicitacoesList
              filtros={{ status: ['pendente', 'em_execucao'] }}
              emptyMessage="Nenhuma solicitação em aberto."
            />
          )}
          {subTab === 'minhas' && (
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
          )}
          {subTab === 'historico' && (
            <SolicitacoesList
              filtros={{ status: ['concluida', 'recusada'] }}
              emptyMessage="Nenhuma solicitação concluída ou recusada ainda."
            />
          )}
        </>
      )}

      <NovaSolicitacaoDialog open={novaOpen} onOpenChange={setNovaOpen} />
      <SolicitacaoLoteDialog open={loteOpen} onOpenChange={setLoteOpen} />
    </div>
  );
}
