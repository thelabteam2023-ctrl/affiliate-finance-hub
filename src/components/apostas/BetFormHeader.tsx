/**
 * BetFormHeader - Header unificado para formulários de apostas
 * 
 * Componente padronizado que exibe:
 * - Título do formulário (Aposta Simples, Aposta Múltipla, Arbitragem)
 * - Seletores de Estratégia e Contexto
 * - Badge de Fonte de Saldo (financial truth)
 * - Botão de Importar (opcional)
 * 
 * Baseado no layout do formulário de Arbitragem como referência.
 */

import React, { RefObject } from "react";
import { Calculator, Layers, FileStack, Camera, Loader2, X, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
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
  FONTE_SALDO_LABELS,
  type ApostaEstrategia,
  type ContextoOperacional,
  type FonteSaldo,
} from "@/lib/apostaConstants";

export type BetFormType = "simples" | "multipla" | "arbitragem";

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
  
  /** Conteúdo extra no header (ex: radio Dupla/Tripla) */
  extraHeaderContent?: React.ReactNode;
  
  /** Fonte de Saldo - verdade financeira */
  fonteSaldo?: FonteSaldo | null;
  
  /** Botão de fechar (para modais embedded) */
  showCloseButton?: boolean;
  onClose?: () => void;
  embedded?: boolean;
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
  extraHeaderContent,
  fonteSaldo,
  showCloseButton = false,
  onClose,
  embedded = false,
}: BetFormHeaderProps) {
  const config = FormTypeConfig[formType];
  
  // Configuração visual do badge de fonte de saldo
  const fonteSaldoConfig: Record<FonteSaldo, { bg: string; text: string; icon: string }> = {
    REAL: { bg: "bg-emerald-500/10", text: "text-emerald-600", icon: "💵" },
    FREEBET: { bg: "bg-amber-500/10", text: "text-amber-600", icon: "🎁" },
    BONUS: { bg: "bg-violet-500/10", text: "text-violet-600", icon: "🎰" },
  };
  const Icon = config.icon;
  
  const isEstrategiaFixed = !isEditing && isAbaEstrategiaFixa(activeTab);
  const displayEstrategia = lockedEstrategia || estrategia;
  
  const title = isEditing ? config.editTitle : config.title;

  return (
    <div className="border-b border-border/50 bg-muted/20">
      {/* Linha única: Título + Estratégia + Importar/Fechar */}
      <div className="flex items-center justify-between px-4 py-2 gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <Icon className={cn("h-5 w-5 shrink-0", config.iconColor)} />
          <h2 className="font-semibold text-sm whitespace-nowrap">{title}</h2>
          
          {/* Estratégia inline */}
          {isEstrategiaFixed && lockedEstrategia ? (
            <Badge 
              variant="secondary" 
              className="text-[10px] font-medium bg-primary/10 text-primary border-primary/20 shrink-0"
            >
              {ESTRATEGIA_LABELS[lockedEstrategia]}
            </Badge>
          ) : (
            <Select 
              value={displayEstrategia || ""} 
              onValueChange={(v) => onEstrategiaChange(v as ApostaEstrategia)}
              disabled={isEstrategiaFixed}
            >
              <SelectTrigger className={cn(
                "h-7 text-xs w-[200px] shrink-0", 
                !displayEstrategia && "border-red-500/50",
                isEstrategiaFixed && "opacity-70 cursor-not-allowed"
              )}>
                <SelectValue placeholder="Estratégia *" />
              </SelectTrigger>
              <SelectContent>
                {ESTRATEGIAS_LIST.map(e => (
                  <SelectItem key={e.value} value={e.value}>{e.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          
          {extraBadge}
          
          {/* Conteúdo extra inline (ex: radio Dupla/Tripla com divisor) */}
          {extraHeaderContent && (
            <>
              <div className="h-4 w-px bg-border/20 shrink-0 mx-1" />
              {extraHeaderContent}
            </>
          )}
          
          {/* Badge de Fonte de Saldo */}
          {fonteSaldo && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Badge 
                    variant="outline" 
                    className={cn(
                      "text-[10px] font-medium gap-1 border-0 shrink-0",
                      fonteSaldoConfig[fonteSaldo].bg,
                      fonteSaldoConfig[fonteSaldo].text
                    )}
                  >
                    <span>{fonteSaldoConfig[fonteSaldo].icon}</span>
                    {FONTE_SALDO_LABELS[fonteSaldo]}
                  </Badge>
                </TooltipTrigger>
                <TooltipContent side="bottom">
                  <p className="text-xs">Fonte do capital utilizado nesta aposta</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
        </div>
        
        <div className="flex items-center gap-2 shrink-0">
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
                      className="gap-1.5 text-xs text-muted-foreground hover:text-foreground h-7 px-2"
                    >
                      {isPrintProcessing ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Camera className="h-3.5 w-3.5" />
                      )}
                      {isPrintProcessing 
                        ? (printProcessingPhase === "backup" ? "Alt..." : "...") 
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
            <Button variant="ghost" size="sm" onClick={onClose} className="h-7 w-7 p-0">
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
