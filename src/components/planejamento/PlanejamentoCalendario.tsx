import { useMemo, useState } from "react";
import {
  DndContext, DragEndEvent, DragOverlay, DragStartEvent,
  PointerSensor, useDraggable, useDroppable, useSensor, useSensors,
} from "@dnd-kit/core";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ChevronLeft, ChevronRight, Settings2, Plus, AlertTriangle, MapPin, User, Wallet } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  PlanningCampanha,
  useBookmakersCatalogo,
  usePlanningCampanhas,
  usePlanningIps,
  usePlanningWallets,
  useParceirosLite,
  useUpsertCampanha,
} from "@/hooks/usePlanningData";
import { CampanhaDialog } from "./CampanhaDialog";
import { RecursosManager } from "./RecursosManager";

const MES_NOMES = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
const DIAS_SEMANA = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

function formatDateKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function formatMoney(v: number, currency: string) {
  try {
    return new Intl.NumberFormat("pt-BR", { style: "currency", currency }).format(v);
  } catch {
    return `${currency} ${v.toFixed(2)}`;
  }
}

// ──────── Componentes drag-and-drop ────────

function DraggableBookmaker({ id, nome, moeda }: { id: string; nome: string; moeda: string }) {
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
        "px-2 py-1.5 rounded-md border bg-card text-xs cursor-grab active:cursor-grabbing hover:border-primary transition-colors",
        isDragging && "opacity-40"
      )}
    >
      <div className="font-medium truncate">{nome}</div>
      <div className="text-[10px] text-muted-foreground">{moeda}</div>
    </div>
  );
}

function DraggableCampanha({ campanha, onClick, ipLabel, parceiroNome, hasConflict }: {
  campanha: PlanningCampanha;
  onClick: () => void;
  ipLabel?: string;
  parceiroNome?: string;
  hasConflict: boolean;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `camp-${campanha.id}`,
    data: { type: "campanha", campanhaId: campanha.id },
  });
  return (
    <div
      ref={setNodeRef}
      {...attributes}
      className={cn(
        "rounded border bg-primary/5 hover:bg-primary/10 border-primary/30 px-1.5 py-1 text-[10px] leading-tight cursor-pointer transition-colors",
        hasConflict && "border-destructive/60 bg-destructive/5",
        isDragging && "opacity-40"
      )}
      onClick={onClick}
    >
      <div className="flex items-start justify-between gap-1">
        <span className="font-semibold truncate flex-1">{campanha.bookmaker_nome}</span>
        <span {...listeners} className="cursor-grab active:cursor-grabbing select-none px-0.5" onClick={(e) => e.stopPropagation()}>⋮⋮</span>
      </div>
      <div className="text-primary font-medium">{formatMoney(Number(campanha.deposit_amount), campanha.currency)}</div>
      {(ipLabel || parceiroNome) && (
        <div className="text-muted-foreground truncate flex items-center gap-1">
          {parceiroNome && <><User className="h-2.5 w-2.5" />{parceiroNome.split(" ")[0]}</>}
          {ipLabel && <><MapPin className="h-2.5 w-2.5" />{ipLabel}</>}
        </div>
      )}
      {hasConflict && (
        <div className="text-destructive text-[9px] flex items-center gap-0.5">
          <AlertTriangle className="h-2.5 w-2.5" /> conflito
        </div>
      )}
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
  const { setNodeRef, isOver } = useDroppable({ id: `day-${dateKey}`, data: { type: "day", dateKey } });
  const isToday = formatDateKey(new Date()) === dateKey;

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "min-h-[110px] border rounded-md p-1 flex flex-col gap-1 transition-colors",
        !isCurrentMonth && "bg-muted/30 opacity-50",
        isOver && "ring-2 ring-primary bg-primary/5",
        isToday && "border-primary"
      )}
    >
      <div className="flex items-center justify-between">
        <span className={cn("text-xs font-medium", isToday && "text-primary")}>{date.getDate()}</span>
        {isCurrentMonth && (
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

  const { data: campanhas = [] } = usePlanningCampanhas(year, month);
  const { data: bookmakers = [] } = useBookmakersCatalogo();
  const { data: ips = [] } = usePlanningIps();
  const { data: parceiros = [] } = useParceirosLite();
  const upsert = useUpsertCampanha();

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  // Mapas auxiliares
  const ipMap = useMemo(() => Object.fromEntries(ips.map(i => [i.id, i])), [ips]);
  const parceiroMap = useMemo(() => Object.fromEntries(parceiros.map(p => [p.id, p])), [parceiros]);

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

  // Totais
  const { totalDia, totalMes } = useMemo(() => {
    const dia = new Map<string, number>();
    let mes = 0;
    campanhas.forEach(c => {
      dia.set(c.scheduled_date, (dia.get(c.scheduled_date) ?? 0) + Number(c.deposit_amount));
      mes += Number(c.deposit_amount);
    });
    return { totalDia: dia, totalMes: mes };
  }, [campanhas]);

  const handleDragStart = (e: DragStartEvent) => setActiveDrag(e.active.data.current);

  const handleDragEnd = async (e: DragEndEvent) => {
    setActiveDrag(null);
    const { active, over } = e;
    if (!over) return;
    const overData: any = over.data.current;
    if (overData?.type !== "day") return;
    const dateKey = overData.dateKey;
    const data: any = active.data.current;

    if (data?.type === "bookmaker") {
      // Abrir dialog para definir valor/IP/perfil
      setEditing({
        date: dateKey,
        initialBookmaker: { id: data.bookmakerId, nome: data.nome, moeda_padrao: data.moeda },
      });
    } else if (data?.type === "campanha") {
      // Mover campanha existente
      const camp = campanhas.find(c => c.id === data.campanhaId);
      if (camp && camp.scheduled_date !== dateKey) {
        await upsert.mutateAsync({ ...camp, scheduled_date: dateKey });
      }
    }
  };

  const prevMonth = () => { if (month === 1) { setMonth(12); setYear(year - 1); } else setMonth(month - 1); };
  const nextMonth = () => { if (month === 12) { setMonth(1); setYear(year + 1); } else setMonth(month + 1); };

  return (
    <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      <div className="flex h-full gap-3 p-3">
        {/* Sidebar de bookmakers */}
        <Card className="w-56 p-3 flex flex-col gap-2 shrink-0">
          <div className="text-sm font-semibold">Casas disponíveis</div>
          <p className="text-[11px] text-muted-foreground">Arraste para o calendário</p>
          <div className="flex-1 overflow-y-auto space-y-1 mt-2 -mx-1 px-1">
            {bookmakers.map(b => (
              <DraggableBookmaker key={b.id} id={b.id} nome={b.nome} moeda={b.moeda_padrao} />
            ))}
            {bookmakers.length === 0 && (
              <p className="text-xs text-muted-foreground italic">Nenhuma casa cadastrada.</p>
            )}
          </div>
          <Button variant="outline" size="sm" onClick={() => setRecursosOpen(true)}>
            <Settings2 className="h-4 w-4 mr-1" /> Recursos
          </Button>
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
            <Badge variant="secondary" className="text-sm">
              Total do mês: {formatMoney(totalMes, "BRL")}
            </Badge>
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
                    {dayCamps.map(c => (
                      <DraggableCampanha
                        key={c.id}
                        campanha={c}
                        onClick={() => setEditing({ date: key, campanha: c })}
                        ipLabel={c.ip_id ? ipMap[c.ip_id]?.label : undefined}
                        parceiroNome={c.parceiro_id ? parceiroMap[c.parceiro_id]?.nome : undefined}
                        hasConflict={dayConflicts.has(c.id)}
                      />
                    ))}
                    {dayTotal > 0 && (
                      <div className="text-[10px] text-muted-foreground border-t pt-0.5 mt-auto">
                        Σ {formatMoney(dayTotal, "BRL")}
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
    </DndContext>
  );
}
