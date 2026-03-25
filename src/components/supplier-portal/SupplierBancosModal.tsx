import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Landmark, User } from "lucide-react";

interface BancoItem {
  id: string;
  banco_nome: string;
  saldo: number;
  titular_nome: string;
  pix_key: string | null;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  bancos: BancoItem[];
  total: number;
}

function formatCurrency(val: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 2,
  }).format(val);
}

export function SupplierBancosModal({ open, onOpenChange, bancos, total }: Props) {
  // Group by titular
  const grouped = bancos.reduce<Record<string, { nome: string; bancos: BancoItem[]; total: number }>>((acc, b) => {
    if (!acc[b.titular_nome]) {
      acc[b.titular_nome] = { nome: b.titular_nome, bancos: [], total: 0 };
    }
    acc[b.titular_nome].bancos.push(b);
    acc[b.titular_nome].total += Number(b.saldo);
    return acc;
  }, {});

  const titulares = Object.values(grouped).sort((a, b) => b.total - a.total);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Landmark className="h-5 w-5 text-primary" />
            Saldos em Bancos
          </DialogTitle>
          <p className="text-sm text-muted-foreground">
            Total: <span className="font-semibold text-foreground">{formatCurrency(total)}</span>
          </p>
        </DialogHeader>

        <div className="space-y-4 mt-2">
          {titulares.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-6">Nenhum banco cadastrado</p>
          )}
          {titulares.map((titular) => (
            <div key={titular.nome} className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-sm font-medium text-foreground">
                  <User className="h-3.5 w-3.5 text-muted-foreground" />
                  {titular.nome}
                </div>
                <span className="text-xs font-semibold text-muted-foreground tabular-nums">
                  {formatCurrency(titular.total)}
                </span>
              </div>
              <div className="space-y-1.5 pl-5">
                {titular.bancos.map((banco) => (
                  <div
                    key={banco.id}
                    className="flex items-center justify-between rounded-lg border border-border/50 bg-muted/30 px-3 py-2"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">{banco.banco_nome}</p>
                      {banco.pix_key && (
                        <p className="text-[10px] text-muted-foreground truncate">PIX: {banco.pix_key}</p>
                      )}
                    </div>
                    <span className="text-sm font-bold text-foreground tabular-nums shrink-0 ml-2">
                      {formatCurrency(Number(banco.saldo))}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
