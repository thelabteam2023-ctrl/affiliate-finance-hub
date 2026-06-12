import { useMemo, useState, useCallback, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { formatCurrencyDynamic, getValorEfetivo, getMoedaEfetiva } from "@/hooks/useMultiCurrencyFormat";
import { isCryptoCurrency } from "@/types/currency";
import { useExchangeRates } from "@/contexts/ExchangeRatesContext";
import { CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator } from "@/components/ui/command";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
  import { Filter, ArrowRight, AlertCircle, Info, Clock, CheckCircle2, XCircle, Building2, Wallet, Search, X, Pencil, FolderKanban, Users, MoreVertical, Undo2, Trash2, Tag as TagIcon, Check } from "lucide-react";
  import { getTagColor } from "@/components/ui/tag-input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
 import { getFirstLastName, cn } from "@/lib/utils";
import { useBookmakerLogoMap } from "@/hooks/useBookmakerLogoMap";
import { format, startOfDay, endOfDay } from "date-fns";
import { usePagination } from "@/hooks/usePagination";
import { SimplePagination } from "@/components/ui/simple-pagination";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { parseLocalDateTime, extractCivilDateKey } from "@/utils/dateUtils";
import { truncateAddress, getWalletDisplayName } from "@/utils/cryptoUtils";
import { WalletDisplayItem } from "../wallets/WalletDisplayItem";
import { DashboardPeriodFilterBar } from "@/components/shared/DashboardPeriodFilterBar";
import { DashboardPeriodFilter, getDashboardDateRange } from "@/types/dashboardFilters";
import { EditarDataTransacaoDialog } from "./EditarDataTransacaoDialog";
import { EditarSaqueConfirmadoDialog } from "./EditarSaqueConfirmadoDialog";
import { ReverterMovimentacaoDialog } from "./ReverterMovimentacaoDialog";
import { ExcluirMovimentacaoDialog } from "./ExcluirMovimentacaoDialog";
import { EditarTagsDialog } from "./EditarTagsDialog";
import { canRevert, canDelete } from "@/lib/movimentacaoEligibility";
import { useRole } from "@/hooks/useRole";
import { BookmakerFilterCombobox, type BookmakerFilterOption } from "@/components/ui/bookmaker-filter-combobox";
const PAGE_SIZE = 50;

const TX_TYPES: Record<string, { icon: string, color: string, bg: string, label: string, badgeBg?: string }> = {
  APORTE:        { icon: 'ti-building-bank',     color: '#22c55e', bg: 'transparent', badgeBg: '#0c2a1a', label: 'Aporte' },
  APORTE_FINANCEIRO: { icon: 'ti-building-bank', color: '#22c55e', bg: 'transparent', badgeBg: '#0c2a1a', label: 'Aporte' },
  SAQUE:         { icon: 'ti-wallet',            color: '#22c55e', bg: 'transparent', badgeBg: '#0c2a1a', label: 'Saque' },
  SCAN:          { icon: 'ti-shield-x',          color: '#a855f7', bg: 'transparent', badgeBg: '#1a1020', label: 'Scan' },
  PERDA_OPERACIONAL: { icon: 'ti-shield-x',      color: '#a855f7', bg: 'transparent', badgeBg: '#1a1020', label: 'Scan' },
  TRANSFERENCIA: { icon: 'ti-arrows-exchange-2', color: '#22d3ee', bg: 'transparent', badgeBg: '#0a2030', label: 'Transferência' },
  CONVERSAO:     { icon: 'ti-refresh',           color: '#818cf8', bg: 'transparent', badgeBg: '#12102a', label: 'Conversão' },
  SWAP:          { icon: 'ti-refresh',           color: '#818cf8', bg: 'transparent', badgeBg: '#12102a', label: 'Swap' },
  TAXA:          { icon: 'ti-receipt',           color: '#6b7280', bg: 'transparent', badgeBg: '#161b27', label: 'Taxa' },
  AJUSTE:        { icon: 'ti-settings',          color: '#94a3b8', bg: 'transparent', badgeBg: '#161b27', label: 'Ajuste' },
};

function TransactionIcon({ type, transacao }: { type: string, transacao?: any }) {
  const cfg = TX_TYPES[type] ?? TX_TYPES.AJUSTE;
  const { getLogoUrl } = useBookmakerLogoMap();
  
  // Tentar pegar logo de bookmaker se for uma casa
  const bookmakerId = transacao?.origem_bookmaker_id || transacao?.destino_bookmaker_id;
  const bookmakerName = bookmakerId ? transacao?.bookmaker_nome || "" : "";
  const logoUrl = bookmakerName ? getLogoUrl(bookmakerName) : null;

  // Só renderizamos o "quadrado" se houver uma logo (casa de aposta)
  if (logoUrl) {
    return (
      <div style={{
        width: 40, height: 40,
        borderRadius: 10,
        background: 'transparent',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        flexShrink: 0,
        overflow: 'hidden',
        border: '1px solid rgba(255,255,255,0.06)',
        marginLeft: '4px'
      }}>
        <img 
          src={logoUrl} 
          alt={bookmakerName} 
          className="w-[32px] h-[32px] object-contain transition-transform duration-300 group-hover:scale-105"
          onError={(e) => {
            (e.target as HTMLImageElement).style.display = 'none';
            (e.target as HTMLImageElement).parentElement!.innerHTML = `<i class="ti ${cfg.icon}" style="font-size: 20px; color: ${cfg.color}"></i>`;
          }}
        />
      </div>
    );
  }

  // Para outros tipos sem logo (Transferência, etc), renderizamos apenas o ícone centralizado, sem o "quadrado" container
  return (
    <div style={{
      width: 40, height: 40,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      flexShrink: 0,
      marginLeft: '4px'
    }}>
      <i className={`ti ${cfg.icon}`} aria-hidden="true"
         style={{ fontSize: 20, color: cfg.color }} />
    </div>
  );
}

function TransactionBadge({ type, label }: { type: string, label?: string }) {
  const cfg = TX_TYPES[type] ?? TX_TYPES.AJUSTE;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      fontSize: 10, fontWeight: 500,
      padding: '2px 7px', borderRadius: 4,
      background: cfg.badgeBg ?? cfg.bg, color: cfg.color,
      marginBottom: 3,
    }}>
      <i className={`ti ${cfg.icon}`} aria-hidden="true" style={{ fontSize: 9 }} />
      {label ?? cfg.label}
    </span>
  );
}

const TIPO_OPTIONS = [
  { value: "TRANSFERENCIA", label: "Transferência" },
  { value: "DEPOSITO", label: "Depósito" },
  { value: "SAQUE", label: "Saque" },
  { value: "PERDA_OPERACIONAL", label: "Scan" },
  { value: "APORTE_FINANCEIRO", label: "Aporte & Liquidação" },
  { value: "SWAP", label: "Swap Crypto" },
  { value: "OUTROS", label: "Outros" },
];


const getStatusBadge = (status: string) => {
  switch (status) {
    case "PENDENTE":
      return (
        <span className="inline-flex items-center gap-1.5 text-[10px] font-medium text-amber-500 bg-amber-500/10 px-2 py-0.5 rounded-full border border-amber-500/20 shadow-[0_0_8px_rgba(245,158,11,0.05)]">
          <span className="w-1 h-1 rounded-full bg-amber-500 animate-pulse" />
          Aguardando
        </span>
      );
    case "CONFIRMADO":
      return (
        <span className="inline-flex items-center gap-1.5 text-[10px] font-medium text-emerald-500 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
          <CheckCircle2 className="h-2.5 w-2.5" />
          Concluído
        </span>
      );
    case "RECUSADO":
      return (
        <span className="inline-flex items-center gap-1.5 text-[10px] font-medium text-red-500 bg-red-500/10 px-2 py-0.5 rounded-full border border-red-500/20">
          <XCircle className="h-2.5 w-2.5" />
          Recusado
        </span>
      );
    default:
      return null;
  }
};

interface ContaBancaria {
  id: string;
  banco: string;
  titular: string;
}

interface WalletDetalhe {
  id: string;
  exchange: string;
  label?: string | null;
  nickname?: string | null;
  identificacao_wallet?: string | null;
  endereco: string;
  network: string;
  parceiro_id: string;
}

interface LabelInfo {
  primary: string;
  secondary?: string;
  badgeLabel?: string;
  badgeColor?: string;
  BadgeIcon?: any;
}

interface HistoricoMovimentacoesProps {
  transacoes: any[];
  parceiros: { [key: string]: string };
  contas: { [key: string]: string };
  contasBancarias: ContaBancaria[];
  wallets: { [key: string]: string };
  walletsDetalhes: WalletDetalhe[];
  bookmakers: { [key: string]: { nome: string; status: string; projeto_id?: string } };
  loading: boolean;
  filtroTipo: string[];
  setFiltroTipo: (tipo: string[]) => void;
  filtroProjeto: string;
  setFiltroProjeto: (projeto: string) => void;
  filtroParceiro: string;
  setFiltroParceiro: (parceiro: string) => void;
  projetos: Array<{ id: string; nome: string }>;
  parceirosLista: Array<{ id: string; nome: string }>;
  dataInicio: Date | undefined;
  setDataInicio: (date: Date | undefined) => void;
  dataFim: Date | undefined;
  setDataFim: (date: Date | undefined) => void;
  getTransacoesFiltradas: () => any[];
  getTipoLabel: (tipo: string, transacao?: any) => string;
  getTipoColor: (tipo: string, transacao?: any) => string;
  getOrigemLabel: (transacao: any) => string;
  getDestinoLabel: (transacao: any) => string;
  getOrigemInfo?: (transacao: any) => LabelInfo;
  getDestinoInfo?: (transacao: any) => LabelInfo;
  formatCurrency: (value: number, currency: string) => string;
  onConfirmarSaque?: (transacao: any) => void;
}

/** Searchable Projeto filter */
function ProjetoFilterSelect({ value, onChange, projetos }: { value: string; onChange: (v: string) => void; projetos: { id: string; nome: string }[] }) {
  const [open, setOpen] = useState(false);
  const selected = value === "TODOS" ? null : value === "SEM_PROJETO" ? "SEM_PROJETO" : projetos.find(p => p.id === value);
  const label = value === "TODOS" ? "Projeto: Todos" : value === "SEM_PROJETO" ? "Projeto: Sem vínculo" : (selected as any)?.nome ? `Projeto: ${(selected as any).nome}` : "Projeto: Todos";

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant={value !== "TODOS" ? "secondary" : "outline"} size="sm" className="h-8 text-xs gap-1 border-border/50">
          <FolderKanban className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate max-w-[150px]">{label}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-0" align="start">
        <Command>
          <CommandInput placeholder="Buscar projeto…" />
          <CommandList>
            <CommandEmpty>Nenhum resultado encontrado</CommandEmpty>
            <CommandGroup>
              <CommandItem onSelect={() => { onChange("TODOS"); setOpen(false); }} className="text-xs">
                Todos os projetos
              </CommandItem>
              <CommandItem onSelect={() => { onChange("SEM_PROJETO"); setOpen(false); }} className="text-xs text-muted-foreground">
                Sem projeto vinculado
              </CommandItem>
            </CommandGroup>
            <CommandSeparator />
            <CommandGroup>
              {projetos.map(p => (
                <CommandItem key={p.id} onSelect={() => { onChange(p.id); setOpen(false); }} className="text-xs">
                  {p.nome}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

/** Searchable Parceiro filter */
function ParceiroFilterSelect({ value, onChange, parceiros }: { value: string; onChange: (v: string) => void; parceiros: { id: string; nome: string }[] }) {
  const [open, setOpen] = useState(false);
  const selected = value === "TODOS" ? null : parceiros.find(p => p.id === value);
  const label = value === "TODOS" ? "Parceiro: Todos" : selected ? `Parceiro: ${getFirstLastName(selected.nome)}` : "Parceiro: Todos";
  const sorted = useMemo(() => [...parceiros].sort((a, b) => a.nome.localeCompare(b.nome)), [parceiros]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant={value !== "TODOS" ? "secondary" : "outline"} size="sm" className="h-8 text-xs gap-1 border-border/50">
          <Users className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate max-w-[150px]">{label}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-0" align="start">
        <Command>
          <CommandInput placeholder="Buscar parceiro…" />
          <CommandList>
            <CommandEmpty>Nenhum resultado encontrado</CommandEmpty>
            <CommandGroup>
              <CommandItem onSelect={() => { onChange("TODOS"); setOpen(false); }} className="text-xs">
                Todos os parceiros
              </CommandItem>
            </CommandGroup>
            <CommandSeparator />
            <CommandGroup>
              {sorted.map(p => (
                <CommandItem key={p.id} onSelect={() => { onChange(p.id); setOpen(false); }} className="text-xs">
                  {getFirstLastName(p.nome)}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

// Helper: abbreviate crypto wallet address for display
// Helper: get wallet address from walletsDetalhes by wallet id
export function HistoricoMovimentacoes({
  loading,
  filtroTipo,
  setFiltroTipo,
  filtroProjeto,
  setFiltroProjeto,
  filtroParceiro,
  setFiltroParceiro,
  projetos,
  parceirosLista,
  dataInicio,
  setDataInicio,
  dataFim,
  setDataFim,
  getTransacoesFiltradas,
  getTipoLabel,
  getTipoColor,
  getOrigemLabel,
  getDestinoLabel,
  getOrigemInfo,
  getDestinoInfo,
  formatCurrency,
  contasBancarias,
  parceiros,
  walletsDetalhes,
  bookmakers,
  onConfirmarSaque,
}: HistoricoMovimentacoesProps) {
  const { getLogoUrl } = useBookmakerLogoMap();
  const { getCryptoUSDValue, convertToBRL } = useExchangeRates();
  const [termoBusca, setTermoBusca] = useState("");
  const [editDateId, setEditDateId] = useState<string | null>(null);
  const [editDateValue, setEditDateValue] = useState<string>("");
  const [editConfirmado, setEditConfirmado] = useState<{
    id: string;
    dataConfirmacao: string;
    valorConfirmado: number | null;
    moeda: string;
    tipoCrypto: boolean;
    coin?: string;
  } | null>(null);
  const [reverterTx, setReverterTx] = useState<any | null>(null);
  const [excluirTx, setExcluirTx] = useState<any | null>(null);
  const [editTagsTx, setEditTagsTx] = useState<any | null>(null);
  const { role } = useRole();
  const [usuariosMap, setUsuariosMap] = useState<Record<string, string>>({});
   // Filtro local por casa (bookmaker) — filtra origem OU destino
   const [filtroBookmakerIds, setFiltroBookmakerIds] = useState<string[]>([]);
    const [filtroTags, setFiltroTags] = useState<string[]>([]);
  
    // Capturar filtros via URL para Auditoria de Perdas
    useEffect(() => {
      const searchParams = new URLSearchParams(window.location.search);
      const tipoFilter = searchParams.get("tipo");
      if (tipoFilter === "PERDA_OPERACIONAL") {
        setFiltroTipo(["PERDA_OPERACIONAL"]);
        // Limpar os parâmetros da URL após aplicar o filtro para não persistir em recarregamentos manuais
        const newUrl = window.location.pathname + (window.location.hash || "");
        window.history.replaceState({}, "", newUrl);
      }
    }, [setFiltroTipo]);
 
   // Get all filtered transactions
   const transacoesBase = useMemo(() => getTransacoesFiltradas(), [getTransacoesFiltradas]);
 
   // Aplica filtros locais (casa e tags) sobre o resultado base
   const transacoesFiltradas = useMemo(() => {
     let result = transacoesBase;
 
     if (filtroBookmakerIds.length > 0) {
       const set = new Set(filtroBookmakerIds);
       result = result.filter((t: any) =>
         (t.origem_bookmaker_id && set.has(t.origem_bookmaker_id)) ||
         (t.destino_bookmaker_id && set.has(t.destino_bookmaker_id))
       );
     }
 
     if (filtroTags.length > 0) {
       result = result.filter((t: any) => 
         t.tags && Array.isArray(t.tags) && filtroTags.some(tag => t.tags.includes(tag))
       );
     }
 
     return result;
   }, [transacoesBase, filtroBookmakerIds, filtroTags]);
   // Tags disponíveis nas transações do período
   const availableTags = useMemo(() => {
     const tags = new Set<string>();
     transacoesBase.forEach((t: any) => {
       if (t.tags && Array.isArray(t.tags)) {
         t.tags.forEach(tag => tags.add(tag));
       }
     });
     return Array.from(tags).sort();
   }, [transacoesBase]);
 

  // Opções do combobox: apenas casas presentes nas transações do período (mais leve e relevante)
  const bookmakerOptions = useMemo<BookmakerFilterOption[]>(() => {
    const ids = new Set<string>();
    for (const t of transacoesBase as any[]) {
      if (t.origem_bookmaker_id) ids.add(t.origem_bookmaker_id);
      if (t.destino_bookmaker_id) ids.add(t.destino_bookmaker_id);
    }
    const opts: BookmakerFilterOption[] = [];
    ids.forEach((id) => {
      const bk = bookmakers[id];
      if (!bk) return;
      const parceiroId = (bk as any).parceiro_id as string | undefined;
      opts.push({
        id,
        nome: bk.nome,
        parceiroNome: parceiroId ? parceiros[parceiroId] : undefined,
      });
    });
    return opts.sort((a, b) => a.nome.localeCompare(b.nome));
  }, [transacoesBase, bookmakers, parceiros]);

  // Fetch user names (first name) for traceability of who registered each transaction
  useEffect(() => {
    const userIds = Array.from(new Set(
      transacoesFiltradas
        .map((t: any) => t.user_id)
        .filter((id: string | null | undefined): id is string => !!id && !(id in usuariosMap))
    ));
    if (userIds.length === 0) return;
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .rpc("get_cash_ledger_user_names", { p_user_ids: userIds });
      if (cancelled) return;
      const next: Record<string, string> = {};
      if (!error && data) {
        (data as any[]).forEach((row) => {
          next[row.user_id] = row.first_name || "";
        });
      }
      // Mark unresolved IDs as empty so we don't refetch them
      userIds.forEach((id) => { if (!(id in next)) next[id] = ""; });
      setUsuariosMap((prev) => ({ ...prev, ...next }));
    })();
    return () => { cancelled = true; };
  }, [transacoesFiltradas, usuariosMap]);
  
  // Apply text search filter
  const transacoesComBusca = useMemo(() => {
    if (!termoBusca.trim()) return transacoesFiltradas;
    
    const termo = termoBusca.toLowerCase().trim();
    return transacoesFiltradas.filter((t) => {
      // Search in bookmaker names
      const origemBookmaker = t.origem_bookmaker_id ? bookmakers[t.origem_bookmaker_id]?.nome?.toLowerCase() : "";
      const destinoBookmaker = t.destino_bookmaker_id ? bookmakers[t.destino_bookmaker_id]?.nome?.toLowerCase() : "";
      
      // Search in partner names
      const origemParceiro = t.origem_parceiro_id ? parceiros[t.origem_parceiro_id]?.toLowerCase() : "";
      const destinoParceiro = t.destino_parceiro_id ? parceiros[t.destino_parceiro_id]?.toLowerCase() : "";
      
      // Search in wallet details
      const origemWallet = t.origem_wallet_id ? walletsDetalhes.find(w => w.id === t.origem_wallet_id) : null;
      const destinoWallet = t.destino_wallet_id ? walletsDetalhes.find(w => w.id === t.destino_wallet_id) : null;
      
      const walletOrigemLabel = origemWallet ? getWalletDisplayName({
        label: origemWallet.label,
        nickname: origemWallet.nickname,
        identificacao_wallet: origemWallet.identificacao_wallet,
        exchange: origemWallet.exchange
      }).toLowerCase() : "";
      
      const walletDestinoLabel = destinoWallet ? getWalletDisplayName({
        label: destinoWallet.label,
        nickname: destinoWallet.nickname,
        identificacao_wallet: destinoWallet.identificacao_wallet,
        exchange: destinoWallet.exchange
      }).toLowerCase() : "";

      const walletOrigemStr = origemWallet ? `${origemWallet.exchange} ${origemWallet.endereco} ${walletOrigemLabel}`.toLowerCase() : "";
      const walletDestinoStr = destinoWallet ? `${destinoWallet.exchange} ${destinoWallet.endereco} ${walletDestinoLabel}`.toLowerCase() : "";
      
      // Search in bank account details
      const origemConta = t.origem_conta_bancaria_id ? contasBancarias.find(c => c.id === t.origem_conta_bancaria_id) : null;
      const destinoConta = t.destino_conta_bancaria_id ? contasBancarias.find(c => c.id === t.destino_conta_bancaria_id) : null;
      const contaOrigemStr = origemConta ? `${origemConta.banco} ${origemConta.titular}`.toLowerCase() : "";
      const contaDestinoStr = destinoConta ? `${destinoConta.banco} ${destinoConta.titular}`.toLowerCase() : "";
      
      // Search in description
      const descricao = t.descricao?.toLowerCase() || "";
      
      // Search in transaction type
      const tipoTransacao = t.tipo_transacao?.toLowerCase() || "";
      
      // Search in coin
      const coin = t.coin?.toLowerCase() || "";
      
      // Search in valor (formatted)
      const valorStr = t.valor?.toString() || "";
      
      return (
        origemBookmaker.includes(termo) ||
        destinoBookmaker.includes(termo) ||
        origemParceiro.includes(termo) ||
        destinoParceiro.includes(termo) ||
        walletOrigemStr.includes(termo) ||
        walletDestinoStr.includes(termo) ||
        walletOrigemLabel.includes(termo) ||
        walletDestinoLabel.includes(termo) ||
        contaOrigemStr.includes(termo) ||
        contaDestinoStr.includes(termo) ||
        descricao.includes(termo) ||
        tipoTransacao.includes(termo) ||
        coin.includes(termo) ||
        valorStr.includes(termo)
      );
    });
  }, [transacoesFiltradas, termoBusca, bookmakers, parceiros, walletsDetalhes, contasBancarias]);
  
  // Client-side pagination
  const pagination = usePagination(transacoesComBusca, { initialPageSize: PAGE_SIZE });

  // Period filter state
  const [periodFilter, setPeriodFilter] = useState<DashboardPeriodFilter>("tudo");
  
  // Financial aggregation metrics with status breakdown
  const metricas = useMemo(() => {
    // Fiat: aggregate by native moeda (BRL, USD, EUR…) using raw `valor`.
    // Crypto: aggregate per `coin` using ledger SNAPSHOT (`valor_usd`) so o aporte
    // nunca flutua com o preço live. Quantidade nativa também é somada por coin.
    const fiatTotal: Record<string, number> = {};
    const fiatConfirmado: Record<string, number> = {};
    const fiatPendente: Record<string, number> = {};

    type CryptoAgg = {
      coin: string;
      qtdTotal: number;
      qtdConfirmada: number;
      usdTotal: number;
      usdConfirmado: number;
      semSnapshotUsd: number;        // entradas legadas sem valor_usd
      ultimoSnapshotAt: string | null;
    };
    const cryptoAgg: Record<string, CryptoAgg> = {};
    let count = 0;

    transacoesComBusca.forEach((t: any) => {
      const status = (t.status || "").toUpperCase();
      if (status === "RECUSADO" || status === "CANCELADO" || status === "ESTORNADO") return;
      count++;

      const isCrypto = t.tipo_moeda === "CRYPTO";

      if (isCrypto) {
        const coin = (t.coin || t.moeda || "?").toUpperCase();
        const qtd = Math.abs(Number(t.qtd_coin ?? t.valor ?? 0));
        // Snapshot: valor_usd é congelado na inserção. valor_usd_referencia é alias.
        const usdSnapshotRaw = t.valor_usd ?? t.valor_usd_referencia ?? null;
        const hasSnapshot = usdSnapshotRaw !== null && usdSnapshotRaw !== undefined;
        const usd = Math.abs(Number(usdSnapshotRaw ?? 0));

        const agg = cryptoAgg[coin] ?? {
          coin,
          qtdTotal: 0,
          qtdConfirmada: 0,
          usdTotal: 0,
          usdConfirmado: 0,
          semSnapshotUsd: 0,
          ultimoSnapshotAt: null,
        };
        agg.qtdTotal += qtd;
        agg.usdTotal += usd;
        if (status === "CONFIRMADO") {
          agg.qtdConfirmada += qtd;
          agg.usdConfirmado += usd;
        }
        if (!hasSnapshot) agg.semSnapshotUsd += qtd;
        const snapAt = t.cotacao_snapshot_at || t.data_transacao || t.created_at || null;
        if (snapAt && (!agg.ultimoSnapshotAt || snapAt > agg.ultimoSnapshotAt)) {
          agg.ultimoSnapshotAt = snapAt;
        }
        cryptoAgg[coin] = agg;
      } else {
        const moeda = (t.moeda || "BRL").toUpperCase();
        const valor = Math.abs(Number(t.valor ?? 0));
        fiatTotal[moeda] = (fiatTotal[moeda] || 0) + valor;
        if (status === "CONFIRMADO") {
          fiatConfirmado[moeda] = (fiatConfirmado[moeda] || 0) + valor;
        } else {
          fiatPendente[moeda] = (fiatPendente[moeda] || 0) + valor;
        }
      }
    });

    const fiatMoedasAll = [...new Set([
      ...Object.keys(fiatTotal),
      ...Object.keys(fiatConfirmado),
      ...Object.keys(fiatPendente),
    ])].sort((a, b) => (fiatTotal[b] || 0) - (fiatTotal[a] || 0));

    const fiatMoedas = fiatMoedasAll.map(moeda => ({
      moeda,
      total: fiatTotal[moeda] || 0,
      confirmado: fiatConfirmado[moeda] || 0,
      pendente: fiatPendente[moeda] || 0,
    }));

    // Fiat display: 1 moeda → nativa; múltiplas → consolidação visual em BRL
    // usando cotações live (apenas para exibição agregada).
    let fiatDisplayMoeda = "BRL";
    let fiatTotalConsolidado = 0;
    let fiatConfirmadoConsolidado = 0;
    if (fiatMoedas.length === 1) {
      fiatDisplayMoeda = fiatMoedas[0].moeda;
      fiatTotalConsolidado = fiatMoedas[0].total;
      fiatConfirmadoConsolidado = fiatMoedas[0].confirmado;
    } else if (fiatMoedas.length > 1) {
      for (const m of fiatMoedas) {
        fiatTotalConsolidado += convertToBRL(m.total, m.moeda);
        fiatConfirmadoConsolidado += convertToBRL(m.confirmado, m.moeda);
      }
    }

    // Crypto: total em USD via SNAPSHOT do ledger (não flutua).
    const cryptoDetalhes = Object.values(cryptoAgg)
      .sort((a, b) => b.usdTotal - a.usdTotal);
    let cryptoTotalUSD = 0;
    let cryptoConfirmadoUSD = 0;
    const cryptoSemSnapshot: string[] = [];
    for (const c of cryptoDetalhes) {
      cryptoTotalUSD += c.usdTotal;
      cryptoConfirmadoUSD += c.usdConfirmado;
      if (c.semSnapshotUsd > 0) cryptoSemSnapshot.push(c.coin);
    }

    const hasPendente =
      fiatMoedas.some(m => m.pendente > 0) ||
      Object.values(cryptoAgg).some(c => c.qtdTotal > c.qtdConfirmada + 0.00000001);

    return {
      count,
      hasPendente,
      fiat: {
        moedas: fiatMoedas,
        displayMoeda: fiatDisplayMoeda,
        total: fiatTotalConsolidado,
        confirmado: fiatConfirmadoConsolidado,
        isMixed: fiatMoedas.length > 1,
      },
      crypto: {
        moedas: cryptoDetalhes,
        totalUSD: cryptoTotalUSD,
        confirmadoUSD: cryptoConfirmadoUSD,
        semCotacao: cryptoSemSnapshot,
      },
      // mantido para outras métricas/condicionais existentes
      moedas: [
        ...fiatMoedas,
        ...cryptoDetalhes.map(c => ({
          moeda: c.coin,
          total: c.qtdTotal,
          confirmado: c.qtdConfirmada,
          pendente: c.qtdTotal - c.qtdConfirmada,
        })),
      ],
    };
  }, [transacoesComBusca, convertToBRL]);
  
  const handlePeriodChange = useCallback((filter: DashboardPeriodFilter) => {
    setPeriodFilter(filter);
    
    // Se o filtro for personalizado, não calculamos o range aqui,
    // pois ele é definido pelo handleCustomRangeChange logo antes
    if (filter === "custom") {
      pagination.goToFirstPage();
      return;
    }
    
    const range = getDashboardDateRange(filter);
    setDataInicio(range.start ?? undefined);
    setDataFim(range.end ?? undefined);
    pagination.goToFirstPage();
  }, [setDataInicio, setDataFim, pagination]);

  const handleCustomRangeChange = useCallback((range: { start: Date; end: Date }) => {
    setDataInicio(range.start);
    setDataFim(endOfDay(range.end));
    pagination.goToFirstPage();
  }, [setDataInicio, setDataFim, pagination]);

  return (
    <>
      <div className="px-4 py-3">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <i className="ti ti-history text-[14px] text-[var(--accent-success)]"></i>
            <span className="text-[13px] font-medium text-[var(--text-secondary)]">Histórico</span>
          </div>
          <div className="text-right">
            {/* Métricas agregadas resumidas */}
            {(filtroTipo.length > 0 || (filtroParceiro && filtroParceiro !== "TODOS") || (filtroProjeto && filtroProjeto !== "TODOS")) && metricas.moedas.length > 0 && (
              <div className="flex items-start justify-end gap-5">
                {/* Fiat block — only when fiat present */}
                {metricas.fiat.moedas.length > 0 && (
                  <div className="flex flex-col items-end">
                    <span className="text-[10px] uppercase tracking-wide text-[var(--text-tertiary)]">
                      Fiat{metricas.fiat.isMixed ? " (em BRL)" : ""}
                    </span>
                    <span className="text-[14px] font-medium text-[var(--text-primary)] tabular-nums">
                      {formatCurrencyDynamic(metricas.fiat.total, metricas.fiat.displayMoeda)}
                    </span>
                    <span className="text-[10px] text-[var(--accent-success)] tabular-nums">
                      Creditado: {formatCurrencyDynamic(metricas.fiat.confirmado, metricas.fiat.displayMoeda)}
                    </span>
                  </div>
                )}

                {/* Crypto block — only when crypto present */}
                {metricas.crypto.moedas.length > 0 && (
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div className="flex flex-col items-end cursor-help">
                          <span className="text-[10px] uppercase tracking-wide text-[var(--text-tertiary)]">
                            Cripto (em USD)
                            {metricas.crypto.semCotacao.length > 0 && (
                              <span className="ml-1 text-amber-400">~</span>
                            )}
                          </span>
                          <span className="text-[14px] font-medium text-[var(--text-primary)] tabular-nums">
                            {formatCurrencyDynamic(metricas.crypto.totalUSD, "USD")}
                          </span>
                          <span className="text-[10px] text-[var(--accent-success)] tabular-nums">
                            Creditado: {formatCurrencyDynamic(metricas.crypto.confirmadoUSD, "USD")}
                          </span>
                        </div>
                      </TooltipTrigger>
                      <TooltipContent side="bottom" align="end" className="max-w-xs">
                        <div className="space-y-1.5 text-xs">
                          <div className="font-semibold border-b border-border pb-1 mb-1">
                            Detalhamento por ativo
                          </div>
                          {metricas.crypto.moedas.map((m: any) => (
                            <div key={m.coin} className="flex flex-col gap-0.5">
                              <div className="flex justify-between gap-3">
                                <span className="text-muted-foreground">
                                  {m.coin}
                                  {m.semSnapshotUsd > 0 && (
                                    <span className="ml-1 text-amber-400">~</span>
                                  )}
                                </span>
                                <span className="tabular-nums">
                                  {m.qtdTotal.toLocaleString("pt-BR", { maximumFractionDigits: 8 })}
                                  <span className="ml-2 text-[10px] text-muted-foreground">
                                    ≈ {formatCurrencyDynamic(m.usdTotal, "USD")}
                                  </span>
                                </span>
                              </div>
                              {m.ultimoSnapshotAt && (
                                <div className="text-[9px] text-muted-foreground text-right">
                                  Snapshot @ {format(parseLocalDateTime(m.ultimoSnapshotAt) ?? new Date(m.ultimoSnapshotAt), "dd/MM HH:mm")}
                                </div>
                              )}
                            </div>
                          ))}
                          {metricas.crypto.semCotacao.length > 0 && (
                            <div className="text-[10px] text-amber-400 border-t border-border pt-1 mt-1">
                              ~ Linha sem snapshot USD — estimativa pode divergir.
                            </div>
                          )}
                          <div className="text-[10px] text-muted-foreground border-t border-border pt-1 mt-1">
                            Total em USD calculado pelo snapshot do momento de cada movimentação (não flutua).
                          </div>
                        </div>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="space-y-4 mt-4">
          {/* Campo de busca */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar movimentação…"
              value={termoBusca}
              onChange={(e) => {
                setTermoBusca(e.target.value);
                pagination.goToFirstPage();
              }}
              className="pl-9 pr-9"
            />
            {termoBusca && (
              <Button
                variant="ghost"
                size="icon"
                className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7"
                onClick={() => {
                  setTermoBusca("");
                  pagination.goToFirstPage();
                }}
              >
                <X className="h-4 w-4" />
              </Button>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-1.5 mb-3.5">
            {/* Tipo filter - Multi-select refinado */}
            <div className="flex items-center">
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className={cn(
                      "h-8 text-[11px] px-2.5 rounded-[6px] gap-1.5 border-[var(--border-default)] bg-[var(--bg-input)] text-[var(--text-muted)] hover:bg-[var(--bg-hover)] hover:border-[var(--border-hover)] transition-all",
                      filtroTipo.length > 0 && "border-[#16a34a33] bg-[rgba(22,163,74,0.09)] text-[#4ade80]"
                    )}
                  >
                    <i className="ti ti-filter text-[11px]"></i>
                    <span>Tipo:</span>
                    {filtroTipo.length === 0 ? (
                      <span>Todos</span>
                    ) : filtroTipo.length === 1 ? (
                      <span>{TIPO_OPTIONS.find(o => o.value === filtroTipo[0])?.label || filtroTipo[0]}</span>
                    ) : (
                      <span>{filtroTipo.length}</span>
                    )}
                  </Button>
                </PopoverTrigger>

                <PopoverContent className="w-52 p-2" align="start">
                  <div className="space-y-1">
                    {TIPO_OPTIONS.map((opt) => {
                      const isSelected = filtroTipo.includes(opt.value);
                      return (
                        <button
                          key={opt.value}
                          className={`flex items-center gap-2 w-full px-2 py-1.5 rounded text-xs hover:bg-muted/80 transition-colors ${isSelected ? "bg-muted font-medium" : ""}`}
                          onClick={() => {
                            if (isSelected) {
                              setFiltroTipo(filtroTipo.filter(v => v !== opt.value));
                            } else {
                              setFiltroTipo([...filtroTipo, opt.value]);
                            }
                          }}
                        >
                          <div className={`h-3.5 w-3.5 rounded-sm border flex items-center justify-center ${isSelected ? "bg-primary border-primary" : "border-muted-foreground/40"}`}>
                            {isSelected && <CheckCircle2 className="h-3 w-3 text-primary-foreground" />}
                          </div>
                          {opt.label}
                        </button>
                      );
                    })}
                    {filtroTipo.length > 0 && (
                      <>
                        <div className="border-t border-border/50 my-1" />
                        <button
                          className="w-full px-2 py-1.5 rounded text-xs text-muted-foreground hover:bg-muted/80 transition-colors text-center"
                          onClick={() => setFiltroTipo([])}
                        >
                          Limpar filtros
                        </button>
                      </>
                    )}
                  </div>
                </PopoverContent>
              </Popover>
            </div>
            {/* Projeto filter with search */}
            <ProjetoFilterSelect
              value={filtroProjeto}
              onChange={setFiltroProjeto}
              projetos={projetos}
            />
            <ParceiroFilterSelect
              value={filtroParceiro}
              onChange={setFiltroParceiro}
              parceiros={parceirosLista}
            />
             <BookmakerFilterCombobox
               bookmakers={bookmakerOptions}
               selectedIds={filtroBookmakerIds}
               onSelectionChange={(ids) => {
                 setFiltroBookmakerIds(ids);
                 pagination.goToFirstPage();
               }}
               label="Casa"
               searchPlaceholder="Buscar casa…"
             />

 
             {/* Tag filter - Multi-select */}
             {availableTags.length > 0 && (
               <div className="flex items-center">
                 <Popover>
                   <PopoverTrigger asChild>
                     <Button
                       variant="outline"
                       size="sm"
                       className={`h-8 text-xs whitespace-nowrap gap-1.5 ${filtroTags.length > 0 ? "bg-secondary border-secondary" : "border-border/50"}`}
                     >
                       <TagIcon className="h-3 w-3" />
                       <span>Tags:</span>
                       {filtroTags.length === 0 ? (
                         <span>Todas</span>
                       ) : filtroTags.length === 1 ? (
                         <span>{filtroTags[0]}</span>
                       ) : (
                         <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">
                           {filtroTags.length}
                         </Badge>
                       )}
                     </Button>
                   </PopoverTrigger>
                     <PopoverContent className="w-52 p-2" align="start">
                       <div className="space-y-1">
                         {availableTags.map((tag) => {
                           const isSelected = filtroTags.includes(tag);
                           return (
                             <button
                               key={tag}
                               className={cn(
                                 "flex items-center gap-2 w-full px-2 py-1.5 rounded text-xs hover:bg-muted/80 transition-colors",
                                 isSelected && "bg-muted font-medium"
                               )}
                               onClick={() => {
                                 if (isSelected) {
                                   setFiltroTags(filtroTags.filter(v => v !== tag));
                                 } else {
                                   setFiltroTags([...filtroTags, tag]);
                                 }
                                 pagination.goToFirstPage();
                               }}
                             >
                               <Check
                                 className={cn(
                                   "h-3.5 w-3.5 shrink-0",
                                   isSelected ? "opacity-100" : "opacity-0"
                                 )}
                               />
                               <span className={cn("px-1.5 py-0.5 rounded text-[10px] font-medium border", getTagColor(tag))}>
                                 {tag}
                               </span>
                             </button>
                           );
                         })}
                       {filtroTags.length > 0 && (
                         <>
                           <div className="border-t border-border/50 my-1" />
                           <button
                             className="w-full px-2 py-1.5 rounded text-xs text-muted-foreground hover:bg-muted/80 transition-colors text-center"
                             onClick={() => {
                               setFiltroTags([]);
                               pagination.goToFirstPage();
                             }}
                           >
                             Limpar tags
                           </button>
                         </>
                       )}
                     </div>
                   </PopoverContent>
                 </Popover>
               </div>
             )}
            <div className="ml-auto flex items-center gap-1.5">
              {["mês", "anterior", "ano", "tudo"].map((p) => (
                <button
                  key={p}
                  onClick={() => handlePeriodChange(p as DashboardPeriodFilter)}
                  className={cn(
                    "text-[11px] px-3 py-1 rounded-full transition-all",
                    periodFilter === p 
                      ? "bg-[var(--accent-success)] text-white" 
                      : "text-[var(--text-faint)] hover:text-[var(--text-muted)]"
                  )}
                >
                  {p === "tudo" ? "Tudo" : p.charAt(0).toUpperCase() + p.slice(1)}
                </button>
              ))}
            </div>

          </div>
        </div>
      </div>
      <div>

        {loading ? (
          <div className="text-center py-8 text-muted-foreground">Carregando...</div>
        ) : transacoesFiltradas.length === 0 ? (
          <div className="text-center py-8">
            <AlertCircle className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <p className="text-muted-foreground">Nenhuma transação encontrada no período</p>
          </div>
        ) : (
          <div className="space-y-0">
            <ScrollArea className="h-[550px]">
              <div className="space-y-0 pr-4">
                {pagination.paginatedItems.map((tx: any) => {
                  const txType = tx.tipo_transacao;
                  const isScan = txType === 'PERDA_OPERACIONAL' || txType === 'SCAN';
                  
                  return (
                    <div 
                      key={tx.id} 
                      className="grid grid-cols-[auto_1fr_auto] gap-[12px] items-center py-[12px] border-b border-[#131920] last:border-0 group"
                    >
                      {/* Coluna 1: Ícone */}
                      <TransactionIcon type={txType} transacao={{
                        ...tx,
                        bookmaker_nome: tx.origem_bookmaker_id ? bookmakers[tx.origem_bookmaker_id]?.nome : (tx.destino_bookmaker_id ? bookmakers[tx.destino_bookmaker_id]?.nome : "")
                      }} />

                      {/* Coluna 2: Detalhes */}
                      <div className="min-w-0">
                        <TransactionBadge type={txType} label={getTipoLabel(txType, tx)} />
                        <div className="flex items-center gap-2">
                          <span className="text-[12px] font-medium text-[var(--text-secondary)] truncate">
                            {isScan ? tx.descricao?.replace(/\[SCAN.*?\]\s*/i, '') : `${getOrigemLabel(tx)} → ${getDestinoLabel(tx)}`}
                          </span>
                        </div>
                        <div className="text-[11px] text-[var(--text-faint)] truncate mt-px">
                          {isScan ? "Prejuízo operacional por fraude/scam" : (tx.descricao || "Sem descrição")}
                        </div>
                        {isScan && (
                          <div className="inline-flex items-center gap-1 mt-1 px-1.5 py-0.5 rounded-[4px] bg-[#201010] text-[#ef4444] text-[9px] font-medium border border-[#ef4444]/20">
                            <i className="ti ti-alert-triangle" style={{ fontSize: 9 }}></i>
                            Perda de Capital
                          </div>
                        )}
                      </div>

                      {/* Coluna 3: Valores, Status e Ações */}
                      <div className="text-right flex flex-col items-end min-w-[140px]">
                        <div className="flex items-center gap-2 group-hover:translate-x-[-4px] transition-transform duration-200">
                          <div className="flex flex-col items-end">
                            <span className="text-[15px] font-semibold text-[var(--text-primary)] tabular-nums tracking-tight">
                              {formatCurrencyDynamic(Math.abs(getValorEfetivo(tx)), getMoedaEfetiva(tx))}
                            </span>
                            <span className="text-[10px] text-[var(--text-faint)] tabular-nums opacity-80">
                              {(() => {
                                const dk = extractCivilDateKey(tx.data_transacao);
                                if (!dk) return '-';
                                const [y, m, d] = dk.split('-');
                                return `${d}/${m}/${y}`;
                              })()}
                            </span>
                          </div>

                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button 
                                variant="ghost" 
                                size="icon" 
                                className="h-6 w-6 text-muted-foreground/40 hover:text-foreground hover:bg-white/5 rounded-md transition-colors"
                              >
                                <MoreVertical className="h-3.5 w-3.5" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-48 bg-[#1a1f26] border-[#2a2f36] shadow-2xl">
                              <DropdownMenuItem 
                                className="text-xs gap-2 py-2 hover:bg-white/5 cursor-pointer"
                                onClick={() => {
                                  setEditDateId(tx.id);
                                  setEditDateValue(tx.data_transacao);
                                }}
                              >
                                <Pencil className="h-3.5 w-3.5 text-blue-400" />
                                Editar Data
                              </DropdownMenuItem>
                              
                              {tx.status === "CONFIRMADO" && txType === "SAQUE" && (
                                <DropdownMenuItem 
                                  className="text-xs gap-2 py-2 hover:bg-white/5 cursor-pointer"
                                  onClick={() => {
                                    setEditConfirmado({
                                      id: tx.id,
                                      dataConfirmacao: tx.data_confirmacao || tx.data_transacao,
                                      valorConfirmado: tx.valor_confirmado,
                                      moeda: getMoedaEfetiva(tx),
                                      tipoCrypto: tx.tipo_moeda === "CRYPTO",
                                      coin: tx.coin
                                    });
                                  }}
                                >
                                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                                  Editar Confirmação
                                </DropdownMenuItem>
                              )}

                              <DropdownMenuItem 
                                className="text-xs gap-2 py-2 hover:bg-white/5 cursor-pointer"
                                onClick={() => setEditTagsTx(tx)}
                              >
                                <TagIcon className="h-3.5 w-3.5 text-purple-400" />
                                Gerenciar Tags
                              </DropdownMenuItem>

                              <DropdownMenuSeparator className="bg-[#2a2f36]" />
                              
                              <DropdownMenuItem 
                                className="text-xs gap-2 py-2 text-amber-500 focus:text-amber-500 hover:bg-amber-500/5 cursor-pointer"
                                disabled={!canRevert(tx, role)}
                                onClick={() => setReverterTx(tx)}
                              >
                                <Undo2 className="h-3.5 w-3.5" />
                                Reverter Transação
                              </DropdownMenuItem>

                              <DropdownMenuItem 
                                className="text-xs gap-2 py-2 text-red-500 focus:text-red-500 hover:bg-red-500/5 cursor-pointer"
                                disabled={!canDelete(tx, role)}
                                onClick={() => setExcluirTx(tx)}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                                Excluir Registro
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>

                        <div className="flex items-center gap-2 mt-2">
                          {tx.status === "PENDENTE" && txType === "SAQUE" && (
                            <Button
                              size="sm"
                              className="h-6 px-3 text-[10px] font-bold bg-emerald-500 text-[#0c2a1a] hover:bg-emerald-400 border-none shadow-[0_2px_10px_rgba(16,185,129,0.2)] transition-all hover:scale-[1.02] active:scale-[0.98]"
                              onClick={(e) => {
                                e.stopPropagation();
                                onConfirmarSaque?.(tx);
                              }}
                            >
                              Confirmar Saque
                            </Button>
                          )}
                          
                          {getStatusBadge(tx.status)}
                        </div>

                        <div className="flex items-center gap-1 mt-1.5 opacity-40 group-hover:opacity-70 transition-opacity">
                          <span className="text-[9px] font-medium text-[var(--text-ghost)] uppercase tracking-widest">
                            por {usuariosMap[tx.user_id] || "SISTEMA"}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </ScrollArea>


            {/* Paginação */}
            <div className="mt-4 pt-4 border-t border-[var(--border-default)]">
              <SimplePagination
                currentPage={pagination.currentPage}
                totalPages={pagination.totalPages}
                totalItems={pagination.totalItems}
                startIndex={pagination.startIndex}
                endIndex={pagination.endIndex}
                hasNextPage={pagination.hasNextPage}
                hasPrevPage={pagination.hasPrevPage}
                onNextPage={pagination.goToNextPage}
                onPrevPage={pagination.goToPrevPage}
                onFirstPage={pagination.goToFirstPage}
                onLastPage={pagination.goToLastPage}
              />
            </div>

          </div>

        )}
      </div>


      {editDateId && (
        <EditarDataTransacaoDialog
          open={!!editDateId}
          onClose={() => setEditDateId(null)}
          transacaoId={editDateId}
          dataAtual={editDateValue}
          onSuccess={() => {
            // Dispatch event to refresh caixa data
            window.dispatchEvent(new CustomEvent("lovable:caixa-data-changed"));
          }}
        />
      )}

      {editConfirmado && (
        <EditarSaqueConfirmadoDialog
          open={!!editConfirmado}
          onClose={() => setEditConfirmado(null)}
          transacaoId={editConfirmado.id}
          dataConfirmacaoAtual={editConfirmado.dataConfirmacao}
          valorConfirmadoAtual={editConfirmado.valorConfirmado}
          moeda={editConfirmado.moeda}
          tipoCrypto={editConfirmado.tipoCrypto}
          coin={editConfirmado.coin}
          onSuccess={() => {
            window.dispatchEvent(new CustomEvent("lovable:caixa-data-changed"));
          }}
        />
      )}

      <ReverterMovimentacaoDialog
        open={!!reverterTx}
        onOpenChange={(o) => { if (!o) setReverterTx(null); }}
        transacao={reverterTx}
        resumoTransacao={reverterTx?._resumo}
      />

      <ExcluirMovimentacaoDialog
        open={!!excluirTx}
        onOpenChange={(o) => { if (!o) setExcluirTx(null); }}
        transacao={excluirTx}
        resumoTransacao={excluirTx?._resumo}
      />

      <EditarTagsDialog
        open={!!editTagsTx}
        transacao={editTagsTx}
        onClose={() => setEditTagsTx(null)}
        onSuccess={() => {
          window.dispatchEvent(new CustomEvent("lovable:caixa-data-changed"));
        }}
      />
    </>
  );
}
