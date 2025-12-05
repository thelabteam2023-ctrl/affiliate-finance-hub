import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Plus, Trash2 } from "lucide-react";

interface Faixa {
  min: number;
  max: number | null;
  percentual: number;
}

interface FaixasEscalonadasInputProps {
  value: Faixa[];
  onChange: (faixas: Faixa[]) => void;
}

export function FaixasEscalonadasInput({ value, onChange }: FaixasEscalonadasInputProps) {
  const addFaixa = () => {
    const lastFaixa = value[value.length - 1];
    const newMin = lastFaixa ? (lastFaixa.max || 0) + 0.01 : 0;
    onChange([...value, { min: newMin, max: null, percentual: 0 }]);
  };

  const removeFaixa = (index: number) => {
    if (value.length <= 1) return;
    const newFaixas = value.filter((_, i) => i !== index);
    onChange(newFaixas);
  };

  const updateFaixa = (index: number, field: keyof Faixa, newValue: number | null) => {
    const newFaixas = value.map((faixa, i) => {
      if (i === index) {
        return { ...faixa, [field]: newValue };
      }
      return faixa;
    });
    onChange(newFaixas);
  };

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(val);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Label>Faixas Progressivas de Comissão</Label>
      </div>
      
      <div className="space-y-2">
        {value.map((faixa, index) => (
          <div key={index} className="flex items-center gap-2 p-3 rounded-lg bg-muted/50 border">
            <div className="flex-1 grid grid-cols-3 gap-2">
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">De (R$)</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={faixa.min}
                  onChange={(e) => updateFaixa(index, "min", parseFloat(e.target.value) || 0)}
                  placeholder="0,00"
                  className="h-8"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Até (R$)</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={faixa.max ?? ""}
                  onChange={(e) => updateFaixa(index, "max", e.target.value ? parseFloat(e.target.value) : null)}
                  placeholder="∞"
                  className="h-8"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Percentual (%)</Label>
                <Input
                  type="number"
                  step="0.1"
                  value={faixa.percentual}
                  onChange={(e) => updateFaixa(index, "percentual", parseFloat(e.target.value) || 0)}
                  placeholder="0"
                  className="h-8"
                />
              </div>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-muted-foreground hover:text-destructive"
              onClick={() => removeFaixa(index)}
              disabled={value.length <= 1}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        ))}
      </div>

      <Button
        type="button"
        variant="outline"
        size="sm"
        className="w-full"
        onClick={addFaixa}
      >
        <Plus className="h-4 w-4 mr-2" />
        Adicionar Faixa
      </Button>

      {value.length > 0 && (
        <div className="text-xs text-muted-foreground p-2 bg-muted/30 rounded">
          <strong>Resumo:</strong>{" "}
          {value.map((f, i) => (
            <span key={i}>
              {formatCurrency(f.min)} até {f.max ? formatCurrency(f.max) : "∞"} = {f.percentual}%
              {i < value.length - 1 && " | "}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
