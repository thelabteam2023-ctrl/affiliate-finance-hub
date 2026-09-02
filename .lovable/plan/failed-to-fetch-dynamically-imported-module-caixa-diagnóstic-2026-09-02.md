# Failed to fetch dynamically imported module (Caixa) — diagnóstico e correção

## O que a investigação mostrou (com evidência)

| Verificação | Resultado |
| --- | --- |
| Como a página Caixa é carregada | `src/App.tsx:91` — `lazyWithChunkRetry(() => import("./pages/Caixa"))`, chunk gerado pelo Vite com hash no nome |
| O arquivo `Caixa-DdjMRnfY.js` existe hoje? | **Não.** `https://stake-sync-erp.lovable.app/assets/Caixa-DdjMRnfY.js` → **HTTP 404** (no host de preview responde 401 porque exige sessão do Lovable) |
| Conteúdo/MIME | Não se aplica — o arquivo não existe mais; a resposta é `text/plain` de erro, não JavaScript |
| Retry existente | `src/App.tsx:58-80` já detecta o erro e recarrega a página **uma única vez por sessão** (flag `stakesync:chunk-reload` em `sessionStorage`) |
| Outros imports dinâmicos | 32 ocorrências fora do App (diálogos, hooks, abas de projeto) — **nenhuma** delas passa pelo retry |
| Relação com export/import de parceiros | Nenhuma relação técnica: aquele trabalho não tocou em rotas, `lazy()` nem configuração de build. O que mudou foi a **frequência de deploys**, e cada deploy troca os hashes dos chunks |

### Causa raiz

O nome do chunk carrega um hash de conteúdo. Quando um novo build é publicado, `Caixa-<hashAntigo>.js` deixa de existir no servidor. Qualquer aba aberta antes do deploy continua com o `index.js` antigo em memória e, ao navegar para o Caixa, pede um arquivo que já foi substituído → 404 → "Failed to fetch dynamically imported module". Não há bug no código do Caixa nem nas alterações de parceiros.

Por que o F5 nem sempre resolve: o HTML pode vir do cache do navegador/CDN, devolvendo de novo o `index.js` antigo; e o retry automático só dispara uma vez por sessão — depois disso o erro aparece cru na tela.

## Correção proposta

### 1. Retry robusto e centralizado
Extrair a lógica de `App.tsx` para um utilitário único (`src/lib/lazyWithRetry.ts`) com:
- nova tentativa imediata do import com cache-buster antes de recarregar a página (resolve o caso em que só o cache do navegador está velho);
- reload forçado ignorando o cache do HTML quando o novo import ainda falhar;
- limite por chunk e com carimbo de tempo, em vez de um único flag global de sessão — assim um deploy novo volta a ter direito a uma tentativa, sem risco de loop.

### 2. Cobrir também os imports dinâmicos fora das rotas
Os 32 `await import(...)` em hooks e diálogos podem falhar pelo mesmo motivo. Passarão a usar um helper `importWithRetry` com a mesma política.

### 3. Detecção de versão nova do app
Comparar periodicamente (e ao voltar o foco da aba) o hash do bundle informado pelo `index.html` servido com o que a aba está executando. Ao detectar divergência, mostrar um aviso discreto "Nova versão disponível — Atualizar", evitando que o usuário só descubra ao bater no erro.

### 4. Mensagem de erro útil
No `GlobalErrorBoundary`, quando o erro for de carregamento de chunk, mostrar "O sistema foi atualizado. Clique em Atualizar para continuar" com um recarregamento forçado, em vez do texto técnico atual.

## Detalhes técnicos

- Novo arquivo `src/lib/lazyWithRetry.ts` exportando `lazyWithRetry` e `importWithRetry`; `App.tsx` passa a importar dele e a função local é removida.
- Controle de tentativas em `sessionStorage` por chave de módulo, com expiração curta; nunca mais de duas tentativas seguidas para o mesmo módulo.
- Reload forçado via `window.location.replace(url + '?v=' + Date.now())` para furar cache de HTML.
- Verificação de versão com `fetch('/index.html', { cache: 'no-store' })` e extração do `src` do script principal; intervalo longo (5 min) e no evento `visibilitychange`.

## Fora de escopo

Nada de saldo, ledger, KPIs, RPCs ou migrações de banco. Nenhuma alteração no fluxo de exportação/importação de parceiros — ele foi descartado como causa.
