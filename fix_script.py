import re

with open('src/components/ferramentas/CalculadoraHedgeProbabilisticaContent.tsx', 'r') as f:
    content = f.read()

# Remove the broken middle section and replace it with a clean structure
# We identify the start of the return (line 664) and the end of the file.

lines = content.splitlines()
header = lines[:664] # Up to 'return ('

# We rebuild the return block
new_return = [
    "    return (",
    "      <ScrollArea className=\"h-full\">",
    "        <div className=\"p-4 space-y-6 max-w-7xl mx-auto\">",
    "          <div className=\"flex flex-col md:flex-row gap-4 items-start justify-between\">",
    "            <div className=\"flex-1\">",
    "              <div className=\"flex items-center gap-3\">",
    "                <h1 className=\"text-2xl font-bold flex items-center gap-2\">",
    "                  <Zap className=\"h-6 w-6 text-primary\" />",
    "                  Calculadora de Hedge Probabilístico",
    "                </h1>",
    "                <Button ",
    "                  variant=\"ghost\" ",
    "                  size=\"sm\" ",
    "                  className=\"h-8 gap-1.5 text-xs text-muted-foreground hover:text-primary transition-colors\"",
    "                  onClick={() => setShowHelp(true)}",
    "                >",
    "                  <HelpCircle className=\"h-4 w-4\" />",
    "                  Como funciona?",
    "                </Button>",
    "              </div>",
    "              <p className=\"text-sm text-muted-foreground mt-1\">",
    "                Motor quantitativo para extração de freebets com análise de risco e cascata.",
    "              </p>",
    "            </div>",
    "            <div className=\"flex flex-col items-end gap-2\">",
    "              <div className=\"flex items-center gap-2\">",
    "                <CardInfoTooltip ",
    "                  title={`Score: ${scoreLabel}`}",
    "                  description={finalScore.reason + \" O score avalia ROI, Risco de Ruína e o Drawdown em relação à sua banca.\"}",
    "                />",
    "                <Badge className={`px-4 py-1 text-sm border ${scoreColor}`}>\nScore: {scoreLabel}\n</Badge>",
    "              </div>",
    "              <Tabs value={activeTab} onValueChange={setActiveTab} className=\"w-auto\">",
    "                <TabsList className=\"grid grid-cols-3 h-9 w-[420px]\">",
    "                  <TabsTrigger value=\"calculadora\" className=\"text-xs gap-2\">",
    "                    <Activity className=\"h-3.5 w-3.5\" /> Calculadora",
    "                  </TabsTrigger>",
    "                  <TabsTrigger value=\"laboratorio\" className=\"text-xs gap-2\">",
    "                    <FlaskConical className=\"h-3.5 w-3.5\" /> Laboratório",
    "                  </TabsTrigger>",
    "                  <TabsTrigger value=\"live\" className=\"text-xs gap-2\">",
    "                    <Clock className=\"h-3.5 w-3.5\" /> Calculadora Live",
    "                  </TabsTrigger>",
    "                </TabsList>",
    "              </Tabs>",
    "            </div>",
    "          </div>",
    "          <div className=\"space-y-6\">",
    "            {activeTab === 'calculadora' ? ("
]

# We find the Calculadora content from the original file
# It starts at 716 and ends at 1068
calc_content = lines[715:1068]
new_return.extend(calc_content)

new_return.append("            ) : activeTab === 'laboratorio' ? (")
new_return.append("              <>")

# We find the Laboratorio content
# It starts at 1071 and ends at 1925 approx
lab_content = lines[1070:1925]
new_return.extend(lab_content)

new_return.append("              </>")
new_return.append("            ) : (")
new_return.append("              <div className=\"space-y-6 animate-in fade-in duration-500\">")

# We find the Live content
# It starts at 1934 and ends at 2235 approx
live_content = lines[1933:2235]
new_return.extend(live_content)

new_return.append("              </div>")
new_return.append("            )}")
new_return.append("          </div>")
new_return.append("        </div>")

# We find the Dialogs and the end of the file
# showHelp Dialog starts at 2291
# expanded Dialog we'll rebuild
new_return.append("")
new_return.append("        <Dialog open={!!expanded} onOpenChange={() => setExpanded(null)}>")
new_return.append("          <DialogContent className=\"max-w-md\">")
new_return.append("            <DialogHeader>")
new_return.append("              <DialogTitle className=\"flex items-center gap-2\">")
new_return.append("                <BarChart3 className=\"h-5 w-5 text-primary\" />")
new_return.append("                Detalhamento do Cenário")
new_return.append("              </DialogTitle>")
new_return.append("            </DialogHeader>")

# Resumo Financeiro part
resumo = lines[2243:2287] # Lines from 'Resumo Financeiro' to end of expanded dialog content
new_return.extend(resumo)

new_return.append("          </DialogContent>")
new_return.append("        </Dialog>")
new_return.append("")

# Help Dialog
help_dialog = lines[2290:2444] # From help dialog start to its end
new_return.extend(help_dialog)

new_return.append("      </ScrollArea>")
new_return.append("    );")
new_return.append("};")

with open('src/components/ferramentas/CalculadoraHedgeProbabilisticaContent.tsx', 'w') as f:
    f.write('\n'.join(header) + '\n')
    f.write('\n'.join(new_return) + '\n')

