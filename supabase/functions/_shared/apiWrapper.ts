import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

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
  let statusCode: number;
  let recordsReturned = 0;
  let errorMessage: string | null = null;
  let data: any = null;

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseKey);

  try {
    const headers: Record<string, string> = {};
    if (apiName === 'api_football') {
      const apiKey = Deno.env.get('API_SPORTS_KEY');
      if (!apiKey) throw new Error('Missing API_SPORTS_KEY');
      headers['x-apisports-key'] = apiKey;
    }
    // odds_api usually includes the key in the URL

    const res = await fetch(endpoint, { headers });
    statusCode = res.status;

    if (!res.ok) {
      errorMessage = `HTTP ${res.status}: ${res.statusText}`;
      try {
        const errorBody = await res.text();
        if (errorBody) errorMessage += ` - ${errorBody}`;
      } catch (_) {}
    } else {
      data = await res.json();
      
      // Determine records returned based on API structure
      if (apiName === 'odds_api') {
        recordsReturned = Array.isArray(data) ? data.length : 1;
      } else if (apiName === 'api_football') {
        recordsReturned = data?.results || data?.response?.length || 0;
      }
    }
  } catch (err) {
    statusCode = 0;
    errorMessage = err instanceof Error ? err.message : String(err);
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
      error_message: errorMessage,
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
