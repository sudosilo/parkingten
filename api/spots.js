import https from 'https';

function redis(path, body) {
  return new Promise((resolve, reject) => {
    const base = new URL(process.env.UPSTASH_REDIS_REST_URL);
    const options = {
      hostname: base.hostname,
      path: path,
      method: body ? 'POST' : 'GET',
      headers: {
        'Authorization': `Bearer ${process.env.UPSTASH_REDIS_REST_TOKEN}`,
        'Content-Type': 'application/json'
      }
    };
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => { try { resolve(JSON.parse(data)); } catch { resolve(data); } });
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

const DEFAULT_SPOTS = Array.from({ length: 10 }, (_, i) => ({
  number: String(i + 1), label: `Spot ${i + 1}`, type: 'standard', active: true
}));

export default async function handler(req, res) {
  try {
    if (req.method === 'GET') {
      const result = await redis('/get/config:spots');
      const raw = result.result;
      const spots = raw ? (typeof raw === 'string' ? JSON.parse(raw) : raw) : DEFAULT_SPOTS;
      return res.status(200).json(spots);
    }
    if (req.method === 'POST') {
      const { spots } = req.body;
      if (!Array.isArray(spots)) return res.status(400).json({ error: 'spots must be an array' });
      await redis('/set/config:spots', { value: JSON.stringify(spots) });
      return res.status(200).json({ success: true, spots });
    }
    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    return res.status(500).json({ error: 'Server error', detail: err.message });
  }
}
