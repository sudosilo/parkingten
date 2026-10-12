import { cmd, getJSON, setJSON, getMany, isOperator } from '../lib/redis.js';

export default async function handler(req, res) {
  if (!isOperator(req)) return res.status(401).json({ error: 'Operator key required' });

  const { action, sessionId, plate } = req.query;

  try {
    if (req.method === 'GET' && action === 'active') {
      const ids = (await cmd('SMEMBERS', 'sessions:active')) || [];
      const sessions = await getMany(ids.map((id) => `session:${id}`));
      return res.status(200).json(sessions.filter(Boolean));
    }

    if (req.method === 'GET' && action === 'plate' && plate) {
      const p = String(plate).toUpperCase().replace(/[^A-Z0-9]/g, '');
      const ids = (await cmd('LRANGE', `plate:${p}:sessions`, 0, 49)) || [];
      const sessions = await getMany(ids.map((id) => `session:${id}`));
      return res.status(200).json(sessions.filter(Boolean));
    }

    if (req.method === 'GET' && action === 'one' && sessionId) {
      const s = await getJSON(`session:${sessionId}`);
      if (!s) return res.status(404).json({ error: 'Session not found' });
      return res.status(200).json(s);
    }

    if (req.method === 'POST' && ['close', 'flag', 'unflag'].includes(action)) {
      const { sessionId: sid, flagNote } = req.body || {};
      const s = await getJSON(`session:${sid}`);
      if (!s) return res.status(404).json({ error: 'Session not found' });

      if (action === 'close') {
        s.endTime = Date.now();
        s.status = 'closed';
        await setJSON(`session:${sid}`, s);
        await cmd('SREM', 'sessions:active', sid);
        const current = await cmd('GET', `spot:${s.spotNumber}:active`);
        if (current === sid) await cmd('DEL', `spot:${s.spotNumber}:active`);
      } else if (action === 'flag') {
        s.flags = s.flags || [];
        s.flags.push({ note: String(flagNote || 'Flagged').slice(0, 300), time: Date.now() });
        await setJSON(`session:${sid}`, s);
      } else {
        s.flags = [];
        await setJSON(`session:${sid}`, s);
      }
      return res.status(200).json({ success: true, session: s });
    }

    return res.status(400).json({ error: 'Unknown action' });
  } catch (err) {
    return res.status(500).json({ error: 'Server error', detail: err.message });
  }
}
