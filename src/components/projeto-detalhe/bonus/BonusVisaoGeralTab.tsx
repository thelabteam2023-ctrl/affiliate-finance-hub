import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { supabase } from "@/integrations/supabase/client";
import { useProjectBonuses, ProjectBonus } from "@/hooks/useProjectBonuses";
import { Building2, Coins, Wallet, TrendingUp, AlertTriangle, Timer, Trophy } from "lucide-react";
import { differenceInDays, parseISO, format } from "date-fns";

interface BonusVisaoGeralTabProps {
  projetoId: string;
}

interface BookmakerWithBonus {
  id: string;
  nome: string;
  login_username: string;
  logo_url: string | null;
  parceiro_nome: string | null;
  saldo_real: number;
  bonus_ativo: number;
  moeda: string;
}

export function BonusVisaoGeralTab({ projetoId }: BonusVisaoGeralTabProps) {
  const { bonuses, getSummary, getBookmakersWithActiveBonus } = useProjectBonuses({ projectId: projetoId });
  const [bookmakersWithBonus, setBookmakersWithBonus] = useState<BookmakerWithBonus[]>([]);
  const [loading, setLoading] = useState(true);

  const summary = getSummary();
  const bookmakersInBonusMode = getBookmakersWithActiveBonus();

  // Get bonuses expiring soon
  const getExpiringSoon = (days: number): ProjectBonus[] => {
    const now = new Date();
    return bonuses.filter(b => {
      if (b.status !== 'credited' || !b.expires_at) return false;
      const expiresAt = parseISO(b.expires_at);
      const daysUntilExpiry = differenceInDays(expiresAt, now);
      return daysUntilExpiry >= 0 && daysUntilExpiry <= days;
    });
  };

  const expiring7Days = getExpiringSoon(7);
  const expiring15Days = getExpiringSoon(15);
  const expiring30Days = getExpiringSoon(30);

  useEffect(() => {
    fetchBookmakersWithBonus();
  }, [projetoId, bonuses]);

  const fetchBookmakersWithBonus = async () => {
    if (bookmakersInBonusMode.length === 0) {
      setBookmakersWithBonus([]);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      const { data, error } = await supabase
        .from("bookmakers")
        .select(`
          id,
          nome,
          login_username,
          saldo_atual,
          moeda,
          bookmakers_catalogo!bookmakers_bookmaker_catalogo_id_fkey (logo_url),
          parceiros!bookmakers_parceiro_id_fkey (nome)
        `)
        .in("id", bookmakersInBonusMode);

      if (error) throw error;

      // Calculate bonus total per bookmaker
      const bonusByBookmaker: Record<string, number> = {};
      bonuses.forEach(b => {
        if (b.status === 'credited') {
          bonusByBookmaker[b.bookmaker_id] = (bonusByBookmaker[b.bookmaker_id] || 0) + b.bonus_amount;
        }
      });

      const mapped: BookmakerWithBonus[] = (data || []).map((bk: any) => ({
        id: bk.id,
        nome: bk.nome,
        login_username: bk.login_username,
        logo_url: bk.bookmakers_catalogo?.logo_url || null,
        parceiro_nome: bk.parceiros?.nome || null,
        saldo_real: bk.saldo_atual,
        bonus_ativo: bonusByBookmaker[bk.id] || 0,
        moeda: bk.moeda || 'BRL',
      }));

      // Sort by bonus amount descending
      mapped.sort((a, b) => b.bonus_ativo - a.bonus_ativo);
      
      setBookmakersWithBonus(mapped);
    } catch (error) {
      console.error("Error fetching bookmakers:", error);
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (value: number, moeda: string = 'BRL') => {
    const symbols: Record<string, string> = { BRL: 'R$', USD: '$', EUR: '€', GBP: '£' };
    return `${symbols[moeda] || moeda} ${value.toFixed(2)}`;
  };

  // Calculate totals
  const totalSaldoReal = bookmakersWithBonus.reduce((acc, bk) => acc + bk.saldo_real, 0);
  const totalSaldoOperavel = totalSaldoReal + summary.active_bonus_total;

  return (
    <div className="space-y-6">
      {/* KPIs */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card className="border-amber-500/30 bg-amber-500/5">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Casas com Bônus</CardTitle>
            <Building2 className="h-4 w-4 text-amber-400" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-amber-400">{summary.bookmakers_with_active_bonus}</div>
            <p className="text-xs text-muted-foreground">Em modo bônus ativo</p>
          </CardContent>
        </Card>

        <Card className="border-amber-500/30 bg-amber-500/5">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Bônus Ativo</CardTitle>
            <Coins className="h-4 w-4 text-amber-400" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-amber-400">{formatCurrency(summary.active_bonus_total)}</div>
            <p className="text-xs text-muted-foreground">{summary.count_credited} bônus creditados</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Saldo Real (Casas)</CardTitle>
            <Wallet className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(totalSaldoReal)}</div>
            <p className="text-xs text-muted-foreground">Apenas casas em modo bônus</p>
          </CardContent>
        </Card>

        <Card className="border-primary/30 bg-primary/5">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Saldo Operável</CardTitle>
            <TrendingUp className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-primary">{formatCurrency(totalSaldoOperavel)}</div>
            <p className="text-xs text-muted-foreground">Real + Bônus Ativo</p>
          </CardContent>
        </Card>
      </div>

      {/* Expiring Soon */}
      {expiring7Days.length > 0 && (
        <Card className="border-red-500/30 bg-red-500/5">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2 text-red-400">
              <AlertTriangle className="h-4 w-4" />
              Expirando em 7 dias ({expiring7Days.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {expiring7Days.map(bonus => (
                <Badge key={bonus.id} variant="outline" className="border-red-500/30 text-red-400">
                  {bonus.bookmaker_nome} - {formatCurrency(bonus.bonus_amount, bonus.currency)}
                  {bonus.expires_at && (
                    <span className="ml-1 text-xs">({format(parseISO(bonus.expires_at), 'dd/MM')})</span>
                  )}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {expiring15Days.length > expiring7Days.length && (
        <Card className="border-yellow-500/30 bg-yellow-500/5">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2 text-yellow-400">
              <Timer className="h-4 w-4" />
              Expirando em 15 dias ({expiring15Days.length - expiring7Days.length} adicionais)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {expiring15Days.filter(b => !expiring7Days.some(e => e.id === b.id)).map(bonus => (
                <Badge key={bonus.id} variant="outline" className="border-yellow-500/30 text-yellow-400">
                  {bonus.bookmaker_nome} - {formatCurrency(bonus.bonus_amount, bonus.currency)}
                  {bonus.expires_at && (
                    <span className="ml-1 text-xs">({format(parseISO(bonus.expires_at), 'dd/MM')})</span>
                  )}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Top Bookmakers by Bonus */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Trophy className="h-4 w-4 text-amber-400" />
            Ranking: Casas por Bônus Ativo
          </CardTitle>
        </CardHeader>
        <CardContent>
          {bookmakersWithBonus.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Coins className="mx-auto h-12 w-12 mb-4 opacity-50" />
              <p>Nenhuma casa em modo bônus</p>
            </div>
          ) : (
            <ScrollArea className="h-[300px]">
              <div className="space-y-3">
                {bookmakersWithBonus.map((bk, index) => (
                  <div key={bk.id} className="flex items-center gap-3 p-3 rounded-lg bg-card border">
                    <div className="flex-shrink-0 w-8 h-8 rounded-full bg-amber-500/20 flex items-center justify-center text-amber-400 font-bold text-sm">
                      {index + 1}
                    </div>
                    {bk.logo_url ? (
                      <img src={bk.logo_url} alt={bk.nome} className="h-10 w-10 rounded-lg object-contain bg-white p-1" />
                    ) : (
                      <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                        <Building2 className="h-5 w-5 text-primary" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{bk.nome}</p>
                      <p className="text-xs text-muted-foreground truncate">{bk.login_username}</p>
                    </div>
                    <div className="text-right">
                      <p className="font-bold text-amber-400">{formatCurrency(bk.bonus_ativo, bk.moeda)}</p>
                      <p className="text-xs text-muted-foreground">
                        Operável: {formatCurrency(bk.saldo_real + bk.bonus_ativo, bk.moeda)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
