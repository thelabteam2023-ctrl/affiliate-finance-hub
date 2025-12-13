import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";
import { HelpCircle, Handshake, Calculator, ArrowRight, Users, TrendingDown, AlertTriangle } from "lucide-react";
import { 
  formatCurrency, 
  calcularCustoOperadorProjetado,
  type OperadorVinculado
} from "@/lib/projetoAcordoUtils";

interface ProjetoAcordoSectionProps {
  projetoId: string;
  investidorId: string | null;
  isViewMode: boolean;
  onAcordoChange?: (acordo: AcordoData | null) => void;
}

export interface AcordoData {
  id?: string;
  base_calculo: 'LUCRO_LIQUIDO' | 'LUCRO_BRUTO';
  percentual_investidor: number;
  percentual_empresa: number;
  deduzir_custos_operador: boolean;
  percentual_prejuizo_investidor: number;
  observacoes: string | null;
}

export function ProjetoAcordoSection({ 
  projetoId, 
  investidorId, 
  isViewMode,
  onAcordoChange 
}: ProjetoAcordoSectionProps) {
  const [loading, setLoading] = useState(true);
  const [acordo, setAcordo] = useState<AcordoData>({
    base_calculo: 'LUCRO_LIQUIDO',
    percentual_investidor: 40,
    percentual_empresa: 60,
    deduzir_custos_operador: true,
    percentual_prejuizo_investidor: 40,
    observacoes: null,
  });
  
  const [operadores, setOperadores] = useState<OperadorVinculado[]>([]);
  const [lucroBrutoProjeto, setLucroBrutoProjeto] = useState(0);

  useEffect(() => {
    if (projetoId) {
      fetchData();
    }
  }, [projetoId]);

  useEffect(() => {
    onAcordoChange?.(acordo);
  }, [acordo, onAcordoChange]);

  const fetchData = async () => {
    setLoading(true);
    try {
      // Fetch acordo
      const { data: acordoData, error: acordoError } = await supabase
        .from("projeto_acordos")
        .select("*")
        .eq("projeto_id", projetoId)
        .eq("ativo", true)
        .maybeSingle();

      if (acordoError) throw acordoError;

      if (acordoData) {
        setAcordo({
          id: acordoData.id,
          base_calculo: acordoData.base_calculo as 'LUCRO_LIQUIDO' | 'LUCRO_BRUTO',
          percentual_investidor: acordoData.percentual_investidor,
          percentual_empresa: acordoData.percentual_empresa,
          deduzir_custos_operador: acordoData.deduzir_custos_operador,
          percentual_prejuizo_investidor: acordoData.percentual_prejuizo_investidor ?? acordoData.percentual_investidor,
          observacoes: acordoData.observacoes,
        });
      }

      // Fetch operadores vinculados
      const { data: opData, error: opError } = await supabase
        .from("operador_projetos")
        .select(`
          id,
          operador_id,
          modelo_pagamento,
          percentual,
          valor_fixo,
          base_calculo,
          faixas_escalonadas,
          operadores!inner(nome)
        `)
        .eq("projeto_id", projetoId)
        .eq("status", "ATIVO");

      if (opError) throw opError;

      if (opData) {
        setOperadores(opData.map(op => ({
          id: op.id,
          operador_id: op.operador_id,
          nome: (op.operadores as any)?.nome || "Operador",
          modelo_pagamento: op.modelo_pagamento,
          percentual: op.percentual,
          valor_fixo: op.valor_fixo,
          base_calculo: op.base_calculo,
          faixas_escalonadas: op.faixas_escalonadas,
        })));
      }

      // Fetch lucro bruto do projeto (apostas + surebets)
      const { data: apostasData } = await supabase
        .from("apostas")
        .select("lucro_prejuizo")
        .eq("projeto_id", projetoId)
        .not("lucro_prejuizo", "is", null);

      const { data: surebetsData } = await supabase
        .from("surebets")
        .select("lucro_real")
        .eq("projeto_id", projetoId)
        .not("lucro_real", "is", null);

      const lucroApostas = apostasData?.reduce((acc, a) => acc + (a.lucro_prejuizo || 0), 0) || 0;
      const lucroSurebets = surebetsData?.reduce((acc, s) => acc + (s.lucro_real || 0), 0) || 0;
      
      setLucroBrutoProjeto(lucroApostas + lucroSurebets);

    } catch (error) {
      console.error("Erro ao carregar dados do acordo:", error);
    } finally {
      setLoading(false);
    }
  };

  const handlePercentualChange = (value: number[]) => {
    const investidor = value[0];
    setAcordo(prev => ({
      ...prev,
      percentual_investidor: investidor,
      percentual_empresa: 100 - investidor,
    }));
  };

  const handleDeduzirChange = (checked: boolean) => {
    setAcordo(prev => ({
      ...prev,
      deduzir_custos_operador: checked,
      base_calculo: checked ? 'LUCRO_LIQUIDO' : 'LUCRO_BRUTO',
    }));
  };

  const handlePrejuizoPercentualChange = (value: number[]) => {
    setAcordo(prev => ({
      ...prev,
      percentual_prejuizo_investidor: value[0],
    }));
  };

  const getModeloPagamentoLabel = (modelo: string) => {
    const labels: Record<string, string> = {
      'FIXO_MENSAL': 'Fixo Mensal',
      'PORCENTAGEM': '% do Lucro',
      'HIBRIDO': 'Híbrido',
      'POR_ENTREGA': 'Por Entrega',
      'COMISSAO_ESCALONADA': 'Escalonado',
      'PROPORCIONAL_LUCRO': 'Proporcional',
    };
    return labels[modelo] || modelo;
  };

  const getOperadorCustoDisplay = (op: OperadorVinculado) => {
    switch (op.modelo_pagamento) {
      case 'FIXO_MENSAL':
        return formatCurrency(op.valor_fixo || 0);
      case 'PORCENTAGEM':
      case 'PROPORCIONAL_LUCRO':
        return `${op.percentual || 0}% do lucro`;
      case 'HIBRIDO':
        return `${formatCurrency(op.valor_fixo || 0)} + ${op.percentual || 0}%`;
      case 'POR_ENTREGA':
        return 'Por meta';
      case 'COMISSAO_ESCALONADA':
        return 'Escalonado';
      default:
        return '-';
    }
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="py-6">
          <div className="animate-pulse flex items-center justify-center">
            <span className="text-muted-foreground">Carregando acordo...</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Calculate real values
  const custoOperadorProjetado = calcularCustoOperadorProjetado(operadores, lucroBrutoProjeto);
  const lucroBase = acordo.deduzir_custos_operador 
    ? lucroBrutoProjeto - custoOperadorProjetado 
    : lucroBrutoProjeto;
  const isPrejuizo = lucroBase < 0;
  
  let valorInvestidor = 0;
  let valorEmpresa = 0;

  if (isPrejuizo) {
    const prejuizoTotal = Math.abs(lucroBase);
    valorInvestidor = -prejuizoTotal * (acordo.percentual_prejuizo_investidor / 100);
    valorEmpresa = -prejuizoTotal * ((100 - acordo.percentual_prejuizo_investidor) / 100);
  } else {
    valorInvestidor = lucroBase * (acordo.percentual_investidor / 100);
    valorEmpresa = lucroBase * (acordo.percentual_empresa / 100);
  }

  return (
    <Card className="border-primary/20 bg-primary/5">
      <CardContent className="pt-4 space-y-5">
        <div className="flex items-center gap-2 text-primary">
          <Handshake className="h-5 w-5" />
          <span className="font-semibold">Acordo de Divisão Investidor/Empresa</span>
        </div>

        {/* Operadores Vinculados */}
        <div className="p-4 rounded-lg bg-muted/30 border border-border/50 space-y-3">
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-muted-foreground" />
            <Label className="text-sm font-medium">Operadores Vinculados</Label>
          </div>
          
          {operadores.length === 0 ? (
            <p className="text-sm text-muted-foreground italic">Nenhum operador vinculado a este projeto</p>
          ) : (
            <div className="space-y-2">
              {operadores.map((op) => (
                <div key={op.id} className="flex items-center justify-between text-sm p-2 rounded bg-background/50">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{op.nome}</span>
                    <Badge variant="outline" className="text-xs">
                      {getModeloPagamentoLabel(op.modelo_pagamento)}
                    </Badge>
                  </div>
                  <span className="text-muted-foreground">{getOperadorCustoDisplay(op)}</span>
                </div>
              ))}
              <div className="flex justify-between pt-2 border-t border-border/50 text-sm">
                <span className="text-muted-foreground">Custo Projetado Total:</span>
                <span className="font-semibold text-amber-500">{formatCurrency(custoOperadorProjetado)}</span>
              </div>
            </div>
          )}
        </div>

        {/* Deduzir custos operador */}
        <div className="flex items-center justify-between p-4 rounded-lg bg-muted/30 border border-border/50">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Label className="text-sm">Deduzir custos do operador primeiro?</Label>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button type="button" className="text-muted-foreground hover:text-foreground">
                      <HelpCircle className="h-4 w-4" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="right" className="max-w-xs">
                    <div className="space-y-2 text-xs">
                      <p><strong>SIM (Líquido):</strong> Primeiro paga o operador, depois divide o restante entre investidor e empresa.</p>
                      <p><strong>NÃO (Bruto):</strong> Divide o lucro bruto diretamente. A empresa paga o operador da sua parcela.</p>
                    </div>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
            <p className="text-xs text-muted-foreground">
              {acordo.deduzir_custos_operador 
                ? "Divisão sobre lucro líquido (após pagar operador)"
                : "Divisão sobre lucro bruto (empresa absorve custo operador)"}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className={`text-xs ${!acordo.deduzir_custos_operador ? "text-primary font-semibold" : "text-muted-foreground"}`}>
              Bruto
            </span>
            <Switch
              checked={acordo.deduzir_custos_operador}
              onCheckedChange={handleDeduzirChange}
              disabled={isViewMode}
            />
            <span className={`text-xs ${acordo.deduzir_custos_operador ? "text-primary font-semibold" : "text-muted-foreground"}`}>
              Líquido
            </span>
          </div>
        </div>

        {/* Divisão percentual */}
        <div className="p-4 rounded-lg bg-muted/30 border border-border/50 space-y-4">
          <div className="flex items-center justify-between">
            <Label className="text-sm">Divisão de Lucros</Label>
            <Badge variant="outline" className="font-mono">
              {acordo.percentual_investidor}% / {acordo.percentual_empresa}%
            </Badge>
          </div>

          <Slider
            value={[acordo.percentual_investidor]}
            onValueChange={handlePercentualChange}
            min={0}
            max={100}
            step={5}
            disabled={isViewMode}
            className="py-2"
          />

          <div className="flex justify-between text-sm">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-emerald-500" />
              <span>Investidor: <strong>{acordo.percentual_investidor}%</strong></span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-primary" />
              <span>Empresa: <strong>{acordo.percentual_empresa}%</strong></span>
            </div>
          </div>

          {/* Quick presets */}
          {!isViewMode && (
            <div className="flex gap-2 flex-wrap">
              {[
                { inv: 40, emp: 60, label: "40/60" },
                { inv: 50, emp: 50, label: "50/50" },
                { inv: 33, emp: 67, label: "33/67" },
                { inv: 60, emp: 40, label: "60/40" },
              ].map((preset) => (
                <button
                  key={preset.label}
                  type="button"
                  onClick={() => setAcordo(prev => ({ 
                    ...prev, 
                    percentual_investidor: preset.inv, 
                    percentual_empresa: preset.emp 
                  }))}
                  className={`px-3 py-1 text-xs rounded-full border transition-colors ${
                    acordo.percentual_investidor === preset.inv 
                      ? "bg-primary text-primary-foreground border-primary" 
                      : "border-border hover:border-primary/50"
                  }`}
                >
                  {preset.label}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Absorção de Prejuízo - Slider */}
        <div className="p-4 rounded-lg bg-destructive/5 border border-destructive/20 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <TrendingDown className="h-4 w-4 text-destructive" />
              <Label className="text-sm font-medium">Em Caso de Prejuízo</Label>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button type="button" className="text-muted-foreground hover:text-foreground">
                      <HelpCircle className="h-4 w-4" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="right" className="max-w-xs">
                    <p className="text-xs">Define como o prejuízo será dividido entre investidor e empresa caso o projeto tenha resultado negativo.</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
            <Badge variant="outline" className="font-mono text-destructive">
              {acordo.percentual_prejuizo_investidor}% / {100 - acordo.percentual_prejuizo_investidor}%
            </Badge>
          </div>

          <Slider
            value={[acordo.percentual_prejuizo_investidor]}
            onValueChange={handlePrejuizoPercentualChange}
            min={0}
            max={100}
            step={5}
            disabled={isViewMode}
            className="py-2"
          />

          <div className="flex justify-between text-sm">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-amber-500" />
              <span>Investidor: <strong>{acordo.percentual_prejuizo_investidor}%</strong></span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-destructive" />
              <span>Empresa: <strong>{100 - acordo.percentual_prejuizo_investidor}%</strong></span>
            </div>
          </div>

          {/* Preset buttons for loss */}
          {!isViewMode && (
            <div className="flex gap-2 flex-wrap">
              <button
                type="button"
                onClick={() => setAcordo(prev => ({ 
                  ...prev, 
                  percentual_prejuizo_investidor: prev.percentual_investidor 
                }))}
                className={`px-3 py-1 text-xs rounded-full border transition-colors ${
                  acordo.percentual_prejuizo_investidor === acordo.percentual_investidor 
                    ? "bg-destructive/20 text-destructive border-destructive" 
                    : "border-border hover:border-destructive/50"
                }`}
              >
                Igual ao lucro ({acordo.percentual_investidor}/{acordo.percentual_empresa})
              </button>
              {[
                { inv: 0, label: "0/100 (Empresa)" },
                { inv: 50, label: "50/50" },
                { inv: 100, label: "100/0 (Investidor)" },
              ].map((preset) => (
                <button
                  key={preset.label}
                  type="button"
                  onClick={() => setAcordo(prev => ({ 
                    ...prev, 
                    percentual_prejuizo_investidor: preset.inv
                  }))}
                  className={`px-3 py-1 text-xs rounded-full border transition-colors ${
                    acordo.percentual_prejuizo_investidor === preset.inv 
                      ? "bg-destructive/20 text-destructive border-destructive" 
                      : "border-border hover:border-destructive/50"
                  }`}
                >
                  {preset.label}
                </button>
              ))}
            </div>
          )}

          {/* Example */}
          <div className="text-xs text-muted-foreground bg-background/50 p-2 rounded">
            💡 Exemplo com prejuízo de R$ 10.000:<br />
            • Investidor: <span className="text-amber-500">-{formatCurrency(10000 * (acordo.percentual_prejuizo_investidor / 100))}</span><br />
            • Empresa: <span className="text-destructive">-{formatCurrency(10000 * ((100 - acordo.percentual_prejuizo_investidor) / 100))}</span>
          </div>
        </div>

        {/* Simulação com dados reais */}
        <div className={`p-4 rounded-lg border border-dashed ${isPrejuizo ? 'bg-destructive/10 border-destructive/30' : 'bg-muted/50 border-border/50'}`}>
          <div className="flex items-center gap-2 mb-3">
            <Calculator className="h-4 w-4 text-muted-foreground" />
            <span className="text-xs font-medium text-muted-foreground">Simulação com Dados Reais do Projeto</span>
            {isPrejuizo && (
              <Badge variant="destructive" className="text-xs">
                <AlertTriangle className="h-3 w-3 mr-1" />
                Prejuízo
              </Badge>
            )}
          </div>
          
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Lucro Bruto (Apostas + Surebets):</span>
              <span className={lucroBrutoProjeto >= 0 ? 'text-emerald-500' : 'text-destructive'}>
                {formatCurrency(lucroBrutoProjeto)}
              </span>
            </div>
            {acordo.deduzir_custos_operador && (
              <div className="flex justify-between text-amber-500">
                <span>(-) Custo Operadores:</span>
                <span>- {formatCurrency(custoOperadorProjetado)}</span>
              </div>
            )}
            <div className="flex justify-between border-t border-border/50 pt-2">
              <span className="text-muted-foreground">Base de Divisão:</span>
              <span className={`font-medium ${lucroBase >= 0 ? '' : 'text-destructive'}`}>
                {formatCurrency(lucroBase)}
              </span>
            </div>
            
            <div className="flex items-center gap-2 mt-2">
              <ArrowRight className="h-4 w-4 text-muted-foreground" />
              <span className={valorInvestidor >= 0 ? 'text-emerald-500' : 'text-destructive'}>
                Investidor ({acordo.percentual_investidor}%): <strong>{formatCurrency(valorInvestidor)}</strong>
              </span>
            </div>
            <div className="flex items-center gap-2">
              <ArrowRight className="h-4 w-4 text-muted-foreground" />
              <span className={valorEmpresa >= 0 ? 'text-primary' : 'text-destructive'}>
                Empresa ({acordo.percentual_empresa}%): <strong>{formatCurrency(valorEmpresa)}</strong>
              </span>
            </div>
            {!acordo.deduzir_custos_operador && custoOperadorProjetado > 0 && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground mt-2">
                <span>* Empresa paga operadores ({formatCurrency(custoOperadorProjetado)}) da sua parcela</span>
              </div>
            )}
          </div>
        </div>

        {/* Observações */}
        <div className="space-y-2">
          <Label className="text-sm">Observações do Acordo</Label>
          <Textarea
            value={acordo.observacoes || ""}
            onChange={(e) => setAcordo(prev => ({ ...prev, observacoes: e.target.value || null }))}
            disabled={isViewMode}
            placeholder="Condições especiais, cláusulas adicionais..."
            rows={2}
            className="text-sm"
          />
        </div>
      </CardContent>
    </Card>
  );
}


