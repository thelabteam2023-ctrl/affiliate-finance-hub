import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Search, User } from "lucide-react";

interface ParceiroSelectProps {
  value: string;
  onValueChange: (value: string) => void;
  disabled?: boolean;
  onlyParceiros?: string[];
}

interface Parceiro {
  id: string;
  nome: string;
  cpf: string;
  status: string;
}

export default function ParceiroSelect({ value, onValueChange, disabled, onlyParceiros }: ParceiroSelectProps) {
  const [parceiros, setParceiros] = useState<Parceiro[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [displayName, setDisplayName] = useState<string>("");

  // Buscar lista de parceiros ativos
  useEffect(() => {
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

    fetchParceiros();
  }, []);

  // Quando value muda, buscar o nome para exibição
  useEffect(() => {
    if (!value) {
      setDisplayName("");
      return;
    }

    // Primeiro, verificar na lista local
    const found = parceiros.find(p => p.id === value);
    if (found) {
      setDisplayName(found.nome);
      return;
    }

    // Se não encontrou na lista (pode ser um parceiro pré-selecionado), buscar do banco
    const fetchDisplayName = async () => {
      try {
        const { data } = await supabase
          .from("parceiros")
          .select("nome")
          .eq("id", value)
          .maybeSingle();
        
        if (data) {
          setDisplayName(data.nome);
        }
      } catch (error) {
        console.error("Erro ao buscar nome do parceiro:", error);
      }
    };

    fetchDisplayName();
  }, [value, parceiros]);

  // Aplicar filtro de onlyParceiros se fornecido
  const availableParceiros = onlyParceiros 
    ? parceiros.filter(p => onlyParceiros.includes(p.id))
    : parceiros;

  const filteredParceiros = availableParceiros.filter((parceiro) =>
    parceiro.nome.toLowerCase().includes(searchTerm.toLowerCase()) ||
    parceiro.cpf.includes(searchTerm)
  );

  return (
    <Select value={value} onValueChange={onValueChange} disabled={disabled || loading}>
      <SelectTrigger className="w-full text-center">
        <div className="flex items-center justify-center gap-2 w-full">
          <User className="h-4 w-4 flex-shrink-0" />
          <span className="truncate text-center">
            {displayName || (loading ? "Carregando..." : "Selecione um parceiro ativo")}
          </span>
        </div>
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
                  <User className="h-4 w-4 text-muted-foreground flex-shrink-0" />
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
