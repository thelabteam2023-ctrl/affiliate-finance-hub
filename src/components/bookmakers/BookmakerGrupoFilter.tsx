import { useMemo } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useBookmakerGrupos } from "@/hooks/useBookmakerGrupos";
import { FolderOpen } from "lucide-react";

interface BookmakerGrupoFilterProps {
  value: string;
  onChange: (value: string) => void;
  /** If provided, only show groups that have at least one member in this set */
  availableCatalogoIds?: Set<string>;
  className?: string;
}

export function BookmakerGrupoFilter({ value, onChange, availableCatalogoIds, className }: BookmakerGrupoFilterProps) {
  const { grupos, getCatalogoIdsByGrupo } = useBookmakerGrupos();

  const visibleGrupos = useMemo(() => {
    if (!availableCatalogoIds) return grupos;
    return grupos.filter((g) => {
      const members = getCatalogoIdsByGrupo(g.id);
      return Array.from(members).some((id) => availableCatalogoIds.has(id));
    });
  }, [grupos, availableCatalogoIds, getCatalogoIdsByGrupo]);

  if (visibleGrupos.length === 0) return null;

  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className={className || "w-[200px]"}>
        <div className="flex items-center gap-1.5">
          <FolderOpen className="h-3.5 w-3.5 text-muted-foreground" />
          <SelectValue placeholder="Grupo" />
        </div>
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="todos">Todos os grupos</SelectItem>
        {visibleGrupos.map((g) => (
          <SelectItem key={g.id} value={g.id}>
            <div className="flex items-center gap-2">
              <div className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: g.cor || "#6366f1" }} />
              {g.nome}
            </div>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
