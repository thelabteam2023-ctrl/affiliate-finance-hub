/**
 * SurebetCompactForm - Formulário de Surebet redesenhado com foco em velocidade operacional
 * 
 * Design Philosophy:
 * - Interface clean, compacta, horizontal
 * - Formato de tabela, não cards
 * - Desktop first, mas responsivo
 * - Pensado para apostas ao vivo
 */
import React, { useState, useCallback, useMemo, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Save, Trash2, FileText, ChevronDown, ChevronUp } from 'lucide-react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { SurebetCompactHeader } from './SurebetCompactHeader';
import { SurebetExecutionTable } from './SurebetExecutionTable';
import { SurebetProfitDistribution } from './SurebetProfitDistribution';
import type { SupportedCurrency } from '@/hooks/useCurrencySnapshot';
import { cn } from '@/lib/utils';

// Types
export interface OddEntry {
  bookmaker_id: string;
  moeda: SupportedCurrency;
  odd: string;
  stake: string;
  selecao: string;
  selecaoLivre: string;
  isReference: boolean;
  isManuallyEdited: boolean;
  stakeOrigem?: "print" | "referencia" | "manual";
  resultado?: string | null;
  lucro_prejuizo?: number | null;
  gerouFreebet?: boolean;
  valorFreebetGerada?: string;
  freebetStatus?: "PENDENTE" | "LIBERADA" | "NAO_LIBERADA" | null;
  index?: number;
  additionalEntries?: any[];
}

interface BookmakerOption {
  id: string;
  nome: string;
  moeda: SupportedCurrency;
  saldo_operavel: number;
}

interface SurebetCompactFormProps {
  // Estado do formulário
  evento: string;
  setEvento: (value: string) => void;
  esporte: string;
  setEsporte: (value: string) => void;
  mercado: string;
  setMercado: (value: string) => void;
  modelo: "1-X-2" | "1-2";
  setModelo: (value: "1-X-2" | "1-2") => void;
  observacoes: string;
  setObservacoes: (value: string) => void;
  odds: OddEntry[];
  setOdds: React.Dispatch<React.SetStateAction<OddEntry[]>>;
  
  // Arredondamento
  arredondarAtivado: boolean;
  setArredondarAtivado: (value: boolean) => void;
  arredondarValor: string;
  setArredondarValor: (value: string) => void;
  
  // Dados
  bookmakers: BookmakerOption[];
  isEditing: boolean;
  saving: boolean;
  
  // Callbacks
  onSave: () => void;
  onSaveRascunho?: () => void;
  onDelete?: () => void;
  onCancel: () => void;
  onLiquidarPerna?: (index: number, resultado: "GREEN" | "RED" | "VOID" | null) => void;
  
  // Helpers
  formatCurrency: (valor: number, moeda?: string) => string;
  getBookmakerMoeda: (id: string) => SupportedCurrency;
  
  // Flags
  canSave: boolean;
  canSaveRascunho?: boolean;
}

export function SurebetCompactForm({
  evento,
  setEvento,
  esporte,
  setEsporte,
  mercado,
  setMercado,
  modelo,
  setModelo,
  observacoes,
  setObservacoes,
  odds,
  setOdds,
  arredondarAtivado,
  setArredondarAtivado,
  arredondarValor,
  setArredondarValor,
  bookmakers,
  isEditing,
  saving,
  onSave,
  onSaveRascunho,
  onDelete,
  onCancel,
  onLiquidarPerna,
  formatCurrency,
  getBookmakerMoeda,
  canSave,
  canSaveRascunho = false,
}: SurebetCompactFormProps) {
  
  // Estado para distribuição de lucro
  const [distributionMode, setDistributionMode] = useState<'auto' | 'directed'>('auto');
  const [targetLegIndex, setTargetLegIndex] = useState<number | null>(null);
  
  // Estado para seções colapsáveis
  const [showObservacoes, setShowObservacoes] = useState(false);
  const [showDistribution, setShowDistribution] = useState(false);

  // Handler para definir perna de referência
  const setReferenceIndex = useCallback((index: number) => {
    setOdds(prev => prev.map((entry, i) => ({
      ...entry,
      isReference: i === index
    })));
  }, [setOdds]);

  // Calcular análise rápida
  const quickAnalysis = useMemo(() => {
    const stakeTotal = odds.reduce((acc, e) => acc + (parseFloat(e.stake) || 0), 0);
    const pernasCompletas = odds.filter(e => 
      e.bookmaker_id && 
      parseFloat(e.odd) > 1 && 
      parseFloat(e.stake) > 0
    ).length;
    
    return { stakeTotal, pernasCompletas };
  }, [odds]);

  return (
    <div className="flex flex-col h-full">
      {/* Header compacto */}
      <div className="pb-4 border-b border-border/30">
        <SurebetCompactHeader
          esporte={esporte}
          setEsporte={setEsporte}
          evento={evento}
          setEvento={setEvento}
          mercado={mercado}
          setMercado={setMercado}
          modelo={modelo}
          setModelo={setModelo}
          isEditing={isEditing}
        />
      </div>

      {/* Área principal - Tabela de execução */}
      <div className="flex-1 py-4 overflow-auto">
        <SurebetExecutionTable
          odds={odds}
          setOdds={setOdds}
          modelo={modelo}
          mercado={mercado}
          bookmakers={bookmakers}
          isEditing={isEditing}
          arredondarAtivado={arredondarAtivado}
          setArredondarAtivado={setArredondarAtivado}
          arredondarValor={arredondarValor}
          setArredondarValor={setArredondarValor}
          onLiquidarPerna={onLiquidarPerna}
          formatCurrency={formatCurrency}
          getBookmakerMoeda={getBookmakerMoeda}
          setReferenceIndex={setReferenceIndex}
        />

        {/* Distribuição de lucro (colapsável) */}
        {!isEditing && (
          <Collapsible open={showDistribution} onOpenChange={setShowDistribution}>
            <CollapsibleTrigger asChild>
              <button className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground mt-4 transition-colors">
                {showDistribution ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                Distribuição de lucro
              </button>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <SurebetProfitDistribution
                mode={distributionMode}
                setMode={setDistributionMode}
                targetLegIndex={targetLegIndex}
                setTargetLegIndex={setTargetLegIndex}
                odds={odds}
                bookmakers={bookmakers}
              />
            </CollapsibleContent>
          </Collapsible>
        )}

        {/* Observações (colapsável) */}
        <Collapsible open={showObservacoes} onOpenChange={setShowObservacoes}>
          <CollapsibleTrigger asChild>
            <button className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground mt-4 transition-colors">
              {showObservacoes ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
              Observações
            </button>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <Textarea
              value={observacoes}
              onChange={(e) => setObservacoes(e.target.value)}
              placeholder="Notas adicionais..."
              className="mt-2 min-h-[60px] text-xs resize-none border-muted bg-muted/20"
            />
          </CollapsibleContent>
        </Collapsible>
      </div>

      {/* Footer com ações */}
      <div className="pt-4 border-t border-border/30 flex items-center justify-between gap-3">
        <div>
          {isEditing && onDelete && (
            <Button 
              variant="destructive" 
              size="sm"
              onClick={onDelete}
              className="h-8 text-xs"
            >
              <Trash2 className="h-3.5 w-3.5 mr-1" />
              Excluir
            </Button>
          )}
        </div>
        
        <div className="flex items-center gap-2">
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={onCancel}
            className="h-8 text-xs"
          >
            Cancelar
          </Button>
          
          {canSaveRascunho && onSaveRascunho && (
            <Button
              variant="secondary"
              size="sm"
              onClick={onSaveRascunho}
              disabled={saving}
              className="h-8 text-xs"
            >
              <FileText className="h-3.5 w-3.5 mr-1" />
              Rascunho
            </Button>
          )}
          
          <Button
            size="sm"
            onClick={onSave}
            disabled={saving || !canSave}
            className="h-8 text-xs"
          >
            <Save className="h-3.5 w-3.5 mr-1" />
            {isEditing ? "Salvar" : "Registrar"}
          </Button>
        </div>
      </div>
    </div>
  );
}
