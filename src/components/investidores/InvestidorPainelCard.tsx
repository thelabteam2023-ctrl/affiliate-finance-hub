import {
  Edit,
  Trash2,
  DollarSign,
  Bitcoin,
  Eye,
  FolderKanban,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useActionAccess } from "@/hooks/useModuleAccess";
import { NativeCurrencyKpi, CurrencyEntry } from "@/components/ui/native-currency-kpi";

// Interface multi-moeda para ROI
export interface InvestidorROIMultiMoeda {
  investidor_id: string;
  // FIAT por moeda nativa
  aportes_brl: number;
  liquidacoes_brl: number;
  aportes_usd: number;
  liquidacoes_usd: number;
  aportes_eur: number;
  liquidacoes_eur: number;
  aportes_gbp: number;
  liquidacoes_gbp: number;
  aportes_mxn: number;
  liquidacoes_mxn: number;
  aportes_myr: number;
  liquidacoes_myr: number;
  aportes_ars: number;
  liquidacoes_ars: number;
  aportes_cop: number;
  liquidacoes_cop: number;
  // Crypto
  aportes_crypto_usd: number;
  liquidacoes_crypto_usd: number;
  // Totais USD
  total_aportes_usd_ref: number;
  total_liquidacoes_usd_ref: number;
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
  roi?: InvestidorROIMultiMoeda;
  deal?: InvestidorDeal;
  projetosCount?: number;
  onEdit: () => void;
  onDelete: () => void;
  onSimular?: () => void;
  onClick?: () => void;
  onVerDetalhes?: () => void;
}

const FIAT_CURRENCIES = ["BRL", "USD", "EUR", "GBP", "MXN", "MYR", "ARS", "COP"] as const;

const formatCPF = (cpf: string) => {
  return cpf.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
};

/**
 * Extrai entries de capital em operação FIAT (aportes - liquidações) por moeda nativa
 */
function getFiatExposureEntries(roi: InvestidorROIMultiMoeda | undefined): CurrencyEntry[] {
  if (!roi) return [];

  const entries: CurrencyEntry[] = [];

  for (const currency of FIAT_CURRENCIES) {
    const key = currency.toLowerCase();
    const aportes = Number(roi[`aportes_${key}` as keyof InvestidorROIMultiMoeda]) || 0;
    const liquidacoes = Number(roi[`liquidacoes_${key}` as keyof InvestidorROIMultiMoeda]) || 0;
    const saldo = aportes - liquidacoes;

    if (saldo !== 0) {
      entries.push({ currency, value: saldo });
    }
  }

  return entries;
}

/**
 * Extrai entries de capital crypto (consolidado em USD)
 */
function getCryptoExposureEntries(roi: InvestidorROIMultiMoeda | undefined): CurrencyEntry[] {
  if (!roi) return [];

  const aportes = Number(roi.aportes_crypto_usd) || 0;
  const liquidacoes = Number(roi.liquidacoes_crypto_usd) || 0;
  const saldo = aportes - liquidacoes;

  if (saldo === 0) return [];
  return [{ currency: "USDT", value: saldo }];
}

export function InvestidorPainelCard({
  investidor,
  roi,
  deal,
  projetosCount = 0,
  onEdit,
  onDelete,
  onClick,
  onVerDetalhes,
}: InvestidorPainelCardProps) {
  const { canEdit, canDelete } = useActionAccess();

  // Entries multi-moeda
  const fiatEntries = getFiatExposureEntries(roi);
  const cryptoEntries = getCryptoExposureEntries(roi);

  const hasFiat = fiatEntries.length > 0;
  const hasCrypto = cryptoEntries.length > 0;
  const hasData = hasFiat || hasCrypto;

  // ROI consolidado via USD reference
  const totalAportes = Number(roi?.total_aportes_usd_ref) || 0;
  const totalLiquidacoes = Number(roi?.total_liquidacoes_usd_ref) || 0;
  const roiConsolidado = totalAportes > 0
    ? ((totalLiquidacoes - totalAportes) / totalAportes) * 100
    : 0;

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

      <CardContent className="p-4">
        {hasData ? (
          <div className="space-y-3">
            {/* Capital em Operação - Multi-moeda */}
            <div className="grid grid-cols-2 gap-3">
              {hasFiat && (
                <div className="bg-muted/20 rounded-lg p-3">
                  <div className="flex items-center gap-1.5 mb-1">
                    <DollarSign className="h-3 w-3 text-amber-500" />
                    <span className="text-[10px] font-medium text-muted-foreground uppercase">
                      FIAT
                    </span>
                  </div>
                  <NativeCurrencyKpi
                    entries={fiatEntries}
                    size="md"
                    variant="default"
                    className="font-mono"
                  />
                </div>
              )}
              {hasCrypto && (
                <div className="bg-muted/20 rounded-lg p-3">
                  <div className="flex items-center gap-1.5 mb-1">
                    <Bitcoin className="h-3 w-3 text-violet-500" />
                    <span className="text-[10px] font-medium text-muted-foreground uppercase">
                      CRYPTO
                    </span>
                  </div>
                  <NativeCurrencyKpi
                    entries={cryptoEntries}
                    size="md"
                    variant="default"
                    className="font-mono"
                  />
                </div>
              )}
              {/* Se só tem um tipo, mostra projetos no outro espaço */}
              {((hasFiat && !hasCrypto) || (!hasFiat && hasCrypto)) && (
                <div className="bg-muted/10 rounded-lg p-3 flex items-center justify-center">
                  <div className="text-center">
                    <div className="flex items-center gap-1.5 justify-center mb-1">
                      <FolderKanban className="h-3 w-3 text-muted-foreground" />
                      <span className="text-[10px] font-medium text-muted-foreground uppercase">
                        Projetos
                      </span>
                    </div>
                    <p className="text-lg font-bold text-foreground">
                      {projetosCount}
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* ROI e Projetos */}
            <div className="flex items-center justify-between pt-2">
              <Badge
                variant="outline"
                className={`font-mono text-sm px-3 py-1 ${
                  roiConsolidado > 0
                    ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/30"
                    : roiConsolidado < 0
                    ? "bg-destructive/10 text-destructive border-destructive/30"
                    : "bg-muted/20 text-muted-foreground border-muted/30"
                }`}
              >
                ROI: {roiConsolidado > 0 ? "+" : ""}{roiConsolidado.toFixed(1)}%
              </Badge>
              
              {hasFiat && hasCrypto && (
                <div className="flex items-center gap-1.5 text-muted-foreground">
                  <FolderKanban className="h-3.5 w-3.5" />
                  <span className="text-sm font-medium">{projetosCount} projetos</span>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="text-center py-4 text-muted-foreground text-sm">
            <p>Aguardando primeiro aporte</p>
          </div>
        )}
      </CardContent>

      <Separator className="bg-border/30" />

      {/* Actions Section */}
      <div className="p-3 bg-muted/10">
        <div className="flex justify-center gap-2">
          {onVerDetalhes && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="default" size="sm" onClick={onVerDetalhes}>
                  <Eye className="h-3.5 w-3.5 mr-1.5" />
                  Detalhes
                </Button>
              </TooltipTrigger>
              <TooltipContent>Ver Detalhes Completos</TooltipContent>
            </Tooltip>
          )}

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
