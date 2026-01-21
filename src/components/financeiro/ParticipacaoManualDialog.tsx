import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { Loader2, Plus, Calculator, Gift, TrendingUp } from "lucide-react";
import { useWorkspace } from "@/hooks/useWorkspace";

interface Investidor {
  id: string;
  nome: string;
}

interface Projeto {
  id: string;
  nome: string;
}

interface Ciclo {
  id: string;
  numero_ciclo: number;
  lucro_liquido: number | null;
}

interface ParticipacaoExistente {
  id: string;
  valor_participacao: number;
  data_apuracao: string;
  projeto_ciclos?: { numero_ciclo: number } | null;
}

interface ParticipacaoManualDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

const TIPOS_PARTICIPACAO = [
  { value: "REGULAR", label: "Regular", description: "Participação padrão calculada normalmente" },
  { value: "AJUSTE_POSITIVO", label: "Ajuste Positivo", description: "Valor adicional a pagar ao investidor" },
  { value: "BONUS", label: "Bônus", description: "Bonificação extra ao investidor" },
] as const;

type TipoParticipacao = typeof TIPOS_PARTICIPACAO[number]["value"];

export function ParticipacaoManualDialog({
  open,
  onOpenChange,
  onSuccess,
}: ParticipacaoManualDialogProps) {
  const { workspaceId } = useWorkspace();
  const [loading, setLoading] = useState(false);
  const [investidores, setInvestidores] = useState<Investidor[]>([]);
  const [projetos, setProjetos] = useState<Projeto[]>([]);
  const [ciclos, setCiclos] = useState<Ciclo[]>([]);
  const [participacoesExistentes, setParticipacoesExistentes] = useState<ParticipacaoExistente[]>([]);
  
  // Form state
  const [tipoParticipacao, setTipoParticipacao] = useState<TipoParticipacao>("REGULAR");
  const [investidorId, setInvestidorId] = useState("");
  const [projetoId, setProjetoId] = useState("");
  const [cicloId, setCicloId] = useState("");
  const [percentual, setPercentual] = useState("");
  const [baseCalculo, setBaseCalculo] = useState<"LUCRO_BRUTO" | "LUCRO_LIQUIDO">("LUCRO_LIQUIDO");
  const [lucroBase, setLucroBase] = useState("");
  const [valorParticipacao, setValorParticipacao] = useState("");
  const [observacoes, setObservacoes] = useState("");
  const [participacaoReferenciaId, setParticipacaoReferenciaId] = useState("");

  useEffect(() => {
    if (open) {
      fetchInvestidores();
      fetchProjetos();
      resetForm();
    }
  }, [open]);

  useEffect(() => {
    if (projetoId) {
      fetchCiclos(projetoId);
    } else {
      setCiclos([]);
      setCicloId("");
    }
  }, [projetoId]);

  // Fetch existing participations when investidor changes (for AJUSTE_POSITIVO reference)
  useEffect(() => {
    if (investidorId && tipoParticipacao === "AJUSTE_POSITIVO") {
      fetchParticipacoesExistentes(investidorId);
    } else {
      setParticipacoesExistentes([]);
      setParticipacaoReferenciaId("");
    }
  }, [investidorId, tipoParticipacao]);

  // Auto-calculate valor_participacao when percentual or lucro_base changes
  useEffect(() => {
    const perc = parseFloat(percentual) || 0;
    const lucro = parseFloat(lucroBase) || 0;
    if (perc > 0 && lucro > 0) {
      const valor = (lucro * perc) / 100;
      setValorParticipacao(valor.toFixed(2));
    }
  }, [percentual, lucroBase]);

  // Auto-fill lucro_base when selecting a cycle
  useEffect(() => {
    if (cicloId) {
      const cicloSelecionado = ciclos.find(c => c.id === cicloId);
      if (cicloSelecionado?.lucro_liquido) {
        setLucroBase(cicloSelecionado.lucro_liquido.toString());
      }
    }
  }, [cicloId, ciclos]);

  const fetchInvestidores = async () => {
    const { data } = await supabase
      .from("investidores")
      .select("id, nome")
      .eq("status", "ATIVO")
      .order("nome");
    setInvestidores(data || []);
  };

  const fetchProjetos = async () => {
    const { data } = await supabase
      .from("projetos")
      .select("id, nome")
      .in("status", ["PLANEJADO", "EM_ANDAMENTO"])
      .order("nome");
    setProjetos(data || []);
  };

  const fetchCiclos = async (projectId: string) => {
    const { data } = await supabase
      .from("projeto_ciclos")
      .select("id, numero_ciclo, lucro_liquido")
      .eq("projeto_id", projectId)
      .order("numero_ciclo", { ascending: false });
    setCiclos(data || []);
  };

  const fetchParticipacoesExistentes = async (invId: string) => {
    const { data } = await supabase
      .from("participacao_ciclos")
      .select("id, valor_participacao, data_apuracao, projeto_ciclos(numero_ciclo)")
      .eq("investidor_id", invId)
      .order("data_apuracao", { ascending: false })
      .limit(20);
    setParticipacoesExistentes(data || []);
  };

  const resetForm = () => {
    setTipoParticipacao("REGULAR");
    setInvestidorId("");
    setProjetoId("");
    setCicloId("");
    setPercentual("");
    setBaseCalculo("LUCRO_LIQUIDO");
    setLucroBase("");
    setValorParticipacao("");
    setObservacoes("");
    setParticipacaoReferenciaId("");
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(value);
  };

  const handleSubmit = async () => {
    if (!investidorId || !projetoId || !cicloId || !percentual || !lucroBase || !valorParticipacao) {
      toast.error("Preencha todos os campos obrigatórios");
      return;
    }

    // Observações obrigatórias para tipos não-REGULAR
    if (tipoParticipacao !== "REGULAR" && !observacoes.trim()) {
      toast.error("Observações são obrigatórias para ajustes e bônus");
      return;
    }

    setLoading(true);
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

      const defaultObservacao = tipoParticipacao === "REGULAR" 
        ? "Participação manual - criação direta"
        : tipoParticipacao === "AJUSTE_POSITIVO"
        ? "Ajuste positivo - valor adicional"
        : "Bônus - bonificação extra";

      const { error } = await supabase.from("participacao_ciclos").insert({
        user_id: session.session.user.id,
        workspace_id: workspaceId,
        investidor_id: investidorId,
        projeto_id: projetoId,
        ciclo_id: cicloId,
        percentual_aplicado: parseFloat(percentual),
        base_calculo: baseCalculo,
        lucro_base: parseFloat(lucroBase),
        valor_participacao: parseFloat(valorParticipacao),
        status: "A_PAGAR",
        tipo_participacao: tipoParticipacao,
        participacao_referencia_id: participacaoReferenciaId || null,
        observacoes: observacoes.trim() || defaultObservacao,
        data_apuracao: new Date().toISOString(),
      });

      if (error) throw error;

      const tipoLabel = TIPOS_PARTICIPACAO.find(t => t.value === tipoParticipacao)?.label;
      toast.success(`Participação (${tipoLabel}) criada com sucesso`);
      onSuccess();
      onOpenChange(false);
    } catch (error: any) {
      toast.error("Erro ao criar participação: " + error.message);
    } finally {
      setLoading(false);
    }
  };

  const getTipoIcon = (tipo: TipoParticipacao) => {
    switch (tipo) {
      case "AJUSTE_POSITIVO":
        return <TrendingUp className="h-4 w-4 text-success" />;
      case "BONUS":
        return <Gift className="h-4 w-4 text-amber-500" />;
      default:
        return <Calculator className="h-4 w-4 text-muted-foreground" />;
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Plus className="h-5 w-5 text-primary" />
            Nova Participação Manual
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Tipo de Participação */}
          <div className="space-y-2">
            <Label>Tipo *</Label>
            <Select value={tipoParticipacao} onValueChange={(v) => setTipoParticipacao(v as TipoParticipacao)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TIPOS_PARTICIPACAO.map((tipo) => (
                  <SelectItem key={tipo.value} value={tipo.value}>
                    <div className="flex items-center gap-2">
                      {getTipoIcon(tipo.value)}
                      <span>{tipo.label}</span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              {TIPOS_PARTICIPACAO.find(t => t.value === tipoParticipacao)?.description}
            </p>
          </div>

          {/* Investidor */}
          <div className="space-y-2">
            <Label>Investidor *</Label>
            <Select value={investidorId} onValueChange={setInvestidorId}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione o investidor" />
              </SelectTrigger>
              <SelectContent>
                {investidores.map((inv) => (
                  <SelectItem key={inv.id} value={inv.id}>
                    {inv.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Projeto */}
          <div className="space-y-2">
            <Label>Projeto *</Label>
            <Select value={projetoId} onValueChange={setProjetoId}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione o projeto" />
              </SelectTrigger>
              <SelectContent>
                {projetos.map((proj) => (
                  <SelectItem key={proj.id} value={proj.id}>
                    {proj.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Ciclo */}
          <div className="space-y-2">
            <Label>Ciclo *</Label>
            <Select value={cicloId} onValueChange={setCicloId} disabled={!projetoId}>
              <SelectTrigger>
                <SelectValue placeholder={projetoId ? "Selecione o ciclo" : "Selecione um projeto primeiro"} />
              </SelectTrigger>
              <SelectContent>
                {ciclos.map((ciclo) => (
                  <SelectItem key={ciclo.id} value={ciclo.id}>
                    Ciclo #{ciclo.numero_ciclo} 
                    {ciclo.lucro_liquido !== null && ` (Lucro: ${formatCurrency(ciclo.lucro_liquido)})`}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Referência (apenas para AJUSTE_POSITIVO) */}
          {tipoParticipacao === "AJUSTE_POSITIVO" && investidorId && (
            <div className="space-y-2">
              <Label>Referência (opcional)</Label>
              <Select value={participacaoReferenciaId} onValueChange={setParticipacaoReferenciaId}>
                <SelectTrigger>
                  <SelectValue placeholder="Vincular a uma participação existente" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">Nenhuma referência</SelectItem>
                  {participacoesExistentes.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      Ciclo #{p.projeto_ciclos?.numero_ciclo || "?"} - {formatCurrency(p.valor_participacao)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Vincule este ajuste a uma participação existente para rastreabilidade
              </p>
            </div>
          )}

          {/* Base de Cálculo e Percentual */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Base de Cálculo *</Label>
              <Select value={baseCalculo} onValueChange={(v) => setBaseCalculo(v as "LUCRO_BRUTO" | "LUCRO_LIQUIDO")}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="LUCRO_LIQUIDO">Lucro Líquido</SelectItem>
                  <SelectItem value="LUCRO_BRUTO">Lucro Bruto</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Percentual (%) *</Label>
              <Input
                type="number"
                step="0.01"
                min="0"
                max="100"
                value={percentual}
                onChange={(e) => setPercentual(e.target.value)}
                placeholder="Ex: 40"
              />
            </div>
          </div>

          {/* Lucro Base e Valor Participação */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Lucro Base (R$) *</Label>
              <Input
                type="number"
                step="0.01"
                value={lucroBase}
                onChange={(e) => setLucroBase(e.target.value)}
                placeholder="0,00"
              />
            </div>

            <div className="space-y-2">
              <Label className="flex items-center gap-1">
                Valor Participação (R$) *
                <Calculator className="h-3 w-3 text-muted-foreground" />
              </Label>
              <Input
                type="number"
                step="0.01"
                value={valorParticipacao}
                onChange={(e) => setValorParticipacao(e.target.value)}
                placeholder="0,00"
                className="font-semibold"
              />
              <p className="text-xs text-muted-foreground">
                Calculado automaticamente ou edite manualmente
              </p>
            </div>
          </div>

          {/* Preview do cálculo */}
          {parseFloat(lucroBase) > 0 && parseFloat(percentual) > 0 && (
            <div className="p-3 rounded-lg bg-muted/50 text-sm">
              <p className="text-muted-foreground">
                {formatCurrency(parseFloat(lucroBase))} × {percentual}% = {" "}
                <span className="font-semibold text-foreground">
                  {formatCurrency(parseFloat(valorParticipacao) || 0)}
                </span>
              </p>
            </div>
          )}

          {/* Observações */}
          <div className="space-y-2">
            <Label>
              Observações {tipoParticipacao !== "REGULAR" && <span className="text-destructive">*</span>}
            </Label>
            <Textarea
              value={observacoes}
              onChange={(e) => setObservacoes(e.target.value)}
              placeholder={
                tipoParticipacao === "REGULAR" 
                  ? "Motivo da criação manual..." 
                  : "Justificativa obrigatória para ajustes e bônus..."
              }
              rows={2}
            />
            {tipoParticipacao !== "REGULAR" && (
              <p className="text-xs text-amber-500">
                Obrigatório para {tipoParticipacao === "AJUSTE_POSITIVO" ? "ajustes" : "bônus"}
              </p>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
            Cancelar
          </Button>
          <Button onClick={handleSubmit} disabled={loading}>
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Criando...
              </>
            ) : (
              <>
                <Plus className="h-4 w-4 mr-2" />
                Criar Participação
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}