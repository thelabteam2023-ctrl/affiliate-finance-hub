import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/hooks/useWorkspace";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DatePicker } from "@/components/ui/date-picker";
import { ChevronDown, ChevronUp, FileText, User, Shield } from "lucide-react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Badge } from "@/components/ui/badge";

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

interface VincularOperadorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projetoId: string;
  onSuccess: () => void;
}

const MODELOS_PAGAMENTO = [
  { value: "FIXO_MENSAL", label: "Fixo Mensal" },
  { value: "PORCENTAGEM", label: "Porcentagem" },
  { value: "HIBRIDO", label: "Híbrido (Fixo + %)" },
  { value: "POR_ENTREGA", label: "Por Entrega" },
  { value: "COMISSAO_ESCALONADA", label: "Comissão Escalonada" },
  { value: "PROPORCIONAL_LUCRO", label: "Proporcional ao Lucro" },
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

export function VincularOperadorDialog({
  open,
  onOpenChange,
  projetoId,
  onSuccess,
}: VincularOperadorDialogProps) {
  const { workspaceId } = useWorkspace();
  const [loading, setLoading] = useState(false);
  const [eligibleUsers, setEligibleUsers] = useState<EligibleUser[]>([]);
  const [usersVinculados, setUsersVinculados] = useState<string[]>([]);
  const [acordoExpanded, setAcordoExpanded] = useState(false);
  const [formData, setFormData] = useState({
    selected_user_id: "",
    funcao: "",
    data_entrada: new Date().toISOString().split("T")[0],
    resumo_acordo: "",
    modelo_pagamento: "FIXO_MENSAL",
    valor_fixo: "",
    percentual: "",
    base_calculo: "LUCRO_PROJETO",
  });

  useEffect(() => {
    if (open && workspaceId) {
      fetchEligibleUsers();
      fetchUsersVinculados();
      setFormData({
        selected_user_id: "",
        funcao: "",
        data_entrada: new Date().toISOString().split("T")[0],
        resumo_acordo: "",
        modelo_pagamento: "FIXO_MENSAL",
        valor_fixo: "",
        percentual: "",
        base_calculo: "LUCRO_PROJETO",
      });
      setAcordoExpanded(false);
    }
  }, [open, projetoId, workspaceId]);

  const fetchEligibleUsers = async () => {
    if (!workspaceId) return;
    
    const { data, error } = await supabase
      .rpc("get_project_operator_candidates", { _workspace_id: workspaceId });

    if (error) {
      console.error("Erro ao buscar usuários elegíveis:", error);
      toast.error("Erro ao carregar usuários elegíveis");
      return;
    }
    
    setEligibleUsers(data || []);
  };

  const fetchUsersVinculados = async () => {
    // Buscar user_ids que já estão vinculados ao projeto via operador_projetos
    const { data, error } = await supabase
      .from("operador_projetos")
      .select("operador_id, operadores!inner(auth_user_id)")
      .eq("projeto_id", projetoId)
      .eq("status", "ATIVO");

    if (!error && data) {
      const vinculados = data
        .map((d: any) => d.operadores?.auth_user_id)
        .filter(Boolean);
      setUsersVinculados(vinculados);
    }
  };

  const handleSave = async () => {
    if (!formData.selected_user_id) {
      toast.error("Selecione um usuário");
      return;
    }

    if (!workspaceId) {
      toast.error("Workspace não identificado");
      return;
    }

    setLoading(true);
    try {
      const { data: session } = await supabase.auth.getSession();
      if (!session.session) {
        toast.error("Usuário não autenticado");
        return;
      }

      // Validar elegibilidade no backend
      const { data: isEligible, error: eligibleError } = await supabase
        .rpc("validate_operator_eligibility", {
          _user_id: formData.selected_user_id,
          _workspace_id: workspaceId
        });

      if (eligibleError || !isEligible) {
        toast.error("Usuário não está elegível para vínculo em projetos");
        return;
      }

      // Buscar ou criar registro do operador
      const selectedUser = eligibleUsers.find(u => u.user_id === formData.selected_user_id);
      let operadorId = selectedUser?.operador_id;

      if (!operadorId) {
        // Criar registro na tabela operadores
        const { data: novoOperador, error: opError } = await supabase
          .from("operadores")
          .insert({
            auth_user_id: formData.selected_user_id,
            workspace_id: workspaceId,
            user_id: session.session.user.id,
            nome: selectedUser?.display_name || "Operador",
            email: selectedUser?.email,
            cpf: selectedUser?.cpf,
            status: "ATIVO",
          })
          .select("id")
          .single();

        if (opError) {
          console.error("Erro ao criar operador:", opError);
          toast.error("Erro ao criar registro de operador");
          return;
        }
        operadorId = novoOperador.id;
      }

      // Criar vínculo com projeto
      const insertData = {
        operador_id: operadorId,
        projeto_id: projetoId,
        funcao: formData.funcao || null,
        data_entrada: formData.data_entrada,
        status: "ATIVO",
        user_id: session.session.user.id,
        resumo_acordo: formData.resumo_acordo || null,
        modelo_pagamento: formData.modelo_pagamento,
        valor_fixo: formData.valor_fixo ? parseFloat(formData.valor_fixo) : 0,
        percentual: formData.percentual ? parseFloat(formData.percentual) : 0,
        base_calculo: formData.base_calculo,
      };

      const { error } = await supabase.from("operador_projetos").insert(insertData);

      if (error) throw error;
      
      toast.success("Usuário vinculado ao projeto com sucesso");
      onSuccess();
      onOpenChange(false);
    } catch (error: any) {
      if (error.code === "23505") {
        toast.error("Este usuário já está vinculado ao projeto");
      } else {
        toast.error("Erro ao vincular: " + error.message);
      }
    } finally {
      setLoading(false);
    }
  };

  // Filtrar usuários que ainda não estão vinculados
  const usersDisponiveis = eligibleUsers.filter(
    user => !usersVinculados.includes(user.user_id)
  );

  const showValorFixo = ["FIXO_MENSAL", "HIBRIDO"].includes(formData.modelo_pagamento);
  const showPercentual = ["PORCENTAGEM", "HIBRIDO", "PROPORCIONAL_LUCRO", "COMISSAO_ESCALONADA"].includes(formData.modelo_pagamento);

  const getEligibilityBadge = (user: EligibleUser) => {
    if (user.eligible_by_role) {
      return (
        <Badge variant="outline" className="text-xs ml-2">
          <User className="h-3 w-3 mr-1" />
          {ROLE_LABELS[user.role_base] || user.role_base}
        </Badge>
      );
    }
    if (user.eligible_by_extra) {
      return (
        <Badge variant="secondary" className="text-xs ml-2">
          <Shield className="h-3 w-3 mr-1" />
          Permissão Extra
        </Badge>
      );
    }
    return null;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Vincular Usuário ao Projeto</DialogTitle>
          <DialogDescription>
            Selecione um usuário elegível para vincular ao projeto. Usuários podem ser elegíveis por função ou permissões adicionais.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Seção Obrigatória */}
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Usuário Elegível *</Label>
              <Select
                value={formData.selected_user_id}
                onValueChange={(value) => setFormData({ ...formData, selected_user_id: value })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione um usuário elegível" />
                </SelectTrigger>
                <SelectContent>
                  {usersDisponiveis.length === 0 ? (
                    <SelectItem value="none" disabled>
                      Nenhum usuário elegível disponível
                    </SelectItem>
                  ) : (
                    usersDisponiveis.map((user) => (
                      <SelectItem key={user.user_id} value={user.user_id}>
                        <div className="flex items-center">
                          <span>{user.display_name}</span>
                          {getEligibilityBadge(user)}
                        </div>
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Lista inclui usuários com função de operador ou permissões adicionais de projeto
              </p>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Função no Projeto</Label>
                <Input
                  value={formData.funcao}
                  onChange={(e) => setFormData({ ...formData, funcao: e.target.value })}
                  placeholder="Ex: Trader, Analista"
                />
              </div>

              <div className="space-y-2">
                <Label>Data de Entrada</Label>
                <DatePicker
                  value={formData.data_entrada}
                  onChange={(date) => setFormData({ ...formData, data_entrada: date })}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Resumo do Acordo</Label>
              <Textarea
                value={formData.resumo_acordo}
                onChange={(e) => setFormData({ ...formData, resumo_acordo: e.target.value })}
                placeholder="Descreva os termos do acordo com o operador (opcional)"
                rows={2}
              />
              <p className="text-xs text-muted-foreground">
                Documentação livre do acordo - não utilizado para cálculos automáticos
              </p>
            </div>
          </div>

          {/* Seção Colapsável: Referência do Acordo */}
          <Collapsible open={acordoExpanded} onOpenChange={setAcordoExpanded}>
            <CollapsibleTrigger asChild>
              <Button variant="outline" className="w-full justify-between">
                <div className="flex items-center gap-2">
                  <FileText className="h-4 w-4" />
                  <span>Referência do Acordo (opcional)</span>
                </div>
                {acordoExpanded ? (
                  <ChevronUp className="h-4 w-4" />
                ) : (
                  <ChevronDown className="h-4 w-4" />
                )}
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="pt-4 space-y-4">
              <div className="p-3 rounded-lg bg-muted/50 border">
                <p className="text-xs text-muted-foreground">
                  ℹ️ Estes campos são apenas para <strong>referência e documentação</strong>. 
                  Não são usados para cálculos automáticos de pagamento.
                </p>
              </div>

              <div className="space-y-2">
                <Label>Modelo de Pagamento</Label>
                <Select
                  value={formData.modelo_pagamento}
                  onValueChange={(value) => setFormData({ ...formData, modelo_pagamento: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {MODELOS_PAGAMENTO.map((modelo) => (
                      <SelectItem key={modelo.value} value={modelo.value}>
                        {modelo.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                {showValorFixo && (
                  <div className="space-y-2">
                    <Label>Valor Fixo (R$)</Label>
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      value={formData.valor_fixo}
                      onChange={(e) => setFormData({ ...formData, valor_fixo: e.target.value })}
                      placeholder="0,00"
                    />
                  </div>
                )}

                {showPercentual && (
                  <div className="space-y-2">
                    <Label>Percentual (%)</Label>
                    <Input
                      type="number"
                      step="0.1"
                      min="0"
                      max="100"
                      value={formData.percentual}
                      onChange={(e) => setFormData({ ...formData, percentual: e.target.value })}
                      placeholder="0"
                    />
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <Label>Base de Cálculo</Label>
                <Select
                  value={formData.base_calculo}
                  onValueChange={(value) => setFormData({ ...formData, base_calculo: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {BASES_CALCULO.map((base) => (
                      <SelectItem key={base.value} value={base.value}>
                        {base.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </CollapsibleContent>
          </Collapsible>
        </div>

        <div className="flex justify-end gap-2 mt-4">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={loading || !formData.selected_user_id}>
            {loading ? "Vinculando..." : "Vincular"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
