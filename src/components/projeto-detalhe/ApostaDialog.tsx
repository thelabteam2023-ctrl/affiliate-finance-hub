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
import { Loader2, Save, Trash2 } from "lucide-react";
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
}

interface Bookmaker {
  id: string;
  nome: string;
  parceiro_id: string;
  saldo_atual: number;
  saldo_total: number;
  saldo_disponivel: number;
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
    "Spread",
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
    "Primeiro Dragão",
    "Primeiro Barão",
    "Primeiro Torre",
    "First Blood",
    "Outro"
  ],
  "Counter-Strike": [
    "Vencedor do Mapa",
    "Vencedor da Série",
    "Handicap de Rounds",
    "Over (Rounds)",
    "Under (Rounds)",
    "Handicap de Mapas",
    "Pistol Round",
    "Outro"
  ],
  "Dota 2": [
    "Vencedor do Mapa",
    "Vencedor da Série",
    "Handicap de Mapas",
    "Over (Mapas)",
    "Under (Mapas)",
    "Primeiro Roshan",
    "Primeiro Barracks",
    "First Blood",
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

const EXCHANGES = [
  "Betfair",
  "Smarkets",
  "Betdaq",
  "Matchbook",
  "Orbit Exchange",
  "Panter",
  "Outra"
];

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
  
  // Handicap specific fields
  const [handicapTime, setHandicapTime] = useState<"mandante" | "visitante" | "">("");
  const [handicapLinha, setHandicapLinha] = useState("");

  // Computed evento
  const evento = mandante && visitante ? `${mandante} x ${visitante}` : "";

  // Check if current mercado is handicap
  const isHandicapMercado = mercado.includes("Handicap");

  // Handicap lines options
  const HANDICAP_LINHAS = [
    "-5.5", "-5.0", "-4.5", "-4.0", "-3.5", "-3.0", "-2.5", "-2.0", "-1.5", "-1.0", "-0.5",
    "0", "+0.5", "+1.0", "+1.5", "+2.0", "+2.5", "+3.0", "+3.5", "+4.0", "+4.5", "+5.0", "+5.5"
  ];

  // Opções de seleção baseadas no mercado e times
  const getSelecaoOptions = (): string[] => {
    const mercadosMoneyline = ["Moneyline / 1X2", "Moneyline", "Dupla Chance", "Draw No Bet", "Vencedor do Jogo", "Vencedor"];
    const mercadosBTTS = ["Ambas Marcam (BTTS)", "Ambas Marcam"];
    
    // Usa nomes genéricos se mandante/visitante não estiverem preenchidos
    const timeCasa = mandante || "TIME CASA";
    const timeFora = visitante || "TIME FORA";
    
    // Moneyline - mostra mandante, empate, visitante (UPPERCASE)
    if (mercadosMoneyline.includes(mercado)) {
      return [timeCasa, "EMPATE", timeFora];
    }
    
    // Over - qualquer mercado que contenha "Over"
    if (mercado.includes("Over")) {
      return ["Over 0.5", "Over 1.5", "Over 2.5", "Over 3.5", "Over 4.5", "Over 5.5"];
    }
    
    // Under - qualquer mercado que contenha "Under"
    if (mercado.includes("Under")) {
      return ["Under 0.5", "Under 1.5", "Under 2.5", "Under 3.5", "Under 4.5", "Under 5.5"];
    }
    
    // BTTS
    if (mercadosBTTS.includes(mercado)) {
      return ["SIM", "NÃO"];
    }
    
    // Handicap is handled separately with dedicated fields
    if (isHandicapMercado) {
      return [];
    }
    
    return [];
  };

  // Build handicap selection from separate fields
  const getHandicapSelecao = (): string => {
    if (!isHandicapMercado || !handicapTime || !handicapLinha) return "";
    const timeNome = handicapTime === "mandante" ? mandante : visitante;
    return `${timeNome} ${handicapLinha}`;
  };

  // Get effective selecao (either from handicap fields or regular selecao)
  const effectiveSelecao = isHandicapMercado ? getHandicapSelecao() : selecao;

  const selecaoOptions = getSelecaoOptions();

  // Bookmaker mode
  const [bookmakerId, setBookmakerId] = useState("");
  const [modoBackLay, setModoBackLay] = useState(false);
  const [layExchange, setLayExchange] = useState("");
  const [layOdd, setLayOdd] = useState("");
  const [layComissao, setLayComissao] = useState("5");

  // Exchange mode
  const [exchangeSelecionada, setExchangeSelecionada] = useState("");
  const [exchangeComissao, setExchangeComissao] = useState("5");
  const [layOddExchange, setLayOddExchange] = useState("");

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
        
        // Set mercado first without triggering reset
        setTimeout(() => {
          setMercado(savedMercado);
          
          // Check if it's a handicap selection (contains a line like +1.5, -2.0, etc.)
          const handicapMatch = savedSelecao.match(/^(.+?)\s([+-]?\d+\.?\d*)$/);
          if (savedMercado.includes("Handicap") && handicapMatch) {
            const teamName = handicapMatch[1].trim();
            const linha = handicapMatch[2];
            // Determine which team based on name
            const eventoParts = aposta.evento?.split(" x ") || [];
            if (teamName === eventoParts[0]) {
              setHandicapTime("mandante");
            } else if (teamName === eventoParts[1]) {
              setHandicapTime("visitante");
            }
            setHandicapLinha(linha.startsWith("+") || linha.startsWith("-") ? linha : `+${linha}`);
          } else {
            setSelecao(savedSelecao);
          }
        }, 50);

        // Determinar tipo de aposta baseado nos dados salvos
        if (aposta.back_em_exchange && aposta.lay_odd) {
          // Exchange mode (back + lay na mesma exchange)
          setTipoAposta("exchange");
          setExchangeSelecionada(aposta.lay_exchange || "");
          setExchangeComissao(aposta.back_comissao?.toString() || "5");
          setLayOddExchange(aposta.lay_odd?.toString() || "");
        } else if (aposta.modo_entrada === "LAYBACK") {
          // Bookmaker + Lay em exchange
          setTipoAposta("bookmaker");
          setBookmakerId(aposta.bookmaker_id);
          setModoBackLay(true);
          setLayExchange(aposta.lay_exchange || "");
          setLayOdd(aposta.lay_odd?.toString() || "");
          setLayComissao(aposta.lay_comissao?.toString() || "5");
        } else {
          // Bookmaker simples
          setTipoAposta("bookmaker");
          setBookmakerId(aposta.bookmaker_id);
          setModoBackLay(false);
        }
      } else {
        resetForm();
      }
    }
  }, [open, aposta]);

  useEffect(() => {
    if (!aposta) {
      setMercado("");
      setSelecao("");
      setHandicapTime("");
      setHandicapLinha("");
    }
  }, [esporte]);

  // Reset handicap fields when mercado changes (only for new bets)
  useEffect(() => {
    if (!aposta) {
      setHandicapTime("");
      setHandicapLinha("");
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
    } else if (tipoAposta === "exchange" && stake && odd && layOddExchange) {
      // Calcular para Exchange mode
      const backStake = parseFloat(stake);
      const backOdd = parseFloat(odd);
      const layOddNum = parseFloat(layOddExchange);
      const comissao = parseFloat(exchangeComissao) / 100;

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
  }, [tipoAposta, modoBackLay, stake, odd, layOdd, layComissao, layOddExchange, exchangeComissao]);

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
    setHandicapTime("");
    setHandicapLinha("");
    setOdd("");
    setStake("");
    setStatusResultado("PENDENTE");
    setValorRetorno("");
    setObservacoes("");
    setBookmakerId("");
    setModoBackLay(false);
    setLayExchange("");
    setLayOdd("");
    setLayComissao("5");
    setExchangeSelecionada("");
    setExchangeComissao("5");
    setLayOddExchange("");
    setLayStake(null);
    setLayLiability(null);
  };

  const fetchBookmakers = async () => {
    try {
      // Fetch bookmakers com informação de saldo disponível
      const { data: bookmakersData, error: bkError } = await supabase
        .from("bookmakers")
        .select(`
          id,
          nome,
          parceiro_id,
          saldo_atual,
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
          moeda: bk.moeda || "BRL",
          parceiro: bk.parceiro
        };
      }).filter(bk => bk.saldo_disponivel > 0 || (aposta && aposta.bookmaker_id === bk.id));

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
    // Validações básicas
    const finalSelecao = isHandicapMercado ? effectiveSelecao : selecao;
    if (!esporte || !evento || !finalSelecao || !odd || !stake) {
      toast.error("Preencha todos os campos obrigatórios");
      return;
    }

    // Validação de Odd > 1
    const oddNum = parseFloat(odd);
    if (isNaN(oddNum) || oddNum <= 1) {
      toast.error("Odd deve ser maior que 1.00");
      return;
    }

    // Validação de Stake > 0
    const stakeNum = parseFloat(stake);
    if (isNaN(stakeNum) || stakeNum <= 0) {
      toast.error("Stake deve ser maior que 0");
      return;
    }

    if (tipoAposta === "bookmaker" && !bookmakerId) {
      toast.error("Selecione a bookmaker");
      return;
    }

    // Validar stake vs saldo disponível da bookmaker (considerando apostas pendentes)
    if (tipoAposta === "bookmaker" && bookmakerId) {
      const selectedBookmaker = bookmakers.find(b => b.id === bookmakerId);
      if (selectedBookmaker) {
        // Para nova aposta, verificar contra saldo disponível
        // Para edição de aposta pendente existente, considerar que a stake anterior já está bloqueada
        const stakeAnterior = aposta?.status === "PENDENTE" ? aposta.stake : 0;
        const saldoDisponivel = (selectedBookmaker as any).saldo_disponivel ?? selectedBookmaker.saldo_atual;
        const saldoParaValidar = saldoDisponivel + stakeAnterior;
        
        if (stakeNum > saldoParaValidar) {
          const moeda = selectedBookmaker.moeda;
          toast.error(`Stake maior que o saldo disponível (${formatCurrencyWithSymbol(saldoParaValidar, moeda)})`);
          return;
        }
      }
    }

    if (tipoAposta === "bookmaker" && modoBackLay && (!layExchange || !layOdd)) {
      toast.error("Preencha os campos de Lay");
      return;
    }

    if (tipoAposta === "exchange" && (!exchangeSelecionada || !layOddExchange)) {
      toast.error("Preencha os campos da Exchange");
      return;
    }

    try {
      setLoading(true);
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) {
        toast.error("Usuário não autenticado");
        return;
      }

      const lucroPrejuizo = calculateLucroPrejuizo();

      // Montar dados baseado no tipo de aposta
      const valorRetornoCalculado = calculateValorRetorno();

      let apostaData: any = {
        user_id: userData.user.id,
        projeto_id: projetoId,
        data_aposta: dataAposta,
        esporte,
        evento,
        mercado: mercado || null,
        selecao: effectiveSelecao,
        odd: parseFloat(odd),
        stake: parseFloat(stake),
        status: statusResultado === "PENDENTE" ? "PENDENTE" : "CONCLUIDA",
        resultado: statusResultado === "PENDENTE" ? null : statusResultado,
        valor_retorno: valorRetornoCalculado,
        lucro_prejuizo: lucroPrejuizo,
        observacoes: observacoes || null,
      };

      if (tipoAposta === "bookmaker") {
        apostaData = {
          ...apostaData,
          bookmaker_id: bookmakerId,
          estrategia: modoBackLay ? "LAYBACK" : "VALOR",
          modo_entrada: modoBackLay ? "LAYBACK" : "PADRAO",
          lay_exchange: modoBackLay ? layExchange : null,
          lay_odd: modoBackLay && layOdd ? parseFloat(layOdd) : null,
          lay_stake: modoBackLay ? layStake : null,
          lay_liability: modoBackLay ? layLiability : null,
          lay_comissao: modoBackLay ? parseFloat(layComissao) : null,
          back_em_exchange: false,
          back_comissao: null,
        };
      } else {
        // Exchange mode - salvar como back_em_exchange
        apostaData = {
          ...apostaData,
          bookmaker_id: bookmakerId || bookmakers[0]?.id, // Usar primeiro bookmaker como referência
          estrategia: "EXCHANGE",
          modo_entrada: "EXCHANGE",
          lay_exchange: exchangeSelecionada,
          lay_odd: parseFloat(layOddExchange),
          lay_stake: layStake,
          lay_liability: layLiability,
          lay_comissao: parseFloat(exchangeComissao),
          back_em_exchange: true,
          back_comissao: parseFloat(exchangeComissao),
        };
      }

      // Armazenar o resultado anterior se estiver editando (para calcular diferença de saldo)
      const resultadoAnterior = aposta?.resultado || null;
      const stakeAnterior = aposta?.stake || 0;
      const oddAnterior = aposta?.odd || 0;

      if (aposta) {
        const { error } = await supabase
          .from("apostas")
          .update(apostaData)
          .eq("id", aposta.id);
        if (error) throw error;

        // Atualizar saldo do bookmaker se resultado mudou
        if (tipoAposta === "bookmaker" && bookmakerId) {
          await atualizarSaldoBookmaker(
            bookmakerId,
            resultadoAnterior,
            statusResultado,
            stakeAnterior,
            oddAnterior,
            parseFloat(stake),
            parseFloat(odd)
          );
        }

        toast.success("Aposta atualizada com sucesso!");
      } else {
        const { error } = await supabase
          .from("apostas")
          .insert(apostaData);
        if (error) throw error;

        // Atualizar saldo do bookmaker para nova aposta com resultado definido
        if (tipoAposta === "bookmaker" && bookmakerId && statusResultado !== "PENDENTE") {
          await atualizarSaldoBookmaker(
            bookmakerId,
            null,
            statusResultado,
            0,
            0,
            parseFloat(stake),
            parseFloat(odd)
          );
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

  const atualizarSaldoBookmaker = async (
    bookmakerIdToUpdate: string,
    resultadoAnterior: string | null,
    resultadoNovo: string,
    stakeAnterior: number,
    oddAnterior: number,
    stakeNovo: number,
    oddNovo: number
  ) => {
    try {
      // Sistema de dois saldos:
      // - saldo_total (saldo_atual no banco) = dinheiro real na conta
      // - saldo_disponivel = saldo_total - stakes bloqueadas (apostas pendentes)
      //
      // Tipos de resultado e seus cálculos:
      // - GREEN: lucro completo = stake * (odd - 1)
      // - RED: perda completa = -stake
      // - MEIO_GREEN: 50% do lucro potencial = stake * (odd - 1) / 2
      // - MEIO_RED: 50% da perda = -stake / 2
      // - VOID: nenhuma alteração (stake devolvida)
      // - HALF: (legado) tratado como MEIO_GREEN

      let saldoAjuste = 0;

      // Calcular efeito do resultado anterior para reverter
      if (resultadoAnterior && resultadoAnterior !== "PENDENTE") {
        switch (resultadoAnterior) {
          case "GREEN":
            saldoAjuste -= stakeAnterior * (oddAnterior - 1);
            break;
          case "RED":
            saldoAjuste += stakeAnterior;
            break;
          case "MEIO_GREEN":
          case "HALF":
            saldoAjuste -= stakeAnterior * ((oddAnterior - 1) / 2);
            break;
          case "MEIO_RED":
            saldoAjuste += stakeAnterior / 2;
            break;
          case "VOID":
            break;
        }
      }

      // Aplicar efeito do novo resultado
      if (resultadoNovo && resultadoNovo !== "PENDENTE") {
        switch (resultadoNovo) {
          case "GREEN":
            saldoAjuste += stakeNovo * (oddNovo - 1);
            break;
          case "RED":
            saldoAjuste -= stakeNovo;
            break;
          case "MEIO_GREEN":
          case "HALF":
            saldoAjuste += stakeNovo * ((oddNovo - 1) / 2);
            break;
          case "MEIO_RED":
            saldoAjuste -= stakeNovo / 2;
            break;
          case "VOID":
            break;
        }
      }

      if (saldoAjuste !== 0) {
        // Buscar saldo atual
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
    } catch (error) {
      console.error("Erro ao atualizar saldo do bookmaker:", error);
    }
  };

  const handleDelete = async () => {
    if (!aposta) return;
    
    try {
      setLoading(true);
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
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {aposta ? "Editar Aposta" : "Nova Aposta"}
            </DialogTitle>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            {/* Campos comuns: Data/Hora, Esporte, Evento */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="block text-center uppercase text-xs tracking-wider">Data e Hora do Evento *</Label>
                <DateTimePicker
                  value={dataAposta}
                  onChange={setDataAposta}
                  placeholder="Selecione"
                />
              </div>
              <div className="space-y-2">
                <Label className="block text-center uppercase text-xs tracking-wider">Esporte *</Label>
                <Select value={esporte} onValueChange={(val) => {
                  setEsporte(val);
                  incrementSportUsage(val);
                }}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione" />
                  </SelectTrigger>
                  <SelectContent>
                    {getSortedEsportes().map((esp) => (
                      <SelectItem key={esp} value={esp}>{esp}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Mandante e Visitante */}
            <div className="flex items-end gap-2">
              <div className="flex-1 space-y-2">
                <Label className="block text-center uppercase text-xs tracking-wider">Mandante *</Label>
                <Input
                  value={mandante}
                  onChange={(e) => setMandante(e.target.value.toUpperCase())}
                  placeholder="EX: REAL MADRID"
                  className="uppercase text-center"
                />
              </div>
              <div className="flex items-center justify-center pb-2">
                <span className="text-xl font-bold text-muted-foreground">X</span>
              </div>
              <div className="flex-1 space-y-2">
                <Label className="block text-center uppercase text-xs tracking-wider">Visitante *</Label>
                <Input
                  value={visitante}
                  onChange={(e) => setVisitante(e.target.value.toUpperCase())}
                  placeholder="EX: BARCELONA"
                  className="uppercase text-center"
                />
              </div>
            </div>

            {/* Mercado e Seleção */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="block text-center uppercase text-xs tracking-wider">Mercado</Label>
                <Select value={mercado} onValueChange={(val) => {
                  setMercado(val);
                  setSelecao(""); // Reset seleção ao mudar mercado
                }} disabled={!esporte}>
                  <SelectTrigger>
                    <SelectValue placeholder={esporte ? "Selecione o mercado" : "Selecione o esporte primeiro"} />
                  </SelectTrigger>
                  <SelectContent>
                    {mercadosDisponiveis.map((m) => (
                      <SelectItem key={m} value={m}>{m}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {/* Seleção - mostra campos de Handicap ou select normal */}
              {isHandicapMercado ? (
                <div className="space-y-2">
                  <Label className="block text-center uppercase text-xs tracking-wider">Seleção Handicap *</Label>
                  <div className="grid grid-cols-2 gap-3">
                    <Select value={handicapTime} onValueChange={(v) => setHandicapTime(v as "mandante" | "visitante")}>
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione o time" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="mandante">{mandante || "Mandante"}</SelectItem>
                        <SelectItem value="visitante">{visitante || "Visitante"}</SelectItem>
                      </SelectContent>
                    </Select>
                    <Select value={handicapLinha} onValueChange={setHandicapLinha} disabled={!handicapTime}>
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione a linha" />
                      </SelectTrigger>
                      <SelectContent>
                        {HANDICAP_LINHAS.map((linha) => (
                          <SelectItem key={linha} value={linha}>{linha}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  {effectiveSelecao && (
                    <p className="text-xs text-muted-foreground mt-1">
                      Seleção: <span className="font-medium text-foreground">{effectiveSelecao}</span>
                    </p>
                  )}
                </div>
              ) : (
                <div className="space-y-2">
                  <Label className="block text-center uppercase text-xs tracking-wider">Seleção *</Label>
                  {selecaoOptions.length > 0 ? (
                    <Select value={selecao} onValueChange={setSelecao}>
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione" />
                      </SelectTrigger>
                      <SelectContent>
                        {selecaoOptions.map((opt) => (
                          <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <Input
                      value={selecao}
                      onChange={(e) => setSelecao(e.target.value)}
                      placeholder="Ex: Real Madrid, Over 2.5"
                    />
                  )}
                </div>
              )}
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
                    <Select value={bookmakerId} onValueChange={setBookmakerId}>
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione" />
                      </SelectTrigger>
                      <SelectContent>
                        {bookmakers.length === 0 ? (
                          <div className="p-3 text-center text-sm text-muted-foreground">
                            Nenhuma bookmaker com saldo disponível
                          </div>
                        ) : (
                          bookmakers.map((bk) => (
                            <SelectItem key={bk.id} value={bk.id}>
                              <div className="flex items-center justify-between w-full gap-2">
                                <span>{bk.nome} • {bk.parceiro?.nome}</span>
                                <span className="text-xs text-muted-foreground">
                                  Disp: {formatCurrencyWithSymbol(bk.saldo_disponivel, bk.moeda)}
                                </span>
                              </div>
                            </SelectItem>
                          ))
                        )}
                      </SelectContent>
                    </Select>
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

                {/* Toggle Back + Lay */}
                <div className="flex items-center justify-between p-3 rounded-lg bg-purple-500/5 border border-purple-500/20">
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={modoBackLay}
                      onCheckedChange={setModoBackLay}
                      id="modo-back-lay"
                    />
                    <Label htmlFor="modo-back-lay" className="text-sm cursor-pointer">
                      Back + Lay (hedge em Exchange)
                    </Label>
                  </div>
                </div>

                {/* Campos Lay quando ativado */}
                {modoBackLay && (
                  <div className="space-y-3 p-4 rounded-lg border border-purple-500/30 bg-purple-500/5">
                    <Label className="text-sm font-medium text-purple-400">LAY (Exchange)</Label>
                    <div className="grid grid-cols-4 gap-4">
                      <div className="space-y-2">
                        <Label className="block text-center uppercase text-xs tracking-wider">Exchange *</Label>
                        <Select value={layExchange} onValueChange={setLayExchange}>
                          <SelectTrigger>
                            <SelectValue placeholder="Selecione" />
                          </SelectTrigger>
                          <SelectContent>
                            {EXCHANGES.map((ex) => (
                              <SelectItem key={ex} value={ex}>{ex}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label className="block text-center uppercase text-xs tracking-wider">Odd Lay *</Label>
                        <Input
                          type="number"
                          step="0.01"
                          value={layOdd}
                          onChange={(e) => setLayOdd(e.target.value)}
                          placeholder="Ex: 1.90"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label className="block text-center uppercase text-xs tracking-wider">Stake Lay</Label>
                        <Input
                          type="text"
                          value={layStake !== null ? formatCurrency(layStake) : "-"}
                          disabled
                          className="bg-muted"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label className="block text-center uppercase text-xs tracking-wider">Liability</Label>
                        <Input
                          type="text"
                          value={layLiability !== null ? formatCurrency(layLiability) : "-"}
                          disabled
                          className="bg-muted"
                        />
                      </div>
                    </div>
                    <div className="flex items-center gap-2 mt-2">
                      <Label className="text-xs text-muted-foreground">Comissão:</Label>
                      <Input
                        type="number"
                        step="0.1"
                        value={layComissao}
                        onChange={(e) => setLayComissao(e.target.value)}
                        className="w-20 h-8"
                      />
                      <span className="text-xs text-muted-foreground">%</span>
                    </div>
                  </div>
                )}
              </TabsContent>

              {/* Aba Exchange */}
              <TabsContent value="exchange" className="space-y-4 mt-4">
                <div className="p-4 rounded-lg border border-amber-500/30 bg-amber-500/5">
                  <p className="text-sm text-muted-foreground mb-4">
                    Operação Back + Lay dentro da mesma Exchange (ex: Panter, Betfair)
                  </p>
                  
                  <div className="grid grid-cols-2 gap-4 mb-4">
                    <div className="space-y-2">
                      <Label className="block text-center uppercase text-xs tracking-wider">Exchange *</Label>
                      <Select value={exchangeSelecionada} onValueChange={setExchangeSelecionada}>
                        <SelectTrigger>
                          <SelectValue placeholder="Selecione" />
                        </SelectTrigger>
                        <SelectContent>
                          {EXCHANGES.map((ex) => (
                            <SelectItem key={ex} value={ex}>{ex}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="flex items-center gap-2">
                      <Label className="text-sm text-muted-foreground">Comissão:</Label>
                      <Input
                        type="number"
                        step="0.1"
                        value={exchangeComissao}
                        onChange={(e) => setExchangeComissao(e.target.value)}
                        className="w-20 h-9"
                      />
                      <span className="text-sm text-muted-foreground">%</span>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    {/* Back */}
                    <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
                      <Label className="text-sm font-medium text-emerald-400 mb-3 block">BACK</Label>
                      <div className="space-y-3">
                        <div className="space-y-2">
                          <Label className="block text-center uppercase text-xs tracking-wider">Odd Back *</Label>
                          <Input
                            type="number"
                            step="0.01"
                            value={odd}
                            onChange={(e) => setOdd(e.target.value)}
                            placeholder="Ex: 1.85"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label className="block text-center uppercase text-xs tracking-wider">Stake (R$) *</Label>
                          <Input
                            type="number"
                            step="0.01"
                            value={stake}
                            onChange={(e) => setStake(e.target.value)}
                            placeholder="Ex: 100.00"
                          />
                        </div>
                      </div>
                    </div>

                    {/* Lay */}
                    <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/20">
                      <Label className="text-sm font-medium text-rose-400 mb-3 block">LAY</Label>
                      <div className="space-y-3">
                        <div className="space-y-2">
                          <Label className="block text-center uppercase text-xs tracking-wider">Odd Lay *</Label>
                          <Input
                            type="number"
                            step="0.01"
                            value={layOddExchange}
                            onChange={(e) => setLayOddExchange(e.target.value)}
                            placeholder="Ex: 1.90"
                          />
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <div className="space-y-2">
                            <Label className="block text-center uppercase text-[10px] tracking-wider">Stake Lay</Label>
                            <Input
                              type="text"
                              value={layStake !== null ? formatCurrency(layStake) : "-"}
                              disabled
                              className="bg-muted h-8 text-sm"
                            />
                          </div>
                          <div className="space-y-2">
                            <Label className="block text-center uppercase text-[10px] tracking-wider">Liability</Label>
                            <Input
                              type="text"
                              value={layLiability !== null ? formatCurrency(layLiability) : "-"}
                              disabled
                              className="bg-muted h-8 text-sm"
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
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

            {/* Lucro/Prejuízo calculado automaticamente */}
            {statusResultado && statusResultado !== "PENDENTE" && (
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

            {/* Observações */}
            <div className="space-y-2">
              <Label className="block text-center uppercase text-xs tracking-wider">Observações</Label>
              <Textarea
                value={observacoes}
                onChange={(e) => setObservacoes(e.target.value)}
                placeholder="Notas sobre a aposta..."
                rows={2}
              />
            </div>
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
