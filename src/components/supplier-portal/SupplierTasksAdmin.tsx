import { useState, useMemo, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Plus, ClipboardList, Clock, CheckCircle2, XCircle, AlertTriangle,
  Zap, Building2, ArrowRight, User, Trash2, Pencil
} from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";

interface Props {
  supplierWorkspaceId: string;
  supplierNome: string;
  parentWorkspaceId: string;
}

interface CasaItem {
  bookmaker_catalogo_id: string;
  nome: string;
  logo_url?: string;
  saldo_atual: number;
  valor_alocado: number;
  valor: string; // user input
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

function formatCurrency(val: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(val);
}

export function SupplierTasksAdmin({ supplierWorkspaceId, supplierNome, parentWorkspaceId }: Props) {
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [editTask, setEditTask] = useState<any>(null);
  const [deleteTask, setDeleteTask] = useState<any>(null);
  const [filterStatus, setFilterStatus] = useState<string>("all");

  // Form state
  const [tipo, setTipo] = useState("deposito");
  const [titularId, setTitularId] = useState("");
  const [titulo, setTitulo] = useState("");
  const [descricao, setDescricao] = useState("");
  const [prioridade, setPrioridade] = useState("media");
  const [dataLimite, setDataLimite] = useState("");
  const [observacoesAdmin, setObservacoesAdmin] = useState("");
  
  // Multi-casa state
  const [selectedCasas, setSelectedCasas] = useState<CasaItem[]>([]);

  // Fetch tasks
  const { data: tasks = [], isLoading } = useQuery({
    queryKey: ["supplier-tasks-admin", supplierWorkspaceId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("supplier_tasks")
        .select("*, bookmakers_catalogo(nome, logo_url), supplier_titulares(id, nome, documento)")
        .eq("supplier_workspace_id", supplierWorkspaceId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });

  // Fetch titulares
  const { data: titulares = [] } = useQuery({
    queryKey: ["supplier-titulares-admin", supplierWorkspaceId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("supplier_titulares")
        .select("id, nome, documento, status")
        .eq("supplier_workspace_id", supplierWorkspaceId)
        .in("status", ["ativo", "ATIVO"])
        .order("nome");
      if (error) throw error;
      return data || [];
    },
  });

  // Fetch bookmaker accounts for the selected titular
  const { data: titularAccounts = [] } = useQuery({
    queryKey: ["supplier-titular-accounts", supplierWorkspaceId, titularId],
    enabled: !!titularId,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("supplier_bookmaker_accounts")
        .select("id, bookmaker_catalogo_id, saldo_atual, status, bookmakers_catalogo(id, nome, logo_url)")
        .eq("supplier_workspace_id", supplierWorkspaceId)
        .eq("titular_id", titularId)
        .eq("status", "ATIVA");
      if (error) throw error;
      return (data || []).map((a: any) => ({
        id: a.id,
        bookmaker_catalogo_id: a.bookmaker_catalogo_id,
        nome: a.bookmakers_catalogo?.nome || "—",
        logo_url: a.bookmakers_catalogo?.logo_url,
        saldo_atual: Number(a.saldo_atual) || 0,
      }));
    },
  });

  // Fetch allowed bookmakers for allocation context (with catalog info for criacao_conta)
  const { data: allowedBookmakers = [] } = useQuery({
    queryKey: ["supplier-allowed-bookmakers-admin", supplierWorkspaceId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("supplier_allowed_bookmakers")
        .select("bookmaker_catalogo_id, valor_alocado, bookmakers_catalogo(id, nome, logo_url)")
        .eq("supplier_workspace_id", supplierWorkspaceId);
      if (error) throw error;
      return (data || []).map((a: any) => ({
        bookmaker_catalogo_id: a.bookmaker_catalogo_id,
        valor_alocado: Number(a.valor_alocado) || 0,
        nome: a.bookmakers_catalogo?.nome || "—",
        logo_url: a.bookmakers_catalogo?.logo_url,
      }));
    },
  });

  // For criacao_conta: show allowed bookmakers that the titular does NOT have yet
  const casasForCriacao = useMemo(() => {
    if (!titularId || tipo !== "criacao_conta") return [];
    const existingIds = new Set(titularAccounts.map((a: any) => a.bookmaker_catalogo_id));
    return allowedBookmakers
      .filter((b: any) => !existingIds.has(b.bookmaker_catalogo_id))
      .map((b: any) => ({
        bookmaker_catalogo_id: b.bookmaker_catalogo_id,
        nome: b.nome,
        logo_url: b.logo_url,
        saldo_atual: 0,
        valor_alocado: b.valor_alocado,
      }))
      .sort((a: any, b: any) => (b.valor_alocado || 0) - (a.valor_alocado || 0));
  }, [titularId, tipo, allowedBookmakers, titularAccounts]);

  const casasForTitular = useMemo(() => {
    if (!titularId) return [];
    if (tipo === "criacao_conta") return casasForCriacao;
    return titularAccounts;
  }, [titularId, titularAccounts, tipo, casasForCriacao]);

  const selectedTitular = titulares.find((t: any) => t.id === titularId);
  const needsCasa = tipo === "deposito" || tipo === "saque" || tipo === "ajuste_saldo" || tipo === "criacao_conta";
  const needsTitular = tipo !== "outros";

  // Toggle a casa in multi-select
  function toggleCasa(casa: any) {
    setSelectedCasas(prev => {
      const exists = prev.find(c => c.bookmaker_catalogo_id === casa.bookmaker_catalogo_id);
      if (exists) {
        return prev.filter(c => c.bookmaker_catalogo_id !== casa.bookmaker_catalogo_id);
      }
      const alloc = allowedBookmakers.find((b: any) => b.bookmaker_catalogo_id === casa.bookmaker_catalogo_id);
      const valorAlocado = alloc?.valor_alocado || 0;
      // Only pre-fill with suggestion when account is new (saldo = 0)
      const isNewAccount = casa.saldo_atual === 0;
      return [...prev, {
        bookmaker_catalogo_id: casa.bookmaker_catalogo_id,
        nome: casa.nome,
        logo_url: casa.logo_url,
        saldo_atual: casa.saldo_atual,
        valor_alocado: valorAlocado,
        valor: isNewAccount && valorAlocado > 0 ? valorAlocado.toFixed(2) : "",
      }];
    });
  }

  function updateCasaValor(catalogoId: string, valor: string) {
    setSelectedCasas(prev => prev.map(c =>
      c.bookmaker_catalogo_id === catalogoId ? { ...c, valor } : c
    ));
  }

  const totalValor = selectedCasas.reduce((sum, c) => sum + (parseFloat(c.valor) || 0), 0);

  // Create task mutation
  const createMutation = useMutation({
    mutationFn: async () => {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) throw new Error("Não autenticado");

      const titularNome = selectedTitular?.nome || "";
      const casasCount = selectedCasas.length;

      // Build casas_items for storage
      const casasItems = selectedCasas.map(c => ({
        bookmaker_catalogo_id: c.bookmaker_catalogo_id,
        nome: c.nome,
        logo_url: c.logo_url || null,
        valor: parseFloat(c.valor) || 0,
        saldo_atual: c.saldo_atual,
        valor_alocado: c.valor_alocado,
      }));

      const autoTitulo = titulo.trim() || (() => {
        // Simple: "Depósito — Glayza"
        const tipoSimples: Record<string, string> = {
          deposito: "Depósito",
          saque: "Saque",
          criacao_conta: "Criação de Conta",
          ajuste_saldo: "Ajuste",
          outros: "Tarefa",
        };
        const label = tipoSimples[tipo] || tipo;
        if (titularNome) {
          const primeiroNome = titularNome.split(" ")[0];
          return `${label} — ${primeiroNome.charAt(0).toUpperCase() + primeiroNome.slice(1).toLowerCase()}`;
        }
        return label;
      })();

      // For single casa, keep backward compatibility with bookmaker_catalogo_id + valor
      const singleCasa = casasItems.length === 1 ? casasItems[0] : null;

      const { error } = await (supabase as any).from("supplier_tasks").insert({
        supplier_workspace_id: supplierWorkspaceId,
        parent_workspace_id: parentWorkspaceId,
        tipo,
        titulo: autoTitulo,
        descricao: descricao.trim() || null,
        valor: totalValor || null,
        prioridade,
        data_limite: dataLimite || null,
        bookmaker_catalogo_id: singleCasa?.bookmaker_catalogo_id || null,
        titular_id: titularId || null,
        observacoes_admin: observacoesAdmin.trim() || null,
        valor_atual_casa: singleCasa ? singleCasa.saldo_atual : null,
        valor_alvo_casa: singleCasa ? singleCasa.valor_alocado : null,
        casas_items: casasItems.length > 0 ? casasItems : null,
        created_by: userData.user.id,
        status: "pendente",
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Tarefa criada com sucesso");
      queryClient.invalidateQueries({ queryKey: ["supplier-tasks-admin", supplierWorkspaceId] });
      resetForm();
      setCreateOpen(false);
    },
    onError: (e: any) => toast.error(e.message),
  });

  function resetForm() {
    setTipo("deposito");
    setTitularId("");
    setTitulo("");
    setDescricao("");
    setPrioridade("media");
    setDataLimite("");
    setObservacoesAdmin("");
    setSelectedCasas([]);
  }

  function openEditTask(task: any) {
    setTipo(task.tipo || "deposito");
    setTitularId(task.titular_id || "");
    setTitulo(task.titulo || "");
    setDescricao(task.descricao || "");
    setPrioridade(task.prioridade || "media");
    setDataLimite(task.data_limite ? task.data_limite.slice(0, 16) : "");
    setObservacoesAdmin(task.observacoes_admin || "");
    // Rebuild selectedCasas from casas_items
    if (task.casas_items && Array.isArray(task.casas_items)) {
      setSelectedCasas(task.casas_items.map((item: any) => ({
        bookmaker_catalogo_id: item.bookmaker_catalogo_id,
        nome: item.nome,
        logo_url: item.logo_url,
        saldo_atual: item.saldo_atual || 0,
        valor_alocado: item.valor_alocado || 0,
        valor: item.valor?.toString() || "",
      })));
    } else if (task.bookmaker_catalogo_id) {
      setSelectedCasas([{
        bookmaker_catalogo_id: task.bookmaker_catalogo_id,
        nome: task.bookmakers_catalogo?.nome || "—",
        logo_url: task.bookmakers_catalogo?.logo_url,
        saldo_atual: task.valor_atual_casa || 0,
        valor_alocado: task.valor_alvo_casa || 0,
        valor: task.valor?.toString() || "",
      }]);
    } else {
      setSelectedCasas([]);
    }
    setEditTask(task);
  }

  // Update task mutation
  const updateMutation = useMutation({
    mutationFn: async () => {
      if (!editTask) throw new Error("Nenhuma tarefa selecionada");

      const titularNome = selectedTitular?.nome || "";
      const casasCount = selectedCasas.length;

      const casasItems = selectedCasas.map(c => ({
        bookmaker_catalogo_id: c.bookmaker_catalogo_id,
        nome: c.nome,
        logo_url: c.logo_url || null,
        valor: parseFloat(c.valor) || 0,
        saldo_atual: c.saldo_atual,
        valor_alocado: c.valor_alocado,
      }));

      const autoTitulo = titulo.trim() || (() => {
        const tipoSimples: Record<string, string> = {
          deposito: "Depósito", saque: "Saque", criacao_conta: "Criação de Conta",
          ajuste_saldo: "Ajuste", outros: "Tarefa",
        };
        const label = tipoSimples[tipo] || tipo;
        if (titularNome) {
          const primeiroNome = titularNome.split(" ")[0];
          return `${label} — ${primeiroNome.charAt(0).toUpperCase() + primeiroNome.slice(1).toLowerCase()}`;
        }
        return label;
      })();

      const singleCasa = casasItems.length === 1 ? casasItems[0] : null;

      const { error } = await (supabase as any).from("supplier_tasks").update({
        tipo,
        titulo: autoTitulo,
        descricao: descricao.trim() || null,
        valor: totalValor || null,
        prioridade,
        data_limite: dataLimite || null,
        bookmaker_catalogo_id: singleCasa?.bookmaker_catalogo_id || null,
        titular_id: titularId || null,
        observacoes_admin: observacoesAdmin.trim() || null,
        valor_atual_casa: singleCasa ? singleCasa.saldo_atual : null,
        valor_alvo_casa: singleCasa ? singleCasa.valor_alocado : null,
        casas_items: casasItems.length > 0 ? casasItems : null,
      }).eq("id", editTask.id);

      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Tarefa atualizada");
      queryClient.invalidateQueries({ queryKey: ["supplier-tasks-admin", supplierWorkspaceId] });
      resetForm();
      setEditTask(null);
    },
    onError: (e: any) => toast.error(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (taskId: string) => {
      const { error } = await (supabase as any)
        .from("supplier_tasks")
        .delete()
        .eq("id", taskId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Tarefa excluída");
      queryClient.invalidateQueries({ queryKey: ["supplier-tasks-admin", supplierWorkspaceId] });
      setDeleteTask(null);
    },
    onError: (e: any) => toast.error(e.message),
  });

  function handleTipoChange(newTipo: string) {
    setTipo(newTipo);
    setTitularId("");
    setSelectedCasas([]);
  }

  function handleTitularChange(newTitularId: string) {
    setTitularId(newTitularId);
    setSelectedCasas([]);
  }

  const filteredTasks = filterStatus === "all" ? tasks : tasks.filter((t: any) => t.status === filterStatus);
  const pendentes = tasks.filter((t: any) => t.status === "pendente").length;
  const emAndamento = tasks.filter((t: any) => t.status === "em_andamento").length;
  const concluidas = tasks.filter((t: any) => t.status === "concluido").length;

  function renderTaskCasasItems(task: any) {
    const items = task.casas_items as any[] | null;
    if (!items || items.length <= 1) return null;
    return (
      <div className="mt-2 space-y-1.5">
        {items.map((item: any, idx: number) => (
          <div key={idx} className="flex items-center justify-between text-xs py-2 px-3 rounded-md bg-muted/30">
            <div className="flex items-center gap-2">
              {item.logo_url && <img src={item.logo_url} alt="" className="h-5 w-5 rounded" />}
              <span className="text-foreground font-medium">{item.nome}</span>
            </div>
            <span className="font-semibold text-foreground">{formatCurrency(item.valor)}</span>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <ClipboardList className="h-4 w-4 text-primary" />
            Central de Operações
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Crie e acompanhe tarefas operacionais
          </p>
        </div>
        <Button size="sm" onClick={() => setCreateOpen(true)} className="gap-1.5">
          <Plus className="h-3.5 w-3.5" /> Nova Tarefa
        </Button>
      </div>

      {/* KPI mini-cards */}
      <div className="grid grid-cols-3 gap-2">
        <Card className="cursor-pointer hover:border-yellow-400/30 transition-colors" onClick={() => setFilterStatus(filterStatus === "pendente" ? "all" : "pendente")}>
          <CardContent className="py-2.5 px-3">
            <p className="text-[10px] text-muted-foreground">Pendentes</p>
            <p className="text-lg font-bold text-yellow-400">{pendentes}</p>
          </CardContent>
        </Card>
        <Card className="cursor-pointer hover:border-blue-400/30 transition-colors" onClick={() => setFilterStatus(filterStatus === "em_andamento" ? "all" : "em_andamento")}>
          <CardContent className="py-2.5 px-3">
            <p className="text-[10px] text-muted-foreground">Em Andamento</p>
            <p className="text-lg font-bold text-blue-400">{emAndamento}</p>
          </CardContent>
        </Card>
        <Card className="cursor-pointer hover:border-emerald-400/30 transition-colors" onClick={() => setFilterStatus(filterStatus === "concluido" ? "all" : "concluido")}>
          <CardContent className="py-2.5 px-3">
            <p className="text-[10px] text-muted-foreground">Concluídas</p>
            <p className="text-lg font-bold text-emerald-400">{concluidas}</p>
          </CardContent>
        </Card>
      </div>

      {/* Tasks list */}
      {isLoading ? (
        <div className="text-center text-muted-foreground text-sm py-8">Carregando...</div>
      ) : filteredTasks.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <ClipboardList className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">
              {filterStatus !== "all" ? "Nenhuma tarefa neste status" : "Nenhuma tarefa criada"}
            </p>
          </CardContent>
        </Card>
      ) : (
        <ScrollArea className="max-h-[500px]">
          <div className="space-y-2">
            {filteredTasks.map((task: any) => (
              <Card key={task.id} className="hover:border-primary/20 transition-colors">
                <CardContent className="py-3 px-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <Badge variant="outline" className={`text-[10px] ${PRIORIDADE_COLORS[task.prioridade]}`}>
                          {task.prioridade === "urgente" && <Zap className="h-2.5 w-2.5 mr-0.5" />}
                          {PRIORIDADE_LABELS[task.prioridade]}
                        </Badge>
                        <Badge variant="outline" className={`text-[10px] ${STATUS_COLORS[task.status]}`}>
                          {task.status === "pendente" && <Clock className="h-2.5 w-2.5 mr-0.5" />}
                          {task.status === "concluido" && <CheckCircle2 className="h-2.5 w-2.5 mr-0.5" />}
                          {task.status === "rejeitado" && <XCircle className="h-2.5 w-2.5 mr-0.5" />}
                          {STATUS_LABELS[task.status]}
                        </Badge>
                        <Badge variant="outline" className="text-[10px]">
                          {TIPO_LABELS[task.tipo] || task.tipo}
                        </Badge>
                      </div>

                      <p className="text-sm font-medium text-foreground truncate">{task.titulo}</p>

                      {task.descricao && (
                        <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{task.descricao}</p>
                      )}

                      <div className="flex items-center gap-3 mt-2 text-[10px] text-muted-foreground flex-wrap">
                        {task.supplier_titulares?.nome && (
                          <span className="flex items-center gap-1">
                            <User className="h-3 w-3" />
                            {task.supplier_titulares.nome}
                          </span>
                        )}
                        {/* Single casa display */}
                        {!task.casas_items && task.bookmakers_catalogo?.nome && (
                          <span className="flex items-center gap-1">
                            <Building2 className="h-3 w-3" />
                            {task.bookmakers_catalogo.nome}
                          </span>
                        )}
                        {/* Multi-casa count */}
                        {task.casas_items && (task.casas_items as any[]).length > 1 && (
                          <span className="flex items-center gap-1">
                            <Building2 className="h-3 w-3" />
                            {(task.casas_items as any[]).length} casas
                          </span>
                        )}
                        {task.valor && (
                          <span className="font-medium text-foreground">{formatCurrency(task.valor)}</span>
                        )}
                        {task.data_limite && (
                          <span className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {format(new Date(task.data_limite), "dd/MM")}
                          </span>
                        )}
                        <span>{format(new Date(task.created_at), "dd/MM HH:mm")}</span>
                      </div>

                      {/* Multi-casa items breakdown */}
                      {renderTaskCasasItems(task)}

                      {/* Single allocation context — only show suggestion for new accounts */}
                      {!task.casas_items && task.valor_alvo_casa != null && task.valor_atual_casa === 0 && (
                        <div className="flex items-center gap-2 mt-1.5 text-[10px]">
                          <span className="text-primary">Sugestão: {formatCurrency(task.valor_alvo_casa)}</span>
                        </div>
                      )}

                      {task.observacoes_fornecedor && (
                        <div className="mt-2 p-2 rounded bg-muted/50 text-xs">
                          <span className="text-muted-foreground">Fornecedor: </span>
                          {task.observacoes_fornecedor}
                        </div>
                      )}

                      {task.comprovante_url && (
                        <a href={task.comprovante_url} target="_blank" rel="noopener noreferrer" className="text-[10px] text-primary underline mt-1 inline-block">
                          Ver comprovante
                        </a>
                      )}
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      {/* Edit button for non-concluded tasks */}
                      {task.status !== "concluido" && task.status !== "rejeitado" && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() => openEditTask(task)}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                      )}
                      {/* Delete button */}
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-muted-foreground hover:text-destructive"
                        onClick={() => setDeleteTask(task)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </ScrollArea>
      )}

      {/* Create task dialog */}
      <Dialog open={createOpen} onOpenChange={(o) => { setCreateOpen(o); if (!o) resetForm(); }}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ClipboardList className="h-5 w-5 text-primary" />
              Nova Tarefa — {supplierNome}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {/* Step 1: Tipo */}
            <div>
              <Label>Tipo de Tarefa *</Label>
              <Select value={tipo} onValueChange={handleTipoChange}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(TIPO_LABELS).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Step 2: Titular */}
            {needsTitular && (
              <div>
                <Label>Titular (Pessoa) *</Label>
                <Select value={titularId} onValueChange={handleTitularChange}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione o titular" />
                  </SelectTrigger>
                  <SelectContent>
                    {titulares.map((t: any) => (
                      <SelectItem key={t.id} value={t.id}>
                        <div className="flex items-center gap-2">
                          <User className="h-3.5 w-3.5 text-muted-foreground" />
                          <span>{t.nome}</span>
                          {t.documento && (
                            <span className="text-muted-foreground text-[10px]">({t.documento})</span>
                          )}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Step 3: Multi-casa selection */}
            {needsCasa && titularId && (
              <div>
                <Label className="mb-2 block">
                  {tipo === "criacao_conta" ? "Casas a criar (selecione)" : "Casas (selecione uma ou mais)"}
                </Label>
                {casasForTitular.length === 0 ? (
                  <div className="p-2.5 rounded-lg bg-muted/50 border border-border text-xs text-muted-foreground flex items-center gap-2">
                    <AlertTriangle className="h-3.5 w-3.5 text-orange-400" />
                    {tipo === "criacao_conta" ? "Todas as casas permitidas já foram criadas" : "Este titular não possui casas vinculadas"}
                  </div>
                ) : (
                  <div className="space-y-1.5 border border-border rounded-lg p-2">
                    {/* Select all / Deselect all */}
                    {casasForTitular.length > 1 && (
                      <div
                        className="flex items-center gap-2 p-2 rounded-md cursor-pointer hover:bg-muted/50 border-b border-border mb-1"
                        onClick={() => {
                          const allSelected = casasForTitular.every((c: any) =>
                            selectedCasas.some(s => s.bookmaker_catalogo_id === c.bookmaker_catalogo_id)
                          );
                          if (allSelected) {
                            setSelectedCasas([]);
                          } else {
                            const all = casasForTitular.map((c: any) => {
                              const alloc = allowedBookmakers.find((b: any) => b.bookmaker_catalogo_id === c.bookmaker_catalogo_id);
                              return {
                                bookmaker_catalogo_id: c.bookmaker_catalogo_id,
                                nome: c.nome,
                                logo_url: c.logo_url,
                                saldo_atual: c.saldo_atual || 0,
                                valor_alocado: alloc?.valor_alocado || 0,
                              };
                            });
                            setSelectedCasas(all);
                          }
                        }}
                      >
                        <Checkbox
                          checked={casasForTitular.length > 0 && casasForTitular.every((c: any) =>
                            selectedCasas.some(s => s.bookmaker_catalogo_id === c.bookmaker_catalogo_id)
                          )}
                          className="pointer-events-none"
                        />
                        <span className="text-xs font-medium text-muted-foreground">
                          {casasForTitular.every((c: any) => selectedCasas.some(s => s.bookmaker_catalogo_id === c.bookmaker_catalogo_id))
                            ? "Desmarcar todas"
                            : `Selecionar todas (${casasForTitular.length})`}
                        </span>
                      </div>
                    )}
                    {casasForTitular.map((casa: any) => {
                      const alloc = allowedBookmakers.find((b: any) => b.bookmaker_catalogo_id === casa.bookmaker_catalogo_id);
                      const valorAlvo = alloc?.valor_alocado || 0;
                      const diff = valorAlvo - casa.saldo_atual;
                      const isSelected = selectedCasas.some(c => c.bookmaker_catalogo_id === casa.bookmaker_catalogo_id);

                      return (
                        <div
                          key={casa.bookmaker_catalogo_id}
                          className={`flex items-center gap-2 p-2 rounded-md cursor-pointer transition-colors ${
                            isSelected ? "bg-primary/10 border border-primary/30" : "hover:bg-muted/50"
                          }`}
                          onClick={() => toggleCasa(casa)}
                        >
                          <Checkbox checked={isSelected} className="pointer-events-none" />
                          {casa.logo_url && <img src={casa.logo_url} alt="" className="h-5 w-5 rounded" />}
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-medium text-foreground">{casa.nome}</p>
                            <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                              <span>Saldo: {formatCurrency(casa.saldo_atual)}</span>
                              {valorAlvo > 0 && casa.saldo_atual === 0 && (
                                <span className="text-primary">
                                  Sugestão: {formatCurrency(valorAlvo)}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* Individual values per selected casa */}
            {selectedCasas.length > 0 && (
              <div>
                <Label className="mb-2 block">
                  {tipo === "criacao_conta" ? "Depósito inicial por casa (opcional)" : "Valores por Casa"}
                  {selectedCasas.length > 1 && (
                    <span className="ml-2 text-xs font-normal text-muted-foreground">
                      Total: {formatCurrency(totalValor)}
                    </span>
                  )}
                </Label>
                <div className="space-y-2 border border-border rounded-lg p-2">
                  {selectedCasas.map((casa) => {
                    const diff = casa.valor_alocado - casa.saldo_atual;
                    return (
                      <div key={casa.bookmaker_catalogo_id} className="flex items-center gap-2">
                        <div className="flex items-center gap-1.5 min-w-0 flex-1">
                          {casa.logo_url && <img src={casa.logo_url} alt="" className="h-4 w-4 rounded shrink-0" />}
                          <span className="text-xs font-medium text-foreground truncate">{casa.nome}</span>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <Input
                            type="number"
                            step="0.01"
                            className="w-28 h-8 text-xs text-right"
                            value={casa.valor}
                            onChange={(e) => updateCasaValor(casa.bookmaker_catalogo_id, e.target.value)}
                            placeholder={diff > 0 ? diff.toFixed(2) : "0.00"}
                          />
                          {diff > 0 && !casa.valor && (
                            <button
                              type="button"
                              onClick={() => updateCasaValor(casa.bookmaker_catalogo_id, diff.toFixed(2))}
                              className="text-[9px] text-primary underline whitespace-nowrap"
                            >
                              Sugerir
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => setSelectedCasas(prev => prev.filter(c => c.bookmaker_catalogo_id !== casa.bookmaker_catalogo_id))}
                            className="text-muted-foreground hover:text-destructive transition-colors"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Titulo */}
            <div>
              <Label>Título (opcional — gerado automaticamente)</Label>
              <Input value={titulo} onChange={e => setTitulo(e.target.value)} placeholder="Ex: Depositar em 3 casas — Glayza" />
            </div>

            {/* Descrição */}
            <div>
              <Label>Descrição / Instruções</Label>
              <Textarea value={descricao} onChange={e => setDescricao(e.target.value)} rows={3} placeholder="Detalhes para o fornecedor..." />
            </div>

            {/* Prioridade */}
            <div>
              <Label>Prioridade</Label>
              <Select value={prioridade} onValueChange={setPrioridade}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(PRIORIDADE_LABELS).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Data Limite */}
            <div>
              <Label>Data Limite (opcional)</Label>
              <Input type="datetime-local" value={dataLimite} onChange={e => setDataLimite(e.target.value)} />
            </div>

            {/* Observações internas */}
            <div>
              <Label>Observações Internas (não visível ao fornecedor)</Label>
              <Textarea value={observacoesAdmin} onChange={e => setObservacoesAdmin(e.target.value)} rows={2} placeholder="Notas internas..." />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancelar</Button>
            <Button
              onClick={() => createMutation.mutate()}
              disabled={createMutation.isPending || (needsTitular && !titularId) || (needsCasa && selectedCasas.length === 0)}
            >
              {createMutation.isPending ? "Criando..." : `Criar Tarefa${selectedCasas.length > 1 ? ` (${selectedCasas.length} casas)` : ""}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit task dialog — reuses same form fields */}
      <Dialog open={!!editTask} onOpenChange={(o) => { if (!o) { setEditTask(null); resetForm(); } }}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Pencil className="h-5 w-5 text-primary" />
              Editar Tarefa
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {/* Tipo */}
            <div>
              <Label>Tipo de Tarefa *</Label>
              <Select value={tipo} onValueChange={handleTipoChange}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(TIPO_LABELS).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Titular */}
            {needsTitular && (
              <div>
                <Label>Titular (Pessoa) *</Label>
                <Select value={titularId} onValueChange={handleTitularChange}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione o titular" />
                  </SelectTrigger>
                  <SelectContent>
                    {titulares.map((t: any) => (
                      <SelectItem key={t.id} value={t.id}>
                        <div className="flex items-center gap-2">
                          <User className="h-3.5 w-3.5 text-muted-foreground" />
                          <span>{t.nome}</span>
                          {t.documento && (
                            <span className="text-muted-foreground text-[10px]">({t.documento})</span>
                          )}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Multi-casa selection */}
            {needsCasa && titularId && (
              <div>
                <Label className="mb-2 block">
                  {tipo === "criacao_conta" ? "Casas a criar (selecione)" : "Casas (selecione uma ou mais)"}
                </Label>
                {casasForTitular.length === 0 ? (
                  <div className="p-2.5 rounded-lg bg-muted/50 border border-border text-xs text-muted-foreground flex items-center gap-2">
                    <AlertTriangle className="h-3.5 w-3.5 text-orange-400" />
                    {tipo === "criacao_conta" ? "Todas as casas permitidas já foram criadas" : "Este titular não possui casas vinculadas"}
                  </div>
                ) : (
                  <div className="space-y-1.5 border border-border rounded-lg p-2">
                    {casasForTitular.length > 1 && (
                      <div
                        className="flex items-center gap-2 p-2 rounded-md cursor-pointer hover:bg-muted/50 border-b border-border mb-1"
                        onClick={() => {
                          const allSelected = casasForTitular.every((c: any) =>
                            selectedCasas.some(s => s.bookmaker_catalogo_id === c.bookmaker_catalogo_id)
                          );
                          if (allSelected) {
                            setSelectedCasas([]);
                          } else {
                            const all = casasForTitular.map((c: any) => {
                              const alloc = allowedBookmakers.find((b: any) => b.bookmaker_catalogo_id === c.bookmaker_catalogo_id);
                              return {
                                bookmaker_catalogo_id: c.bookmaker_catalogo_id,
                                nome: c.nome,
                                logo_url: c.logo_url,
                                saldo_atual: c.saldo_atual || 0,
                                valor_alocado: alloc?.valor_alocado || 0,
                              };
                            });
                            setSelectedCasas(all);
                          }
                        }}
                      >
                        <Checkbox
                          checked={casasForTitular.length > 0 && casasForTitular.every((c: any) =>
                            selectedCasas.some(s => s.bookmaker_catalogo_id === c.bookmaker_catalogo_id)
                          )}
                          className="pointer-events-none"
                        />
                        <span className="text-xs font-medium text-muted-foreground">
                          {casasForTitular.every((c: any) => selectedCasas.some(s => s.bookmaker_catalogo_id === c.bookmaker_catalogo_id))
                            ? "Desmarcar todas"
                            : `Selecionar todas (${casasForTitular.length})`}
                        </span>
                      </div>
                    )}
                    {casasForTitular.map((casa: any) => {
                      const alloc = allowedBookmakers.find((b: any) => b.bookmaker_catalogo_id === casa.bookmaker_catalogo_id);
                      const valorAlvo = alloc?.valor_alocado || 0;
                      const diff = valorAlvo - casa.saldo_atual;
                      const isSelected = selectedCasas.some(c => c.bookmaker_catalogo_id === casa.bookmaker_catalogo_id);
                      return (
                        <div
                          key={casa.bookmaker_catalogo_id}
                          className={`flex items-center gap-2 p-2 rounded-md cursor-pointer transition-colors ${
                            isSelected ? "bg-primary/10 border border-primary/30" : "hover:bg-muted/50"
                          }`}
                          onClick={() => toggleCasa(casa)}
                        >
                          <Checkbox checked={isSelected} className="pointer-events-none" />
                          {casa.logo_url && <img src={casa.logo_url} alt="" className="h-5 w-5 rounded" />}
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-medium text-foreground">{casa.nome}</p>
                            <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                              <span>Saldo: {formatCurrency(casa.saldo_atual)}</span>
                              {valorAlvo > 0 && casa.saldo_atual === 0 && (
                                <span className="text-primary">
                                  Sugestão: {formatCurrency(valorAlvo)}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* Valores por casa */}
            {selectedCasas.length > 0 && (
              <div>
                <Label className="mb-2 block">
                  {tipo === "criacao_conta" ? "Depósito inicial por casa (opcional)" : "Valores por Casa"}
                  {selectedCasas.length > 1 && (
                    <span className="ml-2 text-xs font-normal text-muted-foreground">
                      Total: {formatCurrency(totalValor)}
                    </span>
                  )}
                </Label>
                <div className="space-y-2 border border-border rounded-lg p-2">
                  {selectedCasas.map((casa) => {
                    const diff = casa.valor_alocado - casa.saldo_atual;
                    return (
                      <div key={casa.bookmaker_catalogo_id} className="flex items-center gap-2">
                        <div className="flex items-center gap-1.5 min-w-0 flex-1">
                          {casa.logo_url && <img src={casa.logo_url} alt="" className="h-4 w-4 rounded shrink-0" />}
                          <span className="text-xs font-medium text-foreground truncate">{casa.nome}</span>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <Input
                            type="number"
                            step="0.01"
                            className="w-28 h-8 text-xs text-right"
                            value={casa.valor}
                            onChange={(e) => updateCasaValor(casa.bookmaker_catalogo_id, e.target.value)}
                            placeholder={diff > 0 ? diff.toFixed(2) : "0.00"}
                          />
                          <button
                            type="button"
                            onClick={() => setSelectedCasas(prev => prev.filter(c => c.bookmaker_catalogo_id !== casa.bookmaker_catalogo_id))}
                            className="text-muted-foreground hover:text-destructive transition-colors"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Título */}
            <div>
              <Label>Título (opcional — gerado automaticamente)</Label>
              <Input value={titulo} onChange={e => setTitulo(e.target.value)} placeholder="Ex: Depositar em 3 casas — Glayza" />
            </div>

            {/* Descrição */}
            <div>
              <Label>Descrição / Instruções</Label>
              <Textarea value={descricao} onChange={e => setDescricao(e.target.value)} rows={3} placeholder="Detalhes para o fornecedor..." />
            </div>

            {/* Prioridade */}
            <div>
              <Label>Prioridade</Label>
              <Select value={prioridade} onValueChange={setPrioridade}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(PRIORIDADE_LABELS).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Data Limite */}
            <div>
              <Label>Data Limite (opcional)</Label>
              <Input type="datetime-local" value={dataLimite} onChange={e => setDataLimite(e.target.value)} />
            </div>

            {/* Observações internas */}
            <div>
              <Label>Observações Internas (não visível ao fornecedor)</Label>
              <Textarea value={observacoesAdmin} onChange={e => setObservacoesAdmin(e.target.value)} rows={2} placeholder="Notas internas..." />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setEditTask(null); resetForm(); }}>Cancelar</Button>
            <Button
              onClick={() => updateMutation.mutate()}
              disabled={updateMutation.isPending || (needsTitular && !titularId) || (needsCasa && selectedCasas.length === 0)}
            >
              {updateMutation.isPending ? "Salvando..." : "Salvar Alterações"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation dialog */}
      <Dialog open={!!deleteTask} onOpenChange={(o) => { if (!o) setDeleteTask(null); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <Trash2 className="h-5 w-5" />
              Excluir Tarefa
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground py-2">
            Tem certeza que deseja excluir a tarefa <strong className="text-foreground">{deleteTask?.titulo}</strong>? Esta ação não pode ser desfeita.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTask(null)}>Cancelar</Button>
            <Button
              variant="destructive"
              onClick={() => deleteTask && deleteMutation.mutate(deleteTask.id)}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? "Excluindo..." : "Excluir"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
