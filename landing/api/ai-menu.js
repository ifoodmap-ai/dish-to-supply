// Serverless proxy: landing 瀏覽器 → 此函式 → Supabase Edge Function `ai`
// (Railway 停機後 AI 改跑 Supabase Edge;server→server,無 CORS 問題)
const EDGE = process.env.IFOODMAP_AI_EDGE_URL || 'https://cwvpehqcvbfuynabpqop.supabase.co/functions/v1/ai';
const ANON = process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN3dnBlaHFjdmJmdXluYWJwcW9wIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk5NzQ5NjgsImV4cCI6MjA5NTU1MDk2OH0.QMkcOlGjRTP5XeddI4IAzSkGJoUjaRtcjI_Tjl6rj2k';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'method_not_allowed' });
    return;
  }
  try {
    const parsed = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    const upstream = await fetch(EDGE, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: ANON },
      body: JSON.stringify({ action: 'analyze-menu', ...parsed }),
    });
    const text = await upstream.text();
    res.status(upstream.status);
    res.setHeader('Content-Type', upstream.headers.get('content-type') || 'application/json');
    res.send(text);
  } catch (e) {
    res.status(502).json({ error: 'upstream_unreachable', message: String((e && e.message) || e) });
  }
}
