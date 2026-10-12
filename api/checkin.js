import { cmd, getJSON, setJSON, isOperator } from '../lib/redis.js';

const clean = (s, n) => String(s || '').slice(0, n);

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { spotNumber, plate, plateAnalysis, operatorInitiated, operatorNote } = req.body || {};
  const spot = clean(spotNumber, 10).trim();
  const plateNorm = clean(plate, 10).toUpperCase().replace(/[^A-Z0-9]/g, '');

  if (!spot || plateNorm.length < 2) {
    return res.status(400).json({ error: 'Spot number and plate are required' });
  }

  const byOperator = operatorInitiated === true;
  if (byOperator && !isOperator(req)) {
    return res.status(401).json({ error: 'Operator key required' });
  }

  try {
    const spots = (await getJSON('config:spots')) || [];
    if (spots.length && !spots.some((s) => s.number === spot && s.active !== false)) {
      return res.status(404).json({ error: `Spot ${spot} does not exist` });
    }

    const existingId = await cmd('GET', `spot:${spot}:active`);
    if (existingId) {
      const existing = await getJSON(`session:${existingId}`);
      if (existing && existing.status === 'active') {
        if (existing.plate === plateNorm) {
          return res.status(200).json({ success: true, sessionId: existing.id, session: existing, alreadyActive: true });
        }
        return res.status(409).json({ error: `Spot ${spot} is already occupied` });
      }
    }

    const sessionId = `session_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const session = {
      id: sessionId,
      spotNumber: spot,
      plate: plateNorm,
      startTime: Date.now(),
      endTime: null,
      status: 'active',
      operatorInitiated: byOperator,
      operatorNote: byOperator ? (clean(operatorNote, 500) || null) : null,
      plateAnalysis: plateAnalysis && typeof plateAnalysis === 'object' ? plateAnalysis : null,
      flags: []
    };

    await setJSON(`session:${sessionId}`, session);
    await cmd('SET', `spot:${spot}:active`, sessionId);
    await cmd('LPUSH', `plate:${plateNorm}:sessions`, sessionId);
    await cmd('SADD', 'sessions:active', sessionId);

    return res.status(200).json({ success: true, sessionId, session });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to create session', detail: err.message });
  }
}
