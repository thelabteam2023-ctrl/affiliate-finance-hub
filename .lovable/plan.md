# Aviso "Métricas com influência externa" — fechar de vez

Hoje o aviso amarelo na aba de Bônus só some enquanto a tela está aberta: ao trocar de aba, atualizar a página ou entrar de novo, ele volta. O X passa a significar "não mostrar mais esse aviso neste projeto", para aquele usuário.

## Comportamento final

- Primeiro acesso ao projeto: o aviso aparece normalmente (se houver casas com influência externa).
- Clicou no X: some na hora e fica guardado no perfil do usuário.
- Sair da aba, atualizar a página, fechar e reabrir o sistema, sair e entrar na conta: continua oculto.
- Outro usuário do mesmo projeto continua vendo o aviso normalmente.
- Em outro projeto de bônus, o aviso aparece na primeira visita (a escolha vale por projeto).
- Enquanto a preferência ainda está sendo carregada, o aviso não pisca na tela.

## O que não muda

Nada de cálculo: as métricas de Saldo Operável, Saldo Ajustado, a definição de influência externa, casas, vínculos, saldos e resultados financeiros ficam exatamente como estão. A mudança é só de exibição e de uma preferência pessoal.

## Detalhes técnicos

- Nova tabela `public.user_alert_dismissals`: `id`, `user_id`, `workspace_id`, `project_id` (nulo permitido, para reutilização futura), `alert_key text`, `dismissed_at`, com índice único em `(user_id, alert_key, coalesce(project_id, ...))`, GRANTs para `authenticated`/`service_role` e RLS restrita ao próprio usuário dentro do workspace. Motivo de não reaproveitar `project_user_preferences`: `default_tab` é NOT NULL, então não dá para criar uma linha só para dispensar um aviso.
- Novo hook `src/hooks/useAlertDismissal.ts` (React Query): `isDismissed`, `isLoading`, `dismiss()`. A chave usada será `bonus_contamination_alert`, com `project_id` do projeto atual. O `dismiss()` grava com `upsert` e atualiza o cache na hora (optimistic), sem exigir reload.
- `BonusContaminationAlert.tsx`: troca o `useState(isDismissed)` pelo hook; não renderiza enquanto `isLoading`; o X chama `dismiss()`. Recebe `projectId` por prop.
- `BonusVisaoGeralTab.tsx`: passa o `projectId` já disponível no contexto para o alerta.

## Testes

- Cenários do pedido: primeiro acesso, fechar, trocar de aba, refresh, logout/login, segundo usuário e segundo projeto — validados via navegação automatizada na pré-visualização e consulta direta à tabela de preferências.
- Teste de tela (Vitest) cobrindo: aviso oculto quando já dispensado, aviso visível quando não dispensado e nada renderizado durante o carregamento.
- Typecheck e build.
