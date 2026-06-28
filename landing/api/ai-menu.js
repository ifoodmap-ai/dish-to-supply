// Serverless proxy: landing → dish-to-supply Railway /api/analyze/menu（菜單圖片 → 食材清單）
// body: { image: <base64 或 dataURL>, mimeType, fileName }（前端已縮圖，避免 4.5MB body 上限）
const API = process.env.IFOODMAP_API_URL || 'https://api-production-ca75.up.railway.app';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'method_not_allowed' });
    return;
  }
  try {
    const body = typeof req.body === 'string' ? req.body : JSON.stringify(req.body || {});
    const upstream = await fetch(API + '/api/analyze/menu', {
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
