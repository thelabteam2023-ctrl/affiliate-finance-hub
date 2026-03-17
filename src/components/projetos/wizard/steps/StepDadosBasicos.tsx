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
import { Coins, Briefcase, Percent, Info, Target, TrendingUp } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ProjetoInvestidoresManager } from "@/components/projetos/ProjetoInvestidoresManager";
import { ProjectFormData } from "../ProjectCreationWizardTypes";
import { cn } from "@/lib/utils";
import { TIPO_PROJETO_CONFIG, TipoProjeto } from "@/types/projeto";
import { TipoProjetoIcon } from "@/components/projetos/TipoProjetoIcon";

interface StepDadosBasicosProps {
  formData: ProjectFormData;
  onChange: (data: Partial<ProjectFormData>) => void;
  /** Se true, investidor é obrigatório (contexto Broker) */
  isBrokerContext?: boolean;
}

export function StepDadosBasicos({ formData, onChange, isBrokerContext = false }: StepDadosBasicosProps) {
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

      {/* Nome + Tipo (linha 1), Datas (linha 2) */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
          <Label className="flex items-center gap-2">
            <Target className="h-3.5 w-3.5" />
            Tipo do Projeto *
          </Label>
          <Select
            value={formData.tipo_projeto}
            onValueChange={(value) => onChange({ tipo_projeto: value })}
          >
            <SelectTrigger>
              <SelectValue placeholder="Selecione o tipo" />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(TIPO_PROJETO_CONFIG).map(([key, config]) => (
                <SelectItem key={key} value={key}>
                  <div className="flex items-center gap-2">
                    <TipoProjetoIcon lucideIcon={config.lucideIcon} className="h-3.5 w-3.5" />
                    <span>{config.label}</span>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
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

      {/* Métrica de Lucro do Ciclo */}
      <Card className="border-border">
        <CardContent className="pt-4">
          <div className="space-y-3">
            <Label className="flex items-center gap-2">
              <TrendingUp className="h-3.5 w-3.5" />
              Métrica de Lucro do Ciclo
            </Label>
            <p className="text-xs text-muted-foreground">
              Define como o lucro será calculado nos ciclos de apuração deste projeto.
            </p>
            <RadioGroup
              value={formData.metrica_lucro_ciclo || "operacional"}
              onValueChange={(value) => onChange({ metrica_lucro_ciclo: value as "operacional" | "realizado" })}
              className="grid grid-cols-1 md:grid-cols-2 gap-3"
            >
              <label
                htmlFor="metrica_operacional"
                className={cn(
                  "flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors",
                  formData.metrica_lucro_ciclo === "operacional"
                    ? "border-primary bg-primary/5"
                    : "border-border hover:border-muted-foreground/30"
                )}
              >
                <RadioGroupItem value="operacional" id="metrica_operacional" className="mt-0.5" />
                <div className="space-y-1">
                  <span className="text-sm font-medium">Operacional</span>
                  <p className="text-xs text-muted-foreground">
                    Apostas + Cashback + Giros − Perdas. Mede a produção, independente de saques.
                  </p>
                </div>
              </label>
              <label
                htmlFor="metrica_realizado"
                className={cn(
                  "flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors",
                  formData.metrica_lucro_ciclo === "realizado"
                    ? "border-primary bg-primary/5"
                    : "border-border hover:border-muted-foreground/30"
                )}
              >
                <RadioGroupItem value="realizado" id="metrica_realizado" className="mt-0.5" />
                <div className="space-y-1">
                  <span className="text-sm font-medium">Realizado (Saques − Depósitos)</span>
                  <p className="text-xs text-muted-foreground">
                    Fluxo de caixa efetivo. O lucro só é contabilizado quando o capital é sacado.
                  </p>
                </div>
              </label>
            </RadioGroup>
          </div>
        </CardContent>
      </Card>

      {/* Cards opcionais em grid 2 colunas (desktop) */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Participação de Investidor - Card com expansão interna */}
        <Card className={cn(
          "transition-colors",
          hasInvestidor && "border-purple-500/30",
          isBrokerContext && !hasInvestidor && "border-destructive/50"
        )}>
          <CardContent className="pt-4">
            <div className="space-y-4">
              {/* Header do card */}
              <div className="flex items-start gap-3">
                <div className="p-1.5 rounded-md bg-purple-500/10">
                  <Briefcase className="h-4 w-4 text-purple-500" />
                </div>
                <div className="space-y-1 flex-1">
                  <Label className="flex items-center gap-2">
                    Participação de Investidor
                    <Badge variant={isBrokerContext ? "destructive" : "secondary"} className="text-xs ml-auto">
                      {isBrokerContext ? "Obrigatório" : "Opcional"}
                    </Badge>
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    {isBrokerContext ? "Selecione o investidor dono das contas" : "Vincule para dividir lucros"}
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
      </div>
    </div>
  );
}
