# Backup e Restauração completos (Admin do Sistema)

Nova área dentro do painel **Admin do Sistema → Sistema**, visível apenas para o dono do sistema, com duas ações: gerar um pacote `.zip` com tudo e restaurar o sistema a partir de um pacote.

Hoje a base tem cerca de 189 MB de dados e 213 arquivos (≈ 3 MB), então um pacote único é perfeitamente viável.

## Gerar backup

Botão **Gerar backup completo**, com barra de progresso em três etapas (dados → fotos → finalizando). O arquivo baixa direto no navegador.

Conteúdo do pacote:

```text
/dados/<tabela>.json      todas as tabelas do sistema, uma por arquivo
/dados/_auth_users.json   usuários (id, e-mail, criação, metadados) sem senhas
/storage/<bucket>/...     todos os arquivos, com pastas preservadas
/schema.sql               estrutura para recriar o banco do zero
/MANIFEST.json            data, versão, linhas por tabela, arquivos por bucket
```

Ao final, um resumo na tela: X tabelas, Y linhas, Z arquivos, tamanho do pacote.

Aviso visível: em bases grandes a geração pode demorar alguns minutos; a aba precisa continuar aberta.

## Restaurar

Área de envio do pacote `.zip`. Como você escolheu **espelhar exatamente o pacote**, a restauração apaga o que não estiver nele. Por isso:

- Antes de executar, o sistema lê o `MANIFEST.json` e mostra o que será aplicado (data do pacote, tabelas, linhas, arquivos) comparado ao estado atual, destacando quantos registros serão removidos.
- Confirmação em duas etapas: aviso em vermelho + digitar `RESTAURAR` para liberar o botão.
- Recomendação na própria tela: gerar um backup atual antes de restaurar.
- Progresso por etapa e resumo final (tabelas restauradas, linhas gravadas, arquivos reenviados, erros).

## Detalhes técnicos

**Edge function `system-backup`** (service_role apenas no servidor; nada de chave privilegiada no navegador):
- Valida o chamador: JWT obrigatório + checagem de `is_system_owner`; qualquer outro usuário recebe 403.
- `action=export`: lista tabelas de `information_schema` no schema `public`, pagina cada uma em blocos de 1000 linhas, serializa em JSON; lista `storage.buckets` e percorre recursivamente `storage.objects`, baixando cada arquivo; monta o zip em stream com `fflate` e devolve como download.
- `schema.sql`: concatenação das migrations do projeto, embutida como asset da função no build (arquivo gerado a partir de `supabase/migrations`).
- Tabelas de log volumosas (`api_request_logs`, `debug_logs`, `error_logs`, `login_attempts`, `daily_events`, `sports_events_raw`) entram no pacote, mas com opção marcável "incluir logs" (ligada por padrão) para permitir pacotes menores.

**Edge function `system-restore`**:
- Mesma validação de dono do sistema.
- Recebe o zip, lê o `MANIFEST.json`, valida versão e integridade antes de tocar em qualquer dado.
- Ordena as tabelas por dependências (chaves estrangeiras), apaga em ordem inversa e insere em ordem direta, em blocos de 1000 linhas.
- Usa uma função de banco `admin_restore_apply(_table, _rows, _mode)` (security definer, restrita ao dono do sistema) que desativa gatilhos de usuário na tabela durante a carga e os religa ao final, evitando que os motores financeiros reprocessem lançamentos históricos.
- Storage: para cada bucket do pacote, cria o bucket se não existir, remove objetos ausentes no pacote e reenvia os arquivos com `upsert`.
- `auth.users` não é recriado automaticamente: o relatório final lista usuários do pacote que não existem hoje, para decisão manual (recriar contas de autenticação por importação em massa é operação separada e arriscada).

**Frontend**
- `src/pages/admin/BackupRestauracao.tsx` + entrada na aba "Sistema" do `SystemAdmin.tsx`, seguindo o padrão visual das demais abas administrativas.
- Hook `useSystemBackup.ts` com estados de progresso, download via blob e envio do arquivo por `supabase.functions.invoke`.
- Nenhuma alteração em regras financeiras, ledger, saldos ou dados existentes durante a implementação.

## Limitações declaradas na tela
- O pacote é um retrato do momento; mudanças feitas durante a geração podem não entrar.
- Restauração é operação de manutenção: recomenda-se com o sistema fora de uso.
- Senhas e sessões de login não são exportadas nem restauradas.
