import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Plus, User, Phone, Mail } from "lucide-react";
import { toast } from "sonner";

interface Props {
  supplierWorkspaceId: string;
}

export function SupplierTitularesTab({ supplierWorkspaceId }: Props) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [nome, setNome] = useState("");
  const [documento, setDocumento] = useState("");
  const [email, setEmail] = useState("");
  const [telefone, setTelefone] = useState("");
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
      const { error } = await supabase.from("supplier_titulares").insert({
        supplier_workspace_id: supplierWorkspaceId,
        nome,
        documento: documento || null,
        email: email || null,
        telefone: telefone || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Titular cadastrado");
      queryClient.invalidateQueries({ queryKey: ["supplier-titulares"] });
      resetForm();
    },
    onError: (e: any) => toast.error(e.message),
  });

  function resetForm() {
    setNome("");
    setDocumento("");
    setEmail("");
    setTelefone("");
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
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Novo Titular</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Nome *</Label>
              <Input value={nome} onChange={e => setNome(e.target.value)} placeholder="Nome completo" />
            </div>
            <div>
              <Label>CPF / Documento</Label>
              <Input value={documento} onChange={e => setDocumento(e.target.value)} placeholder="000.000.000-00" />
            </div>
            <div>
              <Label>E-mail</Label>
              <Input value={email} onChange={e => setEmail(e.target.value)} placeholder="email@exemplo.com" />
            </div>
            <div>
              <Label>Telefone</Label>
              <Input value={telefone} onChange={e => setTelefone(e.target.value)} placeholder="(11) 99999-9999" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button onClick={() => createMutation.mutate()} disabled={!nome.trim() || createMutation.isPending}>
              {createMutation.isPending ? "Salvando..." : "Salvar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
