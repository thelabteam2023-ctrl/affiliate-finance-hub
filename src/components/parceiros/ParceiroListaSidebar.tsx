import { useState, useMemo } from "react";
import { Search, User, Plus } from "lucide-react";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

interface Parceiro {
  id: string;
  nome: string;
  cpf: string;
  status: string;
  lucro_prejuizo: number;
  has_parceria?: boolean;
}

interface ParceiroListaSidebarProps {
  parceiros: Parceiro[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  showSensitiveData?: boolean;
  onAddParceiro?: () => void;
}

export function ParceiroListaSidebar({
  parceiros,
  selectedId,
  onSelect,
  showSensitiveData = false,
  onAddParceiro,
}: ParceiroListaSidebarProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("todos");

  const filteredParceiros = useMemo(() => {
    return parceiros.filter((p) => {
      const matchesSearch = p.nome.toLowerCase().includes(searchTerm.toLowerCase()) ||
        p.cpf.includes(searchTerm);
      const matchesStatus = statusFilter === "todos" || p.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [parceiros, searchTerm, statusFilter]);

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
      notation: "compact",
      maximumFractionDigits: 1,
    }).format(value);
  };

  const maskCurrency = (value: number) => {
    if (showSensitiveData) return formatCurrency(value);
    return "R$ ••••";
  };

  const maskCPF = (cpf: string) => {
    if (showSensitiveData) {
      return cpf.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
    }
    return "•••.•••.•••-••";
  };

  return (
    <div className="flex flex-col h-full border-r border-border min-w-[280px]">
      <div className="p-3 border-b border-border space-y-2">
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
        {onAddParceiro && (
          <button
            onClick={onAddParceiro}
            className="w-full flex items-center justify-center gap-2 p-2.5 rounded-md transition-colors hover:bg-primary/10 border border-dashed border-primary/30 text-primary"
          >
            <Plus className="h-4 w-4" />
            <span className="font-medium text-sm">Novo Parceiro</span>
          </button>
        )}
      </div>

      <ScrollArea className="flex-1">
        <div className="p-2 space-y-1">
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
                    {maskCPF(parceiro.cpf)}
                  </span>
                  <span
                    className={cn(
                      "text-xs font-semibold shrink-0",
                      showSensitiveData
                        ? (parceiro.lucro_prejuizo >= 0 ? "text-success" : "text-destructive")
                        : "text-muted-foreground"
                    )}
                  >
                    {maskCurrency(parceiro.lucro_prejuizo)}
                  </span>
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
      </ScrollArea>
    </div>
  );
}
