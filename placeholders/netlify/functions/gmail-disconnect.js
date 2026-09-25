// netlify/functions/gmail-disconnect.js
import { adminClient, getOrgForRequest } from './_lib.js';

export default async (req) => {
  if (req.method !== 'POST') return new Response(JSON.stringify({ error: 'POST only' }), { status: 405 });

  const ctx = await getOrgForRequest(req);
  if (!ctx) return new Response(JSON.stringify({ error: 'Not authenticated' }), { status: 401 });
  if (ctx.role !== 'owner') {
    return new Response(JSON.stringify({ error: 'Only the account owner can disconnect Gmail.' }), { status: 403 });
  }

  const supabase = adminClient();
  await supabase.from('gmail_connections').delete().eq('org_id', ctx.orgId);

  return new Response(JSON.stringify({ disconnected: true }), { headers: { 'Content-Type': 'application/json' } });
};
