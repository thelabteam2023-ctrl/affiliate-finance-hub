import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Building2, Gift, TrendingUp, Target, Percent } from "lucide-react";
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
            
            {/* Métricas inline */}
            <div className="grid grid-cols-5 gap-6 text-center">
              <div>
                <p className="text-xs text-muted-foreground">Recebido</p>
                <p className="font-semibold text-amber-400">{formatCurrency(stat.valor_total_recebido)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Extraído</p>
                <p className="font-semibold text-emerald-400">{formatCurrency(stat.valor_total_extraido)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Apostas</p>
                <p className="font-semibold">{stat.apostas_realizadas}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Taxa Ext.</p>
                <p className={`font-semibold ${stat.taxa_extracao >= 70 ? 'text-emerald-400' : stat.taxa_extracao >= 50 ? 'text-amber-400' : 'text-red-400'}`}>
                  {stat.taxa_extracao.toFixed(0)}%
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Saldo</p>
                <p className="font-semibold text-amber-400">{formatCurrency(stat.saldo_atual)}</p>
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
              {stat.saldo_atual > 0 && (
                <Badge className="bg-amber-500/20 text-amber-400 border-amber-500/30">
                  <Gift className="h-3 w-3 mr-1" />
                  {formatCurrency(stat.saldo_atual)}
                </Badge>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Métricas de Recebimento */}
            <div className="grid grid-cols-2 gap-3">
              <div className="p-2 rounded-lg bg-amber-500/10 border border-amber-500/20">
                <div className="flex items-center gap-1 text-xs text-muted-foreground mb-1">
                  <Gift className="h-3 w-3 text-amber-400" />
                  Recebido
                </div>
                <p className="text-lg font-bold text-amber-400">{formatCurrency(stat.valor_total_recebido)}</p>
                <p className="text-xs text-muted-foreground">{stat.total_freebets_recebidas} freebets</p>
              </div>
              <div className="p-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
                <div className="flex items-center gap-1 text-xs text-muted-foreground mb-1">
                  <TrendingUp className="h-3 w-3 text-emerald-400" />
                  Extraído
                </div>
                <p className="text-lg font-bold text-emerald-400">{formatCurrency(stat.valor_total_extraido)}</p>
                <p className="text-xs text-muted-foreground">{stat.apostas_ganhas} ganhas</p>
              </div>
            </div>

            {/* Taxa de Extração */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs text-muted-foreground flex items-center gap-1">
                  <Percent className="h-3 w-3" />
                  Taxa de Extração
                </span>
                <span className={`text-sm font-bold ${stat.taxa_extracao >= 70 ? 'text-emerald-400' : stat.taxa_extracao >= 50 ? 'text-amber-400' : 'text-red-400'}`}>
                  {stat.taxa_extracao.toFixed(1)}%
                </span>
              </div>
              <Progress 
                value={Math.min(100, stat.taxa_extracao)} 
                className="h-2"
              />
            </div>

            {/* Métricas de Freebets - Simplificado */}
            <div className="grid grid-cols-3 gap-2 text-center pt-2 border-t">
              <div>
                <p className="text-lg font-bold text-amber-400">{stat.total_freebets_recebidas}</p>
                <p className="text-[10px] text-muted-foreground flex items-center justify-center gap-0.5">
                  <Gift className="h-2.5 w-2.5" /> Geradas
                </p>
              </div>
              <div>
                <p className="text-lg font-bold">{stat.apostas_realizadas}</p>
                <p className="text-[10px] text-muted-foreground flex items-center justify-center gap-0.5">
                  <Target className="h-2.5 w-2.5" /> Extrações
                </p>
              </div>
              <div>
                <p className="text-lg font-bold text-yellow-400">{stat.apostas_pendentes}</p>
                <p className="text-[10px] text-muted-foreground flex items-center justify-center gap-0.5">
                  Pendentes
                </p>
              </div>
            </div>

          </CardContent>
        </Card>
      ))}
    </div>
  );
}
