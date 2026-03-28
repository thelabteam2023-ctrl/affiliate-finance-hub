import { useState, useEffect, useMemo } from "react";
import { getTodayCivilDate } from "@/utils/dateUtils";
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
import { Plus, Trash2, Loader2, Search, ArrowLeft } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { BookmakerLogo } from "@/components/ui/bookmaker-logo";
import { cn } from "@/lib/utils";

interface ContaEntry {
  id: string;
  instance_identifier: string;
  login_username: string;
  login_password: string;
  saldo_inicial: string;
}

interface BrokerReceberContasDialogProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
  /** Projeto Broker ao qual vincular as contas recebidas */
  projetoId?: string | null;
}

const MOEDAS = ["BRL", "USD", "EUR", "GBP", "MXN", "MYR", "ARS", "COP", "USDT"];

function createEmptyEntry(): ContaEntry {
  return {
    id: crypto.randomUUID(),
    instance_identifier: "",
    login_username: "",
    login_password: "",
    saldo_inicial: "",
  };
}

type Step = "select-investor" | "select-house" | "add-accounts";

export function BrokerReceberContasDialog({ open, onClose, onSuccess, projetoId }: BrokerReceberContasDialogProps) {
  const { workspaceId } = useTabWorkspace();
  const [step, setStep] = useState<Step>("select-investor");
  const [investidorId, setInvestidorId] = useState("");
  const [investidores, setInvestidores] = useState<Array<{ id: string; nome: string }>>([]);
  const [catalogoBookmakers, setCatalogoBookmakers] = useState<Array<{ id: string; nome: string; moeda_padrao: string; logo_url: string | null; status: string }>>([]);
  
  // Casa selecionada
  const [selectedCasaId, setSelectedCasaId] = useState("");
  const [selectedCasaNome, setSelectedCasaNome] = useState("");
  const [moeda, setMoeda] = useState("BRL");
  const [searchQuery, setSearchQuery] = useState("");
  type RegFilter = "todas" | "REGULAMENTADA" | "NAO_REGULAMENTADA";
  const [regFilter, setRegFilter] = useState<RegFilter>("todas");
  
  // Contas da casa selecionada
  const [contas, setContas] = useState<ContaEntry[]>([createEmptyEntry()]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open || !workspaceId) return;
    const loadData = async () => {
      // Buscar investidores e casas autorizadas para o workspace
      const [invRes, accessRes, regulamentadasRes] = await Promise.all([
        supabase.from("investidores").select("id, nome").eq("workspace_id", workspaceId).order("nome"),
        supabase.from("bookmaker_workspace_access").select("bookmaker_catalogo_id").eq("workspace_id", workspaceId),
        // Regulamentadas são públicas — disponíveis para todos os workspaces
        supabase.from("bookmakers_catalogo")
          .select("id, nome, moeda_padrao, logo_url, status")
          .eq("status", "REGULAMENTADA")
          .order("nome"),
      ]);
      setInvestidores(invRes.data || []);

      const regulamentadas = regulamentadasRes.data || [];
      const regulamentadasIds = new Set(regulamentadas.map(r => r.id));

      // Não-regulamentadas restritas por acesso do workspace
      const allowedIds = (accessRes.data || [])
        .map(a => a.bookmaker_catalogo_id)
        .filter(id => !regulamentadasIds.has(id));

      let naoRegulamentadas: typeof regulamentadas = [];
      if (allowedIds.length > 0) {
        const { data: nrData } = await supabase
          .from("bookmakers_catalogo")
          .select("id, nome, moeda_padrao, logo_url, status")
          .in("id", allowedIds)
          .order("nome");
        naoRegulamentadas = nrData || [];
      }

      // Combinar: regulamentadas (públicas) + não-regulamentadas (restritas)
      const combined = [...regulamentadas, ...naoRegulamentadas];
      combined.sort((a, b) => a.nome.localeCompare(b.nome));
      setCatalogoBookmakers(combined);
    };
    loadData();
  }, [open, workspaceId]);

  const filteredCasas = useMemo(() => {
    let list = catalogoBookmakers;
    if (regFilter !== "todas") {
      list = list.filter(b => (b.status || "REGULAMENTADA") === regFilter);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(b => b.nome.toLowerCase().includes(q));
    }
    return list;
  }, [catalogoBookmakers, searchQuery, regFilter]);

  const addEntry = () => setContas(prev => [...prev, createEmptyEntry()]);

  const removeEntry = (id: string) => {
    if (contas.length <= 1) return;
    setContas(prev => prev.filter(c => c.id !== id));
  };

  const updateEntry = (id: string, field: keyof ContaEntry, value: string) => {
    setContas(prev => prev.map(c => c.id === id ? { ...c, [field]: value } : c));
  };

  const selectCasa = (casa: { id: string; nome: string; moeda_padrao: string }) => {
    setSelectedCasaId(casa.id);
    setSelectedCasaNome(casa.nome);
    setMoeda(casa.moeda_padrao);
    setContas([createEmptyEntry()]);
    setStep("add-accounts");
  };

  const handleSave = async () => {
    if (!workspaceId || !investidorId || !selectedCasaId) return;

    const invalidEntries = contas.filter(c => !c.login_username.trim());
    if (invalidEntries.length > 0) {
      toast.error("Preencha o login de cada conta");
      return;
    }

    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Usuário não autenticado");

      const investidor = investidores.find(i => i.id === investidorId);

      for (const conta of contas) {
        const saldoInicial = parseFloat(conta.saldo_inicial) || 0;
        const passwordToStore = conta.login_password || "***";

        const { data: newBookmaker, error: bmError } = await supabase
          .from("bookmakers")
          .insert({
            workspace_id: workspaceId,
            user_id: user.id,
            nome: selectedCasaNome,
            bookmaker_catalogo_id: selectedCasaId,
            instance_identifier: conta.instance_identifier || null,
            login_username: conta.login_username,
            login_password_encrypted: passwordToStore,
            moeda,
            // When projeto_id is set, insert with saldo_atual=0 because the
            // tr_ensure_deposito_virtual_on_insert trigger will create a DEPOSITO_VIRTUAL
            // that credits the balance via financial_events. Setting saldo_atual=saldoInicial
            // AND having the trigger fire causes DOUBLE the balance.
            saldo_atual: projetoId ? 0 : saldoInicial,
            saldo_freebet: 0,
            saldo_irrecuperavel: 0,
            saldo_usd: 0,
            status: "ativo",
            investidor_id: investidorId,
            projeto_id: projetoId || null,
          })
          .select("id")
          .single();

        if (bmError) throw bmError;

        // Se há saldo inicial e projeto vinculado, o trigger tr_ensure_deposito_virtual_on_link
        // já gera o DEPOSITO_VIRTUAL automaticamente ao setar projeto_id.
        // Se não há projeto, criar APORTE_DIRETO manual para registrar o capital.
        if (saldoInicial > 0 && newBookmaker && !projetoId) {
          const { error: ledgerError } = await supabase
            .from("cash_ledger")
            .insert({
              workspace_id: workspaceId,
              user_id: user.id,
              tipo_transacao: "APORTE_DIRETO",
              tipo_moeda: "FIAT",
              moeda,
              valor: saldoInicial,
              data_transacao: getTodayCivilDate(),
              investidor_id: investidorId,
              nome_investidor: investidor?.nome || "",
              origem_tipo: "INVESTIDOR",
              destino_tipo: "BOOKMAKER",
              destino_bookmaker_id: newBookmaker.id,
              status: "CONFIRMADO",
              impacta_caixa_operacional: false,
              descricao: `Aporte direto - ${investidor?.nome} → ${selectedCasaNome}${conta.instance_identifier ? ` (${conta.instance_identifier})` : ""}`,
            });

          if (ledgerError) throw ledgerError;
        }
      }

      toast.success(`${contas.length} conta(s) de ${selectedCasaNome} cadastrada(s)`, {
        description: `Investidor: ${investidor?.nome}`,
      });

      resetForm();
      onSuccess();
    } catch (err: any) {
      toast.error("Erro ao cadastrar contas", { description: err.message });
    } finally {
      setSaving(false);
    }
  };

  const resetForm = () => {
    setStep("select-investor");
    setContas([createEmptyEntry()]);
    setInvestidorId("");
    setSelectedCasaId("");
    setSelectedCasaNome("");
    setSearchQuery("");
    setMoeda("BRL");
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  const investidorNome = investidores.find(i => i.id === investidorId)?.nome;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-3xl max-h-[90vh]">
        <DialogHeader>
          <DialogTitle>Receber Contas do Investidor</DialogTitle>
          <DialogDescription>
            {step === "select-investor" && "Selecione o investidor que está trazendo as contas."}
            {step === "select-house" && "Pesquise e selecione a casa de apostas."}
            {step === "add-accounts" && `Adicione as contas de ${selectedCasaNome} do investidor ${investidorNome}.`}
          </DialogDescription>
        </DialogHeader>

        {/* ========== STEP 1: Selecionar Investidor ========== */}
        {step === "select-investor" && (
          <div className="space-y-4 py-4">
            <Label className="text-sm font-medium">Investidor *</Label>
            <Select value={investidorId} onValueChange={(v) => { setInvestidorId(v); setStep("select-house"); }}>
              <SelectTrigger className="h-11">
                <SelectValue placeholder="Selecione o investidor" />
              </SelectTrigger>
              <SelectContent>
                {investidores.map(inv => (
                  <SelectItem key={inv.id} value={inv.id}>{inv.nome}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {/* ========== STEP 2: Selecionar Casa ========== */}
        {step === "select-house" && (
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="sm" onClick={() => setStep("select-investor")} className="h-8 w-8 p-0">
                <ArrowLeft className="h-4 w-4" />
              </Button>
              <Badge variant="outline" className="text-xs">{investidorNome}</Badge>
            </div>

            <div className="flex items-center gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Pesquisar casa de apostas..."
                  className="pl-10 h-11"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  autoFocus
                />
              </div>
              <div className="shrink-0 flex items-center gap-1">
                {(["todas", "REGULAMENTADA", "NAO_REGULAMENTADA"] as RegFilter[]).map((value) => {
                  const isActive = regFilter === value;
                  const label = value === "todas" ? "TODAS" : value === "REGULAMENTADA" ? "REGULAMENTADA" : "NÃO REGULAMENTADA";
                  return (
                    <button
                      key={value}
                      onClick={() => setRegFilter(value)}
                      className={cn(
                        "h-7 px-3 rounded text-[10px] font-semibold tracking-wide transition-colors uppercase",
                        isActive
                          ? value === "REGULAMENTADA"
                            ? "bg-emerald-600 text-white"
                            : value === "NAO_REGULAMENTADA"
                              ? "bg-amber-600 text-white"
                              : "bg-primary text-primary-foreground"
                          : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                      )}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>

            <ScrollArea className="h-[350px]">
              <div className="grid grid-cols-2 md:grid-cols-3 gap-2 pr-4">
                {filteredCasas.map(casa => (
                  <button
                    key={casa.id}
                    onClick={() => selectCasa(casa)}
                    className="flex items-center gap-2 p-3 rounded-lg border border-border/50 bg-card/50 hover:bg-primary/5 hover:border-primary/30 transition-all text-left group"
                  >
                    <BookmakerLogo logoUrl={casa.logo_url} alt={casa.nome} size="h-7 w-7" iconSize="h-3.5 w-3.5" />
                    <span className="text-sm font-medium truncate flex-1">{casa.nome}</span>
                    <Badge variant="outline" className="text-[10px] shrink-0 opacity-60 group-hover:opacity-100">
                      {casa.moeda_padrao}
                    </Badge>
                  </button>
                ))}
                {filteredCasas.length === 0 && (
                  <div className="col-span-full text-center py-8 text-muted-foreground text-sm">
                    Nenhuma casa encontrada para "{searchQuery}"
                  </div>
                )}
              </div>
            </ScrollArea>
          </div>
        )}

        {/* ========== STEP 3: Adicionar Contas ========== */}
        {step === "add-accounts" && (
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="sm" onClick={() => setStep("select-house")} className="h-8 w-8 p-0">
                <ArrowLeft className="h-4 w-4" />
              </Button>
              <Badge variant="outline" className="text-xs">{investidorNome}</Badge>
              <span className="text-muted-foreground text-xs">→</span>
              <Badge className="text-xs bg-primary/10 text-primary border-primary/20">{selectedCasaNome}</Badge>
              <div className="ml-auto flex items-center gap-2">
                <Label className="text-xs text-muted-foreground">Moeda:</Label>
                <Select value={moeda} onValueChange={setMoeda}>
                  <SelectTrigger className="h-7 w-20 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {MOEDAS.map(m => (
                      <SelectItem key={m} value={m} className="text-xs">{m}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="flex items-center justify-between">
              <Label className="text-sm">{contas.length} conta(s)</Label>
              <Button type="button" variant="outline" size="sm" onClick={addEntry} className="gap-1 h-7 text-xs">
                <Plus className="h-3 w-3" />
                Adicionar conta
              </Button>
            </div>

            <ScrollArea className="max-h-[350px]">
              <div className="space-y-2 pr-4">
                {contas.map((conta, index) => (
                  <div key={conta.id} className="rounded-lg border border-border/40 bg-muted/10 p-3">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-semibold text-muted-foreground">#{index + 1}</span>
                      {contas.length > 1 && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => removeEntry(conta.id)}
                          className="h-5 w-5 p-0 text-destructive/60 hover:text-destructive"
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      )}
                    </div>
                    <div className="grid grid-cols-4 gap-3">
                      <div className="space-y-1">
                        <Label className="text-[11px] text-muted-foreground">Identificador</Label>
                        <Input
                          className="h-8 text-xs"
                          placeholder="Batch 3501"
                          value={conta.instance_identifier}
                          onChange={(e) => updateEntry(conta.id, "instance_identifier", e.target.value)}
                          maxLength={100}
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-[11px] text-muted-foreground">Login *</Label>
                        <Input
                          className="h-8 text-xs"
                          placeholder="usuário ou e-mail"
                          value={conta.login_username}
                          onChange={(e) => updateEntry(conta.id, "login_username", e.target.value)}
                          maxLength={200}
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-[11px] text-muted-foreground">Senha</Label>
                        <Input
                          className="h-8 text-xs"
                          type="password"
                          placeholder="opcional"
                          value={conta.login_password}
                          onChange={(e) => updateEntry(conta.id, "login_password", e.target.value)}
                          maxLength={200}
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-[11px] text-muted-foreground">Saldo Inicial</Label>
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
        )}

        <DialogFooter>
          <Button variant="outline" onClick={handleClose} disabled={saving}>
            Cancelar
          </Button>
          {step === "add-accounts" && (
            <Button onClick={handleSave} disabled={saving || !investidorId || !selectedCasaId}>
              {saving ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Salvando...
                </>
              ) : (
                `Cadastrar ${contas.length} conta(s)`
              )}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
