// netlify/functions/gmail-oauth-init.js
//
// Called by the "Connect Gmail" button. Requires GOOGLE_CLIENT_ID,
// GOOGLE_REDIRECT_URI (pointing at gmail-oauth-callback's deployed URL),
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY as Netlify env vars.
//
// Only requests gmail.readonly — sending goes through the popup instead,
// so this never needs the harder-to-verify gmail.send scope.

import { adminClient, getOrgForRequest } from './_lib.js';

export default async (req) => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'POST only' }), { status: 405 });
  }

  const ctx = await getOrgForRequest(req);
  if (!ctx) return new Response(JSON.stringify({ error: 'Not authenticated' }), { status: 401 });
  if (ctx.role !== 'owner') {
    return new Response(JSON.stringify({ error: 'Only the account owner can connect Gmail.' }), { status: 403 });
  }

  const supabase = adminClient();
  const { data: state, error } = await supabase
    .from('oauth_states')
    .insert({ org_id: ctx.orgId })
    .select()
    .single();
  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 });

  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID,
    redirect_uri: process.env.GOOGLE_REDIRECT_URI,
    response_type: 'code',
    access_type: 'offline',
    prompt: 'consent', // forces Google to issue a refresh_token even on repeat connections
    scope: 'https://www.googleapis.com/auth/gmail.readonly',
    state: state.nonce
  });

  const url = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
  return new Response(JSON.stringify({ url }), { headers: { 'Content-Type': 'application/json' } });
};
