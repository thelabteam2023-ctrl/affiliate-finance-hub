import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// ============================================================
// SHARED MIDDLEWARE: Auth, Rate Limiting, Logging
// ============================================================

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-workspace-id, x-cron-secret, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

// ---------- Types ----------
export interface AuthResult {
  type: 'user' | 'cron';
  userId?: string;
  email?: string;
  claims?: Record<string, unknown>;
}

export interface RateLimitConfig {
  maxRequests: number;   // max requests per window
  windowMs: number;      // window in milliseconds
}

// ---------- Structured Logging ----------
export function securityLog(
  event: 'AUTH_DENIED' | 'RATE_LIMIT_EXCEEDED' | 'WORKSPACE_MISMATCH' | 'AUTH_SUCCESS',
  details: Record<string, unknown>,
) {
  const payload = {
    event,
    timestamp: new Date().toISOString(),
    ...details,
  };
  if (event === 'AUTH_SUCCESS') {
    console.log(JSON.stringify(payload));
  } else {
    console.warn(JSON.stringify(payload));
  }
}

// ---------- Error Responses ----------
export function unauthorizedResponse(reason: string, fn: string): Response {
  securityLog('AUTH_DENIED', { reason, fn });
  return new Response(
    JSON.stringify({ error: 'Unauthorized' }),
    { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
  );
}

export function rateLimitedResponse(userId: string, fn: string): Response {
  securityLog('RATE_LIMIT_EXCEEDED', { userId, fn });
  return new Response(
    JSON.stringify({ error: 'Too many requests. Please try again later.' }),
    { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Retry-After': '60' } },
  );
}

export function forbiddenResponse(reason: string, fn: string, userId?: string): Response {
  securityLog('WORKSPACE_MISMATCH', { reason, fn, userId });
  return new Response(
    JSON.stringify({ error: 'Forbidden' }),
    { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
  );
}

// ---------- In-Memory Rate Limiter ----------
// Resets on cold start — provides protection during active use
const rateLimitStore = new Map<string, { count: number; resetAt: number }>();

// Cleanup stale entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of rateLimitStore) {
    if (entry.resetAt <= now) {
      rateLimitStore.delete(key);
    }
  }
}, 5 * 60 * 1000);

export function checkRateLimit(
  userId: string,
  fn: string,
  config: RateLimitConfig = { maxRequests: 60, windowMs: 60_000 },
): boolean {
  const key = `${userId}:${fn}`;
  const now = Date.now();
  const entry = rateLimitStore.get(key);

  if (!entry || entry.resetAt <= now) {
    rateLimitStore.set(key, { count: 1, resetAt: now + config.windowMs });
    return false; // not limited
  }

  entry.count++;
  if (entry.count > config.maxRequests) {
    return true; // rate limited
  }
  return false;
}

// ---------- Dual Auth: JWT + CRON_SECRET ----------
export async function authenticate(
  req: Request,
  fn: string,
  options?: { allowCron?: boolean },
): Promise<AuthResult | Response> {
  // 1. Check CRON_SECRET (if allowed)
  if (options?.allowCron) {
    const cronSecret = req.headers.get('x-cron-secret');
    const expectedSecret = Deno.env.get('CRON_SECRET');
    if (cronSecret && expectedSecret && cronSecret === expectedSecret) {
      securityLog('AUTH_SUCCESS', { type: 'cron', fn });
      return { type: 'cron' };
    }
  }

  // 2. JWT Auth
  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return unauthorizedResponse('missing_header', fn);
  }

  const supabaseAuth = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } },
  );

  const token = authHeader.replace('Bearer ', '');
  const { data: claimsData, error: claimsError } = await supabaseAuth.auth.getClaims(token);

  if (claimsError || !claimsData?.claims) {
    return unauthorizedResponse('invalid_token', fn);
  }

  const userId = claimsData.claims.sub as string;
  const email = claimsData.claims.email as string | undefined;

  securityLog('AUTH_SUCCESS', { type: 'user', fn, userId });

  return {
    type: 'user',
    userId,
    email,
    claims: claimsData.claims as Record<string, unknown>,
  };
}

// ---------- Full Middleware Pipeline ----------
export async function withMiddleware(
  req: Request,
  fn: string,
  handler: (auth: AuthResult, req: Request) => Promise<Response>,
  options?: {
    allowCron?: boolean;
    rateLimit?: RateLimitConfig;
    skipRateLimitForCron?: boolean;
  },
): Promise<Response> {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // Authenticate
  const authResult = await authenticate(req, fn, { allowCron: options?.allowCron });
  if (authResult instanceof Response) {
    return authResult; // auth failed — return 401
  }

  // Rate limit (skip for cron if configured)
  const shouldCheckRateLimit =
    !(options?.skipRateLimitForCron && authResult.type === 'cron');

  if (shouldCheckRateLimit && authResult.userId) {
    const rateLimitConfig = options?.rateLimit ?? { maxRequests: 60, windowMs: 60_000 };
    if (checkRateLimit(authResult.userId, fn, rateLimitConfig)) {
      return rateLimitedResponse(authResult.userId, fn);
    }
  }

  // Execute handler
  try {
    return await handler(authResult, req);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Internal server error';
    console.error(`[${fn}] Unhandled error:`, errorMessage);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
}
