import { useState, useMemo } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Search, Users } from "lucide-react";

interface ParceiroItem {
  nome: string;
  extra?: string; // e.g. valor pago info
  dispensado?: boolean;
}

interface ParceirosListModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  subtitle?: string;
  parceiros: ParceiroItem[];
}

export function ParceirosListModal({
  open,
  onOpenChange,
  title,
  subtitle,
  parceiros,
}: ParceirosListModalProps) {
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    if (!search.trim()) return parceiros;
    const term = search.toLowerCase();
    return parceiros.filter((p) => p.nome.toLowerCase().includes(term));
  }, [parceiros, search]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="h-5 w-5 text-primary" />
            {title}
          </DialogTitle>
          {subtitle && (
            <p className="text-sm text-muted-foreground">{subtitle}</p>
          )}
        </DialogHeader>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar parceiro..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>

        <div className="text-xs text-muted-foreground">
          {filtered.length} de {parceiros.length} parceiro{parceiros.length !== 1 ? "s" : ""}
        </div>

        <div className="flex-1 overflow-y-auto min-h-0 -mx-1 px-1">
          {filtered.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Users className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p className="text-sm">
                {parceiros.length === 0
                  ? "Nenhum parceiro vinculado"
                  : "Nenhum parceiro encontrado"}
              </p>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {filtered.map((p, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between py-2.5 px-2 hover:bg-muted/50 rounded-md transition-colors"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="text-xs text-muted-foreground w-6 text-right shrink-0">
                      {i + 1}.
                    </span>
                    <span className="text-sm font-medium truncate">
                      {p.nome}
                    </span>
                  </div>
                  <div className="shrink-0 ml-2">
                    {p.dispensado ? (
                      <Badge variant="outline" className="text-[10px]">
                        Dispensado
                      </Badge>
                    ) : p.extra ? (
                      <span className="text-xs text-muted-foreground">
                        {p.extra}
                      </span>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
