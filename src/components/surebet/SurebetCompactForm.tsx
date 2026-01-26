/**
 * SurebetCompactForm - Formulário minimalista para Surebet/Arbitragem
 * 
 * Design: Tabular, compacto, focado em velocidade operacional
 * - Múltiplas entradas por perna
 * - Sem cards grandes
 * - Sem observações, comissões, câmbio
 */
import React, { useState, useCallback, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Save, Trash2 } from 'lucide-react';
import { SurebetCompactHeader } from './SurebetCompactHeader';
import { SurebetExecutionTable, type Leg, type LegEntry } from './SurebetExecutionTable';
import type { SupportedCurrency } from '@/hooks/useCurrencySnapshot';

// Gera ID único
const generateId = () => Math.random().toString(36).substring(2, 9);

// Tipo legado para compatibilidade (pode ser removido depois)
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
  observacoes?: string;
  setObservacoes?: (value: string) => void;
  
  // Pode usar odds (legado) ou legs (novo)
  odds?: OddEntry[];
  setOdds?: React.Dispatch<React.SetStateAction<OddEntry[]>>;
  legs?: Leg[];
  setLegs?: React.Dispatch<React.SetStateAction<Leg[]>>;
  
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
  onImportPrint?: () => void;
  
  // Helpers
  formatCurrency: (valor: number, moeda?: string) => string;
  getBookmakerMoeda: (id: string) => SupportedCurrency;
  
  // Flags
  canSave: boolean;
  canSaveRascunho?: boolean;
}

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

export function SurebetCompactForm({
  evento,
  setEvento,
  esporte,
  setEsporte,
  mercado,
  setMercado,
  modelo,
  setModelo,
  legs: externalLegs,
  setLegs: externalSetLegs,
  arredondarAtivado,
  setArredondarAtivado,
  arredondarValor,
  setArredondarValor,
  bookmakers,
  isEditing,
  saving,
  onSave,
  onDelete,
  onCancel,
  onImportPrint,
  formatCurrency,
  getBookmakerMoeda,
  canSave,
}: SurebetCompactFormProps) {
  
  // Estado interno para legs se não fornecido externamente
  const [internalLegs, setInternalLegs] = useState<Leg[]>(() => createInitialLegs(modelo));
  
  const legs = externalLegs || internalLegs;
  const setLegs = externalSetLegs || setInternalLegs;

  // Atualizar legs quando modelo muda
  const handleModeloChange = useCallback((newModelo: "1-X-2" | "1-2") => {
    setModelo(newModelo);
    // Recriar legs para o novo modelo
    setLegs(createInitialLegs(newModelo));
  }, [setModelo, setLegs]);

  // Calcular se pode salvar
  const computedCanSave = useMemo(() => {
    const totalEntries = legs.reduce((acc, leg) => acc + leg.entries.length, 0);
    const completeEntries = legs.reduce((acc, leg) => {
      return acc + leg.entries.filter(e => 
        e.bookmaker_id && 
        parseFloat(e.odd) > 1 && 
        parseFloat(e.stake) > 0
      ).length;
    }, 0);
    
    // Precisa de pelo menos 2 pernas completas
    const completeLegs = legs.filter(leg => 
      leg.entries.some(e => 
        e.bookmaker_id && 
        parseFloat(e.odd) > 1 && 
        parseFloat(e.stake) > 0
      )
    ).length;
    
    return completeLegs >= 2;
  }, [legs]);

  return (
    <div className="flex flex-col h-full gap-4">
      {/* Header compacto */}
      <div className="pb-3 border-b border-border/30">
        <SurebetCompactHeader
          esporte={esporte}
          setEsporte={setEsporte}
          evento={evento}
          setEvento={setEvento}
          mercado={mercado}
          setMercado={setMercado}
          modelo={modelo}
          setModelo={handleModeloChange}
          isEditing={isEditing}
        />
      </div>

      {/* Tabela de execução */}
      <div className="flex-1 overflow-auto">
        <SurebetExecutionTable
          legs={legs}
          setLegs={setLegs}
          modelo={modelo}
          bookmakers={bookmakers}
          isEditing={isEditing}
          arredondarAtivado={arredondarAtivado}
          setArredondarAtivado={setArredondarAtivado}
          arredondarValor={arredondarValor}
          setArredondarValor={setArredondarValor}
          formatCurrency={formatCurrency}
          getBookmakerMoeda={getBookmakerMoeda}
        />
      </div>

      {/* Footer com ações */}
      <div className="pt-3 border-t border-border/30 flex items-center justify-between gap-3">
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
          
          <Button
            size="sm"
            onClick={onSave}
            disabled={saving || !(canSave || computedCanSave)}
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