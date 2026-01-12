/**
 * Etapa - Vinculação de Operador (OPCIONAL)
 * Layout compacto sem accordion, grid horizontal para comissionamento
 */

import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/hooks/useWorkspace";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { UserMinus, Mail } from "lucide-react";
import { ProjectFormData } from "../ProjectCreationWizardTypes";

interface EligibleUser {
  user_id: string;
  display_name: string;
  email: string | null;
  cpf: string | null;
  role_base: string;
  eligible_by_role: boolean;
  eligible_by_extra: boolean;
  operador_id: string | null;
}

interface StepOperadorProps {
  formData: ProjectFormData;
  onChange: (data: Partial<ProjectFormData>) => void;
}

const MODELOS_PAGAMENTO = [
  { value: "PORCENTAGEM", label: "Porcentagem" },
  { value: "FIXO_MENSAL", label: "Fixo Mensal" },
  { value: "HIBRIDO", label: "Híbrido (Fixo + %)" },
];

const BASES_CALCULO = [
  { value: "LUCRO_PROJETO", label: "Lucro do Projeto" },
  { value: "FATURAMENTO_PROJETO", label: "Faturamento do Projeto" },
  { value: "RESULTADO_OPERACAO", label: "Resultado da Operação" },
];

const ROLE_LABELS: Record<string, string> = {
  owner: "Proprietário",
  admin: "Administrador",
  finance: "Financeiro",
  operator: "Operador",
  viewer: "Visualizador",
};

const NO_OPERATOR = "__none__";

export function StepOperador({ formData, onChange }: StepOperadorProps) {
  const { workspaceId } = useWorkspace();
  const [eligibleUsers, setEligibleUsers] = useState<EligibleUser[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const fetchEligibleUsers = async () => {
      if (!workspaceId) return;
      setLoading(true);

      try {
        const { data, error } = await supabase.rpc(
          "get_project_operator_candidates",
          { _workspace_id: workspaceId }
        );

        if (error) throw error;
        setEligibleUsers((data as unknown as EligibleUser[]) || []);
      } catch (error) {
        console.error("Error fetching eligible users:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchEligibleUsers();
  }, [workspaceId]);

  const selectedUser = eligibleUsers.find(
    (u) => u.user_id === formData.operador_user_id
  );

  const isOwner = selectedUser?.role_base === "owner";

  const handleSelectOperator = (value: string) => {
    if (value === NO_OPERATOR) {
      onChange({
        vincular_operador: false,
        operador_user_id: "",
      });
    } else {
      onChange({
        vincular_operador: true,
        operador_user_id: value,
      });
    }
  };

  const selectValue =
    formData.vincular_operador && formData.operador_user_id
      ? formData.operador_user_id
      : NO_OPERATOR;

  const showPercentual =
    formData.operador_modelo_pagamento === "PORCENTAGEM" ||
    formData.operador_modelo_pagamento === "HIBRIDO";

  const showValorFixo =
    formData.operador_modelo_pagamento === "FIXO_MENSAL" ||
    formData.operador_modelo_pagamento === "HIBRIDO";

  return (
    <div className="space-y-5">
      {/* Header compacto */}
      <div className="flex items-center gap-2">
        <h2 className="text-xl font-semibold">Operador do Projeto</h2>
        <Badge variant="secondary" className="text-xs">
          Opcional
        </Badge>
      </div>

      {/* Bloco 1: Seleção do Operador */}
      <div className="p-4 rounded-lg border border-border bg-card space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-end">
          {/* Select de operador */}
          <div className="space-y-1.5">
            <Label className="text-sm">Operador</Label>
            {loading ? (
              <div className="text-sm text-muted-foreground py-2">
                Carregando...
              </div>
            ) : (
              <Select value={selectValue} onValueChange={handleSelectOperator}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_OPERATOR}>
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <UserMinus className="h-4 w-4" />
                      <span>Nenhum operador</span>
                    </div>
                  </SelectItem>

                  {eligibleUsers.length > 0 && (
                    <div className="h-px bg-border my-1" />
                  )}

                  {eligibleUsers.map((user) => (
                    <SelectItem key={user.user_id} value={user.user_id}>
                      <div className="flex items-center gap-2">
                        <span>{user.display_name}</span>
                        <Badge variant="outline" className="text-xs">
                          {ROLE_LABELS[user.role_base] || user.role_base}
                        </Badge>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          {/* Email do operador selecionado */}
          {selectedUser && selectedUser.email && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Mail className="h-4 w-4" />
              <span>{selectedUser.email}</span>
            </div>
          )}
        </div>

        <p className="text-xs text-muted-foreground/70">
          Você pode alterar ou vincular operadores depois em Gestão → Operadores.
        </p>
      </div>

      {/* Bloco 2: Acordo de Comissionamento (só se operador selecionado) */}
      {selectedUser && (
        <div className="p-4 rounded-lg border border-border bg-card space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium">Acordo de Comissionamento</h3>
            {isOwner && (
              <Badge variant="secondary" className="text-xs font-normal">
                Proprietário — comissão não aplicada
              </Badge>
            )}
          </div>

          {isOwner ? (
            <p className="text-sm text-muted-foreground">
              Este operador é o proprietário do projeto. Comissão padrão não aplicada.
            </p>
          ) : (
            <>
              {/* Linha principal: Modelo + Percentual + Base de Cálculo (3 colunas) */}
              <div className="grid grid-cols-1 md:grid-cols-[1fr_0.6fr_1.2fr] gap-4">
                {/* Modelo de Pagamento */}
                <div className="space-y-1.5">
                  <Label className="text-sm">Modelo de Pagamento</Label>
                  <Select
                    value={formData.operador_modelo_pagamento}
                    onValueChange={(v) =>
                      onChange({ operador_modelo_pagamento: v })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {MODELOS_PAGAMENTO.map((m) => (
                        <SelectItem key={m.value} value={m.value}>
                          {m.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Percentual (%) - visível para PORCENTAGEM e HIBRIDO */}
                {showPercentual && (
                  <div className="space-y-1.5">
                    <Label className="text-sm">Percentual (%)</Label>
                    <Input
                      type="number"
                      min={0}
                      max={100}
                      step={0.1}
                      value={formData.operador_percentual || ""}
                      onChange={(e) =>
                        onChange({
                          operador_percentual: e.target.value
                            ? parseFloat(e.target.value)
                            : null,
                        })
                      }
                      placeholder="Ex: 50"
                    />
                  </div>
                )}

                {/* Base de Cálculo - visível quando há percentual */}
                {showPercentual && (
                  <div className="space-y-1.5">
                    <Label className="text-sm">Base de Cálculo</Label>
                    <Select
                      value={formData.operador_base_calculo}
                      onValueChange={(v) =>
                        onChange({ operador_base_calculo: v })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {BASES_CALCULO.map((b) => (
                          <SelectItem key={b.value} value={b.value}>
                            {b.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {/* Valor Fixo (quando FIXO_MENSAL - sem percentual) */}
                {showValorFixo && !showPercentual && (
                  <div className="space-y-1.5 md:col-span-2">
                    <Label className="text-sm">Valor Fixo</Label>
                    <Input
                      type="number"
                      min={0}
                      step={0.01}
                      value={formData.operador_valor_fixo || ""}
                      onChange={(e) =>
                        onChange({
                          operador_valor_fixo: e.target.value
                            ? parseFloat(e.target.value)
                            : null,
                        })
                      }
                      placeholder="Ex: 1000"
                    />
                  </div>
                )}
              </div>

              {/* Linha 2: Valor Fixo adicional (apenas para HIBRIDO) */}
              {showPercentual && showValorFixo && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="space-y-1.5">
                    <Label className="text-sm">Valor Fixo Mensal</Label>
                    <Input
                      type="number"
                      min={0}
                      step={0.01}
                      value={formData.operador_valor_fixo || ""}
                      onChange={(e) =>
                        onChange({
                          operador_valor_fixo: e.target.value
                            ? parseFloat(e.target.value)
                            : null,
                        })
                      }
                      placeholder="Ex: 1000"
                    />
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
