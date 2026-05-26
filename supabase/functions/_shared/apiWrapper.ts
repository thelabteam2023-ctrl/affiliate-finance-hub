import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

/**
 * Pool de chaves por API com failover automático.
 * Suporta até 5 chaves por provider via env vars:
 *   ODDS_API_KEY, ODDS_API_KEY_2..ODDS_API_KEY_5
 *   API_SPORTS_KEY, API_SPORTS_KEY_2..API_SPORTS_KEY_5
 * Quando uma chave estoura cota/rate-limit, tenta a próxima do pool.
 */
function getKeyPool(apiName: 'odds_api' | 'api_football'): string[] {
  const base = apiName === 'odds_api' ? 'ODDS_API_KEY' : 'API_SPORTS_KEY';
  const keys: string[] = [];
  const first = Deno.env.get(base);
  if (first) keys.push(first);
  for (let i = 2; i <= 5; i++) {
    const k = Deno.env.get(`${base}_${i}`);
    if (k) keys.push(k);
  }
  return keys;
}

function isQuotaError(statusCode: number, body: string): boolean {
  const b = (body || '').toLowerCase();
  if (statusCode === 429) return true;
  if (statusCode === 401 || statusCode === 403) {
    return b.includes('out_of_usage_credits')
      || b.includes('quota')
      || b.includes('exceeded')
      || b.includes('limit reached')
      || b.includes('too many requests');
  }
  return false;
}

export async function callExternalApi({
  apiName,
  endpoint,
  sportKey,
  creditsUsed = 1,
  triggeredBy = 'cron'
}: {
  apiName: 'odds_api' | 'api_football';
  endpoint: string;
  sportKey?: string;
  creditsUsed?: number;
  triggeredBy?: 'cron' | 'manual';
}) {
  const startTime = Date.now();
  let statusCode: number = 0;
  let recordsReturned = 0;
  let errorMessage: string | null = null;
  let data: any = null;
  let keyIndexUsed = 0;

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseKey);

  const pool = getKeyPool(apiName);
  if (pool.length === 0) {
    errorMessage = `Missing ${apiName === 'odds_api' ? 'ODDS_API_KEY' : 'API_SPORTS_KEY'}`;
  }

  for (let i = 0; i < pool.length; i++) {
    const apiKey = pool[i];
    keyIndexUsed = i + 1;
    let finalEndpoint = endpoint;
    const headers: Record<string, string> = {};

    if (apiName === 'api_football') {
      headers['x-apisports-key'] = apiKey;
    } else if (apiName === 'odds_api') {
      // Substitui apiKey embutida na URL pela do pool
      if (/[?&]apiKey=/i.test(endpoint)) {
        finalEndpoint = endpoint.replace(/([?&])apiKey=[^&]*/i, `$1apiKey=${apiKey}`);
      } else {
        finalEndpoint = endpoint + (endpoint.includes('?') ? '&' : '?') + `apiKey=${apiKey}`;
      }
    }

    try {
      const res = await fetch(finalEndpoint, { headers });
      statusCode = res.status;
      const bodyText = await res.text();

      if (!res.ok) {
        errorMessage = `HTTP ${res.status}: ${res.statusText}${bodyText ? ` - ${bodyText.slice(0, 300)}` : ''}`;
        if (isQuotaError(statusCode, bodyText) && i < pool.length - 1) {
          console.warn(`[apiWrapper] Chave #${keyIndexUsed} de ${apiName} estourou cota (HTTP ${statusCode}). Trocando para próxima...`);
          continue;
        }
        break;
      }

      try { data = JSON.parse(bodyText); } catch { data = bodyText; }

      // api-sports retorna 200 com errors quando estoura quota diária
      if (apiName === 'api_football' && data && typeof data === 'object') {
        const errs = data.errors;
        const hasRateErr = errs && (
          (Array.isArray(errs) && errs.some((e: any) => typeof e === 'string' && /rate|quota|limit/i.test(e)))
          || (typeof errs === 'object' && !Array.isArray(errs) && Object.values(errs).some((v: any) => typeof v === 'string' && /rate|quota|limit/i.test(v)))
        );
        if (hasRateErr && i < pool.length - 1) {
          console.warn(`[apiWrapper] Chave #${keyIndexUsed} de ${apiName} estourou cota (body errors). Trocando...`);
          errorMessage = `Quota error: ${JSON.stringify(errs)}`;
          data = null;
          continue;
        }
      }

      errorMessage = null;
      if (apiName === 'odds_api') {
        recordsReturned = Array.isArray(data) ? data.length : 1;
      } else if (apiName === 'api_football') {
        recordsReturned = data?.results || data?.response?.length || 0;
      }
      break;
    } catch (err) {
      statusCode = 0;
      errorMessage = err instanceof Error ? err.message : String(err);
      if (i < pool.length - 1) continue;
    }
  }

  const durationMs = Date.now() - startTime;

  // 1. Save detailed log
  const { error: logError } = await supabase
    .from('api_request_logs')
    .insert({
      api_name: apiName,
      endpoint,
      sport_key: sportKey,
      status_code: statusCode,
      credits_used: creditsUsed,
      records_returned: recordsReturned,
      duration_ms: durationMs,
      error_message: errorMessage ? `[key#${keyIndexUsed}/${pool.length}] ${errorMessage}` : null,
      triggered_by: triggeredBy
    });

  if (logError) {
    console.error('Error saving API log:', logError);
  }

  // 2. Update usage summary (daily and monthly)
  const now = new Date();
  const today = now.toISOString().split('T')[0];
  const month = today.slice(0, 7);

  const updates = [
    { type: 'day', key: today },
    { type: 'month', key: month }
  ];

  for (const { type, key } of updates) {
    const { error: summaryError } = await supabase.rpc('increment_api_usage', {
      p_api_name: apiName,
      p_period_type: type,
      p_period_key: key,
      p_credits: creditsUsed,
      p_has_error: errorMessage ? true : false
    });

    if (summaryError) {
      // Fallback if RPC doesn't exist yet (will create it in the next migration step if needed, 
      // but let's try a direct upsert as fallback)
      console.warn(`RPC increment_api_usage failed, trying manual upsert for ${type}/${key}:`, summaryError);
      
      const { data: existing } = await supabase
        .from('api_usage_summary')
        .select('total_calls, total_credits, total_errors')
        .eq('api_name', apiName)
        .eq('period_type', type)
        .eq('period_key', key)
        .single();

      if (existing) {
        await supabase
          .from('api_usage_summary')
          .update({
            total_calls: existing.total_calls + 1,
            total_credits: existing.total_credits + creditsUsed,
            total_errors: existing.total_errors + (errorMessage ? 1 : 0),
            updated_at: new Date().toISOString()
          })
          .eq('api_name', apiName)
          .eq('period_type', type)
          .eq('period_key', key);
      } else {
        await supabase
          .from('api_usage_summary')
          .insert({
            api_name: apiName,
            period_type: type,
            period_key: key,
            total_calls: 1,
            total_credits: creditsUsed,
            total_errors: errorMessage ? 1 : 0
          });
      }
    }
  }

  return { data, statusCode, errorMessage, durationMs, recordsReturned };
}
