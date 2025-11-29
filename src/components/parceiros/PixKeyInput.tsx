import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Trash2 } from "lucide-react";

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
    onChange([...keys, { tipo: "cpf", chave: "" }]);
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

  return (
    <div className="space-y-3">
      {keys.map((key, index) => (
        <div key={index} className="grid grid-cols-[140px_1fr_auto] gap-2 items-end">
          <div>
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
                <SelectItem value="cpf">CPF</SelectItem>
                <SelectItem value="email">Email</SelectItem>
                <SelectItem value="telefone">Telefone</SelectItem>
                <SelectItem value="aleatoria">Chave Aleatória</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
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
          {!disabled && keys.length > 1 && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => removeKey(index)}
            >
              <Trash2 className="h-4 w-4 text-red-600" />
            </Button>
          )}
        </div>
      ))}
      
      {!disabled && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={addKey}
          className="w-full"
        >
          + Adicionar outra chave PIX
        </Button>
      )}
    </div>
  );
}
