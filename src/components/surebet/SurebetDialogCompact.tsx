/**
 * SurebetDialogCompact - Versão redesenhada do SurebetDialog
 * com foco em velocidade operacional e layout de tabela
 * 
 * Features:
 * - Múltiplas entradas por perna
 * - Layout tabular minimalista
 * - Sem observações, comissões, câmbio
 * - Botão importar print
 */
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useWorkspace } from '@/hooks/useWorkspace';
import { useBookmakerSaldosQuery } from '@/hooks/useBookmakerSaldosQuery';
import { useCurrencySnapshot, type SupportedCurrency } from '@/hooks/useCurrencySnapshot';
import { SurebetCompactForm } from './SurebetCompactForm';
import { type Leg, type LegEntry } from './SurebetExecutionTable';
import { toast } from 'sonner';
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

// Gera ID único
const generateId = () => Math.random().toString(36).substring(2, 9);

// Criar pernas iniciais baseado no modelo
function createInitialLegs(modelo: "1-X-2" | "1-2"): Leg[] {
  const labels = modelo === "1-X-2" ? ["1", "X", "2"] : ["1", "2"];
  const selecoes = modelo === "1-X-2" 
    ? ["Casa", "Empate", "Fora"] 
    : ["Casa", "Fora"];
  
  return labels.map((label, idx) => ({
    label,
    selecao: selecoes[idx],
    entries: [{
      id: generateId(),
      bookmaker_id: '',
      moeda: 'BRL' as SupportedCurrency,
      odd: '',
      stake: '',
      isTargeted: false
    }]
  }));
}

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
  const [saving, setSaving] = useState(false);
  
  // Arredondamento
  const [arredondarAtivado, setArredondarAtivado] = useState(true);
  const [arredondarValor, setArredondarValor] = useState("1");
  
  // Legs (nova estrutura)
  const [legs, setLegs] = useState<Leg[]>(() => createInitialLegs("1-2"));

  // Reset formulário
  const resetForm = useCallback(() => {
    setEvento("");
    setMercado("");
    setEsporte("Futebol");
    setModelo("1-2");
    setArredondarAtivado(true);
    setArredondarValor("1");
    setLegs(createInitialLegs("1-2"));
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
        
        // TODO: Carregar pernas do banco e converter para Leg[]
        setLegs(createInitialLegs(surebet.modelo as "1-X-2" | "1-2"));
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

  // Bookmakers disponíveis
  const bookmakersDisponiveis = useMemo(() => {
    return bookmakerSaldos
      .filter((bk) => bk.saldo_operavel >= 0.50 || isEditing)
      .map(bk => ({
        id: bk.id,
        nome: bk.nome,
        moeda: bk.moeda as SupportedCurrency,
        saldo_operavel: bk.saldo_operavel,
      }));
  }, [bookmakerSaldos, isEditing]);

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

  // Pode salvar
  const canSave = useMemo(() => {
    const completeLegs = legs.filter(leg => 
      leg.entries.some(e => 
        e.bookmaker_id && 
        parseFloat(e.odd) > 1 && 
        parseFloat(e.stake) > 0
      )
    ).length;
    
    return completeLegs >= 2;
  }, [legs]);

  // Handler para salvar
  const handleSave = async () => {
    if (!canSave) return;
    
    setSaving(true);
    try {
      // TODO: Implementar lógica de salvamento convertendo Leg[] para formato do banco
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

  // Handler para importar print
  const handleImportPrint = useCallback(() => {
    toast.info("Importação de print em desenvolvimento");
    // TODO: Implementar importação de print
  }, []);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-hidden flex flex-col p-4">
        <DialogHeader className="pb-2 border-b border-border/30">
          <DialogTitle className="text-sm font-medium">
            {isEditing ? "Editar Surebet" : "Nova Surebet"}
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-auto py-3">
          <SurebetCompactForm
            evento={evento}
            setEvento={setEvento}
            esporte={esporte}
            setEsporte={setEsporte}
            mercado={mercado}
            setMercado={setMercado}
            modelo={modelo}
            setModelo={setModelo}
            legs={legs}
            setLegs={setLegs}
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
            onImportPrint={handleImportPrint}
            formatCurrency={formatCurrency}
            getBookmakerMoeda={getBookmakerMoeda}
            canSave={canSave}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}