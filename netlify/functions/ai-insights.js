// netlify/functions/ai-insights.js
//
// Called by the app's "AI Rep" panel. Takes the current screen name + a
// snapshot of that screen's data, asks Gemini for short, specific insights.
//
// Requires GEMINI_API_KEY in Netlify's environment variables (Site settings
// -> Environment variables). Get a key at https://aistudio.google.com/apikey
//
// GEMINI_MODEL is also an env var (not hardcoded) because Gemini's model
// names change fairly often — check the current one in Google AI Studio's
// model picker and set it there. Defaults to gemini-flash-latest, an alias
// Google keeps pointed at their current recommended fast model, so this
// keeps working even if you never touch the env var.

export default async (req) => {
  if(req.method !== 'POST'){
    return new Response(JSON.stringify({ error: 'POST only' }), { status: 405 });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if(!apiKey){
    return new Response(JSON.stringify({ error: 'GEMINI_API_KEY is not set in Netlify environment variables.' }), { status: 500 });
  }
  const model = process.env.GEMINI_MODEL || 'gemini-flash-latest';

  let body;
  try { body = await req.json(); } catch { body = {}; }
  const { message, screen, context } = body;

  const systemPrompt = `You are an embedded assistant inside "Cogwell", a home-services business management app (bookings, quotes, leads, messaging, automation).
The user is currently looking at the "${screen || 'unknown'}" screen. Here is the relevant data from that screen right now:

${JSON.stringify(context || {}, null, 2)}

Give short, specific, actionable insights about what you see in that data — flag anything that needs attention (overdue quotes, unconfirmed bookings, blocked messages, dormant customers, etc). If the user asked a question, answer it using this data. Keep it under 120 words unless they ask for more detail. Do not repeat the raw numbers back verbatim — interpret them.`;

  try {
    const resp = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: systemPrompt }] },
          contents: [{ role: 'user', parts: [{ text: message || 'Give me insights on what you see on this screen.' }] }]
        })
      }
    );

    const data = await resp.json();
    if(!resp.ok){
      return new Response(JSON.stringify({ error: data?.error?.message || 'Gemini request failed' }), { status: resp.status });
    }
    const text = data?.candidates?.[0]?.content?.parts?.map(p=>p.text).join('') || "I couldn't generate a response for that.";
    return new Response(JSON.stringify({ text }), { headers: { 'Content-Type': 'application/json' } });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
};
