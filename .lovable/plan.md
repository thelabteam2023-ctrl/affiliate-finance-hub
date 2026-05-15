I will implement the requested changes to allow editing pending payment values both in the "Pagamentos Pendentes" list and within the payment modals, ensuring the adjusted values are tracked and reflected throughout the system.

### Technical Details

#### 1. Database Schema Changes
Add two new columns to the `parcerias` table to store adjusted values without losing the original contract values:
- `valor_parceiro_ajustado` (NUMERIC, nullable)
- `valor_fornecedor_ajustado` (NUMERIC, nullable)

#### 2. Inline Editing in Financeiro > Pagamentos Pendentes
- **Component**: `src/components/programa-indicacao/FinanceiroTab.tsx`
- **Logic**: 
    - Update the `FornecedorPendente` and `ParceiroPendente` interfaces to include adjusted values.
    - Implement a local state `editingId` to track which item is being edited.
    - Add a "pencil" icon next to the values in the "Pagamentos ao Parceiro (CPF)" and "Pagamentos a Fornecedores" lists.
    - When editing, replace the static text with an input field.
    - On save (Enter or check icon):
        - Update the `parcerias` table in Supabase.
        - Create an entry in the `audit_logs` table (Action: 'UPDATE', Entity: 'parceria', includes before/after data).
        - Refresh the list data to update totals and display values.
- **Totals**: Ensure the "Pendências" count and display values use `valor_ajustado ?? valor_original`.

#### 3. Modal Improvements
- **Components**: `src/components/programa-indicacao/PagamentoFornecedorDialog.tsx` and `PagamentoParceiroDialog.tsx`
- **Fixes**:
    - Modify `useEffect` to only initialize the `valor` state once when the dialog opens, preventing it from resetting if the parent component re-renders.
    - Ensure the `valor` field remains editable and does not reset on blur.
    - Display a clear, non-blocking warning message if the typed value differs from the original contracted value.
    - The "Confirmar" action will use the value currently in the input field.

#### 4. Audit Trail
Use the existing `audit_logs` table to record:
- `actor_user_id`: Current operator ID.
- `action`: 'UPDATE'.
- `entity_type`: 'parceria'.
- `entity_id`: The partnership ID.
- `before_data` and `after_data`: Capturing the value change.

### Plan
1. **Migration**: Create and run the SQL migration to add the adjusted value columns.
2. **List Implementation**: Edit `FinanceiroTab.tsx` to add the inline editing UI and the save handler (with audit logging).
3. **Modal Implementation**: Edit both `PagamentoFornecedorDialog.tsx` and `PagamentoParceiroDialog.tsx` to stabilize the value field and add the divergence warning.
4. **Verification**: Confirm that editing a value in the list updates the display, that the modal opens with the new value, and that totals (where applicable) are updated.