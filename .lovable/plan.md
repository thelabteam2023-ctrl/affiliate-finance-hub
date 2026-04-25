Plano para evoluir a aba RPCs do Ledger Monitor para leitura por pessoas leigas:

1. Criar um dicionário de significado das RPCs
   - Adicionar uma camada frontend com descrições amigáveis por função.
   - Começar pelas RPCs mais recorrentes no app, como:
     - get_user_workspaces
     - get_effective_access
     - get_user_role
     - get_cached_exchange_rates
     - get_bookmaker_saldos
     - get_bookmakers_pendentes_conciliacao
     - get_my_pending_invites
     - criar_aposta_atomica_v3
     - liquidar_aposta_v4
     - reverter_liquidacao_v4
     - deletar_aposta_v4
     - desvincular_bookmaker_atomico
     - get_projeto_dashboard_data
   - Para RPCs sem cadastro específico, mostrar uma explicação genérica segura: “operação interna do sistema”.

2. Traduzir status, duração e impacto para linguagem operacional
   - success: “Executou com sucesso”.
   - pending: “Ainda aguardando resposta”.
   - error: “Falhou; a ação pode não ter sido concluída”.
   - Duração em ms com leitura humana:
     - rápido
     - normal
     - lento
     - muito lento
   - Exibir uma classificação simples de risco/impacto:
     - Consulta: apenas lê dados.
     - Escrita: altera algum registro.
     - Financeiro crítico: pode mexer com saldo, aposta, ledger, vínculo ou liquidação.
     - Segurança/acesso: permissões, workspace, login ou convite.

3. Explicar “Args / Erro / Preview” em português claro
   - Args: “dados enviados para a função”.
   - Erro: “mensagem retornada quando a função falha”.
   - Preview: “amostra do resultado que voltou”.
   - Traduzir chaves comuns:
     - _user_id → usuário
     - _workspace_id / p_workspace_id → workspace
     - project_id / projeto_id → projeto
     - bookmaker_id → casa/bookmaker
     - aposta_id → aposta
     - valor / amount → valor financeiro
     - moeda / currency → moeda
   - Para valores null, mostrar: “nenhum dado enviado” ou “sem valor”.

4. Melhorar a UI da tabela RPCs
   - Manter a tabela atual para uso técnico.
   - Adicionar uma coluna ou bloco “Entendimento” com:
     - nome amigável da ação
     - descrição curta do que ela faz
     - tipo de operação
     - alerta se falhou ou se é uma função financeira crítica
   - Trocar o `<details>` cru por uma visualização expandida mais didática:
     - “O que foi enviado”
     - “O que voltou”
     - “Se deu erro, o que significa”
   - Usar badges e tooltips já existentes no projeto, sem alterar backend.

5. Adicionar modo de leitura simples
   - Criar um botão/alternância na aba RPCs:
     - “Modo técnico” mantém JSON bruto.
     - “Modo explicado” mostra tradução amigável primeiro, JSON bruto como detalhe secundário.
   - O objetivo é permitir que um operador leigo entenda rapidamente o que aconteceu sem perder o material técnico para auditoria.

Detalhes técnicos
- Alterações concentradas em `src/pages/DevLedgerMonitor.tsx` e, se ficar mais limpo, criação de um helper frontend como `src/lib/dev/rpcExplain.ts`.
- Não será necessário alterar banco de dados nem RPCs.
- O interceptor atual continuará capturando `fn_name`, `args`, `status`, `duration_ms`, `error` e `result_preview` do mesmo jeito.
- A evolução será apenas na camada de interpretação e apresentação dos dados capturados.

Resultado esperado
- O System Owner continua vendo os dados técnicos.
- Um usuário leigo passa a entender:
  - qual ação o sistema tentou executar,
  - se foi leitura ou alteração,
  - se mexe com saldo/aposta/ledger,
  - quais dados foram enviados,
  - o que significa o retorno ou erro.