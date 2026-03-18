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
  const hasInvestidores = (formData.investidores_projeto || []).length > 0;

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

      {/* Participação de Investidores - linha completa */}
      <Card className={cn(
        "transition-colors",
        hasInvestidores && "border-purple-500/30",
        isBrokerContext && !hasInvestidores && "border-destructive/50"
      )}>
        <CardContent className="pt-4">
          <ProjetoInvestidoresManager
            value={formData.investidores_projeto || []}
            onChange={(investidores) => onChange({ investidores_projeto: investidores })}
          />
        </CardContent>
      </Card>

      {/* Investimento Crypto */}
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
  );
}
