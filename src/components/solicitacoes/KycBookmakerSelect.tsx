import { useState, useMemo } from 'react';
import { Building2, User, FolderOpen, Search, X, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { useOperationalBookmakers } from '@/hooks/useOperationalBookmakers';
import type { OperationalBookmakerOption } from '@/hooks/useOperationalBookmakers';

interface KycBookmakerSelectProps {
  value: string;
  onValueChange: (id: string, data: OperationalBookmakerOption | null) => void;
  disabled?: boolean;
  error?: boolean;
}

const AVULSO_VALUE = '__avulso__';

export function KycBookmakerSelect({
  value,
  onValueChange,
  disabled,
  error,
}: KycBookmakerSelectProps) {
  const { data: allBookmakers = [], isLoading } = useOperationalBookmakers();

  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [filterParceiro, setFilterParceiro] = useState('');
  const [filterProjeto, setFilterProjeto] = useState('');

  // Listas únicas para os filtros
  const parceiros = useMemo(() => {
    const map = new Map<string, string>();
    allBookmakers.forEach((b) => {
      if (b.parceiro_id && b.parceiro_nome) map.set(b.parceiro_id, b.parceiro_nome);
    });
    return Array.from(map.entries()).sort((a, b) => a[1].localeCompare(b[1]));
  }, [allBookmakers]);

  const projetos = useMemo(() => {
    const map = new Map<string, string>();
    allBookmakers.forEach((b) => {
      if (b.projeto_id && b.projeto_nome) map.set(b.projeto_id, b.projeto_nome);
    });
    return Array.from(map.entries()).sort((a, b) => a[1].localeCompare(b[1]));
  }, [allBookmakers]);

  // Filtragem combinada
  const filtered = useMemo(() => {
    let list = allBookmakers;

    if (filterParceiro === AVULSO_VALUE) {
      list = list.filter((b) => !b.parceiro_id);
    } else if (filterParceiro) {
      list = list.filter((b) => b.parceiro_id === filterParceiro);
    }

    if (filterProjeto === AVULSO_VALUE) {
      list = list.filter((b) => !b.projeto_id);
    } else if (filterProjeto) {
      list = list.filter((b) => b.projeto_id === filterProjeto);
    }

    if (search.trim()) {
      const term = search.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      list = list.filter((b) => {
        const nome = b.nome.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        const parceiro = (b.parceiro_nome ?? '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        const projeto = (b.projeto_nome ?? '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        return nome.includes(term) || parceiro.includes(term) || projeto.includes(term);
      });
    }

    return list;
  }, [allBookmakers, filterParceiro, filterProjeto, search]);

  const selected = useMemo(
    () => allBookmakers.find((b) => b.id === value) ?? null,
    [allBookmakers, value],
  );

  const hasFilters = !!filterParceiro || !!filterProjeto;

  const clearFilters = () => {
    setFilterParceiro('');
    setFilterProjeto('');
    setSearch('');
  };

  const handleSelect = (item: OperationalBookmakerOption) => {
    onValueChange(item.id, item);
    setOpen(false);
  };

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
            'w-full h-14 justify-between text-left',
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
                  className="h-7 w-7 rounded object-contain flex-shrink-0"
                  onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
                />
              ) : (
                <Building2 className="h-6 w-6 text-muted-foreground flex-shrink-0" />
              )}
              <div className="flex flex-col min-w-0 flex-1">
                <span className="uppercase text-sm font-bold truncate tracking-wide">
                  {selected.nome}
                </span>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  {selected.parceiro_nome && (
                    <span className="flex items-center gap-1 truncate">
                      <User className="h-3 w-3 flex-shrink-0" />
                      {selected.parceiro_nome}
                    </span>
                  )}
                  {selected.projeto_nome && (
                    <span className="flex items-center gap-1 truncate">
                      <FolderOpen className="h-3 w-3 flex-shrink-0" />
                      {selected.projeto_nome}
                    </span>
                  )}
                  {!selected.parceiro_nome && !selected.projeto_nome && (
                    <span className="italic">Conta avulsa</span>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <span className="text-sm">
              {isLoading ? 'Carregando...' : 'Selecionar conta exigindo KYC...'}
            </span>
          )}
        </Button>
      </PopoverTrigger>

      <PopoverContent
        className="w-[--radix-popover-trigger-width] min-w-[360px] p-0 z-[9999]"
        align="start"
        sideOffset={4}
      >
        {/* Filtros */}
        <div className="p-2 space-y-2 border-b border-border">
          {/* Busca livre */}
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por casa, parceiro ou projeto..."
              className="w-full h-8 pl-8 pr-3 text-xs rounded-md border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>

          {/* Filtros Parceiro + Projeto em linha */}
          <div className="grid grid-cols-2 gap-2">
            <Select value={filterParceiro} onValueChange={setFilterParceiro}>
              <SelectTrigger className="h-8 text-xs">
                <SelectValue placeholder="Filtrar parceiro..." />
              </SelectTrigger>
              <SelectContent className="z-[10000]">
                <SelectItem value={AVULSO_VALUE} className="text-xs italic text-muted-foreground">
                  Sem parceiro
                </SelectItem>
                {parceiros.map(([id, nome]) => (
                  <SelectItem key={id} value={id} className="text-xs">
                    {nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={filterProjeto} onValueChange={setFilterProjeto}>
              <SelectTrigger className="h-8 text-xs">
                <SelectValue placeholder="Filtrar projeto..." />
              </SelectTrigger>
              <SelectContent className="z-[10000]">
                <SelectItem value={AVULSO_VALUE} className="text-xs italic text-muted-foreground">
                  Sem projeto
                </SelectItem>
                {projetos.map(([id, nome]) => (
                  <SelectItem key={id} value={id} className="text-xs">
                    {nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Limpar filtros */}
          {hasFilters && (
            <button
              onClick={clearFilters}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            >
              <X className="h-3 w-3" />
              Limpar filtros
            </button>
          )}
        </div>

        {/* Lista de contas */}
        <div className="max-h-[300px] overflow-y-auto" onWheel={(e) => e.stopPropagation()}>
          {filtered.length === 0 ? (
            <p className="p-4 text-center text-sm text-muted-foreground">
              {isLoading ? 'Carregando...' : 'Nenhuma conta encontrada'}
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
                      className="h-7 w-7 rounded object-contain flex-shrink-0"
                      onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
                    />
                  ) : (
                    <Building2 className="h-6 w-6 text-muted-foreground flex-shrink-0" />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="uppercase text-sm font-bold tracking-wide truncate">
                      {item.nome}
                    </p>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      {item.parceiro_nome ? (
                        <span className="flex items-center gap-1 truncate">
                          <User className="h-3 w-3 flex-shrink-0" />
                          {item.parceiro_nome}
                        </span>
                      ) : null}
                      {item.projeto_nome ? (
                        <span className="flex items-center gap-1 truncate">
                          <FolderOpen className="h-3 w-3 flex-shrink-0" />
                          {item.projeto_nome}
                        </span>
                      ) : null}
                      {!item.parceiro_nome && !item.projeto_nome && (
                        <span className="italic">Conta avulsa</span>
                      )}
                    </div>
                  </div>
                  <span className="text-[10px] text-muted-foreground font-mono flex-shrink-0">
                    {item.moeda}
                  </span>
                </div>
              );
            })
          )}
        </div>

        {/* Rodapé com contagem */}
        {filtered.length > 0 && (
          <div className="border-t border-border px-3 py-1.5">
            <p className="text-[10px] text-muted-foreground">
              {filtered.length} conta{filtered.length !== 1 ? 's' : ''} encontrada{filtered.length !== 1 ? 's' : ''}
            </p>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
