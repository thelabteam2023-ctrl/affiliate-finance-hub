/**
 * Etapa 1 - Dados Básicos do Projeto (Versão para Edição)
 * Reutiliza layout do wizard, com campos editáveis e status adicional
 */

import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
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

interface StepDadosBasicosEditProps {
  formData: ProjectFormData;
  onChange: (data: Partial<ProjectFormData>) => void;
  isEditMode?: boolean;
}

export function StepDadosBasicosEdit({
  formData,
  onChange,
  isEditMode = false,
}: StepDadosBasicosEditProps) {
  const hasInvestidor = !!formData.investidor_id;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold mb-1">Dados Básicos</h2>
        <p className="text-sm text-muted-foreground">
          {isEditMode
            ? "Atualize as informações do projeto."
            : "Identifique o projeto. Decisões técnicas virão nas próximas etapas."}
        </p>
      </div>

      {/* Grid responsivo: Nome, Datas e Status */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="space-y-2 lg:col-span-2">
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

      {/* Cards opcionais em grid 2 colunas */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Participação de Investidor */}
        <Card
          className={cn(
            "transition-colors",
            hasInvestidor && "border-purple-500/30"
          )}
        >
          <CardContent className="pt-4">
            <div className="space-y-4">
              <div className="flex items-start gap-3">
                <div className="p-1.5 rounded-md bg-purple-500/10">
                  <Briefcase className="h-4 w-4 text-purple-500" />
                </div>
                <div className="space-y-1 flex-1">
                  <Label className="flex items-center gap-2">
                    Participação de Investidor
                    <Badge variant="secondary" className="text-xs ml-auto">
                      Opcional
                    </Badge>
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Vincule para dividir lucros
                  </p>
                </div>
              </div>

              <div className="space-y-2">
                <InvestidorSelect
                  value={formData.investidor_id || ""}
                  onValueChange={(value) =>
                    onChange({
                      investidor_id: value || null,
                    })
                  }
                />
              </div>

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
                          <RadioGroupItem value="LUCRO_LIQUIDO" id="edit_lucro_liquido" />
                          <label htmlFor="edit_lucro_liquido" className="text-xs cursor-pointer">
                            Lucro Líquido
                          </label>
                        </div>
                        <div className="flex items-center space-x-2">
                          <RadioGroupItem value="LUCRO_BRUTO" id="edit_lucro_bruto" />
                          <label htmlFor="edit_lucro_bruto" className="text-xs cursor-pointer">
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

        {/* Investimento Crypto */}
        <Card
          className={cn(
            "transition-colors",
            formData.tem_investimento_crypto && "border-orange-500/30"
          )}
        >
          <CardContent className="pt-4">
            <div className="flex items-start gap-3">
              <Checkbox
                id="edit_tem_crypto"
                checked={formData.tem_investimento_crypto}
                onCheckedChange={(checked) =>
                  onChange({ tem_investimento_crypto: checked as boolean })
                }
              />
              <div className="space-y-1 flex-1">
                <Label htmlFor="edit_tem_crypto" className="flex items-center gap-2 cursor-pointer">
                  <Coins className="h-4 w-4 text-orange-500" />
                  Investimento Crypto
                  <Badge variant="secondary" className="text-xs ml-auto">
                    Opcional
                  </Badge>
                </Label>
                <p className="text-xs text-muted-foreground">
                  Ativa conciliação patrimonial obrigatória
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
