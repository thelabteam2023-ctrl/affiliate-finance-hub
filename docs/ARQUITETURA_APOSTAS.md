# Arquitetura do Sistema de Apostas

## Visão Geral

Este documento descreve a arquitetura robusta e antifrágil do sistema de apostas,
incluindo invariantes de domínio, camadas de serviço e estratégias de migração.

## 1. Single Source of Truth (SSoT)

| Entidade | Fonte Oficial | Observação |
|----------|---------------|------------|
| Pernas da Aposta | `apostas_pernas` | JSON em `pernas` é cache/legado |
| Stake por Casa | `get_bookmaker_saldos()` RPC | Nunca calcular client-side |
| Saldo em Aposta | `get_bookmaker_saldos()` RPC | Única fonte de verdade |
| Vínculo Projeto-Bookmaker | `bookmakers.projeto_id` | Validado por trigger |

## 2. Invariantes de Domínio

```
INVARIANT_001: Arbitragem → DEVE ter 2+ registros em apostas_pernas
INVARIANT_002: Bookmaker da perna → DEVE pertencer ao mesmo projeto
INVARIANT_003: Aposta PENDENTE → SEMPRE impacta saldo_em_aposta
INVARIANT_004: Dual-write falhou → ROLLBACK completo
INVARIANT_005: SUREBET → forma_registro='ARBITRAGEM' + 2+ pernas
INVARIANT_006: Stake ≤ saldo_operavel
```

## 3. Camada de Serviço

### ApostaService (`src/services/aposta/`)

Ponto único de entrada para operações de aposta:

```typescript
import { criarAposta, atualizarAposta, deletarAposta } from '@/services/aposta';

const result = await criarAposta({
  projeto_id: "...",
  forma_registro: "ARBITRAGEM",
  estrategia: "SUREBET",
  pernas: [...],
});

if (!result.success) {
  // Erro tratado - invariante violada ou falha de persistência
  console.error(result.error);
}
```

### Garantias do Serviço

1. **Validação de Invariantes** - Antes de qualquer operação
2. **Dual-Write Atômico** - `apostas_unificada` + `apostas_pernas`
3. **Fail Fast** - Rollback automático se dual-write falhar
4. **Auditoria** - Logs estruturados de todas as operações

## 4. Hooks Especializados

### useSurebetService

Para operações específicas de Surebet:

```typescript
const { criarSurebet, atualizarSurebet, deletarSurebet } = useSurebetService();
```

### usePreCommitValidation

Para validação de saldo com lock pessimista:

```typescript
const { validateAndReserve, debitMultiple } = usePreCommitValidation();
```

## 5. Estado Atual de Migração

| Componente | Status | Próximo Passo |
|------------|--------|---------------|
| `SurebetDialog.tsx` | ⚠️ Dual-write manual | Migrar para useSurebetService |
| `ApostaDialog.tsx` | ⚠️ Insert direto | Migrar para ApostaService |
| `ApostaMultiplaDialog.tsx` | ⚠️ Insert direto | Migrar para ApostaService |
| `useApostasUnificada.ts` | ⚠️ Duplicado | Deprecar após migração |

## 6. Diagrama de Arquitetura

```
┌─────────────────────────────────────────────────────────┐
│                    CAMADA DE UI                          │
│  SurebetDialog | ApostaDialog | ApostaMultiplaDialog    │
└────────────────────────┬────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────┐
│              CAMADA DE SERVIÇO                          │
│                                                          │
│  ┌──────────────────┐  ┌────────────────────────────┐  │
│  │ ApostaService    │  │ useSurebetService          │  │
│  │ - criarAposta    │  │ - criarSurebet             │  │
│  │ - atualizarAposta│  │ - atualizarSurebet         │  │
│  │ - deletarAposta  │  │ - deletarSurebet           │  │
│  └────────┬─────────┘  └──────────────┬─────────────┘  │
│           │                            │                 │
│           └──────────────┬─────────────┘                │
│                          ▼                               │
│  ┌──────────────────────────────────────────────────┐  │
│  │ VALIDADOR DE INVARIANTES                          │  │
│  │ - PERNAS_REQUIRED_FOR_MULTI                       │  │
│  │ - BOOKMAKER_PROJETO_MATCH                         │  │
│  │ - SUREBET_REQUIRES_ARBITRAGEM                     │  │
│  │ - STAKE_WITHIN_BALANCE                            │  │
│  │ - ATOMIC_DUAL_WRITE                               │  │
│  └──────────────────────────────────────────────────┘  │
└────────────────────────┬────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────┐
│              CAMADA DE PERSISTÊNCIA                      │
│                                                          │
│  ┌─────────────────┐  ┌─────────────────┐               │
│  │ apostas_unificada│  │ apostas_pernas  │               │
│  │ (fonte primária) │  │ (normalizada)   │               │
│  └────────┬────────┘  └────────┬────────┘               │
│           └──────────┬─────────┘                         │
│                      ▼                                   │
│  ┌──────────────────────────────────────────────────┐   │
│  │ get_bookmaker_saldos() RPC                        │   │
│  │ - Calcula saldo_em_aposta                         │   │
│  │ - Única fonte de verdade para saldos              │   │
│  └──────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────┘
```

## 7. Regras para Novos Desenvolvimentos

### ✅ FAÇA

- Use `ApostaService` para criar/atualizar/deletar apostas
- Use `useSurebetService` para operações de Surebet
- Valide invariantes antes de persistir
- Trate erros retornados pelos serviços

### ❌ NÃO FAÇA

- Insert direto em `apostas_unificada` fora do serviço
- Insert direto em `apostas_pernas` fora do serviço
- Ignorar erros de dual-write (falha silenciosa)
- Calcular saldo_em_aposta no client-side

## 8. Health Check

O sistema inclui função de verificação de integridade:

```typescript
import { healthCheck } from '@/services/aposta';

const result = await healthCheck(projetoId);
if (!result.healthy) {
  console.log("Inconsistências encontradas:", result.issues);
}
```

## 9. Próximos Passos

1. [ ] Migrar `SurebetDialog` para usar `useSurebetService`
2. [ ] Migrar `ApostaDialog` para usar `ApostaService`
3. [ ] Deprecar `useApostasUnificada`
4. [ ] Adicionar triggers SQL para validação de invariantes no banco
5. [ ] Implementar health check periódico
