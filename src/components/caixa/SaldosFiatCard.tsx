import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import ParceiroDialog from "@/components/parceiros/ParceiroDialog";
import { Plus, Calendar, Copy, Check, KeyRound, ChevronDown, ChevronUp, Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";
import { useCaixaDataChangedListener } from "@/hooks/useInvalidateCaixaData";
import { useTabWorkspace } from "@/hooks/useTabWorkspace";

interface PixKey {
  tipo?: string;
  chave: string;
}

interface ContaFiat {
  id: string;
  banco: string;
  titular: string;
  moeda: string;
  saldo: number;
  pixKeys: PixKey[];
}

interface SaldosFiatCardProps {
  caixaParceiroId: string | null;
  formatCurrency: (value: number, currency: string) => string;
  onDataChanged: () => void;
}

function normalizePixKeys(raw: any, legacy: string | null): PixKey[] {
  const list: PixKey[] = [];
  if (Array.isArray(raw)) {
    for (const k of raw) {
      if (k && typeof k.chave === "string" && k.chave.trim()) {
        list.push({ tipo: k.tipo, chave: k.chave.trim() });
      }
    }
  }
  if (list.length === 0 && legacy && legacy.trim()) {
    list.push({ chave: legacy.trim() });
  }
  return list;
}

/** Mascara parcialmente a chave PIX, preservando o suficiente para identificação. */
function maskPixKey(chave: string): string {
  const s = chave.trim();
  if (!s) return "";

  // E-mail: pri****@dominio.com
  const emailMatch = s.match(/^([^\s@]+)@([^\s@]+)$/);
  if (emailMatch) {
    const [, user, domain] = emailMatch;
    const visible = user.slice(0, Math.min(3, user.length));
    return `${visible}${"•".repeat(Math.max(3, user.length - visible.length))}@${domain}`;
  }

  const digits = s.replace(/\D/g, "");
  const isOnlyDigits = digits.length === s.replace(/[\s.\-/()+]/g, "").length;

  // CPF: •••.456.789-••
  if (isOnlyDigits && digits.length === 11) {
    return `•••.${digits.slice(3, 6)}.${digits.slice(6, 9)}-••`;
  }
  // CNPJ: ••.345.678/0001-••
  if (isOnlyDigits && digits.length === 14) {
    return `••.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8, 12)}-••`;
  }
  // Telefone: (••) ••••-1234
  if (isOnlyDigits && digits.length >= 10 && digits.length <= 13) {
    return `(••) ••••-${digits.slice(-4)}`;
  }

  // Aleatória / demais: mantém início e fim
  if (s.length <= 8) return `${s.slice(0, 2)}••••`;
  return `${s.slice(0, 4)}••••${s.slice(-4)}`;
}

export function SaldosFiatCard({ caixaParceiroId, formatCurrency, onDataChanged }: SaldosFiatCardProps) {
  const { workspaceId } = useTabWorkspace();
  const [contas, setContas] = useState<ContaFiat[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [revealedKey, setRevealedKey] = useState<string | null>(null);
  const [isParceiroDialogOpen, setIsParceiroDialogOpen] = useState(false);
  const [parceiroCompleto, setParceiroCompleto] = useState<any>(null);

  const fetchContas = useCallback(async () => {
    if (!caixaParceiroId) {
      setContas([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const [saldosRes, contasRes] = await Promise.all([
      supabase.from("v_saldo_parceiro_contas").select("*").eq("parceiro_id", caixaParceiroId),
      supabase
        .from("contas_bancarias")
        .select("id, banco, titular, moeda, pix_key, pix_keys")
        .eq("parceiro_id", caixaParceiroId),
    ]);

    const detalhes = new Map<string, any>();
    for (const c of contasRes.data || []) detalhes.set(c.id, c);

    const merged: ContaFiat[] = (saldosRes.data || []).map((c: any) => {
      const det = detalhes.get(c.conta_id);
      return {
        id: c.conta_id,
        banco: c.banco || det?.banco || "Conta bancária",
        titular: c.titular || det?.titular || "",
        moeda: c.moeda || det?.moeda || "BRL",
        saldo: Number(c.saldo) || 0,
        pixKeys: normalizePixKeys(det?.pix_keys, det?.pix_key ?? null),
      };
    });

    // Contas cadastradas que ainda não aparecem na view (sem movimentação)
    for (const det of contasRes.data || []) {
      if (!merged.some((m) => m.id === det.id)) {
        merged.push({
          id: det.id,
          banco: det.banco || "Conta bancária",
          titular: det.titular || "",
          moeda: det.moeda || "BRL",
          saldo: 0,
          pixKeys: normalizePixKeys(det.pix_keys, det.pix_key ?? null),
        });
      }
    }

    merged.sort((a, b) => (b.saldo || 0) - (a.saldo || 0));
    setContas(merged);
    setLoading(false);
  }, [caixaParceiroId]);

  const fetchParceiroCompleto = async () => {
    if (!caixaParceiroId) return;
    const { data } = await supabase
      .from("parceiros")
      .select(`
        *,
        contas_bancarias (*),
        wallets_crypto (*)
      `)
      .eq("id", caixaParceiroId)
      .single();
    
    if (data) {
      setParceiroCompleto(data);
      setIsParceiroDialogOpen(true);
    }
  };

  useEffect(() => { fetchContas(); }, [fetchContas]);

  // Reativo: refetch quando qualquer mutação do Caixa dispara o evento global
  useCaixaDataChangedListener(fetchContas);

  const copyPix = async (chave: string) => {
    try {
      await navigator.clipboard.writeText(chave);
      setCopiedKey(chave);
      toast.success("Chave PIX copiada");
      setTimeout(() => setCopiedKey((v) => (v === chave ? null : v)), 1500);
    } catch {
      toast.error("Não foi possível copiar");
    }
  };

  // Aggregate totals by currency
  const saldosPorMoeda = contas.reduce<Record<string, number>>((acc, c) => {
    const m = c.moeda || "BRL";
    acc[m] = (acc[m] || 0) + (c.saldo || 0);
    return acc;
  }, {});

  const primarySaldo = saldosPorMoeda["BRL"] || 0;
  const outrasMoedas = Object.entries(saldosPorMoeda).filter(([m]) => m !== "BRL");
  const contasVisiveis = expanded ? contas : contas.slice(0, 4);

  return (
    <>
      <Card className="bg-transparent border-[0.5px] border-[var(--border-default)] rounded-[12px] p-[16px_18px] relative overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <div className="w-1.5 h-1.5 rounded-full bg-[var(--accent-fiat)]" aria-hidden="true"></div>
            <span className="text-[11px] font-medium tracking-[0.06em] uppercase text-[var(--text-faint)]">
              Caixa FIAT
            </span>
            {contas.length > 0 && (
              <span className="bg-[var(--border-default)] text-[var(--text-muted)] text-[9px] px-1.5 py-0.5 rounded-[4px] font-medium">
                {contas.length}
              </span>
            )}
          </div>
          <div className="flex items-center gap-3">
            <button 
              className="p-1 hover:bg-white/5 rounded-md text-[var(--text-faint)] hover:text-[var(--accent-fiat)] transition-colors"
              onClick={fetchParceiroCompleto}
              title="Adicionar Conta"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
            <Calendar className="w-3.5 h-3.5 text-[var(--text-faint)] opacity-50" />
          </div>
        </div>

        {/* Body */}
        <div>
          <p className="text-[28px] font-medium text-[var(--text-primary)] tabular-nums leading-tight">
            {formatCurrency(primarySaldo, "BRL")}
          </p>
          <p className="text-[12px] text-[var(--text-muted)] mt-1">
            BRL · {contas.length === 1 ? "1 conta" : `${contas.length} contas`}
            {outrasMoedas.length > 0 && (
              <span className="ml-1">
                · {outrasMoedas.map(([m, v]) => `${formatCurrency(v, m)}`).join(" · ")}
              </span>
            )}
          </p>
        </div>

        {/* Detalhamento por banco */}
        <div className="mt-3 pt-3 border-t border-[var(--border-default)] space-y-1.5 relative z-10">
          {loading ? (
            <div className="space-y-2">
              {[0, 1].map((i) => (
                <div key={i} className="h-8 rounded-md bg-white/5 animate-pulse" />
              ))}
            </div>
          ) : contas.length === 0 ? (
            <p className="text-[11px] text-[var(--text-faint)] italic">
              Nenhuma conta bancária cadastrada. Use o botão + para adicionar.
            </p>
          ) : (
            <>
              {contasVisiveis.map((conta) => {
                const pix = conta.pixKeys[0];
                return (
                  <div
                    key={conta.id}
                    className="flex items-center gap-2 rounded-md px-1.5 py-1 hover:bg-white/[0.03] transition-colors"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-[12px] text-[var(--text-primary)] truncate leading-tight">
                        {conta.banco}
                      </p>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        {pix ? (
                          <>
                            <KeyRound className="w-2.5 h-2.5 text-[var(--text-faint)] shrink-0" />
                            <span className="text-[10px] font-mono text-[var(--text-muted)] truncate max-w-[130px]">
                              {pix.chave}
                            </span>
                            <button
                              type="button"
                              onClick={() => copyPix(pix.chave)}
                              title="Copiar chave PIX"
                              className="p-0.5 rounded hover:bg-white/10 text-[var(--text-faint)] hover:text-[var(--accent-fiat)] transition-colors shrink-0"
                            >
                              {copiedKey === pix.chave ? (
                                <Check className="w-3 h-3 text-emerald-500" />
                              ) : (
                                <Copy className="w-3 h-3" />
                              )}
                            </button>
                            {conta.pixKeys.length > 1 && (
                              <span className="text-[9px] text-[var(--text-faint)]">
                                +{conta.pixKeys.length - 1}
                              </span>
                            )}
                          </>
                        ) : (
                          <span className="text-[10px] text-[var(--text-faint)] italic">
                            Sem chave PIX
                          </span>
                        )}
                      </div>
                    </div>
                    <span className="text-[12px] tabular-nums text-[var(--text-primary)] shrink-0">
                      {formatCurrency(conta.saldo, conta.moeda || "BRL")}
                    </span>
                  </div>
                );
              })}
              {contas.length > 4 && (
                <button
                  type="button"
                  onClick={() => setExpanded((v) => !v)}
                  className="flex items-center gap-1 text-[10px] text-[var(--text-faint)] hover:text-[var(--text-muted)] transition-colors pl-1.5"
                >
                  {expanded ? (
                    <><ChevronUp className="w-3 h-3" /> Mostrar menos</>
                  ) : (
                    <><ChevronDown className="w-3 h-3" /> Ver todas ({contas.length})</>
                  )}
                </button>
              )}
            </>
          )}
        </div>

        {/* Watermark */}
        <div className="absolute bottom-2 right-4 text-[9px] font-bold tracking-[0.06em] text-[var(--border-default)] select-none uppercase">
          BRL
        </div>
      </Card>

      <ParceiroDialog
        key={`caixa-parceiro-dialog-${workspaceId ?? "none"}-${parceiroCompleto?.id ?? "none"}`}
        open={isParceiroDialogOpen}
        onClose={() => {
          setIsParceiroDialogOpen(false);
          setParceiroCompleto(null);
          onDataChanged();
          fetchContas();
        }}
        parceiro={parceiroCompleto}
        initialTab="bancos"
      />
    </>
  );
}

