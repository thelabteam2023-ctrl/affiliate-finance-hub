import { useState, useMemo } from "react";
import { Search, User, Plus } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { maskCPFPartial } from "@/lib/validators";
import { useActionAccess } from "@/hooks/useModuleAccess";
import { MultiCurrencyDisplay } from "@/components/ui/money-display";

interface Parceiro {
  id: string;
  nome: string;
  cpf: string;
  status: string;
  lucro_prejuizo: number;
  lucro_prejuizo_brl?: number;
  lucro_prejuizo_usd?: number;
  has_parceria?: boolean;
}

interface ParceiroListaSidebarProps {
  parceiros: Parceiro[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  showSensitiveData?: boolean;
  onAddParceiro?: () => void;
}

/*
 * ARQUITETURA: SidebarParceiros
 * 
 * Container: h-full (herda altura do pai)
 * ├─ Header (shrink-0): filtros + botão novo
 * └─ Lista (flex-1 overflow-y-auto): scroll próprio
 * 
 * NUNCA interfere no layout do painel principal.
 */
export function ParceiroListaSidebar({
  parceiros,
  selectedId,
  onSelect,
  showSensitiveData = true,
  onAddParceiro,
}: ParceiroListaSidebarProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("todos");
  const { canCreate } = useActionAccess();

  const filteredParceiros = useMemo(() => {
    return parceiros.filter((p) => {
      const matchesSearch = p.nome.toLowerCase().includes(searchTerm.toLowerCase()) ||
        p.cpf.includes(searchTerm);
      const matchesStatus = statusFilter === "todos" || p.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [parceiros, searchTerm, statusFilter]);

  return (
    <div className="h-full max-h-full flex flex-col border-r border-border overflow-hidden">
      {/* Header: altura fixa, nunca comprime */}
      <div className="shrink-0 p-3 border-b border-border space-y-2">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Buscar parceiro..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-9 h-9 text-sm"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="h-9 text-sm">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos os status</SelectItem>
            <SelectItem value="ativo">Ativos</SelectItem>
            <SelectItem value="inativo">Inativos</SelectItem>
          </SelectContent>
        </Select>
        {onAddParceiro && canCreate('parceiros', 'parceiros.create') && (
          <button
            onClick={onAddParceiro}
            className="w-full flex items-center justify-center gap-2 p-2.5 rounded-md transition-colors hover:bg-primary/10 border border-dashed border-primary/30 text-primary"
          >
            <Plus className="h-4 w-4" />
            <span className="font-medium text-sm">Novo Parceiro</span>
          </button>
        )}
      </div>

      {/* Lista: flex-1 com scroll próprio - scrollbar sempre visível */}
      <div className="flex-1 min-h-0 overflow-y-scroll">
        <div className="p-2 space-y-1 pb-4">
          {filteredParceiros.map((parceiro) => (
            <button
              key={parceiro.id}
              onClick={() => onSelect(parceiro.id)}
              className={cn(
                "w-full flex items-center gap-3 p-3 rounded-lg text-left transition-colors",
                selectedId === parceiro.id
                  ? "bg-primary/10 border border-primary/30"
                  : "hover:bg-muted/50 border border-transparent"
              )}
            >
              <div className={cn(
                "flex h-9 w-9 shrink-0 items-center justify-center rounded-full",
                parceiro.status === "ativo" ? "bg-primary/10" : "bg-warning/10"
              )}>
                <User className={cn(
                  "h-4 w-4",
                  parceiro.status === "ativo" ? "text-primary" : "text-warning"
                )} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm leading-tight">{parceiro.nome}</p>
                <div className="flex items-center justify-between gap-2 mt-0.5">
                  <span className="text-xs text-muted-foreground font-mono">
                    {maskCPFPartial(parceiro.cpf)}
                  </span>
                  <MultiCurrencyDisplay
                    valueBRL={parceiro.lucro_prejuizo_brl ?? parceiro.lucro_prejuizo}
                    valueUSD={parceiro.lucro_prejuizo_usd ?? 0}
                    size="xs"
                    variant="auto"
                    masked={!showSensitiveData}
                    showDashOnZero
                  />
                </div>
              </div>
            </button>
          ))}

          {filteredParceiros.length === 0 && (
            <div className="text-center py-8 text-muted-foreground text-sm">
              Nenhum parceiro encontrado
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
