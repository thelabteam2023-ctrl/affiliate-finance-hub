import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/hooks/useWorkspace";
import { useBookmakerSaldosQuery, useInvalidateBookmakerSaldos, type BookmakerSaldo } from "@/hooks/useBookmakerSaldosQuery";
import { useCurrencySnapshot, type SupportedCurrency } from "@/hooks/useCurrencySnapshot";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { 
  Calculator, 
  Save, 
  AlertCircle,
  CheckCircle2,
  XCircle,
  Trash2,
  Wallet,
  RotateCcw,
  ArrowLeftRight,
  Gift,
  Plus,
  ChevronDown,
  ChevronUp
} from "lucide-react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { RegistroApostaFields, RegistroApostaValues, getSuggestionsForTab } from "./RegistroApostaFields";
import { isAbaEstrategiaFixa, getEstrategiaFromTab } from "@/lib/apostaConstants";
import { detectarMoedaOperacao, calcularValorBRLReferencia, type MoedaOperacao } from "@/types/apostasUnificada";
import { MERCADOS_POR_ESPORTE, getMarketsForSport, getMarketsForSportAndModel, isMercadoCompativelComModelo, mercadoAdmiteEmpate, type ModeloAposta } from "@/lib/marketNormalizer";
import { 
  BookmakerSelectOption, 
  CurrencyBadge, 
  formatCurrency, 
  getCurrencySymbol, 
  getCurrencyTextColor 
} from "@/components/bookmakers/BookmakerSelectOption";
import { useProjetoConsolidacao } from "@/hooks/useProjetoConsolidacao";
import { 
  MultiCurrencyIndicator, 
  MultiCurrencyWarning 
} from "@/components/projeto-detalhe/MultiCurrencyIndicator";
import { updateBookmakerBalance } from "@/lib/bookmakerBalanceHelper";

// Interface local DEPRECATED - agora usamos BookmakerSaldo do hook canônico diretamente
interface LegacyBookmaker {
  id: string;
  nome: string;
  saldo_atual: number;
  saldo_freebet?: number;
  saldo_bonus?: number;
  saldo_operavel?: number;
  parceiro?: {
    nome: string;
  };
  bookmakers_catalogo?: {
    logo_url: string | null;
  } | null;
}

interface Surebet {
  id: string;
  data_operacao: string;
  evento: string;
  esporte: string;
  modelo: string;
  mercado?: string | null;
  stake_total: number;
  spread_calculado: number | null;
  roi_esperado: number | null;
  lucro_esperado: number | null;
  lucro_real: number | null;
  roi_real: number | null;
  status: string;
  resultado: string | null;
  observacoes: string | null;
}

interface SurebetDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projetoId: string;
  bookmakers?: LegacyBookmaker[]; // DEPRECATED: mantido para compatibilidade, ignorado internamente
  surebet: Surebet | null;
  onSuccess: () => void;
  activeTab?: string;
}

// Estrutura de entrada individual (fill) dentro de uma perna
export interface SurebetPernaEntry {
  bookmaker_id: string;
  bookmaker_nome: string;
  moeda: SupportedCurrency;
  odd: number;
  stake: number;
  stake_brl_referencia: number | null;
  cotacao_snapshot: number | null;
  cotacao_snapshot_at: string | null;
  // NOVO: Seleção/linha do mercado POR ENTRADA (cada entrada pode ter linha diferente)
  selecao_livre?: string;
}

// Estrutura de perna armazenada no JSONB da surebet (COM SUPORTE MULTI-ENTRADA)
export interface SurebetPerna {
  // Campos de identificação da posição
  selecao: string;
  selecao_livre: string;
  
  // NOVO: Array de entradas (múltiplas casas/odds na mesma posição)
  entries?: SurebetPernaEntry[];
  
  // Campos consolidados (calculados para múltiplas entradas)
  odd_media?: number;
  stake_total?: number;
  
  // Campos legados (usados quando entries está vazio/undefined)
  bookmaker_id: string;
  bookmaker_nome: string;
  moeda: SupportedCurrency;
  odd: number;
  stake: number;
  stake_brl_referencia: number | null;
  cotacao_snapshot: number | null;
  cotacao_snapshot_at: string | null;
  
  // Campos de resultado
  resultado: string | null;
  lucro_prejuizo: number | null;
  lucro_prejuizo_brl_referencia: number | null;
  gerou_freebet: boolean;
  valor_freebet_gerada: number | null;
}

// Estrutura de entrada individual no formulário (um fill)
interface OddFormEntry {
  bookmaker_id: string;
  moeda: SupportedCurrency;
  odd: string;
  stake: string;
  // NOVO: Seleção/linha do mercado por entrada
  selecaoLivre: string;
}

// Estrutura interna do formulário - mantendo compatibilidade
interface OddEntry {
  bookmaker_id: string;
  moeda: SupportedCurrency;
  odd: string;
  stake: string;
  selecao: string;
  selecaoLivre: string;
  isReference: boolean;
  isManuallyEdited: boolean;
  resultado?: string | null;
  lucro_prejuizo?: number | null;
  gerouFreebet?: boolean;
  valorFreebetGerada?: string;
  freebetStatus?: "PENDENTE" | "LIBERADA" | "NAO_LIBERADA" | null;
  index?: number;
  // NOVO: Entradas adicionais para esta perna (além da principal acima)
  additionalEntries?: OddFormEntry[];
}

// Função para calcular odd média ponderada de uma perna
function calcularOddMedia(mainEntry: { odd: string; stake: string }, additionalEntries?: OddFormEntry[]): number {
  const allEntries = [
    { odd: mainEntry.odd, stake: mainEntry.stake },
    ...(additionalEntries || [])
  ];
  
  const entriesValidas = allEntries.filter(e => {
    const odd = parseFloat(e.odd);
    const stake = parseFloat(e.stake);
    return !isNaN(odd) && odd > 1 && !isNaN(stake) && stake > 0;
  });
  
  if (entriesValidas.length === 0) return 0;
  if (entriesValidas.length === 1) return parseFloat(entriesValidas[0].odd);
  
  const somaStakeOdd = entriesValidas.reduce((acc, e) => {
    return acc + (parseFloat(e.stake) * parseFloat(e.odd));
  }, 0);
  
  const somaStake = entriesValidas.reduce((acc, e) => {
    return acc + parseFloat(e.stake);
  }, 0);
  
  return somaStake > 0 ? somaStakeOdd / somaStake : 0;
}

// Função para calcular stake total de uma perna
function calcularStakeTotal(mainEntry: { stake: string }, additionalEntries?: OddFormEntry[]): number {
  const mainStake = parseFloat(mainEntry.stake) || 0;
  const additionalStakes = (additionalEntries || []).reduce((acc, e) => {
    return acc + (parseFloat(e.stake) || 0);
  }, 0);
  return mainStake + additionalStakes;
}

const ESPORTES = [
  "Futebol", "Basquete", "Tênis", "Baseball", "Hockey", 
  "Futebol Americano", "Vôlei", "MMA/UFC", "Boxe", "Golfe",
  "League of Legends", "Counter-Strike", "Dota 2", "eFootball"
];

// Mapeamento semântico: mercado → seleções (posições da operação)
// Cada mercado define as labels corretas das posições
const SELECOES_POR_MERCADO: Record<string, string[]> = {
  // ========== FUTEBOL ==========
  "1X2": ["Casa", "Empate", "Fora"],
  "Dupla Chance": ["Casa/Empate", "Casa/Fora", "Empate/Fora"],
  "Ambas Marcam": ["Sim", "Não"],
  "Over/Under Gols": ["Over", "Under"],
  "Handicap Asiático": ["+ Handicap", "- Handicap"],
  "Resultado do 1º Tempo": ["Casa", "Empate", "Fora"],
  "Over/Under Escanteios": ["Over", "Under"],
  "Handicap de Gols": ["+ Handicap", "- Handicap"],
  "Resultado Final + Gols": ["Casa + Over", "Fora + Under"],
  "Placar Correto": ["Casa", "Fora"],
  
  // ========== BASQUETE ==========
  "Moneyline": ["Casa", "Fora"],
  "Handicap / Spread": ["+ Spread", "- Spread"],
  "Over/Under Pontos": ["Over", "Under"],
  "Total por Equipe": ["Over", "Under"],
  "Resultado 1º Tempo": ["Casa", "Empate", "Fora"], // Atualizado para suportar 3-way
  "Resultado Tempo Regulamentar": ["Casa", "Empate", "Fora"], // NOVO: 3-way
  "Resultado por Quarto": ["Casa", "Empate", "Fora"], // Atualizado para suportar 3-way
  "Handicap 1º Tempo": ["+ Spread", "- Spread"],
  "Over/Under 1º Tempo": ["Over", "Under"],
  "Props de Jogadores": ["Over", "Under"],
  "Same Game Parlay": ["Sim", "Não"],
  
  // ========== TÊNIS ==========
  "Vencedor da Partida": ["Jogador 1", "Jogador 2"],
  "Handicap de Games": ["+ Games", "- Games"],
  "Over/Under Games": ["Over", "Under"],
  "Vencedor do Set": ["Jogador 1", "Jogador 2"],
  "Placar Exato": ["Jogador 1", "Jogador 2"],
  "Total de Sets": ["Over", "Under"],
  "Handicap de Sets": ["+ Sets", "- Sets"],
  "Vencedor do 1º Set": ["Jogador 1", "Jogador 2"],
  "Tie-break (Sim/Não)": ["Sim", "Não"],
  "Sets Ímpares/Pares": ["Ímpar", "Par"],
  
  // ========== BASEBALL ==========
  "Run Line": ["+ Runs", "- Runs"],
  "Total de Runs": ["Over", "Under"],
  "Resultado após 9 Innings": ["Casa", "Empate", "Fora"], // NOVO: 3-way
  "Resultado 5 Innings": ["Casa", "Empate", "Fora"], // NOVO: 3-way
  "Resultado por Inning": ["Casa", "Empate", "Fora"], // Atualizado para suportar 3-way
  "1ª Metade": ["Casa", "Fora"],
  "Handicap": ["+ Handicap", "- Handicap"],
  "Props de Arremessadores": ["Over", "Under"],
  "Odd/Even Runs": ["Ímpar", "Par"],
  "Hits Totais": ["Over", "Under"],
  
  // ========== HOCKEY ==========
  "Puck Line": ["+ Puck", "- Puck"],
  "Total de Gols": ["Over", "Under"],
  "Resultado por Período": ["Casa", "Empate", "Fora"], // Atualizado para suportar 3-way
  "1º Período": ["Casa", "Fora"],
  "Margem de Vitória": ["Casa", "Fora"],
  "Over/Under Períodos": ["Over", "Under"],
  "Gols Ímpares/Pares": ["Ímpar", "Par"],
  
  // ========== FUTEBOL AMERICANO ==========
  "Spread": ["+ Spread", "- Spread"],
  "Total de Pontos": ["Over", "Under"],
  "Touchdowns": ["Over", "Under"],
  
  // ========== VÔLEI ==========
  "Over/Under Sets": ["Over", "Under"],
  "Resultado por Set": ["Time 1", "Time 2"],
  "Placar Exato (Sets)": ["Time 1", "Time 2"],
  "Handicap de Pontos": ["+ Pontos", "- Pontos"],
  "Primeiro Set": ["Time 1", "Time 2"],
  "Over/Under Pontos Set": ["Over", "Under"],
  
  // ========== MMA / BOXE ==========
  "Vencedor da Luta": ["Lutador 1", "Lutador 2"],
  "Método de Vitória": ["KO/TKO", "Decisão"],
  "Round da Finalização": ["Round 1-2", "Round 3+"],
  "Over/Under Rounds": ["Over", "Under"],
  "Luta Completa (Sim/Não)": ["Sim", "Não"],
  "Vitória por KO": ["Sim", "Não"],
  "Vitória por Decisão": ["Sim", "Não"],
  "Handicap de Rounds": ["+ Rounds", "- Rounds"],
  "Round 1 – Vencedor": ["Lutador 1", "Lutador 2"],
  "Prop Especial": ["Sim", "Não"],
  
  // ========== GOLFE ==========
  "Vencedor do Torneio": ["Jogador 1", "Jogador 2"],
  "Top 5/10/20": ["Sim", "Não"],
  "Head-to-Head": ["Jogador 1", "Jogador 2"],
  "Melhor Round": ["Jogador 1", "Jogador 2"],
  "Nacionalidade do Vencedor": ["Opção 1", "Opção 2"],
  "Primeiro Líder": ["Jogador 1", "Jogador 2"],
  "Fazer Cut (Sim/Não)": ["Sim", "Não"],
  "Over/Under Score": ["Over", "Under"],
  "Hole-in-One no Torneio": ["Sim", "Não"],
  
  // ========== ESPORTS (LoL, CS, Dota, eFootball) ==========
  "Vencedor do Mapa": ["Time 1", "Time 2"],
  "Handicap de Mapas": ["+ Mapas", "- Mapas"],
  "Total de Mapas": ["Over", "Under"],
  "Vencedor da Série": ["Time 1", "Time 2"],
  "Over/Under Kills": ["Over", "Under"],
  "Primeiro Objetivo": ["Time 1", "Time 2"],
  "Total de Torres": ["Over", "Under"],
  "Handicap de Kills": ["+ Kills", "- Kills"],
  "Props Especiais": ["Sim", "Não"],
  "Primeiro a 10 Rounds": ["Time 1", "Time 2"],
  "Total de Kills": ["Over", "Under"],
  "Total de Escanteios": ["Over", "Under"],
  
  // ========== GENÉRICOS ==========
  "Vencedor": ["Time 1", "Time 2"],
  "Over": ["Over", "Under"],
  "Under": ["Over", "Under"],
  "Outro": ["Opção 1", "Opção 2"]
};

const getSelecoesPorMercado = (mercado: string, modelo: "1-X-2" | "1-2"): string[] => {
  // 1-X-2 sempre é Casa, Empate, Fora - fixo para 3 posições
  if (modelo === "1-X-2") {
    // Alguns mercados têm seleções específicas para 3-way
    const mercados3Way: Record<string, string[]> = {
      "1X2": ["Casa", "Empate", "Fora"],
      "Resultado do 1º Tempo": ["Casa", "Empate", "Fora"],
      "Dupla Chance": ["Casa/Empate", "Casa/Fora", "Empate/Fora"],
    };
    return mercados3Way[mercado] || ["Casa", "Empate", "Fora"];
  }
  
  // Para modelo binário, usar mapeamento do mercado
  if (mercado && SELECOES_POR_MERCADO[mercado]) {
    const selecoes = SELECOES_POR_MERCADO[mercado];
    // Retornar apenas 2 seleções para modelo binário
    return selecoes.slice(0, 2);
  }
  
  // Fallback para binário
  return ["Sim", "Não"];
};

export function SurebetDialog({ open, onOpenChange, projetoId, bookmakers, surebet, onSuccess, activeTab = 'surebet' }: SurebetDialogProps) {
  const isEditing = !!surebet;
  const { workspaceId } = useWorkspace();
  
  // ========== HOOK DE MULTI-MOEDA ==========
  const { getSnapshotFields, isForeignCurrency, formatCurrency: formatCurrencySnapshot } = useCurrencySnapshot();
  
  // ========== HOOK DE CONSOLIDAÇÃO DO PROJETO ==========
  const {
    moedaConsolidacao,
    fonteCotacao,
    cotacaoAtual,
    ptaxAtual,
    deltaCambial,
    isMultiCurrency: checkMultiCurrency,
    gerarDadosConsolidacao,
  } = useProjetoConsolidacao({ projetoId });
  
  // ========== HOOK CANÔNICO DE SALDOS ==========
  // Esta é a ÚNICA fonte de verdade para saldos de bookmaker
  const { 
    data: bookmakerSaldos = [], 
    isLoading: saldosLoading,
    refetch: refetchSaldos 
  } = useBookmakerSaldosQuery({
    projetoId,
    enabled: open,
    includeZeroBalance: isEditing, // Em edição, mostrar todos
  });
  const invalidateSaldos = useInvalidateBookmakerSaldos();
  
  // Form state
  const [evento, setEvento] = useState("");
  const [mercado, setMercado] = useState("");
  const [esporte, setEsporte] = useState("Futebol");
  const [modelo, setModelo] = useState<"1-X-2" | "1-2">("1-2");
  const [observacoes, setObservacoes] = useState("");
  const [saving, setSaving] = useState(false);
  
  // Registro explícito - usa sugestões baseadas na aba ativa
  // Forma de registro é sempre ARBITRAGEM, estratégia e contexto vêm da aba
  const [registroValues, setRegistroValues] = useState<RegistroApostaValues>(() => {
    const suggestions = getSuggestionsForTab(activeTab);
    return {
      forma_registro: 'ARBITRAGEM',
      estrategia: suggestions.estrategia || 'SUREBET',
      contexto_operacional: suggestions.contexto_operacional || 'NORMAL',
    };
  });
  
  // Arredondamento de stakes - ativado por padrão
  const [arredondarAtivado, setArredondarAtivado] = useState(true);
  const [arredondarValor, setArredondarValor] = useState("1");
  
  // Odds entries (2 for binary, 3 for 1X2)
  const [odds, setOdds] = useState<OddEntry[]>([
    { bookmaker_id: "", moeda: "BRL", odd: "", stake: "", selecao: "Sim", selecaoLivre: "", isReference: true, isManuallyEdited: false, additionalEntries: [] },
    { bookmaker_id: "", moeda: "BRL", odd: "", stake: "", selecao: "Não", selecaoLivre: "", isReference: false, isManuallyEdited: false, additionalEntries: [] }
  ]);
  
  // Apostas vinculadas para edição
  const [linkedApostas, setLinkedApostas] = useState<any[]>([]);
  
  // Estado para controlar expansão de resultados avançados por perna
  const [expandedResultados, setExpandedResultados] = useState<Record<number, boolean>>({});

  // Filtrar bookmakers com saldo operável >= 0.50 (usando dados canônicos)
  const bookmakersDisponiveis = useMemo(() => {
    return bookmakerSaldos.filter((bk) => bk.saldo_operavel >= 0.50);
  }, [bookmakerSaldos]);

  // Inicializar formulário - SEMPRE resetar ao abrir sem surebet
  useEffect(() => {
    if (open) {
      // O hook canônico já refetch automaticamente quando open=true
      if (surebet && surebet.id) {
        // Modo edição: carregar dados da surebet existente
        setEvento(surebet.evento);
        setEsporte(surebet.esporte);
        setModelo(surebet.modelo as "1-X-2" | "1-2");
        setMercado(surebet.mercado || "");
        setObservacoes(surebet.observacoes || "");
        // Buscar apostas vinculadas passando o modelo correto
        fetchLinkedPernas(surebet.id, surebet.modelo);
      } else {
        // CRÍTICO: Modo criação - SEMPRE resetar o formulário completamente
        resetForm();
        setLinkedApostas([]);
      }
    }
  }, [open, surebet]); // Usar surebet diretamente para detectar mudanças de null<->objeto
  
  // Limpar estado quando dialog fecha
  useEffect(() => {
    if (!open) {
      // Aguardar a animação de fechamento antes de resetar
      const timer = setTimeout(() => {
        resetForm();
        setLinkedApostas([]);
      }, 150);
      return () => clearTimeout(timer);
    }
  }, [open]);

  // Atualizar array de odds quando modelo muda
  // TAMBÉM resetar mercado se incompatível com novo modelo
  useEffect(() => {
    if (!isEditing) {
      // Verificar se mercado atual é compatível com novo modelo PARA O ESPORTE SELECIONADO
      if (mercado && !isMercadoCompativelComModelo(mercado, modelo, esporte)) {
        setMercado(""); // Resetar mercado incompatível
      }
      
      const selecoes = getSelecoesPorMercado(mercado, modelo);
      // Ajustar número de odds baseado APENAS no modelo escolhido
      const numSlots = modelo === "1-X-2" ? 3 : 2;
      const currentNumSlots = odds.length;
      
      // Só atualizar se o número de slots mudou
      if (numSlots !== currentNumSlots) {
        const newSelecoes = selecoes.slice(0, numSlots);
        // Preencher com fallback se necessário
        while (newSelecoes.length < numSlots) {
          newSelecoes.push(modelo === "1-X-2" ? ["Casa", "Empate", "Fora"][newSelecoes.length] : ["Opção 1", "Opção 2"][newSelecoes.length]);
        }
        setOdds(newSelecoes.map((sel, i) => ({
          bookmaker_id: "",
          moeda: "BRL" as SupportedCurrency,
          odd: "",
          stake: "",
          selecao: sel,
          selecaoLivre: "",
          isReference: i === 0,
          isManuallyEdited: false,
          additionalEntries: []
        })));
      } else {
        // Apenas atualizar as seleções mantendo dados existentes
        const newSelecoes = selecoes.slice(0, numSlots);
        while (newSelecoes.length < numSlots) {
          newSelecoes.push(modelo === "1-X-2" ? ["Casa", "Empate", "Fora"][newSelecoes.length] : ["Opção 1", "Opção 2"][newSelecoes.length]);
        }
        setOdds(prev => prev.map((o, i) => ({
          ...o,
          selecao: newSelecoes[i] || o.selecao
        })));
      }
    }
  }, [modelo, esporte, isEditing]); // Adicionado esporte como dependência
  
  // Atualizar seleções quando mercado muda (sem afetar modelo)
  useEffect(() => {
    if (!isEditing && mercado) {
      const selecoes = getSelecoesPorMercado(mercado, modelo);
      const numSlots = modelo === "1-X-2" ? 3 : 2;
      const newSelecoes = selecoes.slice(0, numSlots);
      while (newSelecoes.length < numSlots) {
        newSelecoes.push(modelo === "1-X-2" ? ["Casa", "Empate", "Fora"][newSelecoes.length] : ["Opção 1", "Opção 2"][newSelecoes.length]);
      }
      setOdds(prev => prev.map((o, i) => ({
        ...o,
        selecao: newSelecoes[i] || o.selecao
      })));
    }
  }, [mercado]);

  const resetForm = () => {
    setEvento("");
    setMercado("");
    setEsporte("Futebol");
    setModelo("1-2");
    setObservacoes("");
    setArredondarAtivado(true);
    setArredondarValor("1");
    const defaultSelecoes = getSelecoesPorMercado("", "1-2");
    setOdds(defaultSelecoes.map((sel, i) => ({
      bookmaker_id: "", moeda: "BRL" as SupportedCurrency, odd: "", stake: "", selecao: sel, selecaoLivre: "", isReference: i === 0, isManuallyEdited: false, additionalEntries: []
    })));
    setLinkedApostas([]);
    setExpandedResultados({}); // Reset expansão de resultados avançados
    // Reset registro values - usa sugestões baseadas na aba ativa
    const suggestions = getSuggestionsForTab(activeTab);
    setRegistroValues({
      forma_registro: 'ARBITRAGEM',
      estrategia: suggestions.estrategia || 'SUREBET',
      contexto_operacional: suggestions.contexto_operacional || 'NORMAL',
    });
  };
  
  // Função de arredondamento
  const arredondarStake = (valor: number): number => {
    if (!arredondarAtivado) return valor;
    const fator = parseFloat(arredondarValor) || 1;
    return Math.round(valor / fator) * fator;
  };

  // Ordem fixa para cada modelo - nunca muda
  const getOrdemFixa = (modelo: "1-X-2" | "1-2"): string[] => {
    return modelo === "1-X-2" 
      ? ["Casa", "Empate", "Fora"] 
      : ["Sim", "Não"];
  };

  // Carregar pernas do JSONB da operação (nova tabela unificada)
  const fetchLinkedPernas = async (surebetId: string, surebetModelo: string) => {
    const { data: operacaoData } = await supabase
      .from("apostas_unificada")
      .select("pernas")
      .eq("id", surebetId)
      .single();
    
    if (!operacaoData?.pernas || !Array.isArray(operacaoData.pernas) || operacaoData.pernas.length === 0) {
      setLinkedApostas([]);
      return;
    }

    const pernas = operacaoData.pernas as unknown as SurebetPerna[];
    
    // Ordenar pela ordem fixa do modelo
    const ordemFixa = getOrdemFixa(surebetModelo as "1-X-2" | "1-2");
    const sortedPernas = [...pernas].sort((a, b) => {
      const indexA = ordemFixa.indexOf(a.selecao);
      const indexB = ordemFixa.indexOf(b.selecao);
      if (indexA === -1 && indexB === -1) return 0;
      if (indexA === -1) return 1;
      if (indexB === -1) return -1;
      return indexA - indexB;
    });
    
    // Converter para formato de linkedApostas para compatibilidade
    const apostaLikeData = sortedPernas.map((perna, idx) => ({
      id: `perna-${idx}`,
      selecao: perna.selecao,
      odd: perna.odd,
      stake: perna.stake,
      resultado: perna.resultado,
      lucro_prejuizo: perna.lucro_prejuizo,
      bookmaker_id: perna.bookmaker_id,
      gerou_freebet: perna.gerou_freebet,
      valor_freebet_gerada: perna.valor_freebet_gerada,
      bookmaker: { nome: perna.bookmaker_nome, saldo_atual: 0 }
    }));
    
    setLinkedApostas(apostaLikeData);
    
    // Popular o array de odds com os dados das pernas para cálculos
    const newOdds: OddEntry[] = sortedPernas.map((perna, index) => ({
      bookmaker_id: perna.bookmaker_id || "",
      moeda: (perna.moeda || "BRL") as SupportedCurrency,
      odd: perna.odd?.toString() || "",
      stake: perna.stake?.toString() || "",
      selecao: perna.selecao,
      selecaoLivre: perna.selecao_livre || "",
      isReference: index === 0,
      isManuallyEdited: true,
      resultado: perna.resultado,
      lucro_prejuizo: perna.lucro_prejuizo,
      gerouFreebet: perna.gerou_freebet || false,
      valorFreebetGerada: perna.valor_freebet_gerada?.toString() || "",
      index,
      // Carregar entradas adicionais se existirem (com selecaoLivre por entrada)
      additionalEntries: perna.entries?.slice(1).map(e => ({
        bookmaker_id: e.bookmaker_id,
        moeda: e.moeda,
        odd: e.odd.toString(),
        stake: e.stake.toString(),
        selecaoLivre: e.selecao_livre || ""
      })) || []
    }));
    
    setOdds(newOdds);
  };

  const updateOdd = (index: number, field: keyof OddEntry, value: string | boolean) => {
    const newOdds = [...odds];
    newOdds[index] = { ...newOdds[index], [field]: value };
    
    // Quando bookmaker muda, atualizar também a moeda
    if (field === "bookmaker_id" && typeof value === "string") {
      const selectedBk = bookmakerSaldos.find(b => b.id === value);
      newOdds[index].moeda = (selectedBk?.moeda as SupportedCurrency) || "BRL";
    }
    
    // Se está definindo referência, remover das outras
    if (field === "isReference" && value === true) {
      newOdds.forEach((o, i) => {
        if (i !== index) {
          o.isReference = false;
        }
      });
    }
    
    // NOVO COMPORTAMENTO: Nunca marcar como editado manualmente
    // A referência sempre é o driver dos cálculos
    // Alterar stake NÃO desativa o cálculo automático
    
    setOdds(newOdds);
  };

  // Atualizar campos de freebet de uma posição
  const updateOddFreebet = (index: number, gerouFreebet: boolean, valorFreebetGerada?: string) => {
    const newOdds = [...odds];
    // Se ativando freebet nesta posição, desativar nas outras
    if (gerouFreebet) {
      newOdds.forEach((o, i) => {
        if (i !== index) {
          o.gerouFreebet = false;
          o.valorFreebetGerada = "";
        }
      });
    }
    newOdds[index] = { 
      ...newOdds[index], 
      gerouFreebet,
      valorFreebetGerada: valorFreebetGerada !== undefined ? valorFreebetGerada : newOdds[index].valorFreebetGerada
    };
    setOdds(newOdds);
  };

  const setReferenceIndex = (index: number) => {
    const newOdds = odds.map((o, i) => ({
      ...o,
      isReference: i === index,
      // Ao mudar referência, resetar isManuallyEdited dos outros para permitir recálculo
      isManuallyEdited: i === index ? o.isManuallyEdited : false
    }));
    setOdds(newOdds);
  };

  const resetStakeToCalculated = (index: number, calculatedValue: number) => {
    const newOdds = [...odds];
    newOdds[index] = { 
      ...newOdds[index], 
      stake: calculatedValue > 0 ? calculatedValue.toFixed(2) : "",
      isManuallyEdited: false 
    };
    setOdds(newOdds);
  };

  // Função para trocar seleções entre duas posições
  const swapSelecoes = (indexA: number, indexB: number) => {
    const newOdds = [...odds];
    const selecaoA = newOdds[indexA].selecao;
    newOdds[indexA].selecao = newOdds[indexB].selecao;
    newOdds[indexB].selecao = selecaoA;
    setOdds(newOdds);
  };

  // ========== FUNÇÕES PARA MÚLTIPLAS ENTRADAS ==========
  
  // Adicionar entrada adicional a uma perna (com replicação inteligente de selecaoLivre)
  const addAdditionalEntry = (pernaIndex: number) => {
    const newOdds = [...odds];
    const currentEntries = newOdds[pernaIndex].additionalEntries || [];
    // Replicar selecaoLivre da entrada principal como sugestão
    const mainSelecaoLivre = newOdds[pernaIndex].selecaoLivre || "";
    newOdds[pernaIndex].additionalEntries = [
      ...currentEntries,
      { bookmaker_id: "", moeda: "BRL" as SupportedCurrency, odd: "", stake: "", selecaoLivre: mainSelecaoLivre }
    ];
    setOdds(newOdds);
  };

  // Remover entrada adicional de uma perna
  const removeAdditionalEntry = (pernaIndex: number, entryIndex: number) => {
    const newOdds = [...odds];
    const currentEntries = newOdds[pernaIndex].additionalEntries || [];
    newOdds[pernaIndex].additionalEntries = currentEntries.filter((_, i) => i !== entryIndex);
    setOdds(newOdds);
  };

  // Atualizar campo de uma entrada adicional
  const updateAdditionalEntry = (
    pernaIndex: number, 
    entryIndex: number, 
    field: keyof OddFormEntry, 
    value: string
  ) => {
    const newOdds = [...odds];
    const currentEntries = [...(newOdds[pernaIndex].additionalEntries || [])];
    currentEntries[entryIndex] = { ...currentEntries[entryIndex], [field]: value };
    
    // Atualizar moeda quando bookmaker muda
    if (field === "bookmaker_id") {
      const selectedBk = bookmakerSaldos.find(b => b.id === value);
      currentEntries[entryIndex].moeda = (selectedBk?.moeda as SupportedCurrency) || "BRL";
    }
    
    newOdds[pernaIndex].additionalEntries = currentEntries;
    setOdds(newOdds);
  };

  // Verificar se perna tem múltiplas entradas
  const hasMultipleEntries = (entry: OddEntry): boolean => {
    return (entry.additionalEntries?.length || 0) > 0;
  };

  // Obter odd média de uma perna (considerando entradas adicionais)
  const getOddMediaPerna = (entry: OddEntry): number => {
    return calcularOddMedia(
      { odd: entry.odd, stake: entry.stake },
      entry.additionalEntries
    );
  };

  // Obter stake total de uma perna (considerando entradas adicionais)
  const getStakeTotalPerna = (entry: OddEntry): number => {
    return calcularStakeTotal(
      { stake: entry.stake },
      entry.additionalEntries
    );
  };

  // Auto-preencher stakes baseado na posição de referência
  // COMPORTAMENTO CORRIGIDO: Usa ODD MÉDIA PONDERADA e STAKE TOTAL CONSOLIDADO 
  // quando há múltiplas entradas (coberturas) na perna de referência
  useEffect(() => {
    // Não recalcular em modo edição
    if (isEditing) return;
    
    const refIndex = odds.findIndex(o => o.isReference);
    if (refIndex === -1) return;
    
    const refEntry = odds[refIndex];
    
    // CORREÇÃO CRÍTICA: Usar stake total e odd média consolidados da perna de referência
    const refStakeTotal = getStakeTotalPerna(refEntry);
    const refOddMedia = getOddMediaPerna(refEntry);
    
    // Contar pernas com odd válida (usando odd média se houver coberturas)
    const validOddsCount = odds.filter(o => {
      const oddMedia = getOddMediaPerna(o);
      return oddMedia > 1;
    }).length;
    
    // Só calcular se temos stake de referência, odd válida e pelo menos 2 odds válidas
    if (refStakeTotal <= 0 || refOddMedia <= 1 || validOddsCount < 2) return;
    
    // FÓRMULA CORRIGIDA: Retorno alvo usa valores consolidados da perna de referência
    // targetReturn = stakeTotal_perna_ref × oddMedia_perna_ref
    const targetReturn = refStakeTotal * refOddMedia;
    
    // Recalcular TODAS as stakes não-referência sempre que referência ou odds mudam
    let needsUpdate = false;
    const newOdds = odds.map((o, i) => {
      // Nunca modificar a referência
      if (i === refIndex) return o;
      
      // CORREÇÃO: Usar odd média ponderada da perna (não a odd simples)
      const oddMedia = getOddMediaPerna(o);
      
      if (oddMedia > 1) {
        // stakeOutro = targetReturn / oddMedia_perna
        const rawStake = targetReturn / oddMedia;
        const calculatedStake = arredondarStake(rawStake);
        const currentStake = parseFloat(o.stake) || 0;
        
        // Só atualizar se o valor calculado for diferente do atual
        if (Math.abs(calculatedStake - currentStake) > 0.01) {
          needsUpdate = true;
          return { ...o, stake: calculatedStake.toFixed(2) };
        }
      }
      return o;
    });
    
    if (needsUpdate) {
      setOdds(newOdds);
    }
  }, [
    // Dependências: recalcular quando qualquer odd ou stake mudar (incluindo additionalEntries)
    odds.map(o => `${o.odd}-${o.stake}-${(o.additionalEntries || []).map(ae => `${ae.odd}-${ae.stake}`).join('|')}`).join(','),
    // Quando a referência mudar
    odds.map(o => o.isReference).join(','),
    // Configurações de arredondamento
    arredondarAtivado,
    arredondarValor,
    // Modo edição
    isEditing
  ]);

  // Obter saldo operável da casa selecionada (usando dados canônicos)
  const getBookmakerSaldoLivre = (bookmakerId: string): number | null => {
    const bk = bookmakerSaldos.find(b => b.id === bookmakerId);
    if (!bk) return null;
    // O saldo_operavel já vem calculado corretamente da RPC canônica
    return bk.saldo_operavel;
  };

  // Calcular saldo disponível para uma posição específica (considerando stakes usadas em outras posições da mesma operação)
  // ESTENDIDO: Agora considera também additionalEntries de todas as pernas
  const getSaldoDisponivelParaPosicao = (bookmakerId: string, currentIndex: number, currentAdditionalIndex?: number): number | null => {
    if (!bookmakerId) return null;
    
    const saldoLivreBase = getBookmakerSaldoLivre(bookmakerId);
    if (saldoLivreBase === null) return null;
    
    // Somar todas as stakes usadas em outras posições da operação atual que usam a mesma casa
    let stakesUsadas = 0;
    
    odds.forEach((entry, pernaIdx) => {
      // Entrada principal da perna
      if (entry.bookmaker_id === bookmakerId) {
        // Se não é a posição atual (ou se estamos em uma additionalEntry)
        if (pernaIdx !== currentIndex || currentAdditionalIndex !== undefined) {
          stakesUsadas += parseFloat(entry.stake) || 0;
        }
      }
      
      // Entradas adicionais da perna
      (entry.additionalEntries || []).forEach((ae, aeIdx) => {
        if (ae.bookmaker_id === bookmakerId) {
          // Se não é a entrada adicional atual
          if (!(pernaIdx === currentIndex && currentAdditionalIndex === aeIdx)) {
            stakesUsadas += parseFloat(ae.stake) || 0;
          }
        }
      });
    });
    
    return saldoLivreBase - stakesUsadas;
  };

  // Calcular saldo disponível para uma entrada adicional específica
  const getSaldoDisponivelParaAdditionalEntry = (bookmakerId: string, pernaIndex: number, additionalIndex: number): number | null => {
    return getSaldoDisponivelParaPosicao(bookmakerId, pernaIndex, additionalIndex);
  };

  // Verificar se há inconsistência de saldo em alguma posição (APENAS para criação, não edição)
  // ESTENDIDO: Agora verifica também additionalEntries
  const hasBalanceInconsistency = useMemo(() => {
    // No modo edição, não verificar inconsistências de saldo
    if (isEditing) return false;
    
    for (let i = 0; i < odds.length; i++) {
      const entry = odds[i];
      
      // Verificar entrada principal
      if (entry.bookmaker_id) {
        const stake = parseFloat(entry.stake) || 0;
        if (stake > 0) {
          const saldoDisponivel = getSaldoDisponivelParaPosicao(entry.bookmaker_id, i);
          if (saldoDisponivel !== null && stake > saldoDisponivel + 0.01) {
            return true;
          }
        }
      }
      
      // Verificar entradas adicionais
      const additionalEntries = entry.additionalEntries || [];
      for (let j = 0; j < additionalEntries.length; j++) {
        const ae = additionalEntries[j];
        if (ae.bookmaker_id) {
          const stake = parseFloat(ae.stake) || 0;
          if (stake > 0) {
            const saldoDisponivel = getSaldoDisponivelParaAdditionalEntry(ae.bookmaker_id, i, j);
            if (saldoDisponivel !== null && stake > saldoDisponivel + 0.01) {
              return true;
            }
          }
        }
      }
    }
    return false;
  }, [
    // Dependências explícitas para garantir reatividade (incluindo additionalEntries)
    odds.map(o => `${o.bookmaker_id}|${o.stake}|${(o.additionalEntries || []).map(ae => `${ae.bookmaker_id}|${ae.stake}`).join(';')}`).join(','),
    bookmakerSaldos.map(b => `${b.id}|${b.saldo_operavel}`).join(','),
    isEditing
  ]);

  const getBookmakerNome = (bookmakerId: string): string => {
    const bk = bookmakerSaldos.find(b => b.id === bookmakerId);
    if (!bk) return "";
    const parceiroNome = bk.parceiro_nome?.split(" ");
    const shortName = parceiroNome 
      ? `${parceiroNome[0]} ${parceiroNome[parceiroNome.length - 1] || ""}`.trim()
      : "";
    return shortName ? `${bk.nome} - ${shortName}` : bk.nome;
  };

  // NOTA: formatCurrency e getCurrencySymbol são importados de BookmakerSelectOption

  // Cálculos em tempo real - TOTALMENTE reativo aos inputs atuais
  // NOVO COMPORTAMENTO: Calcular todos os cenários com ROI máximo/mínimo e risco
  // DEPENDÊNCIAS EXPLÍCITAS: odds (valores), bookmakers (saldos), saldosEmAposta, contexto
  // REFATORADO: Agora considera TODAS as entradas de cada perna (principal + coberturas)
  const analysis = useMemo(() => {
    // ============ CONSOLIDAÇÃO POR PERNA ============
    // Para cada perna, calcular odd média ponderada e stake total
    // considerando entrada principal + entradas adicionais (coberturas)
    const consolidatedPerPerna = odds.map(perna => {
      const oddMedia = calcularOddMedia(
        { odd: perna.odd, stake: perna.stake },
        perna.additionalEntries
      );
      const stakeTotal = calcularStakeTotal(
        { stake: perna.stake },
        perna.additionalEntries
      );
      return { oddMedia, stakeTotal };
    });
    
    // Odds e stakes consolidadas por perna (para cálculos)
    const parsedOdds = consolidatedPerPerna.map(c => c.oddMedia);
    const actualStakes = consolidatedPerPerna.map(c => c.stakeTotal);
    
    const validOddsCount = parsedOdds.filter(o => o > 1).length;
    
    // ============ MULTI-MOEDA: Detectar moedas da operação ============
    // Coletar moedas de TODAS as entradas (principal + coberturas)
    const moedasSelecionadas: SupportedCurrency[] = [];
    odds.forEach(perna => {
      if (perna.bookmaker_id) {
        moedasSelecionadas.push(perna.moeda);
      }
      (perna.additionalEntries || []).forEach(entry => {
        if (entry.bookmaker_id) {
          const bk = bookmakerSaldos.find(b => b.id === entry.bookmaker_id);
          if (bk) {
            moedasSelecionadas.push(bk.moeda as SupportedCurrency);
          }
        }
      });
    });
    
    const moedasUnicas = [...new Set(moedasSelecionadas.filter(Boolean))];
    const isMultiCurrency = moedasUnicas.length > 1;
    const moedaDominante: SupportedCurrency = moedasUnicas.length === 1 ? moedasUnicas[0] : "BRL";
    
    // Probabilidades implícitas (baseadas em odds consolidadas)
    const impliedProbs = parsedOdds.map(odd => odd > 1 ? 1 / odd : 0);
    const totalImpliedProb = impliedProbs.reduce((a, b) => a + b, 0);
    
    // Spread = (Overround - 1) * 100 (positivo = margem casa, negativo = arbitragem)
    const overround = totalImpliedProb;
    const spread = totalImpliedProb > 0 ? (totalImpliedProb - 1) * 100 : 0;
    
    // Probabilidades reais (normalizadas)
    const trueProbs = totalImpliedProb > 0 
      ? impliedProbs.map(p => p / totalImpliedProb)
      : impliedProbs.map(() => 0);
    
    // Verificar arbitragem teórica (overround < 1)
    const hasArbitrage = validOddsCount >= 2 && totalImpliedProb < 1 && totalImpliedProb > 0;
    
    // Stakes calculadas para sugestão (quando há referência)
    const refIndex = odds.findIndex(o => o.isReference);
    const refOdd = parsedOdds[refIndex] || 0;
    const refStakeValue = actualStakes[refIndex] || 0;
    
    // Calcular stakes sugeridas baseado na referência
    // Fórmula: stakeOutro = (stakeRef * oddRef) / oddOutro
    let suggestedStakes: number[] = [];
    if (refStakeValue > 0 && refOdd > 1 && validOddsCount >= 2) {
      const targetReturn = refStakeValue * refOdd;
      suggestedStakes = parsedOdds.map((odd, i) => {
        if (i === refIndex) return refStakeValue;
        if (odd > 1) {
          const rawStake = targetReturn / odd;
          return arredondarStake(rawStake);
        }
        return 0;
      });
    }
    
    // StakeTotal = soma de todas as stakes consolidadas de cada perna
    // NOTA: Só somamos se todas são da mesma moeda; caso contrário a soma não tem significado
    const stakeTotal = isMultiCurrency ? 0 : actualStakes.reduce((a, b) => a + b, 0);
    
    // Calcular saldos disponíveis por posição para validação
    // REFATORADO: Considerar stakes de TODAS as entradas de cada perna
    const saldosPorPosicao = odds.map((entry, idx) => {
      // Para pernas com múltiplas entradas, precisamos calcular saldo por entrada
      // Aqui retornamos o saldo mais limitante
      const allEntriesInPerna = [
        { bookmaker_id: entry.bookmaker_id, stake: parseFloat(entry.stake) || 0 },
        ...((entry.additionalEntries || []).map(e => ({
          bookmaker_id: e.bookmaker_id,
          stake: parseFloat(e.stake) || 0
        })))
      ].filter(e => e.bookmaker_id);
      
      if (allEntriesInPerna.length === 0) return null;
      
      // Para cada bookmaker usado nesta perna, calcular saldo disponível
      const saldosPorBk: Record<string, number> = {};
      allEntriesInPerna.forEach(e => {
        if (!saldosPorBk[e.bookmaker_id]) {
          const bk = bookmakerSaldos.find(b => b.id === e.bookmaker_id);
          if (bk) {
            let saldoLivre = bk.saldo_operavel;
            // Descontar stakes usadas em OUTRAS pernas pelo mesmo bookmaker
            odds.forEach((outraPerna, outroIdx) => {
              if (outroIdx !== idx) {
                if (outraPerna.bookmaker_id === e.bookmaker_id) {
                  saldoLivre -= parseFloat(outraPerna.stake) || 0;
                }
                (outraPerna.additionalEntries || []).forEach(ae => {
                  if (ae.bookmaker_id === e.bookmaker_id) {
                    saldoLivre -= parseFloat(ae.stake) || 0;
                  }
                });
              }
            });
            saldosPorBk[e.bookmaker_id] = saldoLivre;
          }
        }
      });
      
      // Verificar se cada entrada tem saldo suficiente
      let menorSaldoDisponivel = Infinity;
      allEntriesInPerna.forEach(e => {
        const saldoDisp = saldosPorBk[e.bookmaker_id] ?? 0;
        const sobra = saldoDisp - e.stake;
        if (sobra < menorSaldoDisponivel) {
          menorSaldoDisponivel = sobra;
        }
      });
      
      return menorSaldoDisponivel === Infinity ? null : menorSaldoDisponivel;
    });
    
    // Saldo total operável das casas selecionadas
    const saldoTotalOperavel = saldosPorPosicao.reduce((acc, saldo) => 
      saldo !== null ? acc + Math.max(0, saldo) : acc, 0
    );
    
    // Calcular cenários de retorno/lucro para CADA resultado possível
    // REFATORADO: Usar odd média e stake total consolidados por perna
    const scenarios = parsedOdds.map((odd, i) => {
      const stakeNesseLado = actualStakes[i];
      const retorno = odd > 1 ? stakeNesseLado * odd : 0;
      const lucro = retorno - stakeTotal;
      const roi = stakeTotal > 0 ? (lucro / stakeTotal) * 100 : 0;
      return {
        selecao: odds[i].selecao,
        stake: stakeNesseLado,
        oddMedia: odd,
        retorno,
        lucro,
        roi,
        isPositive: lucro >= 0,
        saldoDisponivel: saldosPorPosicao[i]
      };
    });
    
    // Calcular métricas agregadas dos cenários
    const lucros = scenarios.map(s => s.lucro);
    const rois = scenarios.map(s => s.roi);
    
    const minLucro = lucros.length > 0 ? Math.min(...lucros) : 0;
    const maxLucro = lucros.length > 0 ? Math.max(...lucros) : 0;
    const minRoi = rois.length > 0 ? Math.min(...rois) : 0;
    const maxRoi = rois.length > 0 ? Math.max(...rois) : 0;
    
    // Lucro garantido = menor lucro (se positivo = arbitragem garantida)
    const guaranteedProfit = minLucro;
    
    // ROI esperado = ROI mínimo (pior cenário)
    const roiEsperado = minRoi;
    
    // Risco máximo = pior perda possível (valor mais negativo)
    const riscoMaximo = minLucro < 0 ? Math.abs(minLucro) : 0;
    
    // Todos os cenários com lucro positivo = arbitragem garantida
    const allPositive = scenarios.length > 0 && scenarios.every(s => s.lucro >= 0);
    const anyNegative = scenarios.some(s => s.lucro < 0);
    
    // Hedge parcial: quando nem todos os cenários são cobertos igualmente
    const isHedgeParcial = anyNegative && scenarios.some(s => s.lucro > 0);
    
    // Verificar saldo insuficiente em alguma posição
    const hasSaldoInsuficiente = scenarios.some((s, i) => {
      const saldo = saldosPorPosicao[i];
      return saldo !== null && saldo < -0.01; // Saldo negativo = insuficiente
    });
    
    // Recomendação baseada nos cenários
    let recommendation: { text: string; color: string; icon: "check" | "x" | "alert" } | null = null;
    
    if (stakeTotal > 0 && validOddsCount >= 2) {
      if (hasSaldoInsuficiente) {
        recommendation = { 
          text: `Saldo insuficiente em uma ou mais posições`, 
          color: "text-amber-400",
          icon: "alert"
        };
      } else if (allPositive && guaranteedProfit > 0) {
        recommendation = { 
          text: `Arbitragem! Lucro garantido: ${formatCurrency(guaranteedProfit, moedaDominante)}`, 
          color: "text-emerald-500",
          icon: "check"
        };
      } else if (allPositive && guaranteedProfit === 0) {
        recommendation = { 
          text: `Operação neutra. Sem lucro ou perda garantidos.`, 
          color: "text-blue-400",
          icon: "alert"
        };
      } else if (isHedgeParcial) {
        recommendation = { 
          text: `Hedge parcial - cenários mistos`, 
          color: "text-amber-400",
          icon: "alert"
        };
      } else if (anyNegative) {
        recommendation = { 
          text: `Risco: ${formatCurrency(riscoMaximo, moedaDominante)} de perda máxima`, 
          color: "text-red-400",
          icon: "x"
        };
      }
    }
    
    return {
      impliedProbs,
      trueProbs,
      overround,
      spread,
      hasArbitrage,
      suggestedStakes,
      calculatedStakes: actualStakes,
      stakeTotal,
      scenarios,
      guaranteedProfit,
      roiEsperado,
      // Novas métricas para hedge parcial
      minLucro,
      maxLucro,
      minRoi,
      maxRoi,
      riscoMaximo,
      isHedgeParcial,
      recommendation,
      validOddsCount,
      hasPartialData: validOddsCount > 0,
      // Saldos para reatividade
      saldosPorPosicao,
      saldoTotalOperavel,
      hasSaldoInsuficiente,
      // MULTI-MOEDA
      isMultiCurrency,
      moedaDominante,
      moedasUnicas,
      // NOVO: Dados consolidados por perna (para debug/exibição)
      consolidatedPerPerna
    };
  }, [
    // Dependências explícitas para garantir reatividade total
    // REFATORADO: Incluir additionalEntries na chave de dependência
    odds.map(o => `${o.bookmaker_id}|${o.odd}|${o.stake}|${o.isReference}|${JSON.stringify(o.additionalEntries || [])}`).join(','),
    bookmakerSaldos.map(b => `${b.id}|${b.saldo_operavel}`).join(','),
    arredondarAtivado,
    arredondarValor,
    registroValues.contexto_operacional
  ]);

  // Análise de resultado REAL (quando resolvida - posições marcadas como GREEN/RED/VOID/MEIO_GREEN/MEIO_RED)
  // REFATORADO: Considera TODAS as entradas de cada perna (principal + coberturas)
  const analysisReal = useMemo(() => {
    // Verificar se todas as posições têm resultado
    const resultadosValidos = ["GREEN", "RED", "VOID", "MEIO_GREEN", "MEIO_RED"];
    const todasResolvidas = odds.every(o => o.resultado && resultadosValidos.includes(o.resultado));
    
    if (!todasResolvidas) {
      return { isResolved: false, lucroReal: 0, roiReal: 0 };
    }

    // Calcular stake total consolidado (todas as entradas de todas as pernas)
    let stakeTotal = 0;
    odds.forEach(perna => {
      stakeTotal += parseFloat(perna.stake) || 0;
      (perna.additionalEntries || []).forEach(entry => {
        stakeTotal += parseFloat(entry.stake) || 0;
      });
    });

    // Calcular lucro real baseado nos resultados
    // NOTA: O resultado da perna afeta TODAS as entradas dessa perna
    let lucroReal = 0;
    
    odds.forEach(perna => {
      // Coletar todas as entradas desta perna
      const allEntries = [
        { stake: parseFloat(perna.stake) || 0, odd: parseFloat(perna.odd) || 0 },
        ...((perna.additionalEntries || []).map(e => ({
          stake: parseFloat(e.stake) || 0,
          odd: parseFloat(e.odd) || 0
        })))
      ];
      
      // Aplicar resultado para cada entrada da perna
      allEntries.forEach(({ stake, odd }) => {
        if (stake <= 0) return;
        
        if (perna.resultado === "GREEN") {
          // GREEN = ganha (retorno)
          lucroReal += stake * odd;
        } else if (perna.resultado === "MEIO_GREEN") {
          // MEIO_GREEN = ganha metade do lucro potencial + devolve metade da stake
          lucroReal += stake + (stake * (odd - 1)) / 2;
        } else if (perna.resultado === "RED") {
          // RED = perde a stake
          // Não adiciona nada ao retorno
        } else if (perna.resultado === "MEIO_RED") {
          // MEIO_RED = perde metade da stake
          lucroReal += stake / 2;
        } else if (perna.resultado === "VOID") {
          // VOID = devolve a stake
          lucroReal += stake;
        }
      });
    });

    // Lucro real = retorno total - stake total
    lucroReal = lucroReal - stakeTotal;
    const roiReal = stakeTotal > 0 ? (lucroReal / stakeTotal) * 100 : 0;

    return {
      isResolved: true,
      lucroReal,
      roiReal,
      stakeTotal // Expor para debug
    };
  }, [odds]);

  const handleSave = async () => {
    // Validação dos campos de registro obrigatórios
    if (!registroValues.forma_registro || !registroValues.estrategia || !registroValues.contexto_operacional) {
      toast.error("Preencha todos os campos obrigatórios: forma de registro, estratégia e contexto operacional");
      return;
    }

    // Validação simplificada - apenas campos obrigatórios
    if (!evento.trim()) {
      toast.error("Informe o evento");
      return;
    }
    
    // Validar cada lado do modelo atual
    for (let i = 0; i < odds.length; i++) {
      const entry = odds[i];
      const selecaoLabel = entry.selecao;
      
      // 1. Casa obrigatória
      if (!entry.bookmaker_id || entry.bookmaker_id.trim() === "") {
        toast.error(`Selecione a casa para "${selecaoLabel}"`);
        return;
      }
      
      // 2. Odd obrigatória e válida
      const odd = parseFloat(entry.odd);
      if (!entry.odd || isNaN(odd) || odd <= 1) {
        toast.error(`Odd inválida para "${selecaoLabel}" (deve ser > 1.00)`);
        return;
      }
      
      // 3. Stake obrigatória
      const stake = parseFloat(entry.stake);
      if (!entry.stake || isNaN(stake) || stake <= 0) {
        toast.error(`Stake obrigatória para "${selecaoLabel}"`);
        return;
      }
      
      // 4. Verificar saldo considerando uso compartilhado (APENAS para criação, não edição)
      if (!isEditing) {
        const saldoDisponivel = getSaldoDisponivelParaPosicao(entry.bookmaker_id, i);
        const bkMoeda = bookmakerSaldos.find(b => b.id === entry.bookmaker_id)?.moeda || "BRL";
        if (saldoDisponivel !== null && stake > saldoDisponivel + 0.01) {
          toast.error(`Saldo insuficiente em ${getBookmakerNome(entry.bookmaker_id)} para "${selecaoLabel}": ${formatCurrency(saldoDisponivel, bkMoeda)} disponível nesta operação, ${formatCurrency(stake, bkMoeda)} necessário`);
          return;
        }
      }
      
      // 5. Validar entradas adicionais (coberturas) - APENAS para criação
      if (!isEditing && entry.additionalEntries && entry.additionalEntries.length > 0) {
        for (let j = 0; j < entry.additionalEntries.length; j++) {
          const ae = entry.additionalEntries[j];
          const aeLabel = `cobertura ${j + 1} de "${selecaoLabel}"`;
          
          // Casa obrigatória
          if (!ae.bookmaker_id || ae.bookmaker_id.trim() === "") {
            toast.error(`Selecione a casa para ${aeLabel}`);
            return;
          }
          
          // Odd obrigatória e válida
          const aeOdd = parseFloat(ae.odd);
          if (!ae.odd || isNaN(aeOdd) || aeOdd <= 1) {
            toast.error(`Odd inválida para ${aeLabel} (deve ser > 1.00)`);
            return;
          }
          
          // Stake obrigatória
          const aeStake = parseFloat(ae.stake);
          if (!ae.stake || isNaN(aeStake) || aeStake <= 0) {
            toast.error(`Stake obrigatória para ${aeLabel}`);
            return;
          }
          
          // Verificar saldo
          const aeSaldoDisponivel = getSaldoDisponivelParaAdditionalEntry(ae.bookmaker_id, i, j);
          const aeBkMoeda = bookmakerSaldos.find(b => b.id === ae.bookmaker_id)?.moeda || "BRL";
          if (aeSaldoDisponivel !== null && aeStake > aeSaldoDisponivel + 0.01) {
            toast.error(`Saldo insuficiente em ${getBookmakerNome(ae.bookmaker_id)} para ${aeLabel}: ${formatCurrency(aeSaldoDisponivel, aeBkMoeda)} disponível, ${formatCurrency(aeStake, aeBkMoeda)} necessário`);
            return;
          }
        }
      }
    }

    // Validação extra: verificar se há inconsistência de saldo compartilhado (APENAS para criação)
    if (!isEditing && hasBalanceInconsistency) {
      toast.error("Há inconsistência de saldo compartilhado entre as posições. Verifique as stakes.");
      return;
    }

    try {
      setSaving(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Usuário não autenticado");

      if (isEditing && surebet) {
        // Update na tabela unificada
        const { error } = await supabase
          .from("apostas_unificada")
          .update({
            evento,
            esporte,
            mercado,
            observacoes,
            updated_at: new Date().toISOString()
          })
          .eq("id", surebet.id);

        if (error) throw error;
        toast.success("Operação atualizada!");
      } else {
        // Obter moeda de cada bookmaker selecionada
        const getBookmakerMoeda = (bookmakerId: string): SupportedCurrency => {
          const bk = bookmakerSaldos.find(b => b.id === bookmakerId);
          return (bk?.moeda as SupportedCurrency) || "BRL";
        };
        
        // Criar pernas COM SNAPSHOT e suporte a múltiplas entradas
        const pernasToSave: SurebetPerna[] = odds.map((entry, idx) => {
          const mainStake = parseFloat(entry.stake) || 0;
          const mainMoeda = getBookmakerMoeda(entry.bookmaker_id);
          const mainSnapshotFields = getSnapshotFields(mainStake, mainMoeda);
          
          // Construir array de entradas se houver entradas adicionais
          const hasAdditional = (entry.additionalEntries?.length || 0) > 0;
          let entries: SurebetPernaEntry[] | undefined = undefined;
          let oddMedia: number | undefined = undefined;
          let stakeTotal: number | undefined = undefined;
          
          if (hasAdditional) {
            // Entrada principal (com selecao_livre da entrada principal)
            const mainEntry: SurebetPernaEntry = {
              bookmaker_id: entry.bookmaker_id,
              bookmaker_nome: getBookmakerNome(entry.bookmaker_id),
              moeda: mainMoeda,
              odd: parseFloat(entry.odd),
              stake: mainStake,
              stake_brl_referencia: mainSnapshotFields.valor_brl_referencia,
              cotacao_snapshot: mainSnapshotFields.cotacao_snapshot,
              cotacao_snapshot_at: mainSnapshotFields.cotacao_snapshot_at,
              selecao_livre: entry.selecaoLivre || ""
            };
            
            // Entradas adicionais (cada uma com sua própria selecao_livre)
            const additionalEntries: SurebetPernaEntry[] = (entry.additionalEntries || []).map(ae => {
              const aeMoeda = getBookmakerMoeda(ae.bookmaker_id);
              const aeStake = parseFloat(ae.stake) || 0;
              const aeSnapshotFields = getSnapshotFields(aeStake, aeMoeda);
              
              return {
                bookmaker_id: ae.bookmaker_id,
                bookmaker_nome: getBookmakerNome(ae.bookmaker_id),
                moeda: aeMoeda,
                odd: parseFloat(ae.odd),
                stake: aeStake,
                stake_brl_referencia: aeSnapshotFields.valor_brl_referencia,
                cotacao_snapshot: aeSnapshotFields.cotacao_snapshot,
                cotacao_snapshot_at: aeSnapshotFields.cotacao_snapshot_at,
                selecao_livre: ae.selecaoLivre || ""
              };
            });
            
            entries = [mainEntry, ...additionalEntries];
            oddMedia = calcularOddMedia({ odd: entry.odd, stake: entry.stake }, entry.additionalEntries);
            stakeTotal = calcularStakeTotal({ stake: entry.stake }, entry.additionalEntries);
          }
          
          return {
            // Campos de identificação da posição
            selecao: entry.selecao,
            selecao_livre: entry.selecaoLivre || "",
            
            // Array de entradas (se múltiplas)
            entries,
            
            // Campos consolidados (se múltiplas entradas)
            odd_media: oddMedia,
            stake_total: stakeTotal,
            
            // Campos legados (sempre preenchidos para compatibilidade)
            bookmaker_id: entry.bookmaker_id,
            bookmaker_nome: getBookmakerNome(entry.bookmaker_id),
            moeda: mainMoeda,
            odd: parseFloat(entry.odd),
            stake: mainStake,
            stake_brl_referencia: mainSnapshotFields.valor_brl_referencia,
            cotacao_snapshot: mainSnapshotFields.cotacao_snapshot,
            cotacao_snapshot_at: mainSnapshotFields.cotacao_snapshot_at,
            
            // Campos de resultado (null ao criar)
            resultado: null,
            lucro_prejuizo: null,
            lucro_prejuizo_brl_referencia: null,
            
            // Campos de freebet
            gerou_freebet: entry.gerouFreebet || false,
            valor_freebet_gerada: entry.gerouFreebet && entry.valorFreebetGerada 
              ? parseFloat(entry.valorFreebetGerada) 
              : null
          };
        });
        
        // Detectar moeda de operação - REFATORADO: Considerar TODAS as entradas
        const moedasTodasEntradas: SupportedCurrency[] = [];
        pernasToSave.forEach(perna => {
          moedasTodasEntradas.push(perna.moeda);
          if (perna.entries) {
            perna.entries.forEach(e => moedasTodasEntradas.push(e.moeda));
          }
        });
        const moedasUnicas = [...new Set(moedasTodasEntradas)];
        const moedaOperacao: MoedaOperacao = moedasUnicas.length === 1 ? moedasUnicas[0] : "MULTI";
        
        // Calcular valor BRL de referência - REFATORADO: Considerar TODAS as entradas
        let valorBRLReferencia = 0;
        pernasToSave.forEach(perna => {
          if (perna.entries && perna.entries.length > 0) {
            // Tem múltiplas entradas: somar valor BRL de cada entrada
            perna.entries.forEach(e => {
              valorBRLReferencia += e.stake_brl_referencia || 0;
            });
          } else {
            // Entrada única: usar valor da perna
            valorBRLReferencia += perna.stake_brl_referencia || 0;
          }
        });
        
        // stake_total - REFATORADO: Considerar TODAS as entradas (principal + adicionais)
        // Para MULTI, stake_total = null (proibido somar moedas diferentes!)
        let stakeTotal: number | null = null;
        if (moedaOperacao !== "MULTI") {
          stakeTotal = 0;
          pernasToSave.forEach(perna => {
            if (perna.entries && perna.entries.length > 0) {
              // Tem múltiplas entradas: somar todas
              perna.entries.forEach(e => {
                stakeTotal! += e.stake;
              });
            } else {
              // Entrada única
              stakeTotal! += perna.stake;
            }
          });
        }
        
        // Inserir na tabela unificada
        if (!workspaceId) {
          toast.error("Workspace não identificado. Tente recarregar a página.");
          return;
        }
        
        const { error: insertError } = await supabase
          .from("apostas_unificada")
          .insert({
            user_id: user.id,
            workspace_id: workspaceId,
            projeto_id: projetoId,
            forma_registro: 'ARBITRAGEM',
            estrategia: registroValues.estrategia,
            contexto_operacional: registroValues.contexto_operacional,
            evento,
            esporte,
            modelo,
            mercado,
            // Campos multi-moeda
            moeda_operacao: moedaOperacao,
            stake_total: stakeTotal, // null se MULTI
            valor_brl_referencia: valorBRLReferencia,
            // Snapshot da operação (só faz sentido para moeda única)
            cotacao_snapshot: moedaOperacao !== "MULTI" && moedaOperacao !== "BRL" 
              ? pernasToSave[0]?.cotacao_snapshot 
              : null,
            cotacao_snapshot_at: moedaOperacao !== "MULTI" && moedaOperacao !== "BRL"
              ? pernasToSave[0]?.cotacao_snapshot_at
              : null,
            // Demais campos
            spread_calculado: analysis?.spread || null,
            roi_esperado: analysis?.roiEsperado || null,
            lucro_esperado: analysis?.guaranteedProfit || null,
            observacoes,
            status: "PENDENTE",
            resultado: "PENDENTE",
            pernas: pernasToSave as any,
            data_aposta: new Date().toISOString()
          });

        if (insertError) throw insertError;

        toast.success("Operação registrada com sucesso!");
      }

      onSuccess();
      onOpenChange(false);
    } catch (error: any) {
      toast.error("Erro ao salvar: " + error.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!surebet) return;
    
    try {
      // Antes de deletar, reverter saldos das apostas vinculadas que têm resultado
      for (const aposta of linkedApostas) {
        const resultado = aposta.resultado;
        const stake = parseFloat(aposta.stake) || 0;
        const odd = parseFloat(aposta.odd) || 0;
        const bookmakerId = aposta.bookmaker_id;
        
        // CORREÇÃO MULTI-MOEDA: Usar helper centralizado
        if (resultado && resultado !== "PENDENTE") {
          let delta = 0;
          
          if (resultado === "GREEN") {
            // GREEN: lucro foi creditado, reverter (debitar lucro)
            delta = -(stake * (odd - 1));
          } else if (resultado === "RED") {
            // RED: stake foi debitada, reverter (creditar)
            delta = stake;
          }
          // VOID: não alterou saldo, não precisa reverter
          
          if (delta !== 0) {
            await updateBookmakerBalance(bookmakerId, delta);
          }
        }
      }
      
      // Deletar da tabela unificada
      const { error } = await supabase
        .from("apostas_unificada")
        .delete()
        .eq("id", surebet.id);

      if (error) throw error;
      
      toast.success("Operação excluída!");
      onSuccess();
      onOpenChange(false);
    } catch (error: any) {
      toast.error("Erro ao excluir: " + error.message);
    }
  };

  // Flag para rastrear se houve alterações durante a sessão do modal
  const hasChangesRef = useRef(false);
  const toastShownRef = useRef(false);

  // Funções de gerenciamento de Freebet
  const registrarFreebetGerada = async (
    bookmakerIdFreebet: string,
    valor: number,
    userId: string,
    projetoIdFreebet: string,
    apostaId: string,
    resultadoAposta: string | null
  ) => {
    try {
      // Determinar status baseado no resultado da aposta
      let status: "PENDENTE" | "LIBERADA" | "NAO_LIBERADA" = "PENDENTE";
      if (resultadoAposta && resultadoAposta !== "PENDENTE") {
        // GREEN, RED, MEIO_GREEN, MEIO_RED = libera freebet
        // VOID = não libera
        status = resultadoAposta === "VOID" ? "NAO_LIBERADA" : "LIBERADA";
      }

      // Só incrementar saldo_freebet se a freebet for liberada
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

      // Registrar na tabela freebets_recebidas
      await supabase
        .from("freebets_recebidas")
        .insert({
          user_id: userId,
          workspace_id: workspaceId,
          projeto_id: projetoIdFreebet,
          bookmaker_id: bookmakerIdFreebet,
          valor: valor,
          motivo: "Aposta qualificadora (Arbitragem)",
          data_recebida: new Date().toISOString(),
          utilizada: false,
          aposta_id: apostaId,
          status: status,
        });
    } catch (error) {
      console.error("Erro ao registrar freebet gerada:", error);
    }
  };

  const liberarFreebetPendente = async (apostaId: string) => {
    try {
      const { data: freebetPendente } = await supabase
        .from("freebets_recebidas")
        .select("id, bookmaker_id, valor")
        .eq("aposta_id", apostaId)
        .eq("status", "PENDENTE")
        .maybeSingle();

      if (freebetPendente) {
        await supabase
          .from("freebets_recebidas")
          .update({ status: "LIBERADA" })
          .eq("id", freebetPendente.id);

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

  const reverterFreebetParaPendente = async (apostaId: string) => {
    try {
      const { data: freebetLiberada } = await supabase
        .from("freebets_recebidas")
        .select("id, bookmaker_id, valor")
        .eq("aposta_id", apostaId)
        .eq("status", "LIBERADA")
        .maybeSingle();

      if (freebetLiberada) {
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

        await supabase
          .from("freebets_recebidas")
          .update({ status: "PENDENTE" })
          .eq("id", freebetLiberada.id);
      }
    } catch (error) {
      console.error("Erro ao reverter freebet para pendente:", error);
    }
  };

  // Liquidar perna por índice - atualiza JSONB na tabela unificada
  const handleLiquidarPerna = useCallback(async (pernaIndex: number, resultado: "GREEN" | "RED" | "VOID" | "MEIO_GREEN" | "MEIO_RED" | null) => {
    if (!surebet) return;
    
    try {
      // Buscar pernas atuais da operação na tabela unificada
      const { data: operacaoData } = await supabase
        .from("apostas_unificada")
        .select("pernas")
        .eq("id", surebet.id)
        .single();
      
      if (!operacaoData?.pernas) return;
      
      const pernas = operacaoData.pernas as unknown as SurebetPerna[];
      const perna = pernas[pernaIndex];
      if (!perna) return;

      const stake = perna.stake || 0;
      const odd = perna.odd || 0;
      const resultadoAnterior = perna.resultado;
      const bookmakerId = perna.bookmaker_id;

      // Se o resultado não mudou, não fazer nada
      if (resultadoAnterior === resultado) return;

      let lucro: number | null = 0;
      
      if (resultado === null) {
        lucro = null;
      } else if (resultado === "GREEN") {
        lucro = stake * (odd - 1);
      } else if (resultado === "MEIO_GREEN") {
        lucro = (stake * (odd - 1)) / 2;
      } else if (resultado === "RED") {
        lucro = -stake;
      } else if (resultado === "MEIO_RED") {
        lucro = -stake / 2;
      } else if (resultado === "VOID") {
        lucro = 0;
      }

      // ATUALIZAÇÃO DE SALDO DA CASA - CORREÇÃO MULTI-MOEDA
      // Calcula delta para reversão + aplicação do novo resultado
      let delta = 0;
      
      // 1. REVERTER efeito do resultado ANTERIOR
      if (resultadoAnterior && resultadoAnterior !== "PENDENTE") {
        if (resultadoAnterior === "GREEN") {
          delta -= stake * (odd - 1);
        } else if (resultadoAnterior === "MEIO_GREEN") {
          delta -= (stake * (odd - 1)) / 2;
        } else if (resultadoAnterior === "RED") {
          delta += stake;
        } else if (resultadoAnterior === "MEIO_RED") {
          delta += stake / 2;
        }
      }

      // 2. APLICAR efeito do resultado NOVO
      if (resultado === "GREEN") {
        delta += stake * (odd - 1);
      } else if (resultado === "MEIO_GREEN") {
        delta += (stake * (odd - 1)) / 2;
      } else if (resultado === "RED") {
        delta -= stake;
      } else if (resultado === "MEIO_RED") {
        delta -= stake / 2;
      }

      // CORREÇÃO: Usar helper centralizado que respeita moeda do bookmaker
      if (delta !== 0) {
        await updateBookmakerBalance(bookmakerId, delta);
      }

      // Invalidar cache de saldos para atualizar todas as UIs
      invalidateSaldos(projetoId);

      // Atualizar perna no array
      const novasPernas = [...pernas];
      novasPernas[pernaIndex] = {
        ...perna,
        resultado,
        lucro_prejuizo: lucro
      };

      // Calcular totais
      const todasLiquidadas = novasPernas.every(p => p.resultado && p.resultado !== "PENDENTE" && p.resultado !== null);
      const lucroTotal = novasPernas.reduce((acc, p) => acc + (p.lucro_prejuizo || 0), 0);
      const resultadoFinal = todasLiquidadas 
        ? (lucroTotal > 0 ? "GREEN" : lucroTotal < 0 ? "RED" : "VOID")
        : null;

      // Atualizar operação na tabela unificada com pernas e status
      await supabase
        .from("apostas_unificada")
        .update({
          pernas: novasPernas as any,
          status: todasLiquidadas ? "LIQUIDADA" : "PENDENTE",
          resultado: resultadoFinal,
          lucro_prejuizo: todasLiquidadas ? lucroTotal : null,
          roi_real: todasLiquidadas && surebet.stake_total > 0 ? (lucroTotal / surebet.stake_total) * 100 : null
        })
        .eq("id", surebet.id);

      // Atualizar estados locais
      setOdds(prev => prev.map((o, idx) => 
        idx === pernaIndex
          ? { ...o, resultado, lucro_prejuizo: lucro }
          : o
      ));

      setLinkedApostas(prev => prev.map((a, idx) => 
        idx === pernaIndex
          ? { ...a, resultado, lucro_prejuizo: lucro }
          : a
      ));

      hasChangesRef.current = true;

      if (todasLiquidadas && !toastShownRef.current) {
        toastShownRef.current = true;
        toast.success("Operação liquidada com sucesso!");
      } else if (!todasLiquidadas) {
        toastShownRef.current = false;
      }
    } catch (error: any) {
      toast.error("Erro: " + error.message);
    }
  }, [surebet]);

  // Handler para fechamento do modal - chama onSuccess apenas aqui
  const handleDialogClose = useCallback((newOpen: boolean) => {
    if (!newOpen && hasChangesRef.current) {
      // Chamar onSuccess apenas quando o modal fechar E houve alterações
      onSuccess();
      hasChangesRef.current = false;
      toastShownRef.current = false;
    }
    onOpenChange(newOpen);
  }, [onSuccess, onOpenChange]);

  return (
    <Dialog open={open} onOpenChange={handleDialogClose}>
      <DialogContent className="max-w-[1400px] max-h-[90vh] overflow-y-auto p-4 sm:p-6">
        <DialogHeader className="pb-2">
          <DialogTitle className="flex items-center gap-2 text-base">
            <Calculator className="h-4 w-4 text-amber-500" />
            {isEditing ? "Editar Arbitragem" : "Arbitragem"}
          </DialogTitle>
        </DialogHeader>

        {/* Container principal - Layout dinâmico baseado no modelo */}
        <div className={`flex gap-3 ${modelo === "1-X-2" ? "flex-col" : "flex-col lg:flex-row"}`}>
          {/* Formulário - Principal */}
          <div className="flex-1 space-y-2 min-w-0">
            {/* LINHA 1: Estratégia + Contexto + Modelo (todos inline) */}
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 pb-2 border-b border-border/50">
              {/* Campos de Registro Compactos */}
              <RegistroApostaFields
                values={registroValues}
                onChange={setRegistroValues}
                suggestions={!isEditing ? getSuggestionsForTab(activeTab) : undefined}
                disabled={isEditing ? { forma_registro: true, estrategia: true, contexto_operacional: true } : undefined}
                lockedEstrategia={!isEditing && isAbaEstrategiaFixa(activeTab) ? getEstrategiaFromTab(activeTab) : undefined}
                compact
              />
              
              {/* Modelo - Toggle inline */}
              <div className="flex items-center gap-2">
                <Label className="text-xs font-medium text-muted-foreground whitespace-nowrap">Modelo:</Label>
                <div className={`relative flex p-0.5 bg-muted/50 rounded h-8 w-[120px] ${isEditing ? 'opacity-60 pointer-events-none' : ''}`}>
                  <div 
                    className="absolute h-[calc(100%-4px)] bg-primary rounded transition-all duration-200 ease-out"
                    style={{
                      width: 'calc(50% - 2px)',
                      left: modelo === "1-X-2" ? 'calc(50% + 1px)' : '2px',
                      top: '2px'
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => !isEditing && setModelo("1-2")}
                    disabled={isEditing}
                    className={`relative z-10 flex-1 text-sm font-medium rounded transition-colors ${
                      modelo === "1-2" ? "text-primary-foreground" : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    1–2
                  </button>
                  <button
                    type="button"
                    onClick={() => !isEditing && setModelo("1-X-2")}
                    disabled={isEditing}
                    className={`relative z-10 flex-1 text-sm font-medium rounded transition-colors ${
                      modelo === "1-X-2" ? "text-primary-foreground" : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    1–X–2
                  </button>
                </div>
              </div>
            </div>

            {/* LINHA 2: Esporte + Evento + Mercado */}
            <div className="grid grid-cols-3 gap-3">
              {/* Esporte */}
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Esporte</Label>
                <Select 
                  value={esporte} 
                  onValueChange={(newEsporte) => {
                    setEsporte(newEsporte);
                    setMercado("");
                  }}
                >
                  <SelectTrigger className="h-8 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ESPORTES.map(e => (
                      <SelectItem key={e} value={e}>{e}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Evento */}
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Evento</Label>
                <Input 
                  placeholder="Ex: Brasil x Argentina" 
                  value={evento}
                  onChange={(e) => setEvento(e.target.value)}
                  className="h-8 text-sm uppercase"
                />
              </div>
              
              {/* Mercado */}
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Mercado</Label>
                <Select value={mercado} onValueChange={setMercado}>
                  <SelectTrigger className="h-8 text-sm">
                    <SelectValue placeholder="Selecione" />
                  </SelectTrigger>
                  <SelectContent>
                    {getMarketsForSportAndModel(esporte, modelo).map(m => (
                      <SelectItem key={m} value={m}>{m}</SelectItem>
                    ))}
                    {getMarketsForSportAndModel(esporte, modelo).length === 0 && (
                      <div className="px-2 py-1.5 text-sm text-muted-foreground">
                        Nenhum mercado compatível
                      </div>
                    )}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Tabela de Odds - Layout em Colunas */}
            {odds.length > 0 && (
              <div className="space-y-2 pt-2">
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-medium">Posições da Operação</Label>
                  <span className="text-[10px] text-muted-foreground">
                    Selecione a referência e ajuste as stakes
                  </span>
                </div>
                
                {/* Grid de Colunas com botões de swap entre elas */}
                <div className="flex items-stretch gap-1">
                  {odds.map((entry, index) => {
                    const saldoLivreBase = getBookmakerSaldoLivre(entry.bookmaker_id);
                    const saldoDisponivelPosicao = getSaldoDisponivelParaPosicao(entry.bookmaker_id, index);
                    const selectedBookmaker = bookmakerSaldos.find(b => b.id === entry.bookmaker_id);
                    const parceiroNome = selectedBookmaker?.parceiro_nome?.split(" ");
                    const parceiroShortName = parceiroNome 
                      ? `${parceiroNome[0]} ${parceiroNome[parceiroNome.length - 1] || ""}`.trim()
                      : "";
                    const stakeCalculada = analysis?.calculatedStakes?.[index] || 0;
                    const stakeAtual = parseFloat(entry.stake) || 0;
                    const isDifferentFromCalculated = entry.isManuallyEdited && 
                      stakeAtual > 0 && 
                      Math.abs(stakeAtual - stakeCalculada) > 0.01 &&
                      !entry.isReference;
                    
                    // Verificar se há saldo insuficiente nesta posição (APENAS para criação)
                    const saldoInsuficiente = !isEditing && stakeAtual > 0 && saldoDisponivelPosicao !== null && stakeAtual > saldoDisponivelPosicao + 0.01;
                    
                    // Cores distintas por coluna
                    const columnColors = modelo === "1-X-2" 
                      ? [
                          { bg: "bg-blue-500/10", border: "border-blue-500/40", badge: "bg-blue-500 text-white" },
                          { bg: "bg-amber-500/10", border: "border-amber-500/40", badge: "bg-amber-500 text-black" },
                          { bg: "bg-emerald-500/10", border: "border-emerald-500/40", badge: "bg-emerald-500 text-white" }
                        ]
                      : [
                          { bg: "bg-blue-500/10", border: "border-blue-500/40", badge: "bg-blue-500 text-white" },
                          { bg: "bg-emerald-500/10", border: "border-emerald-500/40", badge: "bg-emerald-500 text-white" }
                        ];
                    
                    const colors = columnColors[index] || columnColors[0];
                    
                    return (
                      <div key={index} className="contents">
                        {/* Botão de swap entre colunas anteriores */}
                        {index > 0 && (
                          <div className="flex items-center justify-center px-1">
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="h-8 w-8 p-0 rounded-full hover:bg-primary/20 text-muted-foreground hover:text-primary"
                              onClick={() => swapSelecoes(index - 1, index)}
                              title={`Trocar ${odds[index - 1].selecao} ↔ ${entry.selecao}`}
                            >
                              <ArrowLeftRight className="h-4 w-4" />
                            </Button>
                          </div>
                        )}
                        
                        <div 
                          className={`flex-1 rounded-xl border-2 p-4 space-y-3 transition-all ${colors.bg} ${
                            entry.isReference 
                              ? `${colors.border} ring-2 ring-primary/30` 
                              : colors.border
                          }`}
                        >
                          {/* Badge + Seleção Centralizado */}
                          <div className="flex flex-col items-center gap-2">
                            <div className={`text-2xl font-bold px-5 py-2 rounded-xl ${colors.badge}`}>
                              {modelo === "1-X-2" 
                                ? (index === 0 ? "1" : index === 1 ? "X" : "2") 
                                : (index === 0 ? "1" : "2")
                              }
                            </div>
                            
                            {/* Seleção dinâmica (label da posição) */}
                            <span className="text-sm font-medium text-foreground">
                              {entry.selecao}
                            </span>
                            
                            {/* Campo Seleção Livre foi movido para o nível de entrada */}
                            
                            {/* Resultado (apenas em modo edição) */}
                            {isEditing && (
                              <div className="flex flex-col gap-1 transition-all duration-200">
                                {entry.resultado ? (
                                  <div className="flex items-center gap-1">
                                    <Badge className={`text-xs transition-all duration-200 animate-scale-in ${
                                      entry.resultado === "GREEN" ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/40" :
                                      entry.resultado === "MEIO_GREEN" ? "bg-teal-500/20 text-teal-400 border-teal-500/40" :
                                      entry.resultado === "RED" ? "bg-red-500/20 text-red-400 border-red-500/40" :
                                      entry.resultado === "MEIO_RED" ? "bg-orange-500/20 text-orange-400 border-orange-500/40" :
                                      "bg-gray-500/20 text-gray-400 border-gray-500/40"
                                    }`}>
                                      {entry.resultado === "MEIO_GREEN" ? "½ Green" : 
                                       entry.resultado === "MEIO_RED" ? "½ Red" : 
                                       entry.resultado}
                                    </Badge>
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      size="sm"
                                      className="h-5 w-5 p-0 text-muted-foreground hover:text-foreground transition-all duration-150"
                                      onClick={() => handleLiquidarPerna(index, null as any)}
                                      title="Limpar resultado"
                                    >
                                      <RotateCcw className="h-3 w-3" />
                                    </Button>
                                  </div>
                                ) : (
                                  <div className="flex flex-col gap-1">
                                    {/* Botões principais: Green, Red, Void */}
                                    <div className="flex gap-1 items-center">
                                      <Button 
                                        type="button"
                                        size="sm" 
                                        variant="outline"
                                        className="h-6 w-6 p-0 text-emerald-500 hover:bg-emerald-500/20 transition-all duration-150 hover:scale-110"
                                        onClick={() => handleLiquidarPerna(index, "GREEN")}
                                        title="GREEN"
                                      >
                                        <CheckCircle2 className="h-3.5 w-3.5" />
                                      </Button>
                                      <Button 
                                        type="button"
                                        size="sm" 
                                        variant="outline"
                                        className="h-6 w-6 p-0 text-red-500 hover:bg-red-500/20 transition-all duration-150 hover:scale-110"
                                        onClick={() => handleLiquidarPerna(index, "RED")}
                                        title="RED"
                                      >
                                        <XCircle className="h-3.5 w-3.5" />
                                      </Button>
                                      <Button 
                                        type="button"
                                        size="sm" 
                                        variant="outline"
                                        className="h-6 w-6 p-0 text-gray-500 hover:bg-gray-500/20 transition-all duration-150 hover:scale-110"
                                        onClick={() => handleLiquidarPerna(index, "VOID")}
                                        title="VOID"
                                      >
                                        <span className="text-[10px] font-bold">V</span>
                                      </Button>
                                      
                                      {/* Botão de expandir resultados avançados */}
                                      <Button
                                        type="button"
                                        size="sm"
                                        variant="ghost"
                                        className="h-6 w-6 p-0 text-muted-foreground hover:text-foreground transition-all duration-150"
                                        onClick={() => setExpandedResultados(prev => ({
                                          ...prev,
                                          [index]: !prev[index]
                                        }))}
                                        title={expandedResultados[index] ? "Recolher" : "Resultados avançados"}
                                      >
                                        {expandedResultados[index] ? (
                                          <ChevronUp className="h-3.5 w-3.5" />
                                        ) : (
                                          <Plus className="h-3.5 w-3.5" />
                                        )}
                                      </Button>
                                    </div>
                                    
                                    {/* Botões avançados: Meio Green, Meio Red */}
                                    {expandedResultados[index] && (
                                      <div className="flex gap-1 items-center pl-0.5 animate-in fade-in slide-in-from-top-1 duration-200">
                                        <span className="text-[9px] text-muted-foreground mr-0.5">Parcial:</span>
                                        <Button 
                                          type="button"
                                          size="sm" 
                                          variant="outline"
                                          className="h-5 px-1.5 text-[10px] text-teal-400 border-teal-500/30 hover:bg-teal-500/20 transition-all duration-150"
                                          onClick={() => handleLiquidarPerna(index, "MEIO_GREEN")}
                                          title="½ GREEN"
                                        >
                                          ½G
                                        </Button>
                                        <Button 
                                          type="button"
                                          size="sm" 
                                          variant="outline"
                                          className="h-5 px-1.5 text-[10px] text-orange-400 border-orange-500/30 hover:bg-orange-500/20 transition-all duration-150"
                                          onClick={() => handleLiquidarPerna(index, "MEIO_RED")}
                                          title="½ RED"
                                        >
                                          ½R
                                        </Button>
                                      </div>
                                    )}
                                  </div>
                                )}
                              </div>
                            )}
                            
                            {/* RadioButton Referência - apenas em criação */}
                            {!isEditing && (
                              <label className="flex items-center gap-2 cursor-pointer">
                                <input
                                  type="radio"
                                  name="reference-selection"
                                  checked={entry.isReference}
                                  onChange={() => setReferenceIndex(index)}
                                  className="h-4 w-4 cursor-pointer accent-primary"
                                />
                                <span className="text-xs text-muted-foreground">Referência</span>
                              </label>
                            )}
                          </div>
                          
                          {/* Casa | Odd | Stake | Linha na mesma linha - centralizado */}
                          <div className="grid gap-2 justify-center" style={{ gridTemplateColumns: '130px 70px 70px 80px' }}>
                            {/* Casa */}
                            <div className="space-y-1">
                              <Label className="text-xs text-muted-foreground">Casa</Label>
                              {isEditing ? (
                                <div className="h-8 px-1.5 text-[10px] flex items-center bg-muted/50 rounded-md border truncate font-medium uppercase">
                                  {selectedBookmaker?.nome || "—"}
                                </div>
                              ) : (
                                <Select 
                                  value={entry.bookmaker_id}
                                  onValueChange={(v) => updateOdd(index, "bookmaker_id", v)}
                                >
                                  <SelectTrigger 
                                    className="h-8 text-[10px] w-full px-1.5"
                                    tabIndex={index * 4 + 1}
                                  >
                                    <SelectValue placeholder="Casa">
                                      {selectedBookmaker?.nome && (
                                        <span className="truncate uppercase">{selectedBookmaker.nome}</span>
                                      )}
                                    </SelectValue>
                                  </SelectTrigger>
                                <SelectContent className="max-w-[320px]">
                                    {bookmakersDisponiveis.map(bk => {
                                      // saldo_operavel já vem calculado corretamente da RPC canônica
                                      const saldoLivreBase = bk.saldo_operavel;
                                      
                                      // Descontar stakes usadas em OUTRAS posições desta operação (incluindo additionalEntries)
                                      let stakesUsadas = 0;
                                      odds.forEach((o, idx) => {
                                        // Entrada principal de outras pernas
                                        if (idx !== index && o.bookmaker_id === bk.id) {
                                          stakesUsadas += parseFloat(o.stake) || 0;
                                        }
                                        // Additional entries de TODAS as pernas (incluindo a atual)
                                        (o.additionalEntries || []).forEach((ae) => {
                                          if (ae.bookmaker_id === bk.id) {
                                            stakesUsadas += parseFloat(ae.stake) || 0;
                                          }
                                        });
                                      });
                                      
                                      const saldoDisponivelParaEssaPosicao = saldoLivreBase - stakesUsadas;
                                      const isIndisponivel = saldoDisponivelParaEssaPosicao < 0.50;
                                      
                                      return (
                                        <SelectItem 
                                          key={bk.id} 
                                          value={bk.id}
                                          disabled={isIndisponivel}
                                          className={isIndisponivel ? "opacity-50" : ""}
                                        >
                                          <BookmakerSelectOption
                                            bookmaker={{
                                              id: bk.id,
                                              nome: bk.nome,
                                              parceiro_nome: bk.parceiro_nome,
                                              moeda: bk.moeda,
                                              saldo_operavel: saldoDisponivelParaEssaPosicao,
                                              saldo_disponivel: bk.saldo_disponivel,
                                              saldo_freebet: bk.saldo_freebet,
                                              saldo_bonus: bk.saldo_bonus,
                                              logo_url: bk.logo_url,
                                              bonus_rollover_started: bk.bonus_rollover_started,
                                            }}
                                            disabled={isIndisponivel}
                                            showBreakdown={!isIndisponivel}
                                          />
                                        </SelectItem>
                                      );
                                    })}
                                  </SelectContent>
                                </Select>
                              )}
                            </div>
                            
                            {/* Odd */}
                            <div className="space-y-1">
                              <Label className="text-xs text-muted-foreground">Odd</Label>
                              {isEditing ? (
                                <div className="h-8 px-1.5 text-[10px] flex items-center justify-center bg-muted/50 rounded-md border font-medium">
                                  {parseFloat(entry.odd).toFixed(2)}
                                </div>
                              ) : (
                                <Input 
                                  type="number"
                                  step="0.01"
                                  placeholder="1.00"
                                  value={entry.odd}
                                  onChange={(e) => updateOdd(index, "odd", e.target.value)}
                                  className="h-8 text-[10px] px-1.5"
                                  tabIndex={index * 4 + 2}
                                  onWheel={(e) => e.currentTarget.blur()}
                                />
                              )}
                            </div>
                            
                            {/* Stake */}
                            <div className="space-y-1">
                              <Label className="text-xs text-muted-foreground whitespace-nowrap">
                                Stake{!isEditing && entry.isReference && <span className="text-primary ml-0.5">(Ref)</span>}
                              </Label>
                              {isEditing ? (
                                <div className="h-8 px-1.5 text-[10px] flex items-center justify-center bg-muted/50 rounded-md border font-medium">
                                  {formatCurrency(parseFloat(entry.stake) || 0, entry.moeda)}
                                </div>
                              ) : (
                                <div className="relative">
                                  <Input 
                                    type="number"
                                    step="0.01"
                                    placeholder={entry.isReference ? "Ref." : (stakeCalculada > 0 ? stakeCalculada.toFixed(2) : "Stake")}
                                    value={entry.stake}
                                    onChange={(e) => updateOdd(index, "stake", e.target.value)}
                                    className={`h-8 text-[10px] px-1.5 pr-6 ${
                                      isDifferentFromCalculated 
                                        ? "border-amber-500 ring-1 ring-amber-500/50" 
                                        : ""
                                    }`}
                                    tabIndex={index * 4 + 3}
                                    onWheel={(e) => e.currentTarget.blur()}
                                  />
                                  {isDifferentFromCalculated && stakeCalculada > 0 && (
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      size="sm"
                                      className="absolute right-0 top-1/2 -translate-y-1/2 h-6 w-6 p-0 text-muted-foreground hover:text-primary"
                                      onClick={() => resetStakeToCalculated(index, stakeCalculada)}
                                      title={`Resetar para ${stakeCalculada.toFixed(2)}`}
                                    >
                                      <RotateCcw className="h-3 w-3" />
                                    </Button>
                                  )}
                                </div>
                              )}
                            </div>
                            
                            {/* Linha (Seleção Livre) - POR ENTRADA */}
                            <div className="space-y-1">
                              <Label className="text-xs text-muted-foreground whitespace-nowrap">Linha <span className="text-[10px] text-muted-foreground/60">(opcional)</span></Label>
                              {isEditing ? (
                                <div className="h-8 px-1.5 text-[10px] flex items-center justify-center bg-muted/50 rounded-md border font-medium truncate">
                                  {entry.selecaoLivre || "—"}
                                </div>
                              ) : (
                                <Input
                                  placeholder="Ex: 2.5"
                                  value={entry.selecaoLivre}
                                  onChange={(e) => updateOdd(index, "selecaoLivre" as keyof OddEntry, e.target.value)}
                                  className="h-8 text-[10px] px-1.5 border-dashed"
                                  tabIndex={index * 4 + 4}
                                />
                              )}
                            </div>
                          </div>
                          
                          {/* Parceiro + Saldo IMEDIATAMENTE após entrada principal - DENTRO DO BLOCO */}
                          {entry.bookmaker_id && (
                            <div className="px-1 text-[11px] text-muted-foreground space-y-0.5">
                              <div className="flex items-center justify-between gap-1">
                                <span className="truncate max-w-[60%]">
                                  {parceiroShortName || "—"}
                                </span>
                                {!isEditing && saldoDisponivelPosicao !== null && (
                                  <div className="flex items-center gap-1 flex-shrink-0">
                                    <Wallet className={`h-3 w-3 ${saldoInsuficiente ? "text-destructive" : getCurrencyTextColor(selectedBookmaker?.moeda || "BRL")}`} />
                                    <span className={`font-medium ${saldoInsuficiente ? "text-destructive" : getCurrencyTextColor(selectedBookmaker?.moeda || "BRL")}`}>
                                      {formatCurrency(saldoDisponivelPosicao, selectedBookmaker?.moeda || "BRL")}
                                    </span>
                                  </div>
                                )}
                              </div>
                              {/* Breakdown do saldo operável - MULTI-MOEDA - TAMANHO MAIOR */}
                              {!isEditing && selectedBookmaker && (
                                <div className="flex items-center justify-center gap-2 text-[10px] flex-wrap">
                                  <span className="text-emerald-400">
                                    {getCurrencySymbol(selectedBookmaker.moeda)} {(Number(selectedBookmaker.saldo_real) || 0).toFixed(0)}
                                  </span>
                                  {(Number(selectedBookmaker.saldo_freebet) || 0) > 0 && (
                                    <span className="text-amber-400">
                                      FB: {(Number(selectedBookmaker.saldo_freebet) || 0).toFixed(0)}
                                    </span>
                                  )}
                                  {(Number(selectedBookmaker.saldo_bonus) || 0) > 0 && (
                                    <span className="text-purple-400">
                                      🎁: {(Number(selectedBookmaker.saldo_bonus) || 0).toFixed(0)}
                                    </span>
                                  )}
                                </div>
                              )}
                              {/* Aviso de saldo insuficiente (apenas para criação) */}
                              {!isEditing && saldoInsuficiente && (
                                <Badge variant="destructive" className="text-[10px] h-4 px-1 w-fit">
                                  Saldo Insuficiente
                                </Badge>
                              )}
                            </div>
                          )}
                          
                          {/* ========== ENTRADAS ADICIONAIS (MÚLTIPLAS ENTRADAS) ========== */}
                          {!isEditing && (
                            <div className="space-y-2 pt-2 border-t border-dashed border-border/30">
                              {/* Lista de entradas adicionais existentes */}
                              {entry.additionalEntries?.map((addEntry, addIdx) => {
                                const addBk = bookmakerSaldos.find(b => b.id === addEntry.bookmaker_id);
                                const addStake = parseFloat(addEntry.stake) || 0;
                                const addSaldoDisponivel = getSaldoDisponivelParaAdditionalEntry(addEntry.bookmaker_id, index, addIdx);
                                const addSaldoInsuficiente = addEntry.bookmaker_id && addStake > 0 && addSaldoDisponivel !== null && addStake > addSaldoDisponivel + 0.01;
                                const addParceiroNome = addBk?.parceiro_nome?.split(" ");
                                const addParceiroShortName = addParceiroNome 
                                  ? `${addParceiroNome[0]} ${addParceiroNome[addParceiroNome.length - 1] || ""}`.trim()
                                  : "";
                                
                                return (
                                  <div key={addIdx} className="space-y-1 animate-in fade-in slide-in-from-top-1">
                                    {/* Wrapper com posicionamento relativo para o botão de excluir */}
                                    <div className="relative">
                                      {/* Grid alinhado EXATAMENTE com entrada principal: 140px 80px 50px 80px */}
                                      <div className="grid gap-1.5 items-end pr-5" style={{ gridTemplateColumns: '140px 80px 50px 80px' }}>
                                        <Select 
                                          value={addEntry.bookmaker_id}
                                          onValueChange={(v) => updateAdditionalEntry(index, addIdx, "bookmaker_id", v)}
                                        >
                                          <SelectTrigger className={`h-7 text-[10px] w-full px-1.5 bg-background ${addSaldoInsuficiente ? "border-destructive" : ""}`}>
                                            <SelectValue placeholder="+ Casa">
                                              {addBk?.nome && (
                                                <span className="truncate uppercase">{addBk.nome}</span>
                                              )}
                                            </SelectValue>
                                          </SelectTrigger>
                                          <SelectContent className="max-w-[320px]">
                                            {bookmakersDisponiveis.map(bk => {
                                              // Calcular saldo disponível para esta entrada adicional específica
                                              const saldoBaseParaEssa = getSaldoDisponivelParaAdditionalEntry(bk.id, index, addIdx);
                                              const isIndisponivel = saldoBaseParaEssa !== null && saldoBaseParaEssa < 0.50;
                                              
                                              return (
                                                <SelectItem 
                                                  key={bk.id} 
                                                  value={bk.id}
                                                  disabled={isIndisponivel}
                                                  className={isIndisponivel ? "opacity-50" : ""}
                                                >
                                                  <BookmakerSelectOption
                                                    bookmaker={{
                                                      id: bk.id,
                                                      nome: bk.nome,
                                                      parceiro_nome: bk.parceiro_nome,
                                                      moeda: bk.moeda,
                                                      saldo_operavel: saldoBaseParaEssa ?? bk.saldo_operavel,
                                                      saldo_disponivel: bk.saldo_disponivel,
                                                      saldo_freebet: bk.saldo_freebet,
                                                      saldo_bonus: bk.saldo_bonus,
                                                      logo_url: bk.logo_url,
                                                    }}
                                                    disabled={isIndisponivel}
                                                    showBreakdown={!isIndisponivel}
                                                  />
                                                </SelectItem>
                                              );
                                            })}
                                          </SelectContent>
                                        </Select>
                                        
                                        {/* Linha - mesma largura da entrada principal */}
                                        <Input
                                          placeholder="Ex: 2.5"
                                          value={addEntry.selecaoLivre}
                                          onChange={(e) => updateAdditionalEntry(index, addIdx, "selecaoLivre", e.target.value)}
                                          className="h-7 text-[10px] px-1.5 bg-background"
                                        />
                                        
                                        {/* Odd - mesma largura da entrada principal */}
                                        <Input 
                                          type="number"
                                          step="0.01"
                                          placeholder="Odd"
                                          value={addEntry.odd}
                                          onChange={(e) => updateAdditionalEntry(index, addIdx, "odd", e.target.value)}
                                          className="h-7 text-[10px] px-1.5 bg-background"
                                          onWheel={(e) => e.currentTarget.blur()}
                                        />
                                        
                                        {/* Stake - mesma largura da entrada principal */}
                                        <Input 
                                          type="number"
                                          step="0.01"
                                          placeholder="Stake"
                                          value={addEntry.stake}
                                          onChange={(e) => updateAdditionalEntry(index, addIdx, "stake", e.target.value)}
                                          className={`h-7 text-[10px] px-1.5 bg-background ${addSaldoInsuficiente ? "border-destructive ring-1 ring-destructive/50" : ""}`}
                                          onWheel={(e) => e.currentTarget.blur()}
                                        />
                                      </div>
                                      
                                      {/* Botão excluir - posicionado absolutamente fora do grid */}
                                      <Button
                                        type="button"
                                        variant="ghost"
                                        size="sm"
                                        tabIndex={-1}
                                        className="absolute right-0 top-0 h-7 w-4 p-0 text-muted-foreground/40 hover:text-destructive transition-colors"
                                        onClick={() => removeAdditionalEntry(index, addIdx)}
                                        title="Remover cobertura"
                                      >
                                        <XCircle className="h-3 w-3" />
                                      </Button>
                                    </div>
                                    
                                    {/* Parceiro + Saldo + Breakdown IMEDIATAMENTE após entrada adicional - MESMO LAYOUT DA PRINCIPAL */}
                                    {addEntry.bookmaker_id && (
                                      <div className="px-1 text-[11px] text-muted-foreground space-y-0.5">
                                        <div className="flex items-center justify-between gap-1">
                                          <span className="truncate max-w-[60%]">
                                            {addParceiroShortName || "—"}
                                          </span>
                                          <div className="flex items-center gap-1 flex-shrink-0">
                                            {addSaldoDisponivel !== null && (
                                              <span className={`flex items-center gap-0.5 ${addSaldoInsuficiente ? "text-destructive" : getCurrencyTextColor(addBk?.moeda || "BRL")}`}>
                                                <Wallet className="h-2.5 w-2.5" />
                                                <span className="font-medium">
                                                  {formatCurrency(addSaldoDisponivel, addBk?.moeda || "BRL")}
                                                </span>
                                              </span>
                                            )}
                                            {addSaldoInsuficiente && (
                                              <Badge variant="destructive" className="text-[9px] h-3.5 px-1">
                                                Insuficiente
                                              </Badge>
                                            )}
                                          </div>
                                        </div>
                                        {/* Breakdown do saldo operável - IGUAL À ENTRADA PRINCIPAL */}
                                        {addBk && (
                                          <div className="flex items-center justify-center gap-2 text-[10px] text-muted-foreground/70 flex-wrap">
                                            <span className="text-emerald-400/80">
                                              {getCurrencySymbol(addBk.moeda)} {(Number(addBk.saldo_real) || 0).toFixed(0)}
                                            </span>
                                            {(Number(addBk.saldo_freebet) || 0) > 0 && (
                                              <span className="text-amber-400/80">
                                                FB: {(Number(addBk.saldo_freebet) || 0).toFixed(0)}
                                              </span>
                                            )}
                                            {(Number(addBk.saldo_bonus) || 0) > 0 && (
                                              <span className="text-purple-400/80">
                                                🎁: {(Number(addBk.saldo_bonus) || 0).toFixed(0)}
                                              </span>
                                            )}
                                          </div>
                                        )}
                                      </div>
                                    )}
                                  </div>
                                );
                              })}
                              
                              {/* Botão para adicionar entrada - fora do fluxo de Tab */}
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                tabIndex={-1}
                                className="w-full h-6 text-[10px] text-muted-foreground hover:text-primary border border-dashed border-border/50 hover:border-primary/50"
                                onClick={() => addAdditionalEntry(index)}
                              >
                                <Plus className="h-3 w-3 mr-1" />
                                Adicionar cobertura
                              </Button>
                              
                              {/* Resumo consolidado se houver múltiplas entradas */}
                              {hasMultipleEntries(entry) && (
                                <div className="flex items-center justify-between px-2 py-1.5 rounded-md bg-primary/10 border border-primary/20 text-[10px]">
                                  <div className="flex items-center gap-1">
                                    <Badge variant="outline" className="h-4 px-1 text-[9px] border-primary/30 text-primary">
                                      {(entry.additionalEntries?.length || 0) + 1} entradas
                                    </Badge>
                                  </div>
                                  <div className="flex items-center gap-3">
                                    <span className="text-muted-foreground">
                                      Odd média: <span className="font-medium text-foreground">{getOddMediaPerna(entry).toFixed(2)}</span>
                                    </span>
                                    <span className="text-muted-foreground">
                                      Stake total: <span className="font-medium text-foreground">{formatCurrency(getStakeTotalPerna(entry), entry.moeda)}</span>
                                    </span>
                                  </div>
                                </div>
                              )}
                            </div>
                          )}
                          
                          {/* Toggle "Gerou Freebet" - compacto */}
                          {!isEditing && entry.bookmaker_id && (
                            <div className={`mt-2 pt-2 border-t border-border/30 ${
                              entry.gerouFreebet 
                                ? "bg-gradient-to-r from-emerald-500/10 to-transparent rounded-lg -mx-2 px-2 pb-2" 
                                : ""
                            }`}>
                              <div className="flex items-center justify-between gap-2">
                                <button
                                  type="button"
                                  onClick={() => updateOddFreebet(index, !entry.gerouFreebet)}
                                  className="flex items-center gap-2 group"
                                >
                                  <div className={`relative w-8 h-[18px] rounded-full transition-all duration-200 ${
                                    entry.gerouFreebet 
                                      ? "bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.4)]" 
                                      : "bg-muted-foreground/30"
                                  }`}>
                                    <div className={`absolute top-[2px] w-3.5 h-3.5 rounded-full bg-white shadow-sm transition-all duration-200 ${
                                      entry.gerouFreebet 
                                        ? "left-[17px]" 
                                        : "left-[2px]"
                                    }`} />
                                  </div>
                                  <div className="flex items-center gap-1">
                                    <Gift className={`h-3 w-3 transition-colors ${
                                      entry.gerouFreebet ? "text-emerald-400" : "text-muted-foreground"
                                    }`} />
                                    <span className={`text-[10px] font-medium transition-colors ${
                                      entry.gerouFreebet 
                                        ? "text-emerald-400" 
                                        : "text-muted-foreground group-hover:text-foreground"
                                    }`}>
                                      Freebet
                                    </span>
                                  </div>
                                </button>
                                
                                {/* Input de valor com animação */}
                                <div className={`flex items-center gap-1 overflow-hidden transition-all duration-200 ${
                                  entry.gerouFreebet 
                                    ? "opacity-100 max-w-[80px]" 
                                    : "opacity-0 max-w-0"
                                }`}>
                                  <span className="text-[10px] text-emerald-400/80 whitespace-nowrap">R$</span>
                                  <Input
                                    type="number"
                                    step="0.01"
                                    min="0"
                                    value={entry.valorFreebetGerada || ""}
                                    onChange={(e) => updateOddFreebet(index, true, e.target.value)}
                                    placeholder="0"
                                    className="h-6 w-16 text-[10px] text-center px-1 bg-background/60 border-emerald-500/40 focus:border-emerald-500/60"
                                  />
                                </div>
                              </div>
                            </div>
                          )}
                          
                          {/* Indicador de Freebet em modo edição */}
                          {isEditing && entry.gerouFreebet && entry.valorFreebetGerada && (
                            <div className="mt-2 pt-2 border-t border-border/30">
                              <div className="flex items-center justify-center gap-2">
                                <Gift className="h-3 w-3 text-emerald-400" />
                                <span className="text-[10px] font-medium text-emerald-400">
                                  Freebet: {formatCurrency(parseFloat(entry.valorFreebetGerada) || 0, entry.moeda)}
                                </span>
                                {entry.freebetStatus && (
                                  <Badge className={`text-[9px] h-4 px-1 ${
                                    entry.freebetStatus === "LIBERADA" 
                                      ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/40" 
                                      : entry.freebetStatus === "NAO_LIBERADA"
                                      ? "bg-red-500/20 text-red-400 border-red-500/40"
                                      : "bg-amber-500/20 text-amber-400 border-amber-500/40"
                                  }`}>
                                    {entry.freebetStatus === "LIBERADA" ? "Liberada" : 
                                     entry.freebetStatus === "NAO_LIBERADA" ? "Não Lib." : "Pendente"}
                                  </Badge>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
                
                {/* Controle de Arredondamento de Stake - apenas em criação */}
                {!isEditing && (
                  <div className="pt-3 border-t">
                    <div className="flex items-center gap-3">
                      <Switch
                        id="arredondar-switch"
                        checked={arredondarAtivado}
                        onCheckedChange={setArredondarAtivado}
                      />
                      <Label htmlFor="arredondar-switch" className="text-sm text-muted-foreground cursor-pointer">
                        Arredondar stakes
                      </Label>
                      {arredondarAtivado && (
                        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-primary/10 border border-primary/30">
                          <span className="text-xs text-muted-foreground">R$</span>
                          <Input
                            type="number"
                            min="1"
                            step="1"
                            value={arredondarValor}
                            onChange={(e) => setArredondarValor(e.target.value)}
                            className="h-6 w-14 text-center font-semibold text-primary border-0 bg-transparent p-0 focus-visible:ring-0"
                          />
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Análise - Posicionamento dinâmico: 
               1-2: sidebar direita
               1-X-2: abaixo das pernas (layout horizontal compacto) */}
          <div className={`flex-shrink-0 space-y-1.5 ${
            modelo === "1-X-2" 
              ? "w-full" 
              : "w-full lg:w-48"
          }`}>
            {/* INDICADOR DE CONSOLIDAÇÃO MULTI-MOEDA */}
            {analysis.isMultiCurrency && (
              <MultiCurrencyIndicator
                moedaConsolidacao={moedaConsolidacao}
                cotacaoAtual={cotacaoAtual}
                fonteCotacao={fonteCotacao}
                ptaxAtual={ptaxAtual}
                deltaCambial={deltaCambial}
                isMultiCurrency={true}
                compact
              />
            )}
            
            <Card className="border-primary/20">
              <CardHeader className="pb-1 pt-2 px-3">
                <CardTitle className="text-xs flex items-center gap-1.5">
                  <Calculator className="h-3.5 w-3.5" />
                  {isEditing && analysisReal.isResolved ? "Resultado" : "Análise"}
                </CardTitle>
              </CardHeader>
              <CardContent className={`px-3 pb-3 ${
                modelo === "1-X-2" 
                  ? "flex flex-wrap gap-4 items-start" 
                  : "space-y-1.5"
              }`}>
                {/* Stake Total */}
                <div className={`p-2 rounded-lg bg-primary/10 border border-primary/30 ${modelo === "1-X-2" ? "min-w-[140px]" : ""}`}>
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs text-muted-foreground">Stake Total</p>
                    {!isEditing && arredondarAtivado && (
                      <Badge variant="outline" className="text-[9px] px-1 py-0 h-4">
                        ≈{arredondarValor}
                      </Badge>
                    )}
                  </div>
                  {analysis.isMultiCurrency ? (
                    <div className="flex flex-col gap-0.5">
                      <p className="text-sm font-bold text-amber-400">Multi-Moeda</p>
                      {analysis.stakeTotal > 0 && (
                        <p className="text-xs font-semibold text-primary">
                          {formatCurrency(analysis.stakeTotal, moedaConsolidacao)}
                        </p>
                      )}
                    </div>
                  ) : (
                    <p className="text-base font-bold text-primary">
                      {analysis.stakeTotal > 0 ? formatCurrency(analysis.stakeTotal, analysis.moedaDominante) : "—"}
                    </p>
                  )}
                </div>

                {/* Modo Resultado Real (quando resolvida) */}
                {isEditing && analysisReal.isResolved ? (
                  <>
                    {/* Resultado Final */}
                    <div className={`p-3 rounded-lg border ${
                      analysisReal.lucroReal >= 0 
                        ? "bg-emerald-500/10 border-emerald-500/30" 
                        : "bg-red-500/10 border-red-500/30"
                    }`}>
                      <p className="text-xs text-muted-foreground mb-1">Resultado Final</p>
                      <p className={`text-xl font-bold ${
                        analysisReal.lucroReal >= 0 ? "text-emerald-500" : "text-red-500"
                      }`}>
                        {analysisReal.lucroReal >= 0 ? "+" : ""}{formatCurrency(analysisReal.lucroReal, analysis.moedaDominante)}
                      </p>
                      <p className={`text-sm font-medium ${
                        analysisReal.roiReal >= 0 ? "text-emerald-400" : "text-red-400"
                      }`}>
                        {analysisReal.roiReal >= 0 ? "+" : ""}{analysisReal.roiReal.toFixed(2)}% ROI
                      </p>
                    </div>

                    {/* Status das pernas */}
                    <div className="space-y-1">
                      <p className="text-xs font-medium text-muted-foreground">Posições</p>
                      {odds.map((entry, index) => (
                        <div key={index} className="flex items-center justify-between text-xs p-1.5 rounded bg-muted/30">
                          <span>{entry.selecao}</span>
                          <Badge className={`text-[10px] ${
                            entry.resultado === "GREEN" ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/40" :
                            entry.resultado === "RED" ? "bg-red-500/20 text-red-400 border-red-500/40" :
                            "bg-gray-500/20 text-gray-400 border-gray-500/40"
                          }`}>
                            {entry.resultado || "—"}
                          </Badge>
                        </div>
                      ))}
                    </div>
                  </>
                ) : (
                  <>
                    {/* ROI Compacto: Max (verde) / Min (vermelho) */}
                    <div className={`p-2 rounded-lg bg-muted/50 border border-border ${modelo === "1-X-2" ? "min-w-[120px]" : "space-y-1"}`}>
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs text-emerald-400">Máx</span>
                        <span className="text-xs font-bold text-emerald-500">
                          {analysis.stakeTotal > 0 
                            ? `${analysis.maxRoi >= 0 ? "+" : ""}${analysis.maxRoi.toFixed(1)}%`
                            : "—"
                          }
                        </span>
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs text-red-400">Mín</span>
                        <span className="text-xs font-bold text-red-500">
                          {analysis.stakeTotal > 0 
                            ? `${analysis.minRoi >= 0 ? "+" : ""}${analysis.minRoi.toFixed(1)}%`
                            : "—"
                          }
                        </span>
                      </div>
                    </div>

                    {/* Cenários de Resultado - layout adaptativo */}
                    {analysis.scenarios.length > 0 && analysis.stakeTotal > 0 && (
                      <div className={modelo === "1-X-2" ? "flex gap-2 flex-wrap" : ""}>
                        {!modelo.includes("1-X-2") && <Separator className="my-1" />}
                        {analysis.scenarios.map((scenario, index) => (
                          <div 
                            key={index} 
                            className={`p-1.5 rounded-lg border ${
                              scenario.isPositive 
                                ? "bg-emerald-500/5 border-emerald-500/20" 
                                : "bg-red-500/5 border-red-500/20"
                            } ${modelo === "1-X-2" ? "min-w-[100px]" : ""}`}
                          >
                            <div className="flex items-center justify-between gap-1.5 min-w-0">
                              <span className="text-[10px] font-medium truncate">{scenario.selecao}</span>
                              <span className={`text-[10px] font-bold whitespace-nowrap ${scenario.isPositive ? "text-emerald-500" : "text-red-500"}`}>
                                {scenario.lucro >= 0 ? "+" : ""}{formatCurrency(scenario.lucro, analysis.moedaDominante)}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Probabilidades - ocultar no modo 1-X-2 para economizar espaço */}
                    {analysis.hasPartialData && modelo !== "1-X-2" && (
                      <>
                        <Separator className="my-1" />
                        <div>
                          <p className="text-xs font-medium mb-1 text-muted-foreground">Probabilidades</p>
                          <div className="space-y-0.5">
                            {odds.map((entry, index) => {
                              const impliedProb = analysis.impliedProbs[index];
                              return (
                                <div key={index} className="flex items-center justify-between text-[10px]">
                                  <span className="text-muted-foreground">{entry.selecao}</span>
                                  <span className={impliedProb > 0 ? "text-blue-400" : "text-muted-foreground"}>
                                    {impliedProb > 0 ? `${(impliedProb * 100).toFixed(0)}%` : "—"}
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      </>
                    )}

                    {/* Mensagem quando não há dados */}
                    {!analysis.hasPartialData && (
                      <div className="text-center py-4 text-muted-foreground">
                        <Calculator className="h-8 w-8 mx-auto mb-2 opacity-50" />
                        <p className="text-xs">Preencha as odds para ver a análise</p>
                      </div>
                    )}
                  </>
                )}
              </CardContent>
            </Card>
          </div>
        </div>

        <DialogFooter className="flex justify-between mt-4">
          <div>
            {isEditing && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="destructive" size="sm">
                    <Trash2 className="h-4 w-4 mr-1" />
                    Excluir
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Excluir Surebet?</AlertDialogTitle>
                    <AlertDialogDescription>
                      Esta ação não pode ser desfeita. As apostas vinculadas terão o vínculo removido.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancelar</AlertDialogCancel>
                    <AlertDialogAction onClick={handleDelete}>Excluir</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button 
              onClick={handleSave} 
              disabled={saving || !analysis || analysis.stakeTotal <= 0}
            >
              <Save className="h-4 w-4 mr-1" />
              {isEditing ? "Salvar" : "Registrar"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
