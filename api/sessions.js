import { Redis } from '@upstash/redis';

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN
});

export default async function handler(req, res) {
  const { method } = req;
  const { action, sessionId, plate } = req.query;

  try {
    if (method === 'GET' && action === 'active') {
      const ids = await redis.smembers('sessions:active');
      if (!ids || ids.length === 0) return res.status(200).json([]);
      const sessions = await Promise.all(
        ids.map(async (id) => {
          const raw = await redis.get(`session:${id}`);
          return raw ? (typeof raw === 'string' ? JSON.parse(raw) : raw) : null;
        })
      );
      return res.status(200).json(sessions.filter(Boolean));
    }

    if (method === 'GET' && action === 'plate' && plate) {
      const normalPlate = plate.toUpperCase().trim();
      const ids = await redis.lrange(`plate:${normalPlate}:sessions`, 0, -1);
      if (!ids || ids.length === 0) return res.status(200).json([]);
      const sessions = await Promise.all(
        ids.map(async (id) => {
          const raw = await redis.get(`session:${id}`);
          return raw ? (typeof raw === 'string' ? JSON.parse(raw) : raw) : null;
        })
      );
      return res.status(200).json(sessions.filter(Boolean));
    }

    if (method === 'GET' && action === 'one' && sessionId) {
      const raw = await redis.get(`session:${sessionId}`);
      if (!raw) return res.status(404).json({ error: 'Session not found' });
      const session = typeof raw === 'string' ? JSON.parse(raw) : raw;
      return res.status(200).json(session);
    }

    if (method === 'POST' && action === 'close') {
      const { sessionId: sid } = req.body;
      const raw = await redis.get(`session:${sid}`);
      if (!raw) return res.status(404).json({ error: 'Session not found' });
      const session = typeof raw === 'string' ? JSON.parse(raw) : raw;
      session.endTime = Date.now();
      session.status = 'closed';
      await redis.set(`session:${sid}`, JSON.stringify(session));
      await redis.srem('sessions:active', sid);
      await redis.del(`spot:${session.spotNumber}:active`);
      return res.status(200).json({ success: true, session });
    }

    if (method === 'POST' && action === 'flag') {
      const { sessionId: sid, flagNote } = req.body;
      const raw = await redis.get(`session:${sid}`);
      if (!raw) return res.status(404).json({ error: 'Session not found' });
      const session = typeof raw === 'string' ? JSON.parse(raw) : raw;
      session.flags = session.flags || [];
      session.flags.push({ note: flagNote || 'Flagged', time: Date.now() });
      await redis.set(`session:${sid}`, JSON.stringify(session));
      return res.status(200).json({ success: true, session });
    }

    if (method === 'POST' && action === 'unflag') {
      const { sessionId: sid } = req.body;
      const raw = await redis.get(`session:${sid}`);
      if (!raw) return res.status(404).json({ error: 'Session not found' });
      const session = typeof raw === 'string' ? JSON.parse(raw) : raw;
      session.flags = [];
      await redis.set(`session:${sid}`, JSON.stringify(session));
      return res.status(200).json({ success: true, session });
    }

    return res.status(400).json({ error: 'Unknown action' });
  } catch (err) {
    console.error('Sessions API error:', err);
    return res.status(500).json({ error: 'Server error', detail: err.message });
  }
}
