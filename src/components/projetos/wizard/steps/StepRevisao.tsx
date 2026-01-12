/**
 * Etapa 6 - Revisão Final
 */

import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  CheckCircle2,
  AlertCircle,
  FolderKanban,
  DollarSign,
  Settings,
  Calendar,
  Puzzle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { ProjectFormData } from "../ProjectCreationWizardTypes";
import { getMoedaSymbol } from "@/types/projeto";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

interface StepRevisaoProps {
  formData: ProjectFormData;
  selectedModules: string[];
  modulesNames: Record<string, string>;
}

export function StepRevisao({ formData, selectedModules, modulesNames }: StepRevisaoProps) {
  const currencySymbol = getMoedaSymbol(formData.moeda_consolidacao);

  const formatDate = (date: string | null) => {
    if (!date) return "—";
    return format(new Date(date + "T12:00:00"), "dd/MM/yyyy", { locale: ptBR });
  };

  // Validações
  const validations = {
    nome: !!formData.nome.trim(),
    dataInicio: !!formData.data_inicio,
    moeda: !!formData.moeda_consolidacao,
    cotacao:
      formData.fonte_cotacao === "PTAX" ||
      (formData.fonte_cotacao === "TRABALHO" && formData.cotacao_trabalho !== null),
    cicloCompleto:
      !formData.criar_ciclo ||
      (formData.ciclo_nome &&
        formData.ciclo_data_inicio &&
        formData.ciclo_data_fim &&
        formData.ciclo_meta_volume > 0),
  };

  const allValid = Object.values(validations).every(Boolean);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold mb-1">Revisão Final</h2>
        <p className="text-sm text-muted-foreground">
          Confira todas as configurações antes de criar o projeto.
        </p>
      </div>

      {/* Status de Validação */}
      <div
        className={cn(
          "flex items-center gap-3 p-4 rounded-lg border",
          allValid
            ? "bg-emerald-500/10 border-emerald-500/30"
            : "bg-amber-500/10 border-amber-500/30"
        )}
      >
        {allValid ? (
          <CheckCircle2 className="h-5 w-5 text-emerald-500" />
        ) : (
          <AlertCircle className="h-5 w-5 text-amber-500" />
        )}
        <div>
          <div className={cn("font-medium", allValid ? "text-emerald-500" : "text-amber-500")}>
            {allValid ? "Tudo pronto!" : "Atenção"}
          </div>
          <p className="text-sm text-muted-foreground">
            {allValid
              ? "O projeto está configurado e pronto para ser criado."
              : "Algumas configurações precisam de atenção."}
          </p>
        </div>
      </div>

      {/* Dados Básicos */}
      <Card>
        <CardContent className="pt-4">
          <div className="flex items-center gap-2 mb-3">
            <FolderKanban className="h-4 w-4 text-primary" />
            <h3 className="font-medium">Dados Básicos</h3>
            {validations.nome && validations.dataInicio ? (
              <CheckCircle2 className="h-4 w-4 text-emerald-500 ml-auto" />
            ) : (
              <AlertCircle className="h-4 w-4 text-amber-500 ml-auto" />
            )}
          </div>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-muted-foreground">Nome:</span>{" "}
              <span className={cn("font-medium", !formData.nome && "text-amber-500")}>
                {formData.nome || "Não definido"}
              </span>
            </div>
            <div>
              <span className="text-muted-foreground">Status:</span>{" "}
              <Badge variant="outline" className="text-xs ml-1">
                {formData.status}
              </Badge>
            </div>
            <div>
              <span className="text-muted-foreground">Início:</span>{" "}
              <span className={cn("font-medium", !formData.data_inicio && "text-amber-500")}>
                {formatDate(formData.data_inicio)}
              </span>
            </div>
            <div>
              <span className="text-muted-foreground">Fim Previsto:</span>{" "}
              <span className="font-medium">{formatDate(formData.data_fim_prevista)}</span>
            </div>
            {formData.tem_investimento_crypto && (
              <div className="col-span-2">
                <Badge variant="outline" className="bg-orange-500/10 text-orange-400 border-orange-500/30">
                  Investimento Crypto
                </Badge>
              </div>
            )}
            {formData.investidor_id && (
              <div className="col-span-2">
                <Badge variant="outline" className="bg-purple-500/10 text-purple-400 border-purple-500/30">
                  Participação de Investidor: {formData.percentual_investidor}%
                </Badge>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Moeda e Consolidação */}
      <Card>
        <CardContent className="pt-4">
          <div className="flex items-center gap-2 mb-3">
            <DollarSign className="h-4 w-4 text-primary" />
            <h3 className="font-medium">Moeda e Consolidação</h3>
            {validations.moeda && validations.cotacao ? (
              <CheckCircle2 className="h-4 w-4 text-emerald-500 ml-auto" />
            ) : (
              <AlertCircle className="h-4 w-4 text-amber-500 ml-auto" />
            )}
          </div>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-muted-foreground">Moeda:</span>{" "}
              <Badge
                variant="outline"
                className={cn(
                  "ml-1",
                  formData.moeda_consolidacao === "USD"
                    ? "bg-blue-500/10 text-blue-400 border-blue-500/30"
                    : "bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
                )}
              >
                {formData.moeda_consolidacao}
              </Badge>
            </div>
            <div>
              <span className="text-muted-foreground">Fonte:</span>{" "}
              <span className="font-medium">{formData.fonte_cotacao}</span>
            </div>
            {formData.fonte_cotacao === "TRABALHO" && (
              <div className="col-span-2">
                <span className="text-muted-foreground">Cotação de Trabalho:</span>{" "}
                <span
                  className={cn("font-medium", !formData.cotacao_trabalho && "text-amber-500")}
                >
                  {formData.cotacao_trabalho
                    ? `R$ ${formData.cotacao_trabalho}`
                    : "Não definida"}
                </span>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Estrutura Operacional */}
      <Card>
        <CardContent className="pt-4">
          <div className="flex items-center gap-2 mb-3">
            <Settings className="h-4 w-4 text-primary" />
            <h3 className="font-medium">Estrutura Operacional</h3>
            <CheckCircle2 className="h-4 w-4 text-emerald-500 ml-auto" />
          </div>
          <div className="text-sm">
            <span className="text-muted-foreground">Absorção de Taxas:</span>{" "}
            <span className="font-medium">
              {formData.modelo_absorcao_taxas === "EMPRESA_100"
                ? "Empresa absorve 100%"
                : formData.modelo_absorcao_taxas === "OPERADOR_100"
                ? "Operador absorve 100%"
                : "Divisão proporcional (50/50)"}
            </span>
          </div>
        </CardContent>
      </Card>

      {/* Ciclo */}
      <Card>
        <CardContent className="pt-4">
          <div className="flex items-center gap-2 mb-3">
            <Calendar className="h-4 w-4 text-primary" />
            <h3 className="font-medium">Primeiro Ciclo</h3>
            {!formData.criar_ciclo ? (
              <Badge variant="secondary" className="ml-auto text-xs">Pulado</Badge>
            ) : validations.cicloCompleto ? (
              <CheckCircle2 className="h-4 w-4 text-emerald-500 ml-auto" />
            ) : (
              <AlertCircle className="h-4 w-4 text-amber-500 ml-auto" />
            )}
          </div>
          {formData.criar_ciclo ? (
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-muted-foreground">Nome:</span>{" "}
                <span className="font-medium">{formData.ciclo_nome || "—"}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Meta:</span>{" "}
                <span className="font-medium">
                  {currencySymbol} {formData.ciclo_meta_volume?.toLocaleString("pt-BR") || "0"}
                </span>
              </div>
              <div>
                <span className="text-muted-foreground">Início:</span>{" "}
                <span className="font-medium">{formatDate(formData.ciclo_data_inicio)}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Fim:</span>{" "}
                <span className="font-medium">{formatDate(formData.ciclo_data_fim)}</span>
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              Nenhum ciclo será criado. Você pode adicionar depois.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Módulos */}
      <Card>
        <CardContent className="pt-4">
          <div className="flex items-center gap-2 mb-3">
            <Puzzle className="h-4 w-4 text-primary" />
            <h3 className="font-medium">Módulos</h3>
            <Badge variant="secondary" className="ml-auto text-xs">
              {selectedModules.length} selecionado{selectedModules.length !== 1 ? "s" : ""}
            </Badge>
          </div>
          {selectedModules.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {selectedModules.map((moduleId) => (
                <Badge key={moduleId} variant="outline">
                  {modulesNames[moduleId] || moduleId}
                </Badge>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              Nenhum módulo selecionado. Você pode ativar depois.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
