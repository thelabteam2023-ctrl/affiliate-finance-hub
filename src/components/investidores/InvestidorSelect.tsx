import { useState, useEffect } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Search } from "lucide-react";

interface InvestidorSelectProps {
  value: string;
  onValueChange: (value: string) => void;
  disabled?: boolean;
}

interface Investidor {
  id: string;
  nome: string;
  cpf: string;
  status: string;
}

export function InvestidorSelect({ value, onValueChange, disabled }: InvestidorSelectProps) {
  const [investidores, setInvestidores] = useState<Investidor[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");

  useEffect(() => {
    fetchInvestidores();
  }, []);

  const fetchInvestidores = async () => {
    try {
      // RLS policies handle workspace isolation
      const { data, error } = await supabase
        .from("investidores")
        .select("*")
        .eq("status", "ativo")
        .order("nome");

      if (error) throw error;
      setInvestidores(data || []);
    } catch (error) {
      console.error("Erro ao carregar investidores:", error);
    } finally {
      setLoading(false);
    }
  };

  const filteredInvestidores = investidores.filter((inv) => {
    const searchLower = searchTerm.toLowerCase();
    return (
      inv.nome.toLowerCase().includes(searchLower) ||
      inv.cpf.includes(searchTerm.replace(/\D/g, ""))
    );
  });

  const formatCPF = (cpf: string) => {
    return cpf.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
  };

  const selectedInvestidor = investidores.find((inv) => inv.id === value);

  return (
    <Select value={value} onValueChange={onValueChange} disabled={disabled}>
      <SelectTrigger>
        <SelectValue placeholder={loading ? "Carregando..." : "Selecione um investidor"}>
          {selectedInvestidor ? (
            <span>
              {selectedInvestidor.nome} - {formatCPF(selectedInvestidor.cpf)}
            </span>
          ) : (
            "Selecione um investidor"
          )}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        <div className="p-2">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar investidor..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-8 h-8"
            />
          </div>
        </div>
        {filteredInvestidores.length === 0 ? (
          <div className="p-4 text-center text-sm text-muted-foreground">
            {searchTerm ? "Nenhum investidor encontrado" : "Nenhum investidor ativo"}
          </div>
        ) : (
          filteredInvestidores.map((investidor) => (
            <SelectItem key={investidor.id} value={investidor.id}>
              <div className="flex flex-col">
                <span className="font-medium">{investidor.nome}</span>
                <span className="text-xs text-muted-foreground">{formatCPF(investidor.cpf)}</span>
              </div>
            </SelectItem>
          ))
        )}
      </SelectContent>
    </Select>
  );
}
