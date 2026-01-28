/**
 * SurebetDialog - Formulário de criação/edição de Surebets
 * 
 * NOTA DE ARQUITETURA (2026-01):
 * Este componente ainda usa inserções diretas no Supabase por razões de complexidade.
 * O hook useSurebetService foi criado para centralizar a lógica, mas a migração completa
 * requer refatoração extensiva devido à complexidade do formulário (múltiplas entradas,
 * snapshots de moeda, freebets, etc.).
 * 
 * PRÓXIMOS PASSOS:
 * - Novas funcionalidades devem usar useSurebetService
 * - Gradualmente migrar lógica de handleSubmit para o serviço
 * - O dual-write atual JÁ foi corrigido para incluir apostas_pernas
 * 
 * @see src/services/aposta - Serviço centralizado de apostas
 * @see src/hooks/useSurebetService.ts - Hook especializado para Surebets
 */
import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/hooks/useWorkspace";
import { useBookmakerSaldosQuery, useInvalidateBookmakerSaldos, type BookmakerSaldo } from "@/hooks/useBookmakerSaldosQuery";
import { usePreCommitValidation } from "@/hooks/usePreCommitValidation";
import { useCurrencySnapshot, type SupportedCurrency } from "@/hooks/useCurrencySnapshot";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MoneyInput } from "@/components/ui/money-input";
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
  ChevronUp,
  Camera,
  FileText
} from "lucide-react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { RegistroApostaFields, RegistroApostaValues, getSuggestionsForTab } from "./RegistroApostaFields";
import { isAbaEstrategiaFixa, getEstrategiaFromTab } from "@/lib/apostaConstants";
import { detectarMoedaOperacao, calcularValorBRLReferencia, type MoedaOperacao } from "@/types/apostasUnificada";
import { pernasToInserts } from "@/types/apostasPernas";
import { useSurebetService, type SurebetPerna as SurebetPernaService } from "@/hooks/useSurebetService";
import { useApostaRascunho, type RascunhoPernaData, type ApostaRascunho } from "@/hooks/useApostaRascunho";
import { MERCADOS_POR_ESPORTE, getMarketsForSport, getMarketsForSportAndModel, isMercadoCompativelComModelo, mercadoAdmiteEmpate, resolveMarketToOptions, type ModeloAposta } from "@/lib/marketNormalizer";
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
import { reliquidarAposta, liquidarPernaSurebet } from "@/services/aposta";
// MOTOR v9.5: updateBookmakerBalance REMOVIDO - usa liquidarPernaSurebet via motor financeiro
import { useBonusBalanceManager } from "@/hooks/useBonusBalanceManager";
import { useSurebetPrintImport } from "@/hooks/useSurebetPrintImport";
import { SurebetLegPrintCompact } from "./SurebetLegPrintFields";

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
  // Campos de contexto/estratégia (single source of truth)
  forma_registro?: string | null;
  estrategia?: string | null;
  contexto_operacional?: string | null;
}

interface SurebetDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projetoId: string;
  surebet: Surebet | null;
  onSuccess: () => void;
  activeTab?: string;
  /** Quando true, renderiza apenas o conteúdo interno (sem Dialog wrapper) para uso em janelas flutuantes */
  embedded?: boolean;
  /** Rascunho para pré-preencher o formulário (de localStorage) */
  rascunho?: ApostaRascunho | null;
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

// Origem do stake para controle de precedência
type StakeOrigem = "print" | "referencia" | "manual";

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
  // NOVO: Rastrear origem do stake para precedência correta
  stakeOrigem?: StakeOrigem;
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
// - Quando há stakes (principal ou coberturas), usa média ponderada por stake.
// - Quando ainda não há stakes preenchidas (ex.: pernas não-referência antes do auto-cálculo),
//   usa a odd informada (prioriza a principal) para permitir o cálculo automático no 1X2.
function calcularOddMedia(mainEntry: { odd: string; stake: string }, additionalEntries?: OddFormEntry[]): number {
  const allEntries = [
    { odd: mainEntry.odd, stake: mainEntry.stake, isMain: true },
    ...(additionalEntries || []).map(e => ({ odd: e.odd, stake: e.stake, isMain: false }))
  ];

  const oddsValidas = allEntries
    .map(e => ({ ...e, oddNum: parseFloat(e.odd), stakeNum: parseFloat(e.stake) }))
    .filter(e => !isNaN(e.oddNum) && e.oddNum > 1);

  if (oddsValidas.length === 0) return 0;

  // 1) Se existe stake total > 0, usar média ponderada (somente entries com stake > 0)
  const entriesComStake = oddsValidas.filter(e => !isNaN(e.stakeNum) && e.stakeNum > 0);
  const somaStake = entriesComStake.reduce((acc, e) => acc + e.stakeNum, 0);

  if (somaStake > 0) {
    const somaStakeOdd = entriesComStake.reduce((acc, e) => acc + e.stakeNum * e.oddNum, 0);
    return somaStakeOdd / somaStake;
  }

  // 2) Sem stakes ainda: usar a odd principal (se válida) para viabilizar auto-cálculo
  const mainOdd = oddsValidas.find(e => e.isMain)?.oddNum;
  return mainOdd ?? oddsValidas[0].oddNum;
}

// Função para calcular stake total de uma perna
function calcularStakeTotal(mainEntry: { stake: string }, additionalEntries?: OddFormEntry[]): number {
  const mainStake = parseFloat(mainEntry.stake) || 0;
  const additionalStakes = (additionalEntries || []).reduce((acc, e) => {
    return acc + (parseFloat(e.stake) || 0);
  }, 0);
  return mainStake + additionalStakes;
}

// Parser tolerante para números vindos do OCR (ex.: "R$ 1.234,56", "177", "3,20")
function parseNumeroPtLoose(raw: string | null | undefined): number | null {
  if (!raw) return null;

  // Remove espaços e busca o primeiro bloco numérico
  const match = raw.replace(/\s+/g, "").match(/-?\d[\d.,]*/);
  if (!match) return null;

  let s = match[0];
  const hasDot = s.includes(".");
  const hasComma = s.includes(",");

  if (hasDot && hasComma) {
    // Decide separador decimal pelo último separador presente
    if (s.lastIndexOf(",") > s.lastIndexOf(".")) {
      // 1.234,56 => 1234.56
      s = s.replace(/\./g, "").replace(",", ".");
    } else {
      // 1,234.56 => 1234.56
      s = s.replace(/,/g, "");
    }
  } else if (hasComma && !hasDot) {
    // 123,45 => 123.45
    s = s.replace(",", ".");
  }

  const n = parseFloat(s);
  return Number.isFinite(n) ? n : null;
}

/**
 * ============================================================
 * CÁLCULO DE STAKES PARA MODELO 1x2 (TRÊS VIAS - MATRICIAL)
 * ============================================================
 * 
 * Para arbitragem 3-way, precisamos resolver um sistema onde:
 * - Existem 3 desfechos mutuamente exclusivos (1, X, 2)
 * - Queremos lucro igual em todos os cenários
 * 
 * Fórmula para equalização de lucro:
 * Para cada cenário i: lucro_i = stake_i * odd_i - stake_total
 * 
 * Para igualar todos os lucros (lucro_1 = lucro_X = lucro_2 = L):
 * stake_i * odd_i - stake_total = L
 * stake_i = (stake_total + L) / odd_i
 * 
 * Como stake_total = stake_1 + stake_X + stake_2:
 * stake_total = (stake_total + L) * (1/odd_1 + 1/odd_X + 1/odd_2)
 * stake_total = (stake_total + L) * sum_prob
 * 
 * Onde sum_prob = 1/odd_1 + 1/odd_X + 1/odd_2 (soma das probabilidades implícitas)
 * 
 * Resolvendo:
 * stake_total = stake_total * sum_prob + L * sum_prob
 * stake_total * (1 - sum_prob) = L * sum_prob
 * L = stake_total * (1 - sum_prob) / sum_prob
 * 
 * Para calcular stakes individuais a partir da stake de referência:
 * Se temos stake_ref na perna de referência com odd_ref:
 * stake_total + L = stake_ref * odd_ref (retorno da referência)
 * 
 * Portanto: stake_i = (stake_ref * odd_ref) / odd_i
 * 
 * PORÉM, isso só funciona se sum_prob < 1 (arbitragem real).
 * Se sum_prob >= 1, não há arbitragem garantida, mas ainda calculamos
 * as stakes para equalizar o lucro/prejuízo em todos os cenários.
 */
function calcularStakes1X2(
  odds: { oddMedia: number; stakeAtual: number; isReference: boolean }[],
  arredondarFn: (value: number) => number
): { stakes: number[]; isValid: boolean; lucroIgualado: number } {
  // Validar que temos exatamente 3 pernas
  if (odds.length !== 3) {
    return { stakes: odds.map(o => o.stakeAtual), isValid: false, lucroIgualado: 0 };
  }
  
  // Verificar se todas as odds são válidas
  const todasOddsValidas = odds.every(o => o.oddMedia > 1);
  if (!todasOddsValidas) {
    return { stakes: odds.map(o => o.stakeAtual), isValid: false, lucroIgualado: 0 };
  }
  
  // Encontrar a perna de referência
  const refIndex = odds.findIndex(o => o.isReference);
  if (refIndex === -1) {
    return { stakes: odds.map(o => o.stakeAtual), isValid: false, lucroIgualado: 0 };
  }
  
  const refOdd = odds[refIndex].oddMedia;
  const refStake = odds[refIndex].stakeAtual;
  
  if (refStake <= 0 || refOdd <= 1) {
    return { stakes: odds.map(o => o.stakeAtual), isValid: false, lucroIgualado: 0 };
  }
  
  // Retorno alvo = stake_ref × odd_ref (igual para todos os cenários)
  const targetReturn = refStake * refOdd;
  
  // Calcular stakes para cada perna
  // stake_i = targetReturn / odd_i
  const calculatedStakes = odds.map((o, i) => {
    if (i === refIndex) return refStake;
    return arredondarFn(targetReturn / o.oddMedia);
  });
  
  // Calcular stake total e lucro igualado
  const stakeTotal = calculatedStakes.reduce((a, b) => a + b, 0);
  const lucroIgualado = targetReturn - stakeTotal;
  
  return { 
    stakes: calculatedStakes, 
    isValid: true,
    lucroIgualado
  };
}

/**
 * ============================================================
 * CÁLCULO DE STAKES PARA MODELO 1-2 (DUAS VIAS - BINÁRIO)
 * ============================================================
 * 
 * Para arbitragem 2-way, a fórmula é mais simples:
 * stake_1 * odd_1 = stake_2 * odd_2 (igualar retornos)
 * 
 * Dado stake_ref e odd_ref na perna de referência:
 * stake_outro = (stake_ref * odd_ref) / odd_outro
 */
function calcularStakes12(
  odds: { oddMedia: number; stakeAtual: number; isReference: boolean }[],
  arredondarFn: (value: number) => number
): { stakes: number[]; isValid: boolean; lucroIgualado: number } {
  // Validar que temos exatamente 2 pernas
  if (odds.length !== 2) {
    return { stakes: odds.map(o => o.stakeAtual), isValid: false, lucroIgualado: 0 };
  }
  
  const refIndex = odds.findIndex(o => o.isReference);
  if (refIndex === -1) {
    return { stakes: odds.map(o => o.stakeAtual), isValid: false, lucroIgualado: 0 };
  }
  
  const refOdd = odds[refIndex].oddMedia;
  const refStake = odds[refIndex].stakeAtual;
  
  if (refStake <= 0 || refOdd <= 1) {
    return { stakes: odds.map(o => o.stakeAtual), isValid: false, lucroIgualado: 0 };
  }
  
  const otherIndex = refIndex === 0 ? 1 : 0;
  const otherOdd = odds[otherIndex].oddMedia;
  
  if (otherOdd <= 1) {
    return { stakes: odds.map(o => o.stakeAtual), isValid: false, lucroIgualado: 0 };
  }
  
  const targetReturn = refStake * refOdd;
  const otherStake = arredondarFn(targetReturn / otherOdd);
  
  const calculatedStakes = odds.map((_, i) => {
    if (i === refIndex) return refStake;
    return otherStake;
  });
  
  const stakeTotal = calculatedStakes.reduce((a, b) => a + b, 0);
  const lucroIgualado = targetReturn - stakeTotal;
  
  return { 
    stakes: calculatedStakes, 
    isValid: true,
    lucroIgualado
  };
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

export function SurebetDialog({ open, onOpenChange, projetoId, surebet, onSuccess, activeTab = 'surebet', embedded = false, rascunho = null }: SurebetDialogProps) {
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
  // CORRIGIDO: Incluir todas as casas quando em modo edição OU quando aba é bônus
  const isBonusContext = activeTab === 'bonus' || activeTab === 'bonus-operacoes';
  const { 
    data: bookmakerSaldos = [], 
    isLoading: saldosLoading,
    refetch: refetchSaldos 
  } = useBookmakerSaldosQuery({
    projetoId,
    enabled: open,
    includeZeroBalance: isEditing || isBonusContext, // Em edição ou contexto bônus, mostrar todos
  });
  const invalidateSaldos = useInvalidateBookmakerSaldos();
  
  // ========== HOOK DE GERENCIAMENTO DE BÔNUS/ROLLOVER ==========
  const { atualizarProgressoRollover, reverterProgressoRollover, hasActiveRolloverBonus } = useBonusBalanceManager();
  
  // ========== HOOK CENTRALIZADO DE SUREBET ==========
  // Delega operações de persistência para o ApostaService
  const { criarSurebet, atualizarSurebet, deletarSurebet } = useSurebetService();
  
  // ========== HOOK DE RASCUNHOS (LOCALSTORAGE) ==========
  // Permite salvar surebets incompletas (1 perna, sem stake) sem tocar no banco
  const { criarRascunho, listarPorTipo } = useApostaRascunho(projetoId, workspaceId || '');
  const rascunhosSurebet = useMemo(() => listarPorTipo('SUREBET'), [listarPorTipo]);
  // Form state
  const [evento, setEvento] = useState("");
  const [mercado, setMercado] = useState("");
  const [esporte, setEsporte] = useState("Futebol");
  const [modelo, setModelo] = useState<"1-X-2" | "1-2">("1-2");
  const [observacoes, setObservacoes] = useState("");
  const [saving, setSaving] = useState(false);
  
  // Estado removido: showIncompleteCoverageConfirm - botão agora desabilita para < 2 pernas
  
  // Registro explícito - usa sugestões baseadas na aba ativa
  // Forma de registro é sempre ARBITRAGEM, estratégia e contexto vêm da aba
  // Registro explícito - estratégia NUNCA é inferida automaticamente
  // Se a aba não define estratégia (ex: Apostas Livres), fica null e o usuário DEVE escolher
  const [registroValues, setRegistroValues] = useState<RegistroApostaValues>(() => {
    const suggestions = getSuggestionsForTab(activeTab);
    return {
      forma_registro: 'ARBITRAGEM',
      estrategia: suggestions.estrategia ?? null, // CRÍTICO: null se não definido, NUNCA fallback
      contexto_operacional: suggestions.contexto_operacional ?? 'NORMAL',
    };
  });
  
  // Arredondamento de stakes - ativado por padrão
  const [arredondarAtivado, setArredondarAtivado] = useState(true);
  const [arredondarValor, setArredondarValor] = useState("1");
  
  // Odds entries (2 for binary, 3 for 1X2)
  const [odds, setOdds] = useState<OddEntry[]>([
    { bookmaker_id: "", moeda: "BRL", odd: "", stake: "", selecao: "Sim", selecaoLivre: "", isReference: true, isManuallyEdited: false, stakeOrigem: undefined, additionalEntries: [] },
    { bookmaker_id: "", moeda: "BRL", odd: "", stake: "", selecao: "Não", selecaoLivre: "", isReference: false, isManuallyEdited: false, stakeOrigem: undefined, additionalEntries: [] }
  ]);
  
  // Apostas vinculadas para edição
  const [linkedApostas, setLinkedApostas] = useState<any[]>([]);
  
  // Estado para controlar expansão de resultados avançados por perna
  const [expandedResultados, setExpandedResultados] = useState<Record<number, boolean>>({});

  // ========== IMPORTAÇÃO VIA PRINT (POR PERNA) ==========
  const fileInputRefs = useRef<(HTMLInputElement | null)[]>([]);
  const [activePrintLegIndex, setActivePrintLegIndex] = useState<number | null>(null);
  const [expandedPrintUrl, setExpandedPrintUrl] = useState<string | null>(null);
  const {
    legPrints,
    isProcessingAny,
    sharedContext,
    processLegImage,
    clearLegPrint,
    clearAllPrints,
    initializeLegPrints,
    applyLegData,
    acceptInference,
    rejectInference,
  } = useSurebetPrintImport();

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
        
        // CRÍTICO: Restaurar estratégia e contexto operacional ORIGINAIS da aposta
        // Isso garante que ao editar, o contexto real em que a aposta foi criada seja preservado
        setRegistroValues({
          forma_registro: (surebet.forma_registro as RegistroApostaValues['forma_registro']) || 'ARBITRAGEM',
          estrategia: (surebet.estrategia as RegistroApostaValues['estrategia']) || null,
          contexto_operacional: (surebet.contexto_operacional as RegistroApostaValues['contexto_operacional']) || 'NORMAL',
        });
        
        // Buscar apostas vinculadas passando o modelo correto
        fetchLinkedPernas(surebet.id, surebet.modelo);
        // Não inicializar prints em modo edição
      } else if (rascunho && rascunho.tipo === 'SUREBET') {
        // PRÉ-PREENCHER COM DADOS DO RASCUNHO
        setEvento(rascunho.evento || "");
        setEsporte(rascunho.esporte || "Futebol");
        setMercado(rascunho.mercado || "");
        setObservacoes(rascunho.observacoes || "");
        
        // Determinar modelo baseado no número de pernas
        const numPernas = rascunho.pernas?.length || 2;
        const modeloRascunho = numPernas >= 3 ? "1-X-2" : "1-2";
        setModelo(modeloRascunho);
        initializeLegPrints(numPernas);
        
        // Preencher pernas
        if (rascunho.pernas && rascunho.pernas.length > 0) {
          const novasOdds: OddEntry[] = rascunho.pernas.map((perna, i) => ({
            bookmaker_id: perna.bookmaker_id || "",
            moeda: (perna.moeda as SupportedCurrency) || "BRL",
            odd: perna.odd?.toString() || "",
            stake: perna.stake?.toString() || "",
            selecao: perna.selecao || (modeloRascunho === "1-X-2" ? ["Casa", "Empate", "Fora"][i] : ["Sim", "Não"][i]),
            selecaoLivre: perna.selecao_livre || "",
            isReference: i === 0,
            isManuallyEdited: !!perna.stake,
            stakeOrigem: perna.stake ? "manual" : undefined,
            additionalEntries: []
          }));
          setOdds(novasOdds);
        }
        
        setLinkedApostas([]);
      } else {
        // CRÍTICO: Modo criação - SEMPRE resetar o formulário completamente
        resetForm();
        setLinkedApostas([]);
        // Inicializar prints para o modelo padrão (1-2 = 2 pernas)
        initializeLegPrints(2);
      }
    }
  }, [open, surebet, rascunho]); // Usar surebet e rascunho diretamente para detectar mudanças
  
  // Limpar estado quando dialog fecha
  useEffect(() => {
    if (!open) {
      // Aguardar a animação de fechamento antes de resetar
      const timer = setTimeout(() => {
        resetForm();
        setLinkedApostas([]);
        clearAllPrints();
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
      
      // Reinicializar prints quando modelo muda
      initializeLegPrints(numSlots);
      
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
          stakeOrigem: undefined,
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
  
  // Aplicar dados do print quando processado
  // REGRA DE PRECEDÊNCIA: Print com stake válido (> 0) é SOBERANO e não pode ser sobrescrito
  useEffect(() => {
    legPrints.forEach((legPrint, index) => {
      if (legPrint.parsedData && odds[index]) {
        const applied = applyLegData(index);
        
        // Para prints com dados reais (não inferidos): aplicar ODD, Stake, Linha
        // Para prints inferidos: aplicar apenas Linha
        if (!legPrint.isInferred) {
          // Print real - aplicar todos os campos detectados
          if (applied.odd || applied.stake || applied.selecaoLivre) {
            setOdds(prev => {
              const updated = [...prev];
              if (updated[index]) {
                // Aplicar odd se detectada e campo vazio
                if (applied.odd && !updated[index].odd) {
                  updated[index].odd = applied.odd;
                }
                
                // Aplicar linha se detectada e campo vazio
                if (applied.selecaoLivre && !updated[index].selecaoLivre) {
                  updated[index].selecaoLivre = applied.selecaoLivre;
                }
                
                // REGRA DE PRECEDÊNCIA PARA STAKE:
                // Se o print tem stake válido (> 0), usar SEMPRE e marcar como origem "print"
                // Se o print tem stake zerado/null, permitir cálculo automático (referência)
                const stakeNumber = parseNumeroPtLoose(applied.stake);

                // DEBUG: ajuda a entender quando o OCR não está retornando stake
                console.debug("[SurebetPrint] leg", index, {
                  stakeRaw: applied.stake,
                  stakeNumber,
                  stakeAtual: updated[index].stake,
                  stakeOrigemAtual: updated[index].stakeOrigem,
                });

                if (stakeNumber !== null && stakeNumber > 0) {
                  // Stake real do print - é SOBERANO, não pode ser sobrescrito (exceto se usuário já marcou como manual)
                  if (updated[index].stakeOrigem !== "manual") {
                    updated[index].stake = stakeNumber.toFixed(2);
                    updated[index].stakeOrigem = "print";
                    updated[index].isManuallyEdited = true; // Bloquear sobrescrita automática
                  }
                } else if (!updated[index].stake && !updated[index].stakeOrigem) {
                  // Print sem stake (zerado ou null) - permitir cálculo pela referência
                  // Não definir stakeOrigem ainda - será definido quando o cálculo automático rodar
                }
              }
              return updated;
            });
          }
        } else {
          // Print inferido - aplicar apenas Linha (ODD e Stake nunca são inferidos)
          if (applied.selecaoLivre) {
            setOdds(prev => {
              const updated = [...prev];
              if (updated[index] && !updated[index].selecaoLivre) {
                updated[index].selecaoLivre = applied.selecaoLivre;
              }
              return updated;
            });
          }
        }
      }
    });
    
    // Aplicar contexto compartilhado (esporte, evento, mercado) do primeiro print
    if (sharedContext.esporte) {
      setEsporte(prev => prev || sharedContext.esporte || "Futebol");
    }
    if (sharedContext.evento) {
      setEvento(prev => prev || sharedContext.evento || "");
    }
    if (sharedContext.mercado) {
      setMercado(prev => {
        if (prev) return prev; // Já tem mercado definido
        // Normalizar o mercado do print para corresponder às opções disponíveis
        const currentEsporte = sharedContext.esporte || esporte || "Futebol";
        const availableMarkets = getMarketsForSportAndModel(currentEsporte, modelo);
        const resolved = resolveMarketToOptions(sharedContext.mercado!, availableMarkets);
        console.debug("[SurebetPrint] Mercado normalizado:", {
          raw: sharedContext.mercado,
          resolved: resolved.normalized,
          confidence: resolved.confidence,
          availableMarkets
        });
        return resolved.normalized || "";
      });
    }
  }, [legPrints, sharedContext, applyLegData, esporte, modelo]);

  // Handler para importar print de uma perna específica
  const handlePrintImport = useCallback((legIndex: number) => {
    setActivePrintLegIndex(legIndex);
    fileInputRefs.current[legIndex]?.click();
  }, []);

  const handlePrintFileSelect = useCallback((event: React.ChangeEvent<HTMLInputElement>, legIndex: number) => {
    const file = event.target.files?.[0];
    if (file) {
      processLegImage(legIndex, file);
    }
    // Reset input
    if (event.target) {
      event.target.value = "";
    }
  }, [processLegImage]);
  
  // Atualizar seleções quando mercado muda (sem afetar modelo)
  // Atualizar seleções quando mercado muda (TANTO em criação QUANTO em edição)
  useEffect(() => {
    if (mercado) {
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
      bookmaker_id: "", moeda: "BRL" as SupportedCurrency, odd: "", stake: "", selecao: sel, selecaoLivre: "", isReference: i === 0, isManuallyEdited: false, stakeOrigem: undefined, additionalEntries: []
    })));
    setLinkedApostas([]);
    setExpandedResultados({}); // Reset expansão de resultados avançados
    // Reset registro values - estratégia NUNCA é inferida
    // Se aba não define estratégia, fica null e usuário DEVE escolher manualmente
    const suggestions = getSuggestionsForTab(activeTab);
    setRegistroValues({
      forma_registro: 'ARBITRAGEM',
      estrategia: suggestions.estrategia ?? null, // CRÍTICO: null se não definido
      contexto_operacional: suggestions.contexto_operacional ?? 'NORMAL',
    });
  };
  
  // Função de arredondamento
  const arredondarStake = (valor: number): number => {
    if (!arredondarAtivado) return valor;
    const fator = parseFloat(arredondarValor) || 1;
    return Math.round(valor / fator) * fator;
  };

  // Ordem fixa para cada modelo - agora considera mercado para labels corretos
  const getOrdemFixa = (modelo: "1-X-2" | "1-2", mercadoParam?: string): string[] => {
    // Se temos mercado, usar as seleções corretas do mercado
    if (mercadoParam) {
      return getSelecoesPorMercado(mercadoParam, modelo);
    }
    // Fallback genérico (para ordenação básica)
    return modelo === "1-X-2" 
      ? ["Casa", "Empate", "Fora"] 
      : ["Sim", "Não"];
  };

  // Carregar pernas da tabela normalizada apostas_pernas (com fallback para JSONB legado)
  const fetchLinkedPernas = async (surebetId: string, surebetModelo: string) => {
    // Primeiro tenta buscar da tabela normalizada
    const { data: pernasData, error: pernasError } = await supabase
      .from("apostas_pernas")
      .select(`
        *,
        bookmakers (
          nome
        )
      `)
      .eq("aposta_id", surebetId)
      .order("ordem", { ascending: true });

    // Buscar mercado da operação
    const { data: operacaoData } = await supabase
      .from("apostas_unificada")
      .select("mercado")
      .eq("id", surebetId)
      .single();
    
    const operacaoMercado = operacaoData?.mercado || "";

    let sortedPernas: any[] = [];

    if (pernasData && pernasData.length > 0) {
      // Usar dados da tabela normalizada
      sortedPernas = pernasData.map((p: any) => ({
        bookmaker_id: p.bookmaker_id,
        bookmaker_nome: p.bookmakers?.nome || "Casa",
        selecao: p.selecao,
        selecao_livre: p.selecao_livre,
        odd: p.odd,
        stake: p.stake,
        moeda: p.moeda,
        resultado: p.resultado,
        lucro_prejuizo: p.lucro_prejuizo,
        gerou_freebet: p.gerou_freebet,
        valor_freebet_gerada: p.valor_freebet_gerada,
      }));
    } else {
      // Fallback para JSONB legado
      const { data: legacyData } = await supabase
        .from("apostas_unificada")
        .select("pernas")
        .eq("id", surebetId)
        .single();
      
      if (!legacyData?.pernas || !Array.isArray(legacyData.pernas) || legacyData.pernas.length === 0) {
        setLinkedApostas([]);
        return;
      }

      sortedPernas = legacyData.pernas as any[];
    }
    
    // Ordenar pela ordem fixa do modelo E mercado (para labels corretos)
    const ordemFixa = getOrdemFixa(surebetModelo as "1-X-2" | "1-2", operacaoMercado);
    sortedPernas = [...sortedPernas].sort((a, b) => {
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
    // CORREÇÃO CRÍTICA: Garantir que o array tenha o número correto de slots para o modelo
    const modeloTyped = surebetModelo as "1-X-2" | "1-2";
    const slotsNecessarios = modeloTyped === "1-X-2" ? 3 : 2;
    const selecoesModelo = getSelecoesPorMercado(operacaoMercado, modeloTyped);
    
    // Primeiro, mapear as pernas existentes
    const pernasOdds: OddEntry[] = sortedPernas.map((perna, index) => ({
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
      additionalEntries: perna.entries?.slice(1).map((e: any) => ({
        bookmaker_id: e.bookmaker_id,
        moeda: e.moeda,
        odd: e.odd.toString(),
        stake: e.stake.toString(),
        selecaoLivre: e.selecao_livre || ""
      })) || []
    }));
    
    // CORREÇÃO: Se o modelo é 1-X-2 mas só temos 2 pernas, adicionar slot vazio para a perna faltante
    // Isso permite ao usuário preencher a terceira perna durante a edição
    let finalOdds: OddEntry[] = [...pernasOdds];
    
    if (finalOdds.length < slotsNecessarios) {
      // Identificar quais seleções já existem
      const selecoesExistentes = new Set(finalOdds.map(o => o.selecao));
      
      // Adicionar slots vazios para as seleções faltantes
      for (let i = finalOdds.length; i < slotsNecessarios; i++) {
        // Encontrar a próxima seleção que está faltando
        const selecaoFaltante = selecoesModelo.find(s => !selecoesExistentes.has(s)) || selecoesModelo[i];
        selecoesExistentes.add(selecaoFaltante);
        
        finalOdds.push({
          bookmaker_id: "",
          moeda: "BRL" as SupportedCurrency,
          odd: "",
          stake: "",
          selecao: selecaoFaltante,
          selecaoLivre: "",
          isReference: false,
          isManuallyEdited: false, // Permitir cálculo automático se o usuário preencher
          index: i,
          additionalEntries: []
        });
      }
      
      console.log(`[SurebetDialog] Modo edição: modelo ${modeloTyped} tinha ${pernasOdds.length} pernas, completado para ${slotsNecessarios}`);
    }
    
    // Garantir que as seleções estejam na ordem correta do modelo
    finalOdds = finalOdds.sort((a, b) => {
      const indexA = selecoesModelo.indexOf(a.selecao);
      const indexB = selecoesModelo.indexOf(b.selecao);
      if (indexA === -1 && indexB === -1) return 0;
      if (indexA === -1) return 1;
      if (indexB === -1) return -1;
      return indexA - indexB;
    });
    
    setOdds(finalOdds);
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
          // Ao mudar referência, resetar edição manual das outras pernas
          // MAS PRESERVAR se a origem foi PRINT (stake real do print é soberano)
          if (o.stakeOrigem !== "print") {
            o.isManuallyEdited = false;
            o.stakeOrigem = undefined; // Permitir recálculo
          }
        }
      });
    }
    
    // CORREÇÃO: Quando o usuário edita a stake de uma perna NÃO-referência,
    // marcar como editado manualmente e origem "manual" para preservar o valor
    if (field === "stake" && !newOdds[index].isReference) {
      newOdds[index].isManuallyEdited = true;
      newOdds[index].stakeOrigem = "manual";
    }
    
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
      // MAS PRESERVAR se a origem foi PRINT (stake real do print é soberano)
      isManuallyEdited: i === index 
        ? o.isManuallyEdited 
        : (o.stakeOrigem === "print" ? true : false),
      // Limpar stakeOrigem para permitir recálculo (exceto print)
      stakeOrigem: i === index 
        ? o.stakeOrigem 
        : (o.stakeOrigem === "print" ? "print" : undefined)
    }));
    setOdds(newOdds);
  };

  const resetStakeToCalculated = (index: number, calculatedValue: number) => {
    const newOdds = [...odds];
    newOdds[index] = { 
      ...newOdds[index], 
      stake: calculatedValue > 0 ? calculatedValue.toFixed(2) : "",
      isManuallyEdited: false,
      stakeOrigem: "referencia" // Resetar origem para referência
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
  // COMPORTAMENTO CORRIGIDO: Usa lógica DIFERENTE para modelos 1-2 e 1x2
  // - Modelo 1-2: Cálculo binário sequencial
  // - Modelo 1x2: Cálculo matricial global (3 pernas simultâneas)
  useEffect(() => {
    // Não recalcular em modo edição
    if (isEditing) return;
    
    // Preparar dados consolidados de cada perna
    const pernaData = odds.map(perna => ({
      oddMedia: getOddMediaPerna(perna),
      stakeAtual: getStakeTotalPerna(perna),
      isReference: perna.isReference,
      isManuallyEdited: perna.isManuallyEdited
    }));
    
    // Verificar se temos referência
    const refIndex = pernaData.findIndex(p => p.isReference);
    if (refIndex === -1) return;
    
    // Verificar se temos stake de referência válida
    const refStake = pernaData[refIndex].stakeAtual;
    const refOdd = pernaData[refIndex].oddMedia;
    if (refStake <= 0 || refOdd <= 1) return;
    
    // Contar pernas com odd válida
    const validOddsCount = pernaData.filter(p => p.oddMedia > 1).length;
    
    // Modelo 1x2: Precisa de exatamente 3 pernas válidas para calcular
    // Modelo 1-2: Precisa de exatamente 2 pernas válidas
    const numPernasEsperadas = modelo === "1-X-2" ? 3 : 2;
    
    // Para modelo 1x2, só recalcular quando TODAS as odds estiverem preenchidas
    if (modelo === "1-X-2" && validOddsCount < 3) return;
    
    // Para modelo 1-2, precisa de pelo menos 2 odds válidas
    if (modelo === "1-2" && validOddsCount < 2) return;
    
    // Usar a função de cálculo correta conforme o modelo
    const resultado = modelo === "1-X-2" 
      ? calcularStakes1X2(pernaData, arredondarStake)
      : calcularStakes12(pernaData, arredondarStake);
    
    if (!resultado.isValid) return;
    
    // Verificar se precisa atualizar alguma stake
    let needsUpdate = false;
    const newOdds = odds.map((o, i) => {
      // Nunca modificar a referência
      if (i === refIndex) return o;
      
      // REGRA DE PRECEDÊNCIA: Respeitar stakes de print e edição manual
      // stakeOrigem === "print" → valor real, NUNCA sobrescrever
      // stakeOrigem === "manual" → usuário editou, NUNCA sobrescrever
      // isManuallyEdited também bloqueia (compatibilidade)
      if (o.isManuallyEdited || o.stakeOrigem === "print" || o.stakeOrigem === "manual") {
        return o;
      }
      
      const calculatedStake = resultado.stakes[i];
      const currentStake = parseFloat(o.stake) || 0;
      
      // Só atualizar se o valor calculado for diferente do atual
      if (Math.abs(calculatedStake - currentStake) > 0.01) {
        needsUpdate = true;
        // Marcar origem como "referencia" para indicar que foi calculado automaticamente
        return { ...o, stake: calculatedStake.toFixed(2), stakeOrigem: "referencia" as StakeOrigem };
      }
      return o;
    });
    
    if (needsUpdate) {
      setOdds(newOdds);
    }
  }, [
    // Dependências: recalcular quando qualquer odd ou stake mudar (incluindo additionalEntries)
    // CORREÇÃO: Incluir isManuallyEdited na chave para reagir a resets
    odds.map(o => `${o.odd}-${o.stake}-${o.isManuallyEdited}-${(o.additionalEntries || []).map(ae => `${ae.odd}-${ae.stake}`).join('|')}`).join(','),
    // Quando a referência mudar
    odds.map(o => o.isReference).join(','),
    // NOVO: Quando o modelo mudar
    modelo,
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
    
    // REFATORADO: Calcular stakes sugeridas usando a lógica correta por modelo
    // O modelo 1X2 usa cálculo matricial global; o modelo 1-2 usa binário
    let suggestedStakes: number[] = [];
    const is1X2Model = modelo === "1-X-2";
    const minOddsRequired = is1X2Model ? 3 : 2;
    
    if (refStakeValue > 0 && refOdd > 1 && validOddsCount >= minOddsRequired) {
      // Preparar dados para as funções de cálculo
      const pernaData = parsedOdds.map((oddMedia, i) => ({
        oddMedia,
        stakeAtual: actualStakes[i],
        isReference: i === refIndex
      }));
      
      // Usar a função de cálculo correta conforme o modelo
      // CRÍTICO: Modelo 1X2 SEMPRE usa calcularStakes1X2 com as 3 pernas
      // Modelo 1-2 usa calcularStakes12 com apenas 2 pernas
      const resultado = is1X2Model
        ? calcularStakes1X2(pernaData, arredondarStake)
        : calcularStakes12(pernaData.slice(0, 2), arredondarStake);
      
      if (resultado.isValid) {
        suggestedStakes = resultado.stakes;
      } else {
        // Fallback: fórmula básica (targetReturn / odd para cada perna)
        const targetReturn = refStakeValue * refOdd;
        suggestedStakes = parsedOdds.map((odd, i) => {
          if (i === refIndex) return refStakeValue;
          if (odd > 1) {
            return arredondarStake(targetReturn / odd);
          }
          return 0;
        });
      }
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
    registroValues.contexto_operacional,
    // NOVO: Modelo afeta cálculo de stakes sugeridas
    modelo
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

  // Contar pernas completas (bookmaker + odd > 1 + stake > 0)
  const pernasCompletasCount = useMemo(() => {
    return odds.filter(entry => {
      const odd = parseFloat(entry.odd);
      const stake = parseFloat(entry.stake);
      const hasOdd = entry.odd && !isNaN(odd) && odd > 1;
      const hasStake = entry.stake && !isNaN(stake) && stake > 0;
      const hasBookmaker = entry.bookmaker_id && entry.bookmaker_id.trim() !== "";
      return hasOdd && hasStake && hasBookmaker;
    }).length;
  }, [odds]);
  
  // Verificar se tem pelo menos 1 perna com dados parciais (para salvar como rascunho)
  const temDadosParciais = useMemo(() => {
    return odds.some(entry => {
      const hasAnyOdd = entry.odd && parseFloat(entry.odd) > 1;
      const hasAnyStake = entry.stake && parseFloat(entry.stake) > 0;
      const hasAnyBookmaker = entry.bookmaker_id && entry.bookmaker_id.trim() !== "";
      // Tem pelo menos um campo preenchido
      return hasAnyOdd || hasAnyStake || hasAnyBookmaker;
    });
  }, [odds]);
  
  // Pode salvar como rascunho: tem dados parciais, mas não tem TODAS as pernas completas
  // Para modelo 1-2: precisa de 2 pernas completas; para 1-X-2: precisa de 3 pernas completas
  const totalPernasNecessarias = odds.length;
  const podeSalvarRascunho = !isEditing && temDadosParciais && pernasCompletasCount < totalPernasNecessarias;
  
  // Handler para salvar como rascunho
  const handleSalvarRascunho = useCallback(() => {
    if (!workspaceId) {
      toast.error("Workspace não identificado");
      return;
    }
    
    // Converter odds para formato de rascunho
    const pernasRascunho: RascunhoPernaData[] = odds.map(entry => ({
      bookmaker_id: entry.bookmaker_id || undefined,
      bookmaker_nome: bookmakerSaldos.find(b => b.id === entry.bookmaker_id)?.nome,
      selecao: entry.selecao || undefined,
      selecao_livre: entry.selecaoLivre || undefined,
      odd: parseFloat(entry.odd) || undefined,
      stake: parseFloat(entry.stake) || undefined,
      moeda: entry.moeda,
    }));
    
    const rascunho = criarRascunho('SUREBET', {
      evento: evento || undefined,
      mercado: mercado || undefined,
      esporte: esporte || undefined,
      observacoes: observacoes || undefined,
      pernas: pernasRascunho,
    });
    
    toast.success(
      `Rascunho salvo! ${rascunho.motivo_incompleto ? `(${rascunho.motivo_incompleto})` : ''}`,
      { description: 'Acesse seus rascunhos para continuar depois' }
    );
    
    // Fechar o dialog
    onOpenChange(false);
  }, [odds, evento, mercado, esporte, observacoes, workspaceId, bookmakerSaldos, criarRascunho, onOpenChange]);

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
    
    // NOVO: Validação flexível para pernas - permite perna vazia (odd+stake ambos vazios)
    // Regra: odd+stake preenchidos = válido, ambos vazios = válido, apenas um = inválido
    let pernasPreenchidas = 0;
    
    for (let i = 0; i < odds.length; i++) {
      const entry = odds[i];
      const selecaoLabel = entry.selecao;
      
      const odd = parseFloat(entry.odd);
      const stake = parseFloat(entry.stake);
      const hasOdd = entry.odd && !isNaN(odd) && odd > 1;
      const hasStake = entry.stake && !isNaN(stake) && stake > 0;
      const hasBookmaker = entry.bookmaker_id && entry.bookmaker_id.trim() !== "";
      
      // Verificar se perna está completamente vazia (permitido)
      const isPernaVazia = !hasOdd && !hasStake && !hasBookmaker;
      
      // Verificar se perna está completa (permitido)
      const isPernaCompleta = hasOdd && hasStake && hasBookmaker;
      
      // Se não é vazia nem completa, há erro de preenchimento parcial
      if (!isPernaVazia && !isPernaCompleta) {
        // Verificar qual campo está faltando
        if (!hasBookmaker && (hasOdd || hasStake)) {
          toast.error(`Selecione a casa para "${selecaoLabel}" ou deixe a perna vazia`);
          return;
        }
        if (hasBookmaker && !hasOdd && hasStake) {
          toast.error(`Informe a odd para "${selecaoLabel}" (odd e stake devem estar ambos preenchidos ou vazios)`);
          return;
        }
        if (hasBookmaker && hasOdd && !hasStake) {
          toast.error(`Informe a stake para "${selecaoLabel}" (odd e stake devem estar ambos preenchidos ou vazios)`);
          return;
        }
        if (!hasOdd && !hasStake && hasBookmaker) {
          toast.error(`Informe odd e stake para "${selecaoLabel}" ou remova a casa selecionada`);
          return;
        }
      }
      
      if (isPernaCompleta) {
        pernasPreenchidas++;
        
        // Validar odd mínima
        if (odd <= 1) {
          toast.error(`Odd inválida para "${selecaoLabel}" (deve ser > 1.00)`);
          return;
        }
        
        // Verificar saldo considerando uso compartilhado (APENAS para criação, não edição)
        if (!isEditing) {
          const saldoDisponivel = getSaldoDisponivelParaPosicao(entry.bookmaker_id, i);
          const bkMoeda = bookmakerSaldos.find(b => b.id === entry.bookmaker_id)?.moeda || "BRL";
          if (saldoDisponivel !== null && stake > saldoDisponivel + 0.01) {
            toast.error(`Saldo insuficiente em ${getBookmakerNome(entry.bookmaker_id)} para "${selecaoLabel}": ${formatCurrency(saldoDisponivel, bkMoeda)} disponível nesta operação, ${formatCurrency(stake, bkMoeda)} necessário`);
            return;
          }
        }
        
        // Validar entradas adicionais (coberturas) - APENAS para criação
        if (!isEditing && entry.additionalEntries && entry.additionalEntries.length > 0) {
          for (let j = 0; j < entry.additionalEntries.length; j++) {
            const ae = entry.additionalEntries[j];
            const aeLabel = `cobertura ${j + 1} de "${selecaoLabel}"`;
            
            const aeOdd = parseFloat(ae.odd);
            const aeStake = parseFloat(ae.stake);
            const aeHasOdd = ae.odd && !isNaN(aeOdd) && aeOdd > 1;
            const aeHasStake = ae.stake && !isNaN(aeStake) && aeStake > 0;
            const aeHasBookmaker = ae.bookmaker_id && ae.bookmaker_id.trim() !== "";
            
            // Cobertura vazia é permitida
            if (!aeHasOdd && !aeHasStake && !aeHasBookmaker) continue;
            
            // Cobertura parcialmente preenchida é erro
            if (!aeHasBookmaker) {
              toast.error(`Selecione a casa para ${aeLabel}`);
              return;
            }
            if (!aeHasOdd) {
              toast.error(`Odd inválida para ${aeLabel} (deve ser > 1.00)`);
              return;
            }
            if (!aeHasStake) {
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
    }
    
    // Validação: precisa ter pelo menos 2 pernas preenchidas (invariante do domínio Surebet)
    if (pernasPreenchidas < 2) {
      toast.error("Surebet requer pelo menos 2 pernas completas");
      return;
    }

    // Validação extra: verificar se há inconsistência de saldo compartilhado (APENAS para criação)
    if (!isEditing && hasBalanceInconsistency) {
      toast.error("Há inconsistência de saldo compartilhado entre as posições. Verifique as stakes.");
      return;
    }
    
    // Executar salvamento diretamente (modal de confirmação removido - botão já desabilitado para < 2 pernas)
    await executeSaveLogic();
  };
  
  // Função separada para lógica de salvamento (usada após validação e confirmação)
  const executeSaveLogic = async () => {
    try {
      setSaving(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Usuário não autenticado");

      if (isEditing && surebet) {
        // CORREÇÃO: Ao editar, precisamos detectar mudanças de bookmaker nas pernas
        // e ajustar saldos se a aposta já foi liquidada
        
        // 1. Buscar pernas originais do banco
        const { data: operacaoAtual } = await supabase
          .from("apostas_unificada")
          .select("pernas, status")
          .eq("id", surebet.id)
          .single();
        
        const pernasOriginais = operacaoAtual?.pernas as unknown as SurebetPerna[] || [];
        const statusAtual = operacaoAtual?.status;
        
        // 2. Construir novas pernas a partir do formulário (preservando resultados)
        const getBookmakerMoedaEdit = (bookmakerId: string): SupportedCurrency => {
          const bk = bookmakerSaldos.find(b => b.id === bookmakerId);
          return (bk?.moeda as SupportedCurrency) || "BRL";
        };
        
        const novasPernas: SurebetPerna[] = odds.map((entry, idx) => {
          const pernaOriginal = pernasOriginais[idx];
          const mainStake = parseFloat(entry.stake) || 0;
          const mainMoeda = getBookmakerMoedaEdit(entry.bookmaker_id);
          const mainSnapshotFields = getSnapshotFields(mainStake, mainMoeda);
          
          return {
            selecao: entry.selecao,
            selecao_livre: entry.selecaoLivre || pernaOriginal?.selecao_livre || "",
            bookmaker_id: entry.bookmaker_id,
            bookmaker_nome: getBookmakerNome(entry.bookmaker_id),
            moeda: mainMoeda,
            odd: parseFloat(entry.odd),
            stake: mainStake,
            stake_brl_referencia: mainSnapshotFields.valor_brl_referencia,
            cotacao_snapshot: mainSnapshotFields.cotacao_snapshot,
            cotacao_snapshot_at: mainSnapshotFields.cotacao_snapshot_at,
            // PRESERVAR resultados originais se existirem
            resultado: pernaOriginal?.resultado || null,
            lucro_prejuizo: pernaOriginal?.lucro_prejuizo || null,
            lucro_prejuizo_brl_referencia: pernaOriginal?.lucro_prejuizo_brl_referencia || null,
            gerou_freebet: pernaOriginal?.gerou_freebet || false,
            valor_freebet_gerada: pernaOriginal?.valor_freebet_gerada || null,
            // Preservar entries se existirem
            entries: pernaOriginal?.entries,
            odd_media: pernaOriginal?.odd_media,
            stake_total: pernaOriginal?.stake_total,
          };
        });
        
        // 3. CORREÇÃO CRÍTICA: Se aposta liquidada e bookmaker mudou, ajustar saldos
        for (let i = 0; i < Math.min(pernasOriginais.length, novasPernas.length); i++) {
          const pernaOriginal = pernasOriginais[i];
          const pernaNova = novasPernas[i];
          
          // Se a perna tem resultado e o bookmaker mudou
          if (pernaOriginal?.resultado && 
              pernaOriginal.resultado !== "PENDENTE" && 
              pernaOriginal.bookmaker_id !== pernaNova.bookmaker_id) {
            
            const stake = pernaOriginal.stake || 0;
            const odd = pernaOriginal.odd || 0;
            const resultado = pernaOriginal.resultado;
            
            // Calcular delta do resultado
            let deltaResultado = 0;
            if (resultado === "GREEN") {
              deltaResultado = stake * (odd - 1);
            } else if (resultado === "MEIO_GREEN") {
              deltaResultado = (stake * (odd - 1)) / 2;
            } else if (resultado === "RED") {
              deltaResultado = -stake;
            } else if (resultado === "MEIO_RED") {
              deltaResultado = -stake / 2;
            }
            // VOID = 0, não afeta saldo
            
            // NOTA v7: Edição de pernas com resultado liquidado NÃO é suportada
            // A mudança de bookmaker em aposta já liquidada requer:
            // 1. Excluir a aposta original (que reverte via ledger)
            // 2. Criar nova aposta com o novo bookmaker
            // Por segurança, apenas logamos o delta esperado sem modificar saldos manualmente
            if (deltaResultado !== 0) {
              console.warn(`[SurebetEdit] Mudança de bookmaker em perna liquidada detectada. Delta esperado: ${deltaResultado}. Recomenda-se excluir e recriar.`);
            }
          }
        }
        
        // 4. Recalcular totais
        const moedasEdit = [...new Set(novasPernas.map(p => p.moeda))];
        const moedaOperacaoEdit: MoedaOperacao = moedasEdit.length === 1 ? moedasEdit[0] : "MULTI";
        const valorBRLRefEdit = novasPernas.reduce((acc, p) => acc + (p.stake_brl_referencia || 0), 0);
        const stakeEditTotal = moedaOperacaoEdit !== "MULTI" 
          ? novasPernas.reduce((acc, p) => acc + p.stake, 0)
          : null;
        
        // Recalcular spread e ROI
        const oddsEdit = novasPernas.map(p => p.odd);
        const sumProbEdit = oddsEdit.reduce((sum, o) => sum + (o > 1 ? 1/o : 0), 0);
        const spreadEdit = sumProbEdit > 0 ? (1 - sumProbEdit) * 100 : 0;
        const roiEdit = stakeEditTotal && stakeEditTotal > 0 
          ? ((analysis?.guaranteedProfit || 0) / stakeEditTotal) * 100 
          : null;
        
        // 5. Update completo na tabela unificada
        const { error } = await supabase
          .from("apostas_unificada")
          .update({
            evento,
            esporte,
            mercado,
            observacoes,
            pernas: novasPernas as any,
            moeda_operacao: moedaOperacaoEdit,
            valor_brl_referencia: valorBRLRefEdit,
            stake_total: stakeEditTotal,
            spread_calculado: spreadEdit,
            roi_esperado: roiEdit,
            updated_at: new Date().toISOString()
          })
          .eq("id", surebet.id);

        if (error) throw error;
        
        // CRÍTICO: DUAL-WRITE - Sincronizar apostas_pernas (delete + re-insert)
        // Isso garante que o saldo_em_aposta seja calculado corretamente pela RPC
        if (surebet.id && novasPernas.length > 0) {
          // 5a. Deletar pernas antigas
          const { error: deleteError } = await supabase
            .from("apostas_pernas")
            .delete()
            .eq("aposta_id", surebet.id);
          
          if (deleteError) {
            console.error("[SurebetDialog] Erro ao deletar pernas antigas:", deleteError);
          }
          
          // 5b. Inserir novas pernas
          const pernasInsert = pernasToInserts(surebet.id, novasPernas);
          const { error: pernasError } = await supabase
            .from("apostas_pernas")
            .insert(pernasInsert);
          
          if (pernasError) {
            console.error("[SurebetDialog] Erro ao re-inserir pernas normalizadas:", pernasError);
          } else {
            console.log("[SurebetDialog] Dual-write edit: pernas sincronizadas:", pernasInsert.length);
          }
        }
        
        // Invalidar cache de saldos
        invalidateSaldos(projetoId);
        
        toast.success("Operação atualizada!");
      } else {
        // Obter moeda de cada bookmaker selecionada
        const getBookmakerMoeda = (bookmakerId: string): SupportedCurrency => {
          const bk = bookmakerSaldos.find(b => b.id === bookmakerId);
          return (bk?.moeda as SupportedCurrency) || "BRL";
        };
        
        // CORREÇÃO: Filtrar apenas pernas preenchidas antes de salvar
        // Pernas vazias (sem bookmaker, odd ou stake) são excluídas do array final
        const pernasPreenchidas = odds.filter(entry => {
          const hasBookmaker = entry.bookmaker_id && entry.bookmaker_id.trim() !== "";
          const hasOdd = entry.odd && parseFloat(entry.odd) > 1;
          const hasStake = entry.stake && parseFloat(entry.stake) > 0;
          return hasBookmaker && hasOdd && hasStake;
        });
        
        // Criar pernas COM SNAPSHOT e suporte a múltiplas entradas
        const pernasToSave: SurebetPerna[] = pernasPreenchidas.map((entry, idx) => {
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
        
        const { data: insertedData, error: insertError } = await supabase
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
          })
          .select("id")
          .single();

        if (insertError) throw insertError;
        
        // CRÍTICO: DUAL-WRITE - Inserir pernas na tabela normalizada apostas_pernas
        // Isso garante que o saldo_em_aposta seja calculado corretamente pela RPC
        if (insertedData?.id && pernasToSave.length > 0) {
          const pernasInsert = pernasToInserts(insertedData.id, pernasToSave);
          const { error: pernasError } = await supabase
            .from("apostas_pernas")
            .insert(pernasInsert);
          
          if (pernasError) {
            console.error("[SurebetDialog] Erro ao inserir pernas normalizadas:", pernasError);
            // Não falhar a operação principal, mas logar para auditoria
          } else {
            console.log("[SurebetDialog] Dual-write: pernas inseridas em apostas_pernas:", pernasInsert.length);
          }
        }

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
      // ========== MIGRADO PARA MOTOR v7 ==========
      // Usar deletarAposta do ApostaService que cuida de:
      // 1. Reverter liquidações via financial_events
      // 2. Deletar pernas
      // 3. Deletar aposta
      const { deletarAposta } = await import("@/services/aposta");
      const result = await deletarAposta(surebet.id);
      
      if (!result.success) {
        throw new Error(result.error?.message || 'Falha ao excluir operação');
      }
      
      // Invalidar cache de saldos
      invalidateSaldos(projetoId);
      
      // Broadcast para sincronização cross-window
      try {
        const channel = new BroadcastChannel("aposta_channel");
        channel.postMessage({ 
          type: "APOSTA_DELETED", 
          projetoId,
          apostaId: surebet.id,
          timestamp: Date.now()
        });
        channel.close();
      } catch (e) {
        console.warn("[SurebetDialog] BroadcastChannel não disponível:", e);
      }
      
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

      // MIGRADO PARA LEDGER: Só creditar saldo_freebet se a freebet for liberada
      if (status === "LIBERADA") {
        const { creditarFreebetViaLedger } = await import("@/lib/freebetLedgerService");
        await creditarFreebetViaLedger(bookmakerIdFreebet, valor, 'APOSTA_QUALIFICADORA', { descricao: 'Freebet de aposta qualificadora (Arbitragem)' });
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

        // MIGRADO PARA LEDGER: Creditar via RPC atômica
        const { creditarFreebetViaLedger } = await import("@/lib/freebetLedgerService");
        await creditarFreebetViaLedger(freebetPendente.bookmaker_id, freebetPendente.valor, 'LIBERACAO_PENDENTE', { descricao: 'Freebet liberada após liquidação de aposta' });
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
        // MIGRADO PARA LEDGER: Estornar via RPC atômica
        const { estornarFreebetViaLedger } = await import("@/lib/freebetLedgerService");
        await estornarFreebetViaLedger(
          freebetLiberada.bookmaker_id, 
          freebetLiberada.valor, 
          'Reversão para PENDENTE (aposta reaberta)'
        );

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
    if (!surebet || !workspaceId) return;
    
    try {
      // Buscar pernas atuais E contexto_operacional da operação na tabela unificada
      const { data: operacaoData } = await supabase
        .from("apostas_unificada")
        .select("pernas, fonte_saldo")
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
      const moeda = perna.moeda || 'BRL';
      const fonteSaldo = operacaoData.fonte_saldo || 'REAL';
      const stakeBonus = (perna as { stake_bonus?: number }).stake_bonus || 0;

      // Se o resultado não mudou, não fazer nada
      if (resultadoAnterior === resultado) return;

      // MOTOR FINANCEIRO v9.5: Usar liquidarPernaSurebet do ApostaService
      // Esta função cuida de:
      // 1. Calcular delta (reversão + aplicação)
      // 2. Criar evento financeiro
      // 3. Atualizar JSONB da perna
      // 4. Atualizar status do registro pai
      const liquidacaoResult = await liquidarPernaSurebet({
        surebet_id: surebet.id,
        perna_index: pernaIndex,
        bookmaker_id: bookmakerId,
        resultado,
        resultado_anterior: resultadoAnterior || null,
        stake,
        odd,
        moeda,
        workspace_id: workspaceId,
        stake_bonus: stakeBonus,
        fonte_saldo: fonteSaldo,
      });

      if (!liquidacaoResult.success) {
        toast.error(liquidacaoResult.error?.message || "Erro ao liquidar perna");
        return;
      }

      const lucro = liquidacaoResult.data?.lucro_prejuizo ?? 0;

      // ====== LÓGICA DE ROLLOVER ======
      // Regra: se a casa tem bônus ativo (rollover em andamento), qualquer aposta liquidada conta para o rollover,
      // independente da aba/contexto em que foi registrada.
      const temBonusAtivoParaRollover = await hasActiveRolloverBonus(projetoId, bookmakerId);
      if (temBonusAtivoParaRollover) {
        const resultadoContaRollover = resultado !== "VOID" && resultado !== null;
        const resultadoAnteriorContava = resultadoAnterior && resultadoAnterior !== "VOID" && resultadoAnterior !== "PENDENTE";
        
        // Calcular stake total da perna (incluindo entradas adicionais se houver)
        let stakeTotalPerna = stake;
        if (perna.entries && Array.isArray(perna.entries)) {
          stakeTotalPerna = perna.entries.reduce((acc, e) => acc + (e.stake || 0), 0);
        }
        
        if (resultadoContaRollover && !resultadoAnteriorContava) {
          // Primeira vez liquidando (não VOID/PENDENTE) - adicionar ao rollover
          await atualizarProgressoRollover(projetoId, bookmakerId, stakeTotalPerna, odd);
          console.log(`Rollover atualizado: perna ${pernaIndex}, bookmaker ${bookmakerId}, stake ${stakeTotalPerna}`);
        } else if (!resultadoContaRollover && resultadoAnteriorContava) {
          // Resultado válido → VOID/PENDENTE/null - reverter rollover
          await reverterProgressoRollover(projetoId, bookmakerId, stakeTotalPerna);
          console.log(`Rollover revertido: perna ${pernaIndex}, bookmaker ${bookmakerId}, stake ${stakeTotalPerna}`);
        }
      }
      
      // Invalidar cache de saldos para atualizar todas as UIs
      invalidateSaldos(projetoId);

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

      // Verificar se todas as pernas foram liquidadas (buscar dados atualizados)
      const { data: updatedData } = await supabase
        .from("apostas_unificada")
        .select("pernas")
        .eq("id", surebet.id)
        .single();
      
      const novasPernas = updatedData?.pernas as unknown as SurebetPerna[] || [];
      const todasLiquidadas = novasPernas.every(p => p.resultado && p.resultado !== "PENDENTE" && p.resultado !== null);

      if (todasLiquidadas && !toastShownRef.current) {
        toastShownRef.current = true;
        toast.success("Operação liquidada com sucesso!");
      } else if (!todasLiquidadas) {
        toastShownRef.current = false;
      }
    } catch (error: any) {
      toast.error("Erro: " + error.message);
    }
  }, [surebet, projetoId, workspaceId, atualizarProgressoRollover, reverterProgressoRollover, hasActiveRolloverBonus, invalidateSaldos]);

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
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 sm:gap-3">
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
                  placeholder="TIME 1 X TIME 2" 
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
                <div className="flex flex-col sm:flex-row items-stretch gap-2 sm:gap-1">
                  {odds.map((entry, index) => {
                    const saldoLivreBase = getBookmakerSaldoLivre(entry.bookmaker_id);
                    const saldoDisponivelPosicao = getSaldoDisponivelParaPosicao(entry.bookmaker_id, index);
                    const selectedBookmaker = bookmakerSaldos.find(b => b.id === entry.bookmaker_id);
                    const parceiroNome = selectedBookmaker?.parceiro_nome?.split(" ");
                    const parceiroShortName = parceiroNome 
                      ? `${parceiroNome[0]} ${parceiroNome[parceiroNome.length - 1] || ""}`.trim()
                      : "";
                    // Usar suggestedStakes (stake calculada automaticamente) para comparação
                    const stakeCalculada = analysis?.suggestedStakes?.[index] || 0;
                    const stakeAtual = parseFloat(entry.stake) || 0;
                    // Mostrar indicador de edição manual quando:
                    // - Perna está marcada como editada manualmente
                    // - Tem stake atual preenchida
                    // - Stake atual é diferente da sugerida
                    // - Não é a perna de referência
                    const isDifferentFromCalculated = entry.isManuallyEdited && 
                      stakeAtual > 0 && 
                      stakeCalculada > 0 &&
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
                          <div className="flex items-center justify-center px-1 sm:px-1 py-1 sm:py-0">
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="h-8 w-8 p-0 rounded-full hover:bg-primary/20 text-muted-foreground hover:text-primary"
                              onClick={() => swapSelecoes(index - 1, index)}
                              title={`Trocar ${odds[index - 1].selecao} ↔ ${entry.selecao}`}
                            >
                              <ArrowLeftRight className="h-4 w-4 rotate-90 sm:rotate-0" />
                            </Button>
                          </div>
                        )}
                        
                        <div 
                          tabIndex={!isEditing ? 0 : undefined}
                          className={`flex-1 min-w-0 rounded-xl border-2 p-3 sm:p-4 space-y-3 transition-all relative outline-none ${colors.bg} ${
                            entry.isReference 
                              ? `${colors.border} ring-2 ring-primary/30` 
                              : colors.border
                          } ${!isEditing ? 'focus:ring-2 focus:ring-primary/50' : ''}`}
                          onDragOver={(e) => {
                            if (!isEditing && legPrints[index] && !legPrints[index].isProcessing) {
                              e.preventDefault();
                              e.stopPropagation();
                              e.currentTarget.classList.add('ring-2', 'ring-primary', 'border-primary');
                            }
                          }}
                          onDragLeave={(e) => {
                            e.currentTarget.classList.remove('ring-2', 'ring-primary', 'border-primary');
                          }}
                          onDrop={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            e.currentTarget.classList.remove('ring-2', 'ring-primary', 'border-primary');
                            
                            if (!isEditing && legPrints[index] && !legPrints[index].isProcessing) {
                              const file = e.dataTransfer.files[0];
                              if (file && file.type.startsWith('image/')) {
                                processLegImage(index, file);
                              }
                            }
                          }}
                          onPaste={(e) => {
                            if (isEditing || !legPrints[index] || legPrints[index].isProcessing) return;
                            
                            const items = e.clipboardData?.items;
                            if (!items) return;
                            
                            for (let i = 0; i < items.length; i++) {
                              if (items[i].type.startsWith('image/')) {
                                e.preventDefault();
                                const file = items[i].getAsFile();
                                if (file) {
                                  processLegImage(index, file);
                                }
                                return;
                              }
                            }
                            // Se não for imagem, ignora silenciosamente
                          }}
                        >
                          {/* Hint no canto superior esquerdo */}
                          {!isEditing && legPrints[index] && !legPrints[index].isProcessing && !legPrints[index].parsedData && !legPrints[index].isInferred && (
                            <div className="absolute top-1.5 left-2 flex items-center gap-1 text-muted-foreground/40">
                              <Camera className="h-2.5 w-2.5" />
                              <span className="text-[9px]">Ctrl+V, arraste ou </span>
                              <button
                                type="button"
                                onClick={() => handlePrintImport(index)}
                                className="text-[9px] underline hover:text-primary/70 transition-colors"
                              >
                                clique aqui
                              </button>
                            </div>
                          )}
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
                            
                            {/* Input oculto para file select */}
                            {!isEditing && (
                              <input
                                type="file"
                                accept="image/*"
                                ref={el => fileInputRefs.current[index] = el}
                                onChange={(e) => handlePrintFileSelect(e, index)}
                                className="hidden"
                              />
                            )}
                            
                            {/* Estado: Processando */}
                            {!isEditing && legPrints[index]?.isProcessing && (
                              <div className="flex items-center justify-center gap-2 py-2 px-3 rounded-lg bg-primary/10">
                                <div className="h-3 w-3 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                                <span className="text-xs text-primary font-medium">Analisando...</span>
                              </div>
                            )}
                            
                            {/* Estado: Print carregado - Compacto */}
                            {!isEditing && legPrints[index] && !legPrints[index].isProcessing && legPrints[index].parsedData && legPrints[index].imagePreview && !legPrints[index].isInferred && (
                              <div 
                                className="flex items-center gap-2 py-1.5 px-2 rounded-lg bg-emerald-500/10 border border-emerald-500/30"
                                onClick={(e) => e.stopPropagation()}
                              >
                                {/* Miniatura - clicável para ampliar */}
                                <div 
                                  className="relative w-8 h-8 flex-shrink-0 cursor-pointer rounded overflow-hidden hover:ring-2 hover:ring-primary transition-all"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setExpandedPrintUrl(legPrints[index].imagePreview!);
                                  }}
                                  title="Clique para ampliar"
                                >
                                  <img 
                                    src={legPrints[index].imagePreview!} 
                                    alt="Print" 
                                    className="w-full h-full object-cover"
                                  />
                                </div>
                                
                                {/* Badge de sucesso */}
                                <div className="flex items-center gap-1 flex-1">
                                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                                  <span className="text-[10px] text-emerald-400 font-medium">Print importado</span>
                                </div>
                                
                                {/* Botão limpar */}
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    clearLegPrint(index);
                                  }}
                                  className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive"
                                >
                                  <XCircle className="h-3.5 w-3.5" />
                                </Button>
                              </div>
                            )}
                            
                            {/* Estado: Linha inferida */}
                            {!isEditing && legPrints[index] && !legPrints[index].isProcessing && legPrints[index].isInferred && legPrints[index].parsedData && (
                              <div 
                                className="rounded-lg border border-dashed border-amber-500/40 bg-amber-500/10 p-2"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <div className="flex items-center justify-between gap-2">
                                  <div className="flex items-center gap-1.5">
                                    <span className="text-amber-500 text-xs">✨</span>
                                    <span className="text-[10px] font-medium text-amber-400">
                                      {legPrints[index].parsedData?.selecao?.value}
                                    </span>
                                  </div>
                                  <div className="flex gap-1">
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      size="sm"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        acceptInference(index);
                                      }}
                                      className="h-5 px-1.5 text-emerald-500 hover:bg-emerald-500/10 text-[10px]"
                                    >
                                      ✓
                                    </Button>
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      size="sm"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        rejectInference(index);
                                      }}
                                      className="h-5 px-1.5 text-muted-foreground hover:text-destructive text-[10px]"
                                    >
                                      ✕
                                    </Button>
                                  </div>
                                </div>
                              </div>
                            )}
                            
                            
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
                            
                            {/* RadioButton Referência - Glass/Subtle Effect */}
                            {!isEditing && (
                              <button
                                type="button"
                                role="radio"
                                aria-checked={entry.isReference}
                                onClick={() => setReferenceIndex(index)}
                                title="Perna usada como base para cálculo das stakes"
                                className={`
                                  group flex items-center gap-2 px-2 py-1 rounded-md cursor-pointer
                                  transition-all duration-150 ease-out
                                  ${entry.isReference 
                                    ? 'bg-white/[0.04] border border-white/[0.12]' 
                                    : 'bg-transparent border border-transparent hover:border-white/[0.08]'
                                  }
                                `}
                              >
                                {/* Círculo do radio */}
                                <div className={`
                                  relative w-3.5 h-3.5 rounded-full transition-all duration-150
                                  ${entry.isReference 
                                    ? 'border border-white/30' 
                                    : 'border border-muted-foreground/30 group-hover:border-muted-foreground/50'
                                  }
                                `}>
                                  {/* Dot interno quando ativo */}
                                  <div className={`
                                    absolute inset-0 m-auto w-1.5 h-1.5 rounded-full transition-all duration-150
                                    ${entry.isReference 
                                      ? 'bg-white/70 scale-100' 
                                      : 'bg-transparent scale-0'
                                    }
                                  `} />
                                </div>
                                
                                {/* Label */}
                                <span className={`
                                  text-[11px] font-normal transition-colors duration-150
                                  ${entry.isReference 
                                    ? 'text-white/60' 
                                    : 'text-muted-foreground/50 group-hover:text-muted-foreground/70'
                                  }
                                `}>
                                  Referência
                                </span>
                              </button>
                            )}
                          </div>
                          
                          {/* Casa | Odd | Stake | Linha na mesma linha - centralizado */}
                          {/* Stake com min-width para 5 dígitos + separadores (99.999,00) */}
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 justify-center w-full" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(60px, 1fr))' }}>
                            {/* Casa */}
                            <div className="space-y-1">
                              <Label className="text-xs text-muted-foreground text-center block">Casa</Label>
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
                              <Label className="text-xs text-muted-foreground text-center block">Odd</Label>
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
                              <Label className="text-xs text-muted-foreground whitespace-nowrap text-center block">
                                Stake{!isEditing && entry.isReference && <span className="text-primary ml-0.5">(Ref)</span>}
                                {/* Indicador de origem do stake - PRECEDÊNCIA: Print > Manual > Referência */}
                                {!isEditing && !entry.isReference && entry.stakeOrigem === "print" && (
                                  <span className="text-emerald-500 ml-0.5" title="Valor real detectado do print">🖨️</span>
                                )}
                                {!isEditing && !entry.isReference && entry.stakeOrigem === "manual" && (
                                  <span className="text-amber-500 ml-0.5" title="Valor editado manualmente">✍️</span>
                                )}
                                {!isEditing && !entry.isReference && entry.stakeOrigem === "referencia" && (
                                  <span className="text-blue-400 ml-0.5" title="Valor calculado pela referência">🔗</span>
                                )}
                              </Label>
                              {isEditing ? (
                                <div className="h-8 px-1.5 text-[10px] flex items-center justify-center bg-muted/50 rounded-md border font-medium">
                                  {formatCurrency(parseFloat(entry.stake) || 0, entry.moeda)}
                                </div>
                              ) : (
                                <div className="relative">
                                  <MoneyInput 
                                    placeholder={entry.isReference ? "Ref." : (stakeCalculada > 0 ? stakeCalculada.toFixed(2) : "Stake")}
                                    value={entry.stake}
                                    onChange={(val) => updateOdd(index, "stake", val)}
                                    currency={entry.moeda}
                                    minDigits={5}
                                    className={`h-8 text-xs px-2 pr-7 ${
                                      entry.stakeOrigem === "print"
                                        ? "border-emerald-500 ring-1 ring-emerald-500/30"
                                        : isDifferentFromCalculated 
                                          ? "border-amber-500 ring-1 ring-amber-500/50" 
                                          : ""
                                    }`}
                                    tabIndex={index * 4 + 3}
                                  />
                                  {/* Botão de reset: aparece quando editado manualmente (não print) E há valor calculado */}
                                  {!entry.isReference && entry.isManuallyEdited && entry.stakeOrigem !== "print" && stakeCalculada > 0 && (
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      size="sm"
                                      className="absolute right-0 top-1/2 -translate-y-1/2 h-6 w-6 p-0 text-amber-500 hover:text-primary"
                                      onClick={() => resetStakeToCalculated(index, stakeCalculada)}
                                      title={`Recalcular para ${formatCurrency(stakeCalculada, entry.moeda)}`}
                                    >
                                      <RotateCcw className="h-3 w-3" />
                                    </Button>
                                  )}
                                </div>
                              )}
                            </div>
                            
                            {/* Linha (Seleção Livre) - POR ENTRADA */}
                            <div className="space-y-1">
                              <Label className="text-xs text-muted-foreground whitespace-nowrap text-center block">Linha <span className="text-[10px] text-muted-foreground/60">(opcional)</span></Label>
                              {isEditing ? (
                                <div className="h-8 px-1.5 text-[10px] flex items-center justify-center bg-muted/50 rounded-md border font-medium truncate">
                                  {entry.selecaoLivre || "—"}
                                </div>
                              ) : (
                                <Input
                                  placeholder="Ov.2,5"
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
                              {/* Após 1ª aposta de bônus: mostra saldo total unificado com 🎁 */}
                              {/* Antes da 1ª aposta: mostra breakdown separado (real + freebet + bônus) */}
                              {!isEditing && selectedBookmaker && (() => {
                                const hasBonusAndRolloverStarted = 
                                  (Number(selectedBookmaker.saldo_bonus) || 0) > 0 && 
                                  selectedBookmaker.bonus_rollover_started;
                                
                                // Após 1ª aposta: exibir saldo total integrado
                                if (hasBonusAndRolloverStarted) {
                                  const saldoTotal = 
                                    (Number(selectedBookmaker.saldo_real) || 0) + 
                                    (Number(selectedBookmaker.saldo_freebet) || 0) + 
                                    (Number(selectedBookmaker.saldo_bonus) || 0);
                                  return (
                                    <div className="flex items-center justify-center gap-1 text-[10px]">
                                      <span className={getCurrencyTextColor(selectedBookmaker.moeda)}>
                                        {formatCurrency(saldoTotal, selectedBookmaker.moeda)}
                                      </span>
                                      <span className="text-purple-400" title="Bônus ativo em rollover">🎁</span>
                                    </div>
                                  );
                                }
                                
                                // Antes da 1ª aposta ou sem bônus: breakdown separado
                                return (
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
                                );
                              })()}
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
                                      {/* Grid alinhado com entrada principal: Casa | Linha | Odd | Stake */}
                                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 items-end pr-5 w-full" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(60px, 1fr))' }}>
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
                                        
                                        {/* Odd - alinhado com entrada principal */}
                                        <Input 
                                          type="number"
                                          step="0.01"
                                          placeholder="Odd"
                                          value={addEntry.odd}
                                          onChange={(e) => updateAdditionalEntry(index, addIdx, "odd", e.target.value)}
                                          className="h-7 text-xs px-1.5 bg-background"
                                          onWheel={(e) => e.currentTarget.blur()}
                                        />
                                        
                                        {/* Stake - campo financeiro com largura mínima */}
                                        <MoneyInput 
                                          placeholder="Stake"
                                          value={addEntry.stake}
                                          onChange={(val) => updateAdditionalEntry(index, addIdx, "stake", val)}
                                          currency={addEntry.moeda}
                                          minDigits={5}
                                          className={`h-7 text-xs px-2 bg-background ${addSaldoInsuficiente ? "border-destructive ring-1 ring-destructive/50" : ""}`}
                                        />
                                        
                                        {/* Linha - alinhado com entrada principal */}
                                        <Input
                                          placeholder="Ov.2,5"
                                          value={addEntry.selecaoLivre}
                                          onChange={(e) => updateAdditionalEntry(index, addIdx, "selecaoLivre", e.target.value)}
                                          className="h-7 text-[10px] px-1.5 bg-background"
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
                  ? "flex flex-wrap gap-4 items-center justify-center" 
                  : "space-y-1.5"
              }`}>
                {/* Stake Total */}
                <div className={`p-3 rounded-lg bg-primary/10 border border-primary/30 ${modelo === "1-X-2" ? "min-w-[160px]" : ""}`}>
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm text-muted-foreground">Stake Total</p>
                    {!isEditing && arredondarAtivado && (
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0.5 h-5">
                        ≈{arredondarValor}
                      </Badge>
                    )}
                  </div>
                  {analysis.isMultiCurrency ? (
                    <div className="flex flex-col gap-0.5">
                      <p className="text-base font-bold text-amber-400">Multi-Moeda</p>
                      {analysis.stakeTotal > 0 && (
                        <p className="text-sm font-semibold text-primary">
                          {formatCurrency(analysis.stakeTotal, moedaConsolidacao)}
                        </p>
                      )}
                    </div>
                  ) : (
                    <p className="text-lg font-bold text-primary">
                      {analysis.stakeTotal > 0 ? formatCurrency(analysis.stakeTotal, analysis.moedaDominante) : "—"}
                    </p>
                  )}
                </div>

                {/* Resultado Pendente (Pior Cenário) - Exibido quando pendente para TODOS os modelos */}
                {/* Translúcido para indicar que é estimativa, não resultado final */}
                {analysis.stakeTotal > 0 && !analysisReal.isResolved && analysis.scenarios.length >= 2 && (
                  <div className={`p-2.5 rounded-lg border border-dashed ${modelo === "1-X-2" ? "min-w-[140px]" : ""} ${
                    analysis.minLucro >= 0 
                      ? "border-emerald-500/30 bg-emerald-500/5" 
                      : "border-red-500/30 bg-red-500/5"
                  }`}>
                    <p className="text-[10px] text-muted-foreground/70 mb-0.5">Pior Cenário</p>
                    <div className="flex items-center gap-2">
                      <span className={`text-sm font-semibold ${
                        analysis.minLucro >= 0 ? "text-emerald-500/60" : "text-red-500/60"
                      }`}>
                        {analysis.minLucro >= 0 ? "+" : ""}{formatCurrency(analysis.minLucro, analysis.moedaDominante)}
                      </span>
                      <span className={`text-xs ${
                        analysis.minRoi >= 0 ? "text-emerald-400/50" : "text-red-400/50"
                      }`}>
                        {analysis.minRoi >= 0 ? "+" : ""}{analysis.minRoi.toFixed(1)}%
                      </span>
                    </div>
                  </div>
                )}

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
                    {/* ROI Compacto: Max (verde) / Min (vermelho) - OCULTO no 1-X-2 e 1-2 */}
                    {modelo !== "1-X-2" && modelo !== "1-2" && (
                      <div className="p-3 rounded-lg bg-muted/50 border border-border space-y-1">
                        <div className="flex items-center justify-between gap-3">
                          <span className="text-sm text-emerald-400">Máx</span>
                          <span className="text-sm font-bold text-emerald-500">
                            {analysis.stakeTotal > 0 
                              ? `${analysis.maxRoi >= 0 ? "+" : ""}${analysis.maxRoi.toFixed(1)}%`
                              : "—"
                            }
                          </span>
                        </div>
                        <div className="flex items-center justify-between gap-3 mt-1">
                          <span className="text-sm text-red-400">Mín</span>
                          <span className="text-sm font-bold text-red-500">
                            {analysis.stakeTotal > 0 
                              ? `${analysis.minRoi >= 0 ? "+" : ""}${analysis.minRoi.toFixed(1)}%`
                              : "—"
                            }
                          </span>
                        </div>
                      </div>
                    )}

                    {/* Cenários de Resultado - layout adaptativo */}
                    {analysis.scenarios.length > 0 && analysis.stakeTotal > 0 && (
                      <div className={(modelo === "1-X-2" || modelo === "1-2") ? "flex gap-3 flex-wrap" : ""}>
                        {modelo !== "1-X-2" && modelo !== "1-2" && <Separator className="my-1" />}
                        {analysis.scenarios.map((scenario, index) => (
                          <div 
                            key={index} 
                            className={`p-2.5 rounded-lg border ${
                              scenario.isPositive 
                                ? "bg-emerald-500/5 border-emerald-500/20" 
                                : "bg-red-500/5 border-red-500/20"
                            } ${(modelo === "1-X-2" || modelo === "1-2") ? "min-w-[120px]" : ""}`}
                          >
                            <div className="flex items-center justify-between gap-2 min-w-0">
                              <span className="text-xs font-medium truncate">{scenario.selecao}</span>
                              <div className="flex items-center gap-1.5">
                                <span className={`text-xs font-bold whitespace-nowrap ${scenario.isPositive ? "text-emerald-500" : "text-red-500"}`}>
                                  {scenario.lucro >= 0 ? "+" : ""}{formatCurrency(scenario.lucro, analysis.moedaDominante)}
                                </span>
                                {/* Mostrar ROI % junto ao valor no modelo 1-X-2 e 1-2 */}
                                {(modelo === "1-X-2" || modelo === "1-2") && (
                                  <span className={`text-[10px] font-medium whitespace-nowrap ${scenario.roi >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                                    {scenario.roi >= 0 ? "+" : ""}{scenario.roi.toFixed(1)}%
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Probabilidades - exibir para todos os modelos */}
                    {analysis.hasPartialData && (
                      <>
                        {modelo !== "1-X-2" && modelo !== "1-2" && <Separator className="my-1" />}
                        <div className={modelo === "1-X-2" || modelo === "1-2" ? "mt-2" : ""}>
                          <p className="text-xs font-medium mb-1.5 text-muted-foreground">Probabilidades</p>
                          <div className="space-y-1">
                            {odds.map((entry, index) => {
                              const impliedProb = analysis.impliedProbs[index];
                              return (
                                <div key={index} className="flex items-center justify-between text-xs">
                                  <span className="text-muted-foreground">{entry.selecao}</span>
                                  <span className={`font-medium ${impliedProb > 0 ? "text-blue-400" : "text-muted-foreground"}`}>
                                    {impliedProb > 0 ? `${(impliedProb * 100).toFixed(0)}%` : "—"}
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      </>
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
            {/* Botão de Rascunho: aparece quando tem dados mas não pode salvar como aposta real */}
            {podeSalvarRascunho && (
              <Button 
                variant="secondary"
                onClick={handleSalvarRascunho}
                disabled={saving}
              >
                <FileText className="h-4 w-4 mr-1" />
                Salvar Rascunho
              </Button>
            )}
            <Button 
              onClick={handleSave} 
              disabled={saving || !analysis || analysis.stakeTotal <= 0 || pernasCompletasCount < 2}
            >
              <Save className="h-4 w-4 mr-1" />
              {isEditing ? "Salvar" : "Registrar"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
      
      {/* Dialog para ampliar print */}
      <Dialog open={!!expandedPrintUrl} onOpenChange={() => setExpandedPrintUrl(null)}>
        <DialogContent className="max-w-4xl max-h-[90vh] p-2">
          {expandedPrintUrl && (
            <img 
              src={expandedPrintUrl} 
              alt="Print ampliado" 
              className="w-full h-full object-contain max-h-[85vh]"
            />
          )}
        </DialogContent>
      </Dialog>
      
      {/* Modal de cobertura incompleta removido - botão já desabilitado para < 2 pernas */}
    </Dialog>
  );
}
