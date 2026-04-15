import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Building2, Gift, Target } from "lucide-react";
import { BookmakerFreebetStats } from "./types";

interface FreebetResumoPorCasaProps {
  stats: BookmakerFreebetStats[];
  formatCurrency: (value: number) => string;
  viewMode?: 'card' | 'list';
}

export function FreebetResumoPorCasa({ stats, formatCurrency, viewMode = 'card' }: FreebetResumoPorCasaProps) {
  if (stats.length === 0) {
    return (
      <div className="text-center py-12 border rounded-lg bg-muted/5">
        <Building2 className="mx-auto h-10 w-10 text-muted-foreground/30" />
        <p className="mt-3 text-sm text-muted-foreground">Nenhuma casa com dados de Freebet</p>
      </div>
    );
  }

  if (viewMode === 'list') {
    return (
      <div className="space-y-2">
        {stats.map(stat => (
          <div key={stat.bookmaker_id} className="flex items-center gap-4 p-3 rounded-lg border bg-card">
            {/* Logo */}
            {stat.logo_url ? (
              <img src={stat.logo_url} alt={stat.bookmaker_nome} className="h-10 w-10 rounded-lg object-contain logo-blend p-1" />
            ) : (
              <div className="h-10 w-10 rounded-lg bg-muted flex items-center justify-center">
                <Building2 className="h-5 w-5" />
              </div>
            )}
            
            {/* Nome */}
            <div className="min-w-0 flex-1">
              <p className="font-medium truncate">{stat.bookmaker_nome}</p>
              {stat.parceiro_nome && (
                <p className="text-xs text-muted-foreground">{stat.parceiro_nome}</p>
              )}
            </div>
            
            {/* Métricas inline - apenas Recebido e Apostas */}
            <div className="grid grid-cols-2 gap-6 text-center">
              <div>
                <p className="text-xs text-muted-foreground">Recebido</p>
                <p className="font-semibold text-amber-400">{formatCurrency(stat.valor_total_recebido)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Apostas</p>
                <p className="font-semibold">{stat.apostas_realizadas}</p>
              </div>
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      {stats.map(stat => (
        <Card key={stat.bookmaker_id} className="overflow-hidden">
          <CardHeader className="pb-2">
            <div className="flex items-center gap-3">
              {stat.logo_url ? (
                <img src={stat.logo_url} alt={stat.bookmaker_nome} className="h-10 w-10 rounded-lg object-contain logo-blend p-1" />
              ) : (
                <div className="h-10 w-10 rounded-lg bg-muted flex items-center justify-center">
                  <Building2 className="h-5 w-5" />
                </div>
              )}
              <div className="min-w-0 flex-1">
                <CardTitle className="text-base truncate">{stat.bookmaker_nome}</CardTitle>
                {stat.parceiro_nome && (
                  <p className="text-xs text-muted-foreground truncate">{stat.parceiro_nome}</p>
                )}
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Métricas simplificadas: Recebido + Apostas */}
            <div className="grid grid-cols-2 gap-3">
              <div className="p-2 rounded-lg bg-amber-500/10 border border-amber-500/20">
                <div className="flex items-center gap-1 text-xs text-muted-foreground mb-1">
                  <Gift className="h-3 w-3 text-amber-400" />
                  Recebido
                </div>
                <p className="text-lg font-bold text-amber-400">{formatCurrency(stat.valor_total_recebido)}</p>
                <p className="text-xs text-muted-foreground">{stat.total_freebets_recebidas} freebets</p>
              </div>
              <div className="p-2 rounded-lg bg-muted/30 border border-border">
                <div className="flex items-center gap-1 text-xs text-muted-foreground mb-1">
                  <Target className="h-3 w-3" />
                  Apostas
                </div>
                <p className="text-lg font-bold">{stat.apostas_realizadas}</p>
                <p className="text-xs text-muted-foreground">com freebet</p>
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
