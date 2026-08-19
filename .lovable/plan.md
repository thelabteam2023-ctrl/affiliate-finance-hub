# Plan: Sessões Estendidas e Proteção contra Inatividade

O objetivo é ampliar o tempo de permanência útil do usuário no sistema, garantindo que sessões inativas durem até **3 horas (180 minutos)**, enquanto sessões ativas permaneçam válidas por meio de renovação automática, sem comprometer a segurança.

## Investigação Técnica (Status Atual)

- **Frontend (useInactivityTimeout.ts):**
  - Timeout atual: 40 minutos (`INACTIVITY_TIMEOUT_MS`).
  - Aviso (Banner): 5 minutos antes da expiração.
  - Sincronização: Multi-aba via `BroadcastChannel` e `localStorage`.
  - Verificação: Realiza `check_session_inactivity` no banco antes de deslogar.

- **Backend (Supabase/PostgreSQL):**
  - Função `update_user_activity`: Registra o timestamp da última ação.
  - Função `check_session_inactivity`: Valida se o gap de inatividade ultrapassou o limite.

- **Auth Provider (Supabase Managed):**
  - O token JWT padrão costuma durar 1 hora, mas o Supabase JS Client realiza o auto-refresh enquanto a aba estiver aberta e o refresh token for válido.

## Mudanças Propostas

### 1. Ajuste de Timeouts no Frontend
- Alterar `INACTIVITY_TIMEOUT_MS` de 40 para **180 minutos** (3 horas).
- Manter o aviso de 5 minutos antes do término (banner de 175 a 180 min).
- Garantir que o `checkBackendExpiration` também utilize o novo parâmetro de 180 minutos.

### 2. Sincronização e Refresh
- O hook `useInactivityTimeout` já possui lógica de `updateBackendActivity` (throttled a cada 1 min). Isso garante que o banco saiba que o usuário está ativo.
- O Supabase Client lida com a expiração do JWT. Manteremos a configuração de refresh ativa.

### 3. Segurança
- O logout manual permanece imediato.
- A expiração absoluta do refresh token (configurada no dashboard do provedor) é a barreira final de segurança.
- O mecanismo de `check_session_inactivity` impede que abas "zumbis" permaneçam logadas se o banco detectar inatividade real.

## Technical Details

### Files to Modify
- `src/hooks/useInactivityTimeout.ts`:
  - `INACTIVITY_TIMEOUT_MS`: `40 * 60 * 1000` -> `180 * 60 * 1000`.
  - Chamada `supabase.rpc('check_session_inactivity', ...)`: `p_timeout_minutes: 40` -> `180`.

### Database Functions
- A função `check_session_inactivity` no SQL já recebe o parâmetro de minutos, portanto não requer alteração no schema, apenas na chamada do frontend.

## Plano de Testes
1. **Atividade Contínua:** Verificar se o `updateBackendActivity` mantém a sessão viva por > 1 hora.
2. **Inatividade Curta:** Garantir que após 60 min a sessão **NÃO** caia.
3. **Inatividade Longa:** Verificar se o aviso aparece aos 175 min e o logout ocorre aos 180 min.
4. **Multi-aba:** Validar se a atividade em uma aba reseta o timer em todas as outras.
