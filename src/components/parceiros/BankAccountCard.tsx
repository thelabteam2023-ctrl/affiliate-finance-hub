import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Building2, Copy, Check } from "lucide-react";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";

interface BankAccountCardProps {
  account: {
    banco: string;
    tipo_conta: string;
    titular: string;
    pix_keys?: Array<{ tipo: string; chave: string }>;
    agencia?: string;
    conta?: string;
  };
}

export function BankAccountCard({ account }: BankAccountCardProps) {
  const pixKey = account.pix_keys?.[0];
  const [copied, setCopied] = useState(false);
  const { toast } = useToast();
  
  const copyToClipboard = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      toast({
        title: "Copiado!",
        description: `${label} copiado para a área de transferência.`,
      });
      setTimeout(() => setCopied(false), 2000);
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
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
              <Building2 className="w-5 h-5 text-primary" />
            </div>
            <h3 className="font-semibold text-foreground">{account.banco}</h3>
          </div>
          <Badge variant="outline" className="bg-accent/20 text-accent-foreground">
            {account.tipo_conta}
          </Badge>
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

          {pixKey && (
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wider">Chave PIX</p>
              <div className="flex items-center gap-2 mt-1">
                <Badge variant="secondary" className="text-xs uppercase">
                  {pixKey.tipo}
                </Badge>
                <p 
                  className="text-sm text-foreground font-mono cursor-pointer hover:text-primary transition-colors flex items-center gap-2"
                  onClick={() => copyToClipboard(pixKey.chave, "Chave PIX")}
                  title="Clique para copiar"
                >
                  {pixKey.chave}
                  {copied ? (
                    <Check className="w-3 h-3 text-primary" />
                  ) : (
                    <Copy className="w-3 h-3 opacity-50" />
                  )}
                </p>
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
