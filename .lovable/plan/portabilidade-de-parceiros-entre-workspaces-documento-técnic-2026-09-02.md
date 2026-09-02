# Portabilidade de Parceiros entre Workspaces — Documento Técnico

Entrega desta etapa: diagnóstico + arquitetura. Nenhum código de produção alterado.

## 1. Diagnóstico atual (verificado no schema e no código)

- Página real: `src/pages/GestaoParceiros.tsx` (rota em `App.tsx:440`, permission key no banco). `src/pages/Parceiros.tsx` é tela mock legada, sem rota ativa.
- Componentes: `ParceiroDialog.tsx` (criação/edição, 1540 linhas — pessoais + bancos + wallets), `ParceiroDetalhesPanel.tsx`, `ParceiroProfileView.tsx`, `ParceiroBookmakersTab.tsx`, `BankAccountItem.tsx`, `WalletItem.tsx`, `PixKeyInput.tsx`, `RedeSelect.tsx`, `BancoSelect.tsx`, `LazyPasswordField.tsx`.
- Hooks: `useParceirosData.ts`, `useParceiroContas.ts`, `useParceiroTabsCache.ts`, `usePasswordDecryption.ts`.
- `parceiros` é **por workspace**: coluna `workspace_id NOT NULL` + UNIQUE `(cpf, workspace_id)`. Mesmo indivíduo em dois workspaces já é, hoje, dois registros distintos — e o banco permite isso.

## 2. Mapa de dados (colunas reais)

| Entidade | Vínculo | Observação |
|---|---|---|
| `parceiros` | `workspace_id`, `user_id` | nome, cpf, email, telefone, data_nascimento, endereco, cidade, cep, status, observacoes, qualidade, documentacao_url, is_caixa_operacional, supplier_titular_id, supplier_profile_id, fornecedor_origem_id |
| `contas_bancarias` | `parceiro_id` (CASCADE) — **sem `workspace_id`** | banco, banco_id→`bancos`, agencia, conta, tipo_conta, titular, pix_key, pix_keys(jsonb), moeda, observacoes, reconciled_at |
| `wallets_crypto` | `parceiro_id` (CASCADE) — **sem `workspace_id`** | endereco, network, rede_id→`redes_crypto`, moeda(array), exchange, label, observacoes_encrypted, balance_locked, reconciled_at |
| `bookmakers` | `parceiro_id`, `workspace_id`, `projeto_id`, `investidor_id` | nome, url, login_username, login_password_encrypted, moeda, status, estado_conta, instance_identifier, observacoes, saldos (atual/freebet/bonus/usd/irrecuperável), version |
| `bookmakers_catalogo` | `user_id` nulo quando `is_system` | catálogo com `visibility` (GLOBAL_REGULATED / GLOBAL_RESTRICTED / WORKSPACE_PRIVATE), logo_url, moeda_padrao |
| `bancos`, `redes_crypto` | tabelas de apoio (`is_system` global + registros por usuário) | precisam de resolução por nome/código no destino |

## 3. Classificação por dado

**Exportável (cadastral puro)**: nome, cpf, data_nascimento, email, telefone, endereco, cidade, cep, qualidade, observacoes, documentacao_url; contas bancárias completas; wallets (endereço, rede, moedas, exchange, label).

**Exportável com restrição (sensível, opt-in explícito)**: `login_username`, `login_password_encrypted`, e-mail de acesso da casa, `observacoes` da casa, `observacoes_encrypted` das wallets.

**Não exportável (operacional/financeiro)**: todos os saldos de `bookmakers`, `projeto_id`, `investidor_id`, `estado_conta`, `version`, `reconciled_at`, `balance_locked`, `is_caixa_operacional`, `supplier_*`, `fornecedor_origem_id`, e qualquer linha de `cash_ledger`, `financial_events`, `apostas_unificada`, ciclos, ocorrências, KPIs, histórico.

**Dependente de workspace (nunca copiar ID)**: `parceiros.id`, `bookmakers.id`, `contas_bancarias.id`, `wallets_crypto.id`, `projeto_id`, `investidor_id`, `workspace_id`, `user_id`.

**Global reutilizável por referência**: `bookmakers_catalogo` quando `is_system = true` ou `visibility` GLOBAL_*; `bancos`/`redes_crypto` com `is_system = true`.

## 4. Dependências, triggers e RLS que impactam a importação

- RLS `parceiros`: SELECT `workspace_id = get_current_workspace()`; INSERT exige `has_permission(auth.uid(),'parceiros.create', workspace_id)`. Isolamento já garantido pelo workspace corrente.
- RLS `contas_bancarias` e `wallets_crypto`: derivada via join em `parceiros.workspace_id` — importar sob o parceiro novo já mantém o isolamento automaticamente.
- Triggers que a importação vai acionar e que precisam ser respeitados:
  - `validate_pix_key_unique` — PIX único **por workspace**. Conflito real quando outro parceiro do destino já usa a chave.
  - `validate_wallet_endereco_unique` — endereço único **por workspace**. Mesma situação.
  - `validate_wallet_coin_network` — LTC/BTC precisam de rede compatível; export deve carregar `network` textual.
  - `cascade_parceiro_inativo_bookmakers`, `tr_protect_caixa_operacional` em `parceiros`.
  - Em `bookmakers`: `fn_ensure_deposito_virtual_on_insert` **cria lançamento em `cash_ledger` quando `projeto_id IS NOT NULL` e `saldo_atual > 0`**. Regra dura da importação: casas sempre entram com `projeto_id = NULL` e todos os saldos em 0 — assim nenhum evento financeiro é gerado. Também disparam `trg_protect_bookmaker_lifecycle`, `tr_sync_broker_flag_on_insert`, `trg_increment_bookmaker_version`.
- Credenciais: `login_password_encrypted` é **AES-GCM reversível** (`supabase/functions/crypto-password/index.ts`), chave única `ENCRYPTION_KEY` do projeto, não por workspace. Portanto o ciphertext é tecnicamente reutilizável em qualquer workspace do mesmo deployment — o risco não é criptográfico, é o arquivo sair do sistema.

## 5. Modelo escolhido

**MODELO A — parceiro continua pertencendo ao workspace.** Justificativa objetiva: RLS de `contas_bancarias`/`wallets_crypto` já depende de `parceiros.workspace_id`; tornar parceiro global exigiria reescrever essas policies, o índice `(cpf, workspace_id)`, todas as queries e os triggers de unicidade — risco de regressão alto para um ganho que a portabilidade por pacote já entrega. Modelo B fica registrado como evolução futura, não implementado agora.

## 6. Formato do arquivo

Arquivo `.labbet` (JSON), sem nenhum UUID do workspace de origem:

```text
{
  "format": "LABBET_PARTNER_EXPORT",
  "version": 1,
  "exported_at": "<iso>",
  "source_fingerprint": "<hash do cpf+nome, sem revelar origem>",
  "categories": { "personal","contact","address","notes","banking","crypto","bookmakers","credentials" },
  "partner": { campos cadastrais },
  "banking": [ { banco, banco_codigo, agencia, conta, tipo_conta, titular, moeda, pix_keys, observacoes, ext_id } ],
  "crypto":  [ { label, exchange, network, rede_codigo, endereco, moeda[], ext_id } ],
  "bookmakers": [ { nome, catalogo_ref: {nome, is_system}, url, moeda, login_username, observacoes, ext_id } ],
  "secure": { "alg":"AES-GCM", "kdf":"PBKDF2-SHA256/210k", "salt","iv","ciphertext" }
}
```

- `ext_id` = UUID v5 determinístico por item (base: cpf + tipo + chave natural). É o que torna a importação idempotente.
- `secure` só existe se o usuário marcar "credenciais": senhas vão **em claro dentro do blob**, cifrado no browser com uma passphrase que o próprio usuário define na exportação. O arquivo sozinho não abre.

## 7. Segurança (riscos e mitigação)

| Risco | Nível | Mitigação |
|---|---|---|
| Arquivo com CPF/banco/wallet compartilhado indevidamente | Alto | Aviso explícito na UI; nome do arquivo sem CPF; categorias sensíveis desmarcadas por padrão |
| Vazamento de senha de casa | Crítico | Senhas nunca em claro no JSON; blob AES-GCM + PBKDF2 com passphrase do usuário; checkbox de confirmação separado |
| Reuso de ciphertext do banco no arquivo | Alto | Não exportar `login_password_encrypted` bruto (dependeria da chave do servidor e é opaco); decriptar via edge function e recifrar com a passphrase |
| Segredo em log/URL | Alto | Export/import 100% client-side no browser + insert normal via RLS; nada de senha em `console.log` nem query string |
| Arquivo adulterado / dados malformados | Médio | Validação Zod estrita do envelope, versão, tipos, tamanhos; rejeição com relatório |
| Acesso cruzado entre workspaces | Baixo | Import sempre grava com o `workspace_id` corrente sob RLS existente; nenhuma RPC SECURITY DEFINER nova que leia origem |
| Importação duplicada | Médio | `ext_id` + upsert lógico |
| FK apontando para workspace errado | Baixo | Nenhum ID de origem é gravado; catálogo resolvido apenas entre entradas visíveis no destino |
| Impacto financeiro acidental | Crítico | Casas importadas com `projeto_id = NULL` e saldos 0 (evita `fn_ensure_deposito_virtual_on_insert`); nenhuma escrita em `cash_ledger`/`financial_events` |

## 8. Duplicidade

Ordem de match no destino: CPF exato (forte) → e-mail → telefone normalizado → nome+data_nascimento (fraco, só sugere). Ações oferecidas: **Atualizar existente** (merge campo a campo, só preenche vazios salvo confirmação), **Criar novo** (bloqueado se CPF idêntico, por causa do UNIQUE), **Cancelar**. Por item filho: conflito de PIX/endereço de wallet já usado por outro parceiro do destino → "Ignorar item" (não dá para forçar, o trigger barra).

## 9. Isolamento

Exportar é leitura sob a RLS do workspace de origem; importar é escrita sob a RLS do workspace destino. Não existe caminho de leitura direta A→B: o arquivo é a única ponte, e ele carrega apenas categorias marcadas. Nenhum dado operacional é lido no export.

## 10. Impacto no sistema (arquivos)

Novos: `src/lib/partnerPortability/schema.ts` (Zod + tipos), `buildExport.ts`, `secureBlob.ts` (WebCrypto), `matchPartner.ts`, `applyImport.ts`; `src/components/parceiros/ExportarParceiroDialog.tsx`, `ImportarParceiroDialog.tsx` (wizard 8 etapas).
Alterados (mínimo): `src/pages/GestaoParceiros.tsx` (botões Exportar/Importar + invalidação de `parceiros-data`), `src/components/parceiros/ParceiroDetalhesPanel.tsx` (ação Exportar).
Banco: nenhuma migration obrigatória na Fase 1. Opcional na Fase 3: coluna `external_ref text` em `parceiros`/`contas_bancarias`/`wallets_crypto`/`bookmakers` para idempotência persistida (aditiva, nullable).

## 11. Estratégia de implementação

1. Schema + validação + blob seguro (puro TS, testável, zero UI).
2. Dialog de exportação com seleção granular e download do `.labbet`.
3. Wizard de importação: arquivo → validação → prévia → duplicidade → resolução → confirmação.
4. Executor de importação (parceiro → bancos → wallets → casas), transacional por etapa, com relatório final.
5. Idempotência persistida (`external_ref`) e migration aditiva.

## 12. Matriz de testes

Export parcial / completo; import em workspace limpo; CPF duplicado (as 3 resoluções); PIX já usado; endereço de wallet já usado; casa de catálogo global vs privada do workspace; credenciais com passphrase certa e errada; arquivo inválido/adulterado/versão futura; import repetido do mesmo arquivo (deve ser no-op); usuário sem permissão `parceiros.create`; A→B e B→A; e o teste de regressão financeira obrigatório: snapshot de `cash_ledger`, `financial_events` e `bookmakers.saldo_atual` antes/depois — devem ser idênticos.

## Confirmação de impacto financeiro

A importação é estritamente cadastral: não cria saldo, lançamento, aposta, depósito, retirada, nem altera KPI, caixa operacional, patrimônio ou saldo de casa/wallet. A regra técnica que garante isso é casa importada sempre com `projeto_id = NULL` e saldos zerados.

## Ponto a decidir antes da Fase 2

Casas importadas devem vir com `status = 'ativo'` (prontas para uso) ou com um estado neutro exigindo revisão manual antes de vincular a projeto? Recomendação: `ativo`, `projeto_id NULL`, saldos 0.
