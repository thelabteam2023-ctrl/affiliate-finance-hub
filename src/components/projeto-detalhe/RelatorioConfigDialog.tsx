import { useState } from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { 
  FileText, 
  Download, 
  Calendar, 
  BarChart3,
  TrendingUp,
  Target,
  FileSpreadsheet,
  FileCode,
  Loader2,
  Users,
  Briefcase,
  Layers,
  Zap,
  Layout,
  Eye
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DateRange } from "react-day-picker";
import { DatePicker } from "@/components/ui/date-picker";
import { StandardPeriodFilter, getDateRangeFromPeriod } from "./StandardTimeFilter";
import { useAuth } from "@/hooks/useAuth";
import { exportRelatorioExecutivo } from "@/lib/relatorios/exportRelatorioExecutivo";
import { useProjetoResultado } from "@/hooks/useProjetoResultado";
import { useKpiBreakdowns } from "@/hooks/useKpiBreakdowns";
import { useProjetoCurrency } from "@/hooks/useProjetoCurrency";
import { useCotacoes } from "@/hooks/useCotacoes";
import { toast } from "sonner";
import { useProjetoHistoricoContas } from "@/hooks/useProjetoHistoricoContas";
import { ScrollArea } from "@/components/ui/scroll-area";

interface RelatorioConfigDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projetoId: string;
}

type RelatorioModelo = 'executivo' | 'financeiro' | 'operacional' | 'investidores';
type FormatoExportacao = 'pdf' | 'xlsx' | 'csv' | 'xml';

interface SecaoConfig {
  id: string;
  label: string;
  enabled: boolean;
  icon: any;
}

export function RelatorioConfigDialog({
  open,
  onOpenChange,
  projetoId,
}: RelatorioConfigDialogProps) {
  const { workspace } = useAuth();
  const [modelo, setModelo] = useState<RelatorioModelo>('executivo');
  const [formato, setFormato] = useState<FormatoExportacao>('pdf');
  const [period, setPeriod] = useState<StandardPeriodFilter>("mes_atual");
  const [customDateRange, setCustomDateRange] = useState<DateRange | undefined>(undefined);
  const [generating, setGenerating] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [secoes, setSecoes] = useState<SecaoConfig[]>([
    { id: 'resumo', label: 'Resumo Financeiro', enabled: true, icon: TrendingUp },
    { id: 'operacional', label: 'Indicadores Operacionais', enabled: true, icon: Zap },
    { id: 'modulos', label: 'Performance por Módulo', enabled: true, icon: Layers },
    { id: 'vinculos', label: 'Contribuição por Vínculo', enabled: false, icon: Users },
    { id: 'investidores', label: 'Performance por Investidor (CPF)', enabled: false, icon: Users },
    { id: 'casas', label: 'Performance por Casa', enabled: false, icon: Briefcase },
    { id: 'insights', label: 'Insights e Recomendações', enabled: true, icon: Target },
  ]);

  const { 
    convertToConsolidation, 
    convertToConsolidationOficial, 
    moedaConsolidacao, 
    cotacaoOficialUSD,
    formatCurrency,
    projeto
  } = useProjetoCurrency(projetoId);

  const dateRange = getDateRangeFromPeriod(period, customDateRange);

  const { resultado, loading: loadingResultado } = useProjetoResultado({
    projetoId,
    dataInicio: dateRange?.start,
    dataFim: dateRange?.end,
    convertToConsolidation,
    cotacaoKey: cotacaoOficialUSD,
  });

  const { breakdowns, loading: loadingBreakdowns } = useKpiBreakdowns({
    projetoId,
    dataInicio: dateRange?.start,
    dataFim: dateRange?.end,
    moedaConsolidacao,
    convertToConsolidation,
    convertToConsolidationOficial,
    cotacaoKey: cotacaoOficialUSD,
  });

  const historicoContas = useProjetoHistoricoContas(projetoId);

  const handleGenerate = async () => {
    if (!projeto || !workspace || !resultado) {
      toast.error("Dados do projeto não carregados");
      return;
    }

    setGenerating(true);
    try {
      if (formato === 'pdf') {
        await exportRelatorioExecutivo({
          projeto: {
            id: projetoId,
            nome: projeto.nome,
            tipo_projeto: projeto.tipo_projeto,
            status: projeto.status,
            moeda_consolidacao: moedaConsolidacao,
          },
          workspace: { nome: (workspace as any)?.name || (workspace as any)?.nome || "Workspace" },
          periodo: { de: dateRange?.start || null, ate: dateRange?.end || null },
          resultado,
          breakdowns,
          historicoContas,
          formatCurrency,
          config: {
            secoes: secoes.reduce((acc, s) => ({ ...acc, [s.id]: s.enabled }), {}),
          }
        });
        toast.success("Relatório gerado com sucesso!");
        onOpenChange(false);
      } else {
        // Para outros formatos, poderíamos integrar com a lógica de useExportApostas
        // mas o foco solicitado foi o Relatório do Projeto (PDF/Executivo)
        toast.info("Exportação para este formato será implementada em breve.");
      }
    } catch (error: any) {
      console.error("Erro ao gerar relatório:", error);
      toast.error("Erro ao gerar relatório: " + error.message);
    } finally {
      setGenerating(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={`sm:max-w-[${showPreview ? '900px' : '480px'}] transition-all duration-300 max-h-[90vh] overflow-hidden flex flex-col`}>
        <DialogHeader className="flex-shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-primary" />
            Configurar Relatório do Projeto
          </DialogTitle>
          <DialogDescription>
            Defina os parâmetros para a geração do relatório consolidado.
          </DialogDescription>
        </DialogHeader>

        <div className="flex gap-6 overflow-hidden flex-grow">
          <ScrollArea className={`${showPreview ? 'w-[300px]' : 'w-full'} flex-shrink-0 pr-4`}>
            <div className="grid gap-6 py-4">
          {/* Período */}
          <div className="space-y-3">
            <Label className="text-sm font-medium flex items-center gap-2">
              <Calendar className="h-4 w-4 text-muted-foreground" />
              Período de Análise
            </Label>
            <div className="grid grid-cols-2 gap-2">
              <Select value={period} onValueChange={(v: StandardPeriodFilter) => setPeriod(v)}>
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="Selecione o período" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="hoje">Hoje</SelectItem>
                  <SelectItem value="ontem">Ontem</SelectItem>
                  <SelectItem value="7dias">Últimos 7 dias</SelectItem>
                  <SelectItem value="30dias">Últimos 30 dias</SelectItem>
                  <SelectItem value="mes_atual">Mês Atual</SelectItem>
                  <SelectItem value="mes_anterior">Mês Anterior</SelectItem>
                  <SelectItem value="trimestre">Trimestre</SelectItem>
                  <SelectItem value="ano">Este Ano</SelectItem>
                  <SelectItem value="total">Todo o Período</SelectItem>
                  <SelectItem value="custom">Personalizado</SelectItem>
                </SelectContent>
              </Select>
              {period === "custom" && (
                <div className="flex items-center gap-2 w-full">
                  <DatePicker 
                    value={customDateRange?.from ? format(customDateRange.from, 'yyyy-MM-dd') : ''}
                    onChange={(d) => {
                      const date = d ? new Date(d + 'T12:00:00') : undefined;
                      setCustomDateRange(prev => ({ from: date, to: prev?.to }));
                    }}
                    placeholder="Início"
                  />
                  <DatePicker 
                    value={customDateRange?.to ? format(customDateRange.to, 'yyyy-MM-dd') : ''}
                    onChange={(d) => {
                      const date = d ? new Date(d + 'T12:00:00') : undefined;
                      setCustomDateRange(prev => ({ from: prev?.from, to: date }));
                    }}
                    placeholder="Fim"
                  />
                </div>
              )}
            </div>
          </div>

          {/* Modelo */}
          <div className="space-y-3">
            <Label className="text-sm font-medium flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-muted-foreground" />
              Modelo do Relatório
            </Label>
            <div className="grid grid-cols-1 gap-2">
              <div 
                className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${modelo === 'executivo' ? 'bg-primary/5 border-primary' : 'hover:bg-accent'}`}
                onClick={() => setModelo('executivo')}
              >
                <TrendingUp className={`h-5 w-5 mt-0.5 ${modelo === 'executivo' ? 'text-primary' : 'text-muted-foreground'}`} />
                <div>
                  <div className="text-sm font-medium">Relatório Executivo</div>
                  <div className="text-xs text-muted-foreground">Resumo financeiro, ROI e performance global.</div>
                </div>
              </div>
              <div 
                className={`flex items-start gap-3 p-3 rounded-lg border opacity-50 cursor-not-allowed`}
              >
                <Target className="h-5 w-5 mt-0.5 text-muted-foreground" />
                <div>
                  <div className="text-sm font-medium">Relatório Operacional (Em breve)</div>
                  <div className="text-xs text-muted-foreground">Detalhamento por esporte, casa e estratégias.</div>
                </div>
              </div>
            </div>
          </div>

          {/* Seleção de Seções */}
          <div className="space-y-3">
            <Label className="text-sm font-medium flex items-center gap-2">
              <Layout className="h-4 w-4 text-muted-foreground" />
              Conteúdo do Relatório
            </Label>
            <div className="grid grid-cols-1 gap-2 border rounded-lg p-3 bg-accent/5">
              {secoes.map((secao) => (
                <div key={secao.id} className="flex items-center justify-between py-1.5 first:pt-0 last:pb-0 border-b last:border-0 border-accent/20">
                  <div className="flex items-center gap-2">
                    <secao.icon className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm">{secao.label}</span>
                  </div>
                  <Checkbox 
                    checked={secao.enabled} 
                    onCheckedChange={(checked) => {
                      setSecoes(prev => prev.map(s => s.id === secao.id ? { ...s, enabled: !!checked } : s));
                    }} 
                  />
                </div>
              ))}
            </div>
          </div>

          {/* Formato */}
          <div className="space-y-3">
            <Label className="text-sm font-medium flex items-center gap-2">
              <Download className="h-4 w-4 text-muted-foreground" />
              Formato de Exportação
            </Label>
            <div className="grid grid-cols-4 gap-2">
              {[
                { id: 'pdf', label: 'PDF', icon: FileText, color: 'text-red-500' },
                { id: 'xlsx', label: 'Excel', icon: FileSpreadsheet, color: 'text-emerald-600' },
                { id: 'csv', label: 'CSV', icon: FileSpreadsheet, color: 'text-emerald-500' },
                { id: 'xml', label: 'XML', icon: FileCode, color: 'text-blue-500' }
              ].map((f) => (
                <div 
                  key={f.id}
                  className={`flex flex-col items-center justify-center p-2 rounded-lg border cursor-pointer transition-colors ${formato === f.id ? 'bg-primary/5 border-primary' : 'hover:bg-accent'}`}
                  onClick={() => setFormato(f.id as FormatoExportacao)}
                >
                  <f.icon className={`h-5 w-5 mb-1 ${f.color}`} />
                  <span className="text-[10px] font-medium">{f.label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={generating}>
            Cancelar
          </Button>
          <Button 
            onClick={handleGenerate} 
            disabled={generating || loadingResultado || !resultado}
            className="min-w-[120px]"
          >
            {generating ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Gerando...
              </>
            ) : (
              'Gerar Relatório'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
