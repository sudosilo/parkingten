import { isOperator } from '../lib/redis.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const { password } = req.body || {};
  const ok = isOperator({ headers: { 'x-operator-key': password } });
  if (ok) return res.status(200).json({ success: true });
  return res.status(401).json({ success: false, error: 'Invalid password' });
}
