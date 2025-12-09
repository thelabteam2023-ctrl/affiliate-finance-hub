import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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
  ArrowLeftRight
} from "lucide-react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";

interface Bookmaker {
  id: string;
  nome: string;
  saldo_atual: number;
  saldo_freebet?: number;
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
  bookmakers: Bookmaker[];
  surebet: Surebet | null;
  onSuccess: () => void;
}

interface OddEntry {
  bookmaker_id: string;
  odd: string;
  stake: string;
  selecao: string;
  isReference: boolean;
  isManuallyEdited: boolean;
  resultado?: string | null;
  aposta_id?: string;
}

const ESPORTES = [
  "Futebol", "Basquete", "Tênis", "Baseball", "Hockey", 
  "Futebol Americano", "Vôlei", "MMA/UFC", "Boxe", "Golfe",
  "League of Legends", "Counter-Strike", "Dota 2", "eFootball"
];
const MERCADOS = [
  "Money Line", "Total de Gols", "Ambos Marcam", "Total de Cantos", 
  "Total de Cartões", "Handicap Asiático", "Handicap Europeu", 
  "Empate Anula", "Correct Score"
];

// Mapeamento de mercado → seleções dinâmicas
const SELECOES_POR_MERCADO: Record<string, string[]> = {
  "ML": ["Casa", "Fora"],
  "Over/Under": ["Over", "Under"],
  "Ambos Marcam": ["Sim", "Não"],
  "Handicap Asiático": ["Casa", "Fora"],
  "Handicap Europeu": ["Casa", "Empate", "Fora"],
  "Empate Anula": ["Casa", "Fora"],
  "Correct Score": ["Casa", "Fora"],
  "Dupla Chance": ["Casa/Empate", "Casa/Fora", "Empate/Fora"],
  "Draw No Bet": ["Casa", "Fora"],
  "Primeiro a Marcar": ["Casa", "Fora", "Sem Gols"],
  "Intervalo/Final": ["Casa/Casa", "Casa/Empate", "Casa/Fora", "Empate/Casa", "Empate/Empate", "Empate/Fora", "Fora/Casa", "Fora/Empate", "Fora/Fora"],
  "Total de Gols": ["Over", "Under"],
  "Total de Cantos": ["Over", "Under"],
  "Total de Cartões": ["Over", "Under"],
  "Spread": ["Casa", "Fora"],
  "Total de Pontos": ["Over", "Under"],
  "Outro": ["Opção 1", "Opção 2"]
};

const getSelecoesPorMercado = (mercado: string, modelo: "1-X-2" | "1-2"): string[] => {
  // 1-X-2 sempre é Casa, Empate, Fora - fixo
  if (modelo === "1-X-2") {
    return ["Casa", "Empate", "Fora"];
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

const SELECOES_1X2 = ["Casa", "Empate", "Fora"];
const SELECOES_BINARIO = ["Sim", "Não"];

export function SurebetDialog({ open, onOpenChange, projetoId, bookmakers, surebet, onSuccess }: SurebetDialogProps) {
  const isEditing = !!surebet;
  
  // Form state
  const [evento, setEvento] = useState("");
  const [mercado, setMercado] = useState("");
  const [esporte, setEsporte] = useState("Futebol");
  const [modelo, setModelo] = useState<"1-X-2" | "1-2">("1-2");
  const [observacoes, setObservacoes] = useState("");
  const [saving, setSaving] = useState(false);
  
  // Arredondamento de stakes
  const [arredondarAtivado, setArredondarAtivado] = useState(false);
  const [arredondarValor, setArredondarValor] = useState("1");
  
  // Odds entries (2 for binary, 3 for 1X2)
  const [odds, setOdds] = useState<OddEntry[]>([
    { bookmaker_id: "", odd: "", stake: "", selecao: "Sim", isReference: true, isManuallyEdited: false },
    { bookmaker_id: "", odd: "", stake: "", selecao: "Não", isReference: false, isManuallyEdited: false }
  ]);
  
  // Apostas vinculadas para edição
  const [linkedApostas, setLinkedApostas] = useState<any[]>([]);

  // Inicializar formulário
  useEffect(() => {
    if (open) {
      if (surebet) {
        setEvento(surebet.evento);
        setEsporte(surebet.esporte);
        setModelo(surebet.modelo as "1-X-2" | "1-2");
        setObservacoes(surebet.observacoes || "");
        // Buscar apostas vinculadas passando o modelo correto
        fetchLinkedApostas(surebet.id, surebet.modelo);
      } else {
        resetForm();
      }
    }
  }, [open, surebet]);

  // Atualizar array de odds quando modelo muda (mercado NÃO afeta modelo)
  useEffect(() => {
    if (!isEditing) {
      // Modelo é livre, mercado é apenas uma etiqueta
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
          odd: "",
          stake: "",
          selecao: sel,
          isReference: i === 0,
          isManuallyEdited: false
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
  }, [modelo, isEditing]);
  
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
    setArredondarAtivado(false);
    setArredondarValor("1");
    const defaultSelecoes = getSelecoesPorMercado("", "1-2");
    setOdds(defaultSelecoes.map((sel, i) => ({
      bookmaker_id: "", odd: "", stake: "", selecao: sel, isReference: i === 0, isManuallyEdited: false
    })));
    setLinkedApostas([]);
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

  const fetchLinkedApostas = async (surebetId: string, surebetModelo: string) => {
    const { data } = await supabase
      .from("apostas")
      .select(`
        id, selecao, odd, stake, resultado, lucro_prejuizo,
        bookmaker_id,
        bookmaker:bookmakers (nome, saldo_atual)
      `)
      .eq("surebet_id", surebetId);
    
    if (!data || data.length === 0) {
      setLinkedApostas([]);
      return;
    }

    // Ordenar pela ordem fixa do modelo (NUNCA por status ou resultado)
    const ordemFixa = getOrdemFixa(surebetModelo as "1-X-2" | "1-2");
    const sortedData = [...data].sort((a, b) => {
      const indexA = ordemFixa.indexOf(a.selecao);
      const indexB = ordemFixa.indexOf(b.selecao);
      // Se não encontrar na ordem fixa, usar ordem de criação (id)
      if (indexA === -1 && indexB === -1) return 0;
      if (indexA === -1) return 1;
      if (indexB === -1) return -1;
      return indexA - indexB;
    });
    
    setLinkedApostas(sortedData);
    
    // Popular o array de odds com os dados das apostas para cálculos
    const newOdds: OddEntry[] = sortedData.map((aposta, index) => ({
      bookmaker_id: aposta.bookmaker_id || "",
      odd: aposta.odd?.toString() || "",
      stake: aposta.stake?.toString() || "",
      selecao: aposta.selecao,
      isReference: index === 0,
      isManuallyEdited: true, // Já foi salvo, não precisa recalcular automaticamente
      resultado: aposta.resultado,
      aposta_id: aposta.id
    }));
    
    setOdds(newOdds);
  };

  const updateOdd = (index: number, field: keyof OddEntry, value: string | boolean) => {
    const newOdds = [...odds];
    newOdds[index] = { ...newOdds[index], [field]: value };
    
    // Se está definindo referência, remover das outras e resetar campos não-manuais
    if (field === "isReference" && value === true) {
      newOdds.forEach((o, i) => {
        if (i !== index) {
          o.isReference = false;
          // Resetar stake se não foi editado manualmente
          if (!o.isManuallyEdited) {
            o.stake = "";
          }
        }
      });
    }
    
    // Marcar como editado manualmente se for o campo stake
    if (field === "stake") {
      newOdds[index].isManuallyEdited = true;
    }
    
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

  // Auto-preencher stakes não-manuais quando há referência válida
  useEffect(() => {
    const parsedOdds = odds.map(o => parseFloat(o.odd) || 0);
    const validOddsCount = parsedOdds.filter(o => o > 1).length;
    
    const refIndex = odds.findIndex(o => o.isReference);
    if (refIndex === -1) return;
    
    const refStakeValue = parseFloat(odds[refIndex]?.stake) || 0;
    const refOdd = parsedOdds[refIndex] || 0;
    
    // Só calcular se temos stake de referência, odd válida e pelo menos 2 odds válidas
    if (refStakeValue <= 0 || refOdd <= 1 || validOddsCount < 2) return;
    
    const targetReturn = refStakeValue * refOdd;
    
    // Verificar se há campos não-manuais que precisam ser preenchidos
    let needsUpdate = false;
    const newOdds = odds.map((o, i) => {
      if (i === refIndex || o.isManuallyEdited) return o;
      
      const odd = parsedOdds[i];
      if (odd > 1) {
        const rawStake = targetReturn / odd;
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
    odds.map(o => o.odd).join(','),
    odds.map(o => o.isReference).join(','),
    odds.find(o => o.isReference)?.stake,
    arredondarAtivado,
    arredondarValor
  ]);

  // Obter saldo da casa selecionada
  const getBookmakerSaldo = (bookmakerId: string): number | null => {
    const bk = bookmakers.find(b => b.id === bookmakerId);
    return bk ? bk.saldo_atual : null;
  };

  const getBookmakerNome = (bookmakerId: string): string => {
    const bk = bookmakers.find(b => b.id === bookmakerId);
    if (!bk) return "";
    const parceiroNome = bk.parceiro?.nome?.split(" ");
    const shortName = parceiroNome 
      ? `${parceiroNome[0]} ${parceiroNome[parceiroNome.length - 1] || ""}`.trim()
      : "";
    return shortName ? `${bk.nome} - ${shortName}` : bk.nome;
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(value);
  };

  // Cálculos em tempo real - TOTALMENTE reativo aos inputs atuais
  const analysis = useMemo(() => {
    const parsedOdds = odds.map(o => parseFloat(o.odd) || 0);
    const validOddsCount = parsedOdds.filter(o => o > 1).length;
    
    // Probabilidades implícitas (mesmo com dados parciais)
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
    const refStakeValue = parseFloat(odds[refIndex]?.stake) || 0;
    
    // Calcular stakes sugeridas baseado na referência
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
    
    // SEMPRE usar os valores ATUAIS dos inputs de stake para análise
    // Isso garante que qualquer edição manual (incluindo 0) seja refletida
    const actualStakes = odds.map((o, i) => {
      const inputValue = parseFloat(o.stake);
      // Se o campo tem valor válido (incluindo 0), usar o valor do input
      if (!isNaN(inputValue)) {
        return inputValue;
      }
      // Se o campo está vazio, usar a sugestão se existir
      if (suggestedStakes[i] !== undefined && !o.isManuallyEdited) {
        return suggestedStakes[i];
      }
      return 0;
    });
    
    // StakeTotal = soma de todas as stakes atuais (S1 + S2 + S3)
    const stakeTotal = actualStakes.reduce((a, b) => a + b, 0);
    
    // Calcular cenários de retorno/lucro para CADA resultado possível
    // Retorno_i = O_i * S_i
    // Lucro_i = Retorno_i - StakeTotal
    const scenarios = parsedOdds.map((odd, i) => {
      const stakeNesseLado = actualStakes[i];
      const retorno = odd > 1 ? stakeNesseLado * odd : 0;
      const lucro = retorno - stakeTotal;
      return {
        selecao: odds[i].selecao,
        stake: stakeNesseLado,
        retorno,
        lucro,
        isPositive: lucro >= 0
      };
    });
    
    // Lucro mínimo entre todos os cenários (para arbitragem garantida)
    const minLucro = scenarios.length > 0 ? Math.min(...scenarios.map(s => s.lucro)) : 0;
    const guaranteedProfit = minLucro;
    
    // ROI = (LucroMin / StakeTotal) * 100
    const roiEsperado = stakeTotal > 0 ? (guaranteedProfit / stakeTotal) * 100 : 0;
    
    // Todos os cenários com lucro positivo = arbitragem garantida
    const allPositive = scenarios.length > 0 && scenarios.every(s => s.lucro >= 0);
    const anyNegative = scenarios.some(s => s.lucro < 0);
    
    // Recomendação baseada nos cenários
    let recommendation: { text: string; color: string; icon: "check" | "x" | "alert" } | null = null;
    
    if (stakeTotal > 0 && validOddsCount >= 2) {
      if (allPositive && guaranteedProfit > 0) {
        recommendation = { 
          text: `Arbitragem! Lucro garantido: ${formatCurrency(guaranteedProfit)} (${roiEsperado.toFixed(2)}%)`, 
          color: "text-emerald-500",
          icon: "check"
        };
      } else if (allPositive && guaranteedProfit === 0) {
        recommendation = { 
          text: `Operação neutra. Sem lucro ou perda garantidos.`, 
          color: "text-blue-400",
          icon: "alert"
        };
      } else if (anyNegative) {
        const custoPercent = Math.abs(roiEsperado);
        recommendation = { 
          text: `Custo operacional: ${formatCurrency(Math.abs(guaranteedProfit))} (-${custoPercent.toFixed(2)}%)`, 
          color: "text-amber-400",
          icon: "alert"
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
      recommendation,
      validOddsCount,
      hasPartialData: validOddsCount > 0
    };
  }, [odds, arredondarAtivado, arredondarValor]);

  // Análise de resultado REAL (quando resolvida - posições marcadas como GREEN/RED/VOID)
  const analysisReal = useMemo(() => {
    // Verificar se todas as posições têm resultado
    const todasResolvidas = odds.every(o => o.resultado && ["GREEN", "RED", "VOID"].includes(o.resultado));
    
    if (!todasResolvidas) {
      return { isResolved: false, lucroReal: 0, roiReal: 0 };
    }

    // Calcular lucro real baseado nos resultados
    let lucroReal = 0;
    const stakeTotal = odds.reduce((acc, o) => acc + (parseFloat(o.stake) || 0), 0);

    odds.forEach(o => {
      const stake = parseFloat(o.stake) || 0;
      const odd = parseFloat(o.odd) || 0;
      
      if (o.resultado === "GREEN") {
        // GREEN = ganha (retorno - stakes de todas as pernas)
        lucroReal += stake * odd;
      } else if (o.resultado === "RED") {
        // RED = perde a stake
        // Não adiciona nada ao retorno
      } else if (o.resultado === "VOID") {
        // VOID = devolve a stake
        lucroReal += stake;
      }
    });

    // Lucro real = retorno total - stake total
    lucroReal = lucroReal - stakeTotal;
    const roiReal = stakeTotal > 0 ? (lucroReal / stakeTotal) * 100 : 0;

    return {
      isResolved: true,
      lucroReal,
      roiReal
    };
  }, [odds]);

  const handleSave = async () => {
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
      
      // 4. Verificar saldo (aviso, não bloqueante se saldo unknown)
      const saldo = getBookmakerSaldo(entry.bookmaker_id);
      if (saldo !== null && stake > saldo) {
        toast.error(`Saldo insuficiente em ${getBookmakerNome(entry.bookmaker_id)}: ${formatCurrency(saldo)} disponível, ${formatCurrency(stake)} necessário`);
        return;
      }
    }

    try {
      setSaving(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Usuário não autenticado");

      if (isEditing && surebet) {
        // Update surebet
        const { error } = await supabase
          .from("surebets")
          .update({
            evento,
            esporte,
            observacoes,
            updated_at: new Date().toISOString()
          })
          .eq("id", surebet.id);

        if (error) throw error;
        toast.success("Surebet atualizada!");
      } else {
        // Calcular stake total e valores das stakes diretamente dos campos
        const stakes = odds.map(o => parseFloat(o.stake) || 0);
        const stakeTotal = stakes.reduce((a, b) => a + b, 0);
        
        // Create surebet
        const { data: newSurebet, error: surebetError } = await supabase
          .from("surebets")
          .insert({
            user_id: user.id,
            projeto_id: projetoId,
            evento,
            esporte,
            modelo,
            stake_total: stakeTotal,
            spread_calculado: analysis?.spread || null,
            roi_esperado: analysis?.roiEsperado || null,
            lucro_esperado: analysis?.guaranteedProfit || null,
            observacoes,
            status: "PENDENTE"
          })
          .select()
          .single();

        if (surebetError) throw surebetError;

        // Create linked apostas usando valores diretamente dos campos
        const apostasToCreate = odds.map((entry, index) => ({
          user_id: user.id,
          projeto_id: projetoId,
          surebet_id: newSurebet.id,
          bookmaker_id: entry.bookmaker_id,
          data_aposta: new Date().toISOString(),
          esporte,
          evento,
          mercado: modelo,
          selecao: entry.selecao,
          odd: parseFloat(entry.odd),
          stake: stakes[index],
          status: "PENDENTE",
          estrategia: "SUREBET",
          modo_entrada: "PADRAO"
        }));

        const { error: apostasError } = await supabase
          .from("apostas")
          .insert(apostasToCreate);

        if (apostasError) throw apostasError;

        // Atualizar saldos dos bookmakers
        for (let i = 0; i < odds.length; i++) {
          const bk = bookmakers.find(b => b.id === odds[i].bookmaker_id);
          if (bk) {
            const newSaldo = bk.saldo_atual - stakes[i];
            await supabase
              .from("bookmakers")
              .update({ saldo_atual: newSaldo })
              .eq("id", odds[i].bookmaker_id);
          }
        }

        toast.success("Surebet registrada com sucesso!");
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
      const { error } = await supabase
        .from("surebets")
        .delete()
        .eq("id", surebet.id);

      if (error) throw error;
      
      toast.success("Surebet excluída!");
      onSuccess();
      onOpenChange(false);
    } catch (error: any) {
      toast.error("Erro ao excluir: " + error.message);
    }
  };

  const handleLiquidarAposta = async (apostaId: string, resultado: "GREEN" | "RED" | "VOID" | null) => {
    try {
      const aposta = linkedApostas.find(a => a.id === apostaId);
      if (!aposta) return;

      let lucro: number | null = 0;
      let status = "FINALIZADA";
      
      if (resultado === null) {
        // Limpar resultado - voltar para pendente
        lucro = null;
        status = "PENDENTE";
      } else if (resultado === "GREEN") {
        lucro = aposta.stake * (aposta.odd - 1);
      } else if (resultado === "RED") {
        lucro = -aposta.stake;
      } else if (resultado === "VOID") {
        lucro = 0;
      }

      const { error } = await supabase
        .from("apostas")
        .update({ 
          resultado, 
          lucro_prejuizo: lucro,
          status
        })
        .eq("id", apostaId);

      if (error) throw error;

      // Recarregar apostas para atualizar estado local
      await fetchLinkedApostas(surebet!.id, surebet!.modelo);
      
      // Recalcular status da surebet
      const { data: apostasAtualizadas } = await supabase
        .from("apostas")
        .select("resultado, lucro_prejuizo, stake, odd")
        .eq("surebet_id", surebet!.id);
      
      if (apostasAtualizadas) {
        const todasLiquidadas = apostasAtualizadas.every(a => a.resultado && a.resultado !== "PENDENTE" && a.resultado !== null);
        
        if (todasLiquidadas) {
          const lucroTotal = apostasAtualizadas.reduce((acc, a) => acc + (a.lucro_prejuizo || 0), 0);
          const resultadoFinal = lucroTotal > 0 ? "GREEN" : lucroTotal < 0 ? "RED" : "VOID";
          
          await supabase
            .from("surebets")
            .update({
              status: "LIQUIDADA",
              resultado: resultadoFinal,
              lucro_real: lucroTotal,
              roi_real: surebet!.stake_total > 0 ? (lucroTotal / surebet!.stake_total) * 100 : 0
            })
            .eq("id", surebet!.id);
        } else {
          // Se nem todas estão liquidadas, voltar para PENDENTE
          await supabase
            .from("surebets")
            .update({
              status: "PENDENTE",
              resultado: null,
              lucro_real: null,
              roi_real: null
            })
            .eq("id", surebet!.id);
        }
      }

      toast.success(resultado === null ? "Resultado limpo!" : "Resultado registrado!");
      onSuccess();
    } catch (error: any) {
      toast.error("Erro: " + error.message);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-7xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Calculator className="h-5 w-5 text-amber-500" />
            {isEditing ? "Editar Arbitragem" : "Arbitragem"}
          </DialogTitle>
        </DialogHeader>

        <div className="flex flex-col lg:flex-row gap-6">
          {/* Formulário - Lado Esquerdo (mais largo) */}
          <div className="flex-1 space-y-4">
            {/* Cabeçalho */}
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Esporte</Label>
                <Select value={esporte} onValueChange={setEsporte}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ESPORTES.map(e => (
                      <SelectItem key={e} value={e}>{e}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              
              {/* Abas de Modelo com linha animada */}
              <div className="space-y-2">
                <Label>Modelo</Label>
                <div className="relative flex p-1 bg-muted/50 rounded-lg">
                  {/* Indicador animado */}
                  <div 
                    className="absolute h-[calc(100%-8px)] bg-primary rounded-md transition-all duration-300 ease-out"
                    style={{
                      width: 'calc(50% - 4px)',
                      left: modelo === "1-X-2" ? 'calc(50% + 2px)' : '4px',
                      top: '4px'
                    }}
                  />
                  
                  <button
                    type="button"
                    onClick={() => setModelo("1-2")}
                    className={`relative z-10 flex-1 py-2 px-4 text-sm font-medium rounded-md transition-colors duration-200 ${
                      modelo === "1-2" 
                        ? "text-primary-foreground" 
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    1–2
                  </button>
                  
                  <button
                    type="button"
                    onClick={() => setModelo("1-X-2")}
                    className={`relative z-10 flex-1 py-2 px-4 text-sm font-medium rounded-md transition-colors duration-200 ${
                      modelo === "1-X-2" 
                        ? "text-primary-foreground" 
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    1–X–2
                  </button>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Evento</Label>
                <Input 
                  placeholder="Ex: Brasil x Argentina" 
                  value={evento}
                  onChange={(e) => setEvento(e.target.value)}
                  className="uppercase"
                />
              </div>
              <div className="space-y-2">
                <Label>Mercado</Label>
                <Select value={mercado} onValueChange={setMercado}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione o mercado" />
                  </SelectTrigger>
                  <SelectContent>
                    {MERCADOS.map(m => (
                      <SelectItem key={m} value={m}>{m}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <Separator />

            {/* Tabela de Odds - Layout em Colunas (usado tanto na criação quanto na edição) */}
            {odds.length > 0 && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <Label className="text-base font-medium">Posições da Operação</Label>
                  <span className="text-xs text-muted-foreground">
                    Selecione a referência e ajuste as stakes
                  </span>
                </div>
                
                {/* Grid de Colunas com botões de swap entre elas */}
                <div className="flex items-stretch gap-1">
                  {odds.map((entry, index) => {
                    const saldo = getBookmakerSaldo(entry.bookmaker_id);
                    const selectedBookmaker = bookmakers.find(b => b.id === entry.bookmaker_id);
                    const parceiroNome = selectedBookmaker?.parceiro?.nome?.split(" ");
                    const parceiroShortName = parceiroNome 
                      ? `${parceiroNome[0]} ${parceiroNome[parceiroNome.length - 1] || ""}`.trim()
                      : "";
                    const stakeCalculada = analysis?.calculatedStakes?.[index] || 0;
                    const stakeAtual = parseFloat(entry.stake) || 0;
                    const isDifferentFromCalculated = entry.isManuallyEdited && 
                      stakeAtual > 0 && 
                      Math.abs(stakeAtual - stakeCalculada) > 0.01 &&
                      !entry.isReference;
                    
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
                            
                            {/* Seleção dinâmica */}
                            <span className="text-sm font-medium text-foreground">
                              {entry.selecao}
                            </span>
                            
                            {/* Resultado (apenas em modo edição) */}
                            {isEditing && entry.aposta_id && (
                              <div className="flex items-center gap-1">
                                {entry.resultado ? (
                                  <>
                                    <Badge className={`text-xs ${
                                      entry.resultado === "GREEN" ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/40" :
                                      entry.resultado === "RED" ? "bg-red-500/20 text-red-400 border-red-500/40" :
                                      "bg-gray-500/20 text-gray-400 border-gray-500/40"
                                    }`}>
                                      {entry.resultado}
                                    </Badge>
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      size="sm"
                                      className="h-5 w-5 p-0 text-muted-foreground hover:text-foreground"
                                      onClick={() => handleLiquidarAposta(entry.aposta_id!, null as any)}
                                      title="Limpar resultado"
                                    >
                                      <RotateCcw className="h-3 w-3" />
                                    </Button>
                                  </>
                                ) : (
                                  <div className="flex gap-1">
                                    <Button 
                                      type="button"
                                      size="sm" 
                                      variant="outline"
                                      className="h-6 w-6 p-0 text-emerald-500 hover:bg-emerald-500/20"
                                      onClick={() => handleLiquidarAposta(entry.aposta_id!, "GREEN")}
                                      title="GREEN"
                                    >
                                      <CheckCircle2 className="h-3.5 w-3.5" />
                                    </Button>
                                    <Button 
                                      type="button"
                                      size="sm" 
                                      variant="outline"
                                      className="h-6 w-6 p-0 text-red-500 hover:bg-red-500/20"
                                      onClick={() => handleLiquidarAposta(entry.aposta_id!, "RED")}
                                      title="RED"
                                    >
                                      <XCircle className="h-3.5 w-3.5" />
                                    </Button>
                                    <Button 
                                      type="button"
                                      size="sm" 
                                      variant="outline"
                                      className="h-6 w-6 p-0 text-gray-500 hover:bg-gray-500/20"
                                      onClick={() => handleLiquidarAposta(entry.aposta_id!, "VOID")}
                                      title="VOID"
                                    >
                                      <span className="text-[10px] font-bold">V</span>
                                    </Button>
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
                          
                          {/* Casa */}
                          <div className="space-y-1">
                            <Label className="text-xs text-muted-foreground">Casa</Label>
                            {isEditing ? (
                              <div className="h-9 px-2 text-sm flex items-center bg-muted/50 rounded-md border truncate font-medium uppercase">
                                {selectedBookmaker?.nome || "—"}
                              </div>
                            ) : (
                              <Select 
                                value={entry.bookmaker_id}
                                onValueChange={(v) => updateOdd(index, "bookmaker_id", v)}
                              >
                                <SelectTrigger className="h-9 text-sm w-full">
                                  <SelectValue placeholder="Casa">
                                    {selectedBookmaker?.nome && (
                                      <span className="truncate uppercase">{selectedBookmaker.nome}</span>
                                    )}
                                  </SelectValue>
                                </SelectTrigger>
                                <SelectContent>
                                  {bookmakers.map(bk => (
                                    <SelectItem key={bk.id} value={bk.id}>
                                      <span className="uppercase">{bk.nome}</span>
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            )}
                          </div>
                          
                          {/* Parceiro + Saldo logo abaixo do select */}
                          {entry.bookmaker_id && (
                            <div className="flex items-center justify-between gap-1 px-1 text-[10px] text-muted-foreground">
                              <span className="truncate max-w-[60%]">
                                {parceiroShortName || "—"}
                              </span>
                              {saldo !== null && (
                                <div className="flex items-center gap-1 flex-shrink-0">
                                  <Wallet className="h-2.5 w-2.5" />
                                  <span className={stakeAtual > saldo ? "text-destructive" : ""}>
                                    {formatCurrency(saldo)}
                                  </span>
                                </div>
                              )}
                            </div>
                          )}
                          
                          {/* Odd + Stake na mesma linha */}
                          <div className="grid grid-cols-2 gap-2">
                            <div className="space-y-1">
                              <Label className="text-xs text-muted-foreground">Odd</Label>
                              {isEditing ? (
                                <div className="h-9 px-2 text-sm flex items-center justify-center bg-muted/50 rounded-md border font-medium">
                                  {parseFloat(entry.odd).toFixed(2)}
                                </div>
                              ) : (
                                <Input 
                                  type="number"
                                  step="0.01"
                                  placeholder="1.00"
                                  value={entry.odd}
                                  onChange={(e) => updateOdd(index, "odd", e.target.value)}
                                  className="h-9 text-sm"
                                  tabIndex={index + 1}
                                  onWheel={(e) => e.currentTarget.blur()}
                                />
                              )}
                            </div>
                            
                            <div className="space-y-1">
                              <Label className="text-xs text-muted-foreground">
                                Stake {!isEditing && entry.isReference && <span className="text-primary text-[10px]">(Ref)</span>}
                              </Label>
                              {isEditing ? (
                                <div className="h-9 px-2 text-sm flex items-center justify-center bg-muted/50 rounded-md border font-medium">
                                  {formatCurrency(parseFloat(entry.stake) || 0)}
                                </div>
                              ) : (
                                <div className="relative">
                                  <Input 
                                    type="number"
                                    step="0.01"
                                    placeholder={entry.isReference ? "Ref." : (stakeCalculada > 0 ? stakeCalculada.toFixed(2) : "Stake")}
                                    value={entry.stake}
                                    onChange={(e) => updateOdd(index, "stake", e.target.value)}
                                    className={`h-9 text-sm pr-7 ${
                                      isDifferentFromCalculated 
                                        ? "border-amber-500 ring-1 ring-amber-500/50" 
                                        : ""
                                    }`}
                                    tabIndex={odds.length + index + 1}
                                    onWheel={(e) => e.currentTarget.blur()}
                                  />
                                  {isDifferentFromCalculated && stakeCalculada > 0 && (
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      size="sm"
                                      className="absolute right-0.5 top-1/2 -translate-y-1/2 h-6 w-6 p-0 text-muted-foreground hover:text-primary"
                                      onClick={() => resetStakeToCalculated(index, stakeCalculada)}
                                      title={`Resetar para ${stakeCalculada.toFixed(2)}`}
                                    >
                                      <RotateCcw className="h-3 w-3" />
                                    </Button>
                                  )}
                                </div>
                              )}
                            </div>
                          </div>
                          
                          {/* Aviso de saldo insuficiente */}
                          {stakeAtual > 0 && saldo !== null && stakeAtual > saldo && (
                            <Badge variant="destructive" className="text-[10px] h-4 px-1 w-fit mx-auto">
                              Saldo Insuficiente
                            </Badge>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
                
                {/* Opções de Arredondamento - apenas em criação */}
                {!isEditing && (
                  <div className="flex items-center gap-4 pt-2 border-t">
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        id="arredondar-checkbox"
                        checked={arredondarAtivado}
                        onChange={(e) => setArredondarAtivado(e.target.checked)}
                        className="h-4 w-4 cursor-pointer accent-primary rounded"
                      />
                      <Label htmlFor="arredondar-checkbox" className="text-sm cursor-pointer">
                        Arredondar até:
                      </Label>
                      <Input
                        type="number"
                        min="1"
                        step="1"
                        value={arredondarValor}
                        onChange={(e) => setArredondarValor(e.target.value)}
                        disabled={!arredondarAtivado}
                        className="h-8 w-16"
                      />
                    </div>
                  </div>
                )}
              </div>
            )}


            <div className="space-y-2">
              <Label>Observações</Label>
              <Textarea 
                placeholder="Notas sobre a operação..."
                value={observacoes}
                onChange={(e) => setObservacoes(e.target.value)}
                rows={2}
              />
            </div>
          </div>

          {/* Análise - Sidebar Direita Compacta */}
          <div className="w-full lg:w-48 xl:w-52 flex-shrink-0 space-y-2">
            <Card>
              <CardHeader className="pb-2 pt-3 px-3">
                <CardTitle className="text-xs flex items-center gap-1.5">
                  <Calculator className="h-3.5 w-3.5" />
                  {isEditing && analysisReal.isResolved ? "Resultado" : "Análise"}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 px-3 pb-3">
                {/* Stake Total */}
                <div className="p-2 rounded-lg bg-primary/10 border border-primary/30">
                  <p className="text-[10px] text-muted-foreground">Stake Total</p>
                  <p className="text-lg font-bold text-primary">
                    {analysis.stakeTotal > 0 ? formatCurrency(analysis.stakeTotal) : "—"}
                  </p>
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
                      <p className="text-[10px] text-muted-foreground mb-1">Resultado Final</p>
                      <p className={`text-xl font-bold ${
                        analysisReal.lucroReal >= 0 ? "text-emerald-500" : "text-red-500"
                      }`}>
                        {analysisReal.lucroReal >= 0 ? "+" : ""}{formatCurrency(analysisReal.lucroReal)}
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
                    {/* Métricas esperadas (modo projeção) */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between p-2 rounded-lg bg-muted/30">
                        <span className="text-xs text-muted-foreground">ROI Esperado</span>
                        <span className={`text-sm font-bold ${
                          analysis.stakeTotal <= 0 
                            ? 'text-muted-foreground' 
                            : analysis.roiEsperado >= 0 
                              ? 'text-emerald-500' 
                              : 'text-red-500'
                        }`}>
                          {analysis.stakeTotal > 0 
                            ? `${analysis.roiEsperado >= 0 ? "+" : ""}${analysis.roiEsperado.toFixed(2)}%`
                            : "—"
                          }
                        </span>
                      </div>
                      <div className="flex items-center justify-between p-2 rounded-lg bg-muted/30">
                        <span className="text-xs text-muted-foreground">
                          {analysis.guaranteedProfit >= 0 ? "Lucro" : "Custo"}
                        </span>
                        <span className={`text-sm font-bold ${
                          analysis.stakeTotal <= 0 
                            ? 'text-muted-foreground' 
                            : analysis.guaranteedProfit >= 0 
                              ? 'text-emerald-500' 
                              : 'text-amber-500'
                        }`}>
                          {analysis.stakeTotal > 0 
                            ? `${analysis.guaranteedProfit >= 0 ? "+" : ""}${formatCurrency(analysis.guaranteedProfit)}`
                            : "—"
                          }
                        </span>
                      </div>
                    </div>

                    {/* Cenários de Resultado */}
                    {analysis.scenarios.length > 0 && (
                      <>
                        <Separator />
                        <div>
                          <p className="text-xs font-medium mb-2">Cenários</p>
                          <div className="space-y-1.5">
                            {analysis.scenarios.map((scenario, index) => (
                              <div 
                                key={index} 
                                className={`p-2 rounded-lg border ${
                                  scenario.isPositive 
                                    ? "bg-emerald-500/5 border-emerald-500/20" 
                                    : "bg-red-500/5 border-red-500/20"
                                }`}
                              >
                                <div className="flex items-center justify-between">
                                  <span className="text-xs font-medium">{scenario.selecao}</span>
                                  <span className={`text-xs font-bold ${scenario.isPositive ? "text-emerald-500" : "text-red-500"}`}>
                                    {scenario.lucro >= 0 ? "+" : ""}{formatCurrency(scenario.lucro)}
                                  </span>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      </>
                    )}

                    {/* Probabilidades - sempre visível quando há odds */}
                    {analysis.hasPartialData && (
                      <>
                        <Separator />
                        <div>
                          <p className="text-xs font-medium mb-2">Probabilidades Implícitas</p>
                          <div className="space-y-1">
                            {odds.map((entry, index) => {
                              const impliedProb = analysis.impliedProbs[index];
                              return (
                                <div key={index} className="flex items-center justify-between text-[10px]">
                                  <span className="text-muted-foreground">{entry.selecao}</span>
                                  <span className={impliedProb > 0 ? "text-blue-400" : "text-muted-foreground"}>
                                    {impliedProb > 0 ? `${(impliedProb * 100).toFixed(1)}%` : "—"}
                                  </span>
                                </div>
                              );
                            })}
                            {analysis.validOddsCount >= 2 && (
                              <div className="flex items-center justify-between text-[10px] pt-1 border-t mt-1">
                                <span className="text-muted-foreground font-medium">Total</span>
                                <span className={`font-medium ${
                                  analysis.impliedProbs.reduce((a, b) => a + b, 0) < 1 
                                    ? "text-emerald-400" 
                                    : "text-amber-400"
                                }`}>
                                  {(analysis.impliedProbs.reduce((a, b) => a + b, 0) * 100).toFixed(1)}%
                                </span>
                              </div>
                            )}
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

        <DialogFooter className="flex justify-between">
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
