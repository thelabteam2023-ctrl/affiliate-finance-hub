import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import {
  ClipboardList, Clock, CheckCircle2, XCircle, Zap,
  Building2, ArrowRight, Upload, Image as ImageIcon, AlertTriangle
} from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";

interface Props {
  supplierWorkspaceId: string;
  supplierToken: string;
}

const TIPO_LABELS: Record<string, string> = {
  deposito: "Depósito em Casa",
  saque: "Saque de Casa",
  criacao_conta: "Criação de Conta",
  ajuste_saldo: "Ajuste de Saldo",
  outros: "Outros",
};

const PRIORIDADE_LABELS: Record<string, string> = {
  baixa: "Baixa",
  media: "Média",
  alta: "Alta",
  urgente: "Urgente",
};

const STATUS_LABELS: Record<string, string> = {
  pendente: "Pendente",
  em_andamento: "Em Andamento",
  concluido: "Concluído",
  rejeitado: "Rejeitado",
};

const PRIORIDADE_COLORS: Record<string, string> = {
  baixa: "text-muted-foreground border-muted-foreground/40",
  media: "text-blue-400 border-blue-400/40",
  alta: "text-orange-400 border-orange-400/40",
  urgente: "text-red-400 border-red-400/40",
};

const STATUS_COLORS: Record<string, string> = {
  pendente: "text-yellow-400 border-yellow-400/40 bg-yellow-400/10",
  em_andamento: "text-blue-400 border-blue-400/40 bg-blue-400/10",
  concluido: "text-emerald-400 border-emerald-400/40 bg-emerald-400/10",
  rejeitado: "text-muted-foreground border-muted-foreground/40 bg-muted/30",
};

function formatCurrency(val: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(val);
}

export function SupplierOperacoesTab({ supplierWorkspaceId, supplierToken }: Props) {
  const queryClient = useQueryClient();
  const [selectedTask, setSelectedTask] = useState<any>(null);
  const [actionType, setActionType] = useState<"concluir" | "rejeitar" | null>(null);
  const [observacoes, setObservacoes] = useState("");
  const [uploading, setUploading] = useState(false);
  const [comprovanteFile, setComprovanteFile] = useState<File | null>(null);

  // Fetch tasks via edge function
  const { data: tasks = [], isLoading } = useQuery({
    queryKey: ["supplier-tasks-portal", supplierWorkspaceId],
    queryFn: async () => {
      const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
      const resp = await fetch(
        `https://${projectId}.supabase.co/functions/v1/supplier-auth`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          },
          body: JSON.stringify({ action: "list-tasks", token: supplierToken }),
        }
      );
      const data = await resp.json();
      if (data.error) throw new Error(data.error);
      return data.tasks || [];
    },
  });

  const updateTaskMutation = useMutation({
    mutationFn: async ({ taskId, status, obs, comprovanteUrl }: {
      taskId: string; status: string; obs?: string; comprovanteUrl?: string;
    }) => {
      const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
      const resp = await fetch(
        `https://${projectId}.supabase.co/functions/v1/supplier-auth`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          },
          body: JSON.stringify({
            action: "update-task",
            token: supplierToken,
            task_id: taskId,
            status,
            observacoes_fornecedor: obs || null,
            comprovante_url: comprovanteUrl || null,
          }),
        }
      );
      const data = await resp.json();
      if (data.error) throw new Error(data.error);
      return data;
    },
    onSuccess: () => {
      toast.success("Tarefa atualizada");
      queryClient.invalidateQueries({ queryKey: ["supplier-tasks-portal"] });
      setSelectedTask(null);
      setActionType(null);
      setObservacoes("");
      setComprovanteFile(null);
    },
    onError: (e: any) => toast.error(e.message),
  });

  async function handleSubmit() {
    if (!selectedTask || !actionType) return;

    let comprovanteUrl: string | undefined;

    // Upload evidence if provided
    if (comprovanteFile) {
      setUploading(true);
      try {
        const ext = comprovanteFile.name.split(".").pop() || "png";
        const path = `${supplierWorkspaceId}/${selectedTask.id}_${Date.now()}.${ext}`;
        const { error: upErr } = await supabase.storage
          .from("supplier-evidence")
          .upload(path, comprovanteFile);
        if (upErr) throw upErr;
        const { data: urlData } = supabase.storage.from("supplier-evidence").getPublicUrl(path);
        comprovanteUrl = urlData.publicUrl;
      } catch (e: any) {
        toast.error("Erro ao enviar comprovante: " + e.message);
        setUploading(false);
        return;
      }
      setUploading(false);
    }

    const newStatus = actionType === "concluir" ? "concluido" : "rejeitado";
    updateTaskMutation.mutate({
      taskId: selectedTask.id,
      status: newStatus,
      obs: observacoes,
      comprovanteUrl,
    });
  }

  const pendentes = tasks.filter((t: any) => t.status === "pendente" || t.status === "em_andamento");
  const historico = tasks.filter((t: any) => t.status === "concluido" || t.status === "rejeitado");

  return (
    <div className="space-y-4">
      {/* KPIs */}
      <div className="grid grid-cols-2 gap-2">
        <Card>
          <CardContent className="py-2.5 px-3">
            <p className="text-[10px] text-muted-foreground">Pendentes</p>
            <p className="text-lg font-bold text-yellow-400">{pendentes.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-2.5 px-3">
            <p className="text-[10px] text-muted-foreground">Concluídas</p>
            <p className="text-lg font-bold text-emerald-400">{historico.filter((t: any) => t.status === "concluido").length}</p>
          </CardContent>
        </Card>
      </div>

      {/* Pending tasks */}
      {isLoading ? (
        <div className="text-center text-muted-foreground text-sm py-8">Carregando...</div>
      ) : pendentes.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center">
            <CheckCircle2 className="h-8 w-8 text-emerald-400/30 mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">Nenhuma tarefa pendente</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Tarefas Pendentes ({pendentes.length})
          </h3>
          {pendentes.map((task: any) => (
            <Card
              key={task.id}
              className={`hover:border-primary/20 transition-colors cursor-pointer ${
                task.prioridade === "urgente" ? "border-red-500/30" : ""
              }`}
              onClick={() => { setSelectedTask(task); setActionType(null); setObservacoes(""); setComprovanteFile(null); }}
            >
              <CardContent className="py-3 px-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 mb-1">
                      <Badge variant="outline" className={`text-[10px] ${PRIORIDADE_COLORS[task.prioridade]}`}>
                        {task.prioridade === "urgente" && <Zap className="h-2.5 w-2.5 mr-0.5" />}
                        {PRIORIDADE_LABELS[task.prioridade]}
                      </Badge>
                      <Badge variant="outline" className={`text-[10px] ${STATUS_COLORS[task.status]}`}>
                        {STATUS_LABELS[task.status]}
                      </Badge>
                    </div>
                    <p className="text-sm font-medium text-foreground">{task.titulo}</p>
                    {task.descricao && (
                      <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{task.descricao}</p>
                    )}
                    <div className="flex items-center gap-3 mt-1.5 text-[10px] text-muted-foreground">
                      {task.casa_nome && (
                        <span className="flex items-center gap-1">
                          {task.casa_logo && <img src={task.casa_logo} alt="" className="h-3 w-3 rounded" />}
                          {task.casa_nome}
                        </span>
                      )}
                      {task.valor && (
                        <span className="font-semibold text-foreground">{formatCurrency(task.valor)}</span>
                      )}
                      {task.data_limite && (
                        <span className="flex items-center gap-0.5">
                          <Clock className="h-3 w-3" />
                          {format(new Date(task.data_limite), "dd/MM HH:mm")}
                        </span>
                      )}
                    </div>
                    {task.valor_alvo_casa != null && task.valor_atual_casa != null && (
                      <div className="flex items-center gap-2 mt-1 text-[10px]">
                        <span className="text-muted-foreground">Atual: {formatCurrency(task.valor_atual_casa)}</span>
                        <ArrowRight className="h-3 w-3 text-muted-foreground" />
                        <span className="text-primary">Alvo: {formatCurrency(task.valor_alvo_casa)}</span>
                      </div>
                    )}
                  </div>
                  <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0 mt-1" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* History */}
      {historico.length > 0 && (
        <div className="space-y-2 pt-2">
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Histórico ({historico.length})
          </h3>
          <ScrollArea className="max-h-[300px]">
            <div className="space-y-1.5">
              {historico.map((task: any) => (
                <Card key={task.id} className="opacity-70">
                  <CardContent className="py-2.5 px-4">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <Badge variant="outline" className={`text-[10px] ${STATUS_COLORS[task.status]}`}>
                            {task.status === "concluido" && <CheckCircle2 className="h-2.5 w-2.5 mr-0.5" />}
                            {task.status === "rejeitado" && <XCircle className="h-2.5 w-2.5 mr-0.5" />}
                            {STATUS_LABELS[task.status]}
                          </Badge>
                          <span className="text-xs text-foreground truncate">{task.titulo}</span>
                        </div>
                        <p className="text-[10px] text-muted-foreground mt-0.5">
                          {format(new Date(task.created_at), "dd/MM/yyyy")}
                          {task.valor && ` — ${formatCurrency(task.valor)}`}
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </ScrollArea>
        </div>
      )}

      {/* Task action dialog */}
      <Dialog open={!!selectedTask} onOpenChange={(o) => { if (!o) { setSelectedTask(null); setActionType(null); } }}>
        <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
          {selectedTask && (
            <>
              <DialogHeader>
                <DialogTitle className="text-base">{selectedTask.titulo}</DialogTitle>
              </DialogHeader>
              <div className="space-y-3 py-2">
                {/* Details */}
                <div className="flex flex-wrap gap-1.5">
                  <Badge variant="outline" className={`text-[10px] ${PRIORIDADE_COLORS[selectedTask.prioridade]}`}>
                    {PRIORIDADE_LABELS[selectedTask.prioridade]}
                  </Badge>
                  <Badge variant="outline" className="text-[10px]">
                    {TIPO_LABELS[selectedTask.tipo] || selectedTask.tipo}
                  </Badge>
                  {selectedTask.valor && (
                    <Badge variant="outline" className="text-[10px] font-semibold">
                      {formatCurrency(selectedTask.valor)}
                    </Badge>
                  )}
                </div>

                {selectedTask.descricao && (
                  <div className="p-2.5 rounded-lg bg-muted/50 border border-border">
                    <p className="text-xs text-muted-foreground mb-0.5">Instruções:</p>
                    <p className="text-sm text-foreground whitespace-pre-wrap">{selectedTask.descricao}</p>
                  </div>
                )}

                {selectedTask.casa_nome && (
                  <div className="flex items-center gap-2 text-sm">
                    {selectedTask.casa_logo && <img src={selectedTask.casa_logo} alt="" className="h-5 w-5 rounded" />}
                    <Building2 className="h-4 w-4 text-muted-foreground" />
                    <span className="font-medium">{selectedTask.casa_nome}</span>
                  </div>
                )}

                {selectedTask.valor_alvo_casa != null && selectedTask.valor_atual_casa != null && (
                  <div className="p-2.5 rounded-lg bg-primary/5 border border-primary/20">
                    <p className="text-[10px] text-muted-foreground mb-1">Contexto de Alocação</p>
                    <div className="grid grid-cols-3 gap-2 text-xs">
                      <div>
                        <p className="text-muted-foreground text-[10px]">Atual</p>
                        <p className="font-semibold">{formatCurrency(selectedTask.valor_atual_casa)}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground text-[10px]">Alvo</p>
                        <p className="font-semibold text-primary">{formatCurrency(selectedTask.valor_alvo_casa)}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground text-[10px]">Diferença</p>
                        <p className="font-semibold text-orange-400">
                          {formatCurrency(selectedTask.valor_alvo_casa - selectedTask.valor_atual_casa)}
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {selectedTask.data_limite && (
                  <div className="flex items-center gap-2 text-xs">
                    <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                    <span>Prazo: {format(new Date(selectedTask.data_limite), "dd/MM/yyyy HH:mm")}</span>
                  </div>
                )}

                {/* Action buttons */}
                {(selectedTask.status === "pendente" || selectedTask.status === "em_andamento") && (
                  <>
                    <div className="flex gap-2 pt-2">
                      <Button
                        variant={actionType === "concluir" ? "default" : "outline"}
                        size="sm"
                        className="flex-1 gap-1.5"
                        onClick={() => setActionType("concluir")}
                      >
                        <CheckCircle2 className="h-3.5 w-3.5" /> Concluir
                      </Button>
                      <Button
                        variant={actionType === "rejeitar" ? "destructive" : "outline"}
                        size="sm"
                        className="flex-1 gap-1.5"
                        onClick={() => setActionType("rejeitar")}
                      >
                        <XCircle className="h-3.5 w-3.5" /> Rejeitar
                      </Button>
                    </div>

                    {actionType && (
                      <div className="space-y-3 pt-1 border-t border-border">
                        <div>
                          <Label>{actionType === "concluir" ? "Observações (opcional)" : "Motivo da recusa *"}</Label>
                          <Textarea
                            value={observacoes}
                            onChange={e => setObservacoes(e.target.value)}
                            rows={2}
                            placeholder={actionType === "concluir" ? "Detalhes da execução..." : "Por que não é possível executar..."}
                          />
                        </div>

                        {actionType === "concluir" && (
                          <div>
                            <Label>Comprovante (opcional)</Label>
                            <div className="mt-1">
                              <label className="flex items-center gap-2 px-3 py-2 border border-dashed border-border rounded-lg cursor-pointer hover:bg-muted/50 transition-colors">
                                <Upload className="h-4 w-4 text-muted-foreground" />
                                <span className="text-xs text-muted-foreground">
                                  {comprovanteFile ? comprovanteFile.name : "Clique para anexar"}
                                </span>
                                <input
                                  type="file"
                                  accept="image/*,.pdf"
                                  className="hidden"
                                  onChange={e => setComprovanteFile(e.target.files?.[0] || null)}
                                />
                              </label>
                            </div>
                          </div>
                        )}

                        <Button
                          className="w-full"
                          onClick={handleSubmit}
                          disabled={
                            updateTaskMutation.isPending || uploading ||
                            (actionType === "rejeitar" && !observacoes.trim())
                          }
                        >
                          {uploading ? "Enviando..." : updateTaskMutation.isPending ? "Processando..." : actionType === "concluir" ? "Confirmar Conclusão" : "Confirmar Recusa"}
                        </Button>
                      </div>
                    )}
                  </>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
