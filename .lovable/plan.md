
# Plano: Separar Fluxos de Criação vs Edição de Apostas

## Contexto do Problema

Atualmente, tanto a criação de novas apostas quanto a edição de apostas existentes seguem o mesmo fluxo pós-salvamento:
- Formulário é resetado
- Contador incrementa
- Janela permanece aberta

Isso é incorreto para edição: quando você edita uma aposta existente, o comportamento esperado é **fechar a janela e retornar à lista**, não preparar para "nova entrada".

## Fluxo Proposto

```text
┌─────────────────────────────────────────────────────────────────┐
│                     APÓS SALVAR COM SUCESSO                     │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│   isEditing = false (Nova Aposta)                               │
│   ├── Notificar janela principal (BroadcastChannel)             │
│   ├── Resetar formulário (setAposta(null), setFormKey++)        │
│   ├── Incrementar contador (saveCount++)                        │
│   ├── Mostrar toast "Aposta registrada!"                        │
│   └── MANTER janela aberta (modo operacional contínuo)          │
│                                                                 │
│   isEditing = true (Edição de Aposta)                           │
│   ├── Notificar janela principal (BroadcastChannel)             │
│   ├── Mostrar toast "Aposta atualizada!"                        │
│   └── FECHAR janela automaticamente (window.close())            │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

## Arquivos a Modificar

### 1. `src/pages/ApostaWindowPage.tsx`

O `handleSuccess` será refatorado para separar os fluxos:

**Antes:**
```typescript
const handleSuccess = useCallback((action?: ApostaActionType) => {
  // ... notifica
  if (action === 'delete') { /* fecha */ }
  
  // SEMPRE reseta e mantém aberto
  setSaveCount(prev => prev + 1);
  setAposta(null);
  setFormKey(prev => prev + 1);
  toast.success(isEditing ? "Aposta atualizada!" : "Aposta registrada!");
}, [...]);
```

**Depois:**
```typescript
const handleSuccess = useCallback((action?: ApostaActionType) => {
  // ... notifica (BroadcastChannel)
  
  if (action === 'delete') {
    toast.success("Aposta excluída!");
    setTimeout(() => window.close(), 1500);
    return;
  }
  
  // FLUXO DISTINTO POR MODO
  if (isEditing) {
    // EDIÇÃO: Fechar e retornar
    toast.success("Aposta atualizada!", {
      description: "Alterações salvas com sucesso.",
    });
    setTimeout(() => window.close(), 1000);
  } else {
    // CRIAÇÃO: Resetar e continuar
    setSaveCount(prev => prev + 1);
    setAposta(null);
    setFormKey(prev => prev + 1);
    toast.success("Aposta registrada!", {
      description: `${saveCount + 1}ª operação salva.`,
    });
    // Janela permanece aberta
  }
}, [...]);
```

### 2. `src/pages/MultiplaWindowPage.tsx` (se existir)

Aplicar a mesma lógica de separação de fluxos para o formulário de Apostas Múltiplas.

### 3. `src/pages/SurebetWindowPage.tsx` (se existir)

Aplicar a mesma lógica para o formulário de Surebets.

### 4. Opcional: `ApostaPopupContext.tsx`

Se os popups usarem o contexto centralizado, podemos adicionar um `mode` ('create' | 'edit') para que todos os componentes filhos saibam qual fluxo seguir.

## Garantias

| Cenário | Comportamento |
|---------|---------------|
| Nova aposta → Salvar | Formulário limpa, contador incrementa, janela aberta |
| Editar aposta → Salvar | Janela fecha, volta à lista atualizada |
| Qualquer → Excluir | Janela fecha após confirmação |
| Qualquer → Cancelar | Janela fecha sem alterações |

## Detalhes Técnicos

1. **Variável `isEditing`**: Já existe no código (`id && id !== 'novo'`), será usada para bifurcar o fluxo
2. **BroadcastChannel**: Continua funcionando para sincronizar a lista principal em ambos os casos
3. **Toast diferenciado**: Mensagens claras para cada ação ("registrada" vs "atualizada")
4. **Delay antes de fechar**: 1-1.5 segundos para o usuário ver o feedback visual

## Resultado Esperado

1. Usuário abre edição de uma aposta existente
2. Faz alterações e clica em "Salvar"
3. Toast aparece: "Aposta atualizada!"
4. Janela fecha automaticamente em ~1 segundo
5. Lista principal já está atualizada (via BroadcastChannel)
6. **Nenhuma aposta fantasma é criada**
