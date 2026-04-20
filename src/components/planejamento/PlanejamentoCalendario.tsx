import { useMemo, useState, useCallback, useEffect } from "react";
import {
  DndContext, DragEndEvent, DragOverlay, DragStartEvent,
  PointerSensor, useDraggable, useDroppable, useSensor, useSensors,
} from "@dnd-kit/core";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { ChevronLeft, ChevronRight, Settings2, Plus, AlertTriangle, MapPin, User, Search, Building2, Trash2, ChevronDown, ChevronUp, ShieldAlert, Pencil } from "lucide-react";
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

// Paleta de cores por CPF — diferenciar visualmente cada CPF do plano.
// Usa HSL fixo (não tokens) propositalmente para distinguir CPFs entre si.
const CPF_COLORS: { bg: string; border: string; text: string; dot: string }[] = [
  { bg: "hsl(45 95% 55% / 0.15)", border: "hsl(45 95% 55%)", text: "hsl(45 95% 65%)", dot: "hsl(45 95% 55%)" },   // amarelo
  { bg: "hsl(142 70% 45% / 0.15)", border: "hsl(142 70% 45%)", text: "hsl(142 70% 55%)", dot: "hsl(142 70% 45%)" }, // verde
  { bg: "hsl(217 90% 60% / 0.15)", border: "hsl(217 90% 60%)", text: "hsl(217 90% 70%)", dot: "hsl(217 90% 60%)" }, // azul
  { bg: "hsl(0 80% 60% / 0.15)", border: "hsl(0 80% 60%)", text: "hsl(0 80% 70%)", dot: "hsl(0 80% 60%)" },         // vermelho
  { bg: "hsl(280 70% 60% / 0.15)", border: "hsl(280 70% 60%)", text: "hsl(280 70% 70%)", dot: "hsl(280 70% 60%)" }, // roxo
  { bg: "hsl(25 90% 55% / 0.15)", border: "hsl(25 90% 55%)", text: "hsl(25 90% 65%)", dot: "hsl(25 90% 55%)" },     // laranja
  { bg: "hsl(180 70% 45% / 0.15)", border: "hsl(180 70% 45%)", text: "hsl(180 70% 55%)", dot: "hsl(180 70% 45%)" }, // ciano
  { bg: "hsl(330 75% 60% / 0.15)", border: "hsl(330 75% 60%)", text: "hsl(330 75% 70%)", dot: "hsl(330 75% 60%)" }, // pink
];

function getCpfColor(idx: number | null | undefined) {
  if (!idx || idx < 1) return null;
  return CPF_COLORS[(idx - 1) % CPF_COLORS.length];
}

// ──────── Componentes drag-and-drop ────────

function DraggableBookmaker({ id, nome, moeda, status, logoUrl }: {
  id: string; nome: string; moeda: string;
  status: "REGULAMENTADA" | "NAO_REGULAMENTADA";
  logoUrl: string | null;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `bm-${id}`,
    data: { type: "bookmaker", bookmakerId: id, nome, moeda },
  });
  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      className={cn(
        "px-2 py-1.5 rounded-md border bg-card text-xs cursor-grab active:cursor-grabbing hover:border-primary transition-colors flex items-center gap-2",
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
function DraggableCelula({ celula, parceiroNome }: { celula: CelulaDisponivel; parceiroNome?: string }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `cel-${celula.id}`,
    data: { type: "celula", celula },
  });
  const jaAgendada = !!celula.agendada_em;
  const cpfColor = getCpfColor(celula.cpf_index);
  const cpfTag = celula.cpf_index ? `CPF ${celula.cpf_index}` : null;
  const titleStr = jaAgendada
    ? `${celula.bookmaker_nome} • ${cpfTag ?? "CPF ?"}${parceiroNome ? ` (${parceiroNome})` : ""} • já agendada`
    : `${celula.bookmaker_nome} • ${cpfTag ?? "CPF ?"}${parceiroNome ? ` (${parceiroNome})` : ""} • ${celula.grupo_nome}`;
  return (
    <div
      ref={setNodeRef}
      {...(jaAgendada ? {} : listeners)}
      {...attributes}
      className={cn(
        "px-2 py-1.5 rounded-md border text-xs transition-colors flex items-center gap-2",
        jaAgendada
          ? "opacity-50 cursor-not-allowed bg-card"
          : "cursor-grab active:cursor-grabbing hover:brightness-110",
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

function DraggableCampanha({ campanha, onClick, onDelete, ipLabel, parceiroNome, hasConflict, isPending, logoUrl, grupoBlock, grupoWarn, cpfIndex }: {
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
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `camp-${campanha.id}`,
    data: { type: "campanha", campanhaId: campanha.id },
  });
  const hasValue = Number(campanha.deposit_amount) > 0;
  const cpfColor = getCpfColor(cpfIndex);
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

function DayCell({ date, isCurrentMonth, children, onAdd }: {
  date: Date;
  isCurrentMonth: boolean;
  children: React.ReactNode;
  onAdd: () => void;
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
      className={cn(
        "min-h-[110px] border rounded-md p-1 flex flex-col gap-1 transition-colors bg-muted/40",
        !isCurrentMonth && "bg-muted/10 opacity-50",
        isPast && "bg-muted/20 opacity-60 cursor-not-allowed",
        !isPast && isOver && "ring-2 ring-primary bg-primary/10",
        isToday && !isPast && "border-primary bg-primary/5"
      )}
    >
      <div className="flex items-center justify-between">
        <span className={cn("text-xs font-medium", isToday && !isPast && "text-primary", isPast && "text-muted-foreground")}>{date.getDate()}</span>
        {isCurrentMonth && !isPast && (
          <button onClick={onAdd} className="opacity-0 hover:opacity-100 group-hover:opacity-100 text-muted-foreground hover:text-primary">
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

  const { data: campanhas = [] } = usePlanningCampanhas(year, month);
  const { data: casasPlan = [] } = usePlanningCasas();
  const { data: ips = [] } = usePlanningIps();
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
  const parceiroMap = useMemo(() => {
    const labelOverride = new Map<string, string>();
    perfisPre.forEach(p => {
      if (p.label_custom) labelOverride.set(p.parceiro_id, p.label_custom);
    });
    return Object.fromEntries(
      parceiros.map(p => [p.id, { ...p, nome: labelOverride.get(p.id) ?? p.nome }]),
    );
  }, [parceiros, perfisPre]);

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
      if (grupoFiltroId !== "todos" && c.grupo_id !== grupoFiltroId) return false;
      if (cpfFiltroIdx !== "todos" && String(c.cpf_index ?? "") !== cpfFiltroIdx) return false;
      if (bmSearch && !c.bookmaker_nome.toLowerCase().includes(bmSearch.toLowerCase())) return false;
      return true;
    });
  }, [celulasPlano, grupoFiltroId, cpfFiltroIdx, bmSearch]);

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

  // Plano selecionado (para extrair parceiro_ids e mapear CPF por posição)
  const planoSelecionado = useMemo(
    () => planos.find((p) => p.id === planoFiltroId) ?? null,
    [planos, planoFiltroId]
  );
  const parceiroIdToCpfIdx = useMemo(() => {
    const m = new Map<string, number>();
    const ids: string[] = (planoSelecionado as any)?.parceiro_ids ?? [];
    ids.forEach((pid, idx) => m.set(pid, idx + 1));
    return m;
  }, [planoSelecionado]);

  // Mapa: campanha_id -> cpf_index (para colorir o card no calendário).
  // Estratégia: 1) vínculo direto via célula agendada; 2) fallback pelo parceiro_id
  // da campanha posicionado no parceiro_ids do plano (mesma lógica do hook).
  const campanhaCpfMap = useMemo(() => {
    const map = new Map<string, number>();
    celulasPlano.forEach((c) => {
      if (c.campanha_id && c.cpf_index) map.set(c.campanha_id, c.cpf_index);
    });
    campanhas.forEach((camp) => {
      if (map.has(camp.id)) return;
      if (camp.parceiro_id) {
        const idx = parceiroIdToCpfIdx.get(camp.parceiro_id);
        if (idx) map.set(camp.id, idx);
      }
    });
    return map;
  }, [celulasPlano, campanhas, parceiroIdToCpfIdx]);

  const modoPlano = planoFiltroId !== "none";
  const sidebarItemsCount = modoPlano ? filteredCelulas.length : filteredBookmakers.length;

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
    return m;
  }, [campanhas]);

  // Totais (já convertidos para a moeda de exibição)
  const { totalDia, totalMes } = useMemo(() => {
    const dia = new Map<string, number>();
    let mes = 0;
    campanhas.forEach(c => {
      const valorConvertido = convertToDisplay(Number(c.deposit_amount), c.currency);
      dia.set(c.scheduled_date, (dia.get(c.scheduled_date) ?? 0) + valorConvertido);
      mes += valorConvertido;
    });
    return { totalDia: dia, totalMes: mes };
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

    if (data?.type === "celula") {
      // Arrasto de célula do PLANO → cria campanha já com CPF + casa + valor sugerido
      const celula: CelulaDisponivel = data.celula;
      if (celula.agendada_em) {
        toast.warning("Esta célula já está agendada.");
        return;
      }
      const check = validate({
        bookmaker_catalogo_id: celula.bookmaker_catalogo_id,
        parceiro_id: celula.parceiro_id,
        ip_id: null,
        wallet_id: null,
        scheduled_date: dateKey,
      });
      if (check.violations.length > 0) {
        toast.error(`Bloqueado por regra de grupo: ${check.violations[0].mensagem}`);
        return;
      }
      try {
        const novaCamp: any = await upsert.mutateAsync({
          scheduled_date: dateKey,
          bookmaker_catalogo_id: celula.bookmaker_catalogo_id,
          bookmaker_nome: celula.bookmaker_nome,
          currency: celula.moeda,
          deposit_amount: celula.deposito_sugerido || 0,
          parceiro_id: celula.parceiro_id ?? undefined,
          status: "planned",
        } as any);
        // Marca célula como agendada (vincula à campanha criada, se id retornado)
        const campanhaId = novaCamp?.id ?? novaCamp?.[0]?.id;
        if (campanhaId) {
          await marcarCelulaAgendada(celula.id, campanhaId);
          qc.invalidateQueries({ queryKey: ["plano-celulas-disponiveis"] });
        }
        toast.success(`${celula.bookmaker_nome} agendada`);
      } catch (err: any) {
        toast.error(err?.message || "Erro ao agendar célula");
      }
    } else if (data?.type === "bookmaker") {
      // Valida regras de grupo antes de criar campanha pendente
      const check = validate({
        bookmaker_catalogo_id: data.bookmakerId,
        parceiro_id: null,
        ip_id: null,
        wallet_id: null,
        scheduled_date: dateKey,
      });
      if (check.violations.length > 0) {
        toast.error(`Bloqueado por regra de grupo: ${check.violations[0].mensagem}`);
        return;
      }
      // Cria campanha PENDENTE imediatamente (sem abrir modal)
      await upsert.mutateAsync({
        scheduled_date: dateKey,
        bookmaker_catalogo_id: data.bookmakerId,
        bookmaker_nome: data.nome,
        currency: data.moeda,
        deposit_amount: 0,
        status: "planned",
      });
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
                  ? "Células do plano — arraste para o calendário"
                  : "Arraste para o calendário"}
              </p>

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
                    const color = getCpfColor(idx);
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
                        parceiroNome={c.parceiro_id ? parceiroMap[c.parceiro_id]?.nome : undefined}
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
                Total do mês: {formatMoney(totalMes, displayCurrency)}
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
                          parceiroNome={c.parceiro_id ? parceiroMap[c.parceiro_id]?.nome : undefined}
                          hasConflict={dayConflicts.has(c.id)}
                          isPending={isCampanhaPending(c)}
                          logoUrl={getLogoUrl(c.bookmaker_nome)}
                          grupoBlock={grupoStatus?.hasBlock}
                          grupoWarn={grupoStatus?.hasWarn}
                          cpfIndex={campanhaCpfMap.get(c.id) ?? null}
                        />
                      );
                    })}
                    {dayTotal > 0 && (
                      <div className="text-[10px] text-muted-foreground border-t pt-0.5 mt-auto">
                        Σ {formatMoney(dayTotal, displayCurrency)}
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
      </DragOverlay>

      {editing && (
        <CampanhaDialog
          open
          onOpenChange={(v) => !v && setEditing(null)}
          scheduledDate={editing.date}
          initialBookmaker={editing.initialBookmaker}
          campanha={editing.campanha}
          campanhasDoMes={campanhas}
        />
      )}

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
    </DndContext>
  );
}
