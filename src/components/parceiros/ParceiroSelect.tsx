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
  onlyParceiros?: string[]; // IDs dos parceiros que podem ser exibidos
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
  const [selectedParceiro, setSelectedParceiro] = useState<Parceiro | null>(null);

  useEffect(() => {
    fetchParceiros();
  }, []);

  // Buscar parceiro específico imediatamente quando value muda
  useEffect(() => {
    if (value) {
      // Primeiro tentar encontrar na lista já carregada
      const found = parceiros.find(p => p.id === value);
      if (found) {
        setSelectedParceiro(found);
      } else {
        // Se não encontrou, buscar diretamente do banco
        fetchSelectedParceiro(value);
      }
    } else {
      setSelectedParceiro(null);
    }
  }, [value, parceiros]);

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

  const fetchSelectedParceiro = async (parceiroId: string) => {
    if (!parceiroId) return;
    try {
      const { data, error } = await supabase
        .from("parceiros")
        .select("id, nome, cpf, status")
        .eq("id", parceiroId)
        .maybeSingle();

      if (error) throw error;
      if (data) {
        setSelectedParceiro(data);
      }
    } catch (error) {
      console.error("Erro ao buscar parceiro selecionado:", error);
    }
  };

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
      <SelectTrigger className="w-full">
        <SelectValue placeholder={loading ? "Carregando..." : "Selecione um parceiro ativo"}>
          {selectedParceiro && (
            <div className="flex items-center justify-center gap-2 w-full">
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
