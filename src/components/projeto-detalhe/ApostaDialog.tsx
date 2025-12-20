import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Loader2, Save, Trash2, HelpCircle, Coins, TrendingUp, TrendingDown, AlertTriangle, CheckCircle2, XCircle, Shield, BarChart3, BookOpen, BookX, Gift, Percent } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DateTimePicker } from "@/components/ui/date-time-picker";

interface Aposta {
  id: string;
  data_aposta: string;
  esporte: string;
  evento: string;
  mercado: string | null;
  selecao: string;
  odd: number;
  stake: number;
  estrategia: string | null;
  status: string;
  resultado: string | null;
  valor_retorno: number | null;
  lucro_prejuizo: number | null;
  observacoes: string | null;
  bookmaker_id: string;
  modo_entrada?: string;
  lay_exchange?: string | null;
  lay_odd?: number | null;
  lay_stake?: number | null;
  lay_liability?: number | null;
  lay_comissao?: number | null;
  back_em_exchange?: boolean;
  back_comissao?: number | null;
  gerou_freebet?: boolean;
  valor_freebet_gerada?: number | null;
  tipo_freebet?: string | null;
}

interface Bookmaker {
  id: string;
  nome: string;
  parceiro_id: string;
  saldo_atual: number;
  saldo_total: number;
  saldo_disponivel: number;
  saldo_freebet: number;
  moeda: string;
  parceiro?: {
    nome: string;
  };
}

interface ApostaDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  aposta: Aposta | null;
  projetoId: string;
  onSuccess: () => void;
}

const ESPORTES_BASE = [
  "Futebol",
  "Basquete",
  "Tênis",
  "Baseball",
  "Hockey",
  "Futebol Americano",
  "Vôlei",
  "MMA/UFC",
  "League of Legends",
  "Counter-Strike",
  "Dota 2",
  "eFootball",
  "Outro"
];

const SPORT_USAGE_KEY = "apostas_sport_usage";

const getSortedEsportes = (): string[] => {
  try {
    const stored = localStorage.getItem(SPORT_USAGE_KEY);
    if (!stored) return ESPORTES_BASE;
    
    const usage: Record<string, number> = JSON.parse(stored);
    
    return [...ESPORTES_BASE].sort((a, b) => {
      const countA = usage[a] || 0;
      const countB = usage[b] || 0;
      if (countA === countB) {
        return ESPORTES_BASE.indexOf(a) - ESPORTES_BASE.indexOf(b);
      }
      return countB - countA;
    });
  } catch {
    return ESPORTES_BASE;
  }
};

const incrementSportUsage = (sport: string) => {
  try {
    const stored = localStorage.getItem(SPORT_USAGE_KEY);
    const usage: Record<string, number> = stored ? JSON.parse(stored) : {};
    usage[sport] = (usage[sport] || 0) + 1;
    localStorage.setItem(SPORT_USAGE_KEY, JSON.stringify(usage));
  } catch {
    // Silently fail
  }
};

const MERCADOS_POR_ESPORTE: Record<string, string[]> = {
  "Futebol": [
    "Moneyline / 1X2",
    "Over (Gols)",
    "Under (Gols)",
    "Handicap Asiático",
    "Handicap Europeu",
    "Ambas Marcam (BTTS)",
    "Resultado Exato",
    "Dupla Chance",
    "Draw No Bet",
    "Primeiro/Último Gol",
    "Total de Cantos",
    "Outro"
  ],
  "Basquete": [
    "Moneyline",
    "Over (Pontos)",
    "Under (Pontos)",
    "Handicap",
    "1º/2º Tempo",
    "Margem de Vitória",
    "Outro"
  ],
  "Tênis": [
    "Vencedor do Jogo",
    "Handicap de Games",
    "Over (Games)",
    "Under (Games)",
    "Vencedor do Set",
    "Resultado Exato (Sets)",
    "Outro"
  ],
  "Baseball": [
    "Moneyline",
    "Run Line (+1.5 / -1.5)",
    "Over (Runs)",
    "Under (Runs)",
    "1ª Metade (1st 5 Innings)",
    "Handicap",
    "Outro"
  ],
  "Hockey": [
    "Moneyline",
    "Puck Line (+1.5 / -1.5)",
    "Over (Gols)",
    "Under (Gols)",
    "1º/2º/3º Período",
    "Handicap",
    "Outro"
  ],
  "Futebol Americano": [
    "Moneyline",
    "Spread",
    "Over (Pontos)",
    "Under (Pontos)",
    "1º/2º Tempo",
    "Margem de Vitória",
    "Primeiro TD",
    "Outro"
  ],
  "Vôlei": [
    "Vencedor",
    "Handicap de Sets",
    "Over (Pontos)",
    "Under (Pontos)",
    "Resultado Exato (Sets)",
    "Outro"
  ],
  "MMA/UFC": [
    "Vencedor",
    "Método de Vitória",
    "Round de Finalização",
    "Vai para Decisão?",
    "Over (Rounds)",
    "Under (Rounds)",
    "Outro"
  ],
  "League of Legends": [
    "Vencedor do Mapa",
    "Vencedor da Série",
    "Handicap de Mapas",
    "Over (Mapas)",
    "Under (Mapas)",
    "Outro"
  ],
  "Counter-Strike": [
    "Vencedor do Mapa",
    "Vencedor da Série",
    "Handicap de Rounds",
    "Over (Rounds)",
    "Under (Rounds)",
    "Handicap de Mapas",
    "Outro"
  ],
  "Dota 2": [
    "Vencedor do Mapa",
    "Vencedor da Série",
    "Handicap de Mapas",
    "Over (Mapas)",
    "Under (Mapas)",
    "Outro"
  ],
  "eFootball": [
    "Vencedor",
    "Over (Gols)",
    "Under (Gols)",
    "Handicap",
    "Ambas Marcam",
    "Resultado Exato",
    "Outro"
  ],
  "Outro": [
    "Vencedor",
    "Over",
    "Under",
    "Handicap",
    "Outro"
  ]
};

// Helper to check if mercado is Moneyline
const isMoneylineMercado = (mercado: string): boolean => {
  const moneylineKeywords = ["Moneyline", "1X2", "Vencedor"];
  return moneylineKeywords.some(kw => mercado.includes(kw));
};

// Get Moneyline selection options based on sport
const getMoneylineSelecoes = (esporte: string, mandante: string, visitante: string): string[] => {
  const timeCasa = mandante || "MANDANTE";
  const timeFora = visitante || "VISITANTE";
  
  // Sports without draw
  const sportsSemEmpate = ["Basquete", "Tênis", "Baseball", "Vôlei", "MMA/UFC", "Boxe"];
  
  if (sportsSemEmpate.includes(esporte) || esporte.includes("League") || esporte.includes("Counter") || esporte.includes("Dota")) {
    return [timeCasa, timeFora];
  }
  
  // Football and others with draw
  return [timeCasa, "EMPATE", timeFora];
};

// Removed EXCHANGES list - now using bookmakers list for Exchange tab

export function ApostaDialog({ open, onOpenChange, aposta, projetoId, onSuccess }: ApostaDialogProps) {
  const [loading, setLoading] = useState(false);
  const [bookmakers, setBookmakers] = useState<Bookmaker[]>([]);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  // Tipo de aposta (aba)
  const [tipoAposta, setTipoAposta] = useState<"bookmaker" | "exchange">("bookmaker");

  // Campos comuns
  const [dataAposta, setDataAposta] = useState("");
  const [esporte, setEsporte] = useState("");
  const [mandante, setMandante] = useState("");
  const [visitante, setVisitante] = useState("");
  const [mercado, setMercado] = useState("");
  const [selecao, setSelecao] = useState("");
  const [odd, setOdd] = useState("");
  const [stake, setStake] = useState("");
  const [statusResultado, setStatusResultado] = useState("PENDENTE");
  const [valorRetorno, setValorRetorno] = useState("");
  const [observacoes, setObservacoes] = useState("");

  // Computed evento
  const evento = mandante && visitante ? `${mandante} x ${visitante}` : "";

  // Check if current mercado is Moneyline (uses select instead of free text)
  const isMoneyline = isMoneylineMercado(mercado);

  // Get Moneyline options for current sport/teams
  const moneylineOptions = isMoneyline ? getMoneylineSelecoes(esporte, mandante, visitante) : [];

  // Effective selection (always the selecao state now)
  const effectiveSelecao = selecao;

  // Bookmaker mode
  const [bookmakerId, setBookmakerId] = useState("");
  const [modoBackLay, setModoBackLay] = useState(false);
  const [layExchange, setLayExchange] = useState("");
  const [layOdd, setLayOdd] = useState("");
  const [layComissao, setLayComissao] = useState("5");

  // Exchange mode - novo modelo com 3 tipos de operação
  const [tipoOperacaoExchange, setTipoOperacaoExchange] = useState<"back" | "lay" | "cobertura">("back");
  const [exchangeBookmakerId, setExchangeBookmakerId] = useState("");
  const [exchangeOdd, setExchangeOdd] = useState("");
  const [exchangeStake, setExchangeStake] = useState("");
  const [exchangeComissao, setExchangeComissao] = useState("5");
  
  // Valores calculados para Exchange (Back/Lay simples)
  const [exchangeLucroPotencial, setExchangeLucroPotencial] = useState<number | null>(null);
  const [exchangeRetornoTotal, setExchangeRetornoTotal] = useState<number | null>(null);
  const [exchangeLiability, setExchangeLiability] = useState<number | null>(null);
  const [exchangePrejuizo, setExchangePrejuizo] = useState<number | null>(null);
  
  // Cobertura Lay (Back em bookmaker + Lay em exchange)
  const [coberturaBackBookmakerId, setCoberturaBackBookmakerId] = useState("");
  const [coberturaBackOdd, setCoberturaBackOdd] = useState("");
  const [coberturaBackStake, setCoberturaBackStake] = useState("");
  const [coberturaLayBookmakerId, setCoberturaLayBookmakerId] = useState("");
  const [coberturaLayOdd, setCoberturaLayOdd] = useState("");
  const [coberturaLayComissao, setCoberturaLayComissao] = useState("5");
  
  // Tipo de aposta Back (Normal, Freebet SNR, Freebet SR) - para Cobertura
  const [tipoApostaBack, setTipoApostaBack] = useState<"normal" | "freebet_snr" | "freebet_sr">("normal");
  
  // Toggle simples: Usar Freebet nesta aposta? (Bookmaker simples)
  const [usarFreebetBookmaker, setUsarFreebetBookmaker] = useState(false);
  
  // Tipo de aposta para Exchange Back (Normal, Freebet SNR, Freebet SR)
  const [tipoApostaExchangeBack, setTipoApostaExchangeBack] = useState<"normal" | "freebet_snr" | "freebet_sr">("normal");
  
  // Saldos das casas selecionadas (incluindo saldo de freebet)
  const [bookmakerSaldo, setBookmakerSaldo] = useState<{ saldo: number; saldoDisponivel: number; saldoFreebet: number; moeda: string } | null>(null);
  const [coberturaBackSaldo, setCoberturaBackSaldo] = useState<{ saldo: number; saldoDisponivel: number; saldoFreebet: number; moeda: string } | null>(null);
  const [coberturaLaySaldo, setCoberturaLaySaldo] = useState<{ saldo: number; saldoDisponivel: number; saldoFreebet: number; moeda: string } | null>(null);
  const [exchangeBookmakerSaldo, setExchangeBookmakerSaldo] = useState<{ saldo: number; saldoDisponivel: number; saldoFreebet: number; moeda: string } | null>(null);
  
  // Valores calculados para Cobertura
  const [coberturaLayStake, setCoberturaLayStake] = useState<number | null>(null);
  const [coberturaResponsabilidade, setCoberturaResponsabilidade] = useState<number | null>(null);
  const [coberturaLucroBack, setCoberturaLucroBack] = useState<number | null>(null);
  const [coberturaLucroLay, setCoberturaLucroLay] = useState<number | null>(null);
  const [coberturaLucroGarantido, setCoberturaLucroGarantido] = useState<number | null>(null);
  const [coberturaTaxaExtracao, setCoberturaTaxaExtracao] = useState<number | null>(null);

  // Freebet tracking
  const [gerouFreebet, setGerouFreebet] = useState(false);
  const [valorFreebetGerada, setValorFreebetGerada] = useState("");

  // Calculated values
  const [layStake, setLayStake] = useState<number | null>(null);
  const [layLiability, setLayLiability] = useState<number | null>(null);

  const mercadosDisponiveis = esporte ? MERCADOS_POR_ESPORTE[esporte] || MERCADOS_POR_ESPORTE["Outro"] : [];

  useEffect(() => {
    if (open) {
      fetchBookmakers();
      if (aposta) {
        setDataAposta(aposta.data_aposta.slice(0, 16));
        setEsporte(aposta.esporte);
        // Parse evento para mandante/visitante
        const eventoParts = aposta.evento?.split(" x ") || [];
        setMandante(eventoParts[0] || aposta.evento || "");
        setVisitante(eventoParts[1] || "");
        setOdd(aposta.odd.toString());
        setStake(aposta.stake.toString());
        setStatusResultado(aposta.resultado || aposta.status);
        setValorRetorno(aposta.valor_retorno?.toString() || "");
        setObservacoes(aposta.observacoes || "");

        // Parse handicap selection if applicable
        const savedMercado = aposta.mercado || "";
        const savedSelecao = aposta.selecao || "";
        
        // Set mercado and selecao (simplified - no more handicap fields)
        setTimeout(() => {
          setMercado(savedMercado);
          setSelecao(savedSelecao);
        }, 50);

        // Determinar tipo de aposta baseado nos dados salvos
        if (aposta.modo_entrada === "EXCHANGE" || aposta.back_em_exchange) {
          // Exchange mode
          setTipoAposta("exchange");
          // Determinar se é Back, Lay ou Cobertura baseado na estratégia
          if (aposta.estrategia === "COBERTURA_LAY") {
            setTipoOperacaoExchange("cobertura");
            setCoberturaBackBookmakerId(aposta.bookmaker_id || "");
            setCoberturaBackOdd(aposta.odd?.toString() || "");
            setCoberturaBackStake(aposta.stake?.toString() || "");
            setCoberturaLayBookmakerId(aposta.lay_exchange || "");
            setCoberturaLayOdd(aposta.lay_odd?.toString() || "");
            setCoberturaLayComissao(aposta.lay_comissao?.toString() || "5");
            // Restaurar tipo de freebet da aposta salva
            const tipoFreebet = (aposta as any).tipo_freebet as string | null;
            if (tipoFreebet === "freebet_snr") {
              setTipoApostaBack("freebet_snr");
            } else if (tipoFreebet === "freebet_sr") {
              setTipoApostaBack("freebet_sr");
            } else {
              setTipoApostaBack("normal");
            }
          } else if (aposta.estrategia === "EXCHANGE_LAY") {
            setTipoOperacaoExchange("lay");
            setExchangeOdd(aposta.lay_odd?.toString() || "");
            setExchangeStake(aposta.lay_stake?.toString() || aposta.stake?.toString() || "");
            setExchangeLiability(aposta.lay_liability || null);
            setExchangeBookmakerId(aposta.bookmaker_id || "");
            setExchangeComissao(aposta.lay_comissao?.toString() || "5");
          } else {
            setTipoOperacaoExchange("back");
            setExchangeOdd(aposta.odd?.toString() || "");
            setExchangeStake(aposta.stake?.toString() || "");
            setExchangeBookmakerId(aposta.bookmaker_id || "");
            setExchangeComissao(aposta.back_comissao?.toString() || "5");
          }
        } else if (aposta.modo_entrada === "LAYBACK") {
          // Legado: Bookmaker + Lay em exchange -> migrar para Cobertura
          setTipoAposta("exchange");
          setTipoOperacaoExchange("cobertura");
          setCoberturaBackBookmakerId(aposta.bookmaker_id);
          setCoberturaBackOdd(aposta.odd?.toString() || "");
          setCoberturaBackStake(aposta.stake?.toString() || "");
          setCoberturaLayBookmakerId(aposta.lay_exchange || "");
          setCoberturaLayOdd(aposta.lay_odd?.toString() || "");
          setCoberturaLayComissao(aposta.lay_comissao?.toString() || "5");
        } else {
          // Bookmaker simples
          setTipoAposta("bookmaker");
          setBookmakerId(aposta.bookmaker_id);
          setModoBackLay(false);
        }

        // Freebet tracking
        setGerouFreebet(aposta.gerou_freebet || false);
        setValorFreebetGerada(aposta.valor_freebet_gerada?.toString() || "");
        
        // Se a aposta usou freebet (bookmaker simples)
        if (aposta.tipo_freebet && aposta.tipo_freebet !== "normal" && aposta.modo_entrada === "PADRAO") {
          setUsarFreebetBookmaker(true);
        }
      } else {
        resetForm();
      }
    }
  }, [open, aposta]);

  // Atualizar saldo quando bookmakerId mudar ou bookmakers forem carregados
  useEffect(() => {
    if (bookmakerId && bookmakers.length > 0) {
      const selectedBk = bookmakers.find(b => b.id === bookmakerId);
      if (selectedBk) {
        setBookmakerSaldo({ saldo: selectedBk.saldo_total, saldoDisponivel: selectedBk.saldo_disponivel, saldoFreebet: selectedBk.saldo_freebet, moeda: selectedBk.moeda });
      }
    }
  }, [bookmakerId, bookmakers]);

  // Atualizar saldo da casa para Exchange (Back/Lay)
  useEffect(() => {
    if (exchangeBookmakerId && bookmakers.length > 0) {
      const selectedBk = bookmakers.find(b => b.id === exchangeBookmakerId);
      if (selectedBk) {
        setExchangeBookmakerSaldo({ saldo: selectedBk.saldo_total, saldoDisponivel: selectedBk.saldo_disponivel, saldoFreebet: selectedBk.saldo_freebet, moeda: selectedBk.moeda });
      } else {
        setExchangeBookmakerSaldo(null);
      }
    } else {
      setExchangeBookmakerSaldo(null);
    }
  }, [exchangeBookmakerId, bookmakers]);

  useEffect(() => {
    if (!aposta) {
      setMercado("");
      setSelecao("");
    }
  }, [esporte]);

  // Reset selecao when mercado changes (only for new bets)
  useEffect(() => {
    if (!aposta) {
      setSelecao("");
    }
  }, [mercado, aposta]);

  // Calcular Lay Stake e Liability para modo Bookmaker + Lay
  useEffect(() => {
    if (tipoAposta === "bookmaker" && modoBackLay && stake && odd && layOdd) {
      const backStake = parseFloat(stake);
      const backOdd = parseFloat(odd);
      const layOddNum = parseFloat(layOdd);
      const comissao = parseFloat(layComissao) / 100;

      if (backStake > 0 && backOdd > 0 && layOddNum > 1) {
        const calculatedLayStake = (backStake * backOdd) / (layOddNum - comissao);
        const calculatedLiability = calculatedLayStake * (layOddNum - 1);
        setLayStake(Math.round(calculatedLayStake * 100) / 100);
        setLayLiability(Math.round(calculatedLiability * 100) / 100);
      } else {
        setLayStake(null);
        setLayLiability(null);
      }
    } else {
      setLayStake(null);
      setLayLiability(null);
    }
  }, [tipoAposta, modoBackLay, stake, odd, layOdd, layComissao]);

  // Cálculos para Exchange mode (novo modelo)
  useEffect(() => {
    if (tipoAposta !== "exchange") {
      setExchangeLucroPotencial(null);
      setExchangeRetornoTotal(null);
      setExchangeLiability(null);
      setExchangePrejuizo(null);
      return;
    }
    
    const oddNum = parseFloat(exchangeOdd);
    const stakeNum = parseFloat(exchangeStake);
    const comissao = parseFloat(exchangeComissao) / 100;
    
    if (isNaN(oddNum) || isNaN(stakeNum) || oddNum <= 1 || stakeNum <= 0) {
      setExchangeLucroPotencial(null);
      setExchangeRetornoTotal(null);
      setExchangeLiability(null);
      setExchangePrejuizo(null);
      return;
    }
    
    if (tipoOperacaoExchange === "back") {
      // Back: lucro = stake * (odd - 1) - comissão
      const lucroBruto = stakeNum * (oddNum - 1);
      const lucroLiquido = lucroBruto - (lucroBruto * comissao);
      const retorno = stakeNum + lucroLiquido;
      
      setExchangeLucroPotencial(Math.round(lucroLiquido * 100) / 100);
      setExchangeRetornoTotal(Math.round(retorno * 100) / 100);
      setExchangeLiability(null);
      setExchangePrejuizo(null);
    } else {
      // Lay: liability = stake * (odd - 1)
      const liability = stakeNum * (oddNum - 1);
      const lucroSeGanhar = stakeNum - (stakeNum * comissao);
      
      setExchangeLiability(Math.round(liability * 100) / 100);
      setExchangeLucroPotencial(Math.round(lucroSeGanhar * 100) / 100);
      setExchangePrejuizo(Math.round(-liability * 100) / 100);
      setExchangeRetornoTotal(null);
    }
  }, [tipoAposta, tipoOperacaoExchange, exchangeOdd, exchangeStake, exchangeComissao]);

  // Cálculos para Cobertura Lay (com suporte a Freebet)
  useEffect(() => {
    if (tipoAposta !== "exchange" || tipoOperacaoExchange !== "cobertura") {
      setCoberturaLayStake(null);
      setCoberturaResponsabilidade(null);
      setCoberturaLucroBack(null);
      setCoberturaLucroLay(null);
      setCoberturaLucroGarantido(null);
      setCoberturaTaxaExtracao(null);
      return;
    }
    
    const backOdd = parseFloat(coberturaBackOdd);
    const backStake = parseFloat(coberturaBackStake);
    const layOdd = parseFloat(coberturaLayOdd);
    const comissao = parseFloat(coberturaLayComissao) / 100;
    
    if (isNaN(backOdd) || isNaN(backStake) || isNaN(layOdd) || 
        backOdd <= 1 || backStake <= 0 || layOdd <= 1) {
      setCoberturaLayStake(null);
      setCoberturaResponsabilidade(null);
      setCoberturaLucroBack(null);
      setCoberturaLucroLay(null);
      setCoberturaLucroGarantido(null);
      setCoberturaTaxaExtracao(null);
      return;
    }
    
    const oddLayAjustada = layOdd - comissao;
    let stakeLay: number;
    let lucroSeBackGanhar: number;
    let lucroSeLayGanhar: number;
    
    if (tipoApostaBack === "freebet_snr") {
      // Free Bet SNR (Stake Not Returned): usa (oddBack - 1) porque stake não volta
      // A freebet só retorna o lucro, não a stake
      stakeLay = (backStake * (backOdd - 1)) / oddLayAjustada;
      
      // Responsabilidade = Stake Lay × (Odd Lay - 1)
      const responsabilidade = stakeLay * (layOdd - 1);
      
      // Lucro se Back ganhar = Lucro da Freebet - Responsabilidade (pagamos ao lay)
      // Freebet retorna: backStake * (backOdd - 1) = lucro puro
      lucroSeBackGanhar = (backStake * (backOdd - 1)) - responsabilidade;
      
      // Lucro se Lay ganhar = Stake Lay líquido (ganhamos) - 0 (não perdemos a stake pois era free)
      lucroSeLayGanhar = stakeLay * (1 - comissao);
      
      setCoberturaResponsabilidade(Math.round(responsabilidade * 100) / 100);
    } else if (tipoApostaBack === "freebet_sr") {
      // Free Bet SR (Stake Returned): comportamento igual aposta normal
      stakeLay = (backStake * backOdd) / oddLayAjustada;
      const responsabilidade = stakeLay * (layOdd - 1);
      lucroSeBackGanhar = (backStake * (backOdd - 1)) - responsabilidade;
      lucroSeLayGanhar = (stakeLay * (1 - comissao)) - backStake;
      setCoberturaResponsabilidade(Math.round(responsabilidade * 100) / 100);
    } else {
      // Normal (Qualifying Bet)
      stakeLay = (backStake * backOdd) / oddLayAjustada;
      const responsabilidade = stakeLay * (layOdd - 1);
      lucroSeBackGanhar = (backStake * (backOdd - 1)) - responsabilidade;
      lucroSeLayGanhar = (stakeLay * (1 - comissao)) - backStake;
      setCoberturaResponsabilidade(Math.round(responsabilidade * 100) / 100);
    }
    
    // Lucro garantido = mínimo dos dois (devem ser próximos se odds corretas)
    const lucroGarantido = Math.min(lucroSeBackGanhar, lucroSeLayGanhar);
    
    // Taxa de extração = Lucro Garantido ÷ Valor da Freebet × 100
    const taxaExtracao = (lucroGarantido / backStake) * 100;
    
    setCoberturaLayStake(Math.round(stakeLay * 100) / 100);
    setCoberturaLucroBack(Math.round(lucroSeBackGanhar * 100) / 100);
    setCoberturaLucroLay(Math.round(lucroSeLayGanhar * 100) / 100);
    setCoberturaLucroGarantido(Math.round(lucroGarantido * 100) / 100);
    setCoberturaTaxaExtracao(Math.round(taxaExtracao * 100) / 100);
  }, [tipoAposta, tipoOperacaoExchange, coberturaBackOdd, coberturaBackStake, coberturaLayOdd, coberturaLayComissao, tipoApostaBack]);

  const getLocalDateTimeString = () => {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    return `${year}-${month}-${day}T${hours}:${minutes}`;
  };

  const resetForm = () => {
    setTipoAposta("bookmaker");
    setDataAposta(getLocalDateTimeString());
    setEsporte("");
    setMandante("");
    setVisitante("");
    setMercado("");
    setSelecao("");
    setOdd("");
    setStake("");
    setStatusResultado("PENDENTE");
    setValorRetorno("");
    setObservacoes("");
    setBookmakerId("");
    setBookmakerSaldo(null);
    setExchangeBookmakerSaldo(null);
    setModoBackLay(false);
    setLayExchange("");
    setLayOdd("");
    setLayComissao("5");
    // Exchange mode
    setTipoOperacaoExchange("back");
    setExchangeBookmakerId("");
    setExchangeOdd("");
    setExchangeStake("");
    setExchangeComissao("5");
    setExchangeLucroPotencial(null);
    setExchangeRetornoTotal(null);
    setExchangeLiability(null);
    setExchangePrejuizo(null);
    setLayStake(null);
    setLayLiability(null);
    // Cobertura mode
    setCoberturaBackBookmakerId("");
    setCoberturaBackOdd("");
    setCoberturaBackStake("");
    setCoberturaLayBookmakerId("");
    setCoberturaLayOdd("");
    setCoberturaLayComissao("5");
    setCoberturaBackSaldo(null);
    setCoberturaLaySaldo(null);
    setCoberturaLayStake(null);
    setCoberturaResponsabilidade(null);
    setCoberturaLucroBack(null);
    setCoberturaLucroLay(null);
    setCoberturaLucroGarantido(null);
    setCoberturaTaxaExtracao(null);
    setTipoApostaBack("normal");
    setUsarFreebetBookmaker(false);
    setTipoApostaExchangeBack("normal");
    setGerouFreebet(false);
    setValorFreebetGerada("");
  };

  const fetchBookmakers = async () => {
    try {
      // Fetch bookmakers com informação de saldo disponível e saldo_freebet
      const { data: bookmakersData, error: bkError } = await supabase
        .from("bookmakers")
        .select(`
          id,
          nome,
          parceiro_id,
          saldo_atual,
          saldo_freebet,
          moeda,
          parceiro:parceiros(nome)
        `)
        .eq("projeto_id", projetoId)
        .in("status", ["ATIVO", "LIMITADA", "ativo", "limitada"]);

      if (bkError) throw bkError;

      // Buscar apostas pendentes para calcular saldo disponível
      const bookmakerIds = (bookmakersData || []).map(b => b.id);
      
      let pendingStakes: Record<string, number> = {};
      if (bookmakerIds.length > 0) {
        const { data: pendingBets } = await supabase
          .from("apostas")
          .select("bookmaker_id, stake")
          .in("bookmaker_id", bookmakerIds)
          .eq("status", "PENDENTE");

        pendingStakes = (pendingBets || []).reduce((acc, bet) => {
          acc[bet.bookmaker_id] = (acc[bet.bookmaker_id] || 0) + (bet.stake || 0);
          return acc;
        }, {} as Record<string, number>);
      }

      const formatted = (bookmakersData || []).map((bk: any) => {
        const saldoTotal = bk.saldo_atual || 0;
        const stakeBloqueada = pendingStakes[bk.id] || 0;
        const saldoDisponivel = saldoTotal - stakeBloqueada;
        return {
          id: bk.id,
          nome: bk.nome,
          parceiro_id: bk.parceiro_id,
          saldo_atual: saldoTotal,
          saldo_total: saldoTotal,
          saldo_disponivel: saldoDisponivel,
          saldo_freebet: bk.saldo_freebet || 0,
          moeda: bk.moeda || "BRL",
          parceiro: bk.parceiro
        };
      }).filter(bk => bk.saldo_disponivel > 0 || bk.saldo_freebet > 0 || (aposta && aposta.bookmaker_id === bk.id));

      setBookmakers(formatted);
    } catch (error) {
      console.error("Erro ao buscar bookmakers:", error);
    }
  };

  const calculateLucroPrejuizo = () => {
    const stakeNum = parseFloat(stake) || 0;
    const oddNum = parseFloat(odd) || 0;

    // Cálculo de lucro/prejuízo por tipo de resultado:
    // GREEN: lucro completo = stake * (odd - 1)
    // RED: perda completa = -stake
    // MEIO_GREEN: 50% do lucro potencial = stake * (odd - 1) / 2
    // MEIO_RED: 50% da perda = -stake / 2
    // VOID: 0 (stake devolvida)
    // HALF: (legado) tratado como MEIO_GREEN
    switch (statusResultado) {
      case "GREEN":
        return stakeNum * (oddNum - 1);
      case "RED":
        return -stakeNum;
      case "MEIO_GREEN":
        return stakeNum * (oddNum - 1) / 2;
      case "MEIO_RED":
        return -stakeNum / 2;
      case "VOID":
        return 0;
      case "HALF":
        // Legado: tratar HALF como MEIO_GREEN
        return stakeNum * (oddNum - 1) / 2;
      default:
        return null;
    }
  };

  const calculateValorRetorno = () => {
    const stakeNum = parseFloat(stake) || 0;
    const oddNum = parseFloat(odd) || 0;

    // Cálculo de valor de retorno por tipo de resultado:
    // GREEN: stake * odd (stake + lucro completo)
    // RED: 0 (tudo perdido)
    // MEIO_GREEN: stake + (stake * (odd - 1) / 2)
    // MEIO_RED: stake / 2 (metade da stake devolvida)
    // VOID: stake (stake devolvida integralmente)
    // HALF: (legado) tratado como MEIO_GREEN
    switch (statusResultado) {
      case "GREEN":
        return stakeNum * oddNum;
      case "RED":
        return 0;
      case "MEIO_GREEN":
        return stakeNum + (stakeNum * (oddNum - 1) / 2);
      case "MEIO_RED":
        return stakeNum / 2;
      case "VOID":
        return stakeNum;
      case "HALF":
        // Legado: tratar HALF como MEIO_GREEN
        return stakeNum + (stakeNum * (oddNum - 1) / 2);
      default:
        return null;
    }
  };

  const getSelectedBookmakerMoeda = () => {
    const selected = bookmakers.find(b => b.id === bookmakerId);
    return selected?.moeda || "BRL";
  };

  const formatCurrencyWithSymbol = (value: number, moeda: string) => {
    const symbols: Record<string, string> = {
      BRL: "R$",
      USD: "$",
      EUR: "€",
      GBP: "£"
    };
    return `${symbols[moeda] || moeda} ${value.toFixed(2)}`;
  };

  const handleSave = async () => {
    // Validações básicas comuns a todos os modos
    if (!esporte || !mercado) {
      toast.error("Preencha Esporte e Mercado (obrigatórios)");
      return;
    }
    if (!evento || !selecao) {
      toast.error("Preencha todos os campos obrigatórios (Evento, Seleção)");
      return;
    }

    // Validação específica por modo de entrada
    if (tipoAposta === "bookmaker") {
      // Modo Bookmaker: exige odd, stake e bookmaker
      if (!odd || !stake) {
        toast.error("Preencha Odd e Stake");
        return;
      }
      
      const oddNum = parseFloat(odd);
      if (isNaN(oddNum) || oddNum <= 1) {
        toast.error("Odd deve ser maior que 1.00");
        return;
      }

      const stakeNum = parseFloat(stake);
      if (isNaN(stakeNum) || stakeNum <= 0) {
        toast.error("Stake deve ser maior que 0");
        return;
      }

      if (!bookmakerId) {
        toast.error("Selecione a bookmaker");
        return;
      }

      // Validar stake vs saldo disponível da bookmaker (considerando se usa freebet)
      const selectedBookmaker = bookmakers.find(b => b.id === bookmakerId);
      if (selectedBookmaker) {
        const stakeAnterior = aposta?.status === "PENDENTE" ? aposta.stake : 0;
        
        // Se for usar freebet, validar contra saldo_freebet
        if (usarFreebetBookmaker) {
          if (stakeNum > selectedBookmaker.saldo_freebet) {
            toast.error(`Stake da Freebet (${formatCurrencyWithSymbol(stakeNum, selectedBookmaker.moeda)}) maior que o saldo de Freebet disponível (${formatCurrencyWithSymbol(selectedBookmaker.saldo_freebet, selectedBookmaker.moeda)})`);
            return;
          }
        } else {
          // Aposta normal: validar contra saldo disponível
          const saldoDisponivel = (selectedBookmaker as any).saldo_disponivel ?? selectedBookmaker.saldo_atual;
          const saldoParaValidar = saldoDisponivel + stakeAnterior;
          
          if (stakeNum > saldoParaValidar) {
            const moeda = selectedBookmaker.moeda;
            toast.error(`Stake maior que o saldo disponível (${formatCurrencyWithSymbol(saldoParaValidar, moeda)})`);
            return;
          }
        }
      }
    } else if (tipoAposta === "exchange") {
      // Modo Exchange
      if (tipoOperacaoExchange === "back" || tipoOperacaoExchange === "lay") {
        // Exchange simples (Back ou Lay)
        if (!exchangeBookmakerId || !exchangeOdd || !exchangeStake) {
          toast.error("Preencha todos os campos da Exchange (Exchange, Odd, Stake)");
          return;
        }
        
        const oddNum = parseFloat(exchangeOdd);
        if (isNaN(oddNum) || oddNum <= 1) {
          toast.error("Odd deve ser maior que 1.00");
          return;
        }

        const stakeNum = parseFloat(exchangeStake);
        if (isNaN(stakeNum) || stakeNum <= 0) {
          toast.error("Stake deve ser maior que 0");
          return;
        }

        // Validação para Exchange Back com Freebet
        if (tipoOperacaoExchange === "back" && tipoApostaExchangeBack !== "normal") {
          const selectedBk = bookmakers.find(b => b.id === exchangeBookmakerId);
          if (selectedBk && stakeNum > selectedBk.saldo_freebet) {
            toast.error(`Stake da Freebet (${formatCurrencyWithSymbol(stakeNum, selectedBk.moeda)}) maior que o saldo de Freebet disponível (${formatCurrencyWithSymbol(selectedBk.saldo_freebet, selectedBk.moeda)})`);
            return;
          }
        }

        // Validação para Lay: responsabilidade não pode ser maior que saldo disponível
        if (tipoOperacaoExchange === "lay" && exchangeLiability !== null) {
          const selectedBk = bookmakers.find(b => b.id === exchangeBookmakerId);
          if (selectedBk) {
            const liabilityAnterior = aposta?.status === "PENDENTE" && aposta?.lay_liability ? aposta.lay_liability : 0;
            const saldoDisponivel = selectedBk.saldo_disponivel + liabilityAnterior;
            
            if (exchangeLiability > saldoDisponivel) {
              toast.error(
                `Responsabilidade (${formatCurrencyWithSymbol(exchangeLiability, selectedBk.moeda)}) maior que o saldo disponível (${formatCurrencyWithSymbol(saldoDisponivel, selectedBk.moeda)}). Necessário: ${formatCurrencyWithSymbol(exchangeLiability - saldoDisponivel, selectedBk.moeda)} adicional.`
              );
              return;
            }
          }
        }
      } else if (tipoOperacaoExchange === "cobertura") {
        // Cobertura Lay
        if (!coberturaBackBookmakerId || !coberturaBackOdd || !coberturaBackStake || 
            !coberturaLayBookmakerId || !coberturaLayOdd) {
          toast.error("Preencha todos os campos da Cobertura (Bookmaker, Odd Back, Stake Back, Exchange, Odd Lay)");
          return;
        }

        const backOddNum = parseFloat(coberturaBackOdd);
        if (isNaN(backOddNum) || backOddNum <= 1) {
          toast.error("Odd Back deve ser maior que 1.00");
          return;
        }

        const backStakeNum = parseFloat(coberturaBackStake);
        if (isNaN(backStakeNum) || backStakeNum <= 0) {
          toast.error("Stake Back deve ser maior que 0");
          return;
        }

        const layOddNum = parseFloat(coberturaLayOdd);
        if (isNaN(layOddNum) || layOddNum <= 1) {
          toast.error("Odd Lay deve ser maior que 1.00");
          return;
        }

        // Validação para Cobertura Lay: responsabilidade não pode ser maior que saldo disponível
        if (coberturaResponsabilidade !== null && coberturaLayBookmakerId) {
          const selectedBk = bookmakers.find(b => b.id === coberturaLayBookmakerId);
          if (selectedBk) {
            const liabilityAnterior = aposta?.status === "PENDENTE" && aposta?.lay_liability ? aposta.lay_liability : 0;
            const saldoDisponivel = selectedBk.saldo_disponivel + liabilityAnterior;
            
            if (coberturaResponsabilidade > saldoDisponivel) {
              toast.error(
                `Responsabilidade (${formatCurrencyWithSymbol(coberturaResponsabilidade, selectedBk.moeda)}) maior que o saldo disponível (${formatCurrencyWithSymbol(saldoDisponivel, selectedBk.moeda)}). Necessário: ${formatCurrencyWithSymbol(coberturaResponsabilidade - saldoDisponivel, selectedBk.moeda)} adicional.`
              );
              return;
            }
          }
        }

        // Validação para uso de Freebet: verificar saldo disponível
        if (tipoApostaBack !== "normal" && coberturaBackBookmakerId) {
          const backStakeNum = parseFloat(coberturaBackStake);
          const selectedBk = bookmakers.find(b => b.id === coberturaBackBookmakerId);
          if (selectedBk && backStakeNum > selectedBk.saldo_freebet) {
            toast.error(
              `Stake da Freebet (${formatCurrencyWithSymbol(backStakeNum, selectedBk.moeda)}) maior que o saldo de Freebet disponível (${formatCurrencyWithSymbol(selectedBk.saldo_freebet, selectedBk.moeda)})`
            );
            return;
          }
        }
      }
    }

    try {
      setLoading(true);
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) {
        toast.error("Usuário não autenticado");
        return;
      }

      // Calcular P/L baseado no tipo de operação (separados completamente)
      let lucroPrejuizo: number | null = null;
      let valorRetornoCalculado: number | null = null;
      let apostaData: any;

      // Dados comuns a todos os tipos
      const commonData = {
        user_id: userData.user.id,
        projeto_id: projetoId,
        data_aposta: dataAposta,
        esporte,
        evento,
        mercado: mercado || null,
        selecao: effectiveSelecao,
        status: statusResultado === "PENDENTE" ? "PENDENTE" : "LIQUIDADA",
        resultado: statusResultado === "PENDENTE" ? null : statusResultado,
        observacoes: observacoes || null,
        gerou_freebet: gerouFreebet,
        valor_freebet_gerada: gerouFreebet && valorFreebetGerada ? parseFloat(valorFreebetGerada) : null,
      };

      if (tipoAposta === "bookmaker") {
        // ===== MODO BOOKMAKER =====
        // Usa campos odd, stake, bookmakerId exclusivos desta aba
        const bookmakerOdd = parseFloat(odd);
        const bookmakerStake = parseFloat(stake);
        
        // Calcular P/L para Bookmaker
        // IMPORTANTE: Se usa freebet, o tratamento é diferente:
        // - GREEN: lucro = stake * (odd - 1), mas stake não volta
        // - RED: prejuízo = 0 (freebet já foi consumida)
        if (statusResultado !== "PENDENTE") {
          if (usarFreebetBookmaker) {
            // Aposta com Freebet (tratamento SNR)
            switch (statusResultado) {
              case "GREEN":
                lucroPrejuizo = bookmakerStake * (bookmakerOdd - 1); // Só o lucro
                valorRetornoCalculado = bookmakerStake * (bookmakerOdd - 1); // Stake não volta
                break;
              case "RED":
                lucroPrejuizo = 0; // Freebet já consumida, não é prejuízo real
                valorRetornoCalculado = 0;
                break;
              case "MEIO_GREEN":
                lucroPrejuizo = bookmakerStake * (bookmakerOdd - 1) / 2;
                valorRetornoCalculado = lucroPrejuizo; // Stake não volta
                break;
              case "MEIO_RED":
                lucroPrejuizo = 0; // Freebet, sem prejuízo
                valorRetornoCalculado = 0;
                break;
              case "VOID":
                lucroPrejuizo = 0;
                valorRetornoCalculado = 0; // Freebet devolvida? Depende da casa
                break;
            }
          } else {
            // Aposta normal
            switch (statusResultado) {
              case "GREEN":
                lucroPrejuizo = bookmakerStake * (bookmakerOdd - 1);
                valorRetornoCalculado = bookmakerStake * bookmakerOdd;
                break;
              case "RED":
                lucroPrejuizo = -bookmakerStake;
                valorRetornoCalculado = 0;
                break;
              case "MEIO_GREEN":
                lucroPrejuizo = bookmakerStake * (bookmakerOdd - 1) / 2;
                valorRetornoCalculado = bookmakerStake + lucroPrejuizo;
                break;
              case "MEIO_RED":
                lucroPrejuizo = -bookmakerStake / 2;
                valorRetornoCalculado = bookmakerStake / 2;
                break;
              case "VOID":
                lucroPrejuizo = 0;
                valorRetornoCalculado = bookmakerStake;
                break;
            }
          }
        }

        apostaData = {
          ...commonData,
          bookmaker_id: bookmakerId,
          odd: bookmakerOdd,
          stake: bookmakerStake,
          estrategia: "VALOR",
          modo_entrada: "PADRAO",
          valor_retorno: valorRetornoCalculado,
          lucro_prejuizo: lucroPrejuizo,
          lay_exchange: null,
          lay_odd: null,
          lay_stake: null,
          lay_liability: null,
          lay_comissao: null,
          back_em_exchange: false,
          back_comissao: null,
          tipo_freebet: usarFreebetBookmaker ? "freebet_snr" : null,
        };
      } else if (tipoOperacaoExchange === "cobertura") {
        // ===== MODO COBERTURA LAY =====
        // Usa campos coberturaBack* e coberturaLay* exclusivos
        const backOdd = parseFloat(coberturaBackOdd);
        const backStake = parseFloat(coberturaBackStake);
        const layOdd = parseFloat(coberturaLayOdd);
        const comissao = parseFloat(coberturaLayComissao) / 100;
        
        // Calcular P/L para Cobertura baseado no resultado
        if (statusResultado !== "PENDENTE") {
          const oddLayAjustada = layOdd - comissao;
          let stakeLay: number;
          
          if (tipoApostaBack === "freebet_snr") {
            stakeLay = (backStake * (backOdd - 1)) / oddLayAjustada;
          } else {
            stakeLay = (backStake * backOdd) / oddLayAjustada;
          }
          
          const responsabilidade = stakeLay * (layOdd - 1);
          
          switch (statusResultado) {
            case "GREEN_BOOKMAKER":
              // Back ganhou: recebemos lucro do back, pagamos responsabilidade do lay
              if (tipoApostaBack === "freebet_snr") {
                lucroPrejuizo = (backStake * (backOdd - 1)) - responsabilidade;
                valorRetornoCalculado = backStake * (backOdd - 1); // Só lucro, stake não volta
              } else {
                lucroPrejuizo = (backStake * (backOdd - 1)) - responsabilidade;
                valorRetornoCalculado = backStake * backOdd - responsabilidade;
              }
              break;
            case "RED_BOOKMAKER":
              // Lay ganhou: ganhamos stake do lay menos comissão
              lucroPrejuizo = (stakeLay * (1 - comissao)) - (tipoApostaBack === "freebet_snr" ? 0 : backStake);
              valorRetornoCalculado = stakeLay * (1 - comissao);
              break;
            case "VOID":
              lucroPrejuizo = 0;
              valorRetornoCalculado = tipoApostaBack === "freebet_snr" ? 0 : backStake;
              break;
          }
        }

        apostaData = {
          ...commonData,
          bookmaker_id: coberturaBackBookmakerId,
          odd: backOdd,
          stake: backStake,
          estrategia: "COBERTURA_LAY",
          modo_entrada: "EXCHANGE",
          valor_retorno: valorRetornoCalculado,
          lucro_prejuizo: lucroPrejuizo,
          lay_exchange: coberturaLayBookmakerId,
          lay_odd: layOdd,
          lay_stake: coberturaLayStake,
          lay_liability: coberturaResponsabilidade,
          lay_comissao: parseFloat(coberturaLayComissao),
          back_em_exchange: tipoApostaBack !== "normal",
          back_comissao: null,
          tipo_freebet: tipoApostaBack,
        };
      } else {
        // ===== MODO EXCHANGE (Back ou Lay simples) =====
        // Usa campos exchange* exclusivos
        const isLay = tipoOperacaoExchange === "lay";
        const exchOdd = parseFloat(exchangeOdd);
        const exchStake = parseFloat(exchangeStake);
        const exchComissao = parseFloat(exchangeComissao) / 100;
        
        // Calcular P/L para Exchange
        if (statusResultado !== "PENDENTE") {
          if (isLay) {
            // Lay: se ganhar = stake * (1 - comissão), se perder = -liability
            const liability = exchStake * (exchOdd - 1);
            switch (statusResultado) {
              case "GREEN":
                lucroPrejuizo = exchStake * (1 - exchComissao);
                valorRetornoCalculado = exchStake + lucroPrejuizo;
                break;
              case "RED":
                lucroPrejuizo = -liability;
                valorRetornoCalculado = 0;
                break;
              case "VOID":
                lucroPrejuizo = 0;
                valorRetornoCalculado = 0; // Liability liberada
                break;
            }
          } else {
            // Back: se ganhar = stake * (odd - 1) * (1 - comissão), se perder = -stake
            switch (statusResultado) {
              case "GREEN":
                const lucroBruto = exchStake * (exchOdd - 1);
                lucroPrejuizo = lucroBruto * (1 - exchComissao);
                valorRetornoCalculado = exchStake + lucroPrejuizo;
                break;
              case "RED":
                lucroPrejuizo = -exchStake;
                valorRetornoCalculado = 0;
                break;
              case "VOID":
                lucroPrejuizo = 0;
                valorRetornoCalculado = exchStake;
                break;
            }
          }
        }

        apostaData = {
          ...commonData,
          bookmaker_id: exchangeBookmakerId,
          odd: exchOdd,
          stake: exchStake,
          estrategia: isLay ? "EXCHANGE_LAY" : "EXCHANGE_BACK",
          modo_entrada: "EXCHANGE",
          valor_retorno: valorRetornoCalculado,
          lucro_prejuizo: lucroPrejuizo,
          lay_exchange: null,
          lay_odd: isLay ? exchOdd : null,
          lay_stake: isLay ? exchStake : null,
          lay_liability: isLay ? exchangeLiability : null,
          lay_comissao: parseFloat(exchangeComissao),
          back_em_exchange: true,
          back_comissao: parseFloat(exchangeComissao),
          tipo_freebet: (!isLay && tipoApostaExchangeBack !== "normal") ? tipoApostaExchangeBack : null,
        };
      }

      // Armazenar o resultado anterior se estiver editando (para calcular diferença de saldo)
      // IMPORTANTE: resultado no banco é NULL para PENDENTE, então tratamos null como equivalente a PENDENTE
      const resultadoAnteriorBruto = aposta?.resultado;
      const resultadoAnterior = resultadoAnteriorBruto || null; // Mantém null se era PENDENTE
      const stakeAnterior = aposta?.stake || 0;
      const oddAnterior = aposta?.odd || 0;

      if (aposta) {
        // Verificar se gerouFreebet mudou de false para true na edição
        const gerouFreebetAnterior = aposta.gerou_freebet || false;
        const valorFreebetAnterior = aposta.valor_freebet_gerada || 0;
        
        // O resultado que será salvo no banco
        const novoResultado = statusResultado === "PENDENTE" ? null : statusResultado;
        
        // Para comparação: consideramos null e "PENDENTE" como equivalentes (ambos = pendente)
        const eraPendente = resultadoAnterior === null || resultadoAnterior === "PENDENTE";
        const agoraPendente = novoResultado === null || statusResultado === "PENDENTE";
        
        
        const { error } = await supabase
          .from("apostas")
          .update(apostaData)
          .eq("id", aposta.id);
        if (error) throw error;

        // Atualizar saldo do bookmaker se resultado mudou - para todos os tipos de operação
        const bookmakerIdParaAtualizar = tipoAposta === "bookmaker" 
          ? bookmakerId 
          : tipoOperacaoExchange === "cobertura" 
            ? coberturaBackBookmakerId 
            : exchangeBookmakerId;
            
        if (bookmakerIdParaAtualizar) {
          await atualizarSaldoBookmaker(
            bookmakerIdParaAtualizar,
            resultadoAnterior,
            statusResultado,
            stakeAnterior,
            oddAnterior,
            apostaData.stake,
            apostaData.odd,
            tipoAposta === "exchange" ? tipoOperacaoExchange : "bookmaker",
            apostaData.lay_liability,
            apostaData.lay_comissao,
            // Novos parâmetros para atualização do LAY em cobertura
            tipoOperacaoExchange === "cobertura" ? apostaData.lay_exchange : null,
            tipoOperacaoExchange === "cobertura" ? apostaData.lay_stake : null
          );
        }

        // Verificar se resultado mudou e atualizar status da freebet
        if (gerouFreebetAnterior) {
          // Caso 1: PENDENTE → resultado final (GREEN, RED, MEIO_GREEN, MEIO_RED, VOID)
          if (eraPendente && !agoraPendente) {
            // VOID = não libera, qualquer outro resultado (GREEN, RED, MEIO_GREEN, MEIO_RED) = libera
            if (statusResultado === "VOID") {
              await recusarFreebetPendente(aposta.id);
            } else {
              await liberarFreebetPendente(aposta.id);
            }
          }
          // Caso 2: resultado final → PENDENTE (reversão)
          else if (!eraPendente && agoraPendente) {
            await reverterFreebetParaPendente(aposta.id);
          }
          // Caso 3: resultado final (não-VOID) → VOID
          else if (!eraPendente && resultadoAnterior !== "VOID" && statusResultado === "VOID") {
            // Freebet já estava LIBERADA, precisa reverter para NAO_LIBERADA
            const { data: freebetLiberada } = await supabase
              .from("freebets_recebidas")
              .select("id, bookmaker_id, valor")
              .eq("aposta_id", aposta.id)
              .eq("status", "LIBERADA")
              .maybeSingle();

            if (freebetLiberada) {
              // Decrementar saldo_freebet
              const { data: bookmaker } = await supabase
                .from("bookmakers")
                .select("saldo_freebet")
                .eq("id", freebetLiberada.bookmaker_id)
                .maybeSingle();

              if (bookmaker) {
                const novoSaldoFreebet = Math.max(0, (bookmaker.saldo_freebet || 0) - freebetLiberada.valor);
                await supabase
                  .from("bookmakers")
                  .update({ saldo_freebet: novoSaldoFreebet })
                  .eq("id", freebetLiberada.bookmaker_id);
              }

              // Mudar status para NAO_LIBERADA
              await supabase
                .from("freebets_recebidas")
                .update({ status: "NAO_LIBERADA" })
                .eq("id", freebetLiberada.id);
            }
          }
        }

        // Registrar freebet na edição se foi marcada agora
        const novoValorFreebet = parseFloat(valorFreebetGerada) || 0;
        if (gerouFreebet && novoValorFreebet > 0) {
          if (!gerouFreebetAnterior || valorFreebetAnterior !== novoValorFreebet) {
            // Se era false e agora é true, ou se o valor mudou
            const bookmakerParaFreebet = tipoAposta === "bookmaker" ? bookmakerId : coberturaBackBookmakerId;
            if (bookmakerParaFreebet) {
              // Se já existia valor anterior, precisamos ajustar a diferença
              if (gerouFreebetAnterior && valorFreebetAnterior > 0) {
                // Só ajustar saldo se status for LIBERADA (não ajustar PENDENTE)
                const { data: freebetExistente } = await supabase
                  .from("freebets_recebidas")
                  .select("status")
                  .eq("aposta_id", aposta.id)
                  .maybeSingle();
                
                if (freebetExistente?.status === "LIBERADA") {
                  // Reverter valor anterior
                  const { data: bk } = await supabase
                    .from("bookmakers")
                    .select("saldo_freebet")
                    .eq("id", bookmakerParaFreebet)
                    .maybeSingle();
                  if (bk) {
                    await supabase
                      .from("bookmakers")
                      .update({ saldo_freebet: Math.max(0, (bk.saldo_freebet || 0) - valorFreebetAnterior + novoValorFreebet) })
                      .eq("id", bookmakerParaFreebet);
                  }
                }
                // Atualizar registro existente
                await supabase
                  .from("freebets_recebidas")
                  .update({ valor: novoValorFreebet })
                  .eq("aposta_id", aposta.id);
              } else {
                // Novo registro - passar resultado para determinar status
                await registrarFreebetGerada(bookmakerParaFreebet, novoValorFreebet, userData.user.id, aposta.id, statusResultado);
              }
            }
          }
        } else if (!gerouFreebet && gerouFreebetAnterior && valorFreebetAnterior > 0) {
          // Foi removido: reverter saldo e marcar como não utilizada
          const bookmakerParaFreebet = tipoAposta === "bookmaker" ? bookmakerId : (aposta.bookmaker_id || coberturaBackBookmakerId);
          if (bookmakerParaFreebet) {
            // Só reverter saldo se a freebet estava LIBERADA
            const { data: freebetExistente } = await supabase
              .from("freebets_recebidas")
              .select("status")
              .eq("aposta_id", aposta.id)
              .maybeSingle();
            
            if (freebetExistente?.status === "LIBERADA") {
              const { data: bk } = await supabase
                .from("bookmakers")
                .select("saldo_freebet")
                .eq("id", bookmakerParaFreebet)
                .maybeSingle();
              if (bk) {
                await supabase
                  .from("bookmakers")
                  .update({ saldo_freebet: Math.max(0, (bk.saldo_freebet || 0) - valorFreebetAnterior) })
                  .eq("id", bookmakerParaFreebet);
              }
            }
            // Remover registro de freebet_recebida
            await supabase
              .from("freebets_recebidas")
              .delete()
              .eq("aposta_id", aposta.id);
          }
        }

        toast.success("Aposta atualizada com sucesso!");
      } else {
        // Insert - capturar o ID da aposta inserida
        const { data: insertedData, error } = await supabase
          .from("apostas")
          .insert(apostaData)
          .select("id")
          .single();
        if (error) throw error;

        const novaApostaId = insertedData?.id;

        // Atualizar saldo do bookmaker para nova aposta com resultado definido
        const bookmakerIdParaAtualizar = tipoAposta === "bookmaker" 
          ? bookmakerId 
          : tipoOperacaoExchange === "cobertura" 
            ? coberturaBackBookmakerId 
            : exchangeBookmakerId;
            
        if (bookmakerIdParaAtualizar && statusResultado !== "PENDENTE") {
          await atualizarSaldoBookmaker(
            bookmakerIdParaAtualizar,
            null,
            statusResultado,
            0,
            0,
            apostaData.stake,
            apostaData.odd,
            tipoAposta === "exchange" ? tipoOperacaoExchange : "bookmaker",
            apostaData.lay_liability,
            apostaData.lay_comissao,
            // Novos parâmetros para atualização do LAY em cobertura
            tipoOperacaoExchange === "cobertura" ? apostaData.lay_exchange : null,
            tipoOperacaoExchange === "cobertura" ? apostaData.lay_stake : null
          );
        }

        // Registrar freebet gerada (nova aposta) - passar resultado
        if (gerouFreebet && valorFreebetGerada && parseFloat(valorFreebetGerada) > 0) {
          const bookmakerParaFreebet = tipoAposta === "bookmaker" ? bookmakerId : coberturaBackBookmakerId;
          if (bookmakerParaFreebet && novaApostaId) {
            await registrarFreebetGerada(
              bookmakerParaFreebet, 
              parseFloat(valorFreebetGerada), 
              userData.user.id, 
              novaApostaId,
              statusResultado // Passar resultado para determinar status
            );
          }
        }

        // Debitar freebet se usar em qualquer modo
        // 1. Bookmaker simples com freebet
        if (tipoAposta === "bookmaker" && usarFreebetBookmaker) {
          const stakeNum = parseFloat(stake);
          if (stakeNum > 0 && bookmakerId) {
            await debitarFreebetUsada(bookmakerId, stakeNum);
          }
        }
        
        // 2. Exchange Back com freebet
        if (tipoAposta === "exchange" && tipoOperacaoExchange === "back" && tipoApostaExchangeBack !== "normal") {
          const stakeNum = parseFloat(exchangeStake);
          if (stakeNum > 0 && exchangeBookmakerId) {
            await debitarFreebetUsada(exchangeBookmakerId, stakeNum);
          }
        }
        
        // 3. Cobertura Lay com freebet
        if (tipoAposta === "exchange" && tipoOperacaoExchange === "cobertura" && tipoApostaBack !== "normal") {
          const backStakeNum = parseFloat(coberturaBackStake);
          if (backStakeNum > 0 && coberturaBackBookmakerId) {
            await debitarFreebetUsada(coberturaBackBookmakerId, backStakeNum);
          }
        }

        toast.success("Aposta registrada com sucesso!");
      }

      onSuccess();
      onOpenChange(false);
    } catch (error: any) {
      toast.error("Erro ao salvar aposta: " + error.message);
    } finally {
      setLoading(false);
    }
  };

  // Função para registrar freebet gerada (com apostaId opcional para edição)
  const registrarFreebetGerada = async (
    bookmakerIdFreebet: string, 
    valor: number, 
    userId: string, 
    apostaId?: string,
    resultadoAposta?: string
  ) => {
    try {
      // Determinar o status da freebet baseado no resultado da aposta
      // PENDENTE = aposta ainda não liquidada
      // LIBERADA = aposta GREEN ou RED (freebet disponível - algumas casas dão freebet mesmo em derrota)
      // NAO_LIBERADA = aposta VOID (única circunstância que não libera)
      let status: "PENDENTE" | "LIBERADA" | "NAO_LIBERADA" = "PENDENTE";
      
      if (resultadoAposta && resultadoAposta !== "PENDENTE") {
        // GREEN, RED, MEIO_GREEN, MEIO_RED = libera freebet
        // VOID = não libera
        status = resultadoAposta === "VOID" ? "NAO_LIBERADA" : "LIBERADA";
      }

      // Só incrementar saldo_freebet se a freebet for liberada (GREEN)
      if (status === "LIBERADA") {
        const { data: bookmaker } = await supabase
          .from("bookmakers")
          .select("saldo_freebet")
          .eq("id", bookmakerIdFreebet)
          .maybeSingle();

        if (bookmaker) {
          const novoSaldoFreebet = (bookmaker.saldo_freebet || 0) + valor;
          await supabase
            .from("bookmakers")
            .update({ saldo_freebet: novoSaldoFreebet })
            .eq("id", bookmakerIdFreebet);
        }
      }

      // Registrar na tabela freebets_recebidas com status apropriado
      await supabase
        .from("freebets_recebidas")
        .insert({
          user_id: userId,
          projeto_id: projetoId,
          bookmaker_id: bookmakerIdFreebet,
          valor: valor,
          motivo: "Aposta qualificadora",
          data_recebida: new Date().toISOString(),
          utilizada: false,
          aposta_id: apostaId || null,
          status: status,
        });
    } catch (error) {
      console.error("Erro ao registrar freebet gerada:", error);
    }
  };

  // Função para liberar freebet pendente quando aposta é liquidada (GREEN, RED, MEIO_GREEN, MEIO_RED)
  const liberarFreebetPendente = async (apostaId: string) => {
    try {
      // Buscar freebet pendente associada a esta aposta
      const { data: freebetPendente } = await supabase
        .from("freebets_recebidas")
        .select("id, bookmaker_id, valor")
        .eq("aposta_id", apostaId)
        .eq("status", "PENDENTE")
        .maybeSingle();

      if (freebetPendente) {
        // Atualizar status para LIBERADA
        await supabase
          .from("freebets_recebidas")
          .update({ status: "LIBERADA" })
          .eq("id", freebetPendente.id);

        // Incrementar saldo_freebet do bookmaker
        const { data: bookmaker } = await supabase
          .from("bookmakers")
          .select("saldo_freebet")
          .eq("id", freebetPendente.bookmaker_id)
          .maybeSingle();

        if (bookmaker) {
          const novoSaldoFreebet = (bookmaker.saldo_freebet || 0) + freebetPendente.valor;
          await supabase
            .from("bookmakers")
            .update({ saldo_freebet: novoSaldoFreebet })
            .eq("id", freebetPendente.bookmaker_id);
        }
      }
    } catch (error) {
      console.error("Erro ao liberar freebet pendente:", error);
    }
  };

  // Função para recusar freebet quando aposta muda para VOID (única circunstância que não libera)
  const recusarFreebetPendente = async (apostaId: string) => {
    try {
      await supabase
        .from("freebets_recebidas")
        .update({ status: "NAO_LIBERADA" })
        .eq("aposta_id", apostaId)
        .eq("status", "PENDENTE");
    } catch (error) {
      console.error("Erro ao recusar freebet pendente:", error);
    }
  };

  // Função para reverter freebet LIBERADA de volta para PENDENTE quando aposta volta para PENDENTE
  const reverterFreebetParaPendente = async (apostaId: string) => {
    try {
      // Buscar freebet LIBERADA associada a esta aposta
      const { data: freebetLiberada } = await supabase
        .from("freebets_recebidas")
        .select("id, bookmaker_id, valor")
        .eq("aposta_id", apostaId)
        .eq("status", "LIBERADA")
        .maybeSingle();

      if (freebetLiberada) {
        // Decrementar saldo_freebet do bookmaker (reverter o crédito)
        const { data: bookmaker } = await supabase
          .from("bookmakers")
          .select("saldo_freebet")
          .eq("id", freebetLiberada.bookmaker_id)
          .maybeSingle();

        if (bookmaker) {
          const novoSaldoFreebet = Math.max(0, (bookmaker.saldo_freebet || 0) - freebetLiberada.valor);
          await supabase
            .from("bookmakers")
            .update({ saldo_freebet: novoSaldoFreebet })
            .eq("id", freebetLiberada.bookmaker_id);
        }

        // Voltar status para PENDENTE
        await supabase
          .from("freebets_recebidas")
          .update({ status: "PENDENTE" })
          .eq("id", freebetLiberada.id);
      }
    } catch (error) {
      console.error("Erro ao reverter freebet para pendente:", error);
    }
  };

  // Função para debitar freebet usada e marcar como utilizada na tabela freebets_recebidas
  const debitarFreebetUsada = async (bookmakerIdFreebet: string, valor: number, apostaId?: string) => {
    try {
      // 1. Debitar saldo_freebet do bookmaker
      const { data: bookmaker } = await supabase
        .from("bookmakers")
        .select("saldo_freebet")
        .eq("id", bookmakerIdFreebet)
        .maybeSingle();

      if (bookmaker) {
        const novoSaldoFreebet = Math.max(0, (bookmaker.saldo_freebet || 0) - valor);
        await supabase
          .from("bookmakers")
          .update({ saldo_freebet: novoSaldoFreebet })
          .eq("id", bookmakerIdFreebet);
      }

      // 2. Buscar freebet disponível para marcar como usada
      const { data: freebetsDisponiveis } = await supabase
        .from("freebets_recebidas")
        .select("id, valor")
        .eq("bookmaker_id", bookmakerIdFreebet)
        .eq("utilizada", false)
        .eq("projeto_id", projetoId)
        .order("valor", { ascending: false });

      if (freebetsDisponiveis && freebetsDisponiveis.length > 0) {
        // Encontrar a freebet mais adequada (valor igual ou maior)
        const freebetParaUsar = freebetsDisponiveis.find(fb => fb.valor >= valor) 
          || freebetsDisponiveis[0];
        
        // 3. Marcar como utilizada
        await supabase
          .from("freebets_recebidas")
          .update({
            utilizada: true,
            data_utilizacao: new Date().toISOString(),
            aposta_id: apostaId || null
          })
          .eq("id", freebetParaUsar.id);
      }
    } catch (error) {
      console.error("Erro ao debitar freebet usada:", error);
    }
  };

  const atualizarSaldoBookmaker = async (
    bookmakerIdToUpdate: string,
    resultadoAnterior: string | null,
    resultadoNovo: string,
    stakeAnterior: number,
    oddAnterior: number,
    stakeNovo: number,
    oddNovo: number,
    tipoOperacao: "bookmaker" | "back" | "lay" | "cobertura" = "bookmaker",
    layLiability: number | null = null,
    layComissao: number | null = null,
    layExchangeId: string | null = null,
    layStakeValue: number | null = null
  ) => {
    try {
      // Sistema de dois saldos:
      // - saldo_total (saldo_atual no banco) = dinheiro real na conta
      // - saldo_disponivel = saldo_total - stakes bloqueadas (apostas pendentes)
      //
      // Tipos de resultado e seus cálculos variam por tipo de operação

      const calcularAjusteSaldo = (
        resultado: string, 
        stakeVal: number, 
        oddVal: number,
        opType: string,
        liability: number | null,
        comissaoPercent: number
      ): number => {
        const comissao = comissaoPercent / 100;
        
        // Para operações Lay
        if (opType === "lay") {
          const liabilityVal = liability || stakeVal * (oddVal - 1);
          switch (resultado) {
            case "GREEN": // Lay ganhou
              return stakeVal * (1 - comissao);
            case "RED": // Lay perdeu
              return -liabilityVal;
            case "VOID":
              return 0;
            default:
              return 0;
          }
        }
        
        // Para Cobertura
        if (opType === "cobertura") {
          switch (resultado) {
            case "GREEN_BOOKMAKER": // Back ganhou
              return stakeVal * (oddVal - 1);
            case "RED_BOOKMAKER": // Back perdeu
              return -stakeVal;
            case "VOID":
              return 0;
            default:
              return 0;
          }
        }
        
        // Para Exchange Back
        if (opType === "back") {
          const lucroBruto = stakeVal * (oddVal - 1);
          switch (resultado) {
            case "GREEN":
              return lucroBruto * (1 - comissao);
            case "RED":
              return -stakeVal;
            case "VOID":
              return 0;
            default:
              return 0;
          }
        }
        
        // Para Bookmaker (com meio resultados)
        switch (resultado) {
          case "GREEN":
            return stakeVal * (oddVal - 1);
          case "RED":
            return -stakeVal;
          case "MEIO_GREEN":
          case "HALF":
            return stakeVal * ((oddVal - 1) / 2);
          case "MEIO_RED":
            return -stakeVal / 2;
          case "VOID":
            return 0;
          default:
            return 0;
        }
      };

      // Função para calcular ajuste do lado LAY em cobertura
      const calcularAjusteSaldoLay = (
        resultado: string,
        layStake: number,
        liability: number,
        comissaoPercent: number
      ): number => {
        const comissao = comissaoPercent / 100;
        switch (resultado) {
          case "GREEN_BOOKMAKER": // Back ganhou = LAY perdeu
            return -liability;
          case "RED_BOOKMAKER": // Back perdeu = LAY ganhou
            return layStake * (1 - comissao);
          case "VOID":
            return 0;
          default:
            return 0;
        }
      };

      let saldoAjuste = 0;
      let saldoAjusteLay = 0;
      const comissaoVal = layComissao ?? 5;

      // Reverter efeito do resultado anterior (BACK side)
      if (resultadoAnterior && resultadoAnterior !== "PENDENTE") {
        saldoAjuste -= calcularAjusteSaldo(
          resultadoAnterior, 
          stakeAnterior, 
          oddAnterior, 
          tipoOperacao,
          layLiability,
          comissaoVal
        );
        
        // Reverter efeito anterior do LAY side em cobertura
        if (tipoOperacao === "cobertura" && layExchangeId && layStakeValue !== null && layLiability !== null) {
          saldoAjusteLay -= calcularAjusteSaldoLay(
            resultadoAnterior,
            layStakeValue,
            layLiability,
            comissaoVal
          );
        }
      }

      // Aplicar efeito do novo resultado (BACK side)
      if (resultadoNovo && resultadoNovo !== "PENDENTE") {
        saldoAjuste += calcularAjusteSaldo(
          resultadoNovo, 
          stakeNovo, 
          oddNovo, 
          tipoOperacao,
          layLiability,
          comissaoVal
        );
        
        // Aplicar efeito do LAY side em cobertura
        if (tipoOperacao === "cobertura" && layExchangeId && layStakeValue !== null && layLiability !== null) {
          saldoAjusteLay += calcularAjusteSaldoLay(
            resultadoNovo,
            layStakeValue,
            layLiability,
            comissaoVal
          );
        }
      }

      // Atualizar saldo do BACK bookmaker
      if (saldoAjuste !== 0) {
        const { data: bookmaker } = await supabase
          .from("bookmakers")
          .select("saldo_atual")
          .eq("id", bookmakerIdToUpdate)
          .maybeSingle();

        if (bookmaker) {
          const novoSaldo = Math.max(0, bookmaker.saldo_atual + saldoAjuste);
          await supabase
            .from("bookmakers")
            .update({ saldo_atual: novoSaldo })
            .eq("id", bookmakerIdToUpdate);
        }
      }

      // Atualizar saldo do LAY bookmaker (para cobertura)
      if (tipoOperacao === "cobertura" && layExchangeId && saldoAjusteLay !== 0) {
        // Caso especial: mesma bookmaker para BACK e LAY
        if (layExchangeId === bookmakerIdToUpdate) {
          // Já foi atualizado acima, precisamos adicionar o ajuste LAY
          const { data: bookmaker } = await supabase
            .from("bookmakers")
            .select("saldo_atual")
            .eq("id", layExchangeId)
            .maybeSingle();

          if (bookmaker) {
            const novoSaldo = Math.max(0, bookmaker.saldo_atual + saldoAjusteLay);
            await supabase
              .from("bookmakers")
              .update({ saldo_atual: novoSaldo })
              .eq("id", layExchangeId);
          }
        } else {
          // Bookmakers diferentes: atualizar LAY separadamente
          const { data: layBookmaker } = await supabase
            .from("bookmakers")
            .select("saldo_atual")
            .eq("id", layExchangeId)
            .maybeSingle();

          if (layBookmaker) {
            const novoSaldoLay = Math.max(0, layBookmaker.saldo_atual + saldoAjusteLay);
            await supabase
              .from("bookmakers")
              .update({ saldo_atual: novoSaldoLay })
              .eq("id", layExchangeId);
          }
        }
      }
    } catch (error) {
      console.error("Erro ao atualizar saldo do bookmaker:", error);
    }
  };

  const handleDelete = async () => {
    if (!aposta) return;
    
    try {
      setLoading(true);
      
      // Determinar tipo de operação e bookmaker
      const tipoOperacao = aposta.modo_entrada === "EXCHANGE" || aposta.back_em_exchange
        ? (aposta.estrategia === "COBERTURA_LAY" ? "cobertura" : (aposta.estrategia === "EXCHANGE_LAY" ? "lay" : "back"))
        : "bookmaker";
      
      // Reverter o saldo se a aposta tinha resultado definido
      if (aposta.resultado && aposta.resultado !== "PENDENTE") {
        await atualizarSaldoBookmaker(
          aposta.bookmaker_id,
          aposta.resultado,
          "PENDENTE", // Reverter para pendente = nenhum efeito
          aposta.stake,
          aposta.odd,
          0,
          0,
          tipoOperacao as any,
          aposta.lay_liability || null,
          aposta.lay_comissao || null,
          // Novos parâmetros para atualização do LAY em cobertura
          tipoOperacao === "cobertura" ? aposta.lay_exchange || null : null,
          tipoOperacao === "cobertura" ? aposta.lay_stake || null : null
        );
      }
      
      const { error } = await supabase
        .from("apostas")
        .delete()
        .eq("id", aposta.id);

      if (error) throw error;
      toast.success("Aposta excluída com sucesso!");
      onSuccess();
      onOpenChange(false);
    } catch (error: any) {
      toast.error("Erro ao excluir aposta: " + error.message);
    } finally {
      setLoading(false);
      setDeleteDialogOpen(false);
    }
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(value);
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader className="pb-2">
            <DialogTitle className="text-sm font-medium text-muted-foreground uppercase tracking-widest">
              {aposta ? "Editar Aposta" : "Registrar Aposta"}
            </DialogTitle>
          </DialogHeader>

          <div className="grid gap-5 py-2">
            {/* Linha 1: Mandante x Visitante + Data/Hora */}
            <div className="grid grid-cols-[1fr_auto_1fr_auto] gap-3 items-end">
              <div className="space-y-1.5">
                <Label className="block text-center uppercase text-[10px] tracking-wider text-muted-foreground">Mandante</Label>
                <Input
                  value={mandante}
                  onChange={(e) => setMandante(e.target.value.toUpperCase())}
                  placeholder="REAL MADRID"
                  className="uppercase text-center h-10"
                />
              </div>
              <div className="flex items-center justify-center pb-1">
                <span className="text-lg font-bold text-muted-foreground/60">×</span>
              </div>
              <div className="space-y-1.5">
                <Label className="block text-center uppercase text-[10px] tracking-wider text-muted-foreground">Visitante</Label>
                <Input
                  value={visitante}
                  onChange={(e) => setVisitante(e.target.value.toUpperCase())}
                  placeholder="BARCELONA"
                  className="uppercase text-center h-10"
                />
              </div>
              <div className="space-y-1.5 min-w-[180px]">
                <Label className="block text-center uppercase text-[10px] tracking-wider text-muted-foreground">Data/Hora</Label>
                <DateTimePicker
                  value={dataAposta}
                  onChange={setDataAposta}
                  placeholder="Selecione"
                />
              </div>
            </div>

            {/* Linha 2: Esporte, Mercado, Seleção */}
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-1.5">
                <Label className="block text-center uppercase text-[10px] tracking-wider text-muted-foreground">Esporte</Label>
                <Select value={esporte} onValueChange={(val) => {
                  setEsporte(val);
                  incrementSportUsage(val);
                }}>
                  <SelectTrigger className="h-10">
                    <SelectValue placeholder="Selecione" />
                  </SelectTrigger>
                  <SelectContent>
                    {getSortedEsportes().map((esp) => (
                      <SelectItem key={esp} value={esp}>{esp}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="block text-center uppercase text-[10px] tracking-wider text-muted-foreground">Mercado</Label>
                <Select value={mercado} onValueChange={(val) => {
                  setMercado(val);
                  setSelecao("");
                }} disabled={!esporte}>
                  <SelectTrigger className="h-10">
                    <SelectValue placeholder={esporte ? "Selecione" : "Esporte primeiro"} />
                  </SelectTrigger>
                  <SelectContent>
                    {mercadosDisponiveis.map((m) => (
                      <SelectItem key={m} value={m}>{m}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {/* Seleção - Moneyline usa select, outros usam texto livre */}
              <div className="space-y-1.5">
                <Label className="block text-center uppercase text-[10px] tracking-wider text-muted-foreground">
                  Seleção *
                </Label>
                {isMoneyline ? (
                  <Select value={selecao} onValueChange={setSelecao}>
                    <SelectTrigger className="h-10">
                      <SelectValue placeholder="Selecione" />
                    </SelectTrigger>
                    <SelectContent>
                      {moneylineOptions.map((opt) => (
                        <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <Input
                    value={selecao}
                    onChange={(e) => setSelecao(e.target.value)}
                    placeholder="Ex: Real Madrid -1.5, Over 2.5, Mapa 1 Team A"
                    className="h-10"
                  />
                )}
              </div>
            </div>

            {/* Abas: Bookmaker vs Exchange */}
            <Tabs value={tipoAposta} onValueChange={(v) => setTipoAposta(v as "bookmaker" | "exchange")} className="w-full">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="bookmaker">Bookmaker</TabsTrigger>
                <TabsTrigger value="exchange">Exchange</TabsTrigger>
              </TabsList>

              {/* Aba Bookmaker */}
              <TabsContent value="bookmaker" className="space-y-4 mt-4">
                <div className="grid grid-cols-4 gap-3">
                  <div className="space-y-2">
                    <Label className="block text-center uppercase text-xs tracking-wider">Bookmaker *</Label>
                    <Select 
                      value={bookmakerId} 
                      onValueChange={(val) => {
                        setBookmakerId(val);
                        const selectedBk = bookmakers.find(b => b.id === val);
                        if (selectedBk) {
                          setBookmakerSaldo({ saldo: selectedBk.saldo_total, saldoDisponivel: selectedBk.saldo_disponivel, saldoFreebet: selectedBk.saldo_freebet, moeda: selectedBk.moeda });
                        } else {
                          setBookmakerSaldo(null);
                        }
                      }}
                    >
                      <SelectTrigger className="w-full">
                        <div className="flex items-center gap-2 min-w-0 flex-1 overflow-hidden">
                          <span className="truncate" title={(() => {
                            const selectedBk = bookmakers.find(b => b.id === bookmakerId);
                            if (selectedBk) {
                              return `${selectedBk.nome} • ${selectedBk.parceiro?.nome || ""}`;
                            }
                            return "";
                          })()}>
                            {bookmakerId ? (() => {
                              const selectedBk = bookmakers.find(b => b.id === bookmakerId);
                              if (selectedBk) {
                                return `${selectedBk.nome} • ${selectedBk.parceiro?.nome || ""}`;
                              }
                              return "Selecione";
                            })() : "Selecione"}
                          </span>
                        </div>
                      </SelectTrigger>
                      <SelectContent className="max-w-[400px]">
                        {bookmakers.length === 0 ? (
                          <div className="p-3 text-center text-sm text-muted-foreground">
                            Nenhuma bookmaker com saldo disponível
                          </div>
                        ) : (
                          bookmakers.map((bk) => {
                            const displayName = `${bk.nome} • ${bk.parceiro?.nome || ""}`;
                            return (
                              <SelectItem key={bk.id} value={bk.id} className="max-w-full">
                                <div className="flex items-center justify-between w-full gap-2 min-w-0">
                                  <span className="truncate min-w-0 flex-1" title={displayName}>
                                    {displayName}
                                  </span>
                                  <span className="text-xs text-muted-foreground flex-shrink-0">
                                    Disp: {formatCurrencyWithSymbol(bk.saldo_disponivel, bk.moeda)}
                                  </span>
                                </div>
                              </SelectItem>
                            );
                          })
                        )}
                      </SelectContent>
                    </Select>
                    {bookmakerSaldo && (
                      <div className="text-xs text-center space-y-0.5">
                        <p className="text-muted-foreground">
                          Saldo: <span className="text-emerald-500 font-medium">{formatCurrencyWithSymbol(bookmakerSaldo.saldo, bookmakerSaldo.moeda)}</span>
                        </p>
                        <p className="text-muted-foreground">
                          <Gift className="h-3 w-3 inline mr-0.5 text-amber-400" />
                          Freebet: <span className={`font-medium ${bookmakerSaldo.saldoFreebet > 0 ? 'text-amber-400' : 'text-muted-foreground'}`}>
                            {formatCurrencyWithSymbol(bookmakerSaldo.saldoFreebet, bookmakerSaldo.moeda)}
                          </span>
                        </p>
                      </div>
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label className="block text-center uppercase text-xs tracking-wider">Odd *</Label>
                    <Input
                      type="number"
                      step="0.01"
                      min="1.01"
                      value={odd}
                      onChange={(e) => {
                        const val = e.target.value;
                        // Allow typing but validate on blur
                        setOdd(val);
                      }}
                      onBlur={(e) => {
                        const val = parseFloat(e.target.value);
                        if (!isNaN(val) && val < 1.01) {
                          setOdd("1.01");
                        }
                      }}
                      placeholder="1.85"
                      className={`text-center ${parseFloat(odd) <= 1 && odd !== "" ? "border-destructive" : ""}`}
                    />
                    {parseFloat(odd) <= 1 && odd !== "" && (
                      <p className="text-xs text-destructive mt-1">Odd deve ser &gt; 1.00</p>
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label className="block text-center uppercase text-xs tracking-wider">Stake ({getSelectedBookmakerMoeda()}) *</Label>
                    <Input
                      type="number"
                      step="0.01"
                      min="0.01"
                      value={stake}
                      onChange={(e) => {
                        const val = e.target.value;
                        // Block negative values
                        if (parseFloat(val) < 0) return;
                        setStake(val);
                      }}
                      placeholder="100.00"
                      className={`text-center ${(() => {
                        const selectedBk = bookmakers.find(b => b.id === bookmakerId);
                        const stakeNum = parseFloat(stake);
                        if (selectedBk && !isNaN(stakeNum) && stakeNum > selectedBk.saldo_disponivel) {
                          return "border-destructive focus-visible:ring-destructive";
                        }
                        return "";
                      })()}`}
                    />
                    {(() => {
                      const selectedBk = bookmakers.find(b => b.id === bookmakerId);
                      const stakeNum = parseFloat(stake);
                      if (selectedBk && !isNaN(stakeNum) && stakeNum > selectedBk.saldo_disponivel) {
                        return (
                          <p className="text-xs text-destructive mt-1">
                            Disponível: {formatCurrencyWithSymbol(selectedBk.saldo_disponivel, selectedBk.moeda)}
                          </p>
                        );
                      }
                      return null;
                    })()}
                  </div>
                  <div className="space-y-2">
                    <Label className="block text-center uppercase text-xs tracking-wider">Retorno</Label>
                    <div className="h-9 flex items-center justify-center rounded-md border border-input bg-muted/50 px-3 text-sm font-medium text-emerald-500">
                      {(() => {
                        const oddNum = parseFloat(odd);
                        const stakeNum = parseFloat(stake);
                        const moeda = getSelectedBookmakerMoeda();
                        if (!isNaN(oddNum) && !isNaN(stakeNum) && oddNum > 0 && stakeNum > 0) {
                          const retorno = oddNum * stakeNum;
                          return formatCurrencyWithSymbol(retorno, moeda);
                        }
                        return formatCurrencyWithSymbol(0, moeda);
                      })()}
                    </div>
                  </div>
                </div>
                
                {/* Toggle "Usar Freebet nesta aposta?" (apenas se bookmaker tem saldo_freebet > 0 e NÃO for aposta que gerou freebet) */}
                {bookmakerSaldo && bookmakerSaldo.saldoFreebet > 0 && !aposta?.gerou_freebet && (
                  <div className="p-3 rounded-lg border border-amber-500/30 bg-amber-500/5 space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Gift className="h-4 w-4 text-amber-400" />
                        <Label className="text-sm font-medium text-amber-400">Usar Freebet nesta aposta?</Label>
                      </div>
                      <Switch
                        checked={usarFreebetBookmaker}
                        onCheckedChange={(checked) => {
                          setUsarFreebetBookmaker(checked);
                          // Quando ativar, preencher stake com valor da freebet disponível
                          if (checked && bookmakerSaldo.saldoFreebet > 0) {
                            setStake(bookmakerSaldo.saldoFreebet.toString());
                          }
                          // Quando ativar usar freebet, desativar "gerou freebet"
                          if (checked) {
                            setGerouFreebet(false);
                            setValorFreebetGerada("");
                          }
                        }}
                        disabled={!!aposta?.tipo_freebet}
                      />
                    </div>
                    {usarFreebetBookmaker && (
                      <div className="space-y-1">
                        <p className="text-xs text-amber-400">
                          <Gift className="h-3 w-3 inline mr-1" />
                          Stake será debitada do saldo de Freebet ({formatCurrencyWithSymbol(bookmakerSaldo.saldoFreebet, bookmakerSaldo.moeda)} disponível)
                        </p>
                        <p className="text-[10px] text-muted-foreground">
                          • Se perder: não conta como prejuízo (freebet já foi consumida)
                        </p>
                        <p className="text-[10px] text-muted-foreground">
                          • Se ganhar: apenas o lucro entra como ganho real (stake não volta)
                        </p>
                      </div>
                    )}
                    {aposta?.tipo_freebet && (
                      <p className="text-[10px] text-muted-foreground italic">
                        Esta aposta foi feita com Freebet e não pode ser alterada.
                      </p>
                    )}
                  </div>
                )}

              </TabsContent>

              {/* Aba Exchange - 3 tipos de operação */}
              <TabsContent value="exchange" className="space-y-4 mt-4">
                {/* Seletor de tipo de operação com ícone de ajuda */}
                <div className="space-y-2">
                  <div className="flex items-center justify-center gap-2">
                    <Label className="block text-center uppercase text-xs tracking-wider">Tipo de Operação</Label>
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button type="button" className="text-muted-foreground hover:text-foreground transition-colors">
                            <HelpCircle className="h-4 w-4" />
                          </button>
                        </TooltipTrigger>
                        <TooltipContent side="right" className="max-w-[320px] p-4 space-y-3">
                          <div>
                            <p className="font-semibold text-emerald-400">📗 BACK (a favor)</p>
                            <p className="text-xs text-muted-foreground mt-1">
                              Aposta em um resultado acontecer diretamente em uma exchange. 
                              O lucro vem se o resultado ocorrer.
                            </p>
                          </div>
                          <div>
                            <p className="font-semibold text-rose-400">📕 LAY (contra)</p>
                            <p className="text-xs text-muted-foreground mt-1">
                              Aposta contra um resultado acontecer. Você assume o papel da 
                              "casa" e paga se o resultado ocorrer.
                            </p>
                          </div>
                          <div>
                            <p className="font-semibold text-purple-400">🛡️ COBERTURA LAY</p>
                            <p className="text-xs text-muted-foreground mt-1">
                              Protege uma aposta em bookmaker usando Lay na exchange. Ideal para:
                            </p>
                            <ul className="text-xs text-muted-foreground mt-1 list-disc list-inside">
                              <li>Extrair valor de bônus de boas-vindas</li>
                              <li>Matched Betting (lucro garantido)</li>
                              <li>Garantir lucro em Free Bets</li>
                            </ul>
                          </div>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </div>
                  <div className="flex justify-center gap-2">
                    <button
                      type="button"
                      onClick={() => setTipoOperacaoExchange("back")}
                      className={`flex-1 max-w-[140px] px-3 py-2.5 rounded-lg border-2 transition-all ${
                        tipoOperacaoExchange === "back"
                          ? "border-emerald-500 bg-emerald-500/10 text-emerald-400"
                          : "border-border/50 bg-muted/30 text-muted-foreground hover:bg-muted/50"
                      }`}
                    >
                      <div className="font-semibold text-sm">BACK</div>
                      <div className="text-[10px] opacity-70">(a favor)</div>
                    </button>
                    <button
                      type="button"
                      onClick={() => setTipoOperacaoExchange("lay")}
                      className={`flex-1 max-w-[140px] px-3 py-2.5 rounded-lg border-2 transition-all ${
                        tipoOperacaoExchange === "lay"
                          ? "border-rose-500 bg-rose-500/10 text-rose-400"
                          : "border-border/50 bg-muted/30 text-muted-foreground hover:bg-muted/50"
                      }`}
                    >
                      <div className="font-semibold text-sm">LAY</div>
                      <div className="text-[10px] opacity-70">(contra)</div>
                    </button>
                    <button
                      type="button"
                      onClick={() => setTipoOperacaoExchange("cobertura")}
                      className={`flex-1 max-w-[180px] px-3 py-2.5 rounded-lg border-2 transition-all ${
                        tipoOperacaoExchange === "cobertura"
                          ? "border-purple-500 bg-purple-500/10 text-purple-400"
                          : "border-border/50 bg-muted/30 text-muted-foreground hover:bg-muted/50"
                      }`}
                    >
                      <div className="font-semibold text-sm">COBERTURA</div>
                      <div className="text-[10px] opacity-70">(Back + Lay)</div>
                    </button>
                  </div>
                </div>

                {/* Campos para Back ou Lay simples */}
                {(tipoOperacaoExchange === "back" || tipoOperacaoExchange === "lay") && (
                  <div className={`p-4 rounded-lg border ${
                    tipoOperacaoExchange === "back" 
                      ? "border-emerald-500/30 bg-emerald-500/5" 
                      : "border-rose-500/30 bg-rose-500/5"
                  }`}>
                    <div className="grid grid-cols-4 gap-3">
                      <div className="space-y-1">
                        <Label className="block text-center uppercase text-xs tracking-wider">Casa *</Label>
                        <Select value={exchangeBookmakerId} onValueChange={setExchangeBookmakerId}>
                          <SelectTrigger className="w-full">
                            <div className="flex items-center gap-2 min-w-0 flex-1 overflow-hidden">
                              <span className="truncate">
                                {exchangeBookmakerId ? (() => {
                                  const selectedBk = bookmakers.find(b => b.id === exchangeBookmakerId);
                                  return selectedBk ? selectedBk.nome : "Selecione";
                                })() : "Selecione"}
                              </span>
                            </div>
                          </SelectTrigger>
                          <SelectContent className="max-w-[400px]">
                            {bookmakers.length === 0 ? (
                              <div className="p-3 text-center text-sm text-muted-foreground">
                                Nenhuma bookmaker disponível
                              </div>
                            ) : (
                              bookmakers.map((bk) => (
                                <SelectItem key={bk.id} value={bk.id}>
                                  <div className="flex items-center justify-between w-full gap-2 min-w-0">
                                    <span className="truncate min-w-0 flex-1">
                                      {bk.nome} • {bk.parceiro?.nome || ""}
                                    </span>
                                  </div>
                                </SelectItem>
                              ))
                            )}
                          </SelectContent>
                        </Select>
                        {exchangeBookmakerSaldo && (
                          <div className="text-center text-xs text-muted-foreground space-y-0.5">
                            <div>
                              Saldo: <span className={`font-medium ${tipoOperacaoExchange === "back" ? "text-emerald-400" : "text-rose-400"}`}>
                                {exchangeBookmakerSaldo.moeda} {exchangeBookmakerSaldo.saldo.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                              </span>
                              {exchangeBookmakerSaldo.saldoDisponivel !== exchangeBookmakerSaldo.saldo && (
                                <span className="text-amber-400 ml-1">
                                  (Livre: {exchangeBookmakerSaldo.moeda} {exchangeBookmakerSaldo.saldoDisponivel.toLocaleString('pt-BR', { minimumFractionDigits: 2 })})
                                </span>
                              )}
                            </div>
                            {exchangeBookmakerSaldo.saldoFreebet > 0 && (
                              <div className="text-amber-400">
                                <Gift className="h-3 w-3 inline mr-0.5" />
                                Freebet: <span className="font-medium">{exchangeBookmakerSaldo.moeda} {exchangeBookmakerSaldo.saldoFreebet.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                      <div className="space-y-2">
                        <Label className="block text-center uppercase text-xs tracking-wider">
                          Odd {tipoOperacaoExchange === "back" ? "Back" : "Lay"} *
                        </Label>
                        <Input
                          type="number"
                          step="0.01"
                          min="1.01"
                          value={exchangeOdd}
                          onChange={(e) => setExchangeOdd(e.target.value)}
                          placeholder="Ex: 2.10"
                          className="text-center"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label className="block text-center uppercase text-xs tracking-wider">
                          {tipoOperacaoExchange === "back" ? "Stake" : "Stake Lay"} *
                        </Label>
                        <Input
                          type="number"
                          step="0.01"
                          min="0.01"
                          value={exchangeStake}
                          onChange={(e) => setExchangeStake(e.target.value)}
                          placeholder="Ex: 100.00"
                          className="text-center"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label className="block text-center uppercase text-xs tracking-wider">Comissão %</Label>
                        <Input
                          type="number"
                          step="0.1"
                          value={exchangeComissao}
                          onChange={(e) => setExchangeComissao(e.target.value)}
                          placeholder="5"
                          className="text-center"
                        />
                      </div>
                    </div>

                    {/* Resultados calculados */}
                    <div className={`mt-4 p-3 rounded-lg border ${
                      tipoOperacaoExchange === "back"
                        ? "border-emerald-500/20 bg-emerald-500/5"
                        : "border-rose-500/20 bg-rose-500/5"
                    }`}>
                      {tipoOperacaoExchange === "back" ? (
                        <div className="space-y-2">
                          <div className="flex justify-between items-center text-sm">
                            <span className="text-muted-foreground flex items-center gap-1.5">
                              <Coins className="h-3.5 w-3.5 text-emerald-500" />
                              Lucro Potencial (líquido):
                            </span>
                            <span className="font-medium text-emerald-500">
                              {exchangeLucroPotencial !== null ? formatCurrency(exchangeLucroPotencial) : "-"}
                            </span>
                          </div>
                          <div className="flex justify-between items-center text-sm">
                            <span className="text-muted-foreground flex items-center gap-1.5">
                              <TrendingUp className="h-3.5 w-3.5 text-emerald-500" />
                              Retorno Total (se ganhar):
                            </span>
                            <span className="font-medium text-emerald-500">
                              {exchangeRetornoTotal !== null ? formatCurrency(exchangeRetornoTotal) : "-"}
                            </span>
                          </div>
                        </div>
                      ) : (
                        <div className="space-y-2">
                          <div className="flex justify-between items-center text-sm">
                            <span className="text-muted-foreground flex items-center gap-1.5">
                              <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
                              Responsabilidade (exposição):
                            </span>
                            <span className={`font-medium ${
                              exchangeLiability !== null && exchangeBookmakerSaldo && exchangeLiability > exchangeBookmakerSaldo.saldoDisponivel
                                ? 'text-red-500'
                                : 'text-amber-500'
                            }`}>
                              {exchangeLiability !== null ? formatCurrency(exchangeLiability) : "-"}
                            </span>
                          </div>
                          {exchangeLiability !== null && exchangeBookmakerSaldo && exchangeLiability > exchangeBookmakerSaldo.saldoDisponivel && (
                            <div className="flex items-center gap-1 text-red-400 text-xs bg-red-500/10 p-2 rounded">
                              <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0" />
                              <span>
                                Responsabilidade excede o saldo disponível ({formatCurrency(exchangeBookmakerSaldo.saldoDisponivel)}). 
                                Necessário: {formatCurrency(exchangeLiability - exchangeBookmakerSaldo.saldoDisponivel)} adicional.
                              </span>
                            </div>
                          )}
                          <div className="flex justify-between items-center text-sm">
                            <span className="text-muted-foreground flex items-center gap-1.5">
                              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                              Se GANHAR (lucro líquido):
                            </span>
                            <span className="font-medium text-emerald-500">
                              {exchangeLucroPotencial !== null ? `+${formatCurrency(exchangeLucroPotencial)}` : "-"}
                            </span>
                          </div>
                          <div className="flex justify-between items-center text-sm">
                            <span className="text-muted-foreground flex items-center gap-1.5">
                              <XCircle className="h-3.5 w-3.5 text-red-500" />
                              Se PERDER (responsabilidade):
                            </span>
                            <span className="font-medium text-red-500">
                              {exchangePrejuizo !== null ? formatCurrency(exchangePrejuizo) : "-"}
                            </span>
                          </div>
                        </div>
                      )}
                    </div>
                    
                    {/* Seletor de tipo de aposta Freebet para Exchange Back */}
                    {tipoOperacaoExchange === "back" && exchangeBookmakerSaldo && exchangeBookmakerSaldo.saldoFreebet > 0 && (
                      <div className="mt-4 p-3 rounded-lg border border-amber-500/20 bg-amber-500/5">
                        <Label className="block text-center uppercase text-xs tracking-wider text-amber-400 mb-2">Tipo de Aposta</Label>
                        <div className="flex justify-center gap-2">
                          <button
                            type="button"
                            onClick={() => setTipoApostaExchangeBack("normal")}
                            className={`flex flex-col items-center px-3 py-1.5 rounded-lg border-2 transition-all ${
                              tipoApostaExchangeBack === "normal"
                                ? "border-blue-500 bg-blue-500/10 text-blue-400"
                                : "border-border/50 bg-muted/30 text-muted-foreground hover:bg-muted/50"
                            }`}
                          >
                            <Coins className="h-3 w-3 mb-0.5" />
                            <div className="font-semibold text-[10px]">NORMAL</div>
                          </button>
                          <button
                            type="button"
                            onClick={() => setTipoApostaExchangeBack("freebet_snr")}
                            className={`flex flex-col items-center px-3 py-1.5 rounded-lg border-2 transition-all ${
                              tipoApostaExchangeBack === "freebet_snr"
                                ? "border-amber-500 bg-amber-500/10 text-amber-400"
                                : "border-border/50 bg-muted/30 text-muted-foreground hover:bg-muted/50"
                            }`}
                          >
                            <Gift className="h-3 w-3 mb-0.5" />
                            <div className="font-semibold text-[10px]">FB SNR</div>
                          </button>
                          <button
                            type="button"
                            onClick={() => setTipoApostaExchangeBack("freebet_sr")}
                            className={`flex flex-col items-center px-3 py-1.5 rounded-lg border-2 transition-all ${
                              tipoApostaExchangeBack === "freebet_sr"
                                ? "border-cyan-500 bg-cyan-500/10 text-cyan-400"
                                : "border-border/50 bg-muted/30 text-muted-foreground hover:bg-muted/50"
                            }`}
                          >
                            <Gift className="h-3 w-3 mb-0.5" />
                            <div className="font-semibold text-[10px]">FB SR</div>
                          </button>
                        </div>
                        {tipoApostaExchangeBack !== "normal" && (
                          <p className="text-center text-[10px] text-amber-400 mt-1">
                            Stake será debitada do saldo de Freebet
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* Campos para Cobertura Lay */}
                {tipoOperacaoExchange === "cobertura" && (
                  <div className="space-y-4">
                    {/* Seletor de Tipo de Aposta (Normal/Freebet) */}
                    <div className="flex justify-center gap-2">
                      <button
                        type="button"
                        onClick={() => setTipoApostaBack("normal")}
                        className={`flex flex-col items-center px-4 py-2.5 rounded-lg border-2 transition-all ${
                          tipoApostaBack === "normal"
                            ? "border-blue-500 bg-blue-500/10 text-blue-400"
                            : "border-border/50 bg-muted/30 text-muted-foreground hover:bg-muted/50"
                        }`}
                      >
                        <Coins className="h-4 w-4 mb-1" />
                        <div className="font-semibold text-xs">NORMAL</div>
                        <div className="text-[9px] opacity-70">(Qualifying Bet)</div>
                      </button>
                      <button
                        type="button"
                        onClick={() => setTipoApostaBack("freebet_snr")}
                        className={`flex flex-col items-center px-4 py-2.5 rounded-lg border-2 transition-all ${
                          tipoApostaBack === "freebet_snr"
                            ? "border-amber-500 bg-amber-500/10 text-amber-400"
                            : "border-border/50 bg-muted/30 text-muted-foreground hover:bg-muted/50"
                        }`}
                      >
                        <Gift className="h-4 w-4 mb-1" />
                        <div className="font-semibold text-xs">FREEBET SNR</div>
                        <div className="text-[9px] opacity-70">(Stake Não Volta)</div>
                      </button>
                      <button
                        type="button"
                        onClick={() => setTipoApostaBack("freebet_sr")}
                        className={`flex flex-col items-center px-4 py-2.5 rounded-lg border-2 transition-all ${
                          tipoApostaBack === "freebet_sr"
                            ? "border-cyan-500 bg-cyan-500/10 text-cyan-400"
                            : "border-border/50 bg-muted/30 text-muted-foreground hover:bg-muted/50"
                        }`}
                      >
                        <Gift className="h-4 w-4 mb-1" />
                        <div className="font-semibold text-xs">FREEBET SR</div>
                        <div className="text-[9px] opacity-70">(Stake Volta)</div>
                      </button>
                    </div>

                    {/* Card explicativo - dinâmico baseado no tipo */}
                    <div className={`p-3 rounded-lg border ${
                      tipoApostaBack === "normal" 
                        ? "bg-purple-500/5 border-purple-500/20" 
                        : tipoApostaBack === "freebet_snr"
                          ? "bg-amber-500/5 border-amber-500/20"
                          : "bg-cyan-500/5 border-cyan-500/20"
                    }`}>
                      <div className="flex items-start gap-2">
                        {tipoApostaBack === "normal" ? (
                          <Shield className="h-5 w-5 text-purple-400 mt-0.5 flex-shrink-0" />
                        ) : (
                          <Gift className={`h-5 w-5 mt-0.5 flex-shrink-0 ${tipoApostaBack === "freebet_snr" ? "text-amber-400" : "text-cyan-400"}`} />
                        )}
                        <div>
                          <p className={`text-sm font-medium ${
                            tipoApostaBack === "normal" 
                              ? "text-purple-400" 
                              : tipoApostaBack === "freebet_snr" 
                                ? "text-amber-400" 
                                : "text-cyan-400"
                          }`}>
                            {tipoApostaBack === "normal" && "COBERTURA LAY - QUALIFYING BET"}
                            {tipoApostaBack === "freebet_snr" && "EXTRAÇÃO DE FREEBET (SNR)"}
                            {tipoApostaBack === "freebet_sr" && "EXTRAÇÃO DE FREEBET (SR)"}
                          </p>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {tipoApostaBack === "normal" && (
                              "Aposta de qualificação onde você investe dinheiro real. A stake volta se você ganhar. Usado para desbloquear freebets ou cumprir rollover."
                            )}
                            {tipoApostaBack === "freebet_snr" && (
                              <>
                                <span className="font-medium text-amber-400">Stake Not Returned:</span> A freebet mais comum (~95% dos casos). Se ganhar, você recebe apenas o lucro - a stake não volta.
                                <br />
                                <span className="text-[10px] opacity-80 mt-1 block">💡 Dica: Odds maiores (4.0+) resultam em taxas de extração melhores.</span>
                              </>
                            )}
                            {tipoApostaBack === "freebet_sr" && (
                              <>
                                <span className="font-medium text-cyan-400">Stake Returned:</span> Raro, mas algumas casas oferecem. Se ganhar, você recebe o lucro + valor da freebet.
                                <br />
                                <span className="text-[10px] opacity-80 mt-1 block">💡 Comportamento idêntico a uma aposta normal.</span>
                              </>
                            )}
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* Dois painéis lado a lado */}
                    <div className="grid grid-cols-2 gap-4">
                      {/* Painel BACK */}
                      <div className="p-4 rounded-lg border border-emerald-500/30 bg-emerald-500/5">
                        <Label className="text-sm font-medium text-emerald-400 flex items-center gap-2 mb-3">
                          <BookOpen className="h-4 w-4" />
                          BACK (Aposta a Favor)
                        </Label>
                        <div className="space-y-3">
                          <div className="space-y-1">
                            <Label className="block text-center uppercase text-[10px] tracking-wider">Casa (Bookmaker) *</Label>
                            <Select 
                              value={coberturaBackBookmakerId} 
                              onValueChange={(val) => {
                                setCoberturaBackBookmakerId(val);
                                const bk = bookmakers.find(b => b.id === val);
                                if (bk) {
                                  setCoberturaBackSaldo({ saldo: bk.saldo_total, saldoDisponivel: bk.saldo_disponivel, saldoFreebet: bk.saldo_freebet, moeda: bk.moeda });
                                } else {
                                  setCoberturaBackSaldo(null);
                                }
                              }}
                            >
                              <SelectTrigger className="w-full h-9 text-sm">
                                <span className="truncate">
                                  {coberturaBackBookmakerId ? (() => {
                                    const selectedBk = bookmakers.find(b => b.id === coberturaBackBookmakerId);
                                    return selectedBk ? selectedBk.nome : "Selecione";
                                  })() : "Selecione"}
                                </span>
                              </SelectTrigger>
                              <SelectContent className="max-w-[320px]">
                                {bookmakers.map((bk) => (
                                  <SelectItem key={bk.id} value={bk.id}>
                                    <span className="truncate">{bk.nome} • {bk.parceiro?.nome || ""}</span>
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            {coberturaBackSaldo && (
                              <div className="text-center text-xs text-muted-foreground space-y-0.5">
                                <div>
                                  Saldo: <span className="font-medium text-emerald-400">
                                    {coberturaBackSaldo.moeda} {coberturaBackSaldo.saldo.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                  </span>
                                  {coberturaBackSaldo.saldoDisponivel !== coberturaBackSaldo.saldo && (
                                    <span className="text-amber-400 ml-1">
                                      (Livre: {coberturaBackSaldo.moeda} {coberturaBackSaldo.saldoDisponivel.toLocaleString('pt-BR', { minimumFractionDigits: 2 })})
                                    </span>
                                  )}
                                </div>
                                {coberturaBackSaldo.saldoFreebet > 0 && (
                                  <div className="text-amber-400">
                                    <Gift className="h-3 w-3 inline mr-0.5" />
                                    Freebet: <span className="font-medium">{coberturaBackSaldo.moeda} {coberturaBackSaldo.saldoFreebet.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                          <div className="grid grid-cols-2 gap-2">
                            <div className="space-y-2">
                              <Label className="block text-center uppercase text-[10px] tracking-wider">Odd Back *</Label>
                              <Input
                                type="number"
                                step="0.01"
                                min="1.01"
                                value={coberturaBackOdd}
                                onChange={(e) => setCoberturaBackOdd(e.target.value)}
                                placeholder="2.10"
                                className="text-center h-9"
                              />
                            </div>
                            <div className="space-y-2">
                              <Label className="block text-center uppercase text-[10px] tracking-wider">
                                {tipoApostaBack !== "normal" ? (
                                  <span className="flex items-center justify-center gap-1">
                                    <Gift className="h-3 w-3 text-amber-400" />
                                    Stake (Freebet)
                                  </span>
                                ) : "Stake *"}
                              </Label>
                              <Input
                                type="number"
                                step="0.01"
                                min="0.01"
                                value={coberturaBackStake}
                                onChange={(e) => setCoberturaBackStake(e.target.value)}
                                placeholder="100.00"
                                className={`text-center h-9 ${tipoApostaBack !== "normal" ? "border-amber-500/50" : ""}`}
                              />
                              {tipoApostaBack !== "normal" && coberturaBackSaldo && (
                                <p className="text-[10px] text-amber-400 text-center">
                                  Será debitado do saldo de Freebet
                                </p>
                              )}
                            </div>
                          </div>
                          <div className="pt-2 border-t border-emerald-500/20 space-y-1">
                            <div className="flex justify-between items-center text-xs">
                              <span className="text-muted-foreground">
                                {tipoApostaBack === "freebet_snr" ? "Retorno (somente lucro):" : "Retorno Potencial:"}
                              </span>
                              <span className="font-medium text-emerald-400">
                                {(() => {
                                  const odd = parseFloat(coberturaBackOdd);
                                  const stake = parseFloat(coberturaBackStake);
                                  if (!isNaN(odd) && !isNaN(stake) && odd > 1 && stake > 0) {
                                    if (tipoApostaBack === "freebet_snr") {
                                      // SNR: retorna apenas lucro
                                      return formatCurrency(stake * (odd - 1));
                                    }
                                    // Normal ou SR: retorna stake + lucro
                                    return formatCurrency(odd * stake);
                                  }
                                  return "-";
                                })()}
                              </span>
                            </div>
                            {tipoApostaBack === "freebet_snr" && (
                              <p className="text-[10px] text-amber-400/70 italic">
                                * Stake da freebet não volta
                              </p>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Painel LAY */}
                      <div className="p-4 rounded-lg border border-rose-500/30 bg-rose-500/5">
                        <Label className="text-sm font-medium text-rose-400 flex items-center gap-2 mb-3">
                          <BookX className="h-4 w-4" />
                          LAY (Aposta Contra)
                        </Label>
                        <div className="space-y-3">
                          <div className="space-y-1">
                            <Label className="block text-center uppercase text-[10px] tracking-wider">Casa (Exchange) *</Label>
                            <Select 
                              value={coberturaLayBookmakerId} 
                              onValueChange={(val) => {
                                setCoberturaLayBookmakerId(val);
                                const bk = bookmakers.find(b => b.id === val);
                                if (bk) {
                                  setCoberturaLaySaldo({ saldo: bk.saldo_total, saldoDisponivel: bk.saldo_disponivel, saldoFreebet: bk.saldo_freebet, moeda: bk.moeda });
                                } else {
                                  setCoberturaLaySaldo(null);
                                }
                              }}
                            >
                              <SelectTrigger className="w-full h-9 text-sm">
                                <span className="truncate">
                                  {coberturaLayBookmakerId ? (() => {
                                    const selectedBk = bookmakers.find(b => b.id === coberturaLayBookmakerId);
                                    return selectedBk ? selectedBk.nome : "Selecione";
                                  })() : "Selecione"}
                                </span>
                              </SelectTrigger>
                              <SelectContent className="max-w-[320px]">
                                {bookmakers.map((bk) => (
                                  <SelectItem key={bk.id} value={bk.id}>
                                    <span className="truncate">{bk.nome} • {bk.parceiro?.nome || ""}</span>
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            {coberturaLaySaldo && (
                              <div className="text-center text-xs text-muted-foreground">
                                Saldo: <span className="font-medium text-rose-400">
                                  {coberturaLaySaldo.moeda} {coberturaLaySaldo.saldo.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                </span>
                                {coberturaLaySaldo.saldoDisponivel !== coberturaLaySaldo.saldo && (
                                  <span className="text-amber-400 ml-1">
                                    (Livre: {coberturaLaySaldo.moeda} {coberturaLaySaldo.saldoDisponivel.toLocaleString('pt-BR', { minimumFractionDigits: 2 })})
                                  </span>
                                )}
                              </div>
                            )}
                          </div>
                          <div className="grid grid-cols-2 gap-2">
                            <div className="space-y-2">
                              <Label className="block text-center uppercase text-[10px] tracking-wider">Odd Lay *</Label>
                              <Input
                                type="number"
                                step="0.01"
                                min="1.01"
                                value={coberturaLayOdd}
                                onChange={(e) => setCoberturaLayOdd(e.target.value)}
                                placeholder="2.08"
                                className="text-center h-9"
                              />
                            </div>
                            <div className="space-y-2">
                              <Label className="block text-center uppercase text-[10px] tracking-wider">Comissão %</Label>
                              <Input
                                type="number"
                                step="0.1"
                                value={coberturaLayComissao}
                                onChange={(e) => setCoberturaLayComissao(e.target.value)}
                                placeholder="5"
                                className="text-center h-9"
                              />
                            </div>
                          </div>
                          <div className="pt-2 border-t border-rose-500/20 space-y-1">
                            <div className="flex justify-between items-center text-xs">
                              <span className="text-muted-foreground">Stake Lay (calculado):</span>
                              <span className="font-medium text-rose-400">
                                {coberturaLayStake !== null ? formatCurrency(coberturaLayStake) : "-"}
                              </span>
                            </div>
                            <div className="flex justify-between items-center text-xs">
                              <span className="text-muted-foreground">Responsabilidade:</span>
                              <span className={`font-medium ${
                                coberturaResponsabilidade !== null && coberturaLaySaldo && coberturaResponsabilidade > coberturaLaySaldo.saldoDisponivel
                                  ? 'text-red-400'
                                  : 'text-amber-400'
                              }`}>
                                {coberturaResponsabilidade !== null ? formatCurrency(coberturaResponsabilidade) : "-"}
                              </span>
                            </div>
                            {coberturaResponsabilidade !== null && coberturaLaySaldo && coberturaResponsabilidade > coberturaLaySaldo.saldoDisponivel && (
                              <div className="flex items-center gap-1 text-red-400 text-[10px] mt-1">
                                <AlertTriangle className="h-3 w-3" />
                                <span>Responsabilidade excede o saldo disponível!</span>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Resultado da Cobertura */}
                    <div className="p-4 rounded-lg border border-purple-500/30 bg-purple-500/5">
                      <Label className="text-sm font-medium text-purple-400 flex items-center gap-2 mb-3">
                        <BarChart3 className="h-4 w-4" />
                        RESULTADO DA COBERTURA
                      </Label>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <div className="flex justify-between items-center text-sm">
                            <span className="text-muted-foreground flex items-center gap-1.5">
                              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                              Se BACK vencer:
                            </span>
                            <span className={`font-medium ${(coberturaLucroBack ?? 0) >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                              {coberturaLucroBack !== null ? formatCurrency(coberturaLucroBack) : "-"}
                            </span>
                          </div>
                          <div className="flex justify-between items-center text-sm">
                            <span className="text-muted-foreground flex items-center gap-1.5">
                              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                              Se LAY vencer:
                            </span>
                            <span className={`font-medium ${(coberturaLucroLay ?? 0) >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                              {coberturaLucroLay !== null ? formatCurrency(coberturaLucroLay) : "-"}
                            </span>
                          </div>
                        </div>
                        <div className="space-y-2 pl-4 border-l border-purple-500/20">
                          <div className="flex justify-between items-center text-sm">
                            <span className="text-muted-foreground flex items-center gap-1.5">
                              <Coins className="h-3.5 w-3.5 text-purple-400" />
                              Lucro Garantido:
                            </span>
                            <span className={`font-semibold text-lg ${(coberturaLucroGarantido ?? 0) >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                              {coberturaLucroGarantido !== null ? formatCurrency(coberturaLucroGarantido) : "-"}
                            </span>
                          </div>
                          {/* Taxa de Extração - apenas para Freebet SNR ou SR, não para Normal */}
                          {tipoApostaBack !== "normal" && (
                            <div className="space-y-2">
                              <div className="flex justify-between items-center text-sm">
                                <span className="text-muted-foreground flex items-center gap-1.5">
                                  <Percent className="h-3.5 w-3.5 text-purple-400" />
                                  Taxa de Extração:
                                </span>
                                <span className={`font-medium ${
                                  (coberturaTaxaExtracao ?? 0) >= 70 ? 'text-emerald-400' : 
                                  (coberturaTaxaExtracao ?? 0) >= 60 ? 'text-amber-400' : 
                                  'text-red-400'
                                }`}>
                                  {coberturaTaxaExtracao !== null ? `${coberturaTaxaExtracao.toFixed(2)}%` : "-"}
                                </span>
                              </div>
                              {/* Barra de progresso visual para taxa de extração */}
                              {coberturaTaxaExtracao !== null && (
                                <div className="space-y-1">
                                  <Progress 
                                    value={Math.min(Math.max(coberturaTaxaExtracao, 0), 100)} 
                                    className={`h-2 ${
                                      coberturaTaxaExtracao >= 80 ? '[&>div]:bg-emerald-500' :
                                      coberturaTaxaExtracao >= 70 ? '[&>div]:bg-emerald-400' :
                                      coberturaTaxaExtracao >= 60 ? '[&>div]:bg-amber-400' :
                                      '[&>div]:bg-red-400'
                                    }`}
                                  />
                                  <div className="flex justify-between text-[9px] text-muted-foreground/60">
                                    <span>Ruim</span>
                                    <span>60%</span>
                                    <span>70%</span>
                                    <span>Ótimo</span>
                                  </div>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </TabsContent>
            </Tabs>

            {/* Resultado - Pills clicáveis */}
            <div className="space-y-2">
              <Label className="block text-center uppercase text-xs tracking-wider">Resultado</Label>
              <div className="flex flex-wrap gap-2 justify-center">
                {[
                  { value: "PENDENTE", label: "Pendente", color: "bg-amber-500/20 text-amber-400 border-amber-500/40 hover:bg-amber-500/30" },
                  { value: "GREEN", label: "Green", color: "bg-emerald-500/20 text-emerald-400 border-emerald-500/40 hover:bg-emerald-500/30" },
                  { value: "RED", label: "Red", color: "bg-red-500/20 text-red-400 border-red-500/40 hover:bg-red-500/30" },
                  { value: "MEIO_GREEN", label: "Meio Green", color: "bg-teal-500/20 text-teal-400 border-teal-500/40 hover:bg-teal-500/30" },
                  { value: "MEIO_RED", label: "Meio Red", color: "bg-orange-500/20 text-orange-400 border-orange-500/40 hover:bg-orange-500/30" },
                  { value: "VOID", label: "Void", color: "bg-slate-500/20 text-slate-400 border-slate-500/40 hover:bg-slate-500/30" },
                ].map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setStatusResultado(option.value)}
                    className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-all cursor-pointer ${
                      statusResultado === option.value 
                        ? option.color + " ring-2 ring-offset-2 ring-offset-background ring-current" 
                        : "bg-muted/30 text-muted-foreground border-border/50 hover:bg-muted/50"
                    }`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Lucro/Prejuízo calculado automaticamente - só mostrar quando tem resultado e valores calculados válidos */}
            {statusResultado && statusResultado !== "PENDENTE" && tipoAposta === "bookmaker" && stake && odd && parseFloat(stake) > 0 && parseFloat(odd) > 1 && (
              <div className="p-3 rounded-lg bg-muted/50 border">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">Retorno Calculado:</span>
                  <span className="font-medium text-emerald-500">
                    {formatCurrencyWithSymbol(calculateValorRetorno() || 0, getSelectedBookmakerMoeda())}
                  </span>
                </div>
                {calculateLucroPrejuizo() !== null && (
                  <div className="flex justify-between items-center mt-1">
                    <span className="text-sm text-muted-foreground">Lucro/Prejuízo:</span>
                    <span className={`font-medium ${calculateLucroPrejuizo()! >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                      {formatCurrencyWithSymbol(calculateLucroPrejuizo()!, getSelectedBookmakerMoeda())}
                    </span>
                  </div>
                )}
              </div>
            )}

            {/* Freebet Gerada - apenas para Bookmaker e quando NÃO está usando freebet */}
            {tipoAposta === "bookmaker" && !usarFreebetBookmaker && (
              <div className="p-3 rounded-lg border border-amber-500/30 bg-amber-500/5 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Gift className="h-4 w-4 text-amber-400" />
                    <Label className="text-sm font-medium text-amber-400">Esta aposta gerou Freebet?</Label>
                  </div>
                  <Switch
                    checked={gerouFreebet}
                    onCheckedChange={setGerouFreebet}
                  />
                </div>
                {gerouFreebet && (
                  <div className="space-y-2">
                    <Label className="block text-xs tracking-wider text-muted-foreground">Valor da Freebet Recebida</Label>
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      value={valorFreebetGerada}
                      onChange={(e) => setValorFreebetGerada(e.target.value)}
                      placeholder="Ex: 50.00"
                      className="text-center"
                    />
                  </div>
                )}
              </div>
            )}
          </div>

          <DialogFooter className="flex justify-between">
            {aposta && (
              <Button
                variant="destructive"
                onClick={() => setDeleteDialogOpen(true)}
                disabled={loading}
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Excluir
              </Button>
            )}
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
                Cancelar
              </Button>
              <Button onClick={handleSave} disabled={loading}>
                {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                Salvar
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir Aposta</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir esta aposta? Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
