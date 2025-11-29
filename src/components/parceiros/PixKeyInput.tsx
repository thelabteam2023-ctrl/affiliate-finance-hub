import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Plus, X } from "lucide-react";
import { formatCPF } from "@/lib/validators";

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
    
    // Se tipo for CPF, preencher automaticamente com o CPF do parceiro (formatado)
    if (field === "tipo" && value === "cpf" && cpf) {
      updated[index].chave = cpf;
    }
    
    onChange(updated);
  };

  const validatePixKey = (tipo: string, chave: string): string | null => {
    if (!chave) return null;
    
    switch (tipo) {
      case "email":
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(chave)) {
          return "Email inválido";
        }
        break;
      case "telefone":
        // Formato: +55 (00) 00000-0000 ou variantes internacionais
        const phoneRegex = /^\+\d{1,3}\s?\(?\d{2}\)?\s?\d{4,5}-?\d{4}$/;
        if (!phoneRegex.test(chave.replace(/\s/g, ""))) {
          return "Telefone inválido. Use o formato: +55 (00) 00000-0000";
        }
        break;
      case "cpf":
        const cpfClean = chave.replace(/\D/g, "");
        if (cpfClean.length !== 11) {
          return "CPF deve ter 11 dígitos";
        }
        break;
    }
    return null;
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
    <div className="space-y-3">
      <Label className="text-sm font-medium">Chaves PIX *</Label>
      {keys.map((key, index) => {
        const availableTypes = getAvailableTypes(index);
        const error = validatePixKey(key.tipo, key.chave);
        
        return (
          <div key={index} className="space-y-1">
            <div className="flex gap-2 items-start">
              <div className="w-[180px]">
                <Select
                  value={key.tipo}
                  onValueChange={(value) => updateKey(index, "tipo", value)}
                  disabled={disabled}
                >
                  <SelectTrigger className="h-11 bg-background/50 border-border/50">
                    <SelectValue placeholder="Selecione..." />
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
                <Input
                  value={key.tipo === "cpf" && key.chave ? formatCPF(key.chave) : key.chave}
                  onChange={(e) => updateKey(index, "chave", e.target.value)}
                  placeholder={
                    key.tipo === "email" ? "exemplo@email.com" :
                    key.tipo === "telefone" ? "+55 (00) 00000-0000" :
                    key.tipo === "cpf" ? "000.000.000-00" :
                    "Digite a chave"
                  }
                  className="h-11 bg-background/50 border-border/50"
                  disabled={disabled || (key.tipo === "cpf" && !!cpf)}
                />
              </div>
              {!disabled && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-11 w-11 rounded-lg bg-background/50 border border-border/50 hover:bg-destructive/10 hover:text-destructive hover:border-destructive/50 transition-colors"
                  onClick={() => removeKey(index)}
                  disabled={keys.length === 1}
                >
                  <X className="h-4 w-4" />
                </Button>
              )}
            </div>
            {error && (
              <p className="text-xs text-destructive ml-[196px]">{error}</p>
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
          className="w-full h-10 rounded-lg bg-background/50 border border-border/50 hover:bg-primary/10 hover:text-primary hover:border-primary/50 transition-colors mt-1"
        >
          <Plus className="h-4 w-4 mr-2" />
          Adicionar chave
        </Button>
      )}
    </div>
  );
}
