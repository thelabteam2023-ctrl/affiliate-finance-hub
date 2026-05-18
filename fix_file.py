import sys

file_path = 'src/components/ferramentas/CalculadoraHedgeProbabilisticaContent.tsx'
with open(file_path, 'r') as f:
    lines = f.readlines()

# Localizar CalculadoraHedgeProbabilisticaContent
start_idx = -1
for i, line in enumerate(lines):
    if 'export const CalculadoraHedgeProbabilisticaContent' in line:
        start_idx = i
        break

if start_idx == -1:
    print("Component start not found")
    sys.exit(1)

# Inserir o estado e o useMemo APÓS o início da função
# Vamos inserir logo após as declarações de estado iniciais que já existem
# Ou logo após o início do componente.

insertion_point = start_idx + 1

# Encontrar um bom lugar para inserir os estados de maxLabTotalOdd e o useMemo
# Vamos procurar por "const [freebet" que é um estado comum.
for i in range(start_idx, len(lines)):
    if 'const [freebet' in lines[i]:
        insertion_point = i
        break

new_states = """
  const [maxLabTotalOdd, setMaxLabTotalOdd] = useState<number>(() => {
    const saved = localStorage.getItem('hedge-calc-lab-max-odd');
    return saved ? Number(saved) : 8.0;
  });

  useEffect(() => {
    localStorage.setItem('hedge-calc-lab-max-odd', maxLabTotalOdd.toString());
  }, [maxLabTotalOdd]);

  const restrictedGoldenCombinations = useMemo(() => {
    const targets = [0.65, 0.70, 0.75];
    const result: any[] = [];
    const commDec = commission / 100;
    const commonOdds = [1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8, 1.9, 2.0, 2.2, 2.4, 2.6, 2.8, 3.0];

    targets.forEach(target => {
      [2, 3, 4, 5].forEach(numLegs => {
        let bestROE = -Infinity;
        let bestROECombo: number[] = [];

        commonOdds.forEach(baseOdd => {
          commonOdds.forEach(anchorOdd => {
            const candidateLegs = Array(numLegs - 1).fill(baseOdd).concat(anchorOdd);
            const totalOdd = candidateLegs.reduce((a, b) => a * b, 1);

            if (totalOdd <= maxLabTotalOdd) {
              const m = HedgeProbabilisticoEngine.calculateMetrics(
                candidateLegs.map(o => ({ name: '', backOdd: o, layOdd: o })),
                100,
                commDec,
                target
              );

              if (m.allWonProfit > 0 && m.maxResponsibility > 0) {
                const roe = m.totalEV / m.maxResponsibility;
                if (roe > bestROE) {
                  bestROE = roe;
                  bestROECombo = candidateLegs;
                }
              }
            }
          });
        });

        if (bestROECombo.length > 0) {
          const m = HedgeProbabilisticoEngine.calculateMetrics(
            bestROECombo.map(o => ({ name: '', backOdd: o, layOdd: o })),
            100,
            commDec,
            target
          );
          result.push({
            numLegs,
            target: (target * 100).toFixed(0) + '%',
            legs: bestROECombo,
            roi: fmtPct(m.totalROI),
            roe: (m.totalEV / m.maxResponsibility * 100).toFixed(1) + '%',
            totalOdd: bestROECombo.reduce((a, b) => a * b, 1).toFixed(2)
          });
        }
      });
    });
    return result;
  }, [commission, maxLabTotalOdd]);

"""

# Inserir no arquivo
lines.insert(insertion_point, new_states)

# Agora localizar o loop de layout Id e inserir o novo card
# Localizar 'if (layoutId === \'golden-library\')'
library_idx = -1
for i, line in enumerate(lines):
    if "if (layoutId === 'golden-library')" in line:
        # Encontrar o fim deste bloco if
        count = 0
        for j in range(i, len(lines)):
            if 'return (' in lines[j]: count += 1
            if ');' in lines[j] and 'SortableCard' in lines[j-1]: # Simplified check
                 library_idx = j + 1
                 break
        break

if library_idx != -1:
    new_card = """
                     if (layoutId === 'restricted-golden-library') return (
                       <SortableCard key={layoutId} id={layoutId}>
                         <Card className="h-full border-dashed border-orange-500/50 bg-orange-500/5">
                           <CardHeader className="pb-1">
                             <CardTitle className="text-xs font-medium flex items-center gap-2 text-orange-400">
                               <ShieldAlert className="h-4 w-4" /> Lab: Limite de Odd ({maxLabTotalOdd}x)
                             </CardTitle>
                           </CardHeader>
                           <CardContent className="space-y-2">
                             <div className="text-[9px] text-muted-foreground leading-tight mb-2">
                               Sugestões otimizadas para casas com limite de odd total.
                             </div>
                             <div className="space-y-1 max-h-[150px] overflow-y-auto pr-1">
                               {restrictedGoldenCombinations.filter(c => c.target === (Number(targetExtraction) * 100).toFixed(0) + '%').map((combo, idx) => (
                                 <div 
                                   key={idx} 
                                   className="p-1.5 rounded bg-background/40 border border-orange-500/20 cursor-pointer hover:border-orange-500/50 transition-colors"
                                   onClick={() => applyGoldenCombo(combo.legs)}
                                 >
                                   <div className="flex justify-between items-center mb-1">
                                      <span className="text-[8px] font-bold text-orange-400">{combo.numLegs} Pernas</span>
                                      <span className="text-[8px] font-mono text-white">Odd: {combo.totalOdd}</span>
                                   </div>
                                   <div className="flex flex-wrap gap-0.5">
                                      {combo.legs.map((o, i) => (
                                        <span key={i} className="text-[7px] px-1 bg-muted rounded border border-border/50">{o.toFixed(2)}</span>
                                      ))}
                                   </div>
                                   <div className="flex justify-between mt-1 text-[7px] text-muted-foreground uppercase font-bold">
                                      <span>ROI: {combo.roi}</span>
                                      <span>ROE: {combo.roe}</span>
                                   </div>
                                 </div>
                               ))}
                             </div>
                           </CardContent>
                         </Card>
                       </SortableCard>
                     );
"""
    lines.insert(library_idx + 1, new_card)

# Localizar o card 'lab-params' para inserir o controle de maxLabTotalOdd
params_idx = -1
for i, line in enumerate(lines):
    if "Label className=\"text-[10px] uppercase font-bold text-primary\">Banca Exchange</Label>" in line:
        # Inserir antes ou depois
        params_idx = i + 6 # Pular o input e a div
        break

if params_idx != -1:
    new_param = """
                             <div className="space-y-2 pt-2 border-t border-border/30">
                               <div className="flex justify-between items-center">
                                 <Label className="text-[10px] uppercase font-bold text-orange-400">Limite de Odd (Múltipla)</Label>
                                 <span className="text-xs font-mono font-bold text-white">{maxLabTotalOdd}x</span>
                               </div>
                               <Slider 
                                 value={[maxLabTotalOdd]} 
                                 min={2} max={30} step={0.5}
                                 onValueChange={(vals) => setMaxLabTotalOdd(vals[0])}
                               />
                               <p className="text-[8px] text-muted-foreground italic leading-tight">
                                 Filtra a Biblioteca de Ouro para respeitar o teto de odd da sua casa.
                               </p>
                             </div>
"""
    lines.insert(params_idx, new_param)

with open(file_path, 'w') as f:
    f.writelines(lines)
