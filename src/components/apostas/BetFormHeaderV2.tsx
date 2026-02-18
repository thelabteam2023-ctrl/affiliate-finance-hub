/**
 * BetFormHeaderV2 - Header unificado para formulários de apostas (versão definitiva)
 * 
 * Estrutura de 2 linhas fixas:
 * - Linha 1: Título + Estratégia inline + Importar
 * - Linha 2: Esporte | Evento | Mercado | Data/Hora (grid de 4 colunas)
 * 
 * Altura fixa idêntica para Aposta Simples e Arbitragem.
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
import { DateTimePicker } from "@/components/ui/date-time-picker";

export type BetFormType = "simples" | "multipla" | "arbitragem";

// Lista de esportes padrão
const ESPORTES_BASE = [
  "Futebol", "Basquete", "Tênis", "Baseball", "Hockey",
  "Futebol Americano", "Vôlei", "MMA/UFC", "Boxe", "Golfe",
  "League of Legends", "Counter-Strike", "Dota 2", "eFootball", "Outro"
];

interface GameFields {
  esporte: string;
  evento: string;
  mercado: string;
  dataAposta: string;
  onEsporteChange: (value: string) => void;
  onEventoChange: (value: string) => void;
  onMercadoChange: (value: string) => void;
  onDataApostaChange: (value: string) => void;
  esportesList?: string[];
  fieldsNeedingReview?: {
    esporte?: boolean;
    evento?: boolean;
    mercado?: boolean;
    dataHora?: boolean;
  };
}

interface BetFormHeaderV2Props {
  formType: BetFormType;
  estrategia: ApostaEstrategia | null;
  contexto: ContextoOperacional;
  onEstrategiaChange: (value: ApostaEstrategia) => void;
  onContextoChange: (value: ContextoOperacional) => void;
  isEditing?: boolean;
  activeTab?: string;
  lockedEstrategia?: ApostaEstrategia | null;
  gameFields: GameFields;
  showImport?: boolean;
  onImportClick?: () => void;
  isPrintProcessing?: boolean;
  printProcessingPhase?: string;
  fileInputRef?: RefObject<HTMLInputElement>;
  onFileSelect?: (e: React.ChangeEvent<HTMLInputElement>) => void;
  extraBadge?: React.ReactNode;
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

export function BetFormHeaderV2({
  formType,
  estrategia,
  contexto,
  onEstrategiaChange,
  onContextoChange,
  isEditing = false,
  activeTab = "apostas",
  lockedEstrategia,
  gameFields,
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
}: BetFormHeaderV2Props) {
  const config = FormTypeConfig[formType];
  const Icon = config.icon;
  
  const isEstrategiaFixed = !isEditing && isAbaEstrategiaFixa(activeTab);
  const displayEstrategia = lockedEstrategia || estrategia;
  
  const title = isEditing ? config.editTitle : config.title;
  
  const esportesList = gameFields.esportesList || ESPORTES_BASE;
  const review = gameFields.fieldsNeedingReview || {};

  return (
    <div className="border-b border-border/50 bg-muted/20 shrink-0">
      {/* ========== LINHA 1: Título + Estratégia inline + Importar ========== */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-border/30">
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <Icon className={cn("h-5 w-5 shrink-0", config.iconColor)} />
          <h2 className="font-semibold text-base whitespace-nowrap">{title}</h2>
          {extraBadge}
        </div>
          
        {/* Estratégia centralizada */}
        <div className="flex items-center gap-1.5 justify-center flex-1">
          <span className="text-[11px] text-muted-foreground whitespace-nowrap">
            Estratégia<span className="text-destructive ml-0.5">*</span>
          </span>
            
            {isEstrategiaFixed && lockedEstrategia ? (
              <Badge 
                variant="secondary" 
                className="text-xs font-medium bg-primary/10 text-primary border-primary/20"
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
                  "h-7 text-xs w-[160px]", 
                  !displayEstrategia && "border-destructive/50",
                  isEstrategiaFixed && "opacity-70 cursor-not-allowed"
                )}>
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent>
                  {ESTRATEGIAS_LIST.map(e => (
                    <SelectItem key={e.value} value={e.value}>{e.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
        
        <div className="flex items-center gap-2 flex-1 justify-end">
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
          
          {showCloseButton && !embedded && onClose && (
            <Button variant="ghost" size="sm" onClick={onClose} className="h-8 w-8 p-0">
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>
      
      {/* ========== LINHA 2: Esporte | Evento | Mercado | Data/Hora ========== */}
      <div className="px-4 py-2.5">
        <div className="grid grid-cols-4 gap-3">
          {/* Esporte */}
          <div className="text-center">
            <Label className={cn(
              "text-xs block mb-1",
              review.esporte ? "text-amber-500" : "text-muted-foreground"
            )}>
              Esporte {review.esporte && <span className="text-[9px]">⚠</span>}
            </Label>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div>
                    <Select 
                      value={gameFields.esporte} 
                      onValueChange={gameFields.onEsporteChange}
                    >
                      <SelectTrigger className={cn(
                        "h-8 text-xs text-center [&>span]:text-center [&>span]:w-full",
                        review.esporte && "border-amber-500/50"
                      )}>
                        <SelectValue placeholder="Selecione" />
                      </SelectTrigger>
                      <SelectContent>
                        {esportesList.map((esp) => (
                          <SelectItem key={esp} value={esp}>{esp}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </TooltipTrigger>
                {gameFields.esporte && (
                  <TooltipContent side="bottom" className="text-xs">
                    {gameFields.esporte}
                  </TooltipContent>
                )}
              </Tooltip>
            </TooltipProvider>
          </div>
          
          {/* Evento */}
          <div className="text-center">
            <Label className={cn(
              "text-xs block mb-1",
              review.evento ? "text-amber-500" : "text-muted-foreground"
            )}>
              Evento {review.evento && <span className="text-[9px]">⚠</span>}
            </Label>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Input
                    value={gameFields.evento}
                    onChange={(e) => gameFields.onEventoChange(e.target.value.toUpperCase())}
                    placeholder="TIME 1 X TIME 2"
                    className={cn(
                      "h-8 text-xs uppercase text-center",
                      review.evento && "border-amber-500/50"
                    )}
                  />
                </TooltipTrigger>
                {gameFields.evento && (
                  <TooltipContent side="bottom" className="text-xs max-w-[300px]">
                    {gameFields.evento}
                  </TooltipContent>
                )}
              </Tooltip>
            </TooltipProvider>
          </div>
          
          {/* Mercado */}
          <div className="text-center">
            <Label className={cn(
              "text-xs block mb-1",
              review.mercado ? "text-amber-500" : "text-muted-foreground"
            )}>
              Mercado {review.mercado && <span className="text-[9px]">⚠</span>}
            </Label>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Input
                    value={gameFields.mercado}
                    onChange={(e) => gameFields.onMercadoChange(e.target.value)}
                    placeholder="Ex: Resultado Final"
                    className={cn(
                      "h-8 text-xs text-center",
                      review.mercado && "border-amber-500/50"
                    )}
                  />
                </TooltipTrigger>
                {gameFields.mercado && (
                  <TooltipContent side="bottom" className="text-xs max-w-[300px]">
                    {gameFields.mercado}
                  </TooltipContent>
                )}
              </Tooltip>
            </TooltipProvider>
          </div>
          
          {/* Data/Hora */}
          <div className={cn(
            "text-center",
            review.dataHora && "[&_button]:border-amber-500/50"
          )}>
            <Label className={cn(
              "text-xs block mb-1",
              review.dataHora ? "text-amber-500" : "text-muted-foreground"
            )}>
              Data/Hora {review.dataHora && <span className="text-[9px]">⚠</span>}
            </Label>
            <DateTimePicker
              value={gameFields.dataAposta}
              onChange={gameFields.onDataApostaChange}
              placeholder="Selecione"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
