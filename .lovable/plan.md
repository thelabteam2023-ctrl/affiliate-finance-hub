

# Plano: Hook Centralizado `useCrossWindowSync`

## Resumo Executivo

Criar um hook React reutilizável que **centraliza toda a lógica de sincronização cross-window** (comunicação entre abas/janelas do navegador). Isso eliminará **~650 linhas de código duplicado** espalhadas em 12+ arquivos, garantindo que novos módulos já venham sincronizados automaticamente.

---

## Problema Atual

### Duplicação Identificada
| Arquivo | Linhas Duplicadas | Status |
|---------|-------------------|--------|
| ProjetoApostasTab.tsx | ~60 linhas | Completo |
| ProjetoValueBetTab.tsx | ~55 linhas | Completo |
| ProjetoFreebetsTab.tsx | ~50 linhas | Completo |
| ProjetoDuploGreenTab.tsx | ~50 linhas | Completo |
| ProjetoSurebetTab.tsx | ~50 linhas | Completo |
| BonusApostasTab.tsx | ~60 linhas | Completo |
| BonusVisaoGeralTab.tsx | ~50 linhas | Completo |
| ProjetoDashboardTab.tsx | ~40 linhas | Completo |
| **+ 4 arquivos de emissão** | ~40 linhas cada | Completo |
| **TOTAL** | **~650 linhas** | Repetidas |

### Riscos do Modelo Atual
- Novo evento (ex: `BONUS_UPDATED`) exige alteração manual em **12+ arquivos**
- Alta chance de esquecer algum módulo, causando dessincronização
- Manutenção cara e propensa a erros

---

## Solução Proposta

### Novo Hook: `useCrossWindowSync`

```text
┌─────────────────────────────────────────────────────────────────┐
│                    useCrossWindowSync                           │
├─────────────────────────────────────────────────────────────────┤
│  Parâmetros de Entrada:                                         │
│  ├─ projetoId: string                                          │
│  ├─ onSync: () => void (callback de refresh)                   │
│  └─ channels?: ('aposta' | 'multipla' | 'surebet')[]           │
│       (padrão: ['aposta', 'multipla', 'surebet'])              │
├─────────────────────────────────────────────────────────────────┤
│  Eventos Suportados (internamente):                            │
│  ├─ APOSTA_SAVED                                               │
│  ├─ APOSTA_DELETED                                             │
│  ├─ APOSTA_MULTIPLA_SAVED                                      │
│  ├─ SUREBET_SAVED                                              │
│  └─ resultado_updated                                          │
├─────────────────────────────────────────────────────────────────┤
│  Fallback automático: localStorage (navegadores sem suporte)   │
│  Cleanup automático: fecha channels no unmount                 │
└─────────────────────────────────────────────────────────────────┘
```

### API do Hook (Uso Simplificado)

**ANTES (50+ linhas por módulo):**
```typescript
useEffect(() => {
  const surebetChannel = new BroadcastChannel("surebet_channel");
  const apostaChannel = new BroadcastChannel("aposta_channel");
  const multiplaChannel = new BroadcastChannel("aposta_multipla_channel");
  
  surebetChannel.onmessage = (event) => {
    if (event.data?.type === "SUREBET_SAVED" && event.data?.projetoId === projetoId) {
      fetchData();
      onDataChange?.();
    }
  };
  
  apostaChannel.onmessage = (event) => {
    const validTypes = ["APOSTA_SAVED", "resultado_updated", "APOSTA_DELETED"];
    if (validTypes.includes(event.data?.type) && event.data?.projetoId === projetoId) {
      fetchData();
      onDataChange?.();
    }
  };
  
  multiplaChannel.onmessage = (event) => {
    if (event.data?.type === "APOSTA_MULTIPLA_SAVED" && event.data?.projetoId === projetoId) {
      fetchData();
      onDataChange?.();
    }
  };
  
  // Fallback localStorage...
  const handleStorage = (event: StorageEvent) => { /* ... */ };
  window.addEventListener("storage", handleStorage);
  
  return () => {
    surebetChannel.close();
    apostaChannel.close();
    multiplaChannel.close();
    window.removeEventListener("storage", handleStorage);
  };
}, [projetoId, onDataChange]);
```

**DEPOIS (1 linha):**
```typescript
useCrossWindowSync({
  projetoId,
  onSync: () => {
    fetchData();
    onDataChange?.();
  }
});
```

---

## Etapas de Implementação

### Fase 1: Criar o Hook (Arquivo Novo)
**Arquivo:** `src/hooks/useCrossWindowSync.ts`

O hook irá:
1. Aceitar configuração flexível de channels
2. Gerenciar todos os 5 tipos de eventos automaticamente
3. Implementar fallback para localStorage
4. Fazer cleanup automático no unmount
5. Incluir logging opcional para debug

### Fase 2: Refatorar Módulos Existentes (12 arquivos)

| Arquivo | Ação |
|---------|------|
| ProjetoApostasTab.tsx | Substituir useEffect por useCrossWindowSync |
| ProjetoValueBetTab.tsx | Substituir useEffect por useCrossWindowSync |
| ProjetoFreebetsTab.tsx | Substituir useEffect por useCrossWindowSync |
| ProjetoDuploGreenTab.tsx | Substituir useEffect por useCrossWindowSync |
| ProjetoSurebetTab.tsx | Substituir useEffect por useCrossWindowSync |
| ProjetoDashboardTab.tsx | Substituir useEffect por useCrossWindowSync |
| BonusApostasTab.tsx | Substituir useEffect por useCrossWindowSync |
| BonusVisaoGeralTab.tsx | Substituir useEffect por useCrossWindowSync |

### Fase 3: Criar Helper de Emissão Centralizado
**Arquivo:** Atualizar `src/lib/windowHelper.ts`

Adicionar funções utilitárias para emissão padronizada:
- `broadcastAposta(type, projetoId, apostaId)`
- `broadcastMultipla(type, projetoId, apostaId)`
- `broadcastSurebet(type, projetoId, surebetId)`

### Fase 4: Refatorar Emissores (4 arquivos)

| Arquivo | Ação |
|---------|------|
| ApostaDialog.tsx | Usar helper de emissão |
| ApostaMultiplaDialog.tsx | Usar helper de emissão |
| SurebetDialog.tsx | Usar helper de emissão |
| ResultadoPill.tsx | Usar helper de emissão |

---

## Benefícios

| Métrica | Antes | Depois |
|---------|-------|--------|
| Linhas de código duplicadas | ~650 | 0 |
| Arquivos que precisam de alteração para novo evento | 12+ | 1 |
| Risco de esquecer módulo em novo evento | Alto | Zero |
| Novos módulos já sincronizados | Manual | Automático |
| Tempo para adicionar novo canal de sync | ~30 min | ~2 min |

---

## Detalhes Técnicos

### Estrutura do Hook

```typescript
interface CrossWindowSyncOptions {
  projetoId: string;
  onSync: () => void;
  channels?: ('aposta' | 'multipla' | 'surebet')[];
  debug?: boolean;
}

export function useCrossWindowSync(options: CrossWindowSyncOptions): void {
  // 1. Mapear channels para nomes reais
  // 2. Definir eventos válidos por channel
  // 3. Criar listeners com validação de projetoId
  // 4. Implementar fallback localStorage
  // 5. Cleanup no unmount
}
```

### Mapeamento de Eventos

```text
Channel "aposta_channel":
  ├─ APOSTA_SAVED → onSync()
  ├─ APOSTA_DELETED → onSync()
  └─ resultado_updated → onSync()

Channel "aposta_multipla_channel":
  └─ APOSTA_MULTIPLA_SAVED → onSync()

Channel "surebet_channel":
  └─ SUREBET_SAVED → onSync()
```

---

## Arquivos a Serem Modificados

1. **Criar:** `src/hooks/useCrossWindowSync.ts`
2. **Atualizar:** `src/lib/windowHelper.ts` (adicionar funções de broadcast)
3. **Refatorar (8 listeners):**
   - `src/components/projeto-detalhe/ProjetoApostasTab.tsx`
   - `src/components/projeto-detalhe/ProjetoValueBetTab.tsx`
   - `src/components/projeto-detalhe/ProjetoFreebetsTab.tsx`
   - `src/components/projeto-detalhe/ProjetoDuploGreenTab.tsx`
   - `src/components/projeto-detalhe/ProjetoSurebetTab.tsx`
   - `src/components/projeto-detalhe/ProjetoDashboardTab.tsx`
   - `src/components/projeto-detalhe/bonus/BonusApostasTab.tsx`
   - `src/components/projeto-detalhe/bonus/BonusVisaoGeralTab.tsx`
4. **Refatorar (4 emissores):**
   - `src/components/projeto-detalhe/ApostaDialog.tsx`
   - `src/components/projeto-detalhe/ApostaMultiplaDialog.tsx`
   - `src/components/projeto-detalhe/SurebetDialog.tsx`
   - `src/components/projeto-detalhe/ResultadoPill.tsx`

**Total: 14 arquivos** (1 novo + 13 modificados)

---

## Resultado Final

Após a implementação, qualquer novo módulo operacional poderá sincronizar-se automaticamente com apenas uma linha:

```typescript
useCrossWindowSync({
  projetoId,
  onSync: fetchData
});
```

Isso garante que:
- Novos desenvolvedores não precisam conhecer a infraestrutura de BroadcastChannel
- Todos os eventos são tratados automaticamente
- O fallback para localStorage é transparente
- O cleanup de recursos é garantido

