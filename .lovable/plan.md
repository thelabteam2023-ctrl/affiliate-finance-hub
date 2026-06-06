I will remodel the "Ocorrências" module to align with a high-end operational tool aesthetic (Linear/Stripe style), focusing on information hierarchy, semantic color usage, and improved UX.

### 1. New Design Tokens & Constants
- Create `src/components/ocorrencias/ocorrencia-tokens.ts` to define the new semantic color system.
- Prioridade: Dot-based colors (Red for Urgente, Amber for Media, Gray for Baixa).
- Status: Muted text styles.
- SLA: Strong red badge only for expired items.

### 2. Component Overhaul
- **OcorrenciasModule.tsx**: 
    - Reorganize KPIs into "Atenção necessária" and "Em andamento" groups.
    - Make "Valor em Disputa" a standalone, prominent card.
    - Refine the filter tabs and type chips for a cleaner look.
- **OcorrenciasList.tsx**: 
    - Remove the heavy colored priority group headers.
    - Implement subtle text-based separators for priority groups.
    - Switch to a single-column dense list layout (instead of the current grid/kanban hybrid).
- **OcorrenciaItem.tsx (New component replacing OcorrenciaCollapseCard)**: 
    - Implement the requested row layout:
        - Left: [Priority Dot] [Title] [Type Tag]
        - Right: [Bookmaker] [Responsible Icon] [Time] [Value Indicator]
    - Add a subtle 2px red left border for SLA-vencido items.
    - Replace the inline expansion with a trigger for the new Drawer.
- **OcorrenciaDrawer.tsx (New component replacing OcorrenciaDetalheDialog logic)**:
    - Create a side panel (Drawer) for details.
    - Header with clear actions: Resolve, Escalate, Reassign.
    - Organized sections for Linked Entities, Description, and Timeline.
- **NovaOcorrenciaModal.tsx (Refactored NovaOcorrenciaDialog)**:
    - Implement a 3-step centered modal.
    - Step 1: Identification (Type, Entity).
    - Step 2: Details (Title, Description, Priority, Value).
    - Step 3: Attribution (Responsible, SLA).
    - Add validation state to the "Confirm" button.

### 3. Implementation Details
- Maintain all existing interfaces and props to ensure "drop-in" compatibility.
- Ensure dark mode support with subtle surface contrasts.
- Use `framer-motion` for smooth drawer transitions if available, otherwise standard UI components.
- Replace CAIXA ALTA titles with standard Sentence case for better readability.

### Technical Notes
- I will create a new file for the drawer and the tokens to keep the codebase modular.
- The existing `OcorrenciaCollapseCard` will be preserved for a few steps to ensure no breakage during the transition, then replaced in the list.
- KPIs will be recalculated in the module to fit the new grouping.