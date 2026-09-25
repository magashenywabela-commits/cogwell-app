// netlify/functions/_lib.js
// Shared by every gmail-*.js function. Not a function itself — Netlify
// only exposes files that default-export a handler as endpoints, so this
// file is safe to import from the others without becoming its own route.

import { createClient } from '@supabase/supabase-js';

export function adminClient() {
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
}

// Verifies the request's Supabase access token and returns which org and
// role the caller belongs to — every gmail function uses this instead of
// trusting anything the client claims about itself.
export async function getOrgForRequest(req) {
  const auth = req.headers.get('authorization') || '';
  const token = auth.replace(/^Bearer\s+/i, '');
  if (!token) return null;

  const supabase = adminClient();
  const { data: userData, error } = await supabase.auth.getUser(token);
  if (error || !userData?.user) return null;

  const { data: profile } = await supabase
    .from('profiles')
    .select('org_id, role')
    .eq('id', userData.user.id)
    .single();

  return profile ? { userId: userData.user.id, orgId: profile.org_id, role: profile.role } : null;
}
