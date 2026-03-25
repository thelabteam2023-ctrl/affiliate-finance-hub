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
} from "lucide-react";
import { toast } from "sonner";
import { SwipeableCard } from "./SwipeableCard";

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

/**
 * Calcula os dias restantes de parceria usando timezone America/Sao_Paulo.
 * Retorna null se não houver data de fim, ou o número de dias restantes (pode ser negativo).
 */
function calcRemainingDays(dataFim: string | null): number | null {
  if (!dataFim) return null;
  // Extrair a data civil sem conversão de timezone
  const [year, month, day] = dataFim.split("-").map(Number);
  const fimDate = new Date(year, month - 1, day);

  // Hoje em São Paulo (data civil)
  const nowSP = new Date(
    new Date().toLocaleString("en-US", { timeZone: "America/Sao_Paulo" })
  );
  const todaySP = new Date(nowSP.getFullYear(), nowSP.getMonth(), nowSP.getDate());

  const diffMs = fimDate.getTime() - todaySP.getTime();
  return Math.ceil(diffMs / (1000 * 60 * 60 * 24));
}

function RemainingDaysBadge({ dataInicio, dataFim }: { dataInicio: string | null; dataFim: string | null }) {
  if (!dataFim) return null;
  const remaining = calcRemainingDays(dataFim);
  if (remaining === null) return null;

  let color: string;
  let label: string;

  if (remaining < 0) {
    color = "bg-destructive/15 text-destructive border-destructive/20";
    label = `Expirada há ${Math.abs(remaining)} dia${Math.abs(remaining) !== 1 ? "s" : ""}`;
  } else if (remaining === 0) {
    color = "bg-destructive/15 text-destructive border-destructive/20";
    label = "Expira hoje";
  } else if (remaining <= 7) {
    color = "bg-orange-500/15 text-orange-600 border-orange-500/20";
    label = `${remaining} dia${remaining !== 1 ? "s" : ""} restante${remaining !== 1 ? "s" : ""}`;
  } else if (remaining <= 30) {
    color = "bg-yellow-500/15 text-yellow-600 border-yellow-500/20";
    label = `${remaining} dias restantes`;
  } else {
    color = "bg-emerald-500/15 text-emerald-600 border-emerald-500/20";
    label = `${remaining} dias restantes`;
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

// Titular card extracted as stable component
function TitularCard({
  titular,
  onEdit,
}: {
  titular: any;
  onEdit: (t: any) => void;
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
        onClick={() => onEdit(titular)}
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
              <RemainingDaysBadge
                dataInicio={titular.data_inicio_parceria}
                dataFim={titular.data_fim_parceria}
              />
              <div className="hidden sm:flex items-center gap-2 text-muted-foreground">
                {titular.email && <Mail className="h-3.5 w-3.5" />}
                {titular.telefone && <Phone className="h-3.5 w-3.5" />}
                <Pencil className="h-4 w-4 opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>
            </div>
          </div>
          {/* Mobile: show dates below the name */}
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

export function SupplierTitularesTab({ supplierWorkspaceId }: Props) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingTitular, setEditingTitular] = useState<any | null>(null);
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
  const [dataFimParceria, setDataFimParceria] = useState("");
  const queryClient = useQueryClient();

  const supplierToken = useMemo(
    () => new URLSearchParams(window.location.search).get("token") || "",
    []
  );
  const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
  const anonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

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

      // Update partnership dates separately if provided
      if (result.titular_id && (dataInicioParceria || dataFimParceria)) {
        await supabase
          .from("supplier_titulares")
          .update({
            data_inicio_parceria: dataInicioParceria || null,
            data_fim_parceria: dataFimParceria || null,
          })
          .eq("id", result.titular_id);
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
            data_fim_parceria: dataFimParceria || null,
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

  function openEdit(titular: any) {
    setEditingTitular(titular);
    setNome(titular.nome || "");
    setCpf(titular.documento ? formatCPF(titular.documento) : "");
    setEmail(titular.email || "");
    setTelefone(titular.telefone ? formatPhone(titular.telefone) : "");
    setDataNascimento(titular.data_nascimento || "");
    setEndereco(titular.endereco || "");
    setCep(titular.cep ? formatCEP(titular.cep) : "");
    setCidade(titular.cidade || "");
    setObservacoes(titular.observacoes || "");
    setDataInicioParceria(titular.data_inicio_parceria || "");
    setDataFimParceria(titular.data_fim_parceria || "");
    setDialogOpen(true);
  }

  function openCreate() {
    setEditingTitular(null);
    resetFormFields();
    setDialogOpen(true);
  }

  function resetFormFields() {
    setNome("");
    setCpf("");
    setEmail("");
    setTelefone("");
    setDataNascimento("");
    setEndereco("");
    setCep("");
    setCidade("");
    setObservacoes("");
    setDataInicioParceria("");
    setDataFimParceria("");
  }

  function resetForm() {
    resetFormFields();
    setEditingTitular(null);
    setDialogOpen(false);
  }

  const isEditing = !!editingTitular;
  const isPending = createMutation.isPending || updateMutation.isPending;

  return (
    <div className="space-y-4">
      <Button size="sm" onClick={openCreate} className="gap-1.5 text-xs sm:text-sm">
        <Plus className="h-3.5 w-3.5" /> Novo Titular
      </Button>

      {/* Swipe hint - mobile only */}
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
            <TitularCard key={t.id} titular={t} onEdit={openEdit} />
          ))}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={(open) => { if (!open) resetForm(); else setDialogOpen(true); }}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <User className="h-5 w-5 text-primary" />
              {isEditing ? "Editar Titular" : "Novo Titular / Parceiro"}
            </DialogTitle>
            <p className="text-xs text-muted-foreground mt-1">
              {isEditing
                ? "Alterações são locais ao portal. O cadastro no sistema principal não será afetado."
                : "Os dados serão sincronizados automaticamente com o cadastro de parceiros do sistema."
              }
            </p>
          </DialogHeader>

          <div className="space-y-4">
            {/* Dados básicos */}
            <div className="space-y-3">
              <div>
                <Label>Nome Completo <span className="text-destructive">*</span></Label>
                <Input
                  value={nome}
                  onChange={e => setNome(e.target.value)}
                  placeholder="Nome completo"
                  autoFocus
                  disabled={isPending}
                />
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
                  value={cpf}
                  onChange={e => setCpf(formatCPF(e.target.value))}
                  placeholder="000.000.000-00"
                  maxLength={14}
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
                  <Input
                    type="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    placeholder="email@exemplo.com"
                    disabled={isPending}
                  />
                </div>
                <div>
                  <Label className="flex items-center gap-1.5">
                    <Phone className="h-3.5 w-3.5 text-muted-foreground" /> Telefone
                    <span className="text-xs font-normal text-muted-foreground">(opcional)</span>
                  </Label>
                  <Input
                    value={telefone}
                    onChange={e => setTelefone(formatPhone(e.target.value))}
                    placeholder="(11) 99999-9999"
                    maxLength={15}
                    disabled={isPending}
                  />
                </div>
              </div>

              {!isEditing && (
                <div>
                  <Label className="flex items-center gap-1.5">
                    <Calendar className="h-3.5 w-3.5 text-muted-foreground" /> Data de Nascimento
                    <span className="text-xs font-normal text-muted-foreground">(opcional)</span>
                  </Label>
                  <Input
                    type="date"
                    value={dataNascimento}
                    onChange={e => setDataNascimento(e.target.value)}
                    disabled={isPending}
                  />
                </div>
              )}
            </div>

            {/* Datas da Parceria */}
            <div className="space-y-3 border-t border-border/40 pt-4">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                <Clock className="h-3.5 w-3.5" /> Período da Parceria
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <Label className="flex items-center gap-1.5">
                    Data de Início
                  </Label>
                  <Input
                    type="date"
                    value={dataInicioParceria}
                    onChange={e => setDataInicioParceria(e.target.value)}
                    disabled={isPending}
                  />
                </div>
                <div>
                  <Label className="flex items-center gap-1.5">
                    Data de Fim Prevista
                  </Label>
                  <Input
                    type="date"
                    value={dataFimParceria}
                    onChange={e => setDataFimParceria(e.target.value)}
                    disabled={isPending}
                  />
                </div>
              </div>
              {dataFimParceria && (
                <div className="flex items-center">
                  <RemainingDaysBadge dataInicio={dataInicioParceria} dataFim={dataFimParceria} />
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
                  <Input
                    value={endereco}
                    onChange={e => setEndereco(e.target.value)}
                    placeholder="Rua, número, complemento"
                    disabled={isPending}
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>CEP</Label>
                    <Input
                      value={cep}
                      onChange={e => setCep(formatCEP(e.target.value))}
                      placeholder="00000-000"
                      maxLength={9}
                      disabled={isPending}
                    />
                  </div>
                  <div>
                    <Label>Cidade</Label>
                    <Input
                      value={cidade}
                      onChange={e => setCidade(e.target.value)}
                      placeholder="Cidade / UF"
                      disabled={isPending}
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Observações */}
            <div>
              <Label>Observações <span className="text-xs font-normal text-muted-foreground">(opcional)</span></Label>
              <Textarea
                value={observacoes}
                onChange={e => setObservacoes(e.target.value)}
                rows={2}
                placeholder="Notas internas (opcional)"
                disabled={isPending}
              />
            </div>
          </div>

          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button variant="outline" onClick={() => resetForm()} disabled={isPending}>
              Cancelar
            </Button>
            <Button
              onClick={() => isEditing ? updateMutation.mutate() : createMutation.mutate()}
              disabled={!nome.trim() || (!isEditing && !cpf.replace(/\D/g, "")) || isPending}
            >
              {isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              {isEditing ? "Salvar Alterações" : "Salvar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
