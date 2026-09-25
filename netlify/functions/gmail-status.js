// netlify/functions/gmail-status.js
import { adminClient, getOrgForRequest } from './_lib.js';

export default async (req) => {
  const ctx = await getOrgForRequest(req);
  if (!ctx) return new Response(JSON.stringify({ error: 'Not authenticated' }), { status: 401 });

  const supabase = adminClient();
  const { data } = await supabase
    .from('gmail_connections')
    .select('email, connected_at')
    .eq('org_id', ctx.orgId)
    .maybeSingle();

  return new Response(
    JSON.stringify({ connected: !!data, email: data?.email || null, connectedAt: data?.connected_at || null }),
    { headers: { 'Content-Type': 'application/json' } }
  );
};
