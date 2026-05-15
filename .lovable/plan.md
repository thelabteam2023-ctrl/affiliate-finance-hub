I will fix the payment amount persistence bug in both `PagamentoFornecedorDialog` and `PagamentoParceiroDialog`. The issue stems from the `resetForm` function being called every time the dialog opens, which uses the original contract value from the `parceria` object, and a `useEffect` that also resets the value when the `parceria` prop changes.

### Analysis of the Bug
- The `useEffect` hook in both dialogs resets the `valor` state to the `parceria.valorFornecedor` (or `valorParceiro`) whenever the `parceria` object changes.
- In `CentralOperacoesDialogs.tsx`, the `selectedPagamentoFornecedor` and `selectedPagamentoParceiro` are state variables. Any change in the parent component might cause a re-render that passes a "new" (though identical in content) partnership object, triggering the `useEffect` and reverting the value.
- `resetForm` is also called on `open`, which overwrites any partially typed value if the component re-mounts or just resets state.

### Proposed Changes

#### 1. src/components/programa-indicacao/PagamentoFornecedorDialog.tsx
- Remove the `useEffect` that resets `valor` when `parceria` changes to prevent auto-reversion.
- Modify `resetForm` to only set the initial value if `valor` is currently empty, or better, handle initialization only once when the dialog is actually triggered.
- Add an alert/confirmation message if the entered value differs from the contracted value.
- Ensure the contracted value is displayed clearly as a reference.

#### 2. src/components/programa-indicacao/PagamentoParceiroDialog.tsx
- Apply the same fixes as above for the partner payment dialog.

#### 3. src/components/central-operacoes/CentralOperacoesDialogs.tsx
- Wrap the partnership objects passed to the dialogs in `useMemo` to ensure stable references, similar to what was already done for `parceriaForDialog` in the same file. This prevents unnecessary `useEffect` triggers.

### Technical Details
- **Warning UI**: Use a simple conditional message or a native `window.confirm` / custom alert within `handleSubmit` before processing if `valorNumerico !== parceria.valorFornecedor`. Given the instructions, an "aviso informativo (não bloqueante)" is requested. I'll implement a state-based warning shown above the confirm button.
- **State Management**: Use a ref or a flag to track if the user has already seen/acknowledged the divergence warning.

### User Review Required
> [!IMPORTANT]
> The fix involves adding a confirmation step when values differ. I will implement a non-blocking visual warning that appears when a divergence is detected, and a confirmation dialog when clicking "Confirmar" if the warning hasn't been acknowledged. Does this meet the "aviso informativo" requirement?
