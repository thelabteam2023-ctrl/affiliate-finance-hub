import { ProjectModulesManager } from "@/components/projeto-detalhe/ProjectModulesManager";
import { MarcoZeroCard } from "@/components/projeto-detalhe/MarcoZeroDialog";
import { useActionAccess } from "@/hooks/useModuleAccess";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Settings2 } from "lucide-react";

interface ProjetoGestaoTabProps {
  projetoId: string;
}

export function ProjetoGestaoTab({ projetoId }: ProjetoGestaoTabProps) {
  const { canEdit } = useActionAccess();

  const { data: projetoData } = useQuery({
    queryKey: ["projeto-data", projetoId],
    queryFn: async () => {
      const { data } = await supabase
        .from("projetos")
        .select("marco_zero_at")
        .eq("id", projetoId)
        .single();
      return data;
    },
  });
  
  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-4xl mx-auto space-y-6 py-4 px-1">
        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
            <Settings2 className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h2 className="text-xl font-semibold">Gestão do Projeto</h2>
            <p className="text-sm text-muted-foreground">
              Gerencie módulos, configurações e recursos do projeto
            </p>
          </div>
        </div>

        {/* Marco Zero Section */}
        {canEdit && (
          <MarcoZeroCard 
            projetoId={projetoId} 
            marcoZeroAt={projetoData?.marco_zero_at || null} 
          />
        )}

        {/* Modules Section */}
        <ProjectModulesManager projetoId={projetoId} />
      </div>
    </div>
  );
}
