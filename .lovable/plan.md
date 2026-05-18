I will update the mathematical explanations and UI to address your observations about the simulation's assumptions and the visual bugs.

### 1. Refine Mathematical Explanations
*   **Withdrawal Assumption**: Clarify in the "Projeção: Dobrar a Banca" card that the simulation assumes **100% reinvestment** (compound interest). I will explain that this represents the "Risk of Ruin" for a dedicated bankroll where all profits fund future operations.
*   **EV+ vs EV- Behavior**: Add a scientific note in the Laboratory explaining that:
    *   **EV Positive**: The bankroll is mathematically expected to grow, but high variance (betting too much relative to bankroll) can still lead to ruin before growth takes over.
    *   **EV Negative**: Ruin is a statistical certainty in the long term, and the probability of doubling the bankroll decreases as more events are played.

### 2. UI and Visual Fixes
*   **Tooltip Clipping**: Fix the tooltips in the "Simulação Visual de 1.000 Eventos" (currently 100 in the UI code, will ensure consistency). I will add bottom padding to the container and ensure the tooltips have a higher `z-index` and enough space to render below the bars as requested.
*   **Laboratory Logic**: Ensure the "Meta de Dobra" and "Risco de Ruína" cards are highly visible and explain the "events needed" calculation based on the new sequential simulation data.

### 3. Polish
*   Remove any remaining references to the "Dica de Execução" card.
*   Update the "Como chegamos neste Risco?" section to be more educational about trajectories.

### Technical details:
*   Modify `src/components/ferramentas/CalculadoraHedgeProbabilisticaContent.tsx`.
*   Increase `pb-x` in the simulation container.
*   Update strings in `monteCarloSim` UI sections.
