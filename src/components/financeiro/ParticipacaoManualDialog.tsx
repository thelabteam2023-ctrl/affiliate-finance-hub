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
import { Loader2, Plus, Calculator } from "lucide-react";

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

interface ParticipacaoManualDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

export function ParticipacaoManualDialog({
  open,
  onOpenChange,
  onSuccess,
}: ParticipacaoManualDialogProps) {
  const [loading, setLoading] = useState(false);
  const [investidores, setInvestidores] = useState<Investidor[]>([]);
  const [projetos, setProjetos] = useState<Projeto[]>([]);
  const [ciclos, setCiclos] = useState<Ciclo[]>([]);
  
  // Form state
  const [investidorId, setInvestidorId] = useState("");
  const [projetoId, setProjetoId] = useState("");
  const [cicloId, setCicloId] = useState("");
  const [percentual, setPercentual] = useState("");
  const [baseCalculo, setBaseCalculo] = useState<"LUCRO_BRUTO" | "LUCRO_LIQUIDO">("LUCRO_LIQUIDO");
  const [lucroBase, setLucroBase] = useState("");
  const [valorParticipacao, setValorParticipacao] = useState("");
  const [observacoes, setObservacoes] = useState("");

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

  const resetForm = () => {
    setInvestidorId("");
    setProjetoId("");
    setCicloId("");
    setPercentual("");
    setBaseCalculo("LUCRO_LIQUIDO");
    setLucroBase("");
    setValorParticipacao("");
    setObservacoes("");
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

    setLoading(true);
    try {
      const { data: session } = await supabase.auth.getSession();
      if (!session.session) {
        toast.error("Usuário não autenticado");
        return;
      }

      const { error } = await supabase.from("participacao_ciclos").insert({
        user_id: session.session.user.id,
        investidor_id: investidorId,
        projeto_id: projetoId,
        ciclo_id: cicloId,
        percentual_aplicado: parseFloat(percentual),
        base_calculo: baseCalculo,
        lucro_base: parseFloat(lucroBase),
        valor_participacao: parseFloat(valorParticipacao),
        status: "A_PAGAR",
        observacoes: observacoes || `Participação manual - Ajuste de acordo`,
        data_apuracao: new Date().toISOString(),
      });

      if (error) throw error;

      toast.success("Participação criada com sucesso");
      onSuccess();
      onOpenChange(false);
    } catch (error: any) {
      toast.error("Erro ao criar participação: " + error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Plus className="h-5 w-5 text-primary" />
            Nova Participação Manual
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
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
            <Label>Observações</Label>
            <Textarea
              value={observacoes}
              onChange={(e) => setObservacoes(e.target.value)}
              placeholder="Motivo do ajuste, detalhes do acordo..."
              rows={2}
            />
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
