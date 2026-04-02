/**
 * Módulo de Contas Disponíveis
 * 
 * Lista TODAS as bookmakers sem vínculo a projeto, com filtros e ações:
 * - Vincular a projeto
 * - Gerar saque
 * - Marcar para saque
 * - Ver histórico
 */

import { useState, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { formatCurrency } from "@/utils/formatCurrency";
import { getFirstLastName } from "@/lib/utils";
import {
  Search,
  Unlink,
  ArrowUpFromLine,
  Link2,
  History,
  Filter,
  Building2,
  User,
  Wallet,
  ChevronDown,
  ChevronUp,
  Package,
  Plus,
  Minus,
  AlertTriangle,
  DollarSign,
  FolderKanban,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubTrigger,
  ContextMenuSubContent,
} from "@/components/ui/context-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";

interface ContaDisponivel {
  id: string;
  nome: string;
  status: string;
  saldo_atual: number;
  saldo_freebet: number;
  saldo_usd: number;
  moeda: string;
  parceiro_id: string | null;
  parceiro_nome: string | null;
  logo_url: string | null;
  ultimo_projeto_nome: string | null;
  ultimo_projeto_id: string | null;
  data_desvinculacao: string | null;
}

interface ProjetoOption {
  id: string;
  nome: string;
}

export function ContasDisponiveisModule() {
  const { workspaceId, user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [search, setSearch] = useState("");
  const [minSaldo, setMinSaldo] = useState("10");
  const [moedaFilter, setMoedaFilter] = useState("todas");
  const [parceiroFilter, setParceiroFilter] = useState("todos");
  const [showHistory, setShowHistory] = useState<string | null>(null);

  // Seleção em massa
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkVincularOpen, setBulkVincularOpen] = useState(false);
  const [bulkProjetoId, setBulkProjetoId] = useState("");
  const [bulkLoading, setBulkLoading] = useState(false);

  // Vincular dialog (individual)
  const [vincularDialogOpen, setVincularDialogOpen] = useState(false);
  const [selectedConta, setSelectedConta] = useState<ContaDisponivel | null>(null);
  const [selectedProjetoId, setSelectedProjetoId] = useState("");
  const [vincularLoading, setVincularLoading] = useState(false);

  // Query: all bookmakers without project
  const { data: contas, isLoading, refetch } = useQuery({
    queryKey: ["contas-disponiveis", workspaceId],
    queryFn: async (): Promise<ContaDisponivel[]> => {
      // Fonte de verdade: view que já filtra apenas casas realmente disponíveis
      // (sem projeto, sem ack, fora de aguardando saque e com saldo/freebet positivo)
      const { data: bookmakers, error } = await supabase
        .from("v_bookmakers_desvinculados")
        .select(`
          id, nome, status, saldo_atual, saldo_freebet, saldo_usd, moeda,
          parceiro_id, parceiro_nome
        `)
        .order("nome");

      if (error) throw error;

      // Enriquecimento visual: logo do catálogo
      const bookmakerIds = (bookmakers || []).map((b: any) => b.id);
      const bookmakerNames = [...new Set((bookmakers || []).map((b: any) => b.nome).filter(Boolean))];
      
      let logoMap = new Map<string, string | null>();
      let historicoMap = new Map<string, { projeto_nome: string; projeto_id: string; data_desvinculacao: string }>();
      
      if (bookmakerIds.length > 0 || bookmakerNames.length > 0) {
        const [historicoResult, catalogoResult] = await Promise.all([
          bookmakerIds.length > 0
            ? supabase
                .from("projeto_bookmaker_historico")
                .select("bookmaker_id, projeto_id, data_desvinculacao, projeto:projetos!projeto_bookmaker_historico_projeto_id_fkey (nome)")
                .in("bookmaker_id", bookmakerIds)
                .not("data_desvinculacao", "is", null)
                .order("data_desvinculacao", { ascending: false })
            : Promise.resolve({ data: [], error: null }),
          bookmakerNames.length > 0
            ? supabase
                .from("bookmakers_catalogo")
                .select("nome, logo_url")
                .in("nome", bookmakerNames)
            : Promise.resolve({ data: [], error: null }),
        ]);

        if (historicoResult.error) throw historicoResult.error;
        if (catalogoResult.error) throw catalogoResult.error;

        for (const c of (catalogoResult.data || []) as any[]) {
          logoMap.set(c.nome, c.logo_url ?? null);
        }

        for (const h of (historicoResult.data || []) as any[]) {
          if (!historicoMap.has(h.bookmaker_id)) {
            historicoMap.set(h.bookmaker_id, {
              projeto_nome: h.projeto?.nome || "N/A",
              projeto_id: h.projeto_id,
              data_desvinculacao: h.data_desvinculacao,
            });
          }
        }
      }

      return (bookmakers || []).map((b: any) => {
        const hist = historicoMap.get(b.id);
        return {
          id: b.id,
          nome: b.nome,
          status: b.status,
          saldo_atual: Number(b.saldo_atual) || 0,
          saldo_freebet: Number(b.saldo_freebet) || 0,
          saldo_usd: Number(b.saldo_usd) || 0,
          moeda: b.moeda || "BRL",
          parceiro_id: b.parceiro_id,
          parceiro_nome: b.parceiro_nome || null,
          logo_url: logoMap.get(b.nome) || null,
          ultimo_projeto_nome: hist?.projeto_nome || null,
          ultimo_projeto_id: hist?.projeto_id || null,
          data_desvinculacao: hist?.data_desvinculacao || null,
        };
      });
    },
    enabled: !!workspaceId,
    staleTime: 30 * 1000,
  });

  // Query: active projects
  const { data: projetos } = useQuery({
    queryKey: ["projetos-ativos", workspaceId],
    queryFn: async (): Promise<ProjetoOption[]> => {
      const { data, error } = await supabase
        .from("projetos")
        .select("id, nome")
        .eq("workspace_id", workspaceId!)
        .eq("status", "EM_ANDAMENTO")
        .order("nome");
      if (error) throw error;
      return data || [];
    },
    enabled: !!workspaceId,
  });

  // Derived data
  const minSaldoNum = parseFloat(minSaldo) || 0;

  const filtered = useMemo(() => {
    if (!contas) return [];
    return contas.filter((c) => {
      // saldo_atual é SEMPRE a fonte de verdade (mantido pelos triggers do motor financeiro)
      const totalSaldo = c.saldo_atual + c.saldo_freebet;
      
      if (totalSaldo < minSaldoNum) return false;
      if (moedaFilter !== "todas" && c.moeda !== moedaFilter) return false;
      if (parceiroFilter !== "todos" && c.parceiro_id !== parceiroFilter) return false;
      if (search) {
        const q = search.toLowerCase();
        const matchNome = c.nome.toLowerCase().includes(q);
        const matchParceiro = c.parceiro_nome?.toLowerCase().includes(q);
        if (!matchNome && !matchParceiro) return false;
      }
      return true;
    });
  }, [contas, search, minSaldoNum, moedaFilter, parceiroFilter]);

  // Unique parceiros for filter
  const parceirosUnicos = useMemo(() => {
    if (!contas) return [];
    const map = new Map<string, string>();
    contas.forEach((c) => {
      if (c.parceiro_id && c.parceiro_nome) {
        map.set(c.parceiro_id, c.parceiro_nome);
      }
    });
    return Array.from(map.entries()).sort((a, b) => a[1].localeCompare(b[1]));
  }, [contas]);

  // Unique moedas for filter
  const moedasUnicas = useMemo(() => {
    if (!contas) return [];
    return [...new Set(contas.map((c) => c.moeda))].sort();
  }, [contas]);

  // Totals
  const totaisPorMoeda = useMemo(() => {
    const map = new Map<string, { saldo: number; freebet: number; count: number }>();
    filtered.forEach((c) => {
      const current = map.get(c.moeda) || { saldo: 0, freebet: 0, count: 0 };
      map.set(c.moeda, {
        saldo: current.saldo + c.saldo_atual,
        freebet: current.freebet + c.saldo_freebet,
        count: current.count + 1,
      });
    });
    return map;
  }, [filtered]);

  // Actions
  const handleVincular = (conta: ContaDisponivel) => {
    setSelectedConta(conta);
    setSelectedProjetoId("");
    setVincularDialogOpen(true);
  };

  const handleConfirmVincular = async () => {
    if (!selectedConta || !selectedProjetoId) return;
    setVincularLoading(true);
    try {
      // 1. Update bookmaker to link to project
      const { error: updateError } = await supabase
        .from("bookmakers")
        .update({ projeto_id: selectedProjetoId })
        .eq("id", selectedConta.id);

      if (updateError) throw updateError;

      // 2. Create historico entry
      const { error: histError } = await supabase
        .from("projeto_bookmaker_historico")
        .insert({
          projeto_id: selectedProjetoId,
          bookmaker_id: selectedConta.id,
          bookmaker_nome: selectedConta.nome,
          parceiro_id: selectedConta.parceiro_id,
          parceiro_nome: selectedConta.parceiro_nome,
          user_id: user!.id,
          workspace_id: workspaceId!,
        });

      if (histError) {
        console.error("[ContasDisponiveis] Erro ao criar histórico:", histError);
      }

      // 3. DEPOSITO_VIRTUAL — baseline financeiro para o novo ciclo
      // Sem isso, re-vinculações inflam o Fluxo Líquido do projeto
      const { executeLink } = await import("@/lib/projetoTransitionService");
      await executeLink({
        bookmakerId: selectedConta.id,
        projetoId: selectedProjetoId,
        workspaceId: workspaceId!,
        userId: user!.id,
        saldoAtual: selectedConta.saldo_atual,
        moeda: selectedConta.moeda,
      });

      // 4. Atribuir transações órfãs (sem projeto_id_snapshot) a este projeto
      await supabase
        .from("cash_ledger")
        .update({ projeto_id_snapshot: selectedProjetoId })
        .or(`origem_bookmaker_id.eq.${selectedConta.id},destino_bookmaker_id.eq.${selectedConta.id}`)
        .is("projeto_id_snapshot", null);

      toast.success(`"${selectedConta.nome}" vinculada ao projeto com sucesso!`);
      setVincularDialogOpen(false);
      
      // Invalidate queries
      queryClient.invalidateQueries({ queryKey: ["contas-disponiveis"] });
      queryClient.invalidateQueries({ queryKey: ["projeto-vinculos"] });
      queryClient.invalidateQueries({ queryKey: ["bookmaker-saldos"] });
      refetch();
    } catch (err) {
      console.error("[ContasDisponiveis] Erro ao vincular:", err);
      toast.error("Erro ao vincular bookmaker ao projeto");
    } finally {
      setVincularLoading(false);
    }
  };

  const handleGerarSaque = (conta: ContaDisponivel) => {
    navigate("/caixa", { state: { openDialog: true, bookmakerId: conta.id, bookmakerNome: conta.nome } });
  };

  const handleMarcarParaSaque = async (conta: ContaDisponivel) => {
    try {
      const { error } = await supabase.rpc("marcar_para_saque", {
        p_bookmaker_id: conta.id,
      });
      if (error) throw error;
      toast.success(`"${conta.nome}" marcada para saque`);
      refetch();
    } catch (err) {
      console.error("[ContasDisponiveis] Erro ao marcar para saque:", err);
      toast.error("Erro ao marcar para saque");
    }
  };

  // Selection helpers
  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === filtered.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filtered.map(c => c.id)));
    }
  };

  const selectedContas = useMemo(
    () => filtered.filter(c => selectedIds.has(c.id)),
    [filtered, selectedIds]
  );

  // Bulk vincular handler
  const handleBulkVincular = async () => {
    if (!bulkProjetoId || selectedContas.length === 0) return;
    setBulkLoading(true);
    let successCount = 0;
    try {
      const { executeLink } = await import("@/lib/projetoTransitionService");

      for (const conta of selectedContas) {
        try {
          const { error: updateError } = await supabase
            .from("bookmakers")
            .update({ projeto_id: bulkProjetoId })
            .eq("id", conta.id);
          if (updateError) throw updateError;

          await supabase
            .from("projeto_bookmaker_historico")
            .insert({
              projeto_id: bulkProjetoId,
              bookmaker_id: conta.id,
              bookmaker_nome: conta.nome,
              parceiro_id: conta.parceiro_id,
              parceiro_nome: conta.parceiro_nome,
              user_id: user!.id,
              workspace_id: workspaceId!,
            });

          await executeLink({
            bookmakerId: conta.id,
            projetoId: bulkProjetoId,
            workspaceId: workspaceId!,
            userId: user!.id,
            saldoAtual: conta.saldo_atual,
            moeda: conta.moeda,
          });

          await supabase
            .from("cash_ledger")
            .update({ projeto_id_snapshot: bulkProjetoId })
            .or(`origem_bookmaker_id.eq.${conta.id},destino_bookmaker_id.eq.${conta.id}`)
            .is("projeto_id_snapshot", null);

          successCount++;
        } catch (err) {
          console.error(`[BulkVincular] Erro em ${conta.nome}:`, err);
        }
      }

      if (successCount > 0) {
        toast.success(`${successCount} casa(s) vinculada(s) ao projeto com sucesso!`);
        queryClient.invalidateQueries({ queryKey: ["contas-disponiveis"] });
        queryClient.invalidateQueries({ queryKey: ["projeto-vinculos"] });
        queryClient.invalidateQueries({ queryKey: ["bookmaker-saldos"] });
        refetch();
      }
      if (successCount < selectedContas.length) {
        toast.error(`${selectedContas.length - successCount} casa(s) falharam ao vincular`);
      }
      setBulkVincularOpen(false);
      setSelectedIds(new Set());
      setBulkProjetoId("");
    } finally {
      setBulkLoading(false);
    }
  };

  const getSaldoEfetivo = (c: ContaDisponivel) => {
    return Math.max(0, c.saldo_atual);
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* KPI Summary */}
      <div className="flex flex-wrap gap-3">
        {Array.from(totaisPorMoeda.entries()).map(([moeda, totais]) => (
          <Card key={moeda} className="flex-1 min-w-[180px]">
            <CardContent className="p-3">
              <div className="flex items-center gap-2">
                <Wallet className="h-4 w-4 text-primary" />
                <span className="text-xs text-muted-foreground">{moeda}</span>
                <Badge variant="secondary" className="ml-auto text-[10px]">{totais.count} contas</Badge>
              </div>
              <p className="text-lg font-bold mt-1">{formatCurrency(totais.saldo, moeda)}</p>
              {totais.freebet > 0 && (
                <p className="text-xs text-amber-400">🎁 FB: {formatCurrency(totais.freebet, moeda)}</p>
              )}
            </CardContent>
          </Card>
        ))}
        {totaisPorMoeda.size === 0 && (
          <Card className="flex-1">
            <CardContent className="p-3 text-center text-sm text-muted-foreground">
              Nenhuma conta disponível com os filtros atuais
            </CardContent>
          </Card>
        )}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-[220px] shrink-0">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Buscar casa ou parceiro..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 h-9 text-sm"
          />
        </div>
        <Select value={minSaldo} onValueChange={setMinSaldo}>
          <SelectTrigger className="w-[175px] h-9 text-sm" icon={<Filter className="h-3.5 w-3.5" />}>
            <SelectValue placeholder="Saldo mín." />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="0">Todos os saldos</SelectItem>
            <SelectItem value="1">≥ 1</SelectItem>
            <SelectItem value="10">≥ 10</SelectItem>
            <SelectItem value="50">≥ 50</SelectItem>
            <SelectItem value="100">≥ 100</SelectItem>
            <SelectItem value="500">≥ 500</SelectItem>
          </SelectContent>
        </Select>
        {moedasUnicas.length > 1 && (
          <Select value={moedaFilter} onValueChange={setMoedaFilter}>
            <SelectTrigger className="w-[175px] h-9 text-sm">
              <SelectValue placeholder="Moeda" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todas">Todas moedas</SelectItem>
              {moedasUnicas.map((m) => (
                <SelectItem key={m} value={m}>{m}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        {parceirosUnicos.length > 1 && (
          <Select value={parceiroFilter} onValueChange={setParceiroFilter}>
            <SelectTrigger className="w-[190px] h-9 text-sm" icon={<User className="h-3.5 w-3.5" />}>
              <SelectValue placeholder="Parceiro" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos parceiros</SelectItem>
              {parceirosUnicos.map(([id, nome]) => (
                <SelectItem key={id} value={id}>{getFirstLastName(nome)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        <Badge variant="outline" className="h-9 px-3 text-sm">
          {filtered.length} / {contas?.length || 0}
        </Badge>
      </div>

      {/* Bulk Action Bar */}
      {selectedIds.size > 0 && (
        <div className="flex items-center gap-3 p-3 rounded-lg bg-primary/10 border border-primary/20">
          <Checkbox
            checked={selectedIds.size === filtered.length}
            onCheckedChange={toggleSelectAll}
          />
          <span className="text-sm font-medium">
            {selectedIds.size} casa(s) selecionada(s)
          </span>
          <Button
            size="sm"
            onClick={() => { setBulkProjetoId(""); setBulkVincularOpen(true); }}
            className="ml-auto gap-2"
          >
            <Link2 className="h-3.5 w-3.5" />
            Vincular ao projeto
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setSelectedIds(new Set())}
          >
            Limpar seleção
          </Button>
        </div>
      )}

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="p-3 w-10">
                    <Checkbox
                      checked={filtered.length > 0 && selectedIds.size === filtered.length}
                      onCheckedChange={toggleSelectAll}
                    />
                  </th>
                  <th className="text-left p-3 font-medium text-muted-foreground">Casa</th>
                  <th className="text-left p-3 font-medium text-muted-foreground">Parceiro</th>
                  <th className="text-left p-3 font-medium text-muted-foreground">Moeda</th>
                  <th className="text-right p-3 font-medium text-muted-foreground">Saldo Real</th>
                  <th className="text-right p-3 font-medium text-muted-foreground">Freebet</th>
                  <th className="text-left p-3 font-medium text-muted-foreground">Status</th>
                  <th className="text-left p-3 font-medium text-muted-foreground">Último Projeto</th>
                  <th className="text-right p-3 font-medium text-muted-foreground">Ações</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((conta) => {
                  const saldoEfetivo = getSaldoEfetivo(conta);
                  const isExpanded = showHistory === conta.id;
                  return (
                    <ContextMenu key={conta.id}>
                      <ContextMenuTrigger asChild>
                        <tr className={`border-b border-border/50 hover:bg-muted/30 transition-colors cursor-context-menu ${selectedIds.has(conta.id) ? 'bg-primary/5' : ''}`}>
                          <td className="p-3 w-10" onClick={(e) => e.stopPropagation()}>
                            <Checkbox
                              checked={selectedIds.has(conta.id)}
                              onCheckedChange={() => toggleSelect(conta.id)}
                            />
                          </td>
                          <td className="p-3">
                            <div className="flex items-center gap-2">
                              {conta.logo_url ? (
                                <img src={conta.logo_url} alt="" className="h-6 w-6 rounded object-contain" />
                              ) : (
                                <Building2 className="h-4 w-4 text-muted-foreground" />
                              )}
                              <span className="font-medium">{conta.nome}</span>
                            </div>
                          </td>
                          <td className="p-3 text-muted-foreground">
                            {conta.parceiro_nome ? getFirstLastName(conta.parceiro_nome) : "—"}
                          </td>
                          <td className="p-3">
                            <Badge variant="outline" className="text-xs">{conta.moeda}</Badge>
                          </td>
                          <td className="p-3 text-right font-mono font-medium">
                            {formatCurrency(saldoEfetivo, conta.moeda)}
                          </td>
                          <td className="p-3 text-right font-mono">
                            {conta.saldo_freebet > 0 ? (
                              <span className="text-amber-400">🎁 {formatCurrency(conta.saldo_freebet, conta.moeda)}</span>
                            ) : "—"}
                          </td>
                          <td className="p-3">
                            <Badge
                              variant={conta.status === "aguardando_saque" ? "default" : "secondary"}
                              className={
                                conta.status === "aguardando_saque"
                                  ? "bg-orange-500/20 text-orange-400 text-xs"
                                  : conta.status === "limitada"
                                  ? "bg-red-500/20 text-red-400 text-xs"
                                  : "text-xs"
                              }
                            >
                              {conta.status === "aguardando_saque" ? "Aguard. Saque" : 
                               conta.status === "limitada" ? "Limitada" :
                               conta.status === "AGUARDANDO_DECISAO" ? "Aguard. Decisão" : "Ativa"}
                            </Badge>
                          </td>
                          <td className="p-3 text-muted-foreground text-xs">
                            {conta.ultimo_projeto_nome ? (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <span className="cursor-help underline decoration-dotted">
                                    {conta.ultimo_projeto_nome}
                                  </span>
                                </TooltipTrigger>
                                <TooltipContent>
                                  Desvinculada em {conta.data_desvinculacao
                                    ? new Date(conta.data_desvinculacao).toLocaleDateString("pt-BR")
                                    : "data desconhecida"}
                                </TooltipContent>
                              </Tooltip>
                            ) : (
                              <span className="text-muted-foreground/50">Nunca vinculada</span>
                            )}
                          </td>
                          <td className="p-3">
                            <div className="flex items-center justify-end gap-1">
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    size="icon"
                                    variant="ghost"
                                    className="h-7 w-7"
                                    onClick={() => handleVincular(conta)}
                                  >
                                    <Link2 className="h-3.5 w-3.5 text-emerald-400" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>Vincular a projeto</TooltipContent>
                              </Tooltip>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    size="icon"
                                    variant="ghost"
                                    className="h-7 w-7"
                                    onClick={() => handleGerarSaque(conta)}
                                  >
                                    <ArrowUpFromLine className="h-3.5 w-3.5 text-blue-400" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>Gerar saque</TooltipContent>
                              </Tooltip>
                              {conta.status !== "aguardando_saque" && (
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button
                                      size="icon"
                                      variant="ghost"
                                      className="h-7 w-7"
                                      onClick={() => handleMarcarParaSaque(conta)}
                                    >
                                      <Package className="h-3.5 w-3.5 text-orange-400" />
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent>Marcar para saque</TooltipContent>
                                </Tooltip>
                              )}
                            </div>
                          </td>
                        </tr>
                      </ContextMenuTrigger>
                      <ContextMenuContent>
                        <ContextMenuSub>
                          <ContextMenuSubTrigger className="gap-2">
                            <DollarSign className="h-4 w-4" />
                            Financeiro
                          </ContextMenuSubTrigger>
                          <ContextMenuSubContent className="min-w-[180px]">
                            <ContextMenuItem
                              onClick={() => navigate("/caixa", { state: { openDialog: true, bookmakerId: conta.id, bookmakerNome: conta.nome, tipo: "deposito", moeda: conta.moeda } })}
                              className="gap-2"
                            >
                              <Plus className="h-4 w-4 text-success" />
                              Depósito
                            </ContextMenuItem>
                            <ContextMenuItem
                              onClick={() => handleGerarSaque(conta)}
                              className="gap-2"
                            >
                              <Minus className="h-4 w-4 text-destructive" />
                              Saque
                            </ContextMenuItem>
                            <ContextMenuSeparator />
                            <ContextMenuItem
                              onClick={() => handleMarcarParaSaque(conta)}
                              className="gap-2"
                              disabled={conta.status === "aguardando_saque"}
                            >
                              <Package className="h-4 w-4 text-amber-400" />
                              Marcar para saque
                            </ContextMenuItem>
                          </ContextMenuSubContent>
                        </ContextMenuSub>
                        <ContextMenuSeparator />
                        <ContextMenuSub>
                          <ContextMenuSubTrigger className="gap-2">
                            <FolderKanban className="h-4 w-4" />
                            Vincular a projeto
                          </ContextMenuSubTrigger>
                          <ContextMenuSubContent className="min-w-[180px]">
                            {projetos && projetos.length > 0 ? (
                              projetos.map((proj) => (
                                <ContextMenuItem
                                  key={proj.id}
                                  onClick={() => {
                                    setSelectedConta(conta);
                                    setSelectedProjetoId(proj.id);
                                    setVincularDialogOpen(true);
                                  }}
                                  className="gap-2"
                                >
                                  <FolderKanban className="h-3.5 w-3.5 text-muted-foreground" />
                                  {proj.nome}
                                </ContextMenuItem>
                              ))
                            ) : (
                              <ContextMenuItem disabled className="text-muted-foreground text-xs">
                                Nenhum projeto disponível
                              </ContextMenuItem>
                            )}
                          </ContextMenuSubContent>
                        </ContextMenuSub>
                      </ContextMenuContent>
                    </ContextMenu>
                  );
                })}
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={8} className="p-8 text-center text-muted-foreground">
                      <Unlink className="h-8 w-8 mx-auto mb-2 opacity-30" />
                      <p>Nenhuma conta disponível encontrada</p>
                      <p className="text-xs mt-1">Ajuste os filtros ou todas as casas estão vinculadas a projetos</p>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Dialog: Vincular a Projeto */}
      <Dialog open={vincularDialogOpen} onOpenChange={setVincularDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Vincular a Projeto</DialogTitle>
            <DialogDescription>
              Vincular <strong>{selectedConta?.nome}</strong>
              {selectedConta?.parceiro_nome && ` de ${getFirstLastName(selectedConta.parceiro_nome)}`} a um projeto ativo.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="flex items-center gap-2 p-3 rounded-lg bg-muted/50">
              <Wallet className="h-4 w-4 text-primary" />
              <span className="text-sm">Saldo: <strong>{selectedConta && formatCurrency(getSaldoEfetivo(selectedConta), selectedConta.moeda)}</strong></span>
              {selectedConta && selectedConta.saldo_freebet > 0 && (
                <span className="text-xs text-amber-400 ml-2">+ 🎁 {formatCurrency(selectedConta.saldo_freebet, selectedConta.moeda)}</span>
              )}
            </div>
            <Select value={selectedProjetoId} onValueChange={setSelectedProjetoId}>
              <SelectTrigger>
                <SelectValue placeholder="Selecionar projeto..." />
              </SelectTrigger>
              <SelectContent>
                {(projetos || []).map((p) => (
                  <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setVincularDialogOpen(false)}>
              Cancelar
            </Button>
            <Button
              onClick={handleConfirmVincular}
              disabled={!selectedProjetoId || vincularLoading}
            >
              {vincularLoading ? "Vinculando..." : "Vincular"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
