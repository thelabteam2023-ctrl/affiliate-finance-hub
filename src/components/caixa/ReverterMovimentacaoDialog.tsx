import { useEffect, useState } from "react";
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
import { Input } from "@/components/ui/input";
import { Undo2, AlertTriangle, Loader2 } from "lucide-react";
import { useReverterMovimentacao } from "@/hooks/useReverterMovimentacao";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  transacao: any | null;
  resumoTransacao?: string;
}

interface Dependencias {
  total_dependencias: number;
  apostas_count: number;
  movimentacoes_count: number;
  apostas: Array<{
    id: string;
    data: string;
    estrategia: string;
    evento: string | null;
    stake: number;
    moeda: string;
    status: string;
    resultado: string | null;
  }>;
  movimentacoes: Array<{
    id: string;
    data: string;
    tipo: string;
    valor: number;
    moeda: string;
    descricao: string;
  }>;
}

export function ReverterMovimentacaoDialog({ open, onOpenChange, transacao, resumoTransacao }: Props) {
  const [motivo, setMotivo] = useState("");
  const [deps, setDeps] = useState<Dependencias | null>(null);
  const [loadingDeps, setLoadingDeps] = useState(false);
  const { reverter } = useReverterMovimentacao();

  useEffect(() => {
    if (!open || !transacao?.id) {
      setDeps(null);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoadingDeps(true);
      try {
        const { data, error } = await supabase.rpc("get_movimentacao_dependencies", {
          p_transacao_id: transacao.id,
        });
        if (!cancelled && !error && data) {
          setDeps(data as unknown as Dependencias);
        }
      } finally {
        if (!cancelled) setLoadingDeps(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, transacao?.id]);

  const temDependencias = (deps?.total_dependencias ?? 0) > 0;
  const tipoSensivel = ["DEPOSITO", "SAQUE", "TRANSFERENCIA", "BONUS_CREDITADO"].includes(
    transacao?.tipo_transacao
  );
  const bloqueado = tipoSensivel && temDependencias;

  const handleConfirm = async () => {
    if (!transacao || motivo.trim().length < 5 || bloqueado) return;
    try {
      await reverter.mutateAsync({
        transacaoId: transacao.id,
        motivo: motivo.trim(),
        projetoIdSnapshot: transacao.projeto_id_snapshot,
      });
      setMotivo("");
      onOpenChange(false);
    } catch {
      /* toast já mostrado no hook */
    }
  };

  return (
    <AlertDialog
      open={open}
      onOpenChange={(o) => {
        if (!o) {
          setMotivo("");
          setDeps(null);
        }
        onOpenChange(o);
      }}
    >
      <AlertDialogContent className="max-w-2xl">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <Undo2 className="h-5 w-5" />
            Reverter movimentação
          </AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-3 text-sm">
              <p>
                Será criado um <strong>lançamento espelho</strong> com origem e destino invertidos,
                anulando o efeito desta movimentação no caixa.
              </p>
              {resumoTransacao && (
                <div className="rounded-md border bg-muted/40 p-2 font-mono text-xs">
                  {resumoTransacao}
                </div>
              )}
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>

        {/* Painel de dependências */}
        {loadingDeps && (
          <div className="flex items-center gap-2 rounded-md border border-border bg-muted/30 p-3 text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Verificando dependências posteriores...
          </div>
        )}

        {!loadingDeps && deps && temDependencias && (
          <div
            className={`rounded-md border p-3 text-sm ${
              bloqueado
                ? "border-destructive/50 bg-destructive/10"
                : "border-amber-500/50 bg-amber-500/10"
            }`}
          >
            <div className="mb-2 flex items-start gap-2">
              <AlertTriangle
                className={`mt-0.5 h-4 w-4 flex-shrink-0 ${
                  bloqueado ? "text-destructive" : "text-amber-600"
                }`}
              />
              <div className="flex-1">
                <p className="font-semibold">
                  {bloqueado
                    ? "Reversão bloqueada — quebra de cadeia detectada"
                    : "Atenção: existem movimentações posteriores"}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {deps.apostas_count > 0 && `${deps.apostas_count} aposta(s)`}
                  {deps.apostas_count > 0 && deps.movimentacoes_count > 0 && " · "}
                  {deps.movimentacoes_count > 0 &&
                    `${deps.movimentacoes_count} movimentação(ões)`}{" "}
                  posterior(es) no bookmaker afetado.
                  {bloqueado && " Reverta-as primeiro, em ordem cronológica inversa."}
                </p>
              </div>
            </div>

            <ScrollArea className="max-h-48 rounded-md border bg-background/40">
              <div className="space-y-1 p-2">
                {deps.apostas.map((a) => (
                  <div
                    key={a.id}
                    className="flex items-center justify-between gap-2 rounded border border-border/50 bg-muted/20 px-2 py-1 text-xs"
                  >
                    <div className="flex min-w-0 items-center gap-2">
                      <Badge variant="outline" className="text-[10px]">
                        Aposta
                      </Badge>
                      <span className="truncate">
                        {a.estrategia}
                        {a.evento ? ` · ${a.evento}` : ""}
                      </span>
                    </div>
                    <div className="flex flex-shrink-0 items-center gap-2 text-muted-foreground">
                      <span>
                        {a.moeda} {a.stake.toFixed(2)}
                      </span>
                      <span>{format(new Date(a.data), "dd/MM HH:mm", { locale: ptBR })}</span>
                    </div>
                  </div>
                ))}
                {deps.movimentacoes.map((m) => (
                  <div
                    key={m.id}
                    className="flex items-center justify-between gap-2 rounded border border-border/50 bg-muted/20 px-2 py-1 text-xs"
                  >
                    <div className="flex min-w-0 items-center gap-2">
                      <Badge variant="outline" className="text-[10px]">
                        {m.tipo}
                      </Badge>
                      <span className="truncate text-muted-foreground">
                        {m.descricao || "—"}
                      </span>
                    </div>
                    <div className="flex flex-shrink-0 items-center gap-2 text-muted-foreground">
                      <span>
                        {m.moeda} {Number(m.valor).toFixed(2)}
                      </span>
                      <span>{format(new Date(m.data), "dd/MM HH:mm", { locale: ptBR })}</span>
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </div>
        )}

        {!bloqueado && (
          <div className="space-y-2">
            <label className="text-xs font-medium">Motivo (mín. 5 caracteres) *</label>
            <Input
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              placeholder="Ex: Lançamento errado para o destino X"
              maxLength={200}
              autoFocus
              disabled={reverter.isPending}
            />
            <p className="text-[11px] text-muted-foreground">
              A transação original permanece visível no histórico para fins de auditoria.
            </p>
          </div>
        )}

        <AlertDialogFooter>
          <AlertDialogCancel disabled={reverter.isPending}>
            {bloqueado ? "Fechar" : "Cancelar"}
          </AlertDialogCancel>
          {!bloqueado && (
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                handleConfirm();
              }}
              disabled={motivo.trim().length < 5 || reverter.isPending || loadingDeps}
            >
              {reverter.isPending ? "Revertendo..." : "Reverter"}
            </AlertDialogAction>
          )}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
