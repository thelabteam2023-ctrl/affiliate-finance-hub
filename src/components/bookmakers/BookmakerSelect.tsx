import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Search } from "lucide-react";

interface BookmakerSelectProps {
  value: string;
  onValueChange: (value: string) => void;
  disabled?: boolean;
  parceiroId?: string;
  somenteComSaldo?: boolean;
}

interface BookmakerItem {
  id: string;
  nome: string;
  logo_url: string | null;
  saldo_atual?: number;
  moeda?: string;
}

export default function BookmakerSelect({ 
  value, 
  onValueChange, 
  disabled, 
  parceiroId, 
  somenteComSaldo 
}: BookmakerSelectProps) {
  const [items, setItems] = useState<BookmakerItem[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [loading, setLoading] = useState(true);
  const [displayData, setDisplayData] = useState<{ nome: string; logo_url: string | null } | null>(null);

  const isVinculoMode = !!parceiroId;

  // Buscar lista de bookmakers
  useEffect(() => {
    const fetchBookmakers = async () => {
      setLoading(true);
      try {
        if (parceiroId) {
          // Modo vínculo: buscar bookmakers vinculadas ao parceiro
          let query = supabase
            .from("bookmakers")
            .select(`
              id,
              nome,
              saldo_atual,
              moeda,
              bookmakers_catalogo:bookmaker_catalogo_id (
                logo_url
              )
            `)
            .eq("parceiro_id", parceiroId);

          if (somenteComSaldo) {
            query = query.gt("saldo_atual", 0);
          }

          const { data, error } = await query.order("nome");
          if (error) throw error;

          const mapped: BookmakerItem[] = (data || []).map((b: any) => ({
            id: b.id,
            nome: b.nome,
            logo_url: b.bookmakers_catalogo?.logo_url || null,
            saldo_atual: b.saldo_atual,
            moeda: b.moeda,
          }));

          setItems(mapped);
        } else {
          // Modo catálogo
          const { data, error } = await supabase
            .from("bookmakers_catalogo")
            .select("id, nome, logo_url")
            .order("nome");

          if (error) throw error;
          setItems(data || []);
        }
      } catch (error) {
        console.error("Erro ao carregar bookmakers:", error);
        setItems([]);
      } finally {
        setLoading(false);
      }
    };

    fetchBookmakers();
  }, [parceiroId, somenteComSaldo]);

  // Quando value muda, buscar dados para exibição
  useEffect(() => {
    if (!value) {
      setDisplayData(null);
      return;
    }

    // Primeiro, verificar na lista local
    const found = items.find(b => b.id === value);
    if (found) {
      setDisplayData({ nome: found.nome, logo_url: found.logo_url });
      return;
    }

    // Se não encontrou na lista e não está em modo vínculo, buscar do catálogo
    if (!isVinculoMode) {
      const fetchDisplayData = async () => {
        try {
          const { data } = await supabase
            .from("bookmakers_catalogo")
            .select("nome, logo_url")
            .eq("id", value)
            .maybeSingle();
          
          if (data) {
            setDisplayData({ nome: data.nome, logo_url: data.logo_url });
          }
        } catch (error) {
          console.error("Erro ao buscar bookmaker:", error);
        }
      };

      fetchDisplayData();
    }
  }, [value, items, isVinculoMode]);

  // Filtrar itens pela busca
  const filteredItems = items.filter((item) => 
    item.nome.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <Select value={value} onValueChange={onValueChange} disabled={disabled || loading}>
      <SelectTrigger className="w-full h-12">
        <div className="flex items-center justify-center gap-2 w-full">
          {displayData?.logo_url && (
            <img
              src={displayData.logo_url}
              alt=""
              className="h-6 w-6 rounded object-contain flex-shrink-0"
              onError={(e) => { e.currentTarget.style.display = "none"; }}
            />
          )}
          <span className="uppercase truncate">
            {displayData?.nome || (loading ? "Carregando..." : "Selecione...")}
          </span>
        </div>
      </SelectTrigger>
      <SelectContent className="max-h-[300px]">
        <div className="sticky top-0 z-10 bg-popover p-2 border-b">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar bookmaker..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-8 h-9"
            />
          </div>
        </div>
        {filteredItems.length === 0 ? (
          <div className="py-6 text-center text-sm text-muted-foreground">
            {parceiroId 
              ? (somenteComSaldo 
                  ? "Este parceiro não possui bookmakers com saldo disponível" 
                  : "Este parceiro não possui bookmakers vinculadas")
              : "Nenhuma bookmaker encontrada"}
          </div>
        ) : (
          filteredItems.map((item) => (
            <SelectItem key={item.id} value={item.id}>
              <div className="flex items-center gap-2">
                {item.logo_url && (
                  <img
                    src={item.logo_url}
                    alt=""
                    className="h-6 w-6 rounded object-contain flex-shrink-0"
                    onError={(e) => { e.currentTarget.style.display = "none"; }}
                  />
                )}
                <span className="uppercase">{item.nome}</span>
                {item.saldo_atual !== undefined && (
                  <span className="text-xs text-muted-foreground ml-auto">
                    Saldo: {item.moeda} {item.saldo_atual.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                  </span>
                )}
              </div>
            </SelectItem>
          ))
        )}
      </SelectContent>
    </Select>
  );
}
