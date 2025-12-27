import {
  Edit,
  Trash2,
  FileText,
  DollarSign,
  Bitcoin,
  TrendingUp,
  Activity,
  Wallet,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Progress } from "@/components/ui/progress";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useActionAccess } from "@/hooks/useModuleAccess";

interface InvestidorROI {
  investidor_id: string;
  aportes_fiat_brl: number;
  aportes_fiat_usd: number;
  liquidacoes_fiat_brl: number;
  liquidacoes_fiat_usd: number;
  aportes_crypto_usd: number;
  liquidacoes_crypto_usd: number;
  saldo_fiat_brl: number;
  saldo_fiat_usd: number;
  saldo_crypto_usd: number;
  total_aportes_usd: number;
  total_liquidacoes_usd: number;
  roi_percentual: number;
}

interface InvestidorDeal {
  id: string;
  tipo_deal: "FIXO" | "PROGRESSIVO";
  base_calculo: "LUCRO" | "APORTE";
  percentual_fixo: number;
  faixas_progressivas: Array<{ limite: number; percentual: number }>;
  ativo: boolean;
}

interface Investidor {
  id: string;
  nome: string;
  cpf: string;
  status: string;
  observacoes?: string;
  created_at: string;
}

interface InvestidorPainelCardProps {
  investidor: Investidor;
  roi?: InvestidorROI;
  deal?: InvestidorDeal;
  onEdit: () => void;
  onDelete: () => void;
  onExtrato: () => void;
  onSimular?: () => void;
  onClick?: () => void;
}

const formatCurrency = (value: number, currency: "BRL" | "USD" = "BRL") => {
  return new Intl.NumberFormat(currency === "BRL" ? "pt-BR" : "en-US", {
    style: "currency",
    currency: currency,
    minimumFractionDigits: 2,
  }).format(value);
};

const formatCPF = (cpf: string) => {
  return cpf.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
};

// Calcula métricas com psicologia financeira positiva
const calcularMetricasPsicologicas = (
  aportes: number,
  liquidacoes: number
) => {
  // Capital em operação = quanto ainda está "trabalhando"
  const capitalEmOperacao = Math.max(0, aportes - liquidacoes);
  
  // Resultado realizado = lucro efetivo (só positivo quando liquidações > aportes)
  const resultadoRealizado = liquidacoes > aportes ? liquidacoes - aportes : 0;
  
  // ROI realizado = baseado apenas no resultado realizado
  const roiRealizado = aportes > 0 && resultadoRealizado > 0 
    ? (resultadoRealizado / aportes) * 100 
    : 0;
  
  // Status da operação
  let statusOperacao: "aguardando" | "em_operacao" | "lucro" | "prejuizo" = "aguardando";
  
  if (aportes === 0) {
    statusOperacao = "aguardando";
  } else if (liquidacoes === 0) {
    statusOperacao = "em_operacao";
  } else if (liquidacoes > aportes) {
    statusOperacao = "lucro";
  } else if (liquidacoes > 0 && liquidacoes < aportes) {
    statusOperacao = "em_operacao";
  }
  
  // Progresso visual (quanto do capital já retornou + lucro)
  const progressoRetorno = aportes > 0 ? Math.min(100, (liquidacoes / aportes) * 100) : 0;
  
  return {
    capitalEmOperacao,
    resultadoRealizado,
    roiRealizado,
    statusOperacao,
    progressoRetorno,
    totalRecebido: liquidacoes,
    capitalOriginal: aportes,
  };
};

const getStatusLabel = (status: "aguardando" | "em_operacao" | "lucro" | "prejuizo") => {
  const labels = {
    aguardando: { text: "Aguardando aporte", color: "text-muted-foreground", bg: "bg-muted/30" },
    em_operacao: { text: "Capital em operação", color: "text-amber-500", bg: "bg-amber-500/10" },
    lucro: { text: "Resultado positivo", color: "text-emerald-500", bg: "bg-emerald-500/10" },
    prejuizo: { text: "Resultado negativo", color: "text-destructive", bg: "bg-destructive/10" },
  };
  return labels[status];
};

export function InvestidorPainelCard({
  investidor,
  roi,
  deal,
  onEdit,
  onDelete,
  onExtrato,
  onSimular,
  onClick,
}: InvestidorPainelCardProps) {
  const { canEdit, canDelete } = useActionAccess();
  
  // Métricas FIAT
  const metricasFiat = calcularMetricasPsicologicas(
    roi?.aportes_fiat_brl || 0,
    roi?.liquidacoes_fiat_brl || 0
  );
  
  // Métricas Crypto
  const metricasCrypto = calcularMetricasPsicologicas(
    roi?.aportes_crypto_usd || 0,
    roi?.liquidacoes_crypto_usd || 0
  );

  const hasFiat = roi && (roi.aportes_fiat_brl > 0 || roi.liquidacoes_fiat_brl > 0);
  const hasCrypto = roi && (roi.aportes_crypto_usd > 0 || roi.liquidacoes_crypto_usd > 0);

  return (
    <Card className="overflow-hidden hover:shadow-lg transition-all duration-300 border-border/50 bg-card/80">
      {/* Header Section */}
      <div 
        className="p-4 cursor-pointer hover:bg-muted/30 transition-colors"
        onClick={onClick}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div
              className={`relative w-12 h-12 rounded-full flex items-center justify-center border-2 ${
                investidor.status === "inativo"
                  ? "bg-gradient-to-br from-warning/20 to-warning/5 border-warning/40"
                  : "bg-gradient-to-br from-primary/20 to-primary/5 border-primary/40"
              }`}
            >
              <span
                className={`text-lg font-bold ${
                  investidor.status === "inativo" ? "text-warning" : "text-primary"
                }`}
              >
                {investidor.nome.charAt(0).toUpperCase()}
              </span>
            </div>
            <div>
              <h3 className="font-semibold text-base leading-tight">{investidor.nome}</h3>
              <p className="text-xs text-muted-foreground font-mono mt-0.5">
                {formatCPF(investidor.cpf)}
              </p>
            </div>
          </div>
          <Badge
            variant={investidor.status === "ativo" ? "default" : "secondary"}
            className={
              investidor.status === "inativo"
                ? "bg-warning/20 text-warning border-warning/40"
                : "bg-primary/20 text-primary border-primary/40"
            }
          >
            {investidor.status.toUpperCase()}
          </Badge>
        </div>
      </div>

      <Separator className="bg-border/30" />

      {/* Deal Structure Section */}
      {deal && (
        <>
          <div className="px-4 py-3 bg-muted/20">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                Acordo de Remuneração
              </span>
              <Badge variant="outline" className="text-[10px] h-5">
                {deal.tipo_deal}
              </Badge>
            </div>
            {deal.tipo_deal === "FIXO" ? (
              <div className="flex items-center gap-2 mt-2">
                <span className="text-xl font-bold text-primary">{deal.percentual_fixo}%</span>
                <span className="text-xs text-muted-foreground">
                  {deal.base_calculo === "APORTE" ? "do valor aportado" : "dos lucros"}
                </span>
              </div>
            ) : (
              <div className="mt-2 space-y-1">
                {deal.faixas_progressivas.map((faixa, idx) => (
                  <div key={idx} className="flex justify-between text-xs">
                    <span className="text-muted-foreground">
                      {idx === 0 ? "Até" : "Acima de"} {formatCurrency(faixa.limite, "BRL")}
                    </span>
                    <span className="font-semibold text-primary">{faixa.percentual}%</span>
                  </div>
                ))}
              </div>
            )}
          </div>
          <Separator className="bg-border/30" />
        </>
      )}

      <CardContent className="p-4 space-y-4">
        {/* FIAT Section - Nova estrutura psicológica */}
        {hasFiat && (
          <div className="space-y-3">
            {/* Header com ícone e status */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <div className="p-1 rounded bg-amber-500/10">
                  <DollarSign className="h-3 w-3 text-amber-500" />
                </div>
                <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                  FIAT (BRL)
                </span>
              </div>
              <Badge 
                variant="outline" 
                className={`text-[9px] h-5 ${getStatusLabel(metricasFiat.statusOperacao).bg} ${getStatusLabel(metricasFiat.statusOperacao).color} border-transparent`}
              >
                <Activity className="h-2.5 w-2.5 mr-1" />
                {getStatusLabel(metricasFiat.statusOperacao).text}
              </Badge>
            </div>

            {/* Card de métricas */}
            <div className="bg-muted/10 rounded-lg p-3 space-y-3">
              {/* Capital em Operação - Destaque principal */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Wallet className="h-4 w-4 text-amber-500" />
                  <div>
                    <p className="text-[10px] text-muted-foreground uppercase">Capital em Operação</p>
                    <p className="text-lg font-bold text-foreground font-mono">
                      {formatCurrency(metricasFiat.capitalEmOperacao, "BRL")}
                    </p>
                  </div>
                </div>
                {metricasFiat.capitalOriginal > 0 && (
                  <Tooltip>
                    <TooltipTrigger>
                      <div className="text-right">
                        <p className="text-[9px] text-muted-foreground">Aportado</p>
                        <p className="text-xs text-muted-foreground font-mono">
                          {formatCurrency(metricasFiat.capitalOriginal, "BRL")}
                        </p>
                      </div>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Total aportado pelo investidor</p>
                    </TooltipContent>
                  </Tooltip>
                )}
              </div>

              {/* Barra de progresso visual */}
              {metricasFiat.capitalOriginal > 0 && (
                <div className="space-y-1">
                  <div className="flex justify-between text-[9px] text-muted-foreground">
                    <span>Retorno do capital</span>
                    <span>{metricasFiat.progressoRetorno.toFixed(0)}%</span>
                  </div>
                  <Progress 
                    value={metricasFiat.progressoRetorno} 
                    className="h-1.5 bg-muted/30"
                  />
                </div>
              )}

              <Separator className="bg-border/20" />

              {/* Resultado Realizado e ROI */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-[10px] text-muted-foreground uppercase mb-1">Resultado Realizado</p>
                  <div className="flex items-center gap-1.5">
                    {metricasFiat.resultadoRealizado > 0 && (
                      <TrendingUp className="h-3.5 w-3.5 text-emerald-500" />
                    )}
                    <span className={`text-base font-bold font-mono ${
                      metricasFiat.resultadoRealizado > 0 
                        ? "text-emerald-500" 
                        : "text-muted-foreground"
                    }`}>
                      {metricasFiat.resultadoRealizado > 0 
                        ? `+${formatCurrency(metricasFiat.resultadoRealizado, "BRL")}`
                        : "–"
                      }
                    </span>
                  </div>
                  {metricasFiat.resultadoRealizado === 0 && metricasFiat.capitalOriginal > 0 && (
                    <p className="text-[9px] text-muted-foreground mt-0.5">
                      Aguardando resultados
                    </p>
                  )}
                </div>

                <div>
                  <p className="text-[10px] text-muted-foreground uppercase mb-1">ROI Realizado</p>
                  <Badge
                    variant="outline"
                    className={`font-mono text-sm px-2 py-0.5 ${
                      metricasFiat.roiRealizado > 0
                        ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/30"
                        : "bg-muted/20 text-muted-foreground border-muted/30"
                    }`}
                  >
                    {metricasFiat.roiRealizado > 0 
                      ? `+${metricasFiat.roiRealizado.toFixed(1)}%`
                      : "–"
                    }
                  </Badge>
                </div>
              </div>

              {/* Total recebido (se houver) */}
              {metricasFiat.totalRecebido > 0 && (
                <div className="pt-2 border-t border-border/20">
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-muted-foreground">Total recebido</span>
                    <span className="font-mono text-foreground">
                      {formatCurrency(metricasFiat.totalRecebido, "BRL")}
                    </span>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* CRYPTO Section - Nova estrutura psicológica */}
        {hasCrypto && (
          <div className="space-y-3">
            {/* Header com ícone e status */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <div className="p-1 rounded bg-violet-500/10">
                  <Bitcoin className="h-3 w-3 text-violet-500" />
                </div>
                <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                  CRYPTO (USD)
                </span>
              </div>
              <Badge 
                variant="outline" 
                className={`text-[9px] h-5 ${getStatusLabel(metricasCrypto.statusOperacao).bg} ${getStatusLabel(metricasCrypto.statusOperacao).color} border-transparent`}
              >
                <Activity className="h-2.5 w-2.5 mr-1" />
                {getStatusLabel(metricasCrypto.statusOperacao).text}
              </Badge>
            </div>

            {/* Card de métricas */}
            <div className="bg-muted/10 rounded-lg p-3 space-y-3">
              {/* Capital em Operação - Destaque principal */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Wallet className="h-4 w-4 text-violet-500" />
                  <div>
                    <p className="text-[10px] text-muted-foreground uppercase">Capital em Operação</p>
                    <p className="text-lg font-bold text-foreground font-mono">
                      {formatCurrency(metricasCrypto.capitalEmOperacao, "USD")}
                    </p>
                  </div>
                </div>
                {metricasCrypto.capitalOriginal > 0 && (
                  <Tooltip>
                    <TooltipTrigger>
                      <div className="text-right">
                        <p className="text-[9px] text-muted-foreground">Aportado</p>
                        <p className="text-xs text-muted-foreground font-mono">
                          {formatCurrency(metricasCrypto.capitalOriginal, "USD")}
                        </p>
                      </div>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Total aportado pelo investidor</p>
                    </TooltipContent>
                  </Tooltip>
                )}
              </div>

              {/* Barra de progresso visual */}
              {metricasCrypto.capitalOriginal > 0 && (
                <div className="space-y-1">
                  <div className="flex justify-between text-[9px] text-muted-foreground">
                    <span>Retorno do capital</span>
                    <span>{metricasCrypto.progressoRetorno.toFixed(0)}%</span>
                  </div>
                  <Progress 
                    value={metricasCrypto.progressoRetorno} 
                    className="h-1.5 bg-muted/30"
                  />
                </div>
              )}

              <Separator className="bg-border/20" />

              {/* Resultado Realizado e ROI */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-[10px] text-muted-foreground uppercase mb-1">Resultado Realizado</p>
                  <div className="flex items-center gap-1.5">
                    {metricasCrypto.resultadoRealizado > 0 && (
                      <TrendingUp className="h-3.5 w-3.5 text-emerald-500" />
                    )}
                    <span className={`text-base font-bold font-mono ${
                      metricasCrypto.resultadoRealizado > 0 
                        ? "text-emerald-500" 
                        : "text-muted-foreground"
                    }`}>
                      {metricasCrypto.resultadoRealizado > 0 
                        ? `+${formatCurrency(metricasCrypto.resultadoRealizado, "USD")}`
                        : "–"
                      }
                    </span>
                  </div>
                  {metricasCrypto.resultadoRealizado === 0 && metricasCrypto.capitalOriginal > 0 && (
                    <p className="text-[9px] text-muted-foreground mt-0.5">
                      Aguardando resultados
                    </p>
                  )}
                </div>

                <div>
                  <p className="text-[10px] text-muted-foreground uppercase mb-1">ROI Realizado</p>
                  <Badge
                    variant="outline"
                    className={`font-mono text-sm px-2 py-0.5 ${
                      metricasCrypto.roiRealizado > 0
                        ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/30"
                        : "bg-muted/20 text-muted-foreground border-muted/30"
                    }`}
                  >
                    {metricasCrypto.roiRealizado > 0 
                      ? `+${metricasCrypto.roiRealizado.toFixed(1)}%`
                      : "–"
                    }
                  </Badge>
                </div>
              </div>

              {/* Total recebido (se houver) */}
              {metricasCrypto.totalRecebido > 0 && (
                <div className="pt-2 border-t border-border/20">
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-muted-foreground">Total recebido</span>
                    <span className="font-mono text-foreground">
                      {formatCurrency(metricasCrypto.totalRecebido, "USD")}
                    </span>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* No data message */}
        {!hasFiat && !hasCrypto && (
          <div className="text-center py-6 text-muted-foreground text-sm">
            <Wallet className="h-8 w-8 mx-auto mb-2 opacity-30" />
            <p>Nenhuma movimentação registrada</p>
            <p className="text-xs mt-1">Aguardando primeiro aporte</p>
          </div>
        )}
      </CardContent>

      <Separator className="bg-border/30" />

      {/* Actions Section */}
      <div className="p-3 bg-muted/10">
        <div className="flex justify-center gap-2">
          {canEdit('investidores', 'investidores.edit') && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="outline" size="sm" onClick={onEdit}>
                  <Edit className="h-3.5 w-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Editar</TooltipContent>
            </Tooltip>
          )}

          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="outline" size="sm" onClick={onExtrato}>
                <FileText className="h-3.5 w-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Ver Extrato</TooltipContent>
          </Tooltip>

          {canDelete('investidores', 'investidores.delete') && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="text-destructive hover:text-destructive hover:bg-destructive/10"
                  onClick={onDelete}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Excluir</TooltipContent>
            </Tooltip>
          )}
        </div>
      </div>
    </Card>
  );
}