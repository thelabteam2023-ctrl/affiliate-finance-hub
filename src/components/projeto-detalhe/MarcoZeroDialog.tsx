import { useState } from "react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { RotateCcw, AlertTriangle, CheckCircle2 } from "lucide-react";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";

interface MarcoZeroDialogProps {
  projetoId: string;
  marcoZeroAt: string | null;
}

export function MarcoZeroCard({ projetoId, marcoZeroAt }: MarcoZeroDialogProps) {
  const [loading, setLoading] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const queryClient = useQueryClient();

  const executarMarcoZero = async () => {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Não autenticado");

      const { data, error } = await supabase.rpc("executar_marco_zero", {
        p_projeto_id: projetoId,
        p_user_id: user.id,
      });

      if (error) throw new Error(error.message);

      const result = data as any;
      if (!result?.success) throw new Error(result?.error || "Erro desconhecido");

      // Invalidate all caches
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["projeto-resultado", projetoId] }),
        queryClient.invalidateQueries({ queryKey: ["projeto-financial-compact", projetoId] }),
        queryClient.invalidateQueries({ queryKey: ["projeto-financial-metrics", projetoId] }),
        queryClient.invalidateQueries({ queryKey: ["projeto-data", projetoId] }),
      ]);

      toast.success("Marco Zero aplicado!", {
        description: result.mensagem,
      });
      setDialogOpen(false);
    } catch (err) {
      toast.error("Erro ao aplicar Marco Zero", {
        description: err instanceof Error ? err.message : "Erro desconhecido",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="border-amber-500/30 bg-amber-500/5">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <RotateCcw className="h-4 w-4 text-amber-500" />
          Marco Zero (Baseline Reset)
        </CardTitle>
        <CardDescription>
          Reinicia os indicadores financeiros (Lucro, ROI) a partir de agora, sem apagar o histórico.
          O saldo atual de cada casa é registrado como capital inicial.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {marcoZeroAt && (
          <div className="flex items-center gap-2 text-sm bg-emerald-500/10 border border-emerald-500/20 rounded-md px-3 py-2">
            <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
            <span className="text-muted-foreground">
              Marco Zero ativo desde{" "}
              <span className="font-semibold text-foreground">
                {format(parseISO(marcoZeroAt), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
              </span>
            </span>
          </div>
        )}

        <AlertDialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <AlertDialogTrigger asChild>
            <Button variant="outline" className="border-amber-500/30 text-amber-600 hover:bg-amber-500/10">
              <RotateCcw className="h-4 w-4 mr-2" />
              {marcoZeroAt ? "Reaplicar Marco Zero" : "Aplicar Marco Zero"}
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-amber-500" />
                Confirmar Marco Zero
              </AlertDialogTitle>
              <AlertDialogDescription asChild>
                <div className="space-y-3 text-sm">
                  <p>
                    Esta ação irá reiniciar os indicadores financeiros do projeto.
                    <strong> Nenhum dado será apagado.</strong>
                  </p>
                  <div className="bg-muted rounded-md p-3 space-y-1.5">
                    <p className="font-medium text-foreground">O que acontece:</p>
                    <ul className="list-disc pl-4 space-y-1 text-muted-foreground">
                      <li>O saldo atual de cada casa vinculada será registrado como capital inicial (baseline)</li>
                      <li>Lucro e ROI passarão a considerar apenas operações a partir deste momento</li>
                      <li>Depósitos e saques anteriores serão ignorados nos KPIs</li>
                      <li>Todo o histórico permanece intacto no ledger</li>
                    </ul>
                  </div>
                  {marcoZeroAt && (
                    <p className="text-amber-600 font-medium">
                      ⚠️ Isso substituirá o marco zero anterior.
                    </p>
                  )}
                </div>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={loading}>Cancelar</AlertDialogCancel>
              <AlertDialogAction
                onClick={(e) => {
                  e.preventDefault();
                  executarMarcoZero();
                }}
                disabled={loading}
                className="bg-amber-600 hover:bg-amber-700"
              >
                {loading ? "Aplicando..." : "Confirmar Marco Zero"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </CardContent>
    </Card>
  );
}
