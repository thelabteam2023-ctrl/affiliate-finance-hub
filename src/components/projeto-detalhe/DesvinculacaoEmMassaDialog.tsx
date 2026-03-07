import { useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import {
  Loader2,
  Search,
  AlertTriangle,
  Link2Off,
  Scale,
  TrendingDown,
  TrendingUp,
  Building2,
  User,
  CheckCircle2,
} from "lucide-react";
import { registrarAjusteViaLedger } from "@/lib/ledgerService";
import { preCheckUnlink, executeUnlink } from "@/lib/projetoTransitionService";
import { getCurrencySymbol, type SupportedCurrency } from "@/types/currency";
import type { Vinculo } from "@/hooks/useProjetoVinculos";
import { Progress } from "@/components/ui/progress";

interface DesvinculacaoEmMassaDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  vinculos: Vinculo[];
  projetoId: string;
  projetoNome?: string;
  workspaceId: string | null;
  onConcluido: () => void;
}

interface VinculoSelecionado {
  id: string;
  saldoRealInput: string;
  statusFinal: string;
  hasPendingBets: boolean;
}

const STATUS_OPTIONS = [
  { value: "ativo", label: "Devolvida" },
  { value: "limitada", label: "Limitada" },
  { value: "bloqueada", label: "Bloqueada" },
  { value: "encerrada", label: "Encerrada" },
];

export function DesvinculacaoEmMassaDialog({
  open,
  onOpenChange,
  vinculos,
  projetoId,
  projetoNome,
  workspaceId,
  onConcluido,
}: DesvinculacaoEmMassaDialogProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedMap, setSelectedMap] = useState<Record<string, VinculoSelecionado>>({});
  const [processing, setProcessing] = useState(false);
  const [progressCount, setProgressCount] = useState(0);
  const [progressTotal, setProgressTotal] = useState(0);
  const [results, setResults] = useState<{ id: string; nome: string; success: boolean; error?: string }[]>([]);
  const [step, setStep] = useState<"select" | "confirm" | "result">("select");

  // Filter vinculos with pending bets
  const vinculosComPendentes = useMemo(() => {
    return new Set(vinculos.filter(v => v.totalApostas > 0).map(v => v.id));
    // Note: totalApostas includes all bets, but for pending check we need to check status
    // For simplicity, we'll check during pre-check
  }, [vinculos]);

  const filteredVinculos = useMemo(() => {
    return vinculos.filter(v => {
      const term = searchTerm.toLowerCase();
      return (
        v.nome.toLowerCase().includes(term) ||
        (v.parceiro_nome?.toLowerCase().includes(term) ?? false)
      );
    });
  }, [vinculos, searchTerm]);

  const selectedIds = Object.keys(selectedMap);
  const selectedCount = selectedIds.length;

  const toggleSelect = (vinculo: Vinculo) => {
    setSelectedMap(prev => {
      const copy = { ...prev };
      if (copy[vinculo.id]) {
        delete copy[vinculo.id];
      } else {
        copy[vinculo.id] = {
          id: vinculo.id,
          saldoRealInput: "",
          statusFinal: "ativo",
          hasPendingBets: false, // will be checked on confirm
        };
      }
      return copy;
    });
  };

  const selectAll = () => {
    const newMap: Record<string, VinculoSelecionado> = {};
    filteredVinculos.forEach(v => {
      newMap[v.id] = selectedMap[v.id] || {
        id: v.id,
        saldoRealInput: "",
        statusFinal: "ativo",
        hasPendingBets: false,
      };
    });
    setSelectedMap(newMap);
  };

  const deselectAll = () => setSelectedMap({});

  const updateField = (id: string, field: keyof VinculoSelecionado, value: string) => {
    setSelectedMap(prev => ({
      ...prev,
      [id]: { ...prev[id], [field]: value },
    }));
  };

  const formatCurrency = (value: number, moeda: string = "BRL") => {
    const symbol = getCurrencySymbol(moeda as SupportedCurrency);
    const formatted = moeda === "BRL"
      ? value.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
      : value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return `${symbol} ${formatted}`;
  };

  const handleGoToConfirm = async () => {
    if (selectedCount === 0) {
      toast.error("Selecione pelo menos um vínculo");
      return;
    }

    // Validate: all selected must have saldo real filled
    const missing = selectedIds.filter(id => selectedMap[id].saldoRealInput === "");
    if (missing.length > 0) {
      toast.error(`Informe o saldo real de todas as ${missing.length} casa(s) selecionada(s)`);
      return;
    }

    // Check pending bets for each selected
    setProcessing(true);
    try {
      const pendingChecks = await Promise.all(
        selectedIds.map(async id => {
          const check = await preCheckUnlink(id);
          return { id, pendingBets: check.pendingBetsCount };
        })
      );

      const withPending = pendingChecks.filter(c => c.pendingBets > 0);
      if (withPending.length > 0) {
        // Remove them from selection
        const pendingNames = withPending.map(p => {
          const v = vinculos.find(vv => vv.id === p.id);
          return v?.nome || p.id;
        });
        
        setSelectedMap(prev => {
          const copy = { ...prev };
          withPending.forEach(p => {
            copy[p.id] = { ...copy[p.id], hasPendingBets: true };
          });
          return copy;
        });
        
        toast.error(
          `${withPending.length} casa(s) possuem apostas pendentes e foram bloqueadas: ${pendingNames.join(", ")}`,
          { duration: 6000 }
        );
        return;
      }

      setStep("confirm");
    } catch (err: any) {
      toast.error("Erro ao verificar pendências: " + err.message);
    } finally {
      setProcessing(false);
    }
  };

  const handleExecute = async () => {
    if (!workspaceId) {
      toast.error("Workspace não definido");
      return;
    }

    setProcessing(true);
    setProgressCount(0);
    setProgressTotal(selectedCount);
    setResults([]);

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      toast.error("Usuário não autenticado");
      setProcessing(false);
      return;
    }

    const resultados: typeof results = [];

    for (const id of selectedIds) {
      const sel = selectedMap[id];
      const vinculo = vinculos.find(v => v.id === id);
      if (!vinculo) continue;

      try {
        const saldoRealNum = parseFloat(sel.saldoRealInput.replace(",", ".")) || 0;
        const saldoSistema = vinculo.saldo_real;
        const diferenca = saldoRealNum - saldoSistema;
        const temDiferenca = Math.abs(diferenca) > 0.01;

        // 1. Reconciliar se houver diferença
        if (temDiferenca) {
          const ajusteResult = await registrarAjusteViaLedger({
            bookmakerId: vinculo.id,
            delta: diferenca,
            moeda: vinculo.moeda,
            workspaceId: workspaceId,
            userId: user.id,
            descricao: `Conciliação em massa. Projeto: ${projetoNome || projetoId}`,
            motivo: `Desvinculação em massa - ajuste de ${formatCurrency(diferenca, vinculo.moeda)}`,
            projetoIdSnapshot: projetoId,
          });

          if (!ajusteResult.success) {
            throw new Error(ajusteResult.error || "Erro ao ajustar saldo");
          }
        }

        // 2. Pre-check (recalcular saldo efetivo após ajuste)
        const check = await preCheckUnlink(vinculo.id);

        // 3. Determinar status
        const isLimitada = sel.statusFinal === "limitada";
        const saldoFinal = temDiferenca ? saldoRealNum : saldoSistema;
        const statusFinalDB = (isLimitada || sel.statusFinal === "aguardando_saque") && saldoFinal > 0
          ? "aguardando_saque"
          : sel.statusFinal;

        // 4. Executar unlink atômico
        await executeUnlink({
          bookmakerId: vinculo.id,
          projetoId,
          workspaceId,
          userId: user.id,
          statusFinal: statusFinalDB,
          saldoVirtualEfetivo: check.saldoVirtualEfetivo,
          moeda: vinculo.moeda,
          marcarParaSaque: statusFinalDB === "aguardando_saque",
        });

        resultados.push({ id, nome: vinculo.nome, success: true });
      } catch (err: any) {
        console.error(`[BulkUnlink] Erro em ${vinculo.nome}:`, err);
        resultados.push({ id, nome: vinculo.nome, success: false, error: err.message });
      }

      setProgressCount(prev => prev + 1);
      setResults([...resultados]);
    }

    setProcessing(false);
    setStep("result");

    const successCount = resultados.filter(r => r.success).length;
    const failCount = resultados.filter(r => !r.success).length;

    if (failCount === 0) {
      toast.success(`${successCount} vínculo(s) desvinculado(s) com sucesso`);
    } else {
      toast.warning(`${successCount} sucesso, ${failCount} erro(s)`);
    }
  };

  const handleClose = () => {
    if (processing) return;
    setSearchTerm("");
    setSelectedMap({});
    setStep("select");
    setResults([]);
    setProgressCount(0);
    onOpenChange(false);
    if (results.some(r => r.success)) {
      onConcluido();
    }
  };

  const selectedVinculos = vinculos.filter(v => selectedMap[v.id]);

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-4xl max-h-[85vh] flex flex-col p-0 gap-0 overflow-hidden">
        <DialogHeader className="p-4 pb-3 border-b border-border/50">
          <DialogTitle className="flex items-center gap-2 text-base">
            <Link2Off className="h-5 w-5 text-destructive" />
            Desvinculação em Massa
          </DialogTitle>
          <DialogDescription>
            {step === "select" && "Selecione as casas, informe o saldo real e o status final de cada uma."}
            {step === "confirm" && `Confirme a desvinculação de ${selectedCount} casa(s).`}
            {step === "result" && "Resultado da operação."}
          </DialogDescription>
        </DialogHeader>

        {/* STEP 1: Select */}
        {step === "select" && (
          <div className="flex flex-col flex-1 overflow-hidden">
            {/* Search + Actions */}
            <div className="p-3 border-b border-border/50 flex items-center gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar casa ou parceiro..."
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                  className="pl-9 h-9"
                />
              </div>
              <Button variant="outline" size="sm" onClick={selectedCount === filteredVinculos.length ? deselectAll : selectAll}>
                {selectedCount === filteredVinculos.length ? "Desmarcar" : "Selecionar"} Todos
              </Button>
            </div>

            {/* List */}
            <div className="flex-1 min-h-0 overflow-y-auto" style={{ maxHeight: "calc(85vh - 220px)" }}>
              <div className="divide-y divide-border/50">
                {filteredVinculos.map(vinculo => {
                  const isSelected = !!selectedMap[vinculo.id];
                  const sel = selectedMap[vinculo.id];
                  const saldoRealNum = sel ? parseFloat(sel.saldoRealInput.replace(",", ".")) || 0 : 0;
                  const diferenca = sel && sel.saldoRealInput !== "" ? saldoRealNum - vinculo.saldo_real : null;
                  const hasPending = sel?.hasPendingBets;

                  return (
                    <div key={vinculo.id} className={`p-3 transition-colors ${isSelected ? "bg-accent/30" : "hover:bg-muted/30"} ${hasPending ? "opacity-60" : ""}`}>
                      <div className="flex items-center gap-3">
                        {/* Checkbox */}
                        <Checkbox
                          checked={isSelected}
                          disabled={hasPending}
                          onCheckedChange={() => toggleSelect(vinculo)}
                        />

                        {/* Logo + Info */}
                        <div className="flex items-center gap-2 min-w-0 w-[180px] flex-shrink-0">
                          {vinculo.logo_url ? (
                            <img src={vinculo.logo_url} alt={vinculo.nome} className="h-7 w-7 rounded object-contain flex-shrink-0" />
                          ) : (
                            <div className="h-7 w-7 rounded bg-primary/10 flex items-center justify-center flex-shrink-0">
                              <Building2 className="h-4 w-4 text-primary" />
                            </div>
                          )}
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5">
                              <span className="text-sm font-medium truncate">{vinculo.nome}</span>
                              {vinculo.moeda !== "BRL" && (
                                <Badge variant="outline" className="text-[9px] px-1 py-0 bg-blue-500/10 text-blue-400 border-blue-500/30">
                                  {vinculo.moeda}
                                </Badge>
                              )}
                            </div>
                            <div className="flex items-center gap-1 text-xs text-muted-foreground">
                              <User className="h-3 w-3" />
                              <span className="truncate">{vinculo.parceiro_nome || "Sem parceiro"}</span>
                            </div>
                          </div>
                        </div>

                        {/* Saldo Sistema */}
                        <div className="text-right w-[120px] flex-shrink-0">
                          <p className="text-[10px] text-muted-foreground">Saldo Sistema</p>
                          <p className="text-sm font-medium tabular-nums">
                            {formatCurrency(vinculo.saldo_real, vinculo.moeda)}
                          </p>
                          {vinculo.saldo_freebet > 0 && (
                            <p className="text-[10px] tabular-nums text-amber-400">
                              🎁 FB: {formatCurrency(vinculo.saldo_freebet, vinculo.moeda)}
                            </p>
                          )}
                        </div>

                        {/* Saldo Real Input */}
                        <div className="w-[110px] flex-shrink-0">
                          <p className="text-[10px] text-muted-foreground mb-0.5">Saldo Real</p>
                          <Input
                            type="text"
                            inputMode="decimal"
                            placeholder="0.00"
                            value={sel?.saldoRealInput || ""}
                            onChange={e => updateField(vinculo.id, "saldoRealInput", e.target.value)}
                            disabled={!isSelected || hasPending}
                            className="h-7 text-sm tabular-nums"
                          />
                        </div>

                        {/* Delta */}
                        <div className="w-[80px] flex-shrink-0 text-center">
                          {diferenca !== null && Math.abs(diferenca) > 0.01 ? (
                            <div className="flex items-center justify-center gap-1">
                              {diferenca > 0 ? (
                                <TrendingUp className="h-3 w-3 text-emerald-500" />
                              ) : (
                                <TrendingDown className="h-3 w-3 text-destructive" />
                              )}
                              <span className={`text-xs font-medium tabular-nums ${diferenca > 0 ? "text-emerald-500" : "text-destructive"}`}>
                                {diferenca > 0 ? "+" : ""}{formatCurrency(diferenca, vinculo.moeda)}
                              </span>
                            </div>
                          ) : diferenca !== null ? (
                            <div className="flex items-center justify-center gap-1">
                              <Scale className="h-3 w-3 text-muted-foreground" />
                              <span className="text-[10px] text-muted-foreground">OK</span>
                            </div>
                          ) : null}
                        </div>

                        {/* Status Final */}
                        <div className="w-[150px] flex-shrink-0">
                          <p className="text-[10px] text-muted-foreground mb-0.5">Status Final</p>
                          <Select
                            value={sel?.statusFinal || "ativo"}
                            onValueChange={val => updateField(vinculo.id, "statusFinal", val)}
                            disabled={!isSelected || hasPending}
                          >
                            <SelectTrigger className="h-7 text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {STATUS_OPTIONS.map(opt => (
                                <SelectItem key={opt.value} value={opt.value} className="text-xs">
                                  {opt.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>

                        {/* Pending warning */}
                        {hasPending && (
                          <Badge variant="destructive" className="text-[10px] flex-shrink-0">
                            <AlertTriangle className="h-3 w-3 mr-1" />
                            Pendente
                          </Badge>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Footer */}
            <div className="p-3 border-t border-border/50 flex items-center justify-between">
              <span className="text-sm text-muted-foreground">
                {selectedCount} de {vinculos.length} selecionada(s)
              </span>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={handleClose}>
                  Cancelar
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={handleGoToConfirm}
                  disabled={selectedCount === 0 || processing}
                >
                  {processing ? (
                    <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> Verificando...</>
                  ) : (
                    <><Link2Off className="h-4 w-4 mr-1" /> Revisar ({selectedCount})</>
                  )}
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* STEP 2: Confirm */}
        {step === "confirm" && (
          <div className="flex flex-col flex-1 overflow-hidden">
            <div className="p-3 bg-destructive/10 border-b border-destructive/20">
              <div className="flex items-center gap-2 text-destructive">
                <AlertTriangle className="h-4 w-4" />
                <span className="text-sm font-medium">Ação irreversível</span>
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                As {selectedCount} casa(s) abaixo serão desvinculadas do projeto. Saldos com diferença serão ajustados automaticamente.
              </p>
            </div>

            <ScrollArea className="flex-1 max-h-[350px]">
              <div className="divide-y divide-border/50">
                {selectedVinculos.map(vinculo => {
                  const sel = selectedMap[vinculo.id];
                  const saldoRealNum = parseFloat(sel.saldoRealInput.replace(",", ".")) || 0;
                  const diferenca = saldoRealNum - vinculo.saldo_real;
                  const temDiferenca = Math.abs(diferenca) > 0.01;
                  const statusLabel = STATUS_OPTIONS.find(o => o.value === sel.statusFinal)?.label || sel.statusFinal;

                  return (
                    <div key={vinculo.id} className="p-3 flex items-center gap-4">
                      {vinculo.logo_url ? (
                        <img src={vinculo.logo_url} alt={vinculo.nome} className="h-7 w-7 rounded object-contain flex-shrink-0" />
                      ) : (
                        <div className="h-7 w-7 rounded bg-primary/10 flex items-center justify-center flex-shrink-0">
                          <Building2 className="h-4 w-4 text-primary" />
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <span className="text-sm font-medium">{vinculo.nome}</span>
                        <span className="text-xs text-muted-foreground ml-2">{vinculo.parceiro_nome}</span>
                      </div>
                      <div className="text-right text-xs space-y-0.5">
                        <div>Sistema: <span className="font-medium">{formatCurrency(vinculo.saldo_real, vinculo.moeda)}</span></div>
                        <div>Real: <span className="font-medium">{formatCurrency(saldoRealNum, vinculo.moeda)}</span></div>
                        {temDiferenca && (
                          <div className={diferenca > 0 ? "text-emerald-500" : "text-destructive"}>
                            Ajuste: {diferenca > 0 ? "+" : ""}{formatCurrency(diferenca, vinculo.moeda)}
                          </div>
                        )}
                      </div>
                      <Badge variant="outline" className="text-[10px]">{statusLabel}</Badge>
                    </div>
                  );
                })}
              </div>
            </ScrollArea>

            <div className="p-3 border-t border-border/50 flex items-center justify-between">
              <Button variant="outline" size="sm" onClick={() => setStep("select")} disabled={processing}>
                Voltar
              </Button>
              <Button
                size="sm"
                variant="destructive"
                onClick={handleExecute}
                disabled={processing}
              >
                {processing ? (
                  <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> Processando {progressCount}/{progressTotal}</>
                ) : (
                  <><Link2Off className="h-4 w-4 mr-1" /> Confirmar Desvinculação ({selectedCount})</>
                )}
              </Button>
            </div>

            {processing && (
              <div className="px-3 pb-3">
                <Progress value={(progressCount / progressTotal) * 100} className="h-2" />
              </div>
            )}
          </div>
        )}

        {/* STEP 3: Results */}
        {step === "result" && (
          <div className="flex flex-col flex-1 overflow-hidden">
            <ScrollArea className="flex-1 max-h-[400px]">
              <div className="divide-y divide-border/50">
                {results.map(r => (
                  <div key={r.id} className="p-3 flex items-center gap-3">
                    {r.success ? (
                      <CheckCircle2 className="h-5 w-5 text-emerald-500 flex-shrink-0" />
                    ) : (
                      <AlertTriangle className="h-5 w-5 text-destructive flex-shrink-0" />
                    )}
                    <div className="flex-1 min-w-0">
                      <span className="text-sm font-medium">{r.nome}</span>
                      {r.error && (
                        <p className="text-xs text-destructive mt-0.5">{r.error}</p>
                      )}
                    </div>
                    <Badge variant={r.success ? "default" : "destructive"} className="text-[10px]">
                      {r.success ? "OK" : "Erro"}
                    </Badge>
                  </div>
                ))}
              </div>
            </ScrollArea>

            <div className="p-3 border-t border-border/50 flex justify-between items-center">
              <span className="text-sm text-muted-foreground">
                {results.filter(r => r.success).length} sucesso · {results.filter(r => !r.success).length} erro(s)
              </span>
              <Button size="sm" onClick={handleClose}>
                Fechar
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
