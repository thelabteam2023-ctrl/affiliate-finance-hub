import { useState, useMemo } from "react";
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
import {
  Plus, ClipboardList, Clock, CheckCircle2, XCircle, AlertTriangle,
  Zap, Building2, ArrowRight, User
} from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";

interface Props {
  supplierWorkspaceId: string;
  supplierNome: string;
  parentWorkspaceId: string;
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

export function SupplierTasksAdmin({ supplierWorkspaceId, supplierNome, parentWorkspaceId }: Props) {
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [filterStatus, setFilterStatus] = useState<string>("all");

  // Form state
  const [tipo, setTipo] = useState("deposito");
  const [titularId, setTitularId] = useState("");
  const [titulo, setTitulo] = useState("");
  const [descricao, setDescricao] = useState("");
  const [valor, setValor] = useState("");
  const [prioridade, setPrioridade] = useState("media");
  const [dataLimite, setDataLimite] = useState("");
  const [bookmakerCatalogoId, setBookmakerCatalogoId] = useState("");
  const [observacoesAdmin, setObservacoesAdmin] = useState("");

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

  // Fetch allowed bookmakers for allocation context
  const { data: allowedBookmakers = [] } = useQuery({
    queryKey: ["supplier-allowed-bookmakers-admin", supplierWorkspaceId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("supplier_allowed_bookmakers")
        .select("bookmaker_catalogo_id, valor_alocado")
        .eq("supplier_workspace_id", supplierWorkspaceId);
      if (error) throw error;
      return (data || []).map((a: any) => ({
        bookmaker_catalogo_id: a.bookmaker_catalogo_id,
        valor_alocado: Number(a.valor_alocado) || 0,
      }));
    },
  });

  // Derived: casas available filtered by titular
  const casasForTitular = useMemo(() => {
    if (!titularId) return [];
    return titularAccounts;
  }, [titularId, titularAccounts]);

  const selectedCasa = casasForTitular.find((c: any) => c.bookmaker_catalogo_id === bookmakerCatalogoId);
  const allocation = allowedBookmakers.find((b: any) => b.bookmaker_catalogo_id === bookmakerCatalogoId);
  const currentBalance = selectedCasa?.saldo_atual || 0;
  const targetBalance = allocation?.valor_alocado || 0;
  const difference = targetBalance - currentBalance;

  const selectedTitular = titulares.find((t: any) => t.id === titularId);

  const needsCasa = tipo === "deposito" || tipo === "saque" || tipo === "ajuste_saldo";
  const needsTitular = tipo !== "outros";
  const needsValor = tipo === "deposito" || tipo === "saque" || tipo === "ajuste_saldo";

  // Create task mutation
  const createMutation = useMutation({
    mutationFn: async () => {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) throw new Error("Não autenticado");

      const titularNome = selectedTitular?.nome || "";
      const casaNome = selectedCasa?.nome || "";
      const valorFmt = valor ? formatCurrency(parseFloat(valor)) : "";

      const autoTitulo = titulo.trim() || (() => {
        const parts = [TIPO_LABELS[tipo]];
        if (casaNome) parts.push(casaNome);
        if (titularNome) parts.push(`(${titularNome})`);
        if (valorFmt) parts.push(valorFmt);
        return parts.join(" — ");
      })();

      const { error } = await (supabase as any).from("supplier_tasks").insert({
        supplier_workspace_id: supplierWorkspaceId,
        parent_workspace_id: parentWorkspaceId,
        tipo,
        titulo: autoTitulo,
        descricao: descricao.trim() || null,
        valor: valor ? parseFloat(valor) : null,
        prioridade,
        data_limite: dataLimite || null,
        bookmaker_catalogo_id: bookmakerCatalogoId || null,
        titular_id: titularId || null,
        observacoes_admin: observacoesAdmin.trim() || null,
        valor_atual_casa: bookmakerCatalogoId ? currentBalance : null,
        valor_alvo_casa: bookmakerCatalogoId ? targetBalance : null,
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
    setValor("");
    setPrioridade("media");
    setDataLimite("");
    setBookmakerCatalogoId("");
    setObservacoesAdmin("");
  }

  function handleTipoChange(newTipo: string) {
    setTipo(newTipo);
    setTitularId("");
    setBookmakerCatalogoId("");
    setValor("");
  }

  function handleTitularChange(newTitularId: string) {
    setTitularId(newTitularId);
    setBookmakerCatalogoId("");
    setValor("");
  }

  const filteredTasks = filterStatus === "all" ? tasks : tasks.filter((t: any) => t.status === filterStatus);

  // KPIs
  const pendentes = tasks.filter((t: any) => t.status === "pendente").length;
  const emAndamento = tasks.filter((t: any) => t.status === "em_andamento").length;
  const concluidas = tasks.filter((t: any) => t.status === "concluido").length;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <ClipboardList className="h-4 w-4 text-primary" />
            Central de Operações — {supplierNome}
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
                        {task.bookmakers_catalogo?.nome && (
                          <span className="flex items-center gap-1">
                            <Building2 className="h-3 w-3" />
                            {task.bookmakers_catalogo.nome}
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

                      {/* Allocation context */}
                      {task.valor_alvo_casa != null && task.valor_atual_casa != null && (
                        <div className="flex items-center gap-2 mt-1.5 text-[10px]">
                          <span className="text-muted-foreground">Atual: {formatCurrency(task.valor_atual_casa)}</span>
                          <ArrowRight className="h-3 w-3 text-muted-foreground" />
                          <span className="text-primary">Alvo: {formatCurrency(task.valor_alvo_casa)}</span>
                        </div>
                      )}

                      {/* Supplier feedback */}
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
                {titulares.length === 0 && (
                  <p className="text-[10px] text-muted-foreground mt-1">Nenhum titular cadastrado</p>
                )}
              </div>
            )}

            {/* Step 3: Casa (filtered by titular) */}
            {needsCasa && titularId && (
              <div>
                <Label>Casa</Label>
                {casasForTitular.length === 0 ? (
                  <div className="p-2.5 rounded-lg bg-muted/50 border border-border text-xs text-muted-foreground flex items-center gap-2">
                    <AlertTriangle className="h-3.5 w-3.5 text-orange-400" />
                    Este titular não possui casas vinculadas
                  </div>
                ) : (
                  <>
                    <Select value={bookmakerCatalogoId} onValueChange={setBookmakerCatalogoId}>
                      <SelectTrigger><SelectValue placeholder="Selecione a casa" /></SelectTrigger>
                      <SelectContent>
                        {casasForTitular.map((c: any) => (
                          <SelectItem key={c.bookmaker_catalogo_id} value={c.bookmaker_catalogo_id}>
                            <div className="flex items-center gap-2">
                              {c.logo_url && <img src={c.logo_url} alt="" className="h-4 w-4 rounded" />}
                              <span>{c.nome}</span>
                              <span className="text-muted-foreground text-[10px]">
                                (Saldo: {formatCurrency(c.saldo_atual)})
                              </span>
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>

                    {/* Allocation context */}
                    {bookmakerCatalogoId && (
                      <div className="mt-2 p-2.5 rounded-lg bg-muted/50 border border-border">
                        <div className="grid grid-cols-3 gap-2 text-xs">
                          <div>
                            <p className="text-muted-foreground text-[10px]">Saldo Atual</p>
                            <p className="font-semibold">{formatCurrency(currentBalance)}</p>
                          </div>
                          <div>
                            <p className="text-muted-foreground text-[10px]">Valor Alvo</p>
                            <p className="font-semibold text-primary">{formatCurrency(targetBalance)}</p>
                          </div>
                          <div>
                            <p className="text-muted-foreground text-[10px]">Diferença</p>
                            <p className={`font-semibold ${difference > 0 ? "text-orange-400" : "text-emerald-400"}`}>
                              {difference > 0 ? "+" : ""}{formatCurrency(difference)}
                            </p>
                          </div>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}

            {/* Valor */}
            {needsValor && (
              <div>
                <Label>Valor (R$)</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={valor}
                  onChange={e => setValor(e.target.value)}
                  placeholder={difference > 0 ? difference.toFixed(2) : "0.00"}
                />
                {difference > 0 && !valor && (
                  <button
                    type="button"
                    onClick={() => setValor(difference.toFixed(2))}
                    className="text-[10px] text-primary mt-1 underline"
                  >
                    Usar diferença sugerida: {formatCurrency(difference)}
                  </button>
                )}
              </div>
            )}

            {/* Titulo (auto-generated if empty) */}
            <div>
              <Label>Título (opcional — gerado automaticamente)</Label>
              <Input value={titulo} onChange={e => setTitulo(e.target.value)} placeholder="Ex: Depositar R$ 5.000 na Bet365" />
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
              disabled={createMutation.isPending || (needsTitular && !titularId)}
            >
              {createMutation.isPending ? "Criando..." : "Criar Tarefa"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
