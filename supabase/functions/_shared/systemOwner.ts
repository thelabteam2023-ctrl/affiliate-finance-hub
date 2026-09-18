import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;

export function serviceClient() {
  return createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export interface SystemOwnerCheck {
  ok: boolean;
  status: number;
  message?: string;
  userId?: string;
  email?: string;
}

/**
 * Valida que quem chamou a função é o dono do sistema.
 * A service_role nunca sai do servidor — o navegador só envia o JWT do usuário.
 */
export async function requireSystemOwner(req: Request): Promise<SystemOwnerCheck> {
  const authHeader = req.headers.get('Authorization') ?? '';
  const token = authHeader.replace(/^Bearer\s+/i, '').trim();
  if (!token) {
    return { ok: false, status: 401, message: 'Autenticação obrigatória.' };
  }

  const anon = createClient(SUPABASE_URL, ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await anon.auth.getUser(token);
  if (error || !data?.user) {
    return { ok: false, status: 401, message: 'Sessão inválida.' };
  }

  const admin = serviceClient();
  const { data: profile, error: profErr } = await admin
    .from('profiles')
    .select('id, email, is_system_owner, is_blocked')
    .eq('id', data.user.id)
    .maybeSingle();

  if (profErr) {
    return { ok: false, status: 500, message: 'Falha ao validar permissão.' };
  }
  if (!profile || profile.is_blocked || !profile.is_system_owner) {
    return { ok: false, status: 403, message: 'Acesso restrito ao dono do sistema.' };
  }

  return { ok: true, status: 200, userId: profile.id, email: profile.email ?? undefined };
}
