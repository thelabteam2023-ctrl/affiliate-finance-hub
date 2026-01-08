import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { 
  ArrowLeftRight, 
  Sparkles, 
  Zap, 
  Gift, 
  Coins, 
  Puzzle,
  Info
} from "lucide-react";
import { cn } from "@/lib/utils";

const ICON_MAP: Record<string, React.ElementType> = {
  ArrowLeftRight,
  Sparkles,
  Zap,
  Gift,
  Coins,
  Puzzle,
};

interface ModuleCatalog {
  id: string;
  name: string;
  description: string | null;
  icon: string;
  default_order: number;
  category: string;
}

interface ProjectModulesStepProps {
  selectedModules: string[];
  onSelectionChange: (modules: string[]) => void;
}

export function ProjectModulesStep({ selectedModules, onSelectionChange }: ProjectModulesStepProps) {
  const [catalog, setCatalog] = useState<ModuleCatalog[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchCatalog = async () => {
      const { data, error } = await supabase
        .from("project_modules_catalog")
        .select("*")
        .order("default_order");

      if (!error && data) {
        setCatalog(data);
      }
      setLoading(false);
    };

    fetchCatalog();
  }, []);

  const toggleModule = (moduleId: string) => {
    if (selectedModules.includes(moduleId)) {
      onSelectionChange(selectedModules.filter((id) => id !== moduleId));
    } else {
      onSelectionChange([...selectedModules, moduleId]);
    }
  };

  const selectAll = () => {
    onSelectionChange(catalog.map((m) => m.id));
  };

  const clearAll = () => {
    onSelectionChange([]);
  };

  if (loading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-20" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Módulos do Projeto</h3>
          <p className="text-sm text-muted-foreground">
            Selecione as estratégias que você usará neste projeto (opcional)
          </p>
        </div>
        <div className="flex gap-2">
          <Badge 
            variant="outline" 
            className="cursor-pointer hover:bg-muted"
            onClick={selectAll}
          >
            Selecionar todos
          </Badge>
          {selectedModules.length > 0 && (
            <Badge 
              variant="outline" 
              className="cursor-pointer hover:bg-muted"
              onClick={clearAll}
            >
              Limpar
            </Badge>
          )}
        </div>
      </div>

      {/* Info */}
      <div className="flex items-start gap-3 p-3 rounded-lg bg-blue-500/10 border border-blue-500/20">
        <Info className="h-4 w-4 text-blue-500 flex-shrink-0 mt-0.5" />
        <p className="text-xs text-muted-foreground">
          Você poderá ativar ou desativar módulos a qualquer momento em <strong>Gestão → Módulos</strong>.
        </p>
      </div>

      {/* Module Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {catalog.map((module) => {
          const IconComponent = ICON_MAP[module.icon] || Puzzle;
          const isSelected = selectedModules.includes(module.id);
          
          return (
            <Card
              key={module.id}
              className={cn(
                "cursor-pointer transition-all border-2",
                isSelected 
                  ? "border-primary bg-primary/5" 
                  : "border-transparent hover:border-primary/30"
              )}
              onClick={() => toggleModule(module.id)}
            >
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  <div className="flex items-center gap-3">
                    <Checkbox 
                      checked={isSelected} 
                      onCheckedChange={() => toggleModule(module.id)}
                      onClick={(e) => e.stopPropagation()}
                    />
                    <div className={cn(
                      "h-10 w-10 rounded-lg flex items-center justify-center",
                      isSelected ? "bg-primary/10" : "bg-muted"
                    )}>
                      <IconComponent className={cn(
                        "h-5 w-5",
                        isSelected ? "text-primary" : "text-muted-foreground"
                      )} />
                    </div>
                  </div>
                  <div className="flex-1 min-w-0">
                    <h4 className="font-medium text-sm">{module.name}</h4>
                    <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">
                      {module.description}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Selection count */}
      {selectedModules.length > 0 && (
        <p className="text-sm text-muted-foreground text-center">
          {selectedModules.length} módulo{selectedModules.length > 1 ? "s" : ""} selecionado{selectedModules.length > 1 ? "s" : ""}
        </p>
      )}
    </div>
  );
}
