I will implement the export functionality for the ValueBet tab by adding an "Exportar" button to the header of the `OperationsHistoryModule`. This button will utilize the existing `ExportMenu` component, which I will enhance to include the specific fields requested (CSV and Excel formats, mandatory fields like Fair Value, Stake in BRL/units, ROI, etc.).

### User-facing changes
- A new "Exportar" button (download icon) will appear at the top of the ValueBet tab, next to the "Filtros" or view toggles.
- Users can choose between CSV and Excel (.xlsx) formats.
- The exported file will contain all requested columns, including date, sport, market, event, bookmaker (Fonte), strategy (Tipo), odds, fair value, stake, result, profit/loss (in units and BRL), and individual ROI.
- The filename will dynamically include the selected period (e.g., `apostas_2024-01-01_a_2024-03-31.xlsx`).
- Feedback "Exportando..." will be shown during the process.

### Technical details
- **Enhance `ExportApostaRecord` types**: Add missing fields such as `fair_value`, `roi`, `lucro_unidades`, `lucro_brl`, and `esporte` to `src/types/exportApostas.ts`.
- **Update `useExportApostas` hook**:
    - Add support for Excel (.xlsx) export using a lightweight approach (or formatting CSV for Excel compatibility as currently done, but strictly following the user's request for `.xlsx` might require adding a library like `xlsx` if basic CSV isn't enough, but I'll stick to a robust CSV implementation that Excel opens perfectly first, or check if I can add a simple xlsx generator).
    - Ensure the filename logic respects the `period` from `tabFilters`.
- **Update `ExportMenu` component**:
    - Add the Excel option to the dropdown.
    - Improve the `transformApostaToExport` helper to include the new fields.
- **Integrate into `ProjetoValueBetTab`**:
    - Pass the `ExportMenu` to the `headerActions` prop of `OperationsHistoryModule`.
    - Provide a `getData` function that maps current filtered bets to the export format.
- **Data handling**: Ensure the export respects the current filters (period, bookmaker, result, etc.) by using the filtered data already present in the component's state or derived from the hooks.

**Note on Excel format**: To strictly provide a `.xlsx` file without a heavy library, I'll check if the current project already has `xlsx` or `exceljs`. If not, I'll recommend adding `xlsx` for true Excel support or ensure the CSV is perfectly formatted for Excel (UTF-8 with BOM and semicolon separator). Given the requirement for "Excel (.xlsx)", I will check for dependencies first.
