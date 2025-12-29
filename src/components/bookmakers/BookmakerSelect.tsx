import { useState, useEffect, useRef, forwardRef, useImperativeHandle } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Check, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
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
  saldo_usd?: number;
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
  somenteComSaldoUsd?: boolean;
  somenteComSaldoFiat?: boolean; // Apenas bookmakers com saldo_atual > 0 (FIAT)
  excludeVinculosDoParceiro?: string;
  moedaOperacional?: string; // Filtra bookmakers pela moeda operacional (BRL, USD, etc)
}

export interface BookmakerSelectRef {
  focus: () => void;
  open: () => void;
}

interface BookmakerItem {
  id: string;
  nome: string;
  logo_url: string | null;
  saldo_atual?: number;
  saldo_usd?: number;
  saldo_freebet?: number;
  moeda?: string;
  status?: string;
}

const BookmakerSelect = forwardRef<BookmakerSelectRef, BookmakerSelectProps>(({ 
  value, 
  onValueChange, 
  onBookmakerData,
  disabled, 
  parceiroId, 
  somenteComSaldo,
  somenteComSaldoUsd,
  somenteComSaldoFiat,
  excludeVinculosDoParceiro,
  moedaOperacional
}, ref) => {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<BookmakerItem[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  // CRÍTICO: Iniciar como false para evitar flash - loading só deve ser true durante fetch ativo
  const [loading, setLoading] = useState(false);
  const [displayData, setDisplayData] = useState<{ nome: string; logo_url: string | null } | null>(null);
  const [loadingDisplay, setLoadingDisplay] = useState(false);
  // Flag para indicar se os pré-requisitos estão completos para fetch
  const [prerequisitesReady, setPrerequisitesReady] = useState(false);
  
  const lastFetchedValue = useRef<string>("");
  const triggerRef = useRef<HTMLButtonElement>(null);
  const isVinculoMode = !!parceiroId;

  // Expose focus and open methods via ref
  useImperativeHandle(ref, () => ({
    focus: () => {
      triggerRef.current?.focus();
    },
    open: () => {
      setOpen(true);
    }
  }));
  
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
        saldo_usd: selectedItem.saldo_usd,
        saldo_freebet: selectedItem.saldo_freebet,
        moeda: selectedItem.moeda,
        status: selectedItem.status,
      });
    }
  }, [value, items, onBookmakerData]);

  // ============================================================================
  // CONTROLE DETERMINÍSTICO: Lista só carrega quando pré-requisitos estão completos
  // Quando qualquer dependência muda, a lista é LIMPA IMEDIATAMENTE antes de refetch
  // ============================================================================
  
  // Refs para detectar mudanças reais de contexto (não montagem inicial)
  const prevContextRef = useRef<{
    parceiroId?: string;
    moedaOperacional?: string;
    initialized: boolean;
  }>({ initialized: false });
  
  // Limpar estado imediatamente quando dependências mudam (evita flash)
  useEffect(() => {
    const prev = prevContextRef.current;
    
    // Na montagem inicial, apenas marcar como inicializado
    if (!prev.initialized) {
      prevContextRef.current = { 
        parceiroId, 
        moedaOperacional, 
        initialized: true 
      };
      return;
    }
    
    // Detectar se houve mudança REAL de contexto
    const contextChanged = prev.parceiroId !== parceiroId || prev.moedaOperacional !== moedaOperacional;
    
    if (contextChanged) {
      // CRÍTICO: Limpar lista quando contexto muda
      setItems([]);
      setPrerequisitesReady(false);
      setDisplayData(null);
      lastFetchedValue.current = "";
      
      // Se o value atual não pode mais existir no novo contexto, limpar
      if (value) {
        onValueChange("");
      }
    }
    
    // Atualizar ref
    prevContextRef.current = { parceiroId, moedaOperacional, initialized: true };
  }, [parceiroId, moedaOperacional, somenteComSaldo, somenteComSaldoUsd, somenteComSaldoFiat]);
  
  // Buscar lista de bookmakers para o dropdown
  useEffect(() => {
    // Abortar fetch anterior se houver
    const abortController = new AbortController();
    
    const fetchBookmakers = async () => {
      // MODO VÍNCULO: Requer parceiroId
      if (parceiroId) {
        setPrerequisitesReady(true);
        setLoading(true);
        
        try {
          let query = supabase
            .from("bookmakers")
            .select(`
              id,
              nome,
              saldo_atual,
              saldo_usd,
              saldo_freebet,
              moeda,
              status,
              bookmakers_catalogo:bookmaker_catalogo_id (
                logo_url
              )
            `)
            .eq("parceiro_id", parceiroId);

          // Filtrar por moeda operacional (mecanismo de depósito)
          if (moedaOperacional) {
            query = query.eq('moeda', moedaOperacional);
          }

          if (somenteComSaldoUsd) {
            // Apenas bookmakers com saldo_usd > 0 (para saques CRYPTO)
            query = query.gt('saldo_usd', 0);
          } else if (somenteComSaldoFiat) {
            // Apenas bookmakers com saldo_atual > 0 (para saques FIAT)
            query = query.gt('saldo_atual', 0);
          } else if (somenteComSaldo) {
            // Com saldo significa saldo_atual > 0 OU saldo_usd > 0
            query = query.or('saldo_atual.gt.0,saldo_usd.gt.0');
          }

          const { data, error } = await query.order("nome");
          
          // Verificar se foi abortado antes de atualizar estado
          if (abortController.signal.aborted) return;
          
          if (error) throw error;

          const mapped: BookmakerItem[] = (data || []).map((b: any) => ({
            id: b.id,
            nome: b.nome,
            logo_url: b.bookmakers_catalogo?.logo_url || null,
            saldo_atual: b.saldo_atual,
            saldo_usd: b.saldo_usd,
            saldo_freebet: b.saldo_freebet,
            moeda: b.moeda,
            status: b.status,
          }));

          setItems(mapped);
        } catch (error) {
          if (!abortController.signal.aborted) {
            console.error("Erro ao carregar bookmakers:", error);
            setItems([]);
          }
        } finally {
          if (!abortController.signal.aborted) {
            setLoading(false);
          }
        }
      } 
      // MODO CATÁLOGO (sem parceiroId): Buscar do catálogo global
      else if (!parceiroId && !moedaOperacional && !somenteComSaldo && !somenteComSaldoUsd && !somenteComSaldoFiat) {
        // Modo catálogo só é permitido quando não há nenhum filtro de contexto
        setPrerequisitesReady(true);
        setLoading(true);
        
        try {
          const { data, error } = await supabase
            .from("bookmakers_catalogo")
            .select("id, nome, logo_url")
            .order("nome");

          if (abortController.signal.aborted) return;
          if (error) throw error;
          
          let catalogoItems = data || [];
          
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
        } catch (error) {
          if (!abortController.signal.aborted) {
            console.error("Erro ao carregar bookmakers:", error);
            setItems([]);
          }
        } finally {
          if (!abortController.signal.aborted) {
            setLoading(false);
          }
        }
      } else {
        // Pré-requisitos não atendidos - manter lista vazia
        setPrerequisitesReady(false);
        setItems([]);
        setLoading(false);
      }
    };

    fetchBookmakers();
    
    // Cleanup: abortar fetch se dependências mudarem
    return () => {
      abortController.abort();
    };
  }, [parceiroId, somenteComSaldo, somenteComSaldoUsd, somenteComSaldoFiat, excludeVinculosDoParceiro, moedaOperacional]);

  // Buscar dados de exibição quando value muda - execução imediata e determinística
  useEffect(() => {
    // Reset se não há valor
    if (!value) {
      setDisplayData(null);
      lastFetchedValue.current = "";
      setLoadingDisplay(false);
      return;
    }

    // Skip APENAS se já temos os dados corretos para ESTE EXATO valor
    if (lastFetchedValue.current === value) {
      return;
    }

    // Marcar como carregando display IMEDIATAMENTE
    setLoadingDisplay(true);
    lastFetchedValue.current = value; // Marcar que estamos buscando este valor

    const fetchDisplayData = async () => {
      try {
        if (isVinculoMode) {
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
          } else {
            // Dados não encontrados - resetar
            setDisplayData(null);
          }
        } else {
          // Modo catálogo - buscar na tabela de catálogo
          const { data } = await supabase
            .from("bookmakers_catalogo")
            .select("nome, logo_url")
            .eq("id", value)
            .maybeSingle();
          
          if (data) {
            setDisplayData({ nome: data.nome, logo_url: data.logo_url });
          } else {
            // Dados não encontrados - resetar
            setDisplayData(null);
          }
        }
      } catch (error) {
        console.error("Erro ao buscar bookmaker:", error);
        setDisplayData(null);
      } finally {
        setLoadingDisplay(false);
      }
    };

    fetchDisplayData();
  }, [value, isVinculoMode]); // REMOVIDO displayData das dependências para evitar loop

  // Filtrar itens pela busca
  const filteredItems = items.filter((item) => 
    item.nome.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleSelect = (itemId: string) => {
    onValueChange(itemId);
    setOpen(false);
    setSearchTerm("");
  };

  return (
    <TooltipProvider>
      <Popover open={open} onOpenChange={setOpen}>
        <Tooltip>
          <TooltipTrigger asChild>
            <PopoverTrigger asChild>
              <Button
                ref={triggerRef}
                variant="outline"
                role="combobox"
                aria-expanded={open}
                disabled={disabled || loading || !prerequisitesReady}
                className="w-full h-12 justify-center"
              >
                <div className="flex items-center justify-center gap-2 w-full">
                  {displayData?.logo_url && (
                    <img
                      src={displayData.logo_url}
                      alt=""
                      className="h-6 w-6 rounded object-contain flex-shrink-0"
                      onError={(e) => { e.currentTarget.style.display = "none"; }}
                    />
                  )}
                  <span className="uppercase truncate text-center">
                    {displayData?.nome 
                      ? displayData.nome 
                      : loading
                        ? "Carregando..." 
                        : loadingDisplay
                          ? "Carregando..."
                          : !prerequisitesReady
                            ? "Aguardando..."
                            : "Selecione..."}
                  </span>
                  <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" />
                </div>
              </Button>
            </PopoverTrigger>
          </TooltipTrigger>
          {displayData?.nome && displayData.nome.length > 20 && (
            <TooltipContent side="top" className="max-w-xs">
              <p className="uppercase">{displayData.nome}</p>
            </TooltipContent>
          )}
        </Tooltip>
        
        <PopoverContent 
          className="w-[--radix-popover-trigger-width] min-w-[300px] p-0 z-[9999]"
          align="start"
          sideOffset={4}
          onWheel={(e) => e.stopPropagation()}
        >
          <Command shouldFilter={false}>
            <CommandInput
              placeholder="Buscar bookmaker..."
              value={searchTerm}
              onValueChange={setSearchTerm}
            />
            <CommandList 
              className="max-h-[280px] overflow-y-auto overscroll-contain"
              onWheel={(e) => {
                const target = e.currentTarget;
                const { scrollTop, scrollHeight, clientHeight } = target;
                const isScrollingDown = e.deltaY > 0;
                const isAtBottom = scrollTop + clientHeight >= scrollHeight - 1;
                const isAtTop = scrollTop <= 0;
                
                // Previne propagação do scroll quando não está no limite
                if ((isScrollingDown && !isAtBottom) || (!isScrollingDown && !isAtTop)) {
                  e.stopPropagation();
                }
              }}
            >
              <CommandEmpty>
                {loading
                  ? "Carregando..."
                  : !prerequisitesReady
                    ? "Selecione os campos anteriores"
                    : parceiroId 
                      ? (moedaOperacional
                          ? `Nenhuma bookmaker compatível com ${moedaOperacional} neste parceiro`
                          : somenteComSaldo || somenteComSaldoFiat || somenteComSaldoUsd
                            ? "Este parceiro não possui bookmakers com saldo disponível" 
                            : "Este parceiro não possui bookmakers vinculadas")
                      : "Nenhuma bookmaker encontrada"}
              </CommandEmpty>
              <CommandGroup>
                {filteredItems.map((item) => {
                  const isLimitada = item.status === "LIMITADA";
                  const isSelected = value === item.id;
                  
                  return (
                    <CommandItem
                      key={item.id}
                      value={item.id}
                      onSelect={() => handleSelect(item.id)}
                      className={cn(
                        "py-3 cursor-pointer flex items-center justify-center",
                        isLimitada && "data-[selected=true]:bg-yellow-500/20",
                        !isLimitada && "data-[selected=true]:bg-emerald-500/20"
                      )}
                    >
                      <div className="flex items-center justify-center gap-2 w-full">
                        <Check
                          className={cn(
                            "h-4 w-4 flex-shrink-0",
                            isSelected ? "opacity-100" : "opacity-0"
                          )}
                        />
                        {item.logo_url && (
                          <img
                            src={item.logo_url}
                            alt=""
                            className="h-6 w-6 rounded object-contain flex-shrink-0"
                            onError={(e) => { e.currentTarget.style.display = "none"; }}
                          />
                        )}
                        <span className={cn(
                          "uppercase text-sm font-medium text-center",
                          isLimitada && "text-yellow-400"
                        )}>
                          {item.nome}
                        </span>
                        {(item.saldo_atual !== undefined || item.saldo_usd !== undefined) && (
                          <span className="text-xs text-muted-foreground flex-shrink-0 flex items-center gap-1">
                            {/* Exibir BRL se existir */}
                            {(item.saldo_atual ?? 0) > 0 && (
                              <span className="bg-muted/50 px-1.5 py-0.5 rounded">
                                R$ {item.saldo_atual?.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                              </span>
                            )}
                            {/* Exibir USD se existir */}
                            {(item.saldo_usd ?? 0) > 0 && (
                              <span className="bg-cyan-500/10 text-cyan-400 px-1.5 py-0.5 rounded">
                                $ {item.saldo_usd?.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} USD
                              </span>
                            )}
                            {/* Exibir zero apenas se ambos são zero */}
                            {(item.saldo_atual ?? 0) === 0 && (item.saldo_usd ?? 0) === 0 && (
                              <span className="opacity-50">R$ 0,00</span>
                            )}
                            {/* Freebet */}
                            {(item.saldo_freebet ?? 0) > 0 && (
                              <span className="bg-amber-500/10 text-amber-400 px-1.5 py-0.5 rounded">
                                +FB {item.saldo_freebet?.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                              </span>
                            )}
                          </span>
                        )}
                      </div>
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </TooltipProvider>
  );
});

BookmakerSelect.displayName = "BookmakerSelect";

export default BookmakerSelect;
