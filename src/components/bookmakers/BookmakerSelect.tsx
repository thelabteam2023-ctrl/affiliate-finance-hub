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
  id: string; // ID da tabela bookmakers (vínculo)
  nome: string;
  logo_url: string | null;
  saldo_atual: number;
  moeda: string;
}

export default function BookmakerSelect({ value, onValueChange, disabled, parceiroId, somenteComSaldo }: BookmakerSelectProps) {
  const [bookmakers, setBookmakers] = useState<BookmakerCatalogo[]>([]);
  const [vinculosBookmakers, setVinculosBookmakers] = useState<BookmakerVinculo[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [loading, setLoading] = useState(true);

  // Determina se estamos no modo vínculo (com parceiroId) ou modo catálogo
  const isVinculoMode = !!parceiroId;

  useEffect(() => {
    fetchBookmakers();
  }, [parceiroId, somenteComSaldo]);

  const fetchBookmakers = async () => {
    try {
      if (parceiroId) {
        // Se parceiroId for fornecido, buscar bookmakers vinculadas a esse parceiro
        // e retornar o ID da tabela bookmakers (não do catálogo)
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

        // Se somenteComSaldo = true, filtrar apenas bookmakers com saldo > 0
        if (somenteComSaldo) {
          query = query.gt("saldo_atual", 0);
        }

        const { data, error } = await query.order("nome");

        if (error) throw error;

        // Mapear para o formato esperado, usando o ID do vínculo (bookmakers.id)
        const vinculos: BookmakerVinculo[] = (data || []).map((b: any) => ({
          id: b.id, // Este é o ID da tabela bookmakers!
          nome: b.nome,
          logo_url: b.bookmakers_catalogo?.logo_url || null,
          saldo_atual: b.saldo_atual,
          moeda: b.moeda,
        }));

        setVinculosBookmakers(vinculos);
        setBookmakers([]); // Limpar catálogo quando no modo vínculo
      } else {
        // Sem filtro, buscar todos do catálogo
        const { data, error } = await supabase
          .from("bookmakers_catalogo")
          .select("id, nome, logo_url, links_json")
          .order("nome");

        if (error) throw error;
        setBookmakers(data || []);
        setVinculosBookmakers([]); // Limpar vínculos quando no modo catálogo
      }
    } catch (error) {
      console.error("Erro ao carregar bookmakers:", error);
    } finally {
      setLoading(false);
    }
  };

  // Filtrar baseado no modo atual
  const filteredItems = isVinculoMode
    ? vinculosBookmakers.filter((b) => b.nome.toLowerCase().includes(searchTerm.toLowerCase()))
    : bookmakers.filter((b) => b.nome.toLowerCase().includes(searchTerm.toLowerCase()));

  const selectedItem = isVinculoMode
    ? vinculosBookmakers.find((b) => b.id === value)
    : bookmakers.find((b) => b.id === value);

  return (
    <Select value={value} onValueChange={onValueChange} disabled={disabled || loading}>
      <SelectTrigger className="w-full h-12">
        <SelectValue placeholder="Selecione...">
          {selectedItem && (
            <div className="flex items-center gap-2">
              {selectedItem.logo_url && (
                <img
                  src={selectedItem.logo_url}
                  alt={selectedItem.nome}
                  className="h-6 w-6 rounded object-contain"
                  onError={(e) => {
                    e.currentTarget.style.display = "none";
                  }}
                />
              )}
              <span className="uppercase">{selectedItem.nome}</span>
            </div>
          )}
        </SelectValue>
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
                    className="h-6 w-6 rounded object-contain"
                    onError={(e) => {
                      e.currentTarget.style.display = "none";
                    }}
                  />
                )}
                <span className="uppercase">{item.nome}</span>
                {isVinculoMode && 'saldo_atual' in item && (
                  <span className="text-xs text-muted-foreground ml-auto">
                    Saldo: {(item as BookmakerVinculo).moeda} {(item as BookmakerVinculo).saldo_atual.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
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
