/**
 * Mapeamento central de papéis (roles) para exibição em português na UI.
 * Os valores internos (backend/banco) permanecem em inglês.
 */

export const roleLabels: Record<string, string> = {
  system_owner: 'Proprietário do Sistema',
  owner: 'Proprietário',
  admin: 'Administrador',
  moderator: 'Moderador',
  finance: 'Financeiro',
  operator: 'Operador',
  member: 'Membro',
  user: 'Usuário',
  viewer: 'Visualizador',
};

/**
 * Retorna o rótulo em português para um papel.
 * Se o papel não for reconhecido, retorna o valor original capitalizado.
 */
export function getRoleLabel(role: string | null | undefined): string {
  if (!role) return 'Usuário';
  return roleLabels[role] || role.charAt(0).toUpperCase() + role.slice(1);
}
