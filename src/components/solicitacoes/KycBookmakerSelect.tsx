import { useState, useMemo } from 'react';
import { Building2, Search, X, Check, ChevronDown } from 'lucide-react';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { useWorkspaceBookmakers } from '@/hooks/useWorkspaceBookmakers';
import type { WorkspaceBookmakerOption } from '@/hooks/useWorkspaceBookmakers';

interface KycBookmakerSelectProps {
  value: string;
  onValueChange: (id: string, data: WorkspaceBookmakerOption | null) => void;
  disabled?: boolean;
  error?: boolean;
}

export function KycBookmakerSelect({
  value,
  onValueChange,
  disabled,
  error,
}: KycBookmakerSelectProps) {
  const { data: allBookmakers = [], isLoading } = useWorkspaceBookmakers();

  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    if (!search.trim()) return allBookmakers;
    const term = search.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    return allBookmakers.filter((b) =>
      b.nome.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').includes(term),
    );
  }, [allBookmakers, search]);

  const selected = useMemo(
    () => allBookmakers.find((b) => b.id === value) ?? null,
    [allBookmakers, value],
  );

  const handleSelect = (item: WorkspaceBookmakerOption) => {
    onValueChange(item.id, item);
    setOpen(false);
  };

  const handleClear = () => {
    onValueChange('', null);
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={(v) => { setOpen(v); if (!v) setSearch(''); }}>
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={disabled || isLoading}
          className={cn(
            'w-full h-10 px-3 flex items-center gap-2 text-left rounded-md border transition-colors cursor-pointer',
            'bg-background hover:bg-accent/50',
            error ? 'border-destructive' : 'border-border',
            !selected && 'text-muted-foreground',
            (disabled || isLoading) && 'opacity-50 cursor-not-allowed',
          )}
        >
          {selected ? (
            <div className="flex items-center gap-2 flex-1 min-w-0">
              {selected.logo_url ? (
                <img
                  src={selected.logo_url}
                  alt=""
                  className="h-4 w-4 rounded object-contain flex-shrink-0"
                  onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
                />
              ) : (
                <Building2 className="h-4 w-4 text-muted-foreground flex-shrink-0" />
              )}
              <span className="uppercase text-xs font-medium tracking-wide truncate">
                {selected.nome}
              </span>
            </div>
          ) : (
            <span className="text-xs flex-1">
              {isLoading ? 'Carregando...' : 'Selecionar casa...'}
            </span>
          )}
          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
        </button>
      </PopoverTrigger>

      <PopoverContent
        className="w-[--radix-popover-trigger-width] min-w-[260px] p-0 z-[9999]"
        align="start"
        sideOffset={4}
      >
        {/* Search header */}
        <div className="p-1.5 border-b border-border">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground pointer-events-none" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar casa..."
              autoFocus
              className="w-full h-7 pl-6 pr-2 text-xs rounded border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>
        </div>

        {/* List */}
        <div className="max-h-48 overflow-y-auto p-1">
          {/* Clear option */}
          {value && (
            <button
              type="button"
              onClick={handleClear}
              className="w-full flex items-center gap-2 px-2 py-1.5 text-xs rounded hover:bg-accent text-muted-foreground"
            >
              <X className="h-3 w-3" />
              Remover casa
            </button>
          )}

          {filtered.length === 0 ? (
            <p className="p-3 text-center text-xs text-muted-foreground">
              {isLoading ? 'Carregando...' : 'Nenhuma casa encontrada'}
            </p>
          ) : (
            filtered.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => handleSelect(item)}
                className={cn(
                  'w-full flex items-center gap-2 px-2 py-1.5 text-xs rounded hover:bg-accent',
                  item.id === value && 'bg-accent font-medium',
                )}
              >
                {item.id === value ? (
                  <Check className="h-3 w-3 text-emerald-500 flex-shrink-0" />
                ) : (
                  <span className="w-3" />
                )}
                {item.logo_url ? (
                  <img
                    src={item.logo_url}
                    alt=""
                    className="h-4 w-4 rounded object-contain flex-shrink-0"
                    onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
                  />
                ) : (
                  <Building2 className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                )}
                <span className="truncate uppercase font-medium tracking-wide">{item.nome}</span>
              </button>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
