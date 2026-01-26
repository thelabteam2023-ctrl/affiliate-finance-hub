/**
 * BetFormHeader - Header unificado para formulários de apostas
 * 
 * Componente padronizado que exibe:
 * - Título do formulário (Aposta Simples, Aposta Múltipla, Arbitragem)
 * - Seletores de Estratégia e Contexto
 * - Campos de jogo (Esporte, Evento, Mercado)
 * - Botão de Importar (opcional)
 * 
 * Baseado no layout do formulário de Arbitragem como referência.
 */

import React, { RefObject } from "react";
import { Calculator, Layers, FileStack, Camera, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import {
  ESTRATEGIAS_LIST,
  CONTEXTOS_LIST,
  ESTRATEGIA_LABELS,
  isAbaEstrategiaFixa,
  type ApostaEstrategia,
  type ContextoOperacional,
} from "@/lib/apostaConstants";

export type BetFormType = "simples" | "multipla" | "arbitragem";

// Lista de esportes disponíveis
const ESPORTES = [
  "Futebol", "Basquete", "Tênis", "Baseball", "Hockey", 
  "Futebol Americano", "Vôlei", "MMA/UFC", "Boxe", "Golfe",
  "League of Legends", "Counter-Strike", "Dota 2", "eFootball"
];

interface BetFormHeaderProps {
  /** Tipo do formulário */
  formType: BetFormType;
  /** Valores atuais */
  estrategia: ApostaEstrategia | null;
  contexto: ContextoOperacional;
  /** Callbacks */
  onEstrategiaChange: (value: ApostaEstrategia) => void;
  onContextoChange: (value: ContextoOperacional) => void;
  /** Estado de edição (desabilita alteração de estratégia/contexto quando em abas fixas) */
  isEditing?: boolean;
  /** Aba ativa (para determinar se estratégia é fixa) */
  activeTab?: string;
  /** Estratégia locked (definida pela aba) */
  lockedEstrategia?: ApostaEstrategia | null;
  
  /** Importar - Configuração */
  showImport?: boolean;
  onImportClick?: () => void;
  isPrintProcessing?: boolean;
  printProcessingPhase?: string;
  fileInputRef?: RefObject<HTMLInputElement>;
  onFileSelect?: (e: React.ChangeEvent<HTMLInputElement>) => void;
  
  /** Badge extra (ex: número de pernas para arbitragem) */
  extraBadge?: React.ReactNode;
  
  /** Botão de fechar (para modais embedded) */
  showCloseButton?: boolean;
  onClose?: () => void;
  embedded?: boolean;
  
  /** Campos de jogo (Esporte, Evento, Mercado) - Opcionais */
  esporte?: string;
  onEsporteChange?: (value: string) => void;
  evento?: string;
  onEventoChange?: (value: string) => void;
  mercado?: string;
  onMercadoChange?: (value: string) => void;
  /** Destaques de review do OCR */
  esporteNeedsReview?: boolean;
  eventoNeedsReview?: boolean;
  mercadoNeedsReview?: boolean;
  /** Lista customizada de esportes ordenados por frequência */
  esportesList?: string[];
}

const FormTypeConfig: Record<BetFormType, { 
  title: string; 
  editTitle: string;
  icon: React.ElementType; 
  iconColor: string;
}> = {
  simples: {
    title: "Aposta Simples",
    editTitle: "Editar Aposta",
    icon: Calculator,
    iconColor: "text-primary",
  },
  multipla: {
    title: "Aposta Múltipla",
    editTitle: "Editar Aposta Múltipla",
    icon: Layers,
    iconColor: "text-violet-500",
  },
  arbitragem: {
    title: "Arbitragem",
    editTitle: "Editar Arbitragem",
    icon: FileStack,
    iconColor: "text-amber-500",
  },
};

export function BetFormHeader({
  formType,
  estrategia,
  contexto,
  onEstrategiaChange,
  onContextoChange,
  isEditing = false,
  activeTab = "apostas",
  lockedEstrategia,
  showImport = false,
  onImportClick,
  isPrintProcessing = false,
  printProcessingPhase = "primary",
  fileInputRef,
  onFileSelect,
  extraBadge,
  showCloseButton = false,
  onClose,
  embedded = false,
  // Campos de jogo
  esporte,
  onEsporteChange,
  evento,
  onEventoChange,
  mercado,
  onMercadoChange,
  esporteNeedsReview = false,
  eventoNeedsReview = false,
  mercadoNeedsReview = false,
  esportesList,
}: BetFormHeaderProps) {
  const config = FormTypeConfig[formType];
  const Icon = config.icon;
  
  const isEstrategiaFixed = !isEditing && isAbaEstrategiaFixa(activeTab);
  const displayEstrategia = lockedEstrategia || estrategia;
  
  const title = isEditing ? config.editTitle : config.title;
  
  // Lista de esportes a usar (customizada ou padrão)
  const esportesDisponiveis = esportesList || ESPORTES;
  
  // Verifica se os campos de jogo foram fornecidos
  const hasGameFields = onEsporteChange !== undefined;

  return (
    <div className="border-b border-border/50 bg-muted/20">
      {/* Linha 1: Título + Fechar/Importar */}
      <div className="flex items-center justify-between px-4 py-3">
        <div className="flex items-center gap-3">
          <Icon className={cn("h-5 w-5", config.iconColor)} />
          <h2 className="font-semibold text-base">{title}</h2>
          {extraBadge}
        </div>
        
        <div className="flex items-center gap-2">
          {/* Botão Importar */}
          {showImport && !isEditing && (
            <>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={onImportClick}
                      disabled={isPrintProcessing}
                      className="gap-1.5 text-xs text-muted-foreground hover:text-foreground"
                    >
                      {isPrintProcessing ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Camera className="h-3.5 w-3.5" />
                      )}
                      {isPrintProcessing 
                        ? (printProcessingPhase === "backup" ? "Alternativo..." : "Analisando...") 
                        : "Importar"}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" align="end" className="max-w-[200px]">
                    <p className="text-xs">Cole com Ctrl+V ou clique para selecionar imagem do bilhete</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
              
              {fileInputRef && onFileSelect && (
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/*"
                  className="hidden"
                  onChange={onFileSelect}
                />
              )}
            </>
          )}
          
          {/* Botão Fechar */}
          {showCloseButton && !embedded && onClose && (
            <Button variant="ghost" size="sm" onClick={onClose} className="h-8 w-8 p-0">
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>
      
      {/* Linha 2: Estratégia e Contexto */}
      <div className="px-4 pb-3">
        <div className="grid grid-cols-2 gap-3">
          {/* Estratégia */}
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">
              Estratégia <span className="text-red-400">*</span>
              {isEstrategiaFixed && (
                <span className="ml-1 text-[10px] text-primary">(fixo)</span>
              )}
            </Label>
            
            {isEstrategiaFixed && lockedEstrategia ? (
              <div className="h-8 flex items-center">
                <Badge 
                  variant="secondary" 
                  className="text-xs font-medium bg-primary/10 text-primary border-primary/20"
                >
                  {ESTRATEGIA_LABELS[lockedEstrategia]}
                </Badge>
              </div>
            ) : (
              <Select 
                value={displayEstrategia || ""} 
                onValueChange={(v) => onEstrategiaChange(v as ApostaEstrategia)}
                disabled={isEstrategiaFixed}
              >
                <SelectTrigger className={cn(
                  "h-8 text-xs", 
                  !displayEstrategia && "border-red-500/50",
                  isEstrategiaFixed && "opacity-70 cursor-not-allowed"
                )}>
                  <SelectValue placeholder="Selecione uma estratégia" />
                </SelectTrigger>
                <SelectContent>
                  {ESTRATEGIAS_LIST.map(e => (
                    <SelectItem key={e.value} value={e.value}>{e.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            
            {!displayEstrategia && !isEstrategiaFixed && (
              <p className="text-[10px] text-red-400 mt-0.5">Obrigatório</p>
            )}
          </div>
          
          {/* Contexto */}
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">
              Contexto
              {isEstrategiaFixed && (
                <span className="ml-1 text-[10px] text-primary">(fixo)</span>
              )}
            </Label>
            <Select 
              value={contexto} 
              onValueChange={(v) => onContextoChange(v as ContextoOperacional)}
              disabled={isEstrategiaFixed}
            >
              <SelectTrigger className={cn(
                "h-8 text-xs",
                isEstrategiaFixed && "opacity-70 cursor-not-allowed"
              )}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CONTEXTOS_LIST.map(c => (
                  <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>
      
      {/* Linha 3: Esporte, Evento, Mercado - Se fornecidos */}
      {hasGameFields && (
        <div className="px-4 pb-3">
          <div className="grid grid-cols-3 gap-3">
            {/* Esporte */}
            <div className="space-y-1">
              <Label className={cn(
                "text-xs",
                esporteNeedsReview ? "text-amber-500" : "text-muted-foreground"
              )}>
                Esporte {esporteNeedsReview && <span className="text-[9px]">⚠</span>}
              </Label>
              <Select value={esporte || "Futebol"} onValueChange={onEsporteChange}>
                <SelectTrigger className={cn(
                  "h-8 text-xs",
                  esporteNeedsReview && "border-amber-500/50"
                )}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {esportesDisponiveis.map(e => (
                    <SelectItem key={e} value={e}>{e}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            {/* Evento */}
            <div className="space-y-1">
              <Label className={cn(
                "text-xs",
                eventoNeedsReview ? "text-amber-500" : "text-muted-foreground"
              )}>
                Evento {eventoNeedsReview && <span className="text-[9px]">⚠</span>}
              </Label>
              <Input
                value={evento || ""}
                onChange={(e) => onEventoChange?.(e.target.value.toUpperCase())}
                placeholder="TIME 1 X TIME 2"
                className={cn(
                  "h-8 text-xs uppercase",
                  eventoNeedsReview && "border-amber-500/50"
                )}
              />
            </div>
            
            {/* Mercado */}
            <div className="space-y-1">
              <Label className={cn(
                "text-xs",
                mercadoNeedsReview ? "text-amber-500" : "text-muted-foreground"
              )}>
                Mercado {mercadoNeedsReview && <span className="text-[9px]">⚠</span>}
              </Label>
              <Input
                value={mercado || ""}
                onChange={(e) => onMercadoChange?.(e.target.value)}
                placeholder="Mercado"
                className={cn(
                  "h-8 text-xs",
                  mercadoNeedsReview && "border-amber-500/50"
                )}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
