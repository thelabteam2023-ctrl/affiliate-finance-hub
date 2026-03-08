import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useTabWorkspace } from "@/hooks/useTabWorkspace";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Trash2, Loader2 } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";

interface ContaEntry {
  id: string;
  bookmaker_catalogo_id: string;
  bookmaker_nome: string;
  instance_identifier: string;
  login_username: string;
  login_password: string;
  moeda: string;
  saldo_inicial: string;
}

interface BrokerReceberContasDialogProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

const MOEDAS = ["BRL", "USD", "EUR", "GBP", "MXN", "MYR", "ARS", "COP", "USDT"];

function createEmptyEntry(): ContaEntry {
  return {
    id: crypto.randomUUID(),
    bookmaker_catalogo_id: "",
    bookmaker_nome: "",
    instance_identifier: "",
    login_username: "",
    login_password: "",
    moeda: "BRL",
    saldo_inicial: "",
  };
}

export function BrokerReceberContasDialog({ open, onClose, onSuccess }: BrokerReceberContasDialogProps) {
  const { workspaceId } = useTabWorkspace();
  const [investidorId, setInvestidorId] = useState("");
  const [investidores, setInvestidores] = useState<Array<{ id: string; nome: string }>>([]);
  const [catalogoBookmakers, setCatalogoBookmakers] = useState<Array<{ id: string; nome: string; moeda_padrao: string }>>([]);
  const [contas, setContas] = useState<ContaEntry[]>([createEmptyEntry()]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open || !workspaceId) return;

    const loadData = async () => {
      const [invRes, catRes] = await Promise.all([
        supabase.from("investidores").select("id, nome").eq("workspace_id", workspaceId).order("nome"),
        supabase.from("bookmakers_catalogo").select("id, nome, moeda_padrao").order("nome"),
      ]);
      setInvestidores(invRes.data || []);
      setCatalogoBookmakers(catRes.data || []);
    };
    loadData();
  }, [open, workspaceId]);

  const addEntry = () => setContas(prev => [...prev, createEmptyEntry()]);

  const removeEntry = (id: string) => {
    if (contas.length <= 1) return;
    setContas(prev => prev.filter(c => c.id !== id));
  };

  const updateEntry = (id: string, field: keyof ContaEntry, value: string) => {
    setContas(prev => prev.map(c => {
      if (c.id !== id) return c;
      const updated = { ...c, [field]: value };
      // Auto-fill moeda when selecting bookmaker
      if (field === "bookmaker_catalogo_id") {
        const cat = catalogoBookmakers.find(b => b.id === value);
        if (cat) {
          updated.bookmaker_nome = cat.nome;
          updated.moeda = cat.moeda_padrao;
        }
      }
      return updated;
    }));
  };

  const handleSave = async () => {
    if (!workspaceId || !investidorId) {
      toast.error("Selecione um investidor");
      return;
    }

    // Validar entradas
    const invalidEntries = contas.filter(c => !c.bookmaker_catalogo_id || !c.login_username);
    if (invalidEntries.length > 0) {
      toast.error("Preencha pelo menos a casa e o login de cada conta");
      return;
    }

    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Usuário não autenticado");

      const investidor = investidores.find(i => i.id === investidorId);

      for (const conta of contas) {
        const saldoInicial = parseFloat(conta.saldo_inicial) || 0;

        // 1. Encriptar senha (placeholder - usa valor direto por enquanto, 
        //    o edge function crypto-password será chamado depois)
        const passwordToStore = conta.login_password || "***";

        // 2. Criar bookmaker com investidor_id
        const { data: newBookmaker, error: bmError } = await supabase
          .from("bookmakers")
          .insert({
            workspace_id: workspaceId,
            user_id: user.id,
            nome: conta.bookmaker_nome,
            bookmaker_catalogo_id: conta.bookmaker_catalogo_id,
            instance_identifier: conta.instance_identifier || null,
            login_username: conta.login_username,
            login_password_encrypted: passwordToStore,
            moeda: conta.moeda,
            saldo_atual: 0, // Será atualizado pelo financial_events
            saldo_freebet: 0,
            saldo_irrecuperavel: 0,
            saldo_usd: 0,
            status: "ativo",
            investidor_id: investidorId,
          })
          .select("id")
          .single();

        if (bmError) throw bmError;

        // 3. Criar APORTE_DIRETO no ledger (se tem saldo inicial)
        if (saldoInicial > 0 && newBookmaker) {
          const { error: ledgerError } = await supabase
            .from("cash_ledger")
            .insert({
              workspace_id: workspaceId,
              user_id: user.id,
              tipo_transacao: "APORTE_DIRETO",
              tipo_moeda: "FIAT",
              moeda: conta.moeda,
              valor: saldoInicial,
              data_transacao: new Date().toISOString().split("T")[0],
              investidor_id: investidorId,
              nome_investidor: investidor?.nome || "",
              origem_tipo: "INVESTIDOR",
              destino_tipo: "BOOKMAKER",
              destino_bookmaker_id: newBookmaker.id,
              status: "CONFIRMADO",
              impacta_caixa_operacional: false,
              descricao: `Aporte direto - ${investidor?.nome} → ${conta.bookmaker_nome}${conta.instance_identifier ? ` (${conta.instance_identifier})` : ""}`,
            });

          if (ledgerError) throw ledgerError;
        }
      }

      toast.success(`${contas.length} conta(s) recebida(s) com sucesso`, {
        description: `Investidor: ${investidor?.nome}`,
      });
      
      // Reset form
      setContas([createEmptyEntry()]);
      setInvestidorId("");
      onSuccess();
    } catch (err: any) {
      toast.error("Erro ao cadastrar contas", { description: err.message });
    } finally {
      setSaving(false);
    }
  };

  const handleClose = () => {
    setContas([createEmptyEntry()]);
    setInvestidorId("");
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-4xl max-h-[90vh]">
        <DialogHeader>
          <DialogTitle>Receber Contas do Investidor</DialogTitle>
          <DialogDescription>
            Cadastre em lote as contas de bookmaker que o investidor já possui e traz com capital depositado.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Seletor de Investidor */}
          <div className="space-y-2">
            <Label>Investidor *</Label>
            <Select value={investidorId} onValueChange={setInvestidorId}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione o investidor" />
              </SelectTrigger>
              <SelectContent>
                {investidores.map(inv => (
                  <SelectItem key={inv.id} value={inv.id}>{inv.nome}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Lista de contas */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Contas ({contas.length})</Label>
              <Button type="button" variant="outline" size="sm" onClick={addEntry} className="gap-1">
                <Plus className="h-3 w-3" />
                Adicionar conta
              </Button>
            </div>

            <ScrollArea className="max-h-[400px]">
              <div className="space-y-3 pr-4">
                {contas.map((conta, index) => (
                  <div key={conta.id} className="rounded-lg border border-border/50 bg-muted/10 p-3">
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-xs font-semibold text-muted-foreground">
                        Conta #{index + 1}
                      </span>
                      {contas.length > 1 && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => removeEntry(conta.id)}
                          className="h-6 w-6 p-0 text-destructive/70 hover:text-destructive"
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      )}
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                      {/* Casa */}
                      <div className="space-y-1">
                        <Label className="text-xs">Casa *</Label>
                        <Select
                          value={conta.bookmaker_catalogo_id}
                          onValueChange={(v) => updateEntry(conta.id, "bookmaker_catalogo_id", v)}
                        >
                          <SelectTrigger className="h-8 text-xs">
                            <SelectValue placeholder="Selecione" />
                          </SelectTrigger>
                          <SelectContent>
                            {catalogoBookmakers.map(bm => (
                              <SelectItem key={bm.id} value={bm.id} className="text-xs">
                                {bm.nome}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      {/* Identificador */}
                      <div className="space-y-1">
                        <Label className="text-xs">Identificador</Label>
                        <Input
                          className="h-8 text-xs"
                          placeholder="Ex: Batch 3501"
                          value={conta.instance_identifier}
                          onChange={(e) => updateEntry(conta.id, "instance_identifier", e.target.value)}
                          maxLength={100}
                        />
                      </div>

                      {/* Login */}
                      <div className="space-y-1">
                        <Label className="text-xs">Login *</Label>
                        <Input
                          className="h-8 text-xs"
                          placeholder="usuário ou e-mail"
                          value={conta.login_username}
                          onChange={(e) => updateEntry(conta.id, "login_username", e.target.value)}
                          maxLength={200}
                        />
                      </div>

                      {/* Senha */}
                      <div className="space-y-1">
                        <Label className="text-xs">Senha</Label>
                        <Input
                          className="h-8 text-xs"
                          type="password"
                          placeholder="opcional"
                          value={conta.login_password}
                          onChange={(e) => updateEntry(conta.id, "login_password", e.target.value)}
                          maxLength={200}
                        />
                      </div>

                      {/* Moeda */}
                      <div className="space-y-1">
                        <Label className="text-xs">Moeda</Label>
                        <Select
                          value={conta.moeda}
                          onValueChange={(v) => updateEntry(conta.id, "moeda", v)}
                        >
                          <SelectTrigger className="h-8 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {MOEDAS.map(m => (
                              <SelectItem key={m} value={m} className="text-xs">{m}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      {/* Saldo Inicial */}
                      <div className="space-y-1">
                        <Label className="text-xs">Saldo Inicial</Label>
                        <Input
                          className="h-8 text-xs"
                          type="number"
                          min="0"
                          step="0.01"
                          placeholder="0.00"
                          value={conta.saldo_inicial}
                          onChange={(e) => updateEntry(conta.id, "saldo_inicial", e.target.value)}
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose} disabled={saving}>
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={saving || !investidorId}>
            {saving ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Salvando...
              </>
            ) : (
              `Cadastrar ${contas.length} conta(s)`
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
