/**
 * Etapa 1 - Dados Básicos do Projeto
 */

import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { DatePicker } from "@/components/ui/date-picker";
import { Badge } from "@/components/ui/badge";
import { Coins, Briefcase, Percent, Info } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { InvestidorSelect } from "@/components/investidores/InvestidorSelect";
import { ProjectFormData } from "../ProjectCreationWizardTypes";
import { cn } from "@/lib/utils";

interface StepDadosBasicosProps {
  formData: ProjectFormData;
  onChange: (data: Partial<ProjectFormData>) => void;
}

export function StepDadosBasicos({ formData, onChange }: StepDadosBasicosProps) {
  // Derived state: investidor is "active" when an investor is selected
  const hasInvestidor = !!formData.investidor_id;

  const handleToggleInvestidor = (checked: boolean) => {
    if (!checked) {
      // Clear investor data when deactivating
      onChange({
        investidor_id: null,
        percentual_investidor: 0,
        base_calculo_investidor: "LUCRO_LIQUIDO",
      });
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold mb-1">Dados Básicos</h2>
        <p className="text-sm text-muted-foreground">
          Identifique o projeto. Decisões técnicas virão nas próximas etapas.
        </p>
      </div>

      {/* Grid responsivo: 3 colunas desktop (50%/25%/25%), 2 colunas tablet, stack mobile */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-[2fr_1fr_1fr] gap-4">
        <div className="space-y-2 md:col-span-2 lg:col-span-1">
          <Label>Nome *</Label>
          <Input
            value={formData.nome}
            onChange={(e) => onChange({ nome: e.target.value.toUpperCase() })}
            placeholder="NOME DO PROJETO"
            className="uppercase"
          />
        </div>
        <div className="space-y-2">
          <Label>Data de Início *</Label>
          <DatePicker
            value={formData.data_inicio || ""}
            onChange={(date) => onChange({ data_inicio: date })}
          />
        </div>
        <div className="space-y-2">
          <Label>Data de Fim Prevista</Label>
          <DatePicker
            value={formData.data_fim_prevista || ""}
            onChange={(date) => onChange({ data_fim_prevista: date })}
          />
        </div>
      </div>

      {/* Cards opcionais em grid 2 colunas (desktop) */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Investimento Crypto - Card compacto */}
        <Card className={cn(
          "transition-colors",
          formData.tem_investimento_crypto && "border-orange-500/30"
        )}>
          <CardContent className="pt-4">
            <div className="flex items-start gap-3">
              <Checkbox
                id="tem_crypto"
                checked={formData.tem_investimento_crypto}
                onCheckedChange={(checked) =>
                  onChange({ tem_investimento_crypto: checked as boolean })
                }
              />
              <div className="space-y-1 flex-1">
                <Label htmlFor="tem_crypto" className="flex items-center gap-2 cursor-pointer">
                  <Coins className="h-4 w-4 text-orange-500" />
                  Investimento Crypto
                  <Badge variant="secondary" className="text-xs ml-auto">Opcional</Badge>
                </Label>
                <p className="text-xs text-muted-foreground">
                  Ativa conciliação patrimonial obrigatória
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Participação de Investidor - Card com expansão interna */}
        <Card className={cn(
          "transition-colors",
          hasInvestidor && "border-purple-500/30"
        )}>
          <CardContent className="pt-4">
            <div className="space-y-4">
              {/* Header do card */}
              <div className="flex items-start gap-3">
                <Checkbox
                  id="tem_investidor"
                  checked={hasInvestidor}
                  onCheckedChange={handleToggleInvestidor}
                />
                <div className="space-y-1 flex-1">
                  <Label htmlFor="tem_investidor" className="flex items-center gap-2 cursor-pointer">
                    <Briefcase className="h-4 w-4 text-purple-500" />
                    Participação de Investidor
                    <Badge variant="secondary" className="text-xs ml-auto">Opcional</Badge>
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Vincule para dividir lucros
                  </p>
                </div>
              </div>

              {/* Seletor de investidor - sempre visível para permitir ativação */}
              <div className="space-y-2">
                <InvestidorSelect
                  value={formData.investidor_id || ""}
                  onValueChange={(value) => onChange({ 
                    investidor_id: value || null,
                  })}
                />
              </div>

              {/* Campos de configuração - só aparecem quando há investidor selecionado */}
              {hasInvestidor && (
                <div className="space-y-4 pt-2 border-t border-border">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label className="flex items-center gap-1 text-sm">
                        <Percent className="h-3 w-3" />
                        Percentual *
                      </Label>
                      <Input
                        type="number"
                        min="0"
                        max="100"
                        step="0.1"
                        value={formData.percentual_investidor || ""}
                        onChange={(e) =>
                          onChange({
                            percentual_investidor: parseFloat(e.target.value) || 0,
                          })
                        }
                        placeholder="Ex: 50"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-sm">Base de Cálculo *</Label>
                      <RadioGroup
                        value={formData.base_calculo_investidor || "LUCRO_LIQUIDO"}
                        onValueChange={(value) =>
                          onChange({ base_calculo_investidor: value })
                        }
                        className="flex flex-col gap-1"
                      >
                        <div className="flex items-center space-x-2">
                          <RadioGroupItem value="LUCRO_LIQUIDO" id="lucro_liquido" />
                          <label htmlFor="lucro_liquido" className="text-xs cursor-pointer">
                            Lucro Líquido
                          </label>
                        </div>
                        <div className="flex items-center space-x-2">
                          <RadioGroupItem value="LUCRO_BRUTO" id="lucro_bruto" />
                          <label htmlFor="lucro_bruto" className="text-xs cursor-pointer">
                            Lucro Bruto
                          </label>
                        </div>
                      </RadioGroup>
                    </div>
                  </div>

                  <div className="p-2 rounded-lg bg-purple-500/10 border border-purple-500/20">
                    <div className="flex items-start gap-2">
                      <Info className="h-3 w-3 text-purple-400 mt-0.5 flex-shrink-0" />
                      <p className="text-xs text-muted-foreground">
                        Receberá{" "}
                        <strong className="text-purple-400">
                          {formData.percentual_investidor || 0}%
                        </strong>{" "}
                        do{" "}
                        <strong className="text-purple-400">
                          {formData.base_calculo_investidor === "LUCRO_BRUTO"
                            ? "lucro bruto"
                            : "lucro líquido"}
                        </strong>
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
