import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
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
} from "lucide-react";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { PagamentoBonusDialog } from "./PagamentoBonusDialog";
import { PagamentoComissaoDialog } from "./PagamentoComissaoDialog";
import { PagamentoParceiroDialog } from "./PagamentoParceiroDialog";

interface Movimentacao {
  id: string;
  tipo: string;
  valor: number;
  moeda: string;
  data_movimentacao: string;
  descricao: string | null;
  status: string;
  indicador_id: string | null;
  parceria_id: string;
}

interface BonusPendente {
  indicadorId: string;
  indicadorNome: string;
  valorBonus: number;
  qtdParceiros: number;
  meta: number;
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
  const [selectedBonus, setSelectedBonus] = useState<BonusPendente | null>(null);
  const [selectedComissao, setSelectedComissao] = useState<ComissaoPendente | null>(null);
  const [selectedParceiro, setSelectedParceiro] = useState<ParceiroPendente | null>(null);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);

      // Fetch all data in parallel
      const [movResult, custosResult, acordosResult, parceriasResult, parceirosResult] = await Promise.all([
        supabase
          .from("movimentacoes_indicacao")
          .select("*")
          .order("data_movimentacao", { ascending: false }),
        supabase.from("v_custos_aquisicao").select("*"),
        supabase.from("indicador_acordos").select("*").eq("ativo", true),
        supabase
          .from("parcerias")
          .select(`
            id,
            valor_comissao_indicador,
            comissao_paga,
            parceiro:parceiros(nome),
            indicacao:indicacoes(
              indicador:indicadores_referral(id, nome)
            )
          `)
          .eq("comissao_paga", false)
          .not("valor_comissao_indicador", "is", null)
          .gt("valor_comissao_indicador", 0),
        // Fetch parcerias with valor_parceiro that haven't been paid (exclude exempt)
        supabase
          .from("parcerias")
          .select(`
            id,
            valor_parceiro,
            origem_tipo,
            status,
            custo_aquisicao_isento,
            parceiro:parceiros(nome)
          `)
          .in("status", ["ATIVA", "EM_ENCERRAMENTO"])
          .or("custo_aquisicao_isento.is.null,custo_aquisicao_isento.eq.false")
          .gt("valor_parceiro", 0),
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

        // Check which have met their goals and haven't been paid
        const bonusPagos = (movResult.data || [])
          .filter((m) => m.tipo === "BONUS_INDICADOR")
          .map((m) => m.indicador_id);

        const pendentes: BonusPendente[] = [];
        acordosResult.data.forEach((acordo: any) => {
          const stats = indicadorStats[acordo.indicador_id];
          if (
            stats &&
            acordo.meta_parceiros &&
            stats.qtd >= acordo.meta_parceiros &&
            !bonusPagos.includes(acordo.indicador_id)
          ) {
            pendentes.push({
              indicadorId: acordo.indicador_id,
              indicadorNome: stats.nome,
              valorBonus: acordo.valor_bonus || 0,
              qtdParceiros: stats.qtd,
              meta: acordo.meta_parceiros,
            });
          }
        });
        setBonusPendentes(pendentes);
      }

      // Calculate comissões pendentes
      if (parceriasResult.data) {
        const comissoes: ComissaoPendente[] = parceriasResult.data
          .filter((p: any) => p.indicacao?.indicador)
          .map((p: any) => ({
            parceriaId: p.id,
            parceiroNome: p.parceiro?.nome || "N/A",
            indicadorId: p.indicacao.indicador.id,
            indicadorNome: p.indicacao.indicador.nome,
            valorComissao: p.valor_comissao_indicador || 0,
          }));
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
    };
    return labels[tipo] || tipo;
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
      default:
        return <Wallet className="h-4 w-4" />;
    }
  };

  // KPIs
  const totalPago = movimentacoes
    .filter((m) => m.status === "CONFIRMADO")
    .reduce((acc, m) => acc + m.valor, 0);
  const totalComissoes = movimentacoes
    .filter((m) => m.tipo === "COMISSAO_INDICADOR" && m.status === "CONFIRMADO")
    .reduce((acc, m) => acc + m.valor, 0);
  const totalBonus = movimentacoes
    .filter((m) => m.tipo === "BONUS_INDICADOR" && m.status === "CONFIRMADO")
    .reduce((acc, m) => acc + m.valor, 0);
  const totalPendencias = bonusPendentes.length + comissoesPendentes.length + parceirosPendentes.length;

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
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Pago</CardTitle>
            <Wallet className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(totalPago)}</div>
            <p className="text-xs text-muted-foreground">Em despesas do programa</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Comissões</CardTitle>
            <Banknote className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(totalComissoes)}</div>
            <p className="text-xs text-muted-foreground">Pagas a indicadores</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Bônus</CardTitle>
            <Gift className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(totalBonus)}</div>
            <p className="text-xs text-muted-foreground">Por metas atingidas</p>
          </CardContent>
        </Card>

        <Card className={totalPendencias > 0 ? "border-warning/50" : ""}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pendências</CardTitle>
            {totalPendencias > 0 ? (
              <AlertCircle className="h-4 w-4 text-warning" />
            ) : (
              <CheckCircle2 className="h-4 w-4 text-success" />
            )}
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalPendencias}</div>
            <p className="text-xs text-muted-foreground">Pagamentos a realizar</p>
          </CardContent>
        </Card>
      </div>

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
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="font-bold text-primary">
                        {formatCurrency(bonus.valorBonus)}
                      </span>
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
        <CardHeader>
          <CardTitle className="text-base">Histórico de Movimentações</CardTitle>
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
                          {mov.status === "CONFIRMADO" ? (
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
                      <p className="font-bold text-destructive">
                        - {formatCurrency(mov.valor)}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {format(parseISO(mov.data_movimentacao), "dd/MM/yyyy", { locale: ptBR })}
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
    </div>
  );
}
