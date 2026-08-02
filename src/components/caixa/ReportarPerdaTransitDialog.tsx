/**
 * ReportarPerdaTransitDialog
 * Registra uma perda em trânsito (envio de cripto em rede/endereço incorreto)
 * encerrando uma conciliação pendente SEM devolver saldo à carteira de origem.
 */
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AlertTriangle, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useCriarOcorrencia } from "@/hooks/useOcorrencias";
import { useAuth } from "@/hooks/useAuth";

type Motivo = "REDE_INCORRETA" | "ENDERECO_INVALIDO" | "FRAUDE" | "OUTRO";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  ledgerId: string | null;
  valorUsd: number;
  coin?: string | null;
  qtdCoin?: number | null;
  onSuccess?: () => void;
}

const MOTIVO_LABELS: Record<Motivo, string> = {
  REDE_INCORRETA: "Rede incorreta (ex: BEP20 em vez de TRC20)",
  ENDERECO_INVALIDO: "Endereço inválido / destinatário errado",
  FRAUDE: "Fraude / interceptação",
  OUTRO: "Outro motivo",
};

export function ReportarPerdaTransitDialog({
  open,
  onOpenChange,
  ledgerId,
  valorUsd,
  coin,
  qtdCoin,
  onSuccess,
}: Props) {
  const [motivo, setMotivo] = useState<Motivo>("REDE_INCORRETA");
  const [rede, setRede] = useState("");
  const [hash, setHash] = useState("");
  const [observacao, setObservacao] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [abrirOcorrencia, setAbrirOcorrencia] = useState(true);
  const { user } = useAuth();
  const { mutateAsync: criarOcorrencia } = useCriarOcorrencia();

  const reset = () => {
    setMotivo("REDE_INCORRETA");
    setRede("");
    setHash("");
    setObservacao("");
    setConfirmed(false);
    setAbrirOcorrencia(true);
  };

  const canSubmit =
    !!ledgerId &&
    confirmed &&
    observacao.trim().length >= 20 &&
    !saving;

  const handleSubmit = async () => {
    if (!canSubmit || !ledgerId) return;
    setSaving(true);
    try {
      const { data, error } = await supabase.rpc("reportar_perda_transit_wallet", {
        p_ledger_id: ledgerId,
        p_motivo: motivo,
        p_rede: rede.trim() || null,
        p_hash: hash.trim() || null,
        p_observacao: observacao.trim() || null,
      });
      if (error) throw error;
      const res = data as any;
      if (!res?.success) {
        toast.error("Não foi possível registrar a perda: " + (res?.error || "erro desconhecido"));
        return;
      }
      toast.success(
        `Perda registrada. $${Number(res.valor_perdido_usd || valorUsd).toFixed(2)} debitados da carteira de origem.`,
      );

      if (abrirOcorrencia && user?.id) {
        try {
          await criarOcorrencia({
            titulo: `Recuperação de ativos — ${coin || "cripto"} em trânsito`,
            descricao: observacao.trim(),
            tipo: "movimentacao_cripto",
            sub_motivo:
              motivo === "REDE_INCORRETA"
                ? "rede_incorreta"
                : motivo === "ENDERECO_INVALIDO"
                ? "endereco_incorreto"
                : motivo === "FRAUDE"
                ? "fraude"
                : "outro",
            prioridade: "alta",
            executor_id: user.id,
            coin: coin || undefined,
            network: rede.trim() || undefined,
            quantidade_cripto: qtdCoin ?? undefined,
            tx_hash: hash.trim() || undefined,
            valor_risco: Number(res.valor_perdido_usd || valorUsd) || 0,
            moeda: "USD",
            contexto_metadata: { perda_ledger_id: ledgerId, origem: "reportar_perda_transit" },
          });
          toast.success("Ocorrência de acompanhamento criada.");
        } catch (e) {
          console.error("[ReportarPerdaTransitDialog] falha ao criar ocorrência:", e);
          toast.warning("Perda registrada, mas não foi possível abrir a ocorrência.");
        }
      }

      reset();
      onOpenChange(false);
      onSuccess?.();
    } catch (err: any) {
      console.error("[ReportarPerdaTransitDialog] erro:", err);
      toast.error("Erro: " + (err?.message || String(err)));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!saving) {
          if (!v) reset();
          onOpenChange(v);
        }
      }}
    >
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-destructive">
            <AlertTriangle className="h-5 w-5" />
            Reportar perda em trânsito
          </DialogTitle>
          <DialogDescription>
            Use esta opção quando os fundos <strong>saíram fisicamente</strong> da carteira mas
            não chegaram ao destino (rede errada, endereço inválido, etc.) e{" "}
            <strong>não podem ser recuperados</strong>. O saldo <em>não</em> volta para a origem.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm">
            <div className="font-medium">Valor perdido</div>
            <div className="text-lg font-mono">
              ${valorUsd.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              {coin && qtdCoin ? (
                <span className="text-muted-foreground text-sm ml-2">
                  ({qtdCoin} {coin})
                </span>
              ) : null}
            </div>
          </div>

          <div className="space-y-2">
            <Label>Motivo *</Label>
            <Select value={motivo} onValueChange={(v) => setMotivo(v as Motivo)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {(Object.keys(MOTIVO_LABELS) as Motivo[]).map((k) => (
                  <SelectItem key={k} value={k}>{MOTIVO_LABELS[k]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="rede">Rede usada por engano</Label>
            <Input
              id="rede"
              value={rede}
              onChange={(e) => setRede(e.target.value)}
              placeholder="Ex: BEP20 (esperado TRC20)"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="hash">Hash da transação (opcional)</Label>
            <Input
              id="hash"
              value={hash}
              onChange={(e) => setHash(e.target.value)}
              placeholder="0x..."
              className="font-mono text-xs"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="observacao">Observações * (mín. 20 caracteres)</Label>
            <Textarea
              id="observacao"
              value={observacao}
              onChange={(e) => setObservacao(e.target.value)}
              rows={3}
              placeholder="Descreva o que aconteceu para a trilha de auditoria."
            />
            <p className="text-xs text-muted-foreground">
              {observacao.trim().length}/20
            </p>
          </div>

          <label className="flex items-start gap-2 text-sm cursor-pointer">
            <Checkbox
              checked={abrirOcorrencia}
              onCheckedChange={(v) => setAbrirOcorrencia(v === true)}
              className="mt-0.5"
            />
            <span>
              Abrir <strong>ocorrência de recuperação</strong> para acompanhar tentativas de resgate
              dos ativos.
            </span>
          </label>

          <label className="flex items-start gap-2 text-sm cursor-pointer">
            <Checkbox
              checked={confirmed}
              onCheckedChange={(v) => setConfirmed(v === true)}
              className="mt-0.5"
            />
            <span>
              Confirmo que os fundos foram perdidos e <strong>não retornarão</strong> à carteira
              de origem. Esta ação registrará uma perda definitiva no projeto.
            </span>
          </label>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancelar
          </Button>
          <Button variant="destructive" onClick={handleSubmit} disabled={!canSubmit}>
            {saving ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Registrando...
              </>
            ) : (
              "Registrar perda"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}