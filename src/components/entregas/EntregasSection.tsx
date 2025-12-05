import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { Plus, AlertTriangle, Package } from "lucide-react";
import { EntregaCard } from "./EntregaCard";
import { EntregaDialog } from "./EntregaDialog";
import { EntregaConciliacaoDialog } from "./EntregaConciliacaoDialog";

interface Entrega {
  id: string;
  numero_entrega: number;
  descricao: string | null;
  data_inicio: string;
  data_fim_prevista: string | null;
  data_fim_real: string | null;
  tipo_gatilho: string;
  meta_valor: number | null;
  meta_percentual: number | null;
  saldo_inicial: number;
  resultado_nominal: number;
  resultado_real: number | null;
  conciliado: boolean;
  status: string;
  valor_pagamento_operador: number;
  excedente_proximo: number;
}

interface EntregasSectionProps {
  operadorProjetoId: string;
  operadorNome: string;
  modeloPagamento: string;
  valorFixo?: number;
  percentual?: number;
  frequenciaEntrega?: string;
  expanded?: boolean;
}

export function EntregasSection({
  operadorProjetoId,
  operadorNome,
  modeloPagamento,
  valorFixo = 0,
  percentual = 0,
  frequenciaEntrega = "MENSAL",
  expanded = false,
}: EntregasSectionProps) {
  const [entregas, setEntregas] = useState<Entrega[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [conciliacaoOpen, setConciliacaoOpen] = useState(false);
  const [selectedEntrega, setSelectedEntrega] = useState<Entrega | null>(null);

  useEffect(() => {
    fetchEntregas();
  }, [operadorProjetoId]);

  const fetchEntregas = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from("entregas")
        .select("*")
        .eq("operador_projeto_id", operadorProjetoId)
        .order("numero_entrega", { ascending: false });

      if (error) throw error;
      setEntregas(data || []);
    } catch (error: any) {
      toast.error("Erro ao carregar entregas: " + error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleConciliar = (entrega: Entrega) => {
    setSelectedEntrega(entrega);
    setConciliacaoOpen(true);
  };

  const entregaAtiva = entregas.find((e) => e.status === "EM_ANDAMENTO");
  const entregasConcluidas = entregas.filter((e) => e.status === "CONCLUIDA");
  const ultimaEntrega = entregasConcluidas[0];
  const saldoInicial = ultimaEntrega?.excedente_proximo || 0;

  if (loading) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-6 w-32" />
        <Skeleton className="h-20" />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Package className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium">Entregas</span>
          <span className="text-xs text-muted-foreground">({entregas.length})</span>
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={() => setDialogOpen(true)}
          disabled={!!entregaAtiva}
        >
          <Plus className="h-3 w-3 mr-1" />
          Nova
        </Button>
      </div>

      {/* Alerta se não houver entrega ativa */}
      {!entregaAtiva && entregas.length > 0 && (
        <div className="p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/20">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-yellow-400" />
            <span className="text-sm text-yellow-400">
              Operador sem entrega ativa. Crie uma nova para continuar.
            </span>
          </div>
        </div>
      )}

      {/* Entrega Ativa */}
      {entregaAtiva && (
        <EntregaCard
          entrega={entregaAtiva}
          onConciliar={() => handleConciliar(entregaAtiva)}
          compact={!expanded}
        />
      )}

      {/* Entregas Concluídas (mostrar apenas se expandido) */}
      {expanded && entregasConcluidas.length > 0 && (
        <div className="space-y-2">
          <span className="text-xs text-muted-foreground">Histórico</span>
          {entregasConcluidas.slice(0, 3).map((entrega) => (
            <EntregaCard key={entrega.id} entrega={entrega} compact />
          ))}
          {entregasConcluidas.length > 3 && (
            <p className="text-xs text-muted-foreground text-center">
              +{entregasConcluidas.length - 3} entregas anteriores
            </p>
          )}
        </div>
      )}

      {/* Sem entregas */}
      {entregas.length === 0 && (
        <div className="p-4 rounded-lg border border-dashed text-center">
          <Package className="h-8 w-8 mx-auto text-muted-foreground/50 mb-2" />
          <p className="text-sm text-muted-foreground">Nenhuma entrega criada</p>
          <Button
            size="sm"
            variant="outline"
            className="mt-2"
            onClick={() => setDialogOpen(true)}
          >
            <Plus className="h-3 w-3 mr-1" />
            Criar Primeira Entrega
          </Button>
        </div>
      )}

      {/* Dialogs */}
      <EntregaDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        operadorProjetoId={operadorProjetoId}
        modeloPagamento={modeloPagamento}
        frequenciaEntrega={frequenciaEntrega}
        saldoInicial={saldoInicial}
        onSuccess={fetchEntregas}
      />

      <EntregaConciliacaoDialog
        open={conciliacaoOpen}
        onOpenChange={setConciliacaoOpen}
        entrega={selectedEntrega}
        operadorNome={operadorNome}
        modeloPagamento={modeloPagamento}
        valorFixo={valorFixo}
        percentual={percentual}
        onSuccess={fetchEntregas}
      />
    </div>
  );
}
