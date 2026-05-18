import sys

file_path = 'src/components/ferramentas/CalculadoraHedgeProbabilisticaContent.tsx'
with open(file_path, 'r') as f:
    lines = f.readlines()

# Localizar e remover duplicações do início do arquivo
new_lines = []
found_import = False
skip_next = False
for i, line in enumerate(lines):
    if skip_next:
        skip_next = False
        continue
    if 'import React' in line:
        if found_import:
            # Encontramos o segundo import React, remover tudo antes
            new_lines = lines[i:]
            break
        found_import = True

if not new_lines:
    new_lines = lines

# Corrigir a lógica de renderização do layout para evitar o return null precoce
processed_lines = []
in_map = False
for i, line in enumerate(new_lines):
    if '{labLayout.map((layoutId) => {' in line:
        in_map = True
    
    if in_map and 'return null;' in line:
        # Pular o return null se houver código real vindo depois que deveria estar no map
        if i + 2 < len(new_lines) and 'if (layoutId === \'restricted-golden-library\')' in new_lines[i+2]:
             continue
             
    processed_lines.append(line)

with open(file_path, 'w') as f:
    f.writelines(processed_lines)
