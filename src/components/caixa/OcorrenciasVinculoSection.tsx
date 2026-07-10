import { useNavigate } from "react-router-dom";
import { AlertTriangle, ExternalLink } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useOcorrenciasAbertasPorCasa } from "@/hooks/useOcorrenciasAbertasPorCasa";

interface Props {
  bookmakerId: string | null | undefined;
  value: string; // ocorrencia_id selecionada (ou "")
  onChange: (id: string) => void;
}

const formatMoney = (v: number, m: string) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: m || "BRL" }).format(v || 0);

/**
 * Bloco compartilhado entre Reconciliação e Ajuste Manual:
 *  - Alerta o operador quando a casa possui ocorrências abertas.
 *  - Permite vincular o lançamento a uma ocorrência (opcional), o que grava
 *    `cash_ledger.ocorrencia_id` e marca a ocorrência com `ajuste_ledger_id`
 *    para evitar dupla contagem de perda.
 */
export function OcorrenciasVinculoSection({ bookmakerId, value, onChange }: Props) {
  const navigate = useNavigate();
  const { data: ocorrencias = [], isLoading } = useOcorrenciasAbertasPorCasa(bookmakerId);

  if (!bookmakerId) return null;
  if (isLoading && ocorrencias.length === 0) return null;
  if (ocorrencias.length === 0) return null;

  const totalRisco = ocorrencias.reduce((acc, o) => acc + Number(o.valor_risco || 0), 0);
  const moeda = ocorrencias[0]?.moeda || "BRL";

  return (
    <div className="space-y-2">
      <Alert className="border-amber-500/40 bg-amber-500/5">
        <AlertTriangle className="h-4 w-4 text-amber-500" />
        <AlertDescription className="text-xs text-muted-foreground">
          Esta casa possui <strong>{ocorrencias.length} ocorrência(s) em aberto</strong> (risco
          agregado: <strong>{formatMoney(totalRisco, moeda)}</strong>). Se este ajuste está
          relacionado, vincule abaixo para evitar dupla contagem quando a ocorrência for resolvida.
          <Button
            type="button"
            variant="link"
            size="sm"
            className="h-auto p-0 ml-1 text-xs"
            onClick={() => navigate("/central-operacoes")}
          >
            Ver ocorrências <ExternalLink className="h-3 w-3 ml-1" />
          </Button>
        </AlertDescription>
      </Alert>

      <div className="space-y-1.5">
        <Label className="text-xs">Vincular a ocorrência (opcional)</Label>
        <Select value={value || "__none__"} onValueChange={(v) => onChange(v === "__none__" ? "" : v)}>
          <SelectTrigger>
            <SelectValue placeholder="Não vincular" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__none__">Não vincular</SelectItem>
            {ocorrencias.map((o) => (
              <SelectItem key={o.id} value={o.id}>
                {o.titulo} — {formatMoney(Number(o.valor_risco || 0), o.moeda)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}