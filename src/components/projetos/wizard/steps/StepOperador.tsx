/**
 * Etapa - Vinculação de Operador (OPCIONAL)
 * Permite selecionar um operador para vincular ao projeto
 */

import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/hooks/useWorkspace";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
import { cn } from "@/lib/utils";
import {
  Users,
  UserPlus,
  ChevronDown,
  ChevronUp,
  Info,
  SkipForward,
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

  const handleToggleVincular = (checked: boolean) => {
    onChange({
      vincular_operador: checked,
      operador_user_id: checked ? formData.operador_user_id : "",
    });
  };

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-2 mb-1">
          <h2 className="text-xl font-semibold">Operador do Projeto</h2>
          <Badge variant="secondary" className="text-xs">Opcional</Badge>
        </div>
        <p className="text-sm text-muted-foreground">
          Vincule um operador responsável pelo projeto. Você pode pular esta etapa e vincular depois.
        </p>
      </div>

      {/* Toggle para vincular ou não */}
      <div
        className={cn(
          "flex items-center gap-3 p-4 rounded-lg border-2 cursor-pointer transition-all",
          formData.vincular_operador
            ? "border-primary bg-primary/5"
            : "border-border hover:border-primary/50"
        )}
        onClick={() => handleToggleVincular(!formData.vincular_operador)}
      >
        <Checkbox
          checked={formData.vincular_operador}
          onCheckedChange={handleToggleVincular}
        />
        <UserPlus className={cn(
          "h-5 w-5",
          formData.vincular_operador ? "text-primary" : "text-muted-foreground"
        )} />
        <div className="flex-1">
          <div className="font-medium">Vincular operador agora</div>
          <div className="text-xs text-muted-foreground">
            Selecione um membro do workspace como operador deste projeto
          </div>
        </div>
      </div>

      {/* Opção de pular */}
      {!formData.vincular_operador && (
        <div className="flex gap-3 p-4 rounded-lg bg-muted/50 border border-border">
          <SkipForward className="h-5 w-5 text-muted-foreground flex-shrink-0 mt-0.5" />
          <div className="space-y-1">
            <div className="font-medium text-muted-foreground">Vincular depois</div>
            <p className="text-sm text-muted-foreground">
              Você poderá vincular operadores a qualquer momento em{" "}
              <strong>Gestão → Operadores</strong>.
            </p>
          </div>
        </div>
      )}

      {/* Formulário de seleção */}
      {formData.vincular_operador && (
        <div className="space-y-4 p-4 rounded-lg border border-border bg-card">
          {/* Seleção de usuário */}
          <div className="space-y-2">
            <Label>Selecionar Operador</Label>
            {loading ? (
              <div className="text-sm text-muted-foreground">Carregando...</div>
            ) : eligibleUsers.length === 0 ? (
              <div className="text-sm text-amber-500">
                Nenhum usuário elegível encontrado no workspace.
              </div>
            ) : (
              <Select
                value={formData.operador_user_id}
                onValueChange={(v) => onChange({ operador_user_id: v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione um operador" />
                </SelectTrigger>
                <SelectContent>
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

          {/* Detalhes do usuário selecionado */}
          {selectedUser && (
            <div className="p-3 rounded-lg bg-muted/50 text-sm space-y-1">
              <div className="flex items-center gap-2">
                <Users className="h-4 w-4 text-muted-foreground" />
                <span className="font-medium">{selectedUser.display_name}</span>
              </div>
              {selectedUser.email && (
                <div className="text-muted-foreground pl-6">{selectedUser.email}</div>
              )}
            </div>
          )}

          {/* Acordo de comissionamento (colapsável) */}
          <Collapsible open={acordoExpanded} onOpenChange={setAcordoExpanded}>
            <CollapsibleTrigger asChild>
              <Button variant="ghost" className="w-full justify-between p-3 h-auto">
                <span className="text-sm font-medium">Acordo de Comissionamento</span>
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
                <Label>Modelo de Pagamento</Label>
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
                    <Label>Percentual (%)</Label>
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
                    />
                  </div>
                )}

                {(formData.operador_modelo_pagamento === "FIXO_MENSAL" ||
                  formData.operador_modelo_pagamento === "HIBRIDO") && (
                  <div className="space-y-2">
                    <Label>Valor Fixo</Label>
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
                    />
                  </div>
                )}
              </div>

              {/* Base de cálculo */}
              {(formData.operador_modelo_pagamento === "PORCENTAGEM" ||
                formData.operador_modelo_pagamento === "HIBRIDO") && (
                <div className="space-y-2">
                  <Label>Base de Cálculo</Label>
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
                <Label>Resumo do Acordo (opcional)</Label>
                <Textarea
                  value={formData.operador_resumo_acordo}
                  onChange={(e) => onChange({ operador_resumo_acordo: e.target.value })}
                  placeholder="Descreva brevemente o acordo..."
                  className="resize-none"
                  rows={2}
                />
              </div>
            </CollapsibleContent>
          </Collapsible>
        </div>
      )}

      {/* Info */}
      <div className="flex gap-3 p-3 rounded-lg bg-blue-500/10 border border-blue-500/30">
        <Info className="h-4 w-4 text-blue-400 flex-shrink-0 mt-0.5" />
        <p className="text-xs text-muted-foreground">
          Operadores podem ser alterados ou adicionados depois. O acordo de comissionamento
          também pode ser editado a qualquer momento.
        </p>
      </div>
    </div>
  );
}
