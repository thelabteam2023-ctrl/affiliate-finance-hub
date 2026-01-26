/**
 * BetFormHeaderV2 - Header unificado para formulários de apostas (versão definitiva)
 * 
 * Estrutura de 3 linhas fixas:
 * - Linha 1: Título + Importar
 * - Linha 2: Estratégia + Contexto (centralizados)
 * - Linha 3: Esporte | Evento | Mercado | Data/Hora (grid de 4 colunas)
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
  /** Lista ordenada de esportes (opcional, usa padrão se não fornecida) */
  esportesList?: string[];
  /** Campos que precisam de revisão (OCR) */
  fieldsNeedingReview?: {
    esporte?: boolean;
    evento?: boolean;
    mercado?: boolean;
    dataHora?: boolean;
  };
}

interface BetFormHeaderV2Props {
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
  
  /** Campos do jogo (Linha 3) */
  gameFields: GameFields;
  
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
      {/* ========== LINHA 1: Título + Importar ========== */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-border/30">
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
      
      {/* ========== LINHA 2: Estratégia + Contexto ========== */}
      <div className="px-4 py-2.5 border-b border-border/30">
        <div className="grid grid-cols-2 gap-4">
          {/* Estratégia */}
          <div className="text-center">
            <Label className="text-xs text-muted-foreground block mb-1">
              Estratégia <span className="text-destructive">*</span>
              {isEstrategiaFixed && (
                <span className="ml-1 text-[10px] text-primary">(fixo)</span>
              )}
            </Label>
            
            {isEstrategiaFixed && lockedEstrategia ? (
              <div className="h-8 flex items-center justify-center">
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
                  "h-8 text-xs text-center [&>span]:text-center [&>span]:w-full", 
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
          
          {/* Contexto */}
          <div className="text-center">
            <Label className="text-xs text-muted-foreground block mb-1">
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
                "h-8 text-xs text-center [&>span]:text-center [&>span]:w-full",
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
      
      {/* ========== LINHA 3: Esporte | Evento | Mercado | Data/Hora ========== */}
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
