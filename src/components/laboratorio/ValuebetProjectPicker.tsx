import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Search, Filter, CheckCircle2, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { ValuebetProjectSummary } from "@/hooks/useValuebetProjectsSummary";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";

interface ValuebetProjectPickerProps {
  projects: ValuebetProjectSummary[];
  selectedIds: string[];
  onToggle: (id: string) => void;
  onSelectAll: () => void;
  onClear: () => void;
  className?: string;
}

export function ValuebetProjectPicker({
  projects,
  selectedIds,
  onToggle,
  onSelectAll,
  onClear,
  className
}: ValuebetProjectPickerProps) {
  const [searchTerm, setSearchTerm] = useState("");

  const filteredProjects = useMemo(() => {
    return projects.filter(p => 
      p.nome.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [projects, searchTerm]);

  const totalBetsSelected = useMemo(() => {
    return projects
      .filter(p => selectedIds.includes(p.projeto_id))
      .reduce((acc, curr) => acc + curr.total_bets, 0);
  }, [projects, selectedIds]);

  return (
    <Card className={cn("border-border bg-card/50 flex flex-col h-full", className)}>
      <CardHeader className="pb-3 space-y-4">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-bold flex items-center gap-2">
            <Filter className="h-4 w-4 text-primary" />
            Projetos
          </CardTitle>
          <span className="text-[10px] bg-muted px-2 py-0.5 rounded-full text-muted-foreground font-medium">
            {selectedIds.length} / {projects.length}
          </span>
        </div>

        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar projeto..."
            className="pl-9 h-9 bg-background/50 border-border/50 text-xs"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>

        <div className="flex gap-2">
          <Button 
            variant="outline" 
            size="sm" 
            className="text-[10px] h-7 px-3 flex-1 bg-background/50 hover:bg-primary/10 hover:text-primary transition-colors"
            onClick={onSelectAll}
          >
            <CheckCircle2 className="h-3 w-3 mr-1" /> Todos
          </Button>
          <Button 
            variant="outline" 
            size="sm" 
            className="text-[10px] h-7 px-3 flex-1 bg-background/50 hover:bg-destructive/10 hover:text-destructive transition-colors"
            onClick={onClear}
          >
            <XCircle className="h-3 w-3 mr-1" /> Limpar
          </Button>
        </div>
      </CardHeader>
      
      <CardContent className="flex-1 p-0 px-1 pb-4">
        <div className="px-5 mb-2 flex justify-between items-center text-[10px] text-muted-foreground uppercase tracking-wider font-bold">
          <span>Projeto</span>
          <span>Apostas</span>
        </div>
        
        <ScrollArea className="h-[400px]">
          <div className="space-y-0.5 px-3">
            {filteredProjects.length > 0 ? (
              filteredProjects.map((project) => {
                const isSelected = selectedIds.includes(project.projeto_id);
                return (
                  <div 
                    key={project.projeto_id}
                    className={cn(
                      "group flex items-center p-2 rounded-lg transition-all duration-200 cursor-pointer",
                      "hover:bg-muted/50 border-l-2",
                      isSelected 
                        ? "border-primary bg-primary/5" 
                        : "border-transparent opacity-70 hover:opacity-100"
                    )}
                    onClick={() => onToggle(project.projeto_id)}
                  >
                    <Checkbox 
                      id={project.projeto_id} 
                      checked={isSelected}
                      className="mr-3 data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground pointer-events-none"
                    />
                    <div className="flex-1 min-w-0 pr-2">
                      <Label 
                        htmlFor={project.projeto_id} 
                        className={cn(
                          "text-sm font-medium cursor-pointer block truncate",
                          isSelected ? "text-foreground" : "text-muted-foreground group-hover:text-foreground"
                        )}
                      >
                        {project.nome}
                      </Label>
                      <p className="text-[10px] text-muted-foreground/60 group-hover:text-muted-foreground transition-colors">
                        Última: {format(parseISO(project.ultima_data), "dd/MM/yyyy", { locale: ptBR })}
                      </p>
                    </div>
                    <div className="text-right tabular-nums">
                      <div className="text-xs font-bold">{project.total_bets}</div>
                      <div className="text-[9px] text-muted-foreground/50">total</div>
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="py-8 text-center text-muted-foreground text-xs italic">
                Nenhum projeto encontrado.
              </div>
            )}
          </div>
        </ScrollArea>
      </CardContent>

      <div className="p-4 border-t border-border/40 bg-muted/20 rounded-b-xl">
        <div className="flex justify-between items-center">
          <span className="text-[10px] uppercase font-bold text-muted-foreground">Total selecionado</span>
          <span className="text-sm font-bold text-primary tabular-nums">
            {totalBetsSelected.toLocaleString()} <span className="text-[10px] font-medium text-muted-foreground">apostas</span>
          </span>
        </div>
      </div>
    </Card>
  );
}
