import { useState, useEffect } from "react";
import { parseLocalDate } from "@/lib/dateUtils";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Textarea } from "@/components/ui/textarea";
import { Ban } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Wallet,
  Gift,
  Banknote,
  Users,
  Truck,
  Clock,
  CheckCircle2,
  AlertCircle,
  Loader2,
  User,
  HelpCircle,
  RefreshCw,
  Star,
  Plus,
} from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { PagamentoBonusDialog } from "./PagamentoBonusDialog";
import { PagamentoComissaoDialog } from "./PagamentoComissaoDialog";
import { PagamentoParceiroDialog } from "./PagamentoParceiroDialog";
import { PagamentoCaptacaoDialog } from "./PagamentoCaptacaoDialog";
import { ParceriaDialog } from "@/components/parcerias/ParceriaDialog";

interface Movimentacao {
  id: string;
  tipo: string;
  valor: number;
  moeda: string;
  data_movimentacao: string;
  descricao: string | null;
  status: string;
  indicador_id: string | null;
  parceria_id: string | null;
  parceiro_id: string | null;
}

interface BonusPendente {
  indicadorId: string;
  indicadorNome: string;
  valorBonus: number;
  qtdParceiros: number;
  meta: number;
  ciclosPendentes: number;
  totalBonusPendente: number;
}

interface ComissaoPendente {
  parceriaId: string;
  parceiroNome: string;
  indicadorId: string;
  indicadorNome: string;
  valorComissao: number;
}

interface ParceiroPendente {
  parceriaId: string;
  parceiroNome: string;
  valorParceiro: number;
  origemTipo: string;
}

export function FinanceiroTab() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [movimentacoes, setMovimentacoes] = useState<Movimentacao[]>([]);
  const [bonusPendentes, setBonusPendentes] = useState<BonusPendente[]>([]);
  const [comissoesPendentes, setComissoesPendentes] = useState<ComissaoPendente[]>([]);
  const [parceirosPendentes, setParceirosPendentes] = useState<ParceiroPendente[]>([]);
  
  const [bonusDialogOpen, setBonusDialogOpen] = useState(false);
  const [comissaoDialogOpen, setComissaoDialogOpen] = useState(false);
  const [parceiroDialogOpen, setParceiroDialogOpen] = useState(false);
  const [captacaoDialogOpen, setCaptacaoDialogOpen] = useState(false);
  const [selectedBonus, setSelectedBonus] = useState<BonusPendente | null>(null);
  const [selectedComissao, setSelectedComissao] = useState<ComissaoPendente | null>(null);
  const [selectedParceiro, setSelectedParceiro] = useState<ParceiroPendente | null>(null);
  
  // Dispensar pagamento state
  const [dispensaOpen, setDispensaOpen] = useState(false);
  const [dispensaParceriaId, setDispensaParceriaId] = useState<string | null>(null);
  const [dispensaParceiroNome, setDispensaParceiroNome] = useState('');
  const [dispensaMotivo, setDispensaMotivo] = useState('');
  const [dispensaLoading, setDispensaLoading] = useState(false);

  // Estado para editar parceria após renovação
  const [editParceriaOpen, setEditParceriaOpen] = useState(false);
  const [editParceriaData, setEditParceriaData] = useState<any>(null);

  const handleRenovacao = async (parceiroId: string) => {
    try {
      // Buscar parceria ativa do parceiro
      const { data: parceria } = await supabase
        .from("parcerias")
        .select("*, parceiros!inner(nome)")
        .eq("parceiro_id", parceiroId)
        .in("status", ["ATIVA", "EM_ENCERRAMENTO"])
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (parceria) {
        // Calcular dias restantes
        const dataFim = parseLocalDate(parceria.data_inicio);
        dataFim.setDate(dataFim.getDate() + parceria.duracao_dias);
        const hoje = new Date();
        const diffMs = dataFim.getTime() - hoje.getTime();
        const diasRestantes = Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));

        setEditParceriaData({
          ...parceria,
          parceiro_nome: (parceria.parceiros as any)?.nome || "",
          dias_restantes: diasRestantes,
          data_fim_prevista: dataFim.toISOString().split("T")[0],
        });
        setEditParceriaOpen(true);
      } else {
        toast({
          title: "Parceria não encontrada",
          description: "Nenhuma parceria ativa encontrada para este parceiro.",
          variant: "destructive",
        });
      }
    } catch (error: any) {
      console.error("Erro ao buscar parceria:", error);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);

      // Fetch all data in parallel - use workspace-scoped views to prevent data leakage
      const [movResult, custosResult, acordosResult, parceriasResult, indicacoesResult, indicadoresResult, parceirosResult] = await Promise.all([
        // Use workspace-scoped view for movimentacoes
        supabase
          .from("v_movimentacoes_indicacao_workspace")
          .select("*")
          .order("data_movimentacao", { ascending: false }),
        supabase.from("v_custos_aquisicao").select("*"),
        supabase.from("indicador_acordos").select("*").eq("ativo", true),
        // Fetch parcerias with comissão pendente (parcerias table has workspace RLS)
        supabase
          .from("parcerias")
          .select(`
            id,
            parceiro_id,
            valor_comissao_indicador,
            comissao_paga,
            indicacao_id,
            parceiro:parceiros(nome)
          `)
          .eq("comissao_paga", false)
          .not("valor_comissao_indicador", "is", null)
          .gt("valor_comissao_indicador", 0),
        // Use workspace-scoped view for indicacoes
        supabase
          .from("v_indicacoes_workspace")
          .select("id, parceiro_id, indicador_id"),
        // indicadores_referral has workspace RLS
        supabase
          .from("indicadores_referral")
          .select("id, nome"),
        // parcerias table has workspace RLS
        supabase
          .from("parcerias")
          .select(`
            id,
            valor_parceiro,
            origem_tipo,
            status,
            custo_aquisicao_isento,
            pagamento_dispensado,
            parceiro:parceiros(nome)
          `)
          .in("status", ["ATIVA", "EM_ENCERRAMENTO"])
          .or("custo_aquisicao_isento.is.null,custo_aquisicao_isento.eq.false")
          .gt("valor_parceiro", 0)
          .eq("pagamento_dispensado", false),
      ]);

      if (movResult.error) throw movResult.error;
      setMovimentacoes(movResult.data || []);

      // Calculate bonus pendentes
      if (custosResult.data && acordosResult.data) {
        const indicadorStats: Record<string, { nome: string; qtd: number }> = {};
        
        custosResult.data.forEach((c: any) => {
          if (c.indicador_id && c.indicador_nome) {
            if (!indicadorStats[c.indicador_id]) {
              indicadorStats[c.indicador_id] = { nome: c.indicador_nome, qtd: 0 };
            }
            indicadorStats[c.indicador_id].qtd += 1;
          }
        });

        // Check which have met their goals and count paid bonuses per indicator
        const bonusPagosPorIndicador: Record<string, number> = {};
        (movResult.data || [])
          .filter((m) => m.tipo === "BONUS_INDICADOR" && m.status === "CONFIRMADO")
          .forEach((m) => {
            if (m.indicador_id) {
              bonusPagosPorIndicador[m.indicador_id] = (bonusPagosPorIndicador[m.indicador_id] || 0) + 1;
            }
          });

        const pendentes: BonusPendente[] = [];
        acordosResult.data.forEach((acordo: any) => {
          const stats = indicadorStats[acordo.indicador_id];
          if (stats && acordo.meta_parceiros && acordo.meta_parceiros > 0) {
            // Calculate complete cycles: floor(qtdParceiros / meta)
            const ciclosCompletos = Math.floor(stats.qtd / acordo.meta_parceiros);
            const bonusJaPagos = bonusPagosPorIndicador[acordo.indicador_id] || 0;
            const ciclosPendentes = ciclosCompletos - bonusJaPagos;
            
            if (ciclosPendentes > 0) {
              const valorBonusUnitario = acordo.valor_bonus || 0;
              pendentes.push({
                indicadorId: acordo.indicador_id,
                indicadorNome: stats.nome,
                valorBonus: valorBonusUnitario,
                qtdParceiros: stats.qtd,
                meta: acordo.meta_parceiros,
                ciclosPendentes: ciclosPendentes,
                totalBonusPendente: valorBonusUnitario * ciclosPendentes,
              });
            }
          }
        });
        setBonusPendentes(pendentes);
      }

      // Build map of indicador_id -> indicador info
      const indicadoresMap: Record<string, { id: string; nome: string }> = {};
      if (indicadoresResult.data) {
        indicadoresResult.data.forEach((ind: any) => {
          if (ind.id) {
            indicadoresMap[ind.id] = { id: ind.id, nome: ind.nome };
          }
        });
      }

      // Build map of parceiro_id -> indicador from indicacoes table
      const parceiroIndicadorMap: Record<string, { id: string; nome: string }> = {};
      if (indicacoesResult.data) {
        indicacoesResult.data.forEach((ind: any) => {
          if (ind.parceiro_id && ind.indicador_id && indicadoresMap[ind.indicador_id]) {
            parceiroIndicadorMap[ind.parceiro_id] = indicadoresMap[ind.indicador_id];
          }
        });
      }

      // Calculate comissões pendentes - check via parceiro_id using indicacoes map
      if (parceriasResult.data) {
        const comissoes: ComissaoPendente[] = [];
        
        parceriasResult.data.forEach((p: any) => {
          // First try direct indicacao_id link, then fallback to parceiro mapping
          const indicador = parceiroIndicadorMap[p.parceiro_id];
          
          if (indicador) {
            comissoes.push({
              parceriaId: p.id,
              parceiroNome: p.parceiro?.nome || "N/A",
              indicadorId: indicador.id,
              indicadorNome: indicador.nome,
              valorComissao: p.valor_comissao_indicador || 0,
            });
          }
        });
        
        setComissoesPendentes(comissoes);
      }

      // Calculate parceiros pendentes (partner payments)
      if (parceirosResult.data && movResult.data) {
        // Get parcerias that already had a partner payment
        const parceriasPagas = (movResult.data || [])
          .filter((m) => m.tipo === "PAGTO_PARCEIRO" && m.status === "CONFIRMADO")
          .map((m) => m.parceria_id);

        const pendentes: ParceiroPendente[] = parceirosResult.data
          .filter((p: any) => !parceriasPagas.includes(p.id))
          .map((p: any) => ({
            parceriaId: p.id,
            parceiroNome: p.parceiro?.nome || "N/A",
            valorParceiro: p.valor_parceiro || 0,
            origemTipo: p.origem_tipo || "DIRETO",
          }));
        setParceirosPendentes(pendentes);
      }
    } catch (error: any) {
      toast({
        title: "Erro ao carregar dados",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(value);
  };

  const getTipoLabel = (tipo: string) => {
    const labels: Record<string, string> = {
      COMISSAO_INDICADOR: "Comissão",
      BONUS_INDICADOR: "Bônus",
      PAGTO_PARCEIRO: "Pagto. Parceiro",
      PAGTO_FORNECEDOR: "Pagto. Fornecedor",
      RENOVACAO_PARCERIA: "Renovação",
      BONIFICACAO_ESTRATEGICA: "Bonif. Estratégica",
      PAGTO_PARCEIRO_DISPENSADO: "Dispensado",
    };
    return labels[tipo] || tipo;
  };

  const handleDispensarPagamento = async () => {
    if (!dispensaParceriaId || !dispensaMotivo.trim()) return;
    setDispensaLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Não autenticado");

      // 1. Fetch parceria data for audit record
      const { data: parceria } = await supabase
        .from("parcerias")
        .select("parceiro_id, valor_parceiro, workspace_id")
        .eq("id", dispensaParceriaId)
        .single();

      if (!parceria) throw new Error("Parceria não encontrada");

      // 2. Mark as dispensed
      const { error } = await supabase
        .from("parcerias")
        .update({
          pagamento_dispensado: true,
          dispensa_motivo: dispensaMotivo.trim(),
          dispensa_at: new Date().toISOString(),
          dispensa_por: user.id,
        })
        .eq("id", dispensaParceriaId);
      if (error) throw error;

      // 3. Insert zero-value audit record in movimentacoes_indicacao
      await supabase.from("movimentacoes_indicacao").insert({
        user_id: user.id,
        workspace_id: parceria.workspace_id,
        tipo: "PAGTO_PARCEIRO_DISPENSADO",
        valor: 0,
        moeda: "BRL",
        status: "CONFIRMADO",
        parceria_id: dispensaParceriaId,
        parceiro_id: parceria.parceiro_id,
        descricao: `Pagamento dispensado: ${dispensaMotivo.trim()}`,
        data_movimentacao: new Date().toISOString().split("T")[0],
      });

      toast({ title: "Pagamento dispensado", description: `Pagamento de ${dispensaParceiroNome} foi dispensado com sucesso.` });
      setDispensaOpen(false);
      setDispensaMotivo('');
      setDispensaParceriaId(null);
      fetchData();
    } catch (err: any) {
      console.error("Erro ao dispensar pagamento:", err);
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    } finally {
      setDispensaLoading(false);
    }
  };

  const getTipoIcon = (tipo: string) => {
    switch (tipo) {
      case "COMISSAO_INDICADOR":
        return <Banknote className="h-4 w-4" />;
      case "BONUS_INDICADOR":
        return <Gift className="h-4 w-4" />;
      case "PAGTO_PARCEIRO":
        return <Users className="h-4 w-4" />;
      case "PAGTO_FORNECEDOR":
        return <Truck className="h-4 w-4" />;
      case "RENOVACAO_PARCERIA":
        return <RefreshCw className="h-4 w-4" />;
      case "BONIFICACAO_ESTRATEGICA":
        return <Star className="h-4 w-4" />;
      case "PAGTO_PARCEIRO_DISPENSADO":
        return <Ban className="h-4 w-4" />;
      default:
        return <Wallet className="h-4 w-4" />;
    }
  };

  // KPIs - Estrutura complementar sem redundância
  const totalPagtoParceiros = movimentacoes
    .filter((m) => (m.tipo === "PAGTO_PARCEIRO" || m.tipo === "PAGTO_FORNECEDOR") && m.status === "CONFIRMADO")
    .reduce((acc, m) => acc + m.valor, 0);
  const totalComissoes = movimentacoes
    .filter((m) => m.tipo === "COMISSAO_INDICADOR" && m.status === "CONFIRMADO")
    .reduce((acc, m) => acc + m.valor, 0);
  const totalBonus = movimentacoes
    .filter((m) => m.tipo === "BONUS_INDICADOR" && m.status === "CONFIRMADO")
    .reduce((acc, m) => acc + m.valor, 0);
  const totalRenovacoesBonificacoes = movimentacoes
    .filter((m) => (m.tipo === "RENOVACAO_PARCERIA" || m.tipo === "BONIFICACAO_ESTRATEGICA") && m.status === "CONFIRMADO")
    .reduce((acc, m) => acc + m.valor, 0);
  const totalGeral = totalPagtoParceiros + totalComissoes + totalBonus + totalRenovacoesBonificacoes;
  const totalBonusCiclosPendentes = bonusPendentes.reduce((acc, b) => acc + b.ciclosPendentes, 0);
  const totalPendencias = totalBonusCiclosPendentes + comissoesPendentes.length + parceirosPendentes.length;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* KPIs */}
      <TooltipProvider>
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Pagto. Parceiros</CardTitle>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button className="text-muted-foreground hover:text-foreground transition-colors">
                    <HelpCircle className="h-4 w-4" />
                  </button>
                </TooltipTrigger>
                <TooltipContent className="max-w-xs">
                  <p>Pagamentos realizados aos parceiros e fornecedores como custo de captação de parcerias.</p>
                </TooltipContent>
              </Tooltip>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatCurrency(totalPagtoParceiros)}</div>
              <p className="text-xs text-muted-foreground">Custos de captação</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Comissões</CardTitle>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button className="text-muted-foreground hover:text-foreground transition-colors">
                    <HelpCircle className="h-4 w-4" />
                  </button>
                </TooltipTrigger>
                <TooltipContent className="max-w-xs">
                  <p>Valor total pago em comissões aos indicadores por cada parceiro indicado ativo.</p>
                </TooltipContent>
              </Tooltip>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatCurrency(totalComissoes)}</div>
              <p className="text-xs text-muted-foreground">Pagas a indicadores</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Bônus</CardTitle>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button className="text-muted-foreground hover:text-foreground transition-colors">
                    <HelpCircle className="h-4 w-4" />
                  </button>
                </TooltipTrigger>
                <TooltipContent className="max-w-xs">
                  <p>Total de bônus pagos por metas atingidas. Ex: 1 bônus a cada X parceiros indicados.</p>
                </TooltipContent>
              </Tooltip>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatCurrency(totalBonus)}</div>
              <p className="text-xs text-muted-foreground">Por metas atingidas</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Renov. / Bonif.</CardTitle>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button className="text-muted-foreground hover:text-foreground transition-colors">
                    <HelpCircle className="h-4 w-4" />
                  </button>
                </TooltipTrigger>
                <TooltipContent className="max-w-xs">
                  <p>Renovações de parceria e bonificações estratégicas pagas a parceiros. Integram o custo total por CPF.</p>
                </TooltipContent>
              </Tooltip>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatCurrency(totalRenovacoesBonificacoes)}</div>
              <p className="text-xs text-muted-foreground">Custo de retenção</p>
            </CardContent>
          </Card>

          <Card className="bg-primary/5 border-primary/20">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Geral</CardTitle>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button className="text-muted-foreground hover:text-foreground transition-colors">
                    <HelpCircle className="h-4 w-4" />
                  </button>
                </TooltipTrigger>
                <TooltipContent className="max-w-xs">
                  <p>Soma de todas as despesas do programa: Pagto. Parceiros + Comissões + Bônus + Renovações + Bonificações.</p>
                </TooltipContent>
              </Tooltip>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-primary">{formatCurrency(totalGeral)}</div>
              <p className="text-xs text-muted-foreground">Despesas do programa</p>
            </CardContent>
          </Card>

          <Card className={totalPendencias > 0 ? "border-warning/50" : ""}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Pendências</CardTitle>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button className="text-muted-foreground hover:text-foreground transition-colors">
                    <HelpCircle className="h-4 w-4" />
                  </button>
                </TooltipTrigger>
                <TooltipContent className="max-w-xs">
                  <p>Quantidade de pagamentos aguardando: bônus, comissões e pagamentos a parceiros ainda não realizados.</p>
                </TooltipContent>
              </Tooltip>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{totalPendencias}</div>
              <p className="text-xs text-muted-foreground">Pagamentos a realizar</p>
            </CardContent>
          </Card>
        </div>
      </TooltipProvider>

      {/* Pendências */}
      {(bonusPendentes.length > 0 || comissoesPendentes.length > 0 || parceirosPendentes.length > 0) && (
        <Card className="border-warning/30 bg-warning/5">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Clock className="h-5 w-5 text-warning" />
              Pagamentos Pendentes
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Pagamentos ao Parceiro Pendentes */}
            {parceirosPendentes.length > 0 && (
              <div className="space-y-2">
                <h4 className="text-sm font-medium text-muted-foreground">Pagamentos ao Parceiro (CPF)</h4>
                {parceirosPendentes.map((parceiro) => (
                  <div
                    key={parceiro.parceriaId}
                    className="flex items-center justify-between p-3 bg-background rounded-lg border"
                  >
                    <div className="flex items-center gap-3">
                      <div className="h-8 w-8 rounded-full bg-emerald-500/10 flex items-center justify-center">
                        <User className="h-4 w-4 text-emerald-500" />
                      </div>
                      <div>
                        <p className="font-medium text-sm">{parceiro.parceiroNome}</p>
                        <p className="text-xs text-muted-foreground">
                          {parceiro.origemTipo === "INDICADOR" ? "Via Indicador" : 
                           parceiro.origemTipo === "FORNECEDOR" ? "Via Fornecedor" : "Aquisição Direta"}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="font-bold text-emerald-500">
                        {formatCurrency(parceiro.valorParceiro)}
                      </span>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-muted-foreground hover:text-destructive"
                        onClick={() => {
                          setDispensaParceriaId(parceiro.parceriaId);
                          setDispensaParceiroNome(parceiro.parceiroNome);
                          setDispensaMotivo('');
                          setDispensaOpen(true);
                        }}
                      >
                        Dispensar
                      </Button>
                      <Button
                        size="sm"
                        variant="default"
                        onClick={() => {
                          setSelectedParceiro(parceiro);
                          setParceiroDialogOpen(true);
                        }}
                      >
                        Pagar
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Bônus Pendentes */}
            {bonusPendentes.length > 0 && (
              <div className="space-y-2">
                <h4 className="text-sm font-medium text-muted-foreground">Bônus por Meta Atingida</h4>
                {bonusPendentes.map((bonus) => (
                  <div
                    key={bonus.indicadorId}
                    className="flex items-center justify-between p-3 bg-background rounded-lg border"
                  >
                    <div className="flex items-center gap-3">
                      <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
                        <Gift className="h-4 w-4 text-primary" />
                      </div>
                      <div>
                        <p className="font-medium text-sm">{bonus.indicadorNome}</p>
                        <p className="text-xs text-muted-foreground">
                          Meta: {bonus.qtdParceiros}/{bonus.meta} parceiros 
                          {bonus.ciclosPendentes > 1 && (
                            <span className="text-primary font-medium ml-1">
                              ({bonus.ciclosPendentes} ciclos atingidos)
                            </span>
                          )}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="text-right">
                        {bonus.ciclosPendentes > 1 ? (
                          <>
                            <span className="font-bold text-primary">
                              {bonus.ciclosPendentes}x {formatCurrency(bonus.valorBonus)}
                            </span>
                            <p className="text-xs text-muted-foreground">
                              Total: {formatCurrency(bonus.totalBonusPendente)}
                            </p>
                          </>
                        ) : (
                          <span className="font-bold text-primary">
                            {formatCurrency(bonus.valorBonus)}
                          </span>
                        )}
                      </div>
                      <Button
                        size="sm"
                        onClick={() => {
                          setSelectedBonus(bonus);
                          setBonusDialogOpen(true);
                        }}
                      >
                        Pagar
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Comissões Pendentes */}
            {comissoesPendentes.length > 0 && (
              <div className="space-y-2">
                <h4 className="text-sm font-medium text-muted-foreground">Comissões por Indicação</h4>
                {comissoesPendentes.map((comissao) => (
                  <div
                    key={comissao.parceriaId}
                    className="flex items-center justify-between p-3 bg-background rounded-lg border"
                  >
                    <div className="flex items-center gap-3">
                      <div className="h-8 w-8 rounded-full bg-chart-2/10 flex items-center justify-center">
                        <Banknote className="h-4 w-4 text-chart-2" />
                      </div>
                      <div>
                        <p className="font-medium text-sm">{comissao.indicadorNome}</p>
                        <p className="text-xs text-muted-foreground">
                          Indicou: {comissao.parceiroNome}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="font-bold text-chart-2">
                        {formatCurrency(comissao.valorComissao)}
                      </span>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setSelectedComissao(comissao);
                          setComissaoDialogOpen(true);
                        }}
                      >
                        Pagar
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Histórico de Movimentações */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">Histórico de Movimentações</CardTitle>
          <Button
            size="sm"
            onClick={() => setCaptacaoDialogOpen(true)}
            className="gap-1.5"
          >
            <Plus className="h-4 w-4" />
            Renovação / Bonificação
          </Button>
        </CardHeader>
        <CardContent>
          {movimentacoes.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Wallet className="h-12 w-12 mx-auto mb-3 opacity-30" />
              <p>Nenhuma movimentação registrada</p>
            </div>
          ) : (
            <ScrollArea className="h-[400px]">
              <div className="space-y-2">
                {movimentacoes.map((mov) => (
                  <div
                    key={mov.id}
                    className="flex items-center justify-between p-3 bg-muted/30 rounded-lg"
                  >
                    <div className="flex items-center gap-3">
                      <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center">
                        {getTipoIcon(mov.tipo)}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="text-xs">
                            {getTipoLabel(mov.tipo)}
                          </Badge>
                          {mov.tipo === "PAGTO_PARCEIRO_DISPENSADO" ? (
                            <Ban className="h-3 w-3 text-muted-foreground" />
                          ) : mov.status === "CONFIRMADO" ? (
                            <CheckCircle2 className="h-3 w-3 text-success" />
                          ) : (
                            <Clock className="h-3 w-3 text-warning" />
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">
                          {mov.descricao || "Sem descrição"}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      {mov.tipo === "PAGTO_PARCEIRO_DISPENSADO" ? (
                        <p className="font-bold text-muted-foreground">
                          R$ 0,00
                        </p>
                      ) : (
                        <p className="font-bold text-destructive">
                          - {formatCurrency(mov.valor)}
                        </p>
                      )}
                      <p className="text-xs text-muted-foreground">
                        {format(parseLocalDate(mov.data_movimentacao), "dd/MM/yyyy", { locale: ptBR })}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          )}
        </CardContent>
      </Card>

      {/* Dialogs */}
      <PagamentoBonusDialog
        open={bonusDialogOpen}
        onOpenChange={setBonusDialogOpen}
        indicador={
          selectedBonus
            ? {
                id: selectedBonus.indicadorId,
                nome: selectedBonus.indicadorNome,
                valorBonus: selectedBonus.valorBonus,
                ciclosPendentes: selectedBonus.ciclosPendentes,
                totalBonusPendente: selectedBonus.totalBonusPendente,
              }
            : null
        }
        onSuccess={fetchData}
      />

      <PagamentoComissaoDialog
        open={comissaoDialogOpen}
        onOpenChange={setComissaoDialogOpen}
        parceria={
          selectedComissao
            ? {
                id: selectedComissao.parceriaId,
                parceiroNome: selectedComissao.parceiroNome,
                indicadorNome: selectedComissao.indicadorNome,
                indicadorId: selectedComissao.indicadorId,
                valorComissao: selectedComissao.valorComissao,
              }
            : null
        }
        onSuccess={fetchData}
      />

      <PagamentoParceiroDialog
        open={parceiroDialogOpen}
        onOpenChange={setParceiroDialogOpen}
        parceria={
          selectedParceiro
            ? {
                id: selectedParceiro.parceriaId,
                parceiroNome: selectedParceiro.parceiroNome,
                valorParceiro: selectedParceiro.valorParceiro,
              }
            : null
        }
        onSuccess={fetchData}
      />
      <PagamentoCaptacaoDialog
        open={captacaoDialogOpen}
        onOpenChange={setCaptacaoDialogOpen}
        onSuccess={fetchData}
        onRenovacao={handleRenovacao}
      />
      <ParceriaDialog
        open={editParceriaOpen}
        onOpenChange={setEditParceriaOpen}
        parceria={editParceriaData}
        isViewMode={false}
        pagamentoJaRealizado={true}
      />

      {/* Dispensar Dialog */}
      <AlertDialog open={dispensaOpen} onOpenChange={setDispensaOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Dispensar pagamento</AlertDialogTitle>
            <AlertDialogDescription>
              O pagamento a <strong>{dispensaParceiroNome}</strong> será dispensado (valor R$ 0,00). 
              Esta parceria não será contabilizada como indicação bem-sucedida. Um registro será mantido no histórico.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Textarea
            placeholder="Motivo da dispensa (obrigatório)..."
            value={dispensaMotivo}
            onChange={(e) => setDispensaMotivo(e.target.value)}
            className="min-h-[80px]"
          />
          <AlertDialogFooter>
            <AlertDialogCancel disabled={dispensaLoading}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDispensarPagamento}
              disabled={!dispensaMotivo.trim() || dispensaLoading}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {dispensaLoading ? "Dispensando..." : "Dispensar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
