import { useState, useEffect, useRef, useCallback } from "react";
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
  const [selectedParceiro, setSelectedParceiro] = useState<Parceiro | null>(null);
  
  // Ref para rastrear se já buscamos o parceiro selecionado
  const fetchedValueRef = useRef<string | null>(null);

  // Buscar lista de parceiros
  const fetchParceiros = useCallback(async () => {
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
  }, []);

  // Buscar parceiro específico por ID
  const fetchParceiroById = useCallback(async (parceiroId: string) => {
    if (!parceiroId || fetchedValueRef.current === parceiroId) return;
    
    fetchedValueRef.current = parceiroId;
    
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
      fetchedValueRef.current = null;
    }
  }, []);

  // Carregar lista inicial
  useEffect(() => {
    fetchParceiros();
  }, [fetchParceiros]);

  // Sincronizar selectedParceiro com value
  useEffect(() => {
    if (!value) {
      setSelectedParceiro(null);
      fetchedValueRef.current = null;
      return;
    }

    // Se já temos o parceiro correto selecionado, não fazer nada
    if (selectedParceiro?.id === value) {
      return;
    }

    // Tentar encontrar na lista carregada
    const found = parceiros.find(p => p.id === value);
    if (found) {
      setSelectedParceiro(found);
      fetchedValueRef.current = value;
    } else if (!loading) {
      // Se a lista já carregou e não encontrou, buscar diretamente
      fetchParceiroById(value);
    }
  }, [value, parceiros, loading, selectedParceiro?.id, fetchParceiroById]);

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
        {selectedParceiro ? (
          <div className="flex items-center justify-center gap-2 w-full">
            <User className="h-4 w-4 flex-shrink-0" />
            <span className="truncate">{selectedParceiro.nome}</span>
          </div>
        ) : (
          <SelectValue placeholder={loading ? "Carregando..." : "Selecione um parceiro ativo"} />
        )}
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
