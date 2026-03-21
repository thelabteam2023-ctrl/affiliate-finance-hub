import { useParams } from "react-router-dom";
import labbetLogo from "@/assets/labbet-logo.png";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, Lock, Clock, AlertTriangle, TrendingUp, TrendingDown, BarChart3, Target } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { SharedCalendar } from "@/components/shared/SharedCalendar";
import { SharedDailyChart } from "@/components/shared/SharedDailyChart";
import { useMemo } from "react";

interface SharedData {
  projeto: {
    id: string;
    nome: string;
    moeda_consolidacao: string;
    created_at: string;
  };
  resumo: {
    total_apostas: number;
    greens: number;
    reds: number;
    voids: number;
    lucro_total: number;
    total_stake: number;
    apostas_pendentes: number;
  };
  daily: Array<{ dia: string; lucro: number; qtd: number }>;
  error?: string;
}

export default function SharedProject() {
  const { token } = useParams<{ token: string }>();

  const { data, isLoading, error } = useQuery({
    queryKey: ["shared-project", token],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_shared_project_data", {
        p_token: token!,
      } as any);
      if (error) throw error;
      return data as unknown as SharedData;
    },
    enabled: !!token,
    staleTime: 60 * 1000,
  });

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-muted-foreground">Carregando projeto...</p>
        </div>
      </div>
    );
  }

  if (error || !data || data.error) {
    const errorCode = data?.error;
    let title = "Link inválido";
    let description = "Este link de compartilhamento não existe ou foi revogado.";
    let icon = <Lock className="h-12 w-12 text-destructive" />;

    if (errorCode === "EXPIRED_TOKEN") {
      title = "Link expirado";
      description = "Este link de compartilhamento expirou. Solicite um novo link ao responsável pelo projeto.";
      icon = <Clock className="h-12 w-12 text-muted-foreground" />;
    } else if (errorCode === "PROJECT_NOT_FOUND") {
      title = "Projeto não encontrado";
      description = "O projeto associado a este link não existe mais.";
      icon = <AlertTriangle className="h-12 w-12 text-warning" />;
    }

    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="max-w-md w-full">
          <CardContent className="flex flex-col items-center gap-4 pt-8 pb-8 text-center">
            {icon}
            <h2 className="text-xl font-semibold">{title}</h2>
            <p className="text-muted-foreground text-sm">{description}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const { projeto, resumo, daily } = data;
  const moeda = projeto.moeda_consolidacao || "BRL";
  const currencySymbol = moeda === "USD" ? "$" : moeda === "EUR" ? "€" : "R$";

  const roi = resumo.total_stake > 0
    ? ((resumo.lucro_total / resumo.total_stake) * 100)
    : 0;

  const winRate = resumo.total_apostas > 0
    ? ((resumo.greens / resumo.total_apostas) * 100)
    : 0;

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-card/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <img src={labbetLogo} alt="LABBET" className="h-8" />
            <div className="h-6 w-px bg-border" />
            <div>
              <h1 className="text-lg font-bold">{projeto.nome}</h1>
              <p className="text-[11px] text-muted-foreground">
                Visualização compartilhada
              </p>
            </div>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="max-w-6xl mx-auto px-4 py-6 space-y-6">
        {/* KPI Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <KpiCard
            title="Lucro Total"
            value={`${currencySymbol} ${resumo.lucro_total?.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`}
            icon={resumo.lucro_total >= 0 ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
            variant={resumo.lucro_total >= 0 ? "positive" : "negative"}
          />
          <KpiCard
            title="Apostas"
            value={resumo.total_apostas?.toLocaleString("pt-BR")}
            subtitle={`${resumo.apostas_pendentes} pendentes`}
            icon={<BarChart3 className="h-4 w-4" />}
          />
          <KpiCard
            title="ROI"
            value={`${roi.toFixed(2)}%`}
            icon={<Target className="h-4 w-4" />}
            variant={roi >= 0 ? "positive" : "negative"}
          />
          <KpiCard
            title="Win Rate"
            value={`${winRate.toFixed(1)}%`}
            subtitle={`${resumo.greens}G / ${resumo.reds}R`}
          />
        </div>

        {/* Calendar */}
        <SharedCalendar daily={daily} currencySymbol={currencySymbol} />

        {/* Chart */}
        <SharedDailyChart daily={daily} currencySymbol={currencySymbol} />
      </main>

      {/* Footer */}
      <footer className="border-t mt-12 py-6 text-center text-xs text-muted-foreground">
        Dados atualizados em tempo real • Compartilhado via StakeSync
      </footer>
    </div>
  );
}

function KpiCard({
  title,
  value,
  subtitle,
  icon,
  variant,
}: {
  title: string;
  value: string;
  subtitle?: string;
  icon?: React.ReactNode;
  variant?: "positive" | "negative";
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
          {icon}
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div
          className={`text-lg font-bold ${
            variant === "positive"
              ? "text-green-500"
              : variant === "negative"
              ? "text-red-500"
              : ""
          }`}
        >
          {value}
        </div>
        {subtitle && (
          <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>
        )}
      </CardContent>
    </Card>
  );
}
