/**
 * RegistroApostaFields - Componente de seleção EXPLÍCITA de campos de registro
 * 
 * PRINCÍPIOS (do Prompt Oficial):
 * - Forma de Registro, Estratégia e Contexto são SEMPRE independentes
 * - Estratégia é SEMPRE explícita, NUNCA inferida
 * - TODAS as combinações são VÁLIDAS
 * - A IA/sistema NUNCA deve questionar ou bloquear combinações
 */

import { useEffect } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  FORMA_REGISTRO,
  FORMAS_REGISTRO_LIST,
  APOSTA_ESTRATEGIA,
  ESTRATEGIAS_LIST,
  ESTRATEGIA_LABELS,
  CONTEXTO_OPERACIONAL,
  CONTEXTOS_LIST,
  CONTEXTO_LABELS,
  type FormaRegistro,
  type ApostaEstrategia,
  type ContextoOperacional,
} from "@/lib/apostaConstants";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { HelpCircle, Coins, Gift, Sparkles } from "lucide-react";

export interface RegistroApostaValues {
  forma_registro: FormaRegistro | null;
  estrategia: ApostaEstrategia | null;
  contexto_operacional: ContextoOperacional | null;
}

export interface RegistroApostaFieldsProps {
  values: RegistroApostaValues;
  onChange: (values: RegistroApostaValues) => void;
  
  /** Sugestões baseadas na aba/contexto atual (NÃO são impostas) */
  suggestions?: {
    forma_registro?: FormaRegistro;
    estrategia?: ApostaEstrategia;
    contexto_operacional?: ContextoOperacional;
  };
  
  /** Campos que devem ficar desabilitados (ex: estratégia fixa para Surebet) */
  disabled?: {
    forma_registro?: boolean;
    estrategia?: boolean;
    contexto_operacional?: boolean;
  };
  
  /** Modo compacto (sem labels extras) */
  compact?: boolean;
  
  /** Mostrar indicador de campo obrigatório */
  showRequired?: boolean;
}

const ContextoIcon = ({ contexto }: { contexto: ContextoOperacional | null }) => {
  if (contexto === 'FREEBET') return <Gift className="h-3.5 w-3.5 text-purple-500" />;
  if (contexto === 'BONUS') return <Sparkles className="h-3.5 w-3.5 text-amber-500" />;
  return <Coins className="h-3.5 w-3.5 text-emerald-500" />;
};

export function RegistroApostaFields({
  values,
  onChange,
  suggestions,
  disabled,
  compact = false,
  showRequired = true,
}: RegistroApostaFieldsProps) {
  // Aplicar sugestões iniciais apenas uma vez (quando valores são null)
  useEffect(() => {
    if (suggestions) {
      const newValues = { ...values };
      let changed = false;
      
      if (values.forma_registro === null && suggestions.forma_registro) {
        newValues.forma_registro = suggestions.forma_registro;
        changed = true;
      }
      if (values.estrategia === null && suggestions.estrategia) {
        newValues.estrategia = suggestions.estrategia;
        changed = true;
      }
      if (values.contexto_operacional === null && suggestions.contexto_operacional) {
        newValues.contexto_operacional = suggestions.contexto_operacional;
        changed = true;
      }
      
      if (changed) {
        onChange(newValues);
      }
    }
  }, []); // Executar apenas na montagem

  const handleChange = (field: keyof RegistroApostaValues, value: string) => {
    onChange({
      ...values,
      [field]: value,
    });
  };

  return (
    <div className={`grid gap-3 ${compact ? 'grid-cols-2' : 'grid-cols-1 md:grid-cols-2'}`}>
      {/* 
       * NOTA: Forma de Registro foi REMOVIDA da UI.
       * É apenas um metadado técnico definido automaticamente pelo tipo de formulário:
       * - ApostaDialog = SIMPLES
       * - ApostaMultiplaDialog = MULTIPLA  
       * - SurebetDialog = ARBITRAGEM
       */}

      {/* Estratégia */}
      <div className="space-y-1.5">
        <div className="flex items-center gap-1.5">
          <Label className="text-xs text-muted-foreground">
            Estratégia
            {showRequired && <span className="text-destructive">*</span>}
          </Label>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <HelpCircle className="h-3 w-3 text-muted-foreground/50 cursor-help" />
              </TooltipTrigger>
              <TooltipContent side="top" className="max-w-xs">
                <p className="text-xs">
                  Lógica operacional aplicada pelo usuário.
                  <br /><br />
                  <strong>Punter:</strong> Aposta tradicional
                  <br />
                  <strong>Surebet:</strong> Arbitragem garantida
                  <br />
                  <strong>ValueBet:</strong> Valor esperado positivo
                  <br />
                  <strong>Extração Freebet:</strong> Converter freebet
                  <br />
                  <strong>Extração Bônus:</strong> Converter bônus
                  <br />
                  <strong>Duplo Green:</strong> Múltiplos greens
                </p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
        <Select
          value={values.estrategia || ""}
          onValueChange={(v) => handleChange('estrategia', v)}
          disabled={disabled?.estrategia}
        >
          <SelectTrigger className="h-8 text-xs">
            <SelectValue placeholder="Selecione..." />
          </SelectTrigger>
          <SelectContent>
            {ESTRATEGIAS_LIST.map((item) => (
              <SelectItem key={item.value} value={item.value} className="text-xs">
                {item.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Contexto Operacional */}
      <div className="space-y-1.5">
        <div className="flex items-center gap-1.5">
          <Label className="text-xs text-muted-foreground">
            Contexto
            {showRequired && <span className="text-destructive">*</span>}
          </Label>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <HelpCircle className="h-3 w-3 text-muted-foreground/50 cursor-help" />
              </TooltipTrigger>
              <TooltipContent side="top" className="max-w-xs">
                <p className="text-xs">
                  Origem do capital utilizado na aposta.
                  <br /><br />
                  <strong>Saldo Real:</strong> Dinheiro próprio
                  <br />
                  <strong>Freebet:</strong> Aposta grátis da casa
                  <br />
                  <strong>Bônus:</strong> Crédito promocional
                </p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
        <Select
          value={values.contexto_operacional || ""}
          onValueChange={(v) => handleChange('contexto_operacional', v)}
          disabled={disabled?.contexto_operacional}
        >
          <SelectTrigger className="h-8 text-xs">
            <SelectValue placeholder="Selecione..." />
          </SelectTrigger>
          <SelectContent>
            {CONTEXTOS_LIST.map((item) => (
              <SelectItem key={item.value} value={item.value} className="text-xs">
                <div className="flex items-center gap-1.5">
                  <ContextoIcon contexto={item.value} />
                  {item.label}
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}

/**
 * Validador de campos obrigatórios
 * Retorna erros se campos estão ausentes
 */
export function validateRegistroAposta(values: RegistroApostaValues): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];
  
  // forma_registro NÃO é validada - é definida automaticamente pelo tipo de formulário
  if (!values.estrategia) {
    errors.push("Estratégia obrigatória");
  }
  if (!values.contexto_operacional) {
    errors.push("Contexto operacional obrigatório");
  }
  
  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Sugestões baseadas na aba ativa
 * IMPORTANTE: São apenas SUGESTÕES, o usuário pode alterar
 */
/**
 * Sugestões baseadas na aba ativa
 * IMPORTANTE: São apenas SUGESTÕES, o usuário pode alterar
 * 
 * REGRA: O formulário (Simples/Múltipla/Arbitragem) é apenas meio de entrada,
 * portanto SEMPRE sugerimos 'SIMPLES' como default.
 * Estratégia e Contexto são os campos conceituais.
 */
export function getSuggestionsForTab(activeTab: string): Partial<RegistroApostaValues> {
  const tabSuggestions: Record<string, Partial<RegistroApostaValues>> = {
    // Aba Freebet
    freebets: {
      forma_registro: 'SIMPLES',
      estrategia: 'EXTRACAO_FREEBET',
      contexto_operacional: 'FREEBET',
    },
    // Aba Bônus
    bonus: {
      forma_registro: 'SIMPLES',
      estrategia: 'EXTRACAO_BONUS',
      contexto_operacional: 'BONUS',
    },
    // Aba Surebet
    surebet: {
      forma_registro: 'SIMPLES',
      estrategia: 'SUREBET',
      contexto_operacional: 'NORMAL',
    },
    // Aba ValueBet
    valuebet: {
      forma_registro: 'SIMPLES',
      estrategia: 'VALUEBET',
      contexto_operacional: 'NORMAL',
    },
    // Aba Duplo Green
    duplogreen: {
      forma_registro: 'SIMPLES',
      estrategia: 'DUPLO_GREEN',
      contexto_operacional: 'NORMAL',
    },
    // Aba Matched Betting
    matched: {
      forma_registro: 'SIMPLES',
      estrategia: 'MATCHED_BETTING',
      contexto_operacional: 'NORMAL',
    },
    // Aba Apostas Livres - estratégia NÃO definida (usuário escolhe)
    apostas: {
      forma_registro: 'SIMPLES',
      estrategia: undefined,
      contexto_operacional: 'NORMAL',
    },
  };
  
  // Default para abas não mapeadas: Apostas Livres
  return tabSuggestions[activeTab] || {
    forma_registro: 'SIMPLES',
    estrategia: undefined,
    contexto_operacional: 'NORMAL',
  };
}
