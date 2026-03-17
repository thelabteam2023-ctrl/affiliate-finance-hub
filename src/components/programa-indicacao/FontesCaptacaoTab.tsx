import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { SearchInput } from "@/components/ui/search-input";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { ParceirosListModal } from "@/components/programa-indicacao/ParceirosListModal";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { IndicadorDialog } from "@/components/indicadores/IndicadorDialog";
import { FornecedorDialog } from "@/components/fornecedores/FornecedorDialog";
import { IndicadorCard } from "@/components/indicadores/IndicadorCard";
import {
  Users,
  UserPlus,
  Truck,
  LayoutGrid,
  List,
  DollarSign,
  TrendingUp,
  ArrowUpRight,
  ArrowDownRight,
  Minus,
  Target,
  ArrowRight,
  Info,
  Ban,
} from "lucide-react";
import { useActionAccess } from "@/hooks/useModuleAccess";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

type TipoFonte = "INDICADOR" | "FORNECEDOR";

interface ParceriaDetalhe {
  parceriaId: string;
  parceiroNome: string;
  valorContratado: number;
  valorPago: number;
  dispensado: boolean;
  dispensaMotivo?: string;
}

interface IndicacaoDetalhe {
  parceiroNome: string;
}

interface IndicadorPerformance {
  indicador_id: string;
  user_id: string;
  nome: string;
  cpf: string;
  status: string;
  telefone: string | null;
  email: string | null;
  total_parceiros_indicados: number;
  parcerias_ativas: number;
  parcerias_encerradas: number;
  total_comissoes: number;
  total_bonus: number;
  parceiros_indicados_nomes?: IndicacaoDetalhe[];
}

interface IndicadorAcordo {
  id: string;
  indicador_id: string;
  orcamento_por_parceiro: number;
  meta_parceiros: number | null;
  valor_bonus: number | null;
  ativo: boolean;
}

interface Fornecedor {
  id: string;
  user_id: string;
  nome: string;
  documento: string | null;
  tipo_documento: string;
  telefone: string | null;
  email: string | null;
  status: string;
  observacoes: string | null;
  total_parceiros?: number;
  total_contratado?: number;
  total_liquidado?: number;
  parcerias_detalhes?: ParceriaDetalhe[];
}

// Unified type for display
interface FonteCaptacao {
  id: string;
  tipo: TipoFonte;
  nome: string;
  documento: string;
  status: string;
  telefone: string | null;
  email: string | null;
  totalParceiros: number;
  totalPago: number;
  totalPendente: number;
  // Indicador-specific
  parcerias_ativas?: number;
  total_comissoes?: number;
  total_bonus?: number;
  // Fornecedor-specific
  parcerias_detalhes?: ParceriaDetalhe[];
  // Original data for dialogs
  originalData: IndicadorPerformance | Fornecedor;
}

export function FontesCaptacaoTab() {
  const { toast } = useToast();
  const [tipoFonte, setTipoFonte] = useState<TipoFonte>("INDICADOR");
  const [loading, setLoading] = useState(true);
  
  // Data
  const [indicadores, setIndicadores] = useState<IndicadorPerformance[]>([]);
  const [acordos, setAcordos] = useState<IndicadorAcordo[]>([]);
  const [fornecedores, setFornecedores] = useState<Fornecedor[]>([]);
  
  // UI state
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("todos");
  const [viewMode, setViewMode] = useState<"cards" | "list">("cards");
  
  // Dialogs
  const [indicadorDialogOpen, setIndicadorDialogOpen] = useState(false);
  const [fornecedorDialogOpen, setFornecedorDialogOpen] = useState(false);
  const [selectedIndicador, setSelectedIndicador] = useState<IndicadorPerformance | null>(null);
  const [selectedFornecedor, setSelectedFornecedor] = useState<Fornecedor | null>(null);
  const [isViewMode, setIsViewMode] = useState(false);
  
  // Delete
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [fonteToDelete, setFonteToDelete] = useState<FonteCaptacao | null>(null);

  // Dispensa fornecedor
  const [dispensaOpen, setDispensaOpen] = useState(false);
  const [dispensaMotivo, setDispensaMotivo] = useState("");
  const [dispensaParceriaId, setDispensaParceriaId] = useState<string | null>(null);
  const [dispensaParceiroNome, setDispensaParceiroNome] = useState("");
  const [dispensaFornecedorNome, setDispensaFornecedorNome] = useState("");
  const [dispensaLoading, setDispensaLoading] = useState(false);

  // Parceiros list modal
  const [parceirosModalOpen, setParceirosModalOpen] = useState(false);
  const [parceirosModalTitle, setParceirosModalTitle] = useState("");
  const [parceirosModalSubtitle, setParceirosModalSubtitle] = useState("");
  const [parceirosModalData, setParceirosModalData] = useState<{ nome: string; extra?: string; dispensado?: boolean }[]>([]);

  const openParceirosModal = (fonte: FonteCaptacao) => {
    if (fonte.tipo === "FORNECEDOR") {
      setParceirosModalTitle(`Parceiros de ${fonte.nome}`);
      setParceirosModalSubtitle(`${fonte.totalParceiros} parceiro${fonte.totalParceiros !== 1 ? "s" : ""} fornecido${fonte.totalParceiros !== 1 ? "s" : ""}`);
      setParceirosModalData(
        (fonte.parcerias_detalhes || []).map(d => ({
          nome: d.parceiroNome,
          extra: d.dispensado ? undefined : `${formatCurrencyFn(d.valorPago)} / ${formatCurrencyFn(d.valorContratado)}`,
          dispensado: d.dispensado,
        }))
      );
    } else {
      const ind = fonte.originalData as IndicadorPerformance;
      setParceirosModalTitle(`Parceiros indicados por ${fonte.nome}`);
      setParceirosModalSubtitle(`${fonte.totalParceiros} parceiro${fonte.totalParceiros !== 1 ? "s" : ""} indicado${fonte.totalParceiros !== 1 ? "s" : ""}`);
      setParceirosModalData(
        (ind.parceiros_indicados_nomes || []).map(d => ({ nome: d.parceiroNome }))
      );
    }
    setParceirosModalOpen(true);
  };

  const formatCurrencyFn = (value: number) => {
    return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
  };

  const { canCreate, canEdit, canDelete } = useActionAccess();

  useEffect(() => {
    fetchData();
  }, []);

  // Stats for direct acquisitions
  const [statsDireto, setStatsDireto] = useState({
    total: 0,
    investido: 0,
    lucroGerado: 0,
    roi: 0,
  });

  const fetchData = async () => {
    try {
      setLoading(true);
      
      const [indicadoresRes, acordosRes, fornecedoresRes, parceriasRes, custosDiretosRes, lucrosDiretosRes, pagamentosRes, indicacoesRes] = await Promise.all([
        supabase.from("v_indicador_performance").select("*"),
        supabase.from("indicador_acordos").select("*").eq("ativo", true),
        supabase.from("fornecedores").select("*").order("nome"),
        supabase.from("parcerias").select("id, fornecedor_id, valor_fornecedor, pagamento_dispensado, dispensa_motivo, parceiro:parceiros!parcerias_parceiro_id_fkey(nome)").eq("origem_tipo", "FORNECEDOR"),
        supabase.from("v_custos_aquisicao").select("parceiro_id, custo_total").eq("origem_tipo", "DIRETO"),
        supabase.from("v_parceiro_lucro_total").select("parceiro_id, lucro_projetos"),
        supabase.from("movimentacoes_indicacao").select("parceria_id, valor, tipo, status").eq("tipo", "PAGTO_FORNECEDOR").eq("status", "CONFIRMADO"),
        supabase.from("indicacoes").select("indicador_id, parceiro:parceiros!indicacoes_parceiro_id_fkey(nome)"),
      ]);

      if (indicadoresRes.error) throw indicadoresRes.error;

      // Build indicacoes map (indicador_id -> partner names)
      const indicacoesMap = new Map<string, IndicacaoDetalhe[]>();
      (indicacoesRes.data || []).forEach((ind: any) => {
        const list = indicacoesMap.get(ind.indicador_id) || [];
        list.push({ parceiroNome: ind.parceiro?.nome || "N/A" });
        indicacoesMap.set(ind.indicador_id, list);
      });

      setIndicadores((indicadoresRes.data || []).map((i: any) => ({
        ...i,
        parceiros_indicados_nomes: indicacoesMap.get(i.indicador_id) || [],
      })));
      setAcordos(acordosRes.data || []);

      // Build payment sum per parceria
      const pagamentosPorParceria = new Map<string, number>();
      (pagamentosRes.data || []).forEach((m: any) => {
        const atual = pagamentosPorParceria.get(m.parceria_id) || 0;
        pagamentosPorParceria.set(m.parceria_id, atual + (m.valor || 0));
      });

      // Calculate fornecedor stats
      const fornecedoresWithStats = (fornecedoresRes.data || []).map((f) => {
        const parceriasFornecedor = (parceriasRes.data || []).filter((p: any) => p.fornecedor_id === f.id);
        let totalLiquidado = 0;
      const detalhes: ParceriaDetalhe[] = parceriasFornecedor.map((p: any) => {
          const valorPago = pagamentosPorParceria.get(p.id) || 0;
          const isDispensado = p.pagamento_dispensado === true;
          if (!isDispensado) {
            totalLiquidado += valorPago;
          }
          return {
            parceriaId: p.id,
            parceiroNome: p.parceiro?.nome || "N/A",
            valorContratado: p.valor_fornecedor || 0,
            valorPago,
            dispensado: isDispensado,
            dispensaMotivo: p.dispensa_motivo || undefined,
          };
        });
        return {
          ...f,
          total_parceiros: parceriasFornecedor.length,
          total_contratado: parceriasFornecedor.filter((p: any) => !p.pagamento_dispensado).reduce((acc: number, p: any) => acc + (p.valor_fornecedor || 0), 0),
          total_liquidado: totalLiquidado,
          parcerias_detalhes: detalhes,
        };
      });
      setFornecedores(fornecedoresWithStats);

      // Calculate direct acquisition stats
      const custosDiretos = custosDiretosRes.data || [];
      const lucrosMap = new Map((lucrosDiretosRes.data || []).map(l => [l.parceiro_id, l.lucro_projetos || 0]));
      
      const parceirosDiretos = new Set(custosDiretos.map(c => c.parceiro_id));
      const totalDireto = parceirosDiretos.size;
      const investidoDireto = custosDiretos.reduce((acc, p) => acc + (p.custo_total || 0), 0);
      const lucroGeradoDireto = Array.from(parceirosDiretos).reduce((acc, pid) => acc + (lucrosMap.get(pid) || 0), 0);
      const roiDireto = investidoDireto > 0 ? ((lucroGeradoDireto - investidoDireto) / investidoDireto) * 100 : 0;

      setStatsDireto({
        total: totalDireto,
        investido: investidoDireto,
        lucroGerado: lucroGeradoDireto,
        roi: roiDireto,
      });
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

  // Transform to unified FonteCaptacao
  const fontesCaptacao = useMemo((): FonteCaptacao[] => {
    if (tipoFonte === "INDICADOR") {
      return indicadores.map((ind) => ({
        id: ind.indicador_id,
        tipo: "INDICADOR" as TipoFonte,
        nome: ind.nome,
        documento: ind.cpf,
        status: ind.status,
        telefone: ind.telefone,
        email: ind.email,
        totalParceiros: ind.total_parceiros_indicados,
        totalPago: ind.total_comissoes + ind.total_bonus,
        totalPendente: 0,
        parcerias_ativas: ind.parcerias_ativas,
        total_comissoes: ind.total_comissoes,
        total_bonus: ind.total_bonus,
        originalData: ind,
      }));
    } else {
      return fornecedores.map((f) => ({
        id: f.id,
        tipo: "FORNECEDOR" as TipoFonte,
        nome: f.nome,
        documento: f.documento || "",
        status: f.status,
        telefone: f.telefone,
        email: f.email,
        totalParceiros: f.total_parceiros || 0,
        totalPago: f.total_liquidado || 0,
        totalPendente: Math.max(0, (f.total_contratado || 0) - (f.total_liquidado || 0)),
        parcerias_detalhes: f.parcerias_detalhes,
        originalData: f,
      }));
    }
  }, [tipoFonte, indicadores, fornecedores]);

  // Filtered list
  const filteredFontes = fontesCaptacao.filter((f) => {
    const matchesSearch =
      f.nome.toLowerCase().includes(searchTerm.toLowerCase()) ||
      f.documento.includes(searchTerm);
    const matchesStatus = statusFilter === "todos" || f.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  // Comparative stats
  const statsIndicadores = {
    total: indicadores.length,
    ativos: indicadores.filter((i) => i.status === "ATIVO").length,
    parceiros: indicadores.reduce((acc, i) => acc + i.total_parceiros_indicados, 0),
    pago: indicadores.reduce((acc, i) => acc + i.total_comissoes + i.total_bonus, 0),
  };

  const statsFornecedores = {
    total: fornecedores.length,
    ativos: fornecedores.filter((f) => f.status === "ATIVO").length,
    parceiros: fornecedores.reduce((acc, f) => acc + (f.total_parceiros || 0), 0),
    contratado: fornecedores.reduce((acc, f) => acc + (f.total_contratado || 0), 0),
    liquidado: fornecedores.reduce((acc, f) => acc + (f.total_liquidado || 0), 0),
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(value);
  };

  const getStatusBadge = (status: string) => {
    const config: Record<string, { label: string; variant: "default" | "destructive" | "outline" }> = {
      ATIVO: { label: "Ativo", variant: "default" },
      INATIVO: { label: "Inativo", variant: "destructive" },
    };
    const c = config[status] || { label: status, variant: "outline" };
    return <Badge variant={c.variant}>{c.label}</Badge>;
  };

  const getAcordo = (indicadorId: string) => acordos.find((a) => a.indicador_id === indicadorId);

  // Handlers
  const handleAdd = () => {
    if (tipoFonte === "INDICADOR") {
      setSelectedIndicador(null);
      setIsViewMode(false);
      setIndicadorDialogOpen(true);
    } else {
      setSelectedFornecedor(null);
      setIsViewMode(false);
      setFornecedorDialogOpen(true);
    }
  };

  const handleView = (fonte: FonteCaptacao) => {
    setIsViewMode(true);
    if (fonte.tipo === "INDICADOR") {
      setSelectedIndicador(fonte.originalData as IndicadorPerformance);
      setIndicadorDialogOpen(true);
    } else {
      setSelectedFornecedor(fonte.originalData as Fornecedor);
      setFornecedorDialogOpen(true);
    }
  };

  const handleEdit = (fonte: FonteCaptacao) => {
    setIsViewMode(false);
    if (fonte.tipo === "INDICADOR") {
      setSelectedIndicador(fonte.originalData as IndicadorPerformance);
      setIndicadorDialogOpen(true);
    } else {
      setSelectedFornecedor(fonte.originalData as Fornecedor);
      setFornecedorDialogOpen(true);
    }
  };

  const handleDeleteClick = (fonte: FonteCaptacao) => {
    setFonteToDelete(fonte);
    setDeleteDialogOpen(true);
  };

  const handleDelete = async () => {
    if (!fonteToDelete) return;

    try {
      const table = fonteToDelete.tipo === "INDICADOR" ? "indicadores_referral" : "fornecedores";
      const { error } = await supabase.from(table).delete().eq("id", fonteToDelete.id);

      if (error) throw error;

      toast({
        title: `${fonteToDelete.tipo === "INDICADOR" ? "Indicador" : "Fornecedor"} excluído`,
        description: "Registro removido com sucesso.",
      });
      fetchData();
    } catch (error: any) {
      toast({
        title: "Erro ao excluir",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setDeleteDialogOpen(false);
      setFonteToDelete(null);
    }
  };

  const handleDialogClose = () => {
    setIndicadorDialogOpen(false);
    setFornecedorDialogOpen(false);
    setSelectedIndicador(null);
    setSelectedFornecedor(null);
    setIsViewMode(false);
    fetchData();
  };

  const handleDispensaClick = (parceriaId: string, parceiroNome: string, fornecedorNome: string) => {
    setDispensaParceriaId(parceriaId);
    setDispensaParceiroNome(parceiroNome);
    setDispensaFornecedorNome(fornecedorNome);
    setDispensaMotivo("");
    setDispensaOpen(true);
  };

  const handleDispensa = async () => {
    if (!dispensaParceriaId || !dispensaMotivo.trim()) return;
    setDispensaLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Usuário não autenticado");

      // Get parceria details
      const { data: parceria, error: parceriaErr } = await supabase
        .from("parcerias")
        .select("workspace_id, parceiro_id, fornecedor_id")
        .eq("id", dispensaParceriaId)
        .single();
      if (parceriaErr || !parceria) throw parceriaErr || new Error("Parceria não encontrada");

      // Mark as dispensed
      const { error: updateErr } = await supabase
        .from("parcerias")
        .update({
          pagamento_dispensado: true,
          dispensa_motivo: dispensaMotivo.trim(),
          dispensa_at: new Date().toISOString(),
        })
        .eq("id", dispensaParceriaId);
      if (updateErr) throw updateErr;

      // Register audit movement
      await supabase.from("movimentacoes_indicacao").insert({
        user_id: user.id,
        workspace_id: parceria.workspace_id,
        tipo: "PAGTO_FORNECEDOR_DISPENSADO",
        valor: 0,
        moeda: "BRL",
        status: "CONFIRMADO",
        parceria_id: dispensaParceriaId,
        parceiro_id: parceria.parceiro_id,
        descricao: `Pagamento dispensado: ${dispensaMotivo.trim()}`,
        data_movimentacao: new Date().toISOString().split("T")[0],
      });

      toast({
        title: "Pagamento dispensado",
        description: `Pagamento de ${dispensaParceiroNome} (fornecedor: ${dispensaFornecedorNome}) foi dispensado.`,
      });
      setDispensaOpen(false);
      fetchData();
    } catch (error: any) {
      toast({
        title: "Erro ao dispensar pagamento",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setDispensaLoading(false);
    }
  };

  // Permission checks
  const canAdd = tipoFonte === "INDICADOR" 
    ? canCreate('captacao', 'captacao.indicadores.create')
    : canCreate('captacao', 'captacao.fornecedores.create');

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Comparative Overview Card */}
      <Card className="bg-gradient-to-br from-muted/30 to-muted/10 border-dashed">
        <CardContent className="pt-6">
          <div className="grid grid-cols-3 gap-6">
            {/* Indicadores Summary */}
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <div className="h-8 w-8 rounded-full bg-emerald-500/10 flex items-center justify-center">
                  <UserPlus className="h-4 w-4 text-emerald-500" />
                </div>
                <div>
                  <p className="text-sm font-medium">Indicadores</p>
                  <p className="text-xs text-muted-foreground">{statsIndicadores.ativos} ativos de {statsIndicadores.total}</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-muted-foreground text-xs">Parceiros</p>
                  <p className="font-semibold">{statsIndicadores.parceiros}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs">Investido</p>
                  <p className="font-semibold text-emerald-500">{formatCurrency(statsIndicadores.pago)}</p>
                </div>
              </div>
            </div>

            {/* Fornecedores Summary */}
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <div className="h-8 w-8 rounded-full bg-blue-500/10 flex items-center justify-center">
                  <Truck className="h-4 w-4 text-blue-500" />
                </div>
                <div>
                  <p className="text-sm font-medium">Fornecedores</p>
                  <p className="text-xs text-muted-foreground">{statsFornecedores.ativos} ativos de {statsFornecedores.total}</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-muted-foreground text-xs">Parceiros</p>
                  <p className="font-semibold">{statsFornecedores.parceiros}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs">Contratado</p>
                  <p className="font-semibold text-blue-500">{formatCurrency(statsFornecedores.contratado)}</p>
                </div>
              </div>
            </div>

            {/* Direto Summary */}
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <div className="h-8 w-8 rounded-full bg-amber-500/10 flex items-center justify-center">
                  <ArrowRight className="h-4 w-4 text-amber-500" />
                </div>
                <div>
                  <p className="text-sm font-medium">Direto</p>
                  <p className="text-xs text-muted-foreground">{statsDireto.total} parceiros</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-muted-foreground text-xs">Investido</p>
                  <p className="font-semibold text-amber-500">{formatCurrency(statsDireto.investido)}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs">ROI</p>
                  <p className={`font-semibold ${statsDireto.roi >= 0 ? 'text-emerald-500' : 'text-destructive'}`}>
                    {statsDireto.roi >= 0 ? '+' : ''}{statsDireto.roi.toFixed(1)}%
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Comparison bar */}
          <div className="mt-4 pt-4 border-t border-dashed">
            <div className="flex items-center justify-between text-xs text-muted-foreground mb-2">
              <span>Distribuição de Parceiros</span>
              <span>
                {statsIndicadores.parceiros + statsFornecedores.parceiros + statsDireto.total} total
              </span>
            </div>
            {(() => {
              const totalParceiros = statsIndicadores.parceiros + statsFornecedores.parceiros + statsDireto.total;
              const pctIndicadores = totalParceiros > 0 ? (statsIndicadores.parceiros / totalParceiros) * 100 : 0;
              const pctFornecedores = totalParceiros > 0 ? (statsFornecedores.parceiros / totalParceiros) * 100 : 0;
              const pctDireto = totalParceiros > 0 ? (statsDireto.total / totalParceiros) * 100 : 0;
              return (
                <>
                  <div className="h-2 rounded-full bg-muted overflow-hidden flex">
                    {totalParceiros > 0 && (
                      <>
                        <div 
                          className="h-full bg-emerald-500 transition-all"
                          style={{ width: `${pctIndicadores}%` }}
                        />
                        <div 
                          className="h-full bg-blue-500 transition-all"
                          style={{ width: `${pctFornecedores}%` }}
                        />
                        <div 
                          className="h-full bg-amber-500 transition-all"
                          style={{ width: `${pctDireto}%` }}
                        />
                      </>
                    )}
                  </div>
                  <div className="flex justify-between mt-1 text-xs">
                    <span className="text-emerald-500">
                      {pctIndicadores.toFixed(0)}% Indicadores
                    </span>
                    <span className="text-blue-500">
                      {pctFornecedores.toFixed(0)}% Fornecedores
                    </span>
                    <span className="text-amber-500">
                      {pctDireto.toFixed(0)}% Direto
                    </span>
                  </div>
                </>
              );
            })()}
          </div>
        </CardContent>
      </Card>

      {/* Type Selector */}
      <Tabs value={tipoFonte} onValueChange={(v) => setTipoFonte(v as TipoFonte)} className="w-full">
        <TabsList className="grid w-full max-w-md grid-cols-2">
          <TabsTrigger value="INDICADOR" className="gap-2">
            <UserPlus className="h-4 w-4" />
            Indicadores
            <Badge variant="secondary" className="ml-1 h-5 px-1.5">
              {statsIndicadores.total}
            </Badge>
          </TabsTrigger>
          <TabsTrigger value="FORNECEDOR" className="gap-2">
            <Truck className="h-4 w-4" />
            Fornecedores
            <Badge variant="secondary" className="ml-1 h-5 px-1.5">
              {statsFornecedores.total}
            </Badge>
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {/* KPIs for current type */}
      <div className={`grid grid-cols-2 ${tipoFonte === "FORNECEDOR" ? "md:grid-cols-5" : "md:grid-cols-4"} gap-4`}>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total</CardTitle>
            {tipoFonte === "INDICADOR" ? (
              <UserPlus className="h-4 w-4 text-muted-foreground" />
            ) : (
              <Truck className="h-4 w-4 text-muted-foreground" />
            )}
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {tipoFonte === "INDICADOR" ? statsIndicadores.total : statsFornecedores.total}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Ativos</CardTitle>
            {tipoFonte === "INDICADOR" ? (
              <UserPlus className="h-4 w-4 text-emerald-500" />
            ) : (
              <Truck className="h-4 w-4 text-emerald-500" />
            )}
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-emerald-500">
              {tipoFonte === "INDICADOR" ? statsIndicadores.ativos : statsFornecedores.ativos}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Parceiros {tipoFonte === "INDICADOR" ? "Indicados" : "Comprados"}
            </CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {tipoFonte === "INDICADOR" ? statsIndicadores.parceiros : statsFornecedores.parceiros}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{tipoFonte === "INDICADOR" ? "Total Pago" : "Total Pago"}</CardTitle>
            <DollarSign className="h-4 w-4 text-emerald-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-emerald-500">
              {formatCurrency(tipoFonte === "INDICADOR" ? statsIndicadores.pago : statsFornecedores.liquidado)}
            </div>
          </CardContent>
        </Card>
        {tipoFonte === "FORNECEDOR" && (
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Pendente</CardTitle>
              <DollarSign className="h-4 w-4 text-orange-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-orange-500">
                {formatCurrency(statsFornecedores.contratado - statsFornecedores.liquidado)}
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Toolbar */}
      <div className="flex flex-col md:flex-row gap-4 items-center">
        <div className="flex-1 w-full md:max-w-sm">
          <SearchInput
            placeholder={`Buscar ${tipoFonte === "INDICADOR" ? "indicador" : "fornecedor"}...`}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            onAdd={canAdd ? handleAdd : undefined}
            addButtonLabel={tipoFonte === "INDICADOR" ? "Novo Indicador" : "Novo Fornecedor"}
          />
        </div>

        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Filtrar por status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos os status</SelectItem>
            <SelectItem value="ATIVO">Ativo</SelectItem>
            <SelectItem value="INATIVO">Inativo</SelectItem>
          </SelectContent>
        </Select>

        <div className="flex gap-1">
          <Button
            variant={viewMode === "cards" ? "default" : "outline"}
            size="icon"
            onClick={() => setViewMode("cards")}
          >
            <LayoutGrid className="h-4 w-4" />
          </Button>
          <Button
            variant={viewMode === "list" ? "default" : "outline"}
            size="icon"
            onClick={() => setViewMode("list")}
          >
            <List className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Content */}
      {filteredFontes.length === 0 ? (
        <Card className="p-12 text-center">
          {tipoFonte === "INDICADOR" ? (
            <UserPlus className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
          ) : (
            <Truck className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
          )}
          <h3 className="text-lg font-semibold mb-2">
            Nenhum {tipoFonte === "INDICADOR" ? "indicador" : "fornecedor"} encontrado
          </h3>
          <p className="text-muted-foreground mb-4">
            {searchTerm || statusFilter !== "todos"
              ? "Tente ajustar os filtros de busca"
              : `Comece cadastrando ${tipoFonte === "INDICADOR" ? "seu primeiro indicador" : "seu primeiro fornecedor"}`}
          </p>
          {canAdd && (
            <Button onClick={handleAdd}>
              {tipoFonte === "INDICADOR" ? (
                <>
                  <UserPlus className="h-4 w-4 mr-2" />
                  Novo Indicador
                </>
              ) : (
                <>
                  <Truck className="h-4 w-4 mr-2" />
                  Novo Fornecedor
                </>
              )}
            </Button>
          )}
        </Card>
      ) : viewMode === "cards" ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredFontes.map((fonte) => {
            if (fonte.tipo === "INDICADOR") {
              const acordo = getAcordo(fonte.id);
              return (
                <IndicadorCard
                  key={fonte.id}
                  indicador={fonte.originalData as IndicadorPerformance}
                  onView={() => handleView(fonte)}
                  onEdit={() => handleEdit(fonte)}
                  onDelete={() => handleDeleteClick(fonte)}
                  formatCurrency={formatCurrency}
                  getStatusBadge={getStatusBadge}
                />
              );
            } else {
              const fornecedor = fonte.originalData as Fornecedor;
              return (
                <Card
                  key={fonte.id}
                  className="cursor-pointer hover:border-primary/50 transition-colors"
                  onClick={() => handleView(fonte)}
                >
                  <CardContent className="pt-6">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-full bg-blue-500/10 flex items-center justify-center">
                          <Truck className="h-5 w-5 text-blue-500" />
                        </div>
                        <div>
                          <h3 className="font-semibold">{fonte.nome}</h3>
                          <p className="text-sm text-muted-foreground">
                            {fornecedor.tipo_documento}: {fonte.documento || "N/A"}
                          </p>
                        </div>
                      </div>
                      {getStatusBadge(fonte.status)}
                    </div>

                    <div className="mt-4 grid grid-cols-3 gap-4">
                      <div onClick={(e) => e.stopPropagation()}>
                        <Popover>
                          <PopoverTrigger asChild>
                            <div className="cursor-pointer hover:bg-muted/50 rounded-md p-1 -m-1 transition-colors">
                              <p className="text-sm text-muted-foreground flex items-center gap-1">
                                Parceiros <Users className="h-3 w-3" />
                              </p>
                              <p className="font-semibold">{fonte.totalParceiros}</p>
                            </div>
                          </PopoverTrigger>
                          <PopoverContent side="bottom" align="start" className="w-64 p-3">
                            <p className="font-semibold text-sm mb-2">Parceiros deste fornecedor</p>
                            {(fonte.parcerias_detalhes || []).length === 0 ? (
                              <p className="text-sm text-muted-foreground">Nenhum parceiro vinculado</p>
                            ) : (
                              <div className="space-y-1.5 max-h-48 overflow-y-auto">
                                {(fonte.parcerias_detalhes || []).map((d, i) => (
                                  <div key={d.parceriaId} className="flex items-center gap-2 text-sm">
                                    <span className="text-muted-foreground">{i + 1}.</span>
                                    <span className="truncate">{d.parceiroNome}</span>
                                  </div>
                                ))}
                              </div>
                            )}
                          </PopoverContent>
                        </Popover>
                      </div>
                      <div>
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <p className="text-sm text-muted-foreground flex items-center gap-1 cursor-help">
                                Total Pago <Info className="h-3 w-3" />
                              </p>
                            </TooltipTrigger>
                            <TooltipContent side="top" className="max-w-sm">
                              <div className="space-y-1.5 text-xs">
                                <p className="font-semibold mb-1">Histórico de Fornecimento</p>
                                {(fonte.parcerias_detalhes || []).length === 0 ? (
                                  <p className="text-muted-foreground">Nenhuma parceria vinculada</p>
                                ) : (
                                  (fonte.parcerias_detalhes || []).map((d) => (
                                    <div key={d.parceriaId} className="flex items-center justify-between gap-3">
                                      <span className="truncate">{d.parceiroNome}</span>
                                      {d.dispensado ? (
                                        <Badge variant="outline" className="text-[10px] h-5 shrink-0">
                                          <Ban className="h-3 w-3 mr-1" />
                                          Dispensado
                                        </Badge>
                                      ) : (
                                        <span className="shrink-0">
                                          {formatCurrency(d.valorPago)} / {formatCurrency(d.valorContratado)}
                                        </span>
                                      )}
                                    </div>
                                  ))
                                )}
                              </div>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                        <p className="font-semibold text-emerald-500">{formatCurrency(fonte.totalPago)}</p>
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">Pendente</p>
                        <p className="font-semibold text-orange-500">{formatCurrency(fonte.totalPendente)}</p>
                      </div>
                    </div>

                    <div className="mt-4 flex gap-2" onClick={(e) => e.stopPropagation()}>
                      <Button variant="outline" size="sm" className="flex-1" onClick={() => handleEdit(fonte)}>
                        Editar
                      </Button>
                      {(fonte.parcerias_detalhes || []).some(d => !d.dispensado && d.valorPago < d.valorContratado) && (
                        <Select
                          onValueChange={(parceriaId) => {
                            const detalhe = (fonte.parcerias_detalhes || []).find(d => d.parceriaId === parceriaId);
                            if (detalhe) {
                              handleDispensaClick(parceriaId, detalhe.parceiroNome, fonte.nome);
                            }
                          }}
                        >
                          <SelectTrigger className="flex-1 h-8 text-sm">
                            <Ban className="h-3 w-3 mr-1" />
                            <span>Dispensar Pgto</span>
                          </SelectTrigger>
                          <SelectContent>
                            {(fonte.parcerias_detalhes || [])
                              .filter(d => !d.dispensado && d.valorPago < d.valorContratado)
                              .map(d => (
                                <SelectItem key={d.parceriaId} value={d.parceriaId}>
                                  {d.parceiroNome} — {formatCurrency(d.valorContratado)}
                                </SelectItem>
                              ))
                            }
                          </SelectContent>
                        </Select>
                      )}
                      <Button variant="outline" size="sm" className="flex-1" onClick={() => handleDeleteClick(fonte)}>
                        Excluir
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            }
          })}
        </div>
      ) : (
        <div className="space-y-2">
          {filteredFontes.map((fonte) => (
            <Card key={fonte.id} className="p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className={`h-10 w-10 rounded-full flex items-center justify-center ${
                    fonte.tipo === "INDICADOR" ? "bg-emerald-500/10" : "bg-blue-500/10"
                  }`}>
                    {fonte.tipo === "INDICADOR" ? (
                      <UserPlus className="h-5 w-5 text-emerald-500" />
                    ) : (
                      <Truck className="h-5 w-5 text-blue-500" />
                    )}
                  </div>
                  <div>
                    <div className="font-semibold">{fonte.nome}</div>
                    <Popover>
                      <PopoverTrigger asChild>
                        <div className="text-sm text-muted-foreground cursor-pointer hover:text-foreground transition-colors inline-flex items-center gap-1">
                          {fonte.totalParceiros} parceiros <Users className="h-3 w-3" />
                        </div>
                      </PopoverTrigger>
                      <PopoverContent side="bottom" align="start" className="w-64 p-3">
                        <p className="font-semibold text-sm mb-2">
                          Parceiros {fonte.tipo === "INDICADOR" ? "indicados" : "deste fornecedor"}
                        </p>
                        {(() => {
                          const nomes = fonte.tipo === "FORNECEDOR"
                            ? (fonte.parcerias_detalhes || []).map(d => d.parceiroNome)
                            : ((fonte.originalData as IndicadorPerformance).parceiros_indicados_nomes || []).map(d => d.parceiroNome);
                          return nomes.length === 0 ? (
                            <p className="text-sm text-muted-foreground">Nenhum parceiro vinculado</p>
                          ) : (
                            <div className="space-y-1.5 max-h-48 overflow-y-auto">
                              {nomes.map((nome, i) => (
                                <div key={i} className="flex items-center gap-2 text-sm">
                                  <span className="text-muted-foreground">{i + 1}.</span>
                                  <span className="truncate">{nome}</span>
                                </div>
                              ))}
                            </div>
                          );
                        })()}
                      </PopoverContent>
                    </Popover>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <div className="text-right">
                    <div className="font-semibold text-emerald-500">
                      {formatCurrency(fonte.totalPago)}
                    </div>
                    <div className="text-sm text-muted-foreground">Total pago</div>
                    {fonte.tipo === "FORNECEDOR" && fonte.totalPendente > 0 && (
                      <div className="text-xs text-orange-500">{formatCurrency(fonte.totalPendente)} pendente</div>
                    )}
                  </div>
                  {getStatusBadge(fonte.status)}
                  <div className="flex gap-1">
                    <Button variant="ghost" size="sm" onClick={() => handleView(fonte)}>
                      Ver
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => handleEdit(fonte)}>
                      Editar
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => handleDeleteClick(fonte)}>
                      Excluir
                    </Button>
                  </div>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Dialogs */}
      <IndicadorDialog
        open={indicadorDialogOpen}
        onOpenChange={handleDialogClose}
        indicador={selectedIndicador}
        isViewMode={isViewMode}
      />

      <FornecedorDialog
        open={fornecedorDialogOpen}
        onOpenChange={handleDialogClose}
        fornecedor={selectedFornecedor}
        isViewMode={isViewMode}
      />

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar exclusão</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir "{fonteToDelete?.nome}"?
              Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground">
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Dispensa Dialog */}
      <AlertDialog open={dispensaOpen} onOpenChange={setDispensaOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Dispensar pagamento ao fornecedor</AlertDialogTitle>
            <AlertDialogDescription>
              O pagamento de <strong>{dispensaParceiroNome}</strong> (fornecedor: <strong>{dispensaFornecedorNome}</strong>) será dispensado. Esta parceria não será contabilizada como pendência financeira.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-3 py-2">
            <Label htmlFor="dispensa-motivo">Motivo da dispensa *</Label>
            <Textarea
              id="dispensa-motivo"
              placeholder="Ex: Parceria não foi efetivada, desistência do parceiro..."
              value={dispensaMotivo}
              onChange={(e) => setDispensaMotivo(e.target.value)}
              rows={3}
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={dispensaLoading}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDispensa}
              disabled={!dispensaMotivo.trim() || dispensaLoading}
              className="bg-destructive text-destructive-foreground"
            >
              <Ban className="h-4 w-4 mr-2" />
              {dispensaLoading ? "Processando..." : "Dispensar Pagamento"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
