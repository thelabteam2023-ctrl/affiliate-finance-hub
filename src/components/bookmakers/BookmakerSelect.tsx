import { useState, useEffect, useRef, forwardRef, useImperativeHandle } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Check, ChevronsUpDown } from "lucide-react";
import { cn, getFirstLastName } from "@/lib/utils";
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
  modoSaque?: boolean; // Para saques: busca TODAS as bookmakers do workspace com saldo (ignora parceiroId)
  workspaceId?: string; // Obrigatório quando modoSaque=true
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
  parceiro_nome?: string; // Para modo saque: exibir o nome do parceiro
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
  moedaOperacional,
  modoSaque,
  workspaceId
}, ref) => {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<BookmakerItem[]>([]);
  const selectedItemRef = useRef<HTMLDivElement>(null);
  const [searchTerm, setSearchTerm] = useState("");
  // CRÍTICO: Iniciar como false para evitar flash - loading só deve ser true durante fetch ativo
  const [loading, setLoading] = useState(false);
  const [displayData, setDisplayData] = useState<{ nome: string; logo_url: string | null } | null>(null);
  const [loadingDisplay, setLoadingDisplay] = useState(false);
  // Flag para indicar se os pré-requisitos estão completos para fetch
  const [prerequisitesReady, setPrerequisitesReady] = useState(false);
  
  const lastFetchedValue = useRef<string>("");
  const triggerRef = useRef<HTMLButtonElement>(null);
  const isVinculoMode = !!parceiroId && !modoSaque;
  // CRÍTICO: modoSaque ativo requer workspaceId - se ainda não carregou, aguardar
  const isModoSaque = modoSaque === true && !!workspaceId;
  const modoSaqueAguardandoWorkspace = modoSaque === true && !workspaceId;

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
    // CRÍTICO: Se um value já foi fornecido na montagem, NÃO limpar
    if (!prev.initialized) {
      prevContextRef.current = { 
        parceiroId, 
        moedaOperacional, 
        initialized: true 
      };
      // Se já temos um value pré-setado, não fazer nada - deixar o fetchDisplayData cuidar da exibição
      return;
    }
    
    // Detectar se houve mudança REAL de contexto (após inicialização)
    const contextChanged = prev.parceiroId !== parceiroId || prev.moedaOperacional !== moedaOperacional;
    
    if (contextChanged) {
      // CRÍTICO: Limpar TUDO quando contexto muda - zero estado residual
      setItems([]);
      setPrerequisitesReady(false);
      setDisplayData(null);
      setLoadingDisplay(false); // Evitar estado "Carregando..." fantasma
      lastFetchedValue.current = "";
      
      // Se o value atual não pode mais existir no novo contexto, limpar
      // MAS: Se o novo parceiroId foi setado junto com o value (fluxo de defaults),
      // NÃO limpar o value - confiar que o parent sabe o que está fazendo
      const isInitialDefaultFlow = prev.parceiroId === undefined && parceiroId !== undefined;
      if (value && !isInitialDefaultFlow) {
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
      // MODO SAQUE AGUARDANDO WORKSPACE: Não fazer nada ainda
      if (modoSaqueAguardandoWorkspace) {
        setPrerequisitesReady(false);
        setItems([]);
        setLoading(false);
        return;
      }
      
      // MODO SAQUE: Buscar bookmakers do PARCEIRO SELECIONADO com saldo disponível
      // CRÍTICO: Isolamento entre parceiros - só exibir casas do parceiro que vai receber o saque
      if (isModoSaque) {
        // Se não tem parceiroId, aguardar seleção (não pode mostrar casas sem saber de quem)
        if (!parceiroId) {
          setPrerequisitesReady(false);
          setItems([]);
          setLoading(false);
          return;
        }
        
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
              parceiro_id,
              parceiros:parceiro_id (
                nome
              ),
              bookmakers_catalogo:bookmaker_catalogo_id (
                logo_url
              )
            `)
            .eq("workspace_id", workspaceId!)
            .eq("parceiro_id", parceiroId) // CRÍTICO: Filtrar por parceiro!
            // SAQUE: Permitir casas ativas OU limitadas (ambas podem ter saldo para saque)
            // Apenas excluir casas com status 'encerrada' ou 'bloqueada'
            .in("status", ["ativo", "limitada"])
            .gt("saldo_atual", 0); // Saque sempre requer saldo_atual > 0

          // Filtrar por moeda operacional se especificado
          if (moedaOperacional) {
            query = query.eq('moeda', moedaOperacional);
          }

          const { data, error } = await query.order("nome");
          
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
            parceiro_nome: b.parceiros?.nome || null,
          }));

          setItems(mapped);
        } catch (error) {
          if (!abortController.signal.aborted) {
            console.error("Erro ao carregar bookmakers (modo saque):", error);
            setItems([]);
          }
        } finally {
          if (!abortController.signal.aborted) {
            setLoading(false);
          }
        }
      }
      // MODO VÍNCULO: Requer parceiroId
      else if (parceiroId) {
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
            .eq("parceiro_id", parceiroId)
            // PROTEÇÃO: Excluir bookmakers bloqueadas (parceiro inativo) e encerradas
            .in("status", ["ativo", "ATIVO", "limitada", "LIMITADA", "EM_USO", "em_uso"]);

          // Filtrar por moeda operacional (mecanismo de depósito)
          if (moedaOperacional) {
            query = query.eq('moeda', moedaOperacional);
          }

          // REGRA: saldo_atual é a ÚNICA fonte canônica para TODAS as moedas
          // saldo_usd é deprecated e NÃO deve ser usado em filtros
          if (somenteComSaldoUsd || somenteComSaldoFiat || somenteComSaldo) {
            query = query.gt('saldo_atual', 0);
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
          
          // MULTI-CONTA: Não filtramos mais por vínculos existentes
          // Um parceiro pode ter múltiplas contas da mesma bookmaker
          // A prop excludeVinculosDoParceiro é mantida para compatibilidade mas não filtra mais
          if (excludeVinculosDoParceiro) {
            // Antes: filtrava casas já vinculadas
            // Agora: permite criar múltiplas instâncias da mesma casa
            console.log("[BookmakerSelect] Multi-conta habilitado - não filtrando por vínculos existentes");
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
  }, [parceiroId, somenteComSaldo, somenteComSaldoUsd, somenteComSaldoFiat, excludeVinculosDoParceiro, moedaOperacional, isModoSaque, workspaceId, modoSaqueAguardandoWorkspace]);

  // Determinar se devemos buscar na tabela "bookmakers" (instâncias vinculadas) ou "bookmakers_catalogo"
  // modoSaque também usa bookmakers (instâncias), não catálogo
  const usaBookmakerInstancia = isVinculoMode || modoSaque;
  
  // Buscar dados de exibição quando value muda - execução imediata e determinística
  // CRÍTICO: Este useEffect deve rodar INDEPENDENTE de prerequisitesReady
  // O select pode ter um valor definido antes mesmo de os items serem carregados
  useEffect(() => {
    // Reset se não há valor
    if (!value) {
      setDisplayData(null);
      lastFetchedValue.current = "";
      setLoadingDisplay(false);
      return;
    }

    // Skip APENAS se já temos os dados corretos para ESTE EXATO valor
    if (lastFetchedValue.current === value && displayData?.nome) {
      return;
    }

    // Marcar como carregando display IMEDIATAMENTE
    setLoadingDisplay(true);
    lastFetchedValue.current = value; // Marcar que estamos buscando este valor

    const fetchDisplayData = async () => {
      try {
        if (usaBookmakerInstancia) {
          // Buscar bookmaker vinculada (tanto modo vínculo quanto modo saque)
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
  }, [value, usaBookmakerInstancia]); // Depende de value e modo de busca

  // Auto-scroll para o item selecionado quando o popover abre
  useEffect(() => {
    if (open && value && selectedItemRef.current) {
      // Aguardar render do popover antes de scrollar
      const timer = setTimeout(() => {
        selectedItemRef.current?.scrollIntoView({
          behavior: "smooth",
          block: "center",
          inline: "nearest",
        });
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [open, value, items]);

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
                disabled={disabled || loading || !prerequisitesReady || modoSaqueAguardandoWorkspace}
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
                          : modoSaqueAguardandoWorkspace
                            ? "Carregando workspace..."
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
                  : modoSaqueAguardandoWorkspace
                    ? "Carregando workspace..."
                    : !prerequisitesReady
                      ? (isModoSaque && !parceiroId 
                          ? "Selecione primeiro o parceiro de destino"
                          : "Selecione os campos anteriores")
                      : isModoSaque
                        ? "Este parceiro não possui bookmakers com saldo disponível para saque"
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
                      ref={isSelected ? selectedItemRef : undefined}
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
                        <div className="flex flex-col items-start">
                          <span className={cn(
                            "uppercase text-sm font-medium",
                            isLimitada && "text-yellow-400"
                          )}>
                            {item.nome}
                          </span>
                          {/* Modo saque: exibir nome curto do parceiro */}
                          {isModoSaque && item.parceiro_nome && (
                            <span className="text-[10px] text-muted-foreground leading-tight">
                              {getFirstLastName(item.parceiro_nome)}
                            </span>
                          )}
                        </div>
                        {(item.saldo_atual !== undefined || item.saldo_usd !== undefined) && (
                          <span className="text-xs text-muted-foreground flex-shrink-0 flex items-center gap-1">
                            {/* Exibir saldo baseado na moeda nativa da bookmaker */}
                            {(() => {
                              const moeda = item.moeda || "BRL";
                              // Usar saldo_atual como fonte única de verdade (arquitetura v3)
                              const saldo = item.saldo_atual ?? 0;
                              
                              // Mapear símbolos e cores por moeda (badges distintas)
                              const currencyConfig: Record<string, { symbol: string; suffix: string; bg: string; text: string }> = {
                                BRL: { symbol: "R$", suffix: "", bg: "bg-emerald-500/15", text: "text-emerald-400" },
                                USD: { symbol: "$", suffix: " USD", bg: "bg-cyan-500/15", text: "text-cyan-400" },
                                EUR: { symbol: "€", suffix: " EUR", bg: "bg-blue-500/15", text: "text-blue-400" },
                                GBP: { symbol: "£", suffix: " GBP", bg: "bg-purple-500/15", text: "text-purple-400" },
                                MXN: { symbol: "$", suffix: " MXN", bg: "bg-orange-500/15", text: "text-orange-400" },
                                MYR: { symbol: "RM", suffix: " MYR", bg: "bg-pink-500/15", text: "text-pink-400" },
                                ARS: { symbol: "$", suffix: " ARS", bg: "bg-sky-500/15", text: "text-sky-400" },
                                COP: { symbol: "$", suffix: " COP", bg: "bg-yellow-500/15", text: "text-yellow-400" },
                              };
                              
                              const config = currencyConfig[moeda] || { symbol: moeda, suffix: "", bg: "bg-muted/50", text: "text-muted-foreground" };
                              
                              if (saldo > 0) {
                                return (
                                  <span className={`${config.bg} ${config.text} px-1.5 py-0.5 rounded font-medium`}>
                                    {config.symbol} {saldo.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}{config.suffix}
                                  </span>
                                );
                              }
                              
                              // Saldo zero - exibir na moeda correta com opacidade reduzida
                              return (
                                <span className={`${config.bg} ${config.text} px-1.5 py-0.5 rounded opacity-60`}>
                                  {config.symbol} 0,00{config.suffix}
                                </span>
                              );
                            })()}
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
