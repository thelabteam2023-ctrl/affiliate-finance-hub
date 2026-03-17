/**
 * Gerenciador de múltiplos investidores por projeto.
 * Usa a tabela projeto_investidores para vincular N investidores.
 */

import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { InvestidorSelect } from "@/components/investidores/InvestidorSelect";
import { Briefcase, Percent, Plus, Trash2, Info, Building2, UserCheck } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface ProjetoInvestidor {
  id?: string;
  investidor_id: string;
  investidor_nome?: string;
  investidor_tipo?: string;
  percentual_participacao: number;
  base_calculo: string;
  ativo: boolean;
}

interface ProjetoInvestidoresManagerProps {
  projetoId?: string;
  workspaceId?: string;
  disabled?: boolean;
  /** For wizard mode: controlled list without DB persistence */
  value?: ProjetoInvestidor[];
  onChange?: (investidores: ProjetoInvestidor[]) => void;
  /** For edit mode: persist directly to DB */
  persistMode?: boolean;
}

export function ProjetoInvestidoresManager({
  projetoId,
  workspaceId,
  disabled = false,
  value,
  onChange,
  persistMode = false,
}: ProjetoInvestidoresManagerProps) {
  const { user } = useAuth();
  const [investidores, setInvestidores] = useState<ProjetoInvestidor[]>(value || []);
  const [loading, setLoading] = useState(false);
  const [addingNew, setAddingNew] = useState(false);
  const [newInvestidorId, setNewInvestidorId] = useState("");

  // Load from DB in persist mode
  useEffect(() => {
    if (persistMode && projetoId) {
      fetchInvestidores();
    }
  }, [persistMode, projetoId]);

  // Sync controlled value
  useEffect(() => {
    if (value) {
      setInvestidores(value);
    }
  }, [value]);

  const fetchInvestidores = async () => {
    if (!projetoId) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("projeto_investidores")
        .select("*, investidores(nome, tipo)")
        .eq("projeto_id", projetoId)
        .eq("ativo", true)
        .order("created_at");

      if (error) throw error;

      const mapped: ProjetoInvestidor[] = (data || []).map((d: any) => ({
        id: d.id,
        investidor_id: d.investidor_id,
        investidor_nome: d.investidores?.nome || "Investidor",
        investidor_tipo: d.investidores?.tipo || "externo",
        percentual_participacao: d.percentual_participacao,
        base_calculo: d.base_calculo,
        ativo: d.ativo,
      }));

      setInvestidores(mapped);
      onChange?.(mapped);
    } catch (err: any) {
      console.error("Erro ao carregar investidores:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleAdd = async () => {
    if (!newInvestidorId) return;

    // Check duplicate
    if (investidores.some((i) => i.investidor_id === newInvestidorId)) {
      toast.error("Este investidor já está vinculado ao projeto");
      return;
    }

    // Get investor name and type
    const { data: inv } = await supabase
      .from("investidores")
      .select("nome, tipo")
      .eq("id", newInvestidorId)
      .single();

    const newItem: ProjetoInvestidor = {
      investidor_id: newInvestidorId,
      investidor_nome: inv?.nome || "Investidor",
      investidor_tipo: inv?.tipo || "externo",
      percentual_participacao: 0,
      base_calculo: "LUCRO_LIQUIDO",
      ativo: true,
    };

    if (persistMode && projetoId && workspaceId) {
      try {
        const { data, error } = await supabase
          .from("projeto_investidores")
          .insert({
            projeto_id: projetoId,
            investidor_id: newInvestidorId,
            percentual_participacao: 0,
            base_calculo: "LUCRO_LIQUIDO",
            workspace_id: workspaceId,
          })
          .select("id")
          .single();

        if (error) throw error;
        newItem.id = data.id;
        toast.success(`${inv?.nome} vinculado ao projeto`);
      } catch (err: any) {
        toast.error("Erro ao vincular investidor: " + err.message);
        return;
      }
    }

    const updated = [...investidores, newItem];
    setInvestidores(updated);
    onChange?.(updated);
    setNewInvestidorId("");
    setAddingNew(false);
  };

  const handleRemove = async (index: number) => {
    const item = investidores[index];

    if (persistMode && item.id) {
      try {
        const { error } = await supabase
          .from("projeto_investidores")
          .update({ ativo: false })
          .eq("id", item.id);

        if (error) throw error;
        toast.success(`${item.investidor_nome} desvinculado`);
      } catch (err: any) {
        toast.error("Erro ao desvincular: " + err.message);
        return;
      }
    }

    const updated = investidores.filter((_, i) => i !== index);
    setInvestidores(updated);
    onChange?.(updated);
  };

  const handleUpdate = async (index: number, field: string, value: any) => {
    const updated = [...investidores];
    (updated[index] as any)[field] = value;
    setInvestidores(updated);
    onChange?.(updated);

    if (persistMode && updated[index].id) {
      try {
        await supabase
          .from("projeto_investidores")
          .update({ [field]: value })
          .eq("id", updated[index].id);
      } catch (err: any) {
        console.error("Erro ao atualizar:", err);
      }
    }
  };

  const totalPercentual = investidores.reduce((sum, i) => sum + i.percentual_participacao, 0);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-start gap-3">
        <div className="p-1.5 rounded-md bg-purple-500/10">
          <Briefcase className="h-4 w-4 text-purple-500" />
        </div>
        <div className="space-y-1 flex-1">
          <Label className="flex items-center gap-2">
            Investidores do Projeto
            <Badge variant="secondary" className="text-xs ml-auto">
              Opcional
            </Badge>
          </Label>
          <p className="text-xs text-muted-foreground">
            Vincule um ou mais investidores para dividir lucros
          </p>
        </div>
      </div>

      {/* Lista de investidores vinculados */}
      {investidores.map((inv, index) => (
        <Card
          key={inv.investidor_id}
          className={cn(
            "border",
            inv.investidor_tipo === "proprio"
              ? "border-blue-500/30 bg-blue-500/5"
              : "border-purple-500/30 bg-purple-500/5"
          )}
        >
          <CardContent className="pt-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {inv.investidor_tipo === "proprio" ? (
                  <Building2 className="h-4 w-4 text-blue-500" />
                ) : (
                  <UserCheck className="h-4 w-4 text-purple-500" />
                )}
                <span className="font-medium text-sm">{inv.investidor_nome}</span>
                <Badge
                  variant="outline"
                  className={cn(
                    "text-xs",
                    inv.investidor_tipo === "proprio"
                      ? "bg-blue-500/10 text-blue-400 border-blue-500/30"
                      : "bg-purple-500/10 text-purple-400 border-purple-500/30"
                  )}
                >
                  {inv.investidor_tipo === "proprio" ? "Capital Próprio" : "Externo"}
                </Badge>
              </div>
              {!disabled && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-destructive hover:text-destructive"
                  onClick={() => handleRemove(index)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              )}
            </div>

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
                  value={inv.percentual_participacao || ""}
                  onChange={(e) =>
                    handleUpdate(index, "percentual_participacao", parseFloat(e.target.value) || 0)
                  }
                  disabled={disabled}
                  placeholder="Ex: 50"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-sm">Base de Cálculo</Label>
                <RadioGroup
                  value={inv.base_calculo}
                  onValueChange={(val) => handleUpdate(index, "base_calculo", val)}
                  disabled={disabled}
                  className="flex flex-col gap-1"
                >
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="LUCRO_LIQUIDO" id={`ll-${index}`} />
                    <label htmlFor={`ll-${index}`} className="text-xs cursor-pointer">
                      Lucro Líquido
                    </label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="LUCRO_BRUTO" id={`lb-${index}`} />
                    <label htmlFor={`lb-${index}`} className="text-xs cursor-pointer">
                      Lucro Bruto
                    </label>
                  </div>
                </RadioGroup>
              </div>
            </div>

            {inv.investidor_tipo === "proprio" && (
              <div className="p-2 rounded bg-blue-500/10 border border-blue-500/20">
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  <Info className="h-3 w-3 text-blue-400" />
                  Capital próprio: lucro será reconhecido automaticamente (sem gerar pendência de pagamento)
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      ))}

      {/* Alerta de percentual total */}
      {totalPercentual > 0 && (
        <div
          className={cn(
            "p-2 rounded text-xs flex items-center gap-1",
            totalPercentual > 100
              ? "bg-destructive/10 text-destructive border border-destructive/30"
              : "bg-muted/50 text-muted-foreground"
          )}
        >
          <Info className="h-3 w-3 flex-shrink-0" />
          Total de participação: <strong>{totalPercentual}%</strong>
          {totalPercentual > 100 && " — excede 100%!"}
        </div>
      )}

      {/* Adicionar novo investidor */}
      {!disabled && (
        <>
          {addingNew ? (
            <div className="flex items-end gap-2">
              <div className="flex-1">
                <Label className="text-xs">Selecionar investidor</Label>
                <InvestidorSelect
                  value={newInvestidorId}
                  onValueChange={setNewInvestidorId}
                />
              </div>
              <Button size="sm" onClick={handleAdd} disabled={!newInvestidorId}>
                Adicionar
              </Button>
              <Button size="sm" variant="outline" onClick={() => { setAddingNew(false); setNewInvestidorId(""); }}>
                Cancelar
              </Button>
            </div>
          ) : (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setAddingNew(true)}
              className="w-full border-dashed"
            >
              <Plus className="h-4 w-4 mr-2" />
              Adicionar Investidor
            </Button>
          )}
        </>
      )}
    </div>
  );
}
