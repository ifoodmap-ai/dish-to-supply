// Serverless proxy: landing 瀏覽器 → 此函式 → dish-to-supply Railway /api/chat
// 目的：避開 Railway CORS（server→server 不受 CORS 限制）。無機密；Railway 端點不需 auth。
const API = process.env.IFOODMAP_API_URL || 'https://api-production-ca75.up.railway.app';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'method_not_allowed' });
    return;
  }
  try {
    const body = typeof req.body === 'string' ? req.body : JSON.stringify(req.body || {});
    const upstream = await fetch(API + '/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    });
    const text = await upstream.text();
    res.status(upstream.status);
    res.setHeader('Content-Type', upstream.headers.get('content-type') || 'application/json');
    res.send(text);
  } catch (e) {
    res.status(502).json({ error: 'upstream_unreachable', message: String((e && e.message) || e) });
  }
}
