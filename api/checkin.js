import { Redis } from '@upstash/redis';

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN
});

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const {
    spotNumber,
    plate,
    plateAnalysis,
    operatorInitiated,
    operatorNote
  } = req.body;

  if (!spotNumber || !plate) {
    return res.status(400).json({ error: 'spotNumber and plate are required' });
  }

  const sessionId = `session_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const now = Date.now();

  const session = {
    id: sessionId,
    spotNumber: String(spotNumber),
    plate: plate.toUpperCase().trim(),
    startTime: now,
    endTime: null,
    status: 'active',
    operatorInitiated: operatorInitiated || false,
    operatorNote: operatorNote || null,
    plateAnalysis: plateAnalysis || null,
    flags: []
  };

  try {
    await redis.set(`session:${sessionId}`, JSON.stringify(session));
    await redis.set(`spot:${spotNumber}:active`, sessionId);
    await redis.lpush(`plate:${session.plate}:sessions`, sessionId);
    await redis.sadd('sessions:active', sessionId);

    return res.status(200).json({ success: true, sessionId, session });
  } catch (err) {
    console.error('Checkin error:', err);
    return res.status(500).json({ error: 'Failed to create session', detail: err.message });
  }
}
