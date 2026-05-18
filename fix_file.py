import sys

content = open('src/components/ferramentas/CalculadoraHedgeProbabilisticaContent.tsx', 'r').read()

# I need to find the point where the Tab content for "calculadora" ends.
# It ends with an </>.
# Then it was supposed to be: ) : activeTab === 'laboratorio' ? (
# But I seem to have nested things wrongly.

# Let's try a complete rewrite of the render logic part since it's quite broken.
# I'll look for: {activeTab === 'calculadora' ? (
# and replace everything up to the Dialog.

import re

# Find the start of the tabs content
start_marker = re.search(r"\{activeTab === 'calculadora' \? \(", content)
if not start_marker:
    print("Start marker not found")
    sys.exit(1)

# Find the end of the tabs content (before the Dialog)
dialog_marker = re.search(r"<Dialog open=\{!!expanded\}", content)
if not dialog_marker:
    print("Dialog marker not found")
    sys.exit(1)

# I will rebuild the middle part.
# Part 1: Calculadora
# Part 2: Laboratorio
# Part 3: Live

# Re-read the file to get exact parts if possible, or just rebuild based on memory of what was there.
# Actually, I have the parts in previous view calls.

# Wait, I can't easily rebuild everything in a script without risk.
# Let's just fix the syntax in the current file.
# re.sub(r"\) : activeTab === 'laboratorio' \? \(", ") : activeTab === 'laboratorio' ? (", content)

# The error is likely a missing closing parenthesis or brace before the next ternary.
# Looking at the code:
# ) : activeTab === 'laboratorio' ? ( ... ) : ( ... )

# Let's try to just fix the specific broken lines.
