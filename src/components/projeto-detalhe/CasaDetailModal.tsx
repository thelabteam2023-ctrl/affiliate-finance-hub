import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Building2, Users, TrendingUp, BarChart3, Percent, Zap } from "lucide-react";

interface VinculoData {
  vinculo: string;
  apostas: number;
  volume: number;
  lucro: number;
  roi: number;
}

interface CasaDetailData {
  casa: string;
  apostas: number;
  volume: number;
  lucro: number;
  roi: number;
  vinculos: VinculoData[];
  moeda?: string;
}

interface CasaDetailModalProps {
  casa: CasaDetailData | null;
  onClose: () => void;
  logoUrl?: string | null;
  formatValue: (value: number) => string;
}

export function CasaDetailModal({ casa, onClose, logoUrl, formatValue }: CasaDetailModalProps) {
  if (!casa) return null;

  const mediaPerConta = casa.vinculos.length > 0 ? casa.volume / casa.vinculos.length : 0;

  return (
    <Dialog open={!!casa} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-lg p-0 gap-0 overflow-hidden border-border/50">
        {/* Header */}
        <div className="px-5 pt-5 pb-4">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-xl bg-muted/50 border border-border/50 flex items-center justify-center overflow-hidden shrink-0">
                {logoUrl ? (
                  <img src={logoUrl} alt={casa.casa} className="w-9 h-9 object-contain" />
                ) : (
                  <Building2 className="w-5 h-5 text-muted-foreground" />
                )}
              </div>
              <div>
                <span className="uppercase tracking-wide">{casa.casa}</span>
                <p className="text-xs text-muted-foreground font-normal mt-0.5">
                  {casa.vinculos.length} {casa.vinculos.length === 1 ? 'conta' : 'contas'} · {casa.apostas} apostas
                </p>
              </div>
            </DialogTitle>
          </DialogHeader>
        </div>

        {/* KPI Cards */}
        <div className="px-5 pb-4">
          <div className="grid grid-cols-2 gap-2.5">
            {/* Volume */}
            <div className="rounded-xl border border-border/40 bg-muted/20 p-3.5 flex items-start justify-between">
              <div>
                <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-medium">Volume</p>
                <p className="text-base font-bold tabular-nums mt-1.5 text-foreground">{formatValue(casa.volume)}</p>
              </div>
              <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                <TrendingUp className="h-4 w-4 text-primary" />
              </div>
            </div>

            {/* Média/Conta */}
            <div className="rounded-xl border border-border/40 bg-muted/20 p-3.5 flex items-start justify-between">
              <div>
                <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-medium">Média/Conta</p>
                <p className="text-base font-bold tabular-nums mt-1.5 text-foreground">{formatValue(mediaPerConta)}</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">{casa.vinculos.length} contas</p>
              </div>
              <div className="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center shrink-0">
                <BarChart3 className="h-4 w-4 text-blue-400" />
              </div>
            </div>

            {/* Lucro */}
            <div className="rounded-xl border border-border/40 bg-muted/20 p-3.5 flex items-start justify-between">
              <div>
                <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-medium">Lucro</p>
                <p className={`text-base font-bold tabular-nums mt-1.5 ${casa.lucro >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                  {casa.lucro >= 0 ? '+' : ''}{formatValue(casa.lucro)}
                </p>
              </div>
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${casa.lucro >= 0 ? 'bg-emerald-500/10' : 'bg-red-500/10'}`}>
                <Zap className={`h-4 w-4 ${casa.lucro >= 0 ? 'text-emerald-400' : 'text-red-400'}`} />
              </div>
            </div>

            {/* ROI */}
            <div className="rounded-xl border border-border/40 bg-muted/20 p-3.5 flex items-start justify-between">
              <div>
                <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-medium">ROI</p>
                <p className={`text-base font-bold tabular-nums mt-1.5 ${casa.roi >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                  {casa.roi >= 0 ? '+' : ''}{casa.roi.toFixed(2)}%
                </p>
              </div>
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${casa.roi >= 0 ? 'bg-emerald-500/10' : 'bg-red-500/10'}`}>
                <Percent className={`h-4 w-4 ${casa.roi >= 0 ? 'text-emerald-400' : 'text-red-400'}`} />
              </div>
            </div>
          </div>
        </div>

        {/* Detalhamento por conta */}
        <div className="border-t border-border/40 px-5 py-4">
          <div className="flex items-center gap-1.5 mb-3">
            <Users className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-xs font-medium text-muted-foreground">Detalhamento por conta</span>
          </div>

          <div className="rounded-lg border border-border/30 overflow-hidden">
            {/* Table header */}
            <div className="grid grid-cols-[1fr_45px_90px_80px_55px] gap-x-2 px-3 py-2 bg-muted/30 text-[10px] text-muted-foreground uppercase tracking-wider font-medium">
              <span>Conta</span>
              <span className="text-center">Qtd</span>
              <span className="text-right">Volume</span>
              <span className="text-right">Lucro</span>
              <span className="text-right">ROI</span>
            </div>

            {/* Table rows */}
            {casa.vinculos.map((v, idx) => {
              const vRoiColor = v.roi >= 0 ? "text-emerald-500" : "text-red-500";
              const vLucroColor = v.lucro >= 0 ? "text-emerald-500" : "text-red-500";
              const volumeShare = casa.volume > 0 ? ((v.volume / casa.volume) * 100).toFixed(0) : "0";
              return (
                <div
                  key={v.vinculo}
                  className={`grid grid-cols-[1fr_45px_90px_80px_55px] gap-x-2 px-3 py-2.5 items-center ${
                    idx < casa.vinculos.length - 1 ? 'border-b border-border/20' : ''
                  } hover:bg-muted/20 transition-colors`}
                >
                  <div className="flex flex-col min-w-0">
                    <span className="text-xs font-medium truncate">{v.vinculo}</span>
                    <span className="text-[9px] text-muted-foreground">{volumeShare}% do volume</span>
                  </div>
                  <span className="text-center text-xs text-muted-foreground tabular-nums">{v.apostas}</span>
                  <span className="text-right text-xs font-medium tabular-nums">{formatValue(v.volume)}</span>
                  <span className={`text-right text-xs font-medium tabular-nums ${vLucroColor}`}>
                    {v.lucro >= 0 ? '+' : ''}{formatValue(v.lucro)}
                  </span>
                  <span className={`text-right text-xs font-semibold tabular-nums ${vRoiColor}`}>
                    {v.roi >= 0 ? '+' : ''}{v.roi.toFixed(1)}%
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
