
## Contexto

Hoje o trigger `fn_detect_duplicate_withdrawal` (em `cash_ledger`) força status = `DUPLICADO_BLOQUEADO` quando detecta um saque similar (mesma casa + mesmo valor ±0,01 + mesmo destino, em janela de 48h). Isso interrompe o fluxo do operador — que precisa ir na Central, abrir o card e reconfirmar manualmente com a flag `ignore_duplicate`.

No nosso contexto operacional é normal ter múltiplos saques idênticos na mesma casa em curto intervalo. A regra deve ser **informativa**, não impeditiva.

Evidência real (projeto ITALO): 2 saques legítimos foram parar em `DUPLICADO_BLOQUEADO` ($500 EUR e $300 USD) — precisaram de intervenção manual sem motivo.

## Nova regra

- Trigger **nunca** bloqueia. O saque é sempre registrado com o status desejado (`PENDENTE` ou `CONFIRMADO`).
- Quando detectar similaridade, apenas **marca metadados** para a UI exibir aviso: `duplicidade_detectada: true`, `saque_similar_id`, `saque_similar_detectado_em`.
- Frontend (formulário de novo saque e confirmação de saque) mostra banner amarelo "⚠️ Saque semelhante já registrado nas últimas 48h" com link para o registro anterior — mas o botão de salvar/confirmar segue liberado.
- Status `DUPLICADO_BLOQUEADO` mantido apenas para leitura histórica (registros antigos). Nenhum código novo o produz.

## Mudanças

### 1. Migration — reescrever trigger

`fn_detect_duplicate_withdrawal`:
- Remover o bloco que troca `NEW.status := 'DUPLICADO_BLOQUEADO'`.
- Manter a busca por saque similar e apenas gravar em `NEW.auditoria_metadata` os campos `duplicidade_detectada`, `saque_similar_id`, `saque_similar_detectado_em`.
- Remover `RAISE WARNING`.
- Manter o atalho `ignore_duplicate` (retorno cedo) para não poluir metadata quando o operador já reconheceu.

### 2. Data migration (única, defensiva)

Reabrir automaticamente saques que ficaram travados por essa regra e ainda estão pendentes de ação real:

```sql
UPDATE cash_ledger
SET status = 'PENDENTE',
    auditoria_metadata = COALESCE(auditoria_metadata,'{}'::jsonb)
      || jsonb_build_object('duplicidade_detectada', true, 'reaberto_por_nova_regra', now())
WHERE status = 'DUPLICADO_BLOQUEADO';
```

(Se você preferir revisar caso a caso, pulamos esta etapa — me avise.)

### 3. Frontend — banner informativo

- `src/pages/Caixa.tsx`: filtro `.not("status","in","(DUPLICADO_CORRIGIDO,DUPLICADO_BLOQUEADO)")` continua válido (nada novo entra nesses status).
- Onde o operador cria/confirma um saque (`ConfirmarSaqueDialog.tsx` e o form de novo saque), consultar em tempo real se existe saque similar nas últimas 48h e mostrar aviso amarelo — sem desabilitar o botão de salvar.
- Card do saque na Central passa a exibir ícone ⚠️ discreto quando `auditoria_metadata.duplicidade_detectada = true`, com tooltip apontando o `saque_similar_id`.

## Não muda

- Nada nas regras de saldo, ledger, snapshot ou reconciliação.
- Nada em depósitos, apostas ou bônus.
- Compatibilidade com registros históricos `DUPLICADO_BLOQUEADO` preservada (filtros existentes continuam funcionando).

## Confirmação necessária

1. Aplicar a **data migration** que reabre os `DUPLICADO_BLOQUEADO` existentes? (recomendado: sim — são falsos positivos)
2. Manter janela de 48h para o aviso ou reduzir (ex.: 24h)?
