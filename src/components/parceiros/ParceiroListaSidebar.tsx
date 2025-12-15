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
}

export function ParceiroListaSidebar({
  parceiros,
  selectedId,
  onSelect,
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
    }).format(value);
  };

  const maskCPF = (cpf: string) => {
    return cpf.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.***.***-$4");
  };

  return (
    <div className="flex flex-col h-full border-r border-border">
      <div className="p-3 border-b border-border">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Buscar parceiro..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-9 h-9"
          />
        </div>
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
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10">
                <User className="h-4 w-4 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium truncate">{parceiro.nome}</span>
                  <Badge
                    variant="outline"
                    className={cn(
                      "text-[10px] px-1.5 py-0",
                      parceiro.status === "ativo"
                        ? "border-success/50 text-success"
                        : "border-muted-foreground/50 text-muted-foreground"
                    )}
                  >
                    {parceiro.status === "ativo" ? "Ativo" : "Inativo"}
                  </Badge>
                </div>
                <div className="flex items-center justify-between text-xs text-muted-foreground mt-0.5">
                  <span className="font-mono">{maskCPF(parceiro.cpf)}</span>
                  <span
                    className={cn(
                      "font-medium",
                      parceiro.lucro_prejuizo >= 0 ? "text-success" : "text-destructive"
                    )}
                  >
                    {formatCurrency(parceiro.lucro_prejuizo)}
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
