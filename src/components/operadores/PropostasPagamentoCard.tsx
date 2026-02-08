import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import {
  CheckCircle2,
  XCircle,
  User,
  FolderKanban,
  Calendar,
  AlertTriangle,
} from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
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
import { Label } from "@/components/ui/label";
import { useWorkspace } from "@/hooks/useWorkspace";

interface PropostaPagamento {
  id: string;
  operador_id: string;
  operador_nome: string;
  projeto_id: string;
  projeto_nome: string;
  ciclo_id: string | null;
  ciclo_numero: number | null;
  lucro_base: number;
  valor_calculado: number;
  valor_ajustado: number | null;
  desconto_prejuizo_anterior: number;
  modelo_pagamento: string;
  percentual_aplicado: number | null;
  valor_fixo_aplicado: number | null;
  status: string;
  data_proposta: string;
}

export function PropostasPagamentoCard() {
  const { workspaceId } = useWorkspace();
  const [propostas, setPropostas] = useState<PropostaPagamento[]>([]);
  const [loading, setLoading] = useState(true);
  const [aprovarDialogOpen, setAprovarDialogOpen] = useState(false);
  const [rejeitarDialogOpen, setRejeitarDialogOpen] = useState(false);
  const [selectedProposta, setSelectedProposta] = useState<PropostaPagamento | null>(null);
  const [motivoRejeicao, setMotivoRejeicao] = useState("");
  const [processing, setProcessing] = useState(false);

  useEffect(() => {
    fetchPropostas();
  }, []);

  const fetchPropostas = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from("pagamentos_propostos")
        .select(`
          id,
          operador_id,
          projeto_id,
          ciclo_id,
          lucro_base,
          valor_calculado,
          valor_ajustado,
          desconto_prejuizo_anterior,
          modelo_pagamento,
          percentual_aplicado,
          valor_fixo_aplicado,
          status,
          data_proposta,
          operador:operadores(nome),
          projeto:projetos(nome),
          ciclo:projeto_ciclos(numero_ciclo)
        `)
        .eq("status", "PENDENTE")
        .order("data_proposta", { ascending: false });

      if (error) throw error;

      setPropostas(
        (data || []).map((p: any) => ({
          ...p,
          operador_nome: p.operador?.nome || "N/A",
          projeto_nome: p.projeto?.nome || "N/A",
          ciclo_numero: p.ciclo?.numero_ciclo || null,
        }))
      );
    } catch (error: any) {
      console.error("Erro ao carregar propostas:", error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleAprovar = async () => {
    if (!selectedProposta) return;
    
    setProcessing(true);
    try {
      const { data: session } = await supabase.auth.getSession();
      if (!session.session) {
        toast.error("Usuário não autenticado");
        return;
      }

      if (!workspaceId) {
        toast.error("Workspace não disponível nesta aba");
        return;
      }

      // 1. Criar registro em pagamentos_operador
      const valorFinal = selectedProposta.valor_ajustado ?? selectedProposta.valor_calculado;
      
      const { data: pagamento, error: pagamentoError } = await supabase
        .from("pagamentos_operador")
        .insert({
          user_id: session.session.user.id,
          workspace_id: workspaceId,
          operador_id: selectedProposta.operador_id,
          projeto_id: selectedProposta.projeto_id,
          valor: valorFinal,
          tipo_pagamento: "COMISSAO",
          status: "PENDENTE", // Ainda precisa ser efetivamente pago
          data_pagamento: new Date().toISOString().split("T")[0],
          descricao: `Pagamento do Ciclo ${selectedProposta.ciclo_numero || "N/A"} - ${selectedProposta.modelo_pagamento}`,
        })
        .select()
        .single();

      if (pagamentoError) throw pagamentoError;

      // 2. Atualizar proposta como aprovada
      const { error: propostaError } = await supabase
        .from("pagamentos_propostos")
        .update({
          status: "APROVADO",
          data_aprovacao: new Date().toISOString(),
          aprovado_por: session.session.user.email,
          pagamento_id: pagamento.id,
        })
        .eq("id", selectedProposta.id);

      if (propostaError) throw propostaError;

      toast.success("Proposta aprovada! Pagamento criado como pendente.");
      setAprovarDialogOpen(false);
      setSelectedProposta(null);
      fetchPropostas();
    } catch (error: any) {
      toast.error("Erro ao aprovar: " + error.message);
    } finally {
      setProcessing(false);
    }
  };

  const handleRejeitar = async () => {
    if (!selectedProposta) return;
    
    setProcessing(true);
    try {
      const { data: session } = await supabase.auth.getSession();
      
      const { error } = await supabase
        .from("pagamentos_propostos")
        .update({
          status: "REJEITADO",
          data_aprovacao: new Date().toISOString(),
          aprovado_por: session.session?.user.email,
          motivo_rejeicao: motivoRejeicao || null,
        })
        .eq("id", selectedProposta.id);

      if (error) throw error;

      toast.success("Proposta rejeitada.");
      setRejeitarDialogOpen(false);
      setSelectedProposta(null);
      setMotivoRejeicao("");
      fetchPropostas();
    } catch (error: any) {
      toast.error("Erro ao rejeitar: " + error.message);
    } finally {
      setProcessing(false);
    }
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(value);
  };

  const getModeloLabel = (modelo: string) => {
    const labels: Record<string, string> = {
      FIXO_MENSAL: "Fixo Mensal",
      PORCENTAGEM: "Porcentagem",
      HIBRIDO: "Híbrido",
      POR_ENTREGA: "Por Entrega",
      COMISSAO_ESCALONADA: "Escalonada",
      PROPORCIONAL_LUCRO: "Proporcional",
    };
    return labels[modelo] || modelo;
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Propostas de Pagamento</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-20 w-full" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  // REGRA: Não renderizar nada quando não há propostas pendentes
  // Cards vazios não devem ocupar espaço na Central de Operações
  if (propostas.length === 0) {
    return null;
  }

  return (
    <>
      <Card className="border-amber-500/30">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-sm">
            <AlertTriangle className="h-4 w-4 text-amber-400" />
            Propostas de Pagamento
            <Badge className="ml-auto bg-amber-500/20 text-amber-400">{propostas.length}</Badge>
          </CardTitle>
          <CardDescription className="text-xs">Aguardando aprovação manual</CardDescription>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="space-y-2">
            {propostas.map((proposta) => (
              <div
                key={proposta.id}
                className="flex items-center justify-between p-2 rounded-lg border border-amber-500/20 bg-amber-500/5"
              >
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  <User className="h-3.5 w-3.5 text-amber-400 shrink-0" />
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <p className="text-xs font-medium truncate">{proposta.operador_nome}</p>
                      <Badge variant="outline" className="text-[10px] px-1 py-0 h-4 shrink-0">
                        {getModeloLabel(proposta.modelo_pagamento)}
                      </Badge>
                    </div>
                    <p className="text-[10px] text-muted-foreground truncate">
                      {proposta.projeto_nome}
                      {proposta.ciclo_numero ? ` • Ciclo ${proposta.ciclo_numero}` : ""}
                      {" • "}
                      <Calendar className="h-2.5 w-2.5 inline" />
                      {" "}
                      {format(new Date(proposta.data_proposta), "dd/MM/yyyy", { locale: ptBR })}
                    </p>
                    {proposta.lucro_base > 0 && proposta.percentual_aplicado && (
                      <p className="text-[10px] text-muted-foreground">
                        {proposta.percentual_aplicado}% de {formatCurrency(proposta.lucro_base)}
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-xs font-bold text-emerald-400">
                    {formatCurrency(proposta.valor_ajustado ?? proposta.valor_calculado)}
                  </span>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-6 w-6 p-0 text-red-400 hover:text-red-500"
                    onClick={() => {
                      setSelectedProposta(proposta);
                      setRejeitarDialogOpen(true);
                    }}
                  >
                    <XCircle className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    size="sm"
                    className="bg-emerald-600 hover:bg-emerald-700 h-6 text-xs px-2"
                    onClick={() => {
                      setSelectedProposta(proposta);
                      setAprovarDialogOpen(true);
                    }}
                  >
                    Aprovar
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Dialog de Aprovação */}
      <AlertDialog open={aprovarDialogOpen} onOpenChange={setAprovarDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar Aprovação</AlertDialogTitle>
            <AlertDialogDescription>
              Você está prestes a aprovar o pagamento de{" "}
              <strong>
                {formatCurrency(selectedProposta?.valor_ajustado ?? selectedProposta?.valor_calculado ?? 0)}
              </strong>{" "}
              para <strong>{selectedProposta?.operador_nome}</strong>.
              <br /><br />
              Um registro de pagamento será criado como pendente para execução posterior.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleAprovar}
              disabled={processing}
              className="bg-emerald-600 hover:bg-emerald-700"
            >
              {processing ? "Processando..." : "Confirmar Aprovação"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Dialog de Rejeição */}
      <AlertDialog open={rejeitarDialogOpen} onOpenChange={setRejeitarDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Rejeitar Proposta</AlertDialogTitle>
            <AlertDialogDescription>
              Você está prestes a rejeitar o pagamento para{" "}
              <strong>{selectedProposta?.operador_nome}</strong>.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="py-4">
            <Label>Motivo da Rejeição (opcional)</Label>
            <Textarea
              value={motivoRejeicao}
              onChange={(e) => setMotivoRejeicao(e.target.value)}
              placeholder="Explique o motivo..."
              className="mt-2"
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleRejeitar}
              disabled={processing}
              className="bg-red-600 hover:bg-red-700"
            >
              {processing ? "Processando..." : "Confirmar Rejeição"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
