## Objetivo

No layout **horizontal (colunas)** do modal de Arbitragem, o Select da casa hoje empilha 3 informações dentro do trigger:

1. `BET365` (nome)
2. `CLAUDIVAN SILVA` (parceiro)
3. abaixo, `BookmakerMetaRow` repete o parceiro + saldo

Isso polui o card (que é estreito) e duplica o parceiro. Vamos enxugar o trigger para **logo + nome da casa apenas**, mantendo parceiro/saldo no `BookmakerMetaRow` logo abaixo (única fonte dessas infos).

Aplicar o mesmo padrão tanto na **perna principal** quanto nas **sub-entradas (Sub 2, Sub 3…)**.

---

## Mudanças (escopo cirúrgico, só UI)

**Arquivo:** `src/components/surebet/SurebetColumnsView.tsx`

### 1. Trigger da perna principal (linhas ~234-255)

Substituir o conteúdo do `<SelectValue>` por:

- Logo da casa (16×16, fallback ícone) à esquerda — usar `BookmakerLogo` de `@/components/ui/bookmaker-logo` com `size="h-4 w-4"`.
- Nome da casa em `uppercase text-[11px] font-medium truncate`.
- **Remover** do trigger: bloco do `instance_identifier` e o bloco do `parceiro_nome` (`getFirstLastName(...)`).
- Manter `h-8` no `SelectTrigger`.

Layout: `flex items-center gap-2 min-w-0` com `<BookmakerLogo>` + `<span class="truncate">{nome}</span>`.

### 2. Trigger das sub-entradas (linhas ~437-447)

Mesmo tratamento, ainda mais compacto (já está em `text-[9px]`):
- Logo `h-3.5 w-3.5` + nome `uppercase text-[10px] truncate`.
- Remover qualquer texto extra do trigger.

### 3. Saldo / parceiro / instance_identifier

Continuam visíveis **apenas** via `BookmakerMetaRow` (já renderizado logo abaixo do Select em ambos os casos). Nenhuma mudança nesse componente.

### 4. Limpeza

- Remover import `getFirstLastName` se não houver mais usos no arquivo (verificar com grep antes).
- Adicionar import do `BookmakerLogo`.

---

## Resultado visual esperado

Antes (trigger):
```
BET365
CLAUDIVAN SILVA
```
+ MetaRow abaixo com `CLAUDIVAN • R$ 2.832,48`

Depois (trigger):
```
[logo] BET365
```
+ MetaRow abaixo com `CLAUDIVAN • R$ 2.832,48` (inalterado)

Resultado: cards mais limpos, sem duplicação do parceiro, leitura mais rápida do nome da casa, e o `instance_identifier` (quando existe) passa a aparecer só dentro do dropdown / no MetaRow se aplicável — não mais comprimido no trigger.

---

## Fora de escopo

- Layout vertical / `SurebetTableRow` (já tratado anteriormente).
- Lógica de seleção, saldo, freebet, validações — nada muda.
- Conteúdo do dropdown (`BookmakerSearchableSelectContent`) — permanece como está, já mostra logo + meta completa por opção.
