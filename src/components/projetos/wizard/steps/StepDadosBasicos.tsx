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

interface StepDadosBasicosProps {
  formData: ProjectFormData;
  onChange: (data: Partial<ProjectFormData>) => void;
}

export function StepDadosBasicos({ formData, onChange }: StepDadosBasicosProps) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold mb-1">Dados Básicos</h2>
        <p className="text-sm text-muted-foreground">
          Identifique o projeto. Decisões técnicas virão nas próximas etapas.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Nome *</Label>
          <Input
            value={formData.nome}
            onChange={(e) => onChange({ nome: e.target.value.toUpperCase() })}
            placeholder="NOME DO PROJETO"
            className="uppercase"
          />
        </div>
        <div className="space-y-2">
          <Label>Status</Label>
          <Select
            value={formData.status}
            onValueChange={(value) => onChange({ status: value })}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="PLANEJADO">Planejado</SelectItem>
              <SelectItem value="EM_ANDAMENTO">Em Andamento</SelectItem>
              <SelectItem value="PAUSADO">Pausado</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-2">
        <Label>Descrição</Label>
        <Textarea
          value={formData.descricao || ""}
          onChange={(e) => onChange({ descricao: e.target.value || null })}
          placeholder="Descrição do projeto..."
          rows={3}
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
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

      {/* Investimento Crypto */}
      <Card className={formData.tem_investimento_crypto ? "border-orange-500/30" : ""}>
        <CardContent className="pt-4">
          <div className="flex items-start gap-3">
            <Checkbox
              id="tem_crypto"
              checked={formData.tem_investimento_crypto}
              onCheckedChange={(checked) =>
                onChange({ tem_investimento_crypto: checked as boolean })
              }
            />
            <div className="space-y-1">
              <Label htmlFor="tem_crypto" className="flex items-center gap-2 cursor-pointer">
                <Coins className="h-4 w-4 text-orange-500" />
                Projeto com Investimento Crypto
              </Label>
              <p className="text-xs text-muted-foreground">
                Ativa a obrigatoriedade de conciliação patrimonial antes de finalizar o projeto
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Participação de Investidor */}
      <Card className={formData.investidor_id ? "border-purple-500/30" : ""}>
        <CardContent className="pt-4">
          <div className="flex items-center gap-3 mb-4">
            <Briefcase className="h-5 w-5 text-purple-500" />
            <div>
              <Label className="text-base font-medium">Participação de Investidor</Label>
              <p className="text-xs text-muted-foreground">
                Opcional: vincule um investidor para dividir lucros
              </p>
            </div>
          </div>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Investidor</Label>
              <InvestidorSelect
                value={formData.investidor_id || ""}
                onValueChange={(value) => onChange({ investidor_id: value || null })}
              />
            </div>

            {formData.investidor_id && (
              <>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="flex items-center gap-1">
                      <Percent className="h-3 w-3" />
                      Percentual de Participação *
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
                    <Label>Base de Cálculo *</Label>
                    <RadioGroup
                      value={formData.base_calculo_investidor || "LUCRO_LIQUIDO"}
                      onValueChange={(value) =>
                        onChange({ base_calculo_investidor: value })
                      }
                      className="flex flex-col gap-2"
                    >
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="LUCRO_LIQUIDO" id="lucro_liquido" />
                        <label htmlFor="lucro_liquido" className="text-sm cursor-pointer">
                          Lucro Líquido
                        </label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="LUCRO_BRUTO" id="lucro_bruto" />
                        <label htmlFor="lucro_bruto" className="text-sm cursor-pointer">
                          Lucro Bruto
                        </label>
                      </div>
                    </RadioGroup>
                  </div>
                </div>

                <div className="p-3 rounded-lg bg-purple-500/10 border border-purple-500/20">
                  <div className="flex items-start gap-2">
                    <Info className="h-4 w-4 text-purple-400 mt-0.5 flex-shrink-0" />
                    <p className="text-xs text-muted-foreground">
                      O investidor receberá{" "}
                      <strong className="text-purple-400">
                        {formData.percentual_investidor || 0}%
                      </strong>{" "}
                      do{" "}
                      <strong className="text-purple-400">
                        {formData.base_calculo_investidor === "LUCRO_BRUTO"
                          ? "lucro bruto"
                          : "lucro líquido"}
                      </strong>{" "}
                      de cada ciclo fechado deste projeto.
                    </p>
                  </div>
                </div>
              </>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
