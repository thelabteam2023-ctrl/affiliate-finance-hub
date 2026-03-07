import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { MarcoZeroCard } from "./MarcoZeroDialog";
import { RotateCcw } from "lucide-react";

interface MarcoZeroTabProps {
  projetoId: string;
}

export function MarcoZeroTab({ projetoId }: MarcoZeroTabProps) {
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
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-amber-500/10 flex items-center justify-center">
            <RotateCcw className="h-5 w-5 text-amber-500" />
          </div>
          <div>
            <h2 className="text-xl font-semibold">Marco Zero</h2>
            <p className="text-sm text-muted-foreground">
              Reinicie os indicadores financeiros do projeto sem apagar o histórico
            </p>
          </div>
        </div>

        <MarcoZeroCard
          projetoId={projetoId}
          marcoZeroAt={projetoData?.marco_zero_at || null}
        />
      </div>
    </div>
  );
}
