import sys

def fix_file():
    with open('src/components/ferramentas/CalculadoraHedgeProbabilisticaContent.tsx', 'r') as f:
        content = f.read()

    # Identificar o ponto onde os erros começam (div md:col-span-2)
    marker = '<div className="md:col-span-2 space-y-6">'
    if marker not in content:
        print("Marker not found")
        return

    parts = content.split(marker)
    header = parts[0] + marker
    
    # Encontrar o final do arquivo que queremos preservar (Dialogs)
    dialog_marker = '<Dialog open={!!expanded}'
    if dialog_marker not in parts[1]:
        print("Dialog marker not found")
        return
    
    dialog_part = parts[1].split(dialog_marker)
    footer = dialog_marker + dialog_part[1]

    # Reconstruir o conteúdo central modularizado
    main_sections = """
                    {/* Fixed Top Metrics */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <Card className="border-l-4 border-l-red-500">
                        <CardHeader className="pb-2">
                          <CardTitle className="text-xs font-medium flex items-center gap-2 text-red-400">
                            <ShieldAlert className="h-4 w-4" /> Risco de Ruína
                          </CardTitle>
                        </CardHeader>
                        <CardContent>
                          <div className="text-2xl font-bold font-mono">
                            {fmtPct(riskOfRuin)}
                          </div>
                          <p className="text-[10px] text-muted-foreground mt-1">
                            Probabilidade de quebrar a banca com esta configuração no longo prazo.
                          </p>
                          <div className="mt-3 w-full h-2 bg-muted rounded-full overflow-hidden">
                            <div 
                              className={`h-full transition-all duration-500 ${riskOfRuin > 10 ? 'bg-red-500' : 'bg-emerald-500'}`}
                              style={{ width: `${riskOfRuin}%` }}
                            />
                          </div>
                        </CardContent>
                      </Card>
  
                      <Card className="border-l-4 border-l-emerald-500">
                        <CardHeader className="pb-2">
                          <CardTitle className="text-xs font-medium flex items-center gap-2 text-emerald-400">
                            <BrainCircuit className="h-4 w-4" /> Eficiência de Capital
                          </CardTitle>
                        </CardHeader>
                        <CardContent>
                          <div className="text-2xl font-bold font-mono text-white">
                            {fmtPct((metrics.maxResponsibility / bankroll) * 100)}
                          </div>
                          <p className="text-[10px] text-muted-foreground mt-1">
                            Uso da banca disponível (R$ {fmt(metrics.maxResponsibility)} utilizados).
                          </p>
                        </CardContent>
                      </Card>
                    </div>
 
                    {/* Draggable Main Sections */}
                    <DndContext 
                      sensors={sensors}
                      collisionDetection={closestCenter}
                      onDragEnd={handleMainDragEnd}
                      modifiers={[restrictToVerticalAxis]}
                    >
                      <SortableContext 
                        items={mainLayout}
                        strategy={verticalListSortingStrategy}
                      >
                        <div className="space-y-6">
                          {mainLayout.map((id) => (
                            <SortableLabCard key={id} id={id}>
                              {id === 'simulation-lab' && (
                                <Card>
                                  <CardHeader>
                                    <CardTitle className="text-sm font-medium flex items-center gap-2">
                                      <Dna className="h-4 w-4 text-primary" /> Laboratório de Simulação e Dados
                                    </CardTitle>
                                  </CardHeader>
                                  <CardContent className="space-y-6">
                                    <div className="p-4 rounded-lg bg-muted/30 border border-border/50 space-y-4">
                                      <div className="flex items-center gap-2 mb-2">
                                        <History className="h-4 w-4 text-primary" />
                                        <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Como chegamos neste Risco?</h4>
                                      </div>
                                      <div className="text-xs space-y-2 leading-relaxed">
                                        <p>
                                          O Risco de Ruína ({fmtPct(riskOfRuin)}) é calculado via <strong>Simulação de Trajetória</strong> (Monte Carlo).
                                        </p>
                                        <div className="bg-background/50 p-3 rounded font-mono text-[9px] border border-border/40 leading-relaxed text-muted-foreground">
                                          Diferente de fórmulas estáticas, simulamos 5.000 jornadas reais. O risco aumenta drasticamente se a exposição (R$ {fmt(metrics.maxResponsibility)}) for alta em relação à banca (R$ {fmt(bankroll)}).
                                        </div>
                                        <div className="space-y-4">
                                          <p className="text-muted-foreground italic border-l-2 border-primary/30 pl-3">
                                            A ruína ocorre quando a banca cai para R$ 0 ou se torna insuficiente para cobrir a responsabilidade de R$ {fmt(metrics.maxResponsibility)}.
                                          </p>

                                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                            <div className="p-3 bg-muted/20 rounded-md border border-border/50">
                                              <h5 className="text-[10px] font-bold uppercase mb-1 text-primary flex items-center gap-1">
                                                <Zap className="h-3 w-3" /> Dinâmica de EV
                                              </h5>
                                              <p className="text-[9px] text-muted-foreground leading-tight">
                                                {metrics.totalEV > 0 
                                                  ? "O lucro esperado é positivo, mas a exposição agressiva pode forçar a quebra antes da lei dos grandes números atuar." 
                                                  : "O lucro esperado é negativo. Mesmo com sorte no curto prazo, a quebra é matematicamente garantida no infinito."}
                                              </p>
                                            </div>
                                            <div className="p-3 bg-muted/20 rounded-md border border-border/50">
                                              <h5 className="text-[10px] font-bold uppercase mb-1 text-primary flex items-center gap-1">
                                                <RefreshCcw className="h-3 w-3" /> Regra de Saques
                                              </h5>
                                              <p className="text-[9px] text-muted-foreground leading-tight">
                                                {simMode === 'accumulative' 
                                                  ? "Baseada em Banca Fechada: todos os lucros retornam para o capital de giro (juros compostos)." 
                                                  : `Baseada em Banca Fixa: o crescimento é limitado a ${bankrollCeilingMultiplier}x o inicial, simulando saques regulares.`}
                                              </p>
                                            </div>
                                          </div>
                                          
                                          <div className={`p-3 border rounded-md ${monteCarloSim.riskOfRuin10 > 5 ? 'bg-red-500/10 border-red-500/20' : 'bg-muted/30 border-border/50'}`}>
                                            <h5 className={`text-[10px] font-bold uppercase mb-2 flex items-center gap-2 ${monteCarloSim.riskOfRuin10 > 5 ? 'text-red-400' : 'text-muted-foreground'}`}>
                                              <ShieldAlert className="h-3 w-3" /> Horizonte de Curto Prazo (10 Bilhetes)
                                            </h5>
                                            <div className="flex justify-between items-center">
                                              <span className="text-[10px] text-muted-foreground">Prob. de Quebra (Próx. 10):</span>
                                              <span className={`text-sm font-bold ${monteCarloSim.riskOfRuin10 > 5 ? 'text-red-400' : 'text-white'}`}>
                                                {fmtPct(monteCarloSim.riskOfRuin10)}
                                              </span>
                                            </div>
                                            {monteCarloSim.riskOfRuin10 > 5 && (
                                              <p className="text-[9px] text-red-400/80 mt-1 leading-tight">
                                                ⚠️ Perigo: Exposição de {((metrics.maxResponsibility / bankroll) * 100).toFixed(1)}% da banca é crítica para o curto prazo.
                                              </p>
                                            )}
                                          </div>
                                        </div>
                                      </div>
                                    </div>

                                    <div className="space-y-4">
                                      <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-2">
                                          <LineChart className="h-4 w-4 text-emerald-400" />
                                          <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Simulação Real (100.000 Trajetórias)</h4>
                                        </div>
                                        <Badge variant="outline" className="text-[9px] text-emerald-400 border-emerald-500/30">
                                          Monte Carlo Run
                                        </Badge>
                                      </div>

                                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                                        <div className="p-3 rounded-lg bg-muted/20 border border-border/50 text-center">
                                          <span className="text-[9px] text-muted-foreground block mb-1">Lucro Médio</span>
                                          <span className="text-sm font-bold text-emerald-400">R$ {fmt(monteCarloSim.avgResult)}</span>
                                        </div>
                                        <div className="p-3 rounded-lg bg-muted/20 border border-border/50 text-center">
                                          <span className="text-[9px] text-muted-foreground block mb-1">Taxa de Sucesso</span>
                                          <span className="text-sm font-bold text-blue-400">{fmtPct(monteCarloSim.winRate * 100)}</span>
                                        </div>
                                        <div className="p-3 rounded-lg bg-muted/20 border border-border/50 text-center">
                                          <span className="text-[9px] text-muted-foreground block mb-1">Quebras (Banca)</span>
                                          <span className="text-sm font-bold text-red-400">{monteCarloSim.bankruptcies}</span>
                                        </div>
                                        <div className="p-3 rounded-lg bg-muted/20 border border-border/50 text-center">
                                          <span className="text-[9px] text-muted-foreground block mb-1">Total Ciclos</span>
                                          <span className="text-sm font-bold text-white">100.000</span>
                                        </div>
                                      </div>

                                      <div className="space-y-3 bg-muted/20 p-3 rounded-lg border border-border/50">
                                        <div className="flex justify-between items-center">
                                          <p className="text-[10px] font-bold text-muted-foreground uppercase">
                                            Amostra Sequencial (10 Ciclos)
                                          </p>
                                          <div className="text-[10px] font-mono text-white">
                                            Total: <span className={monteCarloSim.samples.reduce((a, b) => a + b, 0) >= 0 ? 'text-emerald-400' : 'text-red-400'}>
                                              R$ {fmt(monteCarloSim.samples.reduce((a, b) => a + b, 0))}
                                            </span>
                                          </div>
                                        </div>
                                        <div className="grid grid-cols-5 gap-1.5">
                                          {Array.from({ length: 10 }).map((_, i) => {
                                            const s = monteCarloSim.samples[i];
                                            const exists = s !== undefined;
                                            return (
                                              <div 
                                                key={i} 
                                                className={`text-[9px] py-1 rounded text-center font-mono border transition-all ${
                                                  !exists 
                                                    ? 'bg-muted/10 border-border/20 text-muted-foreground/30' 
                                                    : s >= 0 
                                                      ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20 shadow-[0_0_8px_rgba(16,185,129,0.05)]' 
                                                      : 'bg-red-500/10 text-red-400 border-red-500/20 shadow-[0_0_8px_rgba(239,68,68,0.05)]'
                                                }`}
                                              >
                                                {exists ? `R$ ${fmt(s)}` : '---'}
                                              </div>
                                            );
                                          })}
                                        </div>
                                        <p className="text-[8px] text-muted-foreground italic leading-tight text-center">
                                          Simulação de uma jornada real de 10 operações consecutivas.
                                        </p>
                                      </div>
                                    </div>
                                  </CardContent>
                                </Card>
                              )}

                              {id === 'operational-profile' && (
                                <Card className="bg-muted/10 border-border/50 shadow-none overflow-hidden">
                                  <div className="p-4 border-b border-border/50 bg-muted/20 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                                    <div>
                                      <div className="flex items-center gap-2">
                                        <Sparkles className="h-4 w-4 text-primary" />
                                        <h3 className="text-xs font-bold text-white uppercase tracking-wider">Perfil Operacional Ativo</h3>
                                        <Badge variant="outline" className="text-[9px] h-4 text-primary border-primary/30">
                                          Meta: {Math.round(targetExtraction * 100)}%
                                        </Badge>
                                      </div>
                                      <p className="text-[10px] text-muted-foreground mt-1">
                                        Visão dos mil primeiros ciclos (Simulação de 100.000) operando com ROI de {fmtPct(metrics.totalROI)}.
                                      </p>
                                    </div>
                                    <div className="flex gap-4">
                                      <div className="text-right">
                                        <div className="flex items-center justify-end gap-1">
                                          <span className="text-[9px] text-muted-foreground uppercase block">ROE p/ Ciclo</span>
                                          <CardInfoTooltip 
                                            title="ROE — Return on Exposure" 
                                            description="Retorno esperado por ciclo sobre o capital máximo travado em Lays na Exchange. Diferença vs ROI: o ROI mede o lucro sobre o valor da freebet; o ROE mede o lucro sobre o dinheiro real que fica preso na Exchange."
                                          />
                                        </div>
                                        <span className="text-xs font-bold text-emerald-400">+{((metrics.totalEV / metrics.maxResponsibility) * 100).toFixed(2)}%</span>
                                      </div>
                                      <div className="text-right border-l border-border/50 pl-4">
                                        <span className="text-[9px] text-muted-foreground uppercase block">Exposição</span>
                                        <span className="text-xs font-bold text-orange-400">{fmtPct((metrics.maxResponsibility / bankroll) * 100)}</span>
                                      </div>
                                    </div>
                                  </div>
                                  <CardContent className="p-0 h-[220px] w-full relative">
                                    <ResponsiveContainer width="100%" height="100%">
                                      <AreaChart data={longTermSim} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                                        <defs>
                                          <linearGradient id="colorBalance" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%" stopColor="#10b981" stopOpacity={0.3}/>
                                            <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                                          </linearGradient>
                                        </defs>
                                        <CartesianGrid strokeDasharray="3 3" stroke="#2a2a2a" vertical={false} />
                                        <XAxis 
                                          dataKey="cycle" 
                                          hide={true} 
                                        />
                                        <YAxis 
                                          domain={["auto", "auto"]}
                                          tick={{ fontSize: 9, fill: "#666" }}
                                          tickFormatter={(value) => `R$ ${value >= 1000 ? (value/1000).toFixed(1) + "k" : value}`}
                                          axisLine={false}
                                          tickLine={false}
                                        />
                                        <RechartsTooltip 
                                          contentStyle={{ backgroundColor: "#1a1a1a", border: "1px solid #333", borderRadius: "4px", fontSize: "10px" }}
                                          labelStyle={{ color: "#666" }}
                                          itemStyle={{ color: "#10b981" }}
                                          formatter={(value: number) => [`R$ ${fmt(Number(value))}`, "Banca"]}
                                          labelFormatter={(label) => `Ciclo: ${label.toLocaleString()}`}
                                        />
                                        <Area 
                                          type="monotone" 
                                          dataKey="balance" 
                                          stroke="#10b981" 
                                          fillOpacity={1} 
                                          fill="url(#colorBalance)" 
                                          strokeWidth={2}
                                        />
                                      </AreaChart>
                                    </ResponsiveContainer>
                                    {longTermSim[longTermSim.length - 1].balance <= 0 && (
                                      <div className="absolute inset-0 flex items-center justify-center bg-background/60 backdrop-blur-[1px]">
                                        <div className="bg-red-500/10 border border-red-500/20 p-2 rounded flex items-center gap-2">
                                          <AlertTriangle className="h-3 w-3 text-red-500" />
                                          <span className="text-[10px] font-bold text-red-500 uppercase tracking-tighter">Banca Insuficiente no Longo Prazo</span>
                                        </div>
                                      </div>
                                    )}
                                  </CardContent>
                                </Card>
                              )}

                              {id === 'golden-library' && (
                                <Card>
                                  <CardContent className="pt-6">
                                    <div className="space-y-4">
                                      <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-2">
                                          <Trophy className="h-4 w-4 text-yellow-400" />
                                          <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Biblioteca de Ouro</h4>
                                        </div>
                                        <div className="flex gap-1">
                                          {[2.8, 3.0, 4.8, 6.0].map((c) => (
                                            <Button 
                                              key={c}
                                              variant={commission === c ? "default" : "outline"}
                                              size="sm"
                                              className="h-6 text-[9px] px-2"
                                              onClick={() => setCommission(c)}
                                            >
                                              {c}%
                                            </Button>
                                          ))}
                                        </div>
                                      </div>

                                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                                        {(goldenCombinationsByExtraction[targetExtraction.toFixed(2)] || goldenCombinationsByExtraction["0.70"] || []).map((combo, idx) => (
                                          <div 
                                            key={idx} 
                                            className="p-3 rounded-lg bg-muted/20 border border-border/50 hover:border-primary/50 transition-all cursor-pointer group flex flex-col justify-between"
                                            onClick={() => applyGoldenCombo(combo.legs)}
                                          >
                                            <div>
                                              <div className="flex justify-between items-start mb-1">
                                                <Badge variant="outline" className={`text-[8px] h-4 uppercase ${combo.type === 'Eficiência de Capital' ? 'text-blue-400 border-blue-400/30' : 'text-emerald-400 border-emerald-400/30'}`}>
                                                  {combo.type}
                                                </Badge>
                                                <div className="flex flex-col items-end">
                                                  <span className="text-[10px] font-bold text-white">{combo.roi} ROI</span>
                                                  <div className="flex items-center gap-1">
                                                    <span className="text-[8px] text-muted-foreground">ROE: {combo.roe}</span>
                                                    <CardInfoTooltip 
                                                      title="ROE (Return on Exposure)" 
                                                      description="Métrica de eficiência de capital: Lucro Esperado / Responsabilidade Máxima. Indica quanto seu dinheiro na Exchange rende por ciclo."
                                                    />
                                                  </div>
                                                </div>
                                              </div>
                                              <h5 className="text-xs font-bold flex items-center gap-2 group-hover:text-primary transition-colors mt-1">
                                                {combo.name}
                                                <ArrowRight className="h-3 w-3 opacity-0 group-hover:opacity-100 -translate-x-2 group-hover:translate-x-0 transition-all" />
                                              </h5>
                                              <p className="text-[9px] text-muted-foreground leading-tight mt-1 mb-2">
                                                {combo.description}
                                              </p>
                                            </div>
                                            <div className="flex flex-wrap gap-1 mt-auto pt-2 border-t border-border/20">
                                              {combo.legs.map((odd, i) => (
                                                <span key={i} className="text-[9px] px-1.5 py-0.5 rounded bg-background/50 border border-border/30 font-mono">
                                                  {odd.toFixed(2)}
                                                </span>
                                              ))}
                                            </div>
                                          </div>
                                        ))}
                                      </div>
                                    </div>
                                  </CardContent>
                                </Card>
                              )}
                            </SortableLabCard>
                          ))}
                        </div>
                      </SortableContext>
                    </DndContext>
                  </div>
                </div>
              )
            }
          </div>
        </ScrollArea>
    """

    new_content = header + main_sections + footer
    with open('src/components/ferramentas/CalculadoraHedgeProbabilisticaContent.tsx', 'w') as f:
        f.write(new_content)

if __name__ == "__main__":
    fix_file()
