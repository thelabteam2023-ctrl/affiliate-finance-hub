import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Search, User } from "lucide-react";

interface ParceiroSelectProps {
  value: string;
  onValueChange: (value: string) => void;
  disabled?: boolean;
}

interface Parceiro {
  id: string;
  nome: string;
  cpf: string;
  status: string;
}

export default function ParceiroSelect({ value, onValueChange, disabled }: ParceiroSelectProps) {
  const [parceiros, setParceiros] = useState<Parceiro[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");

  useEffect(() => {
    fetchParceiros();
  }, []);

  const fetchParceiros = async () => {
    try {
      const { data, error } = await supabase
        .from("parceiros")
        .select("id, nome, cpf, status")
        .eq("status", "ativo")
        .order("nome", { ascending: true });

      if (error) throw error;
      setParceiros(data || []);
    } catch (error) {
      console.error("Erro ao buscar parceiros:", error);
    } finally {
      setLoading(false);
    }
  };

  const filteredParceiros = parceiros.filter((parceiro) =>
    parceiro.nome.toLowerCase().includes(searchTerm.toLowerCase()) ||
    parceiro.cpf.includes(searchTerm)
  );

  const selectedParceiro = parceiros.find((p) => p.id === value);

  return (
    <Select value={value} onValueChange={onValueChange} disabled={disabled || loading}>
      <SelectTrigger className="w-full">
        <SelectValue placeholder={loading ? "Carregando..." : "Selecione um parceiro ativo"}>
          {selectedParceiro && (
            <div className="flex items-center gap-2">
              <User className="h-4 w-4" />
              <span>{selectedParceiro.nome}</span>
            </div>
          )}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        <div className="p-2 border-b">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar parceiro..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-8"
            />
          </div>
        </div>
        <div className="max-h-[300px] overflow-auto">
          {filteredParceiros.length === 0 ? (
            <div className="p-4 text-center text-sm text-muted-foreground">
              {searchTerm ? "Nenhum parceiro encontrado" : "Nenhum parceiro ativo disponível"}
            </div>
          ) : (
            filteredParceiros.map((parceiro) => (
              <SelectItem key={parceiro.id} value={parceiro.id}>
                <div className="flex items-center gap-2">
                  <User className="h-4 w-4 text-muted-foreground" />
                  <span>{parceiro.nome}</span>
                  <span className="text-xs text-muted-foreground ml-auto">
                    CPF: {parceiro.cpf.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4")}
                  </span>
                </div>
              </SelectItem>
            ))
          )}
        </div>
      </SelectContent>
    </Select>
  );
}
