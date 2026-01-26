/**
 * UnifiedBetHeader - Header padronizado para todos os formulários de apostas
 * 
 * Template baseado no Surebet com:
 * - Linha 1: Título + Estratégia + Contexto + Importar + Fechar
 * - Linha 2: Esporte + Evento + Mercado + Data/Hora
 * 
 * Altura fixa, layout denso, todos os labels e valores centralizados.
 */

import React, { RefObject } from "react";
import { Calculator, Layers, FileStack, Camera, Loader2, X, CalendarIcon } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
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
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
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

// Lista de esportes padrão
const ESPORTES_DEFAULT = [
  "Futebol", "Basquete", "Tênis", "Baseball", "Hockey", 
  "Futebol Americano", "Vôlei", "MMA/UFC", "Boxe", "Golfe",
  "League of Legends", "Counter-Strike", "Dota 2", "eFootball", "Outro"
];

interface UnifiedBetHeaderProps {
  /** Tipo do formulário */
  formType: BetFormType;
  
  /** Valores de Estratégia/Contexto */
  estrategia: ApostaEstrategia | null;
  contexto: ContextoOperacional;
  onEstrategiaChange: (value: ApostaEstrategia) => void;
  onContextoChange: (value: ContextoOperacional) => void;
  
  /** Valores do Jogo */
  esporte: string;
  evento: string;
  mercado: string;
  dataHora: string; // ISO format: YYYY-MM-DDTHH:mm
  onEsporteChange: (value: string) => void;
  onEventoChange: (value: string) => void;
  onMercadoChange: (value: string) => void;
  onDataHoraChange: (value: string) => void;
  
  /** Lista customizada de esportes (opcional) */
  esportesList?: string[];
  
  /** Estado de edição */
  isEditing?: boolean;
  activeTab?: string;
  lockedEstrategia?: ApostaEstrategia | null;
  
  /** Importar */
  showImport?: boolean;
  onImportClick?: () => void;
  isPrintProcessing?: boolean;
  printProcessingPhase?: string;
  fileInputRef?: RefObject<HTMLInputElement>;
  onFileSelect?: (e: React.ChangeEvent<HTMLInputElement>) => void;
  
  /** Warnings de campos (OCR) */
  fieldWarnings?: {
    esporte?: boolean;
    evento?: boolean;
    mercado?: boolean;
    dataHora?: boolean;
  };
  
  /** Botão de fechar */
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

// Parse ISO datetime string as local date
const parseLocalDateTime = (dateTimeString: string): { date: Date | undefined; hour: string; minute: string } => {
  if (!dateTimeString) return { date: undefined, hour: "12", minute: "00" };
  
  const [datePart, timePart] = dateTimeString.split("T");
  const [year, month, day] = datePart.split("-").map(Number);
  const [hour, minute] = (timePart || "12:00").split(":").map(s => s.padStart(2, "0"));
  
  if (!year || !month || !day) return { date: undefined, hour: hour || "12", minute: minute || "00" };
  
  return {
    date: new Date(year, month - 1, day),
    hour: hour || "12",
    minute: minute || "00"
  };
};

export function UnifiedBetHeader({
  formType,
  estrategia,
  contexto,
  onEstrategiaChange,
  onContextoChange,
  esporte,
  evento,
  mercado,
  dataHora,
  onEsporteChange,
  onEventoChange,
  onMercadoChange,
  onDataHoraChange,
  esportesList = ESPORTES_DEFAULT,
  isEditing = false,
  activeTab = "apostas",
  lockedEstrategia,
  showImport = false,
  onImportClick,
  isPrintProcessing = false,
  printProcessingPhase = "primary",
  fileInputRef,
  onFileSelect,
  fieldWarnings = {},
  showCloseButton = false,
  onClose,
  embedded = false,
}: UnifiedBetHeaderProps) {
  const config = FormTypeConfig[formType];
  const Icon = config.icon;
  
  const isEstrategiaFixed = !isEditing && isAbaEstrategiaFixa(activeTab);
  const displayEstrategia = lockedEstrategia || estrategia;
  
  const title = isEditing ? config.editTitle : config.title;
  
  // Date picker state
  const [datePickerOpen, setDatePickerOpen] = React.useState(false);
  const parsed = parseLocalDateTime(dataHora);
  const [selectedDate, setSelectedDate] = React.useState<Date | undefined>(parsed.date);
  const [hour, setHour] = React.useState(parsed.hour);
  const [minute, setMinute] = React.useState(parsed.minute);

  // Sync when dataHora prop changes
  React.useEffect(() => {
    const parsed = parseLocalDateTime(dataHora);
    setSelectedDate(parsed.date);
    setHour(parsed.hour);
    setMinute(parsed.minute);
  }, [dataHora]);

  const updateDateTime = (newDate: Date | undefined, newHour: string, newMinute: string) => {
    if (newDate) {
      const formattedDate = format(newDate, "yyyy-MM-dd");
      const formattedTime = `${newHour.padStart(2, "0")}:${newMinute.padStart(2, "0")}`;
      onDataHoraChange(`${formattedDate}T${formattedTime}`);
    } else {
      onDataHoraChange("");
    }
  };

  const handleDateSelect = (date: Date | undefined) => {
    setSelectedDate(date);
    updateDateTime(date, hour, minute);
  };

  const handleHourChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let val = e.target.value.replace(/\D/g, "");
    if (val.length > 2) val = val.slice(0, 2);
    const num = parseInt(val, 10);
    if (!isNaN(num) && num > 23) val = "23";
    setHour(val);
    if (val.length === 2) {
      updateDateTime(selectedDate, val, minute);
    }
  };

  const handleMinuteChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let val = e.target.value.replace(/\D/g, "");
    if (val.length > 2) val = val.slice(0, 2);
    const num = parseInt(val, 10);
    if (!isNaN(num) && num > 59) val = "59";
    setMinute(val);
    if (val.length === 2) {
      updateDateTime(selectedDate, hour, val);
    }
  };

  const handleHourBlur = () => {
    const padded = hour.padStart(2, "0");
    setHour(padded);
    updateDateTime(selectedDate, padded, minute);
  };

  const handleMinuteBlur = () => {
    const padded = minute.padStart(2, "0");
    setMinute(padded);
    updateDateTime(selectedDate, hour, padded);
  };

  // Display format: DD/MM HH:MM (sem ano)
  const dateDisplay = selectedDate
    ? `${format(selectedDate, "dd/MM", { locale: ptBR })} ${hour.padStart(2, "0")}:${minute.padStart(2, "0")}`
    : null;

  return (
    <div className="border-b border-border/50 bg-muted/20">
      {/* Linha 1: Título + Estratégia + Contexto + Importar + Fechar */}
      <div className="flex items-center justify-between px-4 py-2">
        <div className="flex items-center gap-3">
          <Icon className={cn("h-5 w-5", config.iconColor)} />
          <h2 className="font-semibold text-sm">{title}</h2>
        </div>
        
        {/* Centro: Estratégia + Contexto */}
        <div className="flex items-center gap-4">
          {/* Estratégia */}
          <div className="flex items-center gap-2">
            <Label className="text-[10px] text-muted-foreground uppercase tracking-wide">
              Estratégia
              {isEstrategiaFixed && <span className="ml-1 text-primary">(fixo)</span>}
            </Label>
            
            {isEstrategiaFixed && lockedEstrategia ? (
              <Badge 
                variant="secondary" 
                className="text-[10px] font-medium bg-primary/10 text-primary border-primary/20 h-6"
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
                  "h-6 text-[10px] w-[100px]", 
                  !displayEstrategia && "border-red-500/50"
                )}>
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent>
                  {ESTRATEGIAS_LIST.map(e => (
                    <SelectItem key={e.value} value={e.value} className="text-xs">{e.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
          
          {/* Contexto */}
          <div className="flex items-center gap-2">
            <Label className="text-[10px] text-muted-foreground uppercase tracking-wide">
              Contexto
            </Label>
            <Select 
              value={contexto} 
              onValueChange={(v) => onContextoChange(v as ContextoOperacional)}
              disabled={isEstrategiaFixed}
            >
              <SelectTrigger className={cn(
                "h-6 text-[10px] w-[90px]",
                isEstrategiaFixed && "opacity-70"
              )}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CONTEXTOS_LIST.map(c => (
                  <SelectItem key={c.value} value={c.value} className="text-xs">{c.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        
        {/* Direita: Importar + Fechar */}
        <div className="flex items-center gap-2">
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
                      className="gap-1.5 text-[10px] text-muted-foreground hover:text-foreground h-6 px-2"
                    >
                      {isPrintProcessing ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <Camera className="h-3 w-3" />
                      )}
                      {isPrintProcessing 
                        ? (printProcessingPhase === "backup" ? "Alternativo..." : "Analisando...") 
                        : "Importar"}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" align="end" className="max-w-[200px]">
                    <p className="text-xs">Cole com Ctrl+V ou clique para selecionar imagem</p>
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
            <Button variant="ghost" size="sm" onClick={onClose} className="h-6 w-6 p-0">
              <X className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      </div>
      
      {/* Linha 2: Esporte + Evento + Mercado + Data/Hora - Grid centralizado */}
      <div className="px-4 pb-3">
        <div className="grid grid-cols-4 gap-3">
          {/* Esporte */}
          <div className="text-center">
            <Label className={cn(
              "text-[10px] uppercase tracking-wide block mb-1",
              fieldWarnings.esporte ? "text-amber-500" : "text-muted-foreground"
            )}>
              Esporte
            </Label>
            <Select value={esporte} onValueChange={onEsporteChange}>
              <SelectTrigger className={cn(
                "h-7 text-xs text-center",
                fieldWarnings.esporte && "border-amber-500/50"
              )}>
                <SelectValue placeholder="Selecione" />
              </SelectTrigger>
              <SelectContent>
                {esportesList.map(e => (
                  <SelectItem key={e} value={e} className="text-xs">{e}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          
          {/* Evento */}
          <div className="text-center">
            <Label className={cn(
              "text-[10px] uppercase tracking-wide block mb-1",
              fieldWarnings.evento ? "text-amber-500" : "text-muted-foreground"
            )}>
              Evento
            </Label>
            <Input
              value={evento}
              onChange={(e) => onEventoChange(e.target.value.toUpperCase())}
              placeholder="TIME 1 X TIME 2"
              className={cn(
                "h-7 text-xs text-center uppercase",
                fieldWarnings.evento && "border-amber-500/50"
              )}
            />
          </div>
          
          {/* Mercado */}
          <div className="text-center">
            <Label className={cn(
              "text-[10px] uppercase tracking-wide block mb-1",
              fieldWarnings.mercado ? "text-amber-500" : "text-muted-foreground"
            )}>
              Mercado
            </Label>
            <Input
              value={mercado}
              onChange={(e) => onMercadoChange(e.target.value)}
              placeholder="Ex: Resultado Final"
              className={cn(
                "h-7 text-xs text-center",
                fieldWarnings.mercado && "border-amber-500/50"
              )}
            />
          </div>
          
          {/* Data/Hora */}
          <div className="text-center">
            <Label className={cn(
              "text-[10px] uppercase tracking-wide block mb-1",
              fieldWarnings.dataHora ? "text-amber-500" : "text-muted-foreground"
            )}>
              Data/Hora
            </Label>
            <Popover open={datePickerOpen} onOpenChange={setDatePickerOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn(
                    "w-full h-7 text-xs font-normal justify-center",
                    !selectedDate && "text-muted-foreground",
                    fieldWarnings.dataHora && "border-amber-500/50"
                  )}
                >
                  <CalendarIcon className="mr-1.5 h-3 w-3" />
                  {dateDisplay || "Selecione"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="center">
                <Calendar
                  mode="single"
                  selected={selectedDate}
                  onSelect={handleDateSelect}
                  initialFocus
                  locale={ptBR}
                  className="pointer-events-auto"
                />
                <div className="border-t border-border p-2">
                  <div className="flex items-center justify-center gap-2">
                    <span className="text-[10px] text-muted-foreground uppercase">Hora:</span>
                    <div className="flex items-center gap-1">
                      <Input
                        type="text"
                        inputMode="numeric"
                        value={hour}
                        onChange={handleHourChange}
                        onBlur={handleHourBlur}
                        className="w-10 h-6 text-center text-xs"
                        placeholder="HH"
                        maxLength={2}
                      />
                      <span className="text-foreground font-medium text-xs">:</span>
                      <Input
                        type="text"
                        inputMode="numeric"
                        value={minute}
                        onChange={handleMinuteChange}
                        onBlur={handleMinuteBlur}
                        className="w-10 h-6 text-center text-xs"
                        placeholder="MM"
                        maxLength={2}
                      />
                    </div>
                  </div>
                </div>
              </PopoverContent>
            </Popover>
          </div>
        </div>
      </div>
    </div>
  );
}
