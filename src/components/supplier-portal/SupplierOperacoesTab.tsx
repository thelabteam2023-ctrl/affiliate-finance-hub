import { useState, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  ClipboardList, Clock, CheckCircle2, XCircle, Zap,
  Building2, ArrowRight, Upload, User, Banknote, ArrowDownToLine, ArrowUpFromLine, Ban
} from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";

interface Props {
  supplierWorkspaceId: string;
  supplierToken: string;
  onNavigateToDeposit?: (titularId: string, bookmakerCatalogoId: string, valor?: number, taskId?: string) => void;
  onNavigateToSaque?: (titularId: string, bookmakerCatalogoId: string, valor?: number, taskId?: string) => void;
  onNavigateToCreateAccount?: (titularId: string, bookmakerCatalogoIds: string[], taskId?: string) => void;
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
  aguardando_recebimento: "Aguardando Recebimento",
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
  aguardando_recebimento: "text-orange-400 border-orange-400/40 bg-orange-400/10",
  concluido: "text-emerald-400 border-emerald-400/40 bg-emerald-400/10",
  rejeitado: "text-muted-foreground border-muted-foreground/40 bg-muted/30",
};

const TIPO_ICONS: Record<string, typeof Banknote> = {
  deposito: ArrowDownToLine,
  saque: ArrowUpFromLine,
  criacao_conta: Building2,
};

function formatCurrency(val: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(val);
}

export function SupplierOperacoesTab({ supplierWorkspaceId, supplierToken, onNavigateToDeposit, onNavigateToSaque, onNavigateToCreateAccount }: Props) {
  const queryClient = useQueryClient();
  const [selectedTask, setSelectedTask] = useState<any>(null);
  const [actionType, setActionType] = useState<"concluir" | "rejeitar" | null>(null);
  const [observacoes, setObservacoes] = useState("");
  const [uploading, setUploading] = useState(false);
  const [comprovanteFile, setComprovanteFile] = useState<File | null>(null);
  // Track unavailable items per task: Record<taskId, Set<bookmaker_catalogo_id>>
  const [unavailableItems, setUnavailableItems] = useState<Record<string, Set<string>>>({});

  const toggleUnavailable = useCallback((taskId: string, catalogoId: string) => {
    setUnavailableItems(prev => {
      const current = new Set(prev[taskId] || []);
      if (current.has(catalogoId)) current.delete(catalogoId);
      else current.add(catalogoId);
      return { ...prev, [taskId]: current };
    });
  }, []);

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

  function handleDirectAction(task: any, overrideCatalogoId?: string, overrideValor?: number) {
    const catalogoId = overrideCatalogoId || task.bookmaker_catalogo_id;
    const valor = overrideValor ?? task.valor ?? undefined;

    if (task.tipo === "deposito" && onNavigateToDeposit && task.titular_id && catalogoId) {
      updateTaskMutation.mutate({ taskId: task.id, status: "em_andamento" });
      onNavigateToDeposit(task.titular_id, catalogoId, valor, task.id);
    } else if (task.tipo === "saque" && onNavigateToSaque && task.titular_id && catalogoId) {
      updateTaskMutation.mutate({ taskId: task.id, status: "aguardando_recebimento" });
      onNavigateToSaque(task.titular_id, catalogoId, valor, task.id);
    } else if (task.tipo === "criacao_conta" && onNavigateToCreateAccount && task.titular_id) {
      const casasItems = task.casas_items as any[] | null;
      const taskUnavailable = unavailableItems[task.id] || new Set();
      const bookmakerIds = overrideCatalogoId
        ? [overrideCatalogoId]
        : casasItems
          ? casasItems
              .filter((i: any) => !i.concluido && !taskUnavailable.has(i.bookmaker_catalogo_id))
              .map((i: any) => i.bookmaker_catalogo_id)
          : catalogoId ? [catalogoId] : [];
      if (bookmakerIds.length > 0) {
        updateTaskMutation.mutate({ taskId: task.id, status: "em_andamento" });
        onNavigateToCreateAccount(task.titular_id, bookmakerIds, task.id);
      }
    } else {
      setSelectedTask(task);
      setActionType(null);
      setObservacoes("");
      setComprovanteFile(null);
    }
  }

  // Handle confirming receipt of withdrawal funds into bank
  function handleConfirmRecebimento(task: any) {
    setSelectedTask(task);
    setActionType("concluir");
    setObservacoes("");
    setComprovanteFile(null);
  }

  const [activeSubTab, setActiveSubTab] = useState<"abertas" | "concluidas">("abertas");
  const pendentes = tasks.filter((t: any) => t.status === "pendente" || t.status === "em_andamento" || t.status === "aguardando_recebimento");
  const historico = tasks.filter((t: any) => t.status === "concluido" || t.status === "rejeitado");

  function getDirectCTALabel(tipo: string, status?: string) {
    if (status === "aguardando_recebimento" && tipo === "saque") return "Confirmar Recebimento";
    if (tipo === "deposito") return "Depositar";
    if (tipo === "saque") return "Sacar";
    if (tipo === "criacao_conta") return "Criar";
    return null;
  }

  return (
    <div className="space-y-4">
      {/* Tabs: Abertas / Concluídas */}
      <div className="flex gap-1 p-1 bg-muted/50 rounded-lg">
        <button
          className={`flex-1 py-2 px-3 rounded-md text-xs font-medium transition-colors ${
            activeSubTab === "abertas"
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          }`}
          onClick={() => setActiveSubTab("abertas")}
        >
          Abertas ({pendentes.length})
        </button>
        <button
          className={`flex-1 py-2 px-3 rounded-md text-xs font-medium transition-colors ${
            activeSubTab === "concluidas"
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          }`}
          onClick={() => setActiveSubTab("concluidas")}
        >
          Concluídas ({historico.length})
        </button>
      </div>

      {isLoading ? (
        <div className="text-center text-muted-foreground text-sm py-8">Carregando...</div>
      ) : activeSubTab === "abertas" ? (
        // ===== ABERTAS =====
        pendentes.length === 0 ? (
          <Card>
            <CardContent className="py-10 text-center">
              <CheckCircle2 className="h-8 w-8 text-emerald-400/30 mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">Nenhuma tarefa pendente</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {pendentes.map((task: any) => {
              const rawCasasItems = task.casas_items as any[] | null;
              // Sort casas_items by valor descending (houses with deposit value first)
              const casasItems = rawCasasItems
                ? [...rawCasasItems].sort((a: any, b: any) => (b.valor || 0) - (a.valor || 0))
                : null;
              const isMultiCasa = casasItems && casasItems.length > 1;
              const isAguardandoRecebimento = task.status === "aguardando_recebimento";
              const ctaLabel = getDirectCTALabel(task.tipo, task.status);
              const canNavigate = !!onNavigateToDeposit || !!onNavigateToSaque || !!onNavigateToCreateAccount;
              const isCriacao = task.tipo === "criacao_conta";
              const hasDirectAction = isCriacao
                ? ctaLabel && task.titular_id && (casasItems?.length || task.bookmaker_catalogo_id) && canNavigate
                : !isMultiCasa && ctaLabel && task.titular_id && task.bookmaker_catalogo_id && (isAguardandoRecebimento || canNavigate);
              const TipoIcon = TIPO_ICONS[task.tipo];

              return (
                <Card
                  key={task.id}
                  className={`hover:border-primary/20 transition-colors ${
                    task.prioridade === "urgente" ? "border-red-500/30" : ""
                  }`}
                >
                  <CardContent className="py-3 px-4">
                    <div className="flex items-start justify-between gap-2">
                      <div
                        className="flex-1 min-w-0 cursor-pointer"
                        onClick={() => { setSelectedTask(task); setActionType(null); setObservacoes(""); setComprovanteFile(null); }}
                      >
                        <div className="flex items-center gap-1.5 mb-1 flex-wrap">
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
                        <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground flex-wrap">
                          {task.titular_nome && (
                            <span className="flex items-center gap-1.5">
                              <User className="h-3.5 w-3.5" />
                              {task.titular_nome}
                            </span>
                          )}
                          {!isMultiCasa && task.casa_nome && (
                            <span className="flex items-center gap-1.5">
                              {task.casa_logo && <img src={task.casa_logo} alt="" className="h-4 w-4 rounded" />}
                              {task.casa_nome}
                            </span>
                          )}
                          {isMultiCasa && (
                            <span className="flex items-center gap-1.5">
                              <Building2 className="h-3.5 w-3.5" />
                              {casasItems!.length} casas
                            </span>
                          )}
                          {task.valor && (
                            <span className="font-semibold text-foreground">{formatCurrency(task.valor)}</span>
                          )}
                          {task.data_limite && (
                            <span className="flex items-center gap-1">
                              <Clock className="h-3.5 w-3.5" />
                              {format(new Date(task.data_limite), "dd/MM HH:mm")}
                            </span>
                          )}
                        </div>

                        {/* Multi-casa breakdown */}
                        {isMultiCasa && (
                          <div className="mt-2 space-y-1">
                            {casasItems!.map((item: any, idx: number) => {
                              const itemCtaLabel = getDirectCTALabel(task.tipo);
                              const itemDone = item.concluido === true;
                              const taskUnavailable = unavailableItems[task.id] || new Set();
                              const isItemUnavailable = taskUnavailable.has(item.bookmaker_catalogo_id);
                              const canExecItem = !itemDone && !isItemUnavailable && itemCtaLabel && task.titular_id && item.bookmaker_catalogo_id &&
                                ((task.tipo === "deposito" && onNavigateToDeposit) || (task.tipo === "saque" && onNavigateToSaque) || (task.tipo === "criacao_conta" && onNavigateToCreateAccount));
                              return (
                                <div key={idx} className={`flex items-center justify-between text-xs py-2 px-3 rounded-md ${
                                  itemDone ? "bg-emerald-500/10 border border-emerald-500/20" 
                                  : isItemUnavailable ? "bg-muted/20 opacity-50 border border-dashed border-muted-foreground/20"
                                  : "bg-muted/30"
                                }`}>
                                  <div className="flex items-center gap-2">
                                    {itemDone && <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />}
                                    {isItemUnavailable && !itemDone && <Ban className="h-3.5 w-3.5 text-muted-foreground" />}
                                    {item.logo_url && <img src={item.logo_url} alt="" className="h-5 w-5 rounded" />}
                                    <span className={`text-foreground font-medium ${itemDone ? "line-through opacity-60" : ""} ${isItemUnavailable ? "line-through" : ""}`}>{item.nome}</span>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    {item.valor > 0 && !isItemUnavailable && (
                                      <span className={`font-semibold ${task.tipo === "criacao_conta" ? "text-muted-foreground text-[10px]" : "text-foreground"}`}>
                                        {task.tipo === "criacao_conta" ? `Dep. ${formatCurrency(item.valor)}` : formatCurrency(item.valor)}
                                      </span>
                                    )}
                                    {itemDone ? (
                                      <span className="text-[10px] text-emerald-400">✓</span>
                                    ) : isItemUnavailable ? (
                                      <Button
                                        size="sm"
                                        variant="ghost"
                                        className="h-6 px-2 text-[10px] text-muted-foreground hover:text-foreground"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          toggleUnavailable(task.id, item.bookmaker_catalogo_id);
                                        }}
                                      >
                                        Restaurar
                                      </Button>
                                    ) : (
                                      <div className="flex items-center gap-1">
                                        {canExecItem && (
                                          <Button
                                            size="sm"
                                            variant="ghost"
                                            className="h-6 px-2 text-xs gap-1 text-primary hover:text-primary"
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              handleDirectAction(task, item.bookmaker_catalogo_id, item.valor);
                                            }}
                                          >
                                            {itemCtaLabel}
                                          </Button>
                                        )}
                                        {!itemDone && isCriacao && (
                                          <Button
                                            size="sm"
                                            variant="ghost"
                                            className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive"
                                            title="Marcar como indisponível"
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              toggleUnavailable(task.id, item.bookmaker_catalogo_id);
                                            }}
                                          >
                                            <Ban className="h-3 w-3" />
                                          </Button>
                                        )}
                                      </div>
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}

                        {!isMultiCasa && task.valor_alvo_casa != null && task.valor_atual_casa != null && (
                          <div className="flex items-center gap-2 mt-1 text-[10px]">
                            <span className="text-muted-foreground">Atual: {formatCurrency(task.valor_atual_casa)}</span>
                            <ArrowRight className="h-3 w-3 text-muted-foreground" />
                            <span className="text-primary">Alvo: {formatCurrency(task.valor_alvo_casa)}</span>
                          </div>
                        )}
                      </div>

                      {/* Direct CTA Button */}
                      <div className="shrink-0 flex flex-col gap-1.5">
                        {hasDirectAction ? (
                          <Button
                            size="sm"
                            className={`gap-1.5 text-xs ${isAguardandoRecebimento ? "bg-orange-500 hover:bg-orange-600" : ""}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              if (isAguardandoRecebimento) {
                                handleConfirmRecebimento(task);
                              } else {
                                handleDirectAction(task);
                              }
                            }}
                          >
                            {isAguardandoRecebimento ? (
                              <CheckCircle2 className="h-3.5 w-3.5" />
                            ) : (
                              TipoIcon && <TipoIcon className="h-3.5 w-3.5" />
                            )}
                            {ctaLabel}
                          </Button>
                        ) : (
                          <Button
                            size="sm"
                            variant="outline"
                            className="gap-1.5 text-xs"
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedTask(task);
                              setActionType(null);
                              setObservacoes("");
                              setComprovanteFile(null);
                            }}
                          >
                            Detalhes
                            <ArrowRight className="h-3 w-3" />
                          </Button>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )
      ) : (
        // ===== CONCLUÍDAS =====
        historico.length === 0 ? (
          <Card>
            <CardContent className="py-10 text-center">
              <ClipboardList className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">Nenhuma tarefa concluída</p>
            </CardContent>
          </Card>
        ) : (
          <ScrollArea className="max-h-[500px]">
            <div className="space-y-1.5">
              {historico.map((task: any) => (
                <Card key={task.id} className="opacity-80">
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
                        <div className="flex items-center gap-2 text-[10px] text-muted-foreground mt-0.5">
                          {task.titular_nome && (
                            <span className="flex items-center gap-1">
                              <User className="h-2.5 w-2.5" />
                              {task.titular_nome}
                            </span>
                          )}
                          <span>{format(new Date(task.created_at), "dd/MM/yyyy")}</span>
                          {task.valor && <span>{formatCurrency(task.valor)}</span>}
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </ScrollArea>
        )
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

                {/* Titular info */}
                {selectedTask.titular_nome && (
                  <div className="flex items-center gap-2 text-sm">
                    <User className="h-4 w-4 text-muted-foreground" />
                    <span className="font-medium">{selectedTask.titular_nome}</span>
                    {selectedTask.titular_documento && (
                      <span className="text-xs text-muted-foreground">({selectedTask.titular_documento})</span>
                    )}
                  </div>
                )}

                {selectedTask.descricao && (
                  <div className="p-2.5 rounded-lg bg-muted/50 border border-border">
                    <p className="text-xs text-muted-foreground mb-0.5">Instruções:</p>
                    <p className="text-sm text-foreground whitespace-pre-wrap">{selectedTask.descricao}</p>
                  </div>
                )}

                {selectedTask.casa_nome && !selectedTask.casas_items && (
                  <div className="flex items-center gap-2 text-sm">
                    {selectedTask.casa_logo && <img src={selectedTask.casa_logo} alt="" className="h-5 w-5 rounded" />}
                    <Building2 className="h-4 w-4 text-muted-foreground" />
                    <span className="font-medium">{selectedTask.casa_nome}</span>
                  </div>
                )}

                {/* Multi-casa items in detail */}
                {selectedTask.casas_items && (selectedTask.casas_items as any[]).length > 0 && (
                  <div className="space-y-1.5">
                    <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">
                      Casas ({(selectedTask.casas_items as any[]).length})
                    </p>
                    <div className="space-y-1">
                      {(selectedTask.casas_items as any[]).map((item: any, idx: number) => {
                        const itemCta = getDirectCTALabel(selectedTask.tipo);
                        const canExec = itemCta && selectedTask.titular_id && item.bookmaker_catalogo_id &&
                          ((selectedTask.tipo === "deposito" && onNavigateToDeposit) || (selectedTask.tipo === "saque" && onNavigateToSaque));
                        return (
                          <div key={idx} className="flex items-center justify-between py-1.5 px-2.5 rounded-md bg-muted/30 border border-border/50">
                            <div className="flex items-center gap-2">
                              {item.logo_url && <img src={item.logo_url} alt="" className="h-4 w-4 rounded" />}
                              <span className="text-xs font-medium text-foreground">{item.nome}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <div className="text-right">
                                <span className="text-xs font-semibold text-foreground">{formatCurrency(item.valor)}</span>
                                {item.saldo_atual != null && (
                                  <p className="text-[9px] text-muted-foreground">Saldo: {formatCurrency(item.saldo_atual)}</p>
                                )}
                              </div>
                              {canExec && (selectedTask.status === "pendente" || selectedTask.status === "em_andamento") && (
                                <Button
                                  size="sm"
                                  className="h-6 px-2 text-[10px] gap-1"
                                  onClick={() => {
                                    setSelectedTask(null);
                                    handleDirectAction(selectedTask, item.bookmaker_catalogo_id, item.valor);
                                  }}
                                >
                                  {itemCta}
                                </Button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    <div className="flex justify-end pt-1 border-t border-border/50">
                      <span className="text-xs font-bold text-foreground">
                        Total: {formatCurrency((selectedTask.casas_items as any[]).reduce((s: number, i: any) => s + (i.valor || 0), 0))}
                      </span>
                    </div>
                  </div>
                )}

                {!selectedTask.casas_items && selectedTask.valor_alvo_casa != null && selectedTask.valor_atual_casa != null && (
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

                {/* Direct CTA inside dialog */}
                {(selectedTask.status === "pendente" || selectedTask.status === "em_andamento" || selectedTask.status === "aguardando_recebimento") && (
                  <>
                    {/* Aguardando recebimento: show confirm receipt */}
                    {selectedTask.status === "aguardando_recebimento" && (
                      <div className="p-3 rounded-lg bg-orange-500/10 border border-orange-500/20">
                        <p className="text-xs text-orange-400 font-medium mb-2">
                          💰 Saque realizado — aguardando confirmação de recebimento no banco
                        </p>
                        <Button
                          className="w-full gap-2 bg-orange-500 hover:bg-orange-600"
                          size="lg"
                          onClick={() => setActionType("concluir")}
                        >
                          <CheckCircle2 className="h-4 w-4" />
                          Confirmar Recebimento no Banco
                        </Button>
                      </div>
                    )}

                    {/* Quick action CTA (for non-aguardando states) */}
                    {selectedTask.status !== "aguardando_recebimento" && getDirectCTALabel(selectedTask.tipo, selectedTask.status) && selectedTask.titular_id && selectedTask.bookmaker_catalogo_id && (
                      <Button
                        className="w-full gap-2"
                        size="lg"
                        onClick={() => handleDirectAction(selectedTask)}
                      >
                        {TIPO_ICONS[selectedTask.tipo] && (() => { const Icon = TIPO_ICONS[selectedTask.tipo]; return <Icon className="h-4 w-4" />; })()}
                        {getDirectCTALabel(selectedTask.tipo, selectedTask.status)} — {selectedTask.casa_nome}
                        {selectedTask.valor && ` (${formatCurrency(selectedTask.valor)})`}
                      </Button>
                    )}

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
