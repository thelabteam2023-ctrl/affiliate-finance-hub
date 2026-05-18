import sys

file_path = 'src/components/ferramentas/CalculadoraHedgeProbabilisticaContent.tsx'
with open(file_path, 'r') as f:
    lines = f.readlines()

start_idx = -1
for i, line in enumerate(lines):
    if ') : (' in line and 'activeTab === \'calculadora\'' in lines[i-1]:
        start_idx = i
        break

if start_idx == -1:
    # Try alternate match based on current content
    for i, line in enumerate(lines):
        if ') : (' in line and i > 500:
            start_idx = i
            break

if start_idx == -1:
    print("Start point not found")
    sys.exit(1)

end_idx = -1
for i in range(start_idx, len(lines)):
    if ')}' in lines[i] and '</div>' in lines[i+1] and ')}' in lines[i+2]: # Matching outer block
         # No, lines 1540-1543 in view show:
         # 1540:                </div>
         # 1541:              </div>
         # 1542:             )}
         # 1543:          </div>
         pass
    if ')}' in lines[i] and '</div>' in lines[i+1] and 'Dialog' in lines[i+3]:
        end_idx = i
        break

if end_idx == -1:
    # Fallback to hardcoded safe line if possible
    end_idx = 1542

new_content = lines[:start_idx+1]
new_content.append('             <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>\n')
new_content.append('               <SortableContext items={labLayout} strategy={rectSortingStrategy}>\n')
new_content.append('                 <div className="grid grid-cols-1 md:grid-cols-3 gap-6 auto-rows-min">\n')
new_content.append('                   {labLayout.map((layoutId) => {\n')

dynamic_blocks = """
                     if (layoutId === 'visual-sim') return (
                       <SortableCard key={layoutId} id={layoutId}>
                         <Card className="bg-emerald-500/5 border-emerald-500/20 overflow-hidden h-full">
                           <div className="bg-emerald-500/10 px-4 py-2 border-b border-emerald-500/20">
                             <h4 className="text-[10px] font-bold uppercase tracking-wider text-emerald-400 flex items-center gap-2">
                               <CheckCircle2 className="h-3 w-3" /> Simulação Visual
                             </h4>
                           </div>
                           <CardContent className="pt-4 space-y-4">
                             <div className="flex items-end gap-1 h-24 mb-6 items-baseline">
                               {monteCarloSim.samples.map((s, i) => {
                                 const height = Math.min(100, Math.max(20, (Math.abs(s) / Math.max(metrics.allWonProfit, Math.abs(metrics.maxDrawdown))) * 100));
                                 return (
                                   <div key={i} className={`flex-1 rounded-t-sm transition-all cursor-help relative group ${s >= 0 ? 'bg-emerald-500/40 hover:bg-emerald-400' : 'bg-red-500/40 hover:bg-red-400'}`} style={{ height: `${height}%` }} />
                                 );
                               })}
                             </div>
                             <p className="text-[10px] text-muted-foreground italic border-t border-border/40 pt-2">Amostra da variância em 10 ciclos.</p>
                           </CardContent>
                         </Card>
                       </SortableCard>
                     );
                     if (layoutId === 'double-bankroll') return (
                       <SortableCard key={layoutId} id={layoutId}>
                         <div className="p-4 rounded-lg bg-orange-500/5 border border-orange-500/20 space-y-3 h-full flex flex-col justify-center">
                           <div className="flex items-center gap-2">
                             <TrendingUp className="h-4 w-4 text-orange-400" />
                             <h4 className="text-xs font-bold uppercase tracking-wider text-orange-400">Projeção: Dobra</h4>
                           </div>
                           <div className="grid grid-cols-2 gap-4">
                             <div className="space-y-1">
                               <span className="text-[9px] text-muted-foreground uppercase">Eventos</span>
                               <p className="text-lg font-bold text-white font-mono">{monteCarloSim.medianSteps}</p>
                             </div>
                             <div className="space-y-1 text-right">
                               <span className="text-[9px] text-muted-foreground uppercase">Prob. Sucesso</span>
                               <p className={`text-lg font-bold font-mono ${monteCarloSim.probDouble > 70 ? 'text-emerald-400' : 'text-orange-400'}`}>{fmtPct(monteCarloSim.probDouble)}</p>
                             </div>
                           </div>
                         </div>
                       </SortableCard>
                     );
                     if (layoutId === 'lab-params') return (
                       <SortableCard key={layoutId} id={layoutId}>
                         <Card className="h-full">
                           <CardHeader>
                             <CardTitle className="text-sm font-medium flex items-center gap-2">
                               <Coins className="h-4 w-4 text-primary" /> Parâmetros do Laboratório
                             </CardTitle>
                           </CardHeader>
                           <CardContent className="space-y-4">
                             <div className="space-y-3">
                               <Label className="text-[10px] uppercase font-bold text-muted-foreground">Benchmark</Label>
                               <Tabs value={labBenchmark} onValueChange={(val) => { setLabBenchmark(val); if (val !== 'custom') setTargetExtraction(Number(val) / 100); }} className="w-full">
                                 <TabsList className="grid grid-cols-4 h-9 w-full">
                                   <TabsTrigger value="65" className="text-[10px]">65%</TabsTrigger>
                                   <TabsTrigger value="70" className="text-[10px]">70%</TabsTrigger>
                                   <TabsTrigger value="75" className="text-[10px]">75%</TabsTrigger>
                                   <TabsTrigger value="custom" className="text-[10px]">Livre</TabsTrigger>
                                 </TabsList>
                               </Tabs>
                             </div>
                             <div className="space-y-2">
                               <Label className="text-[10px] uppercase font-bold text-primary">Banca Exchange</Label>
                               <div className="relative">
                                 <Input type="number" value={bankroll} onChange={(e) => setBankroll(Number(e.target.value))} className="h-10 pl-8 font-mono text-sm" />
                                 <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground font-mono">R$</span>
                               </div>
                             </div>
                           </CardContent>
                         </Card>
                       </SortableCard>
                     );
                     if (layoutId === 'advanced-stats') return (
                       <SortableCard key={layoutId} id={layoutId}>
                         <Card className="bg-primary/5 border-primary/20 h-full">
                           <CardHeader className="pb-2">
                             <CardTitle className="text-sm font-medium flex items-center gap-2">
                               <Sparkles className="h-4 w-4 text-primary" /> Estatísticas Avançadas
                             </CardTitle>
                           </CardHeader>
                           <CardContent className="space-y-3">
                             <div className="p-2 rounded-lg bg-background/40 border border-border/40 flex justify-between items-center">
                               <span className="text-[10px] uppercase font-bold text-muted-foreground">10 Greens</span>
                               <span className="text-sm font-bold font-mono text-emerald-400">{fmtPct(advancedStats.prob10Greens * 100)}</span>
                             </div>
                             <div className="p-2 rounded-lg bg-background/40 border border-border/40 flex justify-between items-center">
                               <span className="text-[10px] uppercase font-bold text-muted-foreground">10 Reds</span>
                               <span className="text-sm font-bold font-mono text-red-400">{(advancedStats.prob10Reds * 100).toFixed(4)}%</span>
                             </div>
                           </CardContent>
                         </Card>
                       </SortableCard>
                     );
                     if (layoutId === 'efficiency-matrix') return (
                       <SortableCard key={layoutId} id={layoutId}>
                         <Card className="border-primary/20 bg-primary/5 h-full">
                           <CardHeader className="pb-2 text-center">
                             <CardTitle className="text-[10px] font-medium flex items-center justify-center gap-2">
                               <BrainCircuit className="h-3 w-3 text-primary" /> Matriz de Eficiência
                             </CardTitle>
                           </CardHeader>
                           <CardContent className="p-2">
                             <div className="grid grid-cols-7 gap-1">
                               <div className="text-[6px] text-muted-foreground font-bold flex items-center justify-center">O\\E</div>
                               {[0.60, 0.65, 0.70, 0.75, 0.80].map(t => <div key={t} className="text-[6px] text-muted-foreground font-mono text-center">{Math.round(t*100)}%</div>)}
                               {[1.5, 2.0, 2.5, 3.0, 3.5, 4.0].map(odd => (
                                 <React.Fragment key={odd}>
                                   <div className="text-[6px] text-muted-foreground font-mono flex items-center justify-center bg-muted/20 rounded">{odd.toFixed(1)}</div>
                                   {[0.60, 0.65, 0.70, 0.75, 0.80].map(target => {
                                      const cell = heatmapData.find(d => d.target === target && d.odd === odd);
                                      const score = cell?.score || 0;
                                      const isValid = cell?.isValid;
                                      return <div key={`${target}-${odd}`} className={`aspect-square rounded-[1px] flex items-center justify-center text-[5px] font-mono border border-white/5 ${isValid ? (score > 5 ? 'bg-emerald-500/30' : 'bg-blue-500/20') : 'bg-red-500/5'}`}>{isValid ? score.toFixed(0) : 'X'}</div>
                                   })}
                                 </React.Fragment>
                               ))}
                             </div>
                           </CardContent>
                         </Card>
                       </SortableCard>
                     );
                     if (layoutId === 'risk-ruin') return (
                       <SortableCard key={layoutId} id={layoutId}>
                         <Card className="border-l-4 border-l-red-500 h-full">
                           <CardHeader className="pb-1">
                             <CardTitle className="text-xs font-medium flex items-center gap-2 text-red-400">
                               <ShieldAlert className="h-4 w-4" /> Risco de Ruína
                             </CardTitle>
                           </CardHeader>
                           <CardContent>
                             <div className="text-xl font-bold font-mono">{fmtPct(riskOfRuin)}</div>
                             <div className="mt-1 w-full h-1 bg-muted rounded-full overflow-hidden">
                               <div className={`h-full ${riskOfRuin > 10 ? 'bg-red-500' : 'bg-emerald-500'}`} style={{ width: `${riskOfRuin}%` }} />
                             </div>
                           </CardContent>
                         </Card>
                       </SortableCard>
                     );
                     if (layoutId === 'capital-efficiency') return (
                       <SortableCard key={layoutId} id={layoutId}>
                         <Card className="border-l-4 border-l-emerald-500 h-full">
                           <CardHeader className="pb-1">
                             <CardTitle className="text-xs font-medium flex items-center gap-2 text-emerald-400">
                               <BrainCircuit className="h-4 w-4" /> Eficiência
                             </CardTitle>
                           </CardHeader>
                           <CardContent>
                             <div className="text-xl font-bold font-mono">{fmtPct((metrics.maxResponsibility / bankroll) * 100)}</div>
                             <p className="text-[8px] text-muted-foreground mt-1">Uso da banca (R$ {fmt(metrics.maxResponsibility)})</p>
                           </CardContent>
                         </Card>
                       </SortableCard>
                     );
                     if (layoutId === 'lab-details') return (
                       <SortableCard key={layoutId} id={layoutId}>
                         <Card className="h-full">
                           <CardHeader className="pb-1">
                             <CardTitle className="text-xs font-medium flex items-center gap-2">
                               <Dna className="h-4 w-4 text-primary" /> Dados do Lab
                             </CardTitle>
                           </CardHeader>
                           <CardContent className="space-y-1">
                              <div className="p-1 bg-muted/20 rounded border border-border/50 text-[9px]">
                                 Lucro Médio: <span className="font-bold text-emerald-400">R$ {fmt(monteCarloSim.avgResult)}</span>
                              </div>
                              <div className="p-1 bg-muted/20 rounded border border-border/50 text-[9px]">
                                 Win Rate: <span className="font-bold text-blue-400">{fmtPct(monteCarloSim.winRate * 100)}</span>
                              </div>
                           </CardContent>
                         </Card>
                       </SortableCard>
                     );
                     if (layoutId === 'golden-library') return (
                       <SortableCard key={layoutId} id={layoutId}>
                         <Card className="h-full border-dashed">
                           <CardHeader className="pb-1">
                             <CardTitle className="text-xs font-medium flex items-center gap-2">
                               <Trophy className="h-4 w-4 text-yellow-400" /> Biblioteca
                             </CardTitle>
                           </CardHeader>
                           <CardContent>
                             <p className="text-[9px] text-muted-foreground leading-tight">Sugestões otimizadas para seu benchmark de {Math.round(targetExtraction * 100)}%.</p>
                           </CardContent>
                         </Card>
                       </SortableCard>
                     );
                     return null;
"""
new_content.append(dynamic_blocks)
new_content.append('                   })}\n')
new_content.append('                 </div>\n')
new_content.append('               </SortableContext>\n')
new_content.append('             </DndContext>\n')
new_content.append('            )}\n')

# Jump exactly to the line after 1542
rest_of_file = lines[end_idx+1:]
new_content.extend(rest_of_file)

with open(file_path, 'w') as f:
    f.writelines(new_content)
