import { useState, useMemo } from 'react';
import { Building2, Search, X, Check, ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { useWorkspaceBookmakers } from '@/hooks/useWorkspaceBookmakers';
import type { WorkspaceBookmakerOption } from '@/hooks/useWorkspaceBookmakers';

type RegFilter = 'todas' | 'REGULAMENTADA' | 'NAO_REGULAMENTADA';

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
  const [regFilter, setRegFilter] = useState<RegFilter>('todas');

  const filtered = useMemo(() => {
    let list = allBookmakers;

    if (regFilter === 'REGULAMENTADA') {
      list = list.filter((i) => i.status === 'REGULAMENTADA');
    } else if (regFilter === 'NAO_REGULAMENTADA') {
      list = list.filter((i) => i.status === 'NAO_REGULAMENTADA');
    }

    if (search.trim()) {
      const term = search.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      list = list.filter((b) =>
        b.nome.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').includes(term),
      );
    }

    return list;
  }, [allBookmakers, regFilter, search]);

  const selected = useMemo(
    () => allBookmakers.find((b) => b.id === value) ?? null,
    [allBookmakers, value],
  );

  const handleSelect = (item: WorkspaceBookmakerOption) => {
    onValueChange(item.id, item);
    setOpen(false);
  };

  const regOptions: { value: RegFilter; label: string }[] = [
    { value: 'todas', label: 'Todas' },
    { value: 'REGULAMENTADA', label: 'Regulamentadas' },
    { value: 'NAO_REGULAMENTADA', label: 'Não Regulamentadas' },
  ];

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled || isLoading}
          className={cn(
            'w-full h-12 justify-between text-left',
            error && 'border-destructive',
            !selected && 'text-muted-foreground',
          )}
        >
          {selected ? (
            <div className="flex items-center gap-3 flex-1 min-w-0">
              {selected.logo_url ? (
                <img
                  src={selected.logo_url}
                  alt=""
                  className="h-6 w-6 rounded object-contain flex-shrink-0"
                  onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
                />
              ) : (
                <Building2 className="h-5 w-5 text-muted-foreground flex-shrink-0" />
              )}
              <span className="uppercase text-sm font-bold truncate tracking-wide">
                {selected.nome}
              </span>
            </div>
          ) : (
            <span className="text-sm">
              {isLoading ? 'Carregando...' : 'Selecionar bookmaker...'}
            </span>
          )}
          <ChevronDown className="h-4 w-4 text-muted-foreground flex-shrink-0 ml-1" />
        </Button>
      </PopoverTrigger>

      <PopoverContent
        className="w-[--radix-popover-trigger-width] min-w-[320px] p-0 z-[9999]"
        align="start"
        sideOffset={4}
      >
        <div className="p-2 space-y-2 border-b border-border">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar bookmaker..."
              className="w-full h-8 pl-8 pr-3 text-xs rounded-md border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>
          <div className="flex gap-1">
            {regOptions.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setRegFilter(opt.value)}
                className={cn(
                  'flex-1 text-xs px-2 py-1 rounded-md border transition-colors',
                  regFilter === opt.value
                    ? 'bg-primary text-primary-foreground border-primary font-medium'
                    : 'bg-transparent text-muted-foreground border-border hover:bg-accent',
                )}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        <div className="max-h-[300px] overflow-y-auto" onWheel={(e) => e.stopPropagation()}>
          {filtered.length === 0 ? (
            <p className="p-4 text-center text-sm text-muted-foreground">
              {isLoading ? 'Carregando...' : 'Nenhuma bookmaker encontrada'}
            </p>
          ) : (
            filtered.map((item) => {
              const isSelected = item.id === value;
              return (
                <div
                  key={item.id}
                  onClick={() => handleSelect(item)}
                  className={cn(
                    'flex items-center gap-3 px-3 py-2.5 cursor-pointer border-l-2 transition-colors',
                    isSelected
                      ? 'border-l-emerald-500 bg-emerald-500/10'
                      : 'border-l-transparent hover:bg-accent/50',
                  )}
                >
                  <Check
                    className={cn(
                      'h-4 w-4 flex-shrink-0 text-emerald-500',
                      isSelected ? 'opacity-100' : 'opacity-0',
                    )}
                  />
                  {item.logo_url ? (
                    <img
                      src={item.logo_url}
                      alt=""
                      className="h-6 w-6 rounded object-contain flex-shrink-0"
                      onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
                    />
                  ) : (
                    <Building2 className="h-5 w-5 text-muted-foreground flex-shrink-0" />
                  )}
                  <span className="uppercase text-sm font-bold tracking-wide truncate flex-1">
                    {item.nome}
                  </span>
                </div>
              );
            })
          )}
        </div>

        {filtered.length > 0 && (
          <div className="border-t border-border px-3 py-1.5">
            <p className="text-[10px] text-muted-foreground">
              {filtered.length} bookmaker{filtered.length !== 1 ? 's' : ''} encontrada{filtered.length !== 1 ? 's' : ''}
            </p>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
