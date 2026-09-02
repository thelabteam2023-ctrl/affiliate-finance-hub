# Portabilidade de Parceiros — Exportação/Importação em Lote

## Etapa 1 — O que existe hoje (verificado no código)

- `src/pages/GestaoParceiros.tsx` injeta na TopBar dois botões `outline` ("Exportar parceiro" — desabilitado sem parceiro selecionado — e "Importar parceiro"), controlando `exportDialogOpen` / `importDialogOpen`.
- `src/components/parceiros/ExportarParceiroDialog.tsx`: recebe **um** `parceiroId`, deixa marcar categorias (`DEFAULT_CATEGORIES`), pede senha quando inclui credenciais, chama `buildPartnerExport` e `downloadExportFile`.
- `src/lib/partnerPortability/buildExport.ts`: lê `parceiros` filtrando por `id` **e** `workspace_id`; lê `contas_bancarias`, `wallets_crypto` e `bookmakers` (estes também com `workspace_id`); gera `ext_id` por SHA-256 e sela credenciais com `sealSecurePayload` (PBKDF2 + AES-GCM).
- `src/lib/partnerPortability/schema.ts`: envelope de **um** parceiro (`format: LABBET_PARTNER_EXPORT`, `version: 1`), validado com Zod em `parseExportFile`.
- `src/lib/partnerPortability/matchPartner.ts`: `findPartnerMatch` já filtra `.eq("workspace_id", workspaceId)` — duplicidade já é avaliada **somente no workspace de destino** (regra crítica já atendida; será mantida intacta).
- `src/lib/partnerPortability/applyImport.ts`: importa um envelope, resolve catálogo de casas por nome, insere bookmaker com `projeto_id: null` e saldos zerados.
- `src/components/parceiros/ImportarParceiroDialog.tsx`: wizard de 4 passos para **um** envelope.
- `src/components/parceiros/ParceiroListaSidebar.tsx`: lista com busca, filtro de status e ordenação; hoje só há seleção única (`selectedId`), sem checkbox.

## Etapa 2 — Viabilidade e riscos

- **Reuso**: total. `buildPartnerExport` já é por parceiro e independente; o lote é apenas um laço sobre ele.
- **Formato**: o arquivo atual **não** suporta múltiplos parceiros. Solução mínima: novo envelope-contêiner `LABBET_PARTNER_BUNDLE` (v1) contendo `partners: ExportEnvelope[]`. O parser aceita ambos (arquivo antigo vira bundle de 1) — retrocompatível nas duas direções de leitura.
- **RLS/workspace**: todas as leituras já são filtradas por `workspace_id`; o lote passará o mesmo `workspaceId` ativo para cada parceiro. Nenhuma mudança de RLS.
- **Vazamento entre parceiros**: cada envelope é montado isoladamente e o `ext_id` é derivado do CPF/nome do próprio parceiro — sem risco de mistura. Credenciais: um único blob cifrado por bundle, com `ext_id` global (já é hash por parceiro), protegido pela mesma senha.
- **Performance**: cada parceiro faz 4 queries. 50 parceiros ≈ 200 queries. Mitigação: concorrência limitada (4 em paralelo) e barra de progresso. Credenciais exigem 1 chamada à edge function por casa — é o gargalo real.
- **Limite prático recomendado**: **200 parceiros** por lote sem credenciais; **50** quando "Credenciais das casas" estiver marcado (bloqueio com aviso claro acima disso). Arquivo resultante fica em poucos MB — seguro para gerar no navegador.
- **Importação**: sequencial por parceiro, com **erros parciais isolados** — um parceiro inválido não impede os demais; o relatório final lista sucesso/falha por parceiro.
- Conclusão: **implementação segura**, sem migração de banco e sem tocar em ledger/eventos/saldos/KPIs.

## Etapa 3 — O que será alterado

**Formato (`schema.ts`)**
- Adicionar `bundleSchema` (`LABBET_PARTNER_BUNDLE`, v1, `partners: [...]`) e `parseImportFile` que normaliza arquivo antigo ou novo para uma lista de envelopes. `parseExportFile` permanece para compatibilidade.

**Exportação**
- Novo `buildPartnerBundle(parceiroIds, workspaceId, categories, passphrase?, onProgress)` em `buildExport.ts`, reutilizando `buildPartnerExport`, com concorrência 4 e um único blob seguro consolidado.
- `ExportarParceiroDialog` passa a receber `parceiroIds: string[]`: mesma UI de categorias/senha, mais cabeçalho "N parceiros selecionados" e progresso durante a geração. Nome do arquivo: `parceiros-<n>-<data>.labbet` (ou nome do parceiro quando for 1).

**Seleção múltipla**
- `ParceiroListaSidebar`: checkbox por linha (aparece no hover e quando há seleção), checkbox "selecionar todos" no cabeçalho que marca **todos os parceiros que passam pelo filtro/busca atual**, e uma barra fina "N selecionados · Exportar · Limpar". A seleção não interfere no clique que abre o detalhe.
- Estado `selectedIds` mantido em `GestaoParceiros.tsx`.

**TopBar minimalista**
- Substituir os dois botões por um único botão-ícone discreto (`MoreHorizontal`, ghost, h-7) abrindo um `DropdownMenu` com "Importar parceiros" e "Exportar parceiros" (este mostrando o contador quando houver seleção). Segue o padrão de menus já usados no projeto.

**Importação em lote**
- `ImportarParceiroDialog`: após o arquivo, roda `findPartnerMatch` por parceiro (sempre no workspace de destino) e mostra resumo do tipo "25 encontrados · 20 novos · 4 já existentes · 1 com conflito", com lista rolável e resolução por parceiro (Criar novo / Atualizar existente), além de um atalho "aplicar a todos".
- Execução sequencial reusando `applyPartnerImport`, com progresso e relatório final por parceiro (criado/atualizado/erro), incluindo casas não resolvidas no catálogo do destino.

## Etapa 4 — Garantias mantidas

- Nada de migração de banco; nenhuma alteração em `cash_ledger`, `financial_events`, apostas, ciclos, ocorrências, KPIs ou RLS.
- Casas importadas continuam com `saldo = 0`, `projeto_id = null`, sem qualquer evento financeiro.
- Nenhum ID interno, `workspace_id`, `projeto_id` ou `investidor_id` entra no arquivo.
- Duplicidade avaliada exclusivamente no workspace de destino (comportamento atual preservado).

## Etapa 5 — Validação

Build/typecheck; teste no preview: exportar 1, exportar vários, conferir o JSON gerado (sem IDs internos), importar bundle com parceiro novo + parceiro já existente, e confirmar via consulta que nenhum registro financeiro foi criado.
