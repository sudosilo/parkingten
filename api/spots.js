import { getJSON, setJSON, isOperator } from '../lib/redis.js';

const DEFAULT_SPOTS = Array.from({ length: 10 }, (_, i) => ({
  number: String(i + 1), label: `Spot ${i + 1}`, type: 'standard', active: true
}));

export default async function handler(req, res) {
  try {
    if (req.method === 'GET') {
      const spots = await getJSON('config:spots');
      return res.status(200).json(Array.isArray(spots) ? spots : DEFAULT_SPOTS);
    }
    if (req.method === 'POST') {
      if (!isOperator(req)) return res.status(401).json({ error: 'Operator key required' });
      const { spots } = req.body || {};
      if (!Array.isArray(spots)) return res.status(400).json({ error: 'spots must be an array' });
      await setJSON('config:spots', spots);
      return res.status(200).json({ success: true, spots });
    }
    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    return res.status(req.query && req.query.trace ? 200 : 500).json({ error: 'Server error', detail: err.message });
  }
}
