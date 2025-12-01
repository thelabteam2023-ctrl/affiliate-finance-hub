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
}

interface BookmakerCatalogo {
  id: string;
  nome: string;
  logo_url: string | null;
  links_json: any;
}

export default function BookmakerSelect({ value, onValueChange, disabled, parceiroId }: BookmakerSelectProps) {
  const [bookmakers, setBookmakers] = useState<BookmakerCatalogo[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchBookmakers();
  }, [parceiroId]);

  const fetchBookmakers = async () => {
    try {
      if (parceiroId) {
        // Se parceiroId for fornecido, buscar apenas bookmakers vinculadas a esse parceiro
        const { data: vinculosData, error: vinculosError } = await supabase
          .from("bookmakers")
          .select("bookmaker_catalogo_id")
          .eq("parceiro_id", parceiroId);

        if (vinculosError) throw vinculosError;

        const catalogoIds = vinculosData
          ?.map(v => v.bookmaker_catalogo_id)
          .filter(Boolean) as string[];

        if (catalogoIds.length === 0) {
          setBookmakers([]);
          setLoading(false);
          return;
        }

        const { data, error } = await supabase
          .from("bookmakers_catalogo")
          .select("id, nome, logo_url, links_json")
          .in("id", catalogoIds)
          .order("nome");

        if (error) throw error;
        setBookmakers(data || []);
      } else {
        // Sem filtro, buscar todos
        const { data, error } = await supabase
          .from("bookmakers_catalogo")
          .select("id, nome, logo_url, links_json")
          .order("nome");

        if (error) throw error;
        setBookmakers(data || []);
      }
    } catch (error) {
      console.error("Erro ao carregar bookmakers:", error);
    } finally {
      setLoading(false);
    }
  };

  const filteredBookmakers = bookmakers.filter((bookmaker) =>
    bookmaker.nome.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const selectedBookmaker = bookmakers.find((b) => b.id === value);

  return (
    <Select value={value} onValueChange={onValueChange} disabled={disabled || loading}>
      <SelectTrigger className="w-full h-12">
        <SelectValue placeholder="Selecione...">
          {selectedBookmaker && (
            <div className="flex items-center gap-2">
              {selectedBookmaker.logo_url && (
                <img
                  src={selectedBookmaker.logo_url}
                  alt={selectedBookmaker.nome}
                  className="h-6 w-6 rounded object-contain"
                  onError={(e) => {
                    e.currentTarget.style.display = "none";
                  }}
                />
              )}
              <span className="uppercase">{selectedBookmaker.nome}</span>
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
        {filteredBookmakers.length === 0 ? (
          <div className="py-6 text-center text-sm text-muted-foreground">
            {parceiroId 
              ? "Este parceiro não possui bookmakers vinculadas"
              : "Nenhuma bookmaker encontrada"}
          </div>
        ) : (
          filteredBookmakers.map((bookmaker) => (
            <SelectItem key={bookmaker.id} value={bookmaker.id}>
              <div className="flex items-center gap-2">
                {bookmaker.logo_url && (
                  <img
                    src={bookmaker.logo_url}
                    alt={bookmaker.nome}
                    className="h-6 w-6 rounded object-contain"
                    onError={(e) => {
                      e.currentTarget.style.display = "none";
                    }}
                  />
                )}
                <span className="uppercase">{bookmaker.nome}</span>
              </div>
            </SelectItem>
          ))
        )}
      </SelectContent>
    </Select>
  );
}
