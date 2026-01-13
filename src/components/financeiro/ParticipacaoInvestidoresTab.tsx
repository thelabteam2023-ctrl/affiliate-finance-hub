import { useEffect, useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2, Users, CheckCircle2, Clock, TrendingUp, Plus, Gift, Hourglass, X, Filter } from "lucide-react";
import { format } from "date-fns";
import { parseLocalDate } from "@/lib/dateUtils";
import { ptBR } from "date-fns/locale";
import { PagamentoParticipacaoDialog } from "@/components/projetos/PagamentoParticipacaoDialog";
import { ParticipacaoManualDialog } from "./ParticipacaoManualDialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface Participacao {
  id: string;
  projeto_id: string;
  ciclo_id: string;
  investidor_id: string;
  percentual_aplicado: number;
  base_calculo: string;
  lucro_base: number;
  valor_participacao: number;
  status: string;
  data_apuracao: string;
  data_pagamento: string | null;
  observacoes: string | null;
  tipo_participacao?: string;
  participacao_referencia_id?: string | null;
  projetos?: { nome: string } | null;
  investidores?: { nome: string } | null;
  projeto_ciclos?: { numero_ciclo: number; status: string } | null;
}

interface Investidor {
  id: string;
  nome: string;
}

interface ParticipacaoInvestidoresTabProps {
  formatCurrency: (value: number, currency?: string) => string;
  onRefresh?: () => void;
  investidorFiltroId?: string;
}

export function ParticipacaoInvestidoresTab({ formatCurrency, onRefresh, investidorFiltroId }: ParticipacaoInvestidoresTabProps) {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [participacoes, setParticipacoes] = useState<Participacao[]>([]);
  const [pagamentoDialogOpen, setPagamentoDialogOpen] = useState(false);
  const [selectedParticipacao, setSelectedParticipacao] = useState<Participacao | null>(null);
  const [manualDialogOpen, setManualDialogOpen] = useState(false);
  
  // Filtro de investidor
  const [investidores, setInvestidores] = useState<Investidor[]>([]);
  const [filtroInvestidor, setFiltroInvestidor] = useState<string | null>(investidorFiltroId || null);

  useEffect(() => {
    fetchData();
    fetchInvestidores();
  }, []);

  // Atualizar filtro quando investidorFiltroId mudar
  useEffect(() => {
    if (investidorFiltroId) {
      setFiltroInvestidor(investidorFiltroId);
    }
  }, [investidorFiltroId]);

  const fetchData = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from("participacao_ciclos")
        .select(`
          *,
          projetos(nome),
          investidores(nome),
          projeto_ciclos(numero_ciclo, status)
        `)
        .order("data_apuracao", { ascending: false });

      if (error) throw error;
      setParticipacoes(data || []);
    } catch (error: any) {
      toast({
        title: "Erro ao carregar participações",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const getTipoBadge = (tipo?: string) => {
    switch (tipo) {
      case "AJUSTE_POSITIVO":
        return (
          <Badge variant="outline" className="bg-success/10 text-success border-success/30 text-xs">
            <TrendingUp className="h-3 w-3 mr-1" />
            +Ajuste
          </Badge>
        );
      case "BONUS":
        return (
          <Badge variant="outline" className="bg-amber-500/10 text-amber-500 border-amber-500/30 text-xs">
            <Gift className="h-3 w-3 mr-1" />
            Bônus
          </Badge>
        );
      default:
        return null;
    }
  };

  const fetchInvestidores = async () => {
    try {
      const { data, error } = await supabase
        .from("investidores")
        .select("id, nome")
        .order("nome");
      
      if (error) throw error;
      setInvestidores(data || []);
    } catch (error: any) {
      console.error("Erro ao carregar investidores:", error);
    }
  };

  // Limpar filtro e URL
  const handleLimparFiltro = () => {
    setFiltroInvestidor(null);
    // Limpar parâmetro da URL
    navigate("/financeiro?tab=participacoes", { replace: true });
  };

  // Obter nome do investidor filtrado
  const investidorFiltradoNome = useMemo(() => {
    if (!filtroInvestidor) return null;
    return investidores.find(i => i.id === filtroInvestidor)?.nome || null;
  }, [filtroInvestidor, investidores]);

  const handlePagar = (participacao: Participacao) => {
    setSelectedParticipacao(participacao);
    setPagamentoDialogOpen(true);
  };

  const handlePagamentoSuccess = () => {
    fetchData();
    onRefresh?.();
  };

  const handleManualSuccess = () => {
    fetchData();
    onRefresh?.();
  };

  // Aplicar filtro de investidor
  const participacoesFiltradas = useMemo(() => {
    if (!filtroInvestidor) return participacoes;
    return participacoes.filter(p => p.investidor_id === filtroInvestidor);
  }, [participacoes, filtroInvestidor]);

  // Aguardando: AGUARDANDO_CICLO ou (A_PAGAR mas ciclo ainda EM_ANDAMENTO)
  const aguardando = participacoesFiltradas.filter(p => 
    p.status === "AGUARDANDO_CICLO" ||
    (p.status === "A_PAGAR" && p.projeto_ciclos?.status === "EM_ANDAMENTO")
  );
  
  // Pendentes (prontas para pagar): A_PAGAR e ciclo FECHADO ou CONCLUIDO
  const pendentes = participacoesFiltradas.filter(p => 
    p.status === "A_PAGAR" && 
    p.projeto_ciclos?.status !== "EM_ANDAMENTO"
  );
  
  const pagas = participacoesFiltradas.filter(p => p.status === "PAGO");

  const totalAguardando = aguardando.reduce((acc, p) => acc + p.valor_participacao, 0);
  const totalPendente = pendentes.reduce((acc, p) => acc + p.valor_participacao, 0);
  const totalPago = pagas.reduce((acc, p) => acc + p.valor_participacao, 0);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header com filtro e botão */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Filter className="h-4 w-4 text-muted-foreground" />
          <Select
            value={filtroInvestidor || "todos"}
            onValueChange={(value) => {
              if (value === "todos") {
                handleLimparFiltro();
              } else {
                setFiltroInvestidor(value);
              }
            }}
          >
            <SelectTrigger className="w-[220px]">
              <SelectValue placeholder="Filtrar por investidor" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos os investidores</SelectItem>
              {investidores.map((inv) => (
                <SelectItem key={inv.id} value={inv.id}>
                  {inv.nome}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          
          {filtroInvestidor && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleLimparFiltro}
              className="text-muted-foreground hover:text-foreground"
            >
              <X className="h-4 w-4 mr-1" />
              Limpar
            </Button>
          )}
        </div>
        
        <Button onClick={() => setManualDialogOpen(true)} size="sm">
          <Plus className="h-4 w-4 mr-2" />
          Nova Participação Manual
        </Button>
      </div>

      {/* Badge de filtro ativo */}
      {investidorFiltradoNome && (
        <Card className="bg-primary/5 border-primary/20">
          <CardContent className="py-3 flex items-center gap-2">
            <Users className="h-4 w-4 text-primary" />
            <span className="text-sm">
              Exibindo participações de: <strong>{investidorFiltradoNome}</strong>
            </span>
          </CardContent>
        </Card>
      )}

      {/* KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-blue-500/10">
                <Hourglass className="h-5 w-5 text-blue-500" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Aguardando</p>
                <p className="text-xl font-bold text-blue-500">{formatCurrency(totalAguardando)}</p>
                <p className="text-xs text-muted-foreground">{aguardando.length} participação(ões)</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-amber-500/10">
                <Clock className="h-5 w-5 text-amber-500" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Pronto p/ Pagar</p>
                <p className="text-xl font-bold text-amber-500">{formatCurrency(totalPendente)}</p>
                <p className="text-xs text-muted-foreground">{pendentes.length} participação(ões)</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-success/10">
                <CheckCircle2 className="h-5 w-5 text-success" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Pago</p>
                <p className="text-xl font-bold text-success">{formatCurrency(totalPago)}</p>
                <p className="text-xs text-muted-foreground">{pagas.length} participação(ões)</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10">
                <TrendingUp className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Total</p>
                <p className="text-xl font-bold">{formatCurrency(totalAguardando + totalPendente + totalPago)}</p>
                <p className="text-xs text-muted-foreground">{participacoesFiltradas.length} total</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Aguardando Fechamento de Ciclo */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Hourglass className="h-4 w-4 text-blue-500" />
            Aguardando Fechamento de Ciclo
            <Badge variant="secondary" className="ml-2">{aguardando.length}</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/30">
                  <th className="text-left py-3 px-4 font-medium">Investidor</th>
                  <th className="text-left py-3 px-4 font-medium">Projeto</th>
                  <th className="text-center py-3 px-4 font-medium">Ciclo</th>
                  <th className="text-center py-3 px-4 font-medium">Tipo</th>
                  <th className="text-right py-3 px-4 font-medium">Lucro Base</th>
                  <th className="text-center py-3 px-4 font-medium">%</th>
                  <th className="text-right py-3 px-4 font-medium">Participação</th>
                  <th className="text-left py-3 px-4 font-medium">Criado em</th>
                </tr>
              </thead>
              <tbody>
                {aguardando.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="text-center py-8 text-muted-foreground">
                      Nenhuma participação aguardando fechamento de ciclo
                    </td>
                  </tr>
                ) : (
                  aguardando.map((p) => (
                    <tr key={p.id} className="border-b border-border/50 hover:bg-muted/30">
                      <td className="py-3 px-4 font-medium">
                        {p.investidores?.nome || "—"}
                      </td>
                      <td className="py-3 px-4">
                        {p.projetos?.nome || "—"}
                      </td>
                      <td className="py-3 px-4 text-center">
                        <div className="flex items-center justify-center gap-1">
                          <Badge variant="outline">#{p.projeto_ciclos?.numero_ciclo || "—"}</Badge>
                          <Badge variant="secondary" className="text-xs bg-blue-500/10 text-blue-500 border-blue-500/30">
                            Em andamento
                          </Badge>
                        </div>
                      </td>
                      <td className="py-3 px-4 text-center">
                        {getTipoBadge(p.tipo_participacao)}
                      </td>
                      <td className="py-3 px-4 text-right text-muted-foreground">
                        {formatCurrency(p.lucro_base)}
                      </td>
                      <td className="py-3 px-4 text-center">
                        <Badge variant="secondary">{p.percentual_aplicado}%</Badge>
                      </td>
                      <td className="py-3 px-4 text-right font-semibold text-blue-500">
                        {formatCurrency(p.valor_participacao)}
                      </td>
                      <td className="py-3 px-4 text-muted-foreground">
                        {format(parseLocalDate(p.data_apuracao), "dd/MM/yyyy", { locale: ptBR })}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Prontas para Pagamento */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Clock className="h-4 w-4 text-amber-500" />
            Prontas para Pagamento
            <Badge variant="secondary" className="ml-2">{pendentes.length}</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/30">
                  <th className="text-left py-3 px-4 font-medium">Investidor</th>
                  <th className="text-left py-3 px-4 font-medium">Projeto</th>
                  <th className="text-center py-3 px-4 font-medium">Ciclo</th>
                  <th className="text-center py-3 px-4 font-medium">Tipo</th>
                  <th className="text-right py-3 px-4 font-medium">Lucro Base</th>
                  <th className="text-center py-3 px-4 font-medium">%</th>
                  <th className="text-right py-3 px-4 font-medium">Participação</th>
                  <th className="text-left py-3 px-4 font-medium">Data Apuração</th>
                  <th className="text-center py-3 px-4 font-medium">Ação</th>
                </tr>
              </thead>
              <tbody>
                {pendentes.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="text-center py-8 text-muted-foreground">
                      Nenhuma participação pendente
                    </td>
                  </tr>
                ) : (
                  pendentes.map((p) => (
                    <tr key={p.id} className="border-b border-border/50 hover:bg-muted/30">
                      <td className="py-3 px-4 font-medium">
                        {p.investidores?.nome || "—"}
                      </td>
                      <td className="py-3 px-4">
                        {p.projetos?.nome || "—"}
                      </td>
                      <td className="py-3 px-4 text-center">
                        <Badge variant="outline">#{p.projeto_ciclos?.numero_ciclo || "—"}</Badge>
                      </td>
                      <td className="py-3 px-4 text-center">
                        {getTipoBadge(p.tipo_participacao)}
                      </td>
                      <td className="py-3 px-4 text-right text-muted-foreground">
                        {formatCurrency(p.lucro_base)}
                      </td>
                      <td className="py-3 px-4 text-center">
                        <Badge variant="secondary">{p.percentual_aplicado}%</Badge>
                      </td>
                      <td className="py-3 px-4 text-right font-semibold text-amber-500">
                        {formatCurrency(p.valor_participacao)}
                      </td>
                      <td className="py-3 px-4 text-muted-foreground">
                        {format(parseLocalDate(p.data_apuracao), "dd/MM/yyyy", { locale: ptBR })}
                      </td>
                      <td className="py-3 px-4 text-center">
                        <Button size="sm" onClick={() => handlePagar(p)}>
                          Pagar
                        </Button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Histórico de Participações Pagas */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-success" />
            Histórico de Pagamentos
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/30">
                  <th className="text-left py-3 px-4 font-medium">Investidor</th>
                  <th className="text-left py-3 px-4 font-medium">Projeto</th>
                  <th className="text-center py-3 px-4 font-medium">Ciclo</th>
                  <th className="text-center py-3 px-4 font-medium">Tipo</th>
                  <th className="text-right py-3 px-4 font-medium">Lucro Base</th>
                  <th className="text-center py-3 px-4 font-medium">%</th>
                  <th className="text-right py-3 px-4 font-medium">Valor Pago</th>
                  <th className="text-left py-3 px-4 font-medium">Data Pagamento</th>
                </tr>
              </thead>
              <tbody>
                {pagas.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="text-center py-8 text-muted-foreground">
                      Nenhum pagamento realizado
                    </td>
                  </tr>
                ) : (
                  pagas.map((p) => (
                    <tr key={p.id} className="border-b border-border/50 hover:bg-muted/30">
                      <td className="py-3 px-4 font-medium">
                        {p.investidores?.nome || "—"}
                      </td>
                      <td className="py-3 px-4">
                        {p.projetos?.nome || "—"}
                      </td>
                      <td className="py-3 px-4 text-center">
                        <Badge variant="outline">#{p.projeto_ciclos?.numero_ciclo || "—"}</Badge>
                      </td>
                      <td className="py-3 px-4 text-center">
                        {getTipoBadge(p.tipo_participacao)}
                      </td>
                      <td className="py-3 px-4 text-right text-muted-foreground">
                        {formatCurrency(p.lucro_base)}
                      </td>
                      <td className="py-3 px-4 text-center">
                        <Badge variant="secondary">{p.percentual_aplicado}%</Badge>
                      </td>
                      <td className="py-3 px-4 text-right font-semibold text-success">
                        {formatCurrency(p.valor_participacao)}
                      </td>
                      <td className="py-3 px-4 text-muted-foreground">
                        {p.data_pagamento 
                          ? format(parseLocalDate(p.data_pagamento), "dd/MM/yyyy", { locale: ptBR })
                          : "—"
                        }
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Dialog de Pagamento */}
      {selectedParticipacao && (
        <PagamentoParticipacaoDialog
          open={pagamentoDialogOpen}
          onOpenChange={setPagamentoDialogOpen}
          participacao={{
            id: selectedParticipacao.id,
            valor_participacao: selectedParticipacao.valor_participacao,
            projeto_id: selectedParticipacao.projeto_id,
            ciclo_id: selectedParticipacao.ciclo_id,
            investidor_id: selectedParticipacao.investidor_id,
            percentual_aplicado: selectedParticipacao.percentual_aplicado,
            base_calculo: selectedParticipacao.base_calculo,
            lucro_base: selectedParticipacao.lucro_base,
            data_apuracao: selectedParticipacao.data_apuracao,
            investidor_nome: selectedParticipacao.investidores?.nome || "Investidor",
            projeto_nome: selectedParticipacao.projetos?.nome || "Projeto",
            ciclo_numero: selectedParticipacao.projeto_ciclos?.numero_ciclo || 1,
          }}
          onSuccess={handlePagamentoSuccess}
        />
      )}

      {/* Dialog de Participação Manual */}
      <ParticipacaoManualDialog
        open={manualDialogOpen}
        onOpenChange={setManualDialogOpen}
        onSuccess={handleManualSuccess}
      />
    </div>
  );
}
