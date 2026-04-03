import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/hooks/useWorkspace";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogFooter,
  AlertDialogCancel,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  Hash,
  Activity,
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
  lucroOperacional?: number;
  lucroRealizado?: number;
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
  VOLUME: "Por Meta",
  HIBRIDO: "Meta + Prazo",
};

const TIPO_GATILHO_ICONS: Record<string, typeof Clock> = {
  TEMPO: Clock,
  META: Target,
  VOLUME: Target,
  HIBRIDO: Activity,
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
        canClose: true,
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
      const frontendMetrics = metrics ? {
        qtd_apostas: metrics.qtdApostas,
        volume: metrics.volume,
        lucro_apostas: metrics.lucroBruto,
        lucro_bruto: metrics.lucroBruto,
        lucro_liquido: metrics.lucroOperacional ?? metrics.lucroReal,
        perdas_confirmadas: metrics.perdas?.totalConfirmadas || 0,
        cashback: 0,
        giros_gratis: 0,
      } : null;

      const { data, error } = await supabase
        .rpc("close_project_cycle", {
          _ciclo_id: ciclo.id,
          _workspace_id: workspaceId,
          _frontend_metrics: frontendMetrics,
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

  const lucroLiquido = metrics?.lucroOperacional ?? metrics?.lucroReal ?? 0;
  const lucroPositivo = lucroLiquido >= 0;
  const GatilhoIcon = TIPO_GATILHO_ICONS[ciclo.tipo_gatilho] || Clock;

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="max-w-md sm:max-w-lg p-0 gap-0 overflow-hidden max-h-[95vh] flex flex-col">
        {/* ── HEADER ── */}
        <div className="px-5 pt-5 pb-4 border-b border-border/50">
          <div className="flex items-center gap-2 mb-3">
            <div className="h-8 w-8 rounded-lg bg-destructive/10 flex items-center justify-center">
              <Lock className="h-4 w-4 text-destructive" />
            </div>
            <h2 className="text-base font-semibold text-foreground">Fechamento de Ciclo</h2>
          </div>

          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
            <span className="font-medium text-foreground">{projetoNome}</span>
            <span className="text-muted-foreground/50">•</span>
            <span>Ciclo {ciclo.numero_ciclo}</span>
            <span className="text-muted-foreground/50">•</span>
            <span className="inline-flex items-center gap-1">
              <GatilhoIcon className="h-3 w-3" />
              {TIPO_GATILHO_LABELS[ciclo.tipo_gatilho] || ciclo.tipo_gatilho}
            </span>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            {formatDate(ciclo.data_inicio)} — {formatDate(ciclo.data_fim_prevista)}
          </p>
        </div>

        {/* ── SCROLLABLE BODY ── */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">

          {/* ── MÉTRICAS ── */}
          {metrics && (
            <div className="space-y-3">
              {/* KPI Principal - Lucro Líquido */}
              <div className={`rounded-xl p-4 text-center ${
                lucroPositivo 
                  ? "bg-emerald-500/10 border border-emerald-500/20" 
                  : "bg-red-500/10 border border-red-500/20"
              }`}>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1">
                  Lucro Líquido
                </p>
                <p className={`text-2xl sm:text-3xl font-bold tracking-tight ${
                  lucroPositivo ? "text-emerald-400" : "text-red-400"
                }`}>
                  {formatCurrency(lucroLiquido)}
                </p>
                {metrics.roi !== 0 && (
                  <p className={`text-xs mt-1 ${lucroPositivo ? "text-emerald-400/70" : "text-red-400/70"}`}>
                    ROI {metrics.roi.toFixed(2)}%
                  </p>
                )}
              </div>

              {/* KPIs Secundários */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                <KPICell
                  icon={<TrendingUp className="h-3.5 w-3.5" />}
                  label="Lucro Bruto"
                  value={formatCurrency(metrics.lucroBruto)}
                  color={metrics.lucroBruto >= 0 ? "emerald" : "red"}
                />
                <KPICell
                  icon={<BarChart3 className="h-3.5 w-3.5" />}
                  label="Volume"
                  value={formatCurrency(metrics.volume)}
                  color="neutral"
                />
                <KPICell
                  icon={<Hash className="h-3.5 w-3.5" />}
                  label="Apostas"
                  value={String(metrics.qtdApostas)}
                  color="neutral"
                  className="col-span-2 sm:col-span-1"
                />
              </div>

              {metrics.perdas.totalConfirmadas > 0 && (
                <div className="flex items-center justify-between rounded-lg bg-red-500/5 border border-red-500/10 px-3 py-2 text-sm">
                  <span className="text-muted-foreground">Perdas Confirmadas</span>
                  <span className="font-medium text-red-400">
                    {formatCurrency(metrics.perdas.totalConfirmadas)}
                  </span>
                </div>
              )}
            </div>
          )}

          {/* ── VERIFICAÇÃO DE PENDÊNCIAS ── */}
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Verificação
            </p>
            {checkingRequirements ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
                <div className="h-4 w-4 rounded-full border-2 border-muted-foreground/30 border-t-primary animate-spin" />
                Verificando pendências...
              </div>
            ) : requirements ? (
              <div className="space-y-1.5">
                <ChecklistItem
                  ok={requirements.apostasAbertas === 0}
                  okText="Nenhuma aposta em aberto"
                  failText={`${requirements.apostasAbertas} aposta(s) pendente(s)`}
                />
                <ChecklistItem
                  ok={requirements.perdasPendentes === 0}
                  okText="Nenhuma perda pendente"
                  failText={`${requirements.perdasPendentes} perda(s) pendente(s)`}
                />

                {!requirements.canClose && (
                  <div className="mt-2 rounded-lg bg-destructive/10 border border-destructive/20 px-3 py-2 text-sm text-destructive flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4 shrink-0" />
                    Resolva as pendências antes de fechar o ciclo.
                  </div>
                )}
              </div>
            ) : null}
          </div>

          {/* ── ALERTA IRREVERSÍVEL ── */}
          <div className="rounded-lg bg-amber-500/8 border border-amber-500/25 px-4 py-3">
            <div className="flex items-start gap-2.5">
              <AlertTriangle className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
              <div className="text-sm">
                <p className="font-semibold text-amber-400">Esta ação é irreversível.</p>
                <p className="text-muted-foreground text-xs mt-0.5">
                  Após o fechamento, o ciclo não poderá ser editado ou reaberto.
                </p>
              </div>
            </div>
          </div>

          {/* ── CONFIRMAÇÃO POR TEXTO ── */}
          <div className="space-y-2">
            <Label htmlFor="confirmation" className="text-sm">
              Digite <span className="font-mono font-bold text-destructive">{CONFIRMATION_TEXT}</span> para liberar
            </Label>
            <Input
              id="confirmation"
              value={confirmationInput}
              onChange={(e) => setConfirmationInput(e.target.value.toUpperCase())}
              placeholder={CONFIRMATION_TEXT}
              className="font-mono text-center uppercase tracking-widest h-10"
              disabled={!requirements?.canClose}
              autoComplete="off"
            />
            {confirmationInput.length > 0 && !isConfirmationValid && (
              <p className="text-xs text-destructive">Texto não confere</p>
            )}
            {isConfirmationValid && (
              <p className="text-xs text-emerald-500 flex items-center gap-1">
                <CheckCircle2 className="h-3 w-3" /> Confirmação válida
              </p>
            )}
          </div>
        </div>

        {/* ── FOOTER (sticky) ── */}
        <AlertDialogFooter className="border-t border-border/50 px-5 py-4 bg-background sticky bottom-0 flex-row gap-2 sm:gap-2">
          <AlertDialogCancel disabled={loading} className="flex-1 sm:flex-none">
            Cancelar
          </AlertDialogCancel>
          <Button
            variant="destructive"
            onClick={handleConfirm}
            disabled={!canProceed || loading}
            className="gap-2 flex-1 sm:flex-none"
          >
            {loading ? (
              <>
                <div className="h-4 w-4 rounded-full border-2 border-destructive-foreground/30 border-t-destructive-foreground animate-spin" />
                Fechando...
              </>
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

/* ── Sub-components ── */

function KPICell({
  icon,
  label,
  value,
  color,
  className = "",
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  color: "emerald" | "red" | "neutral";
  className?: string;
}) {
  const colorClasses = {
    emerald: "text-emerald-400",
    red: "text-red-400",
    neutral: "text-foreground",
  };

  return (
    <div className={`rounded-lg border border-border/50 bg-muted/20 px-3 py-2.5 ${className}`}>
      <div className="flex items-center gap-1.5 mb-1">
        <span className="text-muted-foreground">{icon}</span>
        <span className="text-[11px] text-muted-foreground uppercase tracking-wide">{label}</span>
      </div>
      <p className={`text-sm font-semibold ${colorClasses[color]}`}>{value}</p>
    </div>
  );
}

function ChecklistItem({
  ok,
  okText,
  failText,
}: {
  ok: boolean;
  okText: string;
  failText: string;
}) {
  return (
    <div className="flex items-center gap-2 text-sm py-1">
      {ok ? (
        <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
      ) : (
        <XCircle className="h-4 w-4 text-red-500 shrink-0" />
      )}
      <span className={ok ? "text-muted-foreground" : "text-red-400"}>
        {ok ? okText : failText}
      </span>
    </div>
  );
}
