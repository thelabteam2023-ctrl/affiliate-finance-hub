import { useState } from 'react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { AlertTriangle, ShieldAlert, BarChart3 } from 'lucide-react';
import { ProjetoOcorrenciasTab } from './ProjetoOcorrenciasTab';
import { LimitationSection } from './limitation/LimitationSection';
import { IncidentesEstatisticasTab } from './IncidentesEstatisticasTab';

interface ProjetoIncidentesTabProps {
  projetoId: string;
  onDataChange?: () => void;
  formatCurrency?: (value: number) => string;
}

export function ProjetoIncidentesTab({ projetoId, onDataChange, formatCurrency }: ProjetoIncidentesTabProps) {
  const [subTab, setSubTab] = useState<string>('ocorrencias');

  return (
    <div className="h-full flex flex-col">
      <Tabs value={subTab} onValueChange={setSubTab} className="flex-1 flex flex-col min-h-0">
        <div className="flex-shrink-0 px-1 pt-2">
          <TabsList className="h-9 bg-muted/50">
            <TabsTrigger value="ocorrencias" className="gap-1.5 text-xs">
              <AlertTriangle className="h-3.5 w-3.5" />
              Ocorrências
            </TabsTrigger>
            <TabsTrigger value="limitacoes" className="gap-1.5 text-xs">
              <ShieldAlert className="h-3.5 w-3.5" />
              Limitações
            </TabsTrigger>
            <TabsTrigger value="estatisticas" className="gap-1.5 text-xs">
              <BarChart3 className="h-3.5 w-3.5" />
              Estatísticas
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="ocorrencias" className="flex-1 m-0 min-h-0">
          <ProjetoOcorrenciasTab
            projetoId={projetoId}
            onDataChange={onDataChange}
            formatCurrency={formatCurrency}
          />
        </TabsContent>

        <TabsContent value="limitacoes" className="flex-1 m-0 min-h-0">
          <div className="h-full overflow-y-auto py-4 px-1">
            <div className="max-w-5xl mx-auto">
              <LimitationSection projetoId={projetoId} />
            </div>
          </div>
        </TabsContent>

        <TabsContent value="estatisticas" className="flex-1 m-0 min-h-0 overflow-y-auto">
          <IncidentesEstatisticasTab projetoId={projetoId} formatCurrency={formatCurrency} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
