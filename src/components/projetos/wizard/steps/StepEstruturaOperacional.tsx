/**
 * Etapa 3 - Estrutura Operacional do Projeto
 */

import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Info, CheckCircle2 } from "lucide-react";
import { ProjectFormData } from "../ProjectCreationWizardTypes";

const MODELOS_ABSORCAO = [
  {
    value: "EMPRESA_100",
    label: "Empresa absorve 100%",
    description: "Taxas são custo operacional da empresa",
  },
  {
    value: "OPERADOR_100",
    label: "Operador absorve 100%",
    description: "Taxas deduzidas do lucro antes de calcular comissão",
  },
  {
    value: "PROPORCIONAL",
    label: "Divisão proporcional (50/50)",
    description: "Taxas divididas igualmente entre empresa e operador",
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
  // Lógica condicional: taxas só fazem sentido em USD ou com crypto
  const showTaxasSection = 
    formData.moeda_consolidacao === "USD" || 
    formData.tem_investimento_crypto === true;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold mb-1">Estrutura Operacional</h2>
        <p className="text-sm text-muted-foreground">
          Defina como o projeto opera. Módulos e ciclos dependem desse contexto.
        </p>
      </div>

      {/* Modelo de Absorção de Taxas - CONDICIONAL */}
      {showTaxasSection ? (
        <div className="space-y-3">
          <Label className="text-sm font-medium">Modelo de Absorção de Taxas</Label>
          <p className="text-xs text-muted-foreground leading-relaxed">
            Define quem absorve os custos operacionais de conversão, transferências 
            e taxas associadas a operações internacionais ou cripto.
          </p>
          
          <div className="grid gap-3">
            {MODELOS_ABSORCAO.map((modelo) => (
              <Card
                key={modelo.value}
                className={`cursor-pointer transition-all ${
                  formData.modelo_absorcao_taxas === modelo.value
                    ? "border-primary bg-primary/5"
                    : "hover:border-primary/50"
                }`}
                onClick={() => onChange({ modelo_absorcao_taxas: modelo.value })}
              >
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-medium">{modelo.label}</div>
                      <p className="text-xs text-muted-foreground mt-1">
                        {modelo.description}
                      </p>
                    </div>
                    {formData.modelo_absorcao_taxas === modelo.value && (
                      <Badge>Selecionado</Badge>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      ) : (
        /* Mensagem simples para BRL sem crypto */
        <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-emerald-500 flex-shrink-0" />
            <p className="text-sm text-muted-foreground">
              Projeto em <span className="text-emerald-400 font-medium">BRL</span> — sem taxas de conversão aplicáveis.
            </p>
          </div>
        </div>
      )}

      {/* Info de operadores (será configurado após criação) */}
      <div className="p-4 rounded-lg bg-blue-500/10 border border-blue-500/20">
        <div className="flex items-start gap-3">
          <Info className="h-5 w-5 text-blue-500 flex-shrink-0 mt-0.5" />
          <div className="space-y-1">
            <div className="font-medium text-blue-500">Operadores</div>
            <p className="text-sm text-muted-foreground">
              Após criar o projeto, você poderá vincular operadores e definir acordos 
              de comissionamento individuais em <strong>Gestão → Operadores</strong>.
            </p>
          </div>
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
