const REDIS_URL = process.env.UPSTASH_REDIS_REST_URL;
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;

async function redisGet(key) {
  const resp = await fetch(`${REDIS_URL}/get/${encodeURIComponent(key)}`, {
    headers: { Authorization: `Bearer ${REDIS_TOKEN}` }
  });
  const data = await resp.json();
  return data.result;
}

async function redisSet(key, value) {
  const resp = await fetch(`${REDIS_URL}/set/${encodeURIComponent(key)}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${REDIS_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ value })
  });
  return resp.json();
}

const DEFAULT_SPOTS = Array.from({ length: 10 }, (_, i) => ({
  number: String(i + 1),
  label: `Spot ${i + 1}`,
  type: 'standard',
  active: true
}));

export default async function handler(req, res) {
  try {
    if (req.method === 'GET') {
      const raw = await redisGet('config:spots');
      const spots = raw ? (typeof raw === 'string' ? JSON.parse(raw) : raw) : DEFAULT_SPOTS;
      return res.status(200).json(spots);
    }
    if (req.method === 'POST') {
      const { spots } = req.body;
      if (!Array.isArray(spots)) return res.status(400).json({ error: 'spots must be an array' });
      await redisSet('config:spots', JSON.stringify(spots));
      return res.status(200).json({ success: true, spots });
    }
    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    return res.status(500).json({ error: 'Server error', detail: err.message });
  }
}
