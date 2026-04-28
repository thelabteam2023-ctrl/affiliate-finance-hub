import { useMemo, useState, useCallback, useEffect } from "react";
import {
  DndContext, DragEndEvent, DragOverlay, DragStartEvent,
  PointerSensor, useDraggable, useDroppable, useSensor, useSensors,
} from "@dnd-kit/core";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { ChevronLeft, ChevronRight, Settings2, Plus, AlertTriangle, MapPin, User, Search, Building2, Trash2, ChevronDown, ChevronUp, ShieldAlert, Pencil, Sparkles } from "lucide-react";
import { SimulacaoDistribuicaoDialog } from "./SimulacaoDistribuicaoDialog";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { RegulamentacaoFilter, RegFilterValue } from "./RegulamentacaoFilter";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  PlanningCampanha,
  usePlanningCasas,
  usePlanningCampanhas,
  usePlanningIps,
  usePlanningWallets,
  useParceirosLite,
  usePlanningPerfis,
  useUpsertCampanha,
  useDeleteCampanha,
} from "@/hooks/usePlanningData";
import { useGrupoRegrasValidator } from "@/hooks/useGrupoRegrasValidator";
import { CampanhaDialog } from "./CampanhaDialog";
import { RecursosManager } from "./RecursosManager";
import { useBookmakerLogoMap } from "@/hooks/useBookmakerLogoMap";
import { BookmakerLogo } from "@/components/ui/bookmaker-logo";
import { useExchangeRates } from "@/contexts/ExchangeRatesContext";
import { useDistribuicaoPlanos } from "@/hooks/useDistribuicaoPlanos";
import {
  usePlanoCelulasDisponiveis,
  marcarCelulaAgendada,
  desmarcarCelulaAgendada,
  type CelulaDisponivel,
} from "@/hooks/usePlanoCelulasDisponiveis";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useQueryClient } from "@tanstack/react-query";

type DisplayCurrency = "BRL" | "USD";

const MES_NOMES = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
const DIAS_SEMANA = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

function formatDateKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// Verifica se uma data é anterior a hoje (não permitir arrastar para datas passadas)
function isDateInPast(dateKey: string): boolean {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const [year, month, day] = dateKey.split("-").map(Number);
  const targetDate = new Date(year, month - 1, day);
  return targetDate < today;
}

function formatMoney(v: number, currency: string) {
  try {
    return new Intl.NumberFormat("pt-BR", { style: "currency", currency }).format(v);
  } catch {
    return `${currency} ${v.toFixed(2)}`;
  }
}

// Paleta de cores por CPF — fallback quando o CPF ainda não tem perfil do planejamento.
const CPF_COLORS: { bg: string; border: string; text: string; dot: string }[] = [
  { bg: "hsl(45 95% 55% / 0.15)", border: "hsl(45 95% 55%)", text: "hsl(45 95% 65%)", dot: "hsl(45 95% 55%)" },   // 1 amarelo
  { bg: "hsl(142 70% 45% / 0.15)", border: "hsl(142 70% 45%)", text: "hsl(142 70% 55%)", dot: "hsl(142 70% 45%)" }, // 2 verde
  { bg: "hsl(217 90% 60% / 0.15)", border: "hsl(217 90% 60%)", text: "hsl(217 90% 70%)", dot: "hsl(217 90% 60%)" }, // 3 azul
  { bg: "hsl(0 80% 60% / 0.15)", border: "hsl(0 80% 60%)", text: "hsl(0 80% 70%)", dot: "hsl(0 80% 60%)" },         // 4 vermelho
  { bg: "hsl(280 70% 60% / 0.15)", border: "hsl(280 70% 60%)", text: "hsl(280 70% 70%)", dot: "hsl(280 70% 60%)" }, // 5 roxo
  { bg: "hsl(25 90% 55% / 0.15)", border: "hsl(25 90% 55%)", text: "hsl(25 90% 65%)", dot: "hsl(25 90% 55%)" },     // 6 laranja
  { bg: "hsl(180 70% 45% / 0.15)", border: "hsl(180 70% 45%)", text: "hsl(180 70% 55%)", dot: "hsl(180 70% 45%)" }, // 7 ciano
  { bg: "hsl(330 75% 60% / 0.15)", border: "hsl(330 75% 60%)", text: "hsl(330 75% 70%)", dot: "hsl(330 75% 60%)" }, // 8 pink
  { bg: "hsl(255 85% 70% / 0.18)", border: "hsl(255 85% 70%)", text: "hsl(255 85% 78%)", dot: "hsl(255 85% 70%)" }, // 9 lavanda/índigo
  { bg: "hsl(160 60% 40% / 0.18)", border: "hsl(160 60% 40%)", text: "hsl(160 60% 55%)", dot: "hsl(160 60% 40%)" }, // 10 teal escuro
];

function getCpfColor(idx: number | null | undefined, perfilCor?: string | null) {
  if (perfilCor) {
    return { bg: `${perfilCor}26`, border: perfilCor, text: perfilCor, dot: perfilCor };
  }
  if (!idx || idx < 1) return null;
  return CPF_COLORS[(idx - 1) % CPF_COLORS.length];
}

// ──────── Componentes drag-and-drop ────────

type BookmakerDragItem = { id: string; nome: string; moeda: string };

function DraggableBookmaker({ id, nome, moeda, status, logoUrl, selected, selectedBatch, onToggleSelect }: {
  id: string; nome: string; moeda: string;
  status: "REGULAMENTADA" | "NAO_REGULAMENTADA";
  logoUrl: string | null;
  selected: boolean;
  selectedBatch: BookmakerDragItem[];
  onToggleSelect: () => void;
}) {
  const isBatchDrag = selected && selectedBatch.length > 1;
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `bm-${id}`,
    data: isBatchDrag
      ? { type: "bookmaker-batch", items: selectedBatch, count: selectedBatch.length }
      : { type: "bookmaker", bookmakerId: id, nome, moeda },
  });
  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      onClick={(e) => {
        if (e.ctrlKey || e.metaKey) {
          e.preventDefault();
          e.stopPropagation();
          onToggleSelect();
        }
      }}
      className={cn(
        "px-2 py-1.5 rounded-md border bg-card text-xs cursor-grab active:cursor-grabbing hover:border-primary transition-colors flex items-center gap-2",
        selected && "border-primary bg-primary/10 ring-1 ring-primary/50",
        isDragging && "opacity-40"
      )}
    >
      {logoUrl ? (
        <img src={logoUrl} alt="" className="h-4 w-4 rounded object-contain shrink-0" />
      ) : (
        <Building2 className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
      )}
      <div className="flex-1 min-w-0">
        <div className="font-medium truncate">{nome}</div>
        <div className="text-[10px] text-muted-foreground flex items-center gap-1">
          <span>{moeda}</span>
        </div>
      </div>
    </div>
  );
}

// Item arrastável vindo do PLANO de distribuição
// Carrega tudo: CPF (parceiro), casa, grupo, valor sugerido — pronto para virar campanha
function DraggableCelula({ celula, parceiroNome, perfilCor, selected, selectedBatch, onToggleSelect }: {
  celula: CelulaDisponivel;
  parceiroNome?: string;
  perfilCor?: string | null;
  selected: boolean;
  selectedBatch: CelulaDisponivel[];
  onToggleSelect: () => void;
}) {
  const isBatchDrag = selected && selectedBatch.length > 1;
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `cel-${celula.id}`,
    data: isBatchDrag
      ? { type: "celula-batch", items: selectedBatch, count: selectedBatch.length }
      : { type: "celula", celula },
  });
  const jaAgendada = !!celula.agendada_em;
  const cpfColor = getCpfColor(celula.cpf_index, perfilCor);
  const cpfTag = celula.cpf_index ? `CPF ${celula.cpf_index}` : null;
  const titleStr = jaAgendada
    ? `${celula.bookmaker_nome} • ${cpfTag ?? "CPF ?"}${parceiroNome ? ` (${parceiroNome})` : ""} • já agendada`
    : `${celula.bookmaker_nome} • ${cpfTag ?? "CPF ?"}${parceiroNome ? ` (${parceiroNome})` : ""} • ${celula.grupo_nome}`;
  return (
    <div
      ref={setNodeRef}
      {...(jaAgendada ? {} : listeners)}
      {...attributes}
      onClick={(e) => {
        if (!jaAgendada && (e.ctrlKey || e.metaKey)) {
          e.preventDefault();
          e.stopPropagation();
          onToggleSelect();
        }
      }}
      className={cn(
        "px-2 py-1.5 rounded-md border text-xs transition-colors flex items-center gap-2",
        jaAgendada
          ? "opacity-50 cursor-not-allowed bg-card"
          : "cursor-grab active:cursor-grabbing hover:brightness-110",
        selected && "ring-2 ring-primary ring-offset-1 ring-offset-background",
        isDragging && "opacity-40"
      )}
      style={{
        backgroundColor: cpfColor?.bg ?? "hsl(var(--card))",
        borderColor: cpfColor?.border ?? "hsl(var(--border))",
        borderLeftColor: celula.grupo_cor,
        borderLeftWidth: 3,
      }}
      title={titleStr}
    >
      {/* Badge CPF — bem visível */}
      {cpfTag ? (
        <div
          className="shrink-0 flex flex-col items-center justify-center rounded-md px-1.5 py-1 font-bold leading-none"
          style={{
            backgroundColor: cpfColor?.border ?? "hsl(var(--muted))",
            color: "hsl(0 0% 100%)",
            minWidth: 32,
          }}
        >
          <span className="text-[8px] opacity-80 tracking-wide">CPF</span>
          <span className="text-sm">{celula.cpf_index}</span>
        </div>
      ) : (
        <div className="shrink-0 flex items-center justify-center rounded-md px-2 py-1 bg-muted text-muted-foreground text-[9px] font-semibold" style={{ minWidth: 32 }}>
          ?
        </div>
      )}

      {celula.bookmaker_logo ? (
        <img src={celula.bookmaker_logo} alt="" className="h-4 w-4 rounded object-contain shrink-0" />
      ) : (
        <Building2 className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
      )}
      <div className="flex-1 min-w-0">
        <div className="font-medium truncate text-foreground">{celula.bookmaker_nome}</div>
        {parceiroNome && (
          <div className="text-[10px] flex items-center gap-1 mt-0.5 text-foreground/70">
            <User className="h-2.5 w-2.5 shrink-0" />
            <span className="truncate">{parceiroNome}</span>
          </div>
        )}
        <div className="text-[10px] text-muted-foreground flex items-center gap-1.5">
          <span>{celula.moeda}</span>
          {celula.deposito_sugerido > 0 && (
            <span className="font-medium text-foreground/70">
              {formatMoney(celula.deposito_sugerido, celula.moeda)}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

function DraggableCampanha({ campanha, onClick, onDelete, ipLabel, parceiroNome, hasConflict, isPending, logoUrl, grupoBlock, grupoWarn, cpfIndex, perfilCor }: {
  campanha: PlanningCampanha;
  onClick: () => void;
  onDelete: () => void;
  ipLabel?: string;
  parceiroNome?: string;
  hasConflict: boolean;
  isPending: boolean;
  logoUrl?: string | null;
  grupoBlock?: boolean;
  grupoWarn?: boolean;
  cpfIndex?: number | null;
  perfilCor?: string | null;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `camp-${campanha.id}`,
    data: { type: "campanha", campanhaId: campanha.id },
  });
  const hasValue = Number(campanha.deposit_amount) > 0;
  const cpfColor = getCpfColor(cpfIndex, perfilCor);
  // Quando há CPF vinculado, usamos a cor do CPF como destaque dominante
  // (mas mantemos overrides de erro: conflito/regra de grupo).
  const cpfStyle = cpfColor && !hasConflict && !grupoBlock
    ? { backgroundColor: cpfColor.bg, borderColor: cpfColor.border, boxShadow: `0 0 0 1px ${cpfColor.border}` }
    : undefined;
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div
          ref={setNodeRef}
          {...listeners}
          {...attributes}
          style={cpfStyle}
          className={cn(
            "rounded border px-1.5 py-1 text-[10px] leading-tight cursor-grab active:cursor-grabbing transition-colors select-none",
            // Estilo padrão (sem CPF) — fallback verde/amarelo
            !cpfStyle && (isPending
              ? "bg-warning/5 hover:bg-warning/10 border-warning/30"
              : "bg-success/10 hover:bg-success/20 border-success/50 shadow-[0_0_0_1px_hsl(var(--success)/0.3)]"),
            hasConflict && "border-destructive/60 bg-destructive/5 shadow-[0_0_0_1px_hsl(var(--destructive)/0.4)]",
            grupoBlock && "border-destructive bg-destructive/10 shadow-[0_0_0_1px_hsl(var(--destructive)/0.6)]",
            isDragging && "opacity-40"
          )}
          onClick={(e) => {
            e.stopPropagation();
            onClick();
          }}
        >
          <div className="flex items-center gap-1.5">
            {cpfColor && cpfIndex ? (
              <div
                className="h-5 w-5 shrink-0 rounded flex items-center justify-center text-[10px] font-bold tabular-nums"
                style={{ backgroundColor: cpfColor.dot, color: "hsl(0 0% 10%)" }}
                title={`CPF ${cpfIndex}${parceiroNome ? ` — ${parceiroNome}` : ""}`}
              >
                {cpfIndex}
              </div>
            ) : null}
            <BookmakerLogo
              logoUrl={logoUrl}
              alt={campanha.bookmaker_nome}
              size="h-10 w-10 shrink-0"
              iconSize="h-5 w-5"
            />
            <span className="font-semibold truncate flex-1 min-w-0">{campanha.bookmaker_nome}</span>
            {(grupoBlock || grupoWarn) && (
              <ShieldAlert
                className={cn("h-3 w-3 shrink-0", grupoBlock ? "text-destructive" : "text-warning")}
              />
            )}
            <span
              className={cn(
                "font-medium shrink-0 tabular-nums",
                isPending ? "text-warning" : "text-success",
                !hasValue && "italic opacity-70"
              )}
            >
              {hasValue
                ? formatMoney(Number(campanha.deposit_amount), campanha.currency)
                : "s/v"}
            </span>
          </div>
          {(ipLabel || parceiroNome) && (
            <div className="text-muted-foreground truncate flex items-center gap-1 mt-0.5 pl-6">
              {parceiroNome && <><User className="h-2.5 w-2.5" />{parceiroNome.split(" ")[0]}</>}
              {ipLabel && <><MapPin className="h-2.5 w-2.5" />{ipLabel}</>}
            </div>
          )}
          {hasConflict && (
            <div className="text-destructive text-[9px] flex items-center gap-0.5 pl-6">
              <AlertTriangle className="h-2.5 w-2.5" /> conflito
            </div>
          )}
          {grupoBlock && (
            <div className="text-destructive text-[9px] flex items-center gap-0.5 pl-6">
              <ShieldAlert className="h-2.5 w-2.5" /> regra de grupo violada
            </div>
          )}
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent className="w-48">
        <ContextMenuItem onClick={onClick}>
          <Pencil className="h-3.5 w-3.5 mr-2" /> Editar
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem
          onClick={onDelete}
          className="text-destructive focus:text-destructive focus:bg-destructive/10"
        >
          <Trash2 className="h-3.5 w-3.5 mr-2" /> Excluir do calendário
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}

function isCampanhaPending(c: PlanningCampanha): boolean {
  return (
    !c.parceiro_id ||
    !c.ip_id ||
    !c.wallet_id ||
    Number(c.deposit_amount) <= 0
  );
}

function TrashDropZone({ active }: { active: boolean }) {
  const { setNodeRef, isOver } = useDroppable({ id: "trash-zone", data: { type: "trash" } });
  if (!active) return null;
  return (
    <div
      ref={setNodeRef}
      className={cn(
        "rounded-md border-2 border-dashed p-3 flex items-center justify-center gap-2 text-xs font-medium transition-all",
        isOver
          ? "border-destructive bg-destructive/10 text-destructive scale-105"
          : "border-muted-foreground/40 text-muted-foreground bg-muted/20"
      )}
    >
      <Trash2 className="h-4 w-4" />
      {isOver ? "Solte para remover" : "Arraste aqui para remover"}
    </div>
  );
}

function DayCell({ date, isCurrentMonth, children, onAdd, onOpenDetails }: {
  date: Date;
  isCurrentMonth: boolean;
  children: React.ReactNode;
  onAdd: () => void;
  onOpenDetails: () => void;
}) {
  const dateKey = formatDateKey(date);
  const isPast = isDateInPast(dateKey);
  const isToday = formatDateKey(new Date()) === dateKey;
  
  // Desabilita droppable para datas passadas
  const { setNodeRef, isOver } = useDroppable({ 
    id: `day-${dateKey}`, 
    data: { type: "day", dateKey },
    disabled: isPast,
  });

  return (
    <div
      ref={setNodeRef}
      onClick={onOpenDetails}
      className={cn(
        "min-h-[110px] border rounded-md p-1 flex flex-col gap-1 transition-colors bg-muted/40 cursor-pointer",
        !isCurrentMonth && "bg-muted/10 opacity-50",
        isPast && "bg-muted/20 opacity-60 cursor-not-allowed",
        !isPast && isOver && "ring-2 ring-primary bg-primary/10",
        isToday && !isPast && "border-primary bg-primary/5"
      )}
    >
      <div className="flex items-center justify-between">
        <span className={cn("text-xs font-medium", isToday && !isPast && "text-primary", isPast && "text-muted-foreground")}>{date.getDate()}</span>
        {isCurrentMonth && !isPast && (
          <button onClick={(e) => { e.stopPropagation(); onAdd(); }} className="opacity-0 hover:opacity-100 group-hover:opacity-100 text-muted-foreground hover:text-primary">
            <Plus className="h-3 w-3" />
          </button>
        )}
      </div>
      <div className="flex-1 flex flex-col gap-1 overflow-y-auto">{children}</div>
    </div>
  );
}

// ──────── Página principal ────────

export function PlanejamentoCalendario() {
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth() + 1);
  const [recursosOpen, setRecursosOpen] = useState(false);
  const [editing, setEditing] = useState<{ date: string; campanha?: PlanningCampanha; initialBookmaker?: any } | null>(null);
  const [activeDrag, setActiveDrag] = useState<any>(null);
  const [bmSearch, setBmSearch] = useState("");
  const [bmFilter, setBmFilter] = useState<RegFilterValue>("all");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [selectedBookmakerIds, setSelectedBookmakerIds] = useState<Set<string>>(() => new Set());
  const [selectedCelulaIds, setSelectedCelulaIds] = useState<Set<string>>(() => new Set());
  const [planoFiltroId, setPlanoFiltroId] = useState<string>("none"); // "none" = mostrar casas livres
  const [grupoFiltroId, setGrupoFiltroId] = useState<string>("todos"); // "todos" = sem filtro de grupo
  const [cpfFiltroIdx, setCpfFiltroIdx] = useState<string>("todos"); // "todos" = sem filtro de CPF
  const [displayCurrency, setDisplayCurrency] = useState<DisplayCurrency>(() => {
    if (typeof window === "undefined") return "BRL";
    const saved = window.localStorage.getItem("planejamento:displayCurrency");
    return saved === "USD" || saved === "BRL" ? saved : "BRL";
  });
  useEffect(() => {
    try {
      window.localStorage.setItem("planejamento:displayCurrency", displayCurrency);
    } catch {}
  }, [displayCurrency]);
  const [pendingMove, setPendingMove] = useState<{
    campanha: PlanningCampanha;
    fromDate: string;
    toDate: string;
  } | null>(null);
  const [moveConfirmed, setMoveConfirmed] = useState(false);
  const [simulacaoOpen, setSimulacaoOpen] = useState(false);
  const [detailsDate, setDetailsDate] = useState<string | null>(null);

  const { data: campanhas = [] } = usePlanningCampanhas(year, month);
  const { data: casasPlan = [] } = usePlanningCasas();
  const { data: ips = [] } = usePlanningIps();
  const { data: wallets = [] } = usePlanningWallets();
  const { data: parceiros = [] } = useParceirosLite();
  const { data: perfisPre = [] } = usePlanningPerfis();
  const upsert = useUpsertCampanha();
  const deleteCamp = useDeleteCampanha();
  const { getLogoUrl } = useBookmakerLogoMap();
  const { convertToBRL, cotacaoUSD, isUsingFallback } = useExchangeRates();
  const { planos } = useDistribuicaoPlanos();
  const { data: celulasPlano = [] } = usePlanoCelulasDisponiveis(
    planoFiltroId !== "none" ? planoFiltroId : null
  );
  const qc = useQueryClient();

  // Converte qualquer valor da moeda nativa para a moeda de exibição (BRL ou USD)
  const convertToDisplay = useCallback((value: number, fromCurrency: string): number => {
    if (!value) return 0;
    const valueInBRL = convertToBRL(value, fromCurrency);
    if (displayCurrency === "BRL") return valueInBRL;
    // USD: converte BRL → USD
    return cotacaoUSD > 0 ? valueInBRL / cotacaoUSD : 0;
  }, [convertToBRL, cotacaoUSD, displayCurrency]);

  // Casas ativas pré-selecionadas para o workspace
  const bookmakers = useMemo(
    () => casasPlan.filter(p => p.is_active && p.casa).map(p => p.casa!),
    [casasPlan]
  );

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  // Mapas auxiliares (usa label_custom dos perfis pré-selecionados quando existir)
  const ipMap = useMemo(() => Object.fromEntries(ips.map(i => [i.id, i])), [ips]);
  const ipByBookmakerMap = useMemo(() => {
    const map = new Map<string, string>();
    ips
      .filter(i => i.is_active && i.bookmaker_catalogo_id)
      .forEach(i => {
        if (!map.has(i.bookmaker_catalogo_id!)) map.set(i.bookmaker_catalogo_id!, i.id);
      });
    return map;
  }, [ips]);
  const ipByPerfilBookmakerMap = useMemo(() => {
    const map = new Map<string, string>();
    ips
      .filter(i => i.is_active && i.perfil_planejamento_id && i.bookmaker_catalogo_id)
      .forEach(i => map.set(`${i.perfil_planejamento_id}:${i.bookmaker_catalogo_id}`, i.id));
    return map;
  }, [ips]);
  const ipByParceiroBookmakerMap = useMemo(() => {
    const map = new Map<string, string>();
    ips
      .filter(i => i.is_active && i.perfil_planejamento_id && i.bookmaker_catalogo_id)
      .forEach(i => {
        const perfil = perfilByIdMap.get(i.perfil_planejamento_id!);
        if (perfil?.parceiro_id) map.set(`${perfil.parceiro_id}:${i.bookmaker_catalogo_id}`, i.id);
      });
    return map;
  }, [ips, perfilByIdMap]);
  const parceiroMap = useMemo(() => {
    const labelOverride = new Map<string, string>();
    perfisPre.forEach(p => {
      if (p.label_custom) labelOverride.set(p.parceiro_id, p.label_custom);
    });
    return Object.fromEntries(
      parceiros.map(p => [p.id, { ...p, nome: labelOverride.get(p.id) ?? p.nome }]),
    );
  }, [parceiros, perfisPre]);

  const perfilByIdMap = useMemo(() => {
    const map = new Map<string, (typeof perfisPre)[number]>();
    perfisPre.forEach((p) => map.set(p.id, p));
    return map;
  }, [perfisPre]);

  const perfilByParceiroIdMap = useMemo(() => {
    const map = new Map<string, (typeof perfisPre)[number]>();
    perfisPre.forEach((p) => {
      if (p.parceiro_id) map.set(p.parceiro_id, p);
    });
    return map;
  }, [perfisPre]);

  // Filtro da sidebar de casas (modo "casas livres" — quando não há plano selecionado)
  const filteredBookmakers = useMemo(() => {
    return bookmakers.filter(b => {
      if (bmFilter !== "all" && b.status !== bmFilter) return false;
      if (bmSearch && !b.nome.toLowerCase().includes(bmSearch.toLowerCase())) return false;
      return true;
    });
  }, [bookmakers, bmFilter, bmSearch]);

  // Filtro de células do plano (modo "plano selecionado")
  const filteredCelulas = useMemo(() => {
    return celulasPlano.filter((c) => {
      // Esconde células já agendadas (vinculadas a uma campanha no calendário)
      // para evitar duplicar a casa na sidebar e facilitar o manuseio das restantes.
      if (c.agendada_em || c.campanha_id) return false;
      if (grupoFiltroId !== "todos" && c.grupo_id !== grupoFiltroId) return false;
      if (cpfFiltroIdx !== "todos" && String(c.cpf_index ?? "") !== cpfFiltroIdx) return false;
      if (bmSearch && !c.bookmaker_nome.toLowerCase().includes(bmSearch.toLowerCase())) return false;
      return true;
    });
  }, [celulasPlano, grupoFiltroId, cpfFiltroIdx, bmSearch]);

  useEffect(() => {
    const visibleIds = new Set(filteredBookmakers.map((b) => b.id));
    setSelectedBookmakerIds((prev) => {
      const next = new Set(Array.from(prev).filter((id) => visibleIds.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [filteredBookmakers]);

  useEffect(() => {
    const visibleIds = new Set(filteredCelulas.map((c) => c.id));
    setSelectedCelulaIds((prev) => {
      const next = new Set(Array.from(prev).filter((id) => visibleIds.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [filteredCelulas]);

  const selectedBookmakerBatch = useMemo<BookmakerDragItem[]>(() => {
    return filteredBookmakers
      .filter((b) => selectedBookmakerIds.has(b.id))
      .map((b) => ({ id: b.id, nome: b.nome, moeda: b.moeda_padrao }));
  }, [filteredBookmakers, selectedBookmakerIds]);

  const selectedCelulaBatch = useMemo(() => {
    return filteredCelulas.filter((c) => selectedCelulaIds.has(c.id));
  }, [filteredCelulas, selectedCelulaIds]);

  const toggleBookmakerSelection = useCallback((id: string) => {
    setSelectedCelulaIds(new Set());
    setSelectedBookmakerIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }, []);

  const toggleCelulaSelection = useCallback((id: string) => {
    setSelectedBookmakerIds(new Set());
    setSelectedCelulaIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }, []);

  const clearSelection = useCallback(() => {
    setSelectedBookmakerIds(new Set());
    setSelectedCelulaIds(new Set());
  }, []);

  // Lista de CPFs presentes no plano (para popular filtro)
  const cpfsDoPlano = useMemo(() => {
    const set = new Set<number>();
    celulasPlano.forEach((c) => {
      if (c.cpf_index) set.add(c.cpf_index);
    });
    return Array.from(set).sort((a, b) => a - b);
  }, [celulasPlano]);

  // Grupos disponíveis no plano selecionado (para popular o filtro de grupos)
  const gruposDoPlano = useMemo(() => {
    const map = new Map<string, { id: string; nome: string; cor: string }>();
    celulasPlano.forEach((c) => {
      if (!map.has(c.grupo_id)) {
        map.set(c.grupo_id, { id: c.grupo_id, nome: c.grupo_nome, cor: c.grupo_cor });
      }
    });
    return Array.from(map.values());
  }, [celulasPlano]);

  const modoPlano = planoFiltroId !== "none";

  // Plano selecionado (para extrair parceiro_ids e mapear CPF por posição)
  const planoSelecionado = useMemo(
    () => planos.find((p) => p.id === planoFiltroId) ?? null,
    [planos, planoFiltroId]
  );
  const parceiroIdToCpfIdx = useMemo(() => {
    const m = new Map<string, number>();
    const ids: string[] = (planoSelecionado as any)?.parceiro_ids ?? [];
    ids.forEach((ownerId, idx) => {
      m.set(ownerId, idx + 1);
      const perfil = perfilByIdMap.get(ownerId);
      if (perfil?.parceiro_id) m.set(perfil.parceiro_id, idx + 1);
    });
    return m;
  }, [planoSelecionado, perfilByIdMap]);

  const cpfIndexToPerfilMap = useMemo(() => {
    const map = new Map<number, (typeof perfisPre)[number]>();
    const ids: string[] = (planoSelecionado as any)?.parceiro_ids ?? [];
    ids.forEach((ownerId, idx) => {
      const perfil = perfilByIdMap.get(ownerId) ?? perfilByParceiroIdMap.get(ownerId);
      if (perfil) map.set(idx + 1, perfil);
    });
    celulasPlano.forEach((cel) => {
      if (!cel.cpf_index || map.has(cel.cpf_index)) return;
      const perfil = cel.perfil_planejamento_id ? perfilByIdMap.get(cel.perfil_planejamento_id) : null;
      if (perfil) map.set(cel.cpf_index, perfil);
    });
    return map;
  }, [planoSelecionado, perfilByIdMap, perfilByParceiroIdMap, celulasPlano, perfisPre]);

  const getCelulaPerfil = useCallback((celula: CelulaDisponivel) => {
    return (celula.perfil_planejamento_id ? perfilByIdMap.get(celula.perfil_planejamento_id) : null)
      ?? (celula.parceiro_id ? perfilByParceiroIdMap.get(celula.parceiro_id) : null)
      ?? (celula.cpf_index ? cpfIndexToPerfilMap.get(celula.cpf_index) : null)
      ?? null;
  }, [perfilByIdMap, perfilByParceiroIdMap, cpfIndexToPerfilMap]);

  // Mapa: campanha_id -> cpf_index (para colorir o card no calendário).
  // Estratégias em cascata:
  //  1) Vínculo direto via célula agendada (campanha_id na célula).
  //  2) Fallback pelo parceiro_id da campanha posicionado no parceiro_ids do plano.
  //  3) Fallback pelo bookmaker_catalogo_id da campanha — pega a 1ª célula
  //     do plano com a mesma casa (ordenada) e usa seu cpf_index. Isso resolve
  //     o caso comum em que o usuário arrastou a casa antes de vincular CPF/IP.
  const campanhaCpfMap = useMemo(() => {
    const map = new Map<string, number>();
    // 1) Vínculo direto
    celulasPlano.forEach((c) => {
      if (c.campanha_id && c.cpf_index) map.set(c.campanha_id, c.cpf_index);
    });
    // 2) Por parceiro
    campanhas.forEach((camp) => {
      if (map.has(camp.id)) return;
      if (camp.parceiro_id) {
        const idx = parceiroIdToCpfIdx.get(camp.parceiro_id);
        if (idx) map.set(camp.id, idx);
      }
    });
    // 3) Por bookmaker_catalogo_id — usa a 1ª célula que combine como "âncora"
    if (modoPlano) {
      const celulasOrdenadas = [...celulasPlano].sort(
        (a, b) => (a.cpf_index ?? 99) - (b.cpf_index ?? 99) || (a.ordem ?? 0) - (b.ordem ?? 0)
      );
      campanhas.forEach((camp) => {
        if (map.has(camp.id)) return;
        const catId = (camp as any).bookmaker_catalogo_id;
        if (!catId) return;
        const cel = celulasOrdenadas.find((c) => c.bookmaker_catalogo_id === catId);
        if (cel?.cpf_index) map.set(camp.id, cel.cpf_index);
      });
    }
    if (typeof window !== "undefined" && (window as any).__planejamentoDebug) {
      console.log("[Planejamento] campanhaCpfMap", {
        modoPlano,
        planoId: planoFiltroId,
        celulasPlano: celulasPlano.map((c) => ({ id: c.id, casa: c.bookmaker_nome, cpf_index: c.cpf_index, campanha_id: c.campanha_id, parceiro_id: c.parceiro_id })),
        campanhas: campanhas.map((c) => ({ id: c.id, casa: c.bookmaker_nome, parceiro_id: c.parceiro_id, bookmaker_catalogo_id: (c as any).bookmaker_catalogo_id })),
        map: Array.from(map.entries()),
      });
    }
    return map;
  }, [celulasPlano, campanhas, parceiroIdToCpfIdx, modoPlano, planoFiltroId]);

  const campanhaPlanoOrderMap = useMemo(() => {
    const map = new Map<string, number>();
    celulasPlano.forEach((c) => {
      if (c.campanha_id) map.set(c.campanha_id, c.ordem ?? Number.MAX_SAFE_INTEGER);
    });
    return map;
  }, [celulasPlano]);

  const campanhaPerfilMap = useMemo(() => {
    const map = new Map<string, (typeof perfisPre)[number]>();
    campanhas.forEach((camp) => {
      const perfilPorParceiro = camp.parceiro_id ? perfilByParceiroIdMap.get(camp.parceiro_id) : null;
      const cpfIdx = campanhaCpfMap.get(camp.id);
      const perfilPorCpf = cpfIdx ? cpfIndexToPerfilMap.get(cpfIdx) : null;
      const celula = celulasPlano.find((c) => c.campanha_id === camp.id);
      const perfilPorCelula = celula ? getCelulaPerfil(celula) : null;
      const perfil = perfilPorParceiro ?? perfilPorCelula ?? perfilPorCpf;
      if (perfil) map.set(camp.id, perfil);
    });
    return map;
  }, [campanhas, perfilByParceiroIdMap, campanhaCpfMap, cpfIndexToPerfilMap, celulasPlano, getCelulaPerfil]);

  const sortCampanhasByCpf = useCallback((list: PlanningCampanha[]) => {
    return [...list].sort((a, b) => {
      const cpfA = campanhaCpfMap.get(a.id) ?? Number.MAX_SAFE_INTEGER;
      const cpfB = campanhaCpfMap.get(b.id) ?? Number.MAX_SAFE_INTEGER;
      if (cpfA !== cpfB) return cpfA - cpfB;

      const ordemA = campanhaPlanoOrderMap.get(a.id) ?? Number.MAX_SAFE_INTEGER;
      const ordemB = campanhaPlanoOrderMap.get(b.id) ?? Number.MAX_SAFE_INTEGER;
      if (ordemA !== ordemB) return ordemA - ordemB;

      return a.bookmaker_nome.localeCompare(b.bookmaker_nome, "pt-BR");
    });
  }, [campanhaCpfMap, campanhaPlanoOrderMap]);

  // (modoPlano declarado acima)
  const sidebarItemsCount = modoPlano ? filteredCelulas.length : filteredBookmakers.length;

  const planoProgress = useMemo(() => {
    if (!modoPlano) return null;
    const base = grupoFiltroId === "todos"
      ? celulasPlano
      : celulasPlano.filter((c) => c.grupo_id === grupoFiltroId);
    const total = base.length;
    const lancadas = base.filter((c) => c.agendada_em || c.campanha_id).length;
    const pendentes = Math.max(0, total - lancadas);
    const percentual = total > 0 ? Math.round((lancadas / total) * 100) : 0;
    const label = grupoFiltroId === "todos"
      ? "Todos os grupos"
      : gruposDoPlano.find((g) => g.id === grupoFiltroId)?.nome ?? "Grupo";
    return { total, lancadas, pendentes, percentual, label };
  }, [modoPlano, celulasPlano, grupoFiltroId, gruposDoPlano]);

  // Excluir campanha do calendário (libera célula vinculada se houver)
  const handleDeleteCampanha = useCallback(async (campanhaId: string) => {
    try {
      await deleteCamp.mutateAsync(campanhaId);
      const celulaVinculada = celulasPlano.find((cel) => cel.campanha_id === campanhaId);
      if (celulaVinculada) {
        try {
          await desmarcarCelulaAgendada(celulaVinculada.id);
          qc.invalidateQueries({ queryKey: ["plano-celulas-disponiveis"] });
        } catch (err) {
          console.error("[planejamento] desmarcarCelula falhou", err);
        }
      }
      toast.success("Casa removida do calendário");
    } catch (err: any) {
      toast.error(err?.message || "Erro ao excluir");
    }
  }, [deleteCamp, celulasPlano, qc]);

  // Conflitos por dia
  const conflictMap = useMemo(() => {
    const map = new Map<string, Set<string>>();
    const byDay = new Map<string, PlanningCampanha[]>();
    campanhas.forEach(c => {
      if (!byDay.has(c.scheduled_date)) byDay.set(c.scheduled_date, []);
      byDay.get(c.scheduled_date)!.push(c);
    });
    byDay.forEach((list) => {
      const ipCount = new Map<string, number>();
      const pCount = new Map<string, number>();
      list.forEach(c => {
        if (c.ip_id) ipCount.set(c.ip_id, (ipCount.get(c.ip_id) ?? 0) + 1);
        if (c.parceiro_id) pCount.set(c.parceiro_id, (pCount.get(c.parceiro_id) ?? 0) + 1);
      });
      list.forEach(c => {
        const conflict = (c.ip_id && (ipCount.get(c.ip_id) ?? 0) > 1) || (c.parceiro_id && (pCount.get(c.parceiro_id) ?? 0) > 1);
        if (conflict) {
          if (!map.has(c.scheduled_date)) map.set(c.scheduled_date, new Set());
          map.get(c.scheduled_date)!.add(c.id);
        }
      });
    });
    return map;
  }, [campanhas]);

  // Validador de regras de grupo
  const { validate } = useGrupoRegrasValidator(campanhas);
  const grupoViolationMap = useMemo(() => {
    const map = new Map<string, { hasBlock: boolean; hasWarn: boolean }>();
    campanhas.forEach((c) => {
      const result = validate({
        bookmaker_catalogo_id: c.bookmaker_catalogo_id,
        parceiro_id: c.parceiro_id,
        ip_id: c.ip_id,
        wallet_id: c.wallet_id,
        scheduled_date: c.scheduled_date,
        excludeCampanhaId: c.id,
      });
      if (result.violations.length > 0 || result.warnings.length > 0) {
        map.set(c.id, {
          hasBlock: result.violations.length > 0,
          hasWarn: result.warnings.length > 0,
        });
      }
    });
    return map;
  }, [campanhas, validate]);

  // Construir grid do mês (semanas)
  const grid = useMemo(() => {
    const firstDay = new Date(year, month - 1, 1);
    const startWeekday = firstDay.getDay();
    const lastDay = new Date(year, month, 0).getDate();
    const cells: { date: Date; isCurrentMonth: boolean }[] = [];

    // Dias do mês anterior
    for (let i = startWeekday - 1; i >= 0; i--) {
      const d = new Date(year, month - 1, -i);
      cells.push({ date: d, isCurrentMonth: false });
    }
    // Dias do mês atual
    for (let i = 1; i <= lastDay; i++) cells.push({ date: new Date(year, month - 1, i), isCurrentMonth: true });
    // Completar até múltiplo de 7
    while (cells.length % 7 !== 0) {
      const last = cells[cells.length - 1].date;
      cells.push({ date: new Date(last.getFullYear(), last.getMonth(), last.getDate() + 1), isCurrentMonth: false });
    }
    return cells;
  }, [year, month]);

  const campanhasByDay = useMemo(() => {
    const m = new Map<string, PlanningCampanha[]>();
    campanhas.forEach(c => {
      if (!m.has(c.scheduled_date)) m.set(c.scheduled_date, []);
      m.get(c.scheduled_date)!.push(c);
    });
    m.forEach((list, key) => m.set(key, sortCampanhasByCpf(list)));
    return m;
  }, [campanhas, sortCampanhasByCpf]);

  const detailsCampanhas = detailsDate ? (campanhasByDay.get(detailsDate) ?? []) : [];

  // Totais (já convertidos para a moeda de exibição)
  const { totalDia, totalMes, totalCasasMes } = useMemo(() => {
    const dia = new Map<string, number>();
    let mes = 0;
    campanhas.forEach(c => {
      const valorConvertido = convertToDisplay(Number(c.deposit_amount), c.currency);
      dia.set(c.scheduled_date, (dia.get(c.scheduled_date) ?? 0) + valorConvertido);
      mes += valorConvertido;
    });
    return { totalDia: dia, totalMes: mes, totalCasasMes: campanhas.length };
  }, [campanhas, convertToDisplay]);

  const handleDragStart = (e: DragStartEvent) => setActiveDrag(e.active.data.current);

  const handleDragEnd = async (e: DragEndEvent) => {
    setActiveDrag(null);
    const { active, over } = e;
    if (!over) return;
    const overData: any = over.data.current;
    const data: any = active.data.current;

    // Drop na sidebar (zona "remover") → exclui campanha + libera célula vinculada
    if (overData?.type === "trash") {
      if (data?.type === "campanha") {
        const camp = campanhas.find((c) => c.id === data.campanhaId);
        await deleteCamp.mutateAsync(data.campanhaId);
        // Se a campanha estava vinculada a uma célula de plano, libera-a
        const celulaVinculada = celulasPlano.find((cel) => cel.campanha_id === data.campanhaId);
        if (celulaVinculada) {
          try {
            await desmarcarCelulaAgendada(celulaVinculada.id);
            qc.invalidateQueries({ queryKey: ["plano-celulas-disponiveis"] });
          } catch (err) {
            console.error("[planejamento] desmarcarCelula falhou", err);
          }
        }
      }
      return;
    }

    if (overData?.type !== "day") return;
    const dateKey = overData.dateKey;

    // Validação: não permitir datas passadas
    if (isDateInPast(dateKey)) {
      toast.error("Não é possível agendar campanhas em datas passadas.");
      return;
    }

    if (data?.type === "celula" || data?.type === "celula-batch") {
      // Arrasto de célula do PLANO → cria campanha já com CPF + casa + valor sugerido
      const celulas: CelulaDisponivel[] = data?.type === "celula-batch" ? data.items ?? [] : [data.celula];
      let ok = 0;
      let blocked = 0;
      for (const celula of celulas) {
      if (celula.agendada_em) {
        blocked++;
        continue;
      }
      const perfil = getCelulaPerfil(celula);
      const effectiveParceiroId = celula.parceiro_id ?? perfil?.parceiro_id ?? null;
      const linkedIpId = (perfil?.id ? ipByPerfilBookmakerMap.get(`${perfil.id}:${celula.bookmaker_catalogo_id}`) : null)
        ?? ipByBookmakerMap.get(celula.bookmaker_catalogo_id)
        ?? null;
      const check = validate({
        bookmaker_catalogo_id: celula.bookmaker_catalogo_id,
        parceiro_id: effectiveParceiroId,
        ip_id: linkedIpId,
        wallet_id: null,
        scheduled_date: dateKey,
      });
      if (check.violations.length > 0) {
        blocked++;
        continue;
      }
      try {
        const novaCamp: any = await upsert.mutateAsync({
          scheduled_date: dateKey,
          bookmaker_catalogo_id: celula.bookmaker_catalogo_id,
          bookmaker_nome: celula.bookmaker_nome,
          currency: celula.moeda,
          deposit_amount: celula.deposito_sugerido || 0,
          parceiro_id: effectiveParceiroId ?? undefined,
          ip_id: linkedIpId,
          status: "planned",
        } as any);
        // useUpsertCampanha retorna o ID como string (não objeto). Aceita ambos.
        const campanhaId =
          typeof novaCamp === "string"
            ? novaCamp
            : novaCamp?.id ?? novaCamp?.[0]?.id;
        if (campanhaId) {
          await marcarCelulaAgendada(celula.id, campanhaId);
          qc.invalidateQueries({ queryKey: ["plano-celulas-disponiveis"] });
        } else {
          console.warn("[planejamento] upsert não retornou id da campanha", novaCamp);
        }
        ok++;
      } catch (err: any) {
        console.error("[planejamento] erro ao agendar célula", err);
        blocked++;
      }
      }
      clearSelection();
      if (ok > 0 && blocked > 0) toast.warning(`${ok} agendadas, ${blocked} não puderam ser agendadas`);
      else if (ok > 0) toast.success(ok === 1 ? `${celulas[0]?.bookmaker_nome} agendada` : `${ok} células agendadas`);
      else toast.error("Nenhuma célula pôde ser agendada");
    } else if (data?.type === "bookmaker" || data?.type === "bookmaker-batch") {
      const items: BookmakerDragItem[] = data?.type === "bookmaker-batch" ? data.items ?? [] : [{ id: data.bookmakerId, nome: data.nome, moeda: data.moeda }];
      let ok = 0;
      let blocked = 0;
      for (const item of items) {
      const linkedIpId = ipByBookmakerMap.get(item.id) ?? null;
      // Valida regras de grupo antes de criar campanha pendente
      const check = validate({
        bookmaker_catalogo_id: item.id,
        parceiro_id: null,
        ip_id: linkedIpId,
        wallet_id: null,
        scheduled_date: dateKey,
      });
      if (check.violations.length > 0) {
        blocked++;
        continue;
      }
      // Cria campanha PENDENTE imediatamente (sem abrir modal)
      await upsert.mutateAsync({
        scheduled_date: dateKey,
        bookmaker_catalogo_id: item.id,
        bookmaker_nome: item.nome,
        currency: item.moeda,
        deposit_amount: 0,
        ip_id: linkedIpId,
        status: "planned",
      });
      ok++;
      }
      clearSelection();
      if (ok > 0 && blocked > 0) toast.warning(`${ok} casas agendadas, ${blocked} bloqueadas por regra`);
      else if (ok > 0) toast.success(ok === 1 ? `${items[0]?.nome} agendada` : `${ok} casas agendadas`);
      else toast.error("Nenhuma casa pôde ser agendada");
    } else if (data?.type === "campanha") {
      // Mover campanha existente para outra data → pede confirmação
      const camp = campanhas.find(c => c.id === data.campanhaId);
      if (camp && camp.scheduled_date !== dateKey) {
        // Valida regras de grupo na nova data
        const check = validate({
          bookmaker_catalogo_id: camp.bookmaker_catalogo_id,
          parceiro_id: camp.parceiro_id,
          ip_id: camp.ip_id,
          wallet_id: camp.wallet_id,
          scheduled_date: dateKey,
          excludeCampanhaId: camp.id,
        });
        if (check.violations.length > 0) {
          toast.error(`Bloqueado por regra de grupo: ${check.violations[0].mensagem}`);
          return;
        }
        if (moveConfirmed) {
          // Já confirmou uma vez nesta sessão → move direto
          await upsert.mutateAsync({ ...camp, scheduled_date: dateKey });
          toast.success("Campanha movida");
        } else {
          setPendingMove({ campanha: camp, fromDate: camp.scheduled_date, toDate: dateKey });
        }
      }
    }
  };

  const confirmMove = async () => {
    if (!pendingMove) return;
    await upsert.mutateAsync({ ...pendingMove.campanha, scheduled_date: pendingMove.toDate });
    toast.success("Campanha movida");
    setMoveConfirmed(true);
    setPendingMove(null);
  };

  const prevMonth = () => { if (month === 1) { setMonth(12); setYear(year - 1); } else setMonth(month - 1); };
  const nextMonth = () => { if (month === 12) { setMonth(1); setYear(year + 1); } else setMonth(month + 1); };

  return (
    <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      <div className="flex h-full gap-3 p-3">
        {/* Sidebar de bookmakers */}
        <Card className={cn(
          "p-3 flex flex-col gap-2 shrink-0 transition-[width] duration-300",
          sidebarCollapsed ? "w-12 items-center" : "w-72"
        )}>
          {sidebarCollapsed ? (
            <>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setSidebarCollapsed(false)}
                title="Expandir casas disponíveis"
                className="h-8 w-8"
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
              <Badge variant="secondary" className="text-[10px] h-4 px-1">
                {sidebarItemsCount}
              </Badge>
              <div className="writing-mode-vertical text-[11px] text-muted-foreground font-semibold tracking-wider [writing-mode:vertical-rl] rotate-180 mt-2">
                Casas disponíveis
              </div>
              <div className="flex-1" />
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setRecursosOpen(true)}
                title="Gerenciar recursos"
                className="h-8 w-8"
              >
                <Settings2 className="h-4 w-4" />
              </Button>
            </>
          ) : (
            <>
              <div className="flex items-center justify-between">
                <div className="text-sm font-semibold">Casas disponíveis</div>
                <div className="flex items-center gap-1">
                  <Badge variant="secondary" className="text-[10px] h-4 px-1">{sidebarItemsCount}</Badge>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setSidebarCollapsed(true)}
                    title="Minimizar"
                    className="h-6 w-6"
                  >
                    <ChevronLeft className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
              <p className="text-[11px] text-muted-foreground">
                {modoPlano
                  ? "Células do plano — Ctrl/Cmd + clique seleciona várias"
                  : "Ctrl/Cmd + clique seleciona várias"}
              </p>

              {(selectedBookmakerIds.size > 0 || selectedCelulaIds.size > 0) && (
                <div className="flex items-center justify-between rounded-md border bg-primary/10 px-2 py-1 text-[11px] text-primary">
                  <span className="font-medium">
                    {selectedBookmakerIds.size + selectedCelulaIds.size} selecionada(s)
                  </span>
                  <button type="button" className="hover:underline" onClick={clearSelection}>
                    Limpar
                  </button>
                </div>
              )}

              {/* Seletor de Plano de Distribuição */}
              <Select value={planoFiltroId} onValueChange={(v) => { setPlanoFiltroId(v); setGrupoFiltroId("todos"); setCpfFiltroIdx("todos"); }}>
                <SelectTrigger className="h-7 text-xs">
                  <SelectValue placeholder="Plano de distribuição" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Sem plano (casas livres)</SelectItem>
                  {planos.map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {/* Filtro de Grupo (só faz sentido com plano) */}
              {modoPlano && gruposDoPlano.length > 0 && (
                <Select value={grupoFiltroId} onValueChange={setGrupoFiltroId}>
                  <SelectTrigger className="h-7 text-xs">
                    <SelectValue placeholder="Grupo" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todos">Todos os grupos</SelectItem>
                    {gruposDoPlano.map((g) => (
                      <SelectItem key={g.id} value={g.id}>
                        <div className="flex items-center gap-2">
                          <div className="h-2 w-2 rounded-full" style={{ backgroundColor: g.cor }} />
                          {g.nome}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}

              {planoProgress && (
                <div className="rounded-md border bg-card p-2 space-y-1.5">
                  <div className="flex items-center justify-between gap-2 text-[11px]">
                    <span className="font-semibold truncate">{planoProgress.label}</span>
                    <span className="text-muted-foreground shrink-0">{planoProgress.percentual}%</span>
                  </div>
                  <Progress value={planoProgress.percentual} className="h-2" />
                  <div className="grid grid-cols-3 gap-1 text-center text-[10px]">
                    <div className="rounded bg-muted/50 px-1 py-1">
                      <div className="font-semibold">{planoProgress.total}</div>
                      <div className="text-muted-foreground">Total</div>
                    </div>
                    <div className="rounded bg-primary/10 px-1 py-1 text-primary">
                      <div className="font-semibold">{planoProgress.lancadas}</div>
                      <div>Lançadas</div>
                    </div>
                    <div className="rounded bg-muted/50 px-1 py-1">
                      <div className="font-semibold">{planoProgress.pendentes}</div>
                      <div className="text-muted-foreground">Faltam</div>
                    </div>
                  </div>
                </div>
              )}

              {/* Filtro de CPF — chips coloridos para diferenciar visualmente */}
              {modoPlano && cpfsDoPlano.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  <button
                    type="button"
                    onClick={() => setCpfFiltroIdx("todos")}
                    className={cn(
                      "text-[10px] font-semibold px-2 py-1 rounded-md border transition-all",
                      cpfFiltroIdx === "todos"
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-muted/50 text-muted-foreground border-border hover:bg-muted"
                    )}
                  >
                    Todos
                  </button>
                  {cpfsDoPlano.map((idx) => {
                    const perfil = cpfIndexToPerfilMap.get(idx);
                    const color = getCpfColor(idx, perfil?.cor);
                    const active = cpfFiltroIdx === String(idx);
                    return (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => setCpfFiltroIdx(active ? "todos" : String(idx))}
                        className={cn(
                          "text-[10px] font-bold px-2 py-1 rounded-md border-2 transition-all",
                          active ? "ring-2 ring-offset-1 ring-offset-background" : "opacity-70 hover:opacity-100"
                        )}
                        style={{
                          backgroundColor: active ? color?.border : color?.bg,
                          borderColor: color?.border,
                          color: active ? "hsl(0 0% 100%)" : color?.text,
                        }}
                        title={`Mostrar somente CPF ${idx}`}
                      >
                        CPF {idx}
                      </button>
                    );
                  })}
                </div>
              )}

              <div className="relative">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
                <Input
                  value={bmSearch}
                  onChange={e => setBmSearch(e.target.value)}
                  placeholder="Buscar..."
                  className="pl-6 h-7 text-xs"
                />
              </div>

              {/* Filtro de regulamentação só faz sentido em modo "casas livres" */}
              {!modoPlano && (
                <RegulamentacaoFilter
                  value={bmFilter}
                  onChange={setBmFilter}
                  size="sm"
                  orientation="vertical"
                />
              )}

              <TrashDropZone active={activeDrag?.type === "campanha"} />

              <div className="flex-1 overflow-y-auto space-y-1 mt-1 -mx-1 px-1">
                {modoPlano ? (
                  <>
                    {filteredCelulas.map((c) => (
                      <DraggableCelula
                        key={c.id}
                        celula={c}
                        parceiroNome={getCelulaPerfil(c)?.parceiro_id ? parceiroMap[getCelulaPerfil(c)!.parceiro_id!]?.nome : undefined}
                        perfilCor={getCelulaPerfil(c)?.cor}
                        selected={selectedCelulaIds.has(c.id)}
                        selectedBatch={selectedCelulaBatch}
                        onToggleSelect={() => toggleCelulaSelection(c.id)}
                      />
                    ))}
                    {filteredCelulas.length === 0 && (
                      <p className="text-xs text-muted-foreground italic text-center py-4">
                        {celulasPlano.length === 0
                          ? "Plano sem células."
                          : "Sem resultados."}
                      </p>
                    )}
                  </>
                ) : (
                  <>
                    {filteredBookmakers.map(b => (
                      <DraggableBookmaker
                        key={b.id}
                        id={b.id}
                        nome={b.nome}
                        moeda={b.moeda_padrao}
                        status={b.status}
                        logoUrl={b.logo_url}
                        selected={selectedBookmakerIds.has(b.id)}
                        selectedBatch={selectedBookmakerBatch}
                        onToggleSelect={() => toggleBookmakerSelection(b.id)}
                      />
                    ))}
                    {filteredBookmakers.length === 0 && (
                      <p className="text-xs text-muted-foreground italic text-center py-4">
                        {bookmakers.length === 0 ? "Nenhuma casa cadastrada." : "Sem resultados."}
                      </p>
                    )}
                  </>
                )}
              </div>
              <Button variant="outline" size="sm" onClick={() => setRecursosOpen(true)}>
                <Settings2 className="h-4 w-4 mr-1" /> Gerenciar recursos
              </Button>
            </>
          )}
        </Card>

        {/* Calendário */}
        <div className="flex-1 flex flex-col gap-3 min-w-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="icon" onClick={prevMonth}><ChevronLeft className="h-4 w-4" /></Button>
              <h2 className="text-lg font-bold w-44 text-center">{MES_NOMES[month - 1]} {year}</h2>
              <Button variant="ghost" size="icon" onClick={nextMonth}><ChevronRight className="h-4 w-4" /></Button>
              <Button variant="outline" size="sm" onClick={() => { setYear(today.getFullYear()); setMonth(today.getMonth() + 1); }}>Hoje</Button>
            </div>
            <div className="flex items-center gap-2">
              {modoPlano && (
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 text-[11px]"
                  onClick={() => setSimulacaoOpen(true)}
                  disabled={celulasPlano.filter((c) => !c.agendada_em && !c.campanha_id).length === 0}
                  title="Simular distribuição automática (preview)"
                >
                  <Sparkles className="h-3.5 w-3.5 mr-1" />
                  Simular distribuição
                </Button>
              )}
              <div className="flex items-center rounded-md border bg-card p-0.5">
                <Button
                  variant={displayCurrency === "BRL" ? "default" : "ghost"}
                  size="sm"
                  className="h-6 px-2 text-[11px]"
                  onClick={() => setDisplayCurrency("BRL")}
                >
                  BRL
                </Button>
                <Button
                  variant={displayCurrency === "USD" ? "default" : "ghost"}
                  size="sm"
                  className="h-6 px-2 text-[11px]"
                  onClick={() => setDisplayCurrency("USD")}
                  title={isUsingFallback ? "Usando cotação de fallback" : `1 USD = R$ ${cotacaoUSD.toFixed(4)}`}
                >
                  USD {isUsingFallback && "⚠️"}
                </Button>
              </div>
              <Badge variant="secondary" className="text-sm">
                {totalCasasMes} casas • Total do mês: {formatMoney(totalMes, displayCurrency)}
              </Badge>
            </div>
          </div>

          <div className="grid grid-cols-7 gap-1 text-center text-xs font-medium text-muted-foreground">
            {DIAS_SEMANA.map(d => <div key={d} className="py-1">{d}</div>)}
          </div>

          <div className="grid grid-cols-7 gap-1 flex-1 overflow-y-auto">
            {grid.map((cell, idx) => {
              const key = formatDateKey(cell.date);
              const dayCamps = campanhasByDay.get(key) ?? [];
              const dayTotal = totalDia.get(key) ?? 0;
              const dayConflicts = conflictMap.get(key) ?? new Set();
              return (
                <div key={idx} className="group">
                  <DayCell
                    date={cell.date}
                    isCurrentMonth={cell.isCurrentMonth}
                    onAdd={() => setEditing({ date: key })}
                    onOpenDetails={() => setDetailsDate(key)}
                  >
                    {dayCamps.map(c => {
                      const grupoStatus = grupoViolationMap.get(c.id);
                      return (
                        <DraggableCampanha
                          key={c.id}
                          campanha={c}
                          onClick={() => setEditing({ date: key, campanha: c })}
                          onDelete={() => handleDeleteCampanha(c.id)}
                          ipLabel={c.ip_id ? ipMap[c.ip_id]?.label : undefined}
                          parceiroNome={c.parceiro_id ? parceiroMap[c.parceiro_id]?.nome : campanhaPerfilMap.get(c.id)?.parceiro_id ? parceiroMap[campanhaPerfilMap.get(c.id)!.parceiro_id!]?.nome : undefined}
                          hasConflict={dayConflicts.has(c.id)}
                          isPending={isCampanhaPending(c)}
                          logoUrl={getLogoUrl(c.bookmaker_nome)}
                          grupoBlock={grupoStatus?.hasBlock}
                          grupoWarn={grupoStatus?.hasWarn}
                          cpfIndex={campanhaCpfMap.get(c.id) ?? null}
                          perfilCor={campanhaPerfilMap.get(c.id)?.cor}
                        />
                      );
                    })}
                    {dayTotal > 0 && (
                      <div className="text-[10px] text-muted-foreground border-t pt-0.5 mt-auto">
                        {dayCamps.length} casas • Σ {formatMoney(dayTotal, displayCurrency)}
                      </div>
                    )}
                  </DayCell>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <DragOverlay>
        {activeDrag?.type === "bookmaker" && (
          <div className="px-2 py-1.5 rounded-md border bg-card text-xs shadow-lg">
            <div className="font-medium">{activeDrag.nome}</div>
            <div className="text-[10px] text-muted-foreground">{activeDrag.moeda}</div>
          </div>
        )}
        {(activeDrag?.type === "bookmaker-batch" || activeDrag?.type === "celula-batch") && (
          <div className="px-3 py-2 rounded-md border bg-card text-xs shadow-lg">
            <div className="font-semibold">{activeDrag.count} itens selecionados</div>
            <div className="text-[10px] text-muted-foreground">Solte no dia desejado</div>
          </div>
        )}
        {activeDrag?.type === "celula" && (
          <div className="px-2 py-1.5 rounded-md border bg-card text-xs shadow-lg">
            <div className="font-medium">{activeDrag.celula?.bookmaker_nome}</div>
            <div className="text-[10px] text-muted-foreground">{activeDrag.celula?.moeda}</div>
          </div>
        )}
      </DragOverlay>

      {editing && (
        <CampanhaDialog
          open
          onOpenChange={(v) => !v && setEditing(null)}
          scheduledDate={editing.date}
          initialBookmaker={editing.initialBookmaker}
          campanha={editing.campanha}
          campanhasDoMes={campanhas}
          suggestedParceiroId={editing.campanha ? campanhaPerfilMap.get(editing.campanha.id)?.parceiro_id ?? null : null}
        />
      )}

      <Dialog open={!!detailsDate} onOpenChange={(open) => !open && setDetailsDate(null)}>
        <DialogContent className="max-w-4xl max-h-[82vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>Casas planejadas do dia {detailsDate?.split("-").reverse().join("/")}</DialogTitle>
            <DialogDescription>
              {detailsCampanhas.length} casas • Σ {formatMoney(detailsCampanhas.reduce((sum, c) => sum + convertToDisplay(Number(c.deposit_amount), c.currency), 0), displayCurrency)}
            </DialogDescription>
          </DialogHeader>
          <div className="overflow-auto rounded-md border">
            <div className="grid grid-cols-[1.2fr_1fr_1fr_1fr_0.7fr_0.8fr] gap-2 px-3 py-2 text-[11px] font-semibold text-muted-foreground bg-muted/40 min-w-[760px]">
              <div>Casa</div>
              <div>Perfil</div>
              <div>IP utilizado</div>
              <div>Wallet</div>
              <div>Moeda</div>
              <div className="text-right">Valor</div>
            </div>
            <div className="min-w-[760px] divide-y">
              {detailsCampanhas.map((c) => {
                const perfilInfo = campanhaPerfilMap.get(c.id);
                const celula = celulasPlano.find((item) => item.campanha_id === c.id);
                const bookmakerCatalogoId = c.bookmaker_catalogo_id ?? celula?.bookmaker_catalogo_id ?? null;
                const linkedIpId = c.ip_id
                  ?? (perfilInfo?.id && bookmakerCatalogoId ? ipByPerfilBookmakerMap.get(`${perfilInfo.id}:${bookmakerCatalogoId}`) : null)
                  ?? (c.parceiro_id && bookmakerCatalogoId ? ipByParceiroBookmakerMap.get(`${c.parceiro_id}:${bookmakerCatalogoId}`) : null)
                  ?? (perfilInfo?.parceiro_id && bookmakerCatalogoId ? ipByParceiroBookmakerMap.get(`${perfilInfo.parceiro_id}:${bookmakerCatalogoId}`) : null)
                  ?? (bookmakerCatalogoId ? ipByBookmakerMap.get(bookmakerCatalogoId) : null)
                  ?? null;
                const ip = linkedIpId ? ipMap[linkedIpId] : null;
                const wallet = c.wallet_id ? wallets.find((w) => w.id === c.wallet_id) : null;
                const perfil = c.parceiro_id ? parceiroMap[c.parceiro_id]?.nome : perfilInfo?.parceiro_id ? parceiroMap[perfilInfo.parceiro_id]?.nome : null;
                const cpfIndex = campanhaCpfMap.get(c.id) ?? null;
                const cpfColor = getCpfColor(cpfIndex, perfilInfo?.cor);
                return (
                  <div key={c.id} className="grid grid-cols-[1.2fr_1fr_1fr_1fr_0.7fr_0.8fr] gap-2 px-3 py-2 text-xs items-center hover:bg-muted/30">
                    <div className="font-medium truncate flex items-center gap-2">
                      {cpfIndex && cpfColor && (
                        <span className="h-5 w-5 shrink-0 rounded flex items-center justify-center text-[10px] font-bold" style={{ backgroundColor: cpfColor.dot, color: "hsl(0 0% 10%)" }}>{cpfIndex}</span>
                      )}
                      <BookmakerLogo logoUrl={getLogoUrl(c.bookmaker_nome)} alt={c.bookmaker_nome} size="h-6 w-6 shrink-0" iconSize="h-3.5 w-3.5" />
                      <span className="truncate">{c.bookmaker_nome}</span>
                    </div>
                    <div className="truncate">{perfil ?? "—"}</div>
                    <div className="truncate">{ip ? `${ip.label}${ip.ip_address ? ` • ${ip.ip_address}` : ""}` : "—"}</div>
                    <div className="truncate">{wallet ? `${wallet.label}${wallet.network ? ` • ${wallet.network}` : ""}` : "—"}</div>
                    <div className="font-semibold">{c.currency}</div>
                    <div className="text-right font-semibold tabular-nums">{formatMoney(Number(c.deposit_amount), c.currency)}</div>
                  </div>
                );
              })}
              {detailsCampanhas.length === 0 && (
                <div className="px-3 py-8 text-center text-sm text-muted-foreground">Nenhuma casa planejada neste dia.</div>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <RecursosManager open={recursosOpen} onOpenChange={setRecursosOpen} />

      <AlertDialog open={!!pendingMove} onOpenChange={(v) => !v && setPendingMove(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-warning" />
              Mover campanha?
            </AlertDialogTitle>
            <AlertDialogDescription>
              {pendingMove && (
                <>
                  Você está movendo a campanha de{" "}
                  <span className="font-semibold text-foreground">
                    {pendingMove.campanha.bookmaker_nome}
                  </span>{" "}
                  do dia{" "}
                  <span className="font-semibold text-foreground">
                    {pendingMove.fromDate.split("-").reverse().join("/")}
                  </span>{" "}
                  para{" "}
                  <span className="font-semibold text-foreground">
                    {pendingMove.toDate.split("-").reverse().join("/")}
                  </span>
                  . Confirma a alteração?
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmMove}>Mover</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <SimulacaoDistribuicaoDialog
        open={simulacaoOpen}
        onOpenChange={setSimulacaoOpen}
        celulas={celulasPlano}
        campanhasExistentes={campanhas}
        year={year}
        month={month}
      />
    </DndContext>
  );
}
