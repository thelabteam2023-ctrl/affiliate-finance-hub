/**
 * Etapa 4 - Ciclos (Opcional)
 */

import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { DatePicker } from "@/components/ui/date-picker";
import { Calendar, Target, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ProjectFormData } from "../ProjectCreationWizardTypes";
import { getMoedaSymbol } from "@/types/projeto";

interface StepCiclosProps {
  formData: ProjectFormData;
  onChange: (data: Partial<ProjectFormData>) => void;
}

export function StepCiclos({ formData, onChange }: StepCiclosProps) {
  const currencySymbol = getMoedaSymbol(formData.moeda_consolidacao);

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-2 mb-1">
          <h2 className="text-xl font-semibold">Primeiro Ciclo</h2>
          <Badge variant="secondary" className="text-xs">Opcional</Badge>
        </div>
        <p className="text-sm text-muted-foreground">
          Estruture o controle financeiro agora ou pule para criar depois.
        </p>
      </div>

      {/* Toggle para criar ciclo */}
      <Card className={formData.criar_ciclo ? "border-primary" : ""}>
        <CardContent className="pt-4">
          <div className="flex items-start gap-3">
            <Checkbox
              id="criar_ciclo"
              checked={formData.criar_ciclo}
              onCheckedChange={(checked) =>
                onChange({ criar_ciclo: checked as boolean })
              }
            />
            <div className="space-y-1">
              <Label htmlFor="criar_ciclo" className="flex items-center gap-2 cursor-pointer">
                <Calendar className="h-4 w-4 text-primary" />
                Criar o primeiro ciclo agora
              </Label>
              <p className="text-xs text-muted-foreground">
                Configure um ciclo com meta de lucro na moeda de consolidação do projeto
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {formData.criar_ciclo && (
        <div className="space-y-4 p-4 rounded-lg border bg-muted/20">

          {/* Linha principal: Nome + Datas */}
          <div className="grid grid-cols-1 md:grid-cols-[1.5fr_1fr_1fr] gap-4">
            <div className="space-y-1.5">
              <Label>Nome do Ciclo *</Label>
              <Input
                value={formData.ciclo_nome}
                onChange={(e) => onChange({ ciclo_nome: e.target.value.toUpperCase() })}
                placeholder="Ex: CICLO 01"
                className="uppercase"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Data de Início *</Label>
              <DatePicker
                value={formData.ciclo_data_inicio || ""}
                onChange={(date) => onChange({ ciclo_data_inicio: date })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Data de Fim Prevista *</Label>
              <DatePicker
                value={formData.ciclo_data_fim || ""}
                onChange={(date) => onChange({ ciclo_data_fim: date })}
              />
            </div>
          </div>

          {/* Linha: Métrica + Meta */}
          <div className="grid grid-cols-1 md:grid-cols-[1fr_1.5fr] gap-4">
            <div className="space-y-1.5">
              <Label>Métrica do Ciclo</Label>
              <Select
                value={formData.ciclo_metrica}
                onValueChange={(value) =>
                  onChange({ ciclo_metrica: value as "LUCRO" | "VOLUME" })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="LUCRO">
                    <div className="flex items-center gap-2">
                      <TrendingUp className="h-4 w-4 text-emerald-500" />
                      Lucro
                    </div>
                  </SelectItem>
                  <SelectItem value="VOLUME">
                    <div className="flex items-center gap-2">
                      <Target className="h-4 w-4 text-blue-500" />
                      Volume
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>
                Meta de {formData.ciclo_metrica === "LUCRO" ? "Lucro" : "Volume"} ({formData.moeda_consolidacao})
              </Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                  {currencySymbol}
                </span>
                <Input
                  type="number"
                  step="0.01"
                  value={formData.ciclo_meta_volume || ""}
                  onChange={(e) =>
                    onChange({ ciclo_meta_volume: parseFloat(e.target.value) || 0 })
                  }
                  placeholder="0.00"
                  className="pl-9"
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Info se não criar ciclo */}
      {!formData.criar_ciclo && (
        <div className="p-4 rounded-lg bg-muted/30 border text-center">
          <p className="text-sm text-muted-foreground">
            Você poderá criar ciclos a qualquer momento em{" "}
            <strong>Gestão → Ciclos</strong>.
          </p>
        </div>
      )}
    </div>
  );
}
