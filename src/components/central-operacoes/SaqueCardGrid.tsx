/**
 * SaqueCardGrid — Grid de cards para saques aguardando confirmação
 * Design inspirado no Patrimônio nas Casas (SaldoOperavelCard)
 */

import { Button } from "@/components/ui/button";
import { BookmakerLogo } from "@/components/ui/bookmaker-logo";
import { Wallet, Building2, Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import { getFirstLastName } from "@/lib/utils";
import type { SaquePendenteItem } from "./SaquesSmartFilter";

const CURRENCY_SYMBOLS: Record<string, string> = {
  BRL: "R$", USD: "US$", EUR: "€", GBP: "£", USDT: "US$", USDC: "US$", MXN: "MX$",
};

function formatVal(valor: number, moeda: string) {
  const sym = CURRENCY_SYMBOLS[moeda] || moeda;
  return `${sym} ${valor.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
}

interface SaqueCardGridProps {
  saques: SaquePendenteItem[];
  onConfirmar: (saque: SaquePendenteItem) => void;
}

export function SaqueCardGrid({ saques, onConfirmar }: SaqueCardGridProps) {
  if (saques.length === 0) {
    return (
      <p className="text-xs text-muted-foreground text-center py-4">
        Nenhum saque encontrado com os filtros aplicados.
      </p>
    );
  }

  return (
    <div
      className="grid gap-2"
      style={{ gridTemplateColumns: "repeat(auto-fit, minmax(270px, 1fr))" }}
    >
      {saques.map((saque) => {
        const destinoNome = saque.destino_wallet_id
          ? (saque.wallet_exchange || saque.wallet_nome || "Wallet")
          : (saque.banco_nome || "Conta Bancária");
        const parceiroShort = saque.parceiro_nome ? getFirstLastName(saque.parceiro_nome) : "";
        const moeda = saque.moeda_origem || saque.moeda || "BRL";
        const valor = saque.valor_origem || saque.valor;
        const isWallet = !!saque.destino_wallet_id;

        return (
          <div
            key={saque.id}
            className={cn(
              "group rounded-xl border p-3 transition-all duration-200",
              "bg-yellow-500/[0.04] border-yellow-500/20",
              "hover:border-yellow-500/40 hover:bg-yellow-500/[0.08]"
            )}
          >
            {/* Row 1: Logo + Casa name + Valor */}
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1 flex items-center gap-1.5">
                <BookmakerLogo
                  logoUrl={saque.bookmaker_logo_url}
                  alt={saque.bookmaker_nome}
                  size="h-5 w-5"
                  iconSize="h-3 w-3"
                />
                <span className="text-xs font-bold text-foreground truncate uppercase tracking-wide">
                  {saque.bookmaker_nome}
                </span>
              </div>
              <div className="flex items-baseline gap-1 flex-shrink-0">
                <span className="text-sm font-bold text-yellow-400 tabular-nums whitespace-nowrap">
                  {formatVal(valor, moeda)}
                </span>
                <span className="text-[9px] text-muted-foreground font-mono">{moeda}</span>
              </div>
            </div>

            {/* Row 2: Destino + Parceiro */}
            <div className="flex items-center justify-between gap-1.5 mt-1.5">
              <div className="flex items-center gap-1 min-w-0">
                {isWallet ? (
                  <Wallet className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                ) : (
                  <Building2 className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                )}
                <span className="text-[11px] text-muted-foreground truncate">
                  {destinoNome}
                </span>
              </div>
              {parceiroShort && (
                <span className="text-[10px] text-foreground/70 font-medium truncate flex-shrink-0">
                  {parceiroShort}
                </span>
              )}
            </div>

            {/* Row 3: Projeto + Coin + Tempo + Ação */}
            <div className="flex items-center justify-between gap-1.5 mt-2">
              <div className="flex items-center gap-1.5 min-w-0 flex-1">
                {saque.projeto_nome && (
                  <span className="text-[9px] text-muted-foreground/70 truncate max-w-[100px]">
                    {saque.projeto_nome}
                  </span>
                )}
                {saque.coin && (
                  <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-muted/30 text-muted-foreground font-medium">
                    {saque.coin}
                  </span>
                )}
                <span className="text-[9px] text-muted-foreground/50 flex items-center gap-0.5 flex-shrink-0">
                  <Clock className="h-2.5 w-2.5" />
                  {timeAgo(saque.data_transacao)}
                </span>
              </div>
              <Button
                size="sm"
                onClick={() => onConfirmar(saque)}
                className="bg-yellow-600 hover:bg-yellow-700 h-6 text-[10px] px-2.5 shrink-0 font-semibold"
              >
                Confirmar
              </Button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
