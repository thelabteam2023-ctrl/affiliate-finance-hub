import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';

export const ExtracaoBonusContent: React.FC = () => {
  const [activeTab, setActiveTab] = useState('parametros');

  return (
    <div className="p-4 max-w-5xl mx-auto space-y-6">
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="parametros">Parâmetros</TabsTrigger>
          <TabsTrigger value="otimizador">Otimizador</TabsTrigger>
          <TabsTrigger value="simulacao">Simulação de Banca</TabsTrigger>
        </TabsList>
        
        <TabsContent value="parametros" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm uppercase text-muted-foreground">Parâmetros Globais</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Valor apostado nas casas ($)</Label>
                <Input type="number" defaultValue={200} />
              </div>
              <div className="space-y-2">
                <Label>Spread da exchange (%)</Label>
                <Input type="number" step="0.1" defaultValue={3.0} />
              </div>
            </CardContent>
          </Card>
        </TabsContent>
        
        <TabsContent value="otimizador">
          <Card>
            <CardContent className="p-6 text-center text-muted-foreground">Módulo Otimizador em construção.</CardContent>
          </Card>
        </TabsContent>
        
        <TabsContent value="simulacao">
          <Card>
            <CardContent className="p-6 text-center text-muted-foreground">Módulo Simulação em construção.</CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};
