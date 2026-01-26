import { cn } from "@/lib/utils";
import { getCurrencyTextColor, formatCurrency } from "./BookmakerSelectOption";
import { Wallet } from "lucide-react";

/**
 * Linha de metadados abaixo do Select de Casa (Bookmaker/Exchange)
 * 
 * REGRA: Este container TEM ALTURA FIXA para estabilizar o layout.
 * Mesmo quando vazio, ocupa o espaço reservado.
 * 
 * Exibe: Nome do Parceiro • Saldo Disponível
 */
interface BookmakerMetaRowProps {
  parceiroNome?: string | null;
  saldoDisponivel?: number;
  moeda?: string;
  className?: string;
  /** Exibe ícone de wallet antes do saldo */
  showWalletIcon?: boolean;
  /** Indica que o saldo é insuficiente (vermelho) */
  saldoInsuficiente?: boolean;
}

export function BookmakerMetaRow({
  parceiroNome,
  saldoDisponivel,
  moeda = "BRL",
  className,
  showWalletIcon = false,
  saldoInsuficiente = false,
}: BookmakerMetaRowProps) {
  const parceiroShort = parceiroNome?.split(' ')[0] || '';
  const hasData = parceiroShort || (saldoDisponivel !== undefined && saldoDisponivel !== null);
  const colorClass = saldoInsuficiente ? "text-destructive" : getCurrencyTextColor(moeda);
  
  return (
    <div 
      className={cn(
        "h-4 text-[10px] text-muted-foreground text-center truncate px-1 flex items-center justify-center gap-1",
        className
      )}
    >
      {hasData ? (
        <>
          {parceiroShort && <span className="truncate">{parceiroShort}</span>}
          {parceiroShort && saldoDisponivel !== undefined && <span className="mx-0.5">•</span>}
          {saldoDisponivel !== undefined && (
            <span className={cn("flex items-center gap-0.5 flex-shrink-0", colorClass)}>
              {showWalletIcon && <Wallet className="h-2.5 w-2.5" />}
              {formatCurrency(saldoDisponivel, moeda)}
            </span>
          )}
        </>
      ) : (
        // Espaço reservado invisível para manter altura
        <span className="opacity-0">—</span>
      )}
    </div>
  );
}
