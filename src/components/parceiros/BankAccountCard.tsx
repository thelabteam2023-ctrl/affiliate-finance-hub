import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Building2, Copy, Check, Wallet } from "lucide-react";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { formatMoneyValue } from "@/components/ui/money-display";

interface BankAccountCardProps {
  account: {
    banco: string;
    moeda?: string;
    tipo_conta: string;
    titular: string;
    pix_keys?: Array<{ tipo: string; chave: string }>;
    agencia?: string;
    conta?: string;
    saldo?: number | null;
  };
}

export function BankAccountCard({ account }: BankAccountCardProps) {
  const pixKeys = account.pix_keys?.filter(k => k.tipo && k.chave) || [];
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const { toast } = useToast();
  
  const copyToClipboard = async (text: string, label: string, index: number) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedIndex(index);
      toast({
        title: "Copiado!",
        description: `${label} copiado para a área de transferência.`,
      });
      setTimeout(() => setCopiedIndex(null), 2000);
    } catch (err) {
      toast({
        title: "Erro ao copiar",
        description: "Não foi possível copiar para a área de transferência.",
        variant: "destructive",
      });
    }
  };
  
  return (
    <Card className="bg-card/50 backdrop-blur border-border/50">
      <CardContent className="pt-6 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
              <Building2 className="w-5 h-5 text-primary" />
            </div>
            <div className="min-w-0">
              <h3 className="font-semibold text-foreground truncate">{account.banco}</h3>
              {account.moeda && (
                <span className="text-xs text-muted-foreground font-medium">{account.moeda}</span>
              )}
            </div>
          </div>
          <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
            <Badge variant="outline" className="bg-accent/20 text-accent-foreground">
              {account.tipo_conta}
            </Badge>
            {typeof account.saldo === "number" && (
              <div className="flex items-center gap-1.5">
                <Wallet className="w-3 h-3 text-muted-foreground" />
                <span
                  className={`text-sm font-bold tabular-nums ${
                    account.saldo > 0
                      ? "text-success"
                      : account.saldo < 0
                      ? "text-destructive"
                      : "text-foreground"
                  }`}
                >
                  {formatMoneyValue(account.saldo, account.moeda || "BRL")}
                </span>
              </div>
            )}
          </div>
        </div>

        <div className="space-y-2">
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wider">Titular</p>
            <p className="text-sm text-foreground font-medium">{account.titular}</p>
          </div>

          {(account.agencia || account.conta) && (
            <div className="flex gap-4">
              {account.agencia && (
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wider">Agência</p>
                  <p className="text-sm text-foreground font-medium">{account.agencia}</p>
                </div>
              )}
              {account.conta && (
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wider">Conta</p>
                  <p className="text-sm text-foreground font-medium">{account.conta}</p>
                </div>
              )}
            </div>
          )}

          {pixKeys.length > 0 && (
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wider">
                {pixKeys.length === 1 ? "Chave PIX" : "Chaves PIX"}
              </p>
              <div className="space-y-2 mt-1">
                {pixKeys.map((pixKey, index) => (
                  <div key={index} className="flex items-center gap-2">
                    <Badge variant="secondary" className="text-xs uppercase">
                      {pixKey.tipo}
                    </Badge>
                    <p 
                      className="text-sm text-foreground font-mono cursor-pointer hover:text-primary transition-colors flex items-center gap-2"
                      onClick={() => copyToClipboard(pixKey.chave, "Chave PIX", index)}
                      title="Clique para copiar"
                    >
                      {pixKey.chave}
                      {copiedIndex === index ? (
                        <Check className="w-3 h-3 text-primary" />
                      ) : (
                        <Copy className="w-3 h-3 opacity-50" />
                      )}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
