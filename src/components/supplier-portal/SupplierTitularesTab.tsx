import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Plus, User, Phone, Mail, MapPin, Calendar, Pencil, Lock, Loader2, Clock,
  Landmark, ChevronRight, ChevronLeft,
} from "lucide-react";
import { toast } from "sonner";
import { SwipeableCard } from "./SwipeableCard";
import { TitularDetailModal } from "./TitularDetailModal";

interface Props {
  supplierWorkspaceId: string;
}

const formatCPF = (value: string) => {
  const digits = value.replace(/\D/g, "");
  return digits
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d{1,2})$/, "$1-$2")
    .slice(0, 14);
};

const formatPhone = (value: string) => {
  const digits = value.replace(/\D/g, "");
  return digits
    .replace(/(\d{2})(\d)/, "($1) $2")
    .replace(/(\d{5})(\d)/, "$1-$2")
    .slice(0, 15);
};

const formatCEP = (value: string) => {
  const digits = value.replace(/\D/g, "");
  return digits.replace(/(\d{5})(\d)/, "$1-$2").slice(0, 9);
};

function calcRemainingDays(dataFim: string | null): number | null {
  if (!dataFim) return null;
  const [year, month, day] = dataFim.split("-").map(Number);
  const fimDate = new Date(year, month - 1, day);
  const nowSP = new Date(
    new Date().toLocaleString("en-US", { timeZone: "America/Sao_Paulo" })
  );
  const todaySP = new Date(nowSP.getFullYear(), nowSP.getMonth(), nowSP.getDate());
  const diffMs = fimDate.getTime() - todaySP.getTime();
  return Math.ceil(diffMs / (1000 * 60 * 60 * 24));
}

function RemainingDaysBadge({ dataFim }: { dataFim: string | null }) {
  if (!dataFim) return null;
  const remaining = calcRemainingDays(dataFim);
  if (remaining === null) return null;

  let color: string;
  let label: string;

  if (remaining < 0) {
    color = "bg-destructive/15 text-destructive border-destructive/20";
    label = `Expirada há ${Math.abs(remaining)}d`;
  } else if (remaining === 0) {
    color = "bg-destructive/15 text-destructive border-destructive/20";
    label = "Expira hoje";
  } else if (remaining <= 7) {
    color = "bg-orange-500/15 text-orange-600 border-orange-500/20";
    label = `${remaining}d restante${remaining !== 1 ? "s" : ""}`;
  } else if (remaining <= 30) {
    color = "bg-yellow-500/15 text-yellow-600 border-yellow-500/20";
    label = `${remaining}d restantes`;
  } else {
    color = "bg-emerald-500/15 text-emerald-600 border-emerald-500/20";
    label = `${remaining}d restantes`;
  }

  return (
    <Badge variant="outline" className={`text-[10px] sm:text-xs gap-1 whitespace-nowrap ${color}`}>
      <Clock className="h-2.5 w-2.5 sm:h-3 sm:w-3" />
      {label}
    </Badge>
  );
}

function formatDateBR(dateStr: string | null): string {
  if (!dateStr) return "—";
  const [y, m, d] = dateStr.split("-");
  return `${d}/${m}/${y}`;
}

// Titular card - click opens detail, swipe opens edit
function formatCurrency(value: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
}

function TitularCard({
  titular,
  onClickDetail,
  onEdit,
  saldoTotal,
}: {
  titular: any;
  onClickDetail: (t: any) => void;
  onEdit: (t: any) => void;
  saldoTotal: number;
}) {
  return (
    <SwipeableCard
      leftActions={[
        {
          icon: <Pencil className="h-4 w-4" />,
          label: "Editar",
          onClick: () => onEdit(titular),
          className: "bg-primary text-primary-foreground",
        },
      ]}
    >
      <Card
        className="border-0 rounded-none shadow-none cursor-pointer group"
        onClick={() => onClickDetail(titular)}
      >
        <CardContent className="py-3 px-3 sm:px-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5 sm:gap-3 min-w-0 flex-1">
              <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                <User className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-primary" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium text-foreground truncate">{titular.nome}</p>
                <p className="text-xs text-muted-foreground truncate">
                  {titular.documento && (
                    <span>{titular.documento_tipo}: {titular.documento}</span>
                  )}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 sm:gap-3 shrink-0">
              <span className={`text-xs sm:text-sm font-semibold font-mono ${saldoTotal > 0 ? "text-emerald-500" : "text-muted-foreground"}`}>
                {formatCurrency(saldoTotal)}
              </span>
              <RemainingDaysBadge dataFim={titular.data_fim_parceria} />
              <div className="hidden sm:flex items-center gap-2 text-muted-foreground">
                {titular.email && <Mail className="h-3.5 w-3.5" />}
                {titular.telefone && <Phone className="h-3.5 w-3.5" />}
              </div>
            </div>
          </div>
          {(titular.data_inicio_parceria || titular.data_fim_parceria) && (
            <div className="mt-1.5 ml-[38px] sm:ml-[44px] flex items-center gap-2 text-[11px] text-muted-foreground">
              <Calendar className="h-3 w-3 shrink-0" />
              <span>
                {formatDateBR(titular.data_inicio_parceria)} → {formatDateBR(titular.data_fim_parceria)}
              </span>
            </div>
          )}
        </CardContent>
      </Card>
    </SwipeableCard>
  );
}

function calcDataFimFromDias(dataInicio: string, dias: number): string {
  if (!dataInicio || dias <= 0) return "";
  const [y, m, d] = dataInicio.split("-").map(Number);
  const start = new Date(y, m - 1, d);
  start.setDate(start.getDate() + dias);
  const yy = start.getFullYear();
  const mm = String(start.getMonth() + 1).padStart(2, "0");
  const dd = String(start.getDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

function calcDiasFromDates(dataInicio: string, dataFim: string): number {
  if (!dataInicio || !dataFim) return 0;
  const [y1, m1, d1] = dataInicio.split("-").map(Number);
  const [y2, m2, d2] = dataFim.split("-").map(Number);
  const start = new Date(y1, m1 - 1, d1);
  const end = new Date(y2, m2 - 1, d2);
  const diff = Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
  return diff > 0 ? diff : 0;
}

export function SupplierTitularesTab({ supplierWorkspaceId }: Props) {
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [detailDialogOpen, setDetailDialogOpen] = useState(false);
  const [editingTitular, setEditingTitular] = useState<any | null>(null);
  const [viewingTitular, setViewingTitular] = useState<any | null>(null);
  // Step control: 1 = dados pessoais, 2 = banco (only on create)
  const [formStep, setFormStep] = useState(1);
  // Step 1 fields
  const [nome, setNome] = useState("");
  const [cpf, setCpf] = useState("");
  const [email, setEmail] = useState("");
  const [telefone, setTelefone] = useState("");
  const [dataNascimento, setDataNascimento] = useState("");
  const [endereco, setEndereco] = useState("");
  const [cep, setCep] = useState("");
  const [cidade, setCidade] = useState("");
  const [observacoes, setObservacoes] = useState("");
  const [dataInicioParceria, setDataInicioParceria] = useState("");
  const [diasParceria, setDiasParceria] = useState<number>(0);
  // Step 2 fields (banco - simplified)
  const [bancoNome, setBancoNome] = useState("");
  const [bancoChavePix, setBancoChavePix] = useState("");
  const queryClient = useQueryClient();

  const supplierToken = useMemo(
    () => new URLSearchParams(window.location.search).get("token") || "",
    []
  );
  const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
  const anonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

  // Fetch all workspace banks to compute saldo per titular
  const { data: allBancos = [] } = useQuery({
    queryKey: ["supplier-workspace-bancos", supplierWorkspaceId, supplierToken],
    queryFn: async () => {
      const resp = await fetch(
        `https://${projectId}.supabase.co/functions/v1/supplier-auth?action=list-workspace-bancos`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", apikey: anonKey },
          body: JSON.stringify({ token: supplierToken }),
        }
      );
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || "Erro");
      return data.bancos || [];
    },
    enabled: !!supplierToken,
  });

  // Map titular_id -> total saldo across all banks
  const saldoPorTitular = useMemo(() => {
    const map = new Map<string, number>();
    allBancos.forEach((b: any) => {
      const current = map.get(b.titular_id) || 0;
      map.set(b.titular_id, current + (Number(b.saldo) || 0));
    });
    return map;
  }, [allBancos]);

  const dataFimCalculada = dataInicioParceria && diasParceria > 0
    ? calcDataFimFromDias(dataInicioParceria, diasParceria)
    : "";

  const { data: titulares = [] } = useQuery({
    queryKey: ["supplier-titulares", supplierWorkspaceId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("supplier_titulares")
        .select("*")
        .eq("supplier_workspace_id", supplierWorkspaceId)
        .eq("status", "ATIVO")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      const cpfDigits = cpf.replace(/\D/g, "") || null;
      const cepDigits = cep.replace(/\D/g, "") || null;

      const { data, error } = await supabase.rpc("create_titular_with_parceiro", {
        p_supplier_workspace_id: supplierWorkspaceId,
        p_nome: nome.trim(),
        p_cpf: cpfDigits,
        p_email: email.trim() || null,
        p_telefone: telefone.trim() || null,
        p_data_nascimento: dataNascimento || null,
        p_endereco: endereco.trim() || null,
        p_cep: cepDigits,
        p_cidade: cidade.trim() || null,
        p_observacoes: observacoes.trim() || null,
      });

      if (error) throw error;
      const result = data as any;
      if (!result?.success) throw new Error(result?.error || "Erro ao criar titular");

      // Update partnership dates
      if (result.titular_id && (dataInicioParceria || dataFimCalculada)) {
        await supabase
          .from("supplier_titulares")
          .update({
            data_inicio_parceria: dataInicioParceria || null,
            data_fim_parceria: dataFimCalculada || null,
          })
          .eq("id", result.titular_id);
      }

      // Create bank if filled
      if (result.titular_id && bancoNome.trim()) {
        const resp = await fetch(
          `https://${projectId}.supabase.co/functions/v1/supplier-auth?action=manage-banco`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json", apikey: anonKey },
            body: JSON.stringify({
              token: supplierToken,
              operation: "create",
              titular_id: result.titular_id,
              banco_nome: bancoNome.trim(),
              pix_key: bancoChavePix.trim() || null,
            }),
          }
        );
        if (!resp.ok) {
          const errData = await resp.json();
          console.error("Erro ao criar banco:", errData.error);
        }
      }

      return result;
    },
    onSuccess: () => {
      toast.success("Titular e parceiro cadastrados com sucesso");
      queryClient.invalidateQueries({ queryKey: ["supplier-titulares"] });
      queryClient.invalidateQueries({ queryKey: ["parceiros"] });
      resetForm();
    },
    onError: (e: any) => toast.error(e.message),
  });

  const updateMutation = useMutation({
    mutationFn: async () => {
      if (!editingTitular) throw new Error("Titular não selecionado");

      const resp = await fetch(
        `https://${projectId}.supabase.co/functions/v1/supplier-auth?action=update-titular`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", apikey: anonKey },
          body: JSON.stringify({
            token: supplierToken,
            titular_id: editingTitular.id,
            nome: nome.trim(),
            email: email.trim() || null,
            telefone: telefone.trim() || null,
            observacoes: observacoes.trim() || null,
            data_inicio_parceria: dataInicioParceria || null,
            data_fim_parceria: dataFimCalculada || null,
          }),
        }
      );
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || "Erro ao atualizar");
      return data;
    },
    onSuccess: () => {
      toast.success("Titular atualizado com sucesso");
      queryClient.invalidateQueries({ queryKey: ["supplier-titulares"] });
      resetForm();
    },
    onError: (e: any) => toast.error(e.message),
  });

  function openDetail(titular: any) {
    setViewingTitular(titular);
    setDetailDialogOpen(true);
  }

  function openEdit(titular: any) {
    setEditingTitular(titular);
    setNome(titular.nome || "");
    const docStr = String(titular.documento ?? "").replace(/\D/g, "");
    setCpf(docStr.length === 11 ? formatCPF(docStr) : docStr ? formatCPF(docStr) : "");
    setEmail(titular.email || "");
    setTelefone(titular.telefone ? formatPhone(titular.telefone) : "");
    setDataNascimento(titular.data_nascimento || "");
    setEndereco(titular.endereco || "");
    setCep(titular.cep ? formatCEP(titular.cep) : "");
    setCidade(titular.cidade || "");
    setObservacoes(titular.observacoes || "");
    setDataInicioParceria(titular.data_inicio_parceria || "");
    const dias = calcDiasFromDates(titular.data_inicio_parceria, titular.data_fim_parceria);
    setDiasParceria(dias);
    setFormStep(1);
    setEditDialogOpen(true);
  }

  function openCreate() {
    setEditingTitular(null);
    resetFormFields();
    setFormStep(1);
    setEditDialogOpen(true);
  }

  function resetFormFields() {
    setNome(""); setCpf(""); setEmail(""); setTelefone("");
    setDataNascimento(""); setEndereco(""); setCep(""); setCidade("");
    setObservacoes(""); setDataInicioParceria(""); setDiasParceria(0);
    setBancoNome(""); setBancoChavePix("");
  }

  function resetForm() {
    resetFormFields();
    setEditingTitular(null);
    setFormStep(1);
    setEditDialogOpen(false);
  }

  const isEditing = !!editingTitular;
  const isPending = createMutation.isPending || updateMutation.isPending;
  const canGoStep2 = !isEditing && nome.trim() && cpf.replace(/\D/g, "");
  const totalSteps = isEditing ? 1 : 2;

  return (
    <div className="space-y-4">
      <Button size="sm" onClick={openCreate} className="gap-1.5 text-xs sm:text-sm">
        <Plus className="h-3.5 w-3.5" /> Novo Titular
      </Button>

      {titulares.length > 0 && (
        <p className="text-[11px] text-muted-foreground sm:hidden">
          ← Deslize para editar →
        </p>
      )}

      {titulares.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <User className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">Nenhum titular cadastrado</p>
          </CardContent>
        </Card>
      ) : (
        <div className="rounded-lg border overflow-hidden divide-y divide-border">
          {titulares.map((t: any) => (
            <TitularCard key={t.id} titular={t} onClickDetail={openDetail} onEdit={openEdit} saldoTotal={saldoPorTitular.get(t.id) || 0} />
          ))}
        </div>
      )}

      {/* Detail / History Modal */}
      <TitularDetailModal
        open={detailDialogOpen}
        onOpenChange={setDetailDialogOpen}
        titular={viewingTitular}
        supplierToken={supplierToken}
        supplierWorkspaceId={supplierWorkspaceId}
        onEditTitular={() => {
          setDetailDialogOpen(false);
          if (viewingTitular) openEdit(viewingTitular);
        }}
      />

      {/* Edit / Create Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={(open) => { if (!open) resetForm(); else setEditDialogOpen(true); }}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <User className="h-5 w-5 text-primary" />
              {isEditing ? "Editar Titular" : formStep === 1 ? "Novo Titular / Parceiro" : "Dados Bancários"}
            </DialogTitle>
            <p className="text-xs text-muted-foreground mt-1">
              {isEditing
                ? "Alterações são locais ao portal. O cadastro no sistema principal não será afetado."
                : formStep === 1
                  ? "Os dados serão sincronizados automaticamente com o cadastro de parceiros do sistema."
                  : "Cadastre uma conta bancária para este titular (opcional)."
              }
            </p>
            {/* Step indicator for create */}
            {!isEditing && (
              <div className="flex items-center gap-2 mt-2">
                <div className={`h-1.5 flex-1 rounded-full transition-colors ${formStep >= 1 ? "bg-primary" : "bg-muted"}`} />
                <div className={`h-1.5 flex-1 rounded-full transition-colors ${formStep >= 2 ? "bg-primary" : "bg-muted"}`} />
              </div>
            )}
          </DialogHeader>

          {/* STEP 1 - Dados pessoais */}
          {formStep === 1 && (
            <div className="space-y-4">
              <div className="space-y-3">
                <div>
                  <Label>Nome Completo <span className="text-destructive">*</span></Label>
                  <Input value={nome} onChange={e => setNome(e.target.value)} placeholder="Nome completo" autoFocus disabled={isPending} />
                </div>

                <div>
                  <Label className="flex items-center gap-1.5">
                    CPF <span className="text-destructive">*</span>
                    {isEditing && (
                      <Badge variant="secondary" className="text-[10px] gap-1">
                        <Lock className="h-2.5 w-2.5" /> Imutável
                      </Badge>
                    )}
                  </Label>
                  <Input
                    value={cpf} onChange={e => setCpf(formatCPF(e.target.value))}
                    placeholder="000.000.000-00" maxLength={14}
                    disabled={isEditing || isPending}
                    className={isEditing ? "opacity-60 cursor-not-allowed" : ""}
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <Label className="flex items-center gap-1.5">
                      <Mail className="h-3.5 w-3.5 text-muted-foreground" /> E-mail
                      <span className="text-xs font-normal text-muted-foreground">(opcional)</span>
                    </Label>
                    <Input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="email@exemplo.com" disabled={isPending} />
                  </div>
                  <div>
                    <Label className="flex items-center gap-1.5">
                      <Phone className="h-3.5 w-3.5 text-muted-foreground" /> Telefone
                      <span className="text-xs font-normal text-muted-foreground">(opcional)</span>
                    </Label>
                    <Input value={telefone} onChange={e => setTelefone(formatPhone(e.target.value))} placeholder="(11) 99999-9999" maxLength={15} disabled={isPending} />
                  </div>
                </div>

                {!isEditing && (
                  <div>
                    <Label className="flex items-center gap-1.5">
                      <Calendar className="h-3.5 w-3.5 text-muted-foreground" /> Data de Nascimento
                      <span className="text-xs font-normal text-muted-foreground">(opcional)</span>
                    </Label>
                    <Input type="date" value={dataNascimento} onChange={e => setDataNascimento(e.target.value)} disabled={isPending} />
                  </div>
                )}
              </div>

              {/* Período da Parceria */}
              <div className="space-y-3 border-t border-border/40 pt-4">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                  <Clock className="h-3.5 w-3.5" /> Período da Parceria
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <Label>Data de Início</Label>
                    <Input type="date" value={dataInicioParceria} onChange={e => setDataInicioParceria(e.target.value)} disabled={isPending} />
                  </div>
                  <div>
                    <Label>Dias de Parceria</Label>
                    <Input
                      type="number"
                      min={0}
                      value={diasParceria || ""}
                      onChange={e => setDiasParceria(parseInt(e.target.value) || 0)}
                      placeholder="Ex: 60"
                      disabled={isPending}
                    />
                  </div>
                </div>
                {dataFimCalculada && (
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-xs text-muted-foreground">
                      Fim previsto: <span className="font-medium text-foreground">{formatDateBR(dataFimCalculada)}</span>
                    </p>
                    <RemainingDaysBadge dataFim={dataFimCalculada} />
                  </div>
                )}
              </div>

              {/* Endereço - only on create */}
              {!isEditing && (
                <div className="space-y-3 border-t border-border/40 pt-4">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Endereço <span className="normal-case font-normal">(opcional)</span>
                  </p>
                  <div>
                    <Label className="flex items-center gap-1.5">
                      <MapPin className="h-3.5 w-3.5 text-muted-foreground" /> Endereço
                    </Label>
                    <Input value={endereco} onChange={e => setEndereco(e.target.value)} placeholder="Rua, número, complemento" disabled={isPending} />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label>CEP</Label>
                      <Input value={cep} onChange={e => setCep(formatCEP(e.target.value))} placeholder="00000-000" maxLength={9} disabled={isPending} />
                    </div>
                    <div>
                      <Label>Cidade</Label>
                      <Input value={cidade} onChange={e => setCidade(e.target.value)} placeholder="Cidade / UF" disabled={isPending} />
                    </div>
                  </div>
                </div>
              )}

              <div>
                <Label>Observações <span className="text-xs font-normal text-muted-foreground">(opcional)</span></Label>
                <Textarea value={observacoes} onChange={e => setObservacoes(e.target.value)} rows={2} placeholder="Notas internas (opcional)" disabled={isPending} />
              </div>
            </div>
          )}

          {/* STEP 2 - Banco (create only) */}
          {formStep === 2 && !isEditing && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-muted-foreground">
                <Landmark className="h-4 w-4" />
                <p className="text-xs">Você pode pular esta etapa e adicionar depois.</p>
              </div>

              <div className="space-y-3">
                <div>
                  <Label>Nome do Banco <span className="text-xs font-normal text-muted-foreground">(opcional)</span></Label>
                  <Input value={bancoNome} onChange={e => setBancoNome(e.target.value)} placeholder="Ex: Nubank, Bradesco" disabled={isPending} />
                </div>
                <div>
                  <Label>Chave PIX</Label>
                  <Input value={bancoChavePix} onChange={e => setBancoChavePix(e.target.value)} placeholder="CPF, email, telefone, chave aleatória..." disabled={isPending} />
                </div>
              </div>
            </div>
          )}

          <DialogFooter className="flex-col sm:flex-row gap-2">
            {formStep === 1 && (
              <>
                <Button variant="outline" onClick={() => resetForm()} disabled={isPending}>Cancelar</Button>
                {isEditing ? (
                  <Button
                    onClick={() => updateMutation.mutate()}
                    disabled={!nome.trim() || isPending}
                  >
                    {isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                    Salvar Alterações
                  </Button>
                ) : (
                  <Button
                    onClick={() => setFormStep(2)}
                    disabled={!canGoStep2 || isPending}
                    className="gap-1.5"
                  >
                    Próximo <ChevronRight className="h-4 w-4" />
                  </Button>
                )}
              </>
            )}
            {formStep === 2 && !isEditing && (
              <>
                <Button variant="outline" onClick={() => setFormStep(1)} disabled={isPending} className="gap-1.5">
                  <ChevronLeft className="h-4 w-4" /> Voltar
                </Button>
                <Button
                  onClick={() => createMutation.mutate()}
                  disabled={isPending}
                >
                  {isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                  Salvar
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}