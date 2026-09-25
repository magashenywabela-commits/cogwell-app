// netlify/functions/gmail-oauth-callback.js
//
// This is the exact URL you register as the "Authorized redirect URI" in
// Google Cloud Console, and as GOOGLE_REDIRECT_URI in Netlify env vars.
// Google calls this directly (full page redirect) — there's no Authorization
// header here, which is exactly why the nonce from oauth_states exists.

import { adminClient } from './_lib.js';

export default async (req) => {
  const url = new URL(req.url);
  const code = url.searchParams.get('code');
  const nonce = url.searchParams.get('state');
  const appUrl = process.env.APP_URL || '/';

  if (!code || !nonce) {
    return Response.redirect(`${appUrl}/index.html?gmail=error`, 302);
  }

  const supabase = adminClient();
  const { data: st } = await supabase.from('oauth_states').select('*').eq('nonce', nonce).single();
  if (!st) {
    // No matching (or expired/already-used) nonce — refuse rather than guess an org.
    return Response.redirect(`${appUrl}/index.html?gmail=error`, 302);
  }
  await supabase.from('oauth_states').delete().eq('nonce', nonce); // one-time use

  try {
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: process.env.GOOGLE_CLIENT_ID,
        client_secret: process.env.GOOGLE_CLIENT_SECRET,
        redirect_uri: process.env.GOOGLE_REDIRECT_URI,
        grant_type: 'authorization_code'
      })
    });
    const tokens = await tokenRes.json();
    if (!tokens.refresh_token) {
      // Google only issues a refresh_token on first consent (or with prompt=consent, which we send) —
      // if it's missing here something went wrong upstream.
      return Response.redirect(`${appUrl}/index.html?gmail=error`, 302);
    }

    const profRes = await fetch('https://www.googleapis.com/gmail/v1/users/me/profile', {
      headers: { Authorization: `Bearer ${tokens.access_token}` }
    });
    const prof = await profRes.json();

    await supabase.from('gmail_connections').upsert(
      {
        org_id: st.org_id,
        email: prof.emailAddress || 'unknown',
        refresh_token: tokens.refresh_token,
        connected_at: new Date().toISOString()
      },
      { onConflict: 'org_id' }
    );

    return Response.redirect(`${appUrl}/index.html?gmail=connected`, 302);
  } catch (err) {
    return Response.redirect(`${appUrl}/index.html?gmail=error`, 302);
  }
};
