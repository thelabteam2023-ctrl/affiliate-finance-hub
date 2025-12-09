import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Search } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export interface BookmakerData {
  id: string;
  nome: string;
  logo_url: string | null;
  saldo_atual?: number;
  saldo_freebet?: number;
  moeda?: string;
  status?: string;
}

interface BookmakerSelectProps {
  value: string;
  onValueChange: (value: string) => void;
  onBookmakerData?: (data: BookmakerData | null) => void;
  disabled?: boolean;
  parceiroId?: string;
  somenteComSaldo?: boolean;
  excludeVinculosDoParceiro?: string; // ID do parceiro para excluir bookmakers já vinculadas
}

interface BookmakerItem {
  id: string;
  nome: string;
  logo_url: string | null;
  saldo_atual?: number;
  saldo_freebet?: number;
  moeda?: string;
  status?: string;
}

export default function BookmakerSelect({ 
  value, 
  onValueChange, 
  onBookmakerData,
  disabled, 
  parceiroId, 
  somenteComSaldo,
  excludeVinculosDoParceiro
}: BookmakerSelectProps) {
  const [items, setItems] = useState<BookmakerItem[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [loading, setLoading] = useState(true);
  const [displayData, setDisplayData] = useState<{ nome: string; logo_url: string | null } | null>(null);
  const [isMaster, setIsMaster] = useState(false);
  
  // Ref para rastrear o último value que buscamos
  const lastFetchedValue = useRef<string>("");
  const isVinculoMode = !!parceiroId;

  // Verificar se usuário é master
  useEffect(() => {
    const checkMasterRole = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        const { data } = await supabase.rpc('is_master', { _user_id: user.id });
        setIsMaster(data === true);
      } catch (error) {
        console.error("Erro ao verificar role:", error);
        setIsMaster(false);
      }
    };
    checkMasterRole();
  }, []);
  
  // Notificar callback quando o item selecionado muda
  useEffect(() => {
    if (!value) {
      onBookmakerData?.(null);
      return;
    }
    const selectedItem = items.find(item => item.id === value);
    if (selectedItem) {
      onBookmakerData?.({
        id: selectedItem.id,
        nome: selectedItem.nome,
        logo_url: selectedItem.logo_url,
        saldo_atual: selectedItem.saldo_atual,
        saldo_freebet: selectedItem.saldo_freebet,
        moeda: selectedItem.moeda,
        status: selectedItem.status,
      });
    }
  }, [value, items, onBookmakerData]);

  // Buscar lista de bookmakers para o dropdown
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
              saldo_freebet,
              moeda,
              status,
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
            saldo_freebet: b.saldo_freebet,
            moeda: b.moeda,
            status: b.status,
          }));

          setItems(mapped);
        } else {
          // Modo catálogo
          let query = supabase
            .from("bookmakers_catalogo")
            .select("id, nome, logo_url, operacional");
          
          // Não-masters veem apenas bookmakers REGULAMENTADA
          if (!isMaster) {
            query = query.eq("operacional", "REGULAMENTADA");
          }
          
          const { data, error } = await query.order("nome");

          if (error) throw error;
          
          let catalogoItems = data || [];
          
          // Filtrar bookmakers já vinculadas ao parceiro (se especificado)
          if (excludeVinculosDoParceiro) {
            const { data: vinculosExistentes } = await supabase
              .from("bookmakers")
              .select("bookmaker_catalogo_id")
              .eq("parceiro_id", excludeVinculosDoParceiro);
            
            const idsJaVinculados = new Set(
              (vinculosExistentes || [])
                .map(v => v.bookmaker_catalogo_id)
                .filter(Boolean)
            );
            
            catalogoItems = catalogoItems.filter(b => !idsJaVinculados.has(b.id));
          }
          
          setItems(catalogoItems);
        }
      } catch (error) {
        console.error("Erro ao carregar bookmakers:", error);
        setItems([]);
      } finally {
        setLoading(false);
      }
    };

    fetchBookmakers();
  }, [parceiroId, somenteComSaldo, excludeVinculosDoParceiro, isMaster]);

  // Buscar dados de exibição quando value muda - INDEPENDENTE da lista
  useEffect(() => {
    // Se value está vazio, limpar exibição
    if (!value) {
      setDisplayData(null);
      lastFetchedValue.current = "";
      return;
    }

    // Se já buscamos esse value, não buscar novamente
    if (lastFetchedValue.current === value && displayData) {
      return;
    }

    const fetchDisplayData = async () => {
      try {
        if (isVinculoMode) {
          // Modo vínculo: buscar da tabela bookmakers
          const { data } = await supabase
            .from("bookmakers")
            .select(`
              nome,
              bookmakers_catalogo:bookmaker_catalogo_id (
                logo_url
              )
            `)
            .eq("id", value)
            .maybeSingle();
          
          if (data) {
            setDisplayData({ 
              nome: data.nome, 
              logo_url: (data.bookmakers_catalogo as any)?.logo_url || null 
            });
            lastFetchedValue.current = value;
          }
        } else {
          // Modo catálogo: buscar da tabela bookmakers_catalogo
          const { data } = await supabase
            .from("bookmakers_catalogo")
            .select("nome, logo_url")
            .eq("id", value)
            .maybeSingle();
          
          if (data) {
            setDisplayData({ nome: data.nome, logo_url: data.logo_url });
            lastFetchedValue.current = value;
          }
        }
      } catch (error) {
        console.error("Erro ao buscar bookmaker:", error);
      }
    };

    fetchDisplayData();
  }, [value, isVinculoMode]); // NÃO depende de items - evita re-execuções

  // Filtrar itens pela busca
  const filteredItems = items.filter((item) => 
    item.nome.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <TooltipProvider>
      <Select value={value} onValueChange={onValueChange} disabled={disabled || loading}>
        <Tooltip>
          <TooltipTrigger asChild>
            <SelectTrigger className="w-full h-12">
              <div className="flex items-center justify-center gap-2 w-full min-w-0 overflow-hidden">
                {displayData?.logo_url && (
                  <img
                    src={displayData.logo_url}
                    alt=""
                    className="h-6 w-6 rounded object-contain flex-shrink-0"
                    onError={(e) => { e.currentTarget.style.display = "none"; }}
                  />
                )}
                <span className="uppercase truncate max-w-[calc(100%-40px)]">
                  {displayData?.nome || (loading ? "Carregando..." : "Selecione...")}
                </span>
              </div>
            </SelectTrigger>
          </TooltipTrigger>
          {displayData?.nome && displayData.nome.length > 20 && (
            <TooltipContent side="top" className="max-w-xs">
              <p className="uppercase">{displayData.nome}</p>
            </TooltipContent>
          )}
        </Tooltip>
        <SelectContent 
          position="popper" 
          sideOffset={4}
          className="max-h-[300px] max-w-[320px] z-[100] bg-popover"
        >
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
            filteredItems.map((item) => {
              const isLimitada = item.status === "LIMITADA";
              return (
                <Tooltip key={item.id}>
                  <TooltipTrigger asChild>
                    <div>
                      <SelectItem 
                        value={item.id}
                        className={`${isLimitada ? "data-[highlighted]:bg-yellow-500/20" : "data-[highlighted]:bg-emerald-500/20"}`}
                      >
                        <div className="flex items-center gap-2 min-w-0 max-w-full overflow-hidden">
                          {item.logo_url && (
                            <img
                              src={item.logo_url}
                              alt=""
                              className="h-6 w-6 rounded object-contain flex-shrink-0"
                              onError={(e) => { e.currentTarget.style.display = "none"; }}
                            />
                          )}
                          <span className={`uppercase truncate ${isLimitada ? "text-yellow-400" : ""}`}>
                            {item.nome}
                          </span>
                          {item.saldo_atual !== undefined && (
                            <div className="ml-auto flex-shrink-0 text-right">
                              <span className="text-xs text-muted-foreground">
                                {item.moeda} {item.saldo_atual.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                              </span>
                              {(item.saldo_freebet ?? 0) > 0 && (
                                <span className="text-xs text-amber-400 ml-1">
                                  +FB {item.saldo_freebet?.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                      </SelectItem>
                    </div>
                  </TooltipTrigger>
                  {item.nome.length > 15 && (
                    <TooltipContent side="left" className="max-w-xs">
                      <p className="uppercase">{item.nome}</p>
                    </TooltipContent>
                  )}
                </Tooltip>
              );
            })
          )}
        </SelectContent>
      </Select>
    </TooltipProvider>
  );
}
