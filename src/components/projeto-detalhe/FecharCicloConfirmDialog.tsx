import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/hooks/useWorkspace";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { 
  AlertTriangle, 
  Lock, 
  CheckCircle2, 
  XCircle, 
  Clock, 
  Target,
  TrendingUp,
  BarChart3,
  Shield
} from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

interface Ciclo {
  id: string;
  numero_ciclo: number;
  data_inicio: string;
  data_fim_prevista: string;
  data_fim_real: string | null;
  status: string;
  lucro_bruto: number;
  lucro_liquido: number;
  tipo_gatilho: string;
  meta_volume: number | null;
  metrica_acumuladora: string;
  valor_acumulado: number;
}

interface CicloMetrics {
  qtdApostas: number;
  volume: number;
  ticketMedio: number;
  lucroBruto: number;
  lucroReal: number;
  roi: number;
  perdas: {
    totalConfirmadas: number;
    totalPendentes: number;
  };
}

interface FecharCicloConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  ciclo: Ciclo;
  projetoNome: string;
  metrics: CicloMetrics | null;
  onSuccess: () => void;
}

const CONFIRMATION_TEXT = "FECHAR CICLO";

const TIPO_GATILHO_LABELS: Record<string, string> = {
  TEMPO: "Por Tempo",
  META: "Por Meta",
  VOLUME: "Por Meta", // legado
  HIBRIDO: "Meta + Prazo", // legado
};

export function FecharCicloConfirmDialog({
  open,
  onOpenChange,
  ciclo,
  projetoNome,
  metrics,
  onSuccess,
}: FecharCicloConfirmDialogProps) {
  const { workspaceId } = useWorkspace();
  const [loading, setLoading] = useState(false);
  const [confirmationInput, setConfirmationInput] = useState("");
  const [requirements, setRequirements] = useState<{
    canClose: boolean;
    apostasAbertas: number;
    perdasPendentes: number;
  } | null>(null);
  const [checkingRequirements, setCheckingRequirements] = useState(true);

  useEffect(() => {
    if (open && ciclo?.id) {
      setConfirmationInput("");
      checkRequirements();
    }
  }, [open, ciclo?.id]);

  const checkRequirements = async () => {
    setCheckingRequirements(true);
    try {
      const { data, error } = await supabase
        .rpc("check_cycle_closing_requirements", { _ciclo_id: ciclo.id });

      if (error) throw error;

      const result = data as any;
      setRequirements({
        canClose: result.can_close,
        apostasAbertas: result.pendencias?.apostas_abertas || 0,
        perdasPendentes: result.pendencias?.perdas_pendentes || 0,
      });
    } catch (error: any) {
      console.error("Erro ao verificar requisitos:", error);
      setRequirements({
        canClose: true, // Fallback - permitir, backend valida novamente
        apostasAbertas: 0,
        perdasPendentes: 0,
      });
    } finally {
      setCheckingRequirements(false);
    }
  };

  const handleConfirm = async () => {
    if (!workspaceId) {
      toast.error("Workspace não identificado");
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase
        .rpc("close_project_cycle", {
          _ciclo_id: ciclo.id,
          _workspace_id: workspaceId,
        });

      if (error) throw error;

      const result = data as any;

      if (!result.success) {
        if (result.already_closed) {
          toast.info("Este ciclo já foi fechado");
        } else if (result.pendencias) {
          toast.error(`Pendências: ${result.pendencias.apostas_abertas} apostas abertas, ${result.pendencias.perdas_pendentes} perdas pendentes`);
        } else {
          toast.error(result.error || "Erro ao fechar ciclo");
        }
        return;
      }

      const m = result.metrics;
      const toastMsg = m.perdas_confirmadas > 0
        ? `Ciclo fechado! ${m.qtd_apostas} apostas, Lucro Real: R$ ${m.lucro_liquido?.toFixed(2)} (após R$ ${m.perdas_confirmadas?.toFixed(2)} em perdas), ROI: ${m.roi?.toFixed(2)}%`
        : `Ciclo fechado! ${m.qtd_apostas} apostas, Lucro: R$ ${m.lucro_liquido?.toFixed(2)}, ROI: ${m.roi?.toFixed(2)}%`;

      if (m.valor_participacao && m.valor_participacao > 0) {
        toast.success(`Investidor (${m.investidor_percentual}%): R$ ${m.valor_participacao.toFixed(2)} apurado`);
      }

      if (m.valor_pagamento_operador && m.valor_pagamento_operador > 0) {
        toast.success(`Operador (${m.operador_percentual}%): R$ ${m.valor_pagamento_operador.toFixed(2)} proposto`);
      }

      toast.success(toastMsg);
      onSuccess();
      onOpenChange(false);
    } catch (error: any) {
      toast.error("Erro ao fechar ciclo: " + error.message);
    } finally {
      setLoading(false);
    }
  };

  const isConfirmationValid = confirmationInput.toUpperCase() === CONFIRMATION_TEXT;
  const canProceed = requirements?.canClose && isConfirmationValid && !checkingRequirements;

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(value);
  };

  const formatDate = (dateStr: string) => {
    return format(new Date(dateStr + "T12:00:00"), "dd/MM/yyyy", { locale: ptBR });
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2 text-destructive">
            <Lock className="h-5 w-5" />
            Confirmar Fechamento de Ciclo
          </AlertDialogTitle>
          <AlertDialogDescription className="text-left">
            Esta é uma ação crítica e irreversível. Revise os dados abaixo antes de continuar.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="space-y-4 py-4">
          {/* Informações do Ciclo */}
          <div className="rounded-lg border bg-muted/30 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Projeto</span>
              <span className="font-medium">{projetoNome}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Ciclo</span>
              <Badge variant="outline">Ciclo {ciclo.numero_ciclo}</Badge>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Tipo</span>
              <Badge variant="secondary" className="gap-1">
                {ciclo.tipo_gatilho === "TEMPO" && <Clock className="h-3 w-3" />}
                {ciclo.tipo_gatilho === "VOLUME" && <Target className="h-3 w-3" />}
                {TIPO_GATILHO_LABELS[ciclo.tipo_gatilho] || ciclo.tipo_gatilho}
              </Badge>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Período</span>
              <span className="text-sm">
                {formatDate(ciclo.data_inicio)} - {formatDate(ciclo.data_fim_prevista)}
              </span>
            </div>
          </div>

          {/* Métricas do Ciclo */}
          {metrics && (
            <div className="rounded-lg border p-4 space-y-3">
              <div className="flex items-center gap-2 text-sm font-medium mb-2">
                <BarChart3 className="h-4 w-4 text-primary" />
                Métricas do Período
              </div>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Total Apostas</span>
                  <span className="font-medium">{metrics.qtdApostas}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Volume</span>
                  <span className="font-medium">{formatCurrency(metrics.volume)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Lucro Bruto</span>
                  <span className={`font-medium ${metrics.lucroBruto >= 0 ? "text-emerald-500" : "text-red-500"}`}>
                    {formatCurrency(metrics.lucroBruto)}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Lucro Líquido</span>
                  <span className={`font-medium ${metrics.lucroReal >= 0 ? "text-emerald-500" : "text-red-500"}`}>
                    {formatCurrency(metrics.lucroReal)}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">ROI</span>
                  <span className={`font-medium ${metrics.roi >= 0 ? "text-emerald-500" : "text-red-500"}`}>
                    {metrics.roi.toFixed(2)}%
                  </span>
                </div>
                {metrics.perdas.totalConfirmadas > 0 && (
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Perdas</span>
                    <span className="font-medium text-red-500">
                      {formatCurrency(metrics.perdas.totalConfirmadas)}
                    </span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Checklist de Requisitos */}
          <div className="rounded-lg border p-4 space-y-2">
            <div className="flex items-center gap-2 text-sm font-medium mb-2">
              <Shield className="h-4 w-4 text-primary" />
              Verificação de Pendências
            </div>

            {checkingRequirements ? (
              <div className="text-sm text-muted-foreground">Verificando...</div>
            ) : requirements ? (
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm">
                  {requirements.apostasAbertas === 0 ? (
                    <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                  ) : (
                    <XCircle className="h-4 w-4 text-red-500" />
                  )}
                  <span>
                    {requirements.apostasAbertas === 0 
                      ? "Nenhuma aposta em aberto" 
                      : `${requirements.apostasAbertas} aposta(s) pendente(s)`}
                  </span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  {requirements.perdasPendentes === 0 ? (
                    <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                  ) : (
                    <XCircle className="h-4 w-4 text-red-500" />
                  )}
                  <span>
                    {requirements.perdasPendentes === 0 
                      ? "Nenhuma perda pendente" 
                      : `${requirements.perdasPendentes} perda(s) pendente(s)`}
                  </span>
                </div>
              </div>
            ) : null}

            {requirements && !requirements.canClose && (
              <Alert variant="destructive" className="mt-3">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>
                  Resolva as pendências acima antes de fechar o ciclo.
                </AlertDescription>
              </Alert>
            )}
          </div>

          <Separator />

          {/* Aviso de Irreversibilidade */}
          <Alert className="border-amber-500/50 bg-amber-500/10">
            <AlertTriangle className="h-4 w-4 text-amber-500" />
            <AlertDescription className="text-amber-200">
              <strong>⚠️ Esta ação é irreversível.</strong>
              <br />
              Após o fechamento, o ciclo não poderá ser editado ou reaberto.
            </AlertDescription>
          </Alert>

          {/* Campo de Confirmação por Digitação */}
          <div className="space-y-2">
            <Label htmlFor="confirmation">
              Para confirmar, digite <strong className="text-destructive">{CONFIRMATION_TEXT}</strong>
            </Label>
            <Input
              id="confirmation"
              value={confirmationInput}
              onChange={(e) => setConfirmationInput(e.target.value.toUpperCase())}
              placeholder={CONFIRMATION_TEXT}
              className="font-mono text-center uppercase"
              disabled={!requirements?.canClose}
            />
            {confirmationInput && !isConfirmationValid && (
              <p className="text-xs text-destructive">Texto não confere</p>
            )}
          </div>
        </div>

        <AlertDialogFooter>
          <AlertDialogCancel disabled={loading}>Cancelar</AlertDialogCancel>
          <Button
            variant="destructive"
            onClick={handleConfirm}
            disabled={!canProceed || loading}
            className="gap-2"
          >
            {loading ? (
              "Fechando..."
            ) : (
              <>
                <Lock className="h-4 w-4" />
                Confirmar Fechamento
              </>
            )}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}