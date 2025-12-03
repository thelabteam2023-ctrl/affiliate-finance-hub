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
import { Search } from "lucide-react";

interface BookmakerSelectProps {
  value: string;
  onValueChange: (value: string) => void;
  disabled?: boolean;
  parceiroId?: string;
  somenteComSaldo?: boolean;
}

interface BookmakerCatalogo {
  id: string;
  nome: string;
  logo_url: string | null;
  links_json: any;
}

interface BookmakerVinculo {
  id: string;
  nome: string;
  logo_url: string | null;
  saldo_atual: number;
  moeda: string;
}

type BookmakerItem = BookmakerCatalogo | BookmakerVinculo;

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
  const [selectedItem, setSelectedItem] = useState<BookmakerItem | null>(null);
  
  // Refs para controle de estado
  const fetchedValueRef = useRef<string | null>(null);
  const isVinculoMode = !!parceiroId;

  // Buscar lista de bookmakers (catálogo ou vínculos)
  const fetchBookmakers = useCallback(async () => {
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
            bookmaker_catalogo_id,
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

        const vinculos: BookmakerVinculo[] = (data || []).map((b: any) => ({
          id: b.id,
          nome: b.nome,
          logo_url: b.bookmakers_catalogo?.logo_url || null,
          saldo_atual: b.saldo_atual,
          moeda: b.moeda,
        }));

        setItems(vinculos);
      } else {
        // Modo catálogo: buscar todos do catálogo
        const { data, error } = await supabase
          .from("bookmakers_catalogo")
          .select("id, nome, logo_url, links_json")
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
  }, [parceiroId, somenteComSaldo]);

  // Buscar bookmaker específica do catálogo por ID
  const fetchBookmakerById = useCallback(async (bookmakerId: string) => {
    if (!bookmakerId || fetchedValueRef.current === bookmakerId) return;
    
    fetchedValueRef.current = bookmakerId;
    
    try {
      const { data, error } = await supabase
        .from("bookmakers_catalogo")
        .select("id, nome, logo_url, links_json")
        .eq("id", bookmakerId)
        .maybeSingle();

      if (error) throw error;
      if (data) {
        setSelectedItem(data);
      }
    } catch (error) {
      console.error("Erro ao buscar bookmaker selecionada:", error);
      fetchedValueRef.current = null;
    }
  }, []);

  // Carregar lista quando parceiroId ou somenteComSaldo mudam
  useEffect(() => {
    fetchBookmakers();
  }, [fetchBookmakers]);

  // Sincronizar selectedItem com value
  useEffect(() => {
    if (!value) {
      setSelectedItem(null);
      fetchedValueRef.current = null;
      return;
    }

    // Se já temos o item correto selecionado, não fazer nada
    if (selectedItem?.id === value) {
      return;
    }

    // Tentar encontrar na lista carregada
    const found = items.find(b => b.id === value);
    if (found) {
      setSelectedItem(found);
      fetchedValueRef.current = value;
    } else if (!loading && !isVinculoMode) {
      // Se a lista já carregou, não encontrou, e estamos no modo catálogo, buscar diretamente
      fetchBookmakerById(value);
    }
  }, [value, items, loading, selectedItem?.id, isVinculoMode, fetchBookmakerById]);

  // Filtrar itens pela busca
  const filteredItems = items.filter((item) => 
    item.nome.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Verificar se é um vínculo (tem saldo_atual)
  const isVinculo = (item: BookmakerItem): item is BookmakerVinculo => {
    return 'saldo_atual' in item;
  };

  return (
    <Select value={value} onValueChange={onValueChange} disabled={disabled || loading}>
      <SelectTrigger className="w-full h-12">
        {selectedItem ? (
          <div className="flex items-center justify-center gap-2 w-full">
            {selectedItem.logo_url && (
              <img
                src={selectedItem.logo_url}
                alt={selectedItem.nome}
                className="h-6 w-6 rounded object-contain flex-shrink-0"
                onError={(e) => {
                  e.currentTarget.style.display = "none";
                }}
              />
            )}
            <span className="uppercase truncate">{selectedItem.nome}</span>
          </div>
        ) : (
          <SelectValue placeholder={loading ? "Carregando..." : "Selecione..."} />
        )}
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
                    alt={item.nome}
                    className="h-6 w-6 rounded object-contain flex-shrink-0"
                    onError={(e) => {
                      e.currentTarget.style.display = "none";
                    }}
                  />
                )}
                <span className="uppercase">{item.nome}</span>
                {isVinculo(item) && (
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
