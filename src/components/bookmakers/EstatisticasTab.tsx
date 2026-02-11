import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ShieldAlert, TrendingUp } from "lucide-react";
import { GlobalLimitationSection } from "./GlobalLimitationSection";
import { PerformancePorCasaSection } from "./PerformancePorCasaSection";

export function EstatisticasTab() {
  return (
    <Tabs defaultValue="limitacao" className="space-y-4">
      <TabsList className="grid w-full max-w-md grid-cols-2">
        <TabsTrigger value="limitacao" className="flex items-center gap-2 text-xs">
          <ShieldAlert className="h-3.5 w-3.5" />
          Limitação
        </TabsTrigger>
        <TabsTrigger value="performance" className="flex items-center gap-2 text-xs">
          <TrendingUp className="h-3.5 w-3.5" />
          Performance por Casa
        </TabsTrigger>
      </TabsList>

      <TabsContent value="limitacao" className="mt-0">
        <GlobalLimitationSection />
      </TabsContent>

      <TabsContent value="performance" className="mt-0">
        <PerformancePorCasaSection />
      </TabsContent>
    </Tabs>
  );
}
