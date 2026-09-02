# Importação de Parceiros — Casas sem duplicação (idempotência real)

## 1. Causa raiz (verificada no código e no banco)

Hoje já existe uma deduplicação de casas em `applyImport.ts`, mas ela é frágil e falha em quatro pontos concretos:

1. **A identidade da casa é o texto livre `nome`.** A chave usada é `nome | instance_identifier | moeda`. O campo `bookmakers.nome` é editável e varia entre workspaces ("BET 7K" vs "Bet7k", nome renomeado da conta). Quando o nome no destino difere do nome no arquivo, o sistema conclui "não existe" e insere de novo. A referência canônica (`bookmakers.bookmaker_catalogo_id`, FK para `bookmakers_catalogo`) existe nas duas pontas e **não é usada** na comparação — a consulta de existentes nem seleciona essa coluna.
2. **A moeda é normalizada só na hora do INSERT.** Se a moeda do arquivo não está na lista aceita, a casa entra como `BRL`, mas a chave de dedupe é registrada com a moeda original. Na importação seguinte a chave nunca bate → duplica.
3. **Parceiro duplicado duplica todas as casas.** `findPartnerMatch` só reconhece o parceiro por CPF, e-mail, telefone ou nome exato. Se o CPF não veio no arquivo (categoria "Dados de identificação" desmarcada) ou o usuário escolhe "Criar novo", nasce um segundo registro de parceiro e **todas** as casas são recriadas — foi o cenário do teste entre dois workspaces.
4. **Não há proteção no banco.** Confirmado: em `public.bookmakers` não existe nenhum índice UNIQUE envolvendo `parceiro_id`; só índices comuns. Duas importações simultâneas criam as duas cópias.

Observação importante confirmada nos dados: o modelo é **multi-instância legítimo** — o mesmo parceiro pode ter várias contas da mesma casa, diferenciadas por `instance_identifier`. Portanto a unicidade **não** pode ser "um parceiro só pode ter uma Betano".

## 2. Chave de identidade adotada

Identidade canônica da relação parceiro↔casa, dentro do workspace de destino:

```text
workspace_id + parceiro_id + casa_canonica + instancia + moeda_efetiva
onde:
  casa_canonica = bookmaker_catalogo_id (quando resolvido no catálogo do destino)
                  senão nome normalizado (minúsculo, sem acento, sem espaço extra)
  instancia     = instance_identifier normalizado (NULL e "" são o mesmo)
  moeda_efetiva = a moeda JÁ normalizada (mesma que será gravada)
```

Nunca são usados como chave: `bookmakers.id` de origem, `parceiro_id` de origem, ou qualquer ID do workspace exportador.

## 3. O que será feito

**Novo módulo `src/lib/partnerPortability/bookmakerIdentity.ts`**
- `normalizeBookmakerCurrency(moeda)` — única fonte da coerção de moeda (hoje duplicada no insert).
- `buildIdentityKey({ catalogoId, nome, instanceIdentifier, moeda })` — usada para as duas pontas (linhas do destino e casas do arquivo), garantindo comparação simétrica.

**`applyImport.ts` — bloco de casas reescrito**
- Consultar as casas existentes do parceiro no workspace de destino selecionando também `bookmaker_catalogo_id` e `portability_ext_id`.
- Montar o índice de existentes por chave canônica **e** por `portability_ext_id`.
- Deduplicar as casas do próprio arquivo antes de inserir (mesma chave aparecendo duas vezes → uma só).
- Para cada casa: resolver catálogo → montar chave → se já existe, **pular sem INSERT** e contar como "já existente" (mesma política já usada para contas bancárias e wallets: não sobrescreve nada do registro existente — nem cadastro, nem status, nem saldo).
- Se não existe: inserir com `projeto_id = null`, saldos zerados e `portability_ext_id` preenchido.
- Erro `23505` no insert (corrida entre duas importações) passa a ser tratado como "já existia", não como falha.
- Relatório passa a distinguir `bookmakersImported` / `bookmakersExisting` / `bookmakersFailed`.

**Banco (migração)**
- Nova coluna `bookmakers.portability_ext_id text` (nullable) — identidade estável da relação, gravada apenas pelo importador.
- Índice `CREATE UNIQUE INDEX ... ON bookmakers (workspace_id, parceiro_id, portability_ext_id) WHERE portability_ext_id IS NOT NULL`.
  Motivo de ser parcial: já existem no banco casas multi-instância criadas manualmente com `instance_identifier` nulo repetido; um UNIQUE amplo quebraria dados legítimos e falharia na criação. O índice parcial garante a idempotência das importações sem tocar no modelo manual.
- Nenhuma alteração em saldo, ledger, eventos, projetos ou investidores.

**Preview da importação (`ImportarParceiroDialog.tsx`)**
- Antes de confirmar, calcular por parceiro o que acontecerá com cada casa e exibir a contagem e a lista: `Betano — Já existe, não será duplicada` / `Pinnacle — Nova, será criada`.
- Resumo por parceiro: "3 casas · 2 já existentes · 1 nova".

**Parceiro duplicado (causa 3)**
- Quando `findPartnerMatch` encontra um parceiro no destino e o usuário mesmo assim escolhe "Criar novo", exibir aviso explícito de que as casas serão criadas em um novo registro. A resolução continua sendo do usuário; o sistema deixa de fazê-lo silenciosamente.

## 4. Garantias mantidas

- Verificação sempre restrita ao workspace de destino (`.eq("workspace_id", workspaceId)`); registros de outros workspaces nunca bloqueiam a importação.
- A chave inclui o parceiro: João+Betano e Maria+Betano continuam independentes.
- Catálogo ≠ vínculo: a casa existir em `bookmakers_catalogo` não impede a criação do vínculo com o parceiro.
- Casa existente no destino nunca tem saldo, projeto, investidor ou histórico alterados pela importação. Casa nova entra com saldo 0 e `projeto_id = null`.

## 5. Testes

Suíte em `src/lib/partnerPortability/__tests__/bookmakerDedupe.test.ts` com Supabase mockado, cobrindo os 9 cenários pedidos: casa inexistente, casa existente, importação repetida (2x e 3x), parte existente + parte nova, dois parceiros com a mesma casa, dois workspaces, preservação de status sem segunda relação, duplicata dentro do próprio arquivo e ausência de qualquer escrita financeira. Além disso: verificação por consulta ao banco, após teste no preview, de que nenhum registro foi criado em `cash_ledger` / `financial_events` e de que os saldos não mudaram.
