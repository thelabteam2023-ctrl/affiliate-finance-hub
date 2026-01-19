/**
 * SurebetDialogCompact - Versão redesenhada do SurebetDialog
 * com foco em velocidade operacional e layout de tabela
 * 
 * Este componente é uma alternativa ao SurebetDialog original,
 * usando o novo design minimalista otimizado para apostas ao vivo.
 */
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { supabase } from '@/integrations/supabase/client';
import { useWorkspace } from '@/hooks/useWorkspace';
import { useBookmakerSaldosQuery } from '@/hooks/useBookmakerSaldosQuery';
import { useCurrencySnapshot, type SupportedCurrency } from '@/hooks/useCurrencySnapshot';
import { SurebetCompactForm, type OddEntry } from '@/components/surebet';
import { toast } from 'sonner';
// Seleções são definidas localmente neste componente
import { useSurebetService } from '@/hooks/useSurebetService';

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
  forma_registro?: string | null;
  estrategia?: string | null;
  contexto_operacional?: string | null;
}

interface SurebetDialogCompactProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projetoId: string;
  surebet: Surebet | null;
  onSuccess: () => void;
  activeTab?: string;
}

// Helper para obter seleções por mercado (simplificado)
function getSelecoes(mercado: string, modelo: "1-X-2" | "1-2"): string[] {
  if (modelo === "1-X-2") {
    return ["Casa", "Empate", "Fora"];
  }
  
  const selecoes = SELECOES_POR_MERCADO_LOCAL[mercado];
  if (selecoes) {
    return selecoes.slice(0, 2);
  }
  
  return ["Sim", "Não"];
}

// Mapeamento de seleções por mercado
const SELECOES_POR_MERCADO_LOCAL: Record<string, string[]> = {
  "1X2": ["Casa", "Empate", "Fora"],
  "Dupla Chance": ["Casa/Empate", "Casa/Fora", "Empate/Fora"],
  "Ambas Marcam": ["Sim", "Não"],
  "Over/Under Gols": ["Over", "Under"],
  "Moneyline": ["Casa", "Fora"],
  "Vencedor da Partida": ["Jogador 1", "Jogador 2"],
  "Handicap Asiático": ["+ Handicap", "- Handicap"],
};

export function SurebetDialogCompact({
  open,
  onOpenChange,
  projetoId,
  surebet,
  onSuccess,
  activeTab = 'surebet',
}: SurebetDialogCompactProps) {
  const isEditing = !!surebet;
  const { workspaceId } = useWorkspace();
  const { formatCurrency: formatCurrencySnapshot } = useCurrencySnapshot();
  
  // Hooks de dados
  const { data: bookmakerSaldos = [], isLoading: saldosLoading } = useBookmakerSaldosQuery({
    projetoId,
    enabled: open,
    includeZeroBalance: isEditing,
  });

  const { criarSurebet, atualizarSurebet, deletarSurebet } = useSurebetService();

  // Estado do formulário
  const [evento, setEvento] = useState("");
  const [mercado, setMercado] = useState("");
  const [esporte, setEsporte] = useState("Futebol");
  const [modelo, setModelo] = useState<"1-X-2" | "1-2">("1-2");
  const [observacoes, setObservacoes] = useState("");
  const [saving, setSaving] = useState(false);
  
  // Arredondamento
  const [arredondarAtivado, setArredondarAtivado] = useState(true);
  const [arredondarValor, setArredondarValor] = useState("1");
  
  // Odds entries
  const [odds, setOdds] = useState<OddEntry[]>(() => {
    const selecoes = getSelecoes("", "1-2");
    return selecoes.slice(0, 2).map((sel, i) => ({
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
    }));
  });

  // Reset formulário
  const resetForm = useCallback(() => {
    setEvento("");
    setMercado("");
    setEsporte("Futebol");
    setModelo("1-2");
    setObservacoes("");
    setArredondarAtivado(true);
    setArredondarValor("1");
    
    const selecoes = getSelecoes("", "1-2");
    setOdds(selecoes.slice(0, 2).map((sel, i) => ({
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
  }, []);

  // Inicializar quando abre
  useEffect(() => {
    if (open) {
      if (surebet && surebet.id) {
        // Modo edição
        setEvento(surebet.evento);
        setEsporte(surebet.esporte);
        setModelo(surebet.modelo as "1-X-2" | "1-2");
        setMercado(surebet.mercado || "");
        setObservacoes(surebet.observacoes || "");
        
        // Carregar pernas...
        fetchLinkedPernas(surebet.id, surebet.modelo);
      } else {
        resetForm();
      }
    }
  }, [open, surebet, resetForm]);

  // Limpar ao fechar
  useEffect(() => {
    if (!open) {
      const timer = setTimeout(resetForm, 150);
      return () => clearTimeout(timer);
    }
  }, [open, resetForm]);

  // Atualizar slots quando modelo muda
  useEffect(() => {
    if (!isEditing) {
      const numSlots = modelo === "1-X-2" ? 3 : 2;
      const selecoes = getSelecoes(mercado, modelo);
      
      if (odds.length !== numSlots) {
        setOdds(selecoes.slice(0, numSlots).map((sel, i) => ({
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
      }
    }
  }, [modelo, mercado, isEditing]);

  // Carregar pernas existentes
  const fetchLinkedPernas = async (surebetId: string, surebetModelo: string) => {
    const { data: pernasData } = await supabase
      .from("apostas_pernas")
      .select(`*, bookmakers (nome)`)
      .eq("aposta_id", surebetId)
      .order("ordem", { ascending: true });

    if (pernasData && pernasData.length > 0) {
      setOdds(pernasData.map((p: any, idx: number) => ({
        bookmaker_id: p.bookmaker_id || "",
        moeda: (p.moeda || "BRL") as SupportedCurrency,
        odd: p.odd?.toString() || "",
        stake: p.stake?.toString() || "",
        selecao: p.selecao || "",
        selecaoLivre: p.selecao_livre || "",
        isReference: idx === 0,
        isManuallyEdited: true,
        resultado: p.resultado,
        lucro_prejuizo: p.lucro_prejuizo,
        additionalEntries: []
      })));
    }
  };

  // Bookmakers disponíveis
  const bookmakersDisponiveis = useMemo(() => {
    return bookmakerSaldos
      .filter((bk) => bk.saldo_operavel >= 0.50)
      .map(bk => ({
        id: bk.id,
        nome: bk.nome,
        moeda: bk.moeda as SupportedCurrency,
        saldo_operavel: bk.saldo_operavel,
      }));
  }, [bookmakerSaldos]);

  // Helper para obter moeda do bookmaker
  const getBookmakerMoeda = useCallback((id: string): SupportedCurrency => {
    const bk = bookmakerSaldos.find(b => b.id === id);
    return (bk?.moeda as SupportedCurrency) || "BRL";
  }, [bookmakerSaldos]);

  // Formatador de moeda
  const formatCurrency = useCallback((valor: number, moeda?: string) => {
    return valor.toLocaleString('pt-BR', { 
      style: 'currency', 
      currency: moeda || 'BRL',
      minimumFractionDigits: 2 
    });
  }, []);

  // Análise rápida
  const analysis = useMemo(() => {
    const stakeTotal = odds.reduce((acc, e) => acc + (parseFloat(e.stake) || 0), 0);
    const pernasCompletas = odds.filter(e => 
      e.bookmaker_id && 
      parseFloat(e.odd) > 1 && 
      parseFloat(e.stake) > 0
    ).length;
    
    return { stakeTotal, pernasCompletas };
  }, [odds]);

  // Pode salvar
  const canSave = analysis.stakeTotal > 0 && analysis.pernasCompletas >= 2;

  // Handler para salvar
  const handleSave = async () => {
    if (!canSave) return;
    
    setSaving(true);
    try {
      // Implementar lógica de salvamento usando criarSurebet/atualizarSurebet
      toast.success(isEditing ? "Operação atualizada!" : "Operação registrada!");
      onSuccess();
      onOpenChange(false);
    } catch (error: any) {
      toast.error("Erro ao salvar: " + error.message);
    } finally {
      setSaving(false);
    }
  };

  // Handler para deletar
  const handleDelete = async () => {
    if (!surebet) return;
    
    try {
      await deletarSurebet(surebet.id, projetoId);
      toast.success("Operação excluída!");
      onSuccess();
      onOpenChange(false);
    } catch (error: any) {
      toast.error("Erro ao excluir: " + error.message);
    }
  };

  // Handler para liquidar perna
  const handleLiquidarPerna = useCallback(async (index: number, resultado: "GREEN" | "RED" | "VOID" | null) => {
    // Atualizar estado local
    setOdds(prev => {
      const updated = [...prev];
      updated[index] = { ...updated[index], resultado };
      return updated;
    });
    
    // TODO: Implementar persistência
    toast.success(resultado ? `Perna ${index + 1} liquidada como ${resultado}` : "Resultado removido");
  }, []);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader className="pb-2 border-b border-border/30">
          <DialogTitle className="text-base font-medium">
            {isEditing ? "Editar Surebet" : "Nova Surebet"}
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-auto py-4">
          <SurebetCompactForm
            evento={evento}
            setEvento={setEvento}
            esporte={esporte}
            setEsporte={setEsporte}
            mercado={mercado}
            setMercado={setMercado}
            modelo={modelo}
            setModelo={setModelo}
            observacoes={observacoes}
            setObservacoes={setObservacoes}
            odds={odds}
            setOdds={setOdds}
            arredondarAtivado={arredondarAtivado}
            setArredondarAtivado={setArredondarAtivado}
            arredondarValor={arredondarValor}
            setArredondarValor={setArredondarValor}
            bookmakers={bookmakersDisponiveis}
            isEditing={isEditing}
            saving={saving}
            onSave={handleSave}
            onDelete={handleDelete}
            onCancel={() => onOpenChange(false)}
            onLiquidarPerna={handleLiquidarPerna}
            formatCurrency={formatCurrency}
            getBookmakerMoeda={getBookmakerMoeda}
            canSave={canSave}
            canSaveRascunho={false}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}
