import { useState, useEffect, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Building2, Landmark, ChevronLeft, Wallet, Check, ArrowRightLeft } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tipo: "DEPOSITO" | "SAQUE" | "TRANSFERENCIA_BANCO" | "RECOLHIMENTO_BANCO";
  supplierWorkspaceId: string;
  accounts: any[];
  saldoDisponivel: number;
  valorSugerido?: number;
  prefillTitularId?: string;
  prefillContaId?: string;
  onSuccess: () => void;
}

interface BancoItem {
  id: string;
  banco_nome: string;
  pix_key: string | null;
  saldo: number;
  titular_id: string;
  titular_nome: string;
}

function formatCurrency(val: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 2,
  }).format(val);
}

export function SupplierTransacaoDialog({
  open,
  onOpenChange,
  tipo,
  supplierWorkspaceId,
  accounts,
  saldoDisponivel,
  valorSugerido,
  prefillTitularId,
  prefillContaId,
  onSuccess,
}: Props) {
  const token = useMemo(() => new URLSearchParams(window.location.search).get("token") || "", []);
  const [step, setStep] = useState<1 | 2>(1);
  const [titularId, setTitularId] = useState("");
  const [bancoId, setBancoId] = useState("");
  const [contaId, setContaId] = useState("");
  const [valor, setValor] = useState(valorSugerido?.toString() || "");
  const [descricao, setDescricao] = useState("");

  const isDeposito = tipo === "DEPOSITO";
  const isTransferenciaBanco = tipo === "TRANSFERENCIA_BANCO";
  const isRecolhimentoBanco = tipo === "RECOLHIMENTO_BANCO";
  const isBankOperation = isTransferenciaBanco || isRecolhimentoBanco;

  // Fetch all workspace banks - action via query param
  const { data: bancos, refetch: refetchBancos } = useQuery({
    queryKey: ["supplier-workspace-bancos", supplierWorkspaceId],
    queryFn: async () => {
      const { data } = await supabase.functions.invoke("supplier-auth", {
        body: { action: "list-workspace-bancos", token },
      });
      return (data?.bancos || []).map((b: any) => ({
        id: b.id,
        banco_nome: b.banco_nome,
        pix_key: b.pix_key,
        saldo: Number(b.saldo) || 0,
        titular_id: b.titular_id,
        titular_nome: b.supplier_titulares?.nome || "—",
      })) as BancoItem[];
    },
    enabled: open && !!token,
  });

  // Derive titulares from bancos
  const titulares = useMemo(() => {
    if (!bancos) return [];
    const map = new Map<string, { id: string; nome: string; totalSaldo: number; bankCount: number }>();
    bancos.forEach(b => {
      const existing = map.get(b.titular_id);
      if (existing) {
        existing.totalSaldo += b.saldo;
        existing.bankCount += 1;
      } else {
        map.set(b.titular_id, { id: b.titular_id, nome: b.titular_nome, totalSaldo: b.saldo, bankCount: 1 });
      }
    });
    return Array.from(map.values()).sort((a, b) => a.nome.localeCompare(b.nome));
  }, [bancos]);

  // Banks for selected titular
  const titularBancos = useMemo(() => {
    if (!bancos || !titularId) return [];
    return bancos.filter(b => b.titular_id === titularId);
  }, [bancos, titularId]);

  // Accounts (casas) for selected titular only
  const titularAccounts = useMemo(() => {
    if (!titularId) return [];
    return accounts.filter((a: any) => a.titular_id === titularId);
  }, [accounts, titularId]);

  const selectedBanco = bancos?.find(b => b.id === bancoId);

  // Reset on open
  useEffect(() => {
    if (open) {
      setStep(prefillTitularId ? 1 : 1);
      setTitularId(prefillTitularId || "");
      setBancoId("");
      setContaId(prefillContaId || "");
      setValor(valorSugerido?.toString() || "");
      setDescricao("");
      refetchBancos();
    }
  }, [open]);

  // When titular changes, reset banco and conta
  useEffect(() => {
    setBancoId("");
    setContaId("");
  }, [titularId]);

  const handleSelectBanco = (id: string) => {
    setBancoId(id);
    if (isBankOperation) {
      setStep(2);
    } else {
      setStep(2);
    }
  };

  // ── TRANSFER TO/FROM BANK mutation ──
  const transferMutation = useMutation({
    mutationFn: async () => {
      const numValor = parseFloat(valor);
      if (!numValor || numValor <= 0) throw new Error("Valor inválido");
      if (!bancoId) throw new Error("Selecione um banco");

      if (isTransferenciaBanco && numValor > saldoDisponivel) {
        throw new Error(`Saldo disponível insuficiente: ${formatCurrency(saldoDisponivel)}`);
      }
      if (isRecolhimentoBanco && selectedBanco && numValor > selectedBanco.saldo) {
        throw new Error(`Saldo insuficiente no banco "${selectedBanco.banco_nome}": ${formatCurrency(selectedBanco.saldo)}`);
      }

      const ledgerTipo = isRecolhimentoBanco ? "RECOLHIMENTO_BANCO" : "TRANSFERENCIA_BANCO";
      const ledgerDirecao = isRecolhimentoBanco ? "CREDIT" : "DEBIT";
      const bancoOperacao = isRecolhimentoBanco ? "DEBIT" : "CREDIT";
      const descPadrao = isRecolhimentoBanco
        ? `Recolhimento do banco: ${selectedBanco?.banco_nome || "banco"}`
        : `Envio para banco: ${selectedBanco?.banco_nome || "banco"}`;

      // 1. Register in supplier_ledger
      const { data, error } = await supabase.rpc("supplier_ledger_insert", {
        p_supplier_workspace_id: supplierWorkspaceId,
        p_bookmaker_account_id: null,
        p_tipo: ledgerTipo,
        p_direcao: ledgerDirecao,
        p_valor: numValor,
        p_descricao: descricao || descPadrao,
        p_created_by: "SUPPLIER",
        p_idempotency_key: `${ledgerTipo}_${bancoId}_${Date.now()}`,
        p_metadata: { banco_id: bancoId, banco_nome: selectedBanco?.banco_nome, titular_id: titularId },
      });

      if (error) throw error;
      const result = data as any;
      if (!result?.success) throw new Error(result?.error || "Erro ao processar");

      // 2. Update bank balance
      const { data: bancoResult } = await supabase.functions.invoke("supplier-auth", {
        body: { action: "update-banco-saldo",
          token,
          banco_id: bancoId,
          valor: numValor,
          operacao: bancoOperacao,
        },
      });

      if (bancoResult?.error) {
        console.error("Erro ao atualizar saldo do banco:", bancoResult.error);
        toast.warning("Operação registrada, mas houve erro ao atualizar saldo do banco");
      }

      return result;
    },
    onSuccess: () => {
      toast.success(isRecolhimentoBanco ? "Valor recolhido do banco com sucesso" : "Valor enviado ao banco com sucesso");
      onOpenChange(false);
      onSuccess();
    },
    onError: (e: any) => toast.error(e.message),
  });

  // ── DEPOSIT/WITHDRAW mutation ──
  const mutation = useMutation({
    mutationFn: async () => {
      const numValor = parseFloat(valor);
      if (!numValor || numValor <= 0) throw new Error("Valor inválido");
      if (!contaId) throw new Error("Selecione uma conta");
      if (!bancoId) throw new Error("Selecione um banco");

      // Validate same titular
      const conta = accounts.find((a: any) => a.id === contaId);
      if (conta && selectedBanco && conta.titular_id !== selectedBanco.titular_id) {
        throw new Error("O banco e a conta devem pertencer ao mesmo titular");
      }

      if (isDeposito) {
        if (selectedBanco && numValor > selectedBanco.saldo) {
          throw new Error(`Saldo insuficiente no banco "${selectedBanco.banco_nome}". Disponível: ${formatCurrency(selectedBanco.saldo)}`);
        }
      } else {
        const conta = accounts.find(a => a.id === contaId);
        if (conta && numValor > Number(conta.saldo_atual)) {
          throw new Error(`Saldo da conta insuficiente: ${formatCurrency(Number(conta.saldo_atual))}`);
        }
      }

      const { data, error } = await supabase.rpc("supplier_ledger_insert", {
        p_supplier_workspace_id: supplierWorkspaceId,
        p_bookmaker_account_id: contaId,
        p_tipo: tipo,
        p_direcao: isDeposito ? "CREDIT" : "DEBIT",
        p_valor: numValor,
        p_descricao: descricao || `${isDeposito ? "Depósito" : "Saque"} via ${selectedBanco?.banco_nome || "banco"}`,
        p_created_by: "SUPPLIER",
        p_idempotency_key: `${tipo}_${contaId}_${bancoId}_${Date.now()}`,
        p_metadata: { banco_id: bancoId, banco_nome: selectedBanco?.banco_nome },
      });

      if (error) throw error;
      const result = data as any;
      if (!result?.success) throw new Error(result?.error || "Erro ao processar");

      const { data: bancoResult } = await supabase.functions.invoke("supplier-auth", {
        body: { action: "update-banco-saldo",
          token,
          banco_id: bancoId,
          valor: numValor,
          operacao: isDeposito ? "DEBIT" : "CREDIT",
        },
      });

      if (bancoResult?.error) {
        console.error("Erro ao atualizar saldo do banco:", bancoResult.error);
        toast.warning("Transação registrada, mas houve erro ao atualizar saldo do banco");
      }

      return result;
    },
    onSuccess: () => {
      toast.success(isDeposito ? "Depósito registrado" : "Saque registrado");
      onOpenChange(false);
      onSuccess();
    },
    onError: (e: any) => toast.error(e.message),
  });

  const dialogTitle = isRecolhimentoBanco
    ? "Recolher do Banco"
    : isTransferenciaBanco
      ? "Enviar ao Banco"
      : isDeposito
        ? "Depositar em Conta"
        : "Sacar de Conta";

  const dialogIcon = isBankOperation
    ? <ArrowRightLeft className="h-5 w-5 text-primary" />
    : isDeposito
      ? <Landmark className="h-5 w-5 text-primary" />
      : <Building2 className="h-5 w-5 text-primary" />;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {dialogIcon}
            {dialogTitle}
          </DialogTitle>
        </DialogHeader>

        {/* ── STEP 1: Select Bank Account ── */}
        {step === 1 && (
          <div className="space-y-3">
            {/* For RECOLHIMENTO_BANCO: show all banks grouped by titular directly */}
            {isRecolhimentoBanco ? (
              <>
                <Label className="text-muted-foreground text-xs">
                  Selecione a conta bancária para debitar:
                </Label>
                <div className="max-h-[380px] overflow-y-auto space-y-3 pr-1">
                  {titulares.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-6">
                      Nenhum banco cadastrado.
                    </p>
                  ) : (
                    titulares.map(t => {
                      const tBancos = (bancos || []).filter(b => b.titular_id === t.id).sort((a, b) => b.saldo - a.saldo);
                      if (tBancos.length === 0) return null;
                      return (
                        <div key={t.id} className="space-y-1.5">
                          <div className="flex items-center justify-between px-1">
                            <div className="flex items-center gap-1.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                              <Building2 className="h-3 w-3" />
                              {t.nome}
                            </div>
                            <span className="text-[10px] font-semibold text-muted-foreground tabular-nums">
                              {formatCurrency(t.totalSaldo)}
                            </span>
                          </div>
                          <div className="grid gap-1.5">
                            {tBancos.map(b => {
                              const disabled = b.saldo <= 0;
                              return (
                                <button
                                  key={b.id}
                                  type="button"
                                  disabled={disabled}
                                  onClick={() => {
                                    setTitularId(b.titular_id);
                                    handleSelectBanco(b.id);
                                  }}
                                  className={cn(
                                    "w-full flex items-center gap-3 rounded-lg border p-3 text-left transition-all cursor-pointer",
                                    disabled
                                      ? "opacity-40 cursor-not-allowed border-border/30"
                                      : "hover:border-primary/50 hover:bg-accent/30",
                                    bancoId === b.id && "border-primary bg-primary/5 ring-1 ring-primary/30"
                                  )}
                                >
                                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10">
                                    <Wallet className="h-4 w-4 text-primary" />
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <p className="font-medium text-sm text-foreground truncate">{b.banco_nome}</p>
                                    {b.pix_key && (
                                      <p className="text-[10px] text-muted-foreground truncate">PIX: {b.pix_key}</p>
                                    )}
                                  </div>
                                  <div className="text-right shrink-0">
                                    <p className={cn(
                                      "font-semibold text-sm tabular-nums",
                                      b.saldo > 0 ? "text-primary" : "text-muted-foreground"
                                    )}>
                                      {formatCurrency(b.saldo)}
                                    </p>
                                    {disabled && (
                                      <p className="text-[9px] text-destructive">sem saldo</p>
                                    )}
                                  </div>
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </>
            ) : (
              /* Original flow for DEPOSITO/SAQUE/TRANSFERENCIA_BANCO: titular dropdown → bank cards */
              <>
                <div>
                  <Label>Titular *</Label>
                  <Select value={titularId} onValueChange={setTitularId} disabled={!!prefillTitularId}>
                    <SelectTrigger className={prefillTitularId ? "opacity-80" : ""}>
                      <SelectValue placeholder="Selecione o titular" />
                    </SelectTrigger>
                    <SelectContent>
                      {titulares.map(t => (
                        <SelectItem key={t.id} value={t.id}>
                          <div className="flex items-center gap-2">
                            <span>{t.nome}</span>
                            <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                              {t.bankCount} banco{t.bankCount !== 1 ? "s" : ""}
                            </Badge>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {titularId && (
                  <div className="space-y-2">
                    <Label className="text-muted-foreground text-xs">
                      {isTransferenciaBanco
                        ? "Selecione o banco para receber o valor:"
                        : `Selecione o banco para ${isDeposito ? "debitar" : "creditar"}:`}
                    </Label>
                    {titularBancos.length === 0 ? (
                      <p className="text-sm text-muted-foreground text-center py-4">
                        Nenhum banco cadastrado para este titular.
                      </p>
                    ) : (
                      <div className="grid gap-2">
                        {titularBancos.map(b => (
                          <button
                            key={b.id}
                            type="button"
                            onClick={() => handleSelectBanco(b.id)}
                            className={cn(
                              "w-full flex items-center gap-3 rounded-lg border p-3 text-left transition-all hover:border-primary/50 hover:bg-accent/30 cursor-pointer",
                              bancoId === b.id && "border-primary bg-primary/5 ring-1 ring-primary/30"
                            )}
                          >
                            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10">
                              <Wallet className="h-5 w-5 text-primary" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="font-medium text-sm text-foreground truncate">{b.banco_nome}</p>
                              {b.pix_key && (
                                <p className="text-[11px] text-muted-foreground truncate">PIX: {b.pix_key}</p>
                              )}
                            </div>
                            <div className="text-right shrink-0">
                              <p className={cn(
                                "font-semibold text-sm",
                                b.saldo > 0 ? "text-primary" : "text-muted-foreground"
                              )}>
                                {formatCurrency(b.saldo)}
                              </p>
                              <p className="text-[10px] text-muted-foreground">saldo</p>
                            </div>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* ── STEP 2 for BANK OPERATIONS: Amount only ── */}
        {step === 2 && isBankOperation && selectedBanco && (
          <div className="space-y-4">
            {/* Selected bank summary */}
            <div className="flex items-center gap-3 rounded-lg border border-primary/30 bg-primary/5 p-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10">
                <Check className="h-4 w-4 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs text-muted-foreground">{selectedBanco.titular_nome}</p>
                <p className="font-medium text-sm text-foreground">{selectedBanco.banco_nome}</p>
              </div>
              <Badge variant="secondary" className="text-xs font-semibold">
                {formatCurrency(selectedBanco.saldo)}
              </Badge>
            </div>

            {/* Amount */}
            <div>
              <Label>Valor (R$) *</Label>
              <Input
                type="number"
                step="0.01"
                min="0.01"
                max={isRecolhimentoBanco ? selectedBanco.saldo : saldoDisponivel}
                value={valor}
                onChange={e => setValor(e.target.value)}
                placeholder="0,00"
              />
              {isRecolhimentoBanco ? (
                parseFloat(valor) > selectedBanco.saldo ? (
                  <p className="text-[11px] text-destructive mt-1 font-medium">
                    ⚠️ Valor excede o saldo do banco: {formatCurrency(selectedBanco.saldo)}
                  </p>
                ) : (
                  <p className="text-[11px] text-muted-foreground mt-1">
                    Saldo no banco: {formatCurrency(selectedBanco.saldo)}
                  </p>
                )
              ) : (
                parseFloat(valor) > saldoDisponivel ? (
                  <p className="text-[11px] text-destructive mt-1 font-medium">
                    ⚠️ Valor excede o saldo disponível: {formatCurrency(saldoDisponivel)}
                  </p>
                ) : (
                  <p className="text-[11px] text-muted-foreground mt-1">
                    Saldo disponível: {formatCurrency(saldoDisponivel)}
                  </p>
                )
              )}
            </div>

            {/* Description */}
            <div>
              <Label>Descrição</Label>
              <Textarea
                value={descricao}
                onChange={e => setDescricao(e.target.value)}
                placeholder="Observações (opcional)"
                rows={2}
              />
            </div>

            {/* Flow summary */}
            {valor && (
              <div className="bg-muted/50 rounded-lg p-3 text-xs text-muted-foreground space-y-1">
                <p className="font-medium text-foreground text-sm">Resumo da operação:</p>
                {isRecolhimentoBanco ? (
                  <>
                    <p>📉 <span className="font-medium">{selectedBanco.banco_nome}</span> ({selectedBanco.titular_nome}) será debitado em {formatCurrency(parseFloat(valor) || 0)}</p>
                    <p>📈 <span className="font-medium">Saldo Disponível</span> será creditado</p>
                  </>
                ) : (
                  <>
                    <p>📉 <span className="font-medium">Saldo Disponível</span> será debitado em {formatCurrency(parseFloat(valor) || 0)}</p>
                    <p>📈 <span className="font-medium">{selectedBanco.banco_nome}</span> ({selectedBanco.titular_nome}) será creditado</p>
                  </>
                )}
              </div>
            )}
          </div>
        )}

        {/* ── STEP 2 for DEPOSITO/SAQUE: Account, Amount, Description ── */}
        {step === 2 && !isBankOperation && selectedBanco && (
          <div className="space-y-4">
            {/* Selected bank summary */}
            <div className="flex items-center gap-3 rounded-lg border border-primary/30 bg-primary/5 p-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10">
                <Check className="h-4 w-4 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs text-muted-foreground">{selectedBanco.titular_nome}</p>
                <p className="font-medium text-sm text-foreground">{selectedBanco.banco_nome}</p>
              </div>
              <Badge variant="secondary" className="text-xs font-semibold">
                {formatCurrency(selectedBanco.saldo)}
              </Badge>
            </div>

            {/* Account selector */}
            <div>
              <Label>Conta (Casa) *</Label>
              <Select value={contaId} onValueChange={prefillContaId ? undefined : setContaId} disabled={!!prefillContaId}>
                <SelectTrigger className={prefillContaId ? "opacity-80 cursor-not-allowed" : ""}>
                  <SelectValue placeholder="Selecione a conta" />
                </SelectTrigger>
                <SelectContent>
                  {titularAccounts.map((a: any) => (
                    <SelectItem key={a.id} value={a.id}>
                      <div className="flex items-center gap-2">
                        {a.bookmakers_catalogo?.logo_url ? (
                          <img
                            src={a.bookmakers_catalogo.logo_url}
                            alt=""
                            className="h-5 w-5 rounded object-contain shrink-0"
                          />
                        ) : (
                          <div className="h-5 w-5 rounded bg-muted/30 shrink-0" />
                        )}
                        <span className="uppercase text-xs font-medium">
                          {a.bookmakers_catalogo?.nome || "Casa"}
                        </span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Amount */}
            <div>
              <Label>Valor (R$) *</Label>
              <Input
                type="number"
                step="0.01"
                min="0.01"
                value={valor}
                onChange={e => setValor(e.target.value)}
                placeholder="0,00"
              />
              {valorSugerido && isDeposito && valor !== valorSugerido.toString() && (
                <button
                  type="button"
                  onClick={() => setValor(valorSugerido.toString())}
                  className="text-xs text-primary mt-1 hover:underline"
                >
                  Usar valor sugerido: {formatCurrency(valorSugerido)}
                </button>
              )}
              {isDeposito && selectedBanco && parseFloat(valor) > selectedBanco.saldo && (
                <p className="text-xs text-destructive mt-1">
                  ⚠️ Valor excede o saldo do banco {selectedBanco.banco_nome} ({formatCurrency(selectedBanco.saldo)})
                </p>
              )}
              {!isDeposito && !isBankOperation && contaId && parseFloat(valor) > Number(accounts.find(a => a.id === contaId)?.saldo_atual || 0) && (
                <p className="text-xs text-destructive mt-1">
                  ⚠️ Valor excede o saldo da conta ({formatCurrency(Number(accounts.find(a => a.id === contaId)?.saldo_atual || 0))})
                </p>
              )}
            </div>

            {/* Description */}
            <div>
              <Label>Descrição</Label>
              <Textarea
                value={descricao}
                onChange={e => setDescricao(e.target.value)}
                placeholder="Observações (opcional)"
                rows={2}
              />
            </div>

            {/* Flow summary */}
            {contaId && valor && (
              <div className="bg-muted/50 rounded-lg p-3 text-xs text-muted-foreground space-y-1">
                <p className="font-medium text-foreground text-sm">Resumo da operação:</p>
                {isDeposito ? (
                  <>
                    <p>📉 <span className="font-medium">{selectedBanco.banco_nome}</span> será debitado em {formatCurrency(parseFloat(valor) || 0)}</p>
                    <p>📈 <span className="font-medium">{accounts.find(a => a.id === contaId)?.bookmakers_catalogo?.nome || "Casa"}</span> será creditada</p>
                  </>
                ) : (
                  <>
                    <p>📉 <span className="font-medium">{accounts.find(a => a.id === contaId)?.bookmakers_catalogo?.nome || "Casa"}</span> será debitada em {formatCurrency(parseFloat(valor) || 0)}</p>
                    <p>📈 <span className="font-medium">{selectedBanco.banco_nome}</span> será creditado</p>
                  </>
                )}
              </div>
            )}
          </div>
        )}

        <DialogFooter className="flex gap-2">
          {step === 2 && (
            <Button variant="ghost" size="sm" onClick={() => setStep(1)} className="mr-auto">
              <ChevronLeft className="h-4 w-4 mr-1" />
              Voltar
            </Button>
          )}
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          {step === 2 && isBankOperation && (
            <Button
              onClick={() => transferMutation.mutate()}
              disabled={
                transferMutation.isPending || !valor || !bancoId ||
                (isTransferenciaBanco && parseFloat(valor) > saldoDisponivel) ||
                (isRecolhimentoBanco && selectedBanco && parseFloat(valor) > selectedBanco.saldo)
              }
            >
              {transferMutation.isPending ? "Processando..." : isRecolhimentoBanco ? "Recolher do Banco" : "Enviar ao Banco"}
            </Button>
          )}
          {step === 2 && !isBankOperation && (
            <Button
              onClick={() => mutation.mutate()}
              disabled={
                mutation.isPending || !valor || !contaId || !bancoId ||
                (isDeposito && selectedBanco && parseFloat(valor) > selectedBanco.saldo) ||
                (!isDeposito && parseFloat(valor) > Number(accounts.find(a => a.id === contaId)?.saldo_atual || 0))
              }
            >
              {mutation.isPending ? "Processando..." : isDeposito ? "Depositar" : "Sacar"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
