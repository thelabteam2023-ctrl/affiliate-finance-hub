import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Plus, X } from "lucide-react";

interface PixKey {
  tipo: string;
  chave: string;
}

interface PixKeyInputProps {
  keys: PixKey[];
  onChange: (keys: PixKey[]) => void;
  cpf?: string;
  disabled?: boolean;
}

export function PixKeyInput({ keys, onChange, cpf = "", disabled = false }: PixKeyInputProps) {
  const addKey = () => {
    // Determine default type - avoid CPF if already used
    const usedTypes = keys.map(k => k.tipo);
    const defaultType = usedTypes.includes("cpf") ? "email" : "cpf";
    onChange([...keys, { tipo: defaultType, chave: "" }]);
  };

  const removeKey = (index: number) => {
    onChange(keys.filter((_, i) => i !== index));
  };

  const updateKey = (index: number, field: "tipo" | "chave", value: string) => {
    const updated = [...keys];
    updated[index] = { ...updated[index], [field]: value };
    
    // Se tipo for CPF, preencher automaticamente com o CPF do parceiro
    if (field === "tipo" && value === "cpf" && cpf) {
      updated[index].chave = cpf.replace(/\D/g, "");
    }
    
    onChange(updated);
  };

  // Get available types for each key (exclude already used types except current)
  const getAvailableTypes = (currentIndex: number) => {
    const usedTypes = keys
      .map((k, i) => i !== currentIndex ? k.tipo : null)
      .filter(Boolean);
    
    const allTypes = [
      { value: "cpf", label: "CPF" },
      { value: "email", label: "Email" },
      { value: "telefone", label: "Telefone" },
      { value: "aleatoria", label: "Chave Aleatória" }
    ];
    
    return allTypes.filter(type => !usedTypes.includes(type.value));
  };

  return (
    <div className="space-y-2">
      {keys.map((key, index) => {
        const availableTypes = getAvailableTypes(index);
        
        return (
          <div key={index} className="flex gap-2 items-end">
            <div className="w-[140px]">
              {index === 0 && <Label className="text-xs mb-1">Tipo</Label>}
              <Select
                value={key.tipo}
                onValueChange={(value) => updateKey(index, "tipo", value)}
                disabled={disabled}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {availableTypes.map(type => (
                    <SelectItem key={type.value} value={type.value}>
                      {type.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex-1">
              {index === 0 && <Label className="text-xs mb-1">Chave PIX *</Label>}
              <Input
                value={key.chave}
                onChange={(e) => updateKey(index, "chave", e.target.value)}
                placeholder={
                  key.tipo === "cpf" ? "000.000.000-00" :
                  key.tipo === "email" ? "email@exemplo.com" :
                  key.tipo === "telefone" ? "+55 11 98765-4321" :
                  "Chave aleatória"
                }
                disabled={disabled || (key.tipo === "cpf" && !!cpf)}
              />
            </div>
            {!disabled && (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-10 w-10 hover:bg-destructive/10 hover:text-destructive transition-colors"
                onClick={() => removeKey(index)}
                disabled={keys.length === 1}
              >
                <X className="h-4 w-4" />
              </Button>
            )}
          </div>
        );
      })}
      
      {!disabled && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={addKey}
          className="w-full h-8 hover:bg-primary/10 hover:text-primary transition-colors"
        >
          <Plus className="h-4 w-4 mr-1" />
          Adicionar chave
        </Button>
      )}
    </div>
  );
}
