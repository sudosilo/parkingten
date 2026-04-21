import { Redis } from '@upstash/redis';

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN
});

const DEFAULT_SPOTS = Array.from({ length: 10 }, (_, i) => ({
  number: String(i + 1),
  label: `Spot ${i + 1}`,
  type: 'standard',
  active: true
}));

export default async function handler(req, res) {
  const { method } = req;

  try {
    if (method === 'GET') {
      const raw = await redis.get('config:spots');
      const spots = raw
        ? (typeof raw === 'string' ? JSON.parse(raw) : raw)
        : DEFAULT_SPOTS;
      return res.status(200).json(spots);
    }

    if (method === 'POST') {
      const { spots } = req.body;
      if (!Array.isArray(spots)) {
        return res.status(400).json({ error: 'spots must be an array' });
      }
      await redis.set('config:spots', JSON.stringify(spots));
      return res.status(200).json({ success: true, spots });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('Spots API error:', err);
    return res.status(500).json({ error: 'Server error', detail: err.message });
  }
}
