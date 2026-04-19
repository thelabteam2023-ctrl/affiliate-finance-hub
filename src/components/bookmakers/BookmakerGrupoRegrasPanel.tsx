import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  useBookmakerGrupoRegras,
  GrupoRegraTipo,
  GrupoRegraSeveridade,
  REGRA_TIPO_LABELS,
  REGRA_TIPO_DESCRICOES,
  REGRA_TIPO_PRECISA_VALOR,
} from "@/hooks/useBookmakerGrupoRegras";
import { Plus, Trash2, X, ShieldAlert, ShieldCheck } from "lucide-react";

interface Props {
  grupoId: string;
  grupoNome: string;
}

const TIPOS: GrupoRegraTipo[] = [
  "LIMITE_MAX_POR_PERFIL",
  "UNICA_POR_PERFIL",
  "IP_UNICO_OBRIGATORIO",
  "COOLDOWN_DIAS",
];

export function BookmakerGrupoRegrasPanel({ grupoId, grupoNome }: Props) {
  const { regras, createRegra, updateRegra, deleteRegra } = useBookmakerGrupoRegras(grupoId);

  const [showForm, setShowForm] = useState(false);
  const [tipo, setTipo] = useState<GrupoRegraTipo>("LIMITE_MAX_POR_PERFIL");
  const [valor, setValor] = useState("");
  const [severidade, setSeveridade] = useState<GrupoRegraSeveridade>("BLOQUEIO");
  const [mensagem, setMensagem] = useState("");

  const reset = () => {
    setTipo("LIMITE_MAX_POR_PERFIL");
    setValor("");
    setSeveridade("BLOQUEIO");
    setMensagem("");
    setShowForm(false);
  };

  const handleCreate = () => {
    const precisaValor = REGRA_TIPO_PRECISA_VALOR[tipo];
    if (precisaValor && (!valor || Number(valor) <= 0)) return;
    createRegra.mutate(
      {
        grupo_id: grupoId,
        tipo_regra: tipo,
        valor_numerico: precisaValor ? Number(valor) : null,
        severidade,
        mensagem_violacao: mensagem.trim() || null,
      },
      { onSuccess: reset },
    );
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h4 className="text-sm font-semibold flex items-center gap-1.5">
            <ShieldCheck className="h-4 w-4 text-primary" />
            Regras do grupo
          </h4>
          <p className="text-[11px] text-muted-foreground">
            Restrições aplicadas automaticamente ao planejar campanhas com casas de "{grupoNome}".
          </p>
        </div>
        {!showForm && (
          <Button size="sm" variant="outline" onClick={() => setShowForm(true)} className="h-7 gap-1.5">
            <Plus className="h-3.5 w-3.5" /> Nova regra
          </Button>
        )}
      </div>

      {showForm && (
        <div className="rounded-md border border-border bg-muted/30 p-3 space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-[11px]">Tipo</Label>
              <Select value={tipo} onValueChange={(v) => setTipo(v as GrupoRegraTipo)}>
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TIPOS.map((t) => (
                    <SelectItem key={t} value={t} className="text-xs">{REGRA_TIPO_LABELS[t]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-[11px]">Severidade</Label>
              <Select value={severidade} onValueChange={(v) => setSeveridade(v as GrupoRegraSeveridade)}>
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="BLOQUEIO" className="text-xs">Bloqueio</SelectItem>
                  <SelectItem value="AVISO" className="text-xs">Aviso</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <p className="text-[11px] text-muted-foreground">{REGRA_TIPO_DESCRICOES[tipo]}</p>

          {REGRA_TIPO_PRECISA_VALOR[tipo] && (
            <div>
              <Label className="text-[11px]">
                {tipo === "LIMITE_MAX_POR_PERFIL" ? "Quantidade máxima" : "Dias"}
              </Label>
              <Input
                type="number"
                min={1}
                value={valor}
                onChange={(e) => setValor(e.target.value)}
                className="h-8 text-xs"
                placeholder={tipo === "COOLDOWN_DIAS" ? "Ex: 7" : "Ex: 5"}
              />
            </div>
          )}

          <div>
            <Label className="text-[11px]">Mensagem customizada (opcional)</Label>
            <Input
              value={mensagem}
              onChange={(e) => setMensagem(e.target.value)}
              className="h-8 text-xs"
              placeholder="Deixe vazio para mensagem padrão"
            />
          </div>

          <div className="flex gap-1.5 pt-1">
            <Button size="sm" className="flex-1 h-7 text-xs" onClick={handleCreate} disabled={createRegra.isPending}>
              Criar regra
            </Button>
            <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={reset}>
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      )}

      <div className="space-y-1.5">
        {regras.length === 0 && !showForm && (
          <p className="text-xs text-muted-foreground text-center py-4 italic">
            Nenhuma regra configurada. Adicione restrições para governar o uso deste grupo.
          </p>
        )}
        {regras.map((r) => (
          <div
            key={r.id}
            className="flex items-center gap-2 rounded-md border border-border bg-card px-3 py-2"
          >
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5 text-xs font-medium">
                {r.severidade === "BLOQUEIO" ? (
                  <ShieldAlert className="h-3.5 w-3.5 text-destructive shrink-0" />
                ) : (
                  <ShieldCheck className="h-3.5 w-3.5 text-warning shrink-0" />
                )}
                <span className="truncate">{REGRA_TIPO_LABELS[r.tipo_regra]}</span>
                {r.valor_numerico != null && (
                  <Badge variant="secondary" className="h-4 text-[10px] px-1.5">
                    {r.valor_numerico}
                  </Badge>
                )}
              </div>
              {r.mensagem_violacao && (
                <p className="text-[10px] text-muted-foreground truncate mt-0.5">{r.mensagem_violacao}</p>
              )}
            </div>
            <Switch
              checked={r.ativa}
              onCheckedChange={(checked) => updateRegra.mutate({ id: r.id, ativa: checked })}
              className="scale-75"
            />
            <button
              className="p-1 rounded hover:bg-destructive/10 text-destructive"
              onClick={() => deleteRegra.mutate(r.id)}
              title="Remover regra"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
