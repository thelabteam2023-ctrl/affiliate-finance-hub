I will restore the missing functionalities in the "Caixa Crypto" card and ensure they are fully functional as requested.

### Implementation Details:
1.  **Icon Restoration**: Replace the non-functional Tabler Icons (`ti-`) with Lucide icons (`RefreshCw`, `Plus`, `ExternalLink`) in both `ExposicaoCryptoCard.tsx` and `SaldosFiatCard.tsx` to ensure visibility and clarity.
2.  **Wallet Address Access**:
    *   Integrate `CurrencyBreakdownModal` into `ExposicaoCryptoCard.tsx`.
    *   Make each coin in the list clickable. When clicked, it will open the breakdown modal filtered by that coin, showing all wallets, their balances, and their network addresses.
    *   Add a copy-to-clipboard feature within the modal (already present in `CurrencyBreakdownModal.tsx`) and ensure it's easily accessible.
3.  **Comprehensive View**:
    *   Add a "Ver Detalhes" or "Wallets" button to allow users to see all crypto accounts associated with the operational vault.
4.  **Verification**:
    *   Confirm that the "Add Wallet" and "Swap" buttons correctly trigger their respective dialogs.
    *   Ensure `workspaceId` is correctly passed or fetched for data isolation.

### Technical Steps:
*   Update `src/components/caixa/ExposicaoCryptoCard.tsx` to include `CurrencyBreakdownModal`, replace icons, and add click handlers.
*   Update `src/components/caixa/SaldosFiatCard.tsx` to replace `ti-` icons with Lucide equivalents.
*   Ensure `ExposicaoCryptoCard` has access to `workspaceId` (via `useTabWorkspace`).
