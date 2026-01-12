/**
 * Etapa Taxas - Modelo de Absorção de Taxas
 * Esta etapa só é exibida quando moeda = USD ou tem_investimento_crypto = true
 */

import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Building2, User, Split } from "lucide-react";
import { ProjectFormData } from "../ProjectCreationWizardTypes";
import { cn } from "@/lib/utils";

const MODELOS_ABSORCAO = [
  {
    value: "EMPRESA_100",
    label: "Empresa 100%",
    description: "Taxas são custo operacional da empresa",
    icon: Building2,
  },
  {
    value: "OPERADOR_100",
    label: "Operador 100%",
    description: "Taxas deduzidas do lucro antes de calcular comissão",
    icon: User,
  },
  {
    value: "PROPORCIONAL",
    label: "Divisão proporcional",
    description: "Taxas divididas entre empresa e operador",
    icon: Split,
  },
];

interface StepEstruturaOperacionalProps {
  formData: ProjectFormData;
  onChange: (data: Partial<ProjectFormData>) => void;
}

export function StepEstruturaOperacional({
  formData,
  onChange,
}: StepEstruturaOperacionalProps) {
  const handleModeloChange = (value: string) => {
    // Reset percentuais ao mudar de proporcional para outro modelo
    if (value !== "PROPORCIONAL") {
      onChange({ 
        modelo_absorcao_taxas: value,
        divisao_empresa_percentual: 50,
        divisao_operador_percentual: 50,
      });
    } else {
      onChange({ modelo_absorcao_taxas: value });
    }
  };

  const handleEmpresaPercentualChange = (value: string) => {
    const numValue = parseInt(value) || 0;
    const clampedValue = Math.min(100, Math.max(0, numValue));
    onChange({
      divisao_empresa_percentual: clampedValue,
      divisao_operador_percentual: 100 - clampedValue,
    });
  };

  const handleOperadorPercentualChange = (value: string) => {
    const numValue = parseInt(value) || 0;
    const clampedValue = Math.min(100, Math.max(0, numValue));
    onChange({
      divisao_operador_percentual: clampedValue,
      divisao_empresa_percentual: 100 - clampedValue,
    });
  };

  return (
    <div className="space-y-6">
      {/* Modelo de Absorção de Taxas */}
      <div className="space-y-3">
        <Label className="text-sm font-medium">Modelo de Absorção de Taxas</Label>
        <p className="text-xs text-muted-foreground leading-relaxed">
          Define quem absorve os custos operacionais de conversão, transferências 
          e taxas associadas a operações internacionais ou cripto.
        </p>
        
        {/* Grid horizontal - 3 colunas no desktop */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {MODELOS_ABSORCAO.map((modelo) => {
            const Icon = modelo.icon;
            const isSelected = formData.modelo_absorcao_taxas === modelo.value;
            const isProporcional = modelo.value === "PROPORCIONAL";
            
            return (
              <Card
                key={modelo.value}
                className={cn(
                  "cursor-pointer transition-all h-full",
                  isSelected
                    ? "border-primary bg-primary/5 ring-1 ring-primary"
                    : "hover:border-primary/50"
                )}
                onClick={() => handleModeloChange(modelo.value)}
              >
                <CardContent className="p-4 flex flex-col h-full">
                  <div className="flex items-start gap-3 flex-1">
                    <div className={cn(
                      "p-2 rounded-lg shrink-0",
                      isSelected ? "bg-primary/10" : "bg-muted"
                    )}>
                      <Icon className={cn(
                        "h-4 w-4",
                        isSelected ? "text-primary" : "text-muted-foreground"
                      )} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className={cn(
                        "font-medium text-sm",
                        isSelected && "text-primary"
                      )}>
                        {modelo.label}
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">
                        {modelo.description}
                      </p>
                    </div>
                  </div>
                  
                  {/* Campos de divisão proporcional - aparece quando selecionado */}
                  {isProporcional && isSelected && (
                    <div 
                      className="mt-4 pt-4 border-t border-border space-y-3"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1">
                          <Label className="text-xs text-muted-foreground">
                            Empresa
                          </Label>
                          <div className="relative">
                            <Input
                              type="number"
                              min={0}
                              max={100}
                              value={formData.divisao_empresa_percentual}
                              onChange={(e) => handleEmpresaPercentualChange(e.target.value)}
                              className="pr-7 h-9 text-sm"
                            />
                            <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                              %
                            </span>
                          </div>
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs text-muted-foreground">
                            Operador
                          </Label>
                          <div className="relative">
                            <Input
                              type="number"
                              min={0}
                              max={100}
                              value={formData.divisao_operador_percentual}
                              onChange={(e) => handleOperadorPercentualChange(e.target.value)}
                              className="pr-7 h-9 text-sm"
                            />
                            <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                              %
                            </span>
                          </div>
                        </div>
                      </div>
                      <p className="text-[10px] text-muted-foreground text-center">
                        Soma: {formData.divisao_empresa_percentual + formData.divisao_operador_percentual}%
                      </p>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>

      {/* Resumo das Configurações Anteriores */}
      <div className="p-4 rounded-lg bg-muted/30 border">
        <div className="text-xs text-muted-foreground mb-2 font-medium">Resumo do Projeto</div>
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <span className="text-muted-foreground">Nome:</span>{" "}
            <span className="font-medium">{formData.nome || "—"}</span>
          </div>
          <div>
            <span className="text-muted-foreground">Moeda:</span>{" "}
            <span className="font-medium">{formData.moeda_consolidacao}</span>
          </div>
          {formData.moeda_consolidacao === "USD" && (
            <div>
              <span className="text-muted-foreground">Cotação:</span>{" "}
              <span className="font-medium">
                {formData.fonte_cotacao === "PTAX" 
                  ? "PTAX automática" 
                  : formData.cotacao_trabalho 
                    ? `R$ ${formData.cotacao_trabalho}` 
                    : "Pendente"}
              </span>
            </div>
          )}
          <div>
            <span className="text-muted-foreground">Crypto:</span>{" "}
            <span className="font-medium">
              {formData.tem_investimento_crypto ? "Sim" : "Não"}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
