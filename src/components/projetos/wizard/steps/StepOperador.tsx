/**
 * Etapa - Vinculação de Operador (OPCIONAL)
 * Layout compacto: um único card com select integrado
 */

import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/hooks/useWorkspace";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Users,
  ChevronDown,
  ChevronUp,
  UserMinus,
} from "lucide-react";

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

import { ProjectFormData } from "../ProjectCreationWizardTypes";

interface StepOperadorProps {
  formData: ProjectFormData;
  onChange: (data: Partial<ProjectFormData>) => void;
}

const MODELOS_PAGAMENTO = [
  { value: "PORCENTAGEM", label: "Porcentagem" },
  { value: "FIXO_MENSAL", label: "Fixo Mensal" },
  { value: "HIBRIDO", label: "Híbrido (Fixo + %)" },
  { value: "POR_ENTREGA", label: "Por Entrega" },
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

// Valor especial para "nenhum operador"
const NO_OPERATOR = "__none__";

export function StepOperador({ formData, onChange }: StepOperadorProps) {
  const { workspaceId } = useWorkspace();
  const [eligibleUsers, setEligibleUsers] = useState<EligibleUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [acordoExpanded, setAcordoExpanded] = useState(false);

  // Fetch eligible users
  useEffect(() => {
    const fetchEligibleUsers = async () => {
      if (!workspaceId) return;
      setLoading(true);

      try {
        const { data, error } = await supabase
          .rpc("get_project_operator_candidates", { _workspace_id: workspaceId });

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

  // Valor atual do select
  const selectValue = formData.vincular_operador && formData.operador_user_id 
    ? formData.operador_user_id 
    : NO_OPERATOR;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2 mb-1">
          <h2 className="text-xl font-semibold">Operador do Projeto</h2>
          <Badge variant="secondary" className="text-xs">Opcional</Badge>
        </div>
        <p className="text-sm text-muted-foreground">
          Selecione um operador para vincular ao projeto.
        </p>
      </div>

      {/* Card único com select */}
      <div className="p-4 rounded-lg border border-border bg-card space-y-4">
        {/* Select de operador */}
        <div className="space-y-2">
          <Label className="text-sm">Operador</Label>
          {loading ? (
            <div className="text-sm text-muted-foreground py-2">Carregando...</div>
          ) : (
            <Select value={selectValue} onValueChange={handleSelectOperator}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {/* Opção de não vincular */}
                <SelectItem value={NO_OPERATOR}>
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <UserMinus className="h-4 w-4" />
                    <span>Nenhum operador / Vincular depois</span>
                  </div>
                </SelectItem>
                
                {/* Separador visual */}
                {eligibleUsers.length > 0 && (
                  <div className="h-px bg-border my-1" />
                )}
                
                {/* Lista de operadores */}
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
          
          {/* Microcopy discreto */}
          <p className="text-xs text-muted-foreground/70">
            Você pode vincular ou alterar operadores a qualquer momento em Gestão → Operadores.
          </p>
        </div>

        {/* Detalhes do usuário selecionado */}
        {selectedUser && (
          <>
            <div className="p-3 rounded-lg bg-muted/50 text-sm space-y-1">
              <div className="flex items-center gap-2">
                <Users className="h-4 w-4 text-muted-foreground" />
                <span className="font-medium">{selectedUser.display_name}</span>
              </div>
              {selectedUser.email && (
                <div className="text-muted-foreground pl-6 text-xs">{selectedUser.email}</div>
              )}
            </div>

            {/* Acordo de comissionamento (colapsável) */}
            <Collapsible open={acordoExpanded} onOpenChange={setAcordoExpanded}>
              <CollapsibleTrigger asChild>
                <Button variant="ghost" className="w-full justify-between p-2 h-auto text-sm">
                  <span className="font-medium">Acordo de Comissionamento</span>
                  {acordoExpanded ? (
                    <ChevronUp className="h-4 w-4" />
                  ) : (
                    <ChevronDown className="h-4 w-4" />
                  )}
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent className="space-y-4 pt-2">
                {/* Modelo de pagamento */}
                <div className="space-y-2">
                  <Label className="text-sm">Modelo de Pagamento</Label>
                  <Select
                    value={formData.operador_modelo_pagamento}
                    onValueChange={(v) => onChange({ operador_modelo_pagamento: v })}
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

                {/* Campos condicionais */}
                <div className="grid grid-cols-2 gap-4">
                  {(formData.operador_modelo_pagamento === "PORCENTAGEM" ||
                    formData.operador_modelo_pagamento === "HIBRIDO") && (
                    <div className="space-y-2">
                      <Label className="text-sm">Percentual (%)</Label>
                      <Input
                        type="number"
                        min={0}
                        max={100}
                        step={0.1}
                        value={formData.operador_percentual || ""}
                        onChange={(e) =>
                          onChange({
                            operador_percentual: e.target.value ? parseFloat(e.target.value) : null,
                          })
                        }
                        placeholder="Ex: 50"
                        className="h-9"
                      />
                    </div>
                  )}

                  {(formData.operador_modelo_pagamento === "FIXO_MENSAL" ||
                    formData.operador_modelo_pagamento === "HIBRIDO") && (
                    <div className="space-y-2">
                      <Label className="text-sm">Valor Fixo</Label>
                      <Input
                        type="number"
                        min={0}
                        step={0.01}
                        value={formData.operador_valor_fixo || ""}
                        onChange={(e) =>
                          onChange({
                            operador_valor_fixo: e.target.value ? parseFloat(e.target.value) : null,
                          })
                        }
                        placeholder="Ex: 1000"
                        className="h-9"
                      />
                    </div>
                  )}
                </div>

                {/* Base de cálculo */}
                {(formData.operador_modelo_pagamento === "PORCENTAGEM" ||
                  formData.operador_modelo_pagamento === "HIBRIDO") && (
                  <div className="space-y-2">
                    <Label className="text-sm">Base de Cálculo</Label>
                    <Select
                      value={formData.operador_base_calculo}
                      onValueChange={(v) => onChange({ operador_base_calculo: v })}
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

                {/* Resumo do acordo */}
                <div className="space-y-2">
                  <Label className="text-sm">Resumo do Acordo (opcional)</Label>
                  <Textarea
                    value={formData.operador_resumo_acordo}
                    onChange={(e) => onChange({ operador_resumo_acordo: e.target.value })}
                    placeholder="Descreva brevemente o acordo..."
                    className="resize-none text-sm"
                    rows={2}
                  />
                </div>
              </CollapsibleContent>
            </Collapsible>
          </>
        )}
      </div>
    </div>
  );
}
