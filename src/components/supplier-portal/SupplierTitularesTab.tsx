import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Plus, User, Phone, Mail, MapPin, Calendar } from "lucide-react";
import { toast } from "sonner";

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

export function SupplierTitularesTab({ supplierWorkspaceId }: Props) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [nome, setNome] = useState("");
  const [cpf, setCpf] = useState("");
  const [email, setEmail] = useState("");
  const [telefone, setTelefone] = useState("");
  const [dataNascimento, setDataNascimento] = useState("");
  const [endereco, setEndereco] = useState("");
  const [cep, setCep] = useState("");
  const [cidade, setCidade] = useState("");
  const [observacoes, setObservacoes] = useState("");
  const queryClient = useQueryClient();

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
      return result;
    },
    onSuccess: (result) => {
      const msg = result.parceiro_id
        ? "Titular cadastrado e parceiro criado no sistema"
        : "Titular cadastrado (sem CPF, parceiro não criado)";
      toast.success(msg);
      queryClient.invalidateQueries({ queryKey: ["supplier-titulares"] });
      queryClient.invalidateQueries({ queryKey: ["parceiros"] });
      resetForm();
    },
    onError: (e: any) => toast.error(e.message),
  });

  function resetForm() {
    setNome("");
    setCpf("");
    setEmail("");
    setTelefone("");
    setDataNascimento("");
    setEndereco("");
    setCep("");
    setCidade("");
    setObservacoes("");
    setDialogOpen(false);
  }

  return (
    <div className="space-y-4">
      <Button size="sm" onClick={() => setDialogOpen(true)} className="gap-1.5">
        <Plus className="h-3.5 w-3.5" /> Novo Titular
      </Button>

      {titulares.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <User className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">Nenhum titular cadastrado</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3">
          {titulares.map((t: any) => (
            <Card key={t.id}>
              <CardContent className="py-3 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                    <User className="h-4 w-4 text-primary" />
                  </div>
                  <div>
                    <p className="text-sm font-medium">{t.nome}</p>
                    <p className="text-xs text-muted-foreground">
                      {t.documento && <span>{t.documento_tipo}: {t.documento}</span>}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3 text-muted-foreground">
                  {t.email && <Mail className="h-3.5 w-3.5" />}
                  {t.telefone && <Phone className="h-3.5 w-3.5" />}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <User className="h-5 w-5 text-primary" />
              Novo Titular / Parceiro
            </DialogTitle>
            <p className="text-xs text-muted-foreground mt-1">
              Os dados serão sincronizados automaticamente com o cadastro de parceiros do sistema.
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
                />
              </div>

              <div>
                <Label>CPF / Documento <span className="text-xs font-normal text-muted-foreground">(opcional)</span></Label>
                <Input
                  value={cpf}
                  onChange={e => setCpf(formatCPF(e.target.value))}
                  placeholder="000.000.000-00"
                  maxLength={14}
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Com CPF, o titular será registrado como parceiro no sistema principal.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="flex items-center gap-1.5">
                    <Mail className="h-3.5 w-3.5 text-muted-foreground" /> E-mail <span className="text-xs font-normal text-muted-foreground">(opcional)</span>
                  </Label>
                  <Input
                    type="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    placeholder="email@exemplo.com"
                  />
                </div>
                <div>
                  <Label className="flex items-center gap-1.5">
                    <Phone className="h-3.5 w-3.5 text-muted-foreground" /> Telefone <span className="text-xs font-normal text-muted-foreground">(opcional)</span>
                  </Label>
                  <Input
                    value={telefone}
                    onChange={e => setTelefone(formatPhone(e.target.value))}
                    placeholder="(11) 99999-9999"
                    maxLength={15}
                  />
                </div>
              </div>

              <div>
                <Label className="flex items-center gap-1.5">
                  <Calendar className="h-3.5 w-3.5 text-muted-foreground" /> Data de Nascimento <span className="text-xs font-normal text-muted-foreground">(opcional)</span>
                </Label>
                <Input
                  type="date"
                  value={dataNascimento}
                  onChange={e => setDataNascimento(e.target.value)}
                />
              </div>
            </div>

            {/* Endereço */}
            <div className="space-y-3 border-t border-border/40 pt-4">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Endereço <span className="normal-case font-normal">(opcional)</span></p>
              <div>
                <Label className="flex items-center gap-1.5">
                  <MapPin className="h-3.5 w-3.5 text-muted-foreground" /> Endereço
                </Label>
                <Input
                  value={endereco}
                  onChange={e => setEndereco(e.target.value)}
                  placeholder="Rua, número, complemento"
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
                  />
                </div>
                <div>
                  <Label>Cidade</Label>
                  <Input
                    value={cidade}
                    onChange={e => setCidade(e.target.value)}
                    placeholder="Cidade / UF"
                  />
                </div>
              </div>
            </div>

            {/* Observações */}
            <div>
              <Label>Observações <span className="text-xs font-normal text-muted-foreground">(opcional)</span></Label>
              <Textarea
                value={observacoes}
                onChange={e => setObservacoes(e.target.value)}
                rows={2}
                placeholder="Notas internas (opcional)"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button
              onClick={() => createMutation.mutate()}
              disabled={!nome.trim() || createMutation.isPending}
            >
              {createMutation.isPending ? "Salvando..." : "Salvar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
