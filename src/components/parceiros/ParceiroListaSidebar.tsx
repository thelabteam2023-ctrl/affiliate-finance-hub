import { useState, useMemo } from "react";
import { Search, User } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

interface Parceiro {
  id: string;
  nome: string;
  cpf: string;
  status: string;
  lucro_prejuizo: number;
}

interface ParceiroListaSidebarProps {
  parceiros: Parceiro[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  showSensitiveData?: boolean;
}

export function ParceiroListaSidebar({
  parceiros,
  selectedId,
  onSelect,
  showSensitiveData = false,
}: ParceiroListaSidebarProps) {
  const [searchTerm, setSearchTerm] = useState("");

  const filteredParceiros = useMemo(() => {
    return parceiros.filter((p) =>
      p.nome.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.cpf.includes(searchTerm)
    );
  }, [parceiros, searchTerm]);

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
    return cpf.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.***.***-$4");
  };

  return (
    <div className="flex flex-col h-full border-r border-border">
      <div className="p-2 border-b border-border">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Buscar..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-8 h-8 text-xs"
          />
        </div>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-1.5 space-y-0.5">
          {filteredParceiros.map((parceiro) => (
            <button
              key={parceiro.id}
              onClick={() => onSelect(parceiro.id)}
              className={cn(
                "w-full flex items-center gap-2 p-2 rounded-md text-left transition-colors",
                selectedId === parceiro.id
                  ? "bg-primary/10 border border-primary/30"
                  : "hover:bg-muted/50 border border-transparent"
              )}
            >
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10">
                <User className="h-3.5 w-3.5 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="font-medium text-xs truncate">{parceiro.nome}</span>
                  <Badge
                    variant="outline"
                    className={cn(
                      "text-[9px] px-1 py-0 h-4 shrink-0",
                      parceiro.status === "ativo"
                        ? "border-success/50 text-success"
                        : "border-muted-foreground/50 text-muted-foreground"
                    )}
                  >
                    {parceiro.status === "ativo" ? "A" : "I"}
                  </Badge>
                </div>
                <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                  <span className="font-mono">{maskCPF(parceiro.cpf)}</span>
                  <span
                    className={cn(
                      "font-medium",
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
            <div className="text-center py-6 text-muted-foreground text-xs">
              Nenhum parceiro encontrado
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
