import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";
import { HelpCircle, Handshake, Calculator, ArrowRight } from "lucide-react";
import { toast } from "sonner";
import { formatCurrency } from "@/lib/projetoAcordoUtils";

interface ProjetoAcordoSectionProps {
  projetoId: string;
  investidorId: string | null;
  isViewMode: boolean;
  onAcordoChange?: (acordo: AcordoData | null) => void;
}

interface AcordoData {
  id?: string;
  base_calculo: 'LUCRO_LIQUIDO' | 'LUCRO_BRUTO';
  percentual_investidor: number;
  percentual_empresa: number;
  deduzir_custos_operador: boolean;
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
    observacoes: null,
  });

  useEffect(() => {
    if (projetoId) {
      fetchAcordo();
    }
  }, [projetoId]);

  useEffect(() => {
    onAcordoChange?.(acordo);
  }, [acordo, onAcordoChange]);

  const fetchAcordo = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("projeto_acordos")
        .select("*")
        .eq("projeto_id", projetoId)
        .eq("ativo", true)
        .maybeSingle();

      if (error) throw error;

      if (data) {
        setAcordo({
          id: data.id,
          base_calculo: data.base_calculo as 'LUCRO_LIQUIDO' | 'LUCRO_BRUTO',
          percentual_investidor: data.percentual_investidor,
          percentual_empresa: data.percentual_empresa,
          deduzir_custos_operador: data.deduzir_custos_operador,
          observacoes: data.observacoes,
        });
      }
    } catch (error) {
      console.error("Erro ao carregar acordo:", error);
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

  // Example calculation for visualization
  const exemploLucroBruto = 10000;
  const exemploCustoOperador = 2000;
  const exemploLucroBase = acordo.deduzir_custos_operador 
    ? exemploLucroBruto - exemploCustoOperador 
    : exemploLucroBruto;
  const exemploInvestidor = exemploLucroBase * (acordo.percentual_investidor / 100);
  const exemploEmpresa = exemploLucroBase * (acordo.percentual_empresa / 100);

  return (
    <Card className="border-primary/20 bg-primary/5">
      <CardContent className="pt-4 space-y-5">
        <div className="flex items-center gap-2 text-primary">
          <Handshake className="h-5 w-5" />
          <span className="font-semibold">Acordo de Divisão Investidor/Empresa</span>
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

        {/* Exemplo de cálculo */}
        <div className="p-4 rounded-lg bg-muted/50 border border-dashed border-border/50">
          <div className="flex items-center gap-2 mb-3 text-muted-foreground">
            <Calculator className="h-4 w-4" />
            <span className="text-xs font-medium">Exemplo de Cálculo</span>
          </div>
          
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Lucro Bruto:</span>
              <span>{formatCurrency(exemploLucroBruto)}</span>
            </div>
            {acordo.deduzir_custos_operador && (
              <div className="flex justify-between text-amber-500">
                <span>(-) Custo Operador:</span>
                <span>- {formatCurrency(exemploCustoOperador)}</span>
              </div>
            )}
            <div className="flex justify-between border-t border-border/50 pt-2">
              <span className="text-muted-foreground">Base de Divisão:</span>
              <span className="font-medium">{formatCurrency(exemploLucroBase)}</span>
            </div>
            <div className="flex items-center gap-2 mt-2">
              <ArrowRight className="h-4 w-4 text-muted-foreground" />
              <span className="text-emerald-500">
                Investidor ({acordo.percentual_investidor}%): <strong>{formatCurrency(exemploInvestidor)}</strong>
              </span>
            </div>
            <div className="flex items-center gap-2">
              <ArrowRight className="h-4 w-4 text-muted-foreground" />
              <span className="text-primary">
                Empresa ({acordo.percentual_empresa}%): <strong>{formatCurrency(exemploEmpresa)}</strong>
              </span>
            </div>
            {!acordo.deduzir_custos_operador && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground mt-2">
                <span>* Empresa paga operador ({formatCurrency(exemploCustoOperador)}) da sua parcela</span>
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

export type { AcordoData };
