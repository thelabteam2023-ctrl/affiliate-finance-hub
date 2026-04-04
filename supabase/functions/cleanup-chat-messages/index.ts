import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { withMiddleware, corsHeaders, type AuthResult } from '../_shared/middleware.ts';

Deno.serve(async (req) => {
  return withMiddleware(req, 'cleanup-chat-messages', async (auth, req) => {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { data, error } = await supabase.rpc('cleanup_expired_chat_messages');

    if (error) {
      console.error('Error cleaning up chat messages:', error);
      return new Response(
        JSON.stringify({ error: error.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Cleaned up ${data} expired chat messages`);

    return new Response(
      JSON.stringify({
        success: true,
        deleted_count: data,
        timestamp: new Date().toISOString(),
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }, { allowCron: true, skipRateLimitForCron: true });
});
