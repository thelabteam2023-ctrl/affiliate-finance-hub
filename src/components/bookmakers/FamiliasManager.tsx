import { useMemo, useState } from "react";
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { useBookmakerFamilias, type CasaCatalogoLite } from "@/hooks/useBookmakerFamilias";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Plus, Search, Star, MoreVertical, Trash2, Pencil, X, GripVertical, Network } from "lucide-react";

const CORES = [
  "#6366f1", "#8b5cf6", "#ec4899", "#ef4444", "#f97316",
  "#eab308", "#22c55e", "#14b8a6", "#0ea5e9", "#64748b",
];

function CasaLogo({ casa, size = 24 }: { casa: CasaCatalogoLite; size?: number }) {
  if (casa.logo_url) {
    return (
      <img
        src={casa.logo_url}
        alt={casa.nome}
        style={{ width: size, height: size }}
        className="rounded object-contain bg-muted/30"
        loading="lazy"
      />
    );
  }
  return (
    <div
      style={{ width: size, height: size }}
      className="rounded bg-muted flex items-center justify-center text-[10px] font-semibold text-muted-foreground"
    >
      {casa.nome.slice(0, 2).toUpperCase()}
    </div>
  );
}

function CasaCard({
  casa,
  isReferencia = false,
  onRemove,
  onSetReferencia,
  compact = false,
  cor,
}: {
  casa: CasaCatalogoLite;
  isReferencia?: boolean;
  onRemove?: () => void;
  onSetReferencia?: () => void;
  compact?: boolean;
  cor?: string;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `casa:${casa.id}`,
    data: { catalogoId: casa.id },
  });

  return (
    <div
      ref={setNodeRef}
      {...attributes}
      className={`group relative flex items-center gap-2 rounded-md border bg-card px-2 py-1.5 text-sm transition-shadow ${
        isDragging ? "opacity-40" : "hover:shadow-sm"
      } ${isReferencia ? "border-amber-400/60 ring-1 ring-amber-400/30" : "border-border"}`}
      style={cor ? { borderLeft: `3px solid ${cor}` } : undefined}
    >
      <button
        {...listeners}
        className="cursor-grab active:cursor-grabbing text-muted-foreground/50 hover:text-muted-foreground"
        aria-label="Arrastar"
      >
        <GripVertical className="h-3.5 w-3.5" />
      </button>
      <CasaLogo casa={casa} size={compact ? 20 : 24} />
      <span className={`flex-1 truncate ${isReferencia ? "font-semibold" : ""}`}>
        {casa.nome}
      </span>
      {isReferencia && (
        <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400 shrink-0" />
      )}
      {(onRemove || onSetReferencia) && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-foreground"
              onClick={(e) => e.stopPropagation()}
            >
              <MoreVertical className="h-3.5 w-3.5" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {onSetReferencia && !isReferencia && (
              <DropdownMenuItem onClick={onSetReferencia}>
                <Star className="h-3.5 w-3.5 mr-2" />
                Definir como referência
              </DropdownMenuItem>
            )}
            {onRemove && (
              <DropdownMenuItem onClick={onRemove} className="text-destructive">
                <X className="h-3.5 w-3.5 mr-2" />
                Remover da família
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  );
}

function FamiliaCard({
  familia,
  casas,
  referenciaId,
  onRemoveCasa,
  onSetReferencia,
  onEdit,
  onDelete,
}: {
  familia: { id: string; nome: string; cor: string; descricao: string | null };
  casas: CasaCatalogoLite[];
  referenciaId: string | null;
  onRemoveCasa: (catalogoId: string) => void;
  onSetReferencia: (catalogoId: string) => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: `familia:${familia.id}`,
    data: { familiaId: familia.id },
  });

  const referencia = casas.find((c) => c.id === referenciaId);
  const clones = casas.filter((c) => c.id !== referenciaId);

  return (
    <Card
      ref={setNodeRef}
      className={`p-3 transition-colors ${isOver ? "ring-2 ring-primary bg-primary/5" : ""}`}
      style={{ borderLeft: `3px solid ${familia.cor}` }}
    >
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2 min-w-0">
          <div
            className="h-2.5 w-2.5 rounded-full shrink-0"
            style={{ backgroundColor: familia.cor }}
          />
          <h3 className="font-semibold text-sm truncate">{familia.nome}</h3>
          <Badge variant="secondary" className="text-[10px] h-5">
            {casas.length}
          </Badge>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-6 w-6">
              <MoreVertical className="h-3.5 w-3.5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={onEdit}>
              <Pencil className="h-3.5 w-3.5 mr-2" />
              Editar
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={onDelete} className="text-destructive">
              <Trash2 className="h-3.5 w-3.5 mr-2" />
              Excluir família
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      {familia.descricao && (
        <p className="text-xs text-muted-foreground mb-2">{familia.descricao}</p>
      )}
      <div className="space-y-1.5">
        {referencia && (
          <CasaCard
            casa={referencia}
            isReferencia
            cor={familia.cor}
            onRemove={() => onRemoveCasa(referencia.id)}
          />
        )}
        {clones.map((c) => (
          <CasaCard
            key={c.id}
            casa={c}
            cor={familia.cor}
            onRemove={() => onRemoveCasa(c.id)}
            onSetReferencia={() => onSetReferencia(c.id)}
          />
        ))}
        {casas.length === 0 && (
          <div className="text-xs text-muted-foreground italic border border-dashed rounded-md py-4 text-center">
            Arraste casas aqui
          </div>
        )}
      </div>
    </Card>
  );
}

function FamiliaDialog({
  open,
  onOpenChange,
  onSubmit,
  initial,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSubmit: (data: { nome: string; descricao: string; cor: string }) => void;
  initial?: { nome: string; descricao: string | null; cor: string } | null;
}) {
  const [nome, setNome] = useState(initial?.nome ?? "");
  const [descricao, setDescricao] = useState(initial?.descricao ?? "");
  const [cor, setCor] = useState(initial?.cor ?? CORES[0]);

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (v) {
          setNome(initial?.nome ?? "");
          setDescricao(initial?.descricao ?? "");
          setCor(initial?.cor ?? CORES[0]);
        }
        onOpenChange(v);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{initial ? "Editar família" : "Nova família"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>Nome do provedor</Label>
            <Input
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              placeholder="Ex: Kambi, SBTech, BetConstruct"
            />
          </div>
          <div>
            <Label>Descrição (opcional)</Label>
            <Textarea
              value={descricao}
              onChange={(e) => setDescricao(e.target.value)}
              placeholder="Observações sobre este provedor"
              rows={2}
            />
          </div>
          <div>
            <Label>Cor</Label>
            <div className="flex gap-2 flex-wrap mt-2">
              {CORES.map((c) => (
                <button
                  key={c}
                  onClick={() => setCor(c)}
                  className={`h-6 w-6 rounded-full transition-transform ${
                    cor === c ? "ring-2 ring-offset-2 ring-offset-background ring-foreground scale-110" : ""
                  }`}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            onClick={() => {
              if (!nome.trim()) return;
              onSubmit({ nome: nome.trim(), descricao: descricao.trim(), cor });
              onOpenChange(false);
            }}
          >
            {initial ? "Salvar" : "Criar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Pool({
  casas,
  search,
  onSearch,
}: {
  casas: CasaCatalogoLite[];
  search: string;
  onSearch: (s: string) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: "pool", data: { pool: true } });

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    if (!s) return casas;
    return casas.filter((c) => c.nome.toLowerCase().includes(s));
  }, [casas, search]);

  return (
    <Card
      ref={setNodeRef}
      className={`p-3 flex flex-col h-full transition-colors ${
        isOver ? "ring-2 ring-primary bg-primary/5" : ""
      }`}
    >
      <div className="flex items-center gap-2 mb-3">
        <Network className="h-4 w-4 text-muted-foreground" />
        <h3 className="font-semibold text-sm">Casas sem família</h3>
        <Badge variant="secondary" className="text-[10px] h-5 ml-auto">
          {casas.length}
        </Badge>
      </div>
      <div className="relative mb-3">
        <Search className="absolute left-2 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => onSearch(e.target.value)}
          placeholder="Buscar casa..."
          className="pl-8 h-9 text-sm"
        />
      </div>
      <div className="flex-1 overflow-y-auto space-y-1.5 pr-1">
        {filtered.map((c) => (
          <CasaCard key={c.id} casa={c} compact />
        ))}
        {filtered.length === 0 && (
          <div className="text-xs text-muted-foreground italic text-center py-8">
            {search ? "Nenhuma casa encontrada" : "Todas as casas estão em famílias"}
          </div>
        )}
      </div>
    </Card>
  );
}

export function FamiliasManager() {
  const {
    familias,
    membros,
    casas,
    isLoading,
    createFamilia,
    updateFamilia,
    deleteFamilia,
    moverCasaParaFamilia,
    removerCasa,
    definirReferencia,
  } = useBookmakerFamilias();

  const [search, setSearch] = useState("");
  const [familiaSearch, setFamiliaSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingFamilia, setEditingFamilia] = useState<any | null>(null);
  const [dragging, setDragging] = useState<CasaCatalogoLite | null>(null);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  // Índices
  const casasById = useMemo(() => new Map(casas.map((c) => [c.id, c])), [casas]);
  const membroPorCasa = useMemo(() => {
    const m = new Map<string, { familiaId: string; isReferencia: boolean }>();
    membros.forEach((mb) =>
      m.set(mb.bookmaker_catalogo_id, {
        familiaId: mb.familia_id,
        isReferencia: mb.is_referencia,
      })
    );
    return m;
  }, [membros]);

  const casasPorFamilia = useMemo(() => {
    const map = new Map<string, CasaCatalogoLite[]>();
    membros.forEach((mb) => {
      const casa = casasById.get(mb.bookmaker_catalogo_id);
      if (!casa) return; // casa restrita ou removida — não vaza
      const arr = map.get(mb.familia_id) ?? [];
      arr.push(casa);
      map.set(mb.familia_id, arr);
    });
    return map;
  }, [membros, casasById]);

  const referenciaPorFamilia = useMemo(() => {
    const map = new Map<string, string>();
    membros.forEach((mb) => {
      if (mb.is_referencia) map.set(mb.familia_id, mb.bookmaker_catalogo_id);
    });
    return map;
  }, [membros]);

  const casasNoPool = useMemo(
    () => casas.filter((c) => !membroPorCasa.has(c.id)),
    [casas, membroPorCasa]
  );

  const familiasFiltradas = useMemo(() => {
    const s = familiaSearch.trim().toLowerCase();
    if (!s) return familias;
    return familias.filter((f) => f.nome.toLowerCase().includes(s));
  }, [familias, familiaSearch]);

  const handleDragStart = (e: DragStartEvent) => {
    const catalogoId = e.active.data.current?.catalogoId;
    const casa = catalogoId ? casasById.get(catalogoId) : null;
    setDragging(casa ?? null);
  };

  const handleDragEnd = (e: DragEndEvent) => {
    setDragging(null);
    const catalogoId = e.active.data.current?.catalogoId as string | undefined;
    if (!catalogoId) return;
    const overData = e.over?.data.current as any;
    if (!overData) return;

    if (overData.pool) {
      // Solto no pool → remover de família
      if (membroPorCasa.has(catalogoId)) {
        removerCasa.mutate({ catalogoId });
      }
      return;
    }
    if (overData.familiaId) {
      const atual = membroPorCasa.get(catalogoId);
      if (atual?.familiaId === overData.familiaId) return; // sem mudança
      moverCasaParaFamilia.mutate({ catalogoId, familiaId: overData.familiaId });
    }
  };

  if (isLoading) {
    return <div className="text-muted-foreground text-sm py-8 text-center">Carregando famílias...</div>;
  }

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex items-center justify-between gap-2 mb-4 flex-wrap">
        <div>
          <h2 className="text-lg font-semibold">Famílias de Casas</h2>
          <p className="text-xs text-muted-foreground">
            Casas que compartilham o mesmo provedor de odds (clones). Gestão global.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              value={familiaSearch}
              onChange={(e) => setFamiliaSearch(e.target.value)}
              placeholder="Filtrar famílias..."
              className="pl-8 h-9 w-52 text-sm"
            />
          </div>
          <Button
            onClick={() => {
              setEditingFamilia(null);
              setDialogOpen(true);
            }}
            size="sm"
          >
            <Plus className="h-4 w-4 mr-1" />
            Nova família
          </Button>
        </div>
      </div>

      <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-4 flex-1 min-h-0">
          <div className="overflow-y-auto pr-1">
            {familiasFiltradas.length === 0 ? (
              <Card className="p-12 text-center">
                <Network className="h-10 w-10 mx-auto text-muted-foreground/50 mb-3" />
                <p className="text-sm text-muted-foreground mb-4">
                  {familias.length === 0
                    ? "Nenhuma família cadastrada. Crie a primeira para começar a agrupar casas clones."
                    : "Nenhuma família corresponde ao filtro."}
                </p>
                {familias.length === 0 && (
                  <Button onClick={() => setDialogOpen(true)} size="sm">
                    <Plus className="h-4 w-4 mr-1" />
                    Nova família
                  </Button>
                )}
              </Card>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                {familiasFiltradas.map((f) => (
                  <FamiliaCard
                    key={f.id}
                    familia={f}
                    casas={casasPorFamilia.get(f.id) ?? []}
                    referenciaId={referenciaPorFamilia.get(f.id) ?? null}
                    onRemoveCasa={(catalogoId) => removerCasa.mutate({ catalogoId })}
                    onSetReferencia={(catalogoId) => definirReferencia.mutate({ catalogoId })}
                    onEdit={() => {
                      setEditingFamilia(f);
                      setDialogOpen(true);
                    }}
                    onDelete={() => {
                      if (confirm(`Excluir família "${f.nome}"? As casas voltam ao pool.`)) {
                        deleteFamilia.mutate(f.id);
                      }
                    }}
                  />
                ))}
              </div>
            )}
          </div>
          <div className="min-h-0">
            <Pool casas={casasNoPool} search={search} onSearch={setSearch} />
          </div>
        </div>

        <DragOverlay>
          {dragging && (
            <div className="flex items-center gap-2 rounded-md border bg-card px-2 py-1.5 text-sm shadow-lg">
              <CasaLogo casa={dragging} size={20} />
              <span className="truncate">{dragging.nome}</span>
            </div>
          )}
        </DragOverlay>
      </DndContext>

      <FamiliaDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        initial={editingFamilia}
        onSubmit={(data) => {
          if (editingFamilia) {
            updateFamilia.mutate({ id: editingFamilia.id, ...data });
          } else {
            createFamilia.mutate(data);
          }
        }}
      />
    </div>
  );
}
