// netlify/functions/gmail-sync.js
//
// Called by the "Refresh inbox" button. Pulls recent Gmail messages,
// matches the sender's email against this org's customers, and inserts
// matched ones into the same `messages` table SMS/WhatsApp already use —
// so a customer's email replies show up in the same thread as everything
// else. Messages from unrecognized senders are skipped for now (a natural
// next step is turning those into new leads instead).

import { adminClient, getOrgForRequest } from './_lib.js';

async function getAccessToken(refreshToken) {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID,
      client_secret: process.env.GOOGLE_CLIENT_SECRET,
      refresh_token: refreshToken,
      grant_type: 'refresh_token'
    })
  });
  const data = await res.json();
  if (!data.access_token) throw new Error(data.error_description || 'Could not refresh Gmail access — try reconnecting.');
  return data.access_token;
}

function decodeBody(payload) {
  function findPlainText(part) {
    if (!part) return '';
    if (part.mimeType === 'text/plain' && part.body?.data) return part.body.data;
    if (part.parts) for (const sub of part.parts) { const found = findPlainText(sub); if (found) return found; }
    return '';
  }
  const raw = payload.body?.data || findPlainText(payload);
  if (!raw) return '';
  try { return Buffer.from(raw.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'); }
  catch { return ''; }
}

export default async (req) => {
  if (req.method !== 'POST') return new Response(JSON.stringify({ error: 'POST only' }), { status: 405 });

  const ctx = await getOrgForRequest(req);
  if (!ctx) return new Response(JSON.stringify({ error: 'Not authenticated' }), { status: 401 });

  const supabase = adminClient();
  const { data: conn } = await supabase.from('gmail_connections').select('*').eq('org_id', ctx.orgId).maybeSingle();
  if (!conn) return new Response(JSON.stringify({ error: 'Gmail is not connected for this account.' }), { status: 400 });

  try {
    const accessToken = await getAccessToken(conn.refresh_token);

    const listRes = await fetch(
      'https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=20&q=newer_than:14d',
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    const list = await listRes.json();
    const ids = (list.messages || []).map(m => m.id);

    const { data: customers } = await supabase.from('customers').select('id, email').eq('org_id', ctx.orgId);
    const byEmail = {};
    (customers || []).forEach(c => { if (c.email) byEmail[c.email.toLowerCase()] = c.id; });

    let imported = 0, skipped = 0;
    for (const id of ids) {
      const { data: existing } = await supabase
        .from('messages').select('id').eq('org_id', ctx.orgId).eq('gmail_message_id', id).maybeSingle();
      if (existing) continue;

      const msgRes = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}?format=full`, {
        headers: { Authorization: `Bearer ${accessToken}` }
      });
      const msg = await msgRes.json();
      const headers = msg.payload?.headers || [];
      const from = headers.find(h => h.name === 'From')?.value || '';
      const subject = headers.find(h => h.name === 'Subject')?.value || '';
      const dateHdr = headers.find(h => h.name === 'Date')?.value;
      const emailMatch = from.match(/[^\s<]+@[^\s>]+/);
      const senderEmail = emailMatch ? emailMatch[0].toLowerCase() : '';
      const customerId = byEmail[senderEmail];

      if (!customerId) { skipped++; continue; }

      const body = decodeBody(msg.payload).slice(0, 5000) || msg.snippet || '';
      await supabase.from('messages').insert({
        org_id: ctx.orgId, thread: 'customer', customer_id: customerId, dir: 'in', channel: 'Email',
        subject, body, at: dateHdr ? new Date(dateHdr).toISOString() : new Date().toISOString(),
        status: 'received', gmail_message_id: id
      });
      imported++;
    }

    return new Response(JSON.stringify({ imported, skipped, checked: ids.length }), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
};
